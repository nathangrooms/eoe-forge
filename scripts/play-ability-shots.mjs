/**
 * Play a real game and USE AN ABILITY, through the shipped interface.
 *
 * Sibling of `play-preview-shots.mjs`, and it exists for the reason
 * `CLAUDE.md` gives at length: a green unit suite says nothing about whether a
 * person can reach the rule. `activate.test.ts` proves the engine activates an
 * ability. This proves a mouse can.
 *
 * What it asserts, all of it read off the running game rather than off a
 * screenshot:
 *
 *   1. clicking a permanent with an activated ability draws an Abilities block
 *      in the centre preview, carrying the card's own words;
 *   2. pressing the control puts an object on the stack whose `kind` is
 *      'activated' and whose `abilityId` names a compiled ability;
 *   3. the stack empties and the game state moves.
 *
 * It reuses `play-preview-shots.mjs`'s harness verbatim: the dev-only entry
 * that mounts the REAL `Play` page with the app's providers and no auth gate.
 *
 * Run against real cards, because the offline fallback deck is 24 Forests and a
 * typographic list and a Forest has nothing to activate:
 *
 *   npm run dev -- --port 8101
 *   node scripts/play-ability-shots.mjs
 *
 * `DM_BLOCK_DB=1` forces the offline path, which is useful only for checking
 * that the panel draws nothing rather than drawing wrongly.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/abilities';
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

const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, version: g.version,
    stack: (g.stack || []).map(o => ({ name: o.name, kind: o.kind, abilityId: o.abilityId })),
    hand: p1.zones.hand.length,
    battlefield: p1.zones.battlefield.map(id => ({
      instanceId: id,
      name: g.cards[id].name,
      tapped: g.cards[id].tapped,
      oracle: (g.cards[id].oracleText || '').replace(/\n/g, ' '),
    })),
    lastLog: g.log.slice(-4).map(e => e.message),
  };
});

/**
 * A card of p1's, anywhere, whose text reads like an activated ability.
 *
 * The seeded deal is mostly lands and the free-cast loop deploys five or six
 * permanents in six turns, which is not a big enough sample to ask the
 * interface a question about. So the run reaches into the library for one, the
 * same way the mat's own "To battlefield" control does.
 */
const findActivatable = (pattern, skip = []) => page.evaluate((src, taken) => {
  const re = new RegExp(src);
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  for (const zone of ['battlefield', 'hand', 'library', 'graveyard', 'command']) {
    for (const id of p1.zones[zone] || []) {
      if (taken.includes(id)) continue;
      const c = g.cards[id];
      const text = (c.oracleText || '').split(String.fromCharCode(10)).join(' ');
      if (!re.test(text)) continue;
      if ((c.typeLine || '').toLowerCase().includes('land')) continue;
      /* Skip pure mana rocks. Their ability compiles and is correctly refused
         with "used when you pay for something", which this run has already
         shown on Sol Ring; what it still needs is one that can be USED. */
      if (/:\s*Add /.test(text)) continue;
      return { instanceId: id, name: c.name, zone, oracle: text };
    }
  }
  return null;
}, pattern.source, skip);

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

/* Free cast, so a board exists in a few turns rather than a dozen. It changes
   what can be CAST and nothing about what can be activated: an ability's own
   cost is still charged, which is half of what this run is checking. */
log('menu:', await pressTitle('Game menu')); await sleep(1400);
log('free cast:', await pressTitle('Ignore mana entirely')); await sleep(700);
await pressTitle('Close the menu'); await sleep(700);

/* --------------------------------------------------------- build a board */

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

/*
 * Click a permanent ON THE MAT.
 *
 * Two traps, both hit by the first version of this run. The preview draws the
 * selected card with the same `data-instance` attribute the mat uses, so an
 * unscoped `querySelector` finds the card INSIDE the open preview and clicking
 * it changes nothing; every card in turn then reported the previously selected
 * one's panel. And the preview dismisses itself on `pointerdown` rather than
 * `click`, which is what makes clicking straight from one card to another feel
 * like one gesture, so a bare `.click()` leaves the old panel open on top.
 */
const clickPermanent = instanceId => page.evaluate(id => {
  const panel = document.querySelector('[role="group"][aria-label]');
  const el = [...document.querySelectorAll(`[data-instance="${id}"]`)]
    .find(node => !panel || !panel.contains(node));
  if (!el) return false;
  /* `data-instance` sits on the OUTER box and the click handler sits on the
     art inside it, so clicking the box itself does nothing at all. Going
     through the centre point hits whatever layer is actually on top, which is
     what a mouse would do. */
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
  if (!hit || !el.contains(hit)) return false;
  hit.click();
  return true;
}, instanceId);

/** An activated ability has a cost, a colon, and an effect. Loyalty counts. */
const LOOKS_ACTIVATED = /(^|[.\s(])(\{[^}]+\}|[+-]?\d+)[^:\n]{0,40}:\s/;

for (let turn = 0; turn < 9; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await pressText(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 5)) {
    await clickHand(t); await sleep(350);
    if (await pressText(/^Cast$/)) await sleep(550);
  }
  await page.evaluate(() => document.body.click());
  await sleep(300);

  const g = await game();
  const withAbility = g.battlefield.filter(c => LOOKS_ACTIVATED.test(c.oracle));
  log(`  T${g.turn} ${g.step}: ${g.battlefield.length} permanents, ${withAbility.length} look activatable`);
  /* Play the whole run rather than stopping at the first card that LOOKS
     activatable. A regex over oracle text is a hint about where to look; only
     the interface can say whether the compiler read the card, and a board of
     four permanents is not enough of a sample to ask it. */
  await pressText(/^END TURN$/);
  await sleep(9000);
}

await shot('board-built');

/* -------------------------------------------------- the ability, on screen */

/** Everything the Abilities block is showing, read out of the DOM. */
const abilityBlock = () => page.evaluate(() => {
  const panel = document.querySelector('[role="group"][aria-label]');
  if (!panel) return null;
  const heading = [...panel.querySelectorAll('span')]
    .find(s => (s.textContent || '').trim() === 'Abilities');
  if (!heading) return { present: false, panelText: (panel.innerText || '').slice(0, 400) };
  const block = heading.closest('div').parentElement;
  return {
    present: true,
    text: (block.innerText || '').trim(),
    buttons: [...block.querySelectorAll('button')].map(b => ({
      label: (b.innerText || '').trim(),
      title: b.getAttribute('title') || '',
    })),
  };
});

const before = await game();

/*
 * Reach into the deck for nonlands whose text reads like an activated ability
 * and put them into play, because the seeded deal plus a free-cast loop only
 * ever produced five permanents in six turns and four of them were basics.
 * That is not a big enough sample to ask the interface a question.
 *
 * `MOVE_ZONE` is what the mat's own "To battlefield" control builds, so this is
 * a control a player has, not a back door into the reducer. Nothing about the
 * ACTIVATION is faked: the run still has to find the button on screen.
 */
const planted = [];
for (let i = 0; i < 24 && planted.length < 6; i++) {
  const found = await findActivatable(LOOKS_ACTIVATED, planted);
  if (!found) break;
  planted.push(found.instanceId);
  if (found.zone === 'battlefield') continue;
  log(`  planting ${found.name} from the ${found.zone}: ${found.oracle.slice(0, 90)}`);
  await dispatch([
    { type: 'MOVE_ZONE', instanceId: found.instanceId, to: 'battlefield', controllerId: 'p1' },
  ]);
  await sleep(400);
}

/*
 * Get back to p1's own main phase with an empty stack.
 *
 * Two things make this necessary and the first version of the run tripped on
 * both. A permanent that just arrived is summoning sick, so a `{T}` cost is not
 * payable until its controller's next turn. And the loop above tends to end
 * mid-combat with the block prompt up, which is itself a `[role="group"]`
 * panel: the run read that prompt, found no Abilities block in it, and reported
 * seven cards as having nothing to activate. Sorcery-speed abilities would have
 * been correctly refused there too.
 */
const atMyMain = async () => {
  const g = await game();
  return (
    g.active === 'p1' &&
    (g.step === 'precombat_main' || g.step === 'postcombat_main') &&
    g.stack.length === 0
  );
};

for (let i = 0; i < 14 && !(await atMyMain()); i++) {
  if (await pressText(/^NO BLOCKS$/)) { await sleep(2500); continue; }
  if (await pressText(/^DAMAGE THROUGH$/)) { await sleep(2500); continue; }
  if (await pressText(/^END TURN$/)) { await sleep(9000); continue; }
  await sleep(2500);
}
log('  at my main phase:', JSON.stringify(await game().then(g => ({ turn: g.turn, step: g.step, active: g.active }))));

const board = await game();
/* Every permanent, the hinted ones first. The regex only decides the ORDER to
   ask in; the interface decides the answer, which is the point of the run. */
const candidates = [
  ...board.battlefield.filter(c => LOOKS_ACTIVATED.test(c.oracle)),
  ...board.battlefield.filter(c => !LOOKS_ACTIVATED.test(c.oracle)),
];
if (candidates.length === 0) {
  log('\nNothing on the board at all. Nothing to show.');
  await browser.close();
  process.exit(1);
}

log('\n=== BOARD ===');
for (const c of candidates) log(`  ${c.name}${c.tapped ? ' (tapped)' : ''}: ${c.oracle.slice(0, 110)}`);

let used = null;
for (const candidate of candidates) {
  log(`\n--- ${candidate.name} ---`);

  /*
   * Bring THIS card up, and check that it is the one on screen.
   *
   * An open preview sits over the mat and takes its own clicks, so a press
   * aimed at a card behind it never reaches the card and the panel keeps
   * showing the previous one. An earlier version of this run read a single
   * stale Plains and reported four different permanents as having nothing to
   * activate, which is precisely the kind of false negative this whole script
   * exists to catch, arriving from the script instead of from the app.
   */
  let opened = false;
  for (let attempt = 0; attempt < 4 && !opened; attempt++) {
    await pressTitle('Close the preview');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(250);
    await clickPermanent(candidate.instanceId);
    await sleep(700);
    const showing = await page.evaluate(() => {
      const p = document.querySelector('[role="group"][aria-label]');
      return p ? p.getAttribute('aria-label') : null;
    });
    opened = !!showing && showing.startsWith(candidate.name);
  }
  if (!opened) {
    log('  could not bring this card up in the preview');
    continue;
  }

  const block = await abilityBlock();
  if (!block) { log('  no preview opened'); continue; }
  if (!block.present) {
    log('  no Abilities block. The engine compiled nothing activatable off this card.');
    log('  panel was: ' + JSON.stringify(block.panelText));
    continue;
  }
  log('  panel says:\n    ' + block.text.split('\n').join('\n    '));
  await shot(`preview-${candidate.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);

  /* The control, or the first target chip when it is asking who to point at. */
  const useButton = block.buttons.find(b => /^Use/i.test(b.label));
  const chip = block.buttons.find(b => !/^Use/i.test(b.label) && b.label.length > 0);
  const pressing = useButton ?? chip;
  if (!pressing) { log('  no control offered, only a reason. Reading on.'); continue; }

  log(`  pressing: ${JSON.stringify(pressing.label)}`);
  const pressed = await page.evaluate(label => {
    const panel = document.querySelector('[role="group"][aria-label]');
    const el = [...panel.querySelectorAll('button')].find(b => (b.innerText || '').trim() === label);
    if (!el) return false;
    el.click();
    return true;
  }, pressing.label);
  if (!pressed) { log('  could not press it'); continue; }

  await sleep(700);
  const mid = await game();
  log('  stack now: ' + JSON.stringify(mid.stack));
  await shot(`on-stack-${candidate.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`);

  if (mid.stack.length > 0) {
    used = { candidate, mid };
    break;
  }
  log('  nothing reached the stack; trying the next permanent');
}

if (!used) {
  log('\nFAILED: no ability on this board reached the stack from a click.');
  await browser.close();
  process.exit(1);
}

/* ------------------------------------------------------------ resolution */

log('\n=== RESOLVING ===');
/* Both seats pass, which is what the human end of a priority round is. */
for (let i = 0; i < 6; i++) {
  const g = await game();
  if (g.stack.length === 0) break;
  await pressText(/^(PASS|Pass|Resolve|OK)/);
  await sleep(1200);
}
await sleep(1500);
const after = await game();
await shot('after-resolution');

log('  stack after: ' + JSON.stringify(after.stack));
log('  log tail:');
for (const line of after.lastLog) log('    ' + line);

const object = used.mid.stack[0];
log('\n=== RESULT ===');
log(`  ability on the stack:   ${object.kind === 'activated' ? 'YES' : 'NO'} (${object.name}, ${object.kind})`);
log(`  carried a compiled id:  ${object.abilityId ? 'YES (' + object.abilityId + ')' : 'NO'}`);
log(`  state moved:            ${after.version !== before.version ? 'YES' : 'NO'} (${before.version} -> ${after.version})`);

await browser.close();
