/** How much of the seat step's "The table" box actually has anything in it. */
import { openHarness, sleep } from './uiLib.mjs';

const run = async () => {
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1800);

  const m = await page.evaluate(() => {
    /* The section whose heading is "The table". */
    const head = [...document.querySelectorAll('h2')].find(h => /^The table$/i.test(h.textContent.trim()));
    const box = head.closest('section').getBoundingClientRect();
    let right = box.left, bottom = box.top;
    for (const el of head.closest('section').querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const t = (el.textContent || '').trim();
      const isPaint = t.length > 0 || el.tagName === 'IMG' || el.tagName === 'SVG';
      if (!isPaint) continue;
      if (r.right > right) right = r.right;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    return {
      section: `${Math.round(box.width)}x${Math.round(box.height)}`,
      usedWidth: Math.round(right - box.left),
      widthFillPct: +(100 * (right - box.left) / box.width).toFixed(0),
      sectionHeight: Math.round(box.height),
    };
  });
  console.log(JSON.stringify(m));
  await browser.close();
};
run().catch(e => { console.error('FAILED', e); process.exit(1); });
