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

/* ---------- Υπογραφή (phase 7): GET sign-data, POST sign/otp, POST sign ---------- */

/** A signature token of the user (DigitalSignatureTokens they own and that can sign). */
export interface SignToken {
  Id: number;
  Title: string;
  /** Remote signing (ΣΔΔΔ, HARICA, …): username, password and OTP in the form. */
  IsRemote: boolean;
  OtpLength?: number | null;
}

/**
 * What the signing form of `_UiSignPartial` shows for these documents. One form for one or
 * many documents (UiMassDigitalSign signs them with one OTP).
 */
export interface SignForm {
  Title: string;
  /** Name and group printed in the signature. */
  Signer: { Name: string; Group: string };
  Tokens: SignToken[];
  DefaultTokenId: number | null;
  /** Drafts: sign without a digital signature (NonDigitalSignature, allowSignWithoutToken). */
  AllowWithoutDigital: boolean;
  /** Verification signature on incoming/outgoing: add to the existing signatures (AppendSignature). */
  AppendSignature?: { Default: boolean } | null;
  /** EAP setting: «Τελικός υπογράφων» or «Ακριβές αντίγραφο» (SignAsFinalSigner). */
  SignAsFinalSigner?: { Default: boolean } | null;
  /** The user's image in the signature (UseUserImageOnSign). */
  UseUserImage?: { Default: boolean } | null;
  CommentMaxLength: number;
  /** The signature must be placed by hand on the PDF (signing as prototype, …): classic UI for now. */
  Classic?: string | null;
}

/** Asks the remote signing provider to send an OTP (Helper/RequestOtpForSDDDSign). */
export interface SignOtpRequest {
  GroupId: number;
  TokenId: number;
  Username: string;
  Password: string;
}

export interface SignOtpPayload {
  /** Where it was sent and for how long it is valid, to show as is. */
  Message: string;
}

/**
 * Signs one or more documents: `/sign/remote/document` (remote, or `Digital: false` for a
 * draft without digital signature) for each, as MassDigitalRemoteSign does. USB tokens sign
 * through the browser add-on (`/pre-sign/token/document` + `/sign/token/document`), which
 * stays in the classic UI for now.
 */
export interface SignRequest {
  GroupId: number;
  DocumentIds: number[];
  Digital: boolean;
  TokenId?: number | null;
  Username?: string;
  Password?: string;
  Otp?: string;
  Comment?: string;
  AppendSignature?: boolean;
  SignAsFinalSigner?: boolean;
  UseUserImage?: boolean;
}

/* ---------- Νέο έγγραφο (phase 8) ---------- */

/** A type of new document the user may register (UINewSelection, after roles and settings). */
export interface NewDocType {
  /** NewDocTypes id (6 Σχέδιο, 1 Εισερχόμενο, 7 Εξερχόμενο, 5 Υποστηρικτικά). */
  Id: number;
  Title: string;
  /** DocumentType the registration creates. */
  DocumentType: DocumentTypeId;
}

export interface NewTypesPayload {
  Types: NewDocType[];
  /** «Παλαιότερο έγγραφο» (IsActiveOldProtokollo of the group). */
  AllowOld: boolean;
  /** With `From`: the document answered or cloned. */
  Source?: SourceDocument | null;
}

/** «Απάντηση» (UiAnswer) or «Κλωνοποίηση» (UiClone): a new document from an existing one. */
export type NewFromMode = 'answer' | 'clone';

export interface SourceDocument {
  Id: number;
  Title: string;
  ProtocolText?: string | null;
}

/**
 * The registration form of a type, as DocumentPropertiesEditor decides it: tabs in the
 * configured order, fields with visibility, required flags, defaults and options, with the
 * settings already applied. `Brief` marks the fields of «Σύντομη καταχώριση».
 */
export interface RegisterForm {
  NewType: number;
  DocumentType: DocumentTypeId;
  Title: string;
  Tabs: { Key: string; Label: string }[];
  /** ShowDetailedOrBriefDocumentCreationToggle. */
  AllowBrief: boolean;
  /** IsBriefIncomingDefault / IsBriefOutgoingDefault. */
  BriefDefault: boolean;
  Fields: RegisterField[];
  /** «Επεξεργασία» (UiEdit): the document edited; field values are its current ones. */
  DocumentId?: number | null;
  /** Answer or clone: the document the values were taken from. */
  Source?: SourceDocument | null;
  Mode?: NewFromMode | null;
  /** Shown above the fields: limited edit, what was prefilled. */
  Notice?: string | null;
}

export type RegisterField =
  | RegTextField
  | RegDateField
  | RegNumberField
  | RegSelectField
  | RegCheckboxField
  | RegTreeField
  | RegPeopleField
  | RegContactsField
  | RegDocumentsField
  | RegFilesField
  | RegThematicField
  | RegKindFormField
  | RegMetadataField
  | RegSignatureChainField
  | RegDisplayField;

interface RegFieldBase {
  Key: string;
  Label: string;
  Tab: string;
  /** Part of «Σύντομη καταχώριση» (BriefIncomingDocumentFields / BriefOutgoingDocumentFields). */
  Brief?: boolean;
  Required?: boolean;
  RequiredMessage?: string | null;
  Hint?: string | null;
  /** Sub-heading inside the tab («Αποδέκτες», «Κοινοποιήσεις», …). */
  Section?: string | null;
  /** Hidden (and not required) while another field has this value: «Κυρίως έγγραφο» with «Από Πρότυπο». */
  HiddenIf?: { Key: string; Value: RegisterValue } | null;
  /** Shown, not editable, not sent: limited edit after protocol (CondIsLimitedEdit). */
  ReadOnly?: boolean;
}

export interface RegTextField extends RegFieldBase {
  Kind: 'text';
  MaxLength?: number | null;
  Multiline?: boolean;
  /** Αποθηκευμένα θέματα (PredefinedTitles), offered while typing. */
  Suggestions?: string[];
  Value?: string | null;
}
export interface RegDateField extends RegFieldBase {
  Kind: 'date';
  Value?: string | null;
}
export interface RegNumberField extends RegFieldBase {
  Kind: 'number';
  Min?: number | null;
  Value?: number | null;
}
export interface RegSelectField extends RegFieldBase {
  Kind: 'select';
  Multi?: boolean;
  Options: Option[];
  Value?: number | number[] | null;
}
export interface RegCheckboxField extends RegFieldBase {
  Kind: 'checkbox';
  Value?: boolean;
}
/** A tree from `GET kinds` (Είδος) or the categories of the form (Θεματικές Κατηγορίες). */
export interface RegTreeField extends RegFieldBase {
  Kind: 'tree';
  Source: 'kinds' | 'options';
  Multi?: boolean;
  /** Source 'options': the tree itself. */
  Tree?: TreeOption[];
  Value?: number | number[] | null;
}
export interface RegPeopleField extends RegFieldBase {
  Kind: 'people';
  Pick: 'users' | 'groups' | 'both';
  Multi: boolean;
  Tree: OrgTreeNode[];
  /** Only these groups can be picked (final signers: groups that sign documents, not directories). */
  AllowedGroups?: number[] | null;
  Value?: PersonValue[];
}

/**
 * The signatures of a draft in order, as the server will create them: the final signers chosen,
 * the intermediate ones it computes (`POST signature-chain`) and those added by hand.
 */
export interface RegSignatureChainField extends RegFieldBase {
  Kind: 'signatureChain';
  /** Keys of the fields the chain is computed from. */
  From: { Finals: string; Extra?: string | null; CoAuthors?: string | null; Ratifiers?: string | null };
}
/** Επαφές (Αποστολέας, Λοιποί αποδέκτες, Συναλλασσόμενοι): search, or a new name when allowed. */
export interface RegContactsField extends RegFieldBase {
  Kind: 'contacts';
  Multi: boolean;
  AllowNew: boolean;
  Value?: ContactValue[];
}
export interface RegDocumentsField extends RegFieldBase {
  Kind: 'documents';
  Value?: { Id: number; Title: string }[];
}
export interface RegFilesField extends RegFieldBase {
  Kind: 'files';
  Role: 'main' | 'attachment' | 'internal' | 'signer';
  Multi: boolean;
  /** Accepted extensions, e.g. ".pdf,.docx"; empty: any. */
  Accept?: string | null;
  MaxSizeMb?: number | null;
}
export interface RegThematicField extends RegFieldBase {
  Kind: 'thematicFolders';
  AllowNew: boolean;
  Value?: ThematicFolder[];
}
/** «Ειδικά πεδία» of the chosen Είδος: a Formio form loaded from `GET kinds/{id}/form`. */
export interface RegKindFormField extends RegFieldBase {
  Kind: 'kindForm';
  /** Key of the Είδος field it follows. */
  KindField: string;
}
/** «Μεταδεδομένα»: classes the user turns on, each with its Formio form. */
export interface RegMetadataField extends RegFieldBase {
  Kind: 'metadata';
  Classes: { Code: string; Title: string }[];
}
/** Read-only information (Ημ. Καταχώρισης, Καταχωριστής). */
export interface RegDisplayField extends RegFieldBase {
  Kind: 'display';
  Value: string;
}

export interface TreeOption {
  Id: number;
  Title: string;
  Selectable?: boolean;
  Children?: TreeOption[];
}

/** An Είδος εγγράφου; `HasForm` when it has «Ειδικά πεδία». */
export interface KindNode extends TreeOption {
  HasForm?: boolean;
  Children?: KindNode[];
}

/** A Formio form (components as stored by Docutracks for kinds and metadata classes). */
export interface FormioSchema {
  components: object[];
}

export interface ContactValue {
  /** null: a new contact with this name. */
  Id: number | null;
  Name: string;
  Email?: string | null;
}

export interface UploadedFile {
  /** Temporary file, kept by the server until registration (or a few hours). */
  TempId?: string | null;
  /** A file the document already has (edit): kept while it stays in the list. */
  FileId?: number | null;
  Name: string;
  Size: number;
  IsPdf: boolean;
}

export type RegisterValue =
  | string
  | number
  | boolean
  | null
  | number[]
  | PersonValue[]
  | ContactValue[]
  | ThematicFolder[]
  | { Id: number; Title: string }[]
  | UploadedFile[]
  | Record<string, unknown>;

export interface RegisterRequest {
  GroupId: number;
  NewType: number;
  /** «Παλαιότερο έγγραφο». */
  Old?: boolean;
  /** Brief registration: fields outside it are not sent. */
  Brief: boolean;
  Values: Record<string, RegisterValue>;
  /** Answer (relation «Απάντηση» to it) or clone of this document. */
  From?: number;
  Mode?: NewFromMode;
}

/** `POST {id}/edit`: every editable field is sent, empty ones as null (cleared). */
export interface EditRequest {
  GroupId: number;
  Values: Record<string, RegisterValue | null>;
}

export interface RegisterPayload {
  DocumentId: number | null;
  /** Αριθμ. Πρωτ. given, to show in the confirmation. */
  ProtocolText?: string | null;
  /** Validation of the server, per field. */
  Errors?: { Key: string; Message: string }[];
}

/* ---------- POST signature-chain (phase 8β) ---------- */

export interface SignatureChainRequest {
  GroupId: number;
  Finals: PersonValue[];
  Extra?: PersonValue[];
  CoAuthors?: PersonValue[];
  Ratifiers?: PersonValue[];
}

export interface SignatureStep {
  Order: number;
  /** «Υπογραφή συντάκτη», «Προσυπογραφή», «Υπογραφή Εγκρίνοντος», «Τελική υπογραφή». */
  Kind: string;
  Group: string;
  /** The person who will sign (the group's manager), when known. */
  User?: string | null;
  /** Computed by the server, not chosen. */
  Auto: boolean;
}

export interface SignatureChainPayload {
  Steps: SignatureStep[];
  /** E.g. a chosen group without an active manager. */
  Warnings?: string[];
}
