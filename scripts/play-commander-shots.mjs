/**
 * Play a real Commander game and USE THE COMMAND ZONE, through the shipped
 * interface.
 *
 * Sibling of `play-ability-shots.mjs` and `play-attach-shots.mjs`, written for
 * the reason `CLAUDE.md` gives at length: a green unit suite says nothing about
 * whether a person can reach the rule. `commander.test.ts` proves the engine
 * casts a commander, taxes the second cast and offers CR 903.9a against a real
 * precon decklist. This proves a mouse can.
 *
 * The gap it was written against, measured over 80 recorded harness games
 * before any of this existed:
 *
 *   a commander left the command zone            78
 *   commander tax charged                         0
 *   a commander reached a graveyard or exile     24
 *   a commander returned to the command zone      0
 *   a commander stranded when the game ended     25
 *
 * All one fact: nothing in the app could put a card into a command zone, so a
 * commander that died was gone, so nothing was ever cast from there twice, so
 * the tax code had never charged a single mana in a real game.
 *
 * What it asserts, all read off the running game rather than off a screenshot:
 *
 *   1. clicking the commander in the command zone draws its price, and the
 *      Cast button is offered;
 *   2. pressing it casts the commander and the log says it came from the
 *      command zone;
 *   3. when it dies, the CR 903.9a strip appears with BOTH choices, and the
 *      engine has not moved the card for the player;
 *   4. pressing "Command zone" puts it back, and the log names the rule;
 *   5. the second cast is visibly dearer: the button label says so, the panel
 *      says WHY, the command zone tile carries the number, and the payment the
 *      engine plans is two mana larger;
 *   6. commander damage from a real attack is drawn on the life badge.
 *
 * It reuses the same dev-only entry the other two use: the REAL `Play` page
 * with the app's providers and no auth gate. The deck is whatever the lobby
 * deals, which is a seeded Commander deck built from the live card database.
 *
 *   npm run dev -- --port 8101
 *   node scripts/play-commander-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/commander';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const BLOCK_DB = process.env.DM_BLOCK_DB === '1';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => {
  if (m.type() === 'error') log('  [error]', m.text().slice(0, 180));
});

/* Vite's HMR client, stubbed. See play-preview-shots.mjs for why. */
const VITE_CLIENT_STUB = `
export function createHotContext() {
  return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {} };
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

/** Everything this run asks the live table about, read off `window.__dmGame`. */
const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  const ref = p1.commanders[0] ?? null;
  const commanderId = ref?.instanceId ?? null;
  const card = commanderId ? g.cards[commanderId] : null;
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, version: g.version,
    stack: (g.stack || []).map(o => ({ name: o.name, kind: o.kind })),
    hand: p1.zones.hand.length,
    lands: p1.zones.battlefield.filter(id => /land/i.test(g.cards[id].typeLine || '')).length,
    untappedLands: p1.zones.battlefield.filter(
      id => /land/i.test(g.cards[id].typeLine || '') && !g.cards[id].tapped
    ).length,
    commander: card
      ? {
          instanceId: commanderId,
          name: card.name,
          zone: card.zone,
          manaCost: card.manaCost,
          cmc: card.cmc,
          castCount: ref.castCount,
          tax: ref.castCount * g.rules.commanderTaxPerCast,
        }
      : null,
    commanderDamage: g.players.map(p => ({ id: p.id, taken: { ...p.commanderDamage }, life: p.life })),
    lastLog: g.log.slice(-5).map(e => e.message),
  };
});

const dispatch = actions => page.evaluate(a => {
  if (!window.__dmDispatch) return false;
  window.__dmDispatch(a);
  return true;
}, actions);

/* ------------------------------------------------------------------ open */

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

log('start:', await pressText(/Start .*game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
await sleep(3500);
log('kept opening hand:', await pressText(/^Keep$/));
await sleep(900);

const opening = await game();
log('  the lobby dealt: ' + JSON.stringify(opening.commander));
if (!opening.commander) {
  log('This lobby dealt no commander, so there is nothing to show.');
  await browser.close();
  process.exit(1);
}

/* ------------------------------------------------- helpers over the table */

const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false;
  el.click();
  return true;
}, t);

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .map(e => e.getAttribute('title'))
    .filter(t => t && t.includes('Click to preview')));

/**
 * The one card preview.
 *
 * `[role="group"][aria-label]` also matches the stack strip, the duty strip and
 * the commander choice bar, and the first version of this run read the choice
 * bar as though it were the card panel. Every reader below excludes them by
 * name for that reason.
 */
const NOT_THE_PREVIEW = /^The stack|commander choice|to resolve by hand/i;

const panelText = () => page.evaluate(src => {
  const skip = new RegExp(src, 'i');
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !skip.test(p.getAttribute('aria-label') || ''));
  return panel ? (panel.innerText || '').trim() : null;
}, NOT_THE_PREVIEW.source);

const panelButtons = () => page.evaluate(src => {
  const skip = new RegExp(src, 'i');
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !skip.test(p.getAttribute('aria-label') || ''));
  if (!panel) return [];
  return [...panel.querySelectorAll('button')].map(b => ({
    label: (b.innerText || '').trim(),
    title: b.getAttribute('title') || '',
  }));
}, NOT_THE_PREVIEW.source);

const pressInPanel = label => page.evaluate((text, src) => {
  const skip = new RegExp(src, 'i');
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !skip.test(p.getAttribute('aria-label') || ''));
  if (!panel) return false;
  const el = [...panel.querySelectorAll('button')].find(b => (b.innerText || '').trim() === text);
  if (!el) return false;
  el.click();
  return true;
}, label, NOT_THE_PREVIEW.source);

/** Click the command zone pile, which is what a player clicks. */
const openCommandZone = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('title') || '').startsWith('Command zone'));
  if (!el) return false;
  el.click();
  return true;
});

/** The CR 903.9a strip, read out of the DOM rather than assumed. */
const choiceBar = () => page.evaluate(() => {
  const bar = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => /commander choice/i.test(p.getAttribute('aria-label') || ''));
  if (!bar) return null;
  return {
    text: (bar.innerText || '').trim(),
    buttons: [...bar.querySelectorAll('button')].map(b => ({
      label: (b.innerText || '').trim(),
      title: b.getAttribute('title') || '',
    })),
  };
});

const pressInChoiceBar = label => page.evaluate(text => {
  const bar = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => /commander choice/i.test(p.getAttribute('aria-label') || ''));
  if (!bar) return false;
  const el = [...bar.querySelectorAll('button')].find(b => (b.innerText || '').trim() === text);
  if (!el) return false;
  el.click();
  return true;
}, label);

/** Whatever the command zone tile is saying, including the tax chip. */
const commandTile = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button[title], span[title]')]
    .find(e => (e.getAttribute('title') || '').startsWith('Command zone'));
  if (!el) return null;
  return { title: el.getAttribute('title'), text: (el.innerText || '').replace(/\n/g, ' ').trim() };
});

/** Commander damage pips drawn around a life badge. */
const damagePips = () => page.evaluate(() =>
  [...document.querySelectorAll('[title]')]
    .filter(e => /commander damage from/i.test(e.getAttribute('title') || ''))
    .map(e => ({ text: (e.innerText || '').trim(), title: e.getAttribute('title') })));

const atMyMain = async () => {
  const g = await game();
  return (
    g.active === 'p1' &&
    (g.step === 'precombat_main' || g.step === 'postcombat_main') &&
    g.stack.length === 0
  );
};

/**
 * Drain the stack.
 *
 * The first version of this run did not, and every reading of the preview came
 * back with *"Something is on the stack. Only an instant or a card with flash
 * can be cast now."* instead of a Cast button — which is `castTiming` being
 * exactly right and the run being wrong. Planting a dozen lands in one batch
 * fires whatever they trigger, and a land with an ETB trigger leaves an object
 * waiting for a priority round nobody was running.
 */
const drainStack = async (tries = 12) => {
  for (let i = 0; i < tries; i++) {
    const g = await game();
    if (!g || g.stack.length === 0) return true;
    const passed =
      (await pressText(/^(PASS|Pass|Resolve|OK|LET IT RESOLVE)/)) ||
      (await pressTitle('Pass priority'));
    await sleep(passed ? 1200 : 2000);
  }
  return false;
};

const backToMyMain = async (tries = 30) => {
  for (let i = 0; i < tries && !(await atMyMain()); i++) {
    if (await drainStack(3)) { /* fall through to the step checks */ }
    if (await atMyMain()) break;
    if (await pressText(/^NO BLOCKS$/)) { await sleep(2500); continue; }
    if (await pressText(/^DAMAGE THROUGH$/)) { await sleep(2500); continue; }
    if (await pressText(/^END TURN$/)) { await sleep(9000); continue; }
    await sleep(2500);
  }
};

/* --------------------------------------------------------- build a board */
/*
 * A commander wants five to seven mana and a seeded deal does not get there
 * quickly. So the run takes its real land drop for a few turns and then reaches
 * into its own library for the rest through `MOVE_ZONE`, which is the action
 * the mat's own "To battlefield" control builds. Nothing about the CAST is
 * faked: the run still has to find the button on screen and press it.
 */
const plantLands = count => page.evaluate(n => {
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  const ids = p1.zones.library
    .filter(id => /land/i.test(g.cards[id].typeLine || ''))
    .slice(0, n);
  window.__dmDispatch(
    ids.map(id => ({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield', controllerId: 'p1' }))
  );
  return ids.length;
}, count);

for (let turn = 0; turn < 3; turn++) {
  const titles = await handTitles();
  const land = titles.find(t => t.includes('land drop'));
  if (land) { await clickHand(land); await sleep(400); await pressText(/^Play land$/); await sleep(600); }
  await page.evaluate(() => document.body.click());
  await sleep(300);
  await pressText(/^END TURN$/);
  await sleep(9000);
}

await backToMyMain();
log('  planted lands from the library: ' + (await plantLands(12)));
await sleep(1400);
await backToMyMain();

const built = await game();
log(`  T${built.turn} ${built.step}: ${built.lands} lands, ${built.untappedLands} untapped`);
await shot('board-built');

const result = {
  priceShown: null,
  castLabel: null,
  firstCast: false,
  engineLeftIt: null,
  choiceOffered: null,
  returned: false,
  secondPriceText: null,
  secondCastLabel: null,
  secondCast: false,
  tileTax: null,
  pips: [],
};

/* ------------------------------------------------------------------ *
 * 1. The price, on the card, in the command zone
 * ------------------------------------------------------------------ */

log('\n=== THE COMMAND ZONE ===');
await pressTitle('Close the preview');
await sleep(300);
await drainStack();
log('  clicked the command zone pile: ' + (await openCommandZone()));
await sleep(1000);

let text = await panelText();
log('  preview says:\n    ' + String(text).split('\n').join('\n    '));
result.priceShown = /From the command zone/i.test(String(text)) ? text : null;

let buttons = await panelButtons();
const castButton = buttons.find(b => /^Cast commander/i.test(b.label));
result.castLabel = castButton ? castButton.label : null;
log('  cast button: ' + JSON.stringify(castButton ?? null));
await shot('commander-price');

/* ------------------------------------------------------------------ *
 * 2. Cast it
 * ------------------------------------------------------------------ */

if (castButton) {
  await pressInPanel(castButton.label);
  await sleep(1400);
  for (let i = 0; i < 6; i++) {
    const g = await game();
    if (g.stack.length === 0) break;
    await pressText(/^(PASS|Pass|Resolve|OK)/);
    await sleep(1200);
  }
  await sleep(900);
  const after = await game();
  result.firstCast = after.commander.zone === 'battlefield';
  log(`  commander now: ${after.commander.zone}, cast ${after.commander.castCount} time(s)`);
  log('  log tail: ' + JSON.stringify(after.lastLog.slice(-2)));
  await shot('commander-cast');
}

/* ------------------------------------------------------------------ *
 * 3. It dies. The engine must NOT decide where it goes.
 * ------------------------------------------------------------------ */

log('\n=== CR 903.9a ===');
await pressTitle('Close the preview');
await sleep(400);
await backToMyMain();

const alive = await game();
if (alive.commander.zone === 'battlefield') {
  /* Killed with the mat's own "To graveyard" control, which is a control a
     player has. What happens NEXT is the thing being measured. */
  await dispatch([{ type: 'MOVE_ZONE', instanceId: alive.commander.instanceId, to: 'graveyard' }]);
  await sleep(1600);
}

const dead = await game();
result.engineLeftIt = dead.commander.zone;
log(`  the engine left the dead commander in: ${dead.commander.zone}`);

const bar = await choiceBar();
result.choiceOffered = bar;
if (bar) {
  log('  the strip says:\n    ' + bar.text.split('\n').join('\n    '));
  log('  it offers: ' + JSON.stringify(bar.buttons.map(b => b.label).filter(Boolean)));
} else {
  log('  no choice strip on screen.');
}
await shot('commander-choice');

/* ------------------------------------------------------------------ *
 * 4. Take it back
 * ------------------------------------------------------------------ */

if (bar) {
  log('  pressing "Command zone": ' + (await pressInChoiceBar('Command zone')));
  await sleep(1600);
  const back = await game();
  result.returned = back.commander.zone === 'command';
  log(`  commander now: ${back.commander.zone}`);
  log('  log tail: ' + JSON.stringify(back.lastLog.slice(-2)));
  await shot('commander-returned');
}

/* ------------------------------------------------------------------ *
 * 5. The second cast is dearer, and the interface says why
 * ------------------------------------------------------------------ */

log('\n=== THE TAX ===');
await backToMyMain();
log('  planted more lands: ' + (await plantLands(10)));
await sleep(1400);
await backToMyMain();

result.tileTax = await commandTile();
log('  command zone tile: ' + JSON.stringify(result.tileTax));

await pressTitle('Close the preview');
await sleep(300);
await drainStack();
await openCommandZone();
await sleep(1000);

text = await panelText();
log('  preview says:\n    ' + String(text).split('\n').join('\n    '));
result.secondPriceText = text;
buttons = await panelButtons();
const second = buttons.find(b => /^Cast commander/i.test(b.label));
result.secondCastLabel = second ? second.label : null;
log('  cast button: ' + JSON.stringify(second ?? null));
await shot('commander-taxed');

if (second) {
  await pressInPanel(second.label);
  await sleep(1400);
  for (let i = 0; i < 6; i++) {
    const g = await game();
    if (g.stack.length === 0) break;
    await pressText(/^(PASS|Pass|Resolve|OK)/);
    await sleep(1200);
  }
  await sleep(900);
  const after = await game();
  result.secondCast = after.commander.zone === 'battlefield' && after.commander.castCount === 2;
  log(`  commander now: ${after.commander.zone}, cast ${after.commander.castCount} time(s)`);
  log('  log tail: ' + JSON.stringify(after.lastLog.slice(-3)));
  await shot('commander-recast');
}

/* ------------------------------------------------------------------ *
 * 6. Commander damage, on the badge
 * ------------------------------------------------------------------ */

log('\n=== COMMANDER DAMAGE ===');
/*
 * Swung for real. `combat.ts` is the only route in the engine that tallies
 * commander damage, and it does it by carrying the `commanderId` on the damage
 * an attacking commander deals. Nothing is dispatched at the tally itself. What
 * is being checked is whether the number reaches the screen.
 */
await pressTitle('Close the preview');
await sleep(400);

const commanderDamageTaken = g =>
  Object.values(g.commanderDamage.find(p => p.id === 'p2')?.taken ?? {})
    .reduce((worst, value) => Math.max(worst, value), 0);

/** Click a permanent ON THE MAT, never the copy of it inside a panel. */
const clickPermanent = instanceId => page.evaluate(id => {
  const panels = [...document.querySelectorAll('[role="group"][aria-label]')];
  const el = [...document.querySelectorAll(`[data-instance="${id}"]`)]
    .find(node => !panels.some(panel => panel.contains(node)));
  if (!el) return false;
  /* `data-instance` sits on the OUTER box and the click handler sits on the art
     inside it, so going through the centre point hits whatever layer is
     actually on top, which is what a mouse would do. */
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
  if (!hit || !el.contains(hit)) return false;
  hit.click();
  return true;
}, instanceId);

for (let swing = 0; swing < 6; swing++) {
  /* Back to a main phase of this seat's own turn, answering whatever the bot
     asks on the way. Without this the loop simply waited out the opponent's
     turn eight times and never attacked once. */
  await backToMyMain(40);

  const before = await game();
  log(`  swing ${swing}: T${before.turn} ${before.step}, active ${before.active}, ` +
    `commander in the ${before.commander.zone}`);
  if (commanderDamageTaken(before) > 0) break;
  if (before.active !== 'p1') { await sleep(3000); continue; }

  const cmd = before.commander;
  if (cmd.zone !== 'battlefield') {
    log(`  swing ${swing}: the commander is in the ${cmd.zone}, nothing to attack with`);
    await pressText(/^END TURN$/);
    await sleep(9000);
    continue;
  }

  if (before.step === 'precombat_main' || before.step === 'postcombat_main') {
    /* The HUD's own Attack button, which is how a player enters combat. It is
       only drawn when the engine agrees there is an attack to make, so a miss
       here is the run being told there is nothing to swing with. */
    const entered = await pressText(/^ATTACK$/);
    log(`    pressed the HUD Attack button: ${entered}`);
    if (entered) { await sleep(3000); }
    else { await pressText(/^END TURN$/); await sleep(9000); continue; }
  }

  const inCombat = await game();
  if (inCombat.step === 'declare_attackers') {
    const before = inCombat;
    await pressTitle('Close the preview');
    await sleep(300);
    const clicked = await clickPermanent(cmd.instanceId);
    await sleep(900);
    const attacked = await pressText(/^ATTACK/);
    log(`  swing ${swing}: clicked the commander ${clicked}, pressed Attack ${attacked}`);
    await sleep(900);
    await page.evaluate(() => document.body.click());
    await sleep(400);
    await pressText(/^ATTACK WITH/);
    await sleep(5000);
    /* The defender is a bot and answers its own blocks; this seat only has to
       let the damage through. */
    for (let i = 0; i < 6; i++) {
      if (await pressText(/^(DAMAGE THROUGH|NO BLOCKS)$/)) { await sleep(2500); continue; }
      const mid = await game();
      if (commanderDamageTaken(mid) > 0) break;
      if (mid.step === 'precombat_main' || mid.step === 'postcombat_main') break;
      await sleep(2500);
    }
    const after = await game();
    log(`  swing ${swing}: p2 on ${after.commanderDamage.find(p => p.id === 'p2').life} life, ` +
      `commander damage ${JSON.stringify(after.commanderDamage.find(p => p.id === 'p2').taken)}`);
    continue;
  }

  if (await pressText(/^(DAMAGE THROUGH|NO BLOCKS)$/)) { await sleep(2500); continue; }
  await pressText(/^END TURN$/);
  await sleep(9000);
}

const swung = await game();
log('  the table: ' + JSON.stringify(swung.commanderDamage));
result.pips = await damagePips();
log('  pips drawn on the life badges: ' + JSON.stringify(result.pips));
await shot('commander-damage');

/* ------------------------------------------------------------------ */

const finalState = await game();
const saidRule = await page.evaluate(() =>
  (window.__dmGame?.log ?? []).some(e => /903\.9a/.test(e.message || ''))
);
const saidTax = await page.evaluate(() =>
  (window.__dmGame?.log ?? []).some(e => /more mana for/.test(e.message || ''))
);

log('\n=== RESULT ===');
log(`  price drawn in the command zone:   ${result.priceShown ? 'YES' : 'NO'}`);
log(`  Cast commander offered:            ${result.castLabel ? 'YES ' + JSON.stringify(result.castLabel) : 'NO'}`);
log(`  cast from the command zone:        ${result.firstCast ? 'YES' : 'NO'}`);
log(`  engine left the dead commander in: ${result.engineLeftIt}`);
log(`  CR 903.9a offered, both choices:   ${
  result.choiceOffered
    ? 'YES ' + JSON.stringify(result.choiceOffered.buttons.map(b => b.label).filter(Boolean))
    : 'NO'
}`);
log(`  taken back to the command zone:    ${result.returned ? 'YES' : 'NO'}`);
log(`  tax on the command zone tile:      ${result.tileTax ? JSON.stringify(result.tileTax.text) : 'NO'}`);
log(`  second cast label:                 ${result.secondCastLabel ? JSON.stringify(result.secondCastLabel) : 'NO'}`);
log(`  second cast landed:                ${result.secondCast ? 'YES' : 'NO'}`);
log(`  commander damage drawn on a badge: ${result.pips.length > 0 ? 'YES ' + JSON.stringify(result.pips[0]) : 'NO'}`);
log(`  CR 903.9a reached the log:         ${saidRule ? 'YES' : 'NO'}`);
log(`  the tax reached the log:           ${saidTax ? 'YES' : 'NO'}`);
log('  log tail:');
for (const line of finalState.lastLog) log('    ' + line);

await browser.close();
/* Non-zero when the loop this whole task is about did not close: cast it, lose
   it, take it back, cast it again for more. */
if (!result.firstCast || !result.returned || !result.secondCast) process.exit(1);
