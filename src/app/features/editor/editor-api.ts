import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, throwError } from 'rxjs';
import { Envelope, Paged } from '../../core/models';
import { Session } from '../../core/session';
import {
  ContactSearchHit,
  DocumentForRelation,
  FolderEdit,
  FolderTypeInstanceExtended,
  Place,
  RelatedFolderHit,
  SENT_FIELDS,
} from './editor-models';

const API = {
  register: '/services/v2/folders/register/',
  edit: '/services/v2/folders/edit/',
  typeExtended: '/services/v2/folders/folder-type-instance-extended/',
  contacts: '/services/v2/folders/contact/search',
  documents: '/services/v2/folders/documents-for-relation/',
  related: '/services/v2/folders/related-folders/',
  fileStream: '/services/folders/get-file-stream',
  locations: (type: number, parent?: string) =>
    `/services/location/list/${type}${parent ? '/' + encodeURIComponent(parent) : ''}`,
} as const;

interface WithError { Success?: boolean; ErrorInfo?: { ExceptionMessage?: string }; Message?: string }

function check<T extends WithError>(r: T, fallback = 'Η αποθήκευση απέτυχε.'): T {
  if (r?.Success === false) {
    const msg = (r.ErrorInfo?.ExceptionMessage || r.Message || fallback).trim();
    throw new Error(msg.length > 300 ? msg.slice(0, 297) + '…' : msg);
  }
  return r;
}

export interface SaveResult {
  folderId: number;
  caseNumber?: string;
}

export interface PageOf<T> {
  rows: T[];
  total: number;
}

const TEN_MIN = 10 * 60_000;

@Injectable({ providedIn: 'root' })
export class EditorApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly cache = new Map<string, { at: number; value$: Observable<unknown> }>();

  private ids(): { UserId: number; GroupId: number } {
    return { UserId: this.session.user()?.Id ?? 0, GroupId: this.session.groupId() ?? 0 };
  }

  private cached<T>(key: string, load: () => Observable<T>): Observable<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TEN_MIN) return hit.value$ as Observable<T>;
    const value$ = load().pipe(
      catchError((e: unknown) => {
        this.cache.delete(key);
        return throwError(() => e);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.cache.set(key, { at: Date.now(), value$ });
    return value$;
  }

  /** Tabs, Formio inputs, roles, kinds and relation types of a folder type instance. */
  typeExtended(instanceId: number): Observable<FolderTypeInstanceExtended> {
    return this.cached(`ext:${this.session.groupId()}:${instanceId}`, () =>
      this.http
        .post<{ Success?: boolean; FolderTypeInstanceExtendedDto?: FolderTypeInstanceExtended; ErrorInfo?: { ExceptionMessage?: string } }>(
          API.typeExtended,
          { ...this.ids(), FolderTypeInstanceId: instanceId },
        )
        .pipe(map((r) => check(r, 'Το είδος υπόθεσης δεν φορτώθηκε.').FolderTypeInstanceExtendedDto ?? {})),
    );
  }

  /** Keeps the fields FolderUI sends (its FolderModuleTemplate), plus energies when edited. */
  private outgoing(folder: FolderEdit, withEnergies: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of SENT_FIELDS) if (k in folder) out[k] = folder[k];
    if (withEnergies) out['FolderEnergies'] = folder.FolderEnergies;
    // Client-only helpers never leave the browser.
    out['FolderFiles'] = (folder.FolderFiles ?? []).map(({ _size, ...f }) => (void _size, f));
    return out;
  }

  /** POST /v2/folders/register/ (Postman "Register Folder"). */
  register(folder: FolderEdit): Observable<SaveResult> {
    const body = { ...this.ids(), ActionCode: 'FoldersModule_UiNew', FolderId: 0, Folder: this.outgoing(folder, false) };
    return this.http
      .post<WithError & { Folder?: { IdFolder: number; CaseNumber?: string } }>(API.register, body)
      .pipe(
        map((r) => check(r)),
        map((r) => {
          if (!r.Folder?.IdFolder) throw new Error('Ο server δεν επέστρεψε τη νέα υπόθεση.');
          return { folderId: r.Folder.IdFolder, caseNumber: r.Folder.CaseNumber };
        }),
      );
  }

  /** POST /v2/folders/edit/ (Postman "Edit Folder"). */
  edit(folder: FolderEdit, energiesChanged: boolean): Observable<SaveResult> {
    const body = {
      ...this.ids(),
      ActionCode: 'FoldersModule_UiEdit',
      FolderId: folder.IdFolder,
      Folder: this.outgoing(folder, energiesChanged),
    };
    return this.http
      .post<WithError & { FolderId?: number; Folder?: { IdFolder: number }; DocumentInfo?: { CaseNumber?: string } }>(API.edit, body)
      .pipe(
        map((r) => check(r)),
        map((r) => ({ folderId: r.Folder?.IdFolder ?? r.FolderId ?? folder.IdFolder, caseNumber: r.DocumentInfo?.CaseNumber })),
      );
  }

  /** Περιφέρειες (1), νομοί (2), δήμοι (3), κοινότητες (4); children are found by the parent's name. */
  places(type: 1 | 2 | 3 | 4, parent?: string): Observable<Place[]> {
    if (type > 1 && !parent) return of([]);
    const key = ['Periferies', 'Nomoi', 'Dimoi', 'Koinotites'][type - 1];
    return this.cached(`loc:${type}:${parent ?? ''}`, () =>
      this.http
        .post<Record<string, Place[]>>(API.locations(type, parent), { LocationType: type, ParentLocationName: parent })
        .pipe(map((r) => (r?.[key] ?? []).map((p) => ({ Id: p.Id, Onomasia: p.Onomasia })))),
    );
  }

  /** Εξωτερικές επαφές (ContactTableSelectComponent criteria). */
  contacts(term: string, page = 1, size = 20): Observable<PageOf<ContactSearchHit>> {
    const body = {
      ...this.ids(),
      PageNumber: page,
      PageSize: size,
      Criteria: {
        IsExact: false,
        CheckDuplicates: false,
        SearchTerm: term,
        IsActive: true,
        IsDeleted: false,
        SearchType: 'All',
        ContactDoy: '',
        ContactTypeCode: '',
        IncludeGlobals: true,
        OwnerGroupIds: [],
      },
    };
    return this.http
      .post<Envelope<Paged<ContactSearchHit>>>(API.contacts, body)
      .pipe(map((r) => toPage(check(r, 'Η αναζήτηση επαφών απέτυχε.'))));
  }

  /** Έγγραφα ΣΗΔΕ για συσχέτιση. FolderUI sends GroupId 2 here; we send the current group. */
  documents(term: string, page = 1, size = 20): Observable<PageOf<DocumentForRelation>> {
    const body = {
      ...this.ids(),
      PageNumber: page,
      PageSize: size,
      Criteria: { Search: term },
      OrderBy: [{ Column: 'IssueDate', Direction: 'desc' }],
    };
    return this.http
      .post<Envelope<Paged<DocumentForRelation>>>(API.documents, body)
      .pipe(map((r) => toPage(check(r, 'Η αναζήτηση εγγράφων απέτυχε.'))));
  }

  /** Υποθέσεις που μπορούν να συνδεθούν με τον τύπο σχέσης. */
  relatedFolders(relationTypeId: number, currentFolderId: number, term: string, page = 1, size = 20): Observable<PageOf<RelatedFolderHit>> {
    const body = {
      ...this.ids(),
      PageNumber: page,
      PageSize: size,
      FolderRelatedCriteria: { CurrentFolderId: currentFolderId, FolderRelationId: relationTypeId, Search: term, FilterBy: [1, 2] },
    };
    return this.http
      .post<Envelope<Paged<RelatedFolderHit>>>(API.related, body)
      .pipe(map((r) => toPage(check(r, 'Η αναζήτηση υποθέσεων απέτυχε.'))));
  }

  /** Κατέβασμα συνημμένου αρχείου υπόθεσης. */
  file(folderId: number, fileId: number): Observable<Blob> {
    return this.http.post(API.fileStream, { ...this.ids(), IdFolderFile: fileId, FolderId: folderId }, { responseType: 'blob' });
  }
}

function toPage<T>(r: Envelope<Paged<T>>): PageOf<T> {
  return { rows: r.Payload?.Data ?? [], total: r.Payload?.Page?.TotalElements ?? 0 };
}
