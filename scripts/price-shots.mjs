/**
 * Photograph every surface that shows a card price, with real price data.
 *
 * Why this exists: the owner reports "almost all cards have 0 price data" while
 * the database says 33,078 of 34,088 rows carry a USD price. Something between
 * the two loses it, and the only way to know which screen is lying is to make
 * the screen draw.
 *
 * Technique is the one in scripts/play-combat-shots.mjs — a dev-only entry that
 * mounts the REAL pages with the app's providers and without the auth gate —
 * plus one addition it needed: the owned-card surfaces (collection, wishlist,
 * storage, dashboard, deck) read tables whose RLS is scoped to `auth.uid()`, so
 * a signed-out run sees nothing at all. Rather than sign in (never), the run
 * installs a PostgREST shim in front of `fetch`:
 *
 *   - `cards`, `cards_unique` and anything else world-readable go STRAIGHT
 *     THROUGH to the real database. Every price on screen is a real price.
 *   - user-scoped tables are answered from rows built here out of real card ids.
 *
 * The shim honours `select=` exactly, INCLUDING embedded resources like
 * `cards(prices)`. That is deliberate: a surface that forgets to ask for
 * `prices` gets a row without `prices`, exactly as PostgREST would serve it, so
 * the "column missing from the select list" bug reproduces instead of hiding.
 * Every select list the app sends is logged, which is the cheapest possible
 * audit of who asks for what.
 *
 * No credentials are entered anywhere. The session handed to AuthProvider is a
 * local fake and never leaves the browser.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/price';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const TAG = process.env.TAG || 'before';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'price-harness.html';
const HARNESS_ENTRY = 'src/dev/__priceHarness.tsx';

/* ---------------------------------------------------------------- harness */

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(HARNESS_HTML, `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Price harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`);

fs.writeFileSync(HARNESS_ENTRY, `/* Gitignored puppeteer harness for price surfaces. Written by
 * scripts/price-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';

import Collection from '../pages/Collection';
import Dashboard from '../pages/Dashboard';
import Wishlist from '../pages/Wishlist';
import DeckInterface from '../pages/DeckInterface';
import CardDetail from '../pages/CardDetail';
import Marketplace from '../pages/Marketplace';
import Precons from '../pages/Precons';
import Cards from '../pages/Cards';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const params = new URLSearchParams(location.search);
const page = params.get('page') || 'collection';
const arg = params.get('arg') || '';

const ROUTES: Record<string, { path: string; entry: string; element: JSX.Element }> = {
  collection:  { path: '/collection', entry: '/collection', element: <Collection /> },
  storage:     { path: '/collection/storage', entry: '/collection/storage', element: <Collection /> },
  analytics:   { path: '/collection', entry: '/collection?tab=analytics', element: <Collection /> },
  dashboard:   { path: '/dashboard', entry: '/dashboard', element: <Dashboard /> },
  wishlist:    { path: '/wishlist', entry: '/wishlist', element: <Wishlist /> },
  deck:        { path: '/deck/:id', entry: '/deck/' + arg, element: <DeckInterface /> },
  card:        { path: '/cards/:id', entry: '/cards/' + arg, element: <CardDetail /> },
  marketplace: { path: '/marketplace', entry: '/marketplace', element: <Marketplace /> },
  precons:     { path: '/precons', entry: '/precons', element: <Precons /> },
  cards:       { path: '/cards', entry: '/cards', element: <Cards /> },
};

const route = ROUTES[page] ?? ROUTES.collection;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route.entry]}>
            <Routes>
              <Route path={route.path} element={route.element} />
            </Routes>
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`);

/* ------------------------------------------------------------------- shim */

const SHIM = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'price-shim.js'),
  'utf8'
);

/* ------------------------------------------------------------------- run */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const selectLog = new Map();

async function capture(page, name, { wait = 7000, arg = '', openTabs = [] } = {}) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1680, height: 1400, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
  tab.on('console', m => {
    const t = m.text();
    if (t.startsWith('[shim-select]')) {
      const line = t.slice('[shim-select]'.length).trim();
      if (!selectLog.has(name)) selectLog.set(name, new Set());
      selectLog.get(name).add(line);
    } else if (m.type() === 'error') {
      log('  [console]', t.slice(0, 200));
    }
  });

  const url = `${BASE}/${HARNESS_HTML}?page=${page}${arg ? `&arg=${encodeURIComponent(arg)}` : ''}`;
  await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(wait);

  /* Some price surfaces are behind a tab that is not the default one. The
     marketplace opens on Price Search, and the listings live two tabs in. */
  for (const label of openTabs) {
    /* A real mouse click, not `el.click()`. Radix activates a tab on
       mousedown, so a synthetic click event alone leaves the tab unchanged and
       the shot silently shows the wrong panel. */
    let clicked = false;
    for (const handle of await tab.$$('[role="tab"]')) {
      const text = await handle.evaluate(el => el.textContent || '');
      if (!text.toLowerCase().includes(label.toLowerCase())) continue;
      await handle.click();
      clicked = true;
      break;
    }
    log(`  tab "${label}" ->`, clicked ? 'opened' : 'NOT FOUND');
    await sleep(3000);
  }

  const file = `${OUT}/${TAG}-${name}.png`;
  await tab.screenshot({ path: file, fullPage: true });
  log('  shot ->', file);

  const text = await tab.evaluate(() => document.body.innerText);
  const zeros = (text.match(/\$0\.00/g) || []).length;
  const dashes = (text.match(/(?<![\d.])—(?![\d.])/g) || []).length;
  log(`  [${name}] $0.00 x${zeros}   em-dash x${dashes}`);
  fs.writeFileSync(`${OUT}/${TAG}-${name}.txt`, text);

  await tab.close();
  return { zeros, text };
}

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const WANT = new Set(only.length ? only : [
  'collection', 'analytics', 'storage', 'dashboard', 'wishlist', 'deck', 'card', 'marketplace', 'listings', 'precons',
]);

const DECK_ID = process.env.DECK_ID || '';
const CARD_ID = process.env.CARD_ID || '8698c46b-2628-4482-88f9-e37a01ade274';

if (WANT.has('collection')) await capture('collection', 'collection');
if (WANT.has('analytics')) await capture('analytics', 'analytics', { wait: 16000 });
if (WANT.has('storage')) await capture('storage', 'storage');
if (WANT.has('dashboard')) await capture('dashboard', 'dashboard');
if (WANT.has('wishlist')) await capture('wishlist', 'wishlist');
if (WANT.has('card')) await capture('card', 'card', { arg: CARD_ID, wait: 9000 });
if (WANT.has('deck') && DECK_ID) await capture('deck', 'deck', { arg: DECK_ID, wait: 10000 });
if (WANT.has('marketplace')) await capture('marketplace', 'marketplace');
/* The seller's own tiles: an asking price beside every price we hold for that
   exact printing. Two tabs in, so it needs the clicks. */
if (WANT.has('listings')) await capture('marketplace', 'listings', { openTabs: ['My Listings'], wait: 8000 });
if (WANT.has('sold')) await capture('marketplace', 'sold', { openTabs: ['My Listings', 'Sold'], wait: 8000 });
if (WANT.has('precons')) await capture('precons', 'precons', { wait: 12000 });

log('\n=== select lists sent per surface ===');
for (const [name, lines] of selectLog) {
  log(`\n-- ${name}`);
  for (const line of [...lines].sort()) log('   ', line);
}

await browser.close();
