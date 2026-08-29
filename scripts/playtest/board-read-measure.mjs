/**
 * Can a person read the board? Measured in pixels, not opinions.
 *
 * Four things at once, because they all need the same driven game:
 *   1. how large power and toughness actually render, on the mat and in the
 *      preview, and how much of each box a neighbour covers;
 *   2. whether any card art is cropped or desaturated (Scryfall forbids
 *      modifying card images, and project law says never a cropped card);
 *   3. whether anything on the play surface is a centred modal, or draws a
 *      border hairline;
 *   4. the contrast of every control, because a control drawn as low-contrast
 *      text reads as a caption and does not get pressed.
 *
 *   node scripts/playtest/board-read-measure.mjs --base http://localhost:8081
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, sleep, startGame, playTurns, openCard, closePreview, previewPanel } from './table.mjs';

const base = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8081';
const OUT = '.shots/board-read';
mkdirSync(OUT, { recursive: true });

(async () => {
  const { browser, page, errors } = await launch({ width: 1600, height: 1000 });
  await startGame(page, { base, mode: 'GOLDFISH' });
  await playTurns(page, 7, s => console.log(s));
  await page.screenshot({ path: `${OUT}/00-board.png` });

  /* ---- 1. power and toughness, and what covers it ---- */
  const stats = await page.evaluate(() => {
    const isPT = t => /^\d+\s*\/\s*\d+$/.test(t.trim());
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const text = (el.innerText || '').trim();
      if (!isPT(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6) continue;
      const cs = getComputedStyle(el);
      const host = el.closest('[data-instance]');
      // How much of the box is on top: sample a grid and ask the document.
      let seen = 0;
      let total = 0;
      for (let x = r.left + 2; x < r.right - 2; x += 3) {
        for (let y = r.top + 2; y < r.bottom - 2; y += 3) {
          total++;
          const top = document.elementFromPoint(x, y);
          if (top && (top === el || el.contains(top) || top.contains(el))) seen++;
        }
      }
      out.push({
        text,
        card: host?.getAttribute('data-instance') || null,
        cardWidth: host ? Math.round(host.getBoundingClientRect().width) : null,
        fontPx: Math.round(parseFloat(cs.fontSize)),
        boxW: Math.round(r.width),
        boxH: Math.round(r.height),
        visible: total ? Math.round((seen / total) * 100) : 0,
      });
    }
    return out;
  });
  console.log('\nPOWER AND TOUGHNESS ON THE MAT');
  for (const s of stats) {
    console.log(
      `  ${s.text.padEnd(6)} ${String(s.fontPx).padStart(3)}px in ${s.boxW}x${s.boxH} on a ${s.cardWidth}px card, ${s.visible}% visible`
    );
  }
  const fully = stats.filter(s => s.visible >= 99).length;
  console.log(`  ${fully} of ${stats.length} stat boxes fully visible`);

  /* ---- 2. card art: cropped or desaturated ---- */
  const art = await page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      if (r.width < 40) continue;
      const cs = getComputedStyle(img);
      const parent = img.parentElement;
      const pcs = parent ? getComputedStyle(parent) : null;
      out.push({
        src: (img.currentSrc || img.src || '').split('/').pop()?.slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
        natural: img.naturalWidth ? +(img.naturalWidth / img.naturalHeight).toFixed(3) : null,
        rendered: +(r.width / r.height).toFixed(3),
        objectFit: cs.objectFit,
        filter: cs.filter,
        parentOverflow: pcs?.overflow,
      });
    }
    return out;
  });
  const cropped = art.filter(
    a => a.natural && Math.abs(a.natural - a.rendered) > 0.04 && a.objectFit === 'cover'
  );
  const filtered = art.filter(a => a.filter && a.filter !== 'none' && /grayscale|saturate/.test(a.filter));
  console.log(`\nCARD ART: ${art.length} images, ${cropped.length} cropped by object-fit:cover, ${filtered.length} desaturated`);
  for (const c of cropped.slice(0, 6)) console.log(`  CROPPED ${c.src} natural ${c.natural} rendered ${c.rendered}`);
  for (const f of filtered.slice(0, 6)) console.log(`  FILTER  ${f.src} ${f.filter}`);

  /* ---- 3. modals and borders ---- */
  const chrome = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-radix-portal], [data-state="open"][data-side]')]
      .map(el => ({ tag: el.tagName, role: el.getAttribute('role'), cls: (el.className || '').toString().slice(0, 80) }));
    const borders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 8) continue;
      const cs = getComputedStyle(el);
      const w = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs[`border${s}Width`]));
      if (!w.some(v => v >= 1)) continue;
      const col = cs.borderTopColor;
      const m = col.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const parts = m[1].split(',').map(s => parseFloat(s));
      const alpha = parts.length > 3 ? parts[3] : 1;
      if (alpha < 0.06) continue;
      borders.push({
        cls: (el.className || '').toString().slice(0, 70),
        color: col,
        w: w.join('/'),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }
    return { modal, borders: borders.slice(0, 20), borderCount: borders.length };
  });
  console.log(`\nCHROME: ${chrome.modal.length} dialog/portal nodes, ${chrome.borderCount} visible borders`);
  for (const m of chrome.modal.slice(0, 6)) console.log(`  MODAL ${m.tag} role=${m.role} ${m.cls}`);
  for (const b of chrome.borders.slice(0, 10)) console.log(`  BORDER ${b.size} ${b.color} ${b.w}  ${b.cls}`);

  /* ---- 4. control contrast in the by-hand panel ---- */
  const board = await page.evaluate(sel => {
    const panel = document.querySelector(sel);
    const cards = [...document.querySelectorAll('[data-instance]')].filter(
      el => (!panel || !panel.contains(el)) && el.getBoundingClientRect().width > 150
    );
    return cards.map(el => el.getAttribute('data-instance'));
  }, previewPanel);
  if (board[0]) {
    await openCard(page, board[0]);
    await sleep(600);
    await page.screenshot({ path: `${OUT}/01-preview.png` });
    const contrast = await page.evaluate(sel => {
      const lum = c => {
        const [r, g, b] = c;
        const f = v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const panel = document.querySelector(sel);
      if (!panel) return [];
      const bg = parse(getComputedStyle(document.body).backgroundColor);
      return [...panel.querySelectorAll('button')].map(b => {
        const cs = getComputedStyle(b);
        const fg = parse(cs.color);
        // Walk up for the nearest painted background.
        let node = b;
        let back = null;
        while (node && node !== document.body) {
          const c = getComputedStyle(node).backgroundColor;
          const p = parse(c);
          const alpha = (c.match(/[\d.]+/g) || [])[3];
          if (p.length === 3 && (alpha === undefined || +alpha > 0.5)) { back = p; break; }
          node = node.parentElement;
        }
        back = back || bg;
        const l1 = lum(fg);
        const l2 = lum(back);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return {
          label: (b.innerText || '').trim().slice(0, 30),
          fontPx: Math.round(parseFloat(cs.fontSize)),
          hasChip: cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
          contrast: +ratio.toFixed(2),
        };
      });
    }, previewPanel);
    console.log('\nBY-HAND CONTROLS: contrast and whether they look like a control');
    for (const c of contrast) {
      const flag = c.contrast < 4.5 ? ' LOW' : '';
      console.log(`  ${c.contrast.toFixed(2).padStart(5)}:1 ${c.fontPx}px ${c.hasChip ? 'chip ' : 'TEXT '} ${c.label}${flag}`);
    }
    writeFileSync(`${OUT}/controls.json`, JSON.stringify(contrast, null, 2));

    const pt = await page.evaluate(sel => {
      const panel = document.querySelector(sel);
      const el = [...panel.querySelectorAll('*')].find(
        x => !x.children.length && /^\d+\s*\/\s*\d+$/.test((x.innerText || '').trim())
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        text: el.innerText.trim(),
        fontPx: Math.round(parseFloat(getComputedStyle(el).fontSize)),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      };
    }, previewPanel);
    console.log(`\nPOWER AND TOUGHNESS IN THE PREVIEW: ${JSON.stringify(pt)}`);
    await closePreview(page);
  }

  writeFileSync(`${OUT}/measure.json`, JSON.stringify({ stats, art, chrome }, null, 2));
  console.log(`\nerrors: ${errors.length}`);
  for (const e of errors.slice(0, 6)) console.log('  ' + e);
  await browser.close();
})();
