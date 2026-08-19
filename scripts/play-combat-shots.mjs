/**
 * Play a real game of DeckMatrix in a real browser, and photograph combat.
 *
 * This is not a unit test. It presses the pixels a player presses — the sword
 * on a creature, the shield on a blocker, END TURN — and reads the resulting
 * life totals out of the engine state the board is drawing. Combat is reported
 * as working only if this run makes damage happen in both directions.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------------------------------------------------------- *
 * The harness page
 *
 * `/play` sits behind `ProtectedRoute` and a screenshot run has no credentials,
 * so the board cannot be reached through the front door. This writes a dev-only
 * entry that mounts the REAL `Play` page — not a copy — with the providers
 * `App.tsx` gives it and without the auth gate. `useAuth()` returns a signed-out
 * user, which `Play` already handles: no saved decks, so every seat is dealt a
 * seeded one.
 *
 * Written here rather than committed because the repo gitignores agent
 * scaffolding (`src/pages/__*.tsx`, `dm-harness.*`), and a page that renders the
 * app without a session should not be one of the files that ships. Vite's build
 * input is `index.html` alone, so it is never bundled either way.
 * -------------------------------------------------------------------------- */

const HARNESS_HTML = 'play-harness.html';
const HARNESS_ENTRY = 'src/dev/__playHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(HARNESS_HTML, `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Play harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`);
fs.writeFileSync(HARNESS_ENTRY, `/* Gitignored puppeteer harness for play mode. Written by
 * scripts/play-combat-shots.mjs. Not shipped, not routed, not built. */
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
  // A board of 30-odd Scryfall images makes captureScreenshot slow enough to
  // trip the default 30s protocol timeout on a cold cache.
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') log('  [console]', m.text().slice(0, 200)); });

const shot = async name => {
  const file = `${OUT}/combat-${String(shotN++).padStart(2, '0')}-${name}.png`;
  try {
    await page.screenshot({ path: file });
    log('  shot ->', file);
  } catch (error) {
    log('  shot FAILED (' + name + '): ' + String(error.message).slice(0, 90));
  }
};

/** The live game, straight out of the engine the board is rendering. */
const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    life: g.players.map(p => ({ id: p.id, name: p.name, life: p.life })),
    attackers: g.combat.attackers.map(d => ({
      attacker: g.cards[d.attackerId]?.name,
      attackerId: d.attackerId,
      controller: g.cards[d.attackerId]?.controllerId,
      defender: d.defenderPlayerId,
      blockedBy: d.blockedBy.map(id => g.cards[id]?.name),
    })),
    board: g.players.map(p => ({
      id: p.id,
      battlefield: p.zones.battlefield.map(id => {
        const c = g.cards[id];
        return c && { name: c.name, tapped: c.tapped, sick: c.summoningSick, types: c.types };
      }).filter(Boolean),
      hand: p.zones.hand.length,
    })),
  };
});

const say = async label => {
  const g = await game();
  if (!g) { log(`  [${label}] no game yet`); return null; }
  log(`  [${label}] T${g.turn} ${g.step} active=${g.active}  life=${g.life.map(p => `${p.name}:${p.life}`).join(' ')}`);
  if (g.attackers.length) {
    for (const a of g.attackers) {
      log(`      ATTACK ${a.attacker} (${a.controller}) -> ${a.defender}` +
          (a.blockedBy.length ? `  blocked by ${a.blockedBy.join(', ')}` : '  UNBLOCKED'));
    }
  }
  return g;
};

/* Buttons are found by their accessible name, the same handle a player uses. */
const clickByTitleOrText = async (needle, { nth = 0 } = {}) => {
  const handle = await page.evaluateHandle((needle, nth) => {
    const all = [...document.querySelectorAll('button, [role="button"]')];
    const hit = all.filter(el => {
      if (el.disabled) return false;
      const s = `${el.getAttribute('title') || ''} ${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
      return s.toLowerCase().includes(needle.toLowerCase());
    });
    return hit[nth] || null;
  }, needle, nth);
  const el = handle.asElement();
  if (!el) return false;
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await el.click();
  return true;
};

/* Buttons whose title matches a pattern — the combat chips are titled in full
   sentences ("Attack with Bears (2/2)", "Block Baloth (4/4) with Bears"), so a
   regex is what distinguishes a blocker's chip from an attacker's. */
const byTitle = re => page.evaluate(src => {
  return [...document.querySelectorAll('button')]
    .filter(el => !el.disabled && new RegExp(src).test(el.getAttribute('title') || ''))
    .map(el => el.getAttribute('title'));
}, re.source);

const clickTitle = async (re, nth = 0) => {
  const h = await page.evaluateHandle((src, nth) => {
    const hit = [...document.querySelectorAll('button')]
      .filter(el => !el.disabled && new RegExp(src).test(el.getAttribute('title') || ''));
    return hit[nth] || null;
  }, re.source, nth);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  await new Promise(r => setTimeout(r, 350));
  return true;
};

/** A button by its visible text, exactly how a player reads it. */
const clickText = async re => {
  const h = await page.evaluateHandle(src => {
    return [...document.querySelectorAll('button')]
      .find(el => !el.disabled && new RegExp(src, 'i').test((el.innerText || '').trim())) || null;
  }, re.source);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  await new Promise(r => setTimeout(r, 400));
  return true;
};

/* ------------------------------------------------------------------ setup */
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await shot('setup');
log('=== setup page ===');
log((await page.evaluate(() => document.body.innerText)).slice(0, 1500));

/* ------------------------------------------------------------------- start */
/* A cautious opponent: it still blocks, but it stops racing me off the table
   before I have a board to swing back with. */
await clickText(/^Cautious$/);
await sleep(400);
if (!(await clickByTitleOrText('Start 2-player game'))) throw new Error('no start button');

/* Keep the opening hand. The London mulligan is answered before the first
   untap and the table does not move until it is. */
await new Promise(r => setTimeout(r, 4000));
await clickByTitleOrText('Keep');
await sleep(6000);
await shot('table-turn1');
await say('opening');

/*
 * Free cast, on.
 *
 * Not a cheat for its own sake: the seeded deck kept dealing one small creature
 * into a bot that holds a 0/3 Wall of Wood, so every swing was legitimately
 * blocked and the player's own damage never got to be photographed. Free cast
 * is a shipped playtest toggle in the game menu; turning it on builds a board
 * wide enough that an alpha strike is a decision rather than a coincidence.
 */
/* Dispatched on the element rather than at its coordinates: the HUD floats over
   the table and a coordinate click can be swallowed by whatever sits on top. */
const pressByTitle = async needle => page.evaluate(needle => {
  const el = [...document.querySelectorAll('button')]
    .find(e => (e.getAttribute('title') || '').includes(needle));
  if (!el) return false;
  el.click();
  return true;
}, needle);

log(`  game menu opened: ${await pressByTitle('Game menu')}`);
await sleep(1500);
log(`  free cast on: ${await pressByTitle('ignore mana entirely')}`);
await sleep(800);
await pressByTitle('Close the menu');
await sleep(800);

/* ---------------------------------------------------------------- helpers */

/** Hand cards, as the buttons the player actually clicks. */
const handButtons = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button[title]')) {
    const t = el.getAttribute('title') || '';
    if (t.includes('Click to preview')) out.push(t);
  }
  return out;
});

const clickHandCard = async title => {
  const h = await page.evaluateHandle(title => {
    return [...document.querySelectorAll('button[title]')]
      .find(el => el.getAttribute('title') === title) || null;
  }, title);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  await new Promise(r => setTimeout(r, 350));
  return true;
};

/** Is a rail action button present and enabled? */
const railAction = label => page.evaluate(label => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.innerText || '').trim().toUpperCase() === label.toUpperCase());
  return el ? !el.disabled : null;
}, label);

const clickRailAction = async label => {
  const h = await page.evaluateHandle(label => {
    return [...document.querySelectorAll('button')]
      .find(b => (b.innerText || '').trim().toUpperCase() === label.toUpperCase() && !b.disabled) || null;
  }, label);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  await new Promise(r => setTimeout(r, 500));
  return true;
};

/** Play a land and cast everything affordable, then close the rail. */
async function developBoard() {
  const land = (await handButtons()).find(t => t.includes('playable as a land drop'));
  if (land) {
    await clickHandCard(land);
    if (await clickRailAction('Play land')) log(`  played land: ${land.split(' —')[0]}`);
  }
  for (let i = 0; i < 6; i++) {
    const cards = await handButtons();
    let cast = false;
    for (const t of cards) {
      if (t.includes('playable as a land drop')) continue;
      await clickHandCard(t);
      if ((await railAction('Cast')) === true) {
        await clickRailAction('Cast');
        log(`  cast: ${t.split(' —')[0]}`);
        cast = true;
        break;
      }
    }
    if (!cast) break;
  }
  await clickRailAction('Close');
}

/** Wait until the human seat is being asked for something, or the turn moves on. */
async function settle(ms = 9000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < ms) {
    const g = await game();
    const key = g ? `${g.turn}:${g.step}:${g.active}` : '';
    if (key === last) { await sleep(300); } else { last = key; await sleep(600); }
    if (g && g.status !== 'playing') return g;
    // stop early on a decision that belongs to us
    if (g && ((g.step === 'declare_attackers' && g.active === 'p1') ||
              (g.step === 'declare_blockers' && g.attackers.some(a => a.defender === 'p1')) ||
              (g.step === 'precombat_main' && g.active === 'p1'))) {
      await sleep(500);
      return g;
    }
  }
  return game();
}

/** The number the combat bar is showing, straight off the strip. */
const barDamage = () => page.evaluate(() => {
  const label = [...document.querySelectorAll('p')]
    .find(p => /damage through|lethal/i.test(p.textContent || ''));
  if (!label) return null;
  const n = label.previousElementSibling;
  return n ? Number(n.textContent.trim()) : null;
});

/* ------------------------------------------------------- play some turns */

/** Press every sword on the board, then say "attacks". */
async function declareAttackers(g) {
  const offered = await byTitle(/^Attack with /);
  log(`  T${g.turn}: ${offered.length} sword(s): ${offered.join(' | ')}`);
  if (offered.length === 0) return null;
  await shot(`t${g.turn}-swords-offered`);
  for (let i = 0; i < offered.length; i++) {
    if (!(await clickTitle(/^Attack with /))) break;
  }
  const after = await say('attackers declared');
  await shot(`t${g.turn}-attackers-declared`);
  const before = (await game()).life.find(p => p.id === 'p2').life;
  const predicted = await barDamage();
  log(`    the bar predicts ${predicted} damage through`);
  await clickText(/^Attack with \d/);          // the combat bar's confirm

  /* Watch the swing all the way to damage. "Surrak is still on 40" means
     nothing on its own — the bot may have blocked, which is a correct
     outcome — so the blocks it declared are recorded as they happen. */
  let blocks = null;
  for (let i = 0; i < 40; i++) {
    const s = await game();
    if (s && s.step === 'declare_blockers' && s.attackers.length) {
      blocks = s.attackers.map(a =>
        `${a.attacker}${a.blockedBy.length ? ' BLOCKED by ' + a.blockedBy.join('+') : ' unblocked'}`);
    }
    if (s && (s.turn > g.turn || s.step === 'end' || s.step === 'postcombat_main')) break;
    await sleep(250);
  }
  if (blocks) log('    at the blockers step: ' + blocks.join(' | '));
  await sleep(1200);
  /* Every action the table applied around this swing, so a swing that deals no
     damage says which action walked past the combat damage step. */
  const trace = await page.evaluate(() => (window.__dmLog || []).slice(-14));
  for (const line of trace) log('      | ' + line);
  /* The lanes as they stood when damage was dealt — the authoritative answer to
     "was it blocked", which polling the board from outside keeps missing. */
  const lane = trace.find(l => l.includes('--ADVANCE_STEP--> combat_damage'));
  blocks = lane ? [lane.slice(lane.indexOf('[') + 1, lane.lastIndexOf(']'))] : blocks;
  return { declared: after.attackers.length, opponentLifeBefore: before, blocks, predicted };
}

/** Put a body in front of the biggest thing swinging at me. */
async function declareBlockers(g) {
  log(`  >>> the bot is attacking me with ${g.attackers.length}`);
  await shot(`t${g.turn}-under-attack`);
  const armable = await byTitle(/^Block with /);
  log(`  ${armable.length} creature(s) can block: ${armable.join(' | ')}`);
  let blocked = 0;
  for (let i = 0; i < armable.length; i++) {
    if (!(await clickTitle(/^Block with /))) break;      // arm it
    await shot(`t${g.turn}-blocker-armed`);
    const targets = await byTitle(/^Block .+ with /);    // attackers it may block
    log(`    can be put in front of: ${targets.join(' | ')}`);
    if (targets.length === 0) { await clickTitle(/^.+ is ready/); continue; }
    /* Stand in front of the biggest thing, the way a player would. */
    const power = t => Number((t.match(/\((\d+)\/\d+\)/) || [0, 0])[1]);
    const best = targets.indexOf(targets.slice().sort((a, b) => power(b) - power(a))[0]);
    if (await clickTitle(/^Block .+ with /, best)) blocked++;
    await sleep(400);
  }
  if (blocked > 0) { await say('blocks assigned'); await shot(`t${g.turn}-blocks-assigned`); }
  const lifeBefore = (await game()).life.find(p => p.id === 'p1').life;
  await clickText(/^(Confirm \d+ block|No blocks)/);
  await sleep(2500);
  return { blocked, lifeBefore };
}

const story = [];
let guard = 0;
while (guard++ < 200) {
  const g = await game();
  if (!g || g.status !== 'playing') break;
  if (g.turn > 22) break;

  if (g.step === 'declare_blockers' && g.attackers.some(a => a.defender === 'p1')) {
    const r = await declareBlockers(g);
    const after = await say('after damage (I was attacked)');
    story.push(`T${g.turn} bot attacked with ${g.attackers.length}, I blocked ${r.blocked}: ` +
               `my life ${r.lifeBefore} -> ${after.life.find(p => p.id === 'p1').life}`);
    continue;
  }

  if (g.active === 'p1' && g.step === 'precombat_main') {
    await developBoard();
    // The sword in the HUD: the one press that takes you to combat.
    if (await clickText(/^Attack$/)) { await sleep(1800); continue; }
    await clickText(/^END TURN$/);
    await sleep(2000);
    continue;
  }

  if (g.active === 'p1' && g.step === 'declare_attackers') {
    const r = await declareAttackers(g);
    const after = await say('after my swing');
    if (r) {
      story.push(`T${g.turn} I attacked with ${r.declared} (bar said ${r.predicted})` +
                 (r.blocks ? ` [${r.blocks.join('; ')}]` : '') +
                 `: Surrak ${r.opponentLifeBefore} -> ${after.life.find(p => p.id === 'p2').life}`);
    }
    continue;
  }

  if (g.active === 'p1' && g.step === 'postcombat_main') {
    await developBoard();
    await clickText(/^END TURN$/);
    await sleep(2000);
    continue;
  }

  await sleep(900);
}

await shot('final');
await say('final');
log('\n=== WHAT HAPPENED ===');
for (const line of story) log('  ' + line);

await browser.close();
process.exit(0);
