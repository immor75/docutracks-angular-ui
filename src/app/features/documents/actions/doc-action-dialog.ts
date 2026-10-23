import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DocumentsApi } from '../../../core/documents-api';
import {
  ActionField,
  ActionForm,
  ActionValue,
  PeopleField,
  PersonValue,
  ThematicFolder,
} from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { CLASSIC } from '../../../core/paths';
import { Session } from '../../../core/session';
import { OrgPicker, PickItem, flattenTree, groupKey, userKey } from '../../../shared/org-picker';
import { Icon } from '../../../ui/icon';
import { DocActionRunner } from './doc-action-runner';
import { ThematicPicker } from './thematic-picker';

interface Extra {
  EnergeiaTypeId: number | null;
  Urgent: boolean;
}

/** The form's values, one entry per field key; reset when another action opens. */
interface FormState {
  text: Record<string, string>;
  select: Record<string, number | null>;
  check: Record<string, boolean>;
  people: Record<string, PickItem[]>;
  extra: Record<string, Record<number, Extra>>;
  thematic: Record<string, ThematicFolder[]>;
}

const EMPTY: FormState = { text: {}, select: {}, check: {}, people: {}, extra: {}, thematic: {} };

let seq = 0;

/**
 * The dialog of every in-app document action. It renders the form the server describes
 * (`GET action-data/{code}`): comments, selects, check boxes, people or groups from the
 * organisation, θεματικοί φάκελοι. Native <dialog>: focus trap, Esc and backdrop from the browser.
 */
@Component({
  selector: 'app-doc-action-dialog',
  imports: [Icon, OrgPicker, ThematicPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './doc-action-dialog.html',
  styleUrl: './doc-action-dialog.css',
  host: { '(click)': 'backdropClick($event)' },
})
export class DocActionDialog {
  protected readonly runner = inject(DocActionRunner);
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = errorMessage;
  protected readonly id = `act-${++seq}`;
  protected readonly open = this.runner.current;
  protected readonly targets = computed(() => this.open()?.targets ?? []);
  protected readonly subject = computed(() => {
    const t = this.targets();
    return t.length === 1 ? `«${t[0].title || 'Α/Α ' + t[0].id}»` : `${t.length} επιλεγμένα έγγραφα`;
  });

  /** The form, loaded when an action opens (not on a retry, which keeps the values). */
  protected readonly form = rxResource({
    params: () => {
      const o = this.open();
      const groupId = this.session.groupId();
      return o && groupId ? { seq: o.seq, code: o.code, groupId, ids: untracked(() => o.targets.map((t) => t.id)) } : undefined;
    },
    stream: ({ params }) => this.api.actionForm(params.groupId, params.code, params.ids),
  });
  protected readonly f = computed<ActionForm | null>(() => (this.form.hasValue() ? this.form.value() : null));
  protected readonly title = computed(() => this.f()?.Title ?? this.open()?.name ?? '');
  protected readonly classicHref = computed(() => {
    const o = this.open();
    return o && o.targets.length === 1 ? CLASSIC.documentAction(this.session.groupId(), o.code, o.targets[0].id) : null;
  });

  protected readonly state = linkedSignal<ActionForm | null, FormState>({
    source: this.f,
    computation: (form) => (form ? this.initial(form) : EMPTY),
  });
  /** Messages of required fields left empty, shown after a submit. */
  protected readonly invalid = linkedSignal<ActionForm | null, Record<string, string>>({ source: this.f, computation: () => ({}) });

  /** Organisation items per people field. */
  protected readonly items = computed<Record<string, PickItem[]>>(() => {
    const out: Record<string, PickItem[]> = {};
    for (const fld of this.f()?.Fields ?? []) {
      if (fld.Kind === 'people') out[fld.Key] = flattenTree(fld.Tree, fld.Pick);
    }
    return out;
  });

  protected readonly busy = this.runner.busy;
  protected readonly failures = this.runner.failures;

  constructor() {
    // Open the native dialog with the action; close it when the action is done.
    effect(() => {
      const d = this.dialog()?.nativeElement;
      if (!d) return;
      if (this.open() && !d.open) d.showModal();
      if (!this.open() && d.open) d.close();
    });
  }

  /* ---------- state ---------- */

  private initial(form: ActionForm): FormState {
    const s: FormState = { text: {}, select: {}, check: {}, people: {}, extra: {}, thematic: {} };
    for (const fld of form.Fields) {
      switch (fld.Kind) {
        case 'comment':
          s.text[fld.Key] = fld.Value ?? '';
          break;
        case 'select':
          s.select[fld.Key] = fld.Value ?? null;
          break;
        case 'checkbox':
          s.check[fld.Key] = !!fld.Value;
          break;
        case 'thematicFolders':
          s.thematic[fld.Key] = fld.Value ?? [];
          break;
        case 'people': {
          const items = flattenTree(fld.Tree, fld.Pick);
          const keyOf = (v: PersonValue) => (fld.Pick === 'users' ? userKey('users', v.UserId ?? 0, null) : groupKey(v.GroupId));
          s.people[fld.Key] = (fld.Value ?? []).map((v) => items.find((i) => i.key === keyOf(v))).filter((i): i is PickItem => !!i);
          s.extra[fld.Key] = Object.fromEntries(
            (fld.Value ?? []).map((v) => [v.GroupId, { EnergeiaTypeId: v.EnergeiaTypeId ?? fld.PerItem?.DefaultEnergeiaType ?? null, Urgent: !!v.Urgent }]),
          );
          break;
        }
      }
    }
    return s;
  }

  private patch<K extends keyof FormState>(part: K, key: string, value: FormState[K][string]): void {
    this.state.update((s) => ({ ...s, [part]: { ...s[part], [key]: value } }));
    if (this.invalid()[key]) {
      this.invalid.update((errors) => Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key)));
    }
  }

  protected setText(key: string, value: string): void {
    this.patch('text', key, value);
  }

  protected setSelect(key: string, value: string): void {
    this.patch('select', key, value === '' ? null : Number(value));
  }

  protected setCheck(key: string, value: boolean): void {
    this.patch('check', key, value);
  }

  protected setThematic(key: string, value: ThematicFolder[]): void {
    this.patch('thematic', key, value);
  }

  protected setPeople(fld: PeopleField, picked: PickItem[]): void {
    this.patch('people', fld.Key, picked);
    // Groups picked now get the default type of movement.
    const extra = { ...(this.state().extra[fld.Key] ?? {}) };
    for (const p of picked) extra[p.id] ??= { EnergeiaTypeId: fld.PerItem?.DefaultEnergeiaType ?? null, Urgent: false };
    this.patch('extra', fld.Key, extra);
  }

  protected extraOf(key: string, groupId: number): Extra {
    return this.state().extra[key]?.[groupId] ?? { EnergeiaTypeId: null, Urgent: false };
  }

  protected setExtra(key: string, groupId: number, change: Partial<Extra>): void {
    const all = this.state().extra[key] ?? {};
    this.patch('extra', key, { ...all, [groupId]: { ...this.extraOf(key, groupId), ...change } });
  }

  /** «Επιλογή χαρακτηρισμού (μαζικά)»: one type for every picked group. */
  protected setAllExtra(key: string, value: string): void {
    if (value === '') return;
    const all = { ...(this.state().extra[key] ?? {}) };
    for (const p of this.state().people[key] ?? []) all[p.id] = { ...this.extraOf(key, p.id), EnergeiaTypeId: Number(value) };
    this.patch('extra', key, all);
  }

  protected removePicked(key: string, item: PickItem): void {
    this.patch('people', key, (this.state().people[key] ?? []).filter((p) => p.key !== item.key));
  }

  /* ---------- submit ---------- */

  private valueOf(fld: ActionField): ActionValue {
    const s = this.state();
    switch (fld.Kind) {
      case 'comment':
        return (s.text[fld.Key] ?? '').trim();
      case 'select':
        return s.select[fld.Key] ?? null;
      case 'checkbox':
        return s.check[fld.Key] ?? false;
      case 'thematicFolders':
        return s.thematic[fld.Key] ?? [];
      case 'people':
        return (s.people[fld.Key] ?? []).map((p) =>
          fld.Pick === 'users'
            ? { UserId: p.id, GroupId: p.groupId ?? 0 }
            : {
                GroupId: p.id,
                ...(fld.PerItem?.EnergeiaTypes ? { EnergeiaTypeId: this.extraOf(fld.Key, p.id).EnergeiaTypeId } : {}),
                ...(fld.PerItem?.Urgent ? { Urgent: this.extraOf(fld.Key, p.id).Urgent } : {}),
              },
        );
    }
  }

  private static empty(v: ActionValue): boolean {
    return v === null || v === '' || v === false || (Array.isArray(v) && !v.length);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const form = this.f();
    if (!form || form.Classic || this.busy()) return;
    const values: Record<string, ActionValue> = {};
    const errors: Record<string, string> = {};
    for (const fld of form.Fields) {
      const v = this.valueOf(fld);
      values[fld.Key] = v;
      if (fld.Required && fld.Kind !== 'checkbox' && DocActionDialog.empty(v)) {
        errors[fld.Key] = fld.RequiredMessage || `Συμπληρώστε το πεδίο «${fld.Label}».`;
      }
    }
    this.invalid.set(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      queueMicrotask(() => this.dialog()?.nativeElement.querySelector<HTMLElement>(`[data-field="${first}"] :is(input, select, textarea)`)?.focus());
      return;
    }
    void this.runner.run(this.title(), values);
  }

  protected cancel(event?: Event): void {
    event?.preventDefault(); // Esc: close through the runner, so nothing closes mid-run
    this.runner.close();
  }

  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.cancel();
  }

  protected readonly fieldId = (key: string) => `${this.id}-${key}`;
  protected readonly errId = (key: string) => `${this.id}-${key}-err`;
}
