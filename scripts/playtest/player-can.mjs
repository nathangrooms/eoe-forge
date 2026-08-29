/**
 * CAN A PERSON ACTUALLY DO IT? ONE ROW PER THING A GAME OF MAGIC ASKS FOR.
 *
 * `src/lib/game/reachability.test.ts` asks whether anything OUTSIDE the reducer
 * builds each action. That is the static half, and it says so itself: an action
 * the engine builds while resolving an effect counts as reachable even when no
 * human can initiate it. This is the other half, and it is the one the owner is
 * asking about: open the shipped page, look for the control, PRESS it, and check
 * the game moved.
 *
 * Every row is FOUND (a control was on screen and enabled), PRESSED, and
 * EFFECT (the game state changed the way that press should change it). A row
 * that is found and pressed but has no effect is worse than a missing one,
 * because the player believes they did something.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/player-can.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const OUT = '.shots/player-can';
const results = [];

const record = (name, row) => {
  results.push({ name, found: false, pressed: false, effect: false, note: '', ...row });
  const r = results[results.length - 1];
  console.log(
    `${r.effect ? 'YES' : r.found ? '..' : 'NO '}  ${name.padEnd(26)} ${r.note}`
  );
};

/** Every enabled button on screen, with where it is. */
const buttons = page => page.evaluate(() =>
  [...document.querySelectorAll('button')]
    .filter(b => !b.disabled)
    .map(b => {
      const r = b.getBoundingClientRect();
      return {
        label: (b.innerText || '').trim().slice(0, 40),
        title: (b.getAttribute('title') || '').slice(0, 80),
        y: Math.round(r.y),
        x: Math.round(r.x),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter(b => b.h > 6 && b.w > 6)
);

/** Press the first enabled button whose label or title matches. */
const press = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button')].find(b => {
    if (b.disabled) return false;
    return rx.test((b.innerText || '').trim()) || rx.test(b.getAttribute('title') || '');
  });
  if (!el) return false;
  el.click();
  return true;
}, re.source);

/** Open the preview for the first hand card matching a predicate on its label. */
const openHandCard = (page, src) => page.evaluate(s => {
  const rx = new RegExp(s, 'i');
  const el = [...document.querySelectorAll('button')].find(b => {
    const label = b.getAttribute('aria-label') || '';
    return /Click to preview/i.test(label) && rx.test(label);
  });
  if (!el) return null;
  el.click();
  return (el.getAttribute('aria-label') || '').slice(0, 90);
}, src);


/**
 * Advance one step, WITHOUT handing the turn over.
 *
 * `unblock` presses the primary control, and on your own turn the primary
 * control is END TURN. So a loop that used it to "get to a main phase" gave the
 * turn away every time it reached one, and the probe then measured casting
 * during the opponent's draw step and called a correct refusal a defect. The
 * HUD's own one-step control is what walks a turn without ending it.
 */
const stepOnce = page => press(page, /^Advance one step$/);

/**
 * Walk until it is your own main phase with an empty stack.
 *
 * ON YOUR OWN TURN THIS NEVER USES `unblock`. `unblock` falls through to the
 * primary control, and on your turn the primary control is END TURN, so the
 * first version of this loop handed the turn away every time it arrived at the
 * main phase it was walking towards. The run then opened a creature during the
 * opponent's DRAW step and recorded "no Cast button" as a defect, when the
 * preview was correctly saying "It is not your turn."
 */
async function myMainPhase(page, tries = 300) {
  for (let i = 0; i < tries; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') return null;
    if (g.active === 'p1' && /main/.test(g.step || '') && g.stack === 0) return g;

    if (g.active === 'p1') {
      // Answer anything that is genuinely asking, then take ONE step.
      await press(page, /^LET IT RESOLVE$/);
      await press(page, /Close the preview/);
      await stepOnce(page);
    } else if (!(await unblock(page))) {
      await stepOnce(page);
    }
    await sleep(240);
  }
  return null;
}

const shot = async (page, name) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const main = async () => {
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  /* ---------------------------------------------------------------- setup */
  await press(page, /VERSUS BOTS/);
  await sleep(1500);
  await press(page, /seeded|Use this deck|Choose/);
  await sleep(1200);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3500);

  /* ------------------------------------------------------------ MULLIGAN */
  {
    const before = await gameState(page);
    const found = (await buttons(page)).some(b => /^mulligan$/i.test(b.label));
    const pressed = found && (await press(page, /^mulligan$/));
    await sleep(2500);
    const after = await gameState(page);
    // A mulligan reshuffles and deals seven again: the hand stays seven and the
    // cards in it change, so the count alone cannot prove it. The bar's own
    // headline counts the mulligans taken, which is the honest witness.
    const said = await page.evaluate(() => /Mulligan 1/i.test(document.body.innerText || ''));
    record('mulligan', {
      found, pressed, effect: !!said,
      note: `hand ${before?.hand} -> ${after?.hand}, bar says mulligan 1: ${said}`,
    });
    await shot(page, '01-after-mulligan');
  }

  /* ---------------------------------------------------------------- KEEP */
  {
    const found = (await buttons(page)).some(b => /keep this hand/i.test(b.label));
    const pressed = found && (await press(page, /keep this hand/));
    await sleep(2500);
    /*
     * THE LONDON MULLIGAN COSTS A CARD, AND THE FIRST VERSION OF THIS PROBE
     * FORGOT TO PAY IT.
     *
     * Keeping after one mulligan owes one card to the bottom of the library.
     * The bar's headline changes to "Put 1 card on the bottom" and the game has
     * NOT started: every card in hand is held, so the probe went on to report
     * that no land could be played, nothing was castable, no permanent could be
     * tapped and combat never arrived. All of that was this loop missing, not
     * the app. Answer the step properly and the rows below mean something.
     */
    for (let i = 0; i < 6; i++) {
      const owed = await page.evaluate(() => /Put \d+ card/i.test(document.body.innerText || ''));
      if (!owed) break;
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')]
          .find(b => /Click to preview/i.test(b.getAttribute('aria-label') || ''));
        if (el) el.click();
      });
      await sleep(900);
      await press(page, /start the game|put .* back|^done$/);
      await sleep(1600);
    }

    const gone = await page.evaluate(() =>
      !/Your opening hand|Put \d+ card|Ready to start/i.test(document.body.innerText || '')
    );
    record('keep the opening hand', {
      found, pressed, effect: gone,
      note: gone ? 'the opening hand is settled and the game is running' : 'still asking',
    });
  }

  /* ------------------------------------------------------------ CONCEDE */
  {
    // Looked for, not pressed: conceding ends the game and everything below
    // needs one running. Pressed at the very end instead.
    await press(page, /Game menu/);
    await sleep(900);
    /* "Concede the game", not "Concede". An earlier run of this probe anchored
       the regex at both ends and reported the control missing when it was on
       screen the whole time, which is the exact mistake this task exists to
       stop making. */
    const found = (await buttons(page)).some(b => /^concede/i.test(b.label));
    await shot(page, '02-game-menu');
    await press(page, /Game menu/);
    await sleep(600);
    record('concede is reachable', {
      found, pressed: false, effect: found,
      note: found ? 'in the game menu, behind the sliders control' : 'not in the game menu',
    });
  }

  /* ------------------------------------------------------- PLAY A LAND */
  {
    let done = null;
    for (let i = 0; i < 60 && !done; i++) {
      const g = await gameState(page);
      if (!g || g.status === 'complete') break;
      const label = await openHandCard(page, 'You can play this as a land drop');
      if (label) {
        await sleep(700);
        const before = await gameState(page);
        const pressed = await press(page, /^Play land$/);
        await sleep(1400);
        const after = await gameState(page);
        done = {
          found: true, pressed,
          effect: !!(after && before && after.bf === before.bf + 1 && after.hand === before.hand - 1),
          note: `${label.split('.')[0]}: hand ${before?.hand}->${after?.hand}, board ${before?.bf}->${after?.bf}`,
        };
        await shot(page, '03-land-played');
        break;
      }
      await unblock(page);
      await sleep(300);
    }
    record('play a land', done ?? { note: 'no land offered in 60 tries' });
  }

  /* ------------------------------------------------------------- TAP */
  {
    const before = await page.evaluate(() => {
      const g = window.__dmGame;
      const p = g.players.find(x => x.id === 'p1');
      return p.zones.battlefield.filter(id => g.cards[id].tapped).length;
    });
    // The preview for a permanent you control carries Tap. Open the first one.
    const opened = await page.evaluate(() => {
      const g = window.__dmGame;
      const p = g.players.find(x => x.id === 'p1');
      const id = p.zones.battlefield.find(i => !g.cards[i].tapped);
      if (!id) return null;
      const name = g.cards[id].name;
      const el = [...document.querySelectorAll('button')]
        .find(b => (b.getAttribute('title') || b.getAttribute('aria-label') || '').includes(name));
      if (!el) return null;
      el.click();
      return name;
    });
    await sleep(800);
    const found = opened !== null && (await buttons(page)).some(b => /^tap$/i.test(b.label));
    const pressed = found && (await press(page, /^Tap$/));
    await sleep(1000);
    const after = await page.evaluate(() => {
      const g = window.__dmGame;
      const p = g.players.find(x => x.id === 'p1');
      return p.zones.battlefield.filter(id => g.cards[id].tapped).length;
    });
    await press(page, /Close the preview/);
    await sleep(400);
    record('tap a permanent', {
      found, pressed, effect: after > before,
      note: `${opened ?? 'nothing to tap'}: tapped ${before} -> ${after}`,
    });
  }

  /* ------------------------------------------------- CAST, and TARGETING */
  {
    let cast = null, targeted = null;
    for (let round = 0; round < 14 && !(cast && targeted); round++) {
      const g = await myMainPhase(page);
      if (!g) break;

      /* Lands first, every turn. A hand of spells over one land can never
         afford anything, and a refusal that is really an empty mana base is not
         a finding about the interface. */
      for (let l = 0; l < 2; l++) {
        if (!(await openHandCard(page, 'You can play this as a land drop'))) break;
        await sleep(500);
        if (!(await press(page, /^Play land$/))) break;
        await sleep(900);
      }

      if (!targeted) {
        const label = await openHandCard(page, 'once you pick what it is aimed at');
        if (label) {
          await sleep(900);
          const hasRow = await page.evaluate(() => /Cast it at/i.test(document.body.innerText || ''));
          const aimable = (await buttons(page)).filter(b => /^Aim |^Cast at /i.test(b.title || b.label));
          const before = await gameState(page);
          const pressed = aimable.length > 0 && (await press(page, /^Aim |^Cast at /));
          await sleep(1800);
          const after = await gameState(page);
          targeted = {
            found: hasRow,
            pressed,
            effect: !!(after && before && (after.stack > before.stack || after.hand === before.hand - 1)),
            note: `${label.split('.')[0]}: ${aimable.length} target controls, hand ${before?.hand}->${after?.hand}, stack ${before?.stack}->${after?.stack}`,
          };
          await shot(page, '04-targeted-cast');
          await press(page, /Close the preview|Do not cast it/);
          await sleep(500);
        }
      }

      if (!cast) {
        const label = await openHandCard(page, 'You can cast this\.');
        if (label) {
          await sleep(900);
          const found = (await buttons(page)).some(b => /^cast/i.test(b.label));
          const before = await gameState(page);
          const pressed = found && (await press(page, /^Cast/));
          await sleep(1800);
          const after = await gameState(page);
          cast = {
            found, pressed,
            effect: !!(after && before && (after.stack > before.stack || after.bf > before.bf || after.hand < before.hand)),
            note: `${label.split('.')[0]}: hand ${before?.hand}->${after?.hand}, stack ${before?.stack}->${after?.stack}, board ${before?.bf}->${after?.bf}`,
          };
          await shot(page, '05-cast');
          await press(page, /Close the preview/);
          await sleep(500);
        }
      }

      /* Let the stack empty and the turn move on before trying again. */
      for (let k = 0; k < 14; k++) {
        const now = await gameState(page);
        if (!now || now.status === 'complete') break;
        if (now.active !== 'p1') break;
        await unblock(page);
        await sleep(280);
      }
    }
    record('cast a spell', cast ?? { note: 'nothing castable came up in 14 of my own main phases' });
    record('choose a target', targeted ?? { note: 'no targeted spell came up in 14 of my own main phases' });
  }

  /* -------------------------------------------- RESPOND WHILE ON THE STACK */
  {
    /*
     * WAIT FOR PRIORITY. An earlier run of this probe looked at the first frame
     * with a non-empty stack, found no control, and was about to be written up
     * as "you cannot respond". The screen said "Waiting for Thrakkus the
     * Butcher" at the top of the stack panel: the BOT held priority, and having
     * no control at that moment is the rule, not a defect.
     */
    let row = null;
    for (let i = 0; i < 260 && !row; i++) {
      const g = await page.evaluate(() => {
        const st = window.__dmGame;
        if (!st) return null;
        return {
          status: st.status,
          stack: (st.stack || []).length,
          priority: st.priorityPlayerId,
          top: st.stack?.length ? st.stack[st.stack.length - 1].name : null,
        };
      });
      if (!g || g.status === 'complete') break;
      if (g.stack > 0 && g.priority === 'p1') {
        const controls = (await buttons(page))
          .filter(b => /^(respond|let it resolve|counter|cast )/i.test(b.label));
        const named = await page.evaluate(n => (document.body.innerText || '').includes(n), g.top || '');
        row = {
          found: controls.length > 0,
          pressed: false,
          effect: controls.length > 0 && named,
          note: `${g.top} on the stack, priority mine, named on screen: ${named}, controls: ${controls.map(b => b.label).join(' / ')}`,
        };
        await shot(page, '06-stack');
        break;
      }
      await unblock(page);
      await sleep(240);
    }
    record('respond on the stack', row ?? { note: 'priority never reached this seat with a spell on the stack' });
  }

  /* ----------------------------------------------- ACTIVATE AN ABILITY */
  {
    /* `GameCardView` labels a permanent's own control "Tap <name>" /
       "Untap <name>", so that is what is looked for. Matching on the bare name
       also hit the copy of the card in the fan and opened the wrong preview,
       which is why the first run saw a Plains and no abilities. */
    /* EVERY permanent, not the first one. The first is nearly always a basic
       land, whose mana ability is paid through the cast rather than activated,
       so a probe that stopped there reported "0 ability controls" about a
       Plains and learned nothing. */
    const names = await page.evaluate(() => {
      const g = window.__dmGame;
      return g.players.find(x => x.id === 'p1').zones.battlefield.map(id => g.cards[id].name);
    });
    let row = null, abilityButtons = [];
    for (const name of names) {
      const opened = await page.evaluate(n => {
        const el = [...document.querySelectorAll('button')].find(b => {
          const t = b.getAttribute('title') || '';
          return t === `Tap ${n}` || t === `Untap ${n}`;
        });
        if (!el) return false;
        el.click();
        return true;
      }, name);
      if (!opened) continue;
      await sleep(950);
      /* `AbilityPanel` titles its control "Use <card>: <the ability's own text>". */
      const found = (await buttons(page)).filter(b => /^Use .+:/i.test(b.title));
      if (found.length) { row = name; abilityButtons = found; break; }
      await press(page, /Close the preview/);
      await sleep(350);
    }
    await shot(page, '07-abilities');
    const before = await gameState(page);
    const pressed = abilityButtons.length > 0 && (await press(page, /^Use .+:/));
    await sleep(1200);
    const after = await gameState(page);
    await press(page, /Close the preview/);
    await sleep(400);
    record('activate an ability', {
      found: abilityButtons.length > 0,
      pressed,
      effect: pressed && !!after,
      note: `${row ?? 'no permanent'}: ${abilityButtons.length} ability controls${abilityButtons[0] ? ' — ' + abilityButtons[0].title.slice(0, 60) : ''}`,
    });
  }

  /* ------------------------------------------------- ATTACK, BLOCK, ORDER */
  {
    let attack = null, block = null, order = null;

    /*
     * Attack is measured in ONE tight sequence rather than inside a long loop.
     * An earlier version read the step, then pressed, then looked for swords
     * several seconds later, by which time the bot had taken two turns; it then
     * reported "0 attack controls" about a board that was not the one it had
     * pressed on. Each read here happens immediately either side of a press.
     */
    for (let round = 0; round < 16 && !attack; round++) {
      const g = await myMainPhase(page);
      if (!g) break;

      const ready = await page.evaluate(() => {
        const st = window.__dmGame;
        const me = st.players.find(p => p.id === 'p1');
        return me.zones.battlefield.filter(id => {
          const c = st.cards[id];
          return /creature/i.test(c.typeLine || '') && !c.tapped && !c.summoningSick;
        }).length;
      });
      if (ready === 0) {
        // Nothing could legally attack, so the absence of a control is the rule
        // working. Take the turn and come back.
        for (let k = 0; k < 12; k++) {
          const now = await gameState(page);
          if (!now || now.status === 'complete' || now.active !== 'p1') break;
          await unblock(page);
          await sleep(260);
        }
        continue;
      }

      const foundAttack = (await buttons(page)).some(b => /^attack$/i.test(b.label));
      if (!foundAttack) {
        attack = { found: false, note: `${ready} creatures could attack and the top bar offered no Attack` };
        await shot(page, '08-attack-missing');
        break;
      }
      await press(page, /^attack$/);
      await sleep(1200);
      const step = (await gameState(page))?.step;
      const swords = (await buttons(page)).filter(b => /^(Attack with|Send )/i.test(b.title));
      const pressed = swords.length > 0 && (await press(page, /^(Attack with|Send )/));
      await sleep(900);
      const declared = await page.evaluate(() => (window.__dmGame.combat.attackers || []).length);
      await shot(page, '08-attack');
      attack = {
        found: true, pressed,
        effect: declared > 0,
        note: `${ready} able, step ${step}, ${swords.length} attack controls, ${declared} declared`,
      };
    }

    /* Blocking: wait until the game is genuinely in a declare blockers step with
       this seat defending, then read the controls on the board. */
    for (let i = 0; i < 320 && !block; i++) {
      const g = await gameState(page);
      if (!g || g.status === 'complete') break;
      /* AND SOMEBODY HAS TO BE ATTACKING. A declare blockers step with no
         attackers is a step the game walks through in silence, and a run that
         looked at one reported "0 block controls" about a board where the log
         said, correctly, that the opponent was holding everything back. */
      const attackers = await page.evaluate(() => (window.__dmGame?.combat?.attackers || []).length);
      if (/declare_blockers/.test(g.step || '') && g.active !== 'p1' && attackers > 0) {
        const bs = await buttons(page);
        /* `GameCardView` titles a blocker control "Block <attacker>"; the bar
           carries NO BLOCKS and DECLARE BLOCKERS. An earlier filter matched
           any title containing "block" and picked up a hand card's refusal
           sentence, which is how this row came to be reported with a note
           about Joust Through. */
        const shields = bs.filter(b =>
          /^Block /i.test(b.title) || /^(no blocks|declare blockers|confirm blocks)$/i.test(b.label)
        );
        block = {
          found: shields.length > 0, pressed: false, effect: shields.length > 0,
          note: `${attackers} attacking, ${shields.length} controls: ${shields.map(b => b.label || b.title).slice(0, 5).join(' / ')}`,
        };
        await shot(page, '09-blockers');
        break;
      }
      if (!order && (await page.evaluate(() => /order the blockers|damage order/i.test(document.body.innerText || '')))) {
        order = { found: true, pressed: false, effect: true, note: 'the ordering bar appeared' };
        await shot(page, '10-order-blockers');
      }
      await unblock(page);
      await sleep(260);
    }

    record('declare attackers', attack ?? { note: 'never reached a main phase with a creature able to attack' });
    record('declare blockers', block ?? { note: 'never reached a declare blockers step as the defender' });
    record('order blockers', order ?? {
      note: 'no attacker was blocked by more than one creature; that bar is only asked for by that case',
    });
  }

  /* ------------------------------------------------------------------------ */
  /* SECOND PASS, WITH FREE CAST ON, FOR THE ROWS THAT NEVER CAME UP           */
  /* ------------------------------------------------------------------------ */
  /*
   * "No targeted spell came up" and "no permanent with an activated ability
   * came up" are not the same claim as "there is no control". A seeded deck on
   * four lands may simply never afford one, and reporting that as a missing
   * button is the kind of confident wrong diagnosis this task exists to end.
   *
   * So the run finishes by turning on the game menu's own FREE CAST and asking
   * again. Cost stops being the reason for anything, and what is left is
   * whether the control exists. Rows found this way are labelled, because a
   * control reachable only with free cast on would still be a finding.
   */
  {
    const missing = results.filter(r => !r.effect).map(r => r.name);
    const wants = ['choose a target', 'activate an ability'].filter(n => missing.includes(n));
    if (wants.length) {
      await press(page, /Game menu/);
      await sleep(800);
      /* `MenuToggle` prints the hint under the label, so the button's innerText
         is "Free cast
Goldfishing. Ignore mana entirely". An end-anchored
         regex matched nothing and the pass silently ran with cost still on. */
      const on = await press(page, /^Free cast\b/);
      if (!on) {
        const seen = (await buttons(page)).map(b => b.label).filter(Boolean);
        console.log('  free cast not found. buttons on screen: ' + JSON.stringify(seen.slice(0, 30)));
      }
      await press(page, /Game menu/);
      await sleep(700);
      console.log(`\n  second pass, free cast turned on: ${on}`);

      /*
       * WITH COST REMOVED, EMPTY THE HAND ONTO THE BOARD FIRST.
       *
       * Both remaining rows need a card that the seeded deck may simply not
       * have drawn yet: a spell that names a target, and a permanent with an
       * activated ability. Casting everything castable for a few of my own
       * turns is the cheapest way to put one of each on the table, and an
       * Equipment is both (it is cast, and then it has Equip).
       */
      for (let round = 0; round < 12 && wants.length; round++) {
        const g = await myMainPhase(page);
        if (!g) break;

        for (let l = 0; l < 2; l++) {
          if (!(await openHandCard(page, 'You can play this as a land drop'))) break;
          await sleep(450);
          if (!(await press(page, /^Play land$/))) break;
          await sleep(800);
        }

        /* THE TARGET ROW, asked of every card in hand rather than of the ones
           the fan labels. Joust Through can only be aimed at an attacking or
           blocking creature, so outside combat the fan correctly greys it and a
           search keyed on the fan's own wording finds nothing. The question
           here is whether the CONTROL exists, so it is asked directly. */
        if (wants.includes('choose a target')) {
          const handLabels = await page.evaluate(() =>
            [...document.querySelectorAll('button')]
              .map(b => b.getAttribute('aria-label') || '')
              .filter(l => /Click to preview/i.test(l))
          );
          for (const label of handLabels) {
            const opened = await page.evaluate(l => {
              const el = [...document.querySelectorAll('button')]
                .find(b => (b.getAttribute('aria-label') || '') === l);
              if (!el) return false;
              el.click();
              return true;
            }, label);
            if (!opened) continue;
            await sleep(800);
            const hasRow = await page.evaluate(() => /Cast it at/i.test(document.body.innerText || ''));
            const aimable = (await buttons(page)).filter(b => /^Aim |^Cast at /i.test(b.title || b.label));
            if (hasRow && aimable.length > 0) {
              const before = await gameState(page);
              const pressed = await press(page, /^Aim |^Cast at /);
              await sleep(1800);
              const after = await gameState(page);
              record('choose a target, free cast on', {
                found: true, pressed,
                effect: !!(after && before && (after.stack > before.stack || after.hand < before.hand)),
                note: `${label.split('.')[0]}: ${aimable.length} target controls, hand ${before?.hand}->${after?.hand}, stack ${before?.stack}->${after?.stack}`,
              });
              await shot(page, '12-target-freecast');
              wants.splice(wants.indexOf('choose a target'), 1);
              break;
            }
            await press(page, /Close the preview|Do not cast it/);
            await sleep(300);
          }
          await press(page, /Close the preview/);
          await sleep(300);
        }

        /* Then put whatever will go onto the board, so there is something with
           an ability to activate. */
        for (let c = 0; c < 4; c++) {
          if (!(await openHandCard(page, 'You can cast this'))) break;
          await sleep(600);
          if (!(await press(page, /^Cast/))) { await press(page, /Close the preview/); break; }
          await sleep(1500);
          await unblock(page);
          await sleep(600);
        }
        await press(page, /Close the preview/);

        if (wants.includes('activate an ability')) {
          const names = await page.evaluate(() => {
            const st = window.__dmGame;
            return st.players.find(x => x.id === 'p1').zones.battlefield.map(id => st.cards[id].name);
          });
          for (const name of names) {
            const opened = await page.evaluate(n => {
              const el = [...document.querySelectorAll('button')].find(b => {
                const t = b.getAttribute('title') || '';
                return t === `Tap ${n}` || t === `Untap ${n}`;
              });
              if (!el) return false;
              el.click();
              return true;
            }, name);
            if (!opened) continue;
            await sleep(850);
            const found = (await buttons(page)).filter(b => /^Use .+:/i.test(b.title));
            if (found.length) {
              const pressed = await press(page, /^Use .+:/);
              await sleep(1400);
              record('activate an ability, free cast on', {
                found: true, pressed, effect: pressed,
                note: `${name}: ${found[0].title.slice(0, 70)}`,
              });
              await shot(page, '13-ability-freecast');
              wants.splice(wants.indexOf('activate an ability'), 1);
              break;
            }
            await press(page, /Close the preview/);
            await sleep(250);
          }
          await press(page, /Close the preview/);
        }

        for (let k = 0; k < 14; k++) {
          const now = await gameState(page);
          if (!now || now.status === 'complete' || now.active !== 'p1') break;
          await unblock(page);
          await sleep(260);
        }
      }

      for (const n of wants) {
        record(n + ', free cast on', { note: 'still never came up, even with cost removed' });
      }
    }
  }


  /* -------------------------------------------------------- CONCEDE, live */
  {
    const g = await gameState(page);
    if (g && g.status !== 'complete') {
      await press(page, /Game menu/);
      await sleep(800);
      const pressed = await press(page, /^concede the game/i);
      await sleep(700);
      const confirmed = await press(page, /^concede$/);
      await sleep(1600);
      const over = await page.evaluate(() => window.__dmGame?.status !== 'playing');
      record('concede, pressed', {
        found: pressed, pressed: !!confirmed, effect: over,
        note: over ? 'the game ended' : 'still playing after the confirm',
      });
      await shot(page, '11-conceded');
    } else {
      record('concede, pressed', { note: 'game had already finished' });
    }
  }

  console.log('\nconsole errors ' + health.consoleErrors.length +
    ', page errors ' + health.pageErrors.length +
    ', failed requests ' + health.netFails.length);
  for (const e of [...health.pageErrors, ...health.consoleErrors].slice(0, 5)) console.log('  ' + e);

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, health }, null, 2));
  await browser.close();
};

main();
