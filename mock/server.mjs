// Mock of the Docutracks API for local development and measurements: authentication, users,
// organisation, and the modules in ./folders.mjs (υποθέσεις) and ./documents.mjs (έγγραφα).
// No dependencies: `node mock/server.mjs` (port 3001, or MOCK_PORT). Latency: MOCK_LATENCY=min-max ms.

import { createServer } from 'node:http';
import { URL } from 'node:url';
import { GROUPS, ORG, USERS, between, json, readBody } from './lib.mjs';
import { folderCount, handleFolders, resetFolders } from './folders.mjs';
import { documentCount, exportLog, handleDocuments, resetDocuments } from './documents.mjs';

const PORT = Number(process.env.MOCK_PORT ?? 3001);
const [LAT_MIN, LAT_MAX] = (process.env.MOCK_LATENCY ?? '120-350').split('-').map(Number);

const PLACES_DATA = {
  1: { key: 'Periferies', list: { '': [{ Id: 2, Onomasia: 'ΚΕΝΤΡΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ' }, { Id: 7, Onomasia: 'ΘΕΣΣΑΛΙΑΣ' }] } },
  2: { key: 'Nomoi', list: { 'ΚΕΝΤΡΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ': [{ Id: 21, Onomasia: 'Θεσσαλονίκης' }], ΘΕΣΣΑΛΙΑΣ: [{ Id: 71, Onomasia: 'Λάρισας' }] } },
  3: { key: 'Dimoi', list: { Θεσσαλονίκης: [{ Id: 211, Onomasia: 'Θεσσαλονίκης' }, { Id: 212, Onomasia: 'Καλαμαριάς' }], Λάρισας: [{ Id: 711, Onomasia: 'Λαρισαίων' }] } },
  4: { key: 'Koinotites', list: { Καλαμαριάς: [{ Id: 2121, Onomasia: 'Καλαμαριάς' }], Λαρισαίων: [{ Id: 7111, Onomasia: 'Λάρισας' }] } },
};

const stats = new Map();
const authed = (req) => /(?:^|;\s*)mock_session=1/.test(req.headers.cookie ?? '');
const bearer = (req) => (req.headers.authorization ?? '').startsWith('Bearer ');

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/*$/, '/');
  const key = `${req.method} ${path.replace(/\/\d+\/?$/, '/:id/')}`;
  if (path === '/__mock/stats/') return json(res, 200, Object.fromEntries(stats));
  if (path === '/__mock/exports/') return json(res, 200, exportLog());
  if (path === '/__mock/reset/') {
    stats.clear();
    // ?data=1 also undoes every write action (tests start from the same data).
    if (url.searchParams.get('data')) {
      resetFolders();
      resetDocuments();
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
  if (path === '/services/organization/get-organization-tree/') {
    const ids = body.Ids ?? [1];
    const find = (n) => (ids.includes(n.Id) ? n : (n.SubGroups ?? []).map(find).find(Boolean));
    return json(res, 200, ORG.map(find).filter(Boolean));
  }
  const loc = /^\/services\/location\/list\/(\d)(?:\/([^/]+))?\/$/.exec(path);
  if (loc) {
    const t = PLACES_DATA[Number(loc[1])];
    const parent = loc[2] ? decodeURIComponent(loc[2]) : '';
    return json(res, 200, { [t.key]: t.list[parent] ?? [] });
  }
  const ctx = { req, res, url, path, raw, body };
  if (handleFolders(ctx) || handleDocuments(ctx)) return;
  json(res, 404, { Message: `Mock: ${req.method} ${path} not implemented` });
}).listen(PORT, () => console.log(`Docutracks mock on http://localhost:${PORT} (${folderCount()} folders, ${documentCount()} documents)`));
