/**
 * Contracts of the documents API v2 (`/services/v2/documents/*`).
 *
 * The backend does not exist yet: these types are the agreement. The mock (mock/documents.mjs)
 * implements them first and docs/documents-api.md describes them for the backend, with the
 * Razor code each one replaces. Envelope, Page and Paged are the same as in the folders API.
 */
import { Paged } from './models';

/** Common.Constants.DocumentType. */
export const DOCUMENT_TYPES = {
  1: 'Εισερχόμενο',
  2: 'Εξερχόμενο',
  3: 'Σχέδιο',
  4: 'Υποστηρικτικό',
} as const;
export type DocumentTypeId = keyof typeof DOCUMENT_TYPES;

/**
 * Columns of the list, named as in the `HideDocumentCatalogColumns` /
 * `DocumentCatalogColumnsWidth` settings of the Razor list (Views/List/Index.cshtml).
 */
export type DocumentColumnKey =
  | 'SerialNumber'
  | 'IssueDate'
  | 'LastSignDate'
  | 'ProtocolNum'
  | 'ProtocolDate'
  | 'DocumentIdentifier'
  | 'Subject'
  | 'ArPrApostolea'
  | 'Apostoleas'
  | 'EureiasXrisisKind'
  | 'SignaturesStatus'
  | 'Recipients'
  | 'CopyStatus'
  | 'NextEntityToSign'
  | 'DocumentKind'
  | 'Assignees'
  | 'Folder'
  | 'Endiaferomenos'
  | 'Register';

/* ---------- GET filters ---------- */

/**
 * A place in the sidebar (Κύρια, Εισερχόμενα › Εκκρεμή, …). `Key` is opaque to the client:
 * the server encodes in it what the Razor list sends as FilterDocTypes, SelectedFolderType.Id,
 * GroupVisibility and flags such as SentFromKside. A node with children is a section; when it
 * also has a Key, the section itself is selectable (all documents of that type).
 */
export interface DocumentFolder {
  Key?: string;
  Label: string;
  Children?: DocumentFolder[];
}

export interface DocumentColumn {
  Key: DocumentColumnKey;
  Label: string;
  /** Width in px from DocumentCatalogColumnsWidth; a hint, the table may shrink it. */
  Width?: number;
  /** The server can order by this column. */
  Sortable?: boolean;
}

export interface Option {
  Id: number;
  Label: string;
}

/** How a filter is edited and what its value looks like in `SearchDocumentsRequest.Criteria`. */
export type FilterKind =
  | 'options' // number[]: ids from Options (checkboxes, or radio buttons when Single)
  | 'users' // number[]: user ids, picked from the organisation tree
  | 'groups' // number[]: group ids, picked from the organisation tree
  | 'dates' // { From, To }: yyyy-mm-dd, either may be null
  | 'text'; // string

export interface FilterOption extends Option {
  /** Indentation in a tree (kinds, categories, thematic folders). */
  Depth?: number;
}

/**
 * One criterion of «Φίλτρα». The server sends only those that apply to the user and the
 * installation (modules, settings), so the panel is built from data, not hard-coded.
 */
export interface FilterDef {
  /** Stable name, also the request key: Status, Kinds, Signator, SendDate, … */
  Key: string;
  Label: string;
  /** Heading the filter is grouped under in the panel. */
  Group: string;
  Kind: FilterKind;
  Options?: FilterOption[];
  /** One choice only (radio buttons). */
  Single?: boolean;
}

export type FilterValue = number[] | string | { From?: string | null; To?: string | null };

export interface DocumentFiltersPayload {
  /** Only the folders this user may see in this group (roles, settings). */
  Folders: DocumentFolder[];
  DefaultFolderKey: string;
  /** Search types (SearchConstants.SEARCHTYPE_*), filtered by settings. */
  SearchTypes: Option[];
  DefaultSearchType: number;
  /** Every column the catalog may show, minus those hidden by HideDocumentCatalogColumns. */
  Columns: DocumentColumn[];
  /** Predefined issue-date ranges (Common.Constants.DateRanges); 0 = custom from/to. */
  Periods: Option[];
  DefaultPeriod: number;
  /** Server default ordering. */
  DefaultSort: DocumentSort;
  /** Criteria of «Φίλτρα» (phase 3). */
  Filters: FilterDef[];
}

/* ---------- POST search ---------- */

export interface DocumentSort {
  Column: DocumentColumnKey;
  Direction: 'asc' | 'desc';
}

export interface SearchDocumentsRequest {
  GroupId: number;
  FolderKey: string;
  /** Omitted or empty text: no search. */
  Search?: { Text: string; Type: number } | null;
  /** Issue date (ημ. δημιουργίας αντιγράφου). Range 0 uses From/To (yyyy-mm-dd, inclusive). */
  Period: { Range: number; From?: string | null; To?: string | null };
  Sort: DocumentSort;
  /** Active filters by FilterDef.Key; empty values are left out. */
  Criteria?: Record<string, FilterValue>;
  PageNumber: number;
  PageSize: number;
}

/** One row of the catalog: one document copy of the current group. */
export interface DocumentRow {
  /** IdDocument, shown as Α/Α. */
  Id: number;
  IdDocumentCopy: number;
  Type: DocumentTypeId;
  Title: string;
  /** Copy creation date (Ημ. Δημ/ας), ISO 8601. */
  IssueDate: string;
  LastSignatureDate?: string | null;
  /** Protocol text, with the alternative protocol name already appended when there is one. */
  ProtocolText?: string | null;
  ProtocolDate?: string | null;
  SenderProtocol?: string | null;
  Sender?: string | null;
  /** Recipients, plain text (the Razor list renders HTML here). */
  Recipients?: string | null;
  /** Υποείδος (EuriasXrisisKind). */
  SubKind?: string | null;
  /** Copy status label (Δημιουργήθηκε, Χρεώθηκε, …). */
  Status: string;
  /** Archived, returned, answered: the Razor list greys these rows (finalstatus). */
  IsFinal: boolean;
  SignaturesStatus?: string | null;
  NextToSign?: string | null;
  Kind?: string | null;
  Assignees?: string | null;
  Folders?: string | null;
  Endiaferomenos?: string | null;
  CreatedBy?: string | null;
  /** Not yet opened by anyone in the group (bold row). */
  IsUnread: boolean;
  /** Opened by the current user (envelope icon). */
  IsReadByUser: boolean;
  IsImportant: boolean;
  IsUrgent: boolean;
  HasComments: boolean;
  /** Διατήρηση έως (DiatirisiEos). */
  KeepUntil?: string | null;
}

export interface SearchDocumentsPayload extends Paged<DocumentRow> {
  /** Columns that apply to this folder, in display order (e.g. Αποδέκτες only for εξερχόμενα). */
  Columns: DocumentColumnKey[];
  /** The issue-date range actually applied, for the header ("23/10/2025 – 23/10/2026"). */
  Period: { From: string | null; To: string };
}
