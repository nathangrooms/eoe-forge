/**
 * WHAT DOES A PERMANENT ON MY OWN BATTLEFIELD OFFER WHEN I OPEN IT?
 *
 * CLAUDE.md, product decision 1: *"A card that resolves and does nothing is a
 * SERIOUS bug"* and *"The manual marker must always be visible"*. So open each
 * of my own permanents in turn and record exactly what the preview gives:
 * an activated ability, a manual duty, or nothing.
 *
 * The permanent is opened by pressing its IMAGE. `Click to preview` is the
 * hand's label only; on the mat a card carries a `Tap <name>` chip and no
 * preview button, and matching on the hand's label is how an earlier pass
 * concluded "no permanent offers an activated ability" when they do.
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';
const OUT = '.shots/permanent-offers';
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
  return ((el.innerText || '').trim() || el.getAttribute('title')).replace(/\s+/g, ' ').slice(0, 60);
}, src.source);

const st = page => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const me = g.players.find(p => p.id === 'p1');
  const at = id => g.cards[id] || {};
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    bf: me.zones.battlefield.length,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
  };
});

const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
await press(page, /VERSUS BOTS/); await sleep(1400);
await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
await press(page, /Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
await sleep(2500);
await press(page, /^KEEP THIS HAND/); await sleep(2200);

for (let i = 0; i < 260; i++) {
  const s = await st(page);
  if (!s || s.status === 'complete') break;
  const mine = s.active === 'p1';
  if (s.bf >= 7 && mine && /precombat_main/i.test(s.step)) break;
  let did = null;
  if (mine && /main/i.test(s.step)) {
    if (!s.landPlayed && s.landsInHand) {
      const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find(b => /play this as a land/i.test(b.getAttribute('aria-label') || '')); if (!el) return false; el.click(); return true; });
      if (ok) { await sleep(360); did = await press(page, /^PLAY LAND$/); }
    }
    if (!did) {
      const ok = await page.evaluate(() => { const el = [...document.querySelectorAll('button')].find(b => /you can cast/i.test(b.getAttribute('aria-label') || '')); if (!el) return false; el.click(); return true; });
      if (ok) { await sleep(360); did = await press(page, /^CAST\b/); if (did) { await sleep(600); await press(page, /^Aim /); } }
    }
    if (!did) await press(page, /Close the preview/);
  }
  if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
    did = await press(page, /^Attack with |^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$|^Block .+ with |^CONFIRM \d+ BLOCKS?$|^NO BLOCKS$|^LET IT RESOLVE$|^END TURN$/);
  }
  await sleep(280);
}

const s = await st(page);
console.log(`turn ${s.turn}, ${s.step}, ${s.bf} permanents on my battlefield\n`);
await page.screenshot({ path: `${OUT}/board.png` });

const mySeat = await page.evaluate(() => {
  const mat = document.querySelector('[aria-label="Your seat"]');
  return mat ? [...mat.querySelectorAll('[data-instance]')].length : -1;
});
console.log('cards drawn on my own mat:', mySeat);

for (let n = 0; n < Math.min(mySeat, 9); n++) {
  const name = await page.evaluate(k => {
    const mat = document.querySelector('[aria-label="Your seat"]');
    const c = [...mat.querySelectorAll('[data-instance]')][k];
    if (!c) return null;
    const img = c.querySelector('img');
    (img || c).click();
    return img?.getAttribute('alt') || c.getAttribute('aria-label') || '?';
  }, n);
  if (!name) continue;
  await sleep(600);
  const offer = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const acts = [...document.querySelectorAll('button')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 18 && r.y > 110; })
      .map(b => `${b.disabled ? '[OFF]' : ''}${(b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34)}`)
      .filter(x => x.replace('[OFF]', '').length > 1);
    const manual = (t.match(/[^\n]*(needs you|by hand|to resolve by hand|ability to resolve)[^\n]*/i) || [''])[0].trim();
    return { acts: [...new Set(acts)].slice(0, 16), manual: manual.slice(0, 90) };
  });
  const real = offer.acts.filter(a => !/^(LIBRARY|GRAVEYARD|EXILE|COMMAND|CMD|LOG|Stack ·|Command zone ·|\d+$)/i.test(a));
  console.log(`  ${name}`);
  console.log(`     controls: ${real.length ? JSON.stringify(real) : 'NONE beyond the zone rail'}`);
  if (offer.manual) console.log(`     manual:   ${offer.manual}`);
  if (n === 0) await page.screenshot({ path: `${OUT}/preview-0.png` });
  await press(page, /Close the preview/);
  await sleep(280);
}
console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
await browser.close();
