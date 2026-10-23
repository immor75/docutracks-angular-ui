import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { OrderBy, SortDirection } from '../../core/models';
import { PAGE_SIZES } from '../../shared/pager';

/** Server-side sortable columns (verified in the Postman collection). */
export const SORTABLE = ['FolderName', 'OwnerGroupDisplayName', 'CreatedByName', 'UpdatedDate', 'CreatedDate'] as const;
export type SortColumn = (typeof SORTABLE)[number];

export const SEARCH_TYPES = [
  { id: 1, label: 'Ελεύθερο κείμενο' },
  { id: 6, label: 'Αρ. υπόθεσης' },
  { id: 2, label: 'Τίτλος' },
  { id: 7, label: 'Εμπλεκόμενοι' },
  { id: 5, label: 'ΑΦΜ' },
  { id: 4, label: 'Περιοχή' },
  { id: 8, label: 'Ειδικά στοιχεία' },
] as const;

export const STATUSES = [
  { id: 1, label: 'Δημιουργήθηκε' },
  { id: 2, label: 'Σε εξέλιξη' },
  { id: 3, label: 'Αρχειοθετήθηκε' },
] as const;


/** Everything that defines what the list shows. It lives in the URL. */
export interface FolderQueryState {
  type: number | null; // folder type instance id
  q: string;
  searchType: number;
  statuses: number[];
  from: string | null; // yyyy-mm-dd, created date
  to: string | null;
  shared: boolean;
  unassigned: boolean;
  unread: boolean;
  page: number; // 1-based
  size: number;
  sort: { column: SortColumn; dir: SortDirection };
}

const DEFAULT_SORT = { column: 'UpdatedDate' as SortColumn, dir: 'desc' as SortDirection };

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseQuery(p: Params): FolderQueryState {
  const sortRaw: string = p['o'] ?? '';
  const desc = sortRaw.startsWith('-');
  const col = (desc ? sortRaw.slice(1) : sortRaw) as SortColumn;
  const size = int(p['ps'], 20);
  return {
    type: p['t'] ? int(p['t'], 0) || null : null,
    q: (p['q'] ?? '').toString(),
    searchType: SEARCH_TYPES.some((s) => s.id === Number(p['st'])) ? Number(p['st']) : 1,
    statuses: String(p['s'] ?? '')
      .split(',')
      .map(Number)
      .filter((n) => STATUSES.some((s) => s.id === n)),
    from: isDate(p['from']),
    to: isDate(p['to']),
    shared: p['sh'] === '1',
    unassigned: p['na'] === '1',
    unread: p['ur'] === '1',
    page: int(p['p'], 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
    sort: SORTABLE.includes(col) ? { column: col, dir: desc ? 'desc' : 'asc' } : DEFAULT_SORT,
  };
}

function toParams(s: FolderQueryState): Params {
  const isDefaultSort = s.sort.column === DEFAULT_SORT.column && s.sort.dir === DEFAULT_SORT.dir;
  return {
    t: s.type ?? null,
    q: s.q || null,
    st: s.q && s.searchType !== 1 ? s.searchType : null,
    s: s.statuses.length ? [...s.statuses].sort().join(',') : null,
    from: s.from,
    to: s.to,
    sh: s.shared ? '1' : null,
    na: s.unassigned ? '1' : null,
    ur: s.unread ? '1' : null,
    p: s.page > 1 ? s.page : null,
    ps: s.size !== 20 ? s.size : null,
    o: isDefaultSort ? null : (s.sort.dir === 'desc' ? '-' : '') + s.sort.column,
  };
}

export function toOrderBy(s: FolderQueryState): OrderBy[] {
  return [{ Column: s.sort.column, Direction: s.sort.dir }];
}

export function activeFilterCount(s: FolderQueryState): number {
  return s.statuses.length + (s.from ? 1 : 0) + (s.to ? 1 : 0) + (s.shared ? 1 : 0) + (s.unassigned ? 1 : 0) + (s.unread ? 1 : 0);
}

/**
 * URL-backed state for the folder list. Components read `state()` and call `patch()`;
 * nothing else holds list state, so refresh, back/forward and shared links just work.
 */
@Injectable()
export class FolderQuery {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.queryParams, { initialValue: this.route.snapshot.queryParams });
  readonly state = computed(() => parseQuery(this.params()));

  /**
   * Changes the query. Any change other than paging returns to page 1.
   * `replace` keeps typing in the search box out of the browser history.
   */
  patch(change: Partial<FolderQueryState>, opts: { replace?: boolean } = {}): void {
    const next = { ...this.state(), ...change };
    if (!('page' in change)) next.page = 1;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toParams(next),
      replaceUrl: opts.replace ?? false,
    });
  }

  clearFilters(): void {
    this.patch({ statuses: [], from: null, to: null, shared: false, unassigned: false, unread: false });
  }

  toggleSort(column: SortColumn): void {
    const cur = this.state().sort;
    const isDate = column === 'UpdatedDate' || column === 'CreatedDate';
    const dir: SortDirection =
      cur.column === column ? (cur.dir === 'asc' ? 'desc' : 'asc') : isDate ? 'desc' : 'asc';
    this.patch({ sort: { column, dir } });
  }
}
