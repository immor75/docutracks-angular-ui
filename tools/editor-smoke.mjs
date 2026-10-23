// Καταχώριση / Επεξεργασία smoke test against the mock API.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR' });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => r.failure()?.errorText !== 'net::ERR_ABORTED' && errors.push('request failed ' + r.url()));
let failures = 0;

const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${OUT}/fail-editor-${failures}.png` });
  }
};
const toast = (re) => page.locator('app-toasts .toast', { hasText: re }).first().waitFor();
const axe = async (label) => {
  await page.addScriptTag({ content: axeSrc });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  console.log(`axe ${label}: ${r.length ? '\n  ' + r.join('\n  ') : 'no violations'}`);
};
const tab = (name) => page.locator('app-editor-page [role=tab]', { hasText: name }).click();

await fetch(`${BASE}/__mock/reset/?data=1`);
await page.goto(BASE + '/login?returnUrl=%2Ffolders');
await page.fill('input[name=username]', 'admin');
await page.fill('input[name=password]', 'admin');
await page.click('button[type=submit]');
await page.waitForSelector('app-type-nav a');
await page.getByRole('link', { name: 'Ανάθεση Εργασίας', exact: true }).click();
await page.waitForFunction(() => document.querySelector('app-pager')?.textContent?.includes('1240'));
const listUrl = page.url();

await step('"Νέα υπόθεση" opens the editor on the current type', async () => {
  await page.getByRole('button', { name: /Νέα υπόθεση/ }).click();
  await page.waitForSelector('app-editor-page [role=tablist]');
  const sel = await page.locator('app-editor-page .type-bar select').evaluate((s) => s.selectedOptions[0].textContent.trim());
  if (sel !== 'Ανάθεση Εργασίας') throw new Error('type is ' + sel);
});

await step('validation: empty title blocks save and points to the field', async () => {
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await page.locator('app-editor-page .summary').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'f-FolderName');
});
await page.screenshot({ path: `${OUT}/ed-01-validation.png` });

await step('general: title, info and location cascade', async () => {
  await page.fill('#f-FolderName', 'Αίτηση αυτοψίας Καλαμαριά');
  await page.fill('#f-Comments', 'Καταχώριση από το FolderUI Next');
  const sel = (label) => page.locator('app-general-tab label.field', { hasText: label }).locator('select');
  await sel('Περιφέρεια').selectOption({ label: 'ΚΕΝΤΡΙΚΗΣ ΜΑΚΕΔΟΝΙΑΣ' });
  await page.waitForFunction(() => [...document.querySelectorAll('app-general-tab option')].some((o) => o.textContent.includes('Θεσσαλονίκης')));
  await sel('Νομός').selectOption({ label: 'Θεσσαλονίκης' });
  await page.waitForFunction(() => [...document.querySelectorAll('app-general-tab option')].some((o) => o.textContent.includes('Καλαμαριάς')));
  await sel('Δήμος').selectOption({ label: 'Καλαμαριάς' });
});
await page.screenshot({ path: `${OUT}/ed-02-general.png`, fullPage: true });

await step('contacts: add an external contact as «Αιτών»', async () => {
  await tab('Εμπλεκόμενοι');
  await page.locator('app-contacts-tab').getByRole('button', { name: /Προσθήκη/ }).first().click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('input[type=search]').fill('γεωργ');
  await dlg.getByLabel(/Γεωργίου/).check();
  await dlg.getByRole('button', { name: /^Προσθήκη/ }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.locator('app-contacts-tab', { hasText: 'Γεωργίου' }).waitFor();
});

await step('documents: relate a document', async () => {
  await tab('Έγγραφα');
  await page.locator('app-documents-tab').getByRole('button', { name: /Έγγραφο ΣΗΔΕ/ }).first().click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('input[type=search]').fill('Έγγραφο 3');
  await dlg.locator('.rows input').first().check();
  await dlg.locator('footer .btn--primary, .btn--primary').last().click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
});
await page.screenshot({ path: `${OUT}/ed-03-documents.png`, fullPage: true });

await step('particulars: Formio loads lazily and edits Metadata', async () => {
  await tab('Ειδικά');
  await page.locator('app-formio-form .fx[data-ready] .formio-component-metadataTitle input').waitFor({ timeout: 15000 });
  await page.locator('.formio-component-metadataTitle input').fill('Τιμή από τη δοκιμή');
  await page.locator('.formio-component-select select').first().selectOption({ label: 'τιμή 2' });
});
await page.screenshot({ path: `${OUT}/ed-04-formio.png`, fullPage: true });
await axe('editor (formio)');

let newId = 0;
await step('save registers and opens the new folder', async () => {
  await page.getByRole('button', { name: 'Καταχώριση', exact: true }).click();
  await toast(/καταχωρίστηκε/);
  await page.waitForFunction(() => document.querySelector('app-folder-detail h2')?.textContent?.trim());
  newId = Number(/\/(\d+)\?/.exec(page.url())?.[1]);
  const h = await page.locator('app-folder-detail h2').textContent();
  if (!h.includes('Αίτηση αυτοψίας')) throw new Error('detail shows ' + h);
  const back = new URL(page.url()).search;
  if (!listUrl.includes(back.split('&')[0].slice(1))) console.log('     list query kept:', back);
});

await step('saved data round-trips (title, contact, metadata, location)', async () => {
  const f = await page.evaluate(async (id) => (await (await fetch(`/services/folder/?FolderId=${id}`, { headers: { Authorization: 'Bearer x' } })).json()).Folder, newId);
  const ok =
    f.FolderName === 'Αίτηση αυτοψίας Καλαμαριά' &&
    f.FolderContacts?.some((c) => c.Contact?.LastName === 'Γεωργίου') &&
    /<metadataTitle[^>]*>Τιμή από τη δοκιμή</.test(f.Metadata) &&
    /<select[^>]*>va2</.test(f.Metadata) &&
    f.FolderLocations?.[0]?.PlaceDimos?.Onomasia === 'Καλαμαριάς' &&
    f.FolderDocuments?.length === 1;
  if (!ok) throw new Error(JSON.stringify({ n: f.FolderName, c: f.FolderContacts?.length, m: f.Metadata?.slice(0, 160), l: f.FolderLocations, d: f.FolderDocuments?.length }));
});

await step('edit from the folder: change title, guard on leave, save', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Επεξεργασία' }).click();
  await page.waitForSelector('app-editor-page #f-FolderName');
  await page.fill('#f-FolderName', 'Αίτηση αυτοψίας Καλαμαριά (διορθ.)');
  await page.getByRole('button', { name: 'Ακύρωση' }).first().click();
  const sheet = page.locator('dialog[open]', { hasText: 'Απόρριψη αλλαγών' });
  await sheet.waitFor();
  await sheet.getByRole('button', { name: 'Συνέχεια επεξεργασίας' }).click();
  await page.keyboard.press('Control+s');
  await toast(/αποθηκεύτηκαν/);
  await page.waitForFunction(() => document.querySelector('app-folder-detail h2')?.textContent?.includes('διορθ.'));
});

await step('edit: Formio shows the saved values', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Επεξεργασία' }).click();
  await page.waitForSelector('app-editor-page [role=tablist]');
  await tab('Ειδικά');
  await page.locator('app-formio-form .fx[data-ready] .formio-component-metadataTitle input').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.formio-component-metadataTitle input')?.value === 'Τιμή από τη δοκιμή');
  // Nothing changed: leaving does not ask.
  await page.getByRole('button', { name: 'Ακύρωση' }).first().click();
  await page.waitForSelector('app-folder-detail h2');
});

await step('server error is shown and the draft is kept', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Επεξεργασία' }).click();
  await page.waitForSelector('app-editor-page #f-FolderName');
  await page.fill('#f-FolderName', 'Θα αποτύχει #fail');
  await page.getByRole('button', { name: 'Αποθήκευση' }).click();
  await page.locator('app-editor-page .summary', { hasText: 'απορρίφθηκε' }).waitFor();
  if ((await page.inputValue('#f-FolderName')) !== 'Θα αποτύχει #fail') throw new Error('draft lost');
  await page.getByRole('button', { name: 'Ακύρωση' }).first().click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Απόρριψη' }).click();
  await page.waitForSelector('app-folder-detail h2');
});

await page.setViewportSize({ width: 390, height: 844 });
await step('phone: editor usable', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Επεξεργασία' }).click();
  await page.waitForSelector('app-editor-page #f-FolderName');
  await page.screenshot({ path: `${OUT}/ed-05-phone.png`, fullPage: true });
  await axe('editor phone');
  await page.getByRole('button', { name: 'Ακύρωση' }).first().click();
});

const st = await (await fetch(`${BASE}/__mock/stats/`)).json();
console.log('calls', JSON.stringify(Object.fromEntries(Object.entries(st).filter(([k]) => /register|edit|extended|location|contact|documents-for|related/.test(k)))));
console.log('console errors:', errors.length ? errors : 'none');
console.log(failures ? `${failures} FAILED` : 'ALL OK');
await browser.close();
