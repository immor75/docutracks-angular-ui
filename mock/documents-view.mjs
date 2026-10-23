// The document view (phase 4): GET {id}, GET {id}/history, POST actions and the files.
// Everything is derived from the list document and its id, so it is the same on every call.

import { USERS, groupName } from './lib.mjs';

const pickOf = (id) => {
  let seed = id * 7919 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return { rnd, pick: (a) => a[Math.floor(rnd() * a.length)], chance: (p) => rnd() < p };
};
const iso = (t) => new Date(t).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const names = USERS.map((u) => u.DisplayName);

/* ---------- actions (codes, names and reasons as on test-new, UIViewDoc 23/10/2026) ---------- */

// [code, name, when enabled (doc → reason or null), mass?]
const ACTIONS = [
  ['UiViewDocDetails', 'Αναλυτική Προβολή', () => null],
  ['UiEdit', 'Επεξεργασία', (d) => (d.isFinal ? 'Το έγγραφο βρίσκεται σε τελική κατάσταση.' : null)],
  ['UiAssign', 'Χρέωση', (d) => (d.type === 1 && ['outstanding', 'charged'].includes(d.state) ? null : 'Η Χρέωση μπορεί να πραγματοποιηθεί μόνο σε περιπτώσεις Εισερχομένου από Καταχώριση ή από Παραλαβή.'), true],
  ['UiUnAssign', 'Αποχρέωση', (d) => (d.state === 'charged' ? null : 'Η Αποχρέωση μπορεί να πραγματοποιηθεί μόνο σε περιπτώσεις Χρεώθηκε.'), true],
  ['UiAnswer', 'Απάντηση', (d) => (d.type === 1 && d.state === 'charged' && d.toMe ? null : 'Το έγγραφο μπορεί να απαντηθεί μόνο από χρήστη στον οποίο είναι χρεωμένο.')],
  ['UiSend', 'Αποστολή', (d) => (d.type === 3 || d.state === 'archived' ? 'Η Αποστολή δεν είναι διαθέσιμη σε αυτή την κατάσταση.' : null), true],
  ['UiSendToChild', 'Αποστολή σε τμήμα', (d) => (d.type === 3 ? 'Δεν είναι διαθέσιμη για σχέδια.' : null), true],
  ['UiSendToFirstLevelChild', 'Αποστολή σε Υφιστάμενες Υπηρεσίες', (d) => (d.type === 3 ? 'Δεν είναι διαθέσιμη για σχέδια.' : null), true],
  ['UiForwardMainProtocol', 'Προώθηση στο Κεντρικό Πρωτόκολλο', (d) => (d.type === 1 ? null : 'Προωθούνται μόνο εισερχόμενα.')],
  ['UiNotify', 'Γνωστοποίηση', () => null, true],
  ['UiInform', 'Ενημέρωση', () => null, true],
  ['UiReturn', 'Επιστροφή', (d) => (d.type === 1 && d.state === 'outstanding' ? null : 'Η ενέργεια Επιστροφή είναι διαθέσιμη μόνο όταν η ροή εργασίας είναι: Εισερχόμενο από Καταχώριση.')],
  ['UiArchive', 'Αρχειοθέτηση', (d) => (d.state === 'archived' ? 'Το έγγραφο είναι ήδη αρχειοθετημένο.' : d.type === 3 ? 'Τα σχέδια αρχειοθετούνται μετά την τελική υπογραφή.' : null), true],
  ['UiUnArchive', 'Επαναφορά από Αρχειοθέτηση', (d) => (d.state === 'archived' ? null : 'Η Επαναφορά από Αρχειοθέτηση μπορεί να εκτελεστεί μόνο σε αρχειοθετημένα έγγραφα.')],
  ['UiSendToSign', 'Αποστολή προς Υπογραφή', (d) => (d.type === 3 && d.state === 'draft' ? null : 'Αποστέλλονται προς υπογραφή μόνο σχέδια.'), true],
  ['UiSign', 'Υπογραφή', (d) => (d.type === 3 && d.state === 'tosign' && d.nextToSign === names[0] ? null : 'Δεν είστε ο επόμενος υπογράφων.'), true],
  ['UiUnSign', 'Αναίρεση Υπογραφής', (d) => (d.type === 3 && d.signed ? null : 'Ο τύπος του εγγράφου δεν είναι σχέδιο.')],
  ['UiConvertSxedio', 'Μετατροπή σε εξερχόμενο', (d) => (d.type === 3 && d.state === 'finalsigned' ? null : 'Μετατρέπονται μόνο σχέδια με τελική υπογραφή.'), true],
  ['UiAssignForConsult', 'Χρέωση για Γνώμη', (d) => (d.type === 3 ? null : "Η ενέργεια 'Χρέωση για Γνώμη' δεν μπορεί να εκτελεστεί σε έγγραφο που δεν είναι σχέδιο")],
  ['UiViewHist', 'Ιστορικό', () => null],
  ['UiClone', 'Κλωνοποίηση', () => null],
  ['UiRepetition', 'Ορθή Επανάληψη', (d) => (d.protocol ? null : 'Χρειάζεται αριθμό πρωτοκόλλου.')],
  ['UiCreateExactCopy', 'Δημιουργία Ακριβούς Αντιγράφου', (d) => (d.signed ? 'Το έγγραφο φέρει ήδη ψηφιακή υπογραφή βεβαίωσης ακρίβειας.' : null)],
  ['UiDiavgeiaPublish', 'Δημοσίευση σε ΔΙΑΥΓΕΙΑ', (d) => (d.kind === 'Απόφαση' && !d.published ? null : 'Δεν καταχωρίστηκε υποχρέωση δημοσίευσης στο ΔΙΑΥΓΕΙΑ')],
  ['UiCancel', 'Ακύρωση', (d) => (d.type === 2 && d.protocol && d.state !== 'cancelled' ? null : 'Ακυρώνονται μόνο πρωτοκολλημένα εξερχόμενα.')],
  ['UiChangeCreator', 'Αλλαγή Εκδούσας Μονάδας και Καταχωριστή', () => null],
  ['UiDelete', 'Διαγραφή', (d) => (d.type === 3 && d.state === 'draft' ? null : 'Διαγράφονται μόνο σχέδια που δεν έχουν σταλεί για υπογραφή.')],
  ['ProtocolApp_FoldersModule_UiCreateFolder', 'Δημιουργία Υπόθεσης', () => null],
  ['ProtocolApp_PersonalFoldersModule_UiAddDocumentToPersonalFolder', 'Προσθήκη σε Πρ. Φάκελο', () => null],
];

export function actionsFor(d) {
  return ACTIONS.map(([Code, Name, why, mass]) => {
    const reason = why({ ...d, isFinal: d.type !== 3 && ['archived', 'replied', 'returned', 'cancelled'].includes(d.state) });
    return { Code, Name, Enabled: !reason, ...(reason ? { Reason: reason } : {}), ...(mass ? { Mass: true } : {}) };
  });
}

/* ---------- files ---------- */

/** A small valid PDF with one line of text, so the preview shows something real. */
export function pdfFor(fileId, title) {
  const text = `Docutracks mock - ${title}`.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 60 760 Td (${text}) Tj ET\nBT /F1 11 Tf 60 730 Td (File ${fileId}) Tj ET`;
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** fileId → document id (files are numbered id * 10 + n). */
export const fileOwner = (fileId) => Math.floor(fileId / 10);

/* ---------- view ---------- */

const RELATIONS = ['Απάντηση σε', 'Σχετικό', 'Διαβιβάζει', 'Ορθή επανάληψη του'];

/** The view of a list document `d`; `all` is the whole data set (for related documents). */
export function viewOf(d, all, row) {
  const { rnd, pick, chance } = pickOf(d.id);
  const base = row(d);
  const files = [];
  if (d.kind !== 'Εσωτερικό σημείωμα' || chance(0.5)) {
    files.push({ Id: d.id * 10, Name: `${(d.title || 'Έγγραφο').slice(0, 40)}.pdf`, Size: 40_000 + Math.floor(rnd() * 900_000), Role: 'main', IsPdf: true, IsSigned: d.signed });
  }
  const extra = Math.floor(rnd() * 4);
  for (let i = 1; i <= extra; i++) {
    const pdf = chance(0.6);
    files.push({
      Id: d.id * 10 + i,
      Name: pdf ? `Συνημμένο ${i}.pdf` : pick([`Πίνακας ${i}.xlsx`, `Σημείωμα ${i}.docx`, `Φωτογραφία ${i}.jpg`]),
      Size: 8_000 + Math.floor(rnd() * 400_000),
      Role: i === 3 ? 'internal' : 'attachment',
      IsPdf: pdf,
    });
  }

  const group = groupName(d.group === 7 ? 7 : d.group === 4 ? 4 : 2) ?? 'Κεντρικό Πρωτόκολλο';
  const copies = [{ Id: base.IdDocumentCopy, CreatedAt: base.IssueDate, CreatedByGroup: group, OwnerGroup: group, AssignedTo: d.assignees, Status: base.Status, ProtocolText: d.protocol }];
  if (['sent', 'replied', 'announced'].includes(d.state) || chance(0.2)) {
    for (const g of [41, 42, 7].slice(0, 1 + Math.floor(rnd() * 3))) {
      copies.push({
        Id: base.IdDocumentCopy + g, CreatedAt: iso(d.created + (2 + g) * HOUR), CreatedByGroup: group,
        OwnerGroup: groupName(g) ?? `Υπηρεσία ${g}`, AssignedTo: chance(0.5) ? pick(names) : null,
        Status: pick(['Δημιουργήθηκε', 'Χρεώθηκε', 'Αρχειοθετήθηκε']), ProtocolText: chance(0.5) ? `${200 + g}/${new Date(d.created).getUTCFullYear()}` : null,
      });
    }
  }

  const others = all.filter((x) => x.group === d.group && x.id !== d.id);
  const related = Array.from({ length: Math.floor(rnd() * 3) }, () => {
    const r = others[Math.floor(rnd() * others.length)];
    return { Id: r.id, Title: r.title || '(χωρίς θέμα)', Type: r.type, ProtocolText: r.protocol, Date: iso(r.created), Relation: pick(RELATIONS), CanOpen: chance(0.85) };
  });

  const recipients = [
    ...(d.recipients ?? '').split(', ').filter(Boolean).map((Name) => ({ Name, Internal: false })),
    ...(d.type === 2 && chance(0.5) ? [{ Name: 'Τμήμα Προσωπικού', Internal: true, Cc: true }] : []),
  ];

  const signatures = d.signed || d.state === 'tosign'
    ? [names[1], d.nextToSign ?? names[4], names[0]].slice(0, 2 + Math.floor(rnd() * 2)).map((Name, i, a) => ({
        Name, Group: pick(['Τμήμα Προσωπικού', 'Διεύθυνση Διοικητικών Υπηρεσιών', 'Γραφείο Δημάρχου']),
        Role: i === a.length - 1 ? 'Τελικός υπογράφων' : 'Μονογραφή',
        SignedAt: d.signed || i === 0 ? iso((d.lastSign ?? d.created) - (a.length - i) * HOUR) : null,
      }))
    : [];

  return {
    Id: d.id,
    IdDocumentCopy: base.IdDocumentCopy,
    Type: d.type,
    Title: d.title,
    Kind: d.kind,
    SubKind: d.subKind || null,
    Status: base.Status,
    IsFinal: base.IsFinal,
    IssueDate: base.IssueDate,
    ProtocolText: d.protocol,
    ProtocolDate: base.ProtocolDate,
    ProtocolBook: d.protocol ? (d.altProtocolId === 2 ? 'Εμπιστευτικό Πρωτόκολλο' : 'Βασικό Πρωτόκολλο') : null,
    SenderProtocol: d.senderProtocol,
    Sender: d.sender,
    SendDate: d.sendDate ? iso(d.sendDate) : null,
    Recipients: recipients,
    Priority: ['Κανονική', 'Επείγον', 'Εξαιρετικά επείγον'][(d.priorityId ?? 1) - 1],
    Classification: ['Αδιαβάθμητο', 'Εμπιστευτικό', 'Απόρρητο'][(d.classificationId ?? 1) - 1],
    ContainsPersonalData: chance(0.2),
    DecisionNumber: d.decisionNumber ?? null,
    Ada: d.ada ?? null,
    Comments: chance(0.3) ? 'Παρακαλούμε για τις ενέργειές σας εντός της προθεσμίας.' : null,
    CreatedBy: d.createdBy,
    CreatedForGroup: d.type === 2 || d.type === 3 ? group : null,
    Author: names[(d.authorId ?? 1) % names.length] ?? names[0],
    Endiaferomenos: d.endiaferomenos,
    KeepUntil: d.keepUntil ? iso(d.keepUntil) : null,
    Categories: chance(0.6) ? [pick(['Οικονομικά › Προμήθειες', 'Διοικητικά › Προσωπικό', 'Τεχνικά › Έργα'])] : [],
    ThematicFolders: d.folders ? [d.folders] : [],
    Files: files,
    Signatures: signatures,
    Copies: copies,
    Related: related,
    Folders: chance(0.25) ? [{ Id: 10000 + (d.id % 300), Name: `Υπόθεση για ${(d.title || 'έγγραφο').split(' - ')[0].toLowerCase()}`, CaseNumber: `Ανάθεση Εργασίας/${4000 + (d.id % 900)}` }] : [],
    IsImportant: d.important,
    IsUrgent: d.urgent,
  };
}

export function historyOf(d) {
  const { rnd, pick, chance } = pickOf(d.id + 1);
  const out = [{ At: iso(d.created), Action: d.type === 1 ? 'Καταχώριση εισερχομένου' : 'Δημιουργία', User: d.createdBy, Group: 'Κεντρικό Πρωτόκολλο' }];
  let t = d.created;
  const steps = {
    charged: ['Χρέωση'], replied: ['Χρέωση', 'Απάντηση'], archived: ['Χρέωση', 'Αρχειοθέτηση'], sent: ['Αποστολή'],
    returned: ['Αποστολή', 'Επιστροφή'], announced: ['Κοινοποίηση'], informed: ['Ενημέρωση'], tosign: ['Αποστολή προς υπογραφή', 'Μονογραφή'],
    finalsigned: ['Αποστολή προς υπογραφή', 'Μονογραφή', 'Τελική υπογραφή'],
  }[d.state] ?? [];
  for (const a of steps) {
    t += (1 + Math.floor(rnd() * 30)) * HOUR;
    out.push({
      At: iso(Math.min(t, Date.UTC(2026, 9, 23, 8))), Action: a, User: pick(names),
      Group: pick(['Κεντρικό Πρωτόκολλο', 'Τμήμα Προσωπικού', 'Διεύθυνση Διοικητικών Υπηρεσιών']),
      Target: ['Χρέωση', 'Αποστολή', 'Κοινοποίηση'].includes(a) ? pick([...names.slice(2), 'Τμήμα Προμηθειών']) : null,
      Comment: chance(0.4) ? pick(['Για τις ενέργειές σας.', 'Παρακαλώ για απάντηση εντός εβδομάδας.', 'Έγινε η απαιτούμενη ενέργεια.']) : null,
    });
  }
  for (const e of d.log ?? []) out.push({ Target: null, Comment: null, ...e });
  if (d.readByUser) out.push({ At: iso(Math.min(t + DAY, Date.UTC(2026, 9, 23, 8))), Action: 'Ανάγνωση', User: names[0], Group: 'Κεντρικό Πρωτόκολλο' });
  return out.sort((a, b) => (a.At < b.At ? 1 : -1));
}
