/**
 * Photograph the REAL app into `public/screens/`, for the homepage to show.
 *
 * The owner's note was that the homepage's pictures "dont actually look like
 * real in app screens". The permanent fix for that is not to redraw the mocks
 * more carefully. It is to stop drawing them: a screenshot of the real app
 * cannot look unlike the real app, and it goes stale visibly rather than
 * silently, because the next run of this script corrects it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL IN THESE IMAGES, STATED PLAINLY
 * ---------------------------------------------------------------------------
 * REAL: the pages. Every pixel is the shipped component tree rendering through
 * the providers `App.tsx` gives it. There is no recreation, no CSS mockup and
 * no retouching. Every card, every card image, every card name, every price and
 * every type line is a row read out of the live `cards` table.
 *
 * FIXTURE: who owns what. A signed-out request can never be shown a real
 * person's collection, decks or wishlist, and it must not be — so the account
 * in the picture is invented, and it is modelled on the shape of the one real
 * account in this database that has data. The tournament events are fixture for
 * a second reason: events live in `localStorage` on the organiser's own
 * machine, so there is no such thing as a server-side "real" event to read.
 *
 * NOT DONE ANYWHERE: no credentials are entered, no real user's data is read,
 * and no number on screen is written by this script.
 *
 * ---------------------------------------------------------------------------
 * OUTPUT
 * ---------------------------------------------------------------------------
 * `public/screens/<scene>-<width>.webp` at 768, 1280 and 1920, matching the
 * `hero-*.webp` convention already in `public/`. Each width is CAPTURED at that
 * width rather than resized down from one big shot, so the 768 image is the
 * layout the app really has at 768 rather than a shrunken desktop.
 *
 * `public/screens/manifest.json` lists what was written, when, and at what
 * size, so whatever consumes these can pick a width and knows how old they are.
 *
 *   npm run dev            # or any vite server on this repo
 *   node scripts/capture-app-screens.mjs
 *   ONLY=life node scripts/capture-app-screens.mjs
 *
 * The harness entry and html it writes are gitignored. The images are not:
 * they are the deliverable.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

import { buildEvents } from './fixture-events.mjs';

const OUT = process.env.OUT || 'public/screens';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ONLY = process.env.ONLY || '';
const QUALITY = Number(process.env.QUALITY || 82);

/** Matches the hero-*.webp widths already in public/. 16:10, the shape of a laptop. */
const WIDTHS = (process.env.WIDTHS || '768,1280,1920').split(',').map(Number);
const heightFor = width => Math.round(width * 0.625);

fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ harness */

const HARNESS_HTML = 'screens-harness.html';
const HARNESS_ENTRY = 'src/dev/__screensHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>App screens</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness. Written by scripts/capture-app-screens.mjs.
 * Mounts the REAL pages with the providers App.tsx gives them and without the
 * auth gate. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import Tournament from '../pages/Tournament';
import LifeCounter from '../pages/LifeCounter';
import DeckInterface from '../pages/DeckInterface';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(location.search).get('route') || '/tournament';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[start]}>
            <Routes>
              <Route path="/tournament" element={<Tournament />} />
              <Route path="/life" element={<LifeCounter />} />
              <Route path="/deck/:id" element={<DeckInterface />} />
              <Route path="*" element={<Tournament />} />
            </Routes>
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`
);

/* --------------------------------------------------------------- card rows */

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SHIM = fs.readFileSync(path.join(here, 'dashboard-shim.js'), 'utf8');
const TOURNAMENT_SHIM = fs.readFileSync(path.join(here, 'tournament-shim.js'), 'utf8');

const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const COLUMNS =
  'id,name,set_code,collector_number,type_line,mana_cost,color_identity,' +
  'rarity,layout,image_uris,faces,prices,is_legendary,oracle_text';

const CARD_IDS = [
  ...new Set(
    (SHIM.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [])
      .map(q => q.slice(1, -1))
      .filter(id => !id.startsWith('dddddddd') && !id.startsWith('00000000'))
  ),
];

/**
 * The real card rows, read once and cached to disk.
 *
 * Reading them from inside the browser made every capture depend on a shared
 * free-tier database answering inside its eight second statement timeout, and
 * one slow job in another session was enough to blank a page.
 */
async function loadCardRows() {
  const found = new Map();
  for (const file of ['.shots/tournament/cards.json', '.shots/dashboard/cards.json']) {
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) found.set(row.id, row);
  }
  if (found.size >= CARD_IDS.length) {
    log(`  card rows: ${found.size} from cache`);
    return [...found.values()];
  }

  for (const id of CARD_IDS) {
    for (let attempt = 0; attempt < 6 && !found.has(id); attempt += 1) {
      try {
        const res = await fetch(
          `https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards?select=${COLUMNS}&id=eq.${id}`,
          { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
        );
        if (!res.ok) throw new Error(String(res.status));
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) found.set(id, rows[0]);
        else break;
      } catch {
        await sleep(1200 * (attempt + 1));
      }
    }
  }
  log(`  card rows: ${found.size} of ${CARD_IDS.length} read from the database`);
  return [...found.values()];
}

/* ------------------------------------------------------------- mat artwork */

/**
 * The cards behind the life counter's five colour mats.
 *
 * `useMatArt` asks for all of them in one `name in (…)`. That query is on the
 * slow side of this shared free-tier instance's eight second statement timeout,
 * and when it times out the counter falls back to its CSS mats, which is
 * correct behaviour in the app and WRONG in a published screenshot: it would
 * publish the degraded render as if it were the normal one.
 *
 * So the rows are read here, one name at a time with retries, and merged into
 * the prefetched card rows the shim answers from. They are the same real rows
 * the app would have fetched. The candidate names are read out of
 * `src/components/life/mats.ts` rather than copied, so a change there is picked
 * up rather than silently diverging, and which candidate wins for which colour
 * is still decided by the app's own code.
 */
const MAT_CANDIDATES = (() => {
  const source = fs.readFileSync('src/components/life/mats.ts', 'utf8');
  const names = new Set();
  for (const line of source.match(/art:\s*\[[^\]]*\]/g) ?? []) {
    for (const quoted of line.match(/'[^']+'|"[^"]+"/g) ?? []) names.add(quoted.slice(1, -1));
  }
  return [...names];
})();

async function loadMatArtRows() {
  const cache = '.shots/screens/mat-art.json';
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  const found = new Map();
  if (fs.existsSync(cache)) {
    for (const row of JSON.parse(fs.readFileSync(cache, 'utf8'))) found.set(row.name, row);
  }

  for (const name of MAT_CANDIDATES) {
    for (let attempt = 0; attempt < 5 && !found.has(name); attempt += 1) {
      try {
        const res = await fetch(
          `https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards` +
            `?select=${COLUMNS}&name=eq.${encodeURIComponent(name)}` +
            `&image_uris=not.is.null&limit=1`,
          { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
        );
        if (!res.ok) throw new Error(String(res.status));
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) found.set(name, rows[0]);
        else break;
      } catch {
        await sleep(1500 * (attempt + 1));
      }
    }
  }

  const rows = [...found.values()];
  if (rows.length > 0) fs.writeFileSync(cache, JSON.stringify(rows));
  log(`  mat art: ${rows.length} of ${MAT_CANDIDATES.length} candidate cards resolved`);
  if (rows.length < MAT_CANDIDATES.length) {
    log('  (a candidate the database would not answer for means one colour may fall back');
    log('   to its plain CSS mat, which is what the app itself does)');
  }
  return rows;
}

const CARD_ROWS = [...(await loadCardRows()), ...(await loadMatArtRows())];
const EVENTS = buildEvents(new Map(CARD_ROWS.map(r => [r.id, r]))).all;

/* ------------------------------------------------------------------ scenes */

/**
 * One picture the homepage could use.
 *
 *   route  — what the app is asked for
 *   ready  — text that proves the right page drew, not a skeleton
 *   press  — buttons to click, in order, once it has
 *   settle — extra ms before the shutter, for pages that animate in
 *   caption — what this screen is, carried into the manifest so whoever wires
 *             it up does not have to guess.
 */
const SCENES = [
  {
    key: 'tournament-pairings',
    route: '/tournament?event=evt-friday',
    ready: 'Friday Night Commander',
    caption: 'Round three of a Swiss event, with every seat showing the deck it registered.',
  },
  {
    key: 'tournament-standings',
    route: '/tournament?event=evt-friday',
    ready: 'Friday Night Commander',
    press: ['Standings'],
    caption: 'Live standings with DCI tiebreakers and every player’s round-by-round record.',
  },
  {
    key: 'life-counter',
    route: '/life',
    ready: 'player game',
    press: ['Start 4-player game'],
    settle: 2500,
    caption: 'The life counter mid-game, one panel per seat, each turned to face its player.',
  },
  {
    key: 'deck',
    route: '/deck/dddddddd-0000-4000-8000-000000000000',
    ready: 'Atraxa counters',
    caption: 'A Commander deck, its commander, its curve and what it is worth.',
  },
];

/* ------------------------------------------------------------------- shoot */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  // Subpixel antialiasing draws coloured fringes on thin type over charcoal and
  // reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const written = [];

async function capture(scene, width) {
  const height = heightFor(width);
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(
    `window.__dmCards = ${JSON.stringify(CARD_ROWS)};
     window.__dmEvents = ${JSON.stringify(EVENTS)};`
  );
  await tab.evaluateOnNewDocument(SHIM);
  await tab.evaluateOnNewDocument(TOURNAMENT_SHIM);
  tab.on('pageerror', e => log('    [pageerror]', e.message.slice(0, 160)));

  const url = `${BASE}/${HARNESS_HTML}?route=${encodeURIComponent(scene.route)}`;

  /* Reload until the page has drawn. Several agents share this dev server and
     any of them saving a file mid-load makes Vite serve a 500 for one module,
     which leaves an empty root and a picture of nothing. */
  let drawn = false;
  for (let attempt = 1; attempt <= 4 && !drawn; attempt += 1) {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let waited = 0; waited < 25000; waited += 500) {
      await sleep(500);
      try {
        const state = await tab.evaluate(() => ({
          text: document.body.innerText,
          skeletons: document.querySelectorAll('.animate-pulse').length,
        }));
        const settled = state.skeletons === 0 || waited >= 15000;
        if (state.text.includes(scene.ready) && settled && waited >= 2500) {
          drawn = true;
          break;
        }
      } catch {
        /* Vite reloaded under the evaluate. Look again. */
      }
    }
    if (!drawn) log(`    nothing drawn on attempt ${attempt}, reloading`);
  }

  if (!drawn) {
    log(`    [${scene.key} ${width}] page never drew; not writing an image`);
    await tab.close();
    return false;
  }

  for (const label of scene.press ?? []) {
    const pressed = await tab.evaluate(name => {
      const button = [...document.querySelectorAll('button')].find(b =>
        (b.textContent ?? '').trim().startsWith(name)
      );
      if (!button) return false;
      button.click();
      return true;
    }, label);
    if (!pressed) {
      log(`    [${scene.key} ${width}] no "${label}" control; not writing an image`);
      await tab.close();
      return false;
    }
    await sleep(1200);
  }

  /* Images arrive a beat after the text, and `CardImage` fades its blur-up
     placeholder out. Waiting on decode rather than on a guess. */
  try {
    await tab.evaluate(async () => {
      const images = [...document.images].filter(i => !i.complete);
      await Promise.all(images.map(i => i.decode().catch(() => {})));
    });
  } catch {
    /* reloaded mid-wait; the settle below still covers it */
  }
  await sleep(scene.settle ?? 1800);

  const file = `${OUT}/${scene.key}-${width}.webp`;
  await tab.screenshot({ path: file, type: 'webp', quality: QUALITY, fullPage: false });
  const bytes = fs.statSync(file).size;
  log(`    wrote ${file}  ${width}x${height}  ${(bytes / 1024).toFixed(0)} KB`);
  written.push({ scene: scene.key, width, height, bytes, file: `/screens/${scene.key}-${width}.webp` });

  await tab.close();
  return true;
}

for (const scene of SCENES) {
  if (ONLY && !ONLY.split(',').includes(scene.key)) continue;
  log(`\n${scene.key}`);
  for (const width of WIDTHS) await capture(scene, width);
}

await browser.close();

/* ---------------------------------------------------------------- manifest */

const manifest = {
  generatedAt: new Date().toISOString(),
  note:
    'Screenshots of the real running app, captured by scripts/capture-app-screens.mjs. ' +
    'Card rows and card images are read from the live database; ownership and the ' +
    'tournament events are fixture, because no anonymous request may be shown a real ' +
    "person's collection and because events live in the organiser's own browser.",
  screens: SCENES.filter(scene => written.some(w => w.scene === scene.key)).map(scene => ({
    key: scene.key,
    caption: scene.caption,
    sources: written
      .filter(w => w.scene === scene.key)
      .sort((a, b) => a.width - b.width)
      .map(({ width, height, file }) => ({ width, height, src: file })),
  })),
};

fs.writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
log(`\nwrote ${OUT}/manifest.json  (${manifest.screens.length} screens, ${written.length} files)`);

const missing = SCENES.filter(s => !manifest.screens.some(m => m.key === s.key)).map(s => s.key);
if (missing.length > 0) log(`NOT captured: ${missing.join(', ')}`);

process.exit(0);
