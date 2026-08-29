/**
 * Where is card art being cropped, and by what.
 *
 * Project law: card art is never cropped and never desaturated, and Scryfall's
 * own guidelines forbid modifying card images. `object-fit: cover` on a box
 * whose aspect is not 488/680 crops, so this finds every one and names the
 * element it is in, with a screenshot of each.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, openCard, closePreview } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const OUT = '.shots/crop-hunt';
mkdirSync(OUT, { recursive: true });

const survey = page =>
  page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      const cs = getComputedStyle(img);
      const natural = img.naturalWidth ? img.naturalWidth / img.naturalHeight : null;
      const rendered = r.width / r.height;
      const crops =
        natural !== null &&
        Math.abs(natural - rendered) > 0.03 &&
        (cs.objectFit === 'cover' || cs.objectFit === 'none');
      // Name the surface: walk up for a class that says where we are.
      let where = [];
      let node = img;
      for (let i = 0; i < 8 && node; i++) {
        const cls = (node.className || '').toString().trim().split(/\s+/).slice(0, 4).join(' ');
        const label = node.getAttribute?.('aria-label');
        if (label) where.push(`aria:${label}`);
        else if (cls) where.push(cls.slice(0, 60));
        node = node.parentElement;
      }
      out.push({
        src: (img.currentSrc || img.src).split('/').pop()?.slice(0, 44),
        alt: img.alt?.slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        x: Math.round(r.left),
        y: Math.round(r.top),
        natural: natural && +natural.toFixed(3),
        rendered: +rendered.toFixed(3),
        objectFit: cs.objectFit,
        filter: cs.filter,
        crops,
        where: where.slice(0, 4),
      });
    }
    return out;
  });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  const shots = [];
  const look = async label => {
    const rows = await survey(page);
    const bad = rows.filter(r => r.crops);
    console.log(`\n${label}: ${rows.length} images, ${bad.length} cropped`);
    for (const b of bad) {
      console.log(
        `  ${b.w}x${b.h} at ${b.x},${b.y} natural ${b.natural} rendered ${b.rendered} fit=${b.objectFit}`
      );
      console.log(`      ${b.where.join('  <  ')}`);
    }
    const filtered = rows.filter(r => /grayscale|saturate\(0|sepia/.test(r.filter));
    if (filtered.length) console.log(`  DESATURATED: ${filtered.map(f => f.filter).join(', ')}`);
    shots.push({ label, rows });
    if (bad[0]) {
      await page.screenshot({
        path: `${OUT}/${label}-cropped.png`,
        clip: {
          x: Math.max(0, bad[0].x - 20),
          y: Math.max(0, bad[0].y - 20),
          width: Math.min(600, bad[0].w + 40),
          height: Math.min(500, bad[0].h + 40),
        },
      });
    }
    await page.screenshot({ path: `${OUT}/${label}.png` });
  };

  await look('mat');

  const first = await page.evaluate(() =>
    [...document.querySelectorAll('[data-instance]')]
      .filter(el => el.getBoundingClientRect().width > 150)
      .map(el => el.getAttribute('data-instance'))[0]
  );
  if (first) {
    await openCard(page, first);
    await sleep(500);
    await look('preview');
    await closePreview(page);
  }

  // The hand, expanded.
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^Hand$/i.test((b.innerText || '').trim()))?.click();
  });
  await sleep(700);
  await look('hand');

  writeFileSync(`${OUT}/survey.json`, JSON.stringify(shots, null, 2));
  console.log(`\nerrors: ${errors.length}`);
  await browser.close();
})();
