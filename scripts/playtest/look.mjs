/**
 * LOOK AT PLAY MODE. One walk, one screenshot per screen, one measurement set.
 *
 * This is the before/after instrument for the visual pass. It is deliberately
 * not another "does it work" probe — the reachability work already answered
 * that and is not re-litigated here. Every number below is about whether the
 * screen READS as a game somebody paid for:
 *
 *   labels        the faintest painted text on the board, as an alpha
 *   feed          how many square pixels of the log lie over a card image
 *   banner        what fraction of the viewport the turn banner covers
 *   split         are the controls for one decision in one place
 *   rows          worst pair overlap on the creature row, as a fraction
 *   vertical      lowest painted pixel as a fraction of the window height
 *   names         elements naming a card where no card image is drawn
 *
 * Run:  BASE=http://127.0.0.1:8080 node scripts/playtest/look.mjs <tag>
 * Writes .shots/look-<tag>/ plus report.json.
 */
import fs from 'node:fs';
import { openHarness, sleep, pressText, unblock, gameState, startGame } from './uiLib.mjs';

const TAG = process.argv[2] || 'run';
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 1000);
const OUT = `.shots/look-${TAG}`;

const screens = [];

/* ---------------------------------------------------------------- measure */

const MEASURE = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const rects = el => el.getBoundingClientRect();
  const seen = el => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.03) return false;
    const r = rects(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const overlap = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 0 && y > 0 ? x * y : 0;
  };
  const alphaOf = colour => {
    const m = /rgba?\(([^)]+)\)/.exec(colour || '');
    if (!m) return 1;
    const parts = m[1].split(',').map(s => parseFloat(s));
    return parts.length > 3 ? parts[3] : 1;
  };

  /* --- card images on screen, and their boxes --- */
  const cardImgs = [];
  for (const img of document.querySelectorAll('img')) {
    if (!seen(img)) continue;
    const r = rects(img);
    if (r.width < 24 || r.height < 24) continue;
    const src = img.currentSrc || img.src || '';
    if (!/scryfall|\.png|\.jpg|\.jpeg|\.webp/i.test(src)) continue;
    const cs = getComputedStyle(img);
    let el = img, grey = null, d = 0;
    while (el && d < 14) {
      const f = `${getComputedStyle(el).filter || ''}`;
      if (/grayscale\(\s*(?!0\s*\))|saturate\(\s*0*(\.0+)?\s*\)/.test(f)) { grey = f; break; }
      el = el.parentElement; d++;
    }
    const bw = img.offsetWidth || r.width, bh = img.offsetHeight || r.height;
    const nat = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
    cardImgs.push({
      r, fit: cs.objectFit, grey,
      cropped: cs.objectFit === 'cover' && nat && bh ? Math.abs(bw / bh - nat) > 0.06 : false,
      loaded: img.complete && img.naturalWidth > 0,
    });
  }

  /* --- FAINTEST PAINTED TEXT: the zone labels are the worst offenders --- */
  const faint = [];
  for (const el of document.querySelectorAll('span,p,div,li,h1,h2,h3,button')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 40) continue;
    if (!seen(el)) continue;
    const s = getComputedStyle(el);
    const a = alphaOf(s.color) * Number(s.opacity || 1);
    let p = el.parentElement, d = 0;
    while (p && d < 6) { const o = Number(getComputedStyle(p).opacity || 1); if (o < 1) { } p = p.parentElement; d++; }
    faint.push({ t: t.slice(0, 30), a: +a.toFixed(3), px: parseFloat(s.fontSize), y: Math.round(rects(el).y) });
  }
  faint.sort((x, y) => x.a - y.a);

  /* --- LOG OVER CARD ART --- */
  /* The log list is the thing with the aria-label; what a player sees is the
     whole panel it sits in, so walk out to the positioned wrapper. */
  const log = document.querySelector('[aria-label="Game log"], [aria-label="Game feed"]');
  let feed = log;
  while (feed && feed.parentElement && getComputedStyle(feed).position !== 'absolute') feed = feed.parentElement;
  let feedOverArt = 0, feedBox = null, feedOverWhat = [];
  if (feed && seen(feed)) {
    feedBox = rects(feed);
    for (const c of cardImgs) {
      const o = overlap(feedBox, c.r);
      if (o > 0) { feedOverArt += o; feedOverWhat.push(Math.round(o)); }
    }
  }

  /* --- TURN BANNER: the PAINTED block, not its full-screen wrapper --- */
  const bannerText = [...document.querySelectorAll('span')]
    .find(el => /^Turn \d+ · Round \d+$/i.test((el.textContent || '').trim()) && seen(el));
  const bannerBlock = bannerText ? bannerText.parentElement : null;
  const bannerBox = bannerBlock && seen(bannerBlock) ? rects(bannerBlock) : null;
  let bannerOverArt = 0;
  if (bannerBox) for (const c of cardImgs) bannerOverArt += overlap(bannerBox, c.r);

  /* --- WHERE ARE THE DECISION CONTROLS? --- */
  const DECIDE = /^(END TURN|ATTACK|ATTACK WITH|NO ATTACKS|NO BLOCKS|CONFIRM|DECLARE|KEEP|MULLIGAN|LET IT RESOLVE|RESPOND|PASS|DONE|BLOCK)/i;
  const decide = [...document.querySelectorAll('button')]
    .filter(b => seen(b) && DECIDE.test((b.innerText || '').trim()))
    .map(b => { const r = rects(b); return { label: (b.innerText || '').trim().replace(/\n/g, ' ').slice(0, 26), y: Math.round(r.y), x: Math.round(r.x) }; });
  const bands = [...new Set(decide.map(d => (d.y < 120 ? 'top' : d.y > vh - 160 ? 'bottom' : 'middle')))];

  /* --- ROW OVERLAP: worst pair among battlefield card boxes --- */
  let worstRow = 0, rowPairs = 0;
  const boxes = cardImgs.map(c => c.r).filter(r => r.top > 40 && r.bottom < vh - 40);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const o = overlap(boxes[i], boxes[j]);
      if (o <= 0) continue;
      rowPairs++;
      const f = o / Math.min(boxes[i].width * boxes[i].height, boxes[j].width * boxes[j].height);
      if (f > worstRow) worstRow = f;
    }
  }

  /* --- VERTICAL FILL: lowest painted pixel of any real content --- */
  let low = 0;
  for (const el of document.querySelectorAll('div,section,main,img,button,p,span,h1,h2,article')) {
    if (!seen(el)) continue;
    const r = rects(el);
    if (r.width < 30 || r.height < 12) continue;
    if (r.bottom > low && r.bottom <= vh + 1) low = r.bottom;
  }
  let right = 0;
  for (const el of document.querySelectorAll('div,section,main,img,button,p,span,h1,h2,article')) {
    if (!seen(el)) continue;
    const r = rects(el);
    if (r.width < 30 || r.height < 12) continue;
    if (r.right > right && r.right <= vw + 2) right = r.right;
  }

  /* --- A CARD NAMED BUT NOT SHOWN --- */
  const namedNotShown = [];
  for (const el of document.querySelectorAll('[data-card-name]')) {
    if (!seen(el)) continue;
    if (!el.querySelector('img')) namedNotShown.push(el.getAttribute('data-card-name'));
  }

  const g = window.__dmGame;
  return {
    vw, vh,
    imgs: cardImgs.length,
    unloaded: cardImgs.filter(c => !c.loaded).length,
    cropped: cardImgs.filter(c => c.cropped).length,
    grey: cardImgs.filter(c => c.grey).length,
    faintest: faint.slice(0, 8),
    feedBox: feedBox ? { x: Math.round(feedBox.x), y: Math.round(feedBox.y), w: Math.round(feedBox.width), h: Math.round(feedBox.height) } : null,
    feedOverArt: Math.round(feedOverArt), feedOverWhat,
    banner: bannerBox ? { w: Math.round(bannerBox.width), h: Math.round(bannerBox.height),
      cover: +((bannerBox.width * bannerBox.height) / (vw * vh)).toFixed(3),
      overArt: Math.round(bannerOverArt) } : null,
    decide, bands,
    worstRow: +worstRow.toFixed(3), rowPairs,
    lowestPainted: Math.round(low), vfill: +(low / vh).toFixed(3),
    rightMost: Math.round(right), hfill: +(right / vw).toFixed(3),
    namedNotShown,
    game: g ? { turn: g.turn, step: g.step, status: g.status, stack: (g.stack || []).length,
      bf: g.players.map(p => p.zones.battlefield.length).join('/'),
      hand: g.players[0]?.zones.hand.length } : null,
  };
});

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const n = String(screens.length).padStart(2, '0');
  const file = `${OUT}/${n}-${name}.png`;
  await page.screenshot({ path: file });
  const m = await MEASURE(page);
  screens.push({ name, file, ...m });
  console.log(`\n[${n}] ${name}  ${file}`);
  console.log(`   game ${m.game ? JSON.stringify(m.game) : '-'}`);
  console.log(`   imgs ${m.imgs} (unloaded ${m.unloaded}, cropped ${m.cropped}, grey ${m.grey})`);
  console.log(`   faintest text: ${m.faintest.slice(0, 4).map(f => `"${f.t}" a=${f.a} ${f.px}px`).join(' | ')}`);
  console.log(`   feed ${m.feedBox ? JSON.stringify(m.feedBox) : '-'} over art ${m.feedOverArt}px2`);
  console.log(`   banner ${m.banner ? JSON.stringify(m.banner) : '-'}`);
  console.log(`   decide bands=${m.bands.join(',')} :: ${m.decide.map(d => `${d.label}@${d.y}`).join(' | ') || 'none'}`);
  console.log(`   row overlap worst ${m.worstRow} over ${m.rowPairs} pairs`);
  console.log(`   fill v=${m.vfill} (low ${m.lowestPainted}/${m.vh})  h=${m.hfill}`);
  if (m.namedNotShown.length) console.log(`   named-not-shown: ${m.namedNotShown.slice(0, 8).join(', ')}`);
  return m;
}

/* -------------------------------------------------------------------- walk */

const run = async () => {
  const { browser, page, health } = await openHarness({ width: W, height: H });

  await shot(page, 'landing-modes');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1800);
  await shot(page, 'deck-step');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1400);
  await shot(page, 'seat-step');

  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3000);
  await shot(page, 'mulligan');

  await pressText(page, /^Keep$/);
  await sleep(2500);
  await shot(page, 'turn-one');

  let sawStack = false, sawCombat = false, sawBanner = false;
  for (let i = 0; i < 300; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (!sawStack && g.stack > 0) { sawStack = true; await shot(page, 'stack'); }
    if (!sawCombat && /block/i.test(g.step || '')) { sawCombat = true; await shot(page, 'combat-blockers'); }
    if (!sawBanner) {
      const up = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find(d => /^(YOUR TURN|TURN \d)/i.test((d.innerText || '').trim()));
        return !!el && el.getBoundingClientRect().width > innerWidth * 0.25;
      });
      if (up) { sawBanner = true; await shot(page, 'turn-banner'); }
    }
    if (g.turn >= 9 && sawCombat) break;
    await unblock(page);
    await sleep(280);
  }

  await shot(page, 'board-mid');

  for (let i = 0; i < 320; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.turn >= 16) break;
    await unblock(page);
    await sleep(220);
  }
  await shot(page, 'board-late');

  /*
   * ONE POPULATED SEAT, FILLING THE VIEWPORT.
   *
   * The driver keeps the game moving by pressing the primary control, which on
   * your own turn is END TURN, so the VIEWER'S mat stays empty all game and the
   * near half of every screenshot above is bare mat. The opponent's is not:
   * `View` draws that seat with the whole board, by the same `SeatMat`, so this
   * is the honest picture of a mat with a board on it.
   */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => /opponent.s board, full screen/i.test(x.getAttribute('title') || ''));
    if (b) b.click();
  });
  await sleep(1800);
  await shot(page, 'seat-focus-populated');

  /* And the same seat on a laptop, where the row arithmetic is under real
     pressure. If the brief's "overlaps into unreadable slivers" is going to
     show anywhere, it is here. */
  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
  await sleep(1800);
  await shot(page, 'seat-focus-1366x768');
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await sleep(1200);

  console.log(`\nHEALTH page=${health.pageErrors.length} console=${health.consoleErrors.length} net=${health.netFails.length}`);
  [...new Set(health.pageErrors)].slice(0, 8).forEach(e => console.log('  PAGEERR ' + e));
  [...new Set(health.consoleErrors)].slice(0, 8).forEach(e => console.log('  CONSOLE ' + e));

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ screens, health }, null, 2));
  console.log(`\nwrote ${OUT}/report.json`);
  await browser.close();
};

run().catch(e => { console.error('LOOK FAILED', e); process.exit(1); });
