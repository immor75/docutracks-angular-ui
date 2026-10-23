// Smoke test for wave 8γ of «Νέο έγγραφο», against the mock: Εξερχόμενο (brief) and
// Υποστηρικτικά registered here, «Επεξεργασία» with limited edit after protocol (read-only fields,
// kept and removed files, the leave guard), «Απάντηση» (types without Εισερχόμενο, prefilled
// relation, recipient and categories) and «Κλωνοποίηση» (one type: no choice), with axe (WCAG 2.1 AA).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Mock documents of group 2: an incoming charged to the user (answerable, with Αριθμ. Πρωτ.), a draft. */
const INCOMING = 102312;
const DRAFT = 102304;

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
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/fail-edit-${name.replace(/[^a-z0-9]+/gi, '_')}.png` }); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const toast = (text) => page.locator('app-toasts .toast').filter({ hasText: text });
const field = (key) => page.locator(`[data-field="${key}"]`);
const tab = (name) => page.getByRole('tab', { name: new RegExp('^' + name) });
const summary = () => page.locator('.summary');
const detail = () => page.locator('app-document-detail');
const api = async (path) => (await (await fetch(`${BASE}/services/v2/documents/${path}`, { headers: { Authorization: 'Bearer t' } })).json()).Payload;
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
/** Runs an action of the open document: a button, or an item of «Περισσότερα». */
const action = async (name) => {
  const bar = detail().locator('app-document-actions').first();
  await bar.locator('a.btn').first().waitFor();
  const inline = bar.locator(':scope > a.btn', { hasText: name });
  if (await inline.count()) return inline.click();
  await bar.getByRole('button', { name: 'Περισσότερα' }).click();
  await bar.getByRole('menuitem', { name: new RegExp('^' + name) }).click();
};
const pickGroup = async (key, search, name) => {
  await field(key).getByRole('searchbox').fill(search);
  await field(key).getByRole('checkbox', { name }).check();
};

await fetch(`${BASE}/__mock/reset/?data=1`);

await step('login; every type is registered here', async () => {
  await page.goto(BASE + '/login?returnUrl=' + encodeURIComponent('/documents/new'));
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.getByRole('radio', { name: 'Εξερχόμενο' }).waitFor();
  errors.length = 0;
  expect((await page.getByRole('radio').count()) === 4, 'four types');
  expect(!(await page.getByText('στο κλασικό UI').count()), 'none opens the classic UI');
});

await step('Εξερχόμενο, brief: its fields only; registered with a protocol number', async () => {
  await page.getByRole('radio', { name: 'Εξερχόμενο' }).check();
  await page.getByRole('button', { name: 'Επόμενο' }).click();
  await page.getByRole('heading', { name: /\(Εξερχόμενο\)/ }).waitFor();
  await page.getByRole('button', { name: 'Σύντομη' }).click();
  await page.getByRole('heading', { name: 'Υπογραφές', level: 2 }).waitFor();
  expect(!(await field('Chain').count()) && !(await field('Ratifiers').count()), 'no signature chain for outgoing');
  expect(!(await field('Summary').count()), 'detailed fields hidden');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await summary().waitFor();
  const text = await summary().textContent();
  expect(text.includes('Δεν έχει επιλεγεί τελικός υπογράφων.') && text.includes('κυρίως έγγραφο'), 'issues ' + text);
  await page.locator('#reg-Title').fill('Εξερχόμενο έγγραφο (smoke)');
  await field('MainFile').locator('input[type=file]').setInputFiles({ name: 'Εξερχόμενο.pdf', mimeType: 'application/pdf', buffer: pdf('out') });
  await field('MainFile').getByRole('button', { name: 'Αφαίρεση Εξερχόμενο.pdf' }).waitFor();
  await pickGroup('FinalSigners', 'Προσωπικού', 'Τμήμα Προσωπικού');
  await page.screenshot({ path: `${OUT}/e1-outgoing.png` });
  await axe('outgoing brief');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast(/Το έγγραφο καταχωρίστηκε με Αριθμ\. Πρωτ\. \d+\/2026\./).waitFor();
  await page.waitForURL(/\/documents\/\d+(\?|$)/);
  await detail().locator('.kicker', { hasText: 'Εξερχόμενο' }).waitFor();
});

await step('Υποστηρικτικά: no template, no issuing unit, file optional', async () => {
  await page.goto(`${BASE}/documents/new?t=5`);
  await page.getByRole('heading', { name: /\(Υποστηρικτικά Έγγραφα\)/ }).waitFor();
  expect(!(await field('FromTemplate').count()), 'no template');
  await page.locator('#reg-Title').fill('Υποστηρικτικό έγγραφο (smoke)');
  await tab('Υπογραφές').click();
  await pickGroup('FinalSigners', 'Προσωπικού', 'Τμήμα Προσωπικού');
  await tab('Λοιπά').click();
  expect(!(await field('CreatedForGroup').count()), 'no issuing unit');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast(/Το έγγραφο καταχωρίστηκε/).waitFor();
  await page.waitForURL(/\/documents\/\d+(\?|$)/);
  await detail().locator('.kicker', { hasText: 'Υποστηρικτικό' }).waitFor();
});

await step('«Επεξεργασία» of a protocolled incoming: limited, with its values', async () => {
  await page.goto(`${BASE}/documents/${INCOMING}?f=1.0.GroupOwned`);
  await detail().locator('h2').first().waitFor();
  await action('Επεξεργασία');
  await page.waitForURL(new RegExp(`/documents/${INCOMING}/edit\\?back=`));
  await page.getByRole('heading', { name: 'Επεξεργασία Εγγράφου (Εισερχόμενο)' }).waitFor();
  await page.locator('.notice', { hasText: 'Περιορισμένη επεξεργασία' }).waitFor();
  expect(!(await page.getByRole('button', { name: 'Σύντομη' }).count()), 'no brief edit');
  expect((await page.locator('#reg-Title').inputValue()).length > 3, 'title filled');
  // Read-only: shown as text, no control.
  expect(await field('MainFile').locator('.ro').count(), 'main file read-only');
  expect(!(await field('MainFile').locator('input[type=file]').count()), 'no upload for the main file');
  await tab('Πρωτόκολλο').click();
  const sender = await field('Sender').locator('.ro').textContent();
  expect(sender.trim().length > 1 && !(await field('Sender').locator('input').count()), 'sender read-only: ' + sender);
  await page.screenshot({ path: `${OUT}/e2-edit.png` });
  await axe('limited edit');
});

let removed;
await step('edit: title, a removed attachment, a new one; the view shows them', async () => {
  await tab('Βασικά').click();
  await page.locator('#reg-Title').fill('Επεξεργασμένο θέμα (smoke)');
  const att = field('Attachments');
  const before = await att.locator('li .name').allTextContents();
  expect(before.length >= 1, 'has attachments');
  removed = before[0];
  await att.getByRole('button', { name: 'Αφαίρεση ' + removed }).click();
  await att.locator('input[type=file]').setInputFiles({ name: 'Νέο συνημμένο.pdf', mimeType: 'application/pdf', buffer: pdf('att') });
  await att.getByRole('button', { name: 'Αφαίρεση Νέο συνημμένο.pdf' }).waitFor();
  await page.locator('.unsaved', { hasText: 'Μη αποθηκευμένες αλλαγές' }).waitFor();
  await page.getByRole('button', { name: 'Αποθήκευση', exact: true }).click();
  await toast('Οι αλλαγές αποθηκεύτηκαν.').waitFor();
  await page.waitForURL(new RegExp(`/documents/${INCOMING}\\?f=1\\.0\\.GroupOwned`));
  await detail().locator('h2').getByText('Επεξεργασμένο θέμα (smoke)').waitFor();
  const v = await api(`${INCOMING}?GroupId=2`);
  const names = v.Files.map((f) => f.Name);
  expect(names.includes('Νέο συνημμένο.pdf') && !names.includes(removed), 'files ' + names.join(', '));
});

await step('edit: emptied required field is refused; leaving asks first', async () => {
  await page.goto(`${BASE}/documents/${INCOMING}/edit`);
  await page.locator('#reg-Title').waitFor();
  await page.waitForFunction(() => document.querySelector('#reg-Title')?.value.length > 0);
  await page.locator('#reg-Title').fill('');
  await page.getByRole('button', { name: 'Αποθήκευση', exact: true }).click();
  await summary().getByText('Οι αλλαγές δεν αποθηκεύτηκαν.').waitFor();
  await page.getByRole('button', { name: 'Ακύρωση', exact: true }).click();
  await page.getByText('Απόρριψη των αλλαγών;').waitFor();
  await page.getByRole('button', { name: 'Απόρριψη' }).click();
  await page.waitForURL(new RegExp(`/documents/${INCOMING}$`));
});

let answerId;
await step('«Απάντηση»: no Εισερχόμενο; the draft is prefilled from the incoming', async () => {
  const src = await api(`${INCOMING}?GroupId=2`);
  await page.goto(`${BASE}/documents/${INCOMING}?f=1.0.GroupOwned`);
  await detail().locator('h2').first().waitFor();
  await action('Απάντηση');
  await page.waitForURL(new RegExp(`/documents/new\\?from=${INCOMING}&mode=answer`));
  await page.getByRole('radio', { name: 'Σχέδιο' }).waitFor();
  expect(!(await page.getByRole('radio', { name: 'Εισερχόμενο' }).count()), 'no incoming');
  expect((await page.locator('.kicker').textContent()).includes('Απάντηση'), 'kicker');
  await axe('answer types');
  await page.getByRole('button', { name: 'Επόμενο' }).click();
  await page.getByRole('heading', { name: 'Απάντηση: Σχέδιο' }).waitFor();
  await page.locator('.notice', { hasText: 'Απάντηση στο' }).waitFor();
  await field('Related').getByText(src.Title).waitFor();
  await tab('Διανομή').click();
  expect((await field('OtherRecipients').textContent()).includes(src.Sender), 'recipient is the sender: ' + src.Sender);
  await tab('Βασικά').click();
  await page.locator('#reg-Title').fill('Απάντηση (smoke)');
  await field('FromTemplate').getByRole('checkbox').check();
  await tab('Υπογραφές').click();
  await pickGroup('FinalSigners', 'Προσωπικού', 'Τμήμα Προσωπικού');
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast('Το έγγραφο καταχωρίστηκε.').waitFor();
  await page.waitForURL(/\/documents\/\d+\?f=1\.0\.GroupOwned/);
  answerId = Number(/\/documents\/(\d+)/.exec(page.url())[1]);
  const a = await api(`${answerId}?GroupId=2`);
  expect(a.Related.some((r) => r.Id === INCOMING && r.Relation === 'Απάντηση σε'), 'related as answer');
});

await step('«Κλωνοποίηση» of a draft: one type, no choice; files and signatures not copied', async () => {
  const src = await api(`${DRAFT}?GroupId=2`);
  await page.goto(`${BASE}/documents/${DRAFT}?f=3.0.Global`);
  await detail().locator('h2').first().waitFor();
  await action('Κλωνοποίηση');
  await page.getByRole('heading', { name: 'Κλωνοποίηση: Σχέδιο' }).waitFor();
  expect(/[?&]t=6/.test(page.url()), 'type chosen by itself: ' + page.url());
  expect((await page.locator('#reg-Title').inputValue()) === src.Title, 'title copied');
  expect(!(await field('MainFile').locator('li').count()), 'no files');
  await page.locator('.notice', { hasText: 'Αντίγραφο του' }).waitFor();
  await page.screenshot({ path: `${OUT}/e3-clone.png` });
  await axe('clone');
  // Back goes where it came from, without asking (nothing typed yet).
  await page.getByRole('button', { name: 'Ακύρωση', exact: true }).click();
  await page.waitForURL(new RegExp(`/documents/${DRAFT}\\?f=3\\.0\\.Global`));
});

await step('phone: the edit page fits', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/documents/${INCOMING}/edit`);
  await page.locator('#reg-Title').waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow <= 0, 'overflow ' + overflow);
  await page.screenshot({ path: `${OUT}/e4-phone.png` });
});

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
