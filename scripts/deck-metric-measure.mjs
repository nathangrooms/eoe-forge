/**
 * Measure the metric tiles on My Decks and on the deck page, side by side.
 *
 *   npm run build
 *   node scripts/deck-metric-measure.mjs [dist] [label]
 *
 * ## Why this exists
 *
 * The brief for the consistency phase said the deck page draws bare numbers on
 * a transparent ground where My Decks draws tiles, and named that as the whole
 * of "doesn't feel complete". That is a claim about computed styles, so it is
 * settled by reading computed styles rather than by argument. This walks both
 * routes in one browser at one viewport and writes down, for every metric
 * figure it can find, the painted box, the ground colour, the padding and the
 * type. Two rows either match or they do not.
 *
 * It finds figures structurally rather than by class name: every element whose
 * own text is the whole of its text and whose font size is at or above 20px,
 * then walks up to the nearest ancestor with a non-transparent background. A
 * measurement keyed on `.text-2xl` would only ever find the tiles that already
 * agree with the thing being tested.
 *
 * The shim answers `compute_deck_summary` with null, so the FIGURES on /decks
 * are dashes and zeros. That is fine and it is the same caveat
 * `docs/design/CONSISTENCY.md` states: the tile geometry is a function of the
 * container and the shared component, not of the value inside it.
 *
 * It is not a control census — that is `scripts/deck-control-census.mjs` — and
 * it is not a request count — that is `scripts/deck-save-measure.mjs`.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || process.env.DIST || 'dist';
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.env.PORT || 4417);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SETTLE = Number(process.env.SETTLE || 2600);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

/**
 * Two RPCs the base shim cannot answer, and both are needed to see a tile.
 *
 * `check_feature_access` gates the Optimiser tab; the same wrapper is in
 * `deck-control-census.mjs`. `compute_deck_summary` is what My Decks builds its
 * six figures from, and with the shim's null the row renders as loading bars
 * for ever, so the comparison this script exists for has nothing on one side.
 *
 * The summary below is a FIXTURE with the shape the interface expects, which is
 * the same stand-in and the same caveat `docs/design/CONSISTENCY.md` states for
 * its own /decks figures: it decides what the numbers say, and it does not
 * decide the geometry, because `MetricRow` lays out on a column count fixed by
 * the container. Every pixel reported for /decks is a function of the shared
 * component and the 1288px band, not of these values.
 */
const FEATURE_PATCH = `
(() => {
  const SUMMARY = {
    id: 'dddddddd-0000-4000-8000-00000000dm01',
    name: 'Harness deck',
    format: 'commander',
    colors: ['G'],
    identity: ['G'],
    counts: {
      total: 99, unique: 82, lands: 36, creatures: 30, instants: 8, sorceries: 7,
      artifacts: 8, enchantments: 6, planeswalkers: 2, battles: 0,
    },
    curve: { bins: { '0-1': 6, '2': 14, '3': 16, '4': 12, '5': 8, '6-7': 5, '8-9': 2, '10+': 0 } },
    mana: { sources: { W: 0, U: 0, B: 0, R: 0, G: 30, C: 6 }, untappedPctByTurn: { t1: 82, t2: 88, t3: 91 } },
    legality: { ok: true, issues: [] },
    power: { score: 6.4, stale: false },
    economy: { priceUSD: 888, ownedPct: 74, missing: 12 },
    tags: [],
    updatedAt: new Date().toISOString(),
    favorite: true,
  };

  const inner = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/rest/v1/rpc/check_feature_access')) {
      return new Response(
        JSON.stringify({ allowed: true, tier: 'unlimited', limit: -1, used: 0, remaining: -1 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    /*
     * BOTH shapes, and the plural one is tested first because the singular
     * name is a prefix of it.
     *
     * My Decks called compute_deck_summary once per deck when this script was
     * written and calls the batched compute_deck_summaries(p_deck_ids) now: a
     * separate change, landing in deckAPI.ts at the same time as this work,
     * that turns 1+N requests into one. A fixture answering only the singular
     * leaves the row drawing its loading bars for ever, and the measurement
     * then reports "no figure" for a page whose figures are fine. The deck
     * page still uses the singular, so both have to be answered.
     */
    if (url.includes('/rest/v1/rpc/compute_deck_summaries')) {
      let ids = [SUMMARY.id];
      try {
        const body = JSON.parse((init && init.body) || (input && input.body) || '{}');
        if (body && Array.isArray(body.p_deck_ids) && body.p_deck_ids.length) {
          ids = body.p_deck_ids;
        }
      } catch { /* the default id is fine */ }
      return new Response(JSON.stringify(ids.map(id => ({ ...SUMMARY, id }))), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/rpc/compute_deck_summary')) {
      let id = SUMMARY.id;
      try {
        const body = JSON.parse((init && init.body) || (input && input.body) || '{}');
        if (body && body.deck_id) id = body.deck_id;
      } catch { /* the default id is fine */ }
      return new Response(JSON.stringify({ ...SUMMARY, id }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
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
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  };
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

/**
 * Every figure on the page, with the tile it sits in.
 *
 * A "figure" is a leaf element drawn at 20px or more whose text is short enough
 * to be a number rather than a heading. The tile is the nearest ancestor that
 * actually paints a background, which is the thing the brief's claim is about.
 */
const FIGURES = () => {
  const root = document.querySelector('#main-content') || document.body;
  const out = [];
  const round = n => Math.round(n * 10) / 10;

  const painted = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0)')) return { node, cs };
      node = node.parentElement;
    }
    return null;
  };

  for (const el of root.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 12) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (!(size >= 20)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;

    const tile = painted(el);
    /* The label is the tile's first short muted line, which is how MetricRow
       draws it. Reported so a figure can be identified without its value. */
    let label = null;
    if (tile) {
      for (const p of tile.node.querySelectorAll('p, span, div')) {
        if (p.children.length > 0) continue;
        const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t === text) continue;
        const ps = parseFloat(getComputedStyle(p).fontSize);
        if (ps <= 14) { label = t; break; }
      }
    }

    const tr = tile ? tile.node.getBoundingClientRect() : null;
    out.push({
      value: text,
      label,
      font: `${round(size)}px/${cs.fontWeight}`,
      x: round(r.x),
      y: round(r.y),
      tileBg: tile ? tile.cs.backgroundColor : 'NONE (transparent to the root)',
      tileBox: tr ? `${round(tr.width)} x ${round(tr.height)}` : 'NONE',
      tilePad: tile ? tile.cs.padding : 'NONE',
      tileRadius: tile ? tile.cs.borderRadius : 'NONE',
      tileShadow: tile && tile.cs.boxShadow !== 'none' ? 'yes' : 'no',
    });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
};

async function visit(browser, route) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument(FEATURE_PATCH);

  /* `domcontentloaded`, not `networkidle2`: the deck page re-persists its power
     score whenever the computed score changes, so its network never goes idle.
     The settle is what the measurement actually depends on. */
  await page.goto(`http://127.0.0.1:${PORT}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await sleep(SETTLE);

  const landedOn = page.url().replace(`http://127.0.0.1:${PORT}`, '');
  const figures = await page.evaluate(FIGURES);
  await page.close();
  return { route, landedOn, figures, consoleErrors };
}

const DECK = 'dddddddd-0000-4000-8000-00000000dm01';

const ROUTES = [
  '/decks',
  `/deck/${DECK}`,
  `/deck/${DECK}/export`,
  `/deck/${DECK}/share`,
  `/deck/${DECK}/proxies`,
  `/deck/${DECK}/testhand`,
  `/deck/${DECK}/commander`,
];

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  const results = [];
  for (const route of ROUTES) results.push(await visit(browser, route));

  await browser.close();
  server.close();

  console.log(`\n===== ${LABEL} · ${DIST} · ${WIDTH}x${HEIGHT} =====`);
  for (const r of results) {
    console.log(`\n--- ${r.route}${r.landedOn !== r.route ? `  (landed on ${r.landedOn})` : ''}`);
    if (r.figures.length === 0) {
      console.log('    no figure at or above 20px');
    }
    for (const f of r.figures) {
      console.log(
        `    ${String(f.label ?? '(no label)').padEnd(20)} ${String(f.value).padEnd(10)} ` +
          `${f.font.padEnd(10)} bg ${String(f.tileBg).padEnd(18)} box ${String(f.tileBox).padEnd(16)} ` +
          `pad ${String(f.tilePad).padEnd(10)} radius ${f.tileRadius} shadow ${f.tileShadow}`
      );
    }
    console.log(`    console errors: ${r.consoleErrors.length}`);
    for (const e of r.consoleErrors.slice(0, 6)) console.log(`      ! ${e}`);
  }

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `deck-metrics-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, width: WIDTH, results }, null, 2)
  );
})();
