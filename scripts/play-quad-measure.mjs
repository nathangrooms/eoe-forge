/**
 * FOUR-PLAYER BOARD MEASUREMENT.
 *
 * `play-board-measure.mjs` starts the lobby's default, which is one opponent —
 * so it measures a two-seat table and can say nothing at all about the quads or
 * about a support block on a half-width mat. This one picks *Versus bots*, sets
 * the opponent count to three, and measures the thing the owner is describing.
 *
 * Same harness, same offline deal (Supabase refused at the network boundary).
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/quads';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const TAG = process.env.TAG || 'before';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => { if (m.type() === 'error') log('  [error]', m.text().slice(0, 160)); });

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
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

let shotN = 0;
const shot = async name => {
  const file = `${OUT}/${TAG}-${String(shotN++).padStart(2, '0')}-${name}.png`;
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
const pressExact = text => page.evaluate(text => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && (b.innerText || '').trim() === text);
  if (!el) return false;
  el.click();
  return true;
}, text);
const pressTitle = needle => page.evaluate(needle => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('title') || '').includes(needle));
  if (!el) return false;
  el.click();
  return true;
}, needle);

const SEATS = "[...document.querySelectorAll('section[aria-label]')].filter(n => / seat$/.test(n.getAttribute('aria-label')))";

const quads = () => page.evaluate(`(() => {
  const seats = ${SEATS};
  const host = seats[0] ? seats[0].parentElement.parentElement : null;
  const hostBox = host ? host.getBoundingClientRect() : null;
  return {
    board: hostBox && { x: Math.round(hostBox.x), y: Math.round(hostBox.y), w: Math.round(hostBox.width), h: Math.round(hostBox.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    seats: seats.map(s => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s.parentElement);
      return {
        who: s.getAttribute('aria-label'),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        pctW: hostBox ? +(r.width / hostBox.width * 100).toFixed(1) : null,
        pctH: hostBox ? +(r.height / hostBox.height * 100).toFixed(1) : null,
        upright: cs.transform === 'none' || /matrix\\(1, 0, 0, 1/.test(cs.transform),
      };
    }),
  };
})()`);

const overflow = () => page.evaluate(`(() => {
  const rows = [];
  for (const seat of ${SEATS}) {
    const seatBox = seat.getBoundingClientRect();
    for (const region of seat.querySelectorAll('[aria-label]')) {
      const label = (region.getAttribute('aria-label') || '').replace(/,.*$/, '');
      if (!/^(Creatures|Lands|Artifacts|Noncreature)/.test(label)) continue;
      const box = region.getBoundingClientRect();
      const cards = [...region.querySelectorAll('[data-instance]')].map(el => el.getBoundingClientRect());
      if (!cards.length) continue;
      const left = Math.min(...cards.map(c => c.x));
      const right = Math.max(...cards.map(c => c.x + c.width));
      const top = Math.min(...cards.map(c => c.y));
      const bottom = Math.max(...cards.map(c => c.y + c.height));
      rows.push({
        seat: seat.getAttribute('aria-label'), zone: label, count: cards.length,
        cardW: Math.round(cards[0].width),
        container: Math.round(box.x) + '..' + Math.round(box.x + box.width) + ' (' + Math.round(box.width) + 'px)',
        painted: Math.round(left) + '..' + Math.round(right) + ' (' + Math.round(right - left) + 'px)',
        overRight: Math.round(right - (box.x + box.width)),
        overLeft: Math.round(box.x - left),
        overBottom: Math.round(bottom - (box.y + box.height)),
        pastSeatRight: Math.round(right - (seatBox.x + seatBox.width)),
        pastViewportRight: Math.round(right - window.innerWidth),
        usedPct: Math.round(((right - left) / box.width) * 100),
      });
    }
  }
  return rows;
})()`);

const boxes = () => page.evaluate(`(() => {
  const out = {};
  const put = (key, el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 && r.height < 4) return;
    out[key] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  for (const seat of ${SEATS}) {
    const who = seat.getAttribute('aria-label');
    put('seat|' + who, seat);
    for (const region of seat.querySelectorAll('[aria-label]')) {
      const label = region.getAttribute('aria-label') || '';
      if (!/^(Creatures|Lands|Artifacts|Noncreature)/.test(label)) continue;
      put('row|' + who + '|' + label.replace(/,.*$/, ''), region);
      for (const el of region.querySelectorAll('[data-instance]')) {
        const id = el.getAttribute('data-instance');
        if (id) put('card|' + who + '|' + id, el);
      }
    }
  }
  return out;
})()`);

const diff = (before, after) => {
  const moved = [];
  for (const key of Object.keys(before)) {
    const a = after[key];
    if (!a) continue;
    const b = before[key];
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    if (d > 1) moved.push({ key, d: +d.toFixed(1), from: b, to: a });
  }
  moved.sort((p, q) => q.d - p.d);
  return moved;
};
const report = (label, moved, total) => {
  if (moved.length === 0) { log(`  ${label}: CLEAN (0 of ${total})`); return; }
  log(`  ${label}: ${moved.length} of ${total} moved, worst ${moved[0].d}px`);
  for (const m of moved.slice(0, 6)) {
    log(`     ${m.key}  ${m.from.x},${m.from.y} ${m.from.w}x${m.from.h}  ->  ${m.to.x},${m.to.y} ${m.to.w}x${m.to.h}`);
  }
  if (moved.length > 6) log(`     ... and ${moved.length - 6} more`);
};
async function measureAction(label, act, settle = 1500) {
  const before = await boxes();
  const did = await act();
  if (did === false) { log(`  ${label}: SKIPPED`); return; }
  await sleep(settle);
  report(label, diff(before, await boxes()), Object.keys(before).length);
}

const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId,
    players: g.players.map(p => `${p.name}(${p.zones.battlefield.length}p ${p.life}l)`).join(' '),
    attackers: g.combat.attackers.length,
  };
});

/* ==================================================================== run */

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

log('versus bots:', await pressText(/Versus bots/));
await sleep(800);
log('three opponents:', await pressExact('3'));
await sleep(800);
await shot('lobby-4p');
log('start:', await pressText(/Start 4-player game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(4000);
log('dealt:', JSON.stringify(await game()));
log('kept:', await pressText(/^Keep$/));
await sleep(1500);
await shot('table-4p-1920');

for (const width of [1920, 1280]) {
  await page.setViewport({ width, height: Math.round(width * 0.5625), deviceScaleFactor: 1 });
  await sleep(1800);
  log(`\n=== 2: QUADS at ${width} ===`);
  log(JSON.stringify(await quads(), null, 1));
  await shot(`quads-${width}`);
}

await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await sleep(1500);

/* Build boards on every seat, so the rows and the block are actually loaded. */
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) {
    const lands = p.zones.library.filter(i => /Land/.test(g.cards[i].typeLine || '')).slice(0, 7);
    const creatures = p.zones.library.filter(i => /Creature/.test(g.cards[i].typeLine || '')).slice(0, 6);
    const support = p.zones.library.filter(i => {
      const t = g.cards[i].typeLine || '';
      return /Artifact|Enchantment|Planeswalker/.test(t) && !/Creature/.test(t);
    }).slice(0, 5);
    for (const id of [...lands, ...creatures, ...support]) {
      window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
    }
  }
});
await sleep(2500);
await shot('boards-loaded-1920');
log('\nloaded:', JSON.stringify(await game()));

log('\n=== 3: OVERFLOW, four seats, loaded boards ===');
for (const width of [1680, 1440, 1280]) {
  await page.setViewport({ width, height: Math.round(width * 0.62), deviceScaleFactor: 1 });
  await sleep(1800);
  log(`\n  -- ${width} --`);
  for (const row of await overflow()) log('    ' + JSON.stringify(row));
  await shot(`overflow-${width}`);
}

await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
await sleep(1500);

log('\n=== 1: LAYOUT SHIFT on a four-seat table ===');
await measureAction('TAP one of mine', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[0].zones.battlefield.find(i => !g.cards[i].tapped);
  if (!id) return false;
  window.__dmDispatch({ type: 'TAP', instanceId: id });
  return true;
}));
await measureAction('TAP one of theirs', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[2].zones.battlefield.find(i => !g.cards[i].tapped);
  if (!id) return false;
  window.__dmDispatch({ type: 'TAP', instanceId: id });
  return true;
}));
await measureAction('CREATURE DIES on seat 3', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[2].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
  return true;
}), 1800);
await measureAction('CREATURE ENTERS on my seat', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[0].zones.library.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  return true;
}), 1800);
await measureAction('DAMAGE marked on a creature', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[0].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'DAMAGE_CARD', instanceId: id, amount: 1 });
  return true;
}));
await measureAction('COUNTER on a creature', () => page.evaluate(() => {
  const g = window.__dmGame;
  const id = g.players[0].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'CARD_COUNTER', instanceId: id, counter: '+1/+1', delta: 1 });
  return true;
}));

/* --------------------------------------------------------------- 6: combat */

log('\n=== 6: COMBAT, as a player sees it ===');
await page.evaluate(() => {
  const g = window.__dmGame;
  /* Untap everything of seat 2 and put the game in their declare-attackers. */
  for (const id of g.players[1].zones.battlefield) window.__dmDispatch({ type: 'UNTAP', instanceId: id });
});
await sleep(600);
const combatShape = await page.evaluate(() => {
  const g = window.__dmGame;
  const attacker = g.players[1];
  const mine = g.players[0];
  const creatures = attacker.zones.battlefield.filter(i => /Creature/.test(g.cards[i].typeLine || '')).slice(0, 3);
  window.__dmDispatch({
    type: 'ATTACK',
    attackers: creatures.map(id => ({ attackerId: id, defenderPlayerId: mine.id })),
  });
  return creatures.length;
});
log('  attackers declared:', combatShape);
await sleep(2500);
await shot('combat-under-attack');
log('  state:', JSON.stringify(await game()));

log('  what the screen says:');
log('  ' + JSON.stringify(await page.evaluate(() => {
  const text = (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
  const g = window.__dmGame;
  return {
    step: g.step,
    attackers: g.combat.attackers.map(a => ({
      who: g.cards[a.attackerId].name,
      power: g.cards[a.attackerId].power,
      at: g.players.find(p => p.id === a.defenderPlayerId)?.name,
      blockedBy: a.blockedBy.map(id => g.cards[id].name),
    })),
    /* Does the board name the attack anywhere a player would read it? */
    linesMentioningAttack: text.filter(l => /attack|block|swing|combat|damage/i.test(l)).slice(0, 12),
    /* The chips drawn on the cards. */
    combatChips: [...document.querySelectorAll('[data-instance]')]
      .map(el => ({ n: el.getAttribute('title'), t: (el.innerText || '').replace(/\n/g, ' ').trim().slice(0, 60) }))
      .filter(e => /block|attack|⚔|🛡/i.test(e.t)).slice(0, 10),
    /* Is any total damage shown? */
    hasDamagePreview: /\b\d+\s*(damage|incoming)/i.test(document.body.innerText || ''),
  };
}, null), null, 1));

await browser.close();
process.exit(0);
