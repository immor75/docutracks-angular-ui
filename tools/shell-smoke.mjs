// Smoke test for the shared shell: dashboard, section navigation, accent per section,
// legacy folder URLs and group change. Runs against the mock (npm run mock + ng serve on :4300).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '_')}.png` }); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const path = () => { const u = new URL(page.url()); return u.pathname + u.search; };
const accent = () => page.evaluate(() => getComputedStyle(document.querySelector('app-shell')).getPropertyValue('--accent').trim());
const axe = async (label) => {
  await page.addScriptTag({ content: axeSrc });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  if (r.length) failed++;
  console.log(`axe ${label}: ${r.length ? '\n  ' + r.join('\n  ') : 'no violations'}`);
};

await fetch(`${BASE}/__mock/reset/`);
let firstType = '';

await step('login lands on the dashboard', async () => {
  await page.goto(BASE + '/');
  await page.waitForURL(/\/login/);
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-dashboard h1');
  errors.length = 0; // the 401 of the signed-out check before login is expected
  expect(path() === '/', 'at ' + path());
  expect((await page.title()) === 'Αρχική · Docutracks', 'title ' + (await page.title()));
  expect((await page.locator('app-dashboard .module').count()) === 2, 'two modules');
  expect((await page.getByRole('link', { name: 'Αρχική', exact: true }).getAttribute('aria-current')) === 'page', 'Αρχική current');
});
await page.screenshot({ path: `${OUT}/s1-dashboard.png` });
await axe('dashboard');

await step('dashboard → Υποθέσεις (teal accent)', async () => {
  await page.locator('app-dashboard [aria-labelledby=m-folders] a', { hasText: 'Άνοιγμα' }).click();
  await page.waitForSelector('app-type-nav a');
  expect(/^\/folders\?t=\d+/.test(path()), 'at ' + path());
  firstType = new URL(page.url()).searchParams.get('t');
  expect((await accent()) === '#0c9088', 'accent ' + (await accent()));
  expect((await page.getByRole('link', { name: 'Υποθέσεις', exact: true }).getAttribute('aria-current')) === 'page', 'Υποθέσεις current');
});

await step('folder opens under /folders/<id>', async () => {
  await page.getByRole('link', { name: 'Ανάθεση Εργασίας', exact: true }).click();
  await page.locator('a.row-link:visible').first().click();
  await page.waitForSelector('app-folder-detail .facts');
  expect(/^\/folders\/\d+\?/.test(path()), 'at ' + path());
});

await step('Έγγραφα tab (blue accent, classic link)', async () => {
  await page.getByRole('link', { name: 'Έγγραφα', exact: true }).click();
  await page.waitForSelector('app-documents-home h1');
  expect(path() === '/documents', 'at ' + path());
  expect((await accent()) === '#4478b8', 'accent ' + (await accent()));
  const href = await page.locator('a.classic').getAttribute('href');
  expect(/^\/el\/List\/\d+$/.test(href ?? ''), 'classic ' + href);
});
await page.screenshot({ path: `${OUT}/s2-documents.png` });
await axe('documents');

await step('legacy /?t= goes to the folder list', async () => {
  await page.goto(BASE + '/?t=' + firstType);
  await page.waitForSelector('app-type-nav a');
  expect(path() === '/folders?t=' + firstType, 'at ' + path());
});
await step('legacy /<id> and /<id>/edit go under /folders', async () => {
  await page.goto(BASE + '/10025484?t=4');
  await page.waitForURL(/\/folders\/10025484\?t=4/);
  await page.goto(BASE + '/10025484/edit');
  await page.waitForURL(/\/folders\/10025484\/edit/);
  await page.goto(BASE + '/new?inst=4');
  await page.waitForURL(/\/folders\/new\?inst=4/);
});
await step('unknown path goes home', async () => {
  await page.goto(BASE + '/whatever');
  await page.waitForSelector('app-dashboard h1');
  expect(path() === '/', 'at ' + path());
});

await step('group change keeps the section', async () => {
  await page.goto(BASE + '/folders?t=4&p=2');
  await page.waitForSelector('app-type-nav a');
  const options = await page.locator('#group option').evaluateAll((o) => o.map((x) => x.value));
  await page.selectOption('#group', options[1]);
  await page.waitForURL((u) => u.pathname === '/folders' && !u.search.includes('p=2'));
});

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/');
await page.waitForSelector('app-dashboard h1');
await step('phone: header fits, no horizontal scroll', async () => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow <= 0, 'overflow ' + overflow);
  const bar = await page.locator('header.bar').boundingBox();
  expect(bar && bar.height <= 57, 'bar height ' + bar?.height);
});
await page.screenshot({ path: `${OUT}/s3-phone-dashboard.png` });
await axe('phone dashboard');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
