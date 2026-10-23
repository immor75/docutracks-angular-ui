import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, model, signal } from '@angular/core';
import { OrgTreeNode } from '../../core/models';
import { Icon } from '../../ui/icon';

export type PickMode = 'users' | 'groups' | 'both';

export interface PickItem {
  key: string;
  type: 'group' | 'user';
  id: number;
  /** For users: the group they were picked under (needed by share: "userId-groupId"). */
  groupId: number | null;
  name: string;
  path: string;
  depth: number;
  parent: string | null;
  hasChildren: boolean;
  norm: string;
}

/** Lower case, no accents: "Τμήμα" matches "τμημα". */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/** In "users" mode a person is one choice wherever they appear; in "both" mode the group matters. */
export const userKey = (mode: PickMode, id: number, groupId: number | null) =>
  mode === 'both' ? `u:${id}:${groupId ?? 0}` : `u:${id}`;
export const groupKey = (id: number) => `g:${id}`;

/** Depth-first flattening, so the visible list is a cheap filter instead of a recursive template. */
export function flattenTree(nodes: OrgTreeNode[], mode: PickMode): PickItem[] {
  const out: PickItem[] = [];
  const walk = (n: OrgTreeNode, depth: number, parent: string | null, path: string) => {
    const key = groupKey(n.Id);
    const users = mode === 'groups' ? [] : (n.Users ?? []);
    const subs = n.SubGroups ?? [];
    out.push({
      key, type: 'group', id: n.Id, groupId: n.Id, name: n.DisplayName, path, depth, parent,
      hasChildren: subs.length + users.length > 0, norm: normalize(n.DisplayName),
    });
    const here = path ? `${path} › ${n.DisplayName}` : n.DisplayName;
    for (const u of users) {
      out.push({
        key: userKey(mode, u.Id, n.Id), type: 'user', id: u.Id, groupId: n.Id, name: u.DisplayName,
        path: here, depth: depth + 1, parent: key, hasChildren: false, norm: normalize(u.DisplayName),
      });
    }
    for (const s of subs) walk(s, depth + 1, key, here);
  };
  for (const n of nodes) walk(n, 0, null, '');
  return out;
}

export function flatUsers(users: { Id: number; DisplayName: string }[]): PickItem[] {
  return users
    .map((u) => ({
      key: userKey('users', u.Id, null), type: 'user' as const, id: u.Id, groupId: null, name: u.DisplayName,
      path: '', depth: 0, parent: null, hasChildren: false, norm: normalize(u.DisplayName),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el'));
}

const MAX_ROWS = 300;

/**
 * Searchable organisation picker: one flat, keyboard-friendly list of checkboxes (or radios
 * for a single choice) instead of a nested mat-tree. Typing filters the whole tree at once.
 */
@Component({
  selector: 'app-org-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selected().length) {
      <ul class="picked" aria-label="Επιλογές">
        @for (p of selected(); track p.key) {
          <li class="chip">
            <app-icon [name]="p.type === 'group' ? 'users' : 'user'" [size]="14" />
            {{ p.name }}
            <button type="button" (click)="toggle(p)" [attr.aria-label]="'Αφαίρεση ' + p.name">
              <app-icon name="close" [size]="14" />
            </button>
          </li>
        }
      </ul>
    }
    <div class="search">
      <app-icon name="search" [size]="18" />
      <label class="sr-only" [for]="id + '-q'">{{ label() }}</label>
      <input
        [id]="id + '-q'"
        type="search"
        autocomplete="off"
        [placeholder]="placeholder()"
        [value]="q()"
        (input)="q.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault()"
      />
    </div>
    @if (loading()) {
      <div class="rows" role="status" aria-label="Φόρτωση">
        @for (w of [60, 40, 75, 50]; track $index) {
          <span class="skel" [style.width.%]="w"></span>
        }
      </div>
    } @else {
      <ul class="rows" [attr.aria-label]="label()">
        @for (it of visible(); track it.key) {
          <li [style.--depth]="query() ? 0 : it.depth" [class.is-group]="it.type === 'group'">
            @if (!query() && it.hasChildren) {
              <button
                type="button"
                class="twisty"
                [attr.aria-expanded]="expanded().has(it.key)"
                [attr.aria-label]="(expanded().has(it.key) ? 'Σύμπτυξη ' : 'Ανάπτυξη ') + it.name"
                (click)="expand(it)"
              >
                <app-icon [name]="expanded().has(it.key) ? 'chevron-down' : 'chevron-right'" [size]="16" />
              </button>
            } @else {
              <span class="twisty" aria-hidden="true"></span>
            }
            @if (selectable(it)) {
              <label class="check" [class.off]="isDisabled(it)">
                <input
                  [type]="multi() ? 'checkbox' : 'radio'"
                  [name]="id"
                  [checked]="keys().has(it.key)"
                  [disabled]="isDisabled(it)"
                  (change)="toggle(it)"
                />
                <app-icon [name]="it.type === 'group' ? 'users' : 'user'" [size]="16" />
                <span class="name" [attr.title]="it.path ? it.name + ' · ' + it.path : it.name">
                  {{ it.name }}
                  @if (query() && it.path) {
                    <small>{{ it.path }}</small>
                  }
                </span>
              </label>
            } @else {
              <button type="button" class="label" (click)="expand(it)">
                <app-icon name="users" [size]="16" />
                <span class="name">{{ it.name }}</span>
              </button>
            }
          </li>
        } @empty {
          <li class="empty">{{ query() ? 'Δεν βρέθηκαν αποτελέσματα.' : 'Δεν υπάρχουν επιλογές.' }}</li>
        }
        @if (more() > 0) {
          <li class="empty">και {{ more() }} ακόμη· πληκτρολογήστε για να περιορίσετε τη λίστα.</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--s-2); min-height: 0; }
    .picked { display: flex; flex-wrap: wrap; gap: var(--s-1); list-style: none; margin: 0; padding: 0; max-height: 96px; overflow: auto; }
    .search {
      display: flex; align-items: center; gap: var(--s-2); padding: 0 var(--s-3);
      border: 1px solid var(--shade-4); border-radius: var(--r-md); color: var(--shade-6);
    }
    .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .search input { flex: 1; min-width: 0; height: 36px; border: 0; background: transparent; }
    .search input:focus, .search input:focus-visible { outline: none; box-shadow: none; }
    .rows {
      list-style: none; margin: 0; padding: var(--s-1) 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; align-content: start;
      height: min(46dvh, 360px); overflow-y: auto; overflow-x: hidden; border: 1px solid var(--shade-3); border-radius: var(--r-md);
    }
    .rows > .skel { margin: var(--s-2) var(--s-3); }
    li { min-width: 0; display: flex; align-items: center; gap: 2px; padding-left: calc(var(--depth, 0) * 18px + 4px); padding-right: var(--s-2); }
    li:hover { background: var(--hover); }
    .twisty {
      flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px;
      border: 0; border-radius: var(--r-sm); background: transparent; color: var(--shade-6); cursor: pointer;
    }
    span.twisty { cursor: default; }
    .check, .label {
      flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s-2);
      min-height: 32px; font-size: var(--fs-small); cursor: pointer;
    }
    .label { border: 0; background: transparent; padding: 0; text-align: left; color: var(--secondary); font-weight: 500; }
    .check.off { color: var(--shade-6); cursor: default; }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name small { display: block; color: var(--secondary); font-size: var(--fs-tiny); line-height: var(--lh-tiny); overflow: hidden; text-overflow: ellipsis; }
    .is-group .name { font-weight: 500; }
    .empty { padding: var(--s-3); color: var(--secondary); font-size: var(--fs-small); }
    .chip app-icon { opacity: 0.8; }
  `,
})
export class OrgPicker {
  private static seq = 0;
  protected readonly id = `pick-${++OrgPicker.seq}`;

  readonly items = input.required<PickItem[]>();
  readonly mode = input<PickMode>('users');
  readonly multi = input(true);
  readonly loading = input(false);
  readonly label = input('Επιλογή');
  readonly placeholder = input('Αναζήτηση…');
  /** When set, only these groups can be chosen (send: Owner/Editor groups of the folder type). */
  readonly allowedGroups = input<ReadonlySet<number> | null>(null);
  readonly selected = model<PickItem[]>([]);

  protected readonly q = signal('');
  protected readonly query = computed(() => normalize(this.q().trim()));
  protected readonly keys = computed(() => new Set(this.selected().map((s) => s.key)));

  /** Top two levels open by default; resets when the items change. */
  protected readonly expanded = linkedSignal(() => new Set(this.items().filter((i) => i.depth === 0).map((i) => i.key)));

  protected selectable(it: PickItem): boolean {
    const m = this.mode();
    return m === 'both' || (m === 'users' ? it.type === 'user' : it.type === 'group');
  }

  protected isDisabled(it: PickItem): boolean {
    const allowed = this.allowedGroups();
    return !!allowed && it.type === 'group' && !allowed.has(it.id);
  }

  private readonly matches = computed(() => {
    const q = this.query();
    const items = this.items();
    if (q) {
      const words = q.split(/\s+/);
      return items.filter((i) => this.selectable(i) && words.every((w) => i.norm.includes(w)));
    }
    const open = this.expanded();
    const visible = new Set<string>();
    return items.filter((i) => {
      const show = i.parent === null || (visible.has(i.parent) && open.has(i.parent));
      if (show) visible.add(i.key);
      return show;
    });
  });

  protected readonly visible = computed(() => this.matches().slice(0, MAX_ROWS));
  protected readonly more = computed(() => Math.max(0, this.matches().length - MAX_ROWS));

  protected expand(it: PickItem): void {
    this.expanded.update((s) => {
      const next = new Set(s);
      if (next.has(it.key)) next.delete(it.key);
      else next.add(it.key);
      return next;
    });
  }

  protected toggle(it: PickItem): void {
    if (this.isDisabled(it)) return;
    if (!this.multi()) {
      this.selected.set([it]);
      return;
    }
    this.selected.update((list) => (list.some((s) => s.key === it.key) ? list.filter((s) => s.key !== it.key) : [...list, it]));
  }
}
