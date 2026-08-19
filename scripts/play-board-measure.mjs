/**
 * BOARD MEASUREMENT. Nothing is fixed here; this run only records numbers.
 *
 * Six questions, all of which have been answered with a guess before and been
 * wrong. Every one of them is now answered by driving the real page:
 *
 *  1. LAYOUT SHIFT — every permanent's box before and after each action, so the
 *     answer to "keep getting weird layout shifting" names the action.
 *  2. QUADS — the four seat rectangles, in px and as a fraction of the board.
 *  3. SUPPORT ROW CLIP — how far the non-creature block's PAINTED extent runs
 *     past its own container and past the seat, at three widths.
 *  4. THE LOG — whether the control is wired, what it opens, and where.
 *  5. PLAYMATS — the natural pixel size of the mat image against the box it is
 *     stretched into.
 *  6. COMBAT — what is on screen during a declare-blockers stop.
 *
 * Harness identical to `play-preview-shots.mjs`: the real `Play` page, the real
 * reducer, Supabase refused at the network boundary so `fallbackDeck()` deals
 * offline. See that file for why the Vite client is stubbed.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/board';
const BASE = process.env.BASE || 'http://127.0.0.1:8101';
const TAG = process.env.TAG || 'before';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'play-harness.html';
const HARNESS_ENTRY = 'src/dev/__playHarness.tsx';
const writeIfChanged = (file, body) => {
  try { if (fs.readFileSync(file, 'utf8') === body) return; } catch { /* absent */ }
  fs.writeFileSync(file, body);
};
fs.mkdirSync('src/dev', { recursive: true });
writeIfChanged(HARNESS_HTML, `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Play harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`);
writeIfChanged(HARNESS_ENTRY, `/* Gitignored puppeteer harness for play mode. Written by
 * scripts/play-preview-shots.mjs. Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import Play from '../pages/Play';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <TooltipProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/play']}>
          <Play />
          <Toaster position="top-center" />
        </MemoryRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
`);

const VITE_CLIENT_STUB = `
export function createHotContext() {
  return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {},
    invalidate() {}, on() {}, off() {}, send() {}, data: {} };
}
const sheets = new Map();
export function updateStyle(id, content) {
  let style = sheets.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheets.set(id, style);
  } else { style.textContent = content; }
}
export function removeStyle(id) {
  const style = sheets.get(id);
  if (style) { document.head.removeChild(style); sheets.delete(id); }
}
export function injectQuery(url) { return url; }
`;

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1 });
page.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 220)));
page.on('console', m => { if (m.type() === 'error') log('  [error]', m.text().slice(0, 180)); });

await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  }
  if (/supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

let shotN = 0;
const shot = async name => {
  const file = `${OUT}/${TAG}-${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
};

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

const pressTitle = needle => page.evaluate(needle => {
  const el = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('title') || '').includes(needle));
  if (!el) return false;
  el.click();
  return true;
}, needle);

const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    landsPlayed: p1.landsPlayedThisTurn,
    hand: p1.zones.hand.length,
    permanents: g.players.map(p => `${p.name}:${p.zones.battlefield.length}`).join(' '),
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
  };
});

/* ------------------------------------------------------------------ probes */

/**
 * EVERY box on the board that a player would notice moving.
 *
 * Wider than the preview script's sweep: it takes permanents on every seat, the
 * hand fan, the four seat rectangles, the two rows and the support block. A
 * layout shift the owner notices is not confined to the cards.
 */
const boxes = () => page.evaluate(() => {
  const out = {};
  const put = (key, el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 && r.height < 4) return;
    out[key] = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };

  for (const seat of [...document.querySelectorAll('section[aria-label]')].filter(n => / seat$/.test(n.getAttribute('aria-label')))) {
    const who = seat.getAttribute('aria-label');
    put(`seat|${who}`, seat);
    for (const region of seat.querySelectorAll('[aria-label]')) {
      const label = region.getAttribute('aria-label') || '';
      if (!/^(Creatures|Lands|Artifacts|Noncreature)/.test(label)) continue;
      put(`row|${who}|${label.replace(/,.*$/, '')}`, region);
      for (const el of region.querySelectorAll('[data-instance]')) {
        const id = el.getAttribute('data-instance');
        if (!id) continue;
        put(`card|${who}|${id}`, el);
      }
    }
  }
  for (const el of document.querySelectorAll('[data-hand-card]')) {
    put(`hand|${el.getAttribute('data-instance') || el.getAttribute('data-hand-card')}`, el);
  }
  return out;
});

const diff = (before, after) => {
  const moved = [];
  for (const key of Object.keys(before)) {
    const a = after[key];
    if (!a) continue;
    const b = before[key];
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    if (d > 1) moved.push({ key, d: +d.toFixed(1), from: b, to: a });
  }
  moved.sort((p, q) => q.d - p.d);
  return moved;
};

const report = (label, moved, total) => {
  if (moved.length === 0) { log(`  ${label}: CLEAN (0 of ${total})`); return; }
  log(`  ${label}: ${moved.length} of ${total} moved, worst ${moved[0].d}px`);
  for (const m of moved.slice(0, 8)) {
    log(`     ${m.key}  ${m.from.x},${m.from.y} ${m.from.w}x${m.from.h}  ->  ${m.to.x},${m.to.y} ${m.to.w}x${m.to.h}`);
  }
  if (moved.length > 8) log(`     ... and ${moved.length - 8} more`);
};

/** Runs `act`, then reports what moved. */
async function measureAction(label, act, settle = 1400) {
  const before = await boxes();
  const did = await act();
  if (did === false) { log(`  ${label}: SKIPPED (nothing to act on)`); return; }
  await sleep(settle);
  const after = await boxes();
  report(label, diff(before, after), Object.keys(before).length);
}

/* --------------------------------------------------------------- 2: quads */

const quads = () => page.evaluate(() => {
  const seats = [...[...document.querySelectorAll('section[aria-label]')].filter(n => / seat$/.test(n.getAttribute('aria-label')))];
  const host = seats[0] ? seats[0].parentElement.parentElement : null;
  const hostBox = host ? host.getBoundingClientRect() : null;
  return {
    board: hostBox && { x: Math.round(hostBox.x), y: Math.round(hostBox.y), w: Math.round(hostBox.width), h: Math.round(hostBox.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    seats: seats.map(s => {
      const r = s.getBoundingClientRect();
      const cs = getComputedStyle(s.parentElement);
      return {
        who: s.getAttribute('aria-label'),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        pctW: hostBox ? +(r.width / hostBox.width * 100).toFixed(1) : null,
        pctH: hostBox ? +(r.height / hostBox.height * 100).toFixed(1) : null,
        transform: cs.transform,
        rotated: cs.transform !== 'none' && !/matrix\(1, 0, 0, 1/.test(cs.transform),
      };
    }),
  };
});

/* ------------------------------------------------ 3: support block overflow */

/**
 * How far anything on a seat paints past the seat's own rectangle.
 *
 * `getBoundingClientRect` on a rotated element already reports the ROTATED
 * rectangle, which is the thing the eye sees and the thing that clips — a
 * tapped card's box is a card-height wide. So this compares painted extents,
 * not layout boxes, which is where every previous answer here went wrong.
 */
const overflow = () => page.evaluate(() => {
  const rows = [];
  for (const seat of [...document.querySelectorAll('section[aria-label]')].filter(n => / seat$/.test(n.getAttribute('aria-label')))) {
    const seatBox = seat.getBoundingClientRect();
    for (const region of seat.querySelectorAll('[aria-label]')) {
      const label = (region.getAttribute('aria-label') || '').replace(/,.*$/, '');
      if (!/^(Creatures|Lands|Artifacts|Noncreature)/.test(label)) continue;
      const box = region.getBoundingClientRect();
      const cards = [...region.querySelectorAll('[data-instance]')].map(el => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('title') || '', tapped: el.getAttribute('data-tapped') === 'true', r };
      });
      if (!cards.length) continue;
      const left = Math.min(...cards.map(c => c.r.x));
      const right = Math.max(...cards.map(c => c.r.x + c.r.width));
      const top = Math.min(...cards.map(c => c.r.y));
      const bottom = Math.max(...cards.map(c => c.r.y + c.r.height));
      rows.push({
        seat: seat.getAttribute('aria-label'),
        zone: label,
        count: cards.length,
        tapped: cards.filter(c => c.tapped).length,
        container: `${Math.round(box.x)}..${Math.round(box.x + box.width)} (${Math.round(box.width)}px)`,
        painted: `${Math.round(left)}..${Math.round(right)} (${Math.round(right - left)}px)`,
        overRight: Math.round(right - (box.x + box.width)),
        overLeft: Math.round(box.x - left),
        overTop: Math.round(box.y - top),
        overBottom: Math.round(bottom - (box.y + box.height)),
        pastSeatRight: Math.round(right - (seatBox.x + seatBox.width)),
        pastSeatBottom: Math.round(bottom - (seatBox.y + seatBox.height)),
        usedPct: Math.round(((right - left) / box.width) * 100),
      });
    }
  }
  return rows;
});

/* ------------------------------------------------------------------ 4: log */

const logProbe = () => page.evaluate(() => {
  const list = document.querySelector('ol[aria-label="Game log"]');
  const btn = [...document.querySelectorAll('button')]
    .find(b => /^(log|hide log)$/i.test((b.innerText || '').trim()));
  const g = window.__dmGame;
  const box = list ? list.getBoundingClientRect() : null;
  const cs = list ? getComputedStyle(list) : null;
  return {
    engineLogEntries: g ? g.log.length : null,
    lastEngineLines: g ? g.log.slice(-4).map(e => `T${e.turn} ${e.type}: ${e.message}`) : null,
    control: btn ? {
      text: btn.innerText.trim(),
      expanded: btn.getAttribute('aria-expanded'),
      box: (() => { const r = btn.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      onScreen: (() => { const r = btn.getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; })(),
    } : null,
    listRendered: !!list,
    listBox: box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) },
    linesShown: list ? list.querySelectorAll('li').length : 0,
    lineTexts: list ? [...list.querySelectorAll('li')].map(li => li.innerText.trim()).slice(0, 6) : [],
    /* Truncation is why a wired log can still be useless. */
    truncatedLines: list ? [...list.querySelectorAll('li')].filter(li => li.scrollWidth > li.clientWidth + 1).length : 0,
    overflowY: cs ? cs.overflowY : null,
    maxHeight: cs ? cs.maxHeight : null,
    /* Is anything painting over it? */
    topElementAtCentre: (() => {
      if (!box) return null;
      const el = document.elementFromPoint(box.x + box.width / 2, box.y + Math.min(10, box.height / 2));
      return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 60) : null;
    })(),
  };
});

/* -------------------------------------------------------------- 5: playmat */

const matProbe = () => page.evaluate(async () => {
  const out = [];
  for (const seat of [...document.querySelectorAll('section[aria-label]')].filter(n => / seat$/.test(n.getAttribute('aria-label')))) {
    const mat = seat.querySelector('div[class*="rounded"]');
    const art = [...seat.querySelectorAll('div')].find(d => /url\(/.test(getComputedStyle(d).backgroundImage));
    const box = seat.getBoundingClientRect();
    let natural = null;
    if (art) {
      const url = getComputedStyle(art).backgroundImage.match(/url\("?([^")]+)"?\)/);
      if (url) {
        natural = await new Promise(res => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight, url: url[1] });
          img.onerror = () => res({ w: 0, h: 0, url: url[1], failed: true });
          img.src = url[1];
          setTimeout(() => res({ w: -1, h: -1, url: url[1], timeout: true }), 4000);
        });
      }
    }
    out.push({
      seat: seat.getAttribute('aria-label'),
      box: { w: Math.round(box.width), h: Math.round(box.height) },
      hasArt: !!art,
      filter: art ? getComputedStyle(art).filter : null,
      natural,
      upscale: natural && natural.w > 0 ? +(box.width / natural.w).toFixed(2) : null,
      /* What the mat actually paints, sampled. */
      surface: mat ? getComputedStyle(mat).backgroundColor : null,
    });
  }
  return out;
});

/* ==================================================================== run */

await page.goto(`${BASE}/${HARNESS_HTML}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

log('start:', await pressText(/Start .*game/));
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3500);
if (!(await game())) throw new Error('the table vanished after it was dealt');

log('\n=== 4: THE LOG, before anything has happened ===');
log('  ' + JSON.stringify(await logProbe(), null, 1));

log('kept opening hand:', await pressText(/^Keep$/));
await sleep(1200);
await shot('table');

log('\n=== 2: QUADS at 1680x1050 ===');
log(JSON.stringify(await quads(), null, 1));

log('\n=== 5: PLAYMATS ===');
for (const m of await matProbe()) log('  ' + JSON.stringify(m));

/* Free cast so a board exists to measure. */
log('\nmenu:', await pressTitle('Game menu')); await sleep(1400);
log('free cast:', await pressTitle('Ignore mana entirely')); await sleep(700);
await pressTitle('Close the menu'); await sleep(700);

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')]
    .map(e => e.getAttribute('title'))
    .filter(t => t && t.includes('Click to preview')));
const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false;
  el.click();
  return true;
}, t);

/* ------------------------------------------- 1: LAYOUT SHIFT, action by action */

log('\n=== 1: LAYOUT SHIFT, per action ===');

/* a) DRAW — a card enters the hand. */
await measureAction('DRAW a card', () =>
  page.evaluate(() => { window.__dmDispatch({ type: 'DRAW', playerId: 'p1', count: 1 }); return true; }));

/* b) CAST — the thing the previous run named as a new contributor. */
const first = (await handTitles()).find(t => t.includes('land drop'));
if (first) {
  await clickHand(first);
  await sleep(600);
  await measureAction('PLAY LAND (click Play land)', () => pressText(/^Play land$/), 1600);
}

/* Build a board over several turns so the rows are busy. */
for (let turn = 0; turn < 7; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await pressText(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(380);
    if (await pressText(/^Cast$/)) await sleep(600);
  }
  await page.evaluate(() => document.body.click());
  await sleep(300);
  if (turn < 6) { await pressText(/^END TURN$/); await sleep(9000); }
}
await sleep(1200);
await shot('board-built');
log('board:', JSON.stringify(await game()));

/* c) TAP a permanent I control, through the chip. */
await measureAction('TAP mine (chip)', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Tap /.test(b.getAttribute('title') || ''));
  if (!el) return false;
  el.click();
  return true;
}));

/* d) UNTAP the same one. */
await measureAction('UNTAP mine (chip)', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Untap /.test(b.getAttribute('title') || ''));
  if (!el) return false;
  el.click();
  return true;
}));

/* e) TAP on the opponent's side — the case the owner reported. */
await measureAction('TAP opponent', () => page.evaluate(() => {
  const g = window.__dmGame;
  const p2 = g.players.find(p => p.id === 'p2');
  const id = p2.zones.battlefield.find(i => !g.cards[i].tapped);
  if (!id) return false;
  window.__dmDispatch({ type: 'TAP', instanceId: id });
  return true;
}));

/* f) A CREATURE DIES — a card leaves the battlefield. */
await measureAction('CREATURE LEAVES (to graveyard)', () => page.evaluate(() => {
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'graveyard' });
  return true;
}), 1800);

/* g) A NON-CREATURE ENTERS — the support block grows a column. */
await measureAction('NONCREATURE ENTERS (block grows)', () => page.evaluate(() => {
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.hand.find(i => !/Creature|Land/.test(g.cards[i].typeLine || ''))
    || p1.zones.library.find(i => !/Creature|Land/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  return true;
}), 1800);

/* h) LIFE CHANGES — the badge redraws. */
await measureAction('LIFE CHANGES', () => page.evaluate(() => {
  window.__dmDispatch({ type: 'LIFE_CHANGE', playerId: 'p1', delta: -7 });
  return true;
}));

/* i) A +1/+1 COUNTER — the stat line grows a chip. */
await measureAction('COUNTER ADDED', () => page.evaluate(() => {
  const g = window.__dmGame;
  const p1 = g.players.find(p => p.id === 'p1');
  const id = p1.zones.battlefield.find(i => /Creature/.test(g.cards[i].typeLine || ''));
  if (!id) return false;
  window.__dmDispatch({ type: 'CARD_COUNTER', instanceId: id, counter: '+1/+1', delta: 1 });
  return true;
}));

/* j) STEP ADVANCE — the HUD phase strip moves. */
await measureAction('ADVANCE STEP', () => page.evaluate(() => {
  window.__dmDispatch({ type: 'ADVANCE_STEP', at: Date.now() });
  return true;
}), 1600);

/* k) OPENING the centre preview. */
await measureAction('OPEN CENTRE PREVIEW', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button[title]')]
    .find(e => (e.getAttribute('title') || '').includes('Click to preview'));
  if (!el) return false;
  el.click();
  return true;
}), 1200);

await measureAction('CLOSE CENTRE PREVIEW', () => page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^(Close|Cancel)$/i.test((b.innerText || '').trim()));
  if (!el) { document.body.click(); return true; }
  el.click();
  return true;
}), 1200);

/* l) THE LOG PANEL opening — does it move the board? */
await measureAction('OPEN LOG', () => pressText(/^Log$/), 900);
log('\n=== 4: THE LOG, opened ===');
log('  ' + JSON.stringify(await logProbe(), null, 1));
await shot('log-open');
await measureAction('CLOSE LOG', () => pressText(/^Hide log$/), 900);

/* ------------------------------------------- 3: SUPPORT ROW CLIP, three widths */

log('\n=== 3: ROW / BLOCK OVERFLOW ===');
for (const width of [1680, 1440, 1280]) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await sleep(1600);
  log(`\n  -- ${width}x900 --`);
  for (const row of await overflow()) log('    ' + JSON.stringify(row));
  await shot(`overflow-${width}`);
  log('    quads: ' + JSON.stringify((await quads()).seats.map(s => `${s.w}x${s.h} @${s.x},${s.y} (${s.pctW}%x${s.pctH}%)`)));
}

/* Now with the support block deliberately loaded, which is when it clips. */
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) {
    const ids = p.zones.library.filter(i => {
      const t = g.cards[i].typeLine || '';
      return /Artifact|Enchantment|Planeswalker/.test(t) && !/Creature/.test(t);
    }).slice(0, 6);
    for (const id of ids) window.__dmDispatch({ type: 'MOVE_ZONE', instanceId: id, to: 'battlefield' });
  }
});
await sleep(2000);
log('\n=== 3b: OVERFLOW WITH A LOADED SUPPORT BLOCK ===');
for (const width of [1680, 1440, 1280]) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await sleep(1600);
  log(`\n  -- ${width}x900 --`);
  for (const row of await overflow()) {
    if (/Artifact|Noncreature/.test(row.zone) || row.overRight > 0 || row.pastSeatRight > 0) log('    ' + JSON.stringify(row));
  }
  await shot(`support-${width}`);
}

/* And with everything on the board TAPPED, the painted-extent worst case. */
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
await sleep(1200);
const tapAll = await boxes();
await page.evaluate(() => {
  const g = window.__dmGame;
  for (const p of g.players) for (const id of p.zones.battlefield) {
    if (!g.cards[id].tapped) window.__dmDispatch({ type: 'TAP', instanceId: id });
  }
});
await sleep(2000);
log('\n=== 3c: EVERYTHING TAPPED at 1280 ===');
report('TAP EVERYTHING', diff(tapAll, await boxes()), Object.keys(tapAll).length);
for (const row of await overflow()) log('    ' + JSON.stringify(row));
await shot('all-tapped-1280');

/* ------------------------------------------------------- 5: mats at two widths */

for (const width of [1920, 1280]) {
  await page.setViewport({ width, height: Math.round(width * 0.5625), deviceScaleFactor: 1 });
  await sleep(1600);
  await shot(`mats-${width}`);
  log(`\n=== 5: MATS at ${width} ===`);
  for (const m of await matProbe()) log('  ' + JSON.stringify(m));
}

await browser.close();
process.exit(0);
