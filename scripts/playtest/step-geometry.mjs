/**
 * The three steps before the table: how much of the window each one uses, and
 * whether any picture on them is being cropped.
 *
 * Written because two of my own diagnoses about these screens were made from a
 * screenshot and one of them was wrong (the mode covers are 16:9 and the door
 * is cut to them, so nothing is cropped). This reads the boxes.
 */
import { openHarness, sleep } from './uiLib.mjs';
import fs from 'node:fs';

const MEASURE = () => {
  const vw = innerWidth, vh = innerHeight;
  /* Lowest painted pixel of anything with real substance: the honest answer to
     "does the page use the window's height". */
  let lowest = 0, rightMost = 0;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (r.bottom > lowest && r.bottom <= vh + 400) lowest = r.bottom;
    if (r.right > rightMost && r.right <= vw + 2) rightMost = r.right;
  }
  const imgs = [...document.querySelectorAll('img')].map(img => {
    const r = img.getBoundingClientRect();
    if (r.width < 40) return null;
    const cs = getComputedStyle(img);
    const natAR = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
    const boxAR = r.height ? r.width / r.height : null;
    return {
      src: (img.currentSrc || img.src).slice(-40),
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      fit: cs.objectFit,
      /* object-cover with a box ratio different from the source IS a crop. */
      croppedPct: cs.objectFit === 'cover' && natAR && boxAR
        ? +(100 * (1 - Math.min(natAR, boxAR) / Math.max(natAR, boxAR))).toFixed(1) : 0,
    };
  }).filter(Boolean);
  return { vw, vh, lowestPainted: Math.round(lowest), rightMostPainted: Math.round(rightMost),
    unusedBottomPx: Math.round(vh - Math.min(vh, lowest)), imgs };
};

const run = async () => {
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });
  fs.mkdirSync('.shots/steps', { recursive: true });
  const tag = process.env.TAG || 'before';
  const out = {};

  out.mode = await page.evaluate(MEASURE);
  await page.screenshot({ path: `.shots/steps/${tag}-1-mode.png` });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1800);
  out.deck = await page.evaluate(MEASURE);
  await page.screenshot({ path: `.shots/steps/${tag}-2-deck.png` });

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1800);
  out.seat = await page.evaluate(MEASURE);
  await page.screenshot({ path: `.shots/steps/${tag}-3-seat.png` });

  for (const [name, m] of Object.entries(out)) {
    console.log(`\n${name.toUpperCase()}  window ${m.vw}x${m.vh}`);
    console.log(`   painted to x=${m.rightMostPainted}, y=${m.lowestPainted}   DEAD BOTTOM ${m.unusedBottomPx}px (${(100*m.unusedBottomPx/m.vh).toFixed(0)}% of the window)`);
    for (const i of m.imgs) console.log(`   img ${i.box} from ${i.natural} fit=${i.fit} CROPPED ${i.croppedPct}%  ${i.src}`);
  }
  fs.writeFileSync(`.shots/steps/${tag}.json`, JSON.stringify(out, null, 2));
  await browser.close();
};
run().catch(e => { console.error('FAILED', e); process.exit(1); });
