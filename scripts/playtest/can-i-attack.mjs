/**
 * CAN THE PLAYER ATTACK? Owner's standing complaint: *"doesnt seem like enemy
 * on play mode is attacking, no way to attack with it and block stages"*.
 *
 * My full-game run reached my own `declare_blockers` on turns 3, 13 and 15 but
 * never once reached my own `declare_attackers`, with untapped creatures on the
 * board. Either the page has no way from a main phase into combat, or the only
 * forward control (END TURN) walks straight past it, or my loop was too slow to
 * see the step. This stops at my main phase with creatures ready and prints
 * every control the top bar offers, then follows whichever one claims to go to
 * combat and checks whether an attack can actually be declared.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/can-i-attack.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/attacking';
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
  const ready = bf.filter(c => /creature/i.test(c.typeLine || '') && !c.tapped && !c.summoningSick);
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    hand: me.zones.hand.length,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    ready: ready.map(c => c.name),
    attackers: (g.combat?.attackers || []).map(a => at(a.attackerId).name),
    life: g.players.map(p => `${(p.name || p.id).slice(0, 9)}:${p.life}`).join(' '),
  };
});

/** Only the controls in the top bar, which is where turn-driving lives. */
const topBar = page => page.evaluate(() => [...document.querySelectorAll('button')]
  .map(b => { const r = b.getBoundingClientRect(); return { b, r }; })
  .filter(({ r }) => r.y < 60 && r.width > 8 && r.height > 8)
  .map(({ b, r }) => `${b.disabled ? '[OFF] ' : '[ON]  '}"${(b.innerText || '').trim().replace(/\s+/g, ' ')}" title="${b.getAttribute('title') || ''}" @${Math.round(r.x)},${Math.round(r.y)}`));

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);
  await press(page, /^KEEP THIS HAND/); await sleep(2200);

  let at = null;
  for (let i = 0; i < 400 && !at; i++) {
    const s = await st(page);
    if (!s || s.status === 'complete') break;
    const mine = s.active === 'p1';

    if (mine && /main/i.test(s.step) && s.ready.length > 0) { at = s; break; }

    let did = null;
    if (mine && /main/i.test(s.step)) {
      if (!s.landPlayed && s.landsInHand) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')]
            .find(b => /play this as a land/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(420); did = await press(page, /^PLAY LAND$/); }
      }
      if (!did) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')]
            .find(b => /you can cast/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(420); did = await press(page, /^CAST\b/); if (did) { await sleep(700); await press(page, /^Aim /); } }
      }
      if (!did) await press(page, /Close the preview/);
    }
    if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
      did = await press(page, /^LET IT RESOLVE$|^NO BLOCKS$|^Block .+ with |^NO ATTACKS$|^DECLARE (ATTACKERS|BLOCKERS)$|^END TURN$/);
    }
    await sleep(320);
  }

  if (!at) { console.log('never reached my own main phase with a creature ready'); await browser.close(); return; }

  console.log('MY MAIN PHASE, CREATURES READY:', JSON.stringify(at, null, 1));
  await page.screenshot({ path: `${OUT}/1-my-main.png` });
  console.log('\nTOP BAR OFFERS:');
  (await topBar(page)).forEach(l => console.log('  ' + l));

  const swordsHere = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => /attack with/i.test(b.getAttribute('title') || ''))
    .map(b => `${b.disabled ? '[OFF] ' : '[ON]  '}${b.getAttribute('title')}`));
  console.log('\nSWORD CHIPS ON THE BOARD AT MAIN PHASE:', swordsHere.length ? '' : 'NONE');
  swordsHere.forEach(l => console.log('  ' + l));

  // Take whatever forward control exists and see where it lands.
  console.log('\n--- walking forward from the main phase ---');
  for (let i = 0; i < 12; i++) {
    const before = await st(page);
    const p = await press(page, /^END TURN$|^GO TO COMBAT$|^COMBAT$|^ATTACK/);
    await sleep(800);
    const after = await st(page);
    console.log(`  pressed ${JSON.stringify(p)} : ${before.step} -> ${after.step} (turn ${before.turn}->${after.turn})`);
    if (/declare_attack/i.test(after.step)) {
      console.log('  REACHED DECLARE ATTACKERS.');
      await page.screenshot({ path: `${OUT}/2-declare-attackers.png` });
      const swords = await page.evaluate(() => [...document.querySelectorAll('button')]
        .filter(b => /attack with|recall|stop attacking/i.test(b.getAttribute('title') || ''))
        .map(b => `${b.disabled ? '[OFF] ' : '[ON]  '}${b.getAttribute('title')}`));
      console.log('  SWORD CHIPS:', swords.length ? '' : 'NONE');
      swords.forEach(l => console.log('    ' + l));
      const swung = await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')]
          .find(b => !b.disabled && /^Attack with /i.test(b.getAttribute('title') || ''));
        if (!el) return null; el.click(); return el.getAttribute('title');
      });
      console.log('  PRESSED:', swung || 'nothing');
      await sleep(700);
      const s2 = await st(page);
      console.log('  ATTACKERS NOW:', JSON.stringify(s2.attackers));
      await page.screenshot({ path: `${OUT}/3-attacker-declared.png` });
      const conf = await press(page, /^DECLARE ATTACKERS$/);
      console.log('  CONFIRMED WITH:', conf);
      await sleep(1200);
      const s3 = await st(page);
      console.log('  AFTER CONFIRM:', JSON.stringify({ step: s3.step, attackers: s3.attackers, life: s3.life }));
      await page.screenshot({ path: `${OUT}/4-after-confirm.png` });
      break;
    }
    if (after.turn !== before.turn) { console.log('  THE TURN ENDED WITHOUT PASSING THROUGH DECLARE ATTACKERS.'); break; }
    if (!p) { console.log('  no forward control at all'); break; }
  }

  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
