// Phase 8: «Νέο έγγραφο». Types the user may register (UINewSelection), the form of a type
// (DocumentPropertiesEditor: tabs, fields, brief fields), kinds with their Formio forms, the
// temporary upload of files and the registration itself. Labels are those of Global.el.resx.

import { ORG, USERS } from './lib.mjs';
import { CATEGORIES, KINDS } from './documents-filters.mjs';

const ME = USERS[0];

/** NewDocTypes as on test-new (23/10/2026, group 2 «Test»). */
const TYPES = [
  { Id: 6, Title: 'Σχέδιο', DocumentType: 3 },
  { Id: 1, Title: 'Εισερχόμενο', DocumentType: 1 },
  { Id: 7, Title: 'Εξερχόμενο', DocumentType: 2 },
  { Id: 5, Title: 'Υποστηρικτικά Έγγραφα', DocumentType: 4 },
];

export function newTypes(group) {
  // Group 7 (plain employee) is not an incoming registrar: no Εισερχόμενο (isUserIncomingRegistrar).
  const types = group === 7 ? TYPES.filter((t) => t.Id !== 1) : TYPES;
  return { Types: types, AllowOld: group === 2 };
}

/* ---------- kinds ---------- */

const tree = (list) => {
  const node = (k) => ({
    Id: k.Id,
    Title: k.Label,
    Selectable: !list.some((c) => c.parent === k.Id),
    ...(FORMS[k.Id] ? { HasForm: true } : {}),
    Children: list.filter((c) => c.parent === k.Id).map(node),
  });
  return list.filter((k) => !k.parent).map(node);
};

/** «Ειδικά πεδία» of some kinds, in the Formio JSON Docutracks stores (data-formio-template). */
const FORMS = {
  2: {
    components: [
      { label: 'Αριθμός Απόφασης', key: 'decisionNumber', type: 'textfield', input: true, validate: { required: true } },
      { label: 'ΑΔΑ', key: 'ada', type: 'textfield', input: true },
      { label: 'Ημερομηνία Ισχύος', key: 'validFrom', type: 'datetime', input: true, enableTime: false, format: 'dd/MM/yyyy', validate: { required: true } },
    ],
  },
  3: {
    components: [
      { label: 'ΑΦΜ Αιτούντος', key: 'afm', type: 'textfield', input: true, validate: { pattern: '^\\d{9}$' } },
      {
        label: 'Τρόπος υποβολής', key: 'submittedBy', type: 'select', input: true, widget: 'html5', dataSrc: 'values',
        data: { values: [{ label: 'Αυτοπροσώπως', value: 'inperson' }, { label: 'Ηλεκτρονικά', value: 'online' }, { label: 'Ταχυδρομικά', value: 'post' }] },
      },
    ],
  },
};

export const kindsTree = () => tree(KINDS);
export const kindForm = (id) => FORMS[id] ?? null;

/** Metadata classes (Μεταδεδομένα): a few of test-new, each with a small form. */
const METADATA = {
  PrimaryRequest: {
    Title: 'Πρωτογενές Αίτημα',
    form: { components: [{ label: 'ΑΔΑΜ', key: 'adam', type: 'textfield', input: true }, { label: 'Ποσό (€)', key: 'amount', type: 'number', input: true }] },
  },
  LawQuestions: {
    Title: 'Νομική Υπόθεση - Ερώτημα',
    form: { components: [{ label: 'Αριθμός ερωτήματος', key: 'questionNo', type: 'textfield', input: true }] },
  },
};
export const metadataForm = (code) => METADATA[code]?.form ?? null;

/* ---------- the form ---------- */

const groupsOnly = (nodes) => nodes.map((n) => ({ ...n, Users: [], SubGroups: groupsOnly(n.SubGroups ?? []) }));
const categories = () => {
  const node = (c) => ({ Id: c.Id, Title: c.Label, Children: CATEGORIES.filter((x) => x.parent === c.Id).map(node) });
  return CATEGORIES.filter((c) => !c.parent).map(node);
};
const PREDEFINED = ['Αίτηση χορήγησης άδειας', 'Αίτηση χορήγησης βεβαίωσης', 'Διαβιβαστικό εγγράφων', 'Πρόσκληση σε συνεδρίαση'];

/**
 * The form of Εισερχόμενο with the defaults of test-new: tab order of DocIncomingTabOrder (not
 * set: Razor order), BriefIncomingDocumentFields, ShowDetailedOrBriefDocumentCreationToggle on.
 */
function incomingForm(group, old) {
  const f = [
    // Βασικά
    { Key: 'Title', Kind: 'text', Label: 'Θέμα Εγγράφου', Tab: 'basic', Brief: true, Required: true, RequiredMessage: 'Το πεδίο αυτό είναι υποχρεωτικό', Multiline: true, MaxLength: 2000, Suggestions: PREDEFINED },
    { Key: 'SaveTitle', Kind: 'checkbox', Label: 'Αποθήκευση ως προκαθορισμένο θέμα (για επαναχρησιμοποίηση σε επόμενες καταχωρίσεις)', Tab: 'basic' },
    { Key: 'Summary', Kind: 'text', Label: 'Περίληψη', Tab: 'basic', Multiline: true, MaxLength: 4000 },
    { Key: 'MainFile', Kind: 'files', Label: 'Κυρίως έγγραφο σε ψηφιακή μορφή', Tab: 'basic', Brief: true, Role: 'main', Multi: false, MaxSizeMb: 50 },
    { Key: 'Related', Kind: 'documents', Label: 'Σχετικά Έγγραφα', Tab: 'basic', Brief: true },
    { Key: 'Attachments', Kind: 'files', Label: 'Συνημμένα Αρχεία', Tab: 'basic', Brief: true, Role: 'attachment', Multi: true, MaxSizeMb: 50 },
    { Key: 'InternalAttachments', Kind: 'files', Label: 'Συνημμένα Εσωτερικής Χρήσης', Tab: 'basic', Role: 'internal', Multi: true, MaxSizeMb: 50 },
    // Είδος
    { Key: 'KindId', Kind: 'tree', Source: 'kinds', Label: 'Είδος Εγγράφου', Tab: 'kind', Required: true, RequiredMessage: 'Επιλέξτε είδος εγγράφου.', Multi: false, Value: 1 },
    { Key: 'KindData', Kind: 'kindForm', Label: 'Ειδικά Πεδία', Tab: 'kind', KindField: 'KindId' },
    // Δημοσιεύσεις
    { Key: 'SensitiveData', Kind: 'checkbox', Label: 'Προσωπικά Δεδομένα για Διαύγεια', Tab: 'publications' },
    // Θεματικές Κατηγορίες
    { Key: 'Categories', Kind: 'tree', Source: 'options', Label: 'Κατηγορίες Φορέα', Tab: 'categories', Multi: true, Tree: categories() },
    // Πρωτόκολλο
    { Key: 'ProtocolBook', Kind: 'select', Label: 'Βιβλία Πρωτοκόλλησης', Tab: 'protocol', Brief: true, Options: [{ Id: 1, Label: 'Βασικό Πρωτόκολλο' }, { Id: 2, Label: 'Πρωτόκολλο Προσφυγών' }], Value: 1 },
    ...(old
      ? [
          { Key: 'OldProtocolNumber', Kind: 'text', Label: 'Αριθμ. Πρωτ.', Tab: 'protocol', Brief: true, Required: true, RequiredMessage: 'Το πεδίο αυτό είναι υποχρεωτικό', MaxLength: 30 },
          { Key: 'OldProtocolDate', Kind: 'date', Label: 'Ημ. Πρωτοκόλλου', Tab: 'protocol', Brief: true, Required: true, RequiredMessage: 'Το πεδίο αυτό είναι υποχρεωτικό' },
        ]
      : []),
    { Key: 'SenderProtocol', Kind: 'text', Label: 'Α. Π. Αποστολέα', Tab: 'protocol', Brief: true, MaxLength: 100 },
    { Key: 'SendDate', Kind: 'date', Label: 'Ημ/νία Αποστολής', Tab: 'protocol', Brief: true },
    { Key: 'Sender', Kind: 'contacts', Label: 'Αποστολέας', Tab: 'protocol', Brief: true, Required: true, RequiredMessage: 'Επιλέξτε ή γράψτε αποστολέα.', Multi: false, AllowNew: true },
    { Key: 'SendReceipt', Kind: 'checkbox', Label: 'Αποστολή Αποδεικτικού Πρωτοκόλλησης', Tab: 'protocol', Hint: 'Στο e-mail του αποστολέα, μετά την πρωτοκόλληση.' },
    { Key: 'AltNumbering', Kind: 'select', Label: 'Τύπος Ανεξάρτητης Αρίθμησης', Tab: 'protocol', Options: [{ Id: 1, Label: 'Αποφάσεις Δημάρχου' }, { Id: 2, Label: 'Συμβάσεις' }, { Id: 3, Label: 'Πρακτικά' }], Value: null, Hint: 'Κενό: χωρίς ανεξάρτητη αρίθμηση.' },
    // Διανομή
    { Key: 'Recipients', Kind: 'people', Label: 'Εσωτερικοί', Section: 'Αποδέκτες', Tab: 'distribution', Brief: true, Pick: 'both', Multi: true, Tree: ORG },
    { Key: 'OtherRecipients', Kind: 'contacts', Label: 'Λοιποί Αποδέκτες', Section: 'Αποδέκτες', Tab: 'distribution', Multi: true, AllowNew: true },
    { Key: 'Notify', Kind: 'people', Label: 'Εσωτερικοί', Section: 'Κοινοποιήσεις', Tab: 'distribution', Pick: 'groups', Multi: true, Tree: groupsOnly(ORG) },
    { Key: 'OtherNotify', Kind: 'contacts', Label: 'Λοιπές Κοινοποιήσεις', Section: 'Κοινοποιήσεις', Tab: 'distribution', Multi: true, AllowNew: true },
    { Key: 'Transactors', Kind: 'contacts', Label: 'Συναλλασσόμενοι', Section: 'Συναλλασσόμενοι', Tab: 'distribution', Multi: true, AllowNew: false },
    // Λοιπά
    { Key: 'SendTypes', Kind: 'select', Label: 'Τρόποι Αποστολής', Tab: 'extras', Multi: true, Options: [{ Id: 1, Label: 'Ταχυδρομείο' }, { Id: 2, Label: 'Ηλεκτρονικό ταχυδρομείο' }, { Id: 3, Label: 'Αυτοπροσώπως' }, { Id: 4, Label: 'ΚΣΗΔΕ' }], Value: [] },
    { Key: 'Comments', Kind: 'text', Label: 'Σχόλια', Tab: 'extras', Multiline: true, MaxLength: 1000 },
    { Key: 'Endiaferomenos', Kind: 'text', Label: 'Ενδιαφερόμενος', Tab: 'extras', MaxLength: 200 },
    { Key: 'Priority', Kind: 'select', Label: 'Προτεραιότητα', Tab: 'extras', Options: [{ Id: 1, Label: 'Κανονική' }, { Id: 2, Label: 'Επείγουσα' }, { Id: 3, Label: 'Εξαιρετικά επείγουσα' }], Value: 1 },
    { Key: 'Classification', Kind: 'select', Label: 'Διαβάθμιση', Tab: 'extras', Options: [{ Id: 1, Label: 'Αδιαβάθμητο' }, { Id: 2, Label: 'Εμπιστευτικό' }, { Id: 3, Label: 'Απόρρητο' }], Value: 1 },
    { Key: 'IsPersonal', Kind: 'checkbox', Label: 'Προσωπικά Δεδομένα', Tab: 'extras' },
    { Key: 'KeepUntil', Kind: 'date', Label: 'Προθεσμία Ενέργειας', Tab: 'extras' },
    { Key: 'RetentionInMonths', Kind: 'number', Label: 'Μέγιστη Περίοδος Διατήρησης (σε μήνες)', Tab: 'extras', Min: 0 },
    { Key: 'ThematicFolders', Kind: 'thematicFolders', Label: 'Θεματικοί Φάκελοι', Tab: 'extras', AllowNew: true, Value: [] },
    { Key: 'IssueDate', Kind: 'display', Label: 'Ημ.Καταχώρισης', Tab: 'extras', Value: 'Κατά την καταχώριση' },
    { Key: 'CreatedBy', Kind: 'display', Label: 'Καταχωριστής', Tab: 'extras', Value: ME.DisplayName },
    // Μεταδεδομένα
    { Key: 'Metadata', Kind: 'metadata', Label: 'Μεταδεδομένα', Tab: 'metadata', Classes: Object.entries(METADATA).map(([Code, m]) => ({ Code, Title: m.Title })) },
  ];
  return {
    NewType: 1,
    DocumentType: 1,
    Title: old ? 'Καταχώριση Παλαιότερου Εγγράφου (Εισερχόμενο)' : 'Καταχώριση Νέου Εγγράφου (Εισερχόμενο)',
    Tabs: [
      { Key: 'basic', Label: 'Βασικά' }, { Key: 'kind', Label: 'Είδος' }, { Key: 'publications', Label: 'Δημοσιεύσεις' },
      { Key: 'categories', Label: 'Θεματικές Κατηγορίες' }, { Key: 'protocol', Label: 'Πρωτόκολλο' }, { Key: 'distribution', Label: 'Διανομή' },
      { Key: 'extras', Label: 'Λοιπά' }, { Key: 'metadata', Label: 'Μεταδεδομένα' },
    ],
    AllowBrief: true,
    BriefDefault: false,
    Fields: f,
  };
}

export function registerForm(group, newType, old) {
  if (!newTypes(group).Types.some((t) => t.Id === newType)) return { error: 'Δεν έχετε δικαίωμα καταχώρισης αυτού του τύπου.' };
  if (newType === 1) return { form: incomingForm(group, old) };
  if (newType === 6) return { form: draftForm(group) };
  return { error: 'Η φόρμα αυτού του τύπου δεν υπάρχει ακόμη στο mock.' };
}

/* ---------- Σχέδιο (8β) ---------- */

/** Groups that sign documents: not the protocol (1), not the secretariat (2). */
const SIGNING_GROUPS = [4, 41, 42, 7, 9];
/** The organisation node of a mock group (group 2 of the mock is node 2, «Γραμματεία»). */
const nodeOf = (id) => {
  const find = (n) => (n.Id === id ? n : (n.SubGroups ?? []).map(find).find(Boolean));
  return ORG.map(find).find(Boolean) ?? null;
};
const parentOf = (id) => {
  const find = (n) => ((n.SubGroups ?? []).some((c) => c.Id === id) ? n : (n.SubGroups ?? []).map(find).find(Boolean));
  return ORG.map(find).find(Boolean) ?? null;
};
const managerOf = (id) => nodeOf(id)?.Users?.[0]?.DisplayName ?? null;
const groupsTree = () => groupsOnly(ORG);

function draftForm(group) {
  const base = incomingForm(group, false).Fields;
  const pick = (...keys) => keys.map((k) => base.find((f) => f.Key === k)).filter(Boolean);
  const f = [
    // Βασικά
    ...pick('Title', 'SaveTitle'),
    { Key: 'Oikothen', Kind: 'checkbox', Label: 'Οίκοθεν', Tab: 'basic' },
    ...pick('Summary'),
    { Key: 'FromTemplate', Kind: 'checkbox', Label: 'Από Πρότυπο', Tab: 'basic', Hint: 'Το κυρίως έγγραφο δημιουργείται από το πρότυπο του είδους.' },
    { ...base.find((x) => x.Key === 'MainFile'), Required: true, RequiredMessage: 'Επιλέξτε το κυρίως έγγραφο ή «Από Πρότυπο».', HiddenIf: { Key: 'FromTemplate', Value: true } },
    ...pick('Related', 'Attachments', 'InternalAttachments'),
    { Key: 'SignerAttachments', Kind: 'files', Label: 'Συνημμένα Υπογράφοντων', Tab: 'basic', Role: 'signer', Multi: true, MaxSizeMb: 50, Hint: 'Συνημμένα στα οποία έχουν πρόσβαση αποκλειστικά οι υπογράφοντες και ο συντάκτης' },
    // Είδος
    ...pick('KindId', 'KindData'),
    // Θεματικές Κατηγορίες
    ...pick('Categories'),
    // Πρωτόκολλο
    ...pick('ProtocolBook', 'AltNumbering'),
    // Διανομή
    ...pick('Recipients', 'OtherRecipients', 'Notify', 'OtherNotify'),
    { Key: 'InternalDistribution', Kind: 'people', Label: 'Εσωτερική Διανομή', Section: 'Εσωτερική Διανομή', Tab: 'distribution', Pick: 'both', Multi: true, Tree: ORG },
    ...pick('Transactors'),
    // Υπογραφές
    {
      Key: 'FinalSigners', Kind: 'people', Label: 'Τελικοί Υπογράφοντες (Εσωτερικοί)', Section: 'Υπογραφές', Tab: 'signatures', Pick: 'groups', Multi: true,
      Tree: groupsTree(),
      AllowedGroups: SIGNING_GROUPS, Required: true, RequiredMessage: 'Δεν έχει επιλεγεί τελικός υπογράφων.',
      Hint: 'Επιλέξετε αποκλειστικά τον τελικό υπογράφοντα (ή τους τελικούς υπογράφοντες), χωρίς τις ενδιάμεσες προσυπογραφές (οι οποίες υπολογίζονται αυτόματα).',
    },
    { Key: 'Chain', Kind: 'signatureChain', Label: 'Σειρά υπογραφών', Tab: 'signatures', From: { Finals: 'FinalSigners', Extra: 'ExtraCosigners', CoAuthors: 'CoAuthors', Ratifiers: 'Ratifiers' } },
    { Key: 'ExternalSigners', Kind: 'text', Label: 'Τελικοί Υπογράφοντες (Εξωτερικοί)', Tab: 'signatures', Multiline: true, MaxLength: 1000 },
    {
      Key: 'Ratifiers', Kind: 'people', Label: 'Υπογραφή Εγκρίνοντος', Tab: 'signatures', Pick: 'groups', Multi: false,
      Tree: groupsTree(), AllowedGroups: SIGNING_GROUPS,
      Hint: 'Αυτόματος υπολογισμός βάσει των τελικών υπογραφόντων.',
    },
    {
      Key: 'ExtraCosigners', Kind: 'people', Label: 'Προσυπογραφές', Tab: 'signatures', Pick: 'groups', Multi: true,
      Tree: groupsTree(), AllowedGroups: SIGNING_GROUPS,
      Hint: 'Επιλέξετε αποκλειστικά τους προσυπογράφοντες που δεν έχουν υπολογιστεί αυτόματα.',
    },
    {
      Key: 'CoAuthors', Kind: 'people', Label: 'Υπογραφές συντάκτη/συνεισηγητών', Tab: 'signatures', Pick: 'users', Multi: true, Tree: ORG,
      Hint: 'Επιλέξετε αποκλειστικά τα πρόσωπα που δεν έχουν υπολογιστεί αυτόματα.',
    },
    // Λοιπά
    ...pick('SendTypes'),
    { Key: 'IssuePlace', Kind: 'text', Label: 'Τόπος Έκδοσης', Tab: 'extras', MaxLength: 200 },
    { Key: 'Author', Kind: 'people', Label: 'Συντάκτης', Tab: 'extras', Pick: 'users', Multi: false, Tree: ORG, Value: [{ UserId: ME.Id, GroupId: 1 }] },
    ...pick('Comments', 'Endiaferomenos', 'Priority', 'Classification', 'IsPersonal', 'KeepUntil', 'RetentionInMonths', 'ThematicFolders'),
    {
      Key: 'CreatedForGroup', Kind: 'people', Label: 'Εκδούσα Υπηρεσιακή Μονάδα', Tab: 'extras', Pick: 'groups', Multi: false, Required: true,
      RequiredMessage: 'Επιλέξτε εκδούσα υπηρεσιακή μονάδα.', Tree: groupsTree(),
      Value: [{ GroupId: group === 7 ? 7 : 2 }],
    },
    ...pick('IssueDate', 'CreatedBy', 'Metadata'),
  ];
  return {
    NewType: 6,
    DocumentType: 3,
    Title: 'Καταχώριση Νέου Εγγράφου (Σχέδιο)',
    Tabs: [
      { Key: 'basic', Label: 'Βασικά' }, { Key: 'kind', Label: 'Είδος' }, { Key: 'categories', Label: 'Θεματικές Κατηγορίες' },
      { Key: 'protocol', Label: 'Πρωτόκολλο' }, { Key: 'distribution', Label: 'Διανομή' }, { Key: 'signatures', Label: 'Υπογραφές' },
      { Key: 'extras', Label: 'Λοιπά' }, { Key: 'metadata', Label: 'Μεταδεδομένα' },
    ],
    AllowBrief: false,
    BriefDefault: false,
    Fields: f,
  };
}

/**
 * The signatures of a draft in order (GetCalculatedSignature in DocumentModelBinder): the
 * author and co-authors, the heads from the author's group upwards to the final signer
 * (computed), the extra προσυπογραφές, the ratifier, the final signers.
 */
export function signatureChain(group, req) {
  const steps = [];
  const warnings = [];
  const add = (Kind, id, Auto, User) => steps.push({ Order: steps.length + 1, Kind, Group: nodeOf(id)?.DisplayName ?? `Υπηρεσία ${id}`, User: User ?? managerOf(id), Auto });
  const authorGroup = group === 7 ? 7 : 2;
  const coAuthors = req.CoAuthors ?? [];
  if (coAuthors.length) for (const c of coAuthors) add('Υπογραφή συντάκτη/συνεισηγητή', c.GroupId, false, USERS.find((u) => u.Id === c.UserId)?.DisplayName);
  else add('Υπογραφή συντάκτη', authorGroup, true, ME.DisplayName);
  const finals = (req.Finals ?? []).map((f) => f.GroupId);
  // Heads from the author's group upwards, up to the final signer's group (the root is the protocol, it does not sign).
  const seen = new Set();
  for (let id = authorGroup; id && id !== 1 && !finals.includes(id); id = parentOf(id)?.Id) {
    seen.add(id);
    add('Προσυπογραφή', id, true);
  }
  for (const e of req.Extra ?? []) if (!seen.has(e.GroupId)) add('Προσυπογραφή', e.GroupId, false);
  for (const r of req.Ratifiers ?? []) add('Υπογραφή Εγκρίνοντος', r.GroupId, false);
  for (const fin of finals) add('Τελική υπογραφή', fin, false);
  for (const s of steps) if (!s.User) warnings.push(`Η υπηρεσία «${s.Group}» δεν έχει ενεργό προϊστάμενο: η υπογραφή της δεν θα μπορεί να γίνει.`);
  return { Steps: steps, Warnings: warnings };
}

/* ---------- files ---------- */

const temp = new Map();
let nextTemp = 1;

export function storeTemp(file) {
  const TempId = `tmp-${nextTemp++}`;
  const IsPdf = /\.pdf$/i.test(file.filename);
  temp.set(TempId, { Name: file.filename, Size: file.data.length, IsPdf, data: file.data });
  return { TempId, Name: file.filename, Size: file.data.length, IsPdf };
}
export const tempFile = (id) => temp.get(id);

/* ---------- registration ---------- */

const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Validates as DocumentPropertiesEditor + Register do; returns errors per field. */
export function validate(form, values, brief) {
  const errors = [];
  for (const f of form.Fields) {
    if (brief && !f.Brief) continue;
    if (f.HiddenIf && JSON.stringify(values[f.HiddenIf.Key] ?? null) === JSON.stringify(f.HiddenIf.Value)) continue;
    const v = values[f.Key];
    if (f.Required && empty(v)) errors.push({ Key: f.Key, Message: f.RequiredMessage || `Συμπληρώστε το πεδίο «${f.Label}».` });
    if (f.Kind === 'text' && typeof v === 'string' && f.MaxLength && v.length > f.MaxLength) errors.push({ Key: f.Key, Message: `Έως ${f.MaxLength} χαρακτήρες.` });
    if (f.Kind === 'files' && Array.isArray(v) && v.some((x) => !temp.has(x.TempId))) errors.push({ Key: f.Key, Message: 'Ένα αρχείο δεν βρέθηκε· ανεβάστε το ξανά.' });
  }
  const kind = values.KindId;
  const kf = FORMS[kind];
  if (kf && !brief) {
    for (const c of kf.components) {
      if (c.validate?.required && empty(values.KindData?.[c.key])) errors.push({ Key: 'KindData', Message: `Ειδικά πεδία: συμπληρώστε «${c.label}».` });
    }
  }
  if (typeof values.Title === 'string' && /^\s*$/.test(values.Title) && !errors.some((e) => e.Key === 'Title')) {
    errors.push({ Key: 'Title', Message: 'Το πεδίο αυτό είναι υποχρεωτικό' });
  }
  return errors;
}

/** Names for the list and the view, from the values of the form. */
export function describe(values) {
  const names = (v) => (Array.isArray(v) ? v : []).map((x) => x.Name ?? x.name).filter(Boolean);
  const kindLabel = KINDS.find((k) => k.Id === values.KindId)?.Label ?? 'Έγγραφο';
  const files = [
    ...(values.MainFile ?? []).map((x) => ({ ...temp.get(x.TempId), Role: 'main' })),
    ...(values.Attachments ?? []).map((x) => ({ ...temp.get(x.TempId), Role: 'attachment' })),
    ...(values.InternalAttachments ?? []).map((x) => ({ ...temp.get(x.TempId), Role: 'internal' })),
    ...(values.SignerAttachments ?? []).map((x) => ({ ...temp.get(x.TempId), Role: 'signer' })),
  ];
  if (values.FromTemplate) files.unshift({ Name: `${(values.Title || 'Έγγραφο').slice(0, 60)}.pdf`, Size: 9, IsPdf: true, Role: 'main', data: null, template: true });
  const groups = (v) => (Array.isArray(v) ? v : []).map((x) => nodeOf(x.GroupId)?.DisplayName).filter(Boolean);
  return {
    kindLabel,
    sender: names(values.Sender)[0] ?? null,
    files,
    recipients: [...groups(values.Recipients), ...names(values.OtherRecipients)].join(', ') || null,
    finals: groups(values.FinalSigners),
  };
}
