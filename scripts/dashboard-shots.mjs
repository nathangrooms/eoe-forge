/**
 * Photograph the dashboard at the two sizes the owner reviews at.
 *
 * Technique is the one in scripts/play-combat-shots.mjs: a dev-only entry that
 * mounts the REAL page with the providers App.tsx gives it and without the auth
 * gate. Data comes from scripts/dashboard-shim.js — read its header for exactly
 * which parts of what you see are real. No credentials are entered anywhere.
 *
 *   node scripts/dashboard-shots.mjs            # both sizes, populated + empty
 *   TAG=after node scripts/dashboard-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/dashboard';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const TAG = process.env.TAG || 'before';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'dashboard-harness.html';
const HARNESS_ENTRY = 'src/dev/__dashboardHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Dashboard harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the dashboard. Written by
 * scripts/dashboard-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import Dashboard from '../pages/Dashboard';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
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

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SHIM = fs.readFileSync(path.join(here, 'dashboard-shim.js'), 'utf8');

/* -------------------------------------------------------------- card rows */

/**
 * The real `cards` rows the fixture is built from, read once and kept.
 *
 * They used to be fetched from inside the browser on every page load. That made
 * every screenshot depend on the database answering within its eight second
 * statement timeout, and this is a shared free-tier instance: a long running job
 * in another session was enough to 500 a single-row lookup by primary key and
 * blank the page. Read here, cached to disk, injected before the shim.
 */
const CACHE = `${OUT}/cards.json`;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const COLUMNS =
  'id,name,set_code,collector_number,type_line,mana_cost,color_identity,' +
  'rarity,layout,image_uris,faces,prices,is_legendary,oracle_text';

/** Every printing id the shim names, taken from the shim itself so they cannot drift. */
const CARD_IDS = [
  ...new Set(
    (SHIM.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [])
      .map(quoted => quoted.slice(1, -1))
      // The fixture's own deck and user ids are not cards.
      .filter(id => !id.startsWith('dddddddd') && !id.startsWith('00000000'))
  ),
];

async function loadCardRows() {
  const found = new Map();
  if (fs.existsSync(CACHE)) {
    for (const row of JSON.parse(fs.readFileSync(CACHE, 'utf8'))) found.set(row.id, row);
    if (found.size >= CARD_IDS.length) {
      log(`  card rows: ${found.size} from ${CACHE}`);
      return [...found.values()];
    }
    log(`  card rows: ${found.size} cached, fetching the missing ${CARD_IDS.length - found.size}`);
  }

  // One id at a time, so a slow database costs a missing card rather than the run.
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
      } catch (error) {
        await sleep(1200 * (attempt + 1));
      }
    }
  }

  const rows = [...found.values()];
  log(`  card rows: ${rows.length} of ${CARD_IDS.length} read from the database`);
  if (rows.length > 0) fs.writeFileSync(CACHE, JSON.stringify(rows));
  return rows;
}

const CARD_ROWS = await loadCardRows();

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  // Subpixel antialiasing draws coloured fringes on thin type over charcoal and
  // reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const SIZES = [
  ['1680x1050', 1680, 1050],
  ['1280x720', 1280, 720],
];

async function capture(label, { width, height, state, fullPage }) {
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(`window.__dmCards = ${JSON.stringify(CARD_ROWS)};`);
  await tab.evaluateOnNewDocument(SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
  tab.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('[shim-select]')) {
      log('  [console]', m.text().slice(0, 200));
    }
  });

  const url = `${BASE}/${HARNESS_HTML}${state ? `?state=${state}` : ''}`;

  /*
   * Reload until the page has actually drawn.
   *
   * Several agents share this dev server and any of them saving a file mid-load
   * makes Vite serve a 500 for one module, which leaves an empty <div id="root">
   * and a screenshot of nothing. The page is considered ready when the sections
   * have rendered their headings and no rail is still showing a skeleton.
   */
  let text = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let waited = 0; waited < 20000; waited += 500) {
      await sleep(500);
      /* Vite reloads the page whenever any agent saves any file in this repo,
         which destroys the execution context under an in-flight evaluate. That
         is a reason to look again, not a reason to stop. */
      let drawn;
      try {
        drawn = await tab.evaluate(() => ({
          text: document.body.innerText,
          skeletons: document.querySelectorAll('.animate-pulse').length,
        }));
      } catch {
        continue;
      }
      /* Skeletons gone is the ideal, but one slow query should not cost the
         shot, so after twelve seconds a drawn page counts as drawn. */
      const settled = drawn.skeletons === 0 || waited >= 12000;
      if (drawn.text.includes('Welcome back') && settled && waited >= 4000) {
        text = drawn.text;
        break;
      }
    }
    if (text) break;
    log(`  [${label}] nothing drawn on attempt ${attempt}, reloading`);
  }

  // Images finish arriving a beat after the text does.
  await sleep(2500);

  const file = `${OUT}/${TAG}-${label}.png`;
  await tab.screenshot({ path: file, fullPage });
  log('  shot ->', file);

  try {
    text = await tab.evaluate(() => document.body.innerText);
  } catch {
    /* Reloaded between the shot and the read. The shot is what matters. */
  }
  fs.writeFileSync(`${OUT}/${TAG}-${label}.txt`, text);

  /* Two things this project keeps regressing on, checked on every run. */
  const emDashes = (text.match(/—/g) || []).length;
  const zeros = (text.match(/\$0\.00/g) || []).length;
  log(`  [${label}] em-dash x${emDashes}   $0.00 x${zeros}   ${text.length} chars of copy`);

  await tab.close();
}

for (const [label, w, h] of SIZES) {
  await capture(`${label}-fold`, { width: w, height: h, fullPage: false });
  await capture(`${label}-full`, { width: w, height: h, fullPage: true });
}
await capture('1680x1050-empty', { width: 1680, height: 1050, state: 'empty', fullPage: true });

await browser.close();
process.exit(0);
