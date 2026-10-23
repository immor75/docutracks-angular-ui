/**
 * Contracts of the documents API v2 (`/services/v2/documents/*`).
 *
 * The backend does not exist yet: these types are the agreement. The mock (mock/documents.mjs)
 * implements them first and docs/documents-api.md describes them for the backend, with the
 * Razor code each one replaces. Envelope, Page and Paged are the same as in the folders API.
 */
import { OrgTreeNode, Paged } from './models';

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
  /** Export with the documents' files (ExportDocumentsExtended, administrators only). */
  CanExportWithFiles?: boolean;
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

/* ---------- GET {id}: the document view (phase 4) ---------- */

export interface DocumentFile {
  /** Id for `/services/file/get/{fileId}` (FileGetPdfBySingleFileId). */
  Id: number;
  Name: string;
  /** Bytes, when known. */
  Size?: number | null;
  /** Κύριο αρχείο, συνημμένο, εσωτερικό συνημμένο, συνημμένο υπογράφοντα (UIViewDoc). */
  Role: 'main' | 'attachment' | 'internal' | 'signer';
  /** Shown inline (PDF); other files are only downloaded. */
  IsPdf: boolean;
  IsSigned?: boolean;
}

export interface DocumentRecipient {
  Name: string;
  /** Εσωτερικός (υπηρεσία) ή εξωτερικός (επαφή) αποδέκτης. */
  Internal: boolean;
  /** Κοινοποίηση. */
  Cc?: boolean;
}

export interface DocumentSignature {
  Name: string;
  Group?: string | null;
  /** Null while pending. */
  SignedAt?: string | null;
  Role?: string | null;
}

/** One copy of the document (Κατάσταση Αντιγράφων Εγγράφου, `/document/copy/view`). */
export interface DocumentCopyRow {
  Id: number;
  CreatedAt: string;
  CreatedByGroup: string;
  OwnerGroup: string;
  AssignedTo?: string | null;
  Status: string;
  ProtocolText?: string | null;
}

export interface RelatedDocument {
  Id: number;
  Title: string;
  Type: DocumentTypeId;
  ProtocolText?: string | null;
  Date?: string | null;
  /** «Απάντηση σε», «Σχετικό», … */
  Relation: string;
  /** False when the user cannot open it (no copy in their groups). */
  CanOpen: boolean;
}

export interface DocumentInFolder {
  Id: number;
  Name: string;
  CaseNumber?: string | null;
}

/**
 * What UIViewDoc shows, in one call. Reading it has no side effect (it is prefetched on hover);
 * the client marks the document as read with `POST flags` when the view actually opens, as
 * `UiViewDoc` does with MarkDocumentAsRead.
 */
export interface DocumentView {
  Id: number;
  IdDocumentCopy: number;
  Type: DocumentTypeId;
  Title: string;
  Kind?: string | null;
  SubKind?: string | null;
  Status: string;
  IsFinal: boolean;
  IssueDate: string;
  ProtocolText?: string | null;
  ProtocolDate?: string | null;
  /** Βιβλίο Πρωτοκόλλησης. */
  ProtocolBook?: string | null;
  SenderProtocol?: string | null;
  Sender?: string | null;
  SendDate?: string | null;
  Recipients: DocumentRecipient[];
  Priority?: string | null;
  Classification?: string | null;
  ContainsPersonalData?: boolean;
  DecisionNumber?: string | null;
  Ada?: string | null;
  Comments?: string | null;
  CreatedBy?: string | null;
  CreatedForGroup?: string | null;
  Author?: string | null;
  Endiaferomenos?: string | null;
  KeepUntil?: string | null;
  Categories: string[];
  ThematicFolders: string[];
  Files: DocumentFile[];
  Signatures: DocumentSignature[];
  Copies: DocumentCopyRow[];
  Related: RelatedDocument[];
  Folders: DocumentInFolder[];
  IsImportant: boolean;
  IsUrgent: boolean;
}

/* ---------- GET {id}/history ---------- */

/** One line of «Ιστορικό» (UIViewHist): actions on the document and its copies, with comments. */
export interface DocumentHistoryEntry {
  At: string;
  Action: string;
  User?: string | null;
  Group?: string | null;
  /** Παραλήπτης της κίνησης (υπηρεσία ή χρήστης). */
  Target?: string | null;
  Comment?: string | null;
}

/* ---------- POST flags (opened in phase 4, toggled by the user in phase 5) ---------- */

/** Per-user marks: αναγνωσμένο, σημαντικό (UpdateDocumentReadyStatus, UpdateDocumentImportance). */
export interface DocumentFlagsRequest {
  GroupId: number;
  DocumentIds: number[];
  IsRead?: boolean;
  IsImportant?: boolean;
}

export interface DocumentFlagsPayload {
  /** Documents that changed; ids without a copy in the group are left out. */
  Updated: number[];
}

/* ---------- POST export (phase 5) ---------- */

/**
 * Excel export, as List/RequestDocumentExport: the server queues a job (Gateway
 * DocumentsExcelExportRequest) and later sends the user a link. Either the selected documents
 * or everything the list query matches (no paging).
 */
export interface ExportDocumentsRequest {
  GroupId: number;
  /** Selected documents; when set, `Query` is ignored. */
  DocumentIds?: number[];
  Query?: Omit<SearchDocumentsRequest, 'GroupId' | 'PageNumber' | 'PageSize'>;
  /** Also the documents' files (DocumentsWithFilesExcelExportRequest); needs CanExportWithFiles. */
  WithFiles?: boolean;
}

export interface ExportDocumentsPayload {
  /** Documents in the export job. */
  Count: number;
}

/* ---------- POST actions ---------- */

/**
 * An action of the document for the current user and group, as UIActionsHelper builds the
 * buttons of UIViewDoc: every UIAction of the view, with the result of CanExecute.
 */
export interface DocumentAction {
  /** UIAction.Code: UiArchive, UiAssign, UiSend, … (the same codes `/document/action` runs). */
  Code: string;
  Name: string;
  Enabled: boolean;
  /** Why it is disabled (the CanExecute exception message), shown to the user. */
  Reason?: string | null;
  /** Available as a mass action from the list (UiMassiveDoc). */
  Mass?: boolean;
}

export interface DocumentActionsRequest {
  GroupId: number;
  DocumentIds: number[];
}

export interface DocumentActionsPayload {
  Documents: { DocumentId: number; Actions: DocumentAction[] }[];
}

/* ---------- GET action-data/{code} (phase 6) ---------- */

/**
 * The form of an action, built by the server from what the Razor view of the action
 * (`UiActions/UiViewDoc/{Code}.cshtml`) decides today: texts, warnings, settings (config
 * keys), conditions (e.g. which «Επιστροφή» applies) and the people or groups allowed.
 * The client only renders it, so a setting or a condition changes in one place.
 */
export interface ActionForm {
  Code: string;
  /** Dialog title (Resources.Global.Archiving, …). */
  Title: string;
  /** The question of the view (ArchiveMsg, …). */
  Message?: string | null;
  /** Shown above the form (ArchiveMsgNotSent, DocumentAlreadyAssignedTo, …). */
  Warnings?: string[];
  /** Label of the submit button. */
  Submit: string;
  /** Irreversible (Διαγραφή): red button. */
  Danger?: boolean;
  Fields: ActionField[];
  /**
   * The action needs something this UI does not do yet (file upload, e-mail to external
   * recipients, …): the client says why and opens the classic UI instead.
   */
  Classic?: string | null;
}

export type ActionField = CommentField | SelectField | CheckboxField | PeopleField | ThematicFoldersField;

interface FieldBase {
  /** Key of the value in `POST action` → `Values`. */
  Key: string;
  Label: string;
  Required?: boolean;
  /** Message when a required field is empty (CancelInvalidComment, ErrorFolderEmpty, …). */
  RequiredMessage?: string | null;
  Hint?: string | null;
}

export interface CommentField extends FieldBase {
  Kind: 'comment';
  MaxLength: number;
  Value?: string | null;
}

export interface SelectField extends FieldBase {
  Kind: 'select';
  Options: { Id: number; Label: string; Disabled?: boolean; Reason?: string | null }[];
  Value?: number | null;
}

export interface CheckboxField extends FieldBase {
  Kind: 'checkbox';
  Value?: boolean;
}

/** Users or groups from a part of the organisation chosen by the server. */
export interface PeopleField extends FieldBase {
  Kind: 'people';
  Pick: 'users' | 'groups';
  Multi: boolean;
  Tree: OrgTreeNode[];
  /** Per picked group: type of the movement (EnergeiaTypes) and «Επείγον», as in UiSend. */
  PerItem?: { EnergeiaTypes?: Option[]; DefaultEnergeiaType?: number | null; Urgent?: boolean } | null;
  Value?: PersonValue[];
}

export interface ThematicFoldersField extends FieldBase {
  Kind: 'thematicFolders';
  /** AllowNewThematicalFolderByUsers: a name that does not exist creates a folder. */
  AllowNew: boolean;
  Value?: ThematicFolder[];
}

export interface ThematicFolder {
  /** null: a new folder with this name. */
  Id: number | null;
  Name: string;
  /** Parents, for telling folders with the same name apart. */
  Path?: string | null;
}

/** A picked user (with the group they were picked under) or group. */
export interface PersonValue {
  UserId?: number | null;
  GroupId: number;
  EnergeiaTypeId?: number | null;
  Urgent?: boolean;
}

export type ActionValue = string | number | boolean | null | PersonValue[] | ThematicFolder[];

/* ---------- POST action (phase 6) ---------- */

/**
 * Runs an action, as `/document/action/{Action}/{DocumentId}` → IUiAction.ExecuteAction, for
 * one or more documents (one result each; the mass actions of phase 7 use the same call).
 * The server turns `Values` into the ActionParams the Razor form posts today.
 */
export interface RunActionRequest {
  GroupId: number;
  Code: string;
  DocumentIds: number[];
  Values: Record<string, ActionValue>;
}

export interface ActionResult {
  DocumentId: number;
  Success: boolean;
  /** Why it failed (the ActionException message), shown as is. */
  Message?: string | null;
  /** A document the action created (Κλωνοποίηση, Ορθή Επανάληψη), to open. */
  NewDocumentId?: number | null;
}

export interface RunActionPayload {
  Results: ActionResult[];
}
