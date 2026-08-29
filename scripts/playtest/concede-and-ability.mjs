/**
 * TWO GESTURES THE LONG RUN NEVER REACHED: leaving the game, and using an
 * ability off a permanent. Driven on their own so neither depends on a game
 * happening to offer them.
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';
const OUT = '.shots/concede-ability';
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
    bf: me.zones.battlefield.length, life: me.life,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    creatures: me.zones.battlefield.map(at).filter(c => /creature/i.test(c.typeLine || '') && !c.tapped && !c.summoningSick).length,
  };
});

const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
await press(page, /VERSUS BOTS/); await sleep(1400);
await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
await press(page, /Start .*game/);
await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
await sleep(2500);
await press(page, /^KEEP THIS HAND/); await sleep(2200);

// Build a small board so abilities can exist.
let abilityRow = null;
for (let i = 0; i < 180; i++) {
  const s = await st(page);
  if (!s || s.status === 'complete') break;
  const mine = s.active === 'p1';
  if (s.bf >= 5 && mine && /main/i.test(s.step)) break;
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

// ---- ABILITIES: open each permanent and list what it offers ----
const offers = await page.evaluate(() => {
  const out = [];
  const cards = [...document.querySelectorAll('[data-instance]')].slice(0, 14);
  for (const c of cards) {
    const chips = [...c.querySelectorAll('button')].map(b => (b.getAttribute('title') || b.innerText || '').trim().slice(0, 46)).filter(Boolean);
    out.push({ chips });
  }
  return out;
});
await page.screenshot({ path: `${OUT}/board.png` });

// The preview is where an activated ability lives. Open one permanent.
/*
 * A PERMANENT IS OPENED BY PRESSING THE CARD, NOT A BUTTON ON IT.
 *
 * My first selector looked for `Click to preview`, which is the HAND's label.
 * On the mat a card carries a `Tap <name>` chip and nothing else, so the probe
 * found no preview and I was one line away from writing "no permanent offers an
 * ability" for the second time on this project. Press the card's own image.
 */
const opened = await page.evaluate(() => {
  const card = [...document.querySelectorAll('[data-instance]')]
    .find(c => /creature/i.test(c.getAttribute('aria-label') || '') || c.querySelector('img'));
  if (!card) return null;
  const img = card.querySelector('img') || card;
  img.click();
  return (card.getAttribute('aria-label') || img.getAttribute('alt') || '').slice(0, 60);
});
await sleep(800);
const previewOffers = await page.evaluate(() => {
  const t = document.body.innerText || '';
  const buttons = [...document.querySelectorAll('button')]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 18 && r.y > 100; })
    .map(b => `${b.disabled ? '[OFF]' : ''}${(b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 32)}`)
    .filter(x => x.replace('[OFF]', '').length > 1);
  const manual = (t.match(/[^\n]*(needs you|by hand|resolve by hand|ability to resolve)[^\n]*/i) || [''])[0];
  return { buttons: [...new Set(buttons)].slice(0, 18), manual: manual.trim().slice(0, 100) };
});
await page.screenshot({ path: `${OUT}/preview.png` });
console.log('OPENED A PERMANENT:', opened);
console.log('  the preview offers:', JSON.stringify(previewOffers.buttons));
console.log('  manual marker:', previewOffers.manual || '(none on this card)');
console.log('  chips drawn on the first permanents:', JSON.stringify(offers.slice(0, 5)));
await press(page, /Close the preview/); await sleep(400);

// ---- CONCEDE ----
const before = await st(page);
const menu = await press(page, /Game menu/);
await sleep(800);
await page.screenshot({ path: `${OUT}/menu.png` });
const menuItems = await page.evaluate(() => [...document.querySelectorAll('button')]
  .filter(b => { const r = b.getBoundingClientRect(); return r.height > 14; })
  .map(b => (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(x => x.length > 1));
console.log('\nGAME MENU:', menu ? 'opened' : 'DID NOT OPEN');
console.log('  items:', JSON.stringify([...new Set(menuItems)].slice(0, 20)));
const c1 = await press(page, /Concede/); await sleep(900);
const c2 = await press(page, /Concede|Confirm|Yes/); await sleep(2000);
const after = await st(page);
await page.screenshot({ path: `${OUT}/after-concede.png` });
console.log(`  pressed "${c1}"${c2 ? ` then "${c2}"` : ''}`);
console.log(`  status ${before?.status} -> ${after?.status}`);
console.log(`CONCEDE: ${after?.status === 'complete' ? 'YES, the game ended' : 'NO, the game is still ' + after?.status}`);
console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
await browser.close();
