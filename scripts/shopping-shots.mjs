/**
 * Photograph the shopping list, the proxy list and the arriving strip.
 *
 *   npm run dev            # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/shopping-shots.mjs
 *
 * Card art and every price come from the LIVE `cards` table through the app's
 * own Supabase client; only the list rows themselves are supplied by
 * `scripts/shopping-shim.js`, because photographing a per user table otherwise
 * needs somebody's password. The lifecycle those rows describe was separately
 * exercised for real against the live database through the RPCs.
 *
 * The run FAILS if "$0.00", "€0.00" or "0.00 tix" reaches any page. Craterhoof
 * Behemoth `cmm` is deliberately on the list and has NO usd and NO eur price at
 * all, so that check is doing real work rather than passing by luck.
 *
 * Written rather than committed, like the other harnesses: the two files it
 * emits are gitignored and Vite's build input is `index.html` alone.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/shopping';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'shopping-harness.html';
const HARNESS_ENTRY = 'src/dev/__shoppingHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Shopping harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the shopping and proxy lists. Written by
 * scripts/shopping-shots.mjs. Not shipped, not routed, not built.
 *
 * The app shell is real: the same TopNavigation that carries the cart and the
 * same LeftNavigation that carries the two new entries. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { TopNavigation } from '../components/navigation/TopNavigation';
import { LeftNavigation } from '../components/navigation/LeftNavigation';

import ShoppingList from '../pages/Buylist';
import ProxyList from '../pages/ProxyList';
import Collection from '../pages/Collection';
import { MarketplaceShoppingLead } from '../components/shopping';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const params = new URLSearchParams(location.search);
const page = params.get('page') || 'shopping';

const ROUTES: Record<string, { path: string; entry: string; element: JSX.Element }> = {
  shopping: { path: '/shopping', entry: '/shopping', element: <ShoppingList /> },
  coming: { path: '/shopping', entry: '/shopping', element: <ShoppingList /> },
  proxies: { path: '/proxies', entry: '/proxies', element: <ProxyList /> },
  collection: { path: '/collection', entry: '/collection', element: <Collection /> },
  marketplace: {
    path: '/marketplace',
    entry: '/marketplace',
    element: (
      <div className="p-6">
        <MarketplaceShoppingLead />
      </div>
    ),
  },
};

const route = ROUTES[page] ?? ROUTES.shopping;

function Shell() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed left-0 right-0 top-0 z-50">
        <TopNavigation />
      </div>
      <div className="flex pt-16">
        <div className="fixed bottom-0 left-0 top-16 z-40 hidden md:block">
          <LeftNavigation />
        </div>
        <main className="min-h-[calc(100vh-4rem)] w-full flex-1 md:ml-[var(--nav-rail-w)]">
          <Routes>
            <Route path={route.path} element={route.element} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route.entry]}>
            <Shell />
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`
);

const SHIM = fs.readFileSync(
  path.join(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
    'shopping-shim.js'
  ),
  'utf8'
);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  // Subpixel antialiasing puts coloured fringes on thin type over charcoal and
  // reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

let failures = 0;

/**
 * Capture one page.
 *
 * `requireText` retries the whole capture until the page actually contains the
 * thing it is supposed to be photographing. The live PostgREST returns 503
 * PGRST002 for a minute at a time whenever anyone applies DDL, and a screenshot
 * taken during one of those windows is a picture of a loading skeleton being
 * passed off as a feature.
 */
async function capture(page, name, { wait = 7000, click = null, height = 1500, fullPage = true, requireText = null, tries = 1 } = {}) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1680, height, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
  tab.on('console', m => {
    if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
  });

  await tab.goto(`${BASE}/${HARNESS_HTML}?page=${page}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await sleep(wait);

  if (click) {
    const found = await tab.evaluate(label => {
      const el = [...document.querySelectorAll('button')].find(b =>
        b.textContent?.trim().startsWith(label)
      );
      if (el) el.click();
      return Boolean(el);
    }, click);
    if (!found) log(`  [warn] no button starting "${click}"`);
    await sleep(2500);
  }

  const text0 = await tab.evaluate(() => document.body.innerText);
  if (requireText && !text0.includes(requireText) && tries < 6) {
    log(`  [retry ${tries}] "${requireText}" not on the page yet`);
    await tab.close();
    await sleep(8000);
    return capture(page, name, { wait, click, height, fullPage, requireText, tries: tries + 1 });
  }

  const file = `${OUT}/${name}.png`;
  /* The proxy page renders whole print sheets of 745px card art, and a
     fullPage capture of that can outrun the CDP timeout. Those pages take a
     tall viewport instead. */
  await tab.screenshot({ path: file, fullPage });

  const text = await tab.evaluate(() => document.body.innerText);
  const zeros = (text.match(/[$€]0\.00|0\.00 tix/g) || []).length;
  const dashes = (text.match(/—/g) || []).length;
  if (zeros > 0) {
    failures += 1;
    log(`  FAIL  a price we do not have was rendered as zero, x${zeros}`);
  }
  if (dashes > 0) log(`  [warn] em-dash in user-facing copy x${dashes}`);
  log(`  shot -> ${file}   zeros=${zeros}  em-dashes=${dashes}`);
  fs.writeFileSync(`${OUT}/${name}.txt`, text);

  await tab.close();
}

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const WANT = new Set(only.length ? only : ['shopping', 'coming', 'proxies', 'collection', 'marketplace']);

if (WANT.has('shopping'))
  await capture('shopping', 'shopping-to-buy', { wait: 9000, requireText: 'copies in total' });
if (WANT.has('coming'))
  await capture('shopping', 'shopping-on-the-way', { wait: 9000, click: 'On the way', requireText: 'IN YOUR HANDS' });
if (WANT.has('proxies'))
  await capture('proxies', 'proxy-list', { wait: 14000, height: 2600, fullPage: false, requireText: 'cards to print' });
if (WANT.has('collection'))
  await capture('collection', 'collection-arriving', { wait: 18000, requireText: 'on the way' });
if (WANT.has('marketplace'))
  await capture('marketplace', 'marketplace-lead', { wait: 18000, requireText: 'TCGPLAYER' });

log(failures === 0 ? '\nPASS: no fabricated zero reached any page.' : `\nFAILED on ${failures} page(s).`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
