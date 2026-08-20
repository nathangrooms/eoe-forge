/**
 * Photograph exporting a proxy list, and prove the lines carry the chosen art.
 *
 *   npm run dev            # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/proxy-export-shots.mjs
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, SO NOTHING IS CLAIMED THAT WAS NOT SEEN
 * -------------------------------------------------------------------------
 * REAL: every card, every printing, every set code and every collector number
 * that ends up in the exported text is read from the live database through the
 * anon key, because `cards`, `cards_unique` and `card_printing_spread` are all
 * readable by `anon` and this run passes those straight through. The components
 * are the shipped ones. The download is a real download: Chrome is told to
 * write files to disk and the run reads the bytes back off disk and compares
 * them to what is on screen.
 *
 * NOT REAL: the proxy list ROWS. `card_list_items` is owner scoped behind
 * `auth.uid() = user_id` and a screenshot run holds no password, so the rows
 * are supplied below, shaped like production's: real catalogue ids for most of
 * them and one whose `card_id` is the literal text `sol-ring`, which is a row
 * production actually holds from an old import. The clipboard is stubbed and
 * recorded rather than written, because headless Chrome's clipboard is not a
 * thing a run can trust; what that proves is that the button hands over exactly
 * the text in the box, not that the operating system took it.
 *
 * The run FAILS if a line does not carry the printing, if changing the art does
 * not change the exported line, if the downloaded file does not match the box,
 * or on an em-dash in the panel's own copy.
 *
 * The two harness files it writes are gitignored, like every other one.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/proxy-export';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const DOWNLOADS = path.resolve(OUT, 'downloads');
fs.rmSync(DOWNLOADS, { recursive: true, force: true });
fs.mkdirSync(DOWNLOADS, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'proxy-export-harness.html';
const HARNESS_ENTRY = 'src/dev/__proxyExportHarness.tsx';

fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Proxy export harness</title></head>
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
  `/* Gitignored puppeteer harness for exporting a proxy list. Written by
 * scripts/proxy-export-shots.mjs. Not shipped, not routed, not built. */
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

  window.__patches = [];
  /* The clipboard is recorded rather than written. See the note at the top of
     the script: this proves what the button hands over, nothing more. */
  window.__copied = [];
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.__copied.push(text); } },
    });
  } catch (e) { window.__clipboardStubFailed = String(e); }

  const realFetch = window.fetch.bind(window);
  const auth = { apikey: ANON, Authorization: 'Bearer ' + ANON };
  const PASSTHROUGH = new Set(['cards', 'cards_unique', 'card_printing_spread']);

  /* A list a Commander player would really print: a card with a lot of art, a
     card with a little, and a basic land, which has more printings than
     anything else in Magic. */
  const NAMES = ['Sol Ring', 'Rhystic Study', 'Command Tower', 'Arcane Signet', 'Forest', 'Swords to Plowshares'];

  let items = null;

  function quote(v) { return '"' + String(v).replace(/"/g, '\\\\"') + '"'; }

  function row(i, cardId, oracleId, name, quantity) {
    const iso = d => new Date(Date.now() - d * 86400000).toISOString();
    return {
      id: 'proxy-item-' + i, list_id: PROXY_LIST, user_id: USER_ID, kind: 'proxy',
      card_id: cardId, oracle_id: oracleId, card_name: name, finish: 'nonfoil',
      quantity: quantity, note: null, source: 'manual', source_deck_id: null,
      status: 'want', paid_unit: null, paid_currency: null, bought_at: null,
      arrived_at: null, filed_at: null, arrived_card_id: null, arrived_finish: null,
      filed_container_id: null, filed_deck_id: null, created_at: iso(10), updated_at: iso(10),
    };
  }

  async function buildItems() {
    const url = URL_BASE + '/rest/v1/cards_unique?select=id,oracle_id,name&name=in.(' +
      NAMES.map(quote).join(',') + ')';
    const res = await realFetch(url, { headers: auth });
    const rows = res.ok ? await res.json() : [];
    const out = rows.map((r, i) => row(i, r.id, r.oracle_id, r.name, i === 1 ? 2 : 1));
    /* Production holds exactly one row like this: a card_id that is not an id
       at all, from an old import, so nothing joins onto it and it has no set
       code to export. The panel has to say so rather than pretend. */
    out.push(row(90, 'sol-ring', null, 'Sol Ring', 3));
    return out;
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
        const r = items.find(x => x.id === idFilter);
        window.__patches.push({ id: idFilter, patch, matched: Boolean(r) });
        if (r) Object.assign(r, patch, { updated_at: new Date().toISOString() });
        return new Response(JSON.stringify(r ? [{ id: r.id }] : []),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const kind = (params.get('kind') || '').replace(/^eq\\./, '');
      const rows = kind ? items.filter(r => r.kind === kind) : items;
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();`;

/* ------------------------------------------------------------------ run */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

let failures = 0;
const fail = why => {
  failures += 1;
  log(`  FAIL  ${why}`);
};
const check = (ok, why) => {
  if (!ok) fail(why);
  return ok;
};

const tab = await browser.newPage();
await tab.setViewport({ width: 1680, height: 1500, deviceScaleFactor: 1 });
await tab.evaluateOnNewDocument(SHIM);
tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
tab.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

/* A real download, written to a real directory, so the file can be read back. */
const cdp = await tab.createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });

fs.mkdirSync(OUT, { recursive: true });

/** Every direct child of body: the slide-over is a portal, not inside #root. */
async function readText() {
  return tab.evaluate(() =>
    [...document.body.children].map(el => el.innerText || el.textContent || '').join(String.fromCharCode(10))
  );
}

async function shoot(name) {
  const file = `${OUT}/${name}.png`;
  await tab.screenshot({ path: file });
  const text = await readText();
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  log(`  shot -> ${file}`);
  return text;
}

/** What is in the export box right now. */
async function boxText() {
  return tab.evaluate(() => {
    const el = document.querySelector('[role="dialog"] textarea');
    return el ? el.value : null;
  });
}

async function clickByText(text, selector = '[role="dialog"] button') {
  return tab.evaluate(
    (sel, want) => {
      const el = [...document.querySelectorAll(sel)].find(b => b.textContent?.trim() === want);
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text
  );
}

log(`\nopening ${BASE}/${HARNESS_HTML}`);
await tab.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });

for (let n = 0; n < 12; n++) {
  const text = await readText();
  if (text.includes('Export')) break;
  await sleep(3000);
}

const listText = await shoot('01-list');
check(listText.includes('Export'), 'no Export control on the proxy list');

check(
  await tab.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Export');
    el?.click();
    return Boolean(el);
  }),
  'could not press Export'
);
await sleep(1200);

const panelText = await shoot('02-export-panel');
check(panelText.includes('Take this list somewhere else'), 'the export panel did not open');

/* ---- the printing is on every line it can be on ---- */

const textFormat = await boxText();
log(`\n  ---- Text ----\n${(textFormat || '').split('\n').map(l => '  ' + l).join('\n')}`);

const lines = (textFormat || '').split('\n').filter(Boolean);
check(lines.length > 0, 'the export box is empty');

const withPrinting = lines.filter(l => /\([A-Z0-9]{2,5}\)\s+\S+$/.test(l));
log(`\n  lines: ${lines.length}, lines naming a set and a collector number: ${withPrinting.length}`);
check(
  withPrinting.length === lines.length - 1,
  `expected every line but the orphan row to name a printing, saw ${withPrinting.length} of ${lines.length}`
);
check(lines.every(l => /^\d+x /.test(l)), 'a line is missing its quantity');
check(
  panelText.includes('not in our card list'),
  'the panel does not say which rows could not name a version'
);

/* ---- the formats ---- */

const seen = {};
for (const [chip, name] of [
  ['MTG Arena', 'arena'],
  ['MTGO', 'modo'],
  ['Spreadsheet', 'csv'],
  ['Text', 'text'],
]) {
  check(await clickByText(chip), `no ${chip} format chip`);
  await sleep(500);
  seen[name] = await boxText();
}
seen.text = textFormat;

log(`\n  ---- MTG Arena ----\n${(seen.arena || '').split('\n').slice(0, 4).map(l => '  ' + l).join('\n')}`);
log(`  ---- MTGO ----\n${(seen.modo || '').split('\n').slice(0, 3).map(l => '  ' + l).join('\n')}`);
log(`  ---- Spreadsheet ----\n${(seen.csv || '').split('\n').slice(0, 3).map(l => '  ' + l).join('\n')}`);

check(seen.arena?.startsWith('Deck\n'), 'the Arena format has no Deck heading');
check(/\([A-Z0-9]{2,5}\) \S+/.test(seen.arena || ''), 'the Arena format lost the printing');
check(!/[()]/.test(seen.modo || ''), 'the MTGO format should carry nothing but quantity and name');
check(
  seen.csv?.startsWith('Quantity,Name,Set,Set code,Collector number,Finish'),
  'the spreadsheet has no header row'
);
check(new Set(Object.values(seen)).size === 4, 'two formats produced identical text');

/* ---- the plain name list ---- */

await clickByText('Text');
await sleep(400);
check(
  await tab.evaluate(() => {
    const el = document.querySelector('[role="dialog"] #name-printing');
    if (!el) return false;
    el.click();
    return true;
  }),
  'no switch for naming the version'
);
await sleep(500);
const plain = await boxText();
log(`\n  ---- Text, versions off ----\n${(plain || '').split('\n').slice(0, 3).map(l => '  ' + l).join('\n')}`);
await shoot('03-plain-names');
check(plain && !plain.includes('('), 'turning versions off still wrote a printing');
check(
  plain?.split('\n').length === lines.length,
  'the plain list lost or gained a card'
);

/* back on, for everything below */
await tab.evaluate(() => document.querySelector('[role="dialog"] #name-printing')?.click());
await sleep(500);

/* ---- copying hands over exactly what is on screen ---- */

check(await clickByText('Copy the list'), 'no copy control');
await sleep(800);
const copied = await tab.evaluate(() => window.__copied);
const stubFailed = await tab.evaluate(() => window.__clipboardStubFailed || null);
if (stubFailed) log(`  [note] clipboard stub: ${stubFailed}`);
log(`  copies taken: ${copied.length}`);
check(copied.length === 1, `expected one copy, saw ${copied.length}`);
check(copied[0] === (await boxText()), 'the copy is not the text in the box');
const afterCopy = await shoot('04-copied');
check(afterCopy.includes('Copied'), 'the panel never said it copied');

/* ---- the file really lands on disk, and matches ---- */

check(await clickByText('Save a file'), 'no save control');
let saved = null;
for (let n = 0; n < 30 && !saved; n++) {
  await sleep(500);
  const files = fs.readdirSync(DOWNLOADS).filter(f => !f.endsWith('.crdownload'));
  if (files.length > 0) saved = files[0];
}
if (!check(Boolean(saved), 'no file arrived in the download directory')) {
  log('  (a page-started download being refused is exactly why copy is the primary route)');
} else {
  const onDisk = fs.readFileSync(path.join(DOWNLOADS, saved), 'utf8');
  log(`  file on disk: ${saved}, ${onDisk.length} bytes`);
  check(/^deckmatrix-proxy-list-text-\d{4}-\d{2}-\d{2}\.txt$/.test(saved), `unexpected file name ${saved}`);
  check(onDisk === (await boxText()), 'the saved file is not the text in the box');
}

/* ---- the whole point: change the art, and the export follows ---- */

await clickByText('Close', '[role="dialog"] button');
await tab.keyboard.press('Escape');
await sleep(800);

const artButtons = await tab.evaluate(() =>
  [...document.querySelectorAll('button')]
    .map(b => b.getAttribute('aria-label'))
    .filter(l => (l || '').startsWith('Change the art on'))
);
const forest = artButtons.find(l => l.includes('Forest')) ?? artButtons[0];
check(Boolean(forest), 'no row offers a change of art');

await tab.evaluate(label => {
  [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label)?.click();
}, forest);
await sleep(6000);

const shelf = await tab.evaluate(() =>
  [...document.querySelectorAll('[role="dialog"] [data-printing]')].map(el => el.dataset.printing)
);
log(`\n  printings on the shelf for ${forest}: ${shelf.length}`);
check(shelf.length > 1, 'the shelf holds nothing to change to');

await tab.evaluate(() => {
  const el = document.querySelectorAll('[role="dialog"] [data-printing] img')[3];
  el?.scrollIntoView({ block: 'center' });
  el?.click();
});
await sleep(3000);
await shoot('05-art-changed');

const patches = await tab.evaluate(() => window.__patches);
log(`  writes sent: ${patches.length}`);
check(patches.length === 1 && Boolean(patches[0]?.patch?.card_id), 'the art change did not write a printing id');

await tab.keyboard.press('Escape');
await sleep(1200);
await tab.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Export')?.click();
});
await sleep(1500);
const afterArt = await boxText();
await shoot('06-export-after-art-change');
log(`\n  ---- Text, after changing the art ----\n${(afterArt || '').split('\n').map(l => '  ' + l).join('\n')}`);

const chosenId = patches[0]?.patch?.card_id;
const chosen = await tab.evaluate(async id => {
  const res = await fetch(
    'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards?select=name,set_code,collector_number&id=eq.' + id,
    {
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g',
        Authorization:
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g',
      },
    }
  );
  const rows = await res.json();
  return rows[0] ?? null;
}, chosenId);

if (check(Boolean(chosen), 'could not read the chosen printing back from the database')) {
  const want = `(${String(chosen.set_code).toUpperCase()}) ${chosen.collector_number}`;
  log(`  the printing that was written: ${chosen.name} ${want}`);
  check(
    (afterArt || '').includes(want),
    `the export does not name the art that was chosen, expected ${want}`
  );
  check(
    (textFormat || '') !== (afterArt || ''),
    'the export did not change when the art did'
  );
}

/* ---- copy rules ---- */

const dashes = ((await readText()).match(/—/g) || []).length;
if (dashes > 0) {
  log(`  [warn] ${dashes} em-dash(es) on screen, from formatUsd's no-price placeholder in the art shelf`);
}
const panelDashes = await tab.evaluate(() => {
  const el = document.querySelector('[role="dialog"]');
  return ((el?.innerText || '').match(/—/g) || []).length;
});
check(panelDashes === 0, `${panelDashes} em-dash(es) in the export panel's own copy`);

log(failures === 0 ? '\nPASS' : `\nFAILED on ${failures} check(s).`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
