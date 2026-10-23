// Phase 6: the form of each action (GET action-data/{code}) and running it (POST action).
// Texts are the Greek resources of the Razor views (Resources/Global.el.resx); which fields
// appear follows the view of each action (UiActions/UiViewDoc/{Code}.cshtml).

import { ORG, USERS } from './lib.mjs';

const ME = USERS[0];
const MAX = 1000; // AppSettings.MAX_COMMENT_LENGTH

/** EnergeiaTypes of test-new are rows of a table; these stand in for them. */
const ENERGEIA = [
  { Id: 1, Label: 'Για ενέργεια' },
  { Id: 2, Label: 'Για κοινοποίηση' },
  { Id: 3, Label: 'Για γνώση' },
];
const WRONG_ASSIGN = { Id: 9, Label: 'Λανθασμένη χρέωση' };

/** Θεματικοί φάκελοι (classifiers), with their parents. */
const THEMATIC = [
  [1, 'Προσωπικό', null], [2, 'Άδειες', 1], [3, 'Μισθοδοσία', 1], [4, 'Προμήθειες', null], [5, 'Διαγωνισμοί', 4],
  [6, 'Συμβάσεις', 4], [7, 'Τεχνικά Έργα', null], [8, 'Συντηρήσεις', 7], [9, 'Αιτήσεις πολιτών', null], [10, 'Βεβαιώσεις', 9],
];
const THEMATIC_PRISTINE = THEMATIC.length;
let nextThematic = 100;

/** Undoes the folders created by «Αρχειοθέτηση» (tests start from the same data). */
export function resetActions() {
  THEMATIC.length = THEMATIC_PRISTINE;
  nextThematic = 100;
}
const thematicPath = (id) => {
  const parts = [];
  for (let t = THEMATIC.find((x) => x[0] === id); t; t = THEMATIC.find((x) => x[0] === t[2])) parts.unshift(t[1]);
  return parts.slice(0, -1).join(' › ') || null;
};
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

export function thematicFolders(search) {
  const q = fold(search).trim();
  return THEMATIC.filter(([, name]) => !q || fold(name).includes(q))
    .slice(0, 20)
    .map(([Id, Name]) => ({ Id, Name, Path: thematicPath(Id) }));
}

/** A subtree of the organisation (the group and, with depth 1, its direct sub-groups). */
const subtree = (group, depth = 99) => {
  // Group 2 of the mock («Κεντρικό Πρωτόκολλο») is node 1 of the organisation tree.
  const id = group === 2 ? 1 : group;
  const find = (n) => (n.Id === id ? n : (n.SubGroups ?? []).map(find).find(Boolean));
  const cut = (n, d) => ({ ...n, SubGroups: d > 0 ? (n.SubGroups ?? []).map((s) => cut(s, d - 1)) : [] });
  const n = ORG.map(find).find(Boolean);
  return n ? [cut(n, depth)] : [];
};
const groupsOnly = (nodes) => nodes.map((n) => ({ ...n, Users: [], SubGroups: groupsOnly(n.SubGroups ?? []) }));
const userName = (id) => USERS.find((u) => u.Id === id)?.DisplayName ?? `Χρήστης ${id}`;
const groupName = (id) => {
  const find = (n) => (n.Id === id ? n : (n.SubGroups ?? []).map(find).find(Boolean));
  return ORG.map(find).find(Boolean)?.DisplayName ?? `Υπηρεσία ${id}`;
};

const comment = (extra = {}) => ({ Kind: 'comment', Key: 'Comment', Label: 'Σχόλιο', MaxLength: MAX, ...extra });

/** Codes this UI runs; everything else stays a link to the classic UI. */
const FORMS = {
  UiArchive: (d) => ({
    Title: 'Αρχειοθέτηση',
    Message: 'Είστε σίγουρος ότι θέλετε να αρχειοθετήσετε το συγκεκριμένο έγγραφο;',
    Submit: 'Αρχειοθέτηση',
    Fields: [
      // UiArchiveDisplayThematicFolder (true), ArchiveActionRequiresThematicFolder (false), AllowNewThematicalFolderByUsers (true)
      {
        Kind: 'thematicFolders', Key: 'ThematicFolders', Label: 'Θεματικοί Φάκελοι', AllowNew: true, Required: false,
        RequiredMessage: 'Δεν έχει επιλεγεί θεματικός φάκελος', Value: d.thematic ?? [],
      },
      comment(),
    ],
  }),
  UiUnArchive: () => ({
    Title: 'Επαναφορά από Αρχειοθέτηση',
    Message: 'Είστε σίγουρος ότι θέλετε να επαναφέρετε σε κατάσταση Δημιουργήθηκε το συγκεκριμένο έγγραφο;',
    Submit: 'Επαναφορά από Αρχειοθέτηση',
    Fields: [comment()],
  }),
  UiCancel: () => ({
    Title: 'Ακύρωση',
    Message: 'Είστε σίγουρος πως επιθυμείτε να ακυρώσετε αυτό το έγγραφο;',
    Submit: 'Συνέχεια',
    Fields: [comment({ Required: true, RequiredMessage: 'Η ενέργεια της ακύρωσης απαιτεί αιτιολόγηση.' })],
  }),
  UiDelete: (d) => ({
    Title: 'Διαγραφή',
    Message: 'Προσοχή. Μετά την ολοκλήρωση αυτής της ενέργειας, το έγγραφο θα διαγραφεί οριστικά από τον κατάλογο εγγράφων.',
    Warnings: d.state === 'sent' ? ['Σας ενημερώνουμε οτι το έγγραφο έχει διακινηθεί εξωτερικά ή εσωτερικά. Επιθυμείτε να προχωρήσετε στην ενέργεια?'] : [],
    Submit: 'Διαγραφή',
    Danger: true,
    Fields: [],
  }),
  UiUnAssign: () => ({
    Title: 'Αποχρέωση',
    Message: 'Είστε σίγουρος ότι θέλετε να αποχρεωθείτε το έγγραφο;',
    Submit: 'Αποχρέωση',
    Fields: [comment()],
  }),
  // CondIsReturnToDirector / CondIsReturnSxedio / CondIsReturnDraftTo decide the variant; the mock
  // has incoming documents (return to sender, with an Ενέργεια) and drafts (return to a signer).
  UiReturn: (d) =>
    d.type === 3
      ? {
          Title: 'Επιστροφή σχεδίου',
          Submit: 'Επιστροφή',
          Fields: [
            {
              Kind: 'select', Key: 'SignatureId', Label: 'Υπογραφές', Required: true,
              Options: [
                { Id: 0, Label: `Συντάκτης (${d.createdBy})` },
                { Id: 501, Label: 'Τμήμα Προσωπικού' },
                { Id: 502, Label: 'Τμήμα Προμηθειών', Disabled: true, Reason: 'Η υπηρεσία δεν έχει ενεργό προϊστάμενο.' },
              ],
              Value: 0,
            },
            comment(),
          ],
          Classic: d.id % 5 === 0 ? 'Για να επισυνάψετε εσωτερικά συνημμένα στην επιστροφή χρειάζεται το κλασικό UI.' : null,
        }
      : {
          Title: 'Επιστροφή στον αποστολέα',
          Submit: 'Επιστροφή',
          Fields: [
            // EnableWrongAssignAsDefaultEnergeiaType (false): choose, nothing preselected
            { Kind: 'select', Key: 'EnergeiaTypeId', Label: 'Ενέργεια', Required: true, RequiredMessage: 'Επιλέξτε ενέργεια.', Options: [...ENERGEIA, WRONG_ASSIGN], Value: null },
            comment(),
          ],
        },
  // ChargeToCurrentOrgGroup (true): users of the current group and its first-level sub-groups.
  UiAssign: (d, group) => ({
    Title: 'Χρέωση',
    Submit: 'Χρέωση',
    Warnings: d.state === 'charged' && d.assignees ? [`To έγγραφο είναι ήδη χρεωμένο σε: Υ.Μ ${groupName(group)} ( ${d.assignees} )`] : [],
    Fields: [
      { Kind: 'people', Key: 'Assignee', Label: 'Στον χρήστη', Pick: 'users', Multi: false, Required: true, RequiredMessage: 'Επιλέξτε χρήστη.', Tree: subtree(group, 1) },
      { Kind: 'people', Key: 'ExtraAssignees', Label: 'Συγχρέωση', Pick: 'users', Multi: true, Tree: subtree(group, 0) },
      { Kind: 'checkbox', Key: 'Urgent', Label: 'Χειρισμός κατά προτεραιότητα', Value: !!d.urgent },
      { Kind: 'checkbox', Key: 'ForAnswer', Label: 'Χρέωση προς Απάντηση', Value: false },
      comment(),
    ],
  }),
  UiNotify: () => ({
    Title: 'Γνωστοποίηση',
    Submit: 'Γνωστοποίηση',
    Fields: [
      { Kind: 'people', Key: 'Users', Label: 'Αναζήτηση Εσωτερικού Αποδέκτη', Pick: 'users', Multi: true, Required: true, RequiredMessage: 'Παρακαλώ επιλέξτε τουλάχιστον έναν αποδέκτη.', Tree: ORG },
      comment(),
    ],
  }),
  UiInform: () => ({
    Title: 'Ενημέρωση',
    Submit: 'Ενημέρωση',
    Fields: [
      { Kind: 'people', Key: 'Users', Label: 'Χρήστες προς ενημέρωση', Pick: 'users', Multi: true, Required: true, RequiredMessage: 'Παρακαλώ επιλέξτε τουλάχιστον έναν αποδέκτη.', Tree: ORG },
      comment(),
    ],
  }),
  UiChangeCreator: (d) => ({
    Title: 'Αλλαγή Εκδούσας Μονάδας και Καταχωριστή',
    Message: 'Η εκτέλεση της ενέργειας θα ενημερώσει τις πληροφορίες του εγγράφου σχετικά με την Εκδούσα Υπηρεσιακή Μονάδα (μόνο για εξερχόμενα έγγραφα), την Υπηρεσιακή Μονάδα Καταχώρισης και τον Καταχωριστή.',
    Warnings: ['Αν η επιλεγμένη υπηρεσία καταχώρισης έχει διαφορετική υπηρεσία διεκπεραίωσης από την αρχική, δε θα είναι δυνατή η εκ νέου εκτέλεση της Αλλαγής.'],
    Submit: 'Αποθήκευση',
    Fields: [
      { Kind: 'people', Key: 'CreatedBy', Label: 'Καταχωριστής', Hint: 'Η υπηρεσία στην οποία τον επιλέγετε γίνεται Υπηρεσιακή Μονάδα Καταχώρισης.', Pick: 'users', Multi: false, Required: true, Tree: ORG },
      ...(d.type === 2 ? [{ Kind: 'people', Key: 'CreatedForGroup', Label: 'Εκδούσα Υπηρεσιακή Μονάδα', Pick: 'groups', Multi: false, Tree: groupsOnly(ORG) }] : []),
    ],
  }),
  UiSend: (d, group) => sendForm(d, 'Αποστολή', groupsOnly(ORG)),
  UiSendToChild: (d, group) => sendForm(d, 'Αποστολή σε τμήμα', groupsOnly(subtree(group))),
  UiSendToFirstLevelChild: (d, group) => sendForm(d, 'Αποστολή σε Υφιστάμενες Υπηρεσίες', groupsOnly(subtree(group, 1))),
};

function sendForm(d, title, tree) {
  return {
    Title: title,
    Submit: 'Αποστολή',
    Fields: [
      {
        Kind: 'people', Key: 'Groups', Label: 'Αναζήτηση Εσωτερικού Αποδέκτη', Pick: 'groups', Multi: true, Required: true,
        RequiredMessage: 'Παρακαλώ επιλέξτε τουλάχιστον έναν αποδέκτη.', Tree: tree,
        PerItem: { EnergeiaTypes: ENERGEIA, DefaultEnergeiaType: 1, Urgent: true },
      },
      comment(),
    ],
    // Outgoing documents with external recipients also go by e-mail (CustomEmail, related
    // documents): that part stays in the classic UI for now.
    Classic: d.type === 2 && d.recipients && /@|Α\.Ε\.|ΕΦΚΑ/.test(d.recipients) && d.id % 3 === 0
      ? 'Το έγγραφο έχει εξωτερικούς αποδέκτες με e-mail· η αποστολή τους γίνεται ακόμη στο κλασικό UI.'
      : null,
  };
}

export const hasForm = (code) => code in FORMS;

export function formFor(code, d, group) {
  return { Code: code, Warnings: [], Classic: null, ...FORMS[code](d, group) };
}

/* ---------- running an action ---------- */

const log = (d, Action, extra = {}) => {
  d.log = [...(d.log ?? []), { At: new Date().toISOString(), Action, User: ME.DisplayName, Group: 'Κεντρικό Πρωτόκολλο', ...extra }];
};

/** Checks the values against the form, as the Razor views and actions do. Returns an error or null. */
function validate(form, values) {
  for (const f of form.Fields) {
    const v = values[f.Key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (f.Required && empty) return f.RequiredMessage || `Συμπληρώστε το πεδίο «${f.Label}».`;
    if (f.Kind === 'comment' && typeof v === 'string' && v.length > f.MaxLength) return `Το σχόλιο ξεπερνά τους ${f.MaxLength} χαρακτήρες.`;
    if (f.Kind === 'select' && !empty && !f.Options.some((o) => o.Id === v && !o.Disabled)) return `Μη έγκυρη επιλογή στο «${f.Label}».`;
  }
  return null;
}

/**
 * Applies the action to one document; returns { Success, Message }. `remove` deletes a
 * document from the data (Διαγραφή).
 */
export function runOn(code, d, group, values, { reason, remove }) {
  if (reason) return { Success: false, Message: reason };
  const form = formFor(code, d, group);
  const error = validate(form, values);
  if (error) return { Success: false, Message: error };
  const note = values.Comment || null;
  const users = (k) => (values[k] ?? []).map((p) => userName(p.UserId));
  const groups = (k) => (values[k] ?? []).map((p) => groupName(p.GroupId));

  switch (code) {
    case 'UiArchive':
      d.state = 'archived';
      d.thematic = values.ThematicFolders ?? [];
      for (const t of d.thematic) {
        if (t.Id === null) THEMATIC.push([(t.Id = nextThematic++), t.Name, null]);
      }
      log(d, 'Αρχειοθέτηση', { Comment: note });
      break;
    case 'UiUnArchive':
      d.state = 'outstanding';
      log(d, 'Επαναφορά από Αρχειοθέτηση', { Comment: note });
      break;
    case 'UiCancel':
      d.state = 'cancelled';
      log(d, 'Ακύρωση', { Comment: note });
      break;
    case 'UiDelete':
      remove(d);
      break;
    case 'UiUnAssign':
      d.state = 'outstanding';
      d.assignees = null;
      d.toMe = false;
      log(d, 'Αποχρέωση', { Comment: note });
      break;
    case 'UiReturn':
      d.state = d.type === 3 ? 'draft' : 'returned';
      log(d, d.type === 3 ? 'Επιστροφή σχεδίου' : 'Επιστροφή', {
        Comment: note,
        Target: d.type === 3 ? form.Fields[0].Options.find((o) => o.Id === values.SignatureId)?.Label : d.sender,
      });
      break;
    case 'UiAssign': {
      const all = [...users('Assignee'), ...users('ExtraAssignees')];
      d.state = 'charged';
      d.assignees = [...new Set(all)].join(', ');
      d.toMe = [values.Assignee, values.ExtraAssignees].flat().some((p) => p?.UserId === ME.Id);
      if (values.Urgent) d.urgent = true;
      log(d, 'Χρέωση', { Target: d.assignees, Comment: (values.ForAnswer ? 'Χρέωση προς Απάντηση. ' : '') + (note ?? '') || null });
      break;
    }
    case 'UiNotify':
      log(d, 'Γνωστοποίηση', { Target: users('Users').join(', '), Comment: note });
      break;
    case 'UiInform':
      d.state = d.state === 'outstanding' ? 'informed' : d.state;
      log(d, 'Ενημέρωση', { Target: users('Users').join(', '), Comment: note });
      break;
    case 'UiChangeCreator': {
      const [p] = values.CreatedBy;
      d.createdBy = userName(p.UserId);
      log(d, 'Αλλαγή Εκδούσας Μονάδας και Καταχωριστή', { Target: `${d.createdBy} (${groupName(p.GroupId)})` });
      break;
    }
    case 'UiSend':
    case 'UiSendToChild':
    case 'UiSendToFirstLevelChild': {
      const kinds = Object.fromEntries(ENERGEIA.map((e) => [e.Id, e.Label]));
      const targets = (values.Groups ?? []).map((p) => `${groupName(p.GroupId)} (${kinds[p.EnergeiaTypeId] ?? kinds[1]}${p.Urgent ? ', επείγον' : ''})`);
      d.state = 'sent';
      if (values.Groups?.some((p) => p.Urgent)) d.urgent = true;
      log(d, form.Title, { Target: targets.join(', '), Comment: note });
      break;
    }
    default:
      return { Success: false, Message: 'Η ενέργεια δεν υποστηρίζεται.' };
  }
  return { Success: true };
}
