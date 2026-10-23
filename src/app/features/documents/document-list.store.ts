import { Injectable, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { ActionsApi } from '../../core/actions-api';
import { DocumentsApi } from '../../core/documents-api';
import {
  DocumentColumn,
  DocumentColumnKey,
  DocumentFolder,
  DocumentRow,
  DocumentSort,
  ExportDocumentsPayload,
  ExportDocumentsRequest,
  FilterDef,
  FilterValue,
  SearchDocumentsPayload,
  SearchDocumentsRequest,
} from '../../core/documents-models';
import { errorMessage } from '../../core/http';
import { Session } from '../../core/session';
import { Toasts } from '../../ui/toasts';
import { decodeValue, describe, encodeValue } from './criteria';
import { DocumentQuery } from './document-query';

/** localStorage that never throws (private mode, blocked storage). */
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};

const lastFolderKey = (groupId: number | null) => `dn.folder.${groupId ?? 0}`;
const COLUMNS_KEY = 'dn.columns';

/**
 * Columns shown until the user picks their own: the ones needed to recognise a document.
 * The Razor catalog shows up to 17; the rest stay one click away in «Στήλες». Α/Α (and the
 * identifier of drafts, which is the same number) is already under the subject.
 */
export const DEFAULT_COLUMNS: DocumentColumnKey[] = [
  'Subject',
  'ProtocolNum',
  'IssueDate',
  'Apostoleas',
  'Recipients',
  'CopyStatus',
  'NextEntityToSign',
  'Assignees',
];

export interface DocumentFlags {
  IsRead?: boolean;
  IsImportant?: boolean;
}

/** A row with the user's marks changed; reading it also clears «unread» of the copy. */
export function withFlags(row: DocumentRow, flags: DocumentFlags): DocumentRow {
  return {
    ...row,
    ...(flags.IsRead === undefined ? {} : { IsReadByUser: flags.IsRead, ...(flags.IsRead ? { IsUnread: false } : {}) }),
    ...(flags.IsImportant === undefined ? {} : { IsImportant: flags.IsImportant }),
  };
}

/** The export request: the selection if any, else the list query without paging. */
export function exportRequest(
  list: SearchDocumentsRequest,
  selection: readonly number[] | null,
  withFiles: boolean,
): ExportDocumentsRequest {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { GroupId, PageNumber, PageSize, ...query } = list;
  return {
    GroupId,
    ...(selection ? { DocumentIds: [...selection] } : { Query: query }),
    ...(withFiles ? { WithFiles: true } : {}),
  };
}

/** Every selectable folder, with the label path for the title ("Εισερχόμενα › Εκκρεμή"). */
export function flattenFolders(tree: DocumentFolder[], parents: string[] = []): { key: string; path: string[] }[] {
  const out: { key: string; path: string[] }[] = [];
  for (const f of tree) {
    const path = [...parents, f.Label];
    if (f.Key) out.push({ key: f.Key, path });
    if (f.Children) out.push(...flattenFolders(f.Children, path));
  }
  return out;
}

/**
 * Data for the document list: one `rxResource` for the filters of the group and one for the
 * list. Changing the URL changes `request`, which cancels the call in flight and issues one new.
 */
@Injectable()
export class DocumentListStore {
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly query = inject(DocumentQuery);
  private readonly actions = inject(ActionsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(Toasts);

  readonly filters = rxResource({
    params: () => {
      const userId = this.session.user()?.Id;
      const groupId = this.session.groupId();
      return userId && groupId ? { userId, groupId } : undefined;
    },
    stream: ({ params }) => this.api.filters(params.userId, params.groupId),
  });

  private readonly f = computed(() => (this.filters.hasValue() ? this.filters.value() : undefined));
  readonly folders = computed(() => this.f()?.Folders ?? []);
  private readonly flat = computed(() => flattenFolders(this.folders()));
  readonly searchTypes = computed(() => this.f()?.SearchTypes ?? []);
  readonly periods = computed(() => this.f()?.Periods ?? []);

  /** The folder in the URL if this group has it, else none (an effect then picks one). */
  readonly folder = computed(() => this.flat().find((x) => x.key === this.query.state().folder) ?? null);

  /** Values the URL leaves to the server's defaults. */
  readonly searchType = computed(() => {
    const st = this.query.state().searchType;
    return this.searchTypes().some((t) => t.Id === st) ? st! : (this.f()?.DefaultSearchType ?? 9);
  });
  readonly period = computed(() => {
    const pr = this.query.state().period;
    return this.periods().some((p) => p.Id === pr) ? pr! : (this.f()?.DefaultPeriod ?? 4);
  });
  readonly sort = computed<DocumentSort>(() => {
    const s = this.query.state().sort;
    const col = this.f()?.Columns.find((c) => c.Key === s?.Column && c.Sortable);
    return col && s ? s : (this.f()?.DefaultSort ?? { Column: 'IssueDate', Direction: 'desc' });
  });

  /** «Φίλτρα» the server offers to this user. */
  readonly filterDefs = computed<FilterDef[]>(() => this.f()?.Filters ?? []);

  /** Active filters, typed; URL values that do not fit a definition are ignored. */
  readonly criteria = computed<Record<string, FilterValue>>(() => {
    const raw = this.query.state().criteria;
    const out: Record<string, FilterValue> = {};
    for (const def of this.filterDefs()) {
      const v = decodeValue(def, raw[def.Key]);
      if (v !== null) out[def.Key] = v;
    }
    return out;
  });
  readonly filterCount = computed(() => Object.keys(this.criteria()).length);

  /**
   * Names of the users and groups picked in «Φίλτρα», for the chips. The organisation tree
   * is loaded only when such a filter is active (it is cached for 10 minutes).
   */
  private readonly orgNames = rxResource({
    params: () => {
      const kinds = new Set(this.filterDefs().filter((d) => d.Key in this.criteria()).map((d) => d.Kind));
      return kinds.has('users') || kinds.has('groups') ? true : undefined;
    },
    stream: () =>
      this.actions.orgTree([1]).pipe(
        map((tree) => {
          const names = new Map<string, string>();
          const walk = (n: (typeof tree)[number]) => {
            names.set(`g:${n.Id}`, n.DisplayName);
            for (const u of n.Users ?? []) names.set(`u:${u.Id}`, u.DisplayName);
            (n.SubGroups ?? []).forEach(walk);
          };
          tree.forEach(walk);
          return names;
        }),
      ),
  });
  readonly names = computed<ReadonlyMap<string, string>>(() => (this.orgNames.hasValue() ? this.orgNames.value() : new Map()));

  /** One chip per active filter. */
  readonly chips = computed(() =>
    this.filterDefs()
      .filter((d) => d.Key in this.criteria())
      .map((d) => ({ key: d.Key, label: describe(d, this.criteria()[d.Key], this.names()) })),
  );

  /** Writes the filters to the URL (one navigation, one request). */
  applyCriteria(values: Record<string, FilterValue | null>): void {
    const raw: Record<string, string> = {};
    for (const def of this.filterDefs()) {
      const v = encodeValue(def, values[def.Key]);
      if (v) raw[def.Key] = v;
    }
    this.query.setCriteria(raw);
  }

  removeCriterion(key: string): void {
    const rest = { ...this.query.state().criteria };
    delete rest[key];
    this.query.setCriteria(rest);
  }

  readonly request = computed<SearchDocumentsRequest | undefined>(() => {
    const folder = this.folder();
    const groupId = this.session.groupId();
    if (!folder || !groupId) return undefined;
    const s = this.query.state();
    const period = this.period();
    return {
      GroupId: groupId,
      FolderKey: folder.key,
      Search: s.q.trim() ? { Text: s.q.trim(), Type: this.searchType() } : null,
      Period: period === 0 ? { Range: 0, From: s.from, To: s.to } : { Range: period },
      Sort: this.sort(),
      ...(this.filterCount() ? { Criteria: this.criteria() } : {}),
      PageNumber: s.page,
      PageSize: s.size,
    };
  });

  readonly list = rxResource({
    params: () => this.request(),
    stream: ({ params }) => this.api.search(params),
  });

  /** Last successful page, kept on screen (dimmed) while the next one loads. */
  readonly page = linkedSignal<SearchDocumentsPayload | undefined, SearchDocumentsPayload | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, prev) => next ?? prev?.value,
  });

  readonly rows = computed(() => this.page()?.Data ?? []);
  readonly total = computed(() => this.page()?.Page.TotalElements ?? 0);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.query.state().size)));
  readonly firstLoad = computed(() => !this.page() && (this.list.isLoading() || this.filters.isLoading()));

  /** Document view widened over the list (remembered on this device). */
  readonly expanded = signal(storage.get('dn.expanded') === '1');

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
    storage.set('dn.expanded', this.expanded() ? '1' : '0');
  }

  /** Opens a document beside the list, keeping the list's query. */
  open(id: number): void {
    void this.router.navigate([id], { relativeTo: this.route, queryParamsHandling: 'preserve' });
  }

  close(): void {
    void this.router.navigate(['.'], { relativeTo: this.route, queryParamsHandling: 'preserve' });
  }

  /**
   * Marks a document as read for the user when its view opens (UiViewDoc does the same) and
   * drops the «unread» mark from its row, without reloading the list.
   */
  markRead(id: number): void {
    const row = this.rows().find((r) => r.Id === id);
    if (row && row.IsReadByUser && !row.IsUnread) return;
    void this.setFlags([id], { IsRead: true }, { quiet: true });
  }

  /**
   * Αναγνωσμένο / σημαντικό for one or many documents. The rows change at once and go back if
   * the server refuses; the list is not reloaded, so rows do not jump while the user works.
   * Resolves to whether the server accepted.
   */
  setFlags(ids: number[], flags: DocumentFlags, opts: { quiet?: boolean } = {}): Promise<boolean> {
    const groupId = this.session.groupId();
    if (!groupId || !ids.length) return Promise.resolve(false);
    const before = new Map(this.rows().filter((r) => ids.includes(r.Id)).map((r) => [r.Id, r]));
    this.patchRows(ids, (r) => withFlags(r, flags));
    return new Promise((resolve) =>
      this.api.flags({ GroupId: groupId, DocumentIds: ids, ...flags }).subscribe({
        next: () => {
          this.api.invalidateLists(); // cached pages still carry the old marks
          resolve(true);
        },
        error: (e: unknown) => {
          this.patchRows([...before.keys()], (r) => before.get(r.Id) ?? r);
          if (!opts.quiet) this.toasts.error(`Η σήμανση δεν αποθηκεύτηκε. ${errorMessage(e)}`);
          resolve(false);
        },
      }),
    );
  }

  private patchRows(ids: number[], fn: (r: DocumentRow) => DocumentRow): void {
    this.page.update((p) => p && { ...p, Data: p.Data.map((r) => (ids.includes(r.Id) ? fn(r) : r)) });
  }

  /* ---------- selection ---------- */

  /**
   * Selected documents, by Id. Kept while paging through the same list, so a selection can
   * span pages; another folder, search, period or filter clears it.
   */
  readonly selected = signal<ReadonlySet<number>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);
  /** State of the «select all on this page» box. */
  readonly pageSelection = computed<'none' | 'some' | 'all'>(() => {
    const rows = this.rows();
    const n = rows.filter((r) => this.selected().has(r.Id)).length;
    return n === 0 ? 'none' : n === rows.length ? 'all' : 'some';
  });
  /** The list without its paging: what the selection belongs to. */
  private readonly listKey = computed(() => {
    const r = this.request();
    return r ? JSON.stringify({ ...r, PageNumber: 0, PageSize: 0 }) : '';
  });

  isSelected(id: number): boolean {
    return this.selected().has(id);
  }

  toggleSelected(id: number): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Selects or clears every row of the page shown. */
  selectPage(on: boolean): void {
    this.selected.update((s) => {
      const next = new Set(s);
      for (const r of this.rows()) {
        if (on) next.add(r.Id);
        else next.delete(r.Id);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  /** Flags for the selection; reports the result, as the Razor mass actions do. */
  async flagSelection(flags: DocumentFlags): Promise<void> {
    const ids = [...this.selected()];
    if (!(await this.setFlags(ids, flags))) return;
    const [one, many] =
      flags.IsRead === true ? ['αναγνωσμένο', 'αναγνωσμένα']
      : flags.IsRead === false ? ['μη αναγνωσμένο', 'μη αναγνωσμένα']
      : flags.IsImportant ? ['σημαντικό', 'σημαντικά']
      : ['μη σημαντικό', 'μη σημαντικά'];
    this.toasts.success(ids.length === 1 ? `Το έγγραφο σημειώθηκε ως ${one}.` : `Σημειώθηκαν ${ids.length} έγγραφα ως ${many}.`);
  }

  /* ---------- export ---------- */

  readonly canExportWithFiles = computed(() => !!this.f()?.CanExportWithFiles);

  /** Queues an Excel export of the selection, or of everything the list query matches. */
  exportList(scope: 'selection' | 'list', withFiles: boolean): Observable<ExportDocumentsPayload> {
    const selection = scope === 'selection' ? [...this.selected()] : null;
    return this.api.export(exportRequest(this.request()!, selection, withFiles && this.canExportWithFiles()));
  }

  /** Columns the user chose to see (remembered on this device). */
  readonly chosenColumns = signal<DocumentColumnKey[]>(this.readColumns());

  /** Columns of this folder that the server offers, in its order. */
  readonly availableColumns = computed<DocumentColumn[]>(() => {
    const keys = this.page()?.Columns ?? [];
    const all = this.f()?.Columns ?? [];
    return keys.map((k) => all.find((c) => c.Key === k)).filter((c): c is DocumentColumn => !!c);
  });

  /** Columns on screen. «Θέμα» is always there: it carries the link and the row's flags. */
  readonly columns = computed(() => {
    const cols = this.availableColumns().filter((c) => c.Key === 'Subject' || this.chosenColumns().includes(c.Key));
    return [...cols.filter((c) => c.Key === 'Subject'), ...cols.filter((c) => c.Key !== 'Subject')];
  });

  toggleColumn(key: DocumentColumnKey): void {
    this.chosenColumns.update((cols) => (cols.includes(key) ? cols.filter((k) => k !== key) : [...cols, key]));
    storage.set(COLUMNS_KEY, JSON.stringify(this.chosenColumns()));
  }

  resetColumns(): void {
    this.chosenColumns.set([...DEFAULT_COLUMNS]);
    storage.set(COLUMNS_KEY, JSON.stringify(DEFAULT_COLUMNS));
  }

  constructor() {
    // No folder in the URL (or one this group does not have): reopen the last one used in this
    // group, else the server's default. No history entry, so "back" does not bounce here.
    effect(() => {
      const flat = this.flat();
      const f = this.f();
      const wanted = this.query.state().folder;
      if (!f || flat.some((x) => x.key === wanted)) return;
      const last = storage.get(lastFolderKey(this.session.groupId()));
      const folder = flat.some((x) => x.key === last) ? last : f.DefaultFolderKey;
      untracked(() => this.query.patch({ folder }, { replace: true }));
    });

    // Remember the folder per group.
    effect(() => {
      const folder = this.folder();
      if (folder) storage.set(lastFolderKey(this.session.groupId()), folder.key);
    });

    // A write happened elsewhere: show fresh data, keep the page.
    let firstRevision = true;
    effect(() => {
      this.api.revision();
      if (firstRevision) {
        firstRevision = false;
        return;
      }
      untracked(() => this.list.reload());
    });

    // Another list (not another page of it): the selection no longer applies.
    let lastKey = '';
    effect(() => {
      const key = this.listKey();
      if (key && lastKey && key !== lastKey) untracked(() => this.clearSelection());
      if (key) lastKey = key;
    });

    // Warm the next page so «Επόμενη» is instant.
    effect(() => {
      const req = this.request();
      const loaded = this.list.hasValue();
      if (!req || !loaded || req.PageNumber >= this.pageCount()) return;
      untracked(() => this.api.prefetchSearch({ ...req, PageNumber: req.PageNumber + 1 }));
    });
  }

  refresh(): void {
    this.api.invalidate();
    this.list.reload();
  }

  private readColumns(): DocumentColumnKey[] {
    try {
      const saved = JSON.parse(storage.get(COLUMNS_KEY) ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.every((k) => typeof k === 'string')) return saved as DocumentColumnKey[];
    } catch {
      /* fall back to the defaults */
    }
    return [...DEFAULT_COLUMNS];
  }
}
