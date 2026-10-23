import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { TtlCache, unwrap } from './api-util';
import { DocumentsApi } from './documents-api';
import {
  FormioSchema,
  KindNode,
  NewTypesPayload,
  RegisterForm,
  RegisterPayload,
  RegisterRequest,
  SignatureChainPayload,
  SignatureChainRequest,
  UploadedFile,
} from './documents-models';
import { Envelope } from './models';

const API = {
  newTypes: '/services/v2/documents/new-types',
  form: '/services/v2/documents/register-form',
  kinds: '/services/v2/documents/kinds',
  kindForm: (id: number) => `/services/v2/documents/kinds/${id}/form`,
  metadataForm: (code: string) => `/services/v2/documents/metadata-classes/${encodeURIComponent(code)}/form`,
  files: '/services/v2/documents/files',
  register: '/services/v2/documents/register',
  signatureChain: '/services/v2/documents/signature-chain',
} as const;

/** Calls of «Νέο έγγραφο» (phase 8). Forms and kinds change rarely: cached for 10 minutes. */
@Injectable({ providedIn: 'root' })
export class RegisterApi {
  private readonly http = inject(HttpClient);
  private readonly documents = inject(DocumentsApi);
  private readonly cache = new TtlCache(10 * 60_000, 40);

  newTypes(groupId: number): Observable<NewTypesPayload> {
    return this.cache.get(`types:${groupId}`, () =>
      this.http.get<Envelope<NewTypesPayload>>(API.newTypes, { params: { GroupId: groupId } }).pipe(map(unwrap)),
    );
  }

  form(groupId: number, newType: number, old: boolean): Observable<RegisterForm> {
    return this.cache.get(`form:${groupId}:${newType}:${old}`, () =>
      this.http
        .get<Envelope<RegisterForm>>(API.form, { params: { GroupId: groupId, NewType: newType, Old: old } })
        .pipe(map(unwrap)),
    );
  }

  kinds(groupId: number, documentType: number): Observable<KindNode[]> {
    return this.cache.get(`kinds:${groupId}:${documentType}`, () =>
      this.http
        .get<Envelope<KindNode[]>>(API.kinds, { params: { GroupId: groupId, Type: documentType } })
        .pipe(map(unwrap)),
    );
  }

  kindForm(kindId: number): Observable<FormioSchema> {
    return this.cache.get(`kindform:${kindId}`, () =>
      this.http.get<Envelope<FormioSchema>>(API.kindForm(kindId)).pipe(map(unwrap)),
    );
  }

  metadataForm(code: string): Observable<FormioSchema> {
    return this.cache.get(`meta:${code}`, () =>
      this.http.get<Envelope<FormioSchema>>(API.metadataForm(code)).pipe(map(unwrap)),
    );
  }

  /** Uploads one file to the temporary store; reports progress through the observable's events. */
  upload(groupId: number, file: File): Observable<UploadedFile> {
    const body = new FormData();
    body.append('GroupId', String(groupId));
    body.append('File', file, file.name);
    return this.http.post<Envelope<UploadedFile>>(API.files, body).pipe(map(unwrap));
  }

  /** The signatures a draft will get, for the chosen final signers (preview while typing). */
  signatureChain(req: SignatureChainRequest): Observable<SignatureChainPayload> {
    return this.http.post<Envelope<SignatureChainPayload>>(API.signatureChain, req).pipe(map(unwrap));
  }

  register(req: RegisterRequest): Observable<RegisterPayload> {
    return this.http.post<Envelope<RegisterPayload>>(API.register, req).pipe(
      map(unwrap),
      tap((r) => {
        if (r.DocumentId) this.documents.changed();
      }),
    );
  }
}
