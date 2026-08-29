/**
 * MEASURE THE BOARD A PLAYER IS ACTUALLY LOOKING AT MID-GAME.
 *
 * Four things, all on the same real board rather than on four different ones,
 * because the interesting failures only appear once there are cards on the mat:
 *
 *  1. CROP. A card image whose rendered box is not the printed 5:7 and whose
 *     `object-fit` is `cover` has had a slice taken off it. Measured on the
 *     UNTRANSFORMED box (`offsetWidth`/`offsetHeight`) so the rotated fan does
 *     not count as cropped.
 *  2. DESATURATION. `grayscale`/`saturate(0..0.99)` on the image OR on any
 *     ancestor, walked to the root. Scryfall's terms forbid it and this project
 *     has shipped it twice.
 *  3. OVERLAP. How much of each card its neighbour covers.
 *  4. TRUNCATION. Any element whose text is cut by its own box. A combat badge
 *     reading "blocks C..." during the block decision is information the player
 *     needs and cannot get.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/board-audit.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/board-audit';
fs.mkdirSync(OUT, { recursive: true });

const press = (page, src) => page.evaluate(s => {
  const rx = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('button')].find(b => {
    if (b.disabled) return false;
    const r = b.getBoundingClientRect();
    if (r.width < 4) return false;
    return rx.test((b.innerText || '').trim()) || rx.test(b.getAttribute('title') || '');
  });
  if (!el) return null; el.click();
  return ((el.innerText || '').trim() || el.getAttribute('title')).replace(/\s+/g, ' ').slice(0, 46);
}, src.source);

const st = page => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const me = g.players.find(p => p.id === 'p1');
  const at = id => g.cards[id] || {};
  const bf = me.zones.battlefield.map(at);
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    bf: bf.length,
    creatures: bf.filter(c => /creature/i.test(c.typeLine || '') && !c.tapped && !c.summoningSick).length,
    attackers: (g.combat?.attackers || []).length,
  };
});

const audit = page => page.evaluate(() => {
  const CARD_ASPECT = 5 / 7;                       // a Magic card, 63 x 88 mm
  const imgs = [...document.querySelectorAll('img')]
    .filter(i => /scryfall|cards\.scryfall|\/normal\/|\/large\/|\/small\//i.test(i.currentSrc || i.src || ''));

  const filtersOn = el => {
    const chain = [];
    let n = el, depth = 0;
    while (n && n !== document.documentElement && depth < 20) {
      const f = getComputedStyle(n).filter;
      if (f && f !== 'none') chain.push(f);
      n = n.parentElement; depth++;
    }
    return chain;
  };

  const cards = imgs.map(i => {
    const w = i.offsetWidth, h = i.offsetHeight;   // untransformed, so rotation is not crop
    const fit = getComputedStyle(i).objectFit;
    const chain = filtersOn(i);
    const desat = chain.filter(f => /grayscale\((?!0\)|0deg)/.test(f) || /saturate\(0(\.\d+)?\)/.test(f));
    const ratio = h ? w / h : 0;
    return {
      name: i.getAttribute('alt') || '(no alt)',
      w, h, fit,
      natural: `${i.naturalWidth}x${i.naturalHeight}`,
      complete: i.complete,
      // cropped only if the box shape disagrees with the card AND the fit clips
      cropped: fit === 'cover' && Math.abs(ratio - CARD_ASPECT) > 0.04,
      ratio: +ratio.toFixed(3),
      desaturated: desat,
      filters: chain,
      placeholder: /back\.png|placeholder|not.?available/i.test(i.currentSrc || i.src || ''),
    };
  });

  // Overlap between siblings drawn in one row of the board.
  const boxes = imgs.map(i => { const r = i.getBoundingClientRect(); return { r, name: i.getAttribute('alt') || '?' }; })
    .filter(b => b.r.width > 40);
  const overlaps = [];
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a].r, B = boxes[b].r;
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox > 2 && oy > 2) {
        const area = ox * oy;
        const pct = Math.round((area / Math.min(A.width * A.height, B.width * B.height)) * 100);
        if (pct >= 5) overlaps.push({ a: boxes[a].name.slice(0, 22), b: boxes[b].name.slice(0, 22), pct });
      }
    }
  }

  // Anything whose own text does not fit its own box.
  const clipped = [];
  for (const el of document.querySelectorAll('div,span,button,p,h1,h2,h3')) {
    if (el.children.length) continue;
    const t = (el.innerText || '').trim();
    if (t.length < 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) continue;
    const cs = getComputedStyle(el);
    const ellipsis = cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden';
    if (ellipsis && el.scrollWidth > el.clientWidth + 1) {
      clipped.push({ text: t.slice(0, 40), shown: el.clientWidth, needs: el.scrollWidth, y: Math.round(r.y) });
    }
  }

  // How much of the window the page actually paints.
  const painted = [...document.querySelectorAll('*')].reduce((acc, el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return acc;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return acc;
    const bg = cs.backgroundColor;
    const paints = (bg && bg !== 'rgba(0, 0, 0, 0)') || el.tagName === 'IMG';
    if (!paints) return acc;
    return { x0: Math.min(acc.x0, r.left), x1: Math.max(acc.x1, r.right), y1: Math.max(acc.y1, r.bottom) };
  }, { x0: 1e9, x1: -1e9, y1: -1e9 });

  return { cards, overlaps, clipped, painted, vw: innerWidth, vh: innerHeight };
});

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);
  await press(page, /^KEEP THIS HAND/); await sleep(2200);

  const snapshots = [];
  const want = [
    { name: 'early-board', when: s => s.bf >= 4 },
    { name: 'mid-board', when: s => s.bf >= 9 },
    { name: 'block-decision', when: s => s.active !== 'p1' && /declare_block/i.test(s.step) && s.attackers > 0 },
    { name: 'my-attack', when: s => s.active === 'p1' && /declare_attack/i.test(s.step) },
  ];
  const taken = new Set();

  for (let i = 0; i < 520; i++) {
    const s = await st(page);
    if (!s || s.status === 'complete') break;
    for (const w of want) {
      if (!taken.has(w.name) && w.when(s)) {
        taken.add(w.name);
        await sleep(500);
        const a = await audit(page);
        await page.screenshot({ path: `${OUT}/${w.name}.png` });
        snapshots.push({ where: w.name, turn: s.turn, step: s.step, ...a });
      }
    }
    if (taken.size === want.length) break;

    const mine = s.active === 'p1';
    let did = null;
    if (mine && /main/i.test(s.step)) {
      if (!s.landPlayed && s.landsInHand) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /play this as a land/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(400); did = await press(page, /^PLAY LAND$/); }
      }
      if (!did) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /you can cast/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(400); did = await press(page, /^CAST\b/); if (did) { await sleep(650); await press(page, /^Aim /); } }
      }
      if (!did) await press(page, /Close the preview/);
      if (!did && /precombat_main/i.test(s.step) && s.creatures > 0) did = await press(page, /^ATTACK$/);
    }
    if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
      did = await press(page, /^Attack with /)
        || await press(page, /^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$/)
        || await press(page, /^Block .+ with /) || await press(page, /^Block with /)
        || await press(page, /^CONFIRM \d BLOCKS?$|^DECLARE BLOCKERS$|^NO BLOCKS$/)
        || await press(page, /^LET IT RESOLVE$|^END TURN$/);
    }
    await sleep(300);
  }

  for (const s of snapshots) {
    console.log(`\n================ ${s.where.toUpperCase()}  (turn ${s.turn}, ${s.step}) ================`);
    console.log(`card images on screen: ${s.cards.length}`);
    const cropped = s.cards.filter(c => c.cropped);
    const desat = s.cards.filter(c => c.desaturated.length);
    const ph = s.cards.filter(c => c.placeholder);
    const loading = s.cards.filter(c => !c.complete);
    console.log(`  CROPPED:      ${cropped.length}` + (cropped.length ? ' -> ' + JSON.stringify(cropped.map(c => `${c.name} ${c.w}x${c.h} ratio ${c.ratio} fit ${c.fit}`)) : ''));
    console.log(`  DESATURATED:  ${desat.length}` + (desat.length ? ' -> ' + JSON.stringify(desat.map(c => `${c.name}: ${c.desaturated.join(' ')}`)) : ''));
    console.log(`  PLACEHOLDER:  ${ph.length}` + (ph.length ? ' -> ' + JSON.stringify(ph.map(c => c.name)) : ''));
    console.log(`  MID-LOAD:     ${loading.length}`);
    const filtered = s.cards.filter(c => c.filters.length);
    if (filtered.length) console.log(`  any filter at all on ${filtered.length}: ${JSON.stringify([...new Set(filtered.flatMap(c => c.filters))].slice(0, 6))}`);

    const worst = s.overlaps.sort((a, b) => b.pct - a.pct).slice(0, 6);
    console.log(`  OVERLAPPING PAIRS: ${s.overlaps.length}, worst ${worst[0]?.pct ?? 0}%`);
    worst.forEach(o => console.log(`     ${o.pct}%  ${o.a}  <-  ${o.b}`));

    console.log(`  TEXT CUT OFF BY ITS OWN BOX: ${s.clipped.length}`);
    s.clipped.slice(0, 10).forEach(c => console.log(`     "${c.text}" shown ${c.shown}px needs ${c.needs}px  @y${c.y}`));

    const p = s.painted;
    console.log(`  PAINTED: x ${Math.round(p.x0)}..${Math.round(p.x1)} of ${s.vw}   bottom-most ${Math.round(p.y1)} of ${s.vh}`);
  }

  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  if (health.netFails.length) console.log(health.netFails.slice(0, 6));
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ snapshots, health }, null, 1));
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
