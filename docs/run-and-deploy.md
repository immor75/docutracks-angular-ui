# Docutracks Angular UI: εκτέλεση και deploy

Όλοι οι τρόποι εκτέλεσης του Angular UI τοπικά, και το deploy στο δοκιμαστικό περιβάλλον (test-new). Ενημερώθηκε 25/10/2026.

Δύο repos δουλεύουν μαζί:

| Repo | Τοπικά | Τι είναι |
| --- | --- | --- |
| `docutracks-angular-ui` | `E:\Repos\docutracks-angular-ui` | Το UI (Αρχική, Έγγραφα, Υποθέσεις) |
| `docutracks-api` | `E:\Repos\docutracks-api` | Το API v2 (.NET 8) για τα Έγγραφα και τις Υποθέσεις. Δεν αλλάζει τίποτα στο Docutracks |

Το UI καλεί τα endpoints με τη μορφή `/services/v2/...`. Η βάση τους αλλάζει ανά build:

| Build | Βάση API v2 | Χρειάζεται |
| --- | --- | --- |
| Development (`npm start`, `start:test-new`) | `/services/v2` | mock ή test-new |
| `-c api` (`start:test-new-api`) | `/api/v2` | το API v2 τοπικά |
| Production (`npm run build`) | `/api/v2` | το API v2 στον server (`/api`) |
| Production χωρίς API (`npm run build:services`) | `/services/v2` | τίποτα επιπλέον· **μόνο Υποθέσεις** |

Το test-new δεν έχει τα Έγγραφα στο `/services/v2`· αυτά τα δίνει μόνο το API v2.

## 1. Προαπαιτούμενα

- **Node.js 22.22.3 ή νεότερο, ή 24.x.** Με παλαιότερο το Angular CLI σταματά με «requires a minimum Node.js version». Με nvm: `nvm install 24 && nvm use 24`.
- `npm ci` στο `docutracks-angular-ui`, μία φορά και μετά από κάθε αλλαγή του `package-lock.json`.
- Για τα σενάρια με API: **.NET 8 SDK** (ή Visual Studio 2022 17.8+), και πρόσβαση από το μηχάνημα στον SQL Server του test-new (`192.168.1.111`).
- Για τα smoke tests (προαιρετικά): `npm i -D playwright axe-core`.

## 2. Εκτέλεση με τον dev server (http://localhost:4200)

### Α. Με mock δεδομένα, χωρίς server

Δύο τερματικά στο `docutracks-angular-ui`:

```bash
npm run mock      # mock API στο http://localhost:3001
npm start         # http://localhost:4200
```

- Σύνδεση: `admin` / `admin`.
- Δεδομένα: 1.309 υποθέσεις και 2.180 έγγραφα, από την Postman collection. Οι εγγραφές μένουν στη μνήμη του mock.
- Αρχικά δεδομένα ξανά: `http://localhost:3001/__mock/reset/?data=1` ή επανεκκίνηση του `npm run mock`.
- Το mock υλοποιεί μόνο του τα endpoints του API v2· το .NET API δεν χρειάζεται.

### Β. Με το test-new, μόνο Υποθέσεις

```bash
npm run start:test-new
```

- Το proxy (`proxy.test-new.json`) στέλνει το `/services` στο https://test-new.docutracks.eu και γράφει το cookie σύνδεσης για το `localhost`.
- Σύνδεση με τον λογαριασμό του test-new, από τη φόρμα της εφαρμογής.
- Τα Έγγραφα δεν δουλεύουν σε αυτόν τον τρόπο (το test-new δεν έχει `/services/v2/documents`).

### Γ. Με το test-new και το API v2 τοπικά: Έγγραφα και Υποθέσεις

**Μία φορά**, το connection string της βάσης του test-new στα user secrets του API (μένουν στο προφίλ των Windows, εκτός git). Visual Studio: δεξί κλικ στο `Docutracks.Api` → *Manage User Secrets*:

```json
{
  "ConnectionStrings": {
    "Docutracks": "Server=192.168.1.111;Database=Docman;User Id=<login>;Password=<κωδικός>;Trusted_Connection=False;TrustServerCertificate=True"
  }
}
```

Ή από γραμμή εντολών:

```bash
cd E:\Repos\docutracks-api\src\Docutracks.Api
dotnet user-secrets set "ConnectionStrings:Docutracks" "Server=...;Database=Docman;User Id=...;Password=...;TrustServerCertificate=True"
```

Το `TrustServerCertificate=True` χρειάζεται επειδή το πιστοποιητικό του SQL Server του test-new δεν είναι έμπιστο για το μηχάνημα. Αρκεί login με δικαίωμα μόνο ανάγνωσης (`db_datareader`).

**Κάθε φορά**, δύο τερματικά:

```bash
# 1. Το API v2 (profile test-new: http://localhost:5266/api)
dotnet run --project E:\Repos\docutracks-api\src\Docutracks.Api --launch-profile test-new
#    ή στο Visual Studio: profile «test-new» και F5

# 2. Το UI, στο docutracks-angular-ui
npm run start:test-new-api     # http://localhost:4200
```

- Έλεγχος του API: http://localhost:5266/api/health → `{"Status":"ok"}`.
- Το proxy (`proxy.test-new-api.json`) στέλνει το `/api` στο API (localhost:5266) και το `/services` στο test-new. Ο browser στέλνει το cookie σύνδεσης και στο `/api`, οπότε το API ενεργεί ως ο ίδιος χρήστης.
- Στο development το API γράφει την αιτία ενός σφάλματος μέσα στο μήνυμα, σε `[...]`, και κρατά τη σελίδα του Docutracks μιας αποθήκευσης που απέτυχε στο `E:\Repos\docutracks-api\.temp\classic\`.
- **Οι εγγραφές είναι πραγματικές** (χρέωση, αποστολή, καταχώριση, επεξεργασία): μόνο σε δεδομένα δοκιμής, π.χ. στην υπηρεσία 2 «Test».

## 3. Το production build τοπικά (όπως στον server)

```bash
npm run build                # dist/docutracks-angular-ui/browser, base href /apps-next/, API v2 στο /api/v2
npm run preview              # http://localhost:4400/apps-next/ με το mock (npm run mock σε άλλο τερματικό)
npm run preview:test-new     # http://localhost:4200/apps-next/ με το test-new και το API v2 τοπικά
```

- Το `tools/serve-dist.mjs` σερβίρει το build όπως ο IIS: στο `/apps-next/`, με gzip, cache για τα αρχεία με hash και SPA fallback.
- `preview`: το `/services` πάει στο mock, και το `/api/v2/...` απαντάται από το `/services/v2/...` του mock.
- `preview:test-new`: το `/services` πάει στο test-new και το `/api` στο API v2 στο http://localhost:5266 (πρέπει να τρέχει, όπως στο 2Γ). Άλλη διεύθυνση API: `API=http://host:port npm run preview:test-new`.
- `npm run build:services`: production build που καλεί το `/services/v2` (χωρίς API). Μόνο για deploy πριν εγκατασταθεί το API v2· τα Έγγραφα δεν δουλεύουν.

## 4. Deploy στο test-new

Σειρά: **πρώτα το API v2, μετά το UI.** Το production build του UI καλεί το `/api/v2` για Έγγραφα και Υποθέσεις· χωρίς το API δεν δουλεύει καμία από τις δύο λίστες.

### 4.1 API v2 (μία φορά, και σε κάθε νέα έκδοση)

Αναλυτικά στο `docs/deploy.md` του `docutracks-api`. Συνοπτικά:

1. Στον server: **ASP.NET Core 8 Hosting Bundle**, μετά `iisreset`.
2. Publish από το Visual Studio: `Docutracks.Api` → *Publish* → Folder, Release, Framework-dependent, win-x64. (Όχι με `-p:Offline=true`.)
3. Αντιγραφή του φακέλου publish π.χ. στο `D:\inetpub\DocutracksApi`.
4. IIS: application pool `DocutracksApi` (*No Managed Code*). Στο site του Docutracks: *Add Application* → alias `api`, αυτός ο pool και αυτός ο φάκελος.
5. Δίπλα στο `Docutracks.Api.dll`, ένα `appsettings.Production.json` από το `appsettings.Production.sample.json`:
   - `PathBase`: `/api`
   - `ConnectionStrings:Docutracks`: η βάση του test-new, με `TrustServerCertificate=True`
   - `V1:BaseUrl`: `https://test-new.docutracks.eu/`
   - `Classic:Culture`: `el`
   - `Files:TempPath`: π.χ. `D:\DocutracksApiTemp`, με δικαίωμα *Modify* για `IIS AppPool\DocutracksApi`
6. Έλεγχος: `https://test-new.docutracks.eu/api/health` → `{"Status":"ok"}`. Αν βγει 500.19/500.21, το `/api` κληρονομεί modules από το `Web.config` του Docutracks: δείτε το `docs/deploy.md` του API.

Νέα έκδοση του API: `app_offline.htm` στον φάκελο του API (ή stop του pool), αντιγραφή του νέου publish, διαγραφή του `app_offline.htm`.

### 4.2 Angular UI

Στο `docutracks-angular-ui`:

```bash
git pull
npm ci
npm run lint
npm test
npm run build      # με API v2· χωρίς API ακόμη: npm run build:services
```

Στον server:

1. Κράτησε αντίγραφο του τρέχοντος φακέλου `apps-next` (π.χ. `apps-next_2026-10-25`), για επιστροφή.
2. Άδειασε τον φάκελο `apps-next` του site του Docutracks και αντίγραψε μέσα **όλο** το περιεχόμενο του `dist\docutracks-angular-ui\browser\`, μαζί με το `web.config`.
   - Το `apps-next` είναι απλός φάκελος (ή virtual directory) του site, **όχι** IIS application.
   - Το `web.config` κάνει το SPA fallback και θέλει το **URL Rewrite** module του IIS.
3. Δεν χρειάζεται `iisreset`. Το `index.html` δεν μπαίνει σε cache, οπότε οι χρήστες παίρνουν τη νέα έκδοση με το επόμενο άνοιγμα. Τα υπόλοιπα αρχεία έχουν hash στο όνομα.

Έλεγχος μετά το deploy, στο https://test-new.docutracks.eu/apps-next/:

- Σύνδεση. Αν ο χρήστης είναι ήδη συνδεδεμένος στο FolderUI στην ίδια καρτέλα, δεν ξαναζητά σύνδεση.
- Έγγραφα: φάκελοι αριστερά, λίστα, άνοιγμα ενός εγγράφου.
- Υποθέσεις: είδη αριστερά, λίστα, άνοιγμα μιας υπόθεσης.
- Αλλαγή υπηρεσίας από το header.
- Μία εγγραφή σε έγγραφο δοκιμής (π.χ. σημαντικό/αναγνωσμένο).

### 4.3 Επιστροφή στην προηγούμενη έκδοση

- UI: αντιγραφή πίσω του αντιγράφου του `apps-next`.
- API: ο προηγούμενος φάκελος publish, ή αφαίρεση της εφαρμογής `/api` από τον IIS. Το Docutracks δεν επηρεάζεται.

## 5. Συχνά προβλήματα

| Σύμπτωμα | Αιτία, λύση |
| --- | --- |
| «The Angular CLI requires a minimum Node.js version» | Node παλαιότερο από 22.22.3: `nvm use 24` |
| Τα Έγγραφα είναι άδεια ή αποτυγχάνουν στο `start:test-new` | Αναμενόμενο: χρησιμοποίησε `start:test-new-api` (2Γ) |
| `502` στο `/api/...` (dev server ή preview) | Το API v2 δεν τρέχει στο localhost:5266 |
| «Λείπει το ConnectionStrings:Docutracks» | Δεν έχει οριστεί στα user secrets (2Γ) ή στο `appsettings.Production.json` |
| «The certificate chain was issued by an authority that is not trusted» | Πρόσθεσε `TrustServerCertificate=True` στο connection string |
| «A network-related or instance-specific error» | Ο SQL Server του test-new δεν είναι προσβάσιμος (VPN, firewall 1433) |
| «Η σύνδεση έληξε» / 401 | Νέα σύνδεση στο UI· στο 2Γ το cookie ισχύει όσο και στο test-new |
| Αποτυχία αποθήκευσης εγγράφου | Το μήνυμα του Docutracks εμφανίζεται στο UI· στο development η σελίδα του κρατιέται στο `.temp\classic\` του API |
| IIS 500.19 στο `/apps-next/` | Λείπει το URL Rewrite module |
| IIS 500.19/500.21 στο `/api/` | Κληρονομιά από το `Web.config` του Docutracks (4.1, βήμα 6) |
| Η ταξινόμηση κατά ημερομηνία δεν αλλάζει φορά | Γνωστός περιορισμός: το Docutracks δίνει μόνο τη δική του σειρά |

## 6. Έλεγχοι

```bash
npm run lint          # ESLint
npm test              # Vitest
```

Smoke tests με Playwright (με `npm run mock` και `ng serve --port 4300 --proxy-config proxy.mock.json`): `node tools/<όνομα>.mjs`. Η λίστα τους είναι στο README. Στο API: `dotnet run --project tests/Docutracks.Api.Tests`.
