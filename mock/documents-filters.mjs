// «Φίλτρα» of the document list (phase 3): the criteria of the Razor sidebar
// (Views/Shared/DocumentFilters.cshtml, ListModel) as FilterDef data, the extra document
// fields they need, and the matching. Labels come from Resources/Global.el.resx.

import { USERS, norm } from './lib.mjs';

let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const some = (a, p) => a.filter(() => chance(p));

const opts = (labels) => labels.map((Label, i) => ({ Id: i + 1, Label }));

/* ---------- option lists ---------- */

const STATUSES = opts(['Δημιουργήθηκε', 'Χρεώθηκε', 'Εσωτερική διανομή', 'Απαντήθηκε', 'Αρχειοθετήθηκε', 'Κοινοποιήθηκε', 'Απεστάλη', 'Επιστράφηκε', 'Σε υπογραφή', 'Τελική υπογραφή']);

// Trees: a parent stands for itself and its children.
export const KINDS = [
  { Id: 100, Label: 'Αλληλογραφία', Depth: 0 },
  { Id: 1, Label: 'Έγγραφο', Depth: 1, parent: 100 },
  { Id: 4, Label: 'Διαβιβαστικό', Depth: 1, parent: 100 },
  { Id: 3, Label: 'Αίτηση', Depth: 1, parent: 100 },
  { Id: 200, Label: 'Πράξεις', Depth: 0 },
  { Id: 2, Label: 'Απόφαση', Depth: 1, parent: 200 },
  { Id: 5, Label: 'Βεβαίωση', Depth: 1, parent: 200 },
  { Id: 6, Label: 'Σύμβαση', Depth: 1, parent: 200 },
  { Id: 7, Label: 'Εσωτερικό σημείωμα', Depth: 0 },
];
export const CATEGORIES = [
  { Id: 10, Label: 'Οικονομικά', Depth: 0 },
  { Id: 11, Label: 'Προμήθειες', Depth: 1, parent: 10 },
  { Id: 12, Label: 'Μισθοδοσία', Depth: 1, parent: 10 },
  { Id: 20, Label: 'Διοικητικά', Depth: 0 },
  { Id: 21, Label: 'Προσωπικό', Depth: 1, parent: 20 },
  { Id: 22, Label: 'Οργάνωση', Depth: 1, parent: 20 },
  { Id: 30, Label: 'Τεχνικά', Depth: 0 },
  { Id: 31, Label: 'Έργα', Depth: 1, parent: 30 },
];
const THEMATIC = opts(['Φάκελος έργου 2026', 'Προϋπολογισμός 2026', 'Προσλήψεις', 'Αιτήματα πολιτών', 'Νομικά θέματα']);
const SUBKINDS = opts(['Κανονιστική', 'Ατομική', 'Οδηγίες']);
const ORIGINS = opts(['Ταχυδρομείο', 'Ηλεκτρονικό ταχυδρομείο', 'Αυτοπροσώπως', 'ΚΣΗΔΕ', 'Διαδικτυακή αίτηση']);
const PUBLICATIONS = opts(['ΔΙΑΥΓΕΙΑ', 'Ιστοσελίδα', 'ΚΗΜΔΗΣ', 'Εθνικό Τυπογραφείο']);
const ALT_NUMBERS = opts(['Αποφάσεις Δημάρχου', 'Συμβάσεις', 'Πρακτικά']);
const ALT_PROTOCOLS = opts(['Γενικό Πρωτόκολλο', 'Εμπιστευτικό Πρωτόκολλο']);
const PRIORITIES = opts(['Κανονική', 'Επείγον', 'Εξαιρετικά επείγον']);
const CLASSIFICATIONS = opts(['Αδιαβάθμητο', 'Εμπιστευτικό', 'Απόρρητο']);
const ENERGEIES = opts(['Για ενέργεια', 'Για ενημέρωση', 'Για απάντηση', 'Για υπογραφή']);
const MOVES = opts(['Χρέωση', 'Αποστολή', 'Κοινοποίηση', 'Επιστροφή', 'Αρχειοθέτηση']);
const EXPIRATION = opts(['Λήγουν εντός της εβδομάδας', 'Λήγουν εντός του μήνα', 'Έχουν προθεσμία και δεν λήγουν', 'Έχουν λήξει']);
const PENDING = opts(['Εκκρεμεί', 'Εκκρεμεί σε ανενεργό χρήστη']);
const EXACT = opts(['Υπογεγραμμένα', 'Μη Υπογεγραμμένα']);
const COPY_TYPES = opts(['Εισερχόμενο', 'Εξερχόμενο', 'Σχέδιο', 'Υποστηρικτικό']);

const clean = (list) => list.map(({ parent, ...o }) => o);

/* ---------- definitions ---------- */

const DATES = 'Ημερομηνίες';
const DOC = 'Έγγραφο';
const COPY = 'Αντίγραφο της υπηρεσίας';
const PEOPLE = 'Πρόσωπα';
const GROUPS = 'Υπηρεσίες';
const OTHER = 'Λοιπά';

/** `roles` limits a filter to some roles (as Display = … in ListModel). */
export const FILTERS = [
  { Key: 'IssuedDate', Label: 'Ημ. Καταχώρισης εγγράφου', Group: DATES, Kind: 'dates' },
  { Key: 'SendDate', Label: 'Ημ. Αποστολής Εισ/μένου', Group: DATES, Kind: 'dates' },
  { Key: 'ActionExpiration', Label: 'Προθεσμία Ενέργειας', Group: DATES, Kind: 'options', Options: EXPIRATION, Single: true },

  { Key: 'Status', Label: 'Κατάσταση', Group: DOC, Kind: 'options', Options: STATUSES },
  { Key: 'Kinds', Label: 'Είδος Εγγράφου', Group: DOC, Kind: 'options', Options: clean(KINDS) },
  { Key: 'SubKinds', Label: 'Είδος Ευρείας Χρήσης', Group: DOC, Kind: 'options', Options: SUBKINDS },
  { Key: 'Categories', Label: 'Θεματικές Κατηγορίες', Group: DOC, Kind: 'options', Options: clean(CATEGORIES) },
  { Key: 'ThematicFolders', Label: 'Θεματικός Φάκελος', Group: DOC, Kind: 'options', Options: THEMATIC },
  { Key: 'Origin', Label: 'Προέλευση', Group: DOC, Kind: 'options', Options: ORIGINS },
  { Key: 'Publications', Label: 'Δημοσιεύτηκε', Group: DOC, Kind: 'options', Options: PUBLICATIONS },
  { Key: 'Priority', Label: 'Προτεραιότητα', Group: DOC, Kind: 'options', Options: PRIORITIES },
  { Key: 'Classification', Label: 'Διαβάθμιση', Group: DOC, Kind: 'options', Options: CLASSIFICATIONS },
  { Key: 'AltNumberKinds', Label: 'Τύπος Ανεξάρτητης Αρίθμησης', Group: DOC, Kind: 'options', Options: ALT_NUMBERS },
  { Key: 'AltProtocols', Label: 'Βιβλία Πρωτοκόλλησης', Group: DOC, Kind: 'options', Options: ALT_PROTOCOLS },

  { Key: 'Important', Label: 'Σημαντικά', Group: COPY, Kind: 'options', Options: [{ Id: 2, Label: 'Μόνο τα σημαντικά' }], Single: true },
  { Key: 'IsRead', Label: 'Αναγνωσμένα', Group: COPY, Kind: 'options', Options: [{ Id: 1, Label: 'Αναγνωσμένα' }, { Id: 2, Label: 'Μη Αναγνωσμένα' }], Single: true },
  { Key: 'Energeies', Label: 'Ενέργειες', Group: COPY, Kind: 'options', Options: ENERGEIES },
  { Key: 'Kiniseis', Label: 'Έχουν γίνει κινήσεις', Group: COPY, Kind: 'options', Options: MOVES },
  { Key: 'Pending', Label: 'Έγγραφα Που Εκκρεμούν', Group: COPY, Kind: 'options', Options: PENDING, roles: ['director', 'secretary'] },
  { Key: 'ExactCopies', Label: 'Ακριβή Αντίγραφα', Group: COPY, Kind: 'options', Options: EXACT },
  { Key: 'OfCopyTypes', Label: 'Τύπος Εγγράφου', Group: COPY, Kind: 'options', Options: COPY_TYPES },

  { Key: 'Signator', Label: 'Υπογράφων', Group: PEOPLE, Kind: 'users' },
  { Key: 'Author', Label: 'Συντάκτης', Group: PEOPLE, Kind: 'users' },
  { Key: 'Creator', Label: 'Καταχωριστής', Group: PEOPLE, Kind: 'users' },
  { Key: 'AssignedTo', Label: 'Χρεώθηκε Στον', Group: PEOPLE, Kind: 'users' },
  { Key: 'AnsweredBy', Label: 'Απαντήθηκε Από', Group: PEOPLE, Kind: 'users' },
  { Key: 'ArchivedBy', Label: 'Αρχειοθετήθηκε Από', Group: PEOPLE, Kind: 'users' },
  { Key: 'Consultor', Label: 'Αρμόδιος Σύμβουλος', Group: PEOPLE, Kind: 'users', roles: ['director', 'secretary'] },

  { Key: 'SentTo', Label: 'Στάλθηκε Προς', Group: GROUPS, Kind: 'groups' },
  { Key: 'SentFrom', Label: 'Στάλθηκε Από', Group: GROUPS, Kind: 'groups' },
  { Key: 'AnnouncedTo', Label: 'Κοινοποιήθηκε Προς', Group: GROUPS, Kind: 'groups' },
  { Key: 'AnnouncedFrom', Label: 'Κοινοποιήθηκε Από', Group: GROUPS, Kind: 'groups' },
  { Key: 'SignatureObligationBy', Label: 'Υποχρέωση Υπογραφής Από', Group: GROUPS, Kind: 'groups' },
  { Key: 'CreatedForGroup', Label: 'Εκδούσα Υπηρεσιακή Μονάδα', Group: GROUPS, Kind: 'groups' },

  { Key: 'Endiaferomenos', Label: 'Ενδιαφερόμενος', Group: OTHER, Kind: 'text' },
  { Key: 'DecisionNumber', Label: 'Αριθμός Απόφασης', Group: OTHER, Kind: 'text' },
  { Key: 'Ada', Label: 'ΑΔΑ Απόφασης', Group: OTHER, Kind: 'text' },
  { Key: 'MeetingSubjectNumber', Label: 'Αριθμός Θέματος Συνεδρίασης', Group: OTHER, Kind: 'text' },
];

/* ---------- document fields ---------- */

const USER_IDS = USERS.map((u) => u.Id);
const userId = (name) => USERS.find((u) => u.DisplayName === name)?.Id ?? null;
const GROUP_IDS = [1, 2, 4, 41, 42, 7, 9];
const kindId = (label) => KINDS.find((k) => k.Label === label)?.Id ?? 1;
const ADA = () => Array.from({ length: 10 }, () => pick([...'ΨΩΧΦΥΤΣΡΠΟΞΝΜΛΚΙΘΗΖΕΔΓΒΑ0123456789'])).join('') + '-' + pick(['ΑΒΓ', 'Δ4Ε', '7ΚΛ']);

/** Adds the fields the filters read. Called once per generated document. */
export function enrich(d, { STATUS_LABEL, DAY }) {
  const year = new Date(d.created).getUTCFullYear();
  Object.assign(d, {
    statusId: STATUSES.find((s) => s.Label === STATUS_LABEL[d.state])?.Id,
    kindId: kindId(d.kind),
    subKindId: SUBKINDS.find((s) => s.Label === d.subKind)?.Id ?? null,
    categoryIds: [pick(CATEGORIES.filter((c) => c.parent)).Id],
    thematicIds: d.folders ? [1] : some([2, 3, 4, 5], 0.05),
    originId: d.type === 1 ? pick(ORIGINS).Id : null,
    publicationIds: d.published ? [pick(PUBLICATIONS).Id] : [],
    priorityId: d.urgent ? pick([2, 3]) : 1,
    classificationId: chance(0.92) ? 1 : pick([2, 3]),
    altNumberKindId: d.kind === 'Απόφαση' && chance(0.5) ? pick(ALT_NUMBERS).Id : null,
    altProtocolId: d.protocol ? (chance(0.95) ? 1 : 2) : null,
    energeiaIds: some([1, 2, 3, 4], 0.25),
    moveIds: some([1, 2, 3, 4, 5], 0.3),
    pendingIds: ['outstanding', 'charged', 'tosign'].includes(d.state) ? [chance(0.9) ? 1 : 2] : [],
    exactId: d.type === 2 && chance(0.1) ? pick([1, 2]) : null,
    issued: d.created - Math.floor(rnd() * 3) * DAY,
    sendDate: d.type === 1 ? d.created - (1 + Math.floor(rnd() * 10)) * DAY : null,
    signatorIds: d.signed || d.lastSign ? [pick(USER_IDS)] : [],
    authorId: pick(USER_IDS),
    creatorId: userId(d.createdBy),
    assignedIds: d.assignees ? [userId(d.assignees)] : [],
    answeredById: d.state === 'replied' ? pick(USER_IDS) : null,
    archivedById: d.state === 'archived' ? pick(USER_IDS) : null,
    consultorId: d.consult ? pick(USER_IDS) : null,
    sentToIds: ['sent', 'replied'].includes(d.state) ? some(GROUP_IDS, 0.3) : [],
    sentFromIds: d.type === 1 ? [pick(GROUP_IDS)] : [],
    announcedToIds: d.state === 'announced' || chance(0.05) ? [pick(GROUP_IDS)] : [],
    announcedFromIds: chance(0.05) ? [pick(GROUP_IDS)] : [],
    obligationIds: d.state === 'tosign' ? [pick(GROUP_IDS)] : [],
    createdForId: d.type === 2 || d.type === 3 ? pick(GROUP_IDS) : null,
    decisionNumber: d.kind === 'Απόφαση' ? `${1 + Math.floor(rnd() * 400)}/${year}` : null,
    ada: d.kind === 'Απόφαση' && d.published ? ADA() : null,
    meetingSubject: d.kind === 'Απόφαση' && chance(0.3) ? String(1 + Math.floor(rnd() * 30)) : null,
  });
}

/* ---------- matching ---------- */

/** Selected ids of a tree, with every descendant of a selected parent. */
const expand = (tree, ids) => {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of tree) if (n.parent && out.has(n.parent) && !out.has(n.Id)) out.add(n.Id), (grew = true);
  }
  return out;
};
const ymd = (t) => (t ? new Date(t).toISOString().slice(0, 10) : null);
const listOf = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** What each filter reads from a document. */
const VALUE = {
  IssuedDate: (d) => d.issued,
  SendDate: (d) => d.sendDate,
  Status: (d) => d.statusId,
  Kinds: (d) => d.kindId,
  SubKinds: (d) => d.subKindId,
  Categories: (d) => d.categoryIds,
  ThematicFolders: (d) => d.thematicIds,
  Origin: (d) => d.originId,
  Publications: (d) => d.publicationIds,
  Priority: (d) => d.priorityId,
  Classification: (d) => d.classificationId,
  AltNumberKinds: (d) => d.altNumberKindId,
  AltProtocols: (d) => d.altProtocolId,
  Important: (d) => (d.important ? 2 : 1),
  IsRead: (d) => (d.readByUser ? 1 : 2),
  Energeies: (d) => d.energeiaIds,
  Kiniseis: (d) => d.moveIds,
  Pending: (d) => d.pendingIds,
  ExactCopies: (d) => d.exactId,
  OfCopyTypes: (d) => d.type,
  Signator: (d) => d.signatorIds,
  Author: (d) => d.authorId,
  Creator: (d) => d.creatorId,
  AssignedTo: (d) => d.assignedIds,
  AnsweredBy: (d) => d.answeredById,
  ArchivedBy: (d) => d.archivedById,
  Consultor: (d) => d.consultorId,
  SentTo: (d) => d.sentToIds,
  SentFrom: (d) => d.sentFromIds,
  AnnouncedTo: (d) => d.announcedToIds,
  AnnouncedFrom: (d) => d.announcedFromIds,
  SignatureObligationBy: (d) => d.obligationIds,
  CreatedForGroup: (d) => d.createdForId,
  Endiaferomenos: (d) => d.endiaferomenos,
  DecisionNumber: (d) => d.decisionNumber,
  Ada: (d) => d.ada,
  MeetingSubjectNumber: (d) => d.meetingSubject,
};
const TREES = { Kinds: KINDS, Categories: CATEGORIES };
const DEF = new Map(FILTERS.map((f) => [f.Key, f]));

function matchOne(d, key, want) {
  const def = DEF.get(key);
  const read = VALUE[key];
  if (!def || !read) return true; // unknown criteria are ignored, as the server would
  const have = read(d);
  if (def.Kind === 'dates') {
    const day = ymd(have);
    if (!day) return !want.From && !want.To;
    return (!want.From || day >= want.From) && (!want.To || day <= want.To);
  }
  if (def.Kind === 'text') return norm(have).includes(norm(want).trim());
  if (key === 'ActionExpiration') {
    const left = d.keepUntil ? (d.keepUntil - Date.UTC(2026, 9, 23)) / 86400000 : null;
    return want.some((id) => (id === 1 ? left !== null && left >= 0 && left <= 7 : id === 2 ? left !== null && left >= 0 && left <= 31 : id === 3 ? left !== null && left >= 0 : left !== null && left < 0));
  }
  const ids = TREES[key] ? expand(TREES[key], want) : new Set(want);
  return listOf(have).some((v) => ids.has(v));
}

const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !v.From && !v.To);

/** True when the document passes every active criterion. */
export function criteriaMatch(d, criteria) {
  if (!criteria) return true;
  return Object.entries(criteria).every(([k, v]) => empty(v) || matchOne(d, k, v));
}
