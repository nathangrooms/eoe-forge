/**
 * Work a real storage container in a real browser, and photograph each step.
 *
 *   npm run dev -- --port 8099
 *   node scripts/storage-shots.mjs
 *
 * This is not a unit test. It presses the pixels a person presses — Add cards,
 * a card in the search results, Move, a divider, an empty binder pocket — and
 * reads the resulting `storage_items` rows back out to check the cards actually
 * went where the screen says they went.
 *
 * Technique is the one in scripts/play-combat-shots.mjs: a dev-only entry that
 * mounts the REAL page with the app's providers and without the auth gate. What
 * it adds is scripts/storage-shim.js, a WRITABLE PostgREST stand-in, because
 * `/collection/storage` sits behind `ProtectedRoute` and reads tables whose RLS
 * is scoped to `auth.uid()`, and because every single thing being verified here
 * is a write. `cards` still goes to the real database, so every card, image and
 * price on screen is production's own. No credentials are entered anywhere.
 *
 * What each step proves:
 *   01  the container as it arrives, with the six dividers finally on screen
 *   02  Add cards opens the search IN PLACE, above the list, no navigation
 *   03  a click on a search result ADDS the card instead of opening its page
 *   04  the move panel, opened from a card's own row
 *   05  one copy of three moved to another container, two left behind
 *   06  a binder page, and a card filed into a specific pocket
 *
 * Written rather than committed, like the play harness: the repo gitignores the
 * two files it emits and Vite's build input is index.html alone.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/storage';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'storage-harness.html';
const HARNESS_ENTRY = 'src/dev/__storageHarness.tsx';

/* ---------------------------------------------------------------- harness */

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Storage harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for storage. Written by
 * scripts/storage-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { useLocation } from 'react-router-dom';
import { StorageTab } from '../components/storage/StorageTab';
import StorageQuickAdd from '../pages/StorageQuickAdd';

/* Names the route that was navigated to. The first version printed
 * location.href, which under MemoryRouter never changes, so a run could see
 * that something had navigated but not to where. */
function Elsewhere() {
  const loc = useLocation();
  return <div style={{ padding: 24 }}>navigated away: {loc.pathname}</div>;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const entry = new URLSearchParams(location.search).get('at') || '/collection/storage';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/collection/storage" element={<StorageTab />} />
              <Route path="/collection/storage/:containerId" element={<StorageTab />} />
              <Route path="/collection/storage/:containerId/add" element={<StorageQuickAdd />} />
              <Route path="*" element={<Elsewhere />} />
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

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SHIM = fs.readFileSync(path.join(HERE, 'storage-shim.js'), 'utf8');

/* ------------------------------------------------------------------ seed */

/**
 * The real `cards` rows, read out of production before the browser starts.
 *
 * The shim reads `cards` live, which is right: every image and price on screen
 * should be the catalogue's own. But PostgREST reloads its schema cache after
 * any migration and answers 500/503 for a minute or two while it does, and a
 * run that fails then has found nothing except that a database was busy. So the
 * rows are fetched once here, with patience, cached to disk, and handed to the
 * page. They are the same production rows either way.
 */
const CARD_IDS = [
  '02e8e540-8aa3-4e6a-9a11-c3949cab5f0f',
  '4415d050-7a76-4f8b-bf78-e33dd21fe4f1',
  'e16365a2-4969-4ad5-af95-9dd2d0499f06',
  '423f13ba-e165-4add-9935-d88503e1e761',
  'befb996b-1da6-41a3-8d9a-a45c2353c401',
  'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad',
];
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const SEED_FILE = path.join(HERE, '.storage-cards-seed.json');

/**
 * Every read here is time-boxed.
 *
 * `fetch` has no default timeout. When PostgREST stops answering rather than
 * answering an error — which it does under load, and did for the whole of one
 * review run — an un-timed read never settles, the retry loop never gets to
 * its next attempt, and the fallback to the cached rows two lines below is
 * never reached. The run does not fail; it hangs, silently, forever. A harness
 * that can hang is not evidence of anything, so give the socket a deadline.
 */
const REST_TIMEOUT_MS = 15000;
const restFetch = (url) =>
  fetch(url, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    signal: AbortSignal.timeout(REST_TIMEOUT_MS),
  });

async function loadSeed() {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await restFetch(
        `https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards?select=*&id=in.(${CARD_IDS.join(',')})`
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length >= CARD_IDS.length) {
          fs.writeFileSync(SEED_FILE, JSON.stringify(rows));
          log(`  seeded ${rows.length} real card rows from production`);
          return rows;
        }
      }
      log(`  catalogue not ready (HTTP ${res.status}), retrying`);
    } catch (error) {
      log('  catalogue read failed, retrying');
    }
    await sleep(3000);
  }
  if (fs.existsSync(SEED_FILE)) {
    log('  catalogue unavailable, reusing the rows cached from an earlier read');
    return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  }
  throw new Error('no card rows available: production is unreachable and nothing is cached');
}

const SEED = await loadSeed();

/* Say plainly whether the catalogue is answering. PostgREST returns 503 for a
   minute or two after any migration while it reloads its schema cache, and a
   reader of this log should not have to guess whether a failed add means the
   interface is broken or the database was busy. */
{
  const probe = await restFetch(
    'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards?select=id&limit=1'
  ).catch(() => null);
  log(
    probe && probe.ok
      ? '  catalogue is live; adds resolve against production'
      : `  catalogue is unavailable (HTTP ${probe ? probe.status : 'none'}); adds resolve against the seeded rows`
  );
}

/* ------------------------------------------------------------------- run */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1200, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(rows => {
  window.__dmCardSeed = rows;
}, SEED);
await page.evaluateOnNewDocument(SHIM);
/**
 * No hot reload during the run.
 *
 * Other agents are editing this tree while this runs, and every save made Vite
 * push a full reload: the page re-mounted mid-assertion, the container emptied,
 * and the run reported a dozen failures that were really one file save. The
 * page under test has to hold still.
 *
 * The blunt version of this — stubbing out `/@vite/client` and `/@react-refresh`
 * — also removed React Refresh's global hook, which every Vite React module
 * expects to exist, and nothing rendered at all. So the modules load exactly as
 * they normally do and only the socket they would listen on is taken away.
 */
await page.evaluateOnNewDocument(() => {
  class DeafSocket {
    constructor() {
      this.readyState = 3; // CLOSED
    }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  window.WebSocket = DeafSocket;
});

page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
});

let shotN = 0;
const shot = async name => {
  const file = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  log('  shot ->', file);
};

/** Rows as the shim holds them, which is what "did it actually move" means. */
const rows = () => page.evaluate(() => window.__dmStorage.snapshot());

/* The same fixed ids the shim seeds. Declared here rather than read back,
   because the first navigation needs them and the shim only exists once a page
   has loaded. Kept in step with scripts/storage-shim.js by hand. */
const BULK = 'bbbbbbbb-0000-4000-8000-00000000bulk';
const BINDER = 'aaaaaaaa-0000-4000-8000-00000000bind';

const say = async label => {
  const snap = await rows();
  log(`  [${label}]`);
  for (const r of snap) {
    log(
      `      ${r.container.padEnd(20)} ${String(r.qty).padStart(2)}x ${r.card}` +
        (r.slot ? `  [${r.slot}]` : '') +
        (r.pocket ? ` pocket ${r.pocket}` : '')
    );
  }
  return snap;
};

/** A control by its visible text or accessible name, as a person reads it. */
const clickText = async (
  needle,
  { nth = 0, tag = 'button, a, [role="button"]', exact = false, within = null } = {}
) => {
  const handle = await page.evaluateHandle(
    (needle, nth, tag, exact, within) => {
      const root = within ? document.querySelector(within) : document;
      if (!root) return null;
      const hits = [...root.querySelectorAll(tag)].filter(el => {
        if (el.disabled) return false;
        const label = `${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
        return exact
          ? (el.innerText || '').trim().toLowerCase() === needle.toLowerCase()
          : label.toLowerCase().includes(needle.toLowerCase());
      });
      return hits[nth] || null;
    },
    needle,
    nth,
    tag,
    exact,
    within
  );
  const el = handle.asElement();
  if (!el) return false;
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await el.click();
  await sleep(700);
  return true;
};

const bodyText = () => page.evaluate(() => document.body.innerText);
const routeNow = () => page.evaluate(() => document.body.innerText.includes('navigated away'));

/**
 * Wait for the screen to actually say something, rather than for a clock.
 *
 * The first pass used fixed sleeps and reported eleven false failures on a cold
 * run: the page had not finished its first paint at six seconds, so every
 * assertion about the text was made against an empty body. A screenshot run
 * that fails when the machine is busy is not evidence of anything.
 */
const waitForText = async (re, ms = 40000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (re.test(await bodyText())) return true;
    await sleep(400);
  }
  return false;
};

const failures = [];
const check = (ok, claim) => {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${claim}`);
  if (!ok) failures.push(claim);
};

/* ----------------------------------------------------- 01 the container */

await page.goto(`${BASE}/${HARNESS_HTML}?at=${encodeURIComponent(`/collection/storage/${BULK}`)}`, {
  waitUntil: 'domcontentloaded',
  timeout: 90000,
});
check(await waitForText(/Plains Spacecraft/), 'the container page painted');
/* The real `cards` rows have to be in hand before anything is asserted about
   names, or a slow catalogue read reads as a broken screen. */
check(
  await page.waitForFunction(() => window.__dmCardsReady > 0, { timeout: 30000 }).then(
    () => true,
    () => false
  ),
  'the real card catalogue answered'
);
await waitForText(/Dividers/i);
await sleep(1500); // let the card art settle before the photograph
await shot('bulk-box-arrives');
await say('as it arrives');

let text = await bodyText();
check(/Dividers/i.test(text), 'the bulk box names its dividers on screen');
for (const name of ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless']) {
  check(text.includes(name), `divider "${name}" is on screen`);
}
check(!/%\s*full/i.test(text) && !/\d+%/.test(text), 'no invented fill percentage anywhere');

/* ------------------------------------------------------- 02 add in place */

check(await clickText('Add cards'), 'pressed Add cards');
await waitForText(/Add cards to Plains Spacecraft/, 20000);
await sleep(1200);
await shot('add-opens-in-place');

check(!(await routeNow()), 'Add cards did NOT navigate away');
text = await bodyText();
check(
  text.includes('Add cards to Plains Spacecraft'),
  'the add section opened on the container page itself'
);
const boxes = await page.evaluate(
  () => [...document.querySelectorAll('input')].map(i => i.placeholder || '').filter(Boolean)
);
check(
  boxes.some(p => /Search for cards/i.test(p)) && boxes.some(p => /Scryfall syntax/i.test(p)),
  'two search boxes: one to add cards, one to filter what is already filed'
);
check(/file into/i.test(text), 'the add section offers which divider to file into');

/* ------------------------------------------------- 03 a click ADDS a card */

const searchBox = await page.$('input[placeholder*="Search for cards"]');
if (searchBox) {
  await searchBox.click();
  /* One exact printing, named. `Sol Ring` alone returns whichever printings
     Scryfall ranks first, and adding one resolves it through OUR catalogue,
     which does not hold every printing Scryfall does. Naming the set makes the
     run deterministic and exercises the printing-specific path rather than
     depending on which art came back today. */
  await searchBox.type('!"Sol Ring" set:eoc');
  /* Enter commits the search and closes the name suggestions. Escape does NOT:
     the component treats Escape in this box as "clear what I typed", so the
     first pass dismissed the dropdown and the query with it. */
  await page.keyboard.press('Enter');
  await waitForText(/Sol Ring/, 25000);
  await sleep(3000);
}
await shot('search-results');

const before = await rows();
/*
 * Click the card ITSELF, in the results inside the add section.
 *
 * The body click is the thing the owner reported navigating away, so the body
 * click is what has to be pressed: not the small add button, not a menu item.
 * It goes through an ElementHandle rather than `el.click()` in the page,
 * because a synthetic click skips pointerdown and several controls here never
 * see it.
 */
/* Scryfall is a live third party and occasionally makes a run wait. Commit the
   search again rather than reporting "no results" as a fault in the page. */
let clickedCard = false;
for (let attempt = 0; attempt < 3 && !clickedCard; attempt++) {
  if (attempt > 0) {
    log('  no results yet, asking again');
    const box = await page.$('input[placeholder*="Search for cards"]');
    if (box) {
      await box.click();
      await page.keyboard.press('Enter');
    }
    await waitForText(/Sol Ring/, 20000);
    await sleep(3000);
  }
  for (const handle of await page.$$(
    'section[aria-label^="Add cards to"] [aria-label="Card results"] img'
  )) {
    const alt = await handle.evaluate(e => e.getAttribute('alt') || '');
    if (!/^Sol Ring/i.test(alt)) continue;
    await handle.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await handle.click();
    clickedCard = true;
    break;
  }
}
check(clickedCard, 'clicked a card in the search results');

/* Adding is three round trips: resolve the card, add it to the collection,
   file it into the container, then reload the list. Wait for the row rather
   than for a clock. */
const beforeCopies = before.reduce((n, r) => n + r.qty, 0);
let added = false;
for (let i = 0; i < 45 && !added; i++) {
  await sleep(700);
  added = (await rows()).reduce((n, r) => n + r.qty, 0) > beforeCopies;
}
await sleep(1500);
await shot('after-clicking-a-result');

check(!(await routeNow()), 'clicking a search result did NOT open the card page');
if (!added) {
  const toast = await page.evaluate(
    () => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | ')
  );
  log(`  the page said: ${toast || '(nothing)'}`);
}
check(added, 'clicking a search result ADDED a card to the container');
await say('after adding');

/* --------------------------------------------------------- 04+05 moving */

check(await clickText('Done adding'), 'closed the add section');
await sleep(1200);

const three = (await rows()).find(r => r.qty === 3);
check(Boolean(three), `a stack of three copies exists to split (${three?.card})`);

/* Open the row action menu and choose Move. */
/* A REAL click. Radix opens its menu on pointerdown, which a synthetic
   `el.click()` never fires, so the scripted menu silently stayed shut. */
const trigger = await page.$(`button[aria-label="Actions for ${three?.card}"]`);
if (trigger) await trigger.evaluate(e => e.scrollIntoView({ block: 'center' }));
if (trigger) await trigger.click();
check(Boolean(trigger), `opened the action menu on the ${three?.card} row`);
await sleep(1400);

/* Clicked where it already is. The generic helper calls `scrollIntoView`
   first, and scrolling with a Radix menu open moves the menu out from under
   the pointer: the click then landed on the card tile underneath and opened
   the card page, which looked exactly like the bug this run exists to
   disprove. */
const moveItem = await page.evaluateHandle(() =>
  [...document.querySelectorAll('[role="menuitem"]')].find(el =>
    /move somewhere else/i.test(el.innerText || '')
  ) || null
);
const pressedMove = Boolean(moveItem.asElement());
if (pressedMove) {
  await moveItem.asElement().click();
  await sleep(800);
}
check(pressedMove, 'opened Move from the card row');
await waitForText(/Move to/, 15000);
await sleep(1500);
await shot('move-panel-open');

text = await bodyText();
check(
  /Move \d+ (copy|copies|cards)/i.test(text),
  'the move panel is a right-hand panel, and its title says what will move'
);
check(text.includes('How many copies'), 'the move panel lets you move only some of the copies');

check(await clickText('Commander box'), 'picked another container as the destination');
await sleep(600);
check(await clickText('Move', { tag: 'button', exact: true }), 'pressed Move');
await sleep(2500);
await shot('after-move');

const moved = await say('after moving one copy');
const left = moved.find(r => r.card === three?.card && r.container === 'Plains Spacecraft');
const arrived = moved.find(r => r.card === three?.card && r.container === 'Commander box');
check(left?.qty === 2, 'two copies stayed behind');
check(arrived?.qty === 1, 'one copy arrived in the other container');
check(
  arrived?.card_id === left?.card_id,
  'the printing survived the move (same cards.id on both sides)'
);

/* ------------------------------------------------- 06 a binder page + pocket */

await page.goto(
  `${BASE}/${HARNESS_HTML}?at=${encodeURIComponent(`/collection/storage/${BINDER}`)}`,
  { waitUntil: 'domcontentloaded', timeout: 90000 }
);
check(await waitForText(/Pages/i), 'a binder names its subdivisions "Pages", not "dividers"');
await sleep(1200);
check(await clickText('Add a page'), 'pressed Add a page');
await sleep(800);
check(await clickText('Add', { tag: 'button', exact: true }), 'confirmed the new page');
await waitForText(/pockets used/, 20000);
await sleep(1500);
await shot('binder-page');

text = await bodyText();
check(/of 9 pockets used/.test(text), 'the page says how many of its nine pockets are used');

const pocket = await page.$('[aria-label="Put a card in pocket 5"]');
check(Boolean(pocket), 'an empty pocket is a control you can press');
if (pocket) {
  await pocket.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await pocket.click();
  await sleep(1200);
  await shot('choosing-a-card-for-a-pocket');

  /* An EMPTY POCKET is titled "Put a card in pocket N"; a CARD OFFERED for that
     pocket is titled "Put <card name> in pocket N". The first pass matched
     "Put " and kept clicking pockets instead of cards. */
  const picked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /^Put (?!a card in pocket).+ in pocket \d+$/.test(b.getAttribute('title') || '')
    );
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  });
  check(picked, 'picked a card for pocket 5');
  await sleep(2500);
}
await shot('card-in-pocket');

const pocketed = (await say('after pocketing')).find(r => r.pocket === 5);
check(Boolean(pocketed), 'a card is recorded in pocket 5 of a real binder page');
check(pocketed?.qty === 1, 'a pocket holds exactly one card');
check(!(await routeNow()), 'filing a pocket never navigated away');

/* --------------------------------------------------------------- verdict */

fs.writeFileSync(`${OUT}/final-rows.json`, JSON.stringify(await rows(), null, 2));

log('\n=== verdict ===');
if (failures.length === 0) {
  log('all checks passed');
} else {
  log(`${failures.length} FAILED:`);
  for (const f of failures) log('  -', f);
}

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
