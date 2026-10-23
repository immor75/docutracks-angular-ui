import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { TtlCache, readSession, unwrap, writeSession } from './api-util';
import {
  DocumentAction,
  DocumentActionsPayload,
  DocumentFiltersPayload,
  DocumentFlagsPayload,
  DocumentFlagsRequest,
  DocumentHistoryEntry,
  DocumentView,
  ExportDocumentsPayload,
  ExportDocumentsRequest,
  SearchDocumentsPayload,
  SearchDocumentsRequest,
} from './documents-models';
import { Envelope } from './models';

const API = {
  filters: '/services/v2/documents/filters',
  search: '/services/v2/documents/search',
  one: (id: number) => `/services/v2/documents/${id}`,
  history: (id: number) => `/services/v2/documents/${id}/history`,
  actions: '/services/v2/documents/actions',
  flags: '/services/v2/documents/flags',
  export: '/services/v2/documents/export',
  zip: (id: number) => `/services/v2/documents/${id}/files`,
  /** Existing endpoint (FileGetPdfBySingleFileId). */
  file: (fileId: number) => `/services/file/get/${fileId}`,
} as const;

/** Background calls (prefetch) must never surface errors. */
const ignore = (): void => undefined;

/** Calls of the documents API v2, with the same caching as the folders API. */
@Injectable({ providedIn: 'root' })
export class DocumentsApi {
  private readonly http = inject(HttpClient);
  private readonly lists = new TtlCache(60_000);
  private readonly static = new TtlCache(10 * 60_000, 20);
  private readonly docs = new TtlCache(60_000);

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

  /** The document view (UIViewDoc). No side effect: safe to prefetch. */
  document(groupId: number, id: number): Observable<DocumentView> {
    return this.docs.get(`d:${groupId}:${id}`, () =>
      this.http.get<Envelope<DocumentView>>(API.one(id), { params: { GroupId: groupId } }).pipe(map(unwrap)),
    );
  }

  /** Warms the cache on hover/focus, so opening is instant. */
  prefetchDocument(groupId: number, id: number): void {
    this.document(groupId, id).subscribe({ error: ignore });
  }

  history(groupId: number, id: number): Observable<DocumentHistoryEntry[]> {
    return this.docs.get(`h:${groupId}:${id}`, () =>
      this.http.get<Envelope<DocumentHistoryEntry[]>>(API.history(id), { params: { GroupId: groupId } }).pipe(map(unwrap)),
    );
  }

  /** Actions of one document, with the reason when one cannot run. */
  actions(groupId: number, id: number): Observable<DocumentAction[]> {
    return this.docs.get(`a:${groupId}:${id}`, () =>
      this.http
        .post<Envelope<DocumentActionsPayload>>(API.actions, { GroupId: groupId, DocumentIds: [id] })
        .pipe(map((r) => unwrap(r).Documents.find((d) => d.DocumentId === id)?.Actions ?? [])),
    );
  }

  /** Αναγνωσμένο / σημαντικό for the current user. */
  flags(req: DocumentFlagsRequest): Observable<DocumentFlagsPayload> {
    return this.http.post<Envelope<DocumentFlagsPayload>>(API.flags, req).pipe(
      map(unwrap),
      tap(() => this.docs.clear()), // cached views still carry the old marks
    );
  }

  /** Queues an Excel export; the server sends the user a link when it is ready. */
  export(req: ExportDocumentsRequest): Observable<ExportDocumentsPayload> {
    return this.http.post<Envelope<ExportDocumentsPayload>>(API.export, req).pipe(map(unwrap));
  }

  /** All files of a document the user may see, in one ZIP (DocumentDownloadFilesAction). */
  zip(groupId: number, id: number): Observable<Blob> {
    return this.http.get(API.zip(id), { params: { GroupId: groupId }, responseType: 'blob' });
  }

  /** A file as a Blob (the request needs the Authorization header, so no plain <a href>). */
  file(fileId: number): Observable<Blob> {
    return this.http.get(API.file(fileId), { responseType: 'blob' });
  }

  /** Drops cached list pages only (e.g. after marking a document as read). */
  invalidateLists(): void {
    this.lists.clear();
  }

  invalidate(): void {
    this.lists.clear();
    this.docs.clear();
  }

  changed(): void {
    this.invalidate();
    this.revision.update((n) => n + 1);
  }
}
