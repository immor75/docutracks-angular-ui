import { Injectable, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { FoldersApi } from '../../core/folders-api';
import { FolderListItem, FolderTypeInstance, Paged, SearchFoldersRequest } from '../../core/models';
import { Session } from '../../core/session';
import { FolderQuery, FolderQueryState, toOrderBy } from './folder-query';

const lastTypeKey = (groupId: number | null) => `fn.type.${groupId ?? 0}`;

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

export interface TypeGroup {
  title: string;
  instances: FolderTypeInstance[];
}

function buildRequest(
  s: FolderQueryState,
  inst: FolderTypeInstance,
  userId: number,
  groupId: number,
): SearchFoldersRequest {
  return {
    UserId: userId,
    GroupId: groupId,
    PageNumber: s.page,
    PageSize: s.size,
    OrderBy: toOrderBy(s),
    FolderFilterCriteria: {
      SharedFolders: s.shared,
      Search: s.q.trim(),
      SelectedSearchTypeId: s.q.trim() ? s.searchType : 0,
      SelectedFolderTypeId: inst.IdFolderType,
      SelectedFolderTypeInstanceId: inst.Id,
      FilterFolderStatuses: s.statuses,
      StartCreatedDate: s.from,
      EndCreatedDate: s.to,
      NoAssignees: s.unassigned,
      FilterFolderIsRead: s.unread ? [2] : [],
    },
  };
}

/**
 * Data for the list page. One `rxResource` per concern; changing the URL changes `request`,
 * which cancels the in-flight call and issues exactly one new one.
 */
@Injectable()
export class FolderListStore {
  private readonly api = inject(FoldersApi);
  private readonly session = inject(Session);
  private readonly query = inject(FolderQuery);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly instances = rxResource({
    params: () => {
      const userId = this.session.user()?.Id;
      const groupId = this.session.groupId();
      return userId && groupId ? { userId, groupId } : undefined;
    },
    stream: ({ params }) => this.api.instances(params.userId, params.groupId),
  });

  readonly activeInstances = computed(() =>
    this.instances.hasValue() ? this.instances.value().filter((i) => i.IsActive) : [],
  );

  /** Sidebar: instances grouped under their folder type, in a stable order. */
  readonly typeGroups = computed<TypeGroup[]>(() => {
    const groups = new Map<string, FolderTypeInstance[]>();
    for (const inst of this.activeInstances()) {
      const title = inst.FolderType?.Title || 'Χωρίς είδος';
      groups.set(title, [...(groups.get(title) ?? []), inst]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'el'))
      .map(([title, instances]) => ({
        title,
        instances: instances.sort((a, b) => a.InstanceName.localeCompare(b.InstanceName, 'el')),
      }));
  });

  readonly selectedInstance = computed(() => {
    const id = this.query.state().type;
    return this.activeInstances().find((i) => i.Id === id) ?? null;
  });

  readonly request = computed<SearchFoldersRequest | undefined>(() => {
    const inst = this.selectedInstance();
    const userId = this.session.user()?.Id;
    const groupId = this.session.groupId();
    if (!inst || !userId || !groupId) return undefined;
    return buildRequest(this.query.state(), inst, userId, groupId);
  });

  readonly list = rxResource({
    params: () => this.request(),
    stream: ({ params }) => this.api.search(params),
  });

  /** Last successful page, kept on screen (dimmed) while the next one loads. */
  readonly page = linkedSignal<Paged<FolderListItem> | undefined, Paged<FolderListItem> | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, prev) => next ?? prev?.value,
  });

  readonly rows = computed(() => this.page()?.Data ?? []);

  /** Folder preview widened over the list (remembered on this device). */
  readonly expanded = signal(storage.get('fn.expanded') === '1');

  toggleExpanded(): void {
    this.expanded.update((v) => !v);
    storage.set('fn.expanded', this.expanded() ? '1' : '0');
  }

  /** Rows ticked for a mass action. Cleared when the list changes (page, filters) or after an action. */
  readonly selection = linkedSignal<unknown, ReadonlySet<number>>({
    source: () => [this.request(), this.api.revision()],
    computation: () => new Set<number>(),
  });
  readonly selectedRows = computed(() => this.rows().filter((r) => this.selection().has(r.IdFolder)));

  toggleSelected(id: number): void {
    this.selection.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAllOnPage(): void {
    const ids = this.rows().map((r) => r.IdFolder);
    const all = ids.length > 0 && ids.every((id) => this.selection().has(id));
    this.selection.set(all ? new Set() : new Set(ids));
  }

  clearSelection(): void {
    this.selection.set(new Set());
  }
  readonly total = computed(() => this.page()?.Page.TotalElements ?? 0);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.query.state().size)));
  readonly firstLoad = computed(() => !this.page() && (this.list.isLoading() || this.instances.isLoading()));

  constructor() {
    // No folder type in the URL (or one this group cannot see): reopen the last one used in this
    // group, else the first in the sidebar. No history entry, so "back" does not bounce here.
    effect(() => {
      const list = this.activeInstances();
      const wanted = this.query.state().type;
      if (!list.length || list.some((i) => i.Id === wanted)) return;
      const last = Number(storage.get(lastTypeKey(this.session.groupId())));
      const fallback = this.typeGroups()[0]?.instances[0]?.Id ?? list[0].Id;
      const type = list.some((i) => i.Id === last) ? last : fallback;
      untracked(() => this.query.patch({ type }, { replace: true }));
    });

    // Remember the folder type per group.
    effect(() => {
      const inst = this.selectedInstance();
      if (inst) storage.set(lastTypeKey(this.session.groupId()), String(inst.Id));
    });

    // A write action happened (dialog, mass action): show fresh data, keep the current page.
    let firstRevision = true;
    effect(() => {
      this.api.revision();
      if (firstRevision) {
        firstRevision = false;
        return;
      }
      untracked(() => this.list.reload());
    });

    // Warm the next page so "Επόμενη" is instant.
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

  open(id: number): void {
    void this.router.navigate([id], { relativeTo: this.route, queryParamsHandling: 'preserve' });
  }
}
