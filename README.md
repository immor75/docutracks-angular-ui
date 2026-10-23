# FolderUI Next

Παράλληλη υλοποίηση του περιβάλλοντος υποθέσεων του Docutracks. Χρησιμοποιεί το ίδιο API (`/services/v2/folders/*`) και την ίδια αισθητική με το FolderUI, με στόχο την απόδοση και την ευχρηστία.

- **Έκδοση v1:** λίστα υποθέσεων, φίλτρα, ταξινόμηση, αναζήτηση, προβολή υπόθεσης. Δεν περιλαμβάνει ενέργειες εγγραφής· αυτές εκτελούνται στο υπάρχον FolderUI.
- **Πλάνο και μετρήσεις:** το έγγραφο «Πλάνο υλοποίησης FolderUI Next» στο project «Docutracks New UI».

## Απαιτήσεις

- Node.js **22.22.3 ή νεότερο**, ή 24.x. Το Angular 22 δεν τρέχει στο Node 22.0.0 που αναφέρει το #56654: `nvm install 24 && nvm use 24`.
- Για την ανάπτυξη δεν χρειάζεται backend: υπάρχει mock με τα δεδομένα της Postman collection.

## Εκτέλεση

```bash
npm ci

# 1. Με το mock (δύο τερματικά)
npm run mock          # http://localhost:3001, 1.309 υποθέσεις, χρήστης admin / κωδικός admin
npm start             # http://localhost:4200

# 2. Με το test-new (πραγματικά δεδομένα)
npm run start:test-new
```

Στο `start:test-new` η σύνδεση γίνεται με τη φόρμα της εφαρμογής, που καλεί το ίδιο `/services/authentication/login` με το FolderUI. Το proxy (`proxy.test-new.json`) ξαναγράφει το cookie για το `localhost`.

## Build και deploy

```bash
npm run build         # dist/folderui-next/browser, με base href /apps-next/
```

Το περιεχόμενο του `dist/folderui-next/browser` αντιγράφεται στο `/apps-next/` του ίδιου site με το Docutracks. Μαζί αντιγράφεται και το `web.config` (SPA fallback, χρειάζεται το URL Rewrite). Η εφαρμογή χρησιμοποιεί μόνο relative κλήσεις `/services/*`, γι' αυτό δεν υπάρχει `baseUrl` σε environment αρχείο.

### Δοκιμή του production build χωρίς deploy

```bash
npm run build
npm run preview:test-new   # http://localhost:4200/apps-next/ με το API του test-new
npm run preview            # http://localhost:4400/apps-next/ με το mock (npm run mock σε άλλο τερματικό)
```

Το `tools/serve-dist.mjs` σερβίρει το build όπως ο IIS: στο `/apps-next/`, με gzip, μόνιμο cache για τα αρχεία με hash και SPA fallback. Προωθεί τα `/services/*` στο API και γράφει το cookie του Docutracks στο localhost, άρα η σύνδεση γίνεται όπως στον server.

Αν ο χρήστης έχει ήδη συνδεθεί στο FolderUI στην ίδια καρτέλα, η εφαρμογή χρησιμοποιεί το token του (`access_token`, `current_user` στο sessionStorage), οπότε δεν ξαναζητά σύνδεση.

## Έλεγχοι

```bash
npm run lint          # ESLint (angular-eslint), με κανόνες για any, console, OnPush, signals
npm test              # Vitest
```

Στον φάκελο `tools/` υπάρχουν scripts για Playwright. Χρειάζονται `npm i -D playwright axe-core` και τρέχουν με το mock:

- `smoke.mjs`: σύνδεση, λίστα, αναζήτηση (μετράει τις κλήσεις), φίλτρα, πλοήγηση μόνο με πληκτρολόγιο, έλεγχος axe (WCAG 2.1 AA), screenshots σε desktop, tablet και κινητό.
- `actions-smoke.mjs`: οι ενέργειες εγγραφής στο mock (χρέωση, αποστολή, κοινή χρήση, αλλαγή τύπου, εκτύπωση, αρχειοθέτηση, κλωνοποίηση, διαγραφή, μαζική αρχειοθέτηση με μερική αποτυχία και επανάληψη), με axe στους διαλόγους. Ξεκινά με `/__mock/reset/?data=1`, ώστε κάθε εκτέλεση να βρίσκει τα ίδια δεδομένα.
- `editor-smoke.mjs`: Καταχώριση και Επεξεργασία (επικύρωση, τοποθεσία, εμπλεκόμενος, έγγραφο, Formio, αποθήκευση και επανέλεγχος των δεδομένων, προειδοποίηση πριν φύγετε, σφάλμα server, κινητό), με axe.
- `preview-smoke.mjs`: ειδικά στοιχεία στο «Γενικά» (σειρά, ετικέτες, πίνακες, κενά) και μεγέθυνση, με axe.
- `measure-editor.mjs`: στο production build, χρόνος και bytes για τον editor και το Formio.
- `serve-dist.mjs` και `measure.mjs`: σερβίρουν το production build με gzip και μετρούν bytes, κλήσεις API και χρόνο μέχρι να εμφανιστούν οι γραμμές.

## Δομή

```
src/app/
  core/           models (συμβόλαια API), session (σύνδεση, υπηρεσία), http (interceptor, guard), folders-api (κλήσεις + cache),
                  actions-api (ενέργειες εγγραφής, οργανόγραμμα, ρυθμίσεις)
  shell/          header με επιλογή υπηρεσίας και χρήστη
  features/
    folders/      σελίδα λίστας: URL state (folder-query), store (rxResource), sidebar, πίνακας/κάρτες, φίλτρα, σελιδοποίηση
    folder-detail προβολή υπόθεσης (lazy chunk)
    editor/       Καταχώριση και Επεξεργασία (lazy, σελίδα /new και /:id/edit): store, καρτέλες, Formio (lazy), pickers
    actions/      κατάλογος ενεργειών, runner, μενού ενεργειών, διάλογος (lazy chunk με @defer), επιλογή από οργανόγραμμα
    login/        φόρμα σύνδεσης (lazy chunk)
  ui/icon.ts      Hugeicons, μόνο όσα χρησιμοποιούνται
  ui/toasts.ts    μηνύματα επιβεβαίωσης (aria-live)
mock/server.mjs   mock του FoldersModule API, χωρίς dependencies
```

## Βασικές επιλογές

| Επιλογή | Λόγος |
| --- | --- |
| Angular 22, zoneless, OnPush, signals | Ελέγχονται μόνο τα components που άλλαξαν. Το zone.js δεν μπαίνει στο bundle |
| Η κατάσταση της λίστας ζει στο URL (`?t=&q=&s=&p=&o=`) | Links που μοιράζονται, λειτουργικό back, διατήρηση σε refresh |
| `rxResource` για λίστα και υπόθεση | Μία κλήση ανά αλλαγή, οι προηγούμενες ακυρώνονται |
| Cache 60 s και prefetch (επόμενη σελίδα, υπόθεση σε hover/focus) | Το «Επόμενη» και το άνοιγμα υπόθεσης είναι άμεσα |
| Ένα component ανά οθόνη και CSS container queries | Πίνακας ή κάρτες ανάλογα με τον διαθέσιμο χώρο, χωρίς ξεχωριστά desktop και mobile components |
| Native `<table>`, `popover`, `<select>`, tabs κατά WAI-ARIA | Προσβασιμότητα χωρίς βιβλιοθήκη overlays |
| Ένας διάλογος για όλες τις ενέργειες, σε native `<dialog>`, που φορτώνει με `@defer` στην πρώτη ενέργεια | Focus trap και Esc από τον browser. Ο κώδικας των διαλόγων (≈9 KB) δεν βαραίνει την πρώτη φόρτωση |
| Επιλογή από οργανόγραμμα ως μία λίστα με αναζήτηση χωρίς τόνους | 291 υπηρεσίες και 1.248 χρήστες στο test-new: η αναζήτηση φιλτράρει όλο το δέντρο αμέσως, χωρίς mat-tree |

## Πληκτρολόγιο

| Πλήκτρο | Ενέργεια |
| --- | --- |
| `/` | Αναζήτηση |
| `↑` `↓` | Μετακίνηση στις γραμμές της λίστας |
| `Enter` | Άνοιγμα υπόθεσης |
| `j` / `k` | Επόμενη / προηγούμενη υπόθεση, μέσα στην προβολή |
| `←` `→` | Μετακίνηση στα tabs της προβολής |
| `Esc` | Κλείσιμο προβολής ή μενού |
| `f` | Μεγέθυνση / σμίκρυνση της προβολής, μέσα στην προβολή |
| `n` | Νέα υπόθεση, από τη λίστα |
| `Ctrl` / `⌘` + `S` | Αποθήκευση, στον editor |

## Προβολή υπόθεσης

- **Ειδικά στοιχεία:** στην καρτέλα «Γενικά», κάτω από τα βασικά στοιχεία, σε δική τους περιοχή. Διαβάζονται από το `Metadata` με τα πεδία Formio του είδους: οι επιλογές με την ετικέτα τους, οι ημερομηνίες μορφοποιημένες, οι πίνακες (data grid) ως πίνακες. Φαίνονται τα συμπληρωμένα· το «Εμφάνιση κενών» δείχνει και τα υπόλοιπα. Είδη χωρίς Formio δεν δείχνουν την περιοχή.
- **Μεγέθυνση:** το κουμπί δίπλα στα βέλη (ή `f`) απλώνει την προβολή σε όλο το πλάτος και κρύβει λίστα και είδη. Τα `j`/`k` συνεχίζουν να αλλάζουν υπόθεση. Η επιλογή θυμάται ανά συσκευή. Στο κινητό η προβολή είναι ήδη πλήρους οθόνης.

## Ενέργειες (Φάση 4)

Ο κατάλογος `features/actions/action-catalog.ts` αντιστοιχίζει κάθε κωδικό ενέργειας σε έναν τύπο διαλόγου. Τα σώματα των αιτημάτων είναι ίδια με του FolderUI (`AppFolderStateServiceCore`) και της Postman collection.

| Ενέργεια | Endpoint | Τι στέλνεται |
| --- | --- | --- |
| Αρχειοθέτηση, Αναίρεση, Επιστροφή, Ανάληψη ελέγχου, Κλωνοποίηση, Διαγραφή | `/v2/folders/action/` | `ActionParams { Comment, SelectedTargetOwningGroupId: 0, CustomData: [] }` |
| Αποστολή | `/v2/folders/action/` | `SelectedTargetOwningGroupId` = η υπηρεσία-παραλήπτης. Επιτρέπονται μόνο υπηρεσίες με Owner/Editor στο είδος (`folder-type-instance-extended`) |
| Χρέωση | `/v2/folders/assign/` | `AssigneesIds`. Χρήστες από την υπηρεσία-κάτοχο (`get-organization-tree`) ή, για κάτοχο 1, από `users-to-assign` |
| Κοινή χρήση | `/v2/folders/share/` | `GroupIds: "2,3"`, `UsersGroupsIds: "userId-groupId, …"`. Η λίστα αντικαθιστά την τρέχουσα (κενή = αφαίρεση) |
| Αλλαγή τύπου | `/v2/folders/change-type/` | `FolderTypeInstanceId` από `folder-types/{id}/available-instances` |
| Μαζική εκτύπωση | `/v2/folders/massive-print/` | `DocumentCopyIds`, απάντηση PDF |
| Ιστορικό | — | ανοίγει το tab «Ιστορικό» |
| Νέα, Επεξεργασία, BPMN και οι υπόλοιπες | — | ανοίγουν το κλασικό FolderUI |

Μαζικές ενέργειες: επιλογή γραμμών με checkbox, μία κλήση `actions` για όλες, και προσφέρονται μόνο όσες ισχύουν για όλες τις επιλεγμένες. Εκτελούνται μία προς μία. Αν κάποιες αποτύχουν, ο διάλογος δείχνει ποιες και γιατί, και η «Επανάληψη» στέλνει μόνο αυτές.

Ελέγχθηκαν στο test-new, στην υπόθεση δοκιμής «τεστ 44» (10025484): Αποστολή, Χρέωση, Κοινή χρήση και αφαίρεσή της, Αρχειοθέτηση, Αναίρεση αρχειοθέτησης, Ανάληψη ελέγχου, Επιστροφή. Η υπόθεση επανήλθε στην αρχική υπηρεσία και χειριστή. Η Κλωνοποίηση απέτυχε από τον server (η διαδικασία BPMN «NonExistentDiagram» είναι suspended στο test-new). Αλλαγή τύπου και Μαζική εκτύπωση δεν δοκιμάστηκαν εκεί, γιατί η υπόθεση έχει ένα μόνο διαθέσιμο είδος και κανένα έγγραφο.

## Καταχώριση και Επεξεργασία

Ο editor είναι ξεχωριστή σελίδα (`/new?inst=` και `/:id/edit`), lazy chunk 28 KB. Η λίστα και η υπόθεση δεν ξαναφορτώνουν: η σελίδα θυμάται από πού ήρθατε και επιστρέφει εκεί, με την υπόθεση ανοιχτή.

| Καρτέλα | Τι κάνει | API |
| --- | --- | --- |
| Γενικά | Τίτλος (υποχρεωτικός, ≥3 χαρακτήρες), πληροφορίες, συνδεδεμένες υποθέσεις, τοποθεσία σε σειρά Περιφέρεια → Νομός → Δήμος → Κοινότητα | `related-folders`, `location/list/{1..4}` |
| Εμπλεκόμενοι | Ανά ρόλο, με τα όρια min/max του είδους. Επαφές, χρήστες ή υπηρεσίες, όπως επιτρέπει ο ρόλος | `contact/search`, `get-organization-tree` |
| Έγγραφα και αρχεία | Συσχέτιση εγγράφων ΣΗΔΕ, ετικέτες, αρχεία (upload ως Base64, όπως το FolderUI) | `documents-for-relation`, `get-file-stream` |
| Ειδικά στοιχεία | Η φόρμα Formio του είδους, με το `@formio/js` του FolderUI. Αποθηκεύεται στο `Metadata` ως XML | — |
| Προθεσμίες, Ένδικα μέσα, Ενέργειες | Όπως στο FolderUI, εφόσον το είδος έχει τις καρτέλες | — |

Αποθήκευση: `POST /v2/folders/register/` (νέα) και `/v2/folders/edit/`, με τα πεδία του `FolderModuleTemplate` του DocuLibrary. Οι ενέργειες (`FolderEnergies`) στέλνονται μόνο όταν άλλαξαν.

**Formio.** Το `@formio/angular` θέλει zone.js και Angular ως 21, ενώ το Next είναι zoneless σε Angular 22. Χρησιμοποιείται απευθείας το `@formio/js` 5.7 (ίδια έκδοση με το FolderUI), που φορτώνει μόνο όταν ανοίξει η καρτέλα (452 KB gzip). Το date picker και τα δεδομένα ζώνης ώρας σερβίρονται από το `/apps-next/formio/` αντί για το cdn.form.io. Τα select είναι native `<select>` αντί για Choices.js, για πληκτρολόγιο και screen readers.

## Ανοιχτά θέματα

- Η επιλογή υπηρεσίας χρειάζεται το `/services/users/{name}/` (≈290 KB στο test-new). Ένα ελαφρύ endpoint που επιστρέφει μόνο τις υπηρεσίες με FoldersModule θα έκοβε ακόμη ≈0,3 s από την πρώτη φόρτωση.
- Το `users-to-assign` επιστρέφει πλήρεις εγγραφές χρηστών με όλες τις σχέσεις (≈440 KB, ≈1 s στο test-new) ενώ ο διάλογος χρειάζεται μόνο id και όνομα. Κρατιέται σε cache 10 λεπτών, αλλά ένα `?fields=Id,DisplayName` στον server θα το έκανε ≈20 KB.
- Τα ειδικά φίλτρα ανά τύπο υπόθεσης (Formio) δεν έχουν υλοποιηθεί, γιατί δεν είναι τεκμηριωμένες οι τιμές τους στο API.
- Οι εργασίες BPMN ανοίγουν ακόμη το κλασικό FolderUI.
- Νέα επαφή δεν δημιουργείται από τον editor: γίνεται από το μητρώο επαφών.
