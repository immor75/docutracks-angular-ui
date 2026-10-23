import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import {
  ActionParams,
  ConfigValues,
  Envelope,
  FolderActionRequest,
  FolderActionResponse,
  FolderTypeInstance,
  FolderTypeInstanceExtendedResponse,
  GroupPermission,
  OrgTreeNode,
  Paged,
} from './models';
import { Session } from './session';

/** Endpoints used by FolderUI for write actions (DocuLibrary `apiUrls.ts`). */
const API = {
  action: '/services/v2/folders/action/',
  assign: '/services/v2/folders/assign/',
  share: '/services/v2/folders/share/',
  changeType: '/services/v2/folders/change-type/',
  massivePrint: '/services/v2/folders/massive-print/',
  usersToAssign: '/services/v2/folders/users-to-assign',
  orgTree: '/services/organization/get-organization-tree',
  instanceExtended: '/services/v2/folders/folder-type-instance-extended/',
  availableInstances: (folderTypeId: number) => `/services/v2/folder-types/${folderTypeId}/available-instances`,
  config:
    '/services/user/GetConfigKeyValues/?Keys=EnableShareFolderToUsers&Keys=MaxCommentLength&Keys=FolderArchiveAutoCompleteComment',
} as const;

export type ActionEndpoint = 'action' | 'assign' | 'share' | 'changeType';

export interface ActionConfig {
  maxComment: number;
  shareToUsers: boolean;
  archiveAutoComment: boolean;
}

export interface PickUser {
  Id: number;
  DisplayName: string;
}

const TEN_MIN = 10 * 60_000;

/** `Success: false` with HTTP 200 is how the API reports validation errors. */
function check<T extends { Success?: boolean; ErrorInfo?: { ExceptionMessage?: string }; Message?: string }>(r: T): T {
  if (r?.Success === false) {
    const msg = (r.ErrorInfo?.ExceptionMessage || r.Message || 'Η ενέργεια απέτυχε.').trim();
    // Some server errors carry a whole workflow-engine payload; keep the message readable.
    throw new Error(msg.length > 240 ? msg.slice(0, 237) + '…' : msg);
  }
  return r;
}

export const emptyParams = (comment = '', targetGroupId = 0): ActionParams => ({
  Comment: comment,
  SelectedTargetOwningGroupId: targetGroupId,
  CustomData: [],
});

/**
 * Write side of the Folders API. Reads that only feed dialogs (org tree, users, settings)
 * are cached for ten minutes: the tree is ~100 KB and the user list ~440 KB on test-new.
 */
@Injectable({ providedIn: 'root' })
export class ActionsApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly cache = new Map<string, { at: number; value$: Observable<unknown> }>();

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

  private ids(): { UserId: number; GroupId: number } {
    return { UserId: this.session.user()?.Id ?? 0, GroupId: this.session.groupId() ?? 0 };
  }

  /** Builds the request body exactly as FolderUI's `AppFolderStateServiceCore` does. */
  body(folderId: number, actionCode: string, extra: Partial<FolderActionRequest> = {}): FolderActionRequest {
    return { ...this.ids(), FolderId: folderId, ActionCode: actionCode, ...extra };
  }

  run(endpoint: ActionEndpoint, body: FolderActionRequest): Observable<FolderActionResponse> {
    return this.http.post<FolderActionResponse>(API[endpoint], body).pipe(map(check));
  }

  /** Μαζική εκτύπωση: PDF on success, JSON `Success: false` on validation errors. */
  massivePrint(body: FolderActionRequest): Observable<Blob> {
    return this.http.post(API.massivePrint, body, { responseType: 'blob' }).pipe(
      switchMap((blob) =>
        blob.type.includes('json')
          ? from(blob.text()).pipe(map((t) => (check(JSON.parse(t) as FolderActionResponse), blob)))
          : of(blob),
      ),
      catchError((e: unknown) => {
        // Errors come back as a Blob too; surface the server's message.
        if (e instanceof HttpErrorResponse && e.error instanceof Blob) {
          return from(e.error.text()).pipe(
            map((t) => {
              let msg = '';
              try {
                msg = (JSON.parse(t) as FolderActionResponse).ErrorInfo?.ExceptionMessage ?? '';
              } catch {
                /* not JSON */
              }
              throw msg ? new Error(msg) : e;
            }),
          );
        }
        return throwError(() => e);
      }),
    );
  }

  config(): Observable<ActionConfig> {
    return this.cached('config', () =>
      this.http.get<ConfigValues>(API.config).pipe(
        map((r) => {
          const kv = r?.KeyValues ?? {};
          return {
            maxComment: Number(kv['MaxCommentLength']) || 1000,
            shareToUsers: kv['EnableShareFolderToUsers'] === 'true',
            archiveAutoComment: kv['FolderArchiveAutoCompleteComment'] === 'true',
          };
        }),
        catchError(() => of({ maxComment: 1000, shareToUsers: false, archiveAutoComment: false })),
      ),
    );
  }

  /** Organisation tree below the given groups (`[1]` = whole organisation). */
  orgTree(ids: number[]): Observable<OrgTreeNode[]> {
    return this.cached(`tree:${ids.join(',')}`, () =>
      this.http.post<OrgTreeNode[]>(API.orgTree, { Ids: ids, Codes: [] }).pipe(map((r) => (Array.isArray(r) ? r : []))),
    );
  }

  /**
   * Users who can be assigned. The endpoint returns full user records with all their
   * relations (~440 KB); only id and name are kept.
   */
  usersToAssign(): Observable<PickUser[]> {
    // FolderUI sends GroupId = 1 here (NodeCriteria.Ids[0]); kept the same.
    const body = { UserId: this.session.user()?.Id ?? 0, GroupId: 1 };
    return this.cached('assignees', () =>
      this.http.post<Envelope<Paged<PickUser>>>(API.usersToAssign, body).pipe(
        map((r) => check(r).Payload?.Data?.map((u) => ({ Id: u.Id, DisplayName: u.DisplayName })) ?? []),
      ),
    );
  }

  /** Groups that own or edit this folder type: the only valid targets for "Αποστολή". */
  sendTargets(folderTypeInstanceId: number): Observable<GroupPermission[]> {
    return this.cached(`ext:${this.session.groupId()}:${folderTypeInstanceId}`, () =>
      this.http
        .post<FolderTypeInstanceExtendedResponse>(API.instanceExtended, {
          ...this.ids(),
          FolderTypeInstanceId: folderTypeInstanceId,
        })
        .pipe(
          map(check),
          map((r) =>
            (r.FolderTypeInstanceExtendedDto?.OrgGroupPermissions ?? []).filter(
              (p) => p.Permission === 'Owner' || p.Permission === 'Editor',
            ),
          ),
        ),
    );
  }

  /** Instances a folder can be moved to with "Αλλαγή τύπου". */
  availableInstances(folderTypeId: number): Observable<FolderTypeInstance[]> {
    return this.cached(`avail:${this.session.groupId()}:${folderTypeId}`, () =>
      this.http
        .post<Envelope<Paged<FolderTypeInstance>>>(API.availableInstances(folderTypeId), this.ids())
        .pipe(map((r) => check(r).Payload?.Data ?? [])),
    );
  }
}
