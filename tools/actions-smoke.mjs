// Phase 4 smoke test: write actions against the mock API (stateful).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR', acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
let failures = 0;

const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '_')}.png` });
    // Do not let one failure cascade: close any dialog or menu left open.
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape');
  }
};
const dialog = () => page.locator('dialog[open]');
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
const menuItem = async (name) => {
  await page.locator('app-folder-detail app-action-menu button[popovertarget]').click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
};

await fetch(`${BASE}/__mock/reset/?data=1`);
await page.goto(BASE + '/login');
await page.fill('input[name=username]', 'admin');
await page.fill('input[name=password]', 'admin');
await page.click('button[type=submit]');
await page.waitForSelector('app-type-nav a');
await page.getByRole('link', { name: 'Ανάθεση Εργασίας', exact: true }).click();
await page.waitForFunction(() => document.querySelector('app-pager')?.textContent?.includes('1240'));

await step('open folder shows action buttons', async () => {
  await page.locator('a.row-link').nth(1).click();
  await page.waitForSelector('app-folder-detail app-action-menu button');
});
await page.screenshot({ path: `${OUT}/p4-01-detail-actions.png` });

await step('assign: pick a user by search, submit', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Χρέωση' }).click();
  await dialog().waitFor();
  await dialog().locator('input[type=search]').fill('ελενη');
  await dialog().getByLabel('Ελένη Δημητρίου', { exact: true }).check();
  await page.screenshot({ path: `${OUT}/p4-02-assign.png` });
  await dialog().getByRole('button', { name: 'Χρέωση', exact: true }).click();
  await toast(/Χρέωση: ολοκληρώθηκε/);
  await page.waitForFunction(() => document.querySelector('app-folder-detail .facts')?.textContent?.includes('Ελένη'));
});
await page.waitForFunction(() => !document.querySelector('.is-stale'));
await axe('after assign');

await step('send: disallowed groups are disabled; send to Τμήμα Προσωπικού', async () => {
  await page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Αποστολή' }).click();
  await dialog().waitFor();
  await dialog().locator('input[type=search]').fill('τμημα');
  if (!(await dialog().getByLabel(/Τμήμα Μισθοδοσίας/).isDisabled())) throw new Error('Μισθοδοσία should be disabled');
  await dialog().getByLabel(/Τμήμα Προσωπικού/).check();
  await dialog().locator('textarea').fill('Για ενέργειες');
  await page.screenshot({ path: `${OUT}/p4-03-send.png` });
  await axe('send dialog');
  await dialog().getByRole('button', { name: 'Αποστολή', exact: true }).click();
  await toast(/Αποστολή: ολοκληρώθηκε/);
  await page.waitForFunction(() => document.querySelector('app-folder-detail .facts')?.textContent?.includes('Τμήμα Προσωπικού'));
});

await step('share: tree, expand, pick group', async () => {
  await menuItem(/Κοινή Χρήση/);
  await dialog().waitFor();
  await dialog().getByRole('button', { name: /Ανάπτυξη Διεύθυνση Διοικητικών/ }).click();
  await dialog().getByLabel('Τμήμα Προμηθειών', { exact: true }).check();
  await dialog().getByRole('button', { name: 'Αποθήκευση' }).click();
  await toast(/Κοινή χρήση: ολοκληρώθηκε/);
});

await step('change type: pick the other instance', async () => {
  await menuItem(/Αλλαγή τύπου/);
  await dialog().waitFor();
  await dialog().getByLabel(/Ανάθεση Εργασίας-2/).check();
  await dialog().getByRole('button', { name: 'Αλλαγή', exact: true }).click();
  await toast(/Αλλαγή τύπου: ολοκληρώθηκε/);
});

await step('mass print downloads a PDF', async () => {
  await menuItem(/Μαζική Εκτύπωση/);
  await dialog().waitFor();
  const empty = await dialog().getByText('δεν έχει έγγραφα').count();
  if (empty) {
    await dialog().getByRole('button', { name: 'Ακύρωση' }).click();
    console.log('     (folder has no documents, skipped download)');
    return;
  }
  const dl = page.waitForEvent('download');
  await dialog().getByRole('button', { name: 'Εκτύπωση' }).click();
  const d = await dl;
  console.log('     downloaded', d.suggestedFilename());
});

await step('archive: comment prefilled from last energia', async () => {
  await page.locator('app-folder-detail button[aria-label^="Κλείσιμο"]').first().click();
  await page.locator('a.row-link').nth(2).click();
  await page.waitForSelector('app-folder-detail app-action-menu button');
  const inline = page.locator('app-folder-detail app-action-menu').getByRole('button', { name: 'Αρχειοθέτηση', exact: true });
  if (await inline.count()) await inline.click();
  else await menuItem('Αρχειοθέτηση');
  await dialog().waitFor();
  await page.waitForTimeout(300);
  const v = await dialog().locator('textarea').inputValue();
  console.log('     prefilled comment:', JSON.stringify(v));
  await dialog().getByRole('button', { name: 'Αρχειοθέτηση', exact: true }).click();
  await toast(/Αρχειοθέτηση/);
  await page.waitForFunction(() => document.querySelector('app-folder-detail .head .badge')?.textContent?.includes('Αρχειοθετήθηκε'));
});

await step('Esc closes a dialog without running', async () => {
  await menuItem('Κλωνοποίηση');
  await dialog().waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  if (!(await page.locator('app-folder-detail').count())) throw new Error('Esc closed the folder too');
});

await step('clone opens the copy', async () => {
  const before = page.url();
  await menuItem('Κλωνοποίηση');
  await dialog().getByRole('button', { name: 'Κλωνοποίηση', exact: true }).click();
  await toast(/Κλωνοποίηση: ολοκληρώθηκε/);
  await page.waitForFunction((b) => location.href !== b, before);
  await page.waitForFunction(() => document.querySelector('app-folder-detail h2')?.textContent?.includes('αντίγραφο'));
});

await step('delete closes the panel', async () => {
  await menuItem('Διαγραφή');
  await dialog().getByRole('button', { name: 'Διαγραφή', exact: true }).click();
  await toast(/Διαγραφή: ολοκληρώθηκε/);
  await page.waitForFunction(() => !document.querySelector('app-folder-detail'));
});

await step('mass archive on 6 rows (partial failure reported)', async () => {
  await page.waitForFunction(() => !document.querySelector('.is-stale'));
  await page.waitForTimeout(300);
  // Pick rows that are not archived. The comment "#fail" makes the mock refuse odd folder ids.
  const rows = await page.$$eval('tbody tr', (trs) =>
    trs.map((tr, i) => ({
      i,
      id: Number(tr.querySelector('a.row-link')?.getAttribute('href')?.match(/\/(\d+)/)?.[1]),
      archived: tr.querySelector('.c-status')?.textContent?.includes('Αρχειοθ'),
    })),
  );
  const open = rows.filter((r) => !r.archived);
  const chosen = open.slice(0, 6);
  console.log('     selecting', chosen.map((r) => r.id).join(','), 'expect failures for', chosen.filter((r) => r.id % 2 === 1).map((r) => r.id).join(',') || 'none');
  for (const r of chosen) await page.locator('tbody tr', { has: page.locator(`a.row-link[href^="/${r.id}?"]`) }).locator('.tick').check();
  await page.waitForSelector('.selbar app-action-menu');
  await page.screenshot({ path: `${OUT}/p4-04-selection.png` });
  const bar = page.locator('.selbar');
  const inline = bar.getByRole('button', { name: 'Αρχειοθέτηση', exact: true });
  if (await inline.count()) await inline.click();
  else {
    await bar.locator('button[popovertarget]').click();
    await page.getByRole('menuitem', { name: 'Αρχειοθέτηση', exact: true }).click();
  }
  await dialog().waitFor();
  await dialog().locator('textarea').fill('#fail');
  await dialog().getByRole('button', { name: 'Αρχειοθέτηση', exact: true }).click();
  await Promise.race([dialog().locator('.err').waitFor(), page.waitForFunction(() => !document.querySelector('dialog[open]'))]);
  await page.screenshot({ path: `${OUT}/p4-05-mass-result.png` });
  if (await dialog().count()) {
    console.log('     partial:', (await dialog().locator('.err').textContent()).trim().slice(0, 160));
    const sub = (await dialog().locator('.dlg__sub').textContent()).trim();
    console.log('     retry targets:', sub);
    // Retry without the failing comment: only the failed folders are sent again.
    await page.evaluate(() => fetch('/__mock/reset/'));
    await dialog().locator('textarea').fill('ok');
    await dialog().getByRole('button', { name: 'Επανάληψη' }).click();
    await toast(/Αρχειοθέτηση: ολοκληρώθηκε/);
    const st = await (await fetch(`${BASE}/__mock/stats/`)).json();
    console.log('     retry calls:', st['POST /services/v2/folders/action/']);
  } else console.log('     all archived');
});

await step('select all on page + clear', async () => {
  await page.locator('thead .tick').check();
  await page.waitForSelector('.selbar');
  const n = await page.locator('.selbar strong').textContent();
  await page.getByRole('button', { name: 'Αποεπιλογή' }).click();
  await page.waitForFunction(() => !document.querySelector('.selbar'));
  console.log('     ', n);
});

await page.setViewportSize({ width: 390, height: 844 });
await step('phone: dialog full screen', async () => {
  await page.locator('a.row-link').first().click();
  await page.waitForSelector('app-folder-detail app-action-menu button');
  // The first button may be "Επεξεργασία" (opens the editor page): use the first dialog action.
  await page.locator('app-folder-detail app-action-menu > button').filter({ hasNotText: 'Επεξεργασία' }).first().click();
  await dialog().waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/p4-06-phone-dialog.png` });
  await page.keyboard.press('Escape');
});

const stats = await (await fetch(`${BASE}/__mock/stats/`)).json();
console.log('calls', JSON.stringify(Object.fromEntries(Object.entries(stats).filter(([k]) => /action|assign|share|change|print|tree|users-to|extended|available|Config/.test(k)))));
console.log('console errors:', errors.length ? errors : 'none');
console.log(failures ? `${failures} FAILED` : 'ALL OK');
await browser.close();
