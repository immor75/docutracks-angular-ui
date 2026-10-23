// Shared pieces of the mock: deterministic random, users, groups, organisation tree, http helpers.
// Every module draws from the same seeded generator, so the data stay the same between runs.

/* ---------- deterministic data ---------- */

let seed = 42;
/** Restarts the sequence, so data drawn for one id are the same on every call. */
export const setSeed = (s) => (seed = s);
export const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const pick = (a) => a[Math.floor(rnd() * a.length)];
export const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

export const GROUPS = [
  { Id: 2, GroupName: 'Κεντρικό Πρωτόκολλο', ActiveModules: ['DocumentsModule', 'FoldersModule'] },
  { Id: 4, GroupName: 'Διεύθυνση Διοικητικών Υπηρεσιών', ActiveModules: ['FoldersModule'] },
  { Id: 7, GroupName: 'Τμήμα Μισθοδοσίας', ActiveModules: ['DocumentsModule'] },
];

export const USERS = [
  { Id: 1, DisplayName: 'Admina Admin', FirstName: 'Admina', LastName: 'Admin' },
  { Id: 3, DisplayName: 'Συστήματος Διαχειριστής', FirstName: 'Διαχειριστής', LastName: 'Συστήματος' },
  { Id: 11, DisplayName: 'Μαρία Παπαδοπούλου', FirstName: 'Μαρία', LastName: 'Παπαδοπούλου' },
  { Id: 12, DisplayName: 'Γιώργος Νικολάου', FirstName: 'Γιώργος', LastName: 'Νικολάου' },
  { Id: 13, DisplayName: 'Ελένη Δημητρίου', FirstName: 'Ελένη', LastName: 'Δημητρίου' },
  { Id: 14, DisplayName: 'Νίκος Καραγιάννης', FirstName: 'Νίκος', LastName: 'Καραγιάννης' },
];

// Organisation tree (shape of /services/organization/get-organization-tree on test-new).
export const ORG = [
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
export const groupName = (id) => {
  const walk = (n) => (n.Id === id ? n.DisplayName : (n.SubGroups ?? []).map(walk).find(Boolean));
  return ORG.map(walk).find(Boolean);
};

// Smallest valid one-page PDF, so the download can be opened.
export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/* ---------- http ---------- */

export const paged = (rows, page = 1, size = 20) => ({ Success: true, Payload: { Data: rows.slice((page - 1) * size, page * size), Page: { Size: size, PageNumber: page, TotalElements: rows.length } } });
export const norm = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const fail = (msg, extra = {}) => ({ Success: false, ...extra, ErrorInfo: { ErrorCode: 403, ExceptionMessage: msg } });
export const json = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};
export const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
  });
