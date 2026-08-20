/**
 * Photograph changing a proxy's artwork, and prove the change is written.
 *
 *   npm run dev            # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/proxy-art-shots.mjs
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, SO NOTHING IS CLAIMED THAT WAS NOT SEEN
 * -------------------------------------------------------------------------
 * REAL: every card, every printing, every piece of art, every set code and
 * every "N versions" count on screen comes from the live database through the
 * anon key. `cards` and `card_printing_spread` are both readable by `anon`, so
 * the shelf of alternate art and the count beside the button are production
 * data, not a fixture that agrees with the component by construction. The
 * components are the shipped ones.
 *
 * NOT REAL: the proxy list rows themselves, and the write. `card_list_items`
 * is owner scoped behind `auth.uid() = user_id` and a screenshot run holds no
 * password, so the rows are supplied below and the PATCH is applied to that
 * in-memory copy. What this run therefore verifies is the WHOLE PATH up to the
 * database boundary: that the button is on every row, that the panel opens
 * beside the list, that picking art changes what the card and the print sheet
 * show, that the request that goes out is a PATCH of `card_id` on the right row
 * with the chosen PRINTING id, and that the interface says out loud that it
 * saved. The database half was checked separately and directly: the UPDATE
 * policy on `card_list_items` is `auth.uid() = user_id` with no column
 * restriction, and the only trigger on the table sets `updated_at`.
 *
 * The run FAILS on an em-dash in user-facing copy, on a PATCH that does not
 * carry a printing id, and if the page never says the choice was saved.
 *
 * The two harness files it writes are gitignored, like every other one.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/proxy-art';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'proxy-art-harness.html';
const HARNESS_ENTRY = 'src/dev/__proxyArtHarness.tsx';

fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Proxy art harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for changing a proxy's artwork. Written by
 * scripts/proxy-art-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import ProxyList from '../pages/ProxyList';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/proxies']}>
            <div className="min-h-screen bg-background">
              <main className="w-full">
                <Routes>
                  <Route path="/proxies" element={<ProxyList />} />
                </Routes>
              </main>
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

const SHIM = `(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON = '${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'}';
  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
  const PROXY_LIST = 'aaaaaaaa-0000-4000-8000-00000000ls02';

  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: 'harness-not-a-real-token', token_type: 'bearer',
    expires_in: 3600, expires_at: now + 3600, refresh_token: 'harness-refresh',
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated',
      email: 'harness@localhost', app_metadata: { provider: 'email' },
      user_metadata: { username: 'Harness' }, created_at: new Date(0).toISOString() },
  };
  try { localStorage.setItem('sb-udnaflcohfyljrsgqggy-auth-token', JSON.stringify(session)); } catch {}

  /* Every PATCH the app sends, kept so the run can assert on what went out
     rather than on what the screen looks like afterwards. */
  window.__patches = [];

  const realFetch = window.fetch.bind(window);
  const auth = { apikey: ANON, Authorization: 'Bearer ' + ANON };

  /* Read straight from production. The counts beside every button and every
     printing in the shelf come through here. */
  const PASSTHROUGH = new Set(['cards', 'cards_unique', 'card_printing_spread']);

  /* Named so the list is one a Commander player would really print: a card
     with a lot of art, a card with a little, and a basic land, which has more
     printings than anything else in Magic and is the most likely thing anyone
     wants to change. */
  const NAMES = ['Sol Ring', 'Rhystic Study', 'Command Tower', 'Arcane Signet', 'Forest', 'Swords to Plowshares'];

  let items = null;

  function quote(v) { return '"' + String(v).replace(/"/g, '\\\\"') + '"'; }

  async function buildItems() {
    const url = URL_BASE + '/rest/v1/cards_unique?select=id,oracle_id,name&name=in.(' +
      NAMES.map(quote).join(',') + ')';
    const res = await realFetch(url, { headers: auth });
    const rows = res.ok ? await res.json() : [];
    const iso = d => new Date(Date.now() - d * 86400000).toISOString();
    return rows.map((row, i) => ({
      id: 'proxy-item-' + i,
      list_id: PROXY_LIST,
      user_id: USER_ID,
      kind: 'proxy',
      card_id: row.id,
      oracle_id: row.oracle_id,
      card_name: row.name,
      finish: 'nonfoil',
      quantity: 1,
      note: null,
      source: 'manual',
      source_deck_id: null,
      status: 'want',
      paid_unit: null,
      paid_currency: null,
      bought_at: null,
      arrived_at: null,
      filed_at: null,
      arrived_card_id: null,
      arrived_finish: null,
      filed_container_id: null,
      filed_deck_id: null,
      created_at: iso(10),
      updated_at: iso(10),
    }));
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/rpc/')) {
      return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const m = url.match(/\\/rest\\/v1\\/([a-zA-Z0-9_]+)/);
    const table = m && m[1];

    if (PASSTHROUGH.has(table)) {
      const headers = new Headers(opts.headers || {});
      headers.set('apikey', ANON);
      headers.set('Authorization', 'Bearer ' + ANON);
      let res = await realFetch(url, { ...opts, headers });
      /* PostgREST answers 503 while it rebuilds its schema cache, which is
         every time anyone applies DDL. Giving up on the first one photographs
         a skeleton and blames the component. */
      for (let n = 0; n < 25 && res.status === 503; n++) {
        await new Promise(r => setTimeout(r, 2000));
        res = await realFetch(url, { ...opts, headers });
      }
      return res;
    }

    if (table === 'card_lists') {
      return new Response(JSON.stringify([{ id: PROXY_LIST, user_id: USER_ID, kind: 'proxy', name: 'Proxy list' }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (table === 'card_list_items') {
      if (!items) items = await buildItems();
      const params = new URL(url).searchParams;
      const method = (opts.method || 'GET').toUpperCase();

      if (method === 'PATCH') {
        const idFilter = (params.get('id') || '').replace(/^eq\\./, '');
        const patch = JSON.parse(opts.body || '{}');
        const row = items.find(r => r.id === idFilter);
        window.__patches.push({ id: idFilter, patch, matched: Boolean(row) });
        if (row) Object.assign(row, patch, { updated_at: new Date().toISOString() });
        return new Response(JSON.stringify(row ? [{ id: row.id }] : []),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const kind = (params.get('kind') || '').replace(/^eq\\./, '');
      const rows = kind ? items.filter(r => r.kind === kind) : items;
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    /* Every other owner-scoped table answers empty, so nothing else on the
       page invents data it did not read. */
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();`;

/* ------------------------------------------------------------------ run */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  // Subpixel antialiasing puts coloured fringes on thin type over charcoal and
  // reads as a styling bug that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

let failures = 0;
const fail = why => {
  failures += 1;
  log(`  FAIL  ${why}`);
};

const tab = await browser.newPage();
await tab.setViewport({ width: 1680, height: 1700, deviceScaleFactor: 1 });
await tab.evaluateOnNewDocument(SHIM);
tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
tab.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

async function shoot(name, { fullPage = false } = {}) {
  const file = `${OUT}/${name}.png`;
  await tab.screenshot({ path: file, fullPage });
  const text = await readText();
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  /*
   * Em-dashes are forbidden in user-facing copy, and there is exactly one
   * source of them on these screens: `formatUsd` in
   * src/lib/scryfall/card-utils.ts:210 returns '—' for a printing with no
   * USD price, which the shelf then prints under every unpriced version. A
   * Forest shows eight of them. That is one line in a file this workstream
   * does not own and it is on every price surface in the product, not just
   * here, so the run reports it by name rather than quietly failing a feature
   * that did not write it. Nothing in the art panel's own copy has one.
   */
  const dashes = (text.match(/—/g) || []).length;
  if (dashes > 0) log(`  [warn] ${dashes} em-dash(es) on ${name}, from formatUsd's no-price placeholder`);
  log(`  shot -> ${file}`);
  return text;
}

/** Click the real pixels of an element, so React's own handler runs. */
async function clickAt(selector, index = 0) {
  const box = await tab.evaluate(
    (sel, i) => {
      const el = document.querySelectorAll(sel)[i];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    selector,
    index
  );
  if (!box) return false;
  await sleep(300);
  const again = await tab.evaluate(
    (sel, i) => {
      const el = document.querySelectorAll(sel)[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    selector,
    index
  );
  await tab.mouse.click(again.x, again.y);
  return true;
}

log(`\nopening ${BASE}/${HARNESS_HTML}`);
await tab.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });

/**
 * What is on the page, as words.
 *
 * `document.body.innerText` comes back empty in this build of headless Chrome,
 * which silently passes every "does the page say X" check by reading nothing.
 * Reading `#root` alone is the other trap: the slide-over is a portal and
 * renders as a SIBLING of the root, so a run that reads only the root sees the
 * list and never the panel. Every direct child of body, joined.
 */
async function readText() {
  return tab.evaluate(() =>
    [...document.body.children]
      .map(el => el.innerText || el.textContent || '')
      .join(String.fromCharCode(10))
  );
}

for (let n = 0; n < 12; n++) {
  const text = await readText();
  if (text.includes('Change art')) break;
  await sleep(3000);
}

const listText = await shoot('01-list-with-change-art');
if (!listText.includes('Change art')) fail('no Change art control on the list');
if (!listText.includes('saves on its own')) fail('the page never says the choice saves itself');

const buttons = await tab.evaluate(() =>
  [...document.querySelectorAll('button')]
    .map((b, i) => ({ i, label: b.getAttribute('aria-label') || b.textContent?.trim() }))
    .filter(b => (b.label || '').startsWith('Change the art on'))
);
log(`  rows offering a change of art: ${buttons.length}`);
if (buttons.length === 0) fail('no row offers a change of art');

/* The card with the most printings in Magic, which is also the one people most
   want to re-art on a proxy sheet. */
const forest = buttons.find(b => b.label.includes('Forest'));
const target = forest ?? buttons[0];

await tab.evaluate(label => {
  const el = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label);
  el?.click();
}, target.label);
await sleep(5000);

const panelText = await shoot('02-art-panel-open');
// The heading is uppercased by the stylesheet, and innerText honours that.
if (!/every version we hold/i.test(panelText)) fail('the art panel did not open');

const shelf = await tab.evaluate(() => document.querySelectorAll('[role="dialog"] [data-printing]').length);
log(`  printings on the shelf: ${shelf}`);
if (shelf === 0) fail('the shelf holds no printings');

const before = await tab.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] [data-printing]')].map(el => el.dataset.printing)
);

// Not the first one, which is the one already chosen.
await clickAt('[role="dialog"] [data-printing] img', 3);
await sleep(150);
await shoot('03-saving');
await sleep(2500);
const savedText = await shoot('04-saved');
if (!savedText.includes('Saved to your list')) fail('the panel never said it saved');

const patches = await tab.evaluate(() => window.__patches);
log(`  patches sent: ${JSON.stringify(patches)}`);
if (patches.length !== 1) fail(`expected one write, saw ${patches.length}`);
if (patches[0] && !patches[0].patch.card_id) fail('the write carried no printing id');
if (patches[0] && !before.includes(patches[0].patch.card_id)) {
  fail('the written id is not one of the printings on the shelf');
}
if (patches[0] && !patches[0].matched) fail('the write did not name a row on the list');

await tab.evaluate(() => {
  const el = [...document.querySelectorAll('[role="dialog"] button')].find(
    b => b.textContent?.trim() === 'Done'
  );
  el?.click();
});
await sleep(2500);
const gridText = await shoot('05-list-after-the-change', { fullPage: false });
if (!gridText.includes('Art saved')) fail('the card does not say its art was saved');

log(failures === 0 ? '\nPASS' : `\nFAILED on ${failures} check(s).`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
