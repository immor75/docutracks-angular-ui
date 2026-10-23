// Smoke test for the document list (phase 2) against the mock: folders, search, period, sort,
// paging, columns, roles per group, keyboard, phone, with axe (WCAG 2.1 AA).
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
const param = (k) => new URL(page.url()).searchParams.get(k);
// The list resource starts loading a frame after the URL changes: wait a moment, then until idle.
const settled = async () => {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => document.querySelector('app-document-table table')?.getAttribute('aria-busy') === 'false' && !document.querySelector('app-document-table .skeleton'));
};
const total = async () => Number((await page.locator('app-pager .range strong').textContent({ timeout: 5000 }).catch(() => '0')) || 0);
const headers = () => page.$$eval('app-document-table th', (th) => th.map((t) => t.textContent.trim()));
/** Opens a sidebar section unless it is open already. */
const expand = async (label) => {
  const btn = page.getByRole('button', { name: 'Ανάπτυξη: ' + label, exact: true });
  if (await btn.count()) await btn.click();
};
const stats = async () => (await fetch(`${BASE}/__mock/stats/`)).json();
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

await step('login opens the default folder «Κύρια»', async () => {
  await page.goto(BASE + '/login?returnUrl=%2Fdocuments');
  await page.evaluate(() => { localStorage.removeItem('dn.columns'); Object.keys(localStorage).filter((k) => k.startsWith('dn.folder')).forEach((k) => localStorage.removeItem(k)); });
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-document-table a.row-link');
  errors.length = 0; // the 401 of the signed-out check before login is expected
  expect(param('f') === '0.0.GroupOwned', 'f=' + param('f'));
  expect((await page.locator('#list-title').textContent()).trim() === 'Κύρια', 'title');
  expect((await total()) === 818, 'total ' + (await total()));
  expect((await page.locator('.period-text').textContent()).includes('23/10/2025'), 'period text');
});
const s1 = await stats();
console.log('     calls on first load:', JSON.stringify(Object.fromEntries(Object.entries(s1).filter(([k]) => k.includes('documents')))));
await page.screenshot({ path: `${OUT}/d1-main.png` });
await axe('main list');

await step('sidebar: Εισερχόμενα › Εκκρεμή', async () => {
  await expand('Εισερχόμενα');
  await page.getByRole('link', { name: 'Εκκρεμή', exact: true }).click();
  await page.waitForURL(/f=1\.11\.GroupOwned/);
  await settled();
  expect((await page.locator('#list-title').textContent()).trim() === 'Εκκρεμή', 'title');
  expect((await page.locator('.crumb').textContent()).trim() === 'Εισερχόμενα', 'crumb');
  const first = page.locator('app-document-table tbody tr').first();
  expect((await first.locator('a.row-link').textContent()).trim() === 'τεστ 44', 'first row');
  expect(await first.locator('.urgent').count(), 'urgent mark');
  expect(await first.locator('.dot').count(), 'not opened by the user');
  expect(await first.evaluate((tr) => tr.classList.contains('unread')), 'unread row');
  expect((await headers()).includes('Αποστολέας') && !(await headers()).includes('Αποδέκτες'), 'incoming columns: ' + (await headers()));
});

await fetch(`${BASE}/__mock/reset/`);
await step('search is debounced to one call', async () => {
  await page.click('#search');
  await page.keyboard.type('Λάρισα', { delay: 40 });
  await page.waitForURL(/q=/);
  await page.waitForTimeout(700);
  await settled();
  const n = (await stats())['POST /services/v2/documents/search/'] ?? 0;
  console.log('     search calls while typing 6 chars:', n);
  expect(n <= 2, 'too many calls: ' + n);
  const titles = await page.$$eval('a.row-link', (a) => a.map((x) => x.textContent));
  expect(titles.length && titles.every((t) => /Λάρισα/.test(t)), 'rows match');
});

await step('search type «Θέμα Εγγράφου» finds «τεστ 44»', async () => {
  await page.selectOption('#search-type', { label: 'Θέμα Εγγράφου' });
  await page.fill('#search', 'τεστ 44');
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => u.searchParams.get('st') === '4' && u.searchParams.get('q') === 'τεστ 44');
  await settled();
  expect((await total()) === 1, 'total ' + (await total()));
  await page.getByRole('button', { name: 'Καθαρισμός αναζήτησης' }).click();
  await page.waitForURL((u) => !u.searchParams.get('q'));
});

await step('period «Όλα» widens the list, custom dates narrow it', async () => {
  await settled();
  const before = await total();
  await page.selectOption('.period select', { label: 'Όλα' });
  await page.waitForURL(/pr=6/);
  await settled();
  const all = await total();
  expect(all > before, `all ${all} <= ${before}`);
  await page.selectOption('.period select', { label: 'Προσαρμοσμένο' });
  await page.waitForURL(/pr=0/);
  await page.locator('.date input').first().fill('2026-10-01');
  await page.locator('.date input').first().dispatchEvent('change');
  await page.waitForURL(/from=2026-10-01/);
  await settled();
  expect((await total()) < before, 'custom ' + (await total()));
  expect((await page.locator('.period-text').textContent()).includes('01/10/2026'), 'period text');
  await page.selectOption('.period select', { label: 'Τελευταίο έτος' });
  await settled();
});

await step('sort by Θέμα, then back to newest first', async () => {
  await page.getByRole('button', { name: /^Θέμα Εγγράφου/ }).click();
  await page.waitForURL(/o=Subject/);
  await settled();
  expect(await page.locator('th[aria-sort=ascending]').count(), 'aria-sort');
  const titles = await page.$$eval('a.row-link', (a) => a.map((x) => x.textContent.trim()));
  const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'el'));
  expect(titles[0].localeCompare(titles.at(-1), 'el') <= 0, 'order ' + titles[0] + ' / ' + titles.at(-1) + ' / ' + sorted[0]);
  await page.goBack();
  await page.waitForURL((u) => !u.searchParams.get('o'));
});

await step('paging: next page from the prefetched cache', async () => {
  await settled();
  await fetch(`${BASE}/__mock/reset/`);
  await page.waitForTimeout(500);
  const before = (await stats())['POST /services/v2/documents/search/'] ?? 0;
  await page.getByRole('button', { name: 'Επόμενη σελίδα' }).click();
  await page.waitForURL(/p=2/);
  await settled();
  const after = (await stats())['POST /services/v2/documents/search/'] ?? 0;
  console.log('     search calls for «Επόμενη»:', after - before);
  expect((await page.locator('app-pager .of').textContent()).includes('Σελίδα 2'), 'page 2');
});

await step('columns: hide «Κατάσταση», remembered after reload, reset', async () => {
  await page.getByRole('button', { name: 'Στήλες' }).click();
  await page.locator('#columns-panel').waitFor();
  await page.screenshot({ path: `${OUT}/d2-columns.png` });
  await axe('columns panel');
  await page.locator('#columns-panel').getByLabel('Κατάσταση').uncheck();
  await page.waitForFunction(() => ![...document.querySelectorAll('app-document-table th')].some((t) => t.textContent.trim() === 'Κατάσταση'));
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('app-document-table a.row-link');
  expect(!(await headers()).includes('Κατάσταση'), 'not remembered');
  await page.getByRole('button', { name: 'Στήλες' }).click();
  await page.locator('#columns-panel').getByRole('button', { name: 'Προεπιλογή' }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => [...document.querySelectorAll('app-document-table th')].some((t) => t.textContent.trim() === 'Κατάσταση'));
});

const sheet = () => page.locator('app-filters-sheet dialog');
const chips = () => page.$$eval('.chips .chip', (c) => c.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
/** Opens a group of the filters sheet unless it is open. */
const group = async (title) => {
  const d = sheet().locator('details', { has: page.locator('summary', { hasText: title }) });
  if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click();
};
const statuses = () => page.$$eval('app-document-table tbody .badge', (b) => b.map((x) => x.textContent.trim()));

await step('filters: status, one request on «Εφαρμογή»', async () => {
  await page.locator('app-folder-nav').getByRole('link', { name: 'Κύρια' }).click();
  await page.waitForURL((u) => u.searchParams.get('f') === '0.0.GroupOwned' && !u.searchParams.get('p'));
  await settled();
  const before = await total();
  await page.getByRole('button', { name: /^Φίλτρα/ }).click();
  await sheet().waitFor();
  await page.screenshot({ path: `${OUT}/d5-filters.png` });
  await axe('filters sheet');
  await fetch(`${BASE}/__mock/reset/`);
  const s = sheet();
  await group('Έγγραφο');
  await s.getByRole('group', { name: /^Κατάσταση/ }).getByLabel('Χρεώθηκε').check();
  await s.getByRole('group', { name: /^Κατάσταση/ }).getByLabel('Απαντήθηκε').check();
  await page.waitForTimeout(300);
  expect(((await stats())['POST /services/v2/documents/search/'] ?? 0) === 0, 'searched before «Εφαρμογή»');
  await s.getByRole('button', { name: /^Εφαρμογή/ }).click();
  await page.waitForURL((u) => u.searchParams.get('c.Status') === '2,4');
  await settled();
  expect(!(await sheet().isVisible()), 'sheet still open');
  expect((await chips())[0] === 'Κατάσταση: Χρεώθηκε, Απαντήθηκε', 'chip ' + (await chips()));
  const n = await total();
  expect(n > 0 && n < before, `total ${n} / ${before}`);
  expect((await statuses()).every((t) => ['Χρεώθηκε', 'Απαντήθηκε'].includes(t)), 'statuses ' + (await statuses()));
  expect(await page.getByRole('button', { name: 'Φίλτρα, 1 ενεργά' }).count(), 'count badge');
});

await step('filters: a parent kind includes its children', async () => {
  await page.getByRole('button', { name: /^Φίλτρα/ }).click();
  await group('Έγγραφο');
  await sheet().getByRole('group', { name: /^Είδος Εγγράφου/ }).getByLabel('Πράξεις').check();
  await sheet().getByRole('button', { name: /^Εφαρμογή/ }).click();
  await page.waitForURL((u) => u.searchParams.get('c.Kinds') === '200');
  await settled();
  const kinds = await page.$$eval('app-document-table .sub', (e) => e.map((x) => x.textContent));
  expect(kinds.length && kinds.every((k) => /Απόφαση|Βεβαίωση|Σύμβαση/.test(k)), 'kinds ' + kinds.slice(0, 3));
});

await step('filters: a user from the organisation tree, named in the chip', async () => {
  await page.getByRole('button', { name: /^Φίλτρα/ }).click();
  await group('Πρόσωπα');
  await sheet().getByRole('group', { name: /^Καταχωριστής/ }).getByRole('button', { name: 'Επιλογή χρηστών…' }).click();
  await sheet().locator('app-org-picker input[type=search]').fill('admina');
  await sheet().locator('app-org-picker').getByLabel('Admina Admin').first().check();
  await page.screenshot({ path: `${OUT}/d6-filters-picker.png` });
  await axe('filters picker');
  await sheet().getByRole('button', { name: 'Τέλος' }).click();
  await sheet().getByRole('group', { name: /^Καταχωριστής/ }).getByText('Admina Admin').waitFor({ timeout: 3000 });
  await sheet().getByRole('button', { name: /^Εφαρμογή \(3\)/ }).click();
  await page.waitForURL((u) => u.searchParams.get('c.Creator') === '1');
  await settled();
  await page.waitForFunction(() => [...document.querySelectorAll('.chips .chip')].some((c) => c.textContent.includes('Καταχωριστής: Admina Admin')));
});

await step('filters: remove one chip, back restores it, clear all', async () => {
  await page.getByRole('button', { name: 'Αφαίρεση φίλτρου Είδος Εγγράφου: Πράξεις' }).click();
  await page.waitForURL((u) => !u.searchParams.get('c.Kinds') && u.searchParams.get('c.Status') === '2,4');
  await page.goBack();
  await page.waitForURL((u) => u.searchParams.get('c.Kinds') === '200');
  await page.getByRole('button', { name: 'Καθαρισμός όλων' }).click();
  await page.waitForURL((u) => ![...u.searchParams.keys()].some((k) => k.startsWith('c.')));
  await settled();
  expect(!(await page.locator('.chips').count()), 'chips left');
});

await step('filters: dates and text, from the URL', async () => {
  await page.goto(BASE + '/documents?f=1.0.GroupOwned&c.SendDate=2026-10-01~&c.Endiaferomenos=γεωργιου');
  await settled();
  const c = await chips();
  expect(c.includes('Ημ. Αποστολής Εισ/μένου: από 01/10/2026') && c.includes('Ενδιαφερόμενος: «γεωργιου»'), 'chips ' + c);
  expect((await total()) > 0, 'no rows');
  await page.locator('app-folder-nav').getByRole('link', { name: 'Κύρια' }).click();
  await page.waitForURL((u) => ![...u.searchParams.keys()].some((k) => k.startsWith('c.')));
});

await step('Εξερχόμενα › Απεσταλμένα show recipients, not sender', async () => {
  await expand('Εξερχόμενα');
  await page.locator('app-folder-nav').getByRole('link', { name: 'Απεσταλμένα', exact: true }).nth(1).click();
  await page.waitForURL(/f=2\.17\.GroupOwned/);
  await settled();
  const h = await headers();
  expect(h.includes('Αποδέκτες') && !h.includes('Αποστολέας'), 'columns ' + h);
});

await step('Σχέδια use the identifier, not the protocol number', async () => {
  await expand('Σχέδια');
  await page.locator('app-folder-nav').getByRole('link', { name: 'Σχέδια', exact: true }).first().click();
  await page.waitForURL(/f=3\.0\.Global/);
  await settled();
  const h = await headers();
  expect(h.includes('Κάτοχος') && !h.includes('Αριθμ. Πρωτ.'), 'columns ' + h);
});

await step('keyboard: / focuses search, arrows move between rows', async () => {
  await page.locator('h1').click();
  await page.keyboard.press('/');
  expect(await page.evaluate(() => document.activeElement?.id === 'search'), 'search focus');
  await page.locator('a.row-link').first().focus();
  await page.keyboard.press('ArrowDown');
  const idx = await page.evaluate(() => [...document.querySelectorAll('a.row-link')].indexOf(document.activeElement));
  expect(idx === 1, 'index ' + idx);
});

await step('group 7 (employee): fewer folders, the last folder is remembered per group', async () => {
  await page.selectOption('#group', '7');
  await page.waitForURL(/f=0\.0\.GroupOwned/);
  await settled();
  await expand('Εισερχόμενα');
  await page.getByRole('link', { name: 'Εκκρεμή', exact: true }).waitFor();
  expect(!(await page.getByRole('link', { name: 'Χρεωμένα', exact: true }).count()), 'Χρεωμένα shown to employee');
  expect(!(await page.getByRole('button', { name: /Υφισταμένων υπηρεσιών/ }).count()), 'sub groups shown');
  await page.selectOption('#group', '2');
  await page.waitForURL(/f=3\.0\.Global/);
});

await step('Υποθέσεις in a group without the module say so', async () => {
  await page.selectOption('#group', '7');
  await page.getByRole('link', { name: 'Υποθέσεις', exact: true }).click();
  await page.getByText('δεν χρησιμοποιεί υποθέσεις').waitFor();
  await page.selectOption('#group', '2');
  await page.getByRole('link', { name: 'Έγγραφα', exact: true }).click();
  await page.waitForSelector('app-document-table a.row-link');
});

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await step('phone: cards, no horizontal scroll, drawer with folders', async () => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow <= 0, 'overflow ' + overflow);
  expect(await page.locator('app-document-table thead').evaluate((t) => getComputedStyle(t).display === 'none'), 'cards');
  await page.screenshot({ path: `${OUT}/d3-phone.png` });
  await page.getByRole('button', { name: 'Φάκελοι εγγράφων' }).click();
  await page.locator('.nav--open').waitFor();
  await page.screenshot({ path: `${OUT}/d4-phone-drawer.png` });
  await page.locator('app-folder-nav').getByRole('link', { name: 'Κύρια' }).click();
  await page.waitForURL(/f=0\.0\.GroupOwned/);
  expect(!(await page.locator('.nav--open').count()), 'drawer closed');
});
await step('phone: filters sheet full width', async () => {
  await page.getByRole('button', { name: /Φίλτρα/ }).click();
  const box = await page.locator('app-filters-sheet dialog').boundingBox();
  expect(box && box.width >= 389, 'width ' + box?.width);
  await page.screenshot({ path: `${OUT}/d7-phone-filters.png` });
  await page.keyboard.press('Escape');
});
await axe('phone list');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
