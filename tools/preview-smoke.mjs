// Folder preview: «Ειδικά στοιχεία» (summary in Γενικά + own tab) and the expand toggle.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR' })).newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/401/.test(m.text()) && errors.push(m.text()));
let failures = 0;
const step = async (name, fn) => {
  try {
    await fn();
    console.log('ok  ', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, e.message.split('\n')[0]);
    await page.screenshot({ path: `${OUT}/fail-preview-${failures}.png` });
  }
};
const axe = async (label) => {
  await page.addScriptTag({ content: axeSrc });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}) -> ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  console.log(`axe ${label}: ${r.length ? '\n  ' + r.join('\n  ') : 'no violations'}`);
};

await fetch(`${BASE}/__mock/reset/?data=1`);
await page.goto(BASE + '/login?returnUrl=%2Ffolders');
await page.evaluate(() => localStorage.removeItem('fn.expanded'));
await page.fill('input[name=username]', 'admin');
await page.fill('input[name=password]', 'admin');
await page.click('button[type=submit]');
await page.waitForSelector('app-type-nav a');
await page.getByRole('link', { name: 'Ανάθεση Εργασίας', exact: true }).click();
await page.waitForFunction(() => document.querySelector('app-pager')?.textContent?.includes('1240'));

// The mock gives «Ειδικά στοιχεία» to every folder of this type whose id is divisible by 3.
const id = await page.$$eval('a.row-link', (as) => as.map((a) => Number(a.getAttribute('href').match(/\/(\d+)/)[1])).find((n) => n % 3 === 0));

await step('Γενικά: basic facts first, then all «Ειδικά στοιχεία» with labels, dates and tables', async () => {
  await page.locator(`a.row-link[href^="/folders/${id}?"]`).click();
  await page.locator('app-folder-detail .special').waitFor();
  const order = await page.$$eval('app-folder-detail .body > *', (els) => els.map((e) => e.className));
  if (order.findIndex((c) => c.includes('facts')) > order.findIndex((c) => c.includes('special'))) throw new Error('order: ' + order);
  const txt = await page.locator('app-folder-detail .special').innerText();
  if (!/Custom Πεδίο[\s\S]*Δείγμα/.test(txt)) throw new Error('missing text field: ' + txt);
  if (!/τιμή 2/.test(txt) || /va2/.test(txt)) throw new Error('select label: ' + txt);
  const rows = await page.locator('app-particulars-view table tbody tr').count();
  if (rows !== 2) throw new Error('datagrid rows: ' + rows);
  const tabs = await page.$$eval('app-folder-detail [role=tab]', (t) => t.map((x) => x.textContent.trim()).join('|'));
  if (tabs.includes('Ειδικά')) throw new Error('separate tab still there: ' + tabs);
  await page.getByRole('button', { name: /Εμφάνιση κενών/ }).click();
  await page.getByRole('button', { name: /Απόκρυψη κενών/ }).waitFor();
});
await page.screenshot({ path: `${OUT}/pv-01-general.png`, fullPage: true });

await axe('general with particulars');

await step('expand: button widens the preview, list and sidebar hide', async () => {
  await page.getByRole('button', { name: /Μεγέθυνση προβολής/ }).click();
  await page.waitForSelector('.layout.is-expanded');
  const w = await page.locator('section.detail').evaluate((e) => e.getBoundingClientRect().width);
  if (w < 1300) throw new Error('detail width ' + w);
  if (await page.locator('.layout > .content').isVisible()) throw new Error('list still visible');
});
await page.screenshot({ path: `${OUT}/pv-03-expanded.png` });
await axe('expanded');

await step('expanded: j moves to next folder and stays expanded; remembered after reload', async () => {
  const before = page.url();
  await page.locator('app-folder-detail h2').focus();
  await page.keyboard.press('j');
  await page.waitForFunction((b) => location.href !== b, before);
  await page.waitForSelector('.layout.is-expanded');
  await page.reload();
  await page.waitForSelector('.layout.is-expanded');
});

await step('f toggles back; Esc closes and the list returns', async () => {
  await page.locator('app-folder-detail h2').focus();
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.layout.is-expanded'));
  await page.keyboard.press('f');
  await page.waitForSelector('.layout.is-expanded');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('app-folder-detail'));
  await page.locator('.layout > .content').waitFor({ state: 'visible', timeout: 3000 });
});

await step('folder type without Formio: no section, no tab', async () => {
  await page.getByRole('link', { name: 'tstype', exact: true }).click();
  await page.waitForSelector('a.row-link');
  await page.locator('a.row-link').first().click();
  await page.waitForSelector('app-folder-detail .facts');
  await page.waitForTimeout(500);
  if (await page.locator('app-folder-detail .special').count()) throw new Error('section shown');
  const tabs = await page.$$eval('app-folder-detail [role=tab]', (t) => t.map((x) => x.textContent.trim()).join('|'));
  if (tabs.includes('Ειδικά')) throw new Error(tabs);
});

await page.setViewportSize({ width: 390, height: 844 });
await step('phone: no expand button (already full screen)', async () => {
  if (await page.getByRole('button', { name: /Μεγέθυνση|Σμίκρυνση/ }).isVisible()) throw new Error('visible');
});

console.log('console errors:', errors.length ? errors : 'none');
console.log(failures ? `${failures} FAILED` : 'ALL OK');
await browser.close();
