/**
 * Can a player READ the mat, and what is drawn on top of the card art?
 *
 * Two questions, both answered by measurement rather than by looking:
 *
 *  1. Every piece of text painted on a seat mat, with its computed colour and
 *     the mat luminance behind it, expressed as a WCAG contrast ratio. A zone
 *     name nobody can read is a label that failed, and "looks faint" is not a
 *     number anybody can act on.
 *  2. Every control drawn ON a card, as a share of that card's area, because a
 *     chip that covers a quarter of a permanent is why a board cannot be read.
 */
import { openHarness, sleep, startGame, advanceTo, gameState } from './uiLib.mjs';
import fs from 'node:fs';

const PROBE = () => {
  const srgb = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };

  const mats = [...document.querySelectorAll('[aria-label$=" seat"], [aria-label="Your seat"]')];
  /* The mat's own painted ground, sampled from the element that carries it. */
  const matGround = mats.length ? parse(getComputedStyle(mats[0]).backgroundColor) : [20, 20, 20];

  const texts = [];
  for (const mat of mats) {
    for (const el of mat.querySelectorAll('*')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 30) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      const fg = parse(cs.color);
      const alpha = cs.color.startsWith('rgba') ? Number((cs.color.match(/[\d.]+/g) || [])[3] ?? 1) : 1;
      /* Composite the text colour over the mat, so an alpha'd label is judged
         as it is actually painted rather than as it is written. */
      const eff = fg.map((c, i) => c * alpha + matGround[i] * (1 - alpha));
      texts.push({
        text: t.slice(0, 26), font: cs.fontSize, weight: cs.fontWeight,
        alpha: +alpha.toFixed(2), contrast: ratio(eff, matGround),
      });
    }
  }
  /* One row per distinct string, so the report is the vocabulary of the mat. */
  const seen = new Map();
  for (const t of texts) if (!seen.has(t.text)) seen.set(t.text, t);

  const chips = [];
  for (const card of document.querySelectorAll('[data-instance]')) {
    const cb = card.getBoundingClientRect();
    if (cb.width < 40) continue;
    for (const el of card.querySelectorAll('button')) {
      const b = el.getBoundingClientRect();
      if (b.width < 8) continue;
      const label = el.getAttribute('title') || el.getAttribute('aria-label') || '';
      /* How much of the chip actually lies over the card face. */
      const ox = Math.max(0, Math.min(b.right, cb.right) - Math.max(b.left, cb.left));
      const oy = Math.max(0, Math.min(b.bottom, cb.bottom) - Math.max(b.top, cb.top));
      chips.push({
        label: label.slice(0, 26),
        chip: `${Math.round(b.width)}x${Math.round(b.height)}`,
        card: `${Math.round(cb.width)}x${Math.round(cb.height)}`,
        pctOfCardArea: +(100 * (ox * oy) / (cb.width * cb.height)).toFixed(1),
      });
    }
  }
  const chipSeen = new Map();
  for (const c of chips) { const k = c.label.replace(/\s+\S+$/, ''); if (!chipSeen.has(k)) chipSeen.set(k, c); }

  return { texts: [...seen.values()].sort((a, b) => a.contrast - b.contrast), chips: [...chipSeen.values()] };
};

const run = async () => {
  const { browser, page } = await openHarness({ width: 1600, height: 1000 });
  await startGame(page);
  await advanceTo(page, Number(process.env.TURN || 8));
  await sleep(1000);
  const g = await gameState(page);
  const m = await page.evaluate(PROBE);
  const tag = process.env.TAG || 'before';
  fs.mkdirSync('.shots/legibility', { recursive: true });
  await page.screenshot({ path: `.shots/legibility/${tag}.png` });

  console.log(`game ${JSON.stringify(g)}`);
  console.log('\nTEXT ON THE MAT, worst contrast first (WCAG needs 4.5 for body, 3.0 for large)');
  for (const t of m.texts.slice(0, 22)) {
    const verdict = t.contrast < 3 ? 'FAILS' : t.contrast < 4.5 ? 'large only' : 'ok';
    console.log(`   ${String(t.contrast).padStart(6)}:1  ${t.font.padStart(5)} w${t.weight}  a${t.alpha}  ${verdict.padEnd(10)} "${t.text}"`);
  }
  console.log('\nCONTROLS DRAWN ON A CARD');
  for (const c of m.chips) console.log(`   ${String(c.pctOfCardArea).padStart(5)}% of the card  chip ${c.chip} on card ${c.card}  "${c.label}"`);
  fs.writeFileSync(`.shots/legibility/${tag}.json`, JSON.stringify(m, null, 2));
  await browser.close();
};
run().catch(e => { console.error('FAILED', e); process.exit(1); });
