# Documents API v2: συμβόλαια

Τα endpoints που χρειάζεται η ενότητα «Έγγραφα». Δεν υπάρχουν ακόμη στον server: εδώ ορίζονται, το `mock/documents.mjs` τα υλοποιεί και οι τύποι TypeScript είναι στο `src/app/core/documents-models.ts`. Τα συμβόλαια προστίθενται ανά φάση του πλάνου («Πλάνο υλοποίησης Documents UI»).

## Κοινά

- **Βάση:** `/services/v2/documents/`, ServiceStack όπως τα `/services/v2/folders/*`, με `Authorization: Bearer` και `Accept: application/json`.
- **Απάντηση:** `{ Success, Payload, ErrorInfo }` με status 200, όπως στις υποθέσεις. Αποτυχία: `Success: false` και `ErrorInfo.ExceptionMessage` στα ελληνικά, για να εμφανιστεί αυτούσιο.
- **Σελιδοποίηση:** `Payload: { Data, Page: { Size, PageNumber, TotalElements } }`, `PageNumber` από 1.
- **Ημερομηνίες:** ISO 8601. Στα αιτήματα `yyyy-mm-dd`. Όχι `/Date(ms)/`.
- **Υπηρεσία:** κάθε κλήση στέλνει `GroupId`. Ο server ελέγχει ότι ο χρήστης έχει ρόλο σε αυτή, όπως το `SetContextGroup` του `DocumentActionService`.

## Φάση 2: λίστα

### `GET filters?GroupId={id}`

Ό,τι χρειάζεται η σελίδα πριν από την πρώτη αναζήτηση. Αλλάζει σπάνια, οπότε ο client το κρατά 10 λεπτά.

| Πεδίο | Τύπος | Από πού στο Razor |
| --- | --- | --- |
| `Folders` | δέντρο `{ Key?, Label, Children? }` | `ListModel.FolderTypes` και τα στοιχεία του `DocumentFilters.cshtml` (Κύρια, Εσωτερικά Σημειώματα, Υφισταμένων υπηρεσιών, ΚΣΗΔΕ, Αιτήσεις πολιτών), **μόνο όσα έχουν `Display = true`** για τον χρήστη στην υπηρεσία |
| `DefaultFolderKey` | string | «Κύρια» |
| `SearchTypes` | `{ Id, Label }[]` | `ListModel.SearchTypes` (ήδη φιλτραρισμένα από ρυθμίσεις) |
| `DefaultSearchType` | int | ο τύπος που προτείνεται πρώτος· στο Razor είναι το `SEARCHTYPE_PROTOCOLNUM`, το mock δίνει το `SEARCHTYPE_FREETEXT` |
| `Columns` | `{ Key, Label, Width?, Sortable? }[]` | στήλες του `List/Index.cshtml`, χωρίς όσες κρύβει το `HideDocumentCatalogColumns`. `Width` από `DocumentCatalogColumnsWidth` |
| `Periods`, `DefaultPeriod` | `{ Id, Label }[]`, int | `ListModel.AvailableDateRanges`, `DateRanges.DEFAULT_DATE_RANGE` |
| `DefaultSort` | `{ Column, Direction }` | η σειρά που εφαρμόζει σήμερα ο server |

**Κλειδί φακέλου.** Το `Key` είναι αδιαφανές για τον client. Ο server κωδικοποιεί σε αυτό ό,τι στέλνει σήμερα το Razor: `FilterDocTypes`, `SelectedFolderType.Id`, `GroupVisibility` και σημαίες (`SentFromKside`, `SentToKside`, `SentFromDocuGate`). Πρόταση: `"{DocType}.{FolderType}.{Visibility}"`, π.χ. `1.11.GroupOwned` (Εισερχόμενα › Εκκρεμή). Χρειάζεται και ο τύπος εγγράφου, γιατί τα `SearchConstants.T_*` επαναλαμβάνονται (π.χ. 23 = Εξερχόμενα › Απαντημένα και Σχέδια › Προς υπογραφή από εμένα). Ενότητα με `Key` (π.χ. «Εισερχόμενα») επιλέγεται και η ίδια: όλα τα έγγραφα του τύπου.

### `POST search`

```json
{
  "GroupId": 2,
  "FolderKey": "1.11.GroupOwned",
  "Search": { "Text": "1234", "Type": 1 },
  "Period": { "Range": 4, "From": null, "To": null },
  "Sort": { "Column": "IssueDate", "Direction": "desc" },
  "PageNumber": 1,
  "PageSize": 20
}
```

- `Search` κενό ή `null`: χωρίς αναζήτηση. `Type` από τα `SearchTypes`.
- `Period.Range` από τα `Periods`. Με `0` ισχύουν τα `From`/`To` (ημ. δημιουργίας αντιγράφου, inclusive). Με `6` (Όλα) χωρίς όριο.
- `Sort.Column` μόνο από στήλες με `Sortable: true`. Αλλιώς ο server εφαρμόζει το `DefaultSort`.

Απάντηση `Payload`:

| Πεδίο | Περιγραφή |
| --- | --- |
| `Data` | `DocumentRow[]`, ένα ανά αντίγραφο της υπηρεσίας |
| `Page` | όπως στις υποθέσεις |
| `Columns` | κλειδιά στηλών που ισχύουν για αυτόν τον φάκελο, με τη σειρά εμφάνισης. Αντιστοιχεί στα `.Visible(...)` του Razor: π.χ. `Recipients` μόνο για εξερχόμενα (ή με `ShowRecipientsForAllTypesAtDocumentIndex`), `DocumentIdentifier` αντί για `ProtocolNum` στα σχέδια |
| `Period` | `{ From, To }` που εφαρμόστηκαν, για τον τίτλο της λίστας |

`DocumentRow` (πεδία από `DocumentForList`):

| Πεδίο | Στήλη / σήμανση στο Razor |
| --- | --- |
| `Id`, `IdDocumentCopy`, `Type` | Α/Α, εικονίδιο τύπου |
| `Title` | Θέμα Εγγράφου (`(χωρίς τίτλο)` αν λείπει) |
| `IssueDate` | Ημ. Δημ/ας (`CopyCreationDate`) |
| `LastSignatureDate` | Ημ. Τελευταίας Μεταβολής |
| `ProtocolText`, `ProtocolDate` | Αριθμ. Πρωτ. (με το εναλλακτικό πρωτόκολλο σε παρένθεση), Ημ/νία Πρωτοκόλλου |
| `SenderProtocol`, `Sender` | Α. Π. Αποστολέα, Αποστολέας |
| `Recipients` | Αποδέκτες, **απλό κείμενο** (το Razor βάζει HTML) |
| `SubKind`, `Kind` | Υποείδος, Είδος Εγγράφου |
| `Status`, `IsFinal` | Κατάσταση (`CopyStatusCode`, με τον τίτλο ενέργειας όταν `ShowEnergeiaTitleInDocumentList`) και η γκρι γραμμή `finalstatus` |
| `SignaturesStatus`, `NextToSign` | Στάδιο Υπογραφών, Κάτοχος (σχέδια) |
| `Assignees`, `Folders`, `Endiaferomenos`, `CreatedBy` | Χρέωση, Φάκελοι, Ενδιαφερόμενος, Καταχωριστής |
| `IsUnread` | `isunread` (έντονη γραμμή) |
| `IsReadByUser`, `IsImportant` | φάκελος/ανοιχτός φάκελος, σημαία |
| `IsUrgent`, `HasComments`, `KeepUntil` | «!», εικονίδιο σχολίων, ρολόι «Διατήρηση έως» |

### Υλοποίηση στον server

- Το `/services/document/list/formobile` (`DocumentListForMobileService`, `DocumentListFiltersDto`) εφαρμόζει ήδη φακέλους (`FolderId`, `SubFolderId`, `GroupVisibility`) και τα περισσότερα κριτήρια του `ListModel` σε JSON. Είναι η φυσική βάση για το `search`.
- **Απόδοση.** Η λίστα του Razor κάνει ~8,2 s στον server για 20 γραμμές (μέτρηση 23/10/2026), ενώ το `/services/documents/search` απαντά σε 0,3–0,4 s. Να αποφευχθούν κλήσεις ανά γραμμή, όπως το `GetDocumentById` για το `NextEntityToSign` στο `RowAction` του Razor: το `NextToSign` να έρχεται από το ίδιο query.
- Το `IsReadByUser` και το `IsImportant` είναι ανά χρήστη· τα υπόλοιπα ανά αντίγραφο της υπηρεσίας.

## Φάση 3: φίλτρα

### `GET filters`: νέο πεδίο `Filters`

Τα κριτήρια της πλαϊνής στήλης του Razor (`DocumentFilters.cshtml`, ιδιότητες `Filter*` του `ListModel`) ως δεδομένα. Ο client χτίζει το panel «Φίλτρα» από αυτά, οπότε κριτήρια που ισχύουν μόνο σε κάποιες εγκαταστάσεις ή ρόλους απλώς δεν στέλνονται.

```json
{ "Key": "Status", "Label": "Κατάσταση", "Group": "Έγγραφο", "Kind": "options",
  "Options": [{ "Id": 2, "Label": "Χρεώθηκε" }], "Single": false }
```

| `Kind` | Τιμή στο `Criteria` | Επεξεργασία |
| --- | --- | --- |
| `options` | `number[]` (ids από `Options`) | checkboxes· radio με `Single: true`· δέντρο με `Options[].Depth` |
| `users` | `number[]` (ids χρηστών) | επιλογή από το οργανόγραμμα (`/services/organization/get-organization-tree`) |
| `groups` | `number[]` (ids υπηρεσιών) | επιλογή από το οργανόγραμμα |
| `dates` | `{ From, To }`, `yyyy-mm-dd`, το ένα μπορεί να λείπει | δύο ημερομηνίες |
| `text` | `string` | πεδίο κειμένου, περιέχει (χωρίς τόνους, πεζά-κεφαλαία) |

Για δέντρα (`Kinds`, `Categories`): η επιλογή γονέα σημαίνει και όλα τα παιδιά του, όπως στο `DocumentKindDropdownTree` του Razor.

Κλειδιά του mock και αντιστοιχία με το `ListModel`:

| Ομάδα | Key | `ListModel` |
| --- | --- | --- |
| Ημερομηνίες | `IssuedDate`, `SendDate`, `ActionExpiration` | `IssuedStartDate/EndDate`, `SendStartDate/EndDate`, `SelectedActionExpirationDateRange` |
| Έγγραφο | `Status`, `Kinds`, `SubKinds`, `Categories`, `ThematicFolders`, `Origin`, `Publications`, `Priority`, `Classification`, `AltNumberKinds`, `AltProtocols` | `FilterStatus`, `FilterDocKinds`, `FilterEureiasXrisisKinds`, `FilterCategories`, `FilterFolders`, `FilterOrigin`, `FilterPublications`, `FilterPriority`, `FilterDiavathmisi`, `FilterAltNumberKinds`, `FilterAltProtocols` |
| Αντίγραφο της υπηρεσίας | `Important`, `IsRead`, `Energeies`, `Kiniseis`, `Pending`, `ExactCopies`, `OfCopyTypes` | `FilterCopyImportance`, `FilterCopyIsRead`, `FilterEnergeies`, `FilterKiniseis`, `FilterPending`, `FilterExactCopies`, `OfCopyTypes` |
| Πρόσωπα | `Signator`, `Author`, `Creator`, `AssignedTo`, `AnsweredBy`, `ArchivedBy`, `Consultor` | `Signator`, `Author`, `Creator`, `AssignedTo`, `AnsweredBy`, `ArchivedBy`, `Consultor` |
| Υπηρεσίες | `SentTo`, `SentFrom`, `AnnouncedTo`, `AnnouncedFrom`, `SignatureObligationBy`, `CreatedForGroup` | ίδια ονόματα |
| Λοιπά | `Endiaferomenos`, `DecisionNumber`, `Ada`, `MeetingSubjectNumber` | `EndiaferomenosFilter`, `DecisionNumberFilter`, `ADADecisionFilter`, `DecisionMeetingSubjectNumber` |

Δεν περιλαμβάνονται ακόμη: **Ιστορικό κινήσεων** (`FilterHistory` με ημερομηνίες) και **Μεταδεδομένα** (`FilterMetadataDocKindProperties`, πεδία ανά είδος εγγράφου). Θέλουν δικό τους σχήμα και θα οριστούν όταν υπάρξει backend για να ελεγχθούν.

### `POST search`: νέο πεδίο `Criteria`

```json
"Criteria": { "Status": [2, 4], "Kinds": [200], "Creator": [1], "SendDate": { "From": "2026-10-01", "To": null }, "Ada": "ΨΩ12" }
```

Μόνο τα ενεργά κριτήρια, με κλειδί το `FilterDef.Key`. Όλα μαζί ισχύουν με AND· μέσα σε ένα κριτήριο οι τιμές με OR. Άγνωστα κλειδιά αγνοούνται.

### Στο URL του client

Ένα parameter ανά φίλτρο, `c.<Key>`: `c.Status=2,4`, `c.SendDate=2026-10-01~`, `c.Ada=ΨΩ12`. Η αλλαγή φακέλου τα καθαρίζει, όπως οι σύνδεσμοι φακέλων του Razor.

## Φάση 4: προβολή εγγράφου

### `GET {id}?GroupId=`

Ό,τι δείχνει το `UIViewDoc`, σε μία κλήση (`DocumentView` στο `documents-models.ts`). **Χωρίς παρενέργειες**: ο client το φορτώνει από πριν όταν ο δείκτης σταθεί σε μια γραμμή, άρα δεν πρέπει να σημειώνει το έγγραφο ως αναγνωσμένο (βλ. `flags`). Αν ο χρήστης δεν έχει αντίγραφο στην υπηρεσία: `Success: false` με μήνυμα.

| Πεδίο | Από πού στο Razor |
| --- | --- |
| στοιχεία (`Title`, `Kind`, `ProtocolText`, `ProtocolBook`, `Sender`, `Priority`, `Classification`, `ContainsPersonalData`, `DecisionNumber`, `Ada`, `KeepUntil`, `Categories`, `ThematicFolders`, …) | `DocumentViewModel.CurrentDocument`, `GetDocumentForViewById` |
| `Recipients` | εσωτερικοί και εξωτερικοί αποδέκτες, κοινοποιήσεις |
| `Files` | κύριο αρχείο, συνημμένα, εσωτερικά, υπογράφοντα. Το `Id` είναι για το υπάρχον `/services/file/get/{fileId}` |
| `Signatures` | υπογραφές, μονογραφές, με ημερομηνία ή «εκκρεμεί» |
| `Copies` | «Κατάσταση Αντιγράφων Εγγράφου» (σήμερα AJAX στο `/services/document/copy/view`) |
| `Related` | `GetRelativeDocuments`, με `CanOpen` όταν ο χρήστης έχει αντίγραφο |
| `Folders` | «Υποθέσεις» στις οποίες ανήκει |

### `GET {id}/history?GroupId=`

Το «Ιστορικό» (`UIViewHist`): `{ At, Action, User, Group, Target, Comment }[]`, νεότερα πρώτα. Φορτώνει μόνο όταν ανοίξει η καρτέλα.

### `POST actions`

```json
{ "GroupId": 2, "DocumentIds": [102300] }
→ { "Documents": [{ "DocumentId": 102300, "Actions": [{ "Code": "UiAnswer", "Name": "Απάντηση", "Enabled": false,
     "Reason": "Το έγγραφο μπορεί να απαντηθεί μόνο από χρήστη στον οποίο είναι χρεωμένο.", "Mass": false }] }] }
```

Ό,τι κάνει σήμερα το `UIActionsHelper.UIActionsForEntities`: όλα τα `UIAction` της προβολής, μετά τις εξαιρέσεις ανά υπηρεσία και ρόλο (`CanExecuteDocumentActionExceptions`), με το αποτέλεσμα του `CanExecute`. Το `Reason` είναι το μήνυμα της εξαίρεσης του `CanExecute`, που σήμερα φαίνεται μόνο ως tooltip. Με πολλά `DocumentIds` εξυπηρετεί και τις μαζικές ενέργειες (φάση 7). Οι κωδικοί και τα κείμενα του mock είναι όσα έδειξε το test-new στις 23/10/2026.

Μέχρι τη φάση 6 οι ενέργειες ανοίγουν στο κλασικό UI: `/el/Document/{group}/{Code}/{id}?pActionCode=UiViewDoc` (χωρίς το `pActionCode` για τα `UiViewDocDetails`, `UiEdit`, `UiAdminEdit`, `UiEditSignatures`).

### `POST flags`

```json
{ "GroupId": 2, "DocumentIds": [102300], "IsRead": true }
```

Σήμανση ανά χρήστη: αναγνωσμένο (`UpdateDocumentReadyStatus`, `MarkDocumentAsRead`) και σημαντικό (`UpdateDocumentImportance`). Ο client στέλνει `IsRead: true` όταν ανοίγει η προβολή. Από τη φάση 5 ο χρήστης τα αλλάζει και ο ίδιος (βλ. παρακάτω).

### Αρχεία

Χρησιμοποιείται το υπάρχον `GET /services/file/get/{fileId}` με το Bearer. Ο client το κατεβάζει ως blob: η προεπισκόπηση PDF γίνεται σε `<iframe>` από blob URL, η λήψη με το όνομα του αρχείου. Χρειάζεται `Content-Type` σωστό (`application/pdf` για προεπισκόπηση).

## Φάση 5: απλές ενέργειες

### `POST flags` για πολλά έγγραφα

Το ίδιο endpoint της φάσης 4, με όσα `DocumentIds` επέλεξε ο χρήστης και ένα από τα `IsRead` / `IsImportant` (ή και τα δύο).

```json
{ "GroupId": 2, "DocumentIds": [102300, 102659, 103403], "IsImportant": true }
```

```json
{ "Success": true, "Payload": { "Updated": [102300, 102659, 103403] } }
```

- `IsRead: false` επαναφέρει το «μη αναγνωσμένο» μόνο για τον χρήστη (`IsReadByUser`). Το `IsUnread` του αντιγράφου αλλάζει μόνο με `IsRead: true`.
- Έγγραφα χωρίς αντίγραφο στην υπηρεσία παραλείπονται από το `Updated`. Αν δεν μείνει κανένα, `Success: false`.
- Ο client αλλάζει τις γραμμές αμέσως και τις επαναφέρει αν ο server αρνηθεί. Η λίστα δεν ξαναφορτώνει, ώστε οι γραμμές να μη μετακινούνται ενώ ο χρήστης δουλεύει (π.χ. σε φάκελο «Σημαντικά»).

### `POST export`

Εξαγωγή σε Excel, όπως το `List/RequestDocumentExport`: ο server καταχωρίζει εργασία στο Gateway (`DocumentsExcelExportRequest`) και αργότερα στέλνει στον χρήστη σύνδεσμο. Δεν επιστρέφει αρχείο.

```json
{
  "GroupId": 2,
  "Query": {
    "FolderKey": "1.11.GroupOwned",
    "Search": null,
    "Period": { "Range": 6 },
    "Sort": { "Column": "IssueDate", "Direction": "desc" },
    "Criteria": { "Status": [3] }
  }
}
```

ή με επιλογή:

```json
{ "GroupId": 2, "DocumentIds": [102300, 102659], "WithFiles": true }
```

```json
{ "Success": true, "Payload": { "Count": 2 } }
```

- `DocumentIds` (επιλογή, το `docIds` του Razor) υπερισχύει του `Query`. Το `Query` είναι το σώμα του `POST search` χωρίς `GroupId`, `PageNumber`, `PageSize`: ο server βρίσκει όλα τα έγγραφα (`GetDocumentIdsForExport`).
- `WithFiles: true` αντιστοιχεί στο `ExportDocumentsExtended` (`DocumentsWithFilesExcelExportRequest`) και επιτρέπεται μόνο όταν το `GET filters` επιστρέφει `CanExportWithFiles: true` (σήμερα: διαχειριστές).
- Χωρίς έγγραφα: `Success: false` με το μήνυμα `NoDocumentsFountForExport` («Δεν πραγματοποιήθηκε εξαγωγή σε excel καθώς δεν βρέθηκαν έγγραφα που να πληρούν τα κριτήρια αναζήτησης»).
- Το `IsSubgroupsExport` και τα `GroupTreeIds` τα υπολογίζει ο server, όπως σήμερα.

### `GET filters`: νέο πεδίο

| Πεδίο | Τύπος | Σημασία |
| --- | --- | --- |
| `CanExportWithFiles` | boolean | Ο χρήστης μπορεί να εξάγει μαζί με τα αρχεία (`IsAdministrator`) |

### `GET {id}/files?GroupId=`

Όλα τα αρχεία του εγγράφου σε ένα ZIP, όπως το `DocumentDownloadFilesAction` (`DocumentController`): το τελευταίο κύριο αρχείο (σφραγισμένο, `GetStampedFile`) στη ρίζα και τα συνημμένα σε φακέλους «Συνημμένα», «Εσωτερικά συνημμένα», «Συνημμένα υπογραφόντων». Ισχύουν οι ίδιοι έλεγχοι ορατότητας (`AccessedByOrgGroups`, `CanViewSignatureAttachments`) και το `CanExecute` της προβολής.

Απάντηση `application/zip` με `Content-Disposition: attachment; filename*=UTF-8''{Title}.zip`. Ο client το καλεί με Bearer και το αποθηκεύει από blob.

## Φάση 6: ενέργειες ροής

Δύο endpoints για όλες τις ενέργειες: το ένα περιγράφει τη φόρμα, το άλλο την εκτελεί. Ο server χτίζει τη φόρμα με ό,τι αποφασίζει σήμερα το view της ενέργειας (`UiActions/UiViewDoc/{Code}.cshtml`): κείμενα, ρυθμίσεις (config keys), συνθήκες (π.χ. ποια «Επιστροφή» ισχύει), ποιοι χρήστες ή υπηρεσίες επιτρέπονται. Ο client μόνο τη σχεδιάζει, οπότε μια ρύθμιση αλλάζει σε ένα σημείο.

### `GET action-data/{code}?GroupId=&DocumentIds=`

```json
{
  "Code": "UiArchive",
  "Title": "Αρχειοθέτηση",
  "Message": "Είστε σίγουρος ότι θέλετε να αρχειοθετήσετε το συγκεκριμένο έγγραφο;",
  "Warnings": [],
  "Submit": "Αρχειοθέτηση",
  "Danger": false,
  "Classic": null,
  "Fields": [
    { "Kind": "thematicFolders", "Key": "ThematicFolders", "Label": "Θεματικοί Φάκελοι", "AllowNew": true, "Required": false, "Value": [] },
    { "Kind": "comment", "Key": "Comment", "Label": "Σχόλιο", "MaxLength": 1000 }
  ]
}
```

| `Kind` | Πεδία | Τιμή στο `POST action` |
| --- | --- | --- |
| `comment` | `MaxLength`, `Value` | κείμενο |
| `select` | `Options[{ Id, Label, Disabled, Reason }]`, `Value` | `Id` ή `null` |
| `checkbox` | `Value` | `true`/`false` |
| `people` | `Pick` (`users`/`groups`), `Multi`, `Tree` (σχήμα `get-organization-tree`), `PerItem { EnergeiaTypes, DefaultEnergeiaType, Urgent }`, `Value` | `[{ UserId, GroupId }]` ή `[{ GroupId, EnergeiaTypeId, Urgent }]` |
| `thematicFolders` | `AllowNew`, `Value[{ Id, Name, Path }]` | `[{ Id, Name }]`· `Id: null` = νέος φάκελος |

Όλα έχουν `Key`, `Label`, `Required`, `RequiredMessage`, `Hint`.

- `Classic`: η ενέργεια χρειάζεται κάτι που δεν γίνεται ακόμη εδώ (ανέβασμα εσωτερικών συνημμένων στην επιστροφή σχεδίου, e-mail σε εξωτερικούς αποδέκτες στην αποστολή). Ο client δείχνει το κείμενο και σύνδεσμο στο κλασικό UI.
- Το `Tree` είναι το κομμάτι του οργανογράμματος που επιτρέπεται: π.χ. στη Χρέωση (`ChargeToCurrentOrgGroup`) η τρέχουσα υπηρεσία και οι υφιστάμενες πρώτου επιπέδου (`UsersForGroupTreeSelectU ... showOnlyFirstLevel`), στη Γνωστοποίηση όλο το οργανόγραμμα (`FullGroupsUsersTreeSelectU`), στην Αποστολή σε τμήμα μόνο τα τμήματα (`FullGroupsOnlyTmimata`).

Ανά ενέργεια (όσα υλοποιεί το mock):

| Κωδικός | Πεδία | Από το Razor |
| --- | --- | --- |
| `UiArchive` | `ThematicFolders`, `Comment` | `UiArchiveDisplayThematicFolder`, `ArchiveActionRequiresThematicFolder`, `AllowNewThematicalFolderByUsers`, `ArchiveWarningNotSend` |
| `UiUnArchive`, `UiUnAssign` | `Comment` | |
| `UiCancel` | `Comment` (υποχρεωτικό, `CancelInvalidComment`) | |
| `UiDelete` | — (`Danger`, προειδοποίηση `MessageHasBeenSentWarning` αν έχει διακινηθεί) | |
| `UiReturn` | εισερχόμενο: `EnergeiaTypeId` (select), `Comment`· σχέδιο: `SignatureId` (select με τις υπογραφές, `Disabled` όσες δεν έχουν ενεργό προϊστάμενο), `Comment` | `CondIsReturnToDirector`, `CondIsReturnSxedio`, `CondIsReturnDraftTo`, `EnableWrongAssignAsDefaultEnergeiaType` |
| `UiAssign` | `Assignee` (users, ένας), `ExtraAssignees` (users), `Urgent`, `ForAnswer`, `Comment` | `Kinisi.UserReceivers`, `SecondaryChargeReceivers`, `UrgentFlags`, `IsForAnswerFlags`· προειδοποίηση `DocumentAlreadyAssignedTo` |
| `UiNotify`, `UiInform` | `Users`, `Comment` | `Kinisi.UserReceivers` |
| `UiChangeCreator` | `CreatedBy` (χρήστης· η υπηρεσία όπου επιλέγεται = `CreatedByGroup`), `CreatedForGroup` (μόνο εξερχόμενα) | `DefaultCreatedForGroup` |
| `UiSend`, `UiSendToChild`, `UiSendToFirstLevelChild` | `Groups` με `EnergeiaTypeId` και `Urgent` ανά υπηρεσία, `Comment` | `Kinisi.GroupReceivers`, `EnergeiaTypes`, `UrgentFlags`, «Επιλογή χαρακτηρισμού (μαζικά)» |

Οι τύποι ενέργειας (`EnergeiaTypes`) του mock είναι ενδεικτικοί· ο server στέλνει τον πίνακα της ΒΔ.

### `POST action`

```json
{
  "GroupId": 2,
  "Code": "UiAssign",
  "DocumentIds": [102300],
  "Values": {
    "Assignee": [{ "UserId": 11, "GroupId": 1 }],
    "ExtraAssignees": [],
    "Urgent": true,
    "ForAnswer": false,
    "Comment": "Για τις ενέργειές σας."
  }
}
```

```json
{ "Success": true, "Payload": { "Results": [{ "DocumentId": 102300, "Success": true }] } }
```

- Ο server μετατρέπει τα `Values` στα `ActionParams` που στέλνει σήμερα η φόρμα του Razor (`ActionParam.KEY_COMMENT`, `KEY_KINISEIS`, `KEY_URGENTFLAG`, `KEY_IS_FOR_ANSWER_FLAG`, …) και καλεί `IUiAction.ExecuteAction` ανά έγγραφο. Το υπάρχον `/document/action` δεν αρκεί: δέχεται `Dictionary<string, object>` που δεν γίνεται deserialize σε `Kinisi`/`BaseUser`.
- Ένα αποτέλεσμα ανά έγγραφο, με `Message` το μήνυμα του `ActionException` (ή του `CanExecute`). `Success: false` στο envelope μόνο για σφάλμα του αιτήματος.
- Ο server ξαναελέγχει `CanExecute` και τα υποχρεωτικά πεδία· ο client τα ελέγχει πρώτα μόνο για να δείξει το μήνυμα δίπλα στο πεδίο.
- `NewDocumentId`: για ενέργειες που δημιουργούν έγγραφο (Κλωνοποίηση, Ορθή Επανάληψη, φάση 8).

### `GET thematic-folders?GroupId=&Search=`

Αναζήτηση θεματικών φακέλων για το πεδίο `thematicFolders` (το autocomplete του `UiArchive` / `SelectParentFolder`): έως 20, `[{ Id, Name, Path }]`.

## Φάση 7: μαζικές ενέργειες και υπογραφή

### Μαζικές ενέργειες

Δεν χρειάζονται νέα endpoints:

- Το μενού «Ενέργειες» της επιλογής καλεί `POST actions` με όλα τα επιλεγμένα `DocumentIds` και κρατά όσες έχουν `Mass: true` (`_availableMassiveUiActions` του `UIActionsHelper`: Υπογραφή, Αρχειοθέτηση, Αποστολή και παραλλαγές, Χρέωση, Αποχρέωση, Γνωστοποίηση, Ενημέρωση, Αποστολή προς υπογραφή, Μετατροπή, ΔΙΑΥΓΕΙΑ κ.ά.).
- Η φόρμα είναι το `GET action-data/{code}` με όλα τα έγγραφα και η εκτέλεση το `POST action`, που ήδη επιστρέφει αποτέλεσμα ανά έγγραφο.
- **Διαφορά από το Razor:** το `UIMassiveActionsForEntities` απενεργοποιεί μια μαζική ενέργεια όταν έστω ένα έγγραφο δεν την επιτρέπει. Εδώ εκτελείται για όσα την επιτρέπουν και ο διάλογος δείχνει τα υπόλοιπα με τον λόγο. Ο server ελέγχει ξανά `CanExecute` ανά έγγραφο.
- Όσα έγγραφα πέτυχαν φεύγουν από την επιλογή· όσα απέτυχαν μένουν επιλεγμένα, με το μήνυμα, για νέα προσπάθεια.
- Χρειάζεται `action-data` για πολλά έγγραφα: ο server επιστρέφει τη φόρμα που ισχύει για όλα (στο Razor υπάρχουν ξεχωριστά views `UiMassiveDoc/UiMass*`).

### `GET sign-data?GroupId=&DocumentIds=`

Ό,τι δείχνει το `_UiSignPartial` / `UiMassDigitalSign` για αυτά τα έγγραφα:

```json
{
  "Title": "Υπογραφή",
  "Signer": { "Name": "Admina Admin", "Group": "Κεντρικό Πρωτόκολλο" },
  "Tokens": [
    { "Id": 10, "Title": "HARICA – Απομακρυσμένη υπογραφή", "IsRemote": true, "OtpLength": 6 },
    { "Id": 1, "Title": "Safenet (USB token)", "IsRemote": false }
  ],
  "DefaultTokenId": 10,
  "AllowWithoutDigital": true,
  "AppendSignature": null,
  "SignAsFinalSigner": null,
  "UseUserImage": null,
  "CommentMaxLength": 1000,
  "Classic": null
}
```

- `Tokens`: τα `DigitalSignatureTokens` του χρήστη με `CanSign` (`OrgUserDigitalSignatureTokens`), `DefaultTokenId` το `UserDefaultDigitalSignatureToken`.
- `AllowWithoutDigital`: σχέδια (`allowSignWithoutToken`) → `NonDigitalSignature`.
- `AppendSignature`, `UseUserImage`: υπογραφή βεβαίωσης σε εισερχόμενα/εξερχόμενα (`showAppendSignatureCheckbox`, `showUserImageSelection`)· `SignAsFinalSigner`: `EapImplementationSignAsFinalSignerOrExactCopy`.
- `Classic`: όταν η υπογραφή πρέπει να τοποθετηθεί με το χέρι στο PDF (`forceSignaturePlaceSelection`, υπογραφή ως πρωτότυπο) ή όταν ο χρήστης έχει μόνο USB tokens.

### `POST sign/otp`

```json
{ "GroupId": 2, "TokenId": 10, "Username": "…", "Password": "…" }
```

Ό,τι κάνει σήμερα το MVC `Helper/RequestOtpForSDDDSign`. Επιστρέφει `{ "Message": "Ο κωδικός OTP στάλθηκε … στο a***@… Ισχύει για 5 λεπτά." }` ή `Success: false` με το μήνυμα για λάθος στοιχεία, κλειδωμένο λογαριασμό, άγνωστο υπογράφοντα (Outcome 9) ή OTP από εφαρμογή (Outcome 1).

### `POST sign`

```json
{
  "GroupId": 2,
  "DocumentIds": [103174, 103288],
  "Digital": true,
  "TokenId": 10,
  "Username": "…",
  "Password": "…",
  "Otp": "123456",
  "Comment": ""
}
```

- Για κάθε έγγραφο ό,τι κάνει το `/sign/remote/document` (`RemoteDocumentSignatureRequest`: `IsRemote`, `UserTokenId`, `SignApi*`, `Otp`, `NonDigitalSignature` = `!Digital`, `AppendSignature`, `SignAsFinalSigner`, `UseUserImageOnSign`), και για πολλά με ένα OTP, όπως το `MassAction/MassDigitalRemoteSign`.
- Απάντηση όπως το `POST action`: `Results[{ DocumentId, Success, Message }]`. Λάθος OTP: όλα αποτυγχάνουν με το ίδιο μήνυμα· ο client σβήνει το OTP και ζητά νέο.
- Κωδικός και OTP δεν αποθηκεύονται πουθενά στον client· ζουν μόνο στον διάλογο.
- **Εκτός:** USB token (`/pre-sign/token/document` + υπογραφή του hash από το πρόσθετο του browser + `/sign/token/document`) και επιλογή θέσης υπογραφής στο PDF. Ανοίγουν στο κλασικό UI. Θέλει έλεγχο αν το πρόσθετο δέχεται αιτήματα από το `/apps-next/`.

