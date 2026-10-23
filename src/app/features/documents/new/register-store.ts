import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom, of } from 'rxjs';
import { NewFromMode, RegisterField, RegisterForm, RegisterPayload, RegisterValue } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { FromDocument, RegisterApi } from '../../../core/register-api';
import { Session } from '../../../core/session';

export interface Issue {
  key: string;
  tab: string;
  message: string;
}

/** Empty as the server counts it for required fields. */
export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
}

/** The starting values of a form: what each field brings, else nothing. */
export function initialValues(form: RegisterForm): Record<string, RegisterValue> {
  const out: Record<string, RegisterValue> = {};
  for (const f of form.Fields) {
    if (f.Kind === 'display') continue;
    if ('Value' in f && f.Value !== undefined && f.Value !== null) out[f.Key] = f.Value as RegisterValue;
    else if (f.Kind === 'checkbox') out[f.Key] = false;
  }
  return out;
}

/** A field hidden by the value of another (HiddenIf): not shown, not required, not sent. */
export function isHidden(f: RegisterField, values: Record<string, RegisterValue>): boolean {
  return !!f.HiddenIf && JSON.stringify(values[f.HiddenIf.Key] ?? null) === JSON.stringify(f.HiddenIf.Value);
}

/** Client checks before the call: required fields of what is on screen (the server checks again). */
export function checkRequired(fields: RegisterField[], values: Record<string, RegisterValue>): Issue[] {
  return fields
    .filter((f) => f.Required && !f.ReadOnly && f.Kind !== 'display' && !isHidden(f, values) && isEmpty(values[f.Key]))
    .map((f) => ({ key: f.Key, tab: f.Tab, message: f.RequiredMessage || `Συμπληρώστε το πεδίο «${f.Label}».` }));
}

/** Fields whose values are sent: on screen, editable, with a value of their own. */
function sentKeys(fields: RegisterField[], values: Record<string, RegisterValue>, brief: boolean): string[] {
  return fields
    .filter((f) => f.Kind !== 'display' && f.Kind !== 'signatureChain' && !f.ReadOnly && (!brief || f.Brief) && !isHidden(f, values))
    .map((f) => f.Key);
}

/** The values sent: brief registration sends only its own fields; empty ones are left out. */
export function valuesToSend(fields: RegisterField[], values: Record<string, RegisterValue>, brief: boolean): Record<string, RegisterValue> {
  const keys = new Set(sentKeys(fields, values, brief));
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && !isEmpty(v)));
}

/** The values of an edit: every editable field, an emptied one as null so the server clears it. */
export function editValues(fields: RegisterField[], values: Record<string, RegisterValue>): Record<string, RegisterValue | null> {
  return Object.fromEntries(sentKeys(fields, values, false).map((k) => [k, isEmpty(values[k]) ? null : values[k]]));
}

/**
 * State of «Νέο έγγραφο» and «Επεξεργασία»: the form of the chosen type (empty, prefilled from
 * an answered or cloned document, or the edited document's), the values, uploads in flight,
 * validation and the save. One per page.
 */
@Injectable()
export class RegisterStore {
  private readonly api = inject(RegisterApi);
  private readonly session = inject(Session);

  readonly type = signal<number | null>(null);
  readonly old = signal(false);
  /** Answer or clone of this document. */
  readonly from = signal<FromDocument | null>(null);
  /** «Επεξεργασία» of this document (no type to choose). */
  readonly editId = signal<number | null>(null);

  setFrom(id: number | null, mode: NewFromMode | null): void {
    const cur = this.from();
    if (!id || !mode) this.from.set(null);
    else if (cur?.from !== id || cur.mode !== mode) this.from.set({ from: id, mode });
  }

  readonly types = rxResource({
    params: () => {
      const groupId = this.session.groupId();
      return groupId && !this.editId() ? { groupId, from: this.from() } : undefined;
    },
    stream: ({ params }) => this.api.newTypes(params.groupId, params.from),
  });

  readonly form = rxResource({
    params: () => {
      const groupId = this.session.groupId();
      const editId = this.editId();
      if (groupId && editId) return { groupId, editId, type: 0, old: false, from: null };
      const type = this.type();
      return groupId && type ? { groupId, editId: null, type, old: this.old(), from: this.from() } : undefined;
    },
    stream: ({ params }) =>
      params.editId ? this.api.editForm(params.groupId, params.editId) : this.api.form(params.groupId, params.type, params.old, params.from),
  });
  /** An edit (the form names its document), not a registration. */
  readonly isEdit = computed(() => !!this.editId());
  readonly f = computed<RegisterForm | null>(() => (this.form.hasValue() ? this.form.value() : null));

  /** Kinds for the «Είδος» tree, when the form has one. */
  readonly kinds = rxResource({
    params: () => {
      const f = this.f();
      const groupId = this.session.groupId();
      return f && groupId && f.Fields.some((x) => x.Kind === 'tree' && x.Source === 'kinds') ? { groupId, type: f.DocumentType } : undefined;
    },
    stream: ({ params }) => (params ? this.api.kinds(params.groupId, params.type) : of([])),
  });

  /** «Σύντομη» or «Αναλυτική» registration. */
  readonly brief = linkedSignal(() => !!this.f()?.BriefDefault);

  private readonly initial = computed(() => (this.f() ? initialValues(this.f()!) : {}));
  readonly values = linkedSignal(() => ({ ...this.initial() }));
  /** Uploads in flight per files field; registration waits for none. */
  readonly uploading = signal<Record<string, number>>({});

  setUploading(key: string, n: number): void {
    this.uploading.update((u) => ({ ...u, [key]: n }));
  }

  /** Fields on screen: all, or those of the brief registration. */
  readonly fields = computed(() => {
    const values = this.values();
    return (this.f()?.Fields ?? []).filter((x) => (!this.brief() || x.Brief) && !isHidden(x, values));
  });
  /** Tabs that have fields on screen (detailed registration). */
  readonly tabs = computed(() => {
    const used = new Set(this.fields().map((x) => x.Tab));
    return (this.f()?.Tabs ?? []).filter((t) => used.has(t.Key));
  });

  readonly dirty = computed(() => JSON.stringify(this.values()) !== JSON.stringify(this.initial()));
  readonly attempted = linkedSignal<RegisterForm | null, boolean>({ source: this.f, computation: () => false });
  readonly serverErrors = linkedSignal<RegisterForm | null, Issue[]>({ source: this.f, computation: () => [] });
  readonly issues = computed(() => {
    if (!this.attempted()) return [];
    const local = checkRequired(this.fields(), this.values());
    const keys = new Set(local.map((i) => i.key));
    return [...local, ...this.serverErrors().filter((i) => !keys.has(i.key))];
  });
  readonly issueByKey = computed(() => new Map(this.issues().map((i) => [i.key, i.message])));
  readonly saving = signal(false);
  readonly saveError = linkedSignal<RegisterForm | null, string | null>({ source: this.f, computation: () => null });

  set(key: string, value: RegisterValue): void {
    const before = this.values()[key];
    this.values.update((v) => ({ ...v, [key]: value }));
    // Another Είδος: its «Ειδικά πεδία» start over.
    if (JSON.stringify(before) !== JSON.stringify(value)) {
      for (const f of this.f()?.Fields ?? []) {
        if (f.Kind === 'kindForm' && f.KindField === key) this.values.update((v) => ({ ...v, [f.Key]: {} }));
      }
    }
    // An edited field drops the server's message about it.
    if (this.serverErrors().some((i) => i.key === key)) this.serverErrors.update((l) => l.filter((i) => i.key !== key));
  }

  get(key: string): RegisterValue | undefined {
    return this.values()[key];
  }

  /** Registers (or saves the edit); resolves to the document, or null when something must be fixed. */
  async register(): Promise<RegisterPayload | null> {
    const form = this.f();
    const groupId = this.session.groupId();
    const from = this.from();
    if (!form || !groupId || this.saving()) return null;
    this.attempted.set(true);
    this.saveError.set(null);
    if (checkRequired(this.fields(), this.values()).length) return null;
    if (Object.values(this.uploading()).some((n) => n > 0)) {
      this.saveError.set('Περιμένετε να ολοκληρωθεί το ανέβασμα των αρχείων.');
      return null;
    }
    this.saving.set(true);
    try {
      const r = await firstValueFrom(
        form.DocumentId
          ? this.api.edit(form.DocumentId, { GroupId: groupId, Values: editValues(form.Fields, this.values()) })
          : this.api.register({
              GroupId: groupId,
              NewType: form.NewType,
              ...(this.old() ? { Old: true } : {}),
              ...(from ? { From: from.from, Mode: from.mode } : {}),
              Brief: this.brief(),
              Values: valuesToSend(form.Fields, this.values(), this.brief()),
            }),
      );
      if (!r.DocumentId) {
        const tabOf = new Map(form.Fields.map((x) => [x.Key, x.Tab]));
        this.serverErrors.set((r.Errors ?? []).map((e) => ({ key: e.Key, tab: tabOf.get(e.Key) ?? 'basic', message: e.Message })));
        if (!r.Errors?.length) this.saveError.set(form.DocumentId ? 'Οι αλλαγές δεν αποθηκεύτηκαν.' : 'Η καταχώριση δεν ολοκληρώθηκε.');
        return null;
      }
      return r;
    } catch (e) {
      this.saveError.set(errorMessage(e));
      return null;
    } finally {
      this.saving.set(false);
    }
  }
}
