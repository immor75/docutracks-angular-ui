// Serves the production build the way IIS would at /apps-next/ (gzip, long cache for hashed
// files, SPA fallback) and forwards /services to an API.
//
//   node tools/serve-dist.mjs dist/folderui-next/browser                 → mock on :3001
//   node tools/serve-dist.mjs dist/folderui-next/browser --test-new       → real test-new (port 4200)
//   TARGET=<url> PORT=<n> also work (any API, any port)
//
// With the real API the Docutracks cookie is rewritten to localhost, so signing in on
// http://localhost:<PORT>/apps-next/login works exactly as on the server. No dependencies.
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const testNew = args.includes('--test-new');
const ROOT = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist/folderui-next/browser');
const PORT = Number(process.env.PORT ?? (testNew ? 4200 : 4400));
const TARGET = new URL(process.env.TARGET ?? (testNew ? 'https://test-new.docutracks.eu' : 'http://localhost:3001'));
const BASE = '/apps-next/';
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};
const COMPRESS = new Set(['.js', '.css', '.html', '.json', '.svg']);
const gzCache = new Map();

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`No build in ${ROOT}. Run "npm run build" first.`);
  process.exit(1);
}

function proxy(req, res) {
  const secure = TARGET.protocol === 'https:';
  const headers = { ...req.headers, host: TARGET.host };
  if (headers.origin) headers.origin = TARGET.origin;
  if (headers.referer) headers.referer = TARGET.origin + '/';
  const upstream = (secure ? httpsRequest : httpRequest)(
    { host: TARGET.hostname, port: TARGET.port || (secure ? 443 : 80), path: req.url, method: req.method, headers, rejectUnauthorized: false },
    (r) => {
      const out = { ...r.headers };
      // Keep the session cookie on localhost (same as cookieDomainRewrite in proxy.test-new.json).
      if (out['set-cookie']) {
        out['set-cookie'] = out['set-cookie'].map((c) => c.replace(/;\s*domain=[^;]*/gi, '').replace(/;\s*secure/gi, ''));
      }
      // A redirect to the server's login page stays a redirect the app can recognise.
      if (out.location?.startsWith(TARGET.origin)) out.location = out.location.slice(TARGET.origin.length);
      res.writeHead(r.statusCode ?? 502, out);
      r.pipe(res);
    },
  );
  upstream.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`API unreachable: ${e.message}`);
  });
  req.pipe(upstream);
}

createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path.startsWith('/services') || path.startsWith('/__mock') || path.startsWith('/el/Account')) return proxy(req, res);
  if (!path.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE });
    return res.end();
  }
  let file = join(ROOT, decodeURIComponent(path.slice(BASE.length)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(400);
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  const ext = extname(file);
  const hashed = /-[A-Z0-9]{8}\.(js|css)$/i.test(file);
  const headers = {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };
  let body = readFileSync(file);
  if (COMPRESS.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
    const key = `${file}:${statSync(file).mtimeMs}`;
    if (!gzCache.has(key)) gzCache.set(key, gzipSync(body, { level: 9 }));
    body = gzCache.get(key);
    headers['Content-Encoding'] = 'gzip';
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, () => console.log(`FolderUI Next (production build) on http://localhost:${PORT}${BASE}  →  API ${TARGET.origin}`));
