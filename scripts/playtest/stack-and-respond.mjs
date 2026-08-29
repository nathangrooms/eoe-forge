/**
 * TWO QUESTIONS ABOUT THE STACK, ANSWERED BY WATCHING IT.
 *
 * 1. When a spell is on the stack and priority is MINE, is there a control?
 *    An earlier probe answered "no" from a frame where the bot still held
 *    priority, which is the rules working rather than a missing button. This
 *    one waits for `priorityPlayerId === 'p1'` before it looks.
 *
 * 2. Does the top of the stack paint the card's art? It has been called a grey
 *    placeholder once (wrong: the strip had no img at all, which was a
 *    different bug) and a mid-load image once. This samples the element over
 *    several seconds so a slow load and an absent image cannot be confused.
 *
 *   BASE=http://127.0.0.1:8080 node scripts/playtest/stack-and-respond.mjs
 */
import fs from 'node:fs';
import { openHarness, sleep, unblock } from './uiLib.mjs';

const OUT = '.shots/stack';

const press = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('button')].find(b =>
    !b.disabled && (rx.test((b.innerText || '').trim()) || rx.test(b.getAttribute('title') || ''))
  );
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const full = page => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  return {
    turn: g.turn, step: g.step, status: g.status,
    active: g.activePlayerId, priority: g.priorityPlayerId,
    stack: (g.stack || []).length,
    top: g.stack?.length ? g.stack[g.stack.length - 1].name : null,
  };
});

/** Everything painted inside the stack strip. */
const stackArt = page => page.evaluate(() => {
  const head = [...document.querySelectorAll('*')].find(
    el => el.children.length === 0 && /^the stack$/i.test((el.textContent || '').trim())
  );
  if (!head) return { strip: false };
  let strip = head;
  for (let i = 0; i < 6 && strip.parentElement; i++) {
    strip = strip.parentElement;
    if (strip.querySelectorAll('img').length > 0) break;
  }
  const imgs = [...strip.querySelectorAll('img')].map(img => ({
    src: (img.currentSrc || img.src || '').slice(-52),
    complete: img.complete,
    natural: `${img.naturalWidth}x${img.naturalHeight}`,
    box: `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}`,
  }));
  return { strip: true, imgCount: imgs.length, imgs };
});

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, health } = await openHarness({ width: 1600, height: 1000 });

  await press(page, /VERSUS BOTS/);
  await sleep(1500);
  await press(page, /seeded|Use this deck|Choose/);
  await sleep(1200);
  await press(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3000);
  await press(page, /keep this hand/);
  await sleep(2500);
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => /Put \d+ card/i.test(document.body.innerText || '')))) break;
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')]
        .find(b => /Click to preview/i.test(b.getAttribute('aria-label') || ''));
      if (el) el.click();
    });
    await sleep(800);
    await press(page, /put .* back|start the game/);
    await sleep(1500);
  }

  const sightings = [];
  let withPriority = null, artSample = null;

  for (let i = 0; i < 700 && !(withPriority && artSample); i++) {
    const g = await full(page);
    if (!g || g.status === 'complete') break;

    if (g.stack > 0) {
      const art = await stackArt(page);
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .filter(b => !b.disabled)
          .map(b => (b.innerText || '').trim())
          .filter(t => /^(respond|let it resolve|pass|hold)/i.test(t))
      );
      sightings.push({ turn: g.turn, step: g.step, priority: g.priority, top: g.top, controls, art });

      if (!artSample && art.imgCount > 0) {
        /* Sample the same element for three seconds. A card that is still
           loading fills in; a card that never had a source does not. */
        const samples = [art];
        for (let k = 0; k < 6; k++) { await sleep(500); samples.push(await stackArt(page)); }
        artSample = samples;
        await page.screenshot({ path: `${OUT}/stack-art.png` });
      }

      if (!withPriority && g.priority === 'p1') {
        withPriority = { ...g, controls };
        await page.screenshot({ path: `${OUT}/my-priority.png` });
      }
      if (g.priority === 'p1') { await sleep(400); continue; }
    }

    await unblock(page);
    await sleep(220);
  }

  console.log('SIGHTINGS OF A NON-EMPTY STACK: ' + sightings.length);
  const mine = sightings.filter(s => s.priority === 'p1');
  console.log('  of those, priority was mine: ' + mine.length);
  console.log('  with a responding control:   ' + mine.filter(s => s.controls.length > 0).length);
  console.log('\nFIRST FRAME WHERE PRIORITY WAS MINE:');
  console.log(JSON.stringify(withPriority, null, 2));
  console.log('\nTHE TOP OF THE STACK, SAMPLED OVER 3 SECONDS:');
  console.log(JSON.stringify(artSample, null, 2));
  console.log('\nno-image sightings: ' +
    sightings.filter(s => s.art.strip && s.art.imgCount === 0).length + ' of ' + sightings.length);
  console.log('console errors ' + health.consoleErrors.length + ', page errors ' + health.pageErrors.length);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ sightings, withPriority, artSample }, null, 2));
  await browser.close();
};

main();
