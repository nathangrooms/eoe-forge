/**
 * Walk every surface the merged deck page owns and report what each one drew.
 *
 *   npm run build
 *   node scripts/deck-surfaces-walk.mjs
 *
 * ## Why this exists
 *
 * The merge moved the builder's seven tabs into nine tabs, two slide-overs and
 * five routes. "Every one keeps working" is a claim about running code, and a
 * typecheck cannot make it: a panel whose props no longer line up still
 * compiles and then renders nothing, or throws inside an effect that TypeScript
 * never sees. So this opens each surface in a real browser against a real card
 * table and records the headings it produced and the console it produced them
 * with.
 *
 * What it reports is what rendered. It is NOT a measurement of requests — that
 * is `scripts/deck-save-measure.mjs`, which is left alone so its published
 * before/after numbers stay reproducible.
 *
 * ## The stand-in
 *
 * `scripts/deck-save-shim.js`, unchanged, plus one wrapper appended here for
 * `rpc/check_feature_access`. The base shim answers every RPC with null, which
 * is right for counting requests and wrong for this: `useIsFeatureEnabled`
 * reads `allowed` off that reply, so the Optimiser tab — the single largest
 * thing the merge had to rehome — would be hidden from the walk by the harness
 * rather than by the product. The wrapper answers that one RPC and delegates
 * everything else to the shim, so nothing else about the fixture moves.
 *
 * Anything the shim answers with a failure on purpose (the EDH edge function,
 * the optimiser's own edge function) is reported as such rather than being
 * dressed up. A panel that says it could not reach its service is a panel that
 * mounted, which is what is being checked here.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4413);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 2600);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

/** One RPC the base shim does not model, and the tab it decides. */
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
const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

/**
 * Console noise the fixture causes rather than the page.
 *
 * The shim answers every edge function with `{ success: false }` on purpose, so
 * a panel that logs its own failed call is reporting the harness. Filtered by
 * substring, listed here rather than hidden, and anything else is a real error.
 */
const FIXTURE_NOISE = [
  'harness',
  'Failed to load resource',
  'check_feature_access',
  'Download the React DevTools',
];

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument(FEATURE_PATCH);
  const errors = [];
  page.on('console', m => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (FIXTURE_NOISE.some(n => text.includes(n))) return;
    errors.push(`${m.type()}: ${text.slice(0, 220)}`);
  });
  page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 220)}`));
  return { page, errors };
}

/**
 * What the page drew, on the tab named in the URL.
 *
 * Headings are read from the whole document rather than from a guessed
 * subtree: the tab body is not a landmark and picking it by class would tie
 * this script to a layout detail. The header's own headings are constant across
 * all nine tabs and are subtracted afterwards, which is a more honest way to
 * find the difference than asserting where the difference lives.
 */
const READ_BODY = `(() => {
  const headings = [...document.querySelectorAll('h1,h2,h3')]
    .map(h => h.textContent.trim().replace(/\\s+/g, ' '))
    .filter(Boolean);
  const selected = [...document.querySelectorAll('[role="tab"]')]
    .filter(t => t.getAttribute('aria-selected') === 'true')
    .map(t => t.textContent.trim().replace(/\\s+/g, ' '));
  const tabs = [...document.querySelectorAll('[role="tab"]')]
    .map(t => t.textContent.trim().replace(/\\s+/g, ' '));
  return {
    tabs,
    selected: selected[0] || null,
    headings: [...new Set(headings)],
    /* The controls the decklist draws on every card. Zero on a tab that is not
       the decklist; non-zero is the proof that "always editable" survived. */
    quantityControls: document.querySelectorAll(
      'button[title="Remove one copy"], button[aria-label="Remove one copy"]'
    ).length,
    chars: document.body.textContent.replace(/\\s+/g, ' ').trim().length,
  };
})()`;

async function walkTab(browser, tab) {
  const { page, errors } = await openPage(browser);
  const q = tab === 'cards' ? '' : `?tab=${tab}`;
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}${q}`, {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await page.waitForSelector('[role="tablist"]', { timeout: 60000 });
  await sleep(SETTLE);
  const out = await page.evaluate(READ_BODY);
  await page.close();
  return { tab, ...out, errors };
}

async function walkRoute(browser, route) {
  const { page, errors } = await openPage(browser);
  await page.goto(`http://127.0.0.1:${PORT}${route.replace('DECK', DECK)}`, {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await sleep(SETTLE);
  const out = await page.evaluate(() => ({
    url: location.pathname + location.search,
    headings: [...new Set(
      [...document.querySelectorAll('h1,h2,h3')]
        .map(h => h.textContent.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
    )].slice(0, 10),
    back: (() => {
      const a = [...document.querySelectorAll('a')].find(x =>
        /back to/i.test(x.textContent || '')
      );
      return a ? `${a.textContent.trim()} -> ${a.getAttribute('href')}` : null;
    })(),
    chars: document.body.textContent.replace(/\s+/g, ' ').trim().length,
  }));
  await page.close();
  return { route, ...out, errors };
}

/**
 * The one thing a direct visit cannot show: whether the deck page hands its own
 * address to the destination it sends you to.
 *
 * Open the deck ON A TAB, press Export in the header, then read the back link.
 * If it names the tab, the return trip is the tab you left.
 */
async function walkReturnTrip(browser) {
  const { page, errors } = await openPage(browser);
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}?tab=optimiser`, {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await page.waitForSelector('[role="tablist"]', { timeout: 60000 });
  await sleep(SETTLE);
  const pressed = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(b =>
      /^export$/i.test((b.textContent || '').trim())
    );
    if (!button) return false;
    button.click();
    return true;
  });
  await sleep(1400);
  const out = await page.evaluate(() => ({
    url: location.pathname + location.search,
    back: (() => {
      const a = [...document.querySelectorAll('a')].find(x =>
        /back to/i.test(x.textContent || '')
      );
      return a ? a.getAttribute('href') : null;
    })(),
  }));
  await page.close();
  return { pressed, ...out, errors };
}

/** The header's More menu: the actions that are not tabs and not header buttons. */
async function walkMoreMenu(browser) {
  const { page, errors } = await openPage(browser);
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}`, {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await page.waitForSelector('[role="tablist"]', { timeout: 60000 });
  await sleep(SETTLE);
  /* A real pointer press. Radix opens this on pointerdown, so a synthetic
     `.click()` leaves the menu shut and reports nothing. */
  await page.click('button[aria-label="More deck actions"]');
  await sleep(900);
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map(i =>
      i.textContent.trim().replace(/\s+/g, ' ')
    )
  );
  await page.close();
  return { items, errors };
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const TABS = [
    'cards', 'add', 'mana', 'edh', 'analysis',
    'legality', 'optimiser', 'value', 'record',
  ];
  const ROUTES = [
    /* The optimiser is a route now, and both of its old tab spellings redirect
       here. Walked as three entries so a redirect that stops redirecting shows
       up as a page with the wrong headings rather than as nothing at all. */
    '/deck/DECK/optimise',
    '/deck/DECK?tab=optimiser',
    '/deck/DECK?tab=ai',
    '/deck/DECK/export',
    '/deck/DECK/share',
    '/deck/DECK/proxies',
    '/deck/DECK/testhand',
    '/deck/DECK/commander',
    '/deck-builder?deck=DECK',
    '/deck/DECK/analysis',
    '/deck/DECK/missing',
    /* Not a deck route. It is the link the deck page's More menu sends you to,
       and the only way to know it arrives at the playtest door with this deck
       chosen — rather than at the mode wall — is to follow it. */
    '/play?mode=playtest&deck=DECK',
  ];

  /* Each stop prints as it finishes. A walk that falls over on its last stop
     should still hand back the nine it already did. */
  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      console.log(`\n!! ${label} did not complete: ${String(e).split('\n')[0]}`);
      return null;
    }
  };

  console.log(`\n=== TABS (${DIST}) ===`);
  const tabResults = [];
  for (const tab of TABS) {
    const r = await safe(`?tab=${tab}`, () => walkTab(browser, tab));
    if (!r) continue;
    tabResults.push(r);
    if (tabResults.length === 1) {
      console.log(`tab strip: ${r.tabs.length} tabs`);
      for (const t of r.tabs) console.log(`     ${t}`);
    }
    console.log(
      `\n-- ?tab=${r.tab}  selected: ${r.selected}  ` +
        `${r.chars} chars  ${r.quantityControls} quantity controls`
    );
    for (const h of r.headings) console.log(`     ${h}`);
    for (const e of r.errors) console.log(`   !! ${e}`);
  }
  if (tabResults.length > 1) {
    const shell = tabResults.reduce(
      (keep, run) => keep.filter(h => run.headings.includes(h)),
      tabResults[0].headings
    );
    console.log(`\nshared by all nine tabs (the page shell): ${shell.join(' · ')}`);
  }

  console.log(`\n=== ROUTES ===`);
  const routeResults = [];
  for (const route of ROUTES) {
    const r = await safe(route, () => walkRoute(browser, route));
    if (!r) continue;
    routeResults.push(r);
    console.log(`\n-- ${r.route}  ->  ${r.url}  (${r.chars} chars)`);
    if (r.back) console.log(`   back: ${r.back}`);
    for (const h of r.headings) console.log(`     ${h}`);
    for (const e of r.errors) console.log(`   !! ${e}`);
  }

  console.log(`\n=== RETURN TRIP ===`);
  const returnTrip = await safe('return trip', () => walkReturnTrip(browser));
  if (returnTrip) {
    console.log(`pressed Export from ?tab=optimiser: ${returnTrip.pressed}`);
    console.log(`landed on: ${returnTrip.url}`);
    console.log(`back link href: ${returnTrip.back}`);
    for (const e of returnTrip.errors) console.log(`   !! ${e}`);
  }

  console.log(`\n=== MORE MENU ===`);
  const moreMenu = await safe('more menu', () => walkMoreMenu(browser));
  if (moreMenu) {
    for (const i of moreMenu.items) console.log(`   ${i}`);
    for (const e of moreMenu.errors) console.log(`   !! ${e}`);
  }

  await browser.close();
  server.close();

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, 'deck-surfaces-walk.json'),
    JSON.stringify({ dist: DIST, tabs: tabResults, routes: routeResults, returnTrip, moreMenu }, null, 2)
  );
})();
