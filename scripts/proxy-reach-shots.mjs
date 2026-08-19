/**
 * Photograph the ways into the proxy list.
 *
 *   npm run dev            # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/proxy-reach-shots.mjs
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, SO NOTHING IS CLAIMED THAT WAS NOT SEEN
 * -------------------------------------------------------------------------
 * REAL: every card id, card name, set code and piece of art on screen is
 * fetched live from the `cards` catalogue through the anon key, exactly as the
 * app fetches it. Every component and every string of copy is the shipped one.
 *
 * NOT REAL: that a signed-in player owns these lists. `card_list_items`,
 * `wishlist` and the deck tables are granted to `authenticated` only and a
 * screenshot run holds no password, so the shim answers those four reads with
 * rows built out of REAL catalogue cards. The writes (`card_list_add_many`)
 * answer with a count rather than touching the database. So what this run
 * verifies is the SHAPE and the WORDS of the screens, not the database verbs,
 * which are verified by their own migrations and by the test suite.
 *
 * The run FAILS on an em-dash in user-facing copy, which the copy rules forbid.
 *
 * The harness files are written per run and gitignored, like every other one.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/proxy-reach';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'proxy-reach-harness.html';
const HARNESS_ENTRY = 'src/dev/__proxyReachHarness.tsx';

/**
 * Written only when the content actually differs.
 *
 * Rewriting an identical file still moves its mtime, and Vite answers a change
 * under `src/` by broadcasting a full page reload. That reload lands seconds
 * later on Windows, in the middle of the run, and the page it destroys is
 * whichever one the script happened to be reading. Half a morning of flaky
 * failures came from that and nothing else.
 */
const writeIfChanged = (file, body) => {
  let current = null;
  try { current = fs.readFileSync(file, 'utf8'); } catch {}
  if (current === body) return;
  fs.writeFileSync(file, body);
  log(`  wrote ${file}`);
};

fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Reaching the proxy list harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

writeIfChanged(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for reaching the proxy list. Written by
 * scripts/proxy-reach-shots.mjs. Not shipped, not routed, not built. */
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
import ProxyList from '../pages/ProxyList';
import Buylist from '../pages/Buylist';
import Wishlist from '../pages/Wishlist';
import CardDetail from '../pages/CardDetail';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(location.search).get('at') || '/proxies';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[start]}>
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
                    <Route path="/proxies" element={<ProxyList />} />
                    <Route path="/shopping" element={<Buylist />} />
                    <Route path="/wishlist" element={<Wishlist />} />
                    <Route path="/cards/:id" element={<CardDetail />} />
                  </Routes>
                </main>
              </div>
            </div>
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`
);

/* ------------------------------------------------------------------ shim */

/* The cards each shimmed list holds. Names only: every id, price and image is
   looked up live so nothing on screen is invented. */
const SHOPPING = [
  'Rhystic Study',
  'Cyclonic Rift',
  'Smothering Tithe',
  'Dockside Extortionist',
  'Mana Crypt',
  'Demonic Tutor',
  'Force of Will',
  'Mystic Remora',
];
const WISHLIST = [
  'Sol Ring',
  'Arcane Signet',
  'Command Tower',
  'Swords to Plowshares',
  'Counterspell',
  'Lightning Bolt',
];
const ON_PROXY_LIST = ['Atraxa, Praetors\' Voice', 'Sol Ring', 'Lightning Bolt', 'Counterspell'];

const SHIM = `(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON = '${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'}';
  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const SHOPPING = ${JSON.stringify(SHOPPING)};
  const WISHLIST = ${JSON.stringify(WISHLIST)};
  const ON_PROXY_LIST = ${JSON.stringify(ON_PROXY_LIST)};
  const PROXIES_EMPTY = new URLSearchParams(location.search).get('proxies') !== 'full';

  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'harness-not-a-real-token', token_type: 'bearer',
    expires_in: 3600, expires_at: now + 3600, refresh_token: 'harness-refresh',
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated',
      email: 'harness@localhost', app_metadata: { provider: 'email' },
      user_metadata: { username: 'Harness' }, created_at: new Date(0).toISOString() },
  };
  try { localStorage.setItem('sb-udnaflcohfyljrsgqggy-auth-token', JSON.stringify(session)); } catch {}

  const realFetch = window.fetch.bind(window);
  const auth = { apikey: ANON, Authorization: 'Bearer ' + ANON };
  const COLUMNS = 'id,oracle_id,name,set_code,set_name,collector_number,type_line,rarity,mana_cost,cmc,colors,color_identity,layout,image_uris,prices,finishes,faces';
  const quote = v => '"' + String(v).replace(/"/g, '\\\\"') + '"';

  /* One request for every name the harness needs, against the real catalogue,
     so every id and every piece of art on screen is a real card. */
  let catalogue = null;
  async function lookUp() {
    if (catalogue) return catalogue;
    const names = [...new Set([...SHOPPING, ...WISHLIST, ...ON_PROXY_LIST])];
    const url = URL_BASE + '/rest/v1/cards_unique?select=' + COLUMNS +
      '&name=in.(' + names.map(quote).join(',') + ')';
    const res = await realFetch(url, { headers: auth });
    const rows = res.ok ? await res.json() : [];
    catalogue = new Map(rows.map(r => [String(r.name).toLowerCase(), r]));
    return catalogue;
  }

  const stamp = new Date('2026-08-20T09:00:00Z').toISOString();

  async function listRows(kind) {
    if (kind === 'proxy' && PROXIES_EMPTY) return [];
    const cat = await lookUp();
    const names = kind === 'proxy' ? ON_PROXY_LIST : SHOPPING;
    return names.map((name, i) => {
      const card = cat.get(name.toLowerCase());
      if (!card) return null;
      return {
        id: 'item-' + kind + '-' + i,
        list_id: 'list-' + kind,
        user_id: USER_ID,
        kind,
        card_id: card.id,
        oracle_id: card.oracle_id,
        card_name: card.name,
        finish: 'nonfoil',
        quantity: i === 1 ? 2 : 1,
        note: null,
        source: 'manual',
        source_deck_id: null,
        status: 'want',
        paid_unit: null, paid_currency: null,
        bought_at: null, arrived_at: null, filed_at: null,
        arrived_card_id: null, arrived_finish: null,
        filed_container_id: null, filed_deck_id: null,
        created_at: stamp, updated_at: stamp,
      };
    }).filter(Boolean);
  }

  async function wishlistRows() {
    const cat = await lookUp();
    return WISHLIST.map((name, i) => {
      const card = cat.get(name.toLowerCase());
      if (!card) return null;
      return {
        id: 'wish-' + i,
        user_id: USER_ID,
        card_id: card.id,
        card_name: card.name,
        quantity: i === 0 ? 2 : 1,
        priority: 'medium',
        created_at: stamp,
      };
    }).filter(Boolean);
  }

  const json = body => new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      return json(url.includes('/user') ? session.user : session);
    }

    /* Every write is recorded rather than performed, so the run can check WHAT
       the interface asked for without a password or a row in the database. */
    window.__adds = window.__adds || [];
    if (url.includes('/rest/v1/rpc/card_list_add_many')) {
      window.__adds.push(JSON.parse(opts.body || '{}'));
      return json(12);
    }
    if (url.includes('/rest/v1/rpc/card_list_add')) {
      window.__adds.push(JSON.parse(opts.body || '{}'));
      return json({ id: 'new-row', quantity: 1 });
    }
    if (url.includes('/rest/v1/rpc/')) return json(0);

    const m = url.match(/\\/rest\\/v1\\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];

    if (table === 'cards' || table === 'cards_unique') {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', 'Bearer ' + ANON);
      let res = await realFetch(url, { ...opts, headers });
      for (let n = 0; n < 20 && res.status === 503; n++) {
        await new Promise(r => setTimeout(r, 2000));
        res = await realFetch(url, { ...opts, headers });
      }
      return res;
    }

    if (table === 'card_list_items') {
      const kind = /kind=eq\\.(\\w+)/.exec(url);
      return json(await listRows(kind ? kind[1] : 'shopping'));
    }
    if (table === 'wishlist') return json(await wishlistRows());

    /* Decks, collection and storage answer empty: this harness is about the
       proxy route, and an empty collection is a real state a player is in. */
    return json([]);
  };
})();`;

/* Let any watcher notice the harness files, if they changed, before the first
   page connects to the dev server. */
await sleep(3000);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

let failures = 0;
const fail = message => {
  failures += 1;
  log(`  FAIL  ${message}`);
};

/* The populated proxy page draws the whole printable sheet, which can run to
   many metres of page. `fullPage` on that is a screenshot the renderer refuses
   to finish, so tall pages are shot at the viewport instead. */
async function shoot(tab, name, { fullPage = true, dashCheck = true } = {}) {
  const file = `${OUT}/${name}.png`;
  // Read the words first. A full page screenshot is the slow part, and reading
  // after it is what makes a reload land between the two.
  const text = await tab.evaluate(() => document.body.innerText);
  await tab.screenshot({ path: file, fullPage });
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  const dashes = (text.match(/—/g) || []).length;
  if (dashCheck && dashes > 0) fail(`em-dash in user-facing copy x${dashes} on ${name}`);
  log(`  shot -> ${file}  em-dashes=${dashes}${dashCheck ? '' : ' (not gated, see below)'}`);
  return text;
}

/**
 * The text of the card page's action column.
 *
 * The card page cannot be gated on em-dashes as a whole, because most of what
 * it prints is Scryfall's own words: `Artifact — Equipment` type lines, flavour
 * attributions like `—Tony Stark`, and the legality grid's `—` for a format a
 * card was never printed into. None of that is our copy and none of it is ours
 * to rewrite. So the gate is put around the part this change owns.
 */
const actionRowText = tab =>
  tab.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      x => (x.textContent || '').trim() === 'Add to collection'
    );
    const column = button?.closest('div')?.parentElement;
    return column ? column.innerText : '';
  });

async function open(at, { proxies = 'empty' } = {}) {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1680, height: 1400, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
  tab.on('console', m => {
    if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
  });
  await tab.goto(
    `${BASE}/${HARNESS_HTML}?at=${encodeURIComponent(at)}&proxies=${proxies}`,
    { waitUntil: 'domcontentloaded', timeout: 90000 }
  );
  return tab;
}

const clickByText = async (tab, text) => {
  const hit = await tab.evaluate(want => {
    const b = [...document.querySelectorAll('button, a')].find(x =>
      (x.textContent || '').replace(/\s+/g, ' ').trim().includes(want)
    );
    if (b) b.click();
    return Boolean(b);
  }, text);
  if (!hit) log(`  [click] nothing reads "${text}"`);
  return hit;
};

const dialogs = tab => tab.evaluate(() => document.querySelectorAll('[role="dialog"]').length);

/* These pages fetch four lists and then price them, and how long that takes
   depends on the database rather than on the code, so waiting a fixed number of
   seconds makes the run flaky. Wait for the thing being checked instead. */
async function waitForText(tab, want, seconds = 30) {
  for (let i = 0; i < seconds * 2; i++) {
    const there = await tab.evaluate(w => document.body.innerText.includes(w), want);
    if (there) return true;
    await sleep(500);
  }
  return false;
}

/* ---------------------------------------------------- 1. the proxy page */

log('\n/proxies, nothing on the list yet');
let tab = await open('/proxies');
if (!(await waitForText(tab, 'Paste a list'))) fail('the proxy page never rendered');
await sleep(2500);
let text = await shoot(tab, '1-proxies-empty');
for (const must of ['Paste a list', 'shopping list', 'wishlist', 'playtesting']) {
  if (!text.toLowerCase().includes(must.toLowerCase())) {
    fail(`the empty proxy page never says "${must}"`);
  }
}
if (text.includes('from any card page or search result')) {
  fail('the empty state still advertises a control that does not exist');
}

log('\nbringing the shopping list over');
if (!(await clickByText(tab, 'Your shopping list,'))) fail('no bring-in button for the shopping list');
if (!(await waitForText(tab, 'to the proxy list'))) fail('the convert panel never opened');
await sleep(1500);
log(`  panels open: ${await dialogs(tab)}`);
text = await shoot(tab, '2-bring-the-shopping-list-over');
if (!/Add \d+ to the proxy list/.test(text)) {
  fail('the panel never states how many cards will be added');
}
if (!/not legal at any event/i.test(text)) fail('the convert panel does not say these are for playtesting');
await tab.close();

/* ------------------------------------------- 2. the proxy page, populated */

log('\n/proxies with cards on it');
tab = await open('/proxies', { proxies: 'full' });
if (!(await waitForText(tab, 'Empty the list'))) fail('the populated proxy page never rendered');
await sleep(3000);
text = await shoot(tab, '3-proxies-populated', { fullPage: false });
if (!text.includes('Remove')) fail('taking a card off the list is not a named control');
if (!text.includes('Empty the list')) fail('there is no way to clear the whole list');

log('\nasking to empty it');
if (!(await clickByText(tab, 'Empty the list'))) fail('the empty control did not click');
if (!(await waitForText(tab, 'Yes, empty it'))) fail('the confirmation never appeared');
await sleep(500);
text = await shoot(tab, '4-empty-the-list-confirm', { fullPage: false });
if (!/Take all \d+ cards? off the list\?/.test(text)) {
  fail('the confirmation does not say how many cards go');
}
await tab.close();

/* ------------------------------------------------------ 3. the card page */

log('\na card page');
tab = await open('/cards/Sol Ring');
if (!(await waitForText(tab, 'Proxy list'))) fail('the card page never rendered');
await sleep(3000);
await shoot(tab, '5-card-page-action-row', { dashCheck: false });
const row = await actionRowText(tab);
fs.writeFileSync(`${OUT}/5-card-page-action-row.row.txt`, row);
log(`  action row: ${JSON.stringify(row.replace(/\n+/g, ' | '))}`);
for (const must of ['Add to collection', 'Add to deck', 'Wishlist', 'Proxy list']) {
  if (!row.includes(must)) fail(`the card page action row is missing "${must}"`);
}
if (row.includes('—')) fail('em-dash in the card page action row');

/*
 * The claim worth proving: the proxy action follows the printing on screen.
 *
 * Two different printings are picked out of the page's own art-variants row,
 * and after each one the card id the interface actually asked to put on the
 * proxy list is compared against the printing the page is showing. A proxy is a
 * decision about art, so a button that quietly sends a different printing is
 * the whole feature failing quietly.
 */
const pickPrintingThenProxy = async index => {
  const chosen = await tab.evaluate(i => {
    // `PrintingPicker` stamps each tile with the printing it stands for, and
    // the click handler sits on the art itself.
    const tile = [...document.querySelectorAll('[data-printing]')][i];
    if (!tile) return null;
    (tile.querySelector('img') || tile).click();
    return tile.getAttribute('data-printing');
  }, index);
  if (!chosen) return null;
  await sleep(2500);
  const onScreen = await tab.evaluate(() => location.pathname.split('/').pop());
  await tab.evaluate(() => {
    window.__adds = [];
    const b = [...document.querySelectorAll('button')].find(
      x => (x.textContent || '').trim().startsWith('Proxy list')
    );
    if (b) b.click();
  });
  await sleep(2500);
  const asked = await tab.evaluate(() => (window.__adds || []).map(a => a.p_card_id));
  return { tile: chosen, onScreen, asked };
};

for (const index of [2, 5]) {
  const result = await pickPrintingThenProxy(index);
  if (!result) {
    fail('the card page has no art-variants shelf to pick a printing from');
    break;
  }
  log(
    `  printing ${index}: clicked ${result.tile}, page shows ${result.onScreen}, ` +
      `asked for ${JSON.stringify(result.asked)}`
  );
  if (result.tile !== result.onScreen) {
    fail(`clicking a printing did not move the page onto it (${result.tile} vs ${result.onScreen})`);
  }
  if (result.asked.length !== 1) {
    fail(`pressing Proxy list sent ${result.asked.length} requests, expected 1`);
  } else if (result.asked[0] !== result.onScreen) {
    fail(`Proxy list sent ${result.asked[0]} while the page was showing ${result.onScreen}`);
  }
}
await tab.close();

/* -------------------------------------------------------- 4. the wishlist */

log('\nthe wishlist');
tab = await open('/wishlist');
if (!(await waitForText(tab, 'Print as proxies'))) fail('the wishlist never rendered');
await sleep(2500);
text = await shoot(tab, '6-wishlist-header');
if (!text.includes('Print as proxies')) fail('the wishlist cannot be turned into proxies');
if (await clickByText(tab, 'Print as proxies')) {
  if (!(await waitForText(tab, 'to the proxy list'))) fail('the wishlist convert panel never opened');
  await sleep(1500);
  text = await shoot(tab, '7-wishlist-to-proxies');
  if (!/Add \d+ to the proxy list/.test(text)) {
    fail('the wishlist panel never states how many cards will be added');
  }
}
await tab.close();

/* -------------------------------------------------- 5. the shopping list */

log('\nthe shopping list');
tab = await open('/shopping');
if (!(await waitForText(tab, 'Print as proxies'))) fail('the shopping list never rendered');
await sleep(2500);
text = await shoot(tab, '8-shopping-header');
if (!text.includes('Print as proxies')) fail('the shopping list cannot be turned into proxies');
if (await clickByText(tab, 'Print as proxies')) {
  if (!(await waitForText(tab, 'to the proxy list'))) fail('the shopping convert panel never opened');
  await sleep(1500);
  text = await shoot(tab, '9-shopping-to-proxies');
  if (!/Add \d+ to the proxy list/.test(text)) {
    fail('the shopping panel never states how many cards will be added');
  }
}
await tab.close();

log(failures === 0 ? '\nPASS' : `\nFAILED on ${failures} check(s).`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
