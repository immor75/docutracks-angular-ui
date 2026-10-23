import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom, of } from 'rxjs';
import { RegisterField, RegisterForm, RegisterPayload, RegisterValue } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { RegisterApi } from '../../../core/register-api';
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

/** Client checks before the call: required fields of what is on screen (the server checks again). */
export function checkRequired(fields: RegisterField[], values: Record<string, RegisterValue>): Issue[] {
  return fields
    .filter((f) => f.Required && f.Kind !== 'display' && isEmpty(values[f.Key]))
    .map((f) => ({ key: f.Key, tab: f.Tab, message: f.RequiredMessage || `Συμπληρώστε το πεδίο «${f.Label}».` }));
}

/** The values sent: brief registration sends only its own fields; empty ones are left out. */
export function valuesToSend(fields: RegisterField[], values: Record<string, RegisterValue>, brief: boolean): Record<string, RegisterValue> {
  const keys = new Set(fields.filter((f) => f.Kind !== 'display' && (!brief || f.Brief)).map((f) => f.Key));
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && !isEmpty(v)));
}

/**
 * State of «Νέο έγγραφο»: the form of the chosen type, the values, uploads in flight,
 * validation and the registration. One per page.
 */
@Injectable()
export class RegisterStore {
  private readonly api = inject(RegisterApi);
  private readonly session = inject(Session);

  readonly type = signal<number | null>(null);
  readonly old = signal(false);

  readonly types = rxResource({
    params: () => this.session.groupId() ?? undefined,
    stream: ({ params }) => this.api.newTypes(params),
  });

  readonly form = rxResource({
    params: () => {
      const groupId = this.session.groupId();
      const type = this.type();
      return groupId && type ? { groupId, type, old: this.old() } : undefined;
    },
    stream: ({ params }) => this.api.form(params.groupId, params.type, params.old),
  });
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
  readonly fields = computed(() => (this.f()?.Fields ?? []).filter((x) => !this.brief() || x.Brief));
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

  /** Registers; resolves to the new document, or null when something must be fixed. */
  async register(): Promise<RegisterPayload | null> {
    const form = this.f();
    const groupId = this.session.groupId();
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
        this.api.register({
          GroupId: groupId,
          NewType: form.NewType,
          ...(this.old() ? { Old: true } : {}),
          Brief: this.brief(),
          Values: valuesToSend(form.Fields, this.values(), this.brief()),
        }),
      );
      if (!r.DocumentId) {
        const tabOf = new Map(form.Fields.map((x) => [x.Key, x.Tab]));
        this.serverErrors.set((r.Errors ?? []).map((e) => ({ key: e.Key, tab: tabOf.get(e.Key) ?? 'basic', message: e.Message })));
        if (!r.Errors?.length) this.saveError.set('Η καταχώριση δεν ολοκληρώθηκε.');
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
