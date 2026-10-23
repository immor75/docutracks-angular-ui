import { ChangeDetectionStrategy, Component, computed, forwardRef, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import {
  ContactValue,
  PersonValue,
  RegisterField,
  RegisterValue,
  ThematicFolder,
  TreeOption,
  UploadedFile,
} from '../../../core/documents-models';
import { OrgTreeNode } from '../../../core/models';
import { RegisterApi } from '../../../core/register-api';
import { OrgPicker, PickItem, flattenTree, groupKey, userKey } from '../../../shared/org-picker';
import { EditorApi } from '../../editor/editor-api';
import { FormioForm } from '../../editor/formio-form';
import { ThematicPicker } from '../actions/thematic-picker';
import { FilesField } from './files-field';
import { LookupField, LookupItem } from './lookup-field';
import { RegisterStore } from './register-store';
import { SignatureChain } from './signature-chain';

type Value = RegisterValue | undefined;

/** Trees of kinds and categories as organisation nodes, so the organisation picker can show them. */
function toOrg(nodes: TreeOption[]): OrgTreeNode[] {
  return nodes.map((n) => ({ Id: n.Id, DisplayName: n.Title, Users: [], SubGroups: toOrg(n.Children ?? []) }));
}
function selectable(nodes: TreeOption[], out = new Set<number>()): Set<number> {
  for (const n of nodes) {
    if (n.Selectable !== false) out.add(n.Id);
    selectable(n.Children ?? [], out);
  }
  return out;
}

/**
 * One field of the registration form, drawn from its description. Values live in the store;
 * every kind maps its control's value to the shape `POST register` expects.
 */
@Component({
  selector: 'app-reg-field',
  imports: [OrgPicker, ThematicPicker, FilesField, LookupField, FormioForm, SignatureChain, forwardRef(() => MetaClassForm)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reg-field.html',
  styleUrl: './reg-field.css',
  host: { '[attr.data-field]': 'field().Key', class: 'reg-field' },
})
export class RegField {
  protected readonly store = inject(RegisterStore);
  private readonly api = inject(RegisterApi);
  private readonly editor = inject(EditorApi);

  readonly field = input.required<RegisterField>();

  protected readonly id = computed(() => `reg-${this.field().Key}`);
  protected readonly errId = computed(() => `reg-${this.field().Key}-err`);
  protected readonly hintId = computed(() => `reg-${this.field().Key}-hint`);
  protected readonly error = computed(() => this.store.issueByKey().get(this.field().Key) ?? null);
  protected readonly describedBy = computed(() => [this.field().Hint ? this.hintId() : '', this.error() ? this.errId() : ''].filter(Boolean).join(' ') || null);
  protected readonly value = computed<Value>(() => this.store.values()[this.field().Key]);

  protected set(v: RegisterValue): void {
    this.store.set(this.field().Key, v);
  }

  /** The value of a read-only field, as text. */
  protected readonly readOnlyText = computed(() => {
    const f = this.field();
    const v = this.value();
    if (v === undefined || v === null || v === '') return '';
    const list = Array.isArray(v) ? (v as unknown[]) : [v];
    switch (f.Kind) {
      case 'date':
        return typeof v === 'string' ? v.split('-').reverse().join('/') : '';
      case 'checkbox':
        return v === true ? 'Ναι' : 'Όχι';
      case 'select':
        return list.map((id) => f.Options.find((o) => o.Id === id)?.Label ?? String(id)).join(', ');
      case 'tree':
        return this.treePicked().map((i) => i.name).join(', ') || (f.Source === 'kinds' ? (this.kindTitle(v as number) ?? '') : '');
      case 'people':
        return this.peoplePicked().map((i) => i.name).join(', ');
      case 'contacts':
        return (list as ContactValue[]).map((c) => c.Name).join(', ');
      case 'documents':
        return (list as { Title: string }[]).map((d) => d.Title).join(', ');
      case 'files':
        return (list as UploadedFile[]).map((x) => x.Name).join(', ');
      case 'thematicFolders':
        return (list as ThematicFolder[]).map((t) => t.Name).join(', ');
      case 'text':
      case 'number':
        return String(v);
      default:
        return '';
    }
  });

  /* ---------- text, number, date, select ---------- */

  protected text(): string {
    return typeof this.value() === 'string' ? (this.value() as string) : '';
  }
  protected num(): string {
    const v = this.value();
    return typeof v === 'number' ? String(v) : '';
  }
  protected setNumber(raw: string): void {
    this.set(raw === '' ? null : Number(raw));
  }
  protected selected(id: number): boolean {
    const v = this.value();
    return Array.isArray(v) ? (v as number[]).includes(id) : v === id;
  }
  protected setSelect(raw: string): void {
    this.set(raw === '' ? null : Number(raw));
  }
  protected toggleMulti(id: number, on: boolean): void {
    const v = (Array.isArray(this.value()) ? this.value() : []) as number[];
    this.set(on ? [...v, id] : v.filter((x) => x !== id));
  }

  /* ---------- trees (Είδος, Κατηγορίες) ---------- */

  protected readonly treeSource = computed<TreeOption[]>(() => {
    const f = this.field();
    if (f.Kind !== 'tree') return [];
    if (f.Source === 'kinds') return this.store.kinds.hasValue() ? this.store.kinds.value() : [];
    return f.Tree ?? [];
  });
  protected readonly treeItems = computed(() => flattenTree(toOrg(this.treeSource()), 'groups'));
  protected readonly treeAllowed = computed(() => selectable(this.treeSource()));
  protected readonly treePicked = computed(() => {
    const v = this.value();
    const ids = new Set(Array.isArray(v) ? (v as number[]) : typeof v === 'number' ? [v] : []);
    return this.treeItems().filter((i) => ids.has(i.id));
  });
  protected setTree(picked: PickItem[], multi: boolean): void {
    this.set(multi ? picked.map((p) => p.id) : (picked[0]?.id ?? null));
  }

  /* ---------- people ---------- */

  protected readonly peopleItems = computed(() => {
    const f = this.field();
    return f.Kind === 'people' ? flattenTree(f.Tree, f.Pick) : [];
  });
  protected readonly peoplePicked = computed(() => {
    const f = this.field();
    if (f.Kind !== 'people') return [];
    const keys = new Set(
      ((this.value() ?? []) as PersonValue[]).map((p) => (p.UserId ? userKey(f.Pick, p.UserId, p.GroupId) : groupKey(p.GroupId))),
    );
    return this.peopleItems().filter((i) => keys.has(i.key));
  });
  protected readonly peopleAllowed = computed(() => {
    const f = this.field();
    return f.Kind === 'people' && f.AllowedGroups ? new Set(f.AllowedGroups) : null;
  });
  protected setPeople(picked: PickItem[]): void {
    this.set(picked.map((p) => (p.type === 'user' ? { UserId: p.id, GroupId: p.groupId ?? 0 } : { GroupId: p.id })));
  }

  /* ---------- contacts and related documents ---------- */

  protected readonly searchContacts = (term: string) =>
    this.editor.contacts(term, 1, 15).pipe(
      map((p) =>
        p.rows.map((c) => ({
          id: c.IdContact,
          title: c.Eponimia || [c.FirstName, c.LastName].filter(Boolean).join(' ') || `Επαφή ${c.IdContact}`,
          meta: [c.ContactType?.ContactTypeName, c.Afm ? 'ΑΦΜ ' + c.Afm : ''].filter(Boolean).join(' · '),
        })),
      ),
    );
  protected readonly searchDocuments = (term: string) =>
    this.editor.documents(term, 1, 15).pipe(
      map((p) =>
        p.rows.map((d) => ({
          id: d.Id,
          title: d.Title || `Α/Α ${d.Id}`,
          meta: [d.ProtocolText ? 'Αριθμ. Πρωτ. ' + d.ProtocolText : '', 'Α/Α ' + d.Id].filter(Boolean).join(' · '),
        })),
      ),
    );
  protected readonly contacts = computed<LookupItem[]>(() => ((this.value() ?? []) as ContactValue[]).map((c) => ({ id: c.Id, title: c.Name })));
  protected setContacts(items: LookupItem[]): void {
    this.set(items.map((i) => ({ Id: i.id, Name: i.title })));
  }
  protected readonly docs = computed<LookupItem[]>(() => ((this.value() ?? []) as { Id: number; Title: string }[]).map((d) => ({ id: d.Id, title: d.Title })));
  protected setDocs(items: LookupItem[]): void {
    this.set(items.filter((i) => i.id !== null).map((i) => ({ Id: i.id!, Title: i.title })));
  }

  /* ---------- files, thematic folders ---------- */

  protected files(): UploadedFile[] {
    return (this.value() ?? []) as UploadedFile[];
  }
  protected thematic(): ThematicFolder[] {
    return (this.value() ?? []) as ThematicFolder[];
  }

  /* ---------- «Ειδικά πεδία» of the kind, «Μεταδεδομένα» ---------- */

  private readonly kindId = computed(() => {
    const f = this.field();
    return f.Kind === 'kindForm' ? (this.store.values()[f.KindField] as number | null | undefined) ?? null : null;
  });
  private readonly kindHasForm = computed(() => {
    const id = this.kindId();
    const find = (nodes: { Id: number; HasForm?: boolean; Children?: unknown[] }[]): boolean =>
      nodes.some((n) => (n.Id === id && !!n.HasForm) || find((n.Children ?? []) as typeof nodes));
    return id !== null && find(this.store.kinds.hasValue() ? this.store.kinds.value() : []);
  });
  protected readonly kindForm = rxResource({
    params: () => (this.kindHasForm() ? this.kindId() : undefined),
    stream: ({ params }) => (params ? this.api.kindForm(params) : of(null)),
  });
  protected readonly kindName = computed(() => {
    const id = this.kindId();
    const walk = (nodes: TreeOption[]): string | null => {
      for (const n of nodes) {
        if (n.Id === id) return n.Title;
        const c = walk(n.Children ?? []);
        if (c) return c;
      }
      return null;
    };
    return walk(this.store.kinds.hasValue() ? this.store.kinds.value() : []);
  });
  protected readonly kindNeedsForm = this.kindHasForm;
  private kindTitle(id: number): string | null {
    const walk = (nodes: TreeOption[]): string | null => {
      for (const n of nodes) {
        if (n.Id === id) return n.Title;
        const c = walk(n.Children ?? []);
        if (c) return c;
      }
      return null;
    };
    return walk(this.store.kinds.hasValue() ? this.store.kinds.value() : []);
  }
  protected objectValue(): Record<string, unknown> {
    const v = this.value();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }
  protected setObject(v: Record<string, unknown>): void {
    this.set(v);
  }

  /** Metadata classes turned on, each with its form. */
  protected readonly metaOn = computed(() => Object.keys(this.objectValue()));
  protected toggleClass(code: string, on: boolean): void {
    const v = { ...this.objectValue() };
    if (on) v[code] = {};
    else delete v[code];
    this.set(v);
  }
  protected setClassData(code: string, data: Record<string, unknown>): void {
    this.set({ ...this.objectValue(), [code]: data });
  }
  protected classValue(code: string): Record<string, unknown> {
    return (this.objectValue()[code] as Record<string, unknown>) ?? {};
  }
}

/** The form of one metadata class, loaded when the class is turned on. */
@Component({
  selector: 'app-meta-class-form',
  imports: [FormioForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (form.hasValue() && form.value(); as f) {
      <app-formio-form [components]="f.components" [value]="$any(value())" (valueChange)="valueChange.emit($any($event))" />
    } @else if (form.error()) {
      <p class="field-err" role="alert">Η φόρμα δεν φορτώθηκε.</p>
    } @else {
      <span class="skel" style="height: 36px"></span>
    }
  `,
})
export class MetaClassForm {
  private readonly api = inject(RegisterApi);
  readonly code = input.required<string>();
  readonly value = input<Record<string, unknown>>({});
  readonly valueChange = output<Record<string, unknown>>();
  protected readonly form = rxResource({ params: () => this.code(), stream: ({ params }) => this.api.metadataForm(params) });
}
