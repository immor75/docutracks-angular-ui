// Smoke test for phase 7 against the mock: mass actions from the list selection (menu from
// `POST actions`, run on the documents that can, the rest listed with the reason, partial
// failure keeps the failed ones selected) and signing (single and mass, remote with OTP,
// without digital signature for drafts, USB token sent to the classic UI), with axe.
// The sign-in values typed here are the mock's test values, never real ones.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const MOCK_OTP = '123456'; // mock/documents-actions.mjs

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
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/fail-mass-${name.replace(/[^a-z0-9]+/gi, '_')}.png` }); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const settled = async () => {
  await page.waitForTimeout(150);
  await page.waitForFunction(() => document.querySelector('app-document-table table')?.getAttribute('aria-busy') === 'false' && !document.querySelector('app-document-table .skeleton'));
};
const rows = () => page.locator('app-document-table tbody tr');
const selbar = () => page.locator('.selbar');
const menu = () => page.locator('#mass-menu');
const dlg = () => page.locator('app-doc-action-dialog dialog');
const sign = () => page.locator('app-sign-dialog dialog');
const toast = (text) => page.locator('app-toasts .toast').filter({ hasText: text });
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
const api = async (path, body) =>
  (await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })).json();
const openMenu = async () => {
  await selbar().getByRole('button', { name: /Ενέργειες/ }).click();
  await menu().waitFor();
  await page.waitForFunction(() => document.querySelector('#mass-menu [role=menuitem], #mass-menu [role=alert]'));
};
const selectedCount = async () => Number((await selbar().locator('strong').textContent().catch(() => '0')) || 0);
const go = async (folder) => {
  await page.goto(`${BASE}/documents?f=${folder}&pr=6`);
  await settled();
};

await fetch(`${BASE}/__mock/reset/?data=1`);

await step('login', async () => {
  await page.goto(BASE + '/login?returnUrl=' + encodeURIComponent('/documents?f=1.11.GroupOwned&pr=6'));
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-document-table a.row-link');
  errors.length = 0;
  await settled();
});

await step('menu of the selection: Mass actions only, counts for partial ones', async () => {
  await page.getByRole('checkbox', { name: 'Επιλογή όλων στη σελίδα' }).check();
  await openMenu();
  const items = await menu().getByRole('menuitem').allTextContents();
  expect(items.some((t) => t.includes('Αρχειοθέτηση')), 'archive ' + items);
  expect(!items.some((t) => t.includes('Επεξεργασία')), 'no single-only actions');
  const unassign = menu().getByRole('menuitem', { name: /Αποχρέωση/ });
  expect(/\d+ από 20/.test(await unassign.textContent()), 'partial count');
  await page.screenshot({ path: `${OUT}/x1-mass-menu.png` });
  await axe('mass menu');
});

await step('mass Αποχρέωση runs on the charged ones, lists the rest', async () => {
  const text = await menu().getByRole('menuitem', { name: /Αποχρέωση/ }).textContent();
  const n = Number(/(\d+) από 20/.exec(text)[1]);
  await menu().getByRole('menuitem', { name: /Αποχρέωση/ }).click();
  await dlg().locator('form[aria-busy=false]').waitFor();
  expect((await dlg().locator('.dlg__sub').textContent()).includes(`${n} επιλεγμένα έγγραφα`), 'subject');
  await dlg().locator('.excluded summary').click();
  expect((await dlg().locator('.excluded li').count()) === 20 - n, 'excluded listed');
  expect((await dlg().locator('.excluded').textContent()).includes('Η Αποχρέωση μπορεί να πραγματοποιηθεί μόνο σε περιπτώσεις Χρεώθηκε.'), 'reason');
  await page.screenshot({ path: `${OUT}/x2-mass-dialog.png` });
  await axe('mass dialog');
  await dlg().getByRole('button', { name: 'Αποχρέωση', exact: true }).click();
  await toast(`Αποχρέωση: ολοκληρώθηκε για ${n} έγγραφα.`).waitFor();
  expect((await selectedCount()) === 20 - n, 'done ones leave the selection');
  await selbar().getByRole('button', { name: 'Καθαρισμός επιλογής' }).click();
});

await step('partial failure: the failed one stays selected and is explained', async () => {
  await settled();
  await rows().nth(0).locator('input[type=checkbox]').check();
  await rows().nth(1).locator('input[type=checkbox]').check();
  const ids = await rows().locator('a.row-link').evaluateAll((a) => a.slice(0, 2).map((x) => Number(/\/(\d+)\?/.exec(x.getAttribute('href'))[1])));
  await openMenu();
  await menu().getByRole('menuitem', { name: /^Γνωστοποίηση/ }).click();
  await dlg().locator('form[aria-busy=false]').waitFor();
  const f = dlg().locator('[data-field="Users"]');
  await f.getByRole('searchbox').fill('Ελένη');
  await f.getByRole('checkbox', { name: 'Ελένη Δημητρίου' }).check();
  await page.route('**/services/v2/documents/action', async (route) => {
    // Simulates the server refusing the second document.
    const res = await route.fetch();
    const body = await res.json();
    body.Payload.Results = body.Payload.Results.map((r) => (r.DocumentId === ids[1] ? { DocumentId: r.DocumentId, Success: false, Message: 'Το έγγραφο κλειδώθηκε από άλλον χρήστη.' } : r));
    await route.fulfill({ response: res, json: body });
  });
  await dlg().getByRole('button', { name: 'Γνωστοποίηση', exact: true }).click();
  await toast('Γνωστοποίηση: 1 από 2 ολοκληρώθηκαν.').waitFor();
  await dlg().getByRole('alert').getByText('Το έγγραφο κλειδώθηκε από άλλον χρήστη.').waitFor();
  expect((await dlg().locator('.dlg__sub').textContent()).includes('«'), 'only the failed one is left');
  await page.unroute('**/services/v2/documents/action');
  await dlg().getByRole('button', { name: 'Άκυρο' }).click();
  expect((await selectedCount()) === 1, 'failed one stays selected');
  await selbar().getByRole('button', { name: 'Καθαρισμός επιλογής' }).click();
});

await step('sign one draft from its view, without digital signature', async () => {
  await go('3.23.Global');
  const list = await api('/services/v2/documents/search', { GroupId: 2, FolderKey: '3.23.Global', Period: { Range: 6 }, Sort: { Column: 'IssueDate', Direction: 'desc' }, PageNumber: 1, PageSize: 50 });
  const mine = list.Payload.Data.find((r) => r.NextToSign === 'Admina Admin');
  await page.goto(`${BASE}/documents/${mine.Id}?f=3.23.Global&pr=6`);
  await page.locator('app-document-detail .facts').waitFor();
  await page.locator('app-document-actions a.btn', { hasText: 'Υπογραφή' }).click();
  await sign().locator('form[aria-busy=false]').waitFor();
  await sign().getByRole('radio', { name: 'Υπογραφή χωρίς ψηφιακή υπογραφή' }).check();
  await page.waitForTimeout(100);
  expect(!(await sign().getByLabel('Κωδικός OTP').count()), 'no OTP without digital signature');
  await sign().getByRole('button', { name: 'Υπογραφή', exact: true }).click();
  await toast('Υπογραφή: ολοκληρώθηκε.').waitFor();
  await page.locator('app-document-detail').getByText('Τελική υπογραφή', { exact: true }).waitFor();
});

await step('mass remote signing: OTP, wrong OTP, then signed; others excluded', async () => {
  await go('3.23.Global');
  await page.getByRole('checkbox', { name: 'Επιλογή όλων στη σελίδα' }).check();
  await openMenu();
  const item = menu().getByRole('menuitem', { name: /^Υπογραφή/ });
  const n = Number(/(\d+) από/.exec(await item.textContent())[1]);
  await item.click();
  await sign().locator('form[aria-busy=false]').waitFor();
  expect((await sign().locator('.excluded summary').textContent()).includes('δεν θα υπογραφούν'), 'excluded');
  await sign().getByRole('button', { name: 'Λήψη OTP' }).click();
  await sign().getByText('Συμπληρώστε όνομα χρήστη και κωδικό για να λάβετε OTP.').waitFor();
  await sign().getByLabel('Όνομα χρήστη υπογραφής').fill('smoke.user');
  await sign().getByLabel('Κωδικός', { exact: true }).fill('mock-pass');
  await sign().getByRole('button', { name: 'Λήψη OTP' }).click();
  await sign().getByText(/Ο κωδικός OTP στάλθηκε/).waitFor();
  await sign().getByRole('button', { name: `Υπογραφή ${n} εγγράφων` }).click();
  await sign().getByText('Συμπληρώστε τον κωδικό OTP.').waitFor();
  await sign().getByLabel('Κωδικός OTP').fill('000000');
  await page.screenshot({ path: `${OUT}/x3-sign.png` });
  await axe('sign dialog');
  await sign().getByRole('button', { name: `Υπογραφή ${n} εγγράφων` }).click();
  await sign().getByRole('alert').getByText(/λανθασμένο ή ληγμένο OTP/).waitFor();
  expect((await sign().getByLabel('Κωδικός OTP').inputValue()) === '', 'OTP cleared after a try');
  await sign().getByLabel('Κωδικός OTP').fill(MOCK_OTP);
  await sign().getByRole('button', { name: `Υπογραφή ${n} εγγράφων` }).click();
  await toast(`Υπογραφή: ολοκληρώθηκε για ${n} έγγραφα.`).waitFor();
  await sign().waitFor({ state: 'hidden' });
});

await step('USB token: sent to the classic UI', async () => {
  await settled();
  const list = await api('/services/v2/documents/search', { GroupId: 2, FolderKey: '3.0.Global', Period: { Range: 6 }, Sort: { Column: 'IssueDate', Direction: 'desc' }, PageNumber: 1, PageSize: 50 });
  const acts = await api('/services/v2/documents/actions', { GroupId: 2, DocumentIds: list.Payload.Data.map((r) => r.Id) });
  const hit = acts.Payload.Documents.find((d) => d.Actions.some((a) => a.Code === 'UiSign' && a.Enabled));
  if (!hit) { console.log('     (no draft left to sign: skipped)'); return; }
  await page.goto(`${BASE}/documents/${hit.DocumentId}?f=3.0.Global&pr=6`);
  await page.locator('app-document-detail .facts').waitFor();
  await page.locator('app-document-actions a.btn', { hasText: 'Υπογραφή' }).click();
  await sign().locator('form[aria-busy=false]').waitFor();
  await sign().getByLabel('Υπογραφή με').selectOption({ label: 'Safenet (USB token)' });
  await sign().getByText(/πρόσθετου του browser/).waitFor();
  expect(/UiSign/.test(await sign().getByRole('link', { name: /κλασικό UI/ }).getAttribute('href')), 'classic link');
  expect(!(await sign().getByLabel('Κωδικός', { exact: true }).count()), 'no password for USB');
  await page.keyboard.press('Escape');
});

await step('phone: the menu of the selection fits', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go('1.11.GroupOwned');
  await rows().nth(0).locator('input[type=checkbox]').check();
  await openMenu();
  const box = await menu().boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390, `menu ${box?.x}+${box?.width}`);
  await page.screenshot({ path: `${OUT}/x4-phone-menu.png` });
  await axe('phone menu');
});

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
