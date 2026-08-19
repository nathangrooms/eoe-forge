/**
 * Play a real game and photograph the CENTRE PREVIEW, plus measure the two
 * layout bugs the owner reported.
 *
 * Sibling of `play-combat-shots.mjs` and it reuses that script's harness: the
 * dev-only entry that mounts the REAL `Play` page with the app's providers and
 * without the auth gate. Run `play-combat-shots.mjs` at least once, or let this
 * write the harness itself — it writes the same two files.
 *
 * ## Why this one blocks Supabase
 *
 * A signed-out run has no saved decks, so every seat is dealt a SEEDED deck
 * built live out of the `cards` table. That is the right default for the app and
 * a bad dependency for a screenshot: measured on 2026-08-19 the project's
 * database was answering `PGRST002` and `57014` to everything, including
 * `select id from cards limit 1`, so the lobby could not deal a table at all.
 *
 * `deckSource.ts` already has a documented answer to an unreachable database —
 * `fallbackDeck()`, a typographic offline list with 24 Forests in it — and this
 * takes it deliberately by refusing the card queries at the network boundary.
 * That is the REAL degradation path, not a stub: the page, the reducer, the
 * bot, the mat and the preview are all the shipped ones. What it costs is card
 * art, which a layout measurement does not need.
 *
 * Drop `DM_BLOCK_DB=0` to run it against the live database instead.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/preview';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const BLOCK_DB = process.env.DM_BLOCK_DB !== '0';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ----------------------------------------------------------------- harness */

const HARNESS_HTML = 'play-harness.html';
const HARNESS_ENTRY = 'src/dev/__playHarness.tsx';

/* Written only when the content differs. Rewriting a file under `src/` on every
   run makes Vite reload the page moments after it opened, which wipes the game
   the run had just dealt — the first version of this script chased that ghost
   for two runs. */
const writeIfChanged = (file, body) => {
  try { if (fs.readFileSync(file, 'utf8') === body) return; } catch { /* absent */ }
  fs.writeFileSync(file, body);
};

fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(HARNESS_HTML, `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Play harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`);
writeIfChanged(HARNESS_ENTRY, `/* Gitignored puppeteer harness for play mode. Written by
 * scripts/play-preview-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import Play from '../pages/Play';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/play']}>
          <Play />
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' || /\[play\]/.test(t)) log('  [' + m.type() + ']', t.slice(0, 180));
});

/*
 * Vite's hot-reload client, replaced by a stub that does nothing.
 *
 * Other workstreams are editing this repo while a run is going. Every save they
 * make pushes an HMR update, and a failed one ("[hmr] Failed to reload
 * StandardPageLayout.tsx") makes Vite reload the whole page — which throws away
 * the table the run had just dealt, several turns in, and reports itself as a
 * bug in the board. Three runs were lost to it.
 *
 * The stub exports the four names Vite's transformed modules import and none of
 * them connect to anything, so the page is loaded once and stays put. It only
 * removes hot reloading; every module is still the real one.
 */
const VITE_CLIENT_STUB = `
export function createHotContext() {
  return {
    accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {},
  };
}
/* updateStyle is NOT optional. Vite serves every CSS file in dev as a JS
   module that calls it to inject a <style> tag, so a no-op here strips the
   entire stylesheet and the page collapses into unstyled markup — which the
   first version of this stub did, and the measurements it produced looked
   like a catastrophic layout bug. This is Vite's own implementation. */
const sheets = new Map();
export function updateStyle(id, content) {
  let style = sheets.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheets.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (style) { document.head.removeChild(style); sheets.delete(id); }
}
export function injectQuery(url) { return url; }
`;

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({
      status: 200,
      contentType: 'application/javascript',
      body: VITE_CLIENT_STUB,
    });
  }
  if (BLOCK_DB && /supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

const shot = async name => {
  const file = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
};

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const pressTitle = needle => page.evaluate(needle => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('title') || '').includes(needle));
  if (!el) return false;
  el.click();
  return true;
}, needle);

const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    landsPlayed: p1.landsPlayedThisTurn,
    hand: p1.zones.hand.map(id => g.cards[id].name),
    battlefield: p1.zones.battlefield.map(id => ({
      name: g.cards[id].name, tapped: g.cards[id].tapped, type: g.cards[id].typeLine,
    })),
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
  };
});

/**
 * Every PERMANENT on the mat, keyed by instance.
 *
 * Scoped to the two battlefield rows and the noncreature block on purpose. The
 * same card is drawn in several places at once — the commander appears in the
 * command-zone pile, in the hand fan and in the preview — so an unscoped sweep
 * compares one rendering of a card against a different rendering of the same
 * card and reports a 700px "shift" that is nothing of the kind.
 */
const cardBoxes = () => page.evaluate(() => {
  const out = [];
  const seen = new Set();
  for (const row of document.querySelectorAll('[aria-label]')) {
    const label = row.getAttribute('aria-label') || '';
    if (!/^(Creatures|Lands|Artifacts|Noncreature)/.test(label)) continue;
    for (const el of row.querySelectorAll('[data-instance]')) {
      const id = el.getAttribute('data-instance');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const r = el.getBoundingClientRect();
      if (r.width < 30) continue;
      out.push({
        id,
        tapped: el.getAttribute('data-tapped') === 'true',
        name: el.getAttribute('title') || '',
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      });
    }
  }
  return out;
});

/** How much of each battlefield row's width the cards actually reach across. */
const rowUse = () => page.evaluate(() =>
  [...document.querySelectorAll('[aria-label]')]
    .filter(el => /^(Creatures|Lands) — /.test(el.getAttribute('aria-label') || ''))
    .map(el => {
      const r = el.getBoundingClientRect();
      const cards = [...el.querySelectorAll('[data-instance]')]
        .map(s => s.getBoundingClientRect()).filter(b => b.width > 30);
      if (!cards.length) return null;
      const left = Math.min(...cards.map(c => c.x));
      const right = Math.max(...cards.map(c => c.x + c.width));
      return {
        row: el.getAttribute('aria-label'),
        cardWidth: Math.round(cards[0].width),
        rowSpan: `${Math.round(r.x)}..${Math.round(r.x + r.width)} (${Math.round(r.width)}px)`,
        cardSpan: `${Math.round(left)}..${Math.round(right)} (${Math.round(right - left)}px)`,
        usedPct: Math.round(((right - left) / r.width) * 100),
      };
    })
    .filter(Boolean));

/* -------------------------------------------------------------------- open */

/* Load once so Vite can finish optimising its dependencies, then reload and do
   the run on the second load. A dependency-optimisation reload arriving in the
   middle of a run wipes the table it had just dealt, and every symptom of that
   looks like a bug in the page rather than in the harness. */
await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
await shot('lobby');

log('start:', await pressText(/Start .*game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3500);
if (!(await game())) throw new Error('the table vanished after it was dealt — did Vite reload the page?');
await shot('table');
log('opening:', JSON.stringify(await game()));

/* Free cast, so a board can be built in a few turns rather than a dozen. */
log('menu:', await pressTitle('Game menu')); await sleep(1400);
log('free cast:', await pressTitle('ignore mana entirely')); await sleep(700);
await pressTitle('Close the menu'); await sleep(700);

/* --------------------------------------------------- the centre preview */

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .map(e => e.getAttribute('title'))
    .filter(t => t && t.includes('Click to preview')));

const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false;
  el.click();
  return true;
}, t);

/** Where the preview is on screen, and what it is offering. */
const preview = () => page.evaluate(() => {
  const panel = document.querySelector('[role="group"][aria-label]');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const card = panel.querySelector('[data-instance]');
  const cardBox = card ? card.getBoundingClientRect() : null;
  return {
    label: panel.getAttribute('aria-label'),
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    centreX: Math.round(r.x + r.width / 2),
    centreY: Math.round(r.y + r.height / 2),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    cardHeight: cardBox ? Math.round(cardBox.height) : null,
    actions: [...panel.querySelectorAll('button')].map(b => (b.innerText || '').trim()).filter(Boolean),
    /* The ways this could secretly be a modal.
       Note the play SURFACE is itself `fixed inset-0` and always has been —
       it is the immersive board, the same trade /life makes. What would make
       the preview a modal is a fixed box between it and that surface. */
    hasPortal: !panel.closest('#root'),
    fixedBetweenPanelAndBoard: (() => {
      let n = panel.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.position === 'fixed') {
          // The play surface itself is where the walk legitimately stops.
          return !(n.className.includes('inset-0') && n.className.includes('z-50'));
        }
        n = n.parentElement;
      }
      return false;
    })(),
    coversBoard: r.width >= window.innerWidth - 8 && r.height >= window.innerHeight - 8,
    /* Is the board still visible and alive around it? */
    seatsVisible: [...document.querySelectorAll('[aria-label^="Creatures"], [aria-label^="Lands"]')].length,
    backdrops: [...document.querySelectorAll('div')].filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && d.getBoundingClientRect().width >= window.innerWidth - 2 &&
        (cs.backdropFilter !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.opacity) > 0 &&
          d.getBoundingClientRect().height >= window.innerHeight - 2 && d.id !== 'root' && !d.className.includes('bg-background')));
    }).length,
  };
});

const land = (await handTitles()).find(t => t.includes('land drop'));
log('land in hand:', land);
if (land) {
  await clickHand(land);
  await sleep(900);
  await shot('centre-preview-land');
  log('PREVIEW:', JSON.stringify(await preview(), null, 1));

  log('pressed Play land:', await pressText(/^Play land$/));
  /* Mid-flight: the land is travelling from the hand to the mana row. A ghost
     on screen here is the animation doing its job; the reducer has already
     committed, so this screenshot is of narration, not of a gate. */
  await sleep(120);
  /* Counted BEFORE the screenshot: a capture takes long enough that a 220ms
     travel can finish during it, and the first version of this reported zero
     ghosts on a frame that plainly had one in it. */
  log('  ghosts in flight:', await page.evaluate(() =>
    document.querySelectorAll('[data-travel-layer] [data-instance]').length));
  await shot('land-in-flight');
  await sleep(1400);
  await shot('after-play-land');
  log('after:', JSON.stringify(await game()));
}

/* ------------------------------------------------------- build a board */

for (let turn = 0; turn < 7; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(450); await pressText(/^Play land$/); await sleep(650); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(400);
    if (await pressText(/^Cast$/)) await sleep(600);
  }
  await page.evaluate(() => document.body.click());
  await sleep(300);
  const g = await game();
  log(`  T${g.turn} ${g.step}: ${g.battlefield.length} permanents`);
  if (turn < 6) { await pressText(/^END TURN$/); await sleep(9000); }
}
await sleep(1500);
await shot('board-built');
log('board:', JSON.stringify((await game()).battlefield));

/* ------------------------------------------- BUG 4: row width use */

log('\n=== ROW WIDTH USE ===');
for (const r of await rowUse()) log('  ' + JSON.stringify(r));

/* ------------------------------------------- BUG 3: tap layout shift */

const before = await cardBoxes();
const tapped = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Tap /.test(b.getAttribute('title') || ''));
  if (!el) return null;
  const name = el.getAttribute('title');
  el.click();
  return name;
});
log('\n=== TAP SHIFT ===');
log('  tapped:', tapped);
await sleep(1500);
await shot('after-tap');

const after = await cardBoxes();
let moved = 0;
let worst = 0;
for (const b of before) {
  const a = after.find(x => x.id === b.id);
  if (!a) continue;
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w));
  if (d > 1) { moved++; worst = Math.max(worst, d); log(`   MOVED ${b.name} [${b.id}]: ${b.x},${b.y},${b.w} -> ${a.x},${a.y},${a.w}`); }
}
log(`  RESULT: ${moved} of ${before.length} card boxes moved, worst ${worst}px`);
log(`  (the tapped card itself must NOT be in that list: a rotation is not a layout change)`);

/*
 * And now the case the owner actually reported: a card on the OPPONENT'S side.
 * Their permanents carry no tap chip (you cannot operate someone else's board),
 * so the tap is dispatched through the same engine action the chip sends.
 */
const oppBefore = await cardBoxes();
const oppTapped = await page.evaluate(() => {
  const dispatch = window.__dmDispatch;
  const g = window.__dmGame;
  const p2 = g.players.find(p => p.id === 'p2');
  const id = p2.zones.battlefield.find(i => !g.cards[i].tapped);
  if (!id || !dispatch) return null;
  dispatch({ type: 'TAP', instanceId: id });
  return g.cards[id].name + ' [' + id + ']';
});
log(`
=== TAP SHIFT, OPPONENT SIDE ===`);
log('  tapped:', oppTapped);
await sleep(1500);
await shot('after-opponent-tap');
if (oppTapped) {
  const oppAfter = await cardBoxes();
  let m = 0, w = 0;
  for (const b of oppBefore) {
    const a = oppAfter.find(x => x.id === b.id);
    if (!a) continue;
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w));
    if (d > 1) { m++; w = Math.max(w, d); log(`   MOVED ${b.name} [${b.id}]: ${b.x},${b.y},${b.w} -> ${a.x},${a.y},${a.w}`); }
  }
  log(`  RESULT: ${m} of ${oppBefore.length} card boxes moved, worst ${w}px`);
}

/* ------------------------------------- the preview on a battlefield card */

const boardCard = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[title]')]
    .find(e => /Click to preview|^[A-Z]/.test(e.getAttribute('title') || '') && e.closest('[aria-label^="Creatures"], [aria-label^="Lands"]'));
  if (!el) return null;
  const name = el.getAttribute('title');
  el.click();
  return name;
});
log('\nclicked a permanent on the mat:', boardCard);
await sleep(900);
await shot('centre-preview-permanent');
log('PREVIEW:', JSON.stringify(await preview(), null, 1));

/* The game-over panel, which the spec calls out as a modal that has to be
   drawn into the mat instead. Ended here by conceding. */
await page.evaluate(() => window.__dmDispatch && window.__dmDispatch({ type: 'CONCEDE', playerId: 'p2' }));
await sleep(2500);
await shot('game-over');
log('\n=== GAME OVER PANEL ===');
log('  ' + JSON.stringify(await page.evaluate(() => {
  const g = window.__dmGame;
  const banner = [...document.querySelectorAll('p')].find(el => /wins\.|You win\.|draw\./.test(el.textContent || ''));
  if (!banner) return { status: g && g.status, panel: null };
  const panel = banner.closest('div');
  const r = panel.getBoundingClientRect();
  const cs = getComputedStyle(panel);
  return {
    status: g.status,
    text: banner.textContent,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    coversViewport: r.width >= window.innerWidth - 4 && r.height >= window.innerHeight - 4,
    backdropFilter: cs.backdropFilter,
    /* Anything full-screen that dims or blurs the board. */
    dimmers: [...document.querySelectorAll('div')].filter(d => {
      const c = getComputedStyle(d);
      const b = d.getBoundingClientRect();
      if (b.width < window.innerWidth - 4 || b.height < window.innerHeight - 4) return false;
      return c.backdropFilter !== 'none' || /rgba\(0, 0, 0, 0\.[1-9]/.test(c.backgroundColor);
    }).length,
  };
})));

await shot('final');
await browser.close();
process.exit(0);
