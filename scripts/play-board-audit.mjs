/**
 * THE BOARD AUDIT. One script, run before and after, so every claim about the
 * play board is a number that came off the real page twice.
 *
 * Four seats, boards loaded on every one of them, at three widths. It answers:
 *
 *   1. LAYOUT SHIFT — every card's box before and after each action a player
 *      can take. Zero movement is the standard.
 *   2. QUADS — the four seat rectangles against the board they divide.
 *   3. CLIP — how far anything PAINTS past its container, its seat and the
 *      viewport. Painted, not laid out: see `paintedBox` below.
 *   4. LOG — whether the control is wired and what it opens.
 *   6. COMBAT — what a player can read off the screen while under attack.
 *
 * ## Why painted extent and not `getBoundingClientRect` on the card
 *
 * `GameCardView` puts the tap rotation on an INNER element, deliberately, so
 * that turning a card cannot reflow the row. The consequence for a measurement
 * is that the outer element — the one carrying `data-instance` — reports the
 * UNROTATED box, while the eye sees a rectangle a card-height wide. Measuring
 * the outer box therefore reports "no overflow" for a row of tapped lands that
 * is visibly hanging off the mat. Every probe here reads the rotated child.
 *
 * Harness: the real `Play` page with the app's providers, Supabase refused at
 * the network boundary so `deckSource.ts` deals its offline list. See
 * `play-preview-shots.mjs` for why the Vite HMR client is stubbed out.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/audit-board';
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
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
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

/* Shared page-side helpers, injected once per evaluate as a prelude string. */
const PRELUDE = `
  const SEATS = () => [...document.querySelectorAll('section[aria-label]')]
    .filter(n => / seat$/.test(n.getAttribute('aria-label') || ''));
  /* The rectangle a card actually COVERS. The rotation lives on the first
     element child, so that is what has to be measured; the outer box is what a
     tapped card would occupy if it were not turned. */
  const paintedBox = el => {
    const inner = el.firstElementChild;
    return (inner || el).getBoundingClientRect();
  };
  const zoneName = el => (el.getAttribute('aria-label') || '').replace(/,.*$/, '');
  const isZone = el => /^(Creatures|Lands|Artifacts|Noncreature)/.test(zoneName(el));
`;
const inPage = body => page.evaluate(`(() => {${PRELUDE}${body}})()`);

/* --------------------------------------------------------------- probes */

const boxes = () => inPage(`
  const out = {};
  const put = (key, r) => {
    if (r.width < 4 && r.height < 4) return;
    out[key] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  for (const seat of SEATS()) {
    const who = seat.getAttribute('aria-label') + '#' + [...SEATS()].indexOf(seat);
    put('seat|' + who, seat.getBoundingClientRect());
    for (const region of seat.querySelectorAll('[aria-label]')) {
      if (!isZone(region)) continue;
      put('row|' + who + '|' + zoneName(region), region.getBoundingClientRect());
      for (const el of region.querySelectorAll('[data-instance]')) {
        const id = el.getAttribute('data-instance');
        if (id) put('card|' + who + '|' + id, el.getBoundingClientRect());
      }
    }
  }
  return out;
`);

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
  if (moved.length === 0) { log(`  ${label.padEnd(34)} CLEAN  (0 of ${total})`); return false; }
  log(`  ${label.padEnd(34)} ${moved.length} of ${total} moved, worst ${moved[0].d}px`);
  for (const m of moved.slice(0, 5)) {
    log(`       ${m.key}  ${m.from.x},${m.from.y} ${m.from.w}x${m.from.h} -> ${m.to.x},${m.to.y} ${m.to.w}x${m.to.h}`);
  }
  if (moved.length > 5) log(`       ... and ${moved.length - 5} more`);
  return true;
};
async function measureAction(label, act, settle = 1500) {
  const before = await boxes();
  const did = await act();
  if (did === false) { log(`  ${label.padEnd(34)} SKIPPED`); return; }
  await sleep(settle);
  report(label, diff(before, await boxes()), Object.keys(before).length);
}

const quads = () => inPage(`
  const seats = SEATS();
  const host = seats[0] ? seats[0].parentElement.parentElement : null;
  const hb = host ? host.getBoundingClientRect() : null;
  return {
    board: hb && { x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.width), h: Math.round(hb.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    seats: seats.map((s, i) => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s.parentElement);
      const slot = s.parentElement.getBoundingClientRect();
      return {
        i, who: s.getAttribute('aria-label'),
        slot: Math.round(slot.width) + 'x' + Math.round(slot.height) + ' @' + Math.round(slot.x) + ',' + Math.round(slot.y),
        mat: Math.round(r.width) + 'x' + Math.round(r.height) + ' @' + Math.round(r.x) + ',' + Math.round(r.y),
        slotPctW: hb ? +(slot.width / hb.width * 100).toFixed(2) : null,
        slotPctH: hb ? +(slot.height / hb.height * 100).toFixed(2) : null,
        upright: cs.transform === 'none' || /matrix\\(1, 0, 0, 1/.test(cs.transform),
      };
    }),
  };
`);

/** Painted overflow, per zone, per seat. */
const clip = () => inPage(`
  const rows = [];
  for (const seat of SEATS()) {
    const sb = seat.getBoundingClientRect();
    for (const region of seat.querySelectorAll('[aria-label]')) {
      if (!isZone(region)) continue;
      const box = region.getBoundingClientRect();
      const cards = [...region.querySelectorAll('[data-instance]')];
      if (!cards.length) continue;
      const paints = cards.map(paintedBox);
      const left = Math.min(...paints.map(c => c.x));
      const right = Math.max(...paints.map(c => c.x + c.width));
      const top = Math.min(...paints.map(c => c.y));
      const bottom = Math.max(...paints.map(c => c.y + c.height));
      rows.push({
        seat: [...SEATS()].indexOf(seat) + ':' + seat.getAttribute('aria-label'),
        zone: zoneName(region),
        n: cards.length,
        tapped: cards.filter(c => c.getAttribute('data-tapped') === 'true').length,
        cardW: Math.round(cards[0].getBoundingClientRect().width),
        box: Math.round(box.x) + '..' + Math.round(box.x + box.width),
        paint: Math.round(left) + '..' + Math.round(right),
        overR: Math.round(right - (box.x + box.width)),
        overL: Math.round(box.x - left),
        overB: Math.round(bottom - (box.y + box.height)),
        overT: Math.round(box.y - top),
        pastSeatR: Math.round(right - (sb.x + sb.width)),
        pastVpR: Math.round(right - window.innerWidth),
        usePct: Math.round(((right - left) / box.width) * 100),
      });
    }
  }
  return rows;
`);

const worstClip = rows => {
  const bad = rows.filter(r => r.overR > 0 || r.overL > 0 || r.overB > 0 || r.pastSeatR > 0);
  return { count: bad.length, worst: bad.length ? Math.max(...bad.map(r => Math.max(r.overR, r.overL, r.overB, r.pastSeatR))) : 0, bad };
};

const logProbe = () => inPage(`
  const list = document.querySelector('ol[aria-label="Game log"]');
  const btn = [...document.querySelectorAll('button')]
    .find(b => /^(log|hide log|close log)$/i.test((b.innerText || '').trim()));
  const g = window.__dmGame;
  const box = list ? list.getBoundingClientRect() : null;
  const items = list ? [...list.querySelectorAll('li')] : [];
  return {
    engineEntries: g ? g.log.length : null,
    structuralShare: g ? Math.round(g.log.filter(e => e.type === 'ADVANCE_STEP' || e.type === 'PHASE_CHANGE').length / Math.max(1, g.log.length) * 100) + '%' : null,
    control: btn && { text: btn.innerText.trim(), expanded: btn.getAttribute('aria-expanded'),
      at: (() => { const r = btn.getBoundingClientRect(); return Math.round(r.x) + ',' + Math.round(r.y); })() },
    listBox: box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
    lines: items.length,
    truncated: items.filter(li => li.scrollWidth > li.clientWidth + 1).length,
    sample: items.slice(-5).map(li => li.innerText.replace(/\\n/g, ' | ')),
  };
`);

const matProbe = () => inPage(`
  return SEATS().map(seat => {
    const b = seat.getBoundingClientRect();
    const art = [...seat.querySelectorAll('div')].find(d => /url\\(/.test(getComputedStyle(d).backgroundImage));
    const surface = [...seat.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundImage !== 'none');
    return {
      seat: seat.getAttribute('aria-label'),
      box: Math.round(b.width) + 'x' + Math.round(b.height),
      artUrl: art ? (getComputedStyle(art).backgroundImage.match(/url\\("?([^")]+)"?\\)/) || [])[1] : null,
      artFilter: art ? getComputedStyle(art).filter : null,
      layers: surface ? getComputedStyle(surface).backgroundImage.split('),').length : 0,
    };
  });
`);

const combatRead = () => inPage(`
  const g = window.__dmGame;
  const text = document.body.innerText || '';
  return {
    step: g.step,
    engineSays: g.combat.attackers.map(a => ({
      attacker: g.cards[a.attackerId].name,
      at: (g.players.find(p => p.id === a.defenderPlayerId) || {}).name,
      blockedBy: a.blockedBy.map(id => g.cards[id].name),
    })),
    /* Anything on screen naming the attack. */
    screenLines: text.split('\\n').map(s => s.trim()).filter(s => /attack|block|combat|incoming|damage|lethal|unblocked/i.test(s)).slice(0, 14),
    /* Per-card combat marks. */
    marks: [...document.querySelectorAll('[data-instance]')]
      .map(el => ({ card: el.getAttribute('title') || '', role: el.getAttribute('data-combat-role'),
        text: (el.innerText || '').replace(/\\n/g, ' ').trim().slice(0, 50) }))
      .filter(m => m.role || /block|attack/i.test(m.text)).slice(0, 12),
    /* A line of sight from an attacker to who it is hitting. */
    lanes: document.querySelectorAll('[data-combat-lane]').length,
  };
`);

/* ==================================================================== run */

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

await pressText(/Versus bots/); await sleep(700);
await pressExact('3'); await sleep(700);
log('start:', await pressText(/Start 4-player game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(4000);

log('\n=== 4: THE LOG, fresh game ===');
log('  ' + JSON.stringify(await logProbe()));

await pressText(/^Keep$/);
await sleep(1500);
await shot('table');

log('\n=== 2: QUADS ===');
for (const [w, h] of [[1920, 1080], [1680, 1050], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(1600);
  const q = await quads();
  log(`  ${w}x${h}  board ${q.board.w}x${q.board.h} @${q.board.x},${q.board.y}`);
  for (const s of q.seats) {
    log(`    seat ${s.i} slot ${s.slot}  (${s.slotPctW}% x ${s.slotPctH}%)  mat ${s.mat}  upright=${s.upright}`);
  }
}

await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
await sleep(1400);

/* Load every seat: 8 lands, 7 creatures, 6 noncreatures. A real mid-game. */
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) {
    const pick = (re, no, n) => p.zones.library.filter(i => {
      const t = g.cards[i].typeLine || '';
      return re.test(t) && (!no || !no.test(t));
    }).slice(0, n);
    for (const id of [...pick(/Land/, null, 8), ...pick(/Creature/, /Land/, 7),
      ...pick(/Artifact|Enchantment|Planeswalker/, /Creature|Land/, 6)]) {
      window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
    }
  }
});
await sleep(2500);
await shot('loaded');

log('\n=== 3: CLIP, painted extent, loaded boards ===');
for (const width of [1680, 1440, 1280]) {
  await page.setViewport({ width, height: Math.round(width * 0.62), deviceScaleFactor: 1 });
  await sleep(1700);
  const rows = await clip();
  const w = worstClip(rows);
  log(`\n  -- ${width} --  zones over their box: ${w.count}, worst ${w.worst}px`);
  for (const r of rows) log('    ' + JSON.stringify(r));
  await shot(`clip-${width}`);
}

/* Now tap everything: the painted-extent worst case. */
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) for (const id of p.zones.battlefield) {
    if (!g.cards[id].tapped) window.__dmDispatch({ type: 'TAP', instanceId: id });
  }
});
await sleep(2500);
log('\n=== 3b: CLIP with everything tapped ===');
for (const width of [1680, 1280]) {
  await page.setViewport({ width, height: Math.round(width * 0.62), deviceScaleFactor: 1 });
  await sleep(1700);
  const rows = await clip();
  const w = worstClip(rows);
  log(`\n  -- ${width} tapped --  zones over their box: ${w.count}, worst ${w.worst}px`);
  for (const r of rows) log('    ' + JSON.stringify(r));
  await shot(`clip-tapped-${width}`);
}
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) for (const id of p.zones.battlefield) {
    if (g.cards[id].tapped) window.__dmDispatch({ type: 'UNTAP', instanceId: id });
  }
});

await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
await sleep(1800);

log('\n=== 1: LAYOUT SHIFT — zero movement is the standard ===');
const D = body => page.evaluate(`(() => { const g = window.__dmGame; ${body} })()`);

await measureAction('TAP mine', () => D(`
  const id = g.players[0].zones.battlefield.find(i => !g.cards[i].tapped);
  if (!id) return false; window.__dmDispatch({ type: 'TAP', instanceId: id }); return true;`));
await measureAction('UNTAP mine', () => D(`
  const id = g.players[0].zones.battlefield.find(i => g.cards[i].tapped);
  if (!id) return false; window.__dmDispatch({ type: 'UNTAP', instanceId: id }); return true;`));
await measureAction('TAP six of theirs', () => D(`
  const ids = g.players[2].zones.battlefield.filter(i => !g.cards[i].tapped).slice(0, 6);
  if (!ids.length) return false;
  for (const id of ids) window.__dmDispatch({ type: 'TAP', instanceId: id });
  return true;`));
await measureAction('DRAW a card', () => D(`
  window.__dmDispatch({ type: 'DRAW', playerId: 'p1', count: 1 }); return true;`));
await measureAction('LIFE CHANGE', () => D(`
  window.__dmDispatch({ type: 'LIFE_CHANGE', playerId: 'p1', delta: -9 }); return true;`));
await measureAction('DAMAGE on a creature', () => D(`
  const id = g.players[0].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'DAMAGE_CARD', instanceId: id, amount: 2 }); return true;`));
await measureAction('+1/+1 COUNTER', () => D(`
  const id = g.players[0].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'CARD_COUNTER', instanceId: id, counter: '+1/+1', delta: 1 }); return true;`));
await measureAction('CREATURE ENTERS (mine)', () => D(`
  const id = g.players[0].zones.library.find(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); return true;`), 1800);
await measureAction('CREATURE DIES (mine)', () => D(`
  const id = g.players[0].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' }); return true;`), 1800);
await measureAction('LAND ENTERS (mine)', () => D(`
  const id = g.players[0].zones.library.find(i => /Land/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); return true;`), 1800);
await measureAction('NONCREATURE ENTERS (mine)', () => D(`
  const id = g.players[0].zones.library.find(i => { const t = g.cards[i].typeLine || '';
    return /Artifact|Enchantment/.test(t) && !/Creature|Land/.test(t); });
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); return true;`), 1800);
await measureAction('CREATURE DIES (opponent)', () => D(`
  const id = g.players[2].zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' }); return true;`), 1800);
/* ------------------------------------------------- growing a board from empty */

/*
 * The case the whole layout rule is FOR.
 *
 * The measurements above load seven creatures and eight lands onto a quarter
 * screen before they touch anything, which puts the rows right on the density
 * rungs — so almost every action crosses one. A real game does not start there:
 * it starts empty and grows. This clears the viewer's board and adds one
 * permanent at a time, which is what a player actually watches happen.
 */
log('=== 1b: GROWING A BOARD FROM EMPTY ===');
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const id of [...g.players[0].zones.battlefield]) {
    window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
  }
});
await sleep(2200);
for (let n = 1; n <= 6; n += 1) {
  await measureAction(`  creature ${n} arrives`, () => D(`
    const id = g.players[0].zones.library.find(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''));
    if (!id) return false;
    window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); return true;`), 1500);
}
await shot('grown');

await measureAction('ADVANCE STEP', () => D(`
  window.__dmDispatch({ type: 'ADVANCE_STEP', at: Date.now() }); return true;`), 1700);
await measureAction('OPEN LOG', () => pressText(/^Log$/), 1000);
log('\n=== 4: THE LOG, opened ===');
log('  ' + JSON.stringify(await logProbe(), null, 1));
await shot('log-open');
await measureAction('CLOSE LOG', () => pressText(/^Hide log$/), 1000);

/* ------------------------------------------------------------- 6: combat */

log('\n=== 6: COMBAT ===');
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const id of g.players[1].zones.battlefield) window.__dmDispatch({ type: 'UNTAP', instanceId: id });
});
await sleep(600);
const attacked = await page.evaluate(() => {
  const g = window.__dmGame;
  const creatures = g.players[1].zones.battlefield
    .filter(i => /Creature/.test(g.cards[i].typeLine || '') && !/Land/.test(g.cards[i].typeLine || ''))
    .slice(0, 4);
  if (!creatures.length) return 0;
  window.__dmDispatch({ type: 'ATTACK', attackers: creatures.map(id => ({ attackerId: id, defenderPlayerId: 'p1' })) });
  return creatures.length;
});
log('  attackers:', attacked);
await sleep(2500);
await shot('under-attack');
log('  ' + JSON.stringify(await combatRead(), null, 1));

log('\n=== 5: MATS ===');
for (const m of await matProbe()) log('  ' + JSON.stringify(m));
for (const [w, h] of [[1920, 1080], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(1600);
  await shot(`mats-${w}`);
}

await browser.close();
process.exit(0);
