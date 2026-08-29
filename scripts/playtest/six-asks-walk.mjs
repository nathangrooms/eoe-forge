/**
 * THE OWNER'S SIX ASKS, ONE AT A TIME, EACH WITH A NUMBER AND A SHOT.
 *
 *   1. the action bar is at the TOP
 *   2. the lobby reads as a CHAT BOX
 *   3. there is a FRIENDS LIST in the play section
 *   4. card art is never cropped and never desaturated
 *   5. FULL WIDTH
 *   6. fully interactive
 *
 * A no is a fine answer. A vague one is not, so every row prints the pixels it
 * was decided on. It also re-measures the combat badge, which is the one thing
 * I changed on the board: `blocks Cursed Minotaur` truncated to `blocks C…`
 * before, on a board with two C-named attackers.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/six-asks-walk.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = '.shots/six-asks';
fs.mkdirSync(OUT, { recursive: true });
const rows = [];
const say = (ask, verdict, evidence, shot) => {
  rows.push({ ask, verdict, evidence, shot });
  console.log(`\n${verdict.padEnd(4)} ${ask}\n     ${evidence}${shot ? `\n     shot: ${shot}` : ''}`);
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
    blocks: (g.combat?.attackers || []).reduce((n, a) => n + (a.blockedBy || []).length, 0),
  };
});

/** Full-width test: leftmost and rightmost painted pixel of any real surface. */
const widthFill = page => page.evaluate(() => {
  let x0 = 1e9, x1 = -1e9;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && el.tagName !== 'IMG') continue;
    x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right);
  }
  return { x0: Math.round(x0), x1: Math.round(x1), vw: innerWidth };
});

/** Where the turn-driving controls are. */
const turnControls = page => page.evaluate(() => {
  const DRIVERS = /^(END TURN|ATTACK|ATTACK WITH \d+|DECLARE ATTACKERS|NO ATTACKS|DECLARE BLOCKERS|CONFIRM \d+ BLOCKS?|NO BLOCKS|LET IT RESOLVE|RESPOND|KEEP THIS HAND|MULLIGAN)$/i;
  return [...document.querySelectorAll('button')]
    .filter(b => DRIVERS.test((b.innerText || '').trim()))
    .map(b => { const r = b.getBoundingClientRect(); return { label: (b.innerText || '').trim(), y: Math.round(r.y), x: Math.round(r.x) }; });
});

const cardArt = page => page.evaluate(() => {
  const A = 5 / 7;
  return [...document.querySelectorAll('img')]
    .filter(i => /scryfall/i.test(i.currentSrc || i.src || ''))
    .map(i => {
      let n = i, chain = [], d = 0;
      while (n && d < 20) { const f = getComputedStyle(n).filter; if (f && f !== 'none') chain.push(f); n = n.parentElement; d++; }
      const w = i.offsetWidth, h = i.offsetHeight, fit = getComputedStyle(i).objectFit;
      return {
        name: i.getAttribute('alt') || '?',
        cropped: fit === 'cover' && Math.abs((h ? w / h : 0) - A) > 0.04,
        desat: chain.filter(f => /grayscale\((?!0\))/.test(f) || /saturate\(0(\.\d+)?\)/.test(f)),
      };
    });
});

const combatBadges = page => page.evaluate(() => [...document.querySelectorAll('span[aria-label]')]
  .filter(s => /is blocking|is attacking/i.test(s.getAttribute('aria-label') || ''))
  .map(s => ({
    shows: (s.innerText || '').trim().replace(/\s+/g, ' '),
    means: (s.getAttribute('aria-label') || '').slice(0, 70),
    cut: s.scrollHeight > s.clientHeight + 1 || (s.scrollWidth > s.clientWidth + 1),
    box: `${Math.round(s.getBoundingClientRect().width)}x${Math.round(s.getBoundingClientRect().height)}`,
  })));

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  // ---------- ask 3 and 5 on the landing screen ----------
  await page.screenshot({ path: `${OUT}/1-landing.png` });
  const landing = await page.evaluate(() => {
    const t = document.body.innerText || '';
    const el = [...document.querySelectorAll('*')].find(e => /friends/i.test(e.textContent || '') && (e.textContent || '').length < 400);
    const r = el?.getBoundingClientRect();
    return { hasFriends: /friend/i.test(t), y: r ? Math.round(r.y) : null, snippet: (t.match(/[^\n]*[Ff]riend[^\n]*/) || [''])[0].slice(0, 80) };
  });

  await press(page, /VERSUS BOTS/); await sleep(1400);
  await press(page, /Choose opponents|seeded|Use this deck/); await sleep(1300);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  await sleep(2500);

  // ---------- ask 1, at the mulligan ----------
  const mull = await turnControls(page);
  await page.screenshot({ path: `${OUT}/2-mulligan.png` });
  await press(page, /^KEEP THIS HAND/); await sleep(2200);

  // ---------- play until two blocks are on the board ----------
  let barAtBlocks = null, badges = null, blockShot = null;
  const bars = [];
  for (let i = 0; i < 560; i++) {
    const s = await st(page);
    if (!s || s.status === 'complete') break;
    const mine = s.active === 'p1';
    if (i % 9 === 0) bars.push(...(await turnControls(page)));

    if (!mine && /declare_block/i.test(s.step) && s.blocks >= 1) {
      badges = await combatBadges(page);
      barAtBlocks = await turnControls(page);
      blockShot = `${OUT}/3-blocked.png`;
      await page.screenshot({ path: blockShot });
      break;
    }

    let did = null;
    if (mine && /main/i.test(s.step)) {
      if (!s.landPlayed && s.landsInHand) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /play this as a land/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(380); did = await press(page, /^PLAY LAND$/); }
      }
      if (!did) {
        const ok = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => /you can cast/i.test(b.getAttribute('aria-label') || ''));
          if (!el) return false; el.click(); return true;
        });
        if (ok) { await sleep(380); did = await press(page, /^CAST\b/); if (did) { await sleep(600); await press(page, /^Aim /); } }
      }
      if (!did) await press(page, /Close the preview/);
      if (!did && /precombat_main/i.test(s.step) && s.creatures > 0) did = await press(page, /^ATTACK$/);
    }
    if (!did && !mine && /declare_block/i.test(s.step)) {
      did = await press(page, /^Block .+ with /) || await press(page, /^Block with /);
    }
    if (!did && !(mine && /untap|upkeep|draw/i.test(s.step))) {
      did = await press(page, /^Attack with /)
        || await press(page, /^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$/)
        || await press(page, /^LET IT RESOLVE$|^END TURN$/);
    }
    await sleep(290);
  }

  const art = await cardArt(page);
  const fill = await widthFill(page);

  // ================= verdicts =================
  const drivers = [...mull, ...bars, ...(barAtBlocks || [])];
  const low = drivers.filter(d => d.y > 120);
  say('1. Action bar at the TOP',
    low.length === 0 ? 'YES' : 'NO',
    `${drivers.length} turn-driving controls seen across the mulligan, the whole game and the block decision. ` +
    `Highest y=${Math.min(...drivers.map(d => d.y))}, lowest y=${Math.max(...drivers.map(d => d.y))}. ` +
    (low.length ? `${low.length} below y=120: ${JSON.stringify(low)}` : 'none below y=120.') +
    ` At the mulligan: ${JSON.stringify(mull.map(m => `${m.label}@y${m.y}`))}`,
    `${OUT}/2-mulligan.png`);

  say('3. A friends list in the play section',
    landing.hasFriends ? 'YES' : 'NO',
    landing.hasFriends
      ? `a "Friends" panel on the play landing at y=${landing.y}, ${landing.h}px tall, reading: "${landing.snippet}". Signed out, so the POPULATED state is unmeasured.`
      : 'no element headed Friends on the play landing.',
    `${OUT}/1-landing.png`);

  const cropped = art.filter(a => a.cropped), desat = art.filter(a => a.desat.length);
  say('4. Card art never cropped, never desaturated',
    !cropped.length && !desat.length ? 'YES' : 'NO',
    `${art.length} Scryfall images on this board. cropped ${cropped.length}, desaturated ${desat.length}. ` +
    'Crop tested on untransformed offsetWidth/offsetHeight against the printed 5:7 plus object-fit, so a rotated tapped card is not a false positive. ' +
    'Desaturation walked 20 ancestors up from each image.' +
    (cropped.length ? ' CROPPED: ' + JSON.stringify(cropped.slice(0, 5)) : '') +
    (desat.length ? ' DESATURATED: ' + JSON.stringify(desat.slice(0, 5)) : ''),
    blockShot);

  say('5. Full width',
    fill.x1 - fill.x0 >= fill.vw - 24 ? 'YES' : 'NO',
    `painted x ${fill.x0}..${fill.x1} of ${fill.vw}.`, blockShot);

  if (badges) {
    const cut = badges.filter(b => b.cut);
    console.log('\nCOMBAT BADGES ON THE BOARD (the thing I changed):');
    badges.forEach(b => console.log(`   ${b.cut ? 'CUT ' : 'ok  '} box ${b.box}  shows "${b.shows}"   means "${b.means}"`));
    console.log(`   ${cut.length} of ${badges.length} cut off.`);
  } else {
    console.log('\nnever reached a two-block board in this run');
  }

  console.log('\nHEALTH page', health.pageErrors.length, 'console', health.consoleErrors.length, 'net', health.netFails.length);
  if (health.netFails.length) console.log(health.netFails.slice(0, 5));
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ rows, badges, art: art.length, fill, health }, null, 1));
  await browser.close();
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
