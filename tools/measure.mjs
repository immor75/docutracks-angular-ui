// Measures the production build: bytes on the wire, API calls and time to first rows.
import { chromium } from 'playwright';

const BASE = 'http://localhost:4400/apps-next/';
const runs = Number(process.env.RUNS ?? 5);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function measure(label, { warmSession, cache, throttle }) {
  const results = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Sign in once so later loads behave like a returning user.
  await page.goto(BASE + 'login');
  await page.fill('input[name=username]', 'admin');
  await page.fill('input[name=password]', 'admin');
  await page.click('button[type=submit]');
  await page.waitForSelector('a.row-link');
  const cdp = await ctx.newCDPSession(page);
  if (throttle) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  for (let i = 0; i < runs; i++) {
    if (!cache) await cdp.send('Network.clearBrowserCache');
    if (!warmSession) await page.evaluate(() => sessionStorage.clear());
    await fetch('http://localhost:4400/__mock/reset/');
    let bytes = 0, jsBytes = 0;
    const onResp = async (req) => {
      const sz = await req.sizes().catch(() => null);
      const fromCache = (await req.response())?.fromServiceWorker?.() ? true : false;
      const len = sz ? sz.responseBodySize + sz.responseHeadersSize : 0;
      if (fromCache) return;
      bytes += len;
      if (req.url().endsWith('.js')) jsBytes += len;
    };
    page.on('requestfinished', onResp);
    const t0 = Date.now();
    await page.goto(BASE + '?t=15', { waitUntil: 'commit' });
    await page.waitForSelector('a.row-link');
    const firstRows = Date.now() - t0;
    await page.waitForLoadState('networkidle');
    page.off('requestfinished', onResp);
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
      return { dcl: Math.round(n.domContentLoadedEventEnd), lcp: lcp ? Math.round(lcp.startTime) : null };
    });
    const calls = await (await fetch('http://localhost:4400/__mock/stats/')).json();
    results.push({ firstRows, ...nav, kb: Math.round(bytes / 1024), jsKb: Math.round(jsBytes / 1024), calls });
  }
  await ctx.close();
  const med = (k) => results.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
  console.log(`\n${label}: median of ${runs}`);
  console.log(`  first rows visible: ${med('firstRows')} ms  | DCL ${med('dcl')} ms | transferred ${med('kb')} KB (JS ${med('jsKb')} KB)`);
  console.log('  API calls:', JSON.stringify(results.at(-1).calls));
}

await measure('Cold start (empty cache, signed in via cookie)', { warmSession: false, cache: false });
await measure('Returning user (cache, token in session)', { warmSession: true, cache: true });
await measure('Slow laptop (4x CPU, 10 Mbit, cold cache)', { warmSession: false, cache: false, throttle: true });
await browser.close();
