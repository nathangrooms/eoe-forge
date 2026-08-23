/**
 * Walk every deck surface at two real viewport widths and write down, for each:
 * the metric figures and their painted tiles, whether the page scrolls
 * sideways, how much the layout moved while it settled, and a screenshot.
 *
 *   npm run build
 *   node scripts/deck-refute-measure.mjs [dist] [label]
 *   WIDTH=1920 node scripts/deck-refute-measure.mjs dist after-1920
 *
 * ## Why this exists rather than reusing the two scripts beside it
 *
 * `deck-metric-measure.mjs` answers "do two metric rows match" and stops at
 * seven routes with no picture and no viewport sweep. `deck-control-census.mjs`
 * answers "what can a person press". Neither answers the owner's second
 * sentence, which is about how a page LOOKS at the width it is looked at, and
 * neither covers `/decks`, `/p/:slug`, the two redirect targets or the
 * optimiser route in one pass.
 *
 * Three things are measured here and nowhere else:
 *
 * 1. **Sideways scroll.** `documentElement.scrollWidth` against `clientWidth`,
 *    plus the widest element that sticks out past the viewport, because
 *    "something overflows" is useless without a name.
 * 2. **Layout shift.** A `PerformanceObserver` on `layout-shift` installed
 *    before the document exists, so shifts during hydration are caught rather
 *    than only the ones after the harness gets control. Reported as the CLS
 *    sum with the largest single source named.
 * 3. **A screenshot at each width**, so a claim about a page can be looked at
 *    instead of argued about.
 *
 * The figure-finding is deliberately the same structural rule
 * `deck-metric-measure.mjs` uses — every leaf whose font size is at or above
 * 20px, then the nearest painted ancestor — so the two can be compared without
 * an argument about method. A measurement keyed on `.text-2xl` would only ever
 * find the tiles that already agree with the thing being tested.
 *
 * Fixture caveat, the same one `docs/design/CONSISTENCY.md` states: the deck
 * summary RPCs are answered by a stand-in, so the VALUES in the tiles are
 * invented and their GEOMETRY is not. `MetricRow` lays out on a column count
 * fixed by the container, so every pixel below is a function of the shared
 * component and the band it sits in.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || process.env.DIST || 'dist';
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.env.PORT || 4419);
const WIDTH = Number(process.env.WIDTH || 1280);
const HEIGHT = Number(process.env.HEIGHT || 900);
const SETTLE = Number(process.env.SETTLE || 3000);
const SHOTS = process.env.SHOTS || '';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'deck-save-shim.js'), 'utf8');

/**
 * Everything the base shim cannot answer, in one patch.
 *
 * `check_feature_access` gates the optimiser. `compute_deck_summary` and the
 * batched `compute_deck_summaries` feed the deck page and My Decks; both
 * spellings are live in the tree at once and the plural is tested first
 * because the singular name is a prefix of it. `get_public_deck` is what
 * `/p/:slug` resolves a slug through, and without it PublicDeck renders its
 * not-found panel and there is nothing to measure.
 */
const PATCH = `
(() => {
  const DECK_ID = 'dddddddd-0000-4000-8000-00000000dm01';
  const SUMMARY = {
    id: DECK_ID,
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
  const json = body => new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' },
  });

  const inner = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const body = (() => {
      try { return JSON.parse((init && init.body) || '{}'); } catch { return {}; }
    })();

    if (url.includes('/rest/v1/rpc/check_feature_access')) {
      return json({ allowed: true, tier: 'unlimited', limit: -1, used: 0, remaining: -1 });
    }
    if (url.includes('/rest/v1/rpc/compute_deck_summaries')) {
      const ids = Array.isArray(body.p_deck_ids) && body.p_deck_ids.length ? body.p_deck_ids : [DECK_ID];
      return json(ids.map(id => ({ ...SUMMARY, id })));
    }
    if (url.includes('/rest/v1/rpc/compute_deck_summary')) {
      /* \`/p/:slug\` builds its decklist out of THIS RPC's \`cards\` array rather
         than reading \`deck_cards\`, so a summary without one renders the
         public page's "no cards" empty state under a header that says the deck
         has ninety-nine. The rows are read back through the shim so the public
         page and the owner's page are looking at the same hundred cards. */
      let cards = [];
      try {
        const res = await inner.call(
          window,
          'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/deck_cards?select=*&deck_id=eq.' + DECK_ID
        );
        const rows = await res.json();
        cards = (Array.isArray(rows) ? rows : []).map(r => ({
          card_id: r.card_id,
          card_name: r.card_name,
          quantity: r.quantity,
          is_commander: r.is_commander,
          is_sideboard: r.is_sideboard,
          name: r.card_name,
          mana_cost: null,
          cmc: 3,
          type_line: 'Creature',
          colors: ['G'],
          color_identity: ['G'],
          prices: { usd: '8.87' },
          rarity: 'rare',
          tags: [],
        }));
      } catch { /* an empty list is still a measurable page */ }
      return json({ ...SUMMARY, id: body.deck_id || DECK_ID, cards });
    }
    if (url.includes('/rest/v1/rpc/get_public_deck')) {
      return json({ id: DECK_ID, view_count: 42, published_at: '2026-02-01T00:00:00+00:00' });
    }
    return inner.call(this, input, init);
  };

  /* Installed here rather than after load: a shift during hydration is the
     kind this is looking for, and an observer added later cannot see it. */
  window.__dmShift = { total: 0, worst: 0, worstNode: null };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__dmShift.total += entry.value;
        if (entry.value > window.__dmShift.worst) {
          window.__dmShift.worst = entry.value;
          const src = entry.sources && entry.sources[0] && entry.sources[0].node;
          window.__dmShift.worstNode = src
            ? (src.tagName || '') + (src.className && typeof src.className === 'string'
                ? '.' + src.className.split(/\\s+/).slice(0, 3).join('.') : '')
            : null;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
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
  const bytes = fs.readFileSync(file);
  const accepts = String(req.headers['accept-encoding'] || '');
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESSIBLE.has(ext) && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(bytes, { level: 9 });
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = gz.length;
    res.writeHead(200, headers);
    return res.end(gz);
  }
  res.writeHead(200, headers);
  res.end(bytes);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = n => Math.round(n * 10) / 10;

/** Every figure at or above 20px, with the tile it is painted on. */
const FIGURES = () => {
  const root = document.querySelector('#main-content') || document.body;
  const out = [];
  const r1 = n => Math.round(n * 10) / 10;

  const painted = el => {
    let node = el;
    for (let i = 0; i < 8 && node && node !== document.body; i += 1) {
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
    let label = null;
    if (tile) {
      for (const p of tile.node.querySelectorAll('p, span, div')) {
        if (p.children.length > 0) continue;
        const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t === text) continue;
        if (parseFloat(getComputedStyle(p).fontSize) <= 14) { label = t; break; }
      }
    }
    const tr = tile ? tile.node.getBoundingClientRect() : null;
    out.push({
      value: text,
      label,
      font: `${r1(size)}px/${cs.fontWeight}`,
      y: r1(r.y),
      x: r1(r.x),
      tileBg: tile ? tile.cs.backgroundColor : 'NONE (transparent to the root)',
      tileBox: tr ? `${r1(tr.width)} x ${r1(tr.height)}` : 'NONE',
      tilePad: tile ? tile.cs.padding : 'NONE',
      tileRadius: tile ? tile.cs.borderRadius : 'NONE',
      tileShadow: tile && tile.cs.boxShadow !== 'none' ? 'yes' : 'no',
    });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
};

/** Does the page scroll sideways, and if so what is sticking out. */
const OVERFLOW = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const over = [];
  for (const el of document.querySelectorAll('#main-content *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    const cs = getComputedStyle(el);
    /* An element inside a container that scrolls on its own axis is doing what
       it was told to; the page body is what must not move. */
    let scrollsOwn = false;
    let p = el.parentElement;
    for (let i = 0; i < 6 && p; i += 1) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' || pcs.overflowX === 'hidden') { scrollsOwn = true; break; }
      p = p.parentElement;
    }
    over.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
      right: Math.round(r.right),
      width: Math.round(r.width),
      inScroller: scrollsOwn,
    });
  }
  over.sort((a, b) => b.right - a.right);
  return {
    scrollWidth: de.scrollWidth,
    clientWidth: vw,
    bodyScrolls: de.scrollWidth > vw + 1,
    worst: over.filter(o => !o.inScroller).slice(0, 5),
    worstInScrollers: over.filter(o => o.inScroller).slice(0, 3),
  };
};

async function visit(browser, name, route, shotDir) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await page.setViewport({ width: WIDTH, height: HEIGHT });
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument(PATCH);

  /* `domcontentloaded`, not `networkidle2`: the deck page re-persists its power
     score whenever the computed score changes, so its network never goes idle. */
  await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(SETTLE);

  const landedOn = page.url().replace(`http://127.0.0.1:${PORT}`, '');
  const figures = await page.evaluate(FIGURES);
  const overflow = await page.evaluate(OVERFLOW);
  const shift = await page.evaluate(() => window.__dmShift || null);

  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, `${name}-${WIDTH}.png`), fullPage: false });
  }
  await page.close();
  return { name, route, landedOn, figures, overflow, shift, consoleErrors };
}

const DECK = 'dddddddd-0000-4000-8000-00000000dm01';
const ROUTES = [
  ['decks', '/decks'],
  ['deck', `/deck/${DECK}`],
  ['analysis-redirect', `/deck/${DECK}/analysis`],
  ['missing-redirect', `/deck/${DECK}/missing`],
  ['optimise', `/deck/${DECK}/optimise`],
  ['export', `/deck/${DECK}/export`],
  ['share', `/deck/${DECK}/share`],
  ['proxies', `/deck/${DECK}/proxies`],
  ['testhand', `/deck/${DECK}/testhand`],
  ['commander', `/deck/${DECK}/commander`],
  ['commander-legacy', '/deck-builder/commander'],
  ['public', '/p/harness'],
];

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  const results = [];
  for (const [name, route] of ROUTES) results.push(await visit(browser, name, route, SHOTS));

  await browser.close();
  server.close();

  console.log(`\n===== ${LABEL} · ${DIST} · ${WIDTH}x${HEIGHT} =====`);
  for (const r of results) {
    console.log(`\n--- ${r.name}  ${r.route}${r.landedOn !== r.route ? `  ->  ${r.landedOn}` : ''}`);
    if (r.figures.length === 0) {
      console.log('    figures: NONE at or above 20px');
    } else {
      for (const f of r.figures) {
        console.log(
          `    ${String(f.value).padEnd(10)} ${String(f.label ?? '').padEnd(24)} ${f.font.padEnd(10)}` +
          ` bg ${f.tileBg.padEnd(26)} box ${f.tileBox.padEnd(16)} pad ${f.tilePad.padEnd(12)}` +
          ` r ${f.tileRadius.padEnd(8)} shadow ${f.tileShadow}`
        );
      }
    }
    console.log(
      `    sideways: ${r.overflow.bodyScrolls ? `YES  ${r.overflow.scrollWidth} > ${r.overflow.clientWidth}` : `no  (${r.overflow.scrollWidth} = ${r.overflow.clientWidth})`}`
    );
    for (const o of r.overflow.worst) console.log(`       over: <${o.tag}> right=${o.right} w=${o.width}  ${o.cls}`);
    console.log(`    layout shift: CLS ${round(r.shift?.total ?? 0)}  worst ${round(r.shift?.worst ?? 0)}  ${r.shift?.worstNode ?? ''}`);
    console.log(`    console errors: ${r.consoleErrors.length}`);
    for (const e of r.consoleErrors.slice(0, 6)) console.log(`       ! ${e}`);
  }

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `deck-refute-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, width: WIDTH, results }, null, 2)
  );
})();
