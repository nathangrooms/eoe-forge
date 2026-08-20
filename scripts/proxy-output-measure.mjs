/**
 * Measure the PRINTED OUTPUT, not the stylesheet.
 *
 *   npm run dev
 *   BASE=http://127.0.0.1:8123 node scripts/proxy-output-measure.mjs
 *
 * WHY THIS EXISTS ALONGSIDE proxy-sheet-measure.mjs
 * -------------------------------------------------
 * That script drives the same component and reads `getBoundingClientRect`
 * under print emulation. It is a good check and it passes. But a bounding box
 * is the layout engine's opinion, and the layout engine is not the last thing
 * to touch a card before it reaches paper. The print pipeline rasterises, and
 * rasterising snaps things. Whether that snap costs a hundredth of a
 * millimetre or a whole one is not knowable from the DOM, and 63 x 88 mm is
 * the one number that decides whether this feature is usable at all.
 *
 * So this script reads the millimetres back out of the two files a user
 * actually ends up with:
 *
 *   1. the PDF Chrome's own print pipeline produces from the sheet, which is
 *      byte for byte what the print dialog sends to a printer driver, and
 *   2. the PDF the "PDF" button writes through jsPDF, captured off the real
 *      download rather than reconstructed.
 *
 * Both are parsed by `scripts/pdf-geometry.mjs`, which walks the page content
 * stream and tracks the transform matrix, so the number reported for a card is
 * the rectangle the ink lands in. It never reads the DOM or the constants.
 *
 * WHAT IS REAL HERE
 * -----------------
 * The component is the shipped `DeckProxyGenerator`, which renders the shipped
 * `ProxySheet`. Every card row, image, layout and collector number comes out of
 * the live `cards` table through the anon key in one batched request. The only
 * invented card is a deliberately imageless one, because no real printing has
 * no image and the text fallback has to be exercised somehow.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { readPages, drawnItems, distinct, readObjects } from './pdf-geometry.mjs';
import { disableHotReload } from './puppeteer-no-hmr.mjs';

const OUT = process.env.OUT || '.shots/proxy-output';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';
const DL = path.resolve(OUT, 'downloads');
fs.mkdirSync(DL, { recursive: true });

const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;
let failures = 0;
const log = (...a) => console.log(...a);

/** Every size claim is in millimetres, stated with its tolerance. */
const mm = (label, actualMm, expectedMm, tolMm) => {
  const ok = Math.abs(actualMm - expectedMm) <= tolMm;
  if (!ok) failures++;
  const delta = actualMm - expectedMm;
  log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${r3(actualMm)} mm  (want ${expectedMm} +/-${tolMm}, off by ${delta >= 0 ? '+' : ''}${r3(delta)})`
  );
};
const is = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (want ${JSON.stringify(expected)})`}`);
};
const ok = (label, cond, detail = '') => {
  if (!cond) failures++;
  log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
};

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

const HARNESS_HTML = 'proxy-output-harness.html';
const HARNESS_ENTRY = 'src/dev/__proxyOutputHarness.tsx';

/* Rewriting an identical file still moves its mtime, and Vite answers a change
   under `src/` with a full reload that lands mid-run and destroys the page. */
const writeIfChanged = (file, body) => {
  let cur = null;
  try { cur = fs.readFileSync(file, 'utf8'); } catch {}
  if (cur === body) return;
  fs.writeFileSync(file, body);
  log(`  wrote ${file}`);
};

fs.mkdirSync('src/dev', { recursive: true });

writeIfChanged(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Proxy printed-output harness</title></head>
  <body><div id="root"></div><script type="module" src="/${HARNESS_ENTRY}"></script></body>
</html>
`
);

writeIfChanged(
  HARNESS_ENTRY,
  `/* Written by scripts/proxy-output-measure.mjs. Gitignored, never shipped. */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import '../index.css';
import { supabase } from '@/integrations/supabase/client';
import { DeckProxyGenerator } from '@/components/deck-builder/DeckProxyGenerator';
import { isolateForPrint } from '@/components/deck-builder/proxy-print';

/*
 * One batched request. Ten ids, one round trip, chosen to make the sheet
 * decide every face question it can be asked:
 *   transform -> two slots      split / adventure / prepare -> one slot each
 *   meld result -> one slot     a borderless printing, so a full-bleed art
 *                               meets the crop marks
 * Lightning Bolt is at quantity 3 so copies land on the sheet too, and the
 * eleventh card is invented and imageless to force the text fallback.
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
  const [cards, setCards] = useState<any[] | null>(null);

  useEffect(() => {
    /* The real print button calls window.print(). Headless Chrome has no
       dialog, so it is replaced with a recorder that snapshots what the page
       looked like AT THAT MOMENT: that is the only way to prove the isolation
       was in force when the job was handed over rather than merely afterwards. */
    (window as any).__printCalls = [];
    window.print = () => {
      const sheet = document.querySelector('.proxy-sheet') as HTMLElement | null;
      (window as any).__printCalls.push({
        sheetVisible: sheet ? getComputedStyle(sheet).display !== 'none' : false,
        hiddenSiblings: document.querySelectorAll('.proxy-print-hidden').length,
        neutralisedAncestors: document.querySelectorAll('.proxy-print-ancestor').length,
        chrome: ['harness-sidebar', 'harness-header', 'harness-footer'].map(id => {
          const el = document.getElementById(id);
          return el ? el.classList.contains('proxy-print-hidden') : null;
        }),
      });
    };

    /* The same isolateForPrint the button uses, exposed so the PDF can be
       taken while it is applied. The button path restores after 1000 ms. */
    (window as any).__isolate = () => {
      const sheet = document.querySelector('.proxy-sheet') as HTMLElement | null;
      (window as any).__restore = isolateForPrint(sheet);
    };
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
        const withQty = ordered.map(c => ({
          ...c,
          quantity: c.id === 'f29ba16f-c8fb-42fe-aabf-87089cb214a7' ? 3 : 1,
        }));
        setCards([...withQty, IMAGELESS]);
        (window as any).__fetched = ordered.map((c: any) => ({
          id: c.id, name: c.name, layout: c.layout, set: c.set_code, cn: c.collector_number,
        }));
      });
  }, []);

  (window as any).__ready = cards !== null;
  if (!cards) return <div id="loading">loading</div>;

  /* Nested the way a real page is: siblings that have to vanish for print and
     ancestors whose overflow, height and transform would clip or rescale the
     sheet if isolateForPrint did not neutralise them. */
  return (
    <div style={{ display: 'flex', background: '#141414' }}>
      <aside id="harness-sidebar" style={{ width: 240, height: '100vh', background: '#111' }}>sidebar</aside>
      <main style={{ flex: 1, minWidth: 0, height: '100vh', overflow: 'auto', padding: 24 }}>
        <header id="harness-header" style={{ height: 64, background: '#222' }}>header</header>
        <div style={{ maxHeight: 900, overflow: 'hidden', transform: 'translateZ(0)' }}>
          <DeckProxyGenerator deckCards={cards} deckName="Output Measurement" />
        </div>
        <footer id="harness-footer" style={{ height: 160, background: '#222' }}>footer</footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
`
);

/* ------------------------------------------------------------------ *
 * Reporting one sheet of output
 * ------------------------------------------------------------------ */

const CARD_W = 63;
const CARD_H = 88;
const BLOCK_W = 189;
const BLOCK_H = 264;
const BLEED = 1.5;

/**
 * Everything that can be said about one page of a produced PDF.
 *
 * `tol` differs by producer and that is the finding, not a fudge: jsPDF writes
 * the millimetres it is given, so it is held to a hundredth. Chrome rasterises
 * through a whole-CSS-pixel grid, so it cannot be held tighter than half a
 * pixel, which is 0.13 mm. Both tolerances are stated in the output.
 */
function reportPage(page, label, { paperW, paperH, tol, expectImages, expectGuides }) {
  log(`\n  --- ${label} ---`);
  const { images, rects, clips } = drawnItems(page);

  mm('paper width', page.widthMm, paperW, 0.2);
  mm('paper height', page.heightMm, paperH, 0.2);

  const marginX = (paperW - BLOCK_W) / 2;
  const marginY = (paperH - BLOCK_H) / 2;

  is('card images drawn on this sheet', images.length, expectImages);
  ok('no card image is rotated or skewed', images.every(i => !i.skewed));

  if (images.length) {
    const widths = distinct(images.map(i => i.wMm), 3);
    const heights = distinct(images.map(i => i.hMm), 3);
    log(`      widths drawn:  ${widths.map(w => `${w.mm} mm x${w.n}`).join(', ')}`);
    log(`      heights drawn: ${heights.map(h => `${h.mm} mm x${h.n}`).join(', ')}`);

    const wMin = Math.min(...images.map(i => i.wMm));
    const wMax = Math.max(...images.map(i => i.wMm));
    const hMin = Math.min(...images.map(i => i.hMm));
    const hMax = Math.max(...images.map(i => i.hMm));

    mm('narrowest card on the sheet', wMin, CARD_W, tol);
    mm('widest card on the sheet', wMax, CARD_W, tol);
    mm('shortest card on the sheet', hMin, CARD_H, tol);
    mm('tallest card on the sheet', hMax, CARD_H, tol);

    /* A card that sleeves has to be right in both directions at once, so the
       aspect of the drawn box is checked as well as its two sides. */
    const ratios = images.map(i => i.wMm / i.hMm);
    const wantRatio = CARD_W / CARD_H;
    const worst = ratios.reduce((a, r) => (Math.abs(r - wantRatio) > Math.abs(a - wantRatio) ? r : a), wantRatio);
    ok(
      'the drawn box keeps card proportions',
      Math.abs(worst / wantRatio - 1) < 0.004,
      `worst ${r3(worst * 1000) / 1000} vs ${r3(wantRatio * 1000) / 1000}, off by ${((worst / wantRatio - 1) * 100).toFixed(3)}%`
    );

    /* The asset is placed whole into that box. If the producer had cropped, the
       source pixels would not be the full Scryfall scan. */
    const assets = distinct(images.filter(i => i.asset.pxW).map(i => i.asset.pxW), 0);
    log(`      source assets: ${assets.map(a => `${a.mm}px wide x${a.n}`).join(', ')}`);
    ok('no image carries a soft mask that would alter its pixels', images.every(i => !i.asset.hasSMask));

    // Where the block sits.
    const left = Math.min(...images.map(i => i.xMm));
    const top = Math.min(...images.map(i => i.yMm));
    const right = Math.max(...images.map(i => i.xMm + i.wMm));
    const bottom = Math.max(...images.map(i => i.yMm + i.hMm));
    mm('left margin', left, marginX, tol);
    mm('top margin', top, marginY, tol);
    mm('right margin matches left', paperW - right, marginX, tol);
    /*
     * Only a full sheet has a bottom row, so only a full sheet has a bottom
     * margin to compare. The short page deliberately leaves its empty slots in
     * place rather than centring three cards, which is what keeps every sheet
     * in the stack cuttable the same way, and it is why the block on page two
     * ends where one row ends.
     */
    if (expectImages === 9) {
      mm('bottom margin matches top', paperH - bottom, marginY, tol);
      mm('block width across all three columns', right - left, BLOCK_W, tol * 2);
      mm('block height down all three rows', bottom - top, BLOCK_H, tol * 2);
    } else {
      mm('the short page keeps its cards in the top row, not centred', top, marginY, tol);
    }

    /* Pitch is what a cut actually follows. A stack of cards each 0.1 mm out
       the same way walks; a stack that alternates does not. */
    const cols = distinct(images.map(i => i.xMm), 2).map(c => c.mm);
    const rows = distinct(images.map(i => i.yMm), 2).map(r => r.mm);
    if (cols.length > 1) {
      const pitches = cols.slice(1).map((c, i) => c - cols[i]);
      log(`      column pitch: ${pitches.map(p => r3(p)).join(', ')} mm`);
      for (const p of pitches) mm('column pitch', p, CARD_W, tol);
    }
    if (rows.length > 1) {
      const pitches = rows.slice(1).map((r, i) => r - rows[i]);
      log(`      row pitch: ${pitches.map(p => r3(p)).join(', ')} mm`);
      for (const p of pitches) mm('row pitch', p, CARD_H, tol);
    }

    // Cards must not overlap: a gap or an overlap both mean a bad cut.
    let overlaps = 0;
    for (let a = 0; a < images.length; a++) {
      for (let b = a + 1; b < images.length; b++) {
        const A = images[a], B = images[b];
        const ox = Math.min(A.xMm + A.wMm, B.xMm + B.wMm) - Math.max(A.xMm, B.xMm);
        const oy = Math.min(A.yMm + A.hMm, B.yMm + B.hMm) - Math.max(A.yMm, B.yMm);
        if (ox > 0.05 && oy > 0.05) overlaps++;
      }
    }
    is('cards overlapping each other', overlaps, 0);

    /* Nothing may clip a card. A clip box tighter than the card is a crop, and
       a crop is the thing this feature is not allowed to do. */
    /* `img.clip` is the clip that was ACTIVE when the card was drawn, not every
       clip on the page. A card is cropped only if that box is tighter than the
       card on any side. */
    const cropping = images.filter(img => {
      const c = img.clip;
      if (!c) return false;
      return (
        c.xMm > img.xMm + 0.05 || c.yMm > img.yMm + 0.05 ||
        c.xMm + c.wMm < img.xMm + img.wMm - 0.05 ||
        c.yMm + c.hMm < img.yMm + img.hMm - 0.05
      );
    });
    is('cards cut off by a clip box', cropping.length, 0);
  }

  if (expectGuides) {
    const black = rects.filter(r => r.fill[0] < 0.05 && r.fill[1] < 0.05 && r.fill[2] < 0.05 && r.wMm > 100 && r.hMm > 100);
    ok('a black bleed band is drawn under the block', black.length === 1, `${black.length} found`);
    if (black.length === 1) {
      const b = black[0];
      mm('bleed reaches past the block on the left', marginX - b.xMm, BLEED, tol);
      mm('bleed reaches past the block on top', marginY - b.yMm, BLEED, tol);
      mm('bleed reaches past the block on the right', b.xMm + b.wMm - (marginX + BLOCK_W), BLEED, tol);
      mm('bleed reaches past the block below', b.yMm + b.hMm - (marginY + BLOCK_H), BLEED, tol);
    }

    /* Every cut line has to be findable from the paper. The true line is the
       thing being checked: does the drawn tick actually cover it. */
    const thin = rects.filter(r => Math.min(r.wMm, r.hMm) < 0.75 && Math.max(r.wMm, r.hMm) < 12);
    is('crop mark pieces drawn', thin.length, 32);

    const vCuts = [0, 1, 2, 3].map(i => marginX + i * CARD_W);
    const hCuts = [0, 1, 2, 3].map(i => marginY + i * CARD_H);
    let covered = 0;
    for (const x of vCuts) {
      const hits = thin.filter(r => r.wMm < r.hMm && r.xMm - 0.01 <= x && r.xMm + r.wMm + 0.01 >= x);
      if (hits.length >= 4) covered++;
    }
    for (const y of hCuts) {
      const hits = thin.filter(r => r.hMm < r.wMm && r.yMm - 0.01 <= y && r.yMm + r.hMm + 0.01 >= y);
      if (hits.length >= 4) covered++;
    }
    is('cut lines whose ticks actually straddle the true line, of 8', covered, 8);

    const blockBox = { x0: marginX, y0: marginY, x1: marginX + BLOCK_W, y1: marginY + BLOCK_H };
    const onCard = thin.filter(r =>
      r.xMm > blockBox.x0 + 0.3 && r.xMm + r.wMm < blockBox.x1 - 0.3 &&
      r.yMm > blockBox.y0 + 0.3 && r.yMm + r.hMm < blockBox.y1 - 0.3
    );
    is('crop marks printed on top of a card', onCard.length, 0);

    const clearance = Math.min(
      ...thin.flatMap(r => [r.xMm, r.yMm, paperW - (r.xMm + r.wMm), paperH - (r.yMm + r.hMm)])
    );
    ok(
      'no mark falls in the 3.4 mm a desktop printer cannot reach',
      clearance >= 3.4,
      `closest is ${r2(clearance)} mm from the paper edge`
    );
  }

  return { images, rects };
}

/* ------------------------------------------------------------------ *
 * Is the art in the file the art Scryfall served?
 * ------------------------------------------------------------------ */

/**
 * Scryfall's terms say do not blur, sharpen, desaturate or colour-shift card
 * images, and this project has broken them twice. "We do not filter the image"
 * is not the same claim as "the image in the file is the image Scryfall sent":
 * a producer that decodes a JPEG and re-encodes it has colour-shifted it
 * whether or not anyone wrote a filter, and it would look identical to a human
 * reviewing a screenshot. So the bytes are compared.
 *
 * A producer is allowed to append padding after the stream, which is why this
 * compares a prefix rather than requiring equal lengths. It is not allowed to
 * change a byte inside the asset, and a re-encode changes almost all of them.
 */
async function checkArtIntegrity(pdfPath, urls, label) {
  log(`\n  --- ${label} ---`);
  const objs = readObjects(fs.readFileSync(pdfPath));
  const embedded = [...objs.values()].filter(o => /\/Subtype\s*\/Image/.test(o.dict) && o.stream);

  const dims = distinct(embedded.map(o => Number(/\/Width\s+(\d+)/.exec(o.dict)?.[1] ?? 0)), 0);
  log(`      ${embedded.length} images embedded, widths: ${dims.map(d => `${d.mm}px x${d.n}`).join(', ')}`);
  ok('every image is stored as JPEG, not re-rasterised',
    embedded.every(o => /\/Filter\s*\/DCTDecode/.test(o.dict)),
    embedded.map(o => /\/Filter\s*\/?(\w+)/.exec(o.dict)?.[1]).join(','));
  ok('no image carries a /Decode array that would remap its colours',
    embedded.every(o => !/\/Decode\s*\[/.test(o.dict)));

  let identical = 0;
  for (const [name, bytes] of urls) {
    const hit = embedded.find(o => o.stream.length >= bytes.length && o.stream.subarray(0, bytes.length).equals(bytes));
    if (hit) identical++;
    else log(`      ALTERED: ${name}`);
  }
  ok('the art is the Scryfall asset byte for byte, not a re-encode',
    identical === urls.length, `${identical} of ${urls.length} assets identical`);
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1700, height: 1100, deviceScaleFactor: 1 });
page.on('pageerror', e => { failures++; log('  [pageerror]', e.message); });
page.on('console', m => { if (m.type() === 'error') log('  [console]', m.text()); });

const client = await page.createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

/* A save by another workflow must not reload this page mid-measurement. */
await disableHotReload(page, log);

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'networkidle0', timeout: 90000 });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
await page.waitForSelector('.proxy-slot img', { timeout: 60000 });
const decodeAll = () =>
  page.evaluate(() => Promise.all([...document.querySelectorAll('.proxy-slot img')].map(i => i.decode().catch(() => {}))));
await decodeAll();

log('\n=== CARDS ON THE SHEET, LIVE FROM `cards` ===');
const fetched = await page.evaluate(() => window.__fetched);
for (const c of fetched) log(`  ${String(c.layout).padEnd(10)} ${c.set}/${c.cn}  ${c.name}`);
is('rows returned by the one batched request', fetched.length, 9);

/* ---------- what the page SAYS before any paper is spent ---------- */
log('\n=== WHAT THE PAGE SAYS BEFORE PRINTING ===');
const said = await page.evaluate(() => {
  const text = document.body.innerText;
  const stat = label => {
    const nodes = [...document.querySelectorAll('div')];
    const box = nodes.find(n => n.children.length === 2 && n.children[0].textContent.trim() === label);
    return box ? box.children[1].textContent.trim() : null;
  };
  const btn = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
  return {
    cardsToPrint: stat('Cards to print'),
    pages: stat('Pages'),
    extraFaces: stat('Extra faces'),
    dpi: stat('Print dpi'),
    printButton: btn.find(t => /^Print /.test(t)) ?? null,
    pdfButton: btn.find(t => /^PDF/.test(t)) ?? null,
    text,
    /*
     * The copy rule is about words this project wrote. Card names and type
     * lines come from Scryfall and legitimately carry an em-dash ("Creature —
     * Giant"), so checking `body.innerText` would only ever report Magic's own
     * punctuation. The note block is the copy that belongs to us.
     */
    notice: (() => {
      const el = [...document.querySelectorAll('div')]
        .filter(d => /Margins to "None"/.test(d.textContent))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0];
      return el ? el.innerText : '';
    })(),
  };
});
log(`  the note block reads:\n    ${said.notice.split('\n').filter(Boolean).join('\n    ')}`);
is('"Cards to print"', said.cardsToPrint, '13');
is('"Pages"', said.pages, '2');
is('"Extra faces"', said.extraFaces, '1');
is('"Print dpi"', said.dpi, '271');
is('the print button counts the paper', said.printButton, 'Print 13 on 2 sheets');
ok('the plan is spelled out in words too', /13 cards on 2 sheets, 4 on the last one/.test(said.text),
  (said.text.match(/\d+ cards on \d+ sheets[^.]*/) || ['not found'])[0]);
ok('the back face is called out', /1 back face printed separately/.test(said.text));
ok('the missing art is called out', /1 card has no art and prints as a text proxy/.test(said.text));
ok('the fit-to-page trap is named', /Margins to "None" and Scale to 100%/.test(said.text));

log('\n=== FREE, AND FOR PLAYTESTING, ON THE PAGE ===');
ok('it says these are for playtesting', /for playtesting at your own table/i.test(said.text));
ok('it says they are free', /They are free/.test(said.text));
ok('it says they are not real cards', /not real cards/.test(said.text));
ok('it says they are not tournament legal', /not legal at any event/.test(said.text));
ok('it says not to sell them', /Do not sell them/.test(said.text));
ok('no em-dash in the copy this project wrote', !said.notice.includes('—'),
  said.notice.includes('—') ? said.notice.split('\n').filter(l => l.includes('—')).join(' / ') : 'none');

/* ---------- the print button really isolates before it prints ---------- */
log('\n=== THE PRINT BUTTON ===');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^Print /.test(x.textContent.trim()));
  b.click();
});
await page.waitForFunction('window.__printCalls.length > 0', { timeout: 60000 });
const printCall = (await page.evaluate(() => window.__printCalls))[0];
ok('the sheet is still on the page when the job is handed over', printCall.sheetVisible);
ok('the app around it was hidden first', printCall.chrome.every(c => c === true), JSON.stringify(printCall.chrome));
ok('siblings were hidden, not just dimmed', printCall.hiddenSiblings > 0, `${printCall.hiddenSiblings} hidden`);
ok('the scrolling ancestors were neutralised', printCall.neutralisedAncestors > 0, `${printCall.neutralisedAncestors} ancestors`);
await new Promise(r => setTimeout(r, 1400)); // let the component's own restore run

/* The sheet has to survive the print click, not just precede it. */
const probe = async where => {
  const s = await page.evaluate(() => {
    const stat = label => {
      const box = [...document.querySelectorAll('div')]
        .find(n => n.children.length === 2 && n.children[0].textContent.trim() === label);
      return box ? box.children[1].textContent.trim() : null;
    };
    return {
      sheets: document.querySelectorAll('.proxy-page').length,
      imgs: document.querySelectorAll('.proxy-slot img').length,
      selected: stat('Selected'),
      preview: document.querySelector('.proxy-sheet') ? 'sheet' : document.body.innerText.match(/Nothing selected|Fetching printings|Loading full/)?.[0] ?? '?',
      ready: window.__ready,
      printCalls: (window.__printCalls || []).length,
      domBytes: document.body.innerHTML.length,
      head: document.body.innerText.slice(0, 60).replace(/\s+/g, ' '),
    };
  });
  log(`  [${where}] sheets=${s.sheets} imgs=${s.imgs} selected=${s.selected} preview=${s.preview} ready=${s.ready} printCalls=${s.printCalls} dom=${s.domBytes} "${s.head}"`);
  return s;
};
await probe('after the print click');

/* ---------- the assets the sheet actually loaded ---------- */
log('\n=== THE ART THE SHEET LOADED ===');
const artUrls = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('.proxy-slot img')].map(i => i.currentSrc || i.src))]);
log(`  ${artUrls.length} distinct card images on the sheet`);
const artBytes = [];
for (const url of artUrls) {
  /* Scryfall answers a bare programmatic fetch with an HTML page, so the same
     User-Agent shape a browser sends is required to get the asset at all. */
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 DeckMatrix-proxy-audit' } });
  const buf = Buffer.from(await res.arrayBuffer());
  ok(`fetched ${url.split('/').pop().slice(0, 20)}`, res.ok && buf.length > 1000, `${res.status}, ${buf.length} bytes`);
  artBytes.push([url, buf]);
}

/* ---------- the two papers, measured out of the produced PDF ---------- */
const PAPERS = [
  { key: 'A4', option: /^A4/, w: 210, h: 297 },
  { key: 'Letter', option: /Letter/, w: 215.9, h: 279.4 },
];

const pickPaper = async optionRe => {
  const opened = await page.evaluate(() => {
    const trigger = [...document.querySelectorAll('button[role="combobox"]')]
      .find(b => /A4|Letter/.test(b.textContent));
    if (!trigger) return false;
    trigger.click();
    return true;
  });
  if (!opened) throw new Error('paper select not found');
  await new Promise(r => setTimeout(r, 350));
  const picked = await page.evaluate(src => {
    const re = new RegExp(src);
    const item = [...document.querySelectorAll('[role="option"]')].find(o => re.test(o.textContent.trim()));
    if (!item) return null;
    item.click();
    return item.textContent.trim();
  }, optionRe.source);
  await new Promise(r => setTimeout(r, 500));
  return picked;
};

for (const paper of PAPERS) {
  log(`\n=== ${paper.key.toUpperCase()}: CHROME PRINT PIPELINE, MEASURED OUT OF THE PDF ===`);
  await probe(`before choosing ${paper.key}`);
  const chosen = await pickPaper(paper.option);
  ok(`the paper control is set to ${paper.key}`, chosen != null, `selected "${chosen}"`);
  await probe(`after choosing ${paper.key}`);
  await decodeAll();

  await page.evaluate(() => window.__isolate());
  await page.emulateMediaType('print');
  await new Promise(r => setTimeout(r, 400));

  /* What the page looks like at the instant the job is taken. Printed because
     an empty or wrongly sized PDF is otherwise a mystery to debug. */
  const state = await page.evaluate(() => ({
    sheets: document.querySelectorAll('.proxy-page').length,
    imgs: document.querySelectorAll('.proxy-slot img').length,
    rule: [...document.querySelectorAll('style')].map(s => s.textContent).find(t => /@page\s*\{/.test(t)) ?? null,
    trigger: ([...document.querySelectorAll('button[role="combobox"]')].map(b => b.textContent.trim())),
  }));
  log(`  page state: ${state.sheets} sheets, ${state.imgs} images, controls ${JSON.stringify(state.trigger)}`);
  log(`  @page rule: ${state.rule}`);
  /* 13 slots, 12 of them `<img>`: the thirteenth is the invented imageless card
     and renders the text fallback, which is the point of putting it there. */
  ok('the sheet is on the page when the job is taken', state.sheets === 2 && state.imgs === 12,
    `${state.sheets} sheets, ${state.imgs} images`);
  ok('@page asks for this paper', state.rule?.includes(`${paper.w}mm ${paper.h}mm`) ?? false, state.rule ?? 'no rule');

  const file = `${OUT}/${paper.key.toLowerCase()}-chrome-print.pdf`;
  await page.pdf({ printBackground: true, preferCSSPageSize: true, path: file });
  await page.evaluate(() => window.__restoreAll());
  await page.emulateMediaType('screen');
  await new Promise(r => setTimeout(r, 200));

  const bytes = fs.readFileSync(file);
  const pages = readPages(bytes);
  log(`  ${file}  ${(bytes.length / 1024).toFixed(0)} kB`);
  is('sheets in the file', pages.length, 2);

  /* Chrome rasterises to a whole-CSS-pixel grid before it writes the PDF, so
     half a pixel, 0.132 mm, is the floor on what it can be held to. That is
     the tolerance, and it is a property of the pipeline rather than a choice. */
  const CHROME_TOL = 0.17;
  if (pages[0]) reportPage(pages[0], `${paper.key} sheet 1 of 2, nine cards`, {
    paperW: paper.w, paperH: paper.h, tol: CHROME_TOL, expectImages: 9, expectGuides: true,
  });
  if (pages[1]) reportPage(pages[1], `${paper.key} sheet 2 of 2, the short page`, {
    paperW: paper.w, paperH: paper.h, tol: CHROME_TOL, expectImages: 3, expectGuides: true,
  });
  await checkArtIntegrity(file, artBytes, `${paper.key} art integrity`);
}

/* ---------- the jsPDF export button, captured off the real download ---------- */
log('\n=== THE "PDF" BUTTON, MEASURED OUT OF THE DOWNLOADED FILE ===');
await pickPaper(/^A4/);
for (const f of fs.readdirSync(DL)) fs.rmSync(path.join(DL, f), { force: true });

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^PDF/.test(x.textContent.trim()));
  b.click();
});

const waitForDownload = async () => {
  for (let i = 0; i < 240; i++) {
    const files = fs.readdirSync(DL).filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
    if (files.length) {
      const p = path.join(DL, files[0]);
      const a = fs.statSync(p).size;
      await new Promise(r => setTimeout(r, 400));
      if (fs.statSync(p).size === a && a > 0) return p;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
};
const downloaded = await waitForDownload();
ok('the button really wrote a file', downloaded != null, downloaded ? path.basename(downloaded) : 'nothing landed');

if (downloaded) {
  const bytes = fs.readFileSync(downloaded);
  fs.writeFileSync(`${OUT}/a4-jspdf-export.pdf`, bytes);
  log(`  ${path.basename(downloaded)}  ${(bytes.length / 1024).toFixed(0)} kB`);
  const pages = readPages(bytes);
  is('sheets in the file', pages.length, 2);
  /* jsPDF writes the millimetres it is handed, with no raster grid in the way,
     so it is held two orders tighter than the browser pipeline. */
  const JSPDF_TOL = 0.02;
  if (pages[0]) reportPage(pages[0], 'A4 sheet 1 of 2, nine cards', {
    paperW: 210, paperH: 297, tol: JSPDF_TOL, expectImages: 9, expectGuides: true,
  });
  if (pages[1]) reportPage(pages[1], 'A4 sheet 2 of 2, the short page', {
    paperW: 210, paperH: 297, tol: JSPDF_TOL, expectImages: 3, expectGuides: true,
  });
  await checkArtIntegrity(`${OUT}/a4-jspdf-export.pdf`, artBytes, 'jsPDF art integrity');
}

/* ---------- a picture of the thing, at print size ---------- */
await page.screenshot({ path: `${OUT}/panel.png`, fullPage: false });

/*
 * Isolated AND under print media, because the rules that undo the app's
 * clipping (`.proxy-print-ancestor`) live inside `@media print`. Isolating on
 * screen adds the classes and changes nothing, so a screen screenshot of a
 * 297 mm sheet is a picture of the harness's `overflow: hidden` box with the
 * middle of the sheet showing through it. This is the sheet as the printer
 * sees it.
 */
await page.evaluate(() => window.__isolate());
await page.emulateMediaType('print');
await new Promise(r => setTimeout(r, 400));
await decodeAll();
const sheetEls = await page.$$('.proxy-page');
for (let i = 0; i < sheetEls.length; i++) {
  await sheetEls[i].screenshot({ path: `${OUT}/sheet-${i + 1}.png` });
}
await page.emulateMediaType('screen');
await page.evaluate(() => window.__restoreAll());

await browser.close();
log(failures === 0 ? `\nALL CHECKS PASSED. Files in ${OUT}` : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
