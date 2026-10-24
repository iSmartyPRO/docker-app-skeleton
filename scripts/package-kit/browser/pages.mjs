/*
 * Package kit — browser pass (runs inside mcr.microsoft.com/playwright:v1.48.2-jammy, --network host):
 *
 *   node /work/browser/pages.mjs /job/job.json        → writes /job/result.json
 *
 * job.json: { base, username, password, locale, waitMs, pages: [{ url, expectPrefix, anonymous?, delay?, waitMs?, expectText? }], ignore: [regexp text] }
 * A page with `anonymous` opens in a fresh context without a sign-in (a visitor of a public link); `delay`
 * ([{ match, ms, times? }]) holds back the requests whose URL matches `match` for `ms` (the first `times` of them, or
 * all): a slow first visit, e.g. a package's web entry arriving after the start-up budget. `expectText` must appear.
 * For every page: page errors, console errors (the known logo 404 and `ignore` excepted), the
 * «Extension … failed to render» warning of a crashed contribution, the app error boundary
 * (.app-error, or the root boundary), HTTP 5xx, 4xx of package files (/modules/…), and a redirect away
 * from the page (an unregistered route falls back to /) fail it. 4xx of API calls are listed as notes
 * (the browser's own «Failed to load resource» console line for them is not counted twice).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const jobFile = process.argv[2];
const job = JSON.parse(readFileSync(jobFile, 'utf8'));
const shots = job.shots || '/job/shots';
mkdirSync(shots, { recursive: true });
const ignore = [/\/uploads\/logos?\//, /\/api\/settings\/logo/, /favicon/, ...(job.ignore || []).map((text) => new RegExp(text))];
const ignored = (text) => ignore.some((re) => re.test(text));

const result = { pages: [], login: null };
const browser = await chromium.launch();
try {
  // An automated client, and it says so (like the kit's HTTP client): modules that count people's visits (the File
  // server's link views, QR scans) leave the kit's page loads out, so the data snapshots stay comparable.
  const userAgent = `${(await browser.newContext().then(async (probe) => { const page = await probe.newPage(); const ua = await page.evaluate(() => navigator.userAgent); await probe.close(); return ua; }))} portal-package-kit/1 (bot; automated checks)`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: job.locale || 'ru-RU', userAgent });
  const login = await context.request.post(`${job.base}/api/auth/login`, { data: { username: job.username, password: job.password } });
  result.login = login.status();
  if (!login.ok()) throw new Error(`sign-in ${login.status()}`);
  const page = await context.newPage();
  let current = null;
  const watch = (target) => {
    target.on('pageerror', (err) => current?.errors.push(`pageerror: ${String(err.message).slice(0, 300)}`));
    target.on('console', (msg) => {
      if (!current) return;
      const where = msg.location()?.url || '';
      const text = `${msg.text()}${where ? ` @ ${where}` : ''}`.slice(0, 400);
      if (msg.type() === 'error' && !ignored(text) && !/^Failed to load resource/.test(msg.text())) current.errors.push(`console: ${text}`);
      if (msg.type() === 'warning' && /failed to render/.test(text)) current.errors.push(`contribution crashed: ${text}`);
    });
    target.on('response', (res) => {
      if (!current) return;
      const url = new URL(res.url());
      const line = `${res.status()} ${url.pathname}`;
      if (ignored(line)) return;
      if (res.status() >= 500) current.errors.push(`http ${line}`);
      else if (res.status() >= 400 && url.pathname.startsWith('/modules/')) current.errors.push(`package file ${line}`);
      else if (res.status() >= 400 && url.pathname.startsWith('/api/')) current.notes.push(`api ${line}`);
    });
  };
  watch(page);
  for (const [index, item] of job.pages.entries()) {
    current = { url: item.url, name: item.name || null, anonymous: Boolean(item.anonymous), delay: item.delay || null, expectPrefix: item.expectPrefix || item.url, errors: [], notes: [], held: [], finalPath: null, shot: null };
    const started = Date.now();
    // An anonymous page: its own context, no cookies (closed after the page).
    let ownContext = null;
    let target = page;
    let onNavigated = null;
    try {
      if (item.anonymous) {
        ownContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: job.locale || 'ru-RU', userAgent });
        target = await ownContext.newPage();
        watch(target);
      }
      for (const rule of item.delay || []) {
        const re = new RegExp(rule.match);
        let left = rule.times || Infinity;
        await target.route((url) => re.test(url.href), async (route) => {
          if (left <= 0) return route.continue();
          left -= 1;
          current?.held.push(`${rule.ms} ms ${new URL(route.request().url()).pathname}`);
          await new Promise((done) => setTimeout(done, rule.ms));
          return route.continue().catch(() => {});
        });
      }
      // Every address the page passes through: a redirect that is undone later still fails it (the visitor saw it).
      const visited = [];
      onNavigated = (frame) => {
        if (frame === target.mainFrame()) visited.push(new URL(frame.url()).pathname);
      };
      target.on('framenavigated', onNavigated);
      await target.goto(`${job.base}${item.url}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await target.waitForTimeout(item.waitMs || job.waitMs || 4500);
      current.finalPath = new URL(target.url()).pathname;
      current.visited = [...new Set(visited)];
      const strayed = current.visited.filter((path) => !(path === current.expectPrefix || path.startsWith(current.expectPrefix)));
      if (strayed.length && item.anonymous) current.errors.push(`passed through ${strayed.join(', ')} (redirected while the page loaded)`);
      if (item.expectText && !(await target.locator('body').innerText()).includes(item.expectText)) current.errors.push(`the page does not show «${item.expectText}»`);
      if (!(current.finalPath === current.expectPrefix || current.finalPath.startsWith(`${current.expectPrefix.replace(/\/$/, '')}/`) || current.finalPath.startsWith(current.expectPrefix))) {
        current.errors.push(`redirected to ${current.finalPath} (route not registered?)`);
      }
      // The page boundary (AppErrorBoundary .app-error) and the root one (RootErrorBoundary: role=alert with a heading).
      const boundary = target.locator('.app-error, [role="alert"]:has(h1)');
      if (await boundary.count()) current.errors.push(`error boundary: ${(await boundary.first().innerText()).replace(/\s+/g, ' ').slice(0, 200)}`);
      const text = (await target.locator('body').innerText()).replace(/\s+/g, ' ').trim();
      current.textSample = text.slice(0, 160);
      if (!text) current.errors.push('empty page');
      current.shot = `${shots}/${String(index + 1).padStart(2, '0')}${item.anonymous ? '_anon' : ''}${item.delay ? '_slow' : ''}${item.url.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`;
      await target.screenshot({ path: current.shot });
    } catch (err) {
      current.errors.push(`navigation: ${String(err.message).split('\n')[0].slice(0, 200)}`);
    } finally {
      if (onNavigated) target.off('framenavigated', onNavigated);
      if (ownContext) await ownContext.close().catch(() => {});
      else await target.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
    }
    current.ms = Date.now() - started;
    current.errors = [...new Set(current.errors)];
    current.notes = [...new Set(current.notes)].slice(0, 20);
    result.pages.push(current);
    current = null;
  }
} catch (err) {
  result.error = String(err.message || err);
} finally {
  await browser.close();
  writeFileSync(job.result || '/job/result.json', JSON.stringify(result, null, 2));
}
