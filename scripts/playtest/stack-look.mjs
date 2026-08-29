/**
 * WHAT IS ACTUALLY DRAWN IN THE STACK SLOT.
 *
 * The owner reported a card on the stack as "an empty grey box with its name in
 * small text". A later pass called that mid-load. A screenshot on 29 Aug 2026
 * still shows a flat rectangle. This settles it by reading the slot's DOM at
 * the moment the stack is populated, and again a second later, rather than by
 * reading a still.
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const OUT = '.shots/stack-look';

const READ = page => page.evaluate(() => {
  const strip = document.querySelector('[aria-label="The stack"]');
  if (!strip) return { strip: false };
  const r = strip.getBoundingClientRect();
  const imgs = [...strip.querySelectorAll('img')].map(i => ({
    src: (i.currentSrc || i.src || '').slice(-70),
    w: Math.round(i.getBoundingClientRect().width),
    complete: i.complete, nat: i.naturalWidth,
    opacity: getComputedStyle(i).opacity,
  }));
  const svgs = strip.querySelectorAll('svg').length;
  const g = window.__dmGame;
  const top = g && g.stack.length ? g.stack[g.stack.length - 1] : null;
  const card = top ? g.cards[top.cardInstanceId ?? top.sourceInstanceId ?? ''] : null;
  return {
    strip: true,
    box: { w: Math.round(r.width), h: Math.round(r.height) },
    imgs, svgs,
    text: (strip.innerText || '').replace(/\n/g, ' | ').slice(0, 160),
    topObject: top ? { name: top.name, cardInstanceId: top.cardInstanceId, sourceInstanceId: top.sourceInstanceId } : null,
    cardFound: !!card,
    imageUrl: card ? (card.imageUrl || null) : null,
  };
});

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1200);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);
  await pressText(page, /^Keep$/);
  await sleep(2000);

  let hits = 0;
  for (let i = 0; i < 400 && hits < 4; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.stack > 0) {
      const now = await READ(page);
      if (now.strip) {
        await page.screenshot({ path: `${OUT}/${hits}-immediate.png` });
        console.log(`\n--- HIT ${hits} immediate ---`);
        console.log(JSON.stringify(now, null, 2));
        await sleep(2500);
        const later = await READ(page);
        await page.screenshot({ path: `${OUT}/${hits}-after-2500ms.png` });
        console.log(`--- HIT ${hits} after 2500ms ---`);
        console.log(JSON.stringify(later, null, 2));
        hits++;
      }
    }
    await unblock(page);
    await sleep(200);
  }
  if (!hits) console.log('the stack was never seen populated in this run');
  await browser.close();
};

run().catch(e => { console.error('FAILED', e); process.exit(1); });
