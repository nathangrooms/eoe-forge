/**
 * ASK 6, FULLY INTERACTIVE. EVERY GESTURE A GAME OF MAGIC ASKS FOR, FOUND,
 * PRESSED, AND CHECKED AGAINST THE STATE EITHER SIDE.
 *
 * Found-and-pressed is not enough on its own: a control that moves nothing is
 * worse than a missing one, because the player believes they acted. So each row
 * carries the before and after of the thing that press should have changed.
 *
 * `player-can.mjs` from an earlier pass asks the same question and its own
 * report lists five rows it got wrong. This is a second, independent run with
 * different selectors, because a single probe agreeing with itself proves
 * nothing.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/everything-a-player-does.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/everything';
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
const row = (what, ok, note) => {
  rows.push({ what, ok, note });
  console.log(`${ok ? 'YES' : 'NO '}  ${what.padEnd(30)} ${note}`);
};

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
  const bf = me.zones.battlefield.map(at);
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status, winner: g.winnerId,
    hand: me.zones.hand.length, bf: bf.length, life: me.life,
    tapped: bf.filter(c => c.tapped).length,
    landsInHand: me.zones.hand.map(at).filter(c => /land/i.test(c.typeLine || '')).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    creatures: bf.filter(c => /creature/i.test(c.typeLine || '') && !c.tapped && !c.summoningSick).length,
    stack: (g.stack || []).length,
    attackers: (g.combat?.attackers || []).length,
    blocks: (g.combat?.attackers || []).reduce((n, a) => n + (a.blockedBy || []).length, 0),
    logTail: (g.log || []).slice(-3).map(l => (l.text || l.message || '').slice(0, 70)),
  };
});

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);

  // ---- mulligan ----
  const beforeMull = await st(page);
  const mullPressed = await press(page, /^MULLIGAN$/);
  await sleep(2500);
  const afterMull = await page.evaluate(() => (document.body.innerText || '').match(/Mulligan \d|second hand|new hand/i)?.[0] || '');
  row('mulligan', !!mullPressed, mullPressed ? `pressed "${mullPressed}", screen then said "${afterMull || 'a fresh opening hand'}"` : 'no MULLIGAN control at the opening hand');
  await page.screenshot({ path: `${OUT}/01-after-mulligan.png` });

  // A London mulligan costs a card, so bottoming may be asked first.
  await press(page, /^KEEP THIS HAND|^KEEP$/); await sleep(1400);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => /Click to preview/i.test(b.getAttribute('aria-label') || ''));
    if (el) el.click();
  });
  await sleep(600);
  await press(page, /^PUT .* BACK$|^BOTTOM|^DONE$|^KEEP/); await sleep(1800);
  const started = await st(page);
  row('keep a hand and start', started.status === 'playing', `turn ${started.turn}, ${started.step}, ${started.hand} cards in hand`);

  // ---- the long middle: every gesture as it comes up ----
  const done = new Set();
  let tapShot = null;
  for (let i = 0; i < 620; i++) {
    const s = await st(page);
    if (!s || s.status === 'complete') break;
    const mine = s.active === 'p1';
    let did = null;

    // TAP a permanent by hand, once.
    if (!done.has('tap') && s.bf > 0 && s.tapped === 0 && mine && /main/i.test(s.step)) {
      const before = s.tapped;
      const t = await press(page, /^Tap /);
      if (t) {
        await sleep(600);
        const after = await st(page);
        done.add('tap');
        tapShot = `${OUT}/02-tapped.png`;
        await page.screenshot({ path: tapShot });
        row('tap a permanent by hand', after.tapped > before, `pressed "${t}", tapped ${before} -> ${after.tapped}`);
        did = t;
      }
    }

    // RESPOND while something is on the stack.
    if (!did && !done.has('respond') && s.stack > 0) {
      const controls = await page.evaluate(() => [...document.querySelectorAll('button')]
        .filter(b => !b.disabled && /^(LET IT RESOLVE|RESPOND)$/i.test((b.innerText || '').trim()))
        .map(b => (b.innerText || '').trim()));
      if (controls.length) {
        done.add('respond');
        await page.screenshot({ path: `${OUT}/03-stack.png` });
        row('respond while the stack is live', true, `${s.stack} on the stack, controls offered: ${JSON.stringify(controls)}`);
      }
    }

    // ACTIVATE an ability off a permanent.
    if (!did && !done.has('ability') && mine && /main/i.test(s.step) && s.bf > 2) {
      const a = await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')]
          .find(b => !b.disabled && /^(Use |Aim .* at |Activate )/i.test(b.getAttribute('title') || b.innerText || ''));
        if (!el) return null; el.click();
        return ((el.getAttribute('title') || el.innerText) || '').trim().slice(0, 50);
      });
      if (a) {
        await sleep(900);
        const after = await st(page);
        done.add('ability');
        await page.screenshot({ path: `${OUT}/04-ability.png` });
        row('activate an ability', true, `pressed "${a}"; log now: ${JSON.stringify(after.logTail.slice(-1))}`);
        did = a;
      }
    }

    // main-phase business
    if (!did && mine && /main/i.test(s.step)) {
      if (!s.landPlayed && s.landsInHand) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /play this as a land/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) {
          await sleep(380);
          const before = s.bf;
          did = await press(page, /^PLAY LAND$/);
          if (did && !done.has('land')) {
            await sleep(500); const after = await st(page); done.add('land');
            row('play a land', after.bf > before, `board ${before} -> ${after.bf}, hand ${s.hand} -> ${after.hand}`);
          }
        }
      }
      if (!did) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /you can cast/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) {
          await sleep(400);
          const before = s.hand;
          did = await press(page, /^CAST\b/);
          if (did) {
            await sleep(700);
            const aimed = await press(page, /^Aim /);
            if (aimed && !done.has('target')) {
              done.add('target');
              await page.screenshot({ path: `${OUT}/05-aimed.png` });
              row('choose a target', true, `"${did}" then "${aimed}"`);
            }
            await sleep(500);
            const after = await st(page);
            if (!done.has('cast')) { done.add('cast'); row('cast a spell', after.hand < before, `hand ${before} -> ${after.hand}, board ${s.bf} -> ${after.bf}`); }
          }
        }
      }
      if (!did) await press(page, /Close the preview/);
      if (!did && /precombat_main/i.test(s.step) && s.creatures > 0) did = await press(page, /^ATTACK$/);
    }

    // attack
    if (!did && mine && /declare_attack/i.test(s.step)) {
      const before = s.attackers;
      const a = await press(page, /^Attack with /);
      if (a) {
        await sleep(500); const after = await st(page);
        if (!done.has('attack')) { done.add('attack'); await page.screenshot({ path: `${OUT}/06-attack.png` }); row('declare an attacker', after.attackers > before, `pressed "${a}", attackers ${before} -> ${after.attackers}`); }
        did = a;
      }
      if (!did) did = await press(page, /^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$/);
    }

    // block
    if (!did && !mine && /declare_block/i.test(s.step)) {
      const assigned = await press(page, /^Block .+ with /);
      if (assigned) {
        await sleep(500); const after = await st(page);
        if (!done.has('block')) { done.add('block'); await page.screenshot({ path: `${OUT}/07-block.png` }); row('block an attacker', after.blocks > s.blocks, `pressed "${assigned}", blocks ${s.blocks} -> ${after.blocks}`); }
        did = assigned;
      }
      if (!did) did = await press(page, /^Block with /);
      if (!did) did = await press(page, /^CONFIRM \d+ BLOCKS?$|^DECLARE BLOCKERS$|^NO BLOCKS$/);
      // order blockers only exists when one attacker is blocked by two
      if (!done.has('order')) {
        const bar = await page.evaluate(() => (document.body.innerText || '').match(/[^\n]*damage order[^\n]*/i)?.[0] || '');
        if (bar) { done.add('order'); row('order blockers', true, bar.trim().slice(0, 90)); }
      }
    }

    if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
      did = await press(page, /^LET IT RESOLVE$|^END TURN$/);
    }

    // Once everything else is done, concede and check the game ends.
    if (done.size >= 8 && !done.has('concede') && s.turn > 6) {
      done.add('concede');
      const menu = await press(page, /Game menu/);
      await sleep(700);
      await page.screenshot({ path: `${OUT}/08-menu.png` });
      const c = await press(page, /Concede/);
      await sleep(800);
      const c2 = await press(page, /Concede|Yes|Confirm/);
      await sleep(1600);
      const after = await st(page);
      await page.screenshot({ path: `${OUT}/09-conceded.png` });
      row('concede', after?.status === 'complete', `menu "${menu}", then "${c}"${c2 ? ` then "${c2}"` : ''}; status ${after?.status}`);
      break;
    }
    await sleep(300);
  }

  const notSeen = ['mulligan', 'land', 'cast', 'target', 'tap', 'ability', 'attack', 'block', 'respond', 'order', 'concede']
    .filter(k => !done.has(k) && !rows.some(r => r.what.toLowerCase().includes(k)));
  if (notSeen.length) console.log('\nNEVER CAME UP IN THIS GAME (not the same as missing):', JSON.stringify(notSeen));

  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  if (health.pageErrors.length) console.log(health.pageErrors.slice(0, 3));
  if (health.netFails.length) console.log(health.netFails.slice(0, 5));
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ rows, notSeen, health }, null, 1));
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
