// Smoke test for the simple document actions (phase 5) against the mock: σημαντικό and
// αναγνωσμένο from the list and the view, row selection across pages, Excel export of the
// selection and of the list, ZIP of a document's files, phone layout, with axe (WCAG 2.1 AA).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR', acceptDownloads: true });
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
const settled = async () => {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => document.querySelector('app-document-table table')?.getAttribute('aria-busy') === 'false' && !document.querySelector('app-document-table .skeleton'));
};
const total = async () => Number((await page.locator('app-pager .range strong').textContent({ timeout: 5000 }).catch(() => '0')) || 0);
const rows = () => page.locator('app-document-table tbody tr');
const selbar = () => page.locator('.selbar');
const detail = () => page.locator('app-document-detail');
const toast = (text) => page.locator('app-toasts .toast').filter({ hasText: text });
const exportsLog = async () => (await fetch(`${BASE}/__mock/exports/`)).json();
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

await fetch(`${BASE}/__mock/reset/?data=1`);

await step('login, Εισερχόμενα › Εκκρεμή', async () => {
  await page.goto(BASE + '/login?returnUrl=' + encodeURIComponent('/documents?f=1.11.GroupOwned'));
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-document-table a.row-link');
  errors.length = 0; // the 401 of the signed-out check before login is expected
  await settled();
  expect((await rows().first().locator('a.row-link').textContent()).trim() === 'τεστ 44', 'first row');
});

await step('row flag: σημαντικό is saved and survives a reload', async () => {
  const mark = rows().first().getByRole('button', { name: 'Σημαντικό: τεστ 44' });
  const was = (await mark.getAttribute('aria-pressed')) === 'true';
  await mark.click();
  await page.waitForTimeout(100);
  expect((await mark.getAttribute('aria-pressed')) === String(!was), 'changes at once');
  await page.waitForTimeout(400); // the POST
  await page.reload();
  await settled();
  expect((await rows().first().getByRole('button', { name: 'Σημαντικό: τεστ 44' }).getAttribute('aria-pressed')) === String(!was), 'saved');
});

await step('keyboard on a row: s toggles σημαντικό, x selects', async () => {
  await rows().first().locator('a.row-link').focus();
  const before = await rows().first().locator('.mark').getAttribute('aria-pressed');
  await page.keyboard.press('s');
  await page.waitForTimeout(100); // zoneless: the view updates on the next frame
  expect((await rows().first().locator('.mark').getAttribute('aria-pressed')) !== before, 's toggles');
  await page.keyboard.press('x');
  await selbar().waitFor();
  expect((await selbar().locator('.selbar__count').textContent()).replace(/\s+/g, ' ').trim() === '1 επιλεγμένο', 'count 1');
  expect(await rows().first().locator('input[type=checkbox]').isChecked(), 'row checked');
  await page.keyboard.press('x');
  await selbar().waitFor({ state: 'detached' });
});

await step('select the page, keep the selection on the next page', async () => {
  await page.getByRole('checkbox', { name: 'Επιλογή όλων στη σελίδα' }).check();
  expect((await selbar().locator('strong').textContent()) === '20', 'count 20');
  expect((await page.locator('app-document-table tbody tr.selected').count()) === 20, 'rows marked');
  await page.getByRole('button', { name: /Επόμενη/ }).click();
  await settled();
  expect((await selbar().locator('strong').textContent()) === '20', 'kept across pages');
  const all = page.getByRole('checkbox', { name: 'Επιλογή όλων στη σελίδα' });
  expect(!(await all.isChecked()), 'none on page 2');
  await rows().nth(0).locator('input[type=checkbox]').check();
  expect(await all.evaluate((i) => i.indeterminate), 'some on page 2');
  expect((await selbar().locator('strong').textContent()) === '21', 'count 21');
  await rows().nth(0).locator('input[type=checkbox]').uncheck();
  await page.getByRole('button', { name: /Προηγούμενη/ }).click();
  await settled();
  expect(await all.isChecked(), 'all on page 1');
});
await page.screenshot({ path: `${OUT}/m1-selection.png` });
await axe('selection');

await step('bulk: μη αναγνωσμένα, then αναγνωσμένα', async () => {
  await selbar().getByRole('button', { name: 'Σήμανση ως μη αναγνωσμένα' }).click();
  await toast('Σημειώθηκαν 20 έγγραφα ως μη αναγνωσμένα.').waitFor();
  expect((await page.locator('app-document-table tbody tr .dot').count()) === 20, 'all unread');
  await selbar().getByRole('button', { name: 'Σήμανση ως αναγνωσμένα' }).click();
  await toast('Σημειώθηκαν 20 έγγραφα ως αναγνωσμένα.').waitFor();
  expect((await page.locator('app-document-table tbody tr .dot').count()) === 0, 'all read');
});

await step('bulk: σημαντικά, kept after a refresh', async () => {
  await selbar().getByRole('button', { name: 'Σήμανση ως σημαντικά' }).click();
  await toast('Σημειώθηκαν 20 έγγραφα ως σημαντικά.').waitFor();
  await page.getByRole('button', { name: 'Ανανέωση λίστας' }).click();
  await settled();
  expect((await page.locator('app-document-table tbody .mark[aria-pressed=true]').count()) === 20, 'all important');
  await selbar().getByRole('button', { name: 'Σήμανση ως όχι σημαντικά' }).click();
  await toast('Σημειώθηκαν 20 έγγραφα ως μη σημαντικά.').waitFor();
  expect((await page.locator('app-document-table tbody .mark[aria-pressed=true]').count()) === 0, 'none important');
});

await step('Excel of the selection, with files', async () => {
  await selbar().getByRole('button', { name: 'Εξαγωγή επιλεγμένων σε Excel' }).click();
  const dlg = page.locator('app-export-dialog dialog');
  await dlg.waitFor();
  expect((await dlg.textContent()).includes('Τα 20 επιλεγμένα έγγραφα'), 'says 20');
  await page.screenshot({ path: `${OUT}/m2-export.png` });
  await axe('export dialog');
  await dlg.getByRole('checkbox', { name: 'Μαζί με τα αρχεία των εγγράφων' }).check();
  await dlg.getByRole('button', { name: 'Εξαγωγή' }).click();
  await toast('Η εξαγωγή 20 εγγράφων καταχωρίστηκε').waitFor();
  await dlg.waitFor({ state: 'hidden' });
  const log = await exportsLog();
  expect(log.length === 1 && log[0].DocumentIds.length === 20 && log[0].WithFiles === true, JSON.stringify(log).slice(0, 120));
});

await step('Esc clears the selection; another folder clears it too', async () => {
  await page.locator('body').click({ position: { x: 5, y: 890 } });
  await page.keyboard.press('Escape');
  await selbar().waitFor({ state: 'detached' });
  await rows().first().locator('input[type=checkbox]').check();
  await selbar().waitFor();
  await page.getByRole('link', { name: 'Χρεωμένα σε εμένα', exact: true }).click();
  await page.waitForURL(/f=1\.30\.GroupOwned/);
  await settled();
  expect(!(await selbar().count()), 'cleared');
});

await step('Excel of the whole list (query, no paging)', async () => {
  await page.goto(BASE + '/documents?f=1.11.GroupOwned&pr=6');
  await settled();
  const n = await total();
  await page.getByRole('button', { name: 'Εξαγωγή της λίστας σε Excel' }).click();
  const dlg = page.locator('app-export-dialog dialog');
  await dlg.waitFor();
  expect((await dlg.textContent()).includes(`${n} έγγραφα του φακέλου «Εισερχόμενα › Εκκρεμή»`), 'says ' + n);
  await dlg.getByRole('button', { name: 'Εξαγωγή' }).click();
  await toast(`Η εξαγωγή ${n} εγγράφων καταχωρίστηκε`).waitFor();
  const log = await exportsLog();
  expect(log.at(-1).DocumentIds.length === n && !log.at(-1).WithFiles, 'job of ' + log.at(-1).DocumentIds.length);
});

await step('Excel is off for an empty list', async () => {
  await page.goto(BASE + '/documents?f=1.11.GroupOwned&q=zzzzzz');
  await page.getByText('Δεν βρέθηκαν έγγραφα').waitFor();
  expect(await page.getByRole('button', { name: 'Εξαγωγή της λίστας σε Excel' }).isDisabled(), 'disabled');
});

await step('view: s marks σημαντικό, the list follows', async () => {
  await page.goto(BASE + '/documents/102300?f=1.11.GroupOwned');
  await detail().locator('.facts').waitFor();
  const mark = detail().getByRole('button', { name: 'Σημαντικό (s)' });
  if ((await mark.getAttribute('aria-pressed')) === 'true') await mark.click(); // start from «off»
  await page.waitForTimeout(300);
  await page.locator('body').press('s');
  await page.waitForTimeout(100);
  expect((await mark.getAttribute('aria-pressed')) === 'true', 'on');
  await detail().getByText('Σημαντικό', { exact: true }).waitFor();
  expect((await page.locator('app-document-table tr.open .mark').getAttribute('aria-pressed')) === 'true', 'row follows');
});
await page.screenshot({ path: `${OUT}/m3-view-marks.png` });
await axe('view marks');

await step('view: ZIP of all files', async () => {
  await detail().getByRole('tab', { name: /Αρχεία/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), detail().getByRole('button', { name: 'Λήψη όλων (ZIP)' }).click()]);
  expect(['τεστ 44.zip', 'download'].includes(dl.suggestedFilename()), 'name ' + dl.suggestedFilename());
  const bytes = readFileSync(await dl.path());
  expect(bytes.subarray(0, 2).toString() === 'PK', 'zip');
  expect(bytes.includes(Buffer.from('Συνημμένα/Συνημμένο 1.pdf')), 'folders inside');
});

await step('view: u marks unread and goes back to the list', async () => {
  await detail().getByRole('heading', { level: 2 }).focus();
  await page.keyboard.press('u');
  await page.waitForURL((u) => u.pathname === '/documents');
  await toast('Το έγγραφο σημειώθηκε ως μη αναγνωσμένο.').waitFor();
  expect(await rows().first().locator('.dot').count(), 'unread again');
});

await step('phone: selection on the cards', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow <= 0, 'overflow ' + overflow);
  await rows().nth(1).locator('input[type=checkbox]').check();
  await selbar().waitFor();
  const bar = await selbar().boundingBox();
  expect(bar && bar.width <= 390, 'bar fits');
  await page.screenshot({ path: `${OUT}/m4-phone.png` });
});
await axe('phone selection');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
