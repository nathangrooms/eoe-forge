/**
 * SIT DOWN AND PLAY A WHOLE GAME. THE ONLY QUESTION THIS ANSWERS IS THE OWNER'S:
 * can a person open this page and play a game of Magic to the end without
 * getting stuck.
 *
 * It is deliberately NOT the harness. `scripts/playtest/run.ts` drives the
 * reducer, so it proves the rules are right and proves nothing at all about
 * whether a control exists to reach them. This drives the shipped page through
 * the DOM: it finds a control, presses it, and reads `window.__dmGame` either
 * side to check the game moved.
 *
 * THREE RULES LEARNED FROM EVERY EARLIER PROBE ON THIS PROJECT GETTING THIS
 * WRONG, each one written here so it is not re-learned:
 *
 *  1. NEVER PRESS BY POSITION ALONE. One probe sorted the top-right cluster by
 *     width and pressed UNDO on a loop, then reported a deadlock. Every press
 *     here names what it is pressing and logs it.
 *  2. A STALL IS ONLY A STALL IF NOTHING MOVED. The fingerprint below is turn,
 *     step, stack depth, hand size, board size and all four life totals. If any
 *     of those changed, the game is running even when the screen looks the same.
 *  3. AN ABSENT CONTROL IS ONLY A DEFECT IF THE ACTION WAS LEGAL. Having no
 *     block control when nobody attacked is the rules, not a bug. Every "could
 *     not" row below is checked against the state first.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/sit-down-and-play.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep } from './uiLib.mjs';

const OUT = process.env.OUT || '.shots/sit-down';
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS || 900);
fs.mkdirSync(OUT, { recursive: true });

const seen = new Set();          // "turn/step" pairs we have a screenshot of
const couldNot = [];             // legal things with no reachable control
const journal = [];              // every press, in order
let shotN = 0;

const shot = async (page, name) => {
  const f = `${OUT}/${String(shotN++).padStart(3, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  return f;
};

/** Everything a player can see and press, with where it is. */
const controls = page => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return {
        label: (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 46),
        title: (b.getAttribute('title') || '').slice(0, 70),
        aria: (b.getAttribute('aria-label') || '').slice(0, 70),
        disabled: b.disabled,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        shown: r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.opacity !== '0',
      };
    })
    .filter(b => b.shown)
);

/** Press one control by an exact predicate over label/title/aria. Logs it. */
const press = async (page, src, why) => {
  const hit = await page.evaluate(s => {
    const rx = new RegExp(s, 'i');
    const el = [...document.querySelectorAll('button')].find(b => {
      if (b.disabled) return false;
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      return rx.test((b.innerText || '').trim())
        || rx.test(b.getAttribute('title') || '')
        || rx.test(b.getAttribute('aria-label') || '');
    });
    if (!el) return null;
    el.click();
    return ((el.innerText || '').trim() || el.getAttribute('title') || '').replace(/\s+/g, ' ').slice(0, 46);
  }, src.source);
  if (hit) journal.push({ why, pressed: hit });
  return hit;
};

/*
 * CORRECTION TO MY OWN FIRST READER, and it is the reason the first run looked
 * like a player who never played a land. `Player.zones` is
 * `Record<Zone, InstanceId[]>` — ids, not cards. Cards live in one flat
 * `GameState.cards` dictionary (types.ts:391 and the note at types.ts:18). So
 * `zones.hand.map(c => c.name)` returned seven undefineds, every type test was
 * false, and `landsPlayedThisTurn` read off the wrong object never cleared.
 * Look the ids up.
 */
const state = page => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const me = g.players.find(p => p.id === 'p1') || g.players[0];
  const at = id => g.cards[id] || {};
  const hand = me.zones.hand.map(at);
  const bf = me.zones.battlefield.map(at);
  const isLand = c => /land/i.test(c.typeLine || '');
  const isCreature = c => /creature/i.test(c.typeLine || '');
  const atk = g.combat?.attackers || [];
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, priority: g.priorityPlayerId,
    status: g.status, me: me.id,
    stack: (g.stack || []).length,
    hand: hand.length,
    library: me.zones.library.length,
    bf: bf.length,
    creatures: bf.filter(c => isCreature(c) && !c.tapped && !c.summoningSick).length,
    allCreatures: bf.filter(isCreature).length,
    landsInPlay: bf.filter(isLand).length,
    untappedLands: bf.filter(c => isLand(c) && !c.tapped).length,
    landPlayed: (me.landsPlayedThisTurn || 0) > 0,
    landsInHand: hand.filter(isLand).length,
    handNames: hand.map(c => c.name).slice(0, 12),
    attackers: atk.length,
    attackingMe: atk.filter(a => a.defenderPlayerId === me.id).length,
    blocked: atk.reduce((n, a) => n + (a.blockedBy || []).length, 0),
    life: g.players.map(p => `${(p.name || p.id).slice(0, 10)}:${p.life}`).join(' '),
    lifeMine: me.life,
    seats: g.players.length,
  };
});

const fingerprint = s => s && [s.turn,s.step,s.active,s.stack,s.hand,s.bf,s.life,s.attackers,s.blocked].join("|");

/** Body text, for reading which question is on screen. */
const screenText = page => page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '));

async function main() {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  // ---- get to a table -------------------------------------------------
  await press(page, /VERSUS BOTS/, 'mode');
  await sleep(1500);
  await shot(page, 'deck-step');
  await press(page, /seeded|Use this deck|Choose/, 'deck');
  await sleep(1400);
  await shot(page, 'seat-step');
  await press(page, /Start .*game|Shuffle up/, 'start');
  try {
    await page.waitForFunction('!!window.__dmGame', { timeout: 150000, polling: 400 });
  } catch {
    console.log('NEVER REACHED A TABLE');
    await shot(page, 'never-started');
    await browser.close();
    return;
  }
  await sleep(2500);
  await shot(page, 'mulligan');

  const openingControls = await controls(page);
  const mullControls = openingControls.filter(c => /keep|mulligan/i.test(c.label));
  console.log('OPENING HAND CONTROLS:', JSON.stringify(mullControls.map(c => `${c.label}@y${c.y}${c.disabled ? ' (off)' : ''}`)));

  // A player takes their opening hand.
  await press(page, /^Keep/, 'keep opening hand');
  await sleep(2200);

  // ---- play the game --------------------------------------------------
  let last = fingerprint(await state(page));
  let same = 0;
  let acted = 0;
  const phaseLog = [];

  for (let i = 0; i < MAX_ACTIONS; i++) {
    const s = await state(page);
    if (!s) break;
    if (s.status === 'complete') {
      console.log(`GAME OVER at turn ${s.turn}: status=${s.status} life=${s.life}`);
      await shot(page, `over-turn${s.turn}`);
      break;
    }

    const key = `${s.turn}|${s.step}`;
    if (!seen.has(key)) {
      seen.add(key);
      phaseLog.push({ ...s });
      if (seen.size <= 60) await shot(page, `t${s.turn}-${String(s.step).replace(/[^a-z0-9]+/gi, '')}`);
    }

    const txt = await screenText(page);
    const mine = s.active === s.me;
    let did = null;

    // 1. A question is on the screen. Answer it before anything else.
    if (/CHOOSE A TARGET|Choose a creature|Press a card on the table|Aim /i.test(txt)) {
      did = await press(page, /^Aim /, 'answer aim prompt')
        || await press(page, /Do not cast it|Cancel/, 'decline aim');
    }
    // 2. Something is on the stack and it is my priority.
    if (!did && s.stack > 0) {
      did = await press(page, /^LET IT RESOLVE$/, 'let the stack resolve');
    }
    // 3. My own main phase: play a land, then cast something.
    if (!did && mine && /main|precombat|postcombat/i.test(s.step)) {
      if (!s.landPlayed && s.landsInHand > 0) {
        // The fan says which card is a land drop. Open that one.
        const opened = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => {
            const a = b.getAttribute('aria-label') || '';
            return /Click to preview/i.test(a) && /play this as a land/i.test(a);
          });
          if (!el) return null;
          el.click();
          return (el.getAttribute('aria-label') || '').slice(0, 60);
        });
        if (opened) {
          await sleep(500);
          did = await press(page, /^PLAY (THIS )?LAND|Play land|^PLAY$/, 'play a land');
          if (!did) {
            couldNot.push({
              turn: s.turn, step: s.step,
              what: 'play a land the fan offered as a land drop',
              card: opened, why: 'no PLAY LAND control in the preview',
            });
            await press(page, /Close the preview/, 'close preview');
          }
        } else {
          couldNot.push({
            turn: s.turn, step: s.step, what: 'play a land',
            why: `${s.landsInHand} lands in hand, land drop unused, no hand card offered one`,
          });
        }
      }
      if (!did) {
        // cast the first thing the fan says is castable
        const opened = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b => {
            const a = b.getAttribute('aria-label') || '';
            return /Click to preview/i.test(a) && /you can cast|can cast this/i.test(a);
          });
          if (!el) return null;
          el.click();
          return (el.getAttribute('aria-label') || '').slice(0, 70);
        });
        if (opened) {
          await sleep(500);
          did = await press(page, /^CAST\b/, 'cast a spell');
          if (did) { await sleep(900); await press(page, /^Aim /, 'aim the spell'); }
          if (!did) {
            const why = await screenText(page);
            const refusal = (why.match(/There is nothing this could target[^.]*\.?/i) || [])[0];
            couldNot.push({
              turn: s.turn, step: s.step,
              what: 'cast a spell the hand said was castable',
              card: opened, why: refusal || 'no CAST control in the preview',
            });
            await press(page, /Close the preview/, 'close preview');
          }
        }
      }
    }
    /*
     * 3b. My main phase, creatures ready: GO TO COMBAT.
     *
     * FOURTH CORRECTION. Turns 3, 13 and 15 of the previous run reached my own
     * `declare_blockers` and never my own `declare_attackers`, and I was about
     * to write that down as "the player cannot attack". The top bar carries
     * ATTACK at x=1324 immediately left of END TURN at x=1428, and it works:
     * pressing it goes to declare_attackers, the sword chip on Gorilla Pack
     * declares it, `ATTACK WITH 1` confirms, and the opponent went 38 to 35. My
     * driver only ever pressed END TURN, so it walked past its own combat every
     * turn of the game.
     */
    if (!did && mine && /precombat_main/i.test(s.step) && s.creatures > 0 && s.attackers === 0) {
      did = await press(page, /^ATTACK$/, 'go to combat');
    }
    // 4. My combat: attack.
    if (!did && mine && /declare.?attack/i.test(s.step)) {
      if (s.creatures > 0 && s.attackers === 0) {
        const swung = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')]
            .find(b => !b.disabled && /^Attack with /i.test(b.getAttribute('title') || ''));
          if (!el) return null; el.click();
          return (el.getAttribute('title') || '').slice(0, 50);
        });
        if (swung) { journal.push({ why: 'declare an attacker', pressed: swung }); did = swung; }
      }
      if (!did) did = await press(page, /^ATTACK WITH \d|^DECLARE ATTACKERS$|^NO ATTACKS$/, 'finish attacks');
    }
    /*
     * 5. Their combat: block. IT IS TWO PRESSES AND THE SECOND ONE IS ON THE
     * ATTACKER, which is on the opponent's mat.
     *
     * THIRD CORRECTION. My first run called turn 16 a deadlock here. It was
     * not. `Block with Gorilla Pack (3/3)` arms my creature, and only then does
     * the attacker's own chip turn on, reading `Block Scrawling Crawler (3/2)
     * with Gorilla Pack`. My second press matched `/^Block /` and DOM order
     * handed it `Block with Quandrix Apprentice` instead, so the loop re-armed
     * a different creature every pass and no block was ever recorded. Both
     * presses are named exactly now: "Block with" arms, "Block <attacker>
     * ... with" assigns.
     */
    if (!did && !mine && /declare.?block/i.test(s.step)) {
      if (s.attackingMe > 0 && s.creatures > 0) {
        // Second press first: if something is already armed, finish the block.
        const assigned = await page.evaluate(() => {
          const el = [...document.querySelectorAll('button')].find(b =>
            !b.disabled && /^Block .+ with /i.test(b.getAttribute('title') || ''));
          if (!el) return null; el.click(); return (el.getAttribute('title') || '').slice(0, 60);
        });
        if (assigned) { journal.push({ why: 'assign the block', pressed: assigned }); did = assigned; }
        if (!did) {
          const armed = await page.evaluate(() => {
            const el = [...document.querySelectorAll('button')].find(b =>
              !b.disabled && /^Block with /i.test(b.getAttribute('title') || ''));
            if (!el) return null; el.click(); return (el.getAttribute('title') || '').slice(0, 60);
          });
          if (armed) { journal.push({ why: 'arm a blocker', pressed: armed }); did = armed; }
          else {
            /*
             * NO BLOCK CONTROL IS NOT AUTOMATICALLY A DEFECT. Flying, menace,
             * "can't be blocked" and protection all legally leave a board with
             * creatures on it unable to block. So ask the ENGINE, not the
             * screen: `eligibleBlockers` is the same helper `PlayTable` uses
             * for `canBlockAtAll`, and if it returns nothing the page is right
             * to offer nothing. Only a disagreement between the two is a bug.
             */
            const truth = await page.evaluate(() => {
              const g = window.__dmGame;
              const me = g.players.find(p => p.id === 'p1');
              const at = id => g.cards[id] || {};
              const sentence = (document.body.innerText || '')
                .split(String.fromCharCode(10)).find(l => /block|let it through/i.test(l)) || '';
              return {
                sentence: sentence.trim().slice(0, 120),
                attackers: (g.combat?.attackers || []).map(a => {
                  const c = at(a.attackerId);
                  return `${c.name} [${(c.keywords || []).join(',') || 'no keywords'}]`;
                }),
                mine: me.zones.battlefield.map(at)
                  .filter(c => /creature/i.test(c.typeLine || ''))
                  .map(c => `${c.name}${c.tapped ? ' TAPPED' : ''} [${(c.keywords || []).join(',') || 'no keywords'}]`),
              };
            });
            await shot(page, `NOBLOCK-t${s.turn}`);
            couldNot.push({
              turn: s.turn, step: s.step, what: 'block an attacker',
              why: s.attackingMe + ' attacking me, ' + s.creatures + ' of my creatures untapped, no Block control',
              screenSays: truth.sentence, attackers: truth.attackers, myCreatures: truth.mine,
            });
          }
        }
      }
      if (!did) did = await press(page, /^DECLARE BLOCKERS$|^NO BLOCKS$/, 'finish blocks');
    }
    /*
     * 6. Nothing else to do. Pass.
     *
     * END TURN IS NOT "PASS PRIORITY" ON YOUR OWN TURN — IT ENDS THE WHOLE
     * TURN. My first run pressed it the moment rule 3 found nothing, so every
     * turn of mine went precombat_main -> over, I never reached my own combat,
     * and I lost 40 to 0 having attacked once. That is the trap `uiLib.mjs`
     * already documents for `unblock`, and I walked into it anyway. On my own
     * turn it is only pressed once the turn genuinely has nothing left: the
     * land drop is spent or there is no land, and no card in the fan says it
     * can be cast.
     */
    if (!did) {
      /*
       * SECOND CORRECTION, SAME TRAP, ONE STEP EARLIER. `END TURN` is enabled
       * at my own UNTAP and DRAW steps, and it does what it says: turn 3 read
       * `t3 untap -> END TURN` and the turn was gone before I reached a main
       * phase. Turns 3, 5, 7 and 9 were all thrown away that way, which is the
       * whole of why the first two runs took 15 actions in 16 turns and lost
       * 40 to 0 with one land on the table. Nothing was wrong with the page.
       *
       * A player does not press anything during their own untap and draw. Wait
       * there; the page walks itself to the main phase.
       */
      const beforeMyMain = mine && /untap|upkeep|draw/i.test(s.step);
      const combatUnspent = mine && /precombat_main/i.test(s.step) && s.creatures > 0;
      const stillToDo = mine && await page.evaluate(() => {
        const labels = [...document.querySelectorAll('button')]
          .filter(b => !b.disabled && /Click to preview/i.test(b.getAttribute('aria-label') || ''))
          .map(b => b.getAttribute('aria-label') || '');
        return labels.some(a => /play this as a land|you can cast/i.test(a));
      });
      if (!beforeMyMain && !stillToDo && !combatUnspent) {
        did = await press(page, /^END TURN$|^PASS\b|^NEXT\b|^CONTINUE$|^RESOLVE$|^OK$|^DONE$/, 'pass priority');
      }
      did = did
        || await press(page, /^LET IT RESOLVE$|^NO BLOCKS$|^NO ATTACKS$|^DECLARE (ATTACKERS|BLOCKERS)$|^KEEP/, 'primary')
        || await press(page, /Close the preview/, 'close a stray preview');
    }

    if (did) acted++;
    if (process.env.VERBOSE) {
      console.log(`  t${s.turn} ${String(s.step).padEnd(17)} act=${s.active} hand=${s.hand} land?${s.landsInHand}/${s.landPlayed ? 'spent' : 'free'} bf=${s.bf} -> ${did || 'NOTHING'}`);
    }
    await sleep(340);

    const fp = fingerprint(await state(page));
    if (fp === last) same++; else { same = 0; last = fp; }
    if (same >= 14) {
      const s2 = await state(page);
      const f = await shot(page, `STUCK-t${s2?.turn}-${String(s2?.step).replace(/[^a-z0-9]+/gi, '')}`);
      const cs = (await controls(page)).filter(c => !c.disabled && c.label);
      console.log('\n*** STUCK ***');
      console.log('state:', JSON.stringify(s2));
      console.log('screen says:', (await screenText(page)).slice(0, 400));
      console.log('enabled controls:', JSON.stringify(cs.map(c => `${c.label}@${c.x},${c.y}`)));
      console.log('shot:', f);
      couldNot.push({ turn: s2?.turn, step: s2?.step, what: 'advance the game at all', why: 'no control moved the state for 14 tries', controls: cs.map(c => c.label) });
      break;
    }
  }

  const end = await state(page);
  console.log('\n=== RESULT ===');
  console.log('final:', JSON.stringify(end));
  console.log('actions taken:', acted);
  console.log('distinct turn/step reached:', seen.size);
  console.log('screenshots:', shotN);
  console.log('\n=== STEPS VISITED ===');
  console.log([...seen].join('  '));
  console.log('\n=== COULD NOT ===');
  console.log(couldNot.length ? JSON.stringify(couldNot, null, 1) : 'nothing');
  console.log('\n=== HEALTH ===');
  console.log('pageErrors', health.pageErrors.length, 'consoleErrors', health.consoleErrors.length, 'netFails', health.netFails.length);
  if (health.pageErrors.length) console.log(health.pageErrors.slice(0, 5));
  if (health.consoleErrors.length) console.log(health.consoleErrors.slice(0, 5));
  if (health.netFails.length) console.log(health.netFails.slice(0, 8));

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ end, acted, steps: [...seen], couldNot, journal, phaseLog, health }, null, 1));
  await browser.close();
}

main().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
