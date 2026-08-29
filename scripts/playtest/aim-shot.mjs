/**
 * OPEN A TARGETED SPELL AND LOOK AT THE SCREEN.
 *
 * `SpellTargetPanel` draws a heading and then hands the question to the TABLE:
 * `TargetChoiceRow` returns null and publishes an aim request, the legal
 * permanents light up where they are, and `AimLayer` carries the clause and the
 * way out. A probe that only reads button titles cannot tell that working from
 * that failing, because when it works the row deliberately draws nothing.
 *
 * So this one takes a picture.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/aim-shot.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep, unblock, gameState } from './uiLib.mjs';

const OUT = '.shots/aim';
const NL = String.fromCharCode(10);

const press = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button')].find(b =>
    !b.disabled && (rx.test((b.innerText || '').trim()) || rx.test(b.getAttribute('title') || '')));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const openByLabel = (page, startsWith) => page.evaluate(n => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '').startsWith(n));
  if (!el) return null;
  const label = el.getAttribute('aria-label');
  el.click();
  return label;
}, startsWith);

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
  await press(page, /^Free cast\b/);
  await press(page, /Game menu/); await sleep(700);

  /* Get a creature of my own onto the table, so a "choose a creature" spell has
     something legal to point at. Everything else in this file is about looking
     at the moment after that. */
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < 200; i++) {
      const g = await gameState(page);
      if (!g || g.status === 'complete') break;
      if (g.active === 'p1' && /main/.test(g.step) && g.stack === 0) break;
      if (g.active === 'p1') { await press(page, /^LET IT RESOLVE$/); await press(page, /^Advance one step$/); }
      else if (!(await unblock(page))) await press(page, /^Advance one step$/);
      await sleep(220);
    }
    const mine = await page.evaluate(() => {
      const st = window.__dmGame;
      return st.players.find(p => p.id === 'p1').zones.battlefield
        .filter(id => /creature/i.test(st.cards[id].typeLine || '')).length;
    });
    if (mine > 0) break;

    // Cast the first creature the fan says is castable.
    const label = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')]
        .find(b => /You can cast this\./i.test(b.getAttribute('aria-label') || ''));
      if (!el) return null;
      const l = el.getAttribute('aria-label');
      el.click();
      return l;
    });
    if (label) {
      await sleep(700);
      await press(page, /^CAST$/);
      await sleep(1600);
      await unblock(page);
      await sleep(1200);
    }
    await press(page, /Close the preview/);
    await sleep(400);
    // End the turn so a summoning sick creature settles and the loop can retry.
    for (let k = 0; k < 12; k++) {
      const now = await gameState(page);
      if (!now || now.status === 'complete' || now.active !== 'p1') break;
      await unblock(page);
      await sleep(240);
    }
  }

  const board = await page.evaluate(() => {
    const st = window.__dmGame;
    const me = st.players.find(p => p.id === 'p1');
    return {
      mine: me.zones.battlefield.map(id => st.cards[id].name),
      theirs: st.players.filter(p => p.id !== 'p1')
        .flatMap(p => p.zones.battlefield.map(id => st.cards[id].name)),
    };
  });
  console.log('board: ' + JSON.stringify(board));

  /* Find whatever targeted spell the fan currently says is castable. */
  const label = await openByLabel(page, '');
  await press(page, /Close the preview/);
  await sleep(300);

  const targetLabel = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button')]
      .find(b => /once you pick what it is aimed at/i.test(b.getAttribute('aria-label') || ''));
    if (!el) return null;
    const l = el.getAttribute('aria-label');
    el.click();
    return l;
  });

  if (!targetLabel) {
    console.log('no card in hand is castable-once-aimed right now.');
    const fan = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map(b => b.getAttribute('aria-label') || '')
        .filter(l => /Click to preview/i.test(l))
        .map(l => l.replace(' Click to preview.', '')));
    console.log(fan.map(l => '  ' + l).join(NL));
    await page.screenshot({ path: `${OUT}/no-target.png` });
    await browser.close();
    return;
  }

  console.log('opened: ' + targetLabel);
  await sleep(2200);
  await page.screenshot({ path: `${OUT}/aiming.png` });

  const seen = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const all = [...document.querySelectorAll('button')];
    return {
      previewOpen: /HAND · YOU|HAND - YOU/i.test(text),
      castAtHeading: /Cast it at/i.test(text),
      /* TWO SHAPES, and looking for only one of them is how an earlier run of
         this probe concluded there was no control at all. With several legal
         targets the board itself becomes the control and each legal card wears
         a button titled "Aim at <name>". With exactly ONE legal target there is
         nothing to choose, so the panel draws a single press that says what it
         will be aimed at: "CAST AT TUNDRA WOLVES", innerText only, no title. */
      aimTitles: all
        .filter(b => /^Aim at /i.test(b.getAttribute('title') || '') || /^cast at /i.test((b.innerText || '').trim()))
        .map(b => ({ label: (b.innerText || '').trim().slice(0, 50), title: b.getAttribute('title'), disabled: b.disabled })),
      cancel: all.filter(b => /Do not cast it|Cancel/i.test(b.innerText || '')).map(b => b.innerText.trim()),
      promptOnScreen: /choose a creature|target creature|press a card/i.test(text),
    };
  });
  console.log(JSON.stringify(seen, null, 2));

  if (seen.aimTitles.some(a => !a.disabled)) {
    const before = await gameState(page);
    await press(page, /^(Aim at |CAST AT )/);
    await sleep(2000);
    const after = await gameState(page);
    console.log(`PRESSED AN AIM CONTROL: hand ${before.hand}->${after.hand}, stack ${before.stack}->${after.stack}`);
    await page.screenshot({ path: `${OUT}/aimed.png` });
  }

  console.log('console errors ' + health.consoleErrors.length + ', page errors ' + health.pageErrors.length);
  await browser.close();
};

main();
