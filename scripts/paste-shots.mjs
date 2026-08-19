/**
 * Photograph pasting a list onto the proxy page.
 *
 *   npm run dev            # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/paste-shots.mjs
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, SO NOTHING IS CLAIMED THAT WAS NOT SEEN
 * -------------------------------------------------------------------------
 * REAL: every card name, every printing, every piece of art and every set code
 * on screen comes from the live `cards` table through the anon key, exactly as
 * the app fetches it. The parser is the shipped one. The layout is the shipped
 * components.
 *
 * NOT REAL: the classification into found / worth a look / not found is done by
 * the shim below rather than by `resolve_card_names`, because that function is
 * granted to `authenticated` only and a screenshot run holds no password. The
 * function itself was exercised directly against the live database instead, and
 * that is where its behaviour is verified. What this run verifies is the SHAPE
 * of the screen: that a review of a real list lays out, fills the width, and
 * reads correctly at 1680px.
 *
 * The run FAILS on an em-dash in user-facing copy, which the copy rules forbid.
 *
 * The harness files are written per run and gitignored, like every other one.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/paste';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'paste-harness.html';
const HARNESS_ENTRY = 'src/dev/__pasteHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Paste a list harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for pasting a list. Written by
 * scripts/paste-shots.mjs. Not shipped, not routed, not built. */
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

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/proxies']}>
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

const SHIM = `(() => {
  const URL_BASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
  const ANON = '${'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g'}';
  const USER_ID = '00000000-0000-4000-8000-00000000dm01';
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
  const COLUMNS = 'id,oracle_id,name,set_code,set_name,collector_number,released_at,artist,rarity,layout,type_line,mana_cost,cmc,colors,color_identity,image_uris,faces,prices,finishes';

  const quote = v => '"' + String(v).replace(/"/g, '\\\\"') + '"';

  /* One real request for the whole list, exactly as the shipped resolver does
     it, so the art on screen is the art the catalogue holds. */
  async function lookUp(names) {
    if (names.length === 0) return [];
    const url = URL_BASE + '/rest/v1/cards_unique?select=' + COLUMNS +
      '&name=in.(' + names.map(quote).join(',') + ')';
    const res = await realFetch(url, { headers: auth });
    return res.ok ? await res.json() : [];
  }

  /* Nearest real names for a line that matched nothing. A real ILIKE against
     the real catalogue, so the suggestions are cards that exist. */
  async function nearest(text) {
    const stem = text.replace(/[^A-Za-z ]/g, '').trim().slice(0, 7);
    if (stem.length < 4) return [];
    const url = URL_BASE + '/rest/v1/cards_unique?select=' + COLUMNS +
      '&name=ilike.' + encodeURIComponent(stem + '%') + '&limit=3';
    const res = await realFetch(url, { headers: auth });
    return res.ok ? await res.json() : [];
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const opts = init || (typeof input === 'object' ? input : {});
    if (!url || !url.startsWith(URL_BASE)) return realFetch(input, init);

    if (url.includes('/auth/v1/')) {
      const body = url.includes('/user') ? session.user : session;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/rest/v1/rpc/resolve_card_names')) {
      const body = JSON.parse(opts.body || '{}');
      const lines = body.p_lines || [];
      const rows = await lookUp([...new Set(lines.map(l => l.name))]);
      const byName = new Map(rows.map(r => [String(r.name).toLowerCase(), r]));
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        const q = lines[i].name;
        const hit = byName.get(String(q).toLowerCase());
        if (hit) {
          out.push({ idx: i, query: q, status: 'exact', card: hit, printings: 12, suggestions: [] });
          continue;
        }
        const near = await nearest(q);
        out.push({
          idx: i, query: q,
          status: near.length ? 'near' : 'none',
          card: near[0] || null,
          printings: near.length ? 12 : 0,
          suggestions: near.map(n => ({ id: n.id, name: n.name, score: 0.6 })),
        });
      }
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/rest/v1/rpc/')) {
      return new Response('0', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

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

    /* Every owner-scoped table answers empty, so the page shows the state a
       new player sees: nothing on the list, and the paste box as the door. */
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})();`;

/* A list shaped like something somebody would really paste: two formats mixed,
   a set and collector number, a heading, a double faced front only, an
   apostrophe from a web page, and one misspelling. */
const LIST = [
  'Commander',
  "1 Atraxa, Praetors' Voice",
  '',
  'Deck',
  '4 Lightning Bolt',
  '1 Sol Ring (LTC) 284',
  '1x Arcane Signet',
  'Counterspell',
  'Rhystic Study',
  '1 Delver of Secrets',
  'Cyclonic Rift',
  'Swords to Plowshares',
  'Demonic Tutor',
  'Command Tower',
  'Smothering Tithe',
  'Dockside Extortionist',
  'Lightnin Bolt',
].join('\n');

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

let failures = 0;

async function shoot(tab, name, { height = 1600, fullPage = true } = {}) {
  const file = `${OUT}/${name}.png`;
  await tab.screenshot({ path: file, fullPage });
  const text = await tab.evaluate(() => document.body.innerText);
  fs.writeFileSync(`${OUT}/${name}.txt`, text);
  const dashes = (text.match(/—/g) || []).length;
  if (dashes > 0) {
    failures += 1;
    log(`  FAIL  em-dash in user-facing copy x${dashes}`);
  }
  log(`  shot -> ${file}  em-dashes=${dashes}`);
  return text;
}

const tab = await browser.newPage();
await tab.setViewport({ width: 1680, height: 1600, deviceScaleFactor: 1 });
await tab.evaluateOnNewDocument(SHIM);
tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
tab.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

await tab.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);

const empty = await shoot(tab, 'proxies-empty-with-paste-box');
if (!empty.includes('Paste a list')) {
  failures += 1;
  log('  FAIL  the paste box is not the empty state');
}
if (empty.includes('from any card page or search result')) {
  failures += 1;
  log('  FAIL  the empty state still advertises a control that does not exist');
}
if (!/playtesting/i.test(empty)) {
  failures += 1;
  log('  FAIL  nothing on the page says these are for playtesting');
}

await tab.evaluate(() => {
  const box = document.querySelector('textarea');
  if (box) box.focus();
});
await tab.type('textarea', LIST, { delay: 0 });
await sleep(400);
await shoot(tab, 'paste-box-filled');

const clicked = await tab.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    x.textContent?.trim().startsWith('Check this list')
  );
  if (b) b.click();
  return Boolean(b);
});
if (!clicked) {
  failures += 1;
  log('  FAIL  no "Check this list" button');
}
await sleep(9000);

const review = await shoot(tab, 'review-what-we-found', { height: 2200 });
/* Case-insensitively, because two of these headings are uppercased by CSS and
   innerText reports what is drawn, not what the source says. */
const flat = review.toLowerCase();
for (const must of ['cards ready', 'what we found', 'worth a look']) {
  if (!flat.includes(must)) {
    failures += 1;
    log(`  FAIL  the review is missing "${must}"`);
  }
}

log(failures === 0 ? '\nPASS' : `\nFAILED on ${failures} check(s).`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
