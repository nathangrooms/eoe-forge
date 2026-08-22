/**
 * Enumerate every interactive control the deck surfaces draw, tab by tab.
 *
 *   npm run build
 *   node scripts/deck-control-census.mjs dist after "/deck/DECK"
 *   DIST=... node scripts/deck-control-census.mjs <dist> <label> <route>
 *
 * ## Why this exists
 *
 * The deck builder and the deck detail page were merged into one page. "Nothing
 * was lost" is a claim about controls a player can reach, and neither a
 * typecheck nor a diff can settle it: a control can survive as a component and
 * be mounted behind a condition that is never true, and a control can be
 * deleted without any file being deleted. So this opens each surface in a real
 * browser, walks every tab strip it finds, and writes down every button, link,
 * field, switch and slider inside `#main-content`.
 *
 * It reports what a person can press. It is NOT a request measurement — that is
 * `scripts/deck-save-measure.mjs`, left alone so its published numbers stay
 * reproducible.
 *
 * ## The stand-in
 *
 * `scripts/deck-save-shim.js` unchanged, plus the `check_feature_access`
 * wrapper `deck-surfaces-walk.mjs` uses, because the Optimiser tab exists only
 * when that RPC says yes and the base shim answers every RPC with null.
 *
 * The nav rail and top nav are outside `#main-content` and are excluded: they
 * are the same on both sides of the merge and would drown the diff.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || process.env.DIST || 'dist';
const LABEL = process.argv[3] || 'run';
const ROUTE = process.argv[4] || '/deck/DECK';
const PORT = Number(process.env.PORT || 4415);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 2200);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

const FEATURE_PATCH = `
(() => {
  const inner = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/rest/v1/rpc/check_feature_access')) {
      return new Response(
        JSON.stringify({ allowed: true, tier: 'unlimited', limit: -1, used: 0, remaining: -1 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return inner.call(this, input, init);
  };
})();
`;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) {
    file = path.join(DIST, 'index.html');
    ext = '.html';
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const body = fs.readFileSync(file);
  const accepts = String(req.headers['accept-encoding'] || '');
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESSIBLE.has(ext) && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = gz.length;
    res.writeHead(200, headers);
    return res.end(gz);
  }
  res.writeHead(200, headers);
  res.end(body);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Everything a person can press, type in or drag, inside the page body. */
const CENSUS = () => {
  const root = document.querySelector('#main-content') || document.body;
  const SEL = [
    'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
    '[role="button"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]',
    '[role="combobox"]', '[role="slider"]', '[role="menuitem"]', '[contenteditable="true"]',
  ].join(',');

  const label = el => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const title = el.getAttribute('title');
    if (title) return title.trim();
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const target = document.getElementById(labelled);
      if (target?.textContent?.trim()) return target.textContent.trim();
    }
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text.slice(0, 70);
    const ph = el.getAttribute('placeholder');
    if (ph) return `[placeholder] ${ph}`;
    const name = el.getAttribute('name') || el.id;
    if (name) return `[${name}]`;
    return '(unlabelled)';
  };

  const seen = new Map();
  for (const el of root.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // A control inside a hover overlay has zero opacity until hover; it is
    // still reachable (focus reveals it) so it counts, but a zero-size element
    // is not drawn at all.
    if (r.width === 0 && r.height === 0) continue;
    const tag = el.tagName.toLowerCase();
    const kind =
      el.getAttribute('role') ||
      (tag === 'input' ? `input:${el.getAttribute('type') || 'text'}` : tag);
    const key = `${kind} :: ${label(el)}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  return [...seen.entries()].map(([key, n]) => (n > 1 ? `${key}  x${n}` : key)).sort();
};

const TABS = () =>
  [...document.querySelectorAll('#main-content [role="tab"]')].map(el =>
    (el.textContent || '').replace(/\s+/g, ' ').trim()
  );

async function walk(browser, deckId) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', e => consoleErrors.push(`PAGEERROR ${String(e).slice(0, 200)}`));

  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument(FEATURE_PATCH);

  const url = `http://127.0.0.1:${PORT}${ROUTE.replace('DECK', deckId)}`;
  /* `domcontentloaded`, not `networkidle2`. The read-only page re-persists its
     power score whenever the computed score changes, so its network never goes
     idle and a navigation waiting for that times out. The settle below is what
     the census actually depends on. */
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#main-content [role="tab"]').length > 0,
    { timeout: 60000 }
  ).catch(() => {});
  await sleep(SETTLE);

  const landedOn = page.url().replace(`http://127.0.0.1:${PORT}`, '');
  const tabNames = await page.evaluate(TABS);
  const sections = [];

  if (tabNames.length === 0) {
    sections.push({ tab: '(no tab strip)', controls: await page.evaluate(CENSUS) });
  } else {
    for (let i = 0; i < tabNames.length; i += 1) {
      await page.evaluate(index => {
        const tabs = document.querySelectorAll('#main-content [role="tab"]');
        tabs[index]?.click();
      }, i);
      await sleep(SETTLE);
      sections.push({ tab: tabNames[i], controls: await page.evaluate(CENSUS) });
    }
  }

  await page.close();
  return { url, landedOn, tabNames, sections, consoleErrors };
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  const deckId = 'dddddddd-0000-4000-8000-00000000dm01';
  const result = await walk(browser, deckId);

  await browser.close();
  server.close();

  console.log(`\n===== ${LABEL} · ${DIST} · ${ROUTE} =====`);
  console.log(`landed on: ${result.landedOn}`);
  console.log(`tabs (${result.tabNames.length}): ${result.tabNames.join(' | ')}`);
  for (const section of result.sections) {
    console.log(`\n--- TAB: ${section.tab}  (${section.controls.length} distinct controls)`);
    for (const control of section.controls) console.log(`    ${control}`);
  }
  console.log(`\nconsole errors: ${result.consoleErrors.length}`);
  for (const e of result.consoleErrors.slice(0, 12)) console.log(`   ! ${e}`);

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `deck-controls-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, route: ROUTE, ...result }, null, 2)
  );
})();
