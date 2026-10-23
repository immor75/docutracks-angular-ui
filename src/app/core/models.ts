/**
 * API contracts used by the app.
 * Shapes follow the FoldersModule API (Postman collection 58112, 27/06/2025)
 * and the DTOs in DocuLibrary. Only the fields the UI reads are declared.
 */

export interface ApiError {
  ErrorCode?: number;
  ExceptionMessage?: string;
}

/** Envelope used by most `/services/v2/folders/*` endpoints. */
export interface Envelope<T> {
  Success: boolean;
  Payload?: T;
  ErrorInfo?: ApiError;
  Message?: string;
}

export interface Page {
  Size: number;
  PageNumber: number;
  TotalElements: number;
}

export interface Paged<T> {
  Data: T[];
  Page: Page;
}

/* ---------- Authentication ---------- */

export interface CurrentUserAsLoginResponse {
  Success: boolean;
  IdUser: number;
  AccessToken: string;
  IdToken: string;
  RefreshToken: string;
  ExpiresIn: number;
  Name: string;
  Fullname: string;
}

export interface OrgGroup {
  Id: number;
  GroupName?: string;
  GroupShortName?: string;
  ActiveModules?: string[];
  IsActive?: boolean;
}

export interface OrgUser {
  Id: number;
  UserName?: string;
  DisplayName?: string;
  FirstName?: string;
  LastName?: string;
  IsAdministrator?: boolean;
  Relations?: { Group: OrgGroup; RoleName?: string }[];
}

/* ---------- Folder types ---------- */

export interface FolderTypeInstance {
  Id: number;
  InstanceName: string;
  IsActive: boolean;
  IdFolderType: number;
  FolderType?: { IdFolderType: number; Title: string; PrototypeName?: string };
}

/* ---------- List ---------- */

export type SortDirection = 'asc' | 'desc';

export interface OrderBy {
  Column: string;
  Direction: SortDirection;
}

export interface FolderFilterCriteria {
  SharedFolders: boolean;
  Search: string;
  SelectedSearchTypeId: number;
  SelectedFolderTypeId: number;
  SelectedFolderTypeInstanceId: number;
  FilterFolderStatuses: number[];
  StartCreatedDate: string | null;
  EndCreatedDate: string | null;
  /** Spelled `NoAssigness` in the Postman collection, but the API only honours `NoAssignees`. */
  NoAssignees: boolean;
  /** 1 = read, 2 = unread (verified on test-new, 22/10). */
  FilterFolderIsRead: number[];
}

export interface SearchFoldersRequest {
  UserId: number;
  GroupId: number;
  PageNumber: number;
  PageSize: number;
  OrderBy: OrderBy[];
  FolderFilterCriteria: FolderFilterCriteria;
}

export interface FormioDataInput {
  Key: string;
  Value: string;
  DisplayValue: string;
}

export interface FolderListItem {
  IdFolder: number;
  FolderTypeAndNumber: string;
  FolderName: string;
  StatusString: string;
  RecentEnergia: string;
  OwnerGroupDisplayName: string;
  CurrentUsers: string;
  CreatedByName: string;
  /** ISO without zone, e.g. 2026-09-21T18:15:37.257 (test-new). */
  UpdatedDate?: string;
  CreatedDate?: string;
  /** Present in the Postman samples only. */
  UpdatedDateString?: string;
  IsReadByUser: boolean;
  IsShared?: boolean;
  FormioDataInputs?: FormioDataInput[];
}

/* ---------- Detail ---------- */

export interface NamedUser {
  Id?: number;
  DisplayName?: string;
  FirstName?: string;
  LastName?: string;
}

export interface FolderModule {
  IdFolder: number;
  FolderName: string;
  CaseNumber: string;
  FolderTypeInstanceId: number;
  CreatedDate: string;
  UpdatedDate: string;
  Comments?: string;
  Keywords?: string;
  FolderTypePrototypeName?: string;
  FolderTypeFolderStatus?: { Title: string; Code?: string; IsFinal?: boolean; IdFolderType?: number };
  OrgGroupOwnerId?: number;
  Asignees?: { IdAsignee: number; User?: NamedUser }[];
  FolderEnergies?: { Comments?: string }[];
  SharedWithGroups?: { Group?: { Id: number; GroupName?: string } }[];
  SharedWithUsers?: { User?: NamedUser; Group?: { Id: number } }[];
  FolderContacts?: {
    IdFolderContact: number;
    Contact?: { FirstName?: string; LastName?: string; Eponimia?: string; Afm?: string; Email?: string } | null;
    User?: NamedUser | null;
    Group?: OrgGroup | null;
    FolderTypeContactRole?: { ContactRole?: string } | null;
  }[];
  FolderDocuments?: {
    IdFolderDocument: number;
    Comments?: string;
    CreationDateString?: string;
    IsWithdrawn?: boolean;
    DocumentKind?: { Title: string };
    Document?: { IdDocumentCopy?: number; Document?: { IdDocument?: number; Title?: string; IssueDate?: string } };
  }[];
  Histories?: {
    IdHistory: number;
    Date: string;
    Action: string;
    Comment?: string;
    OrgUser1?: NamedUser;
    OrgUser2?: NamedUser;
    OrgGroup1?: OrgGroup;
    OrgGroup2?: OrgGroup;
  }[];
  RelationsAsParent?: FolderRelation[];
  RelationsAsChild?: FolderRelation[];
  FolderDeadlines?: { IdFolderDeadline: number; Deadline: string; Message?: string }[];
  Metadata?: string;
  FormioDataInputs?: FormioDataInput[];
}

export interface FolderRelation {
  IdFolderRelation: number;
  RelationDate?: string;
  RelationCreator?: string;
  FolderRelationType?: { Title?: string; InverseTitle?: string };
  ParentFolder?: { Id?: number; Name?: string };
  ChildFolder?: { Id?: number; Name?: string };
  IdParentFolder?: number;
  IdChildFolder?: number;
  ParentCaseNumber?: string;
  ChildCaseNumber?: string;
}

export interface FolderGetResponse {
  Success: boolean;
  Folder: FolderModule;
  ErrorInfo?: ApiError;
}

export interface UiAction {
  UiActionCode: string;
  UiActionName: string;
  CanExecute: boolean;
  UiActionIsVisible: boolean;
  ValidationMessage?: string;
}

export interface FolderActionsResponse {
  Success?: boolean;
  FoldersActions?: { FolderId: number; Actions: UiAction[] }[];
}

/* ---------- Write actions (Phase 4) ---------- */

/** `ActionParams` of FolderPostActionRequest (DocuLibrary). */
export interface ActionParams {
  Comment: string;
  SelectedTargetOwningGroupId: number;
  CustomData: unknown[];
}

/** Body of `/v2/folders/action|assign|share|change-type|massive-print/`. */
export interface FolderActionRequest {
  UserId: number;
  GroupId: number;
  FolderId: number;
  ActionCode: string;
  ActionParams?: ActionParams;
  AssigneesIds?: number[];
  GroupIds?: string;
  UsersGroupsIds?: string;
  FolderTypeInstanceId?: number;
  DocumentCopyIds?: number[];
}

/** Success has no `Success` field (Postman 58112); failure is `Success: false` + ErrorInfo. */
export interface FolderActionResponse {
  Success?: boolean;
  ActionCode?: string;
  Action?: string;
  Message?: string;
  Folder?: { IdFolder: number; FolderName?: string };
  ErrorInfo?: ApiError;
}

/** Node of `/services/organization/get-organization-tree`. */
export interface OrgTreeNode {
  Id: number;
  DisplayName: string;
  SubGroups?: OrgTreeNode[];
  Users?: { Id: number; DisplayName: string }[];
  IdGroupKind?: number;
  TitleGroupKind?: string;
}

export interface GroupPermission {
  GroupId: number;
  Permission: 'Owner' | 'Editor' | string;
}

export interface FolderTypeInstanceExtendedResponse {
  Success?: boolean;
  FolderTypeInstanceExtendedDto?: { OrgGroupPermissions?: GroupPermission[] };
  ErrorInfo?: ApiError;
}

export interface ConfigValues {
  KeyValues?: Record<string, string>;
  Success?: boolean;
}
