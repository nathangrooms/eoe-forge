/**
 * WHERE THE PIXELS GO ON A SEAT'S MAT.
 *
 * Written because "the board looks cramped while half the mat is empty" is an
 * eyeball claim and this project has been burned three times by eyeball claims.
 * It measures, per seat:
 *
 *   - the mat's own rectangle
 *   - the rectangle of every permanent on it, and whether it is turned
 *   - how much of each card its neighbour covers (the SLIVER number)
 *   - what share of the mat any card is painted on at all (the DEAD SPACE
 *     number), sampled on a grid rather than guessed from container widths,
 *     because a container can be full width and hold nothing
 *   - the contrast of every zone label against the mat behind it
 *   - anything drawn over a card image (the log, badges), by area
 *
 * It drives a real game to a real board first. A board with two permanents on
 * it cannot show a layout fault that only appears with ten.
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const OUT = process.env.OUT || '.shots/mat-geometry';
const TAG = process.env.TAG || 'before';
const W = +(process.env.W || 1600), H = +(process.env.H || 1000);

const GEOMETRY = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const R = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };

  // A seat mat is the element carrying a Playmat canvas/ground. Find them by
  // the life badge instead: every seat has exactly one, and its mat is the
  // nearest ancestor that spans most of the window.
  const cards = [...document.querySelectorAll('[data-instance]')].map(el => ({
    el, box: R(el), tapped: el.dataset.tapped === 'true',
    name: (el.getAttribute('aria-label') || el.querySelector('img')?.alt || '').slice(0, 40),
  })).filter(c => c.box.w > 8 && c.box.h > 8 && c.box.b > 0 && c.box.y < vh);

  // Group cards into rows by their vertical centre (within half a card height).
  const rows = [];
  for (const c of cards.slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const cy = c.box.y + c.box.h / 2;
    const row = rows.find(r => Math.abs(r.cy - cy) < Math.max(24, c.box.h * 0.4));
    if (row) { row.cards.push(c); row.cy = (row.cy * (row.cards.length - 1) + cy) / row.cards.length; }
    else rows.push({ cy, cards: [c] });
  }

  const rowReport = rows.map(row => {
    const cs = row.cards.slice().sort((a, b) => a.box.x - b.box.x);
    let worst = 0, pairs = 0;
    for (let i = 1; i < cs.length; i++) {
      const prev = cs[i - 1].box, cur = cs[i].box;
      const cover = Math.max(0, prev.r - cur.x);
      if (cover > 2) { pairs++; worst = Math.max(worst, cover / prev.w); }
    }
    return {
      y: Math.round(row.cy), n: cs.length, tapped: cs.filter(c => c.tapped).length,
      cardW: cs[0].box.w, x0: cs[0].box.x, x1: cs[cs.length - 1].box.r,
      overlapPairs: pairs, worstCover: +(worst * 100).toFixed(1),
      names: cs.map(c => c.name.slice(0, 14)),
    };
  });

  /* DEAD SPACE. Sample the window on a 16px grid and ask what is under each
     point: a card image, a pile tile, chrome, or nothing at all. Reading
     container rectangles cannot answer this — a full-width div holding nothing
     measures as full width. */
  const STEP = 16;
  let card = 0, chrome = 0, bare = 0, total = 0;
  for (let y = 0; y < vh; y += STEP) {
    for (let x = 0; x < vw; x += STEP) {
      total++;
      const el = document.elementFromPoint(x, y);
      if (!el) { bare++; continue; }
      if (el.closest('[data-instance]') || el.tagName === 'IMG') card++;
      else if (el.closest('button, [role=button], input, textarea')) chrome++;
      else bare++;
    }
  }

  /* Zone labels: what they say, where, and how faint. */
  const labels = [];
  for (const el of document.querySelectorAll('span, div')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!/^(LIBRARY|GRAVEYARD|EXILE|COMMAND|CREATURES|LANDS|ARTIFACTS[^A-Z]*ENCHANTMENTS?|HAND)$/i.test(t)) continue;
    const b = R(el); if (b.w < 2 || b.h < 2) continue;
    const cs = getComputedStyle(el);
    labels.push({ t, y: b.y, x: b.x, color: cs.color, size: cs.fontSize, opacity: cs.opacity });
  }

  /* Anything drawn ON TOP of a card image, by overlapping area. */
  const covers = [];
  const cardBoxes = cards.map(c => c.box);
  for (const el of document.querySelectorAll('div, span, section, aside')) {
    if (el.closest('[data-instance]')) continue;
    const b = R(el);
    if (b.w < 30 || b.h < 12 || b.w > vw * 0.75) continue;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' && cs.opacity === '0') continue;
    const z = +cs.zIndex || 0;
    if (cs.position === 'static' && z === 0) continue;
    for (const cb of cardBoxes) {
      const ox = Math.max(0, Math.min(b.r, cb.r) - Math.max(b.x, cb.x));
      const oy = Math.max(0, Math.min(b.b, cb.b) - Math.max(b.y, cb.y));
      if (ox * oy > 900) covers.push({ t: (el.textContent || '').trim().slice(0, 34), area: ox * oy, box: b });
    }
  }
  covers.sort((a, b) => b.area - a.area);

  const g = window.__dmGame;
  return {
    vw, vh, rows: rowReport, cardCount: cards.length,
    fill: { card: +(card / total * 100).toFixed(1), chrome: +(chrome / total * 100).toFixed(1), bare: +(bare / total * 100).toFixed(1) },
    labels, covers: covers.slice(0, 8),
    game: g ? { turn: g.turn, step: g.step, bf: g.players.map(p => p.zones.battlefield.length), hand: g.players[0]?.zones.hand.length } : null,
  };
});

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, health } = await openHarness({ width: W, height: H });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1400);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);

  await page.screenshot({ path: `${OUT}/${TAG}-mulligan.png` });
  await pressText(page, /^Keep/);
  await sleep(2000);

  const marks = {};
  // Drive to a board with real weight on it: at least eight permanents somewhere.
  let shot4 = false, shot8 = false;
  for (let i = 0; i < 320; i++) {
    const g = await page.evaluate(() => {
      const s = window.__dmGame; if (!s) return null;
      return { status: s.status, turn: s.turn, bf: Math.max(...s.players.map(p => p.zones.battlefield.length)) };
    });
    if (!g || g.status === 'complete') break;
    const bf = g.bf;
    if (!shot4 && bf >= 4) {
      shot4 = true;
      await page.screenshot({ path: `${OUT}/${TAG}-board-4.png` });
      marks.board4 = await GEOMETRY(page);
    }
    if (!shot8 && bf >= 8) {
      shot8 = true;
      await page.screenshot({ path: `${OUT}/${TAG}-board-8.png` });
      marks.board8 = await GEOMETRY(page);
      break;
    }
    await unblock(page);
    await sleep(260);
  }
  if (!shot8) { await page.screenshot({ path: `${OUT}/${TAG}-board-8.png` }); marks.board8 = await GEOMETRY(page); }

  /* And a board with TURNED cards on it: a tapped permanent is rotated ninety
     degrees and is 1.39x wider than its own box, which is the case a row laid
     for upright cards gets wrong. Run to the end, where an attacking board is
     fully tapped. */
  for (let i = 0; i < 500; i++) {
    const g = await page.evaluate(() => {
      const s = window.__dmGame; if (!s) return null;
      return { status: s.status, tapped: s.players.reduce((n, p) => n + p.zones.battlefield.filter(c => c.tapped).length, 0) };
    });
    if (!g) break;
    if (!marks.turned && g.tapped >= 5) {
      await page.screenshot({ path: `${OUT}/${TAG}-turned.png` });
      marks.turned = await GEOMETRY(page);
    }
    if (g.status === 'complete') break;
    await unblock(page);
    await sleep(200);
  }
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${TAG}-end.png` });
  marks.end = await GEOMETRY(page);

  for (const [k, m] of Object.entries(marks)) {
    console.log(`\n=== ${TAG} / ${k}  ${m.vw}x${m.vh}  game=${JSON.stringify(m.game)}`);
    console.log(`    fill: card ${m.fill.card}%  chrome ${m.fill.chrome}%  BARE ${m.fill.bare}%`);
    for (const r of m.rows) {
      console.log(`    row y=${r.y}  n=${r.n} (${r.tapped} turned)  card ${r.cardW}px  x ${r.x0}..${r.x1}  overlapping pairs ${r.overlapPairs}  worst cover ${r.worstCover}%`);
    }
    console.log(`    labels: ${m.labels.map(l => `${l.t}@${l.x},${l.y} ${l.color} ${l.size}`).join(' | ') || 'none'}`);
    if (m.covers.length) console.log(`    OVER CARD ART: ${m.covers.map(c => `"${c.t}" ${c.area}px`).join(' | ')}`);
  }
  console.log(`\n    health: page ${health.pageErrors.length} console ${health.consoleErrors.length} net ${health.netFails.length}`);
  fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ marks, health }, null, 2));
  console.log(`wrote ${OUT}/${TAG}.json`);
  await browser.close();
};

run().catch(e => { console.error('FAILED', e); process.exit(1); });
