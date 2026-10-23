import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import {
  Envelope,
  FolderActionsResponse,
  FolderGetResponse,
  FolderListItem,
  FolderModule,
  FolderTypeInstance,
  Paged,
  SearchFoldersRequest,
  UiAction,
} from './models';
import { TtlCache, readSession, unwrap, writeSession } from './api-util';

const API = {
  instances: '/services/v2/folders/filters-folder-type-instances/',
  search: '/services/v2/folders/simple-search/',
  actions: '/services/v2/folders/actions/',
  folder: '/services/folder/',
} as const;

/** Background calls (prefetch, logout) must never surface errors. */
const ignore = (): void => undefined;

@Injectable({ providedIn: 'root' })
export class FoldersApi {
  private readonly http = inject(HttpClient);
  private readonly lists = new TtlCache(60_000);
  private readonly folders = new TtlCache(60_000);
  private readonly static = new TtlCache(10 * 60_000, 20);

  /**
   * Bumped after every write. Resources that show server data read it in their params,
   * so a successful action reloads the list and the open folder without manual wiring.
   */
  readonly revision = signal(0);

  /** Folder types (instances) the group can see. */
  instances(userId: number, groupId: number): Observable<FolderTypeInstance[]> {
    // Folder types change rarely. Keeping them in sessionStorage for 10 minutes lets a reload
    // go straight to the list call instead of waiting for this one first.
    const key = `fn.inst.${userId}.${groupId}`;
    const saved = readSession<{ at: number; data: FolderTypeInstance[] }>(key);
    if (saved && Date.now() - saved.at < 10 * 60_000) return of(saved.data);
    const body = { UserId: userId, GroupId: groupId };
    return this.static.get(`inst:${groupId}`, () =>
      this.http.post<Envelope<Paged<FolderTypeInstance>>>(API.instances, body).pipe(
        map((r) => unwrap(r).Data ?? []),
        tap((data) => writeSession(key, { at: Date.now(), data })),
      ),
    );
  }

  search(req: SearchFoldersRequest): Observable<Paged<FolderListItem>> {
    return this.lists.get(JSON.stringify(req), () =>
      this.http.post<Envelope<Paged<FolderListItem>>>(API.search, req).pipe(map(unwrap)),
    );
  }

  /** Warms the cache, e.g. for the next page. Errors are ignored. */
  prefetchSearch(req: SearchFoldersRequest): void {
    this.search(req).subscribe({ error: ignore });
  }

  folder(id: number): Observable<FolderModule> {
    return this.folders.get(`f:${id}`, () =>
      this.http.get<FolderGetResponse>(API.folder, { params: { FolderId: id } }).pipe(
        map((r) => {
          if (!r?.Folder) throw new Error(r?.ErrorInfo?.ExceptionMessage || 'Η υπόθεση δεν βρέθηκε.');
          return r.Folder;
        }),
      ),
    );
  }

  prefetchFolder(id: number): void {
    this.folder(id).subscribe({ error: ignore });
  }

  actions(userId: number, groupId: number, folderId: number): Observable<UiAction[]> {
    const body = { UserId: userId, GroupId: groupId, FolderIds: [folderId], ActionCodes: [] as string[] };
    return this.folders.get(`a:${groupId}:${folderId}`, () =>
      this.http.post<FolderActionsResponse>(API.actions, body).pipe(
        map((r) => (r.FoldersActions?.[0]?.Actions ?? []).filter((a) => a.UiActionIsVisible)),
      ),
    );
  }

  /**
   * Actions for several folders in one call, used by mass actions. Returns, per folder,
   * the codes it can execute now.
   */
  actionsFor(userId: number, groupId: number, folderIds: number[]): Observable<Map<number, UiAction[]>> {
    const body = { UserId: userId, GroupId: groupId, FolderIds: folderIds, ActionCodes: [] as string[] };
    return this.http.post<FolderActionsResponse>(API.actions, body).pipe(
      map((r) => {
        if (r?.Success === false) throw new Error('Οι ενέργειες δεν φορτώθηκαν.');
        const out = new Map<number, UiAction[]>();
        for (const f of r.FoldersActions ?? []) out.set(f.FolderId, f.Actions.filter((a) => a.UiActionIsVisible));
        return out;
      }),
    );
  }

  /** Drops cached lists and folders, e.g. on manual refresh. */
  invalidate(): void {
    this.lists.clear();
    this.folders.clear();
  }

  /** After a write: drop caches and tell resources to reload. */
  changed(): void {
    this.invalidate();
    this.revision.update((n) => n + 1);
  }
}
