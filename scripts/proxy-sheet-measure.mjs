/**
 * Measure the printed sheet in millimetres.
 *
 *   npm run dev                     # or any Vite server
 *   BASE=http://127.0.0.1:8080 node scripts/proxy-sheet-measure.mjs
 *
 * The proxy sheet is the product. A card that comes out 61 mm wide does not go
 * in a sleeve next to a real card, and nobody finds out until the ink is spent,
 * so the size is not something to assert in a comment. This drives the shipped
 * `ProxySheet` in a real browser under print emulation, reads the boxes the
 * layout engine actually produced, converts them back to millimetres, and
 * fails on anything off by more than a tenth of a millimetre.
 *
 * WHAT IS REAL HERE
 * -----------------
 * Everything on the sheet. The card rows, ids, layouts and art all come out of
 * the live `cards` table through the anon key in ONE batched request, which is
 * the same path the app uses. The component, the stylesheet and the geometry
 * are the shipped ones. The only invented card is a deliberately imageless one,
 * which exists to exercise the text fallback and could not be fetched because
 * no such printing exists.
 *
 * The PDF at the end is a real print job out of Chrome's own pipeline with
 * `preferCSSPageSize`, so the page size in the file is the size the printer is
 * asked for, not the size the stylesheet hoped for.
 *
 * The harness files are written per run and gitignored, like every other one.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/proxy-sheet';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
fs.mkdirSync(OUT, { recursive: true });

const MM_PX = 96 / 25.4; // CSS fixes 1in = 96px
const MM_PT = 72 / 25.4; // PostScript fixes 1in = 72pt
const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;

let failures = 0;
const log = (...a) => console.log(...a);

/** Every size check is stated in millimetres, because that is what matters. */
const mm = (label, actualPx, expectedMm, tolMm = 0.1) => {
  const actualMm = actualPx / MM_PX;
  const ok = Math.abs(actualMm - expectedMm) <= tolMm;
  if (!ok) failures++;
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${r3(actualMm)} mm (want ${expectedMm} +/-${tolMm})`);
};

const is = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (want ${JSON.stringify(expected)})`}`);
};

const ok = (label, condition, detail = '') => {
  if (!condition) failures++;
  log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

const HARNESS_HTML = 'proxy-sheet-harness.html';
const HARNESS_ENTRY = 'src/dev/__proxySheetHarness.tsx';

/*
 * Rewriting an identical file still moves its mtime, and Vite answers a change
 * under `src/` with a full page reload that lands seconds later, in the middle
 * of the run, destroying whichever page the script was reading.
 */
const writeIfChanged = (file, body) => {
  let current = null;
  try { current = fs.readFileSync(file, 'utf8'); } catch {}
  if (current === body) return;
  fs.writeFileSync(file, body);
  log(`  wrote ${file}`);
};

fs.mkdirSync('src/dev', { recursive: true });

writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Proxy sheet measurement harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

writeIfChanged(
  HARNESS_ENTRY,
  `/* Written by scripts/proxy-sheet-measure.mjs. Gitignored, never shipped. */
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import '../index.css';
import { supabase } from '@/integrations/supabase/client';
import { ProxySheet } from '@/components/deck-builder/ProxySheet';
import { buildProxySlots, isolateForPrint } from '@/components/deck-builder/proxy-print';

/*
 * One batched request for every card on the sheet. Nine ids, one round trip.
 * Picked to cover every decision the sheet makes about faces:
 *   transform  -> two slots        modal of the two-sided group
 *   split      -> one slot         two faces, one physical card
 *   adventure  -> one slot         two faces, one physical card
 *   prepare    -> one slot         two faces, one physical card
 *   meld       -> one slot         the melded result is its own row
 *   normal     -> one slot each, and a borderless printing among them so the
 *                 crop marks can be checked against art that runs to the edge
 */
const IDS = [
  '11bf83bb-c95b-4b4f-9a56-ce7a1816307a', // Delver of Secrets, isd 51, transform
  'f98f4538-5b5b-475d-b98f-49d01dae6f04', // Fire // Ice, apc 128, split
  'ff984a4c-1818-4f8f-a9d7-fce57e77937d', // Bonecrusher Giant // Stomp, eld 291, adventure
  '3ba971e7-0b7a-4750-896f-7cf063e66b2a', // Blazing Firesinger // Seething Song, sos 109, prepare
  '5a7a212e-e0b6-4f12-a95c-173cae023f93', // Brisela, Voice of Nightmares, emn 15b, meld result
  'f29ba16f-c8fb-42fe-aabf-87089cb214a7', // Lightning Bolt, 2x2 117
  'c8c8390f-4072-454f-8dc4-174919187a47', // Lightning Bolt, 2x2 361, borderless
  '4cbc6901-6a4a-4d0a-83ea-7eefa3b35021', // Sol Ring, c21 263
  '4a706ecf-3277-40e3-871c-4ba4ead16e20', // Wrenn and Six, mh1 217
];

/* The only card that is not real. No printing has no image, so the text
   fallback cannot be exercised with a row from the catalogue. */
const IMAGELESS = {
  id: 'no-such-printing',
  name: 'Nothing To Print Here',
  layout: 'normal',
  mana_cost: '{2}{U}{U}',
  type_line: 'Legendary Creature — Test',
  power: '4',
  toughness: '5',
  oracle_text: 'Flying, vigilance.\\nWhenever this creature attacks, draw a card.',
  quantity: 1,
};

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<any[] | null>(null);
  const [paper, setPaper] = useState<'a4' | 'letter'>('a4');
  const [quality, setQuality] = useState<'normal' | 'large' | 'png'>('large');
  const [guides, setGuides] = useState(true);

  useEffect(() => {
    (window as any).__setPaper = (p: any) => setPaper(p);
    (window as any).__setQuality = (q: any) => setQuality(q);
    (window as any).__setGuides = (g: any) => setGuides(g);
    (window as any).__isolate = () => { (window as any).__restore = isolateForPrint(ref.current); };
    (window as any).__restoreAll = () => (window as any).__restore?.();
  }, []);

  useEffect(() => {
    supabase
      .from('cards')
      .select('id,name,image_uris,faces,layout,set_code,collector_number,mana_cost,type_line,oracle_text,power,toughness')
      .in('id', IDS)
      .then(({ data, error }) => {
        if (error) { (window as any).__error = error.message; return; }
        const byId = new Map((data ?? []).map((r: any) => [r.id, r]));
        const ordered = IDS.map(id => byId.get(id)).filter(Boolean) as any[];
        /* Three copies of one Bolt, so quantity expansion is on the sheet too. */
        const withQty = ordered.map(c => ({ ...c, quantity: c.id === 'f29ba16f-c8fb-42fe-aabf-87089cb214a7' ? 3 : 1 }));
        setCards([...withQty, IMAGELESS]);
        (window as any).__fetched = ordered.map((c: any) => ({ id: c.id, name: c.name, layout: c.layout, set: c.set_code, cn: c.collector_number }));
      });
  }, []);

  const slots = cards ? buildProxySlots(cards, quality) : [];
  (window as any).__slots = slots.map(s => ({
    key: s.key, name: s.card?.name, layout: s.card?.layout, face: s.faceIndex, img: s.imageUrl, label: s.faceLabel,
  }));
  (window as any).__ready = cards !== null;

  if (!cards) return <div id="loading">loading</div>;

  /* Nested the way the real page is: siblings that must vanish for print, and
     ancestors with overflow, a fixed height and a transform that would clip or
     rescale the sheet if isolateForPrint did not neutralise them. */
  return (
    <div style={{ display: 'flex' }}>
      <aside id="fake-sidebar" style={{ width: 240, height: '100vh', background: '#111' }}>sidebar</aside>
      <main style={{ flex: 1, height: '100vh', overflow: 'auto', padding: 24, background: '#191919' }}>
        <header id="fake-header" style={{ height: 80, background: '#222' }}>header</header>
        <div style={{ maxHeight: 600, overflow: 'hidden', transform: 'translateZ(0)' }}>
          <ProxySheet ref={ref} slots={slots} paper={paper} cutGuides={guides} />
        </div>
        <footer id="fake-footer" style={{ height: 200, background: '#222' }}>footer</footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
`
);

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
page.on('pageerror', e => { failures++; log('  [pageerror]', e.message); });
page.on('console', m => { if (m.type() === 'error') log('  [console]', m.text()); });

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
await page.waitForSelector('.proxy-slot img', { timeout: 60000 });
const decodeAll = () =>
  page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll('.proxy-slot img')].map(i => i.decode().catch(() => {})));
  });
await decodeAll();

/* ---------- what actually came out of the catalogue ---------- */
log('\n=== CARDS ON THE SHEET, LIVE FROM `cards` ===');
const fetched = await page.evaluate(() => window.__fetched);
for (const c of fetched) log(`  ${c.layout.padEnd(10)} ${c.set}/${c.cn}  ${c.name}`);
is('rows returned by the one batched request', fetched.length, 9);

/* ---------- faces: what gets one slot and what gets two ---------- */
log('\n=== FACES ===');
const slots = await page.evaluate(() => window.__slots);
const byName = name => slots.filter(s => (s.name ?? '').startsWith(name));
is('total slots (9 rows, one at quantity 3, one transform doubled, one imageless)', slots.length, 13);
is('transform prints front and back', byName('Delver').length, 2);
ok(
  'the back is its own art, not the front again',
  byName('Delver')[1].img !== byName('Delver')[0].img && byName('Delver')[1].img.includes('/back/'),
  byName('Delver')[1].img
);
is('back face is labelled for the preview only', byName('Delver')[1].label, 'Back');
is('split card is ONE card', byName('Fire // Ice').length, 1);
is('adventure is ONE card', byName('Bonecrusher').length, 1);
is('prepare is ONE card', byName('Blazing Firesinger').length, 1);
is('meld result is ONE card', byName('Brisela').length, 1);
is('quantity 3 becomes three cards', slots.filter(s => s.name === 'Lightning Bolt' && s.img?.includes('f29ba16f')).length, 3);
ok('no slot has a blank where art should be, except the invented imageless card',
  slots.filter(s => !s.img).length === 1 && slots.find(s => !s.img).name === 'Nothing To Print Here');

/* ---------- the art itself ---------- */
log('\n=== ART: RESOLUTION AND RATIO ===');
for (const q of ['normal', 'large', 'png']) {
  await page.evaluate(quality => window.__setQuality(quality), q);
  await new Promise(r => setTimeout(r, 400));
  await decodeAll();
  const shot = await page.evaluate(() => {
    const img = document.querySelector('.proxy-slot img');
    const s = img.closest('.proxy-slot').getBoundingClientRect();
    const i = img.getBoundingClientRect();
    return {
      nw: img.naturalWidth, nh: img.naturalHeight, src: img.currentSrc,
      iw: i.width, ih: i.height, sw: s.width, sh: s.height,
      fit: getComputedStyle(img).objectFit,
    };
  });
  const assetRatio = shot.nw / shot.nh;
  const cardRatio = 63 / 88;
  const anis = (assetRatio / cardRatio - 1) * 100;
  const dpi = Math.round(shot.nw / (63 / 25.4));
  log(`  ${q.padEnd(6)} ${shot.nw}x${shot.nh}  ratio ${r3(assetRatio * 1000) / 1000}  card ratio ${r3(cardRatio * 1000) / 1000}  off by ${anis.toFixed(3)}%  ${dpi} dpi`);
  ok(`${q}: the drawn image is the whole card, no crop and no letterbox`,
    Math.abs(shot.iw - shot.sw) < 0.5 && Math.abs(shot.ih - shot.sh) < 0.5,
    `${r2(shot.iw)}x${r2(shot.ih)} in a ${r2(shot.sw)}x${r2(shot.sh)} slot`);
  ok(`${q}: the scan is within 0.3% of true card proportions`, Math.abs(anis) < 0.3, `${anis.toFixed(3)}%`);
}
await page.evaluate(() => window.__setQuality('large'));
await new Promise(r => setTimeout(r, 400));
await decodeAll();
const fit = await page.evaluate(() => getComputedStyle(document.querySelector('.proxy-slot img')).objectFit);
is('object-fit is fill, so nothing is cropped away', fit, 'fill');

/* ---------- the millimetres, per paper ---------- */
const PAPERS = { a4: { w: 210, h: 297, x: 10.5, y: 16.5 }, letter: { w: 215.9, h: 279.4, x: 13.45, y: 7.7 } };

for (const [paper, want] of Object.entries(PAPERS)) {
  log(`\n=== ${paper.toUpperCase()} SHEET, PRINT MEDIA ===`);
  await page.emulateMediaType('screen');
  await page.evaluate(p => window.__setPaper(p), paper);
  await new Promise(r => setTimeout(r, 500));
  await decodeAll();
  await page.evaluate(() => window.__isolate());
  await page.emulateMediaType('print');
  await new Promise(r => setTimeout(r, 250));

  const m = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.proxy-page')];
    const p0 = pages[0].getBoundingClientRect();
    const slots = [...pages[0].querySelectorAll('.proxy-slot')].map(e => e.getBoundingClientRect());
    const img = pages[0].querySelector('.proxy-slot img').getBoundingClientRect();
    const bleed = pages[0].querySelector('.proxy-bleed');
    const b = bleed.getBoundingClientRect();
    const marks = [...pages[0].querySelectorAll('.proxy-mark')].map(e => {
      const r = e.getBoundingClientRect();
      return {
        x: r.left - p0.left, y: r.top - p0.top, w: r.width, h: r.height,
        colour: getComputedStyle(e).backgroundColor,
        onBleed: e.classList.contains('proxy-mark--on-bleed'),
      };
    });
    return {
      pageCount: pages.length,
      page2Top: pages[1] ? pages[1].getBoundingClientRect().top - p0.top : null,
      pw: p0.width, ph: p0.height,
      slot: { w: slots[0].width, h: slots[0].height },
      left: slots[0].left - p0.left, top: slots[0].top - p0.top,
      colPitch: slots[1].left - slots[0].left,
      rowPitch: slots[3].top - slots[0].top,
      right: p0.right - slots[2].right,
      bottom: p0.bottom - slots[6].bottom,
      img: { w: img.width, h: img.height },
      bleedBox: { x: b.left - p0.left, y: b.top - p0.top, w: b.width, h: b.height, colour: getComputedStyle(bleed).backgroundColor },
      marks,
      scaler: getComputedStyle(document.querySelector('.proxy-sheet__scaler')).transform,
      chrome: ['fake-sidebar', 'fake-header', 'fake-footer'].map(id => getComputedStyle(document.getElementById(id)).display),
      tags: [...document.querySelectorAll('.proxy-slot__tag')].map(t => getComputedStyle(t).display),
      rule: [...document.querySelectorAll('style')].map(t => t.textContent).find(t => /@page\s*\{/.test(t)),
    };
  });

  log(`  @page rule: ${m.rule}`);
  mm('paper width', m.pw, want.w, 0.15);
  mm('paper height', m.ph, want.h, 0.15);
  mm('CARD WIDTH', m.slot.w, 63);
  mm('CARD HEIGHT', m.slot.h, 88);
  mm('printed art width', m.img.w, 63);
  mm('printed art height', m.img.h, 88);
  mm('column pitch', m.colPitch, 63);
  mm('row pitch', m.rowPitch, 88);
  mm('left margin', m.left, want.x, 0.15);
  mm('top margin', m.top, want.y, 0.15);
  mm('right margin matches left', m.right, want.x, 0.15);
  mm('bottom margin matches top', m.bottom, want.y, 0.15);
  ok('the preview scale is stripped for print', m.scaler === 'none', m.scaler);
  ok('the app around the sheet is gone', m.chrome.every(d => d === 'none'), m.chrome.join(','));
  ok('the screen-only face labels are gone', m.tags.every(d => d === 'none'));
  is('sheets', m.pageCount, 2);
  if (m.page2Top != null) mm('sheet 2 starts one page down, no preview gap', m.page2Top, want.h, 0.2);
  ok('@page asks for this paper', m.rule.includes(`${want.w}mm ${want.h}mm`), m.rule);
  ok('@page margin is 0, so the sheet does its own centring', /margin:\s*0/.test(m.rule));

  log('  --- bleed and crop marks ---');
  mm('bleed sticks out to the left of the block', m.left - m.bleedBox.x, 1.5);
  mm('bleed sticks out above the block', m.top - m.bleedBox.y, 1.5);
  mm('bleed sticks out to the right', m.bleedBox.x + m.bleedBox.w - (m.left + 189 * MM_PX), 1.5);
  mm('bleed sticks out below', m.bleedBox.y + m.bleedBox.h - (m.top + 264 * MM_PX), 1.5);
  is('the bleed is black', m.bleedBox.colour, 'rgb(0, 0, 0)');
  is('every cut line is ticked at both ends, in two pieces each', m.marks.length, 32);
  is('half the pieces sit on the bleed', m.marks.filter(x => x.onBleed).length, 16);
  ok('the pieces on the bleed are white', m.marks.filter(x => x.onBleed).every(x => x.colour === 'rgb(255, 255, 255)'));
  ok('the pieces on the paper are grey', m.marks.filter(x => !x.onBleed).every(x => x.colour === 'rgb(138, 138, 138)'));

  const cardBlock = { x0: m.left, y0: m.top, x1: m.left + 189 * MM_PX, y1: m.top + 264 * MM_PX };
  const onACard = m.marks.filter(k =>
    k.x > cardBlock.x0 + 0.5 && k.x + k.w < cardBlock.x1 - 0.5 &&
    k.y > cardBlock.y0 + 0.5 && k.y + k.h < cardBlock.y1 - 0.5);
  is('marks printed on top of a card', onACard.length, 0);

  const clearance = Math.min(...m.marks.flatMap(k => [k.x, k.y, m.pw - (k.x + k.w), m.ph - (k.y + k.h)])) / MM_PX;
  ok('no mark strays inside the 3.4 mm a desktop printer cannot reach',
    clearance >= 3.4, `closest mark is ${r2(clearance)} mm from the edge of the paper`);

  const thinnest = Math.min(...m.marks.map(k => Math.min(k.w, k.h))) / MM_PX;
  ok('marks are hairlines the cut destroys', Math.abs(thinnest - 0.25) < 0.05, `${r3(thinnest)} mm`);

  /* Both sheets, whole, at print size. The second one is the short page: it
     carries the text fallback and the trailing empty slots, and its bleed and
     marks have to match sheet one exactly or the cuts stop being repeatable. */
  const sheetEls = await page.$$('.proxy-page');
  for (let i = 0; i < sheetEls.length; i++) {
    await sheetEls[i].screenshot({ path: `${OUT}/${paper}-sheet-${i + 1}.png` });
  }

  /* ---------- a real print job out of Chrome ---------- */
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, path: `${OUT}/${paper}-sheet.pdf` });
  const txt = Buffer.from(pdf).toString('latin1');
  const boxes = [...txt.matchAll(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/g)]
    .map(x => [+x[3] - +x[1], +x[4] - +x[2]]);
  const pageCount = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
  log(`  --- real PDF from the browser print pipeline (${(pdf.length / 1024).toFixed(0)} kB) ---`);
  is('PDF sheets', pageCount, 2);
  ok('PDF page size is the paper', Math.abs(boxes[0][0] / MM_PT - want.w) < 0.6 && Math.abs(boxes[0][1] / MM_PT - want.h) < 0.6,
    `${r2(boxes[0][0] / MM_PT)} x ${r2(boxes[0][1] / MM_PT)} mm`);

  await page.evaluate(() => window.__restoreAll());
  await page.emulateMediaType('screen');
}

/* ---------- guides off ---------- */
log('\n=== CUT MARKS OFF ===');
await page.evaluate(() => window.__setPaper('a4'));
await page.evaluate(() => window.__setGuides(false));
await new Promise(r => setTimeout(r, 400));
const bare = await page.evaluate(() => ({
  bleed: document.querySelectorAll('.proxy-bleed').length,
  marks: document.querySelectorAll('.proxy-mark').length,
  slots: document.querySelectorAll('.proxy-slot:not(.proxy-slot--empty)').length,
  outline: getComputedStyle(document.querySelector('.proxy-slot')).outlineStyle,
}));
is('no bleed', bare.bleed, 0);
is('no marks', bare.marks, 0);
is('the cards are still there', bare.slots, 13);
is('and no outline is drawn on a card', bare.outline, 'none');

await page.evaluate(() => window.__setGuides(true));
await new Promise(r => setTimeout(r, 400));
await decodeAll();
await page.screenshot({ path: `${OUT}/screen-preview.png` });

await browser.close();
log(failures === 0 ? `\nALL CHECKS PASSED. Shots and PDFs in ${OUT}` : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
