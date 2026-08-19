/**
 * The board under STRESS: a full four-seat table, grown one permanent at a
 * time, then tapped from end to end at three widths.
 *
 * `play-adversarial-audit.mjs` drives a game by pressing the screen, which is
 * the right way to find out whether the screen works, and it reaches a board of
 * two or three permanents a seat in the time it takes to play six turns. Every
 * claim about repacking, overlap and clipping is about a board four times that
 * size, so this one puts the cards there directly — through the same
 * `__dmDispatch` transport a click uses, so the reducer, the layout and the
 * renderer are all the shipped ones.
 *
 * Two things are measured separately and must not be confused:
 *
 *   LAYOUT BOX  — where the row put the card. This answers "did the board move
 *                 when something happened", and it is the owner's complaint.
 *   PAINTED BOX — the rotated bounding box a tapped card actually covers,
 *                 computed from the layout box and the rotation rather than
 *                 scraped off the element, because `GameCardView` also puts an
 *                 attacker's LUNGE and a 1.05 selection scale on the same
 *                 transform. Scraping catches those and reports a deliberate
 *                 animation as an overflow.
 *
 * Run: node scripts/play-stress-audit.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '.shots/stress';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
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
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
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

/**
 * Every permanent on the two rows and the support block of every seat.
 *
 * `rot` is the rotated bounding box worked out from the layout box: a tapped
 * card keeps its centre and swaps its width and height. Nothing is scraped off
 * a computed transform, so an attacker's lunge cannot masquerade as clipping.
 */
const BOXES = `(() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('[data-instance]')) {
    const id = el.getAttribute('data-instance');
    if (!id || seen.has(id)) continue;
    if (el.closest('[data-travel-layer]')) continue;
    const seat = el.closest('[aria-label$="\\'s seat"]');
    if (!seat) continue;
    const zone = el.closest('[aria-label]');
    const zl = zone ? zone.getAttribute('aria-label') || '' : '';
    if (!/^(Creatures|Lands|Artifacts|Noncreature|Support|Enchantments|Planeswalkers)/.test(zl)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 15) continue;
    seen.add(id);
    const tapped = el.getAttribute('data-tapped') === 'true';
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const rw = tapped ? r.height : r.width;
    const rh = tapped ? r.width : r.height;
    out.push({
      id, tapped, zone: zl,
      seat: seat.getAttribute('aria-label'),
      name: el.getAttribute('title') || '',
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      rx: +(cx - rw / 2).toFixed(1), ry: +(cy - rh / 2).toFixed(1),
      rw: +rw.toFixed(1), rh: +rh.toFixed(1),
    });
  }
  return out;
})()`;
const boxes = () => page.evaluate(BOXES);

const diff = (before, after) => {
  let moved = 0, worst = 0, resized = 0;
  const rows = [];
  for (const b of before) {
    const a = after.find(x => x.id === b.id);
    if (!a || a.tapped !== b.tapped) continue;
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const s = Math.max(Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    if (d > 1 || s > 1) {
      moved++; worst = Math.max(worst, d, s);
      if (s > 1) resized++;
      rows.push(`      ${b.name} ${b.x},${b.y} ${b.w}x${b.h} -> ${a.x},${a.y} ${a.w}x${a.h}`);
    }
  }
  return { moved, worst, resized, rows, total: before.length };
};

/* ---------------------------------------------------------------- deal */

await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
await pressText(/Versus bots/); await sleep(500);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[aria-pressed]')].find(b => (b.innerText || '').trim() === '3');
  if (el) el.click();
});
await sleep(800);
await pressText(/Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3000);
await pressText(/^Keep$/);
await sleep(900);

/* The bots keep playing while a measurement is being taken, and a bot dropping
   a land in the same second as a probe is exactly the "unexplained 8px" the
   claim under review names. Pausing them makes every number below attributable
   to the action the run just took. */
log('paused bots:', await page.evaluate(() => {
  if (window.__dmPauseBots) { window.__dmPauseBots(true); return 'via __dmPauseBots'; }
  return 'NO PAUSE HOOK — bot may act during a measurement';
}));

/* ------------------------------------------- 1. GROW A BOARD, ONE AT A TIME */

/** Put one card of a kind from p1's library onto the battlefield. */
const put = kind => page.evaluate(kind => {
  const g = window.__dmGame, d = window.__dmDispatch;
  const p = g.players.find(x => x.id === 'p1');
  const want = kind === 'land' ? /Land/ : kind === 'aura' ? /Enchantment|Artifact/ : /Creature/;
  const id = p.zones.library.find(i => want.test(g.cards[i].typeLine || ''))
    ?? p.zones.hand.find(i => want.test(g.cards[i].typeLine || ''));
  if (!id) return null;
  d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  return g.cards[id].name;
}, kind);

const growth = async (kind, n) => {
  log(`\n=== GROWING ${kind.toUpperCase()}S FROM WHAT IS THERE ===`);
  let clean = 0, steps = 0;
  for (let i = 1; i <= n; i++) {
    const before = await boxes();
    const name = await put(kind);
    if (!name) { log(`  (library ran out of ${kind}s at ${i})`); break; }
    await sleep(1500);
    const after = await boxes();
    const r = diff(before, after);
    steps++;
    if (r.moved === 0) clean++;
    log(`  ${kind} ${String(i).padStart(2)} (${name.padEnd(18)}) -> ${after.length} on board: ${r.moved === 0 ? 'CLEAN' : `${r.moved}/${r.total} moved, worst ${r.worst.toFixed(0)}px${r.resized ? `, ${r.resized} RESIZED` : ''}`}`);
    for (const row of r.rows.slice(0, 3)) log(row);
  }
  log(`  ${clean} of ${steps} arrivals moved nothing.`);
};

await growth('creature', 14);
await shot('creatures-grown');
await growth('land', 12);
await shot('lands-grown');
await growth('aura', 6);
await shot('auras-grown');

log('\nboard now: ' + JSON.stringify(await page.evaluate(() => {
  const g = window.__dmGame;
  return g.players.map(p => `${p.id}:${p.zones.battlefield.length}`).join(' ');
})));

/* ---------------------------------------------- 2. REMOVAL, ONE AT A TIME */

log('\n=== REMOVING CREATURES, ONE AT A TIME ===');
for (let i = 1; i <= 5; i++) {
  const before = await boxes();
  const name = await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    const p = g.players.find(x => x.id === 'p1');
    const id = [...p.zones.battlefield].reverse().find(i => /Creature/.test(g.cards[i].typeLine || ''));
    if (!id) return null;
    d({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
    return g.cards[id].name;
  });
  if (!name) break;
  await sleep(1500);
  const r = diff(before, await boxes());
  log(`  death ${i} (${name.padEnd(18)}): ${r.moved === 0 ? 'CLEAN' : `${r.moved}/${r.total} moved, worst ${r.worst.toFixed(0)}px${r.resized ? `, ${r.resized} RESIZED` : ''}`}`);
  for (const row of r.rows.slice(0, 3)) log(row);
}

/* --------------------------------------------------- 3. OVERFLOW, FULL BOARD */

/* Fill the other three seats too, so every mat on the table is under the same
   pressure the viewer's is. */
await page.evaluate(() => {
  const g = window.__dmGame, d = window.__dmDispatch;
  for (const p of g.players) {
    if (p.id === 'p1') continue;
    let creatures = 0, lands = 0, others = 0;
    for (const id of [...p.zones.library]) {
      const t = g.cards[id].typeLine || '';
      if (/Creature/.test(t) && creatures < 9) { creatures++; d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); }
      else if (/Land/.test(t) && lands < 9) { lands++; d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); }
      else if (/Enchantment|Artifact/.test(t) && others < 5) { others++; d({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' }); }
    }
  }
});
await sleep(2500);

const OVERFLOW = `(() => {
  const zones = [...document.querySelectorAll('[aria-label]')]
    .filter(el => /^(Creatures|Lands|Artifacts|Noncreature|Support|Enchantments|Planeswalkers)/.test(el.getAttribute('aria-label') || ''));
  const out = [];
  for (const z of zones) {
    const zr = z.getBoundingClientRect();
    const seat = z.closest('[aria-label$="\\'s seat"]');
    const sr = seat ? seat.getBoundingClientRect() : null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
    for (const el of z.querySelectorAll('[data-instance]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 15) continue;
      const tapped = el.getAttribute('data-tapped') === 'true';
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const rw = tapped ? r.height : r.width;
      const rh = tapped ? r.width : r.height;
      n++;
      minX = Math.min(minX, cx - rw / 2); maxX = Math.max(maxX, cx + rw / 2);
      minY = Math.min(minY, cy - rh / 2); maxY = Math.max(maxY, cy + rh / 2);
    }
    if (!n) continue;
    out.push({
      zone: z.getAttribute('aria-label'),
      seat: seat ? seat.getAttribute('aria-label') : null,
      cards: n,
      L: +(zr.x - minX).toFixed(1),
      R: +(maxX - (zr.x + zr.width)).toFixed(1),
      T: +(zr.y - minY).toFixed(1),
      B: +(maxY - (zr.y + zr.height)).toFixed(1),
      seatL: sr ? +(sr.x - minX).toFixed(1) : null,
      seatR: sr ? +(maxX - (sr.x + sr.width)).toFixed(1) : null,
      usedPct: +(((maxX - minX) / zr.width) * 100).toFixed(0),
    });
  }
  return out;
})()`;

const report = async label => {
  const rows = await page.evaluate(OVERFLOW);
  const bad = rows.filter(r => r.L > 1 || r.R > 1 || r.T > 1 || r.B > 1);
  const seatOver = rows.filter(r => (r.seatL || 0) > 1 || (r.seatR || 0) > 1);
  log(`  ${label}: ${rows.length} zones with cards, ${bad.length} over their own box, ${seatOver.length} past the seat edge`);
  for (const r of bad) log(`     OVER ${r.zone} [${r.seat}] ${r.cards} cards  L${r.L} R${r.R} T${r.T} B${r.B}  used ${r.usedPct}%`);
  for (const r of seatOver) log(`     SEAT ${r.zone} [${r.seat}] seatL ${r.seatL} seatR ${r.seatR}`);
  const support = rows.filter(r => /^(Artifacts|Noncreature|Support|Enchantments)/.test(r.zone));
  for (const r of support) log(`     support-block ${r.zone} [${r.seat}] ${r.cards} cards  L${r.L} R${r.R} T${r.T} B${r.B} used ${r.usedPct}%`);
  return bad.length + seatOver.length;
};

log('\n=== OVERFLOW ON A FULL BOARD ===');
for (const [w, h] of [[1680, 1050], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(2000);
  await report(`${w} untapped`);
  await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    for (const p of g.players) for (const id of p.zones.battlefield) if (!g.cards[id].tapped) d({ type: 'TAP', instanceId: id });
  });
  await sleep(2400);
  await report(`${w} EVERYTHING TAPPED`);
  await shot(`full-tapped-${w}`);
  await page.evaluate(() => {
    const g = window.__dmGame, d = window.__dmDispatch;
    for (const p of g.players) for (const id of p.zones.battlefield) if (g.cards[id].tapped) d({ type: 'UNTAP', instanceId: id });
  });
  await sleep(2000);
  await shot(`full-untapped-${w}`);
}

/* --------------------------------------------- 4. CARD SIZE ON A FULL BOARD */

log('\n=== CARD SIZE, FULL BOARD ===');
for (const [w, h] of [[1920, 1080], [1680, 1050], [1280, 800]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(1800);
  const sizes = await page.evaluate(() => {
    const by = {};
    for (const el of document.querySelectorAll('[data-instance]')) {
      const zone = el.closest('[aria-label]');
      const zl = zone ? (zone.getAttribute('aria-label') || '').split(',')[0] : '';
      if (!/^(Creatures|Lands|Artifacts|Noncreature|Support|Enchantments)/.test(zl)) continue;
      const seat = el.closest('[aria-label$="\'s seat"]');
      if (!seat || seat.getAttribute('aria-label') !== "You's seat") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 15) continue;
      by[zl] = by[zl] || [];
      by[zl].push(Math.round(el.getAttribute('data-tapped') === 'true' ? r.height : r.width));
    }
    return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, `${v.length} cards, ${Math.min(...v)}..${Math.max(...v)}px`]));
  });
  log(`  ${w}: ${JSON.stringify(sizes)}`);
}

await shot('final');
await browser.close();
process.exit(0);
