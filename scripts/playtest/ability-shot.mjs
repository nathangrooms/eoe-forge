/**
 * IS THERE A CONTROL FOR AN ACTIVATED ABILITY, AND DOES PRESSING IT DO ANYTHING?
 *
 * `player-can.mjs` kept reporting "no permanent with an activated ability came
 * up", which is a statement about the deck rather than about the interface. A
 * seeded commander deck deals lands and creatures for several turns, and a
 * basic land's mana ability is paid through a cast rather than activated, so
 * the first few permanents genuinely have nothing to press.
 *
 * This turns cost off, empties the hand onto the table over several of the
 * reader's own turns, and then reads every permanent's preview, so the answer
 * is about the control rather than about the draw.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/ability-shot.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep, unblock, gameState } from './uiLib.mjs';

const OUT = '.shots/ability';
const NL = String.fromCharCode(10);

const press = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button')].find(b =>
    !b.disabled && (rx.test((b.innerText || '').trim()) || rx.test(b.getAttribute('title') || '')));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  await press(page, /VERSUS BOTS/); await sleep(1500);
  await press(page, /seeded|Use this deck|Choose/); await sleep(1200);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3000);
  await press(page, /keep this hand/); await sleep(2500);

  await press(page, /Game menu/); await sleep(800);
  const free = await press(page, /^Free cast\b/);
  await press(page, /Game menu/); await sleep(700);
  console.log('free cast on: ' + free);

  for (let round = 0; round < 7; round++) {
    for (let i = 0; i < 220; i++) {
      const g = await gameState(page);
      if (!g || g.status === 'complete') break;
      if (g.active === 'p1' && /main/.test(g.step) && g.stack === 0) break;
      if (g.active === 'p1') { await press(page, /^LET IT RESOLVE$/); await press(page, /^Advance one step$/); }
      else if (!(await unblock(page))) await press(page, /^Advance one step$/);
      await sleep(210);
    }
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;

    for (let l = 0; l < 2; l++) {
      const land = await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')]
          .find(b => /You can play this as a land drop/i.test(b.getAttribute('aria-label') || ''));
        if (!el) return false; el.click(); return true;
      });
      if (!land) break;
      await sleep(450);
      if (!(await press(page, /^PLAY LAND$/))) break;
      await sleep(800);
    }

    for (let c = 0; c < 5; c++) {
      const opened = await page.evaluate(() => {
        const el = [...document.querySelectorAll('button')]
          .find(b => /You can cast this\./i.test(b.getAttribute('aria-label') || ''));
        if (!el) return false; el.click(); return true;
      });
      if (!opened) break;
      await sleep(600);
      if (!(await press(page, /^CAST/))) { await press(page, /Close the preview/); break; }
      await sleep(1500);
      await unblock(page);
      await sleep(900);
    }
    await press(page, /Close the preview/);
    await sleep(400);

    for (let k = 0; k < 14; k++) {
      const now = await gameState(page);
      if (!now || now.status === 'complete' || now.active !== 'p1') break;
      await unblock(page);
      await sleep(240);
    }
  }

  /*
   * WAIT FOR AN EMPTY STACK ON MY OWN TURN BEFORE READING ANY PREVIEW.
   *
   * The first run of this scan read the screen while a bot's spell was on the
   * stack. What it dumped was the STACK STRIP's response row, not a card
   * preview, and that row is worth recording on its own: it carried "Condemn",
   * "Crumb and Get It", "Joust Through" and a lightning bolt beside "Icatian
   * Priest", which is an activated ability offered as an answer. But it is not
   * the question this loop is asking, which is what a permanent's own preview
   * offers when nothing is being answered.
   */
  for (let i = 0; i < 260; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.active === 'p1' && /main/.test(g.step) && g.stack === 0) break;
    if (g.active === 'p1') { await press(page, /^LET IT RESOLVE$/); await press(page, /^Advance one step$/); }
    else if (!(await unblock(page))) await press(page, /^Advance one step$/);
    await sleep(210);
  }
  const at = await gameState(page);
  console.log('scanning at: ' + JSON.stringify(at));

  const names = await page.evaluate(() => {
    const st = window.__dmGame;
    return st.players.find(p => p.id === 'p1').zones.battlefield.map(id => st.cards[id].name);
  });
  console.log('my permanents: ' + JSON.stringify(names));

  const rows = [];
  for (const name of names) {
    /*
     * "Tap <name>" IS NOT THE PREVIEW. It is the tap toggle drawn on the card,
     * and clicking it taps the permanent and opens nothing. Two runs of this
     * scan pressed it, read the BOARD behind the closed preview, and were about
     * to be written up as "a permanent's preview offers no ability". The
     * preview opens from the card image itself, whose title is the card's own
     * name (`GameCardView` passes `title ?? card.name` to `CardImage`).
     */
    const opened = await page.evaluate(n => {
      const el = [...document.querySelectorAll('button, [role=button]')]
        .find(b => (b.getAttribute('title') || '') === n);
      if (!el) return false; el.click(); return true;
    }, name);
    if (!opened) { rows.push({ name, opened: false }); continue; }
    await sleep(800);
    const seen = await page.evaluate(() => {
      const all = [...document.querySelectorAll('button')].filter(b => !b.disabled);
      return {
        /* `AbilityPanel` titles its control "Use <card>: <the ability's text>";
           an Equipment's equip control comes from `AttachmentPanel` instead, so
           both are looked for. */
        use: all.filter(b => /^Use .+:/i.test(b.getAttribute('title') || ''))
          .map(b => (b.getAttribute('title') || '').slice(0, 80)),
        /* THE OTHER SHAPE, and the one this deck actually produces. An ability
           that names a target does not draw a Use button: `TargetChoiceRow`
           hands the question to the board, every legal permanent wears "Aim
           <source> at <name>", and pressing one is the activation. Looking only
           for "Use" is why two earlier runs reported no ability control on a
           screen that was covered in them. */
        aim: all.filter(b => /^Aim .+ at /i.test(b.getAttribute('title') || ''))
          .map(b => (b.getAttribute('title') || '').slice(0, 60)),
        attach: all.filter(b => /^(Equip|Attach|Move it to)/i.test((b.innerText || '').trim()))
          .map(b => (b.innerText || '').trim().slice(0, 50)),
      };
    });
    rows.push({ name, opened: true, ...seen });

    /* A matcher finding nothing is not the same as nothing being there, and
       this project has been wrong that way before. So the preview of a card
       that really does carry an activated ability is photographed and its whole
       control list is dumped, whatever the matcher decided. */
    if (/Icatian Priest|Colossus Hammer|Consulate Dreadnought/i.test(name)) {
      await page.screenshot({ path: OUT + '/preview-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 28) + '.png' });
      const every = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .filter(b => {
            const r = b.getBoundingClientRect();
            return r.width > 20 && r.height > 12 && r.x > 560 && r.x < 1300;
          })
          .map(b => ({ l: (b.innerText || '').trim().slice(0, 40), t: (b.getAttribute('title') || '').slice(0, 60), d: b.disabled })));
      console.log('  ALL CONTROLS IN ' + name + ' PREVIEW: ' + JSON.stringify(every));
    }
    if (seen.use.length || seen.aim.length || seen.attach.length) {
      await page.screenshot({ path: `${OUT}/ability-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}.png` });
      const before = await gameState(page);
      const pressed = await press(page,
        seen.use.length ? /^Use .+:/ : seen.aim.length ? /^Aim .+ at / : /^(Equip|Attach|Move it to)/);
      await sleep(1500);
      const after = await gameState(page);
      rows[rows.length - 1].pressed = pressed;
      rows[rows.length - 1].after = `stack ${before.stack}->${after.stack}`;
      await page.screenshot({ path: `${OUT}/ability-pressed.png` });
      break;
    }
    await press(page, /Close the preview/);
    await sleep(300);
  }

  console.log(NL + 'PERMANENT BY PERMANENT');
  for (const r of rows) console.log('  ' + JSON.stringify(r));
  console.log(NL + 'console errors ' + health.consoleErrors.length + ', page errors ' + health.pageErrors.length);
  await browser.close();
};

main();
