/**
 * Play a real game and EQUIP A SWORD, through the shipped interface.
 *
 * Sibling of `play-ability-shots.mjs`, written for the reason `CLAUDE.md`
 * gives at length and this project has been caught by twice: a green unit suite
 * says nothing about whether a person can reach the rule. `attach.test.ts`
 * proves the engine attaches. This proves a mouse can.
 *
 * `ATTACH` is the exact action that file's header is written about. It had a
 * reducer, a log line, a state-based action that unattaches it correctly under
 * CR 704.5n, and its own passing tests, and nothing in the app had ever built
 * one, so every Equipment and every Aura in the catalogue was a card that could
 * be played and then did nothing.
 *
 * What it asserts, all of it read off the running game rather than off a
 * screenshot:
 *
 *   1. clicking an Equipment draws its equip ability as an ordinary control,
 *      carrying the card's own words ("Equip {2}");
 *   2. pressing it, and naming a creature, puts an activated ability on the
 *      stack and the resolution attaches the Equipment;
 *   3. the creature the sword went on is BIGGER afterwards, read from the same
 *      layered stat line the mat draws;
 *   4. clicking an Aura in hand offers the permanents it may enchant, and
 *      pressing one casts it onto that permanent.
 *
 * It reuses `play-ability-shots.mjs`'s harness verbatim: the dev-only entry
 * that mounts the REAL `Play` page with the app's providers and no auth gate.
 *
 *   npm run dev -- --port 8101
 *   node scripts/play-attach-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/attach';
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

for (let i = 0; i < 30 && !(await atMyMain()); i++) {
  if (await pressText(/^NO BLOCKS$/)) { await sleep(2500); continue; }
  if (await pressText(/^DAMAGE THROUGH$/)) { await sleep(2500); continue; }
  if (await pressText(/^END TURN$/)) { await sleep(9000); continue; }
  await sleep(2500);
}
log('  at my main phase:', JSON.stringify(await game().then(g => ({ turn: g.turn, step: g.step, active: g.active }))));

/* ------------------------------------------------------------------ *
 * Plant an Equipment and an Aura, and a creature to put them on.
 *
 * `MOVE_ZONE` is what the mat's own "To battlefield" control builds, so this is
 * a control a player has rather than a back door into the reducer. Nothing
 * about the EQUIPPING is faked: the run still has to find the button on screen
 * and press it.
 * ------------------------------------------------------------------ */

const findByText = (pattern, zones, skip = []) => page.evaluate((src, zoneList, taken) => {
  const re = new RegExp(src, 'i');
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  for (const zone of zoneList) {
    for (const id of p1.zones[zone] || []) {
      if (taken.includes(id)) continue;
      const c = g.cards[id];
      const text = (c.oracleText || '').split(String.fromCharCode(10)).join(' ');
      const line = (c.typeLine || '');
      if (!re.test(text) && !re.test(line)) continue;
      return { instanceId: id, name: c.name, zone, oracle: text, typeLine: line };
    }
  }
  return null;
}, pattern.source, zones, skip);

const plant = async found => {
  if (!found) return false;
  if (found.zone === 'battlefield') return true;
  log(`  planting ${found.name} from the ${found.zone}: ${found.oracle.slice(0, 90)}`);
  await dispatch([
    { type: 'MOVE_ZONE', instanceId: found.instanceId, to: 'battlefield', controllerId: 'p1' },
  ]);
  await sleep(400);
  return true;
};

/** One permanent's layered stat line and what it is carrying, off the engine. */
const readCard = instanceId => page.evaluate(id => {
  const g = window.__dmGame;
  const c = g.cards[id];
  if (!c) return null;
  return {
    name: c.name,
    zone: c.zone,
    attachedTo: c.attachedTo ?? null,
    attachedToName: c.attachedTo ? g.cards[c.attachedTo]?.name ?? null : null,
    printed: c.power !== undefined && c.toughness !== undefined ? `${c.power}/${c.toughness}` : null,
  };
}, instanceId);

/**
 * The stat line the INTERFACE is drawing for this permanent.
 *
 * Read out of the open preview rather than off the mat: `GameCardView` draws
 * the power/toughness badge outside the card element, so the card's own
 * innerText has no number in it at all. Both come from `statLineIn`, which is
 * the layered answer, so this is the number a player reads.
 */
const statInPreview = () => page.evaluate(() => {
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !/^The stack/.test(p.getAttribute('aria-label') || ''));
  if (!panel) return null;
  const match = (panel.innerText || '').match(/(?:^|\n)\s*(-?\d+\/-?\d+)\s*(?:\n|$)/);
  return match ? match[1] : null;
});

/*
 * Prefer an Equipment that makes its creature BIGGER in both boxes.
 *
 * Not fussiness: a run that happened to plant Skullclamp equipped it onto a 1/1,
 * the +1/-1 took the creature to 2/0, CR 704.5f binned it and CR 704.5n took the
 * sword back off. Every one of those steps is correct and the log is a fine
 * proof of the chain, and it is also a run that ends with nothing attached,
 * which is not what this script is trying to show.
 */
const equipment =
  (await findByText(/Equipped creature gets \+\d+\/\+\d/, ['battlefield', 'hand', 'library'])) ??
  (await findByText(/Equipped creature gets \+\d/, ['battlefield', 'hand', 'library'])) ??
  (await findByText(/Equipment/, ['battlefield', 'hand', 'library']));
const aura =
  (await findByText(/enchant creature/, ['hand', 'library'])) ??
  (await findByText(/enchant (?:artifact|land|permanent)/, ['hand', 'library']));
const creature = await findByText(/^Creature/, ['battlefield', 'hand', 'library']);

log('\n=== PLANTING ===');
log('  equipment: ' + (equipment ? `${equipment.name} — ${equipment.oracle.slice(0, 90)}` : 'none in this deck'));
log('  aura:      ' + (aura ? `${aura.name} — ${aura.oracle.slice(0, 90)}` : 'none in this deck'));
log('  creature:  ' + (creature ? creature.name : 'none'));

await plant(creature);
await plant(equipment);
/* The Aura stays in hand on purpose: casting it IS the thing being shown. */
if (aura && aura.zone === 'library') {
  await dispatch([{ type: 'MOVE_ZONE', instanceId: aura.instanceId, to: 'hand', controllerId: 'p1' }]);
  await sleep(400);
}

/* A permanent that just arrived is summoning sick, and equip is sorcery speed,
   so the run needs to be back in its own main phase with an empty stack. */
for (let i = 0; i < 30 && !(await atMyMain()); i++) {
  if (await pressText(/^NO BLOCKS$/)) { await sleep(2500); continue; }
  if (await pressText(/^DAMAGE THROUGH$/)) { await sleep(2500); continue; }
  if (await pressText(/^END TURN$/)) { await sleep(9000); continue; }
  await sleep(2500);
}
await shot('board-with-equipment');

/* ------------------------------------------------------------------ *
 * 1. The equip control
 * ------------------------------------------------------------------ */

/*
 * Bring a permanent up, and CHECK it is the one on screen.
 *
 * `[role="group"][aria-label]` also matches the stack strip, so the first
 * version of this run read "The stack" as though it were a card panel and
 * reported the equip control as absent. The name has to match.
 */
const openPreview = async (instanceId, name) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    await pressTitle('Close the preview');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(250);
    await clickPermanent(instanceId);
    await sleep(800);
    const showing = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('[role="group"][aria-label]')];
      return panels.map(p => p.getAttribute('aria-label'));
    });
    const match = showing.find(label => label && label.startsWith(name));
    if (match) return match;
  }
  return null;
};

/** Everything a named block in the preview is showing, read out of the DOM. */
const blockNamed = heading => page.evaluate(name => {
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !/^The stack/.test(p.getAttribute('aria-label') || ''));
  if (!panel) return null;
  const label = [...panel.querySelectorAll('span')]
    .find(s => (s.textContent || '').trim().toLowerCase() === name.toLowerCase());
  if (!label) return { present: false, panelText: (panel.innerText || '').slice(0, 500) };
  const block = label.closest('div').parentElement;
  return {
    present: true,
    text: (block.innerText || '').trim(),
    buttons: [...block.querySelectorAll('button')].map(b => ({
      label: (b.innerText || '').trim(),
      title: b.getAttribute('title') || '',
    })),
  };
}, heading);

const pressInPanel = label => page.evaluate(text => {
  const panel = [...document.querySelectorAll('[role="group"][aria-label]')]
    .find(p => !/^The stack/.test(p.getAttribute('aria-label') || ''));
  if (!panel) return false;
  const el = [...panel.querySelectorAll('button')].find(b => (b.innerText || '').trim() === text);
  if (!el) return false;
  el.click();
  return true;
}, label);

const result = { equipOffered: false, equipUsed: false, attachedTo: null, grew: null, auraCast: null };

if (equipment) {
  log('\n=== EQUIP ===');
  const showing = await openPreview(equipment.instanceId, equipment.name);
  log('  preview shows: ' + JSON.stringify(showing));
  const abilities = await blockNamed('Abilities');
  if (!abilities || !abilities.present) {
    log('  no Abilities block. panel was: ' + JSON.stringify(abilities?.panelText));
  } else {
    log('  panel says:\n    ' + abilities.text.split('\n').join('\n    '));
    result.equipOffered = /equip/i.test(abilities.text);
    await shot('equip-offered');

    /* "Use" when the engine had one candidate and took it, otherwise the row of
       creature names it is asking between. Either is one press. */
    const use = abilities.buttons.find(b => /^Use/i.test(b.label));
    const chip = abilities.buttons.find(b => !/^Use/i.test(b.label) && b.label.length > 0);
    const pressing = use ?? chip;
    if (pressing) {
      log(`  pressing: ${JSON.stringify(pressing.label)}`);
      await pressInPanel(pressing.label);
      await sleep(800);
      const mid = await game();
      log('  stack now: ' + JSON.stringify(mid.stack));
      await shot('equip-on-stack');

      /* Both seats pass, which is the human end of a priority round. */
      for (let i = 0; i < 6; i++) {
        const g = await game();
        if (g.stack.length === 0) break;
        await pressText(/^(PASS|Pass|Resolve|OK)/);
        await sleep(1200);
      }
      await sleep(1200);

      const after = await readCard(equipment.instanceId);
      log('  equipment now: ' + JSON.stringify(after));
      result.equipUsed = !!after?.attachedTo;
      result.attachedTo = after?.attachedToName ?? null;

      if (after?.attachedTo) {
        const host = await readCard(after.attachedTo);
        await openPreview(after.attachedTo, host?.name ?? '');
        const drawn = await statInPreview();
        result.grew = { host: host?.name, printed: host?.printed, onMat: drawn };
        log(`  ${host?.name}: printed ${host?.printed}, interface draws ${drawn}`);
        const carrying = await blockNamed('Carrying');
        if (carrying?.present) log('  carrying block:\n    ' + carrying.text.split('\n').join('\n    '));
        await shot('creature-carrying-it');
      }
    } else {
      log('  no control offered, only a reason: ' + abilities.text);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. Casting an Aura at a permanent
 * ------------------------------------------------------------------ */

if (aura) {
  log('\n=== AURA ===');
  await pressTitle('Close the preview');
  await sleep(400);
  for (let i = 0; i < 30 && !(await atMyMain()); i++) {
    if (await pressText(/^NO BLOCKS$/)) { await sleep(2500); continue; }
    if (await pressText(/^DAMAGE THROUGH$/)) { await sleep(2500); continue; }
    if (await pressText(/^END TURN$/)) { await sleep(9000); continue; }
    await sleep(2500);
  }

  const titles = await handTitles();
  const t = titles.find(x => x.includes(aura.name));
  if (!t) {
    log(`  ${aura.name} is not in the fanned hand; nothing to click.`);
  } else {
    await clickHand(t);
    await sleep(700);
    const enchant = await blockNamed('Enchant');
    if (!enchant || !enchant.present) {
      log('  no Enchant block. panel was: ' + JSON.stringify(enchant?.panelText));
    } else {
      log('  panel says:\n    ' + enchant.text.split('\n').join('\n    '));
      await shot('aura-hosts-offered');
      /* By TITLE, not by position. `AttachmentPanel` gives each host chip a
         `Cast <aura> on <permanent>` title, and the heading's enclosing element
         on this panel is the whole details column, so "the first button in the
         block" is whatever furniture happens to sit at the top of it. */
      const host = enchant.buttons.find(b => /^Cast /.test(b.title));
      if (!host) {
        log('  no permanent offered, only a reason. Buttons were: ' +
          JSON.stringify(enchant.buttons.map(b => b.title || b.label).slice(0, 8)));
      } else {
        log(`  pressing: ${JSON.stringify(host.title)}`);
        await pressTitle(host.title);
        await sleep(900);
        for (let i = 0; i < 6; i++) {
          const g = await game();
          if (g.stack.length === 0) break;
          await pressText(/^(PASS|Pass|Resolve|OK)/);
          await sleep(1200);
        }
        await sleep(1200);
        const landed = await readCard(aura.instanceId);
        log('  aura now: ' + JSON.stringify(landed));
        result.auraCast = landed;
        await shot('aura-attached');
      }
    }
  }
}

/* ------------------------------------------------------------------ */

const finalState = await game();
log('\n=== RESULT ===');
log(`  equip control drawn:    ${result.equipOffered ? 'YES' : 'NO'}`);
log(`  Equipment attached:     ${result.equipUsed ? 'YES (to ' + result.attachedTo + ')' : 'NO'}`);
if (result.grew) {
  log(`  creature on the mat:    printed ${result.grew.printed}, drawn ${result.grew.onMat}` +
    (result.grew.printed && result.grew.onMat && result.grew.printed !== result.grew.onMat ? '  <- BIGGER' : ''));
}
log(`  Aura attached on cast:  ${result.auraCast?.attachedTo ? 'YES (to ' + result.auraCast.attachedToName + ')' : 'NO'}`);
log('  log tail:');
for (const line of finalState.lastLog) log('    ' + line);

/* An `ATTACH` that reached the log counts, even when a state-based action
   correctly took it off again a moment later. */
const attachedInLog = await page.evaluate(() =>
  (window.__dmGame?.log ?? []).some(e => / attached to /.test(e.message || ''))
);
log(`  an ATTACH reached the log:  ${attachedInLog ? 'YES' : 'NO'}`);

await browser.close();
if (!attachedInLog) process.exit(1);
