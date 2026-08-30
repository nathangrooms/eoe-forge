/**
 * Does the card panel fit on the screen, and is the hand whole?
 *
 * Owner, 2026-08-30: "the play game card panel visual changes (last i checked
 * this was nowhere near done and didn't fit in screen)". Earlier in the same
 * session: "All options dont fit into the card winjdow...?" and "this has a
 * sacrifice ability which I cannot cast?".
 *
 * So this deals a real goldfish game and MEASURES two surfaces at three widths:
 * the card panel, and the fanned hand underneath it. A screenshot alone cannot
 * answer "does it fit", because a panel that is cut off looks like a panel that
 * ends.
 *
 * ---------------------------------------------------------------------------
 * THE DETECTOR WAS WRONG AND EVERY NUMBER IT PRINTED WAS MEANINGLESS
 * ---------------------------------------------------------------------------
 * The first version of this file looked for "the container with the most
 * buttons", which on this page is the page. It reported `actions 32, off screen
 * 0` for a panel that has never held 32 controls, because it was measuring the
 * whole document against the whole viewport, where nothing can be off screen by
 * construction. A probe that cannot be wrong is not measuring anything.
 *
 * The panel is found by `[data-card-panel]` now, which `CenterPreview` sets for
 * exactly this purpose, with the accessible name as a fallback so the probe
 * still works against a build that predates the attribute. Both are checked and
 * the one that matched is printed, so a silent fallback cannot be mistaken for
 * a match.
 *
 *   node scripts/probe/card-panel-fit.mjs
 *   WIDTHS=1600x1000 node scripts/probe/card-panel-fit.mjs
 *   OUT=.shots/card-panel/after node scripts/probe/card-panel-fit.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DIST = 'dist';
const PORT = Number(process.env.PORT || 4601);
const OUT = process.env.OUT || '.shots/card-panel';
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';
const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const WIDTHS = (process.env.WIDTHS || '1600x1000,1280x800,390x844')
  .split(',').map(s => s.split('x').map(Number));

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, p); let e = path.extname(f);
  if (!e || !fs.existsSync(f)) { f = path.join(DIST, 'index.html'); e = '.html'; }
  res.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT, r));
fs.mkdirSync(path.resolve(OUT), { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* WHAT RUNS IN THE PAGE                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Find the card panel, honestly.
 *
 * Two handles, tried in order, and the one that worked is reported. Never "the
 * biggest thing with some buttons in it".
 */
const FIND_PANEL = `(() => {
  const byData = document.querySelector('[data-card-panel]');
  if (byData) return { how: 'data-card-panel', el: byData };
  /* The accessible name is "<card name>, <zone>", built from ZONE_LABEL. */
  const zones = /, (Hand|Battlefield|Graveyard|Exile|Command zone|Library|Stack)$/;
  for (const el of document.querySelectorAll('[role="group"][aria-label]')) {
    if (zones.test(el.getAttribute('aria-label'))) return { how: 'aria-label', el };
  }
  return null;
})()`;

/** Measure the panel that `FIND_PANEL` located, plus the fan below it. */
const MEASURE = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const round = n => Math.round(n);
  const box = r => ({
    top: round(r.top), bottom: round(r.bottom), left: round(r.left),
    right: round(r.right), width: round(r.width), height: round(r.height),
  });

  /* ------------------------------------------------------------ the hand */
  /* Every card in the fan carries "Click to preview." in its label. */
  const handCards = [...document.querySelectorAll('button[aria-label]')]
    .filter(b => /Click to preview\\.$/.test(b.getAttribute('aria-label')))
    .map(b => {
      const r = b.getBoundingClientRect();
      /* How much of this card is painted outside the window, as a fraction of
         the card. Below the bottom edge is the reported defect; the sides are
         measured too because a narrow screen fails differently. */
      const below = Math.max(0, r.bottom - vh);
      const above = Math.max(0, -r.top);
      const offLeft = Math.max(0, -r.left);
      const offRight = Math.max(0, r.right - vw);
      const lostV = r.height > 0 ? (below + above) / r.height : 0;
      const lostH = r.width > 0 ? (offLeft + offRight) / r.width : 0;
      return {
        name: (b.getAttribute('aria-label') || '').split('.')[0],
        rect: box(r), belowPx: round(below), lost: Math.round(lostV * 1000) / 10,
        lostH: Math.round(lostH * 1000) / 10,
      };
    });
  const clipped = handCards.filter(c => c.lost > 0.5 || c.lostH > 0.5);
  const hand = {
    cards: handCards.length,
    clipped: clipped.length,
    worstLost: handCards.reduce((m, c) => Math.max(m, c.lost, c.lostH), 0),
    worstName: (clipped.slice().sort((a, b) =>
      Math.max(b.lost, b.lostH) - Math.max(a.lost, a.lostH))[0] || {}).name || null,
    /* Every card, for when the aggregate is not enough to see what is wrong. */
    each: handCards,
  };

  const found = ${FIND_PANEL};
  if (!found) return { found: false, viewport: { w: vw, h: vh }, hand };
  const panel = found.el;
  const pr = panel.getBoundingClientRect();

  /* Which box actually clips the contents. The panel is overflow-hidden and one
     column inside it scrolls, so "is this control reachable" is asked against
     the scrollport, not against the panel. */
  const scrollers = [...panel.querySelectorAll('*')].filter(el => {
    const s = getComputedStyle(el);
    return /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2;
  });
  const scroller = scrollers[0] || null;
  const sr = scroller ? scroller.getBoundingClientRect() : pr;

  const controls = [...panel.querySelectorAll('button, [role="button"], input, select, textarea')]
    .map(b => {
      const r = b.getBoundingClientRect();
      const text = (b.innerText || b.getAttribute('aria-label') || b.getAttribute('title') || '')
        .trim().replace(/\\s+/g, ' ').slice(0, 22);
      /* Painted at all? A control inside a collapsed section has no box. */
      const drawn = r.width > 0 && r.height > 0;
      const inViewport = r.top >= -1 && r.bottom <= vh + 1 && r.left >= -1 && r.right <= vw + 1;
      /* Inside the box that clips it: this is what "off screen" really means
         for a control in a scrolling column. */
      const inScrollport = r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1;
      return { text, drawn, inViewport, inScrollport, rect: box(r) };
    })
    .filter(c => c.drawn);

  /* Dead space: the tallest thing in the panel against the panel's own height.
     A column that stops 450px short of the bottom is the complaint. */
  let contentBottom = pr.top;
  for (const el of panel.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > contentBottom) contentBottom = r.bottom;
  }
  /* And the same question asked of the details column alone, which is the half
     the owner is looking at when they say the right side is empty. */
  let columnDead = null;
  if (scroller || panel.children.length) {
    const col = scroller || panel;
    const cr = col.getBoundingClientRect();
    let last = cr.top;
    for (const el of col.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > last) last = r.bottom;
    }
    columnDead = { height: round(cr.height), used: round(last - cr.top), empty: round(cr.bottom - last) };
  }

  return {
    found: true,
    how: found.how,
    viewport: { w: vw, h: vh },
    panel: box(pr),
    overflowBottom: Math.max(0, round(pr.bottom - vh)),
    overflowRight: Math.max(0, round(pr.right - vw)),
    overflowTop: Math.max(0, round(-pr.top)),
    overflowLeft: Math.max(0, round(-pr.left)),
    scrolls: !!scroller,
    scrollHidden: scroller ? round(scroller.scrollHeight - scroller.clientHeight) : 0,
    actions: controls.length,
    offScreen: controls.filter(c => !c.inViewport || !c.inScrollport).length,
    offScreenNames: controls.filter(c => !c.inViewport || !c.inScrollport).map(c => c.text).slice(0, 10),
    names: controls.map(c => c.text),
    dead: round(pr.bottom - contentBottom),
    columnDead,
    hand,
  };
})()`;

/* -------------------------------------------------------------------------- */
/* THE WALK                                                                   */
/* -------------------------------------------------------------------------- */

/** Press the button whose visible words match, and say whether one was found. */
async function press(page, re) {
  return page.evaluate(pattern => {
    const rx = new RegExp(pattern, 'i');
    const hit = [...document.querySelectorAll('button')]
      .find(b => !b.disabled && rx.test((b.innerText || '').trim()));
    if (!hit) return null;
    hit.click();
    return (hit.innerText || '').trim().slice(0, 40);
  }, re.source ?? re);
}

/** Open the lowest card on screen, which is a card in the fan. */
async function openHandCard(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('button[aria-label]')]
      .filter(b => /Click to preview\.$/.test(b.getAttribute('aria-label')))
      .map(b => ({ b, r: b.getBoundingClientRect() }))
      .sort((a, z) => z.r.top - a.r.top);
    if (!cards.length) return null;
    cards[0].b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return (cards[0].b.getAttribute('aria-label') || '').split('.')[0];
  });
}

/** Open a permanent on the viewer's own battlefield. */
async function openBattlefieldCard(page) {
  return page.evaluate(() => {
    /* A permanent is a card image on the mat, not in the fan: no "Click to
       preview." label, and it sits above the fan. */
    const fanTop = Math.min(
      ...[...document.querySelectorAll('button[aria-label]')]
        .filter(b => /Click to preview\.$/.test(b.getAttribute('aria-label')))
        .map(b => b.getBoundingClientRect().top),
      window.innerHeight
    );
    const imgs = [...document.querySelectorAll('img')]
      .filter(i => /scryfall/i.test(i.currentSrc || i.src || ''))
      .map(i => ({ i, r: i.getBoundingClientRect() }))
      .filter(x => x.r.width > 50 && x.r.height > 50 && x.r.bottom < fanTop - 4)
      /* Nearest the fan is the viewer's own row. */
      .sort((a, z) => z.r.top - a.r.top);
    if (!imgs.length) return null;
    const target = imgs[0];
    const el = target.i.closest('button,[role="button"],[tabindex]') ?? target.i;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return target.i.alt || '(a permanent)';
  });
}

function report(tag, m) {
  if (!m.found) {
    console.log(`  ${tag}: NO PANEL. hand ${m.hand.cards} cards, ${m.hand.clipped} clipped`);
    return;
  }
  const p = m.panel;
  console.log(
    `  ${tag}: panel ${p.width}x${p.height} at (${p.left},${p.top}) via ${m.how}\n` +
    `      actions ${m.actions}  off screen ${m.offScreen}  ` +
    `scrolls ${m.scrolls ? `yes, ${m.scrollHidden}px hidden` : 'no'}\n` +
    `      overflow  bottom ${m.overflowBottom} right ${m.overflowRight} ` +
    `top ${m.overflowTop} left ${m.overflowLeft}\n` +
    `      empty space below the content: ${m.dead}px` +
    (m.columnDead ? `  (details column ${m.columnDead.used}/${m.columnDead.height}px used, ${m.columnDead.empty}px empty)` : '')
  );
  if (m.offScreen) console.log(`      cut off: ${m.offScreenNames.join(', ')}`);
  console.log(`      controls: ${m.names.join(' | ')}`);
  console.log(
    `      hand: ${m.hand.cards} cards, ${m.hand.clipped} clipped, ` +
    `worst loses ${m.hand.worstLost}%${m.hand.worstName ? ` (${m.hand.worstName})` : ''}`
  );
  /* HAND_DETAIL=1 prints every card's box. The aggregate says a card is being
     lost; only the boxes say whether it is the sink, the arc or the layout. */
  if (process.env.HAND_DETAIL) {
    for (const c of m.hand.each) {
      console.log(
        `        ${String(c.name).padEnd(24)} ${c.rect.width}x${c.rect.height} ` +
        `top ${c.rect.top} bottom ${c.rect.bottom} left ${c.rect.left} right ${c.rect.right} ` +
        `below the window ${c.belowPx}px  lost ${c.lost}% / sideways ${c.lostH}%`
      );
    }
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

for (const [w, h] of WIDTHS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(SHIM);
  console.log(`\n${w}x${h}`);

  await page.goto(`http://localhost:${PORT}/play?mode=goldfish&deck=${DECK}&step=deck`, { waitUntil: 'networkidle0' });
  await wait(9000);

  if (!(await press(page, /^(start|deal|play)\b/))) {
    console.log('  could not find a control to start the game');
    await page.screenshot({ path: path.join(path.resolve(OUT), `no-start-${w}.png`) });
    await page.close();
    continue;
  }
  await wait(11000);

  /* ---- STATE ONE: the mulligan, with a card from the opening hand open. */
  const opened = await openHandCard(page);
  await wait(2200);
  if (!opened) {
    console.log('  no card in the fan after dealing');
  } else {
    const m = await page.evaluate(MEASURE);
    report(`mulligan / ${opened}`, m);
    await page.screenshot({ path: path.join(path.resolve(OUT), `mulligan-${w}.png`) });
  }

  /* ---- Keep the hand and get to a real board. */
  await page.keyboard.press('Escape');
  await wait(400);
  if (!(await press(page, /keep this hand|^keep\b/))) {
    console.log('  could not keep the opening hand');
    await page.close();
    continue;
  }
  await wait(3500);

  /* Play a land so there is a permanent to click. The panel's own control does
     it, which is also a check that the primary action works. */
  let landed = false;
  for (let i = 0; i < 6 && !landed; i++) {
    const name = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('button[aria-label]')]
        .filter(b => /Click to preview\.$/.test(b.getAttribute('aria-label')))
        .filter(b => /You can play this as a land drop/.test(b.getAttribute('aria-label')));
      if (!cards.length) return null;
      cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return (cards[0].getAttribute('aria-label') || '').split('.')[0];
    });
    if (!name) break;
    await wait(1600);
    landed = !!(await press(page, /^play land$/));
    await wait(2200);
  }

  /* ---- STATE TWO: a permanent on the battlefield, mid game. */
  const permanent = await openBattlefieldCard(page);
  await wait(2400);
  if (!permanent) {
    console.log(`  no permanent on the mat to open (land played: ${landed})`);
    await page.screenshot({ path: path.join(path.resolve(OUT), `no-permanent-${w}.png`) });
  } else {
    const m = await page.evaluate(MEASURE);
    report(`battlefield / ${permanent}`, m);
    await page.screenshot({ path: path.join(path.resolve(OUT), `battlefield-${w}.png`) });
  }

  await page.close();
}

await browser.close();
server.close();
console.log(`\nshots: ${OUT}`);
