import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { DocumentColumnKey, DocumentSort } from '../../core/documents-models';
import { PAGE_SIZES } from '../../shared/pager';
import { PARAM_PREFIX } from './criteria';

/**
 * Everything that defines what the document list shows. It lives in the URL:
 * `/documents?f=<folder>&q=&st=&pr=&from=&to=&p=&ps=&o=&c.<filter>=`. Values the server decides
 * (default folder, search type, period, sort) stay `null` until the user picks one,
 * so the URL stays short and follows the server's defaults.
 */
export interface DocumentQueryState {
  folder: string | null;
  q: string;
  searchType: number | null;
  period: number | null;
  from: string | null; // yyyy-mm-dd, only with period 0
  to: string | null;
  page: number; // 1-based
  size: number;
  sort: DocumentSort | null;
  /** «Φίλτρα» as written in the URL (`c.<Key>`); typed against the FilterDefs by the store. */
  criteria: Readonly<Record<string, string>>;
}

const int = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const optInt = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
const isDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseDocumentQuery(p: Params): DocumentQueryState {
  const o = String(p['o'] ?? '');
  const desc = o.startsWith('-');
  const col = desc ? o.slice(1) : o;
  const size = int(p['ps'], 20);
  return {
    folder: p['f'] ? String(p['f']) : null,
    q: String(p['q'] ?? ''),
    searchType: optInt(p['st']),
    period: optInt(p['pr']),
    from: isDate(p['from']),
    to: isDate(p['to']),
    page: int(p['p'], 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 20,
    sort: /^[A-Za-z]+$/.test(col) ? { Column: col as DocumentColumnKey, Direction: desc ? 'desc' : 'asc' } : null,
    criteria: Object.fromEntries(
      Object.entries(p)
        .filter(([k, v]) => k.startsWith(PARAM_PREFIX) && /^[A-Za-z]+$/.test(k.slice(PARAM_PREFIX.length)) && v !== '')
        .map(([k, v]) => [k.slice(PARAM_PREFIX.length), String(v)]),
    ),
  };
}

export function toDocumentParams(s: DocumentQueryState): Params {
  return {
    f: s.folder,
    q: s.q || null,
    st: s.searchType,
    pr: s.period,
    from: s.period === 0 ? s.from : null,
    to: s.period === 0 ? s.to : null,
    p: s.page > 1 ? s.page : null,
    ps: s.size !== 20 ? s.size : null,
    o: s.sort ? (s.sort.Direction === 'desc' ? '-' : '') + s.sort.Column : null,
    ...Object.fromEntries(Object.entries(s.criteria).map(([k, v]) => [PARAM_PREFIX + k, v || null])),
  };
}

/** URL-backed state of the document list (same pattern as FolderQuery). */
@Injectable()
export class DocumentQuery {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.queryParams, { initialValue: this.route.snapshot.queryParams });
  readonly state = computed(() => parseDocumentQuery(this.params()));

  /** Any change other than paging returns to page 1. `replace` keeps typing out of history. */
  patch(change: Partial<DocumentQueryState>, opts: { replace?: boolean } = {}): void {
    const next = { ...this.state(), ...change };
    if (!('page' in change)) next.page = 1;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toDocumentParams(next),
      replaceUrl: opts.replace ?? false,
    });
  }

  /** Replaces all «Φίλτρα» at once (one request for the whole panel). */
  setCriteria(criteria: Record<string, string>): void {
    this.patch({ criteria });
  }

  /** First click sorts dates newest first and text A→Z; the next click reverses. */
  toggleSort(column: DocumentColumnKey, current: DocumentSort): void {
    const dateLike = column === 'IssueDate' || column === 'LastSignDate' || column === 'ProtocolDate' || column === 'SerialNumber';
    const Direction =
      current.Column === column ? (current.Direction === 'asc' ? 'desc' : 'asc') : dateLike ? 'desc' : 'asc';
    this.patch({ sort: { Column: column, Direction } });
  }
}
