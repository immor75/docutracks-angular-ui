/**
 * Contracts for Καταχώριση / Επεξεργασία υπόθεσης.
 * Shapes follow DocuLibrary (FolderModuleDto, FolderTypeInstanceExtendedDto) and the
 * Postman examples "Register Folder" / "Edit Folder" (58112). Only fields the editor reads
 * or writes are typed; everything else the server sent is kept and sent back untouched.
 */

export interface NamedRef {
  Id: number;
  Name?: string;
}

export interface OrgUserLite {
  Id: number;
  DisplayName?: string;
  FirstName?: string;
  LastName?: string;
  UserName?: string;
}

export interface ContactLite {
  IdContact?: number;
  Eponimia?: string;
  FirstName?: string;
  LastName?: string;
  Afm?: string;
  ContactType?: { ContactTypeName?: string; Code?: string };
}

export interface FolderContact {
  IdFolderContact: number;
  IdFolder?: number;
  IdContact?: number | null;
  IdUser?: number | null;
  IdGroup?: number | null;
  Contact?: ContactLite | null;
  User?: OrgUserLite | null;
  Group?: { Id: number; GroupName?: string; DisplayName?: string } | null;
  IdFolderTypeContactRole: number;
  FolderTypeContactRole?: { IdFolderTypeContactRole: number; ContactRole?: string } | null;
}

export interface FolderDocumentTag {
  IdFolderDocumentTag: number;
  IdFolderDocument: number;
  IdTag: number;
  Name: string;
  IsWithdrawn: boolean;
}

export interface FolderDocument {
  IdFolderDocument: number;
  IdFolder?: number;
  Comments?: string;
  IsWithdrawn?: boolean;
  CreationDateString?: string;
  DocumentKind?: { IdFolderTypeDocumentKind?: number; Title?: string } | null;
  Document: {
    IdDocumentCopy: number;
    Document?: { IdDocument?: number; Title?: string; ProtocolText?: string; IssueDate?: string; IdDocumentType?: number };
    [k: string]: unknown;
  };
  FolderDocumentTags?: FolderDocumentTag[];
}

export interface FolderFile {
  IdFolderFile?: number;
  FileName?: string;
  FileRelativePath?: string;
  AttachDate?: string | null;
  IsEncrypted?: boolean | null;
  IdFolder?: number;
  Base64File?: string;
  FolderFileKind?: { Id: number; Title?: string } | null;
  /** Client only: size of a file picked in this session, for display. */
  _size?: number;
}

export interface FolderRelationEdit {
  IdFolderRelation: number;
  RelationCreator?: string;
  RelationDate?: string;
  IdParentFolder?: number;
  IdChildFolder?: number;
  IdFolderRelationType?: number;
  FolderRelationType?: {
    IdFolderRelationType: number;
    Title?: string;
    InverseTitle?: string;
    IdParentFolderType?: number | null;
    IdChildFolderType?: number | null;
  };
  ParentFolder?: NamedRef;
  ChildFolder?: NamedRef;
  ParentCaseNumber?: string;
  ChildCaseNumber?: string;
}

export interface PlaceRef {
  Id?: number;
  Onomasia?: string;
}

export interface FolderLocation {
  IdFolderLocation: number;
  IdFolder?: number;
  Description?: string | null;
  PlaceRegion?: string | null;
  PlacePeriferia?: (PlaceRef & { IdPeriferia?: number }) | null;
  PlaceNomos?: (PlaceRef & { IdNomos?: number }) | null;
  PlaceDimos?: (PlaceRef & { IdDimos?: number }) | null;
  PlaceKinotita?: (PlaceRef & { IdKoinotita?: number }) | null;
}

export interface FolderDeadline {
  IdFolderDeadline?: number;
  IdFolder?: number;
  Deadline: string | null;
  SendDate: string | null;
  Message: string;
  UsersToNotify: OrgUserLite[];
}

export interface FolderMartiras {
  IdFolderMartiras: number | null;
  IdFolder?: number;
  IdUser: number | null;
  IsPiniko: boolean;
  Martiras: OrgUserLite;
}

export interface FolderEnergia {
  IdFolderEnergia: number;
  EnergiaDate: string;
  Comments: string;
  IdResponsibleUser: number | null;
  ResponsibleUser?: OrgUserLite | null;
  IdEnergiaKind?: number;
  EnergiaKind: { IdFolderEnergiaKind?: number; Title?: string };
}

/** The folder as edited. Unknown server fields ride along in the index signature. */
export interface FolderEdit {
  IdFolder: number;
  FolderName: string;
  FolderTypeInstanceId: number;
  Comments: string;
  Metadata: string;
  Status?: number | null;
  CaseNumber?: string;
  DioikDikasimosDate?: string | null;
  PinikDikasimosDate?: string | null;
  PinikProanakrisiDate?: string | null;
  DioikProstimo?: number | null;
  FolderContacts: FolderContact[];
  FolderDocuments: FolderDocument[];
  FolderFiles: FolderFile[];
  RelationsAsParent: FolderRelationEdit[];
  RelationsAsChild: FolderRelationEdit[];
  FolderLocations: FolderLocation[];
  FolderDeadlines: FolderDeadline[];
  Martires: FolderMartiras[];
  FolderEnergies: FolderEnergia[];
  [k: string]: unknown;
}

/* ---------- Folder type configuration ---------- */

export interface FormioInput {
  Key: string;
  Label: string;
  Type: string;
  DefaultValue?: unknown;
  Values?: { label: string; value: string }[];
  HasMultiple?: boolean;
  ParentDataGridKey?: string;
  Properties?: Record<string, string>;
}

export interface ContactRole {
  IdFolderTypeContactRole: number;
  ContactRole: string;
  MinInvolvedContactsLimit: number;
  MaxInvolvedContactsLimit: number;
  IsActive: boolean;
  AllowedForContacts: boolean;
  AllowedForGroups: boolean;
  AllowedForUsers: boolean;
}

export interface DocumentKind {
  IdFolderTypeDocumentKind: number;
  Title: string;
  IsActive?: boolean;
  ParentIdFolderTypeDocumentKind?: number | null;
  Children?: DocumentKind[];
}

export interface FileKind {
  IdFolderTypeFolderFileKind: number;
  FolderFileKind: { Id: number; Title: string; Code?: string };
}

export interface RelationType {
  IdFolderRelationType: number;
  Title?: string;
  InverseTitle?: string;
  IdParentFolderType?: number;
  IdChildFolderType?: number;
  IsActive?: boolean;
}

export interface FolderTypeExtended {
  Title?: string;
  Tabs?: { Name: string; LabelGr?: string; Order: number }[];
  FormioSchemaInputs?: FormioInput[];
  ContactRoles?: ContactRole[];
  DocumentKinds?: DocumentKind[];
  FolderFileKinds?: FileKind[];
  RelationsAsParent?: RelationType[];
  RelationsAsChild?: RelationType[];
  EnergiaKinds?: { IdFolderTypeEnergiaKind: number; Title: string; IsActive: boolean }[];
}

export interface FolderTypeInstanceExtended {
  InstanceName?: string;
  IdFolderType?: number;
  FolderTypeExtended?: FolderTypeExtended;
}

/* ---------- Lookups ---------- */

export interface ContactSearchHit extends ContactLite {
  IdContact: number;
  IsValidated?: boolean;
}

export interface DocumentForRelation {
  Id: number;
  IdDocumentCopy: number;
  Title: string;
  CreatedBy?: string;
  IssueDate?: string;
  ProtocolText?: string;
  ProtocolYear?: number;
  DocumentType?: number;
}

export interface RelatedFolderHit {
  IdFolder: number;
  FolderName: string;
  FolderTypeAndNumber?: string;
  StatusString?: string;
  OwnerGroupDisplayName?: string;
}

export interface Place {
  Id: number;
  Onomasia: string;
}

/**
 * Fields the editor sends, as FolderUI's `FolderModuleTemplate` (DocuLibrary): the edit
 * endpoint receives exactly these, so server-computed lists (Histories, Asignees, Tasks,
 * shares) are not echoed back. `FolderEnergies` is added only when the user changed it,
 * as FolderUI's history dialog does.
 */
export const SENT_FIELDS = [
  'Id', 'IdFolder', 'FolderName', 'FolderTypeInstanceId', 'CreatedByUserId', 'OrgGroupOwnerId',
  'OrgGroupCreatorId', 'CaseNumber', 'CreatedDate', 'PerigrafiDrastiriotitas', 'FysikoPeriballonId',
  'Keywords', 'DioikDikasimosDate', 'PinikDikasimosDate', 'PinikProanakrisiDate', 'DioikProstimo',
  'Status', 'Comments', 'Metadata', 'ExportObject', 'CaseLatitude', 'CaseLongitude',
  'FolderTypePrototypeName', 'FolderContacts', 'FolderDocuments', 'Asignees', 'Histories',
  'RelationsAsParent', 'RelationsAsChild', 'FolderFiles', 'FolderDeadlines', 'Martires',
  'FolderTypeFolderStatus', 'FolderLocations', 'FormioDataInputs',
] as const;
