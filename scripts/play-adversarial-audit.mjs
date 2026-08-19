/**
 * ADVERSARIAL AUDIT of the play board, written to REFUTE a set of claims rather
 * than to confirm them.
 *
 * It mounts the same dev harness `play-preview-shots.mjs` writes (the real
 * `Play` page, real providers, no auth gate) and blocks Supabase so the table
 * is dealt from `deckSource.ts`'s offline list. Nothing here stubs a component.
 *
 * What it measures, and why each one is measured the way it is:
 *
 *  1. LAYOUT SHIFT. Every card box on EVERY seat is recorded before and after
 *     each action, and compared by instance id. Boxes are taken from the
 *     painted rectangle of the rotating child where there is one, so a tapped
 *     card is compared on what it covers rather than on the box the row gave it.
 *  2. QUADS. The four seat slots, as a percentage of the board they sit in.
 *  3. SUPPORT ROW OVERFLOW. Painted extent of every card in the support block
 *     and in the two rows, against the container's own rectangle, at three
 *     widths, untapped and with everything on the table tapped.
 *  4. PLAYMATS. Whether any mat is still card art, and whether anything is
 *     filtering a card image.
 *
 * Run: node scripts/play-adversarial-audit.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/adversarial';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const BLOCK_DB = process.env.DM_BLOCK_DB !== '0';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'play-harness.html';

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

const VITE_CLIENT_STUB = `
export function createHotContext() {
  return { accept(){}, acceptExports(){}, dispose(){}, prune(){}, decline(){},
    invalidate(){}, on(){}, off(){}, send(){}, data: {} };
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
  const s = sheets.get(id);
  if (s) { document.head.removeChild(s); sheets.delete(id); }
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
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    perms: g.players.map(p => `${p.id}:${p.zones.battlefield.length}`).join(' '),
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
  };
});

/**
 * Every permanent on every mat, keyed by instance, measured by what it PAINTS.
 *
 * `GameCardView` puts the tap rotation on an inner element so that turning a
 * card cannot reflow its row. That means the outer box is a lie about where the
 * card actually is once it is tapped: the box is a card WIDE and the card
 * covers a card HEIGHT. Every rectangle here is therefore taken from the
 * deepest rotated descendant when there is one, because "does it clip" and "did
 * it move" are both questions about paint, not about layout.
 */
const CARD_BOXES = `(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('[data-instance]')) {
    const id = el.getAttribute('data-instance');
    if (!id) continue;
    // Skip anything drawn inside the centre preview, the spotlight, the travel
    // layer or a zone browser: the same card is rendered in several places and
    // comparing one rendering against another reports a shift that is not one.
    if (el.closest('[data-travel-layer]')) continue;
    const seat = el.closest('[aria-label$="\\'s seat"]');
    if (!seat) continue;
    /* Only the BOARD. The same instance is drawn in the graveyard pile the
       instant it dies, and comparing a battlefield rendering against a pile
       rendering reports a 229px "shift" that is a card changing zones. */
    const zone = el.closest('[aria-label]');
    const zl = zone ? zone.getAttribute('aria-label') || '' : '';
    if (!/^(Creatures|Lands|Artifacts|Noncreature|Support|Enchantments|Planeswalkers)/.test(zl)) continue;
    const key = id;
    if (seen.has(key)) continue;
    seen.add(key);
    let box = el.getBoundingClientRect();
    // Deepest transformed descendant, which is the rotation when tapped.
    for (const child of el.querySelectorAll('*')) {
      const t = getComputedStyle(child).transform;
      if (t && t !== 'none' && !/matrix\\(1, 0, 0, 1,/.test(t)) {
        const r = child.getBoundingClientRect();
        if (r.width > box.width || r.height > box.height) box = r;
      }
    }
    if (box.width < 20) continue;
    const lay = el.getBoundingClientRect();
    out.push({
      id,
      seat: seat.getAttribute('aria-label'),
      zone: zl,
      tapped: el.getAttribute('data-tapped') === 'true',
      name: el.getAttribute('title') || '',
      x: +box.x.toFixed(1), y: +box.y.toFixed(1),
      w: +box.width.toFixed(1), h: +box.height.toFixed(1),
      /* The LAYOUT box, unrotated. This is the one that answers "did the row
         move"; the painted box above answers "does it clip". */
      lx: +lay.x.toFixed(1), ly: +lay.y.toFixed(1),
      lw: +lay.width.toFixed(1), lh: +lay.height.toFixed(1),
    });
  }
  return out;
})()`;

const cardBoxes = () => page.evaluate(CARD_BOXES);

/**
 * What moved, on the LAYOUT box.
 *
 * A card that was tapped or untapped by the action under test is skipped: its
 * own rotation is the thing that just happened, not a layout change, and
 * counting it would make every tap test fail by definition. Its NEIGHBOURS are
 * not skipped, and they are the whole point of the test.
 */
const diff = (before, after, label) => {
  let moved = 0, worst = 0, resized = 0;
  const rows = [];
  for (const b of before) {
    const a = after.find(x => x.id === b.id);
    if (!a) continue;
    if (a.tapped !== b.tapped) continue;
    const d = Math.max(Math.abs(a.lx - b.lx), Math.abs(a.ly - b.ly));
    const s = Math.max(Math.abs(a.lw - b.lw), Math.abs(a.lh - b.lh));
    if (d > 1 || s > 1) {
      moved++;
      worst = Math.max(worst, d, s);
      if (s > 1) resized++;
      rows.push(`     ${b.name} [${b.id}] ${b.lx},${b.ly} ${b.lw}x${b.lh} -> ${a.lx},${a.ly} ${a.lw}x${a.lh}`);
    }
  }
  log(`  ${label.padEnd(34)} ${moved === 0 ? 'CLEAN' : `${moved}/${before.length} moved, worst ${worst.toFixed(1)}px${resized ? `, ${resized} RESIZED` : ''}`}`);
  for (const r of rows.slice(0, 8)) log(r);
  if (rows.length > 8) log(`     ... and ${rows.length - 8} more`);
  return { moved, worst, resized };
};

/** Run `fn`, wait, and report every card box that changed. */
const around = async (label, fn, settle = 2200) => {
  const before = await cardBoxes();
  const note = await fn();
  await sleep(settle);
  const after = await cardBoxes();
  const r = diff(before, after, label + (note ? ` (${note})` : ''));
  return r;
};

/* ---------------------------------------------------------------- open */

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

/* FOUR SEATS. The lobby defaults to one opponent, and every claim under review
   is about a four-seat quad table, so the run picks three before it deals. */
log('versus bots:', await pressText(/Versus bots/));
await sleep(600);
log('three opponents:', await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')]
    .find(b => (b.innerText || '').trim() === '3');
  if (!el) return false;
  el.click();
  return true;
}));
await sleep(900);
await shot('lobby-4');
log('start:', await pressText(/Start .*game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3500);
if (!(await game())) throw new Error('the table vanished after it was dealt');
log('opening:', JSON.stringify(await game()));
await pressText(/^Keep$/);
await sleep(900);
/* Logged rather than swallowed. The needle here read "ignore mana entirely"
   against a title that says "Goldfishing. Ignore mana entirely", and `.includes`
   is case sensitive, so this press returned false in silence: every run measured
   a board built at full mana cost while the line above claimed free cast was on.
   A press whose result nobody looks at is not a press. */
log('game menu:', await pressTitle('Game menu')); await sleep(1200);
log('free cast:', await pressTitle('Ignore mana entirely')); await sleep(600);
log('menu closed:', await pressTitle('Close the menu')); await sleep(600);
await shot('dealt');

/* ------------------------------------------------------ 2. QUAD RECTS */

const quads = () => page.evaluate(() => {
  const seats = [...document.querySelectorAll('[aria-label$="\'s seat"]')];
  if (!seats.length) return null;
  // The slot is the positioned wrapper the table gives each seat.
  const slots = seats.map(s => {
    let n = s;
    while (n && n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === 'absolute' && cs.width.endsWith('px') && n.parentElement) break;
      n = n.parentElement;
    }
    return n;
  });
  const board = slots[0] ? slots[0].parentElement : null;
  const br = board.getBoundingClientRect();
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    board: { x: +br.x.toFixed(1), y: +br.y.toFixed(1), w: +br.width.toFixed(1), h: +br.height.toFixed(1) },
    slots: slots.map((el, i) => {
      const r = el.getBoundingClientRect();
      const mat = seats[i].getBoundingClientRect();
      const cs = getComputedStyle(seats[i]);
      return {
        seat: seats[i].getAttribute('aria-label'),
        slot: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        pctW: +((r.width / br.width) * 100).toFixed(2),
        pctH: +((r.height / br.height) * 100).toFixed(2),
        mat: { w: +mat.width.toFixed(1), h: +mat.height.toFixed(1) },
        upright: cs.transform === 'none' || /matrix\(1, 0, 0, 1,/.test(cs.transform),
      };
    }),
  };
});

log('\n=== QUAD SEAT RECTANGLES ===');
for (const [w, h] of [[1920, 1080], [1680, 1050], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(1200);
  const q = await quads();
  log(`  ${w}x${h}  board ${q.board.w}x${q.board.h}`);
  for (const s of q.slots) {
    log(`     ${s.seat.padEnd(22)} slot ${s.slot.w}x${s.slot.h} = ${s.pctW}% x ${s.pctH}%  mat ${s.mat.w}x${s.mat.h}  upright=${s.upright}`);
  }
}
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
await sleep(1200);

/* ------------------------------------------------ build a real board */

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

log('\n=== BUILDING A BOARD ===');
for (let turn = 0; turn < 6; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await pressText(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(350);
    if (await pressText(/^Cast$/)) await sleep(550);
  }
  await page.evaluate(() => document.body.click());
  await sleep(300);
  const g = await game();
  log(`  T${g.turn} ${g.step}: ${g.perms}`);
  if (turn < 5) { await pressText(/^END TURN$/); await sleep(9000); }
}
await sleep(1500);
await shot('board-built');
log('board:', JSON.stringify(await game()));

/* --------------------------------------------- 1. LAYOUT SHIFT, per action */

log('\n=== LAYOUT SHIFT, ACTION BY ACTION (all four seats) ===');

const dispatch = expr => page.evaluate(expr);

await around('TAP mine', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Tap /.test(b.getAttribute('title') || ''));
  if (!el) return 'no tap chip';
  el.click();
  return el.getAttribute('title');
}));

await around('UNTAP mine', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Untap /.test(b.getAttribute('title') || ''));
  if (!el) return 'no untap chip';
  el.click();
  return el.getAttribute('title');
}));

await around('TAP six of theirs', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p2 = g.players.find(p => p.id === 'p2');
  const ids = p2.zones.battlefield.filter(i => !g.cards[i].tapped).slice(0, 6);
  ids.forEach(id => d({ type: 'TAP', instanceId: id }));
  return ids.length + ' tapped';
}));

await around('UNTAP six of theirs', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p2 = g.players.find(p => p.id === 'p2');
  const ids = p2.zones.battlefield.filter(i => g.cards[i].tapped).slice(0, 6);
  ids.forEach(id => d({ type: 'UNTAP', instanceId: id }));
  return ids.length + ' untapped';
}));

await around('DRAW a card', () => page.evaluate(() => {
  window.__dmDispatch({ type: 'DRAW', playerId: 'p1', count: 1 });
  return 'p1 draws';
}));

await around('LIFE CHANGE', () => page.evaluate(() => {
  window.__dmDispatch({ type: 'SET_LIFE', playerId: 'p1', life: 27 });
  return 'p1 -> 27';
}));

await around('DAMAGE on a creature', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return 'no creature';
  d({ type: 'DAMAGE_CARD', instanceId: id, amount: 1 });
  return g.cards[id].name;
}));

await around('+1/+1 COUNTER', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return 'no creature';
  d({ type: 'CARD_COUNTER', instanceId: id, counter: '+1/+1', delta: 1 });
  return g.cards[id].name;
}));

await around('ADVANCE STEP', () => page.evaluate(() => { window.__dmDispatch({ type: 'ADVANCE_STEP' }); return 'advance'; }));

/* A card ENTERING and LEAVING play — the two the claim admits still move. */
await around('CREATURE ENTERS', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.hand.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return 'no creature in hand';
  d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  return g.cards[id].name;
}), 1800);

await around('CREATURE DIES', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = [...p1.zones.battlefield].reverse().find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return 'no creature';
  d({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
  return g.cards[id].name;
}), 1800);

await around('LAND ENTERS', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.hand.find(i => /Land/.test(g.cards[i].typeLine || ''));
  if (!id) return 'no land in hand';
  d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  return g.cards[id].name;
}), 1800);

/* Attack: the action the claim says now writes into the identity band. */
await around('DECLARE ATTACKERS', () => page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p1 = g.players.find(p => p.id === 'p1');
  const ids = p1.zones.battlefield
    .filter(i => /Creature/.test(g.cards[i].typeLine || '') && !g.cards[i].tapped)
    .slice(0, 4);
  if (!ids.length) return 'nothing to attack with';
  d({ type: 'SET_STEP', step: 'declare_attackers' });
  ids.forEach(id => d({ type: 'DECLARE_ATTACKER', instanceId: id, defenderId: 'p2' }));
  return ids.length + ' attackers';
}), 2200);
await shot('attackers-declared');

/* ------------------------------------------------ 3. SUPPORT ROW OVERFLOW */

/**
 * The painted extent of everything inside each labelled zone against that
 * zone's own rectangle, and against the seat mat's rectangle.
 */
const OVERFLOW = `(() => {
  const zones = [...document.querySelectorAll('[aria-label]')]
    .filter(el => /^(Creatures|Lands|Artifacts|Noncreature|Support)/.test(el.getAttribute('aria-label') || ''));
  const out = [];
  for (const z of zones) {
    const zr = z.getBoundingClientRect();
    const seat = z.closest('[aria-label$="\\'s seat"]');
    const sr = seat ? seat.getBoundingClientRect() : null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
    for (const el of z.querySelectorAll('[data-instance]')) {
      let box = el.getBoundingClientRect();
      for (const child of el.querySelectorAll('*')) {
        const t = getComputedStyle(child).transform;
        if (t && t !== 'none' && !/matrix\\(1, 0, 0, 1,/.test(t)) {
          const r = child.getBoundingClientRect();
          if (r.width > box.width || r.height > box.height) box = r;
        }
      }
      if (box.width < 20) continue;
      n++;
      minX = Math.min(minX, box.x); maxX = Math.max(maxX, box.x + box.width);
      minY = Math.min(minY, box.y); maxY = Math.max(maxY, box.y + box.height);
    }
    if (!n) continue;
    out.push({
      zone: z.getAttribute('aria-label'),
      seat: seat ? seat.getAttribute('aria-label') : null,
      cards: n,
      overLeft: +(zr.x - minX).toFixed(1),
      overRight: +(maxX - (zr.x + zr.width)).toFixed(1),
      overTop: +(zr.y - minY).toFixed(1),
      overBottom: +(maxY - (zr.y + zr.height)).toFixed(1),
      pastSeatRight: sr ? +(maxX - (sr.x + sr.width)).toFixed(1) : null,
      pastSeatLeft: sr ? +(sr.x - minX).toFixed(1) : null,
      usedPct: +(((maxX - minX) / zr.width) * 100).toFixed(0),
    });
  }
  return out;
})()`;

const reportOverflow = async label => {
  const rows = await page.evaluate(OVERFLOW);
  const bad = rows.filter(r => r.overLeft > 1 || r.overRight > 1 || r.overTop > 1 || r.overBottom > 1);
  const pastSeat = rows.filter(r => (r.pastSeatRight || 0) > 1 || (r.pastSeatLeft || 0) > 1);
  log(`  ${label}: ${rows.length} zones with cards, ${bad.length} over their own box, ${pastSeat.length} past the seat edge`);
  for (const r of bad) {
    log(`     OVER  ${r.zone} [${r.seat}] L${r.overLeft} R${r.overRight} T${r.overTop} B${r.overBottom} used ${r.usedPct}%`);
  }
  for (const r of pastSeat) {
    log(`     SEAT  ${r.zone} [${r.seat}] pastLeft ${r.pastSeatLeft} pastRight ${r.pastSeatRight}`);
  }
  return { bad: bad.length, pastSeat: pastSeat.length, rows };
};

log('\n=== ZONE OVERFLOW (painted extent vs own box) ===');
for (const [w, h] of [[1680, 1050], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(1600);
  await reportOverflow(`${w} untapped`);
  await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    for (const p of g.players) for (const id of p.zones.battlefield) if (!g.cards[id].tapped) d({ type: 'TAP', instanceId: id });
  });
  await sleep(1800);
  await reportOverflow(`${w} EVERYTHING TAPPED`);
  await shot(`tapped-${w}`);
  await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    for (const p of g.players) for (const id of p.zones.battlefield) if (g.cards[id].tapped) d({ type: 'UNTAP', instanceId: id });
  });
  await sleep(1400);
}

/* ------------------------------------------------------- 4. PLAYMATS */

await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await sleep(1600);

const mats = () => page.evaluate(() => {
  const out = [];
  for (const seat of document.querySelectorAll('[aria-label$="\'s seat"]')) {
    // The mat surface is the seat element or its nearest ancestor/descendant
    // carrying a background-image.
    const candidates = [seat, ...seat.querySelectorAll('div')].slice(0, 40);
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200) continue;
      out.push({
        seat: seat.getAttribute('aria-label'),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        hasUrl: /url\(/.test(cs.backgroundImage),
        urls: (cs.backgroundImage.match(/url\([^)]*\)/g) || []).slice(0, 3),
        layers: cs.backgroundImage.split(/,(?![^(]*\))/).length,
        filter: cs.filter,
        backdropFilter: cs.backdropFilter,
        opacity: cs.opacity,
      });
      break;
    }
  }
  return out;
});

/** Anything on screen that is a card IMAGE, and what is being done to it. */
const cardImages = () => page.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll('img')) {
    const cs = getComputedStyle(img);
    const r = img.getBoundingClientRect();
    if (r.width < 10) continue;
    out.push({
      src: (img.currentSrc || img.src || '').slice(0, 90),
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      drawn: `${Math.round(r.width)}x${Math.round(r.height)}`,
      upscale: img.naturalWidth ? +(r.width / img.naturalWidth).toFixed(2) : null,
      objectFit: cs.objectFit,
      filter: cs.filter,
      opacity: cs.opacity,
      mixBlend: cs.mixBlendMode,
    });
  }
  const grouped = {};
  for (const i of out) {
    const k = `${i.filter}|${i.opacity}|${i.mixBlend}|${i.objectFit}`;
    grouped[k] = (grouped[k] || 0) + 1;
  }
  return { count: out.length, sample: out.slice(0, 6), grouped };
});

log('\n=== PLAYMAT SURFACES (1920) ===');
for (const m of await mats()) log('  ' + JSON.stringify(m));
log('\n=== CARD IMAGES ===');
log('  ' + JSON.stringify(await cardImages(), null, 1));
await shot('mats-1920');
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await sleep(1600);
await shot('mats-1280');
log('\n=== PLAYMAT SURFACES (1280) ===');
for (const m of await mats()) log('  ' + JSON.stringify(m));

await browser.close();
process.exit(0);
