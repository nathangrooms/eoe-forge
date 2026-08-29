/**
 * TWO CLAIMS FROM THE PREVIOUS PASS, RE-MEASURED ON THE CURRENT TREE.
 *
 *  - "the game log was amputating every sentence it printed": 2 of 2 lines cut
 *    at 200x40, now 312x40 and 0 cut.
 *  - "the seat step section was 605px and is 462px".
 *
 * Both are claims about pixels, so read the pixels rather than the report.
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';
const OUT = '.shots/feed-step';
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
  return ((el.innerText || '').trim() || el.getAttribute('title')).replace(/\s+/g, ' ').slice(0, 50);
}, src.source);

const st = page => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const me = g.players.find(p => p.id === 'p1');
  const at = id => g.cards[id] || {};
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status, bf: me.zones.battlefield.length,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0 };
});

const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

// ---------- the seat step ----------
await press(page, /VERSUS BOTS/); await sleep(1400);
await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1600);
await page.screenshot({ path: `${OUT}/seat-step.png` });
const seat = await page.evaluate(() => {
  const head = [...document.querySelectorAll('*')]
    .filter(e => !e.children.length && /^The table$/i.test((e.innerText || '').trim()))[0];
  const section = head?.closest('section') || head?.parentElement?.parentElement?.parentElement;
  const r = section?.getBoundingClientRect();
  return {
    found: !!head,
    sectionH: r ? Math.round(r.height) : null,
    sectionW: r ? Math.round(r.width) : null,
    pageH: document.documentElement.scrollHeight, vh: innerHeight,
  };
});
console.log('SEAT STEP:', JSON.stringify(seat), seat.pageH > seat.vh ? `(page scrolls ${seat.pageH - seat.vh}px past the window)` : '(fits)');

// ---------- the log strip, mid game ----------
await press(page, /Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
await sleep(2500);
await press(page, /^KEEP THIS HAND/); await sleep(2200);
for (let i = 0; i < 220; i++) {
  const s = await st(page);
  if (!s || s.status === 'complete' || s.turn >= 14) break;
  const mine = s.active === 'p1';
  let did = null;
  if (mine && /main/i.test(s.step)) {
    if (!s.landPlayed && s.landsInHand) {
      const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find(b => /play this as a land/i.test(b.getAttribute('aria-label') || '')); if (!el) return false; el.click(); return true; });
      if (ok) { await sleep(340); did = await press(page, /^PLAY LAND$/); }
    }
    if (!did) {
      const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find(b => /you can cast/i.test(b.getAttribute('aria-label') || '')); if (!el) return false; el.click(); return true; });
      if (ok) { await sleep(340); did = await press(page, /^CAST\b/); if (did) { await sleep(560); await press(page, /^Aim /); } }
    }
    if (!did) await press(page, /Close the preview/);
  }
  if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
    did = await press(page, /^Attack with |^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$|^Block .+ with |^CONFIRM \d+ BLOCKS?$|^NO BLOCKS$|^LET IT RESOLVE$|^END TURN$/);
  }
  await sleep(270);
}
await sleep(900);
await page.screenshot({ path: `${OUT}/log-strip.png` });
const feed = await page.evaluate(() => {
  const logBtn = [...document.querySelectorAll('button')].find(b => /^LOG$/i.test((b.innerText || '').trim()));
  const strip = logBtn?.parentElement?.parentElement;
  const r = strip?.getBoundingClientRect();
  const lines = strip ? [...strip.querySelectorAll('*')]
    .filter(e => !e.children.length && (e.innerText || '').trim().length > 6)
    .map(e => ({
      text: (e.innerText || '').trim().slice(0, 70),
      cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1,
      w: Math.round(e.getBoundingClientRect().width),
      needs: e.scrollWidth,
    })) : [];
  // does the strip lie over any card art?
  let over = 0;
  if (r) for (const img of document.querySelectorAll('img')) {
    const b = img.getBoundingClientRect();
    if (b.width < 40) continue;
    const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left);
    const oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    if (ox > 0 && oy > 0) over += ox * oy;
  }
  return { box: r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null, lines, overCardArtPx: Math.round(over) };
});
const s2 = await st(page);
console.log(`\nLOG STRIP at turn ${s2?.turn}: box ${feed.box}`);
feed.lines.forEach(l => console.log(`   ${l.cut ? 'CUT ' : 'ok  '} ${l.w}px (needs ${l.needs}px)  "${l.text}"`));
console.log(`   ${feed.lines.filter(l => l.cut).length} of ${feed.lines.length} cut off`);
console.log(`   card art covered by the strip: ${feed.overCardArtPx}px`);
console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
await browser.close();
