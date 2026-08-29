/**
 * WHAT DOES THE FAN SAY ABOUT EACH CARD, AND WHAT DOES THE PREVIEW OFFER?
 *
 * A run of `player-can.mjs` could not find a spell that names a target, even
 * with cost removed. That is either a deck that holds none or a control that
 * never draws, and the two must not be confused. This dumps the fan's own
 * sentence for every card in hand, then opens each one and records what the
 * preview offered, at a main phase of the reader's own turn.
 */
import { openHarness, sleep, unblock, gameState } from './uiLib.mjs';

/** A newline, named, because writing one into a shell heredoc kept producing a
 *  real line break inside a string literal and a syntax error with it. */
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
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });
  await press(page, /VERSUS BOTS/); await sleep(1500);
  await press(page, /seeded|Use this deck|Choose/); await sleep(1200);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3000);
  await press(page, /keep this hand/); await sleep(2500);

  // Free cast, so cost explains nothing.
  await press(page, /Game menu/); await sleep(800);
  const free = await press(page, /^Free cast\b/);
  await press(page, /Game menu/); await sleep(700);

  // Walk to my own main phase without ending the turn.
  for (let i = 0; i < 200; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.active === 'p1' && /main/.test(g.step) && g.stack === 0) break;
    if (g.active === 'p1') { await press(page, /^LET IT RESOLVE$/); await press(page, /^Advance one step$/); }
    else if (!(await unblock(page))) await press(page, /^Advance one step$/);
    await sleep(240);
  }

  const g = await gameState(page);
  console.log('free cast on:', free, '| step', g?.step, '| active', g?.active);

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map(b => b.getAttribute('aria-label') || '')
      .filter(l => /Click to preview/i.test(l)));

  console.log('\nWHAT THE FAN SAYS, CARD BY CARD');
  for (const l of labels) console.log('  ' + l.replace(' Click to preview.', ''));

  console.log('\nWHAT THE PREVIEW OFFERS, CARD BY CARD');
  for (const l of labels) {
    const opened = await page.evaluate(x => {
      const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === x);
      if (!el) return false; el.click(); return true;
    }, l);
    if (!opened) { console.log('  ' + l.split('.')[0] + ': could not open'); continue; }
    await sleep(700);
    const seen = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        castAt: /Cast it at/i.test(text),
        buttons: [...document.querySelectorAll('button')]
          .filter(b => !b.disabled)
          .map(b => ({ l: (b.innerText || '').trim(), t: b.getAttribute('title') || '' }))
          .filter(b => /^(cast|play land|aim |use )/i.test(b.l) || /^(Aim |Use |Cast at )/i.test(b.t))
          .map(b => b.l || b.t)
          .slice(0, 4),
      };
    });
    console.log(`  ${l.split('.')[0]}: castAt=${seen.castAt} controls=${JSON.stringify(seen.buttons)}`);
    await press(page, /Close the preview|Do not cast it/);
    await sleep(350);
  }

  /*
   * NOW PUT A CREATURE ON THE TABLE AND ASK AGAIN.
   *
   * Every refusal above is correct and the same refusal twice: "Choose a
   * creature" and "attacking creature" on a turn-one board where no creature
   * exists anywhere. A run that stopped here would report "a target can never
   * be chosen" about a rule doing its job. So cast one and repeat.
   */
  for (const name of ['Tundra Wolves', 'Icatian Javelineers']) {
    const opened = await page.evaluate(n => {
      const el = [...document.querySelectorAll('button')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith(n + '.'));
      if (!el) return false; el.click(); return true;
    }, name);
    if (!opened) continue;
    await sleep(700);
    if (await press(page, /^CAST$/)) { await sleep(1600); await unblock(page); await sleep(1600); }
    await press(page, /Close the preview/);
    await sleep(500);
    const bf = await page.evaluate(() => {
      const st = window.__dmGame;
      return st.players.find(p => p.id === 'p1').zones.battlefield
        .filter(id => /creature/i.test(st.cards[id].typeLine || '')).length;
    });
    if (bf > 0) { console.log(NL + 'creatures on my board: ' + bf); break; }
  }

  console.log(NL + 'THE SAME TARGETED SPELLS, WITH A CREATURE ON THE TABLE');
  for (const name of ['Crumb and Get It', 'Condemn']) {
    const label = await page.evaluate(n => {
      const el = [...document.querySelectorAll('button')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith(n + '.'));
      if (!el) return null;
      const l = el.getAttribute('aria-label');
      el.click();
      return l;
    }, name);
    if (!label) { console.log(`  ${name}: no longer in hand`); continue; }
    await sleep(800);
    const seen = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const all = [...document.querySelectorAll('button')];
      return {
        castAt: /Cast it at/i.test(text),
        aiming: /CHOOSE A TARGET|Press a card on the table|Do not cast it/i.test(text),
        anyAimTitle: all
          .map(b => ({ t: b.getAttribute('title') || '', a: b.getAttribute('aria-label') || '', d: b.disabled }))
          .filter(b => /aim/i.test(b.t) || /aim/i.test(b.a)),
        cancels: all.filter(b => /Do not cast it/i.test(b.innerText || '')).length,
        bodyTail: text.slice(-500),
      };
    });
    console.log(`  fan says: ${label.replace(' Click to preview.', '')}`);
    console.log('  preview:  ' + JSON.stringify({ castAt: seen.castAt, aiming: seen.aiming, aimButtons: seen.anyAimTitle, cancels: seen.cancels }, null, 2));
    console.log('  page tail: ' + JSON.stringify(seen.bodyTail));
    if (seen.anyAimTitle.filter(b => !b.d).length) {
      const before = await gameState(page);
      await press(page, /^(Aim |Cast at )/);
      await sleep(1800);
      const after = await gameState(page);
      console.log(`  PRESSED: hand ${before.hand}->${after.hand}, stack ${before.stack}->${after.stack}`);
      await page.screenshot({ path: '.shots/target-chosen.png' });
      break;
    }
    await press(page, /Close the preview|Do not cast it/);
    await sleep(400);
  }

  await browser.close();
};
main();
