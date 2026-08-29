/**
 * WHAT DOES THE FAN ACTUALLY SAY, AND WHAT DOES THE PREVIEW OFFER?
 *
 * My first full-game run took 15 actions in 16 turns and finished with no
 * lands on the table. That is either the page refusing to let a player act or
 * my own probe missing the control, and on this project it has been the probe
 * four times out of four. So: stop at my own main phase and print the truth —
 * every card in hand, what the reducer says it is, what the fan's aria-label
 * says about it, and what the preview offers when it is opened.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/hand-truth.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/hand-truth';
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
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    hand: me.zones.hand.length, bf: me.zones.battlefield.length,
    lands: me.zones.battlefield.filter(c => /land/i.test(c.typeLine || '')).length,
    landsPlayed: me.landsPlayedThisTurn,
    handCards: me.zones.hand.map(c => ({ n: c.name, t: (c.typeLine || '').slice(0, 34), cost: c.manaCost })),
  };
});

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);
  await press(page, /^KEEP THIS HAND/); await sleep(2200);

  // Get to MY precombat main and stop there. Never press END TURN.
  for (let i = 0; i < 40; i++) {
    const s = await st(page);
    if (!s) break;
    if (s.active === 'p1' && s.step === 'precombat_main') break;
    // advance without ending my own turn
    await page.evaluate(() => {
      const labels = ['LET IT RESOLVE', 'NO BLOCKS', 'NO ATTACKS', 'DECLARE BLOCKERS', 'DECLARE ATTACKERS'];
      for (const l of labels) {
        const el = [...document.querySelectorAll('button')]
          .find(b => !b.disabled && (b.innerText || '').trim().toUpperCase() === l);
        if (el) { el.click(); return l; }
      }
      const et = [...document.querySelectorAll('button')]
        .find(b => !b.disabled && /^END TURN$/i.test((b.innerText || '').trim()));
      if (et) { et.click(); return 'END TURN'; }
      return null;
    });
    await sleep(400);
  }

  const s = await st(page);
  console.log('AT:', JSON.stringify({ turn: s.turn, step: s.step, active: s.active, hand: s.hand, lands: s.lands, landsPlayed: s.landsPlayed }));
  console.log('\nWHAT THE REDUCER SAYS IS IN MY HAND:');
  s.handCards.forEach((c, i) => console.log(`  ${i}. ${c.n}  [${c.t}]  ${c.cost || ''}`));

  const fan = await page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => /Click to preview|preview/i.test(b.getAttribute('aria-label') || ''))
    .map(b => ({ aria: b.getAttribute('aria-label'), disabled: b.disabled })));
  console.log('\nWHAT THE FAN SAYS (aria-label on each hand card):');
  fan.forEach((f, i) => console.log(`  ${i}. ${f.disabled ? '[OFF] ' : ''}${f.aria}`));

  await page.screenshot({ path: `${OUT}/main-phase.png` });

  // Open every hand card and record exactly which controls the preview gives.
  console.log('\nWHAT THE PREVIEW OFFERS FOR EACH CARD:');
  for (let i = 0; i < fan.length; i++) {
    const opened = await page.evaluate(n => {
      const els = [...document.querySelectorAll('button')]
        .filter(b => /Click to preview|preview/i.test(b.getAttribute('aria-label') || ''));
      if (!els[n]) return null; els[n].click();
      return els[n].getAttribute('aria-label');
    }, i);
    if (!opened) continue;
    await sleep(450);
    const offer = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('button')]
        .filter(b => {
          const r = b.getBoundingClientRect();
          return r.width > 30 && r.height > 18 && r.y > 90 && !/Click to preview/i.test(b.getAttribute('aria-label') || '');
        })
        .map(b => `${b.disabled ? '[OFF]' : ''}${(b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30)}`)
        .filter(x => x.replace('[OFF]', '').length > 1);
      const t = document.body.innerText || '';
      const refusal = (t.match(/There is nothing this could target[^\n]*/i)
        || t.match(/You cannot [^\n]*/i)
        || t.match(/Not enough mana[^\n]*/i) || [])[0];
      return { buttons: [...new Set(bs)].slice(0, 14), refusal };
    });
    const short = (opened || '').replace(/\s+/g, ' ').slice(0, 60);
    console.log(`  ${i}. ${short}`);
    console.log(`      offers: ${offer.buttons.join(' | ')}`);
    if (offer.refusal) console.log(`      says:   ${offer.refusal}`);
    if (i === 0) await page.screenshot({ path: `${OUT}/preview-0.png` });
    await press(page, /Close the preview/);
    await sleep(250);
  }

  console.log('\nHEALTH pageErrors', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
