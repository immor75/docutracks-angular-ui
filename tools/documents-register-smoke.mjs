// Smoke test for «Νέο έγγραφο», wave 8α (Εισερχόμενο), against the mock: type selection,
// detailed registration with tabs (required fields, server validation of the kind's special
// fields, contacts with a new one, files, recipients, metadata), brief registration, the leave
// guard, «Παλαιότερο έγγραφο», phone, with axe (WCAG 2.1 AA).
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
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/fail-reg-${name.replace(/[^a-z0-9]+/gi, '_')}.png` }); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const toast = (text) => page.locator('app-toasts .toast').filter({ hasText: text });
const field = (key) => page.locator(`[data-field="${key}"]`);
const tab = (name) => page.getByRole('tab', { name: new RegExp('^' + name) });
const summary = () => page.locator('.summary');
const tick = () => page.waitForTimeout(150);
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
const pdf = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`);

await fetch(`${BASE}/__mock/reset/?data=1`);

await step('login, «Νέο έγγραφο» from the list opens the type selection', async () => {
  await page.goto(BASE + '/login?returnUrl=' + encodeURIComponent('/documents?f=1.11.GroupOwned'));
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-document-table a.row-link');
  errors.length = 0;
  await page.getByRole('link', { name: /Νέο έγγραφο/ }).click();
  await page.waitForURL(/\/documents\/new\?back=/);
  await page.getByRole('radio', { name: 'Εισερχόμενο' }).waitFor();
  const outgoing = page.locator('label.type', { hasText: 'Εξερχόμενο' });
  expect((await outgoing.textContent()).includes('στο κλασικό UI'), 'other types marked classic');
  expect(await page.getByRole('radio', { name: 'Εισερχόμενο' }).isChecked(), 'the in-app type is preselected');
});
await page.screenshot({ path: `${OUT}/r1-types.png` });
await axe('type selection');

await step('detailed form: empty registration lists what is missing, link goes to the field', async () => {
  await page.getByRole('button', { name: 'Επόμενο' }).click();
  await page.waitForURL(/t=1/);
  await tab('Βασικά').waitFor();
  expect((await page.getByRole('button', { name: 'Αναλυτική' }).getAttribute('aria-pressed')) === 'true', 'detailed by default');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await summary().waitFor();
  const text = await summary().textContent();
  expect(text.includes('Το πεδίο αυτό είναι υποχρεωτικό') && text.includes('Επιλέξτε ή γράψτε αποστολέα.'), 'issues ' + text);
  expect(await tab('Πρωτόκολλο').locator('.dot-err').count(), 'tab marked');
  await summary().getByRole('button', { name: 'Επιλέξτε ή γράψτε αποστολέα.' }).click();
  await page.waitForTimeout(200);
  expect((await tab('Πρωτόκολλο').getAttribute('aria-selected')) === 'true', 'tab opened');
  expect(await page.evaluate(() => document.activeElement?.id === 'reg-Sender'), 'focus in the field');
});
await page.screenshot({ path: `${OUT}/r2-errors.png` });
await axe('form with errors');

await step('Βασικά: subject from the saved ones, files uploaded at once', async () => {
  await tab('Βασικά').click();
  await field('Title').locator('summary').click();
  await field('Title').getByRole('button', { name: 'Αίτηση χορήγησης βεβαίωσης' }).click();
  await tick();
  expect((await page.locator('#reg-Title').inputValue()) === 'Αίτηση χορήγησης βεβαίωσης', 'title set');
  await page.locator('#reg-Title').fill('Αίτηση χορήγησης βεβαίωσης (smoke)');
  await field('MainFile').locator('input[type=file]').setInputFiles({ name: 'Αίτηση.pdf', mimeType: 'application/pdf', buffer: pdf('main') });
  await field('MainFile').getByText('Αίτηση.pdf').waitFor();
  await field('Attachments').locator('input[type=file]').setInputFiles([
    { name: 'Βεβαίωση εργοδότη.pdf', mimeType: 'application/pdf', buffer: pdf('a1') },
    { name: 'Σημείωμα.txt', mimeType: 'text/plain', buffer: Buffer.from('σημείωμα') },
  ]);
  await field('Attachments').getByText('Σημείωμα.txt').waitFor();
  await field('Attachments').locator('input[type=file]').setInputFiles({ name: 'κακόβουλο.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await field('Attachments').getByText(/κακόβουλο\.exe: Ο τύπος αρχείου δεν επιτρέπεται/).waitFor();
  expect(!(await field('MainFile').locator('input[type=file]').count()), 'one main file only');
});
await page.screenshot({ path: `${OUT}/r3-basic.png` });

await step('Πρωτόκολλο: a new contact as sender, sender protocol and date', async () => {
  await tab('Πρωτόκολλο').click();
  await page.locator('#reg-Sender').fill('Smoke Αποστολέας Α.Ε.');
  await field('Sender').getByRole('button', { name: 'Νέα επαφή «Smoke Αποστολέας Α.Ε.»' }).click();
  await field('Sender').getByText('(νέα)').waitFor();
  await page.locator('#reg-SenderProtocol').fill('1234/2026');
  await page.locator('#reg-SendDate').fill('2026-10-20');
});

await step('Είδος: a kind with special fields; the server checks them', async () => {
  await tab('Είδος').click();
  const kind = field('KindId');
  await kind.getByRole('searchbox').fill('Απόφαση');
  await kind.getByRole('radio', { name: 'Απόφαση' }).check();
  await field('KindData').locator('[data-ready]').waitFor();
  await page.screenshot({ path: `${OUT}/r4-kind.png` });
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await summary().getByText('Ειδικά πεδία: συμπληρώστε «Αριθμός Απόφασης».').waitFor();
  // Another kind: its special fields start over.
  await kind.getByRole('searchbox').fill('Αίτηση');
  await kind.getByRole('radio', { name: 'Αίτηση' }).check();
  await field('KindData').locator('input[name="data[afm]"]').waitFor();
  await field('KindData').locator('input[name="data[afm]"]').fill('123456789');
  await tick();
});

await step('Διανομή and Μεταδεδομένα', async () => {
  await tab('Διανομή').click();
  const rec = field('Recipients');
  await rec.getByRole('searchbox').fill('Προσωπικού');
  await rec.getByRole('checkbox', { name: 'Τμήμα Προσωπικού' }).check();
  await tab('Μεταδεδομένα').click();
  await field('Metadata').getByRole('checkbox', { name: 'Πρωτογενές Αίτημα' }).check();
  await field('Metadata').locator('input[name="data[adam]"]').waitFor();
  await field('Metadata').locator('input[name="data[adam]"]').fill('26REQ0001');
  await tick();
  await axe('distribution and metadata');
});

let newId;
await step('registration opens the new document beside the list it came from', async () => {
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast(/Το έγγραφο καταχωρίστηκε με Αριθμ\. Πρωτ\. \d+\/2026\./).waitFor();
  await page.waitForURL(/\/documents\/\d+\?f=1\.11\.GroupOwned/);
  newId = Number(/\/documents\/(\d+)/.exec(page.url())[1]);
  await page.locator('app-document-detail h2').getByText('Αίτηση χορήγησης βεβαίωσης (smoke)').waitFor();
  await page.locator('app-document-detail').getByRole('tab', { name: /Αρχεία/ }).click();
  await page.locator('app-document-detail').getByText('Βεβαίωση εργοδότη.pdf').waitFor();
  expect((await page.locator('app-document-table a.row-link').first().textContent()).includes('(smoke)'), 'first in the list');
  const one = await (await fetch(`${BASE}/services/v2/documents/${newId}?GroupId=2`, { headers: { Authorization: 'Bearer t' } })).json();
  expect(one.Payload.Kind === 'Αίτηση', 'kind ' + one.Payload.Kind);
});
await page.screenshot({ path: `${OUT}/r5-registered.png` });

await step('leave guard: asks, can continue, can discard', async () => {
  await page.goto(`${BASE}/documents/new?t=1&back=${encodeURIComponent('/documents?f=1.11.GroupOwned')}`);
  await page.locator('#reg-Title').waitFor();
  await page.locator('#reg-Title').fill('Θα απορριφθεί');
  await page.getByRole('button', { name: 'Ακύρωση', exact: true }).click();
  await page.getByText('Απόρριψη του εγγράφου;').waitFor();
  await page.getByRole('button', { name: 'Συνέχεια καταχώρισης' }).click();
  expect(page.url().includes('/documents/new'), 'stayed');
  await page.getByRole('button', { name: 'Ακύρωση', exact: true }).click();
  await page.getByRole('button', { name: 'Απόρριψη' }).click();
  await page.waitForURL((u) => u.pathname === '/documents');
});

await step('brief registration: only its fields, only their checks', async () => {
  await page.goto(`${BASE}/documents/new?t=1`);
  await page.getByRole('button', { name: 'Σύντομη' }).click();
  await page.getByRole('heading', { name: 'Πρωτόκολλο', level: 2 }).waitFor();
  expect(!(await page.getByRole('tab').count()), 'no tabs');
  expect(!(await field('Summary').count()) && !(await field('KindId').count()), 'detailed fields hidden');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await summary().waitFor();
  expect((await summary().locator('li').count()) === 2, 'two issues');
  await page.locator('#reg-Title').fill('Σύντομη καταχώριση (smoke)');
  await page.locator('#reg-Sender').fill('Smoke Σύντομος');
  await field('Sender').getByRole('button', { name: /Νέα επαφή/ }).click();
  await page.screenshot({ path: `${OUT}/r6-brief.png` });
  await axe('brief');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast(/Το έγγραφο καταχωρίστηκε/).waitFor();
  await page.waitForURL(/\/documents\/\d+/);
});

await step('«Παλαιότερο έγγραφο» asks for the number and date it already has', async () => {
  await page.goto(`${BASE}/documents/new`);
  await page.getByRole('checkbox', { name: /Παλαιότερο Έγγραφο/ }).check();
  await page.getByRole('button', { name: 'Επόμενο' }).click();
  await page.waitForURL(/old=1/);
  await page.getByRole('heading', { name: /Παλαιότερου/ }).waitFor();
  await tab('Πρωτόκολλο').click();
  await field('OldProtocolNumber').waitFor();
  expect(await field('OldProtocolDate').count(), 'date too');
});

await step('phone: usable, no horizontal scroll', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/documents/new?t=1`);
  await page.locator('#reg-Title').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow <= 0, 'overflow ' + overflow);
  await page.screenshot({ path: `${OUT}/r7-phone.png` });
  await axe('phone form');
});

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
