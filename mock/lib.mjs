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
/** The request body as a Buffer (uploads are binary); callers decode text themselves. */
export const readBody = (req) =>
  new Promise((resolve) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
  });

/** The file parts of a multipart/form-data body: [{ name, filename, data }], and the text fields. */
export function multipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  if (!m) return { files: [], fields: {} };
  const boundary = Buffer.from('--' + (m[1] ?? m[2]));
  const files = [];
  const fields = {};
  let start = buf.indexOf(boundary);
  while (start >= 0) {
    const next = buf.indexOf(boundary, start + boundary.length);
    if (next < 0) break;
    const part = buf.subarray(start + boundary.length + 2, next - 2); // skip CRLF after the boundary, before the next
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd > 0) {
      const head = part.subarray(0, headEnd).toString('utf8');
      const data = part.subarray(headEnd + 4);
      const name = /name="([^"]*)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      if (filename !== undefined) files.push({ name, filename, data });
      else if (name) fields[name] = data.toString('utf8');
    }
    start = next;
  }
  return { files, fields };
}
