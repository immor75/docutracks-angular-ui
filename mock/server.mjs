// Mock of the FoldersModule API for local development and measurements.
// Contracts and sample values come from the Postman collection "58112_FoldersModule" (27/06/2025).
// No dependencies: `node mock/server.mjs` (port 3001, or MOCK_PORT). Latency: MOCK_LATENCY=min-max ms.

import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.MOCK_PORT ?? 3001);
const [LAT_MIN, LAT_MAX] = (process.env.MOCK_LATENCY ?? '120-350').split('-').map(Number);

/* ---------- deterministic data ---------- */

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const GROUPS = [
  { Id: 2, GroupName: 'Κεντρικό Πρωτόκολλο', ActiveModules: ['DocumentsModule', 'FoldersModule'] },
  { Id: 4, GroupName: 'Διεύθυνση Διοικητικών Υπηρεσιών', ActiveModules: ['FoldersModule'] },
  { Id: 7, GroupName: 'Τμήμα Μισθοδοσίας', ActiveModules: ['DocumentsModule'] },
];

const USERS = [
  { Id: 1, DisplayName: 'Admina Admin', FirstName: 'Admina', LastName: 'Admin' },
  { Id: 3, DisplayName: 'Συστήματος Διαχειριστής', FirstName: 'Διαχειριστής', LastName: 'Συστήματος' },
  { Id: 11, DisplayName: 'Μαρία Παπαδοπούλου', FirstName: 'Μαρία', LastName: 'Παπαδοπούλου' },
  { Id: 12, DisplayName: 'Γιώργος Νικολάου', FirstName: 'Γιώργος', LastName: 'Νικολάου' },
  { Id: 13, DisplayName: 'Ελένη Δημητρίου', FirstName: 'Ελένη', LastName: 'Δημητρίου' },
  { Id: 14, DisplayName: 'Νίκος Καραγιάννης', FirstName: 'Νίκος', LastName: 'Καραγιάννης' },
];

const OWNERS = ['Κεντρικό Πρωτόκολλο', 'Τέστ Υπηρεσία', 'Γραφείο Ενημερώσεως Κοινού', 'Διεύθυνση Οικονομικών'];

// Postman "Folder Type Instances Filters" response (shortened to the fields the UI reads).
const INSTANCES = [
  { Id: 33, InstanceName: '61868_1', IsActive: true, IdFolderType: 1056, FolderType: { IdFolderType: 1056, Title: '61868' } },
  { Id: 34, InstanceName: '61868_2', IsActive: false, IdFolderType: 1056, FolderType: { IdFolderType: 1056, Title: '61868' } },
  { Id: 32, InstanceName: 'tstype', IsActive: true, IdFolderType: 1055, FolderType: { IdFolderType: 1055, Title: 'tstype' } },
  { Id: 15, InstanceName: 'Ανάθεση Εργασίας', IsActive: true, IdFolderType: 15, FolderType: { IdFolderType: 15, Title: 'Ανάθεση Εργασίας' } },
  { Id: 35, InstanceName: 'Ανάθεση Εργασίας-2', IsActive: true, IdFolderType: 15, FolderType: { IdFolderType: 15, Title: 'Ανάθεση Εργασίας' } },
];
const COUNTS = { 33: 0, 32: 12, 15: 1240, 35: 57 };

const SUBJECTS = [
  'Ανάθεση σε', 'Αίτηση για άδεια', 'Προμήθεια εξοπλισμού', 'Συντήρηση κτιρίου', 'Αίτημα πολίτη',
  'Έλεγχος δαπανών', 'Μίσθωση χώρου', 'Πρόσληψη προσωπικού', 'Εκκαθάριση τιμολογίων', 'Καταγγελία',
];
const PLACES = ['Θεσσαλονίκη', 'Λάρισα', 'Πάτρα', 'Ηράκλειο', 'Αθήνα', 'Ιωάννινα', 'Καλαμαριά'];
const STATUS = ['Δημιουργήθηκε', 'Σε εξέλιξη - Αίτηση για άδεια', 'Σε εξέλιξη - Έγγραφο Ανάθεσης', 'Αρχειοθετήθηκε'];
const ENERGIES = ['-', 'Τηλεφωνική επικοινωνία', 'Αυτοψία', 'Αποστολή εγγράφου', 'Συνάντηση'];

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 21);
const fmt = (t) => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');

const folders = [];
let nextId = 10000;
for (const inst of INSTANCES) {
  const n = COUNTS[inst.Id] ?? 0;
  for (let i = 0; i < n; i++) {
    const created = NOW - between(0, 600) * DAY;
    const updated = created + between(0, Math.min(90, Math.floor((NOW - created) / DAY))) * DAY;
    const status = pick(STATUS);
    const assignees = rnd() < 0.1 ? [] : [pick(USERS), ...(rnd() < 0.3 ? [pick(USERS)] : [])];
    const id = nextId++;
    folders.push({
      IdFolder: id,
      instanceId: inst.Id,
      FolderTypeAndNumber: `${inst.InstanceName}/${4000 + i}`,
      FolderName: `${pick(SUBJECTS)} ${pick(PLACES)}${rnd() < 0.3 ? ' ' + between(1, 99) : ''}`,
      IsReadByUser: rnd() > 0.25,
      IsShared: rnd() < 0.15,
      StatusString: status,
      RecentEnergia: pick(ENERGIES),
      OwnerGroupDisplayName: pick(OWNERS),
      CurrentUsers: [...new Set(assignees.map((u) => u.DisplayName))].join(', '),
      assignees,
      CreatedByName: pick(USERS).DisplayName,
      created,
      updated,
      CreatedDate: new Date(created).toISOString().replace('Z', '0000'),
      UpdatedDate: new Date(updated).toISOString().replace('Z', '0000'),
      FormioDataInputs: rnd() < 0.4 ? [{ Key: 'metadataTitle', Value: String(between(1, 999)), DisplayValue: String(between(1, 999)) }] : [],
    });
  }
}

// Organisation tree (shape of /services/organization/get-organization-tree on test-new).
const ORG = [
  {
    Id: 1, DisplayName: 'Κεντρικό Πρωτόκολλο', IdGroupKind: 1, Users: [USERS[0], USERS[1]],
    SubGroups: [
      { Id: 2, DisplayName: 'Κεντρικό Πρωτόκολλο - Γραμματεία', Users: [USERS[2]], SubGroups: [] },
      {
        Id: 4, DisplayName: 'Διεύθυνση Διοικητικών Υπηρεσιών', Users: [USERS[3], USERS[0]],
        SubGroups: [
          { Id: 41, DisplayName: 'Τμήμα Προσωπικού', Users: [USERS[4]], SubGroups: [] },
          { Id: 42, DisplayName: 'Τμήμα Προμηθειών', Users: [USERS[5], USERS[2]], SubGroups: [] },
        ],
      },
      { Id: 7, DisplayName: 'Τμήμα Μισθοδοσίας', Users: [USERS[5]], SubGroups: [] },
      { Id: 9, DisplayName: 'Γραφείο Δημάρχου', Users: [], SubGroups: [] },
    ].map((g) => ({ IdGroupKind: 7, TitleGroupKind: 'Τμήμα', ...g, Users: g.Users.map(({ Id, DisplayName }) => ({ Id, DisplayName })) })),
  },
];
ORG[0].Users = ORG[0].Users.map(({ Id, DisplayName }) => ({ Id, DisplayName }));
const groupName = (id) => {
  const walk = (n) => (n.Id === id ? n.DisplayName : (n.SubGroups ?? []).map(walk).find(Boolean));
  return ORG.map(walk).find(Boolean);
};
// Groups allowed as "Αποστολή" targets for every folder type (Owner/Editor).
const PERMISSIONS = [{ GroupId: 2, Permission: 'Owner' }, { GroupId: 4, Permission: 'Editor' }, { GroupId: 41, Permission: 'Owner' }];

const pristine = structuredClone(folders);
const nextIdStart = nextId;

const statusId = (s) => (s.startsWith('Δημιουργ') ? 1 : s.startsWith('Σε εξέλιξη') ? 2 : 3);
const listItem = ({ instanceId, assignees, created, updated, shared, log, ownerId, saved, ...rest }) => rest;

function search(body) {
  const c = body.FolderFilterCriteria ?? {};
  const q = (c.Search ?? '').toLocaleLowerCase('el');
  const t = c.SelectedSearchTypeId ?? 1;
  let rows = folders.filter((f) => f.instanceId === c.SelectedFolderTypeInstanceId);
  if (q) {
    rows = rows.filter((f) => {
      const hay = t === 6 ? f.FolderTypeAndNumber : t === 2 ? f.FolderName : `${f.FolderName} ${f.FolderTypeAndNumber} ${f.CurrentUsers}`;
      return hay.toLocaleLowerCase('el').includes(q);
    });
  }
  if (c.FilterFolderStatuses?.length) rows = rows.filter((f) => c.FilterFolderStatuses.includes(statusId(f.StatusString)));
  if (c.StartCreatedDate) rows = rows.filter((f) => f.created >= Date.parse(c.StartCreatedDate));
  if (c.EndCreatedDate) rows = rows.filter((f) => f.created < Date.parse(c.EndCreatedDate) + DAY);
  if (c.SharedFolders) rows = rows.filter((f) => f.IsShared);
  if (c.FilterFolderIsRead?.includes(2)) rows = rows.filter((f) => !f.IsReadByUser);
  if (c.FilterFolderIsRead?.includes(1)) rows = rows.filter((f) => f.IsReadByUser);
  if (c.NoAssignees) rows = rows.filter((f) => !f.CurrentUsers);
  const [o] = body.OrderBy ?? [];
  if (o?.Column) {
    const key = o.Column === 'UpdatedDate' ? 'updated' : o.Column === 'CreatedDate' ? 'created' : o.Column;
    const dir = o.Direction === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
  }
  const size = body.PageSize || 20;
  const page = body.PageNumber || 1;
  return {
    Success: true,
    Payload: { Data: rows.slice((page - 1) * size, page * size).map(listItem), Page: { Size: size, PageNumber: page, TotalElements: rows.length } },
  };
}

function detail(id) {
  const f = folders.find((x) => x.IdFolder === id);
  if (!f) return null;
  seed = id; // stable per folder
  const docs = Array.from({ length: between(0, 6) }, (_, i) => ({
    IdFolderDocument: id * 10 + i,
    Comments: rnd() < 0.2 ? 'Διαβιβάζεται για ενέργεια.' : '',
    CreationDateString: fmt(f.created + i * DAY),
    IsWithdrawn: rnd() < 0.1,
    DocumentKind: { Title: pick(['Αίτηση', 'Απόφαση', 'Διαβιβαστικό', 'Βεβαίωση', 'Σύμβαση']) },
    Document: { IdDocumentCopy: id * 100 + i, Document: { IdDocument: id * 100 + i, Title: `${pick(SUBJECTS)} - ${pick(PLACES)}` } },
  }));
  const histories = Array.from({ length: between(2, 9) }, (_, i) => {
    const u1 = pick(USERS);
    const u2 = pick(USERS);
    return {
      IdHistory: id * 10 + i,
      Date: new Date(f.created + i * 2 * DAY).toISOString(),
      Action: i === 0 ? 'Καταχώριση' : pick(['Χρέωση', 'Αποστολή', 'Επιστροφή', 'Προσθήκη εγγράφου', 'Κοινή χρήση']),
      Comment: rnd() < 0.3 ? 'Παρακαλώ για τις ενέργειές σας.' : '',
      OrgUser1: u1,
      OrgUser2: rnd() < 0.6 ? u2 : undefined,
    };
  });
  const others = folders.filter((x) => x.instanceId === f.instanceId && x.IdFolder !== id);
  const relations = Array.from({ length: between(0, 2) }, (_, i) => {
    const o = pick(others);
    return {
      IdFolderRelation: id * 10 + i,
      RelationDate: new Date(f.created + DAY).toISOString(),
      FolderRelationType: { Title: 'Σχετίζεται με', InverseTitle: 'Σχετίζεται με' },
      IdChildFolder: o.IdFolder,
      ChildCaseNumber: o.FolderTypeAndNumber.split('/').pop(),
      ChildFolder: { Id: o.IdFolder, Name: o.FolderName },
    };
  });
  histories.push(...(f.log ?? []));
  return {
    Success: true,
    Folder: {
      IdFolder: id,
      OrgGroupOwnerId: f.ownerId ?? 1,
      FolderEnergies: [{
        IdFolderEnergia: id * 7, EnergiaDate: `/Date(${f.updated}-0000)/`, IdResponsibleUser: 1, ResponsibleUser: USERS[0],
        IdEnergiaKind: 901, EnergiaKind: { IdFolderEnergiaKind: 901, Title: 'Τηλεφωνική επικοινωνία' },
        Comments: f.RecentEnergia !== '-' ? `Τελευταία ενέργεια: ${f.RecentEnergia}` : '',
      }],
      SharedWithGroups: (f.shared ?? []).map((g) => ({ Group: { Id: g, GroupName: groupName(g) } })),
      SharedWithUsers: [],
      FolderName: f.FolderName,
      CaseNumber: f.FolderTypeAndNumber.split('/').pop(),
      FolderTypeInstanceId: f.instanceId,
      CreatedDate: `/Date(${f.created}-0000)/`,
      UpdatedDate: `/Date(${f.updated}-0000)/`,
      Comments: rnd() < 0.5 ? 'Η υπόθεση αφορά αίτημα που υποβλήθηκε ηλεκτρονικά.\nΑπαιτείται αυτοψία.' : '',
      Keywords: rnd() < 0.4 ? 'αυτοψία, προθεσμία' : '',
      FolderTypeFolderStatus: { Title: f.StatusString, IdFolderType: INSTANCES.find((i) => i.Id === f.instanceId)?.IdFolderType },
      Asignees: f.assignees.map((u, i) => ({ IdAsignee: id * 10 + i, User: u })),
      FolderContacts: Array.from({ length: between(0, 4) }, (_, i) => ({
        IdFolderContact: id * 10 + i,
        Contact: rnd() < 0.5 ? { Eponimia: `${pick(['ΑΛΦΑ', 'ΒΗΤΑ', 'ΔΕΛΤΑ'])} Α.Ε.`, Afm: String(between(100000000, 999999999)) } : { FirstName: pick(['Κώστας', 'Άννα', 'Δημήτρης']), LastName: pick(['Οικονόμου', 'Γεωργίου', 'Ιωάννου']) },
        ...(() => {
          const role = pick(CONTACT_ROLES);
          return { IdFolderTypeContactRole: role.IdFolderTypeContactRole, FolderTypeContactRole: { IdFolderTypeContactRole: role.IdFolderTypeContactRole, ContactRole: role.ContactRole } };
        })(),
      })),
      FolderDocuments: docs,
      Histories: histories,
      RelationsAsParent: relations,
      RelationsAsChild: [],
      FolderDeadlines: rnd() < 0.4 ? [{ IdFolderDeadline: id, Deadline: new Date(NOW + between(1, 40) * DAY).toISOString(), Message: 'Απάντηση στον πολίτη' }] : [],
      FormioDataInputs: f.FormioDataInputs,
      Metadata: f.instanceId === 15 && id % 3 === 0 ? SAMPLE_METADATA : '',
      FolderLocations: [],
      FolderFiles: [],
      Martires: [],
      // Whatever the editor saved replaces the generated values.
      ...(f.saved ?? {}),
    },
  };
}

const P = 'FoldersModule_Ui';
const ACTIONS = [
  ['New', 'Καταχώριση'], ['Edit', 'Επεξεργασία'], ['ViewDoc', 'Επισκόπηση'], ['ViewHist', 'Ιστορικό'],
  ['Assign', 'Χρέωση'], ['Send', 'Αποστολή'], ['Return', 'Επιστροφή'], ['TakeOwnership', 'Ανάληψη Ελέγχου'],
  ['Archive', 'Αρχειοθέτηση'], ['UnArchive', 'Αναίρεση αρχειοθέτησης'], ['Share', 'Κοινή Χρήση'],
  ['Clone', 'Κλωνοποίηση'], ['ChangeType', 'Αλλαγή τύπου'], ['Delete', 'Διαγραφή'], ['MassivePrint', 'Μαζική Εκτύπωση'],
  ['SendReplyToCitizen', 'Αποστολή Απάντησης'],
];

/** What a folder can do now, from its state (so tests see actions change after a write). */
function actionsFor(f) {
  const archived = f.StatusString.startsWith('Αρχειοθ');
  const can = {
    Archive: !archived, UnArchive: archived, Assign: !archived, Send: !archived, Return: !archived,
    TakeOwnership: !archived && !f.assignees.some((u) => u.Id === 1), Share: true, Clone: true,
    ChangeType: !archived, Delete: true, MassivePrint: true, SendReplyToCitizen: false,
  };
  return ACTIONS.map(([code, name]) => ({
    UiActionCode: P + code, UiActionName: name, CanExecute: can[code] ?? true, UiActionIsVisible: true,
    ValidationMessage: can[code] === false ? 'Δεν επιτρέπεται στην τρέχουσα κατάσταση της υπόθεσης.' : '',
  }));
}

const fail = (msg, extra = {}) => ({ Success: false, ...extra, ErrorInfo: { ErrorCode: 403, ExceptionMessage: msg } });
const ok = (code, f) => ({ ActionCode: code.replace(P, ''), Action: code, Folder: { IdFolder: f.IdFolder, FolderName: f.FolderName } });
const logEntry = (f, action, comment = '', target) => {
  f.log = [...(f.log ?? []), {
    IdHistory: f.IdFolder * 100 + (f.log?.length ?? 0) + 50, Date: new Date().toISOString(), Action: action,
    Comment: comment, OrgUser1: USERS[0], OrgGroup2: target ? { Id: target, GroupName: groupName(target) } : undefined,
  }];
  f.updated = Date.now();
  f.UpdatedDate = new Date(f.updated).toISOString().replace('Z', '0000');
  f.RecentEnergia = action;
};

/** POST /v2/folders/action/ — validation messages copied from Postman 58112. */
function postAction(body) {
  const f = folders.find((x) => x.IdFolder === body.FolderId);
  if (!body.ActionCode) return fail('Δεν έχει οριστεί κωδικός ενέργειας');
  if (!f) return fail('Δεν έχει οριστεί υπόθεση');
  const a = actionsFor(f).find((x) => x.UiActionCode === body.ActionCode);
  if (!a) return fail('Ο κωδικός ενέργειας που έχει δοθεί δεν αντιστοιχεί σε κάποια από τις διαθέσιμες ενέργειες');
  if (!a.CanExecute) return fail(`Δεν είναι δυνατή η εκτέλεση της ενέργειας «${a.UiActionName}».`, { Action: body.ActionCode });
  // Test hook: the comment "#fail" makes odd folder ids refuse, to exercise partial failure in mass actions.
  if ((body.ActionParams?.Comment ?? '').includes('#fail') && f.IdFolder % 2 === 1) return fail('Mock: η υπόθεση έχει ανοιχτές προθεσμίες.', { Action: body.ActionCode });
  const c = body.ActionParams?.Comment ?? '';
  switch (body.ActionCode) {
    case P + 'Archive': f.StatusString = 'Αρχειοθετήθηκε'; logEntry(f, 'Αρχειοθέτηση', c); break;
    case P + 'UnArchive': f.StatusString = 'Σε εξέλιξη - Αίτηση για άδεια'; logEntry(f, 'Αναίρεση αρχειοθέτησης', c); break;
    case P + 'Return': logEntry(f, 'Επιστροφή', c); break;
    case P + 'TakeOwnership': f.assignees = [USERS[0]]; f.CurrentUsers = USERS[0].DisplayName; logEntry(f, 'Ανάληψη ελέγχου'); break;
    case P + 'Send': {
      const target = body.ActionParams?.SelectedTargetOwningGroupId;
      if (!target) return fail('Δεν έχει οριστεί η ομάδα αποστολής', { Action: body.ActionCode });
      f.OwnerGroupDisplayName = groupName(target) ?? String(target);
      f.ownerId = target;
      logEntry(f, 'Αποστολή', c, target);
      break;
    }
    case P + 'Clone': {
      const copy = { ...f, IdFolder: nextId++, FolderName: `${f.FolderName} (αντίγραφο)`, log: [], created: Date.now(), updated: Date.now() };
      copy.CreatedDate = copy.UpdatedDate = new Date().toISOString().replace('Z', '0000');
      folders.unshift(copy);
      logEntry(f, 'Κλωνοποίηση', c);
      return ok(body.ActionCode, copy);
    }
    case P + 'Delete': folders.splice(folders.indexOf(f), 1); break;
    default: return fail('Το συγκεκριμένο action code δεν υποστηρίζεται στο συγκεκριμένο endpoint.');
  }
  return ok(body.ActionCode, f);
}

function assign(body) {
  const f = folders.find((x) => x.IdFolder === body.FolderId);
  if (!f) return fail('Δεν έχει οριστεί υπόθεση');
  if (body.ActionCode !== P + 'Assign') return fail('Το συγκεκριμένο action code δεν υποστηρίζεται στο συγκεκριμένο endpoint. Αναμενόμενο action code: FoldersModule_UiAssign');
  if (!body.AssigneesIds?.length) return fail('Δεν έχουν οριστεί Assignees Ids');
  f.assignees = USERS.filter((u) => body.AssigneesIds.includes(u.Id));
  f.CurrentUsers = f.assignees.map((u) => u.DisplayName).join(', ');
  logEntry(f, 'Χρέωση', '', undefined);
  return ok(body.ActionCode, f);
}

function share(body) {
  const f = folders.find((x) => x.IdFolder === body.FolderId);
  if (!f) return fail('Δεν έχει οριστεί υπόθεση');
  if (body.ActionCode !== P + 'Share') return fail('Το συγκεκριμένο action code δεν υποστηρίζεται στο συγκεκριμένο endpoint. Αναμενόμενο action code: FoldersModule_UiShare');
  f.shared = String(body.GroupIds ?? '').split(',').map(Number).filter(Boolean);
  f.IsShared = f.shared.length > 0 || !!body.UsersGroupsIds;
  logEntry(f, 'Κοινή χρήση');
  return { ActionCode: body.ActionCode, Message: 'Επιτυχία', Success: true };
}

function changeType(body) {
  const f = folders.find((x) => x.IdFolder === body.FolderId);
  if (!f) return fail('Δεν έχει οριστεί υπόθεση');
  if (body.ActionCode !== P + 'ChangeType') return fail('Το συγκεκριμένο action code δεν υποστηρίζεται στο συγκεκριμένο endpoint. Αναμενόμενο action code: FoldersModule_UiChangeType');
  const from = INSTANCES.find((i) => i.Id === f.instanceId);
  const to = INSTANCES.find((i) => i.Id === body.FolderTypeInstanceId);
  if (!to || to.IdFolderType !== from.IdFolderType) return fail('Το folder type instance που δόθηκε δεν ανήκει στο folder type του υπάρχων φακέλου', { Action: body.ActionCode });
  f.instanceId = to.Id;
  f.FolderTypeAndNumber = `${to.InstanceName}/${f.FolderTypeAndNumber.split('/').pop()}`;
  logEntry(f, 'Αλλαγή τύπου', body.ActionParams?.Comment ?? '');
  return ok(body.ActionCode, f);
}

// Smallest valid one-page PDF, so the download can be opened.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/* ---------- editor (Καταχώριση / Επεξεργασία) ---------- */

// Formio inputs of a real folder type on test-new («A. νέο είδος με formio»).
const FORMIO = JSON.parse(readFileSync(new URL('./formio-sample.json', import.meta.url), 'utf8'));
const SAMPLE_METADATA =
  '<ExtendedMetadata><metadataTitle type="string">Δείγμα</metadataTitle><checkbox type="boolean">True</checkbox>' +
  '<select type="string">va2</select><datetime>/Date(1791018000000+0300)/</datetime>' +
  '<datagrid><textfield type="string">πρώτη</textfield><radio type="number">1</radio></datagrid>' +
  '<datagrid><textfield type="string">δεύτερη</textfield><radio type="number">2</radio></datagrid></ExtendedMetadata>';
const CONTACT_ROLES = [
  { IdFolderTypeContactRole: 501, ContactRole: 'Αιτών', MinInvolvedContactsLimit: 0, MaxInvolvedContactsLimit: 0, IsActive: true, AllowedForContacts: true, AllowedForGroups: false, AllowedForUsers: true },
  { IdFolderTypeContactRole: 502, ContactRole: 'Εκπρόσωπος', MinInvolvedContactsLimit: 0, MaxInvolvedContactsLimit: 2, IsActive: true, AllowedForContacts: true, AllowedForGroups: true, AllowedForUsers: true },
  { IdFolderTypeContactRole: 503, ContactRole: 'Μάρτυρας', MinInvolvedContactsLimit: 0, MaxInvolvedContactsLimit: 0, IsActive: true, AllowedForContacts: true, AllowedForGroups: false, AllowedForUsers: false },
];
function typeExtended(inst) {
  const withFormio = inst.Id === 15;
  return {
    InstanceName: inst.InstanceName,
    IdFolderType: inst.IdFolderType,
    FolderTypeExtended: {
      Title: inst.FolderType?.Title,
      Tabs: [
        { Name: 'Basic', LabelGr: 'Βασικά', Order: 1 },
        { Name: 'Location', LabelGr: 'Θέση', Order: 2 },
        { Name: 'Stakeholders', LabelGr: 'Εμπλεκόμενοι', Order: 3 },
        { Name: 'Documents', LabelGr: 'Έγγραφα', Order: 4 },
        ...(withFormio ? [{ Name: 'Particulars', LabelGr: 'Ειδικά Στοιχεία', Order: 6 }] : []),
        { Name: 'Deadlines', LabelGr: 'Προθεσμίες', Order: 7 },
        { Name: 'Appeals', LabelGr: 'Ένδικα μέσα', Order: 8 },
        { Name: 'Actions', LabelGr: 'Ενέργειες', Order: 9 },
      ],
      FormioSchemaInputs: withFormio ? FORMIO : [],
      ContactRoles: CONTACT_ROLES,
      DocumentKinds: [
        { IdFolderTypeDocumentKind: 601, Title: 'Αίτηση', IsActive: true, Children: [] },
        { IdFolderTypeDocumentKind: 602, Title: 'Απόφαση', IsActive: true, Children: [{ IdFolderTypeDocumentKind: 603, Title: 'Απόφαση ανάθεσης', IsActive: true, ParentIdFolderTypeDocumentKind: 602 }] },
      ],
      FolderFileKinds: [{ IdFolderTypeFolderFileKind: 701, FolderFileKind: { Id: 71, Title: 'Συνημμένο' } }],
      RelationsAsParent: [{ IdFolderRelationType: 801, Title: 'Σχετίζεται με', InverseTitle: 'Σχετίζεται με', IdParentFolderType: inst.IdFolderType, IdChildFolderType: inst.IdFolderType, IsActive: true }],
      RelationsAsChild: [],
      EnergiaKinds: [
        { IdFolderTypeEnergiaKind: 901, Title: 'Τηλεφωνική επικοινωνία', IsActive: true },
        { IdFolderTypeEnergiaKind: 902, Title: 'Αυτοψία', IsActive: true },
      ],
    },
  };
}

const PLACES_DATA = {
  1: { key: 'Periferies', list: { '': [{ Id: 2, Onomasia: 'ΚΕΝΤΡΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ' }, { Id: 7, Onomasia: 'ΘΕΣΣΑΛΙΑΣ' }] } },
  2: { key: 'Nomoi', list: { 'ΚΕΝΤΡΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ': [{ Id: 21, Onomasia: 'Θεσσαλονίκης' }], ΘΕΣΣΑΛΙΑΣ: [{ Id: 71, Onomasia: 'Λάρισας' }] } },
  3: { key: 'Dimoi', list: { Θεσσαλονίκης: [{ Id: 211, Onomasia: 'Θεσσαλονίκης' }, { Id: 212, Onomasia: 'Καλαμαριάς' }], Λάρισας: [{ Id: 711, Onomasia: 'Λαρισαίων' }] } },
  4: { key: 'Koinotites', list: { Καλαμαριάς: [{ Id: 2121, Onomasia: 'Καλαμαριάς' }], Λαρισαίων: [{ Id: 7111, Onomasia: 'Λάρισας' }] } },
};

const CONTACTS = [
  { IdContact: 3001, Eponimia: 'ΑΛΦΑ ΤΕΧΝΙΚΗ Α.Ε.', Afm: '094000001', ContactType: { ContactTypeName: 'Νομικό πρόσωπο' } },
  { IdContact: 3002, FirstName: 'Άννα', LastName: 'Γεωργίου', Afm: '123456789', ContactType: { ContactTypeName: 'Φυσικό πρόσωπο' } },
  { IdContact: 3003, FirstName: 'Κώστας', LastName: 'Οικονόμου', Afm: '987654321', ContactType: { ContactTypeName: 'Φυσικό πρόσωπο' } },
];
const DOCS = Array.from({ length: 35 }, (_, i) => ({
  Id: 4000 + i, IdDocumentCopy: 5000 + i, Title: `Έγγραφο ${i + 1}: ${SUBJECTS[i % SUBJECTS.length]}`, ProtocolText: `${1200 + i}/2026`,
  ProtocolYear: 2026, IssueDate: new Date(NOW - i * DAY).toISOString(), CreatedBy: USERS[i % USERS.length].DisplayName,
}));
const paged = (rows, page = 1, size = 20) => ({ Success: true, Payload: { Data: rows.slice((page - 1) * size, page * size), Page: { Size: size, PageNumber: page, TotalElements: rows.length } } });
const norm = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Keeps what the editor sent; detail() overlays it. */
function keep(f, Folder) {
  const { Histories, Asignees, FolderTypeFolderStatus, ...rest } = Folder;
  void Histories; void Asignees; void FolderTypeFolderStatus;
  f.saved = { ...(f.saved ?? {}), ...rest, FolderFiles: (rest.FolderFiles ?? []).map((x, i) => ({ ...x, IdFolderFile: x.IdFolderFile || 9000 + i, Base64File: undefined })) };
  f.FolderName = rest.FolderName ?? f.FolderName;
}

function register(body) {
  const F = body.Folder ?? {};
  if (body.ActionCode !== P + 'New') return fail('Ο κωδικός ενέργειας πρέπει να είναι FoldersModule_UiNew');
  const inst = INSTANCES.find((i) => i.Id === F.FolderTypeInstanceId);
  if (!inst) return { Success: false, DocumentInfo: {}, ErrorInfo: { ErrorCode: 0, ExceptionMessage: 'Δεν έχει οριστεί αναφορά αντικειμένου σε μια παρουσία αντικειμένου.' } };
  if (!String(F.FolderName ?? '').trim()) return fail('Ο τίτλος είναι υποχρεωτικός');
  const id = nextId++;
  const n = folders.filter((x) => x.instanceId === inst.Id).length;
  const f = {
    IdFolder: id, instanceId: inst.Id, FolderTypeAndNumber: `${inst.InstanceName}/${9000 + n}`, FolderName: F.FolderName,
    IsReadByUser: true, IsShared: false, StatusString: 'Δημιουργήθηκε', RecentEnergia: 'Καταχώριση', OwnerGroupDisplayName: groupName(body.GroupId) ?? 'Κεντρικό Πρωτόκολλο',
    CurrentUsers: '', assignees: [], CreatedByName: USERS[0].DisplayName, created: Date.now(), updated: Date.now(),
    CreatedDate: new Date().toISOString().replace('Z', '0000'), UpdatedDate: new Date().toISOString().replace('Z', '0000'), FormioDataInputs: [],
  };
  folders.unshift(f);
  keep(f, { ...F, IdFolder: id });
  return { Folder: { IdFolder: id, FolderName: f.FolderName, CaseNumber: f.FolderTypeAndNumber.split('/').pop(), FolderTypeInstanceId: inst.Id } };
}

function edit(body) {
  const F = body.Folder ?? {};
  if (body.ActionCode !== P + 'Edit') return fail('Ο κωδικός ενέργειας πρέπει να είναι FoldersModule_UiEdit');
  const f = folders.find((x) => x.IdFolder === (body.FolderId || F.IdFolder));
  if (!f) return fail('Δεν έχει οριστεί υπόθεση');
  if (!String(F.FolderName ?? '').trim()) return fail('Ο τίτλος είναι υποχρεωτικός');
  if (F.FolderName.includes('#fail')) return fail('Mock: η επεξεργασία απορρίφθηκε από τον server.');
  keep(f, F);
  logEntry(f, 'Επεξεργασία');
  return { FolderId: f.IdFolder, DocumentInfo: { CaseNumber: f.FolderTypeAndNumber.split('/').pop() }, Success: true };
}

/* ---------- http ---------- */

const stats = new Map();
const json = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });
const authed = (req) => /(?:^|;\s*)mock_session=1/.test(req.headers.cookie ?? '');
const bearer = (req) => (req.headers.authorization ?? '').startsWith('Bearer ');

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/*$/, '/');
  const key = `${req.method} ${path.replace(/\/\d+\/?$/, '/:id/')}`;
  if (path === '/__mock/stats/') return json(res, 200, Object.fromEntries(stats));
  if (path === '/__mock/reset/') {
    stats.clear();
    // ?data=1 also undoes every write action (tests start from the same folders).
    if (url.searchParams.get('data')) {
      folders.splice(0, folders.length, ...structuredClone(pristine));
      nextId = nextIdStart;
    }
    return json(res, 200, { ok: true });
  }
  stats.set(key, (stats.get(key) ?? 0) + 1);

  const raw = await readBody(req);
  await new Promise((r) => setTimeout(r, between(LAT_MIN, LAT_MAX)));

  if (path === '/services/authentication/login/' && req.method === 'POST') {
    const p = new URLSearchParams(raw);
    if (p.get('username') && p.get('password') === 'admin') {
      return json(res, 200, { Success: true, access_token: 'mock', expires_in: 3600 }, { 'Set-Cookie': 'mock_session=1; Path=/; HttpOnly; SameSite=Lax' });
    }
    return json(res, 200, { Success: false });
  }
  if (path === '/services/authentication/logout/') return json(res, 200, { Success: true }, { 'Set-Cookie': 'mock_session=; Path=/; Max-Age=0' });
  if (path === '/services/authentication/currentUserAsLogin/') {
    if (!authed(req)) return json(res, 401, { Message: 'Unauthorized' });
    return json(res, 200, { Success: true, IdUser: 1, AccessToken: 'mock-token', IdToken: 'x', RefreshToken: 'x', ExpiresIn: 3600, Name: 'admin', Fullname: 'Admina Admin' });
  }
  if (!bearer(req)) return json(res, 401, { Message: 'Authorization has been denied for this request.' });

  if (path.startsWith('/services/users/')) {
    return json(res, 200, { Success: true, User: { ...USERS[0], UserName: 'admin', Relations: GROUPS.map((g) => ({ Group: g, RoleName: 'Υπάλληλος' })) } });
  }
  const body = raw ? JSON.parse(raw) : {};
  if (path === '/services/v2/folders/filters-folder-type-instances/') {
    const data = body.GroupId === 4 ? INSTANCES.filter((i) => i.IdFolderType === 15) : INSTANCES;
    return json(res, 200, { Success: true, Payload: { Data: data, Page: { Size: data.length, PageNumber: 1, TotalElements: data.length } } });
  }
  if (path === '/services/v2/folders/simple-search/') {
    if (process.env.MOCK_LOG) console.log('search', JSON.stringify({ p: body.PageNumber, q: body.FolderFilterCriteria?.Search, s: body.FolderFilterCriteria?.FilterFolderStatuses, t: body.FolderFilterCriteria?.SelectedFolderTypeInstanceId }));
    return json(res, 200, search(body));
  }
  if (path === '/services/folder/') {
    const d = detail(Number(url.searchParams.get('FolderId')));
    return d ? json(res, 200, d) : json(res, 200, { Success: false, ErrorInfo: { ErrorCode: 404, ExceptionMessage: 'Η υπόθεση δεν βρέθηκε.' } });
  }
  if (path === '/services/v2/folders/actions/') {
    if (!body.FolderIds?.length) return json(res, 200, fail('Δεν έχει οριστεί υπόθεση'));
    return json(res, 200, {
      Success: true,
      FoldersActions: body.FolderIds.map((id) => {
        const f = folders.find((x) => x.IdFolder === id);
        return { FolderId: id, Actions: f ? actionsFor(f) : [] };
      }),
    });
  }
  if (req.method === 'POST' && process.env.MOCK_LOG && /\/v2\/folders\/(action|assign|share|change-type|massive-print)\//.test(path)) console.log('write', path, raw);
  if (path === '/services/v2/folders/action/') return json(res, 200, postAction(body));
  if (path === '/services/v2/folders/assign/') return json(res, 200, assign(body));
  if (path === '/services/v2/folders/share/') return json(res, 200, share(body));
  if (path === '/services/v2/folders/change-type/') return json(res, 200, changeType(body));
  if (path === '/services/v2/folders/massive-print/') {
    if (!body.DocumentCopyIds?.length) return json(res, 200, fail('Επιλέξτε έγγραφα προς εκτύπωση'));
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="documents.pdf"' });
    return res.end(PDF);
  }
  if (path === '/services/v2/folders/users-to-assign/') {
    // The real endpoint returns full user records with Relations (~440 KB); a few fields are enough here.
    const data = USERS.map((u) => ({ ...u, UserName: `user${u.Id}`, IsAdministrator: u.Id === 1, Relations: [] }));
    return json(res, 200, { Success: true, Payload: { Data: data, Page: { Size: data.length, PageNumber: 1, TotalElements: data.length } } });
  }
  if (path === '/services/organization/get-organization-tree/') {
    const ids = body.Ids ?? [1];
    const find = (n) => (ids.includes(n.Id) ? n : (n.SubGroups ?? []).map(find).find(Boolean));
    return json(res, 200, ORG.map(find).filter(Boolean));
  }
  if (path === '/services/v2/folders/folder-type-instance-extended/') {
    const inst = INSTANCES.find((i) => i.Id === body.FolderTypeInstanceId);
    if (!inst) return json(res, 200, fail('Δεν βρέθηκε το είδος υπόθεσης'));
    return json(res, 200, { Success: true, FolderTypeInstanceExtendedDto: { ...typeExtended(inst), OrgGroupPermissions: PERMISSIONS } });
  }
  const avail = /^\/services\/v2\/folder-types\/(\d+)\/available-instances\/$/.exec(path);
  if (avail) {
    const data = INSTANCES.filter((i) => i.IdFolderType === Number(avail[1]) && i.IsActive);
    return json(res, 200, { Success: true, Payload: { Data: data, Page: { Size: data.length, PageNumber: 1, TotalElements: data.length } } });
  }
  if (path === '/services/v2/folders/register/') {
    if (process.env.MOCK_LOG) console.log('register', raw.slice(0, 2000));
    return json(res, 200, register(body));
  }
  if (path === '/services/v2/folders/edit/') {
    if (process.env.MOCK_LOG) console.log('edit', raw.slice(0, 2000));
    return json(res, 200, edit(body));
  }
  const loc = /^\/services\/location\/list\/(\d)(?:\/([^/]+))?\/$/.exec(path);
  if (loc) {
    const t = PLACES_DATA[Number(loc[1])];
    const parent = loc[2] ? decodeURIComponent(loc[2]) : '';
    return json(res, 200, { [t.key]: t.list[parent] ?? [] });
  }
  if (path === '/services/v2/folders/contact/search/') {
    const q = norm(body.Criteria?.SearchTerm);
    const rows = CONTACTS.filter((c) => !q || norm(`${c.Eponimia ?? ''} ${c.FirstName ?? ''} ${c.LastName ?? ''} ${c.Afm}`).includes(q));
    return json(res, 200, paged(rows, body.PageNumber, body.PageSize));
  }
  if (path === '/services/v2/folders/documents-for-relation/') {
    const q = norm(body.Criteria?.Search);
    return json(res, 200, paged(DOCS.filter((d) => !q || norm(`${d.Title} ${d.ProtocolText}`).includes(q)), body.PageNumber, body.PageSize));
  }
  if (path === '/services/v2/folders/related-folders/') {
    const q = norm(body.FolderRelatedCriteria?.Search);
    const rows = folders
      .filter((f) => f.IdFolder !== body.FolderRelatedCriteria?.CurrentFolderId && (!q || norm(`${f.FolderName} ${f.FolderTypeAndNumber}`).includes(q)))
      .map(({ IdFolder, FolderName, FolderTypeAndNumber, StatusString, OwnerGroupDisplayName }) => ({ IdFolder, FolderName, FolderTypeAndNumber, StatusString, OwnerGroupDisplayName }));
    return json(res, 200, paged(rows, body.PageNumber, body.PageSize));
  }
  if (path === '/services/folders/get-file-stream/') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    return res.end(PDF);
  }
  if (path === '/services/user/GetConfigKeyValues/') {
    return json(res, 200, { Success: true, KeyValues: { EnableShareFolderToUsers: 'true', MaxCommentLength: '640', FolderArchiveAutoCompleteComment: 'true' } });
  }
  json(res, 404, { Message: `Mock: ${req.method} ${path} not implemented` });
}).listen(PORT, () => console.log(`FoldersModule mock on http://localhost:${PORT} (${folders.length} folders)`));
