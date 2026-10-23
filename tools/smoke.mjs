// Smoke test + screenshots for FolderUI Next against the mock API.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4300';
const OUT = process.env.OUT ?? '.';
import { createRequire } from 'node:module';
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'el-GR' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const step = async (name, fn) => {
  const t = Date.now();
  try { await fn(); console.log(`ok   ${name} (${Date.now() - t} ms)`); }
  catch (e) { console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); await page.screenshot({ path: `${OUT}/fail-${name.replace(/\W+/g, '_')}.png` }); }
};

await fetch(`${BASE}/__mock/reset/`);

await step('redirects to login', async () => {
  await page.goto(BASE + '/folders');
  await page.waitForURL(/\/login/);
});
await step('login', async () => {
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('app-type-nav a');
});
await step('first type selected in URL', async () => {
  if (!/[?&]t=\d+/.test(page.url())) throw new Error('no t= in ' + page.url());
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-list-desktop.png` });
const stats1 = await (await fetch(`${BASE}/__mock/stats/`)).json();
console.log('calls after first load', JSON.stringify(stats1));

await step('pick "Ανάθεση Εργασίας" (1240 folders)', async () => {
  await page.getByRole('link', { name: 'Ανάθεση Εργασίας', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('app-pager')?.textContent?.includes('1240'));
});
await step('sort by Υπόθεση', async () => {
  await page.getByRole('button', { name: /^Υπόθεση/ }).click();
  await page.waitForURL(/o=FolderName/);
  await page.waitForFunction(() => document.querySelector('th[aria-sort=ascending]'));
});
await page.waitForTimeout(800);
await fetch(`${BASE}/__mock/reset/`);
await step('search debounced to one call', async () => {
  await page.click('#search');
  await page.keyboard.type('Λάρισα', { delay: 40 });
  await page.waitForURL(/q=/);
  await page.waitForTimeout(700);
  const s = await (await fetch(`${BASE}/__mock/stats/`)).json();
  const n = s['POST /services/v2/folders/simple-search/'] ?? 0;
  console.log('     simple-search calls while typing 6 chars:', n);
  if (n > 2) throw new Error('too many calls: ' + n);
});
await step('filters: status + shared, one apply', async () => {
  await page.getByRole('button', { name: /Φίλτρα/ }).click();
  await page.getByLabel('Σε εξέλιξη').check();
  await page.screenshot({ path: `${OUT}/02-filters.png` });
  await page.getByRole('button', { name: 'Εφαρμογή' }).click();
  await page.waitForURL(/s=2/);
  await page.waitForSelector('.chip');
  await page.waitForFunction(() => !document.querySelector('.is-stale'));
});
await step('open folder with Enter', async () => {
  await page.locator('a.row-link').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('app-folder-detail .facts');
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-detail-desktop.png` });
await step('history tab via keyboard', async () => {
  await page.getByRole('tab', { name: /Γενικά/ }).focus();
  // Arrow keys until «Ιστορικό» (folders with «Ειδικά στοιχεία» have one tab more).
  for (let i = 0; i < 7; i++) {
    const sel = await page.locator('[role=tab][aria-selected=true]').textContent();
    if (sel.includes('Ιστορικό')) break;
    await page.keyboard.press('ArrowRight');
    // Selection follows focus a frame later: read it only after it has settled.
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('.timeline li');
});
await page.screenshot({ path: `${OUT}/04-detail-history.png` });
await step('j moves to next folder', async () => {
  const before = page.url();
  await page.locator('app-folder-detail h2').focus();
  const nextOff = await page.locator('button[aria-label^="Επόμενη υπόθεση"]').isDisabled();
  await page.keyboard.press(nextOff ? 'k' : 'j');
  await page.waitForFunction((b) => location.href !== b, before);
});
await step('Esc closes detail', async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('app-folder-detail'));
});
await step('back button restores previous state', async () => {
  await page.goBack();
  await page.waitForSelector('app-folder-detail');
});

const axe = async (label) => {
  await page.addScriptTag({ content: axeSrc });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return res.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} -> ${v.nodes.slice(0,3).map(n=>n.target.join(' ')+' '+(n.any[0]?.message||'')).join(' | ')}`);
  });
  console.log(`axe ${label}: ${r.length ? '\n  ' + r.join('\n  ') : 'no violations'}`);
};
await axe('list+detail');

// Tablet and phone
await page.setViewportSize({ width: 820, height: 1100 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/05-tablet-detail.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-phone-list.png` });
await step('phone: open folder full screen', async () => {
  await page.locator('a.row-link').nth(1).click();
  await page.waitForSelector('app-folder-detail .facts');
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/07-phone-detail.png` });
await axe('phone detail');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
