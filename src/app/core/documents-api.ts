import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { TtlCache, readSession, unwrap, writeSession } from './api-util';
import { DocumentFiltersPayload, SearchDocumentsPayload, SearchDocumentsRequest } from './documents-models';
import { Envelope } from './models';

const API = {
  filters: '/services/v2/documents/filters',
  search: '/services/v2/documents/search',
} as const;

/** Background calls (prefetch) must never surface errors. */
const ignore = (): void => undefined;

/** Calls of the documents API v2, with the same caching as the folders API. */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly lists = new TtlCache(60_000);
  private readonly static = new TtlCache(10 * 60_000, 20);

  /** Bumped after every write, so lists reload (see FoldersApi.revision). */
  readonly revision = signal(0);

  /**
   * Sidebar, search types, columns and periods of a group. They change rarely, so a reload
   * reads them from sessionStorage (10 minutes) and goes straight to the list call.
   */
  filters(userId: number, groupId: number): Observable<DocumentFiltersPayload> {
    const key = `dn.filters.${userId}.${groupId}`;
    const saved = readSession<{ at: number; data: DocumentFiltersPayload }>(key);
    if (saved && Date.now() - saved.at < 10 * 60_000) return of(saved.data);
    return this.static.get(`filters:${groupId}`, () =>
      this.http.get<Envelope<DocumentFiltersPayload>>(API.filters, { params: { GroupId: groupId } }).pipe(
        map(unwrap),
        tap((data) => writeSession(key, { at: Date.now(), data })),
      ),
    );
  }

  search(req: SearchDocumentsRequest): Observable<SearchDocumentsPayload> {
    return this.lists.get(JSON.stringify(req), () =>
      this.http.post<Envelope<SearchDocumentsPayload>>(API.search, req).pipe(map(unwrap)),
    );
  }

  /** Warms the cache, e.g. for the next page. */
  prefetchSearch(req: SearchDocumentsRequest): void {
    this.search(req).subscribe({ error: ignore });
  }

  invalidate(): void {
    this.lists.clear();
  }

  changed(): void {
    this.invalidate();
    this.revision.update((n) => n + 1);
  }
}
