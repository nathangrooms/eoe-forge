/**
 * Project law, checked on the running table rather than asserted.
 *
 *   no centred modal        no [role="dialog"], no Radix portal, nothing
 *                           fixed inset-0 that traps the screen
 *   no border hairline      no visible border on any element of any size
 *   card art untouched      nothing desaturated, nothing cropped by
 *                           object-fit against its own aspect
 *   one surface             the by-hand controls a mode gets, listed
 *
 * Every panel is OPENED first, because a dialog that only exists while a panel
 * is open is exactly the one a static grep would miss.
 *
 * ONE MEASUREMENT NOTE, learned the hard way. A tapped card is rotated with a
 * CSS transform, and `getBoundingClientRect` reports the TRANSFORMED box — a
 * 200x279 card comes back 279x200. Comparing that to the image's natural
 * aspect reports every tapped land as cropped, which is how an earlier pass
 * "found" five cropped cards that were rotated correctly and not cropped at
 * all. The hand fan rotates its cards a few degrees for the same reason. So
 * the aspect check reads the untransformed size off `offsetWidth`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, press, startGame, playTurns, openCard, closePreview, pressInPreview, previewPanel } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const OUT = '.shots/law-audit';
mkdirSync(OUT, { recursive: true });

const audit = page =>
  page.evaluate(() => {
    const modal = [
      ...document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-radix-portal], [data-radix-popper-content-wrapper]'
      ),
    ].map(el => ({ tag: el.tagName, role: el.getAttribute('role') }));

    // Anything fixed and covering the whole screen that also takes presses.
    const trapping = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.98 || r.height < innerHeight * 0.98) continue;
      if (cs.pointerEvents === 'none') continue;
      trapping.push((el.className || '').toString().slice(0, 90));
    }

    const borders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 6) continue;
      const cs = getComputedStyle(el);
      const widths = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs[`border${s}Width`]));
      if (!widths.some(v => v >= 1)) continue;
      const m = cs.borderTopColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const parts = m[1].split(',').map(Number);
      const alpha = parts.length > 3 ? parts[3] : 1;
      if (alpha < 0.06) continue;
      borders.push({
        cls: (el.className || '').toString().slice(0, 70),
        color: cs.borderTopColor,
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }

    const art = [];
    for (const img of document.querySelectorAll('img')) {
      if (img.offsetWidth < 40) continue;
      const cs = getComputedStyle(img);
      const natural = img.naturalWidth ? img.naturalWidth / img.naturalHeight : null;
      // Untransformed. See the header: a rotated card's client rect lies.
      const rendered = img.offsetWidth / img.offsetHeight;
      art.push({
        w: img.offsetWidth,
        h: img.offsetHeight,
        natural: natural && +natural.toFixed(3),
        rendered: +rendered.toFixed(3),
        fit: cs.objectFit,
        filter: cs.filter,
      });
    }
    const cropped = art.filter(
      a => a.natural && Math.abs(a.natural - a.rendered) > 0.03 && a.fit === 'cover'
    );
    const filtered = art.filter(a => /grayscale|sepia|saturate\(0/.test(a.filter));

    return { modal, trapping, borders: borders.slice(0, 12), borderCount: borders.length, art: art.length, cropped, filtered };
  });

const report = {};
const look = async (page, label) => {
  const r = await audit(page);
  report[label] = r;
  console.log(
    `  ${label.padEnd(22)} dialogs ${r.modal.length}, screen-covering ${r.trapping.length}, ` +
      `borders ${r.borderCount}, images ${r.art}, cropped ${r.cropped.length}, desaturated ${r.filtered.length}`
  );
  for (const m of r.modal.slice(0, 3)) console.log(`      MODAL ${m.tag} role=${m.role}`);
  for (const t of r.trapping.slice(0, 3)) console.log(`      COVERS THE SCREEN ${t}`);
  for (const b of r.borders.slice(0, 4)) console.log(`      BORDER ${b.size} ${b.color} ${b.cls}`);
  for (const c of r.cropped.slice(0, 4)) console.log(`      CROPPED ${c.w}x${c.h} natural ${c.natural} rendered ${c.rendered}`);
  for (const f of r.filtered.slice(0, 3)) console.log(`      FILTER ${f.filter}`);
  await page.screenshot({ path: `${OUT}/${label}.png` });
};

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 6, s => console.log(s));

  console.log('\nPROJECT LAW, ON THE RUNNING TABLE');
  await look(page, 'board');

  const first = await page.evaluate(sel => {
    const panel = document.querySelector(sel);
    return [...document.querySelectorAll('[data-instance]')]
      .filter(el => (!panel || !panel.contains(el)) && el.offsetWidth > 150 &&
        el.getBoundingClientRect().bottom < innerHeight * 0.8)
      .map(el => el.getAttribute('data-instance'))[0];
  }, previewPanel);

  await openCard(page, first);
  await sleep(600);
  await look(page, 'card-preview');
  // Every disclosure open, so nothing hides behind one.
  await pressInPreview(page, '^More counters$');
  await pressInPreview(page, '^Keywords$');
  await pressInPreview(page, '^15 more$');
  await pressInPreview(page, 'Write a marker');
  await pressInPreview(page, '^Another token$');
  await sleep(600);
  await look(page, 'card-preview-open');
  await closePreview(page);

  await press(page, /^LIBRARY/);
  await sleep(700);
  await look(page, 'zone-panel');
  await page.evaluate(() => document.querySelector('[aria-label="Close the zone"]')?.click());
  await sleep(400);

  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find(x => /^\d+\s*\n?\s*LIFE$/i.test((x.innerText || '').trim()))
      ?.click();
  });
  await sleep(700);
  await look(page, 'seat-panel');
  // The two new sections, pressed.
  const manaBefore = await page.evaluate(() => document.body.innerText.match(/(\d+) floating/)?.[1] ?? '0');
  for (const sym of ['{R}', '{G}', '{C}']) {
    await page.evaluate(s => {
      [...document.querySelectorAll('button')]
        .find(b => (b.innerText || '').trim().startsWith(s))
        ?.click();
    }, sym);
    await sleep(400);
  }
  await sleep(500);
  const manaAfter = await page.evaluate(() => document.body.innerText.match(/(\d+) floating/)?.[1] ?? '0');
  const poolPips = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label$="floating mana"]')][0];
    return el ? (el.getAttribute('aria-label') || '') : null;
  });
  console.log(`\n  mana by hand: "${manaBefore} floating" -> "${manaAfter} floating"; seat band says ${JSON.stringify(poolPips)}`);
  await page.screenshot({ path: `${OUT}/mana-pool.png` });

  const untapped = await page.evaluate(() => document.body.innerText.match(/(\d+) untapped/)?.[1] ?? null);
  const pressedUntap = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      x => (x.innerText || '').trim() === 'Untap everything'
    );
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(700);
  const tappedNow = await page.evaluate(
    () => [...document.querySelectorAll('[data-tapped="true"]')].length
  );
  console.log(`  untap everything: control present ${pressedUntap}, tapped permanents after: ${tappedNow} (untapped sources read ${untapped})`);
  await page.screenshot({ path: `${OUT}/untap.png` });
  await look(page, 'seat-panel-after');

  console.log(`\nconsole and page errors: ${errors.length}`);
  for (const e of errors.slice(0, 8)) console.log('  ' + e);
  writeFileSync(`${OUT}/law.json`, JSON.stringify({ report, errors }, null, 2));
  await browser.close();
})();
