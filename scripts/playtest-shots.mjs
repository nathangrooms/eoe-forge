/**
 * Watch a real playtest game and prove it is the play board.
 *
 * Sibling of `play-preview-shots.mjs` and it reuses that script's harness
 * verbatim: the Vite HMR stub (other workstreams save while a run is going, and
 * every failed hot update reloads the page and throws away the table), the
 * Supabase block (the offline deck path deals a real 100-card list when the
 * database is unreachable, which it has been), and the load-then-reload dance
 * that keeps a dependency-optimisation reload out of the middle of a run.
 *
 * What it asserts, all of it measured rather than eyeballed:
 *
 *   1. the ENGINE is `src/lib/game` — `window.__dmGame` carries the real state,
 *      turns advance, life moves, permanents arrive;
 *   2. the BOARD is the play board — the same `aria-label`led seat rows the
 *      play harness measures, and a `data-instance` on every card;
 *   3. the HAND is visible, face up, for the seat being watched;
 *   4. the PLAY LINE says what was cast, from where, and what paid for it;
 *   5. the preview is READ-ONLY and is not a modal.
 *
 * Drop `DM_BLOCK_DB=0` to run against the live database instead.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/playtest';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const BLOCK_DB = process.env.DM_BLOCK_DB !== '0';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ----------------------------------------------------------------- harness */

const HARNESS_HTML = 'playtest-harness.html';
const HARNESS_ENTRY = 'src/dev/__playtestHarness.tsx';

const writeIfChanged = (file, body) => {
  try { if (fs.readFileSync(file, 'utf8') === body) return; } catch { /* absent */ }
  fs.writeFileSync(file, body);
};

fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(HARNESS_HTML, `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Playtest harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`);
writeIfChanged(HARNESS_ENTRY, `/* Gitignored puppeteer harness for the playtest. Written by
 * scripts/playtest-shots.mjs. Not shipped, not routed, not built. */
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
        <MemoryRouter initialEntries={['/play?mode=playtest']}>
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
  if (m.type() === 'error' || /\[playtest\]/.test(t)) log('  [' + m.type() + ']', t.slice(0, 180));
});

const VITE_CLIENT_STUB = `
export function createHotContext() {
  return {
    accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {},
  };
}
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
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
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

/* ------------------------------------------------------------ measurements */

/** The engine's own state, read out of the page rather than off the pixels. */
const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  return {
    id: g.id,
    turn: g.turn,
    step: g.step,
    status: g.status,
    active: g.activePlayerId,
    version: g.version,
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
    hands: g.players.map(p => p.zones.hand.length),
    boards: g.players.map(p => p.zones.battlefield.length),
    graveyards: g.players.map(p => p.zones.graveyard.length),
    logTail: g.log.slice(-4).map(e => e.message),
  };
});

/** The seat rows the play board draws. Same selector the play harness uses. */
const seatRows = () => page.evaluate(() =>
  [...document.querySelectorAll('[aria-label]')]
    .map(el => el.getAttribute('aria-label'))
    .filter(l => /^(Creatures|Lands|Artifacts|Noncreature)/.test(l || '')));

/** The fanned hand: every card drawn face up with a preview affordance. */
const handFan = () => page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'));
  const boxes = buttons.map(b => b.getBoundingClientRect());
  return {
    count: buttons.length,
    titles: buttons.slice(0, 4).map(b => b.getAttribute('title')),
    cardHeight: boxes.length ? Math.round(Math.max(...boxes.map(r => r.height))) : 0,
    /* Every card in the fan carries a real instance, so these are cards and not
       a row of placeholders. */
    instances: buttons.filter(b => b.querySelector('[data-instance]')).length,
    /* Face up: a card back is `CardBack`, which draws no instance id. */
    /* Castability, said loudly: a card the seat cannot pay for loses its
       colour. `GameCardView` applies it as a saturate-0 filter, so this reads
       the computed style rather than trusting a class name. */
    greyedOut: buttons.filter(b => {
      for (const el of b.querySelectorAll('*')) {
        if (/saturate\(0\)/.test(getComputedStyle(el).filter || '')) return true;
      }
      return false;
    }).length,
    playable: buttons.filter(b => /(You can cast|land drop)/.test(b.getAttribute('title') || '')).length,
  };
});

/** The sentence saying what the last decision was. */
const playLine = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('p')]
    .find(p => /^turn\s*\d+/i.test((p.innerText || '').trim()) && /(casts?|plays?|attacks?|blocks?|moves?)/.test(p.innerText));
  return el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : null;
});

/** The preview panel: where it is, what it offers, and whether it is a modal. */
const preview = () => page.evaluate(() => {
  const panel = document.querySelector('[role="group"][aria-label]');
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const card = panel.querySelector('[data-instance]');
  return {
    label: panel.getAttribute('aria-label'),
    centreX: Math.round(r.x + r.width / 2),
    centreY: Math.round(r.y + r.height / 2),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    cardHeight: card ? Math.round(card.getBoundingClientRect().height) : null,
    /* The close control is not a play. Anything else in here would be. */
    buttons: [...panel.querySelectorAll('button')].map(b => (b.innerText || '').trim()).filter(Boolean),
    saysWatching: /You are watching/.test(panel.innerText || ''),
    hasPortal: !panel.closest('#root'),
    coversBoard: r.width >= window.innerWidth - 8 && r.height >= window.innerHeight - 8,
    seatsVisible: [...document.querySelectorAll('[aria-label^="Creatures"], [aria-label^="Lands"]')].length,
    backdrops: [...document.querySelectorAll('div')].filter(d => {
      const cs = getComputedStyle(d);
      const b = d.getBoundingClientRect();
      return cs.position === 'fixed' && b.width >= window.innerWidth - 2 &&
        (cs.backdropFilter !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          parseFloat(cs.opacity) > 0 && b.height >= window.innerHeight - 2 &&
          d.id !== 'root' && !d.className.includes('bg-background')));
    }).length,
  };
});

/* -------------------------------------------------------------------- open */

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
await shot('lobby');

log('start:', await pressText(/^Play the \d+-player game$/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(2500);

const opening = await game();
if (!opening) throw new Error('the table vanished after it was dealt — did Vite reload the page?');
log('\n=== ENGINE ===');
log('  ' + JSON.stringify(opening));
await shot('opening');

/* ------------------------------------------------ 2. it is the play board */

log('\n=== BOARD ===');
log('  seat rows drawn by the play mat:', JSON.stringify(await seatRows()));

/* ------------------------------------------------------- 3. the hand */

log('\n=== HAND ===');
log('  ' + JSON.stringify(await handFan()));

/* ------------------------------------------------ 4. the read-only preview */

log('\n=== PREVIEW ===');
const opened = await page.evaluate(() => {
  /* A hand card first, because that is where the owner's complaint lives. A
     seat can genuinely empty its hand by turn sixteen, so a permanent on the
     mat is the fallback rather than a failed run. */
  const inHand = [...document.querySelectorAll('button[title]')]
    .find(b => (b.getAttribute('title') || '').includes('Click to preview'));
  if (inHand) { inHand.click(); return inHand.getAttribute('title'); }
  const onMat = [...document.querySelectorAll('[aria-label^="Creatures"] [data-instance], [aria-label^="Lands"] [data-instance]')][0];
  if (!onMat) return null;
  const button = onMat.closest('button') || onMat;
  button.click();
  return onMat.getAttribute('title') || onMat.getAttribute('data-instance');
});
log('  clicked:', opened);
await sleep(900);
log('  ' + JSON.stringify(await preview(), null, 1));
await shot('preview');
/* Dismiss by pressing the mat. A real pointer press, not `element.click()`:
   the panel listens on `pointerdown` so that clicking straight from one card to
   another is one gesture instead of two, and a synthetic click never fires it.
   There is no backdrop to press through, which is the point. */
await page.mouse.click(60, 900);
await sleep(500);
log('  dismissed by pressing the mat:', (await preview()) === null);

/* --------------------------------------------- let it play for a while */

log('\n=== WATCHING ===');
await pressText(/^4x$/);
for (let i = 0; i < 6; i++) {
  await sleep(4000);
  const g = await game();
  const line = await playLine();
  log(`  T${g.turn} ${g.step}  life ${g.life}  boards ${JSON.stringify(g.boards)}  hands ${JSON.stringify(g.hands)}`);
  if (line) log('    play line: ' + line);
}
await pressText(/^Pause$/);
await sleep(700);
await shot('mid-game');

const mid = await game();
log('\n  turns advanced:', opening.turn, '->', mid.turn);
log('  permanents:', JSON.stringify(opening.boards), '->', JSON.stringify(mid.boards));
log('  log tail:', JSON.stringify(mid.logTail));
log('  hand on screen:', JSON.stringify(await handFan()));
log('  play line:', await playLine());

/* ------------------------------------------------- 5. the seat controls */

log('\n=== WATCHING A DIFFERENT SEAT ===');
await page.evaluate(() => document.body.click());
await sleep(400);
const seats = await page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .filter(b => /^Watch the table from/.test(b.getAttribute('title') || ''))
    .map(b => b.getAttribute('title')));
log('  seat buttons:', JSON.stringify(seats));
/* By INDEX, not by title: with the database blocked both seats are dealt the
   same offline list and therefore carry the same commander's name, so matching
   on the title would press the first button twice and report no change. */
const switched = await page.evaluate(() => {
  const all = [...document.querySelectorAll('button[title]')]
    .filter(b => /^Watch the table from/.test(b.getAttribute('title') || ''));
  const next = all.find(b => b.getAttribute('aria-pressed') !== 'true');
  if (!next) return false;
  next.click();
  return true;
});
log('  switched seats:', switched);
await sleep(1400);
log('  after switching, hand on screen:', JSON.stringify(await handFan()));
log('  after switching, board rows:', JSON.stringify(await seatRows()));
await shot('second-seat');

/* Follow the turn: the board re-seats itself on whoever is acting, so the hand
   on screen is always the hand of the seat taking decisions. */
log('\n=== FOLLOW THE TURN ===');
const watchedName = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .filter(b => /^Watch the table from/.test(b.getAttribute('title') || ''))
    .filter(b => b.getAttribute('aria-pressed') === 'true')
    .map(b => (b.innerText || '').trim())[0] ?? null);
log('  watching now:', await watchedName());
log('  follow pressed:', await pressTitle('Move to whichever seat is taking its turn'));
await sleep(600);
log('  active seat:', (await game()).active, ' watching:', await watchedName());
await pressText(/^Play$/);
for (let i = 0; i < 3; i++) {
  await sleep(3500);
  const g = await game();
  log('  T' + g.turn + ' active ' + g.active + ' -> watching ' + (await watchedName()) +
      '  hand ' + (await handFan()).count);
}
await pressText(/^Pause$/);
await sleep(500);
await shot('following');

log('\n  one seat:', await pressTitle('Fill the screen with the seat'));
await sleep(1200);
log('  seat rows now:', JSON.stringify(await seatRows()));
await shot('one-seat');

await browser.close();
log('\ndone. shots in ' + OUT);
