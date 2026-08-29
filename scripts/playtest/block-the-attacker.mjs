/**
 * CAN A PLAYER ACTUALLY BLOCK? THE WHOLE GESTURE, BOTH PRESSES.
 *
 * `sit-down-and-play.mjs` stalled at turn 16 declare blockers with the bar
 * reading "Quandrix Apprentice is ready. Now press the attacker it stands in
 * front of." and no enabled control on screen except NO BLOCKS. Either the
 * second press has no control, or my enumerator only looked at `<button>` and
 * the chip is something else. That is the fifth time on this project a probe
 * has been the suspect, so this one checks before it accuses: it lists EVERY
 * clickable thing, presses the chip on the attacker, and reads
 * `state.combat.attackers[].blockedBy` to see whether a block was recorded.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/block-the-attacker.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/blocking';
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
  return ((el.innerText || '').trim() || el.getAttribute('title')).replace(/\s+/g, ' ').slice(0, 40);
}, src.source);

const st = page => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const me = g.players.find(p => p.id === 'p1');
  const at = id => g.cards[id] || {};
  const bf = me.zones.battlefield.map(at);
  const atk = g.combat?.attackers || [];
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    hand: me.zones.hand.length,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    myCreatures: bf.filter(c => /creature/i.test(c.typeLine || '')).map(c => `${c.name}${c.tapped ? ' (tapped)' : ''}${c.summoningSick ? ' (sick)' : ''}`),
    attackers: atk.map(a => ({ who: at(a.attackerId).name, at: a.defenderPlayerId, blockedBy: (a.blockedBy || []).map(b => at(b).name) })),
  };
});

/** Everything on screen a mouse can act on, button or not. */
const clickables = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button,[role="button"],[onclick],a')) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34),
      title: (el.getAttribute('title') || '').slice(0, 60),
      aria: (el.getAttribute('aria-label') || '').slice(0, 60),
      pointer: cs.pointerEvents,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return out;
});

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);
  await press(page, /^KEEP THIS HAND/); await sleep(2200);

  // Build a board: play a land and cast whatever the fan offers, every own turn.
  let found = null;
  for (let i = 0; i < 400 && !found; i++) {
    const s = await st(page);
    if (!s || s.status === 'complete') break;
    const mine = s.active === 'p1';

    if (!mine && /declare_block/i.test(s.step) && s.attackers.length && s.myCreatures.length) {
      found = s;
      break;
    }

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
      did = await press(page, /^LET IT RESOLVE$|^NO ATTACKS$|^DECLARE ATTACKERS$|^END TURN$/);
    }
    await sleep(330);
  }

  if (!found) { console.log('never reached a block decision'); await browser.close(); return; }

  console.log('AT A BLOCK DECISION:', JSON.stringify(found, null, 1));
  await page.screenshot({ path: `${OUT}/1-attacked.png` });

  const before = await clickables(page);
  const chipsBefore = before.filter(c => /block|attack|swing|shield|sword|stand/i.test(c.title + c.aria + c.text));
  console.log('\nCOMBAT CONTROLS ON SCREEN BEFORE ARMING:');
  chipsBefore.forEach(c => console.log(`  ${c.disabled ? '[OFF] ' : '[ON]  '}${c.tag} "${c.text}" title="${c.title}" aria="${c.aria}" @${c.x},${c.y}`));

  // First press: arm a blocker.
  const armed = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')]
      .find(b => !b.disabled && /^Block with /i.test(b.getAttribute('title') || ''));
    if (!el) return null; el.click(); return el.getAttribute('title');
  });
  console.log('\nARMED:', armed || 'NOTHING — no "Block with" control');
  await sleep(700);
  await page.screenshot({ path: `${OUT}/2-armed.png` });

  const bar = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const m = t.match(/[^\n]*(is ready|press the (attacker|shield)|nothing that can block)[^\n]*/i);
    return m ? m[0].trim() : '(no combat sentence on screen)';
  });
  console.log('THE BAR NOW SAYS:', bar);

  const after = await clickables(page);
  const chipsAfter = after.filter(c => /block|attack|stand|in front/i.test(c.title + c.aria + c.text));
  console.log('\nCOMBAT CONTROLS AFTER ARMING:');
  chipsAfter.forEach(c => console.log(`  ${c.disabled ? '[OFF] ' : '[ON]  '}${c.tag} "${c.text}" title="${c.title}" aria="${c.aria}" @${c.x},${c.y}`));

  // Second press: the attacker.
  const pressedAttacker = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button,[role="button"]')].filter(b => {
      const t = (b.getAttribute('title') || '') + ' ' + (b.getAttribute('aria-label') || '');
      return /stands? in front|block .* with|put .* in front|^Block /i.test(t);
    });
    const live = els.find(b => !b.disabled);
    if (!live) return { pressed: null, sawDisabled: els.length };
    live.click();
    return { pressed: live.getAttribute('title') || live.getAttribute('aria-label'), sawDisabled: 0 };
  });
  console.log('\nSECOND PRESS (the attacker):', JSON.stringify(pressedAttacker));
  await sleep(800);
  await page.screenshot({ path: `${OUT}/3-after-second-press.png` });

  const outcome = await st(page);
  console.log('\nDID A BLOCK GET RECORDED?', JSON.stringify(outcome.attackers));
  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  if (health.consoleErrors.length) console.log(health.consoleErrors.slice(0, 3));
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
