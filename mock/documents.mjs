// Mock of the documents API v2 (έγγραφα), see docs/documents-api.md. Folders, labels and
// search types follow the Razor catalog (ListModel.FolderTypes, SearchConstants) as seen on
// test-new on 23/10/2026. The data are generated with their own seed, so that adding them
// does not change the folders mock.

import { USERS, fail, json, norm } from './lib.mjs';
import { FILTERS, criteriaMatch, enrich } from './documents-filters.mjs';

const send = (...args) => (json(...args), true);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 23, 9);
const iso = (t) => new Date(t).toISOString();
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
const ME = USERS[0].DisplayName;

/* ---------- folders ---------- */

// Who sees what (ListModel: Display = IsDirector || IsSecretarialSupport …). Group 2: director,
// 4: secretarial support, 7: plain employee.
const ROLE = { 2: 'director', 4: 'secretary', 7: 'employee' };
const managerOnly = (role) => role !== 'employee';

// Children are [key, label, test, visible(role)?]. Keys: `{DocType}.{FolderType}.{Visibility}`.
const SECTIONS = [
  { key: '0.0.GroupOwned', label: 'Κύρια', test: (d) => !d.sub },
  {
    key: '1.0.GroupOwned', label: 'Εισερχόμενα', type: 1,
    children: [
      ['1.11.GroupOwned', 'Εκκρεμή', (d) => ['outstanding', 'charged'].includes(d.state)],
      ['1.9.GroupOwned', 'Χρεωμένα', (d) => d.state === 'charged', managerOnly],
      ['1.30.GroupOwned', 'Χρεωμένα σε εμένα', (d) => d.state === 'charged' && d.toMe],
      ['1.31.GroupOwned', 'Εσωτερική Διανομή', (d) => d.state === 'informed'],
      ['1.12.GroupOwned', 'Απαντημένα', (d) => d.state === 'replied'],
      ['1.8.GroupOwned', 'Αρχειοθετημένα', (d) => d.state === 'archived'],
      ['1.10.GroupOwned', 'Κοινοποιηθέντα', (d) => d.state === 'announced', managerOnly],
      ['1.14.GroupOwned', 'Απεσταλμένα', (d) => d.state === 'sent'],
      ['1.13.GroupOwned', 'Επιστραφέντα', (d) => d.state === 'returned', managerOnly],
      ['1.37.GroupOwned', 'Επιστραφέντα από υπηρεσίες', (d) => d.state === 'returned' && d.byGroup],
      ['1.33.GroupOwned', 'Επιστραφέντα σε εμένα', (d) => d.state === 'returned' && d.toMe],
    ],
  },
  {
    key: '2.0.GroupOwned', label: 'Εξερχόμενα', type: 2,
    children: [
      ['2.17.GroupOwned', 'Απεσταλμένα', (d) => d.state === 'sent'],
      ['2.23.GroupOwned', 'Απαντημένα', (d) => d.state === 'replied'],
      ['2.16.GroupOwned', 'Μη απεσταλμένα', (d) => d.state === 'notsent'],
      ['2.15.GroupOwned', 'Αρχειοθετημένα', (d) => d.state === 'archived'],
      ['2.24.GroupOwned', 'Επιστραφέντα', (d) => d.state === 'returned'],
      ['2.38.GroupOwned', 'Επιστραφέντα από υπηρεσίες', (d) => d.state === 'returned' && d.byGroup],
      ['2.18.GroupOwned', 'Υπογεγραμμένα', (d) => d.signed],
    ],
  },
  {
    key: '3.0.Global', label: 'Σχέδια', type: 3,
    children: [
      ['3.40.Global', 'Στάδιο Υπογραφών', (d) => d.state === 'tosign', managerOnly],
      ['3.-411.Global', 'Εγκεκριμένα', (d) => d.consult === 'approved', managerOnly],
      ['3.-410.Global', 'Εγκεκριμένα με επισημάνσεις', (d) => d.consult === 'remarks', managerOnly],
      ['3.-409.Global', 'Προς Επιστροφή', (d) => d.consult === 'returned', managerOnly],
      ['3.1.Global', 'Προς υπογραφή', (d) => d.state === 'tosign', managerOnly],
      ['3.23.Global', 'Προς υπογραφή από εμένα', (d) => d.state === 'tosign' && d.toMe],
      ['3.5.Global', 'Με τελική υπογραφή', (d) => d.state === 'finalsigned'],
      ['3.41.Global', 'Προς υπογραφή από προϊστάμενο', (d) => d.state === 'tosign' && !d.toMe, (r) => r === 'secretary'],
      ['3.2.Global', 'Υφισταμένων Υπηρεσιών', (d) => d.state === 'tosign' && d.fromSub, managerOnly],
      ['3.4.Group', 'Αρχειοθετημένα', (d) => d.state === 'archived'],
      ['3.3.Global', 'Υπογεγραμμένα', (d) => d.signed, managerOnly],
      ['3.22.Global', 'Υπογεγραμμένα από εμένα', (d) => d.signed && d.toMe],
      ['3.7.Global', 'Επιστραφέντα από εμένα', (d) => d.state === 'returned' && d.toMe],
      ['3.6.Global', 'Επιστραφέντα από ανώτερους', (d) => d.state === 'returned' && !d.toMe, managerOnly],
    ],
  },
  { key: '-9995.0.GroupOwned', label: 'Εσωτερικά Σημειώματα', test: (d) => d.kind === 'Εσωτερικό σημείωμα' },
  { key: '4.19.GroupOwned', label: 'Υποστηρικτικά Έγγραφα', type: 4 },
  {
    label: 'Υπογεγραμμένα',
    children: [
      ['-9994.34.Global', 'Όλα', (d) => d.signed],
      ['-9994.35.Global', 'Εξερχόμενα', (d) => d.signed && d.type === 2],
      ['-9994.36.Global', 'Σχέδια', (d) => d.signed && d.type === 3],
    ],
  },
  {
    label: 'Γνωστοποιηθέντα',
    children: [
      ['-9998.25.Global', 'Όλα', (d) => d.notified],
      ['-9998.26.Global', 'Αναγνωσμένα', (d) => d.notified && d.readByUser],
      ['-9998.27.Global', 'Μη Αναγνωσμένα', (d) => d.notified && !d.readByUser],
      ['-9998.42.Global', 'Από εμένα', (d) => d.notifiedByMe],
    ],
  },
  { key: '-9996.32.Global', label: 'Δημοσιευμένα', test: (d) => d.published },
  {
    key: '0.0.SubGroups', label: 'Υφισταμένων υπηρεσιών', test: (d) => d.sub, visible: managerOnly,
    children: [
      ['1.0.SubGroups', 'Εισερχόμενα', (d) => d.sub && d.type === 1],
      ['2.0.SubGroups', 'Εξερχόμενα', (d) => d.sub && d.type === 2],
      ['3.0.SubGroups', 'Σχέδια', (d) => d.sub && d.type === 3],
    ],
  },
  { key: '1.0.GroupOwned.KsideFrom', label: 'Έγγραφα από ΚΣΗΔΕ', test: (d) => d.ksideFrom },
  { key: '2.0.GroupOwned.KsideTo', label: 'Έγγραφα προς ΚΣΗΔΕ', test: (d) => d.ksideTo },
  { key: '0.0.GroupOwned.DocuGate', label: 'Αιτήσεις Πολιτών', test: (d) => d.docugate },
];

/** key → predicate, for every folder and selectable section. */
const TESTS = new Map();
for (const s of SECTIONS) {
  const own = s.test ?? (s.type ? (d) => d.type === s.type && !d.sub : null);
  if (s.key && own) TESTS.set(s.key, own);
  for (const [key, , test] of s.children ?? []) TESTS.set(key, (d) => (!d.sub || key.endsWith('SubGroups') ? test(d) : false));
}

function foldersFor(role) {
  const ok = (v) => !v || v(role);
  return SECTIONS.filter((s) => ok(s.visible)).map((s) => ({
    ...(s.key ? { Key: s.key } : {}),
    Label: s.label,
    ...(s.children
      ? { Children: s.children.filter(([, , , v]) => ok(v)).map(([Key, Label]) => ({ Key, Label })) }
      : {}),
  }));
}

/* ---------- columns, search types, periods ---------- */

// EureiasXrisisKind is hidden by the default HideDocumentCatalogColumns, so it is not offered.
const COLUMNS = [
  { Key: 'SerialNumber', Label: 'Α/Α', Width: 75, Sortable: true },
  { Key: 'IssueDate', Label: 'Ημ. Δημ/ας', Width: 93, Sortable: true },
  { Key: 'LastSignDate', Label: 'Ημ. Τελευταίας Μεταβολής', Width: 130, Sortable: true },
  { Key: 'ProtocolNum', Label: 'Αριθμ. Πρωτ.', Width: 145, Sortable: true },
  { Key: 'ProtocolDate', Label: 'Ημ/νία Πρωτοκόλλου', Width: 110 },
  { Key: 'DocumentIdentifier', Label: 'Αναγνωριστικό', Width: 100 },
  { Key: 'Subject', Label: 'Θέμα Εγγράφου', Width: 270, Sortable: true },
  { Key: 'ArPrApostolea', Label: 'Α. Π. Αποστολέα', Width: 132 },
  { Key: 'Apostoleas', Label: 'Αποστολέας', Width: 260 },
  { Key: 'SignaturesStatus', Label: 'Στάδιο Υπογραφών', Width: 160 },
  { Key: 'Recipients', Label: 'Αποδέκτες', Width: 208 },
  { Key: 'CopyStatus', Label: 'Κατάσταση', Width: 130 },
  { Key: 'NextEntityToSign', Label: 'Κάτοχος', Width: 160 },
  { Key: 'DocumentKind', Label: 'Είδος Εγγράφου', Width: 132 },
  { Key: 'Assignees', Label: 'Χρέωση', Width: 95 },
  { Key: 'Folder', Label: 'Φάκελοι', Width: 95 },
  { Key: 'Endiaferomenos', Label: 'Ενδιαφερόμενος', Width: 140 },
  { Key: 'Register', Label: 'Καταχωριστής', Width: 128 },
];

const SEARCH_TYPES = [
  { Id: 9, Label: 'Ελεύθερο Κείμενο' },
  { Id: 1, Label: 'Αριθμ. Πρωτ.' },
  { Id: 4, Label: 'Θέμα Εγγράφου' },
  { Id: 2, Label: 'Α. Π. Αποστολέα' },
  { Id: 3, Label: 'Αποστολέας' },
  { Id: 6, Label: 'Εξωτερικοί Αποδέκτες' },
  { Id: 7, Label: 'Αναγνωριστικό(Α/Α)' },
  { Id: 8, Label: 'Ανεξάρτητη Αρίθμηση' },
];

const PERIODS = [
  { Id: 1, Label: 'Τρέχουσα ημέρα' },
  { Id: 2, Label: 'Τελευταία εβδομάδα' },
  { Id: 3, Label: 'Τελευταίος μήνας' },
  { Id: 4, Label: 'Τελευταίο έτος' },
  { Id: 5, Label: 'Τρέχον έτος' },
  { Id: 6, Label: 'Όλα' },
  { Id: 0, Label: 'Προσαρμοσμένο' },
];

/** Effective [from, to] (yyyy-mm-dd) of a period, as DateRanges does it. */
function periodRange(p) {
  const today = ymd(NOW);
  switch (p?.Range) {
    case 1: return [today, today];
    case 2: return [ymd(NOW - 7 * DAY), today];
    case 3: return [ymd(NOW - 30 * DAY), today];
    case 5: return [`${today.slice(0, 4)}-01-01`, today];
    case 6: return [null, today];
    case 0: return [p.From ?? null, p.To ?? today];
    default: return [ymd(NOW - 365 * DAY), today];
  }
}

/** Columns that apply to a folder (the `.Visible(...)` rules of the Razor grid). */
function columnsFor(key) {
  const type = Number(key.split('.')[0]);
  return COLUMNS.map((c) => c.Key).filter((k) => {
    if (k === 'ProtocolNum' || k === 'ProtocolDate') return type !== 3;
    if (k === 'DocumentIdentifier') return type === 3;
    if (k === 'Recipients') return type === 2;
    if (k === 'NextEntityToSign') return type === 3 || type <= 0;
    if (k === 'SignaturesStatus') return key === '3.40.Global';
    if (k === 'ArPrApostolea' || k === 'Apostoleas') return type !== 2 && type !== 3;
    return true;
  });
}

/* ---------- data ---------- */

const SUBJECTS = [
  'Αίτηση χορήγησης άδειας', 'Διαβιβαστικό εγγράφων', 'Πρόσκληση σε σύσκεψη', 'Απόφαση ανάθεσης',
  'Βεβαίωση υπηρεσιακών μεταβολών', 'Ερώτημα για εφαρμογή διάταξης', 'Ενημέρωση για προθεσμία',
  'Σύμβαση προμήθειας', 'Πρακτικό επιτροπής', 'Εγκύκλιος οδηγιών', 'Πρόταση τροποποίησης κανονισμού',
  'Απάντηση σε αίτημα πολίτη', 'Έγκριση δαπάνης', 'Ορισμός επιτροπής παραλαβής', 'Αναφορά βλάβης',
];
const PLACES = ['Θεσσαλονίκη', 'Λάρισα', 'Πάτρα', 'Ηράκλειο', 'Αθήνα', 'Ιωάννινα', 'Καλαμαριά', 'Βόλος'];
const SENDERS = [
  'Υπουργείο Εσωτερικών', 'Αποκεντρωμένη Διοίκηση Μακεδονίας - Θράκης', 'ΕΦΚΑ', 'Περιφέρεια Κεντρικής Μακεδονίας',
  'ΑΛΦΑ ΤΕΧΝΙΚΗ Α.Ε.', 'Άννα Γεωργίου', 'Κώστας Οικονόμου', 'Δήμος Πυλαίας - Χορτιάτη', 'Ελεγκτικό Συνέδριο',
];
const KINDS = ['Έγγραφο', 'Απόφαση', 'Αίτηση', 'Διαβιβαστικό', 'Βεβαίωση', 'Σύμβαση'];
const SUBKINDS = ['', '', 'Κανονιστική', 'Ατομική', 'Οδηγίες'];

const STATES = {
  1: [['outstanding', 0.24], ['charged', 0.2], ['informed', 0.06], ['replied', 0.12], ['archived', 0.2], ['announced', 0.06], ['sent', 0.06], ['returned', 0.06]],
  2: [['sent', 0.45], ['replied', 0.1], ['notsent', 0.15], ['archived', 0.2], ['returned', 0.1]],
  3: [['draft', 0.3], ['tosign', 0.3], ['finalsigned', 0.15], ['archived', 0.1], ['returned', 0.15]],
  4: [['draft', 1]],
};
const STATUS_LABEL = {
  outstanding: 'Δημιουργήθηκε', charged: 'Χρεώθηκε', informed: 'Εσωτερική διανομή', replied: 'Απαντήθηκε',
  archived: 'Αρχειοθετήθηκε', announced: 'Κοινοποιήθηκε', sent: 'Απεστάλη', returned: 'Επιστράφηκε',
  notsent: 'Δημιουργήθηκε', draft: 'Δημιουργήθηκε', tosign: 'Σε υπογραφή', finalsigned: 'Τελική υπογραφή',
};
const weighted = (list) => {
  let r = rnd();
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
};

const docs = [];
let nextId = 102300;
let protocol = 4100;
const PER_GROUP = { 2: 1800, 4: 120, 7: 260 };
for (const [g, count] of Object.entries(PER_GROUP)) {
  const group = Number(g);
  for (let i = 0; i < count; i++) {
    // About 40% within the last year, the rest back to three years.
    const age = Math.floor(Math.pow(rnd(), 1.6) * 1100 * DAY) + Math.floor(rnd() * DAY);
    const created = NOW - age;
    const year = new Date(created).getUTCFullYear();
    const type = weighted([[1, 0.46], [2, 0.26], [3, 0.24], [4, 0.04]]);
    const state = weighted(STATES[type]);
    const signed = (type === 2 && chance(0.5)) || (type === 3 && ['finalsigned', 'archived'].includes(state));
    docs.push({
      group, type, state, signed,
      id: nextId++,
      kind: type === 3 && chance(0.15) ? 'Εσωτερικό σημείωμα' : pick(KINDS),
      readByUser: age > 20 * DAY || chance(0.5),
      title: chance(0.02) ? '' : `${pick(SUBJECTS)} - ${pick(PLACES)}`,
      created,
      protocol: type === 1 || type === 2 ? `${protocol++}/${year}` : null,
      senderProtocol: type === 1 ? `${100 + Math.floor(rnd() * 9000)}/${year}` : null,
      sender: type === 1 ? pick(SENDERS) : null,
      recipients: type === 2 ? [pick(SENDERS), chance(0.4) ? pick(SENDERS) : null].filter(Boolean).join(', ') : null,
      subKind: pick(SUBKINDS),
      assignees: ['charged', 'replied'].includes(state) ? pick(USERS).DisplayName : null,
      toMe: chance(0.35),
      byGroup: chance(0.5),
      fromSub: chance(0.3),
      consult: type === 3 ? pick([null, null, null, 'approved', 'remarks', 'returned']) : null,
      lastSign: signed || state === 'tosign' ? created + Math.floor(rnd() * 5) * DAY : null,
      nextToSign: type === 3 && state === 'tosign' ? pick([ME, 'Νίκος Καραγιάννης', 'Ελένη Δημητρίου']) : null,
      createdBy: pick(USERS).DisplayName,
      unread: age < 15 * DAY && chance(0.6),
      important: chance(0.06),
      urgent: chance(0.05),
      comments: chance(0.1),
      keepUntil: chance(0.04) ? created + 400 * DAY : null,
      folders: chance(0.08) ? 'Φάκελος έργου 2026' : null,
      endiaferomenos: type === 1 && chance(0.3) ? pick(['Άννα Γεωργίου', 'Κώστας Οικονόμου', 'ΑΛΦΑ ΤΕΧΝΙΚΗ Α.Ε.']) : null,
      notified: chance(0.08),
      notifiedByMe: chance(0.03),
      published: type === 2 && chance(0.1),
      sub: group === 2 && chance(0.07),
      ksideFrom: type === 1 && chance(0.05),
      ksideTo: type === 2 && chance(0.05),
      docugate: type === 1 && chance(0.04),
    });
  }
}
// A known incoming document of group 2, for tests: «τεστ 44», created today.
Object.assign(
  docs.find((d) => d.group === 2 && d.type === 1 && !d.sub),
  { title: 'τεστ 44', created: NOW - 3600_000, state: 'outstanding', unread: true, readByUser: false, urgent: true },
);

// Fields used by «Φίλτρα» (phase 3), drawn from a separate generator so the data above stay as in phase 2.
for (const d of docs) enrich(d, { STATUS_LABEL, ymd, DAY });

const pristine = structuredClone(docs);

/** Undoes every write action (tests start from the same documents). */
export function resetDocuments() {
  docs.splice(0, docs.length, ...structuredClone(pristine));
}

export const documentCount = () => docs.length;

const row = (d) => ({
  Id: d.id,
  IdDocumentCopy: d.id + 40000,
  Type: d.type,
  Title: d.title,
  IssueDate: iso(d.created),
  LastSignatureDate: d.lastSign ? iso(d.lastSign) : null,
  ProtocolText: d.protocol,
  ProtocolDate: d.protocol ? iso(d.created) : null,
  SenderProtocol: d.senderProtocol,
  Sender: d.sender,
  Recipients: d.recipients,
  SubKind: d.subKind || null,
  Status: STATUS_LABEL[d.state],
  IsFinal: d.type !== 3 && ['archived', 'replied', 'returned'].includes(d.state),
  SignaturesStatus: d.state === 'tosign' ? `${1 + (d.id % 3)} από 3` : null,
  NextToSign: d.nextToSign,
  Kind: d.kind,
  Assignees: d.assignees,
  Folders: d.folders,
  Endiaferomenos: d.endiaferomenos,
  CreatedBy: d.createdBy,
  IsUnread: d.unread,
  IsReadByUser: d.readByUser,
  IsImportant: d.important,
  IsUrgent: d.urgent,
  HasComments: d.comments,
  KeepUntil: d.keepUntil ? iso(d.keepUntil) : null,
});

/* ---------- search ---------- */

const SORT = {
  SerialNumber: (d) => d.id,
  IssueDate: (d) => d.created,
  LastSignDate: (d) => d.lastSign ?? 0,
  ProtocolNum: (d) => d.protocol ?? '',
  Subject: (d) => norm(d.title),
};

function matches(d, search) {
  const q = norm(search?.Text).trim();
  if (!q) return true;
  const fields = {
    1: [d.protocol], 2: [d.senderProtocol], 3: [d.sender], 4: [d.title], 6: [d.recipients], 7: [String(d.id)], 8: [],
    9: [d.title, d.protocol, d.sender, d.recipients, d.senderProtocol, String(d.id), d.kind, d.createdBy],
  }[search.Type] ?? [d.title];
  return fields.some((f) => norm(f).includes(q));
}

function search(body) {
  const test = TESTS.get(body.FolderKey);
  if (!test) return fail('Ο φάκελος δεν είναι διαθέσιμος.');
  const [from, to] = periodRange(body.Period);
  const rows = docs.filter((d) => {
    if (d.group !== body.GroupId || !test(d)) return false;
    const day = ymd(d.created);
    return (!from || day >= from) && day <= to && matches(d, body.Search) && criteriaMatch(d, body.Criteria);
  });
  const col = SORT[body.Sort?.Column] ? body.Sort.Column : 'IssueDate';
  const dir = body.Sort?.Direction === 'asc' ? 1 : -1;
  const key = SORT[col];
  rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir || b.id - a.id;
  });
  const size = body.PageSize || 20;
  const page = body.PageNumber || 1;
  return {
    Success: true,
    Payload: {
      Data: rows.slice((page - 1) * size, page * size).map(row),
      Page: { Size: size, PageNumber: page, TotalElements: rows.length },
      Columns: columnsFor(body.FolderKey),
      Period: { From: from, To: to },
    },
  };
}

/* ---------- routes ---------- */

/** Handles a documents request; returns false when the path is not a documents endpoint. */
export function handleDocuments({ res, path, url, body }) {
  if (path === '/services/v2/documents/filters/') {
    const role = ROLE[Number(url.searchParams.get('GroupId'))];
    if (!role) return send(res, 200, fail('Δεν έχετε ρόλο στην υπηρεσία.'));
    return send(res, 200, {
      Success: true,
      Payload: {
        Folders: foldersFor(role),
        DefaultFolderKey: '0.0.GroupOwned',
        SearchTypes: SEARCH_TYPES,
        DefaultSearchType: 9,
        Columns: COLUMNS,
        Periods: PERIODS,
        DefaultPeriod: 4,
        DefaultSort: { Column: 'IssueDate', Direction: 'desc' },
        Filters: FILTERS.filter((f) => !f.roles || f.roles.includes(role)).map(({ roles, ...f }) => f),
      },
    });
  }
  if (path === '/services/v2/documents/search/') {
    if (process.env.MOCK_LOG) console.log('documents search', JSON.stringify(body));
    return send(res, 200, search(body));
  }
  return false;
}
