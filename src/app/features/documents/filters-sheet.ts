import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActionsApi } from '../../core/actions-api';
import { FilterDef, FilterOption, FilterValue } from '../../core/documents-models';
import { errorMessage } from '../../core/http';
import { OrgPicker, PickItem, flattenTree, groupKey, userKey } from '../../shared/org-picker';
import { Icon } from '../../ui/icon';
import { isEmptyValue } from './criteria';
import { DocumentListStore } from './document-list.store';

type Draft = Record<string, FilterValue | null>;
interface Dates {
  From?: string | null;
  To?: string | null;
}

/** Lists longer than this get a search box. */
const SEARCHABLE = 8;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/**
 * «Φίλτρα»: a side sheet on a native modal <dialog>, built from the FilterDefs the server
 * sends. The form edits a draft; the URL (and the list) change once, on «Εφαρμογή».
 * Users and groups are picked from the organisation tree inside the same sheet, so there is
 * never a dialog on top of a dialog.
 */
@Component({
  selector: 'app-filters-sheet',
  imports: [Icon, OrgPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filters-sheet.html',
  styleUrl: './filters-sheet.css',
  host: { '(click)': 'onDialogClick($event)' },
})
export class FiltersSheet {
  protected readonly store = inject(DocumentListStore);
  private readonly actions = inject(ActionsApi);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly errorMessage = errorMessage;

  protected readonly isOpen = signal(false);
  protected readonly draft = signal<Draft>({});
  /** Text typed in the search box of a long option list, per filter. */
  protected readonly find = signal<Record<string, string>>({});
  /** Filter whose users/groups are being picked; null = the list of filters. */
  protected readonly picking = signal<FilterDef | null>(null);
  protected readonly picked = signal<PickItem[]>([]);

  /** Filters grouped under their heading, in the server's order. */
  protected readonly groups = computed(() => {
    const out = new Map<string, FilterDef[]>();
    for (const d of this.store.filterDefs()) out.set(d.Group, [...(out.get(d.Group) ?? []), d]);
    return [...out.entries()].map(([title, defs]) => ({ title, defs }));
  });

  protected readonly draftCount = computed(() => Object.values(this.draft()).filter((v) => !isEmptyValue(v)).length);

  protected readonly tree = rxResource({
    params: () => this.picking()?.Kind,
    stream: ({ params }) =>
      this.actions.orgTree([1]).pipe(map((t) => flattenTree(t, params === 'groups' ? 'groups' : 'users'))),
  });
  protected readonly treeItems = computed(() => (this.tree.hasValue() ? this.tree.value() : []));

  open(): void {
    this.draft.set({ ...this.store.criteria() });
    this.find.set({});
    this.picking.set(null);
    this.isOpen.set(true);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    this.isOpen.set(false);
    this.picking.set(null);
  }

  /** A click on the backdrop (outside the sheet) closes it. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  /** Esc inside the picker goes back to the list instead of closing everything. */
  protected onCancel(event: Event): void {
    if (this.picking()) {
      event.preventDefault();
      this.picking.set(null);
    }
  }

  protected hasValue(def: FilterDef): boolean {
    return !isEmptyValue(this.draft()[def.Key]);
  }

  protected countIn(defs: FilterDef[]): number {
    return defs.filter((d) => !isEmptyValue(this.draft()[d.Key])).length;
  }

  /* ---------- options ---------- */

  protected ids(def: FilterDef): number[] {
    return (this.draft()[def.Key] as number[] | null) ?? [];
  }

  protected visibleOptions(def: FilterDef): FilterOption[] {
    const q = fold(this.find()[def.Key] ?? '').trim();
    const opts = def.Options ?? [];
    return q ? opts.filter((o) => fold(o.Label).includes(q)) : opts;
  }

  protected searchable(def: FilterDef): boolean {
    return (def.Options?.length ?? 0) > SEARCHABLE;
  }

  protected setFind(def: FilterDef, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.find.update((f) => ({ ...f, [def.Key]: value }));
  }

  protected toggleOption(def: FilterDef, id: number): void {
    const cur = this.ids(def);
    const next = def.Single ? (cur[0] === id ? [] : [id]) : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    this.set(def, next);
  }

  /* ---------- dates and text ---------- */

  protected dates(def: FilterDef): Dates {
    return (this.draft()[def.Key] as Dates | null) ?? {};
  }

  protected setDate(def: FilterDef, side: 'From' | 'To', event: Event): void {
    const value = (event.target as HTMLInputElement).value || null;
    this.set(def, { ...this.dates(def), [side]: value });
  }

  protected text(def: FilterDef): string {
    return (this.draft()[def.Key] as string | null) ?? '';
  }

  protected setText(def: FilterDef, event: Event): void {
    this.set(def, (event.target as HTMLInputElement).value);
  }

  /* ---------- users and groups ---------- */

  protected personName(def: FilterDef, id: number): string {
    return this.store.names().get(`${def.Kind === 'users' ? 'u' : 'g'}:${id}`) ?? this.pickedName(id) ?? `#${id}`;
  }

  /** Names picked in this session, before the store has loaded the tree. */
  private readonly known = new Map<number, string>();
  private pickedName(id: number): string | undefined {
    return this.known.get(id);
  }

  protected startPicking(def: FilterDef): void {
    const mode = def.Kind === 'groups' ? 'groups' : 'users';
    this.picked.set(
      this.ids(def).map((id) => ({
        key: mode === 'groups' ? groupKey(id) : userKey('users', id, null),
        type: mode === 'groups' ? ('group' as const) : ('user' as const),
        id,
        groupId: null,
        name: this.personName(def, id),
        path: '',
        depth: 0,
        parent: null,
        hasChildren: false,
        norm: '',
      })),
    );
    this.picking.set(def);
  }

  protected donePicking(): void {
    const def = this.picking();
    if (!def) return;
    for (const p of this.picked()) this.known.set(p.id, p.name);
    this.set(def, [...new Set(this.picked().map((p) => p.id))]);
    this.picking.set(null);
  }

  protected removeId(def: FilterDef, id: number): void {
    this.set(def, this.ids(def).filter((x) => x !== id));
  }

  /* ---------- draft ---------- */

  private set(def: FilterDef, value: FilterValue | null): void {
    this.draft.update((d) => ({ ...d, [def.Key]: value }));
  }

  protected clear(def: FilterDef): void {
    this.set(def, null);
  }

  protected reset(): void {
    this.draft.set({});
  }

  protected apply(event: Event): void {
    event.preventDefault();
    this.store.applyCriteria(this.draft());
    this.close();
  }
}
