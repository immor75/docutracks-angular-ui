// Smoke test for the workflow actions of a document (phase 6) against the mock: the form comes
// from `GET action-data/{code}`, the run goes to `POST action`, and the view and the list show the
// new state. Wave α (comment), β (people), γ (groups), errors from the server, phone, with axe.
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
const detail = () => page.locator('app-document-detail');
const dlg = () => page.locator('app-doc-action-dialog dialog');
const toast = (text) => page.locator('app-toasts .toast').filter({ hasText: text });
const status = () => detail().locator('.badges .badge').first();
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
/** The mock accepts any bearer; used to find documents in a given state and to act behind the UI's back. */
const api = async (path, body) =>
  (await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })).json();
const firstWith = async (folder, code) => {
  const list = await api('/services/v2/documents/search', { GroupId: 2, FolderKey: folder, Period: { Range: 6 }, Sort: { Column: 'IssueDate', Direction: 'desc' }, PageNumber: 1, PageSize: 50 });
  const ids = list.Payload.Data.map((r) => r.Id);
  const acts = await api('/services/v2/documents/actions', { GroupId: 2, DocumentIds: ids });
  const hit = acts.Payload.Documents.find((d) => d.Actions.some((a) => a.Code === code && a.Enabled));
  if (!hit) throw new Error(`no document with ${code} in ${folder}`);
  return list.Payload.Data.find((r) => r.Id === hit.DocumentId);
};
/** Opens an action from the bar or from «Περισσότερα». */
const action = async (name) => {
  const bar = detail().locator('app-document-actions');
  await bar.locator('a, button').first().waitFor();
  const inline = bar.locator('a.btn', { hasText: name });
  if (await inline.count()) await inline.first().click();
  else {
    await bar.getByRole('button', { name: 'Περισσότερα' }).click();
    await bar.getByRole('menuitem', { name: new RegExp('^' + name) }).click();
  }
  await dlg().waitFor();
  await dlg().locator('form[aria-busy=false]').waitFor(); // the form of the action has loaded
  await page.waitForTimeout(200); // the opening animation
};
const openDoc = async (id, folder) => {
  await page.goto(`${BASE}/documents/${id}?f=${folder}&pr=6`);
  await detail().locator('.facts').waitFor();
};
const pick = async (field, query, name) => {
  const f = dlg().locator(`[data-field="${field}"]`);
  await f.getByRole('searchbox').fill(query);
  await f.getByRole('checkbox', { name }).or(f.getByRole('radio', { name })).first().check();
  await f.getByRole('searchbox').fill('');
};

await fetch(`${BASE}/__mock/reset/?data=1`);

await step('login', async () => {
  await page.goto(BASE + '/login?returnUrl=' + encodeURIComponent('/documents?f=1.11.GroupOwned'));
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-document-table a.row-link');
  errors.length = 0;
});

let doc;
await step('Χρέωση: required user, then assigned with priority and comment', async () => {
  doc = await firstWith('1.11.GroupOwned', 'UiAssign');
  await openDoc(doc.Id, '1.11.GroupOwned');
  await action('Χρέωση');
  expect((await dlg().locator('h2').textContent()).trim() === 'Χρέωση', 'title');
  await dlg().getByRole('button', { name: 'Χρέωση', exact: true }).click();
  await dlg().getByText('Επιλέξτε χρήστη.').waitFor();
  await page.screenshot({ path: `${OUT}/w1-assign-error.png` });
  await axe('assign dialog');
  await pick('Assignee', 'Μαρία', 'Μαρία Παπαδοπούλου');
  await dlg().getByRole('checkbox', { name: 'Χειρισμός κατά προτεραιότητα' }).check();
  await dlg().getByLabel('Σχόλιο').fill('Για τις ενέργειές σας (smoke).');
  await dlg().getByRole('button', { name: 'Χρέωση', exact: true }).click();
  await toast('Χρέωση: ολοκληρώθηκε.').waitFor();
  await dlg().waitFor({ state: 'hidden' });
  await detail().getByText('Χρεώθηκε', { exact: true }).waitFor();
  await detail().getByRole('tab', { name: /Ιστορικό/ }).click();
  await detail().locator('.timeline li').filter({ hasText: 'Για τις ενέργειές σας (smoke).' }).waitFor();
});

await step('Αποχρέωση from «Περισσότερα»', async () => {
  await action('Αποχρέωση');
  expect((await dlg().textContent()).includes('Είστε σίγουρος ότι θέλετε να αποχρεωθείτε το έγγραφο;'), 'message');
  await dlg().getByRole('button', { name: 'Αποχρέωση', exact: true }).click();
  await toast('Αποχρέωση: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Δημιουργήθηκε', { exact: true }).waitFor();
});

await step('server refusal is shown in the dialog, retry after fixing', async () => {
  await action('Αρχειοθέτηση');
  // Someone else archives it meanwhile.
  await api('/services/v2/documents/action', { GroupId: 2, Code: 'UiArchive', DocumentIds: [doc.Id], Values: {} });
  await dlg().getByRole('button', { name: 'Αρχειοθέτηση', exact: true }).click();
  await dlg().getByRole('alert').getByText('Το έγγραφο είναι ήδη αρχειοθετημένο.').waitFor();
  expect(await dlg().getByRole('button', { name: 'Δοκιμάστε ξανά' }).count(), 'retry button');
  await page.keyboard.press('Escape');
  await dlg().waitFor({ state: 'hidden' });
});

await step('Επαναφορά από Αρχειοθέτηση', async () => {
  await page.reload();
  await detail().locator('.facts').waitFor();
  await action('Επαναφορά από Αρχειοθέτηση');
  await dlg().getByRole('button', { name: 'Επαναφορά από Αρχειοθέτηση' }).click();
  await toast('Επαναφορά από Αρχειοθέτηση: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Δημιουργήθηκε', { exact: true }).waitFor();
});

await step('Αρχειοθέτηση with θεματικοί φάκελοι (existing and new); the list drops the row', async () => {
  await action('Αρχειοθέτηση');
  const tf = dlg().locator('[data-field="ThematicFolders"]');
  await tf.getByRole('searchbox').fill('προμ');
  await tf.getByRole('button', { name: 'Προμήθειες' }).click();
  await tf.getByRole('searchbox').fill('Smoke φάκελος');
  await tf.getByRole('button', { name: 'Νέος φάκελος «Smoke φάκελος»' }).click();
  await page.waitForTimeout(100);
  expect((await tf.locator('.chip').count()) === 2, 'two chips');
  await page.screenshot({ path: `${OUT}/w2-archive.png` });
  await axe('archive dialog');
  await dlg().getByRole('button', { name: 'Αρχειοθέτηση', exact: true }).click();
  await toast('Αρχειοθέτηση: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Αρχειοθετήθηκε', { exact: true }).waitFor();
  await page.waitForFunction((id) => ![...document.querySelectorAll('app-document-table a.row-link')].some((a) => a.getAttribute('href')?.includes('/' + id + '?')), doc.Id);
  const found = await api('/services/v2/documents/thematic-folders?GroupId=2&Search=Smoke');
  expect(found.Payload.length === 1 && found.Payload[0].Id >= 100, 'new folder created');
});

await step('Επιστροφή: the Ενέργεια is required', async () => {
  const d = await firstWith('1.11.GroupOwned', 'UiReturn');
  await openDoc(d.Id, '1.11.GroupOwned');
  await action('Επιστροφή');
  expect((await dlg().locator('h2').textContent()).trim() === 'Επιστροφή στον αποστολέα', 'variant');
  await dlg().getByRole('button', { name: 'Επιστροφή', exact: true }).click();
  await dlg().getByText('Επιλέξτε ενέργεια.').waitFor();
  expect(await dlg().getByLabel('Ενέργεια').evaluate((e) => e === document.activeElement), 'focus on the field');
  await dlg().getByLabel('Ενέργεια').selectOption({ label: 'Λανθασμένη χρέωση' });
  await dlg().getByRole('button', { name: 'Επιστροφή', exact: true }).click();
  await toast('Επιστροφή στον αποστολέα: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Επιστράφηκε', { exact: true }).waitFor();
});

await step('Γνωστοποίηση to two users', async () => {
  const d = await firstWith('1.11.GroupOwned', 'UiNotify');
  await openDoc(d.Id, '1.11.GroupOwned');
  await action('Γνωστοποίηση');
  await pick('Users', 'Ελένη', 'Ελένη Δημητρίου');
  await pick('Users', 'Νίκος', 'Νίκος Καραγιάννης');
  await dlg().getByRole('button', { name: 'Γνωστοποίηση', exact: true }).click();
  await toast('Γνωστοποίηση: ολοκληρώθηκε.').waitFor();
  await detail().getByRole('tab', { name: /Ιστορικό/ }).click();
  await detail().locator('.timeline li').filter({ hasText: 'Ελένη Δημητρίου, Νίκος Καραγιάννης' }).waitFor();
});

await step('Αποστολή to two groups, type for all, one urgent', async () => {
  const d = await firstWith('2.16.GroupOwned', 'UiSend');
  await openDoc(d.Id, '2.16.GroupOwned');
  await action('Αποστολή');
  const f = dlg().locator('[data-field="Groups"]');
  await pick('Groups', 'Προσωπ', 'Τμήμα Προσωπικού');
  await pick('Groups', 'Μισθοδ', 'Τμήμα Μισθοδοσίας');
  await f.getByLabel('Επιλογή χαρακτηρισμού (μαζικά)').selectOption({ label: 'Για κοινοποίηση' });
  expect((await f.getByLabel('Χαρακτηρισμός για Τμήμα Προσωπικού').inputValue()) === '2', 'type set for all');
  await f.getByRole('checkbox', { name: 'Επείγον για Τμήμα Μισθοδοσίας' }).check();
  await page.screenshot({ path: `${OUT}/w3-send.png` });
  await axe('send dialog');
  await dlg().getByRole('button', { name: 'Αποστολή', exact: true }).click();
  await toast('Αποστολή: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Απεστάλη', { exact: true }).waitFor();
  await detail().getByRole('tab', { name: /Ιστορικό/ }).click();
  await detail().locator('.timeline li').filter({ hasText: 'Τμήμα Μισθοδοσίας (Για κοινοποίηση, επείγον)' }).waitFor();
});

await step('Ακύρωση needs a reason', async () => {
  const d = await firstWith('2.17.GroupOwned', 'UiCancel');
  await openDoc(d.Id, '2.17.GroupOwned');
  await action('Ακύρωση');
  await dlg().getByRole('button', { name: 'Συνέχεια' }).click();
  await dlg().getByText('Η ενέργεια της ακύρωσης απαιτεί αιτιολόγηση.').waitFor();
  expect((await dlg().getByLabel(/Σχόλιο/).getAttribute('aria-invalid')) === 'true', 'aria-invalid');
  await dlg().getByLabel(/Σχόλιο/).fill('Εκ παραδρομής (smoke).');
  await dlg().getByRole('button', { name: 'Συνέχεια' }).click();
  await toast('Ακύρωση: ολοκληρώθηκε.').waitFor();
  await detail().getByText('Ακυρώθηκε', { exact: true }).waitFor();
});

await step('Διαγραφή of a draft closes the view', async () => {
  const d = await firstWith('3.0.Global', 'UiDelete');
  await openDoc(d.Id, '3.0.Global');
  await action('Διαγραφή');
  const btn = dlg().getByRole('button', { name: 'Διαγραφή', exact: true });
  expect(await btn.evaluate((b) => b.classList.contains('btn--danger')), 'danger');
  await btn.click();
  await toast('Διαγραφή: ολοκληρώθηκε.').waitFor();
  await page.waitForURL((u) => u.pathname === '/documents');
  const one = await api(`/services/v2/documents/${d.Id}?GroupId=2`);
  expect(one.Success === false, 'gone');
});

await step('classic actions keep their link and say so', async () => {
  const d = await firstWith('1.11.GroupOwned', 'UiAssign');
  await openDoc(d.Id, '1.11.GroupOwned');
  const bar = detail().locator('app-document-actions');
  await bar.getByRole('button', { name: 'Περισσότερα' }).click();
  const copy = bar.getByRole('menuitem', { name: /Ακριβούς Αντιγράφου/ });
  expect(/\/el\/Document\/2\/UiCreateExactCopy\//.test(await copy.getAttribute('href')), 'classic href');
  expect((await copy.textContent()).includes('(κλασικό UI)'), 'marked');
  // In-app pages (8γ) keep the classic href for a middle click, unmarked.
  const clone = bar.getByRole('menuitem', { name: /Κλωνοποίηση/ });
  expect(/\/el\/Document\/2\/UiClone\//.test(await clone.getAttribute('href')), 'clone keeps the classic href');
  expect(!(await clone.textContent()).includes('κλασικό'), 'clone not marked');
  const inform = bar.getByRole('menuitem', { name: /^Ενημέρωση/ });
  expect(!(await inform.textContent()).includes('κλασικό'), 'in-app not marked');
  await page.keyboard.press('Escape');
});

await step('phone: the dialog is full screen', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await action('Χρέωση');
  const box = await dlg().boundingBox();
  expect(box && box.width >= 389 && box.height >= 840, `box ${box?.width}x${box?.height}`);
  await page.screenshot({ path: `${OUT}/w4-phone.png` });
  await axe('phone dialog');
  await dlg().getByRole('button', { name: 'Άκυρο' }).click();
  await dlg().waitFor({ state: 'hidden' });
});

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
