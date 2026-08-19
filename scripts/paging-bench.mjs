/**
 * Measure what a browse surface costs to render, before and after pagination.
 *
 *   node scripts/paging-bench.mjs --label before
 *   ... change the code ...
 *   node scripts/paging-bench.mjs --label after
 *   node scripts/paging-bench.mjs --compare
 *
 * It mounts the REAL components — `EnhancedUniversalCardSearch` and
 * `CollectionBrowser` — in a dev-only entry, with the same providers they have
 * in the app, and times them in a real browser.
 *
 * Two deliberate substitutions, both applied identically to every run so the
 * comparison is like for like:
 *
 *   Scryfall is served from a cached copy of three real pages of
 *   `f:commander -t:land` (175 cards each, total_cards 30,636). Real payload,
 *   no network jitter, and no traffic sent to Scryfall on every run.
 *
 *   Card images are served as a 1x1 PNG. Decode and network for ~175 images
 *   would dominate and vary; what is being measured here is how much work the
 *   page does per page turn, not how fast Scryfall's CDN is. Layout still
 *   happens: the tiles carry their own aspect ratio.
 *
 * The clock: a MutationObserver watches the whole document. t0 is the moment
 * the search response resolves (search) or the moment React is told to render
 * (collection). "settled" is the timestamp of the last DOM mutation before a
 * quiet period. That is the honest end of a render — the point after which the
 * page stops changing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? true;
};

const LABEL = flag('label') || 'run';
const PORT = Number(flag('port') || 8471);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = 'scratch/bench';
const FIXTURE = path.join(OUT_DIR, 'scryfall-staples.json');
const HARNESS_HTML = 'paging-harness.html';
const HARNESS_ENTRY = 'src/dev/__pagingHarness.tsx';

fs.mkdirSync(OUT_DIR, { recursive: true });
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (flag('compare')) {
  const before = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'before.json'), 'utf8'));
  const after = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'after.json'), 'utf8'));
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (!b || !a) continue;
    log(`\n${k}`);
    for (const m of Object.keys(b)) {
      if (typeof b[m] !== 'number') continue;
      const delta = a[m] == null ? '—' : `${(((a[m] - b[m]) / b[m]) * 100).toFixed(0)}%`;
      log(`  ${m.padEnd(22)} ${String(b[m]).padStart(10)} -> ${String(a[m]).padStart(10)}  ${delta}`);
    }
  }
  process.exit(0);
}

if (!fs.existsSync(FIXTURE)) {
  console.error(`Missing ${FIXTURE}. Run the fetch step first.`);
  process.exit(1);
}
const PAGES = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

/* ------------------------------------------------------------------ *
 * Harness files. Gitignored; written fresh on every run.
 * ------------------------------------------------------------------ */

fs.mkdirSync('src/dev', { recursive: true });

fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Paging bench</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Written by scripts/paging-bench.mjs. Gitignored. Not part of the app. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../index.css';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { CollectionBrowser } from '@/components/collection/browser/CollectionBrowser';
import type { BrowserCard } from '@/components/collection/browser/types';

/* ---------------------------------------------------------- the clock */

const bench: any = ((window as any).__bench = {
  t0: null as number | null,
  last: 0,
  mutations: 0,
});

new MutationObserver(records => {
  bench.mutations += records.length;
  bench.last = performance.now();
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
});

/* The search surface fetches Scryfall itself. Stamp t0 the instant the
   response body is available to the app, so the number is render, not network. */
const nativeFetch = window.fetch.bind(window);
window.fetch = async (...a: any[]) => {
  const url = String(a[0]?.url ?? a[0]);
  const res = await nativeFetch(...(a as [any, any]));
  if (url.includes('/cards/search')) {
    const clone = res.clone();
    await clone.json().catch(() => null);
    bench.t0 = performance.now();
    bench.last = performance.now();
  }
  return res;
};

/* ------------------------------------------------------- fixture data */

const BROWSE_VIEWS = [
  {
    id: 'staples',
    label: 'Commander staples',
    caption: 'Commander-legal nonland cards in EDHREC play order',
    state: { text: 'f:commander -t:land', order: 'edhrec', dir: 'asc', unique: 'cards' },
  },
] as any;

function useFixtureCards(count: number) {
  const [cards, setCards] = useState<BrowserCard[] | null>(null);
  useEffect(() => {
    fetch('/__bench/cards.json')
      .then(r => r.json())
      .then((raw: any[]) => {
        const out: BrowserCard[] = [];
        for (let i = 0; i < count; i++) {
          const c = raw[i % raw.length];
          out.push({
            rowId: 'row-' + i,
            cardId: c.id + '-' + i,
            name: c.name,
            setCode: (c.set || '').toLowerCase(),
            collectorNumber: c.collector_number,
            manaCost: c.mana_cost,
            cmc: Number(c.cmc) || 0,
            typeLine: c.type_line || '',
            rarity: c.rarity || 'common',
            colors: (c.colors || []) as any,
            colorIdentity: (c.color_identity || []) as any,
            legalities: c.legalities || {},
            imageUrl: c.image_uris?.normal,
            raw: c,
            quantity: 1 + (i % 3),
            foil: i % 7 === 0 ? 1 : 0,
            condition: 'NM',
            unitPrice: Number(c.prices?.usd) || 0,
            foilPrice: Number(c.prices?.usd_foil) || 0,
            addedAt: new Date(Date.now() - i * 60000).toISOString(),
            source: null,
          } as any);
        }
        bench.t0 = performance.now();
        bench.last = performance.now();
        setCards(out);
      });
  }, [count]);
  return cards;
}

function CollectionBench() {
  const count = Number(new URLSearchParams(location.search).get('n') || 1200);
  const cards = useFixtureCards(count);
  if (!cards) return <div>loading fixture…</div>;
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <CollectionBrowser cards={cards} storageKey={undefined} urlSync />
    </div>
  );
}

function SearchBench() {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <EnhancedUniversalCardSearch
        browseViews={BROWSE_VIEWS}
        showFilters
        showAddButton
        showWishlistButton
        showListButtons
        showViewModes
        showPresets
        urlSync
        sizeKey="bench-search"
      />
    </div>
  );
}

/* Which surface, from ?bench=. Vite's dev server has an SPA fallback that would
   hand /bench/* to the real index.html, so the harness stays on its own file
   and picks the surface from a query param instead of a path. */
const which = new URLSearchParams(location.search).get('bench');

/* No StrictMode: src/main.tsx does not use it either, and its double mount
   changes what the search surface does (the second effect run sees the same
   request URL and short-circuits, after the first has been aborted). The bench
   must run the app's real mounting behaviour. */
/* The same providers App.tsx wraps the product in. Without TooltipProvider the
   card tiles throw on their first action button, which is not a fair thing to
   measure. */
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
   <TooltipProvider>
    <BrowserRouter>
      <Routes>
        <Route
          path="*"
          element={
            which === 'collection' ? <CollectionBench /> :
            which === 'search' ? <SearchBench /> :
            <div>pick a bench surface with ?bench=search|collection</div>
          }
        />
      </Routes>
    </BrowserRouter>
   </TooltipProvider>
  </QueryClientProvider>
);
`
);

/* ------------------------------------------------------------------ *
 * Dev server
 * ------------------------------------------------------------------ */

const server = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
);
server.stdout.on('data', d => process.env.BENCH_VERBOSE && process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/${HARNESS_HTML}`);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('dev server never came up');
}

/* ------------------------------------------------------------------ *
 * Browser
 * ------------------------------------------------------------------ */

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const FIXTURE_CARDS = JSON.stringify(PAGES[0].data);

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);

  page.on('request', req => {
    const url = req.url();

    if (url.includes('/__bench/cards.json')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: FIXTURE_CARDS,
      });
    }

    if (url.startsWith('https://api.scryfall.com/cards/search')) {
      const n = Number(new URL(url).searchParams.get('page') || 1);
      const src = PAGES[Math.min(n, PAGES.length) - 1];
      const body = {
        object: 'list',
        total_cards: src.total_cards,
        has_more: true,
        next_page: url.replace(/([?&])page=\d+/, '$1page=' + (n + 1)) +
          (url.includes('page=') ? '' : (url.includes('?') ? '&' : '?') + 'page=' + (n + 1)),
        data: src.data,
      };
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(body),
      });
    }

    if (url.startsWith('https://api.scryfall.com/')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ object: 'list', data: [] }),
      });
    }

    if (/scryfall\.io|\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url) && !url.startsWith(BASE)) {
      return req.respond({
        status: 200,
        contentType: 'image/png',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: PNG_1x1,
      });
    }

    req.continue();
  });

  return page;
}

/**
 * Load a harness surface, tolerating Vite's first-request dependency
 * optimisation, which triggers a full page reload and destroys the execution
 * context under whatever was evaluating at the time.
 */
async function open(page, url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('!!window.__bench', { timeout: 20000 });
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1500);
    }
  }
}

/** Wait until the DOM stops changing, then report when it last did. */
async function settle(page, quietMs = 400, capMs = 30000) {
  await page.waitForFunction('!!window.__bench', { timeout: 30000 }).catch(() => {});
  return page.evaluate(
    async (quiet, cap) => {
      const b = window.__bench;
      const start = performance.now();
      for (;;) {
        await new Promise(r => setTimeout(r, 60));
        const now = performance.now();
        // `b.last > b.t0` guards against calling a render finished before it
        // has produced a single mutation.
        if (b.t0 != null && b.last > b.t0 && now - b.last > quiet) break;
        if (now - start > cap) break;
      }
      const grid = document.querySelector('.grid');
      return {
        renderMs: b.t0 == null ? null : Math.round(b.last - b.t0),
        domNodes: document.getElementsByTagName('*').length,
        images: document.images.length,
        tiles: grid ? grid.children.length : 0,
        scrollHeight: document.documentElement.scrollHeight,
        mutations: b.mutations,
      };
    },
    quietMs,
    capMs
  );
}

async function resetClock(page) {
  await page.evaluate(() => {
    window.__bench.t0 = performance.now();
    window.__bench.last = performance.now();
    window.__bench.mutations = 0;
  });
}

/** Median of repeated runs, so one slow GC does not become the headline. */
const median = xs => {
  const s = [...xs].filter(x => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function benchSearch(browser) {
  const runs = [];
  let shape = null;
  for (let i = 0; i < 3; i++) {
    const page = await setupPage(browser);
    await open(page, `${BASE}/${HARNESS_HTML}?bench=search`);
    const r = await settle(page);
    runs.push(r);
    if (i === 0) shape = r;
    await page.close();
  }

  // One more page, to time the "go to the next batch of cards" interaction.
  const page = await setupPage(browser);
  await open(page, `${BASE}/${HARNESS_HTML}?bench=search`);
  await settle(page);

  const nextMs = await (async () => {
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const next =
        btns.find(b => /load more/i.test(b.textContent || '')) ||
        btns.find(b => b.getAttribute('aria-label') === 'Go to next page') ||
        btns.find(b => /^next$/i.test((b.textContent || '').trim()));
      if (!next) return false;
      window.__bench.t0 = performance.now();
      window.__bench.last = performance.now();
      window.__bench.mutations = 0;
      next.click();
      return true;
    });
    if (!clicked) return null;
    const r = await settle(page);
    return r;
  })();

  // And the cost of re-sorting what is on screen.
  await resetClock(page);
  const sorted = await (async () => {
    const ok = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /Sort (ascending|descending)/i.test(x.getAttribute('aria-label') || '')
      );
      if (!b) return false;
      window.__bench.t0 = performance.now();
      window.__bench.last = performance.now();
      window.__bench.mutations = 0;
      b.click();
      return true;
    });
    return ok ? settle(page) : null;
  })();

  await page.close();

  return {
    firstResultsMs: median(runs.map(r => r.renderMs)),
    domNodes: shape.domNodes,
    images: shape.images,
    tilesOnScreen: shape.tiles,
    pageHeightPx: shape.scrollHeight,
    domMutations: shape.mutations,
    nextPageMs: nextMs?.renderMs ?? null,
    nextPageDomNodes: nextMs?.domNodes ?? null,
    nextPageImages: nextMs?.images ?? null,
    resortMs: sorted?.renderMs ?? null,
  };
}

async function benchCollection(browser, n) {
  const runs = [];
  let shape = null;
  for (let i = 0; i < 3; i++) {
    const page = await setupPage(browser);
    await open(page, `${BASE}/${HARNESS_HTML}?bench=collection&n=${n}`);
    const r = await settle(page);
    runs.push(r);
    if (i === 0) shape = r;
    await page.close();
  }

  const page = await setupPage(browser);
  await open(page, `${BASE}/${HARNESS_HTML}?bench=collection&n=${n}`);
  await settle(page);

  // Typing into the search box re-filters and re-renders the whole list.
  await resetClock(page);
  const typed = await (async () => {
    const box = await page.$('input[aria-label="Search cards"]');
    if (!box) return null;
    await box.click();
    await page.evaluate(() => {
      window.__bench.t0 = performance.now();
      window.__bench.last = performance.now();
      window.__bench.mutations = 0;
    });
    await box.type('a');
    return settle(page, 600);
  })();

  await page.close();

  return {
    firstResultsMs: median(runs.map(r => r.renderMs)),
    domNodes: shape.domNodes,
    images: shape.images,
    tilesOnScreen: shape.tiles,
    pageHeightPx: shape.scrollHeight,
    domMutations: shape.mutations,
    filterKeystrokeMs: typed?.renderMs ?? null,
    filterDomNodes: typed?.domNodes ?? null,
  };
}

/* ------------------------------------------------------------------ */

const results = {};
try {
  await waitForServer();
  log(`dev server up on ${BASE}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--disable-lcd-text', '--no-sandbox', '--font-render-hinting=none'],
  });

  // Warm Vite's dependency optimiser once, so the first measured load is not
  // the one that gets full-reloaded out from under the clock.
  {
    const warm = await browser.newPage();
    await warm.goto(`${BASE}/${HARNESS_HTML}?bench=search`, { waitUntil: 'networkidle2' }).catch(() => {});
    await sleep(4000);
    await warm.close();
  }

  log('benchmarking card search…');
  results['card search (/cards)'] = await benchSearch(browser);

  for (const n of [400, 1200]) {
    log(`benchmarking collection, ${n} rows…`);
    results[`collection browser (${n} rows)`] = await benchCollection(browser, n);
  }

  await browser.close();
} finally {
  server.kill();
}

fs.writeFileSync(path.join(OUT_DIR, `${LABEL}.json`), JSON.stringify(results, null, 2));
log(`\n=== ${LABEL} ===`);
for (const [k, v] of Object.entries(results)) {
  log(`\n${k}`);
  for (const [m, val] of Object.entries(v)) log(`  ${m.padEnd(24)} ${val}`);
}
