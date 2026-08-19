/**
 * Play a real game of /play and check the RULES, not the pixels.
 *
 * Sibling of `play-preview-shots.mjs`, and it borrows that script's harness
 * verbatim: the dev-only entry that mounts the REAL `Play` page with the app's
 * providers and no auth gate, plus the Vite hot-reload stub that stops another
 * workstream's save from reloading the page mid-run.
 *
 * ## Why this one FEEDS the card queries instead of blocking them
 *
 * `play-preview-shots.mjs` aborts every Supabase request, so `deckSource.ts`
 * falls to `fallbackDeck()` — the offline list. That is the right default for a
 * LAYOUT measurement and it is useless for a RULES one, because the offline
 * list holds no card that counters a spell and no card with a trigger the
 * engine declines to resolve. Two of the questions this script exists to answer
 * are unreachable on it.
 *
 * So the card table is answered rather than refused, from a small synthetic
 * pool defined below. Nothing else changes: `buildSeedDeck`, `buildTable`, the
 * reducer, the bot, the stack, the mat and every component are the shipped
 * ones. The rows are INPUT, and they are declared here in full so nothing in
 * the output is taken on trust.
 *
 *   node scripts/play-rules-audit.mjs            synthetic pool (default)
 *   DM_POOL=offline node scripts/play-rules-audit.mjs   the fallback deck
 *
 * BASE defaults to http://127.0.0.1:8101.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const POOL = process.env.DM_POOL || 'synthetic';
const OUT = '.shots/rules-audit';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let shotN = 0;

/* ------------------------------------------------------- the synthetic pool */

const VIAL_TEXT =
  'At the beginning of your upkeep, you may put a charge counter on Aether Vial.\n' +
  '{T}: You may put a creature card with mana value equal to the number of charge ' +
  'counters on Aether Vial from your hand onto the battlefield.';

const row = o => ({
  mana_cost: null, cmc: 0, type_line: '', oracle_text: '', power: null, toughness: null,
  color_identity: ['U'], keywords: [], is_legendary: false, image_url: null, ...o,
});

const LEGENDS = [
  row({
    id: 'L1', name: 'Tidewarden Sage', mana_cost: '{2}{U}{U}', cmc: 4,
    type_line: 'Legendary Creature — Merfolk Wizard', power: '3', toughness: '3',
    is_legendary: true, oracle_text: '',
  }),
];

/* 44 plain blue bodies, so `buildSeedDeck`'s 65% creature target is met without
   repeating one row 40 times. Deliberately vanilla: this run is about the
   stack, not about card text. */
const CREATURES = Array.from({ length: 44 }, (_, i) => {
  const cmc = 1 + (i % 4);
  return row({
    id: `C${i}`,
    name: `Reef Sentry ${i}`,
    mana_cost: cmc === 1 ? '{U}' : `{${cmc - 1}}{U}`,
    cmc,
    type_line: 'Creature — Merfolk Soldier',
    power: String(cmc),
    toughness: String(cmc),
    oracle_text: '',
  });
});

/* 21 counterspells and 6 vials. `chooseSpell` in bot.ts only casts permanents,
   so the vials are what the bot puts down and the counters are what a hand
   holds — which is exactly the shape the two questions need. */
const OTHERS = [
  ...Array.from({ length: 21 }, (_, i) =>
    row({
      id: `X${i}`, name: 'Counterspell', mana_cost: '{U}{U}', cmc: 2,
      type_line: 'Instant', oracle_text: 'Counter target spell.',
    })
  ),
  ...Array.from({ length: 20 }, (_, i) =>
    row({
      id: `V${i}`, name: 'Aether Vial', mana_cost: '{1}', cmc: 1,
      type_line: 'Artifact', color_identity: [], oracle_text: VIAL_TEXT,
    })
  ),
];

const BASICS = name =>
  Array.from({ length: 2 }, (_, i) =>
    row({
      id: `B-${name}-${i}`, name, cmc: 0,
      type_line: `Basic Land — ${name}`,
      color_identity: name === 'Island' ? ['U'] : [],
      oracle_text: '',
    })
  );

/** Answer one `/rest/v1/cards` request the way the live table would. */
function cardsFor(url) {
  const q = decodeURIComponent(url);
  const name = /name=eq\.([A-Za-z]+)/.exec(q);
  if (name) return BASICS(name[1]);
  if (/is_legendary=eq\.true/.test(q)) return LEGENDS;
  return [...CREATURES, ...OTHERS];
}

/* -------------------------------------------------------------- the harness */

const HARNESS_HTML = 'play-harness.html';
const HARNESS_ENTRY = 'src/dev/__playHarness.tsx';

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
  } else { style.textContent = content; }
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (style) { document.head.removeChild(style); sheets.delete(id); }
}
export function injectQuery(url) { return url; }
`;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 240)));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') log('  [error]', t.slice(0, 200));
});

/* supabase-js sends `apikey` and `authorization`, which are not simple headers,
   so Chrome preflights every card query. A canned 200 with no CORS headers is
   rejected before the page ever sees it — the first run of this script blocked
   its own pool that way and silently measured the offline deck instead. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
  'access-control-allow-headers':
    'authorization,apikey,x-client-info,content-type,accept-profile,content-profile,prefer,range',
  'access-control-expose-headers': 'content-range',
  'access-control-max-age': '600',
};

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  }
  if (/supabase\.co\/rest\/v1\/cards/.test(url) && POOL === 'synthetic') {
    if (req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: CORS, body: '' });
    }
    return req.respond({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(cardsFor(url)),
    });
  }
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

const shot = async name => {
  const file = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
};

/* ------------------------------------------------------------- page probes */

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const buttons = () => page.evaluate(() =>
  [...document.querySelectorAll('button')].map(b => ({
    text: (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    title: (b.getAttribute('title') || '').slice(0, 90),
    disabled: b.disabled,
  })).filter(b => b.text || b.title));

const openingBar = () => page.evaluate(() => {
  const bar = document.querySelector('[role="group"][aria-label="Opening hand"]');
  if (!bar) return null;
  return {
    headline: bar.querySelector('p')?.textContent ?? '',
    detail: bar.querySelectorAll('p')[1]?.textContent ?? '',
    buttons: [...bar.querySelectorAll('button')].map(b => ({
      text: (b.innerText || '').trim(), disabled: b.disabled,
    })),
  };
});

const stackStrip = () => page.evaluate(() => {
  const strip = document.querySelector('[role="group"][aria-label="The stack"]');
  if (!strip) return null;
  const rows = [...strip.querySelectorAll('.flex.items-baseline')].map(r =>
    [...r.children].map(c => (c.textContent || '').trim()));
  return {
    headline: strip.querySelectorAll('span')[2]?.textContent ?? '',
    rows,
    buttons: [...strip.querySelectorAll('button')].map(b => (b.innerText || '').trim()),
    /* Every way this could secretly be a modal. The play SURFACE is itself
       `fixed inset-0 z-50` and always has been; what would make the strip a
       modal is a fixed box between it and that surface, a portal outside
       #root, or anything dimming the board behind it. */
    outsideRoot: !strip.closest('#root'),
    fixedAncestorBetween: (() => {
      let n = strip.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.position === 'fixed') {
          return !(n.className.includes('inset-0') && n.className.includes('z-50'));
        }
        n = n.parentElement;
      }
      return false;
    })(),
    dialogAncestor: !!strip.closest('[role="dialog"],[role="alertdialog"],[data-radix-portal]'),
    backdrops: [...document.querySelectorAll('div')].filter(d => {
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      if (cs.position !== 'fixed') return false;
      if (r.width < window.innerWidth - 2 || r.height < window.innerHeight - 2) return false;
      if (d.id === 'root' || d.className.includes('bg-background')) return false;
      return cs.backdropFilter !== 'none' ||
        (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.opacity) > 0);
    }).length,
    seatsVisible: document.querySelectorAll('[aria-label^="Creatures"], [aria-label^="Lands"]').length,
  };
});

const dutyStrip = () => page.evaluate(() => {
  const strips = [...document.querySelectorAll('[role="group"]')]
    .filter(el => /manual|duty|duties|resolve/i.test(el.getAttribute('aria-label') || ''));
  if (strips.length === 0) return null;
  const el = strips[0];
  return {
    label: el.getAttribute('aria-label'),
    text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    buttons: [...el.querySelectorAll('button')].map(b => (b.innerText || '').trim()),
  };
});

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .map(e => e.getAttribute('title'))
    .filter(t => t && /Click to preview/i.test(t)));

const clickHandByTitle = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false;
  el.click();
  return true;
}, t);

const clickHandIndex = i => page.evaluate(i => {
  const els = [...document.querySelectorAll('button[title]')]
    .filter(e => /Click to preview/i.test(e.getAttribute('title') || ''));
  if (!els[i]) return null;
  const title = els[i].getAttribute('title');
  els[i].click();
  return title;
}, i);

/* Snapshot of the live reducer state, for the checks that are about rules. */
const SNAP = `(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const manaSources = p => p.zones.battlefield
    .map(id => g.cards[id])
    .filter(c => c && !c.tapped && /land/i.test(c.typeLine || ''));
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId,
    priority: g.priorityPlayerId, status: g.status,
    stack: (g.stack || []).map(s => ({
      stackId: s.stackId, name: s.name, by: s.controllerId,
      cmc: s.cardInstanceId && g.cards[s.cardInstanceId] ? g.cards[s.cardInstanceId].cmc : null,
      cost: s.cardInstanceId && g.cards[s.cardInstanceId] ? g.cards[s.cardInstanceId].manaCost : null,
      effects: (s.effects || []).map(e => e.kind || e.type || JSON.stringify(e).slice(0, 40)),
      targets: (s.targets || []).map(t => t.stackId || t.instanceId || t.playerId || '?'),
    })),
    players: g.players.map(p => ({
      id: p.id, name: p.name, life: p.life,
      hand: p.zones.hand.map(id => ({
        name: g.cards[id].name, cmc: g.cards[id].cmc,
        type: g.cards[id].typeLine, text: (g.cards[id].oracleText || '').slice(0, 40),
      })),
      library: p.zones.library.length,
      libraryBottom: p.zones.library.slice(-3).map(id => g.cards[id].name),
      battlefield: p.zones.battlefield.map(id => ({
        name: g.cards[id].name, tapped: g.cards[id].tapped, type: g.cards[id].typeLine,
        counters: g.cards[id].counters || {},
      })),
      graveyard: p.zones.graveyard.map(id => g.cards[id].name),
      untappedMana: manaSources(p).length,
    })),
  };
})()`;

const snap = () => page.evaluate(SNAP);

/**
 * The strip and the reducer read in ONE evaluate.
 *
 * Two separate calls are two different frames: a run that snapshotted the state
 * and then queried the DOM reported the strip offering a counter to a seat that
 * no longer held priority, which is structurally impossible — `StackStrip`
 * draws the buttons behind `yourPriority`. It was the read that was stale, not
 * the page, and a review that reported it as a defect would have been wrong.
 */
const stripAndState = () => page.evaluate(SNAPSRC => {
  const take = new Function('return ' + SNAPSRC);
  const strip = document.querySelector('[role="group"][aria-label="The stack"]');
  return {
    state: take(),
    buttons: strip
      ? [...strip.querySelectorAll('button')].map(b => (b.innerText || '').trim())
      : null,
  };
}, SNAP);

/* `CenterPreview` labels itself "<card name>, <zone>", so the panel is found by
   the card that is in it rather than by a guess at the word "preview". */
const previewButtons = name => page.evaluate(name => {
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => (p.getAttribute('aria-label') || '').startsWith(name + ','));
  if (!panel) return null;
  return {
    label: panel.getAttribute('aria-label'),
    buttons: [...panel.querySelectorAll('button')]
      .map(b => (b.innerText || '').trim()).filter(Boolean),
    text: (panel.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
  };
}, name);

/* --------------------------------------------------------------------- run */

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

log('pool:', POOL);
log('start pressed:', await pressText(/Start .*game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 300 });

/* Record EVERY state the reducer produces, not a sample of them. `__dmGame` is
   reassigned on each dispatch, so an identity check in a rAF loop cannot miss
   one — which a 100 ms poll against a 750 ms bot timer can. */
await page.evaluate(SNAPSRC => {
  const take = new Function('return ' + SNAPSRC);
  window.__audit = { states: [], last: null };
  const loop = () => {
    const g = window.__dmGame;
    if (g && g !== window.__audit.last) {
      window.__audit.last = g;
      try { window.__audit.states.push(take()); } catch (e) { /* mid-update */ }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, SNAP);

await sleep(2500);
await shot('dealt');

/* ======================================================= 1. THE MULLIGAN === */

log('\n=== 1. MULLIGAN ===');
const openA = await snap();
const me = s => s.players[0];
log('  dealt hand:', me(openA).hand.map(c => c.name).join(', '));
log('  library:', me(openA).library);
log('  bar:', JSON.stringify(await openingBar()));

log('  press Mulligan:', await pressText(/^Mulligan$/));
await sleep(900);
const openB = await snap();
log('  after mulligan  hand size:', me(openB).hand.length, 'library:', me(openB).library);
log('  hand now:', me(openB).hand.map(c => c.name).join(', '));
log('  bar:', JSON.stringify(await openingBar()));
await shot('after-mulligan');

log('  press Keep:', await pressText(/^Keep$/));
await sleep(700);
log('  bar (bottoming):', JSON.stringify(await openingBar()));

const beforeBottom = await snap();
const pickedTitle = await clickHandIndex(0);
log('  clicked hand card 0:', pickedTitle);
await sleep(500);
log('  bar after pick:', JSON.stringify(await openingBar()));
await shot('bottoming');

log('  press Start the game:', await pressText(/^Start the game$/));
await sleep(900);
const afterBottom = await snap();
log('  hand size:', me(beforeBottom).hand.length, '->', me(afterBottom).hand.length);
log('  library:', me(beforeBottom).library, '->', me(afterBottom).library);
log('  bottom three of library:', me(afterBottom).libraryBottom.join(', '));
log('  mulligan bar gone:', (await openingBar()) === null);
await shot('game-started');

/* ============================================ 2. PLAY, WATCH, AND ANSWER === */

log('\n=== 2. PLAYING ===');

/**
 * One turn of the human seat.
 *
 * It plays its land, puts an Aether Vial down if it has one, and then STOPS.
 *
 * Holding the rest of the mana up is the whole point. The first run of this
 * script cast a creature every turn, tapped out doing it, and so had zero
 * untapped sources on every opponent turn — which meant `responseOptions` was
 * correctly empty for sixteen straight turns and the counterspell question was
 * never actually asked. A player who wants to counter something holds mana; so
 * does this.
 */
async function humanTurn() {
  const titles = await handTitles();
  const land = titles.find(t => /land drop/i.test(t));
  if (land) {
    await clickHandByTitle(land); await sleep(350);
    await pressText(/^Play land$/); await sleep(600);
  }
  const vial = (await handTitles()).find(t => /Aether Vial/i.test(t));
  if (vial) {
    await clickHandByTitle(vial); await sleep(350);
    if (await pressText(/^Cast$/)) await sleep(900);
  }
  await page.evaluate(() => document.body.click());
  await sleep(150);
}

/**
 * Is a sorcery-speed spell offered on somebody else's turn?
 *
 * Asked the way a player asks it: open a creature in hand from the mat and read
 * the buttons the preview draws. `cardActions.ts` is the only thing that
 * decides what is on that row.
 */
const timingProbe = [];
async function probeTiming(s) {
  const mine = s.players.find(p => p.id === 'p1');
  const creature = mine.hand.find(c => /creature/i.test(c.type || '') && (c.cmc ?? 99) <= mine.untappedMana);
  if (!creature) return;
  const opened = await page.evaluate(name => {
    const el = [...document.querySelectorAll('button[title]')]
      .find(e => /Click to preview/i.test(e.getAttribute('title') || '') &&
                 (e.getAttribute('title') || '').startsWith(name));
    if (!el) return false;
    el.click();
    return true;
  }, creature.name);
  if (!opened) return;
  await sleep(320);
  const offered = await previewButtons(creature.name);
  timingProbe.push({
    turn: s.turn, step: s.step, activeSeat: s.active, priority: s.priority,
    card: creature.name, type: creature.type, cmc: creature.cmc,
    mana: mine.untappedMana, offered,
  });
  await page.evaluate(() => document.body.click());
  await sleep(120);
}

/**
 * The main loop. It reads the reducer and the strip at the same instant, and it
 * keeps the game MOVING: a bot that has declared an attack waits forever for a
 * human defender, so a run that never answers the blocker step measures four
 * turns and calls it a game.
 */
const answered = [];
const counterAttempts = [];
const dutySightings = [];
let dutyResolved = null;
let blockSteps = 0;
let stallTurns = 0;
let lastTurn = -1;

for (let tick = 0; tick < 900; tick++) {
  const s = await snap();
  if (!s) break;
  if (s.status !== 'playing') { log('  game over on turn', s.turn); break; }

  if (s.turn === lastTurn) stallTurns++; else { stallTurns = 0; lastTurn = s.turn; }
  if (stallTurns > 260) { log('  STALLED on turn', s.turn, s.step, 'priority', s.priority); break; }

  /* Something on the stack. Read what the strip says, then decide. */
  if (s.stack.length > 0) {
    const paired = await stripAndState();
    if (paired.buttons) answered.push({ paired });
    const strip = await stackStrip();
    if (strip) {
      answered.push({ strip, state: s });
      const counterBtn = strip.buttons.find(b => /^Counter with/i.test(b));
      if (counterBtn && counterAttempts.length === 0) {
        const target = s.stack[s.stack.length - 1];
        log('  COUNTER OFFERED:', counterBtn, '  against', JSON.stringify(target));
        await shot('counter-offered');
        const pressed = await pressText(/^Counter with/);
        await sleep(600);
        const onStack = await snap();
        const twoDeep = await stackStrip();
        answered.push({ strip: twoDeep, state: onStack });
        log('  stack right after pressing it:', JSON.stringify(onStack.stack.map(o => o.name)));
        log('  strip with two on it:', JSON.stringify(twoDeep && twoDeep.rows));
        await shot('counter-on-stack');
        /* Both seats have to pass for it to resolve. The surface passes for us
           when we hold no further answer; press it anyway if it is offered. */
        for (let k = 0; k < 12; k++) {
          const now = await snap();
          if (now.stack.length === 0) break;
          if (now.priority === 'p1') await pressText(/^Let it resolve$/);
          await sleep(400);
        }
        const after = await snap();
        counterAttempts.push({ pressed, target, after });
        await shot('after-counter');
        continue;
      }
      if (strip.buttons.some(b => /^Let it resolve$/i.test(b)) && s.priority === 'p1') {
        await pressText(/^Let it resolve$/);
      }
    }
    await sleep(200);
    continue;
  }

  /* A trigger the engine declines to resolve. Does the BOARD say so, and can it
     be done by hand from there? */
  const duty = await dutyStrip();
  if (duty) {
    dutySightings.push({ turn: s.turn, step: s.step, active: s.active, duty });
    if (!dutyResolved) {
      await shot('duty-strip');
      const vial = s.players[0].battlefield.find(b => /Aether Vial/i.test(b.name));
      /* The strip's own row is the way in: press it and the mat opens that
         permanent, which is where the counter lives. */
      const openedFromStrip = await page.evaluate(() => {
        const strip = [...document.querySelectorAll('[role="group"]')]
          .find(el => /resolve by hand/i.test(el.getAttribute('aria-label') || ''));
        if (!strip) return false;
        const row = [...strip.querySelectorAll('button')]
          .find(b => !/put this away/i.test(b.getAttribute('aria-label') || '') &&
                     (b.innerText || '').trim().length > 0);
        if (!row) return false;
        row.click();
        return true;
      });
      await sleep(700);
      const panel = vial ? await previewButtons(vial.name) : null;
      const before = await snap();
      const findCharge = () => page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => (x.getAttribute('title') || '') === 'Put one on' &&
                     /^charge/i.test((x.innerText || '').trim()));
        if (!b) return false;
        b.click();
        return true;
      });
      let pressed = (await findCharge()) ? 'charge' : null;
      if (!pressed) {
        /* Not on the front row: `COUNTER_PRESETS` puts charge behind the
           "More counters" disclosure. A player would press that. */
        const more = await pressText(/^More counters$/);
        await sleep(500);
        pressed = (await findCharge()) ? 'charge (behind More counters)' : `not found (More counters: ${more})`;
      }
      await sleep(600);
      const after = await snap();
      dutyResolved = {
        openedFromStrip, panel, pressed,
        counterButtons: await page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter(b => (b.getAttribute('title') || '') === 'Put one on')
            .map(b => (b.innerText || '').trim())),
        vialBefore: before.players[0].battlefield.find(b => /Aether Vial/i.test(b.name)) ?? null,
        vialAfter: after.players[0].battlefield.find(b => /Aether Vial/i.test(b.name)) ?? null,
      };
      await shot('duty-resolved');
      await page.evaluate(() => document.body.click());
      await sleep(300);
    }
    /* Wave it away, which is what releases the step. `decisionFor` reports a
       duty as a decision so the 130 ms walk cannot run the upkeep out from
       under you; the strip's own dismiss is the only thing that lets go. */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('aria-label') || '') === 'Put this away for now');
      if (b) b.click();
    });
    await sleep(300);
    continue;
  }

  /* Blocks. Put a body in the way if the mat offers one, else say no blocks. */
  if (s.step === 'declare_blockers') {
    const blocked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => !x.disabled && /^Block with /.test(x.getAttribute('title') || ''));
      if (!b) return null;
      const t = b.getAttribute('title');
      b.click();
      return t;
    });
    if (blocked) {
      await sleep(400);
      const confirmed = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')]
          .find(x => !x.disabled && /^Block /.test((x.innerText || '').trim()));
        if (!b) return false;
        b.click();
        return true;
      });
      if (blockSteps < 3) log(`  blocked: ${blocked} (confirmed ${confirmed})`);
    }
    blockSteps++;
    await pressText(/^NO BLOCKS$/);
    await sleep(500);
    continue;
  }

  /* Only from a main phase. END TURN sets `forcing` and sweeps the rest of the
     turn ignoring every decision, so a loop that presses it from the untap step
     bulldozes its own upkeep and then reports that the board said nothing about
     the trigger sitting on it. That is a harness bug and it cost one run. */
  if (s.active === 'p1' && /_main$/.test(s.step)) {
    await humanTurn();
    const s2 = await snap();
    if (s2.stack.length === 0 && s2.active === 'p1') await pressText(/^END TURN$/);
    await sleep(500);
    continue;
  }

  /* Somebody else's turn, nothing on the stack: is a sorcery-speed spell
     being offered anyway? Sampled a few times so one lucky frame proves
     nothing either way. */
  if (timingProbe.length < 6 && /^(untap|upkeep|draw|end|cleanup|declare_)/.test(s.step)) {
    await probeTiming(s);
  }

  await sleep(220);
}

await shot('mid-game');

/* ====================================================== 3. WHAT WE SAW ==== */

const states = await page.evaluate(() => window.__audit.states);
log('\n=== 3. RECORDED STATES:', states.length, '===');

/* Every cast, with the caster's untapped mana in the state BEFORE it. */
const seen = new Set();
const casts = [];
for (let i = 0; i < states.length; i++) {
  const s = states[i];
  const prev = states[i - 1];
  for (const obj of s.stack) {
    if (seen.has(obj.stackId)) continue;
    seen.add(obj.stackId);
    const before = prev ? prev.players.find(p => p.id === obj.by) : null;
    casts.push({
      turn: s.turn, step: s.step, by: obj.by, name: obj.name, cmc: obj.cmc,
      manaBefore: before ? before.untappedMana : null,
      handBefore: before ? before.hand.length : null,
    });
  }
}

log('\n--- EVERY SPELL PUT ON THE STACK ---');
for (const c of casts) {
  const bad = c.manaBefore !== null && c.cmc !== null && c.cmc > c.manaBefore;
  log(`  T${c.turn} ${c.step.padEnd(16)} ${c.by}  ${String(c.name).padEnd(22)} cmc ${c.cmc}  untapped mana before ${c.manaBefore}${bad ? '   <<<< UNPAYABLE' : ''}`);
}
const unpayable = casts.filter(c => c.manaBefore !== null && c.cmc !== null && c.cmc > c.manaBefore);
log(`  casts: ${casts.length}  by bots: ${casts.filter(c => c.by !== 'p1').length}  unpayable: ${unpayable.length}`);

/* Was a response offered exactly when one was legal? */
log('\n--- THE RESPONSE PROMPT ---');
let promptRows = 0;
let mismatches = 0;
for (const a of answered) {
  const s = a.paired ? a.paired.state : a.state;
  if (!s || s.stack.length === 0) continue;
  if (!a.paired) continue;
  const top = s.stack[s.stack.length - 1];
  const mine = s.players.find(p => p.id === 'p1');
  const yours = s.priority === 'p1';
  const instants = mine.hand.filter(c => /instant/i.test(c.type || '') || /flash/i.test(c.text || ''));
  const payable = instants.filter(c => (c.cmc ?? 0) <= mine.untappedMana);
  const offered = a.paired.buttons.filter(b => !/^Let it resolve$/i.test(b));
  const expected = yours && top.by !== 'p1' ? payable.length : 0;
  const flag = offered.length !== expected ? '   <<<< MISMATCH' : '';
  if (flag) mismatches++;
  if (promptRows++ < 26) {
    log(`  T${s.turn} top=${top.name}(${top.by}) prio=${s.priority} instants=${instants.length} payable=${payable.length} mana=${mine.untappedMana} offered=${offered.length} ${JSON.stringify(offered.map(b => b.replace(/\s+/g, ' '))).slice(0, 70)}${flag}`);
  }
}
log(`  samples: ${promptRows}  offered != (holds one AND can pay AND has priority): ${mismatches}`);

log('\n--- THE STACK STRIP ITSELF ---');
const anyStrip = answered.find(a => a.strip);
log('  ', anyStrip ? JSON.stringify({
  headline: anyStrip.strip.headline,
  rows: anyStrip.strip.rows,
  outsideRoot: anyStrip.strip.outsideRoot,
  fixedAncestorBetween: anyStrip.strip.fixedAncestorBetween,
  dialogAncestor: anyStrip.strip.dialogAncestor,
  backdrops: anyStrip.strip.backdrops,
  seatsVisible: anyStrip.strip.seatsVisible,
}, null, 1) : 'the stack strip was never on screen');

/* Stack ORDER: does the strip read top first? */
const multi = answered.find(a => a.state && a.state.stack.length > 1);
log('\n--- STACK ORDER (more than one object) ---');
log('  ', multi ? JSON.stringify({ engine: multi.state.stack.map(o => o.name), strip: multi.strip.rows }) : 'never held more than one object');

log('\n--- SORCERY-SPEED TIMING, ON SOMEBODY ELSE\'S TURN ---');
if (timingProbe.length === 0) log('  never got a payable creature in hand on an opponent step');
for (const p of timingProbe) {
  const btns = p.offered ? p.offered.buttons : null;
  const bad = btns && btns.some(b => /^Cast/i.test(b));
  log(`  T${p.turn} ${p.step.padEnd(17)} active=${p.activeSeat} prio=${p.priority}  ${p.card} (${p.type}, cmc ${p.cmc}, mana ${p.mana})`);
  log(`      preview offers: ${JSON.stringify(btns)}${bad ? '   <<<< CAST OFFERED OUT OF TURN' : ''}`);
}
const outOfTurnCast = timingProbe.filter(p => p.offered && p.offered.buttons.some(b => /^Cast/i.test(b)));
log(`  probes: ${timingProbe.length}  offering Cast out of turn: ${outOfTurnCast.length}`);

log('\n--- COUNTERING ---');
if (counterAttempts.length === 0) log('  no counter was ever offered');
for (const c of counterAttempts) {
  const owner = c.after.players.find(p => p.id === c.target.by);
  log('  pressed:', c.pressed, 'target:', c.target.name, 'by', c.target.by);
  log('  their graveyard after:', owner.graveyard.join(', ') || '(empty)');
  log('  their battlefield after:', owner.battlefield.map(b => b.name).join(', ') || '(empty)');
  log('  stack after:', JSON.stringify(c.after.stack));
}

/* ============================================== 4. AN UNAUTOMATED TRIGGER == */

log('\n=== 4. UNAUTOMATED TRIGGER ===');
const now = await snap();
log('  my board:', now.players[0].battlefield.map(b => b.name).join(', ') || '(empty)');
log('  their board:', now.players[1].battlefield.map(b => b.name).join(', ') || '(empty)');
log('  duty strip at the end of the game:', JSON.stringify(await dutyStrip()));
/* Post-hoc from the recorded states, so a poll that happened to look away
   cannot be mistaken for a board that said nothing. */
const vialUpkeeps = states.filter(s =>
  s.active === 'p1' && s.step === 'upkeep' &&
  s.players[0].battlefield.some(b => /Aether Vial/i.test(b.name)));
log('  my own upkeeps with an Aether Vial down:', vialUpkeeps.length,
  vialUpkeeps.map(s => `T${s.turn}`).join(' '));
log('  times the board said a trigger was owed:', dutySightings.length);
for (const d of dutySightings.slice(0, 4)) {
  log(`   T${d.turn} ${d.step} active=${d.active}  ${d.duty.label}`);
  log(`      ${d.duty.text}`);
}
log('  resolving it by hand:', JSON.stringify(dutyResolved, null, 1));

log('\n--- BUTTONS ON SCREEN AT THE END ---');
for (const b of (await buttons()).slice(0, 40)) log('  ', JSON.stringify(b));

const final = await snap();
log('\nfinal:', JSON.stringify({ turn: final.turn, step: final.step, status: final.status,
  life: final.players.map(p => `${p.name}:${p.life}`).join(' '),
  boards: final.players.map(p => `${p.id}:${p.battlefield.length}`).join(' ') }));

await browser.close();
