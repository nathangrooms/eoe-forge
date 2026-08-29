/**
 * Evidence run #2. Same harness, but this one ANSWERS the prompts the game
 * puts up (targeting, priority, blockers) instead of deadlocking on them, so
 * it reaches combat and an actual end of game.
 *
 * Also measures the crop question properly: object-fit:cover only crops when
 * the box aspect differs from the image's natural aspect. Run #1 flagged every
 * card as "cropped" on the strength of the property alone, which proves
 * nothing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/evidence2';
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const consoleErrors = [], pageErrors = [], netFails = [];

const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
page.on('pageerror', e => { pageErrors.push(e.message.slice(0, 300)); log('  [pageerror]', e.message.slice(0, 200)); });
page.on('console', m => { if (m.type() === 'error') { consoleErrors.push(m.text().slice(0, 300)); log('  [console.error]', m.text().slice(0, 200)); } });
page.on('requestfailed', r => netFails.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
page.on('response', r => { if (r.status() >= 400) netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });

const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,content){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('type','text/css');s.setAttribute('data-vite-dev-id',id);s.textContent=content;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=content;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('/@vite/client')) return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  return req.continue();
});

const shot = async name => {
  const f = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f }); log('  shot ->', f); return f;
};
const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')].find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true;
}, re.source);
const pressTitle = n => page.evaluate(n => {
  const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').includes(n));
  if (!el) return false; el.click(); return true;
}, n);
const game = () => page.evaluate(() => {
  const g = window.__dmGame; if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length, hand: p1.zones.hand.length,
    bf: p1.zones.battlefield.length, life: g.players.map(p => `${p.name}:${p.life}`).join(' ') };
});

/** THE CROP TEST. cover only crops when box aspect != natural aspect. */
const cropProbe = () => page.evaluate(() => {
  const out = [];
  for (const i of document.querySelectorAll('img')) {
    const r = i.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    if (!i.naturalWidth) continue;
    const cs = getComputedStyle(i);
    const boxAR = r.width / r.height;
    const natAR = i.naturalWidth / i.naturalHeight;
    const drift = Math.abs(boxAR - natAR) / natAR;
    out.push({
      alt: (i.alt || '').slice(0, 34), fit: cs.objectFit, filter: cs.filter,
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      nat: `${i.naturalWidth}x${i.naturalHeight}`,
      boxAR: +boxAR.toFixed(3), natAR: +natAR.toFixed(3),
      driftPct: +(drift * 100).toFixed(1),
      cropsPixels: cs.objectFit === 'cover' && drift > 0.02,
      desaturated: /grayscale|saturate\(0/.test(cs.filter),
    });
  }
  return out;
});

/** Is the hand clipped by the bottom of the window? */
const handProbe = () => page.evaluate(() => {
  const vh = window.innerHeight;
  const cards = [...document.querySelectorAll('button[title]')]
    .filter(b => (b.getAttribute('title') || '').includes('Click to preview'));
  const boxes = cards.map(c => { const r = c.getBoundingClientRect(); return { bottom: Math.round(r.bottom), h: Math.round(r.height) }; });
  const clipped = boxes.filter(b => b.bottom > vh);
  return { vh, handCards: boxes.length, clippedBelowFold: clipped.length,
    worstOverflowPx: boxes.length ? Math.max(0, ...boxes.map(b => b.bottom - vh)) : 0 };
});

/** Vertical budget: how much of the window each band eats. */
const bandProbe = () => page.evaluate(() => {
  const vh = window.innerHeight;
  const seats = [...document.querySelectorAll('[aria-label]')]
    .filter(e => /^Seat|^Battlefield|^Creatures|^Lands/.test(e.getAttribute('aria-label') || ''))
    .map(e => { const r = e.getBoundingClientRect(); return { label: e.getAttribute('aria-label').slice(0, 40), y: Math.round(r.y), h: Math.round(r.height), pctVh: Math.round(r.height / vh * 100) }; });
  return { vh, seats: seats.slice(0, 12) };
});

const actionBarProbe = () => page.evaluate(() => {
  const vh = window.innerHeight;
  const words = /^(END TURN|RESPOND|NEXT|Keep|Mulligan|Cast|Play land|Attack|Block|No attacks|No blocks|Done|Pass|Resolve|Continue|Do not cast it)$/i;
  return { vh, hits: [...document.querySelectorAll('button')].map(b => ({ b, t: (b.innerText || '').trim() }))
    .filter(x => words.test(x.t)).map(x => { const r = x.b.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return { text: x.t, cy: Math.round(r.y + r.height / 2), half: (r.y + r.height / 2) < vh / 2 ? 'TOP' : 'BOTTOM' }; }).filter(Boolean) };
});

const records = [];
const snapshot = async name => {
  const file = await shot(name);
  const crop = await cropProbe();
  const rec = { screen: name, file, game: await game(), actionBar: await actionBarProbe(),
    hand: await handProbe(), bands: await bandProbe(), panels: await panelProbe(),
    imgs: crop.length, cropping: crop.filter(c => c.cropsPixels), desat: crop.filter(c => c.desaturated),
    cropSample: crop.slice(0, 6) };
  log(`  [${name}] imgs ${rec.imgs} | CROPPING ${rec.cropping.length} | DESAT ${rec.desat.length} | hand ${rec.hand.handCards} clipped ${rec.hand.clippedBelowFold} (worst ${rec.hand.worstOverflowPx}px)`);
  log(`  [${name}] bar: ${rec.actionBar.hits.map(h => h.text + '@' + h.cy + ':' + h.half).join(', ') || 'none'}`);
  log(`  [${name}] panels open ${rec.panels.openPanels}, overlapping pairs ${rec.panels.overlaps.length}`);
  if (rec.panels.overlaps.length) log(`  [${name}] OVERLAP:`, JSON.stringify(rec.panels.overlaps.slice(0, 3)));
  records.push(rec); return rec;
};

/** Answer whatever prompt is blocking. Returns what it did. */
const unblock = async () => {
  // a targeting prompt: press a creature on the table
  const targeted = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    if (!/CHOOSE A TARGET|Choose a creature|Press a card on the table/i.test(txt)) return null;
    /* The real affordance is a button titled "Aim <spell> at <permanent>".
       Clicking the card element itself does nothing, which cost this driver a
       whole run that looked like the game had frozen on a target prompt. */
    const aim = [...document.querySelectorAll('button')]
      .find(b => !b.disabled && /^Aim /i.test(b.getAttribute('title') || ''));
    if (aim) { aim.click(); return 'aimed:' + (aim.getAttribute('title') || '').slice(0, 46); }
    const skip = [...document.querySelectorAll('button')].find(b => /Do not cast it/i.test(b.innerText || ''));
    if (skip) { skip.click(); return 'declined-cast'; }
    return 'target-prompt-stuck';
  });
  if (targeted) { await sleep(700); return targeted; }
  if (await pressText(/^LET IT RESOLVE$/)) return 'let-it-resolve';
  /* A card preview left open hides the whole top action bar, so nothing can be
     advanced until it is dismissed. Close it before looking for the CTA. */
  const closed = await page.evaluate(() => {
    const hasBar = [...document.querySelectorAll('button')].some(b => /^(END TURN|RESPOND|NO BLOCKS|NO ATTACKS)$/i.test((b.innerText || '').trim()));
    if (hasBar) return false;
    const x = [...document.querySelectorAll('button')].find(b => /Close the preview/i.test(b.getAttribute('title') || b.innerText || ''));
    if (!x) return false; x.click(); return true;
  });
  if (closed) { await sleep(500); return 'closed-preview'; }
  /* Press the primary CTA whatever it is called. Chasing labels one regex at a
     time made two runs look like the game had deadlocked when it had simply
     asked a question this driver did not recognise. */
  const primary = await pressPrimary();
  if (primary) return 'primary:' + primary;
  return null;
};

/** The top-right primary action button, by position rather than by label. */
const pressPrimary = () => page.evaluate(() => {
  const vw = window.innerWidth;
  const cands = [...document.querySelectorAll('button')].filter(b => {
    if (b.disabled) return false;
    const r = b.getBoundingClientRect();
    return r.height > 20 && r.y < 70 && (r.x + r.width) > vw * 0.78;
  });
  if (!cands.length) return null;
  const el = cands.sort((a, c) => c.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const label = (el.innerText || '').trim();
  el.click();
  return label || 'unlabelled';
});

/** Every panel that is open at once, with its stacking order and overlaps. */
const panelProbe = () => page.evaluate(() => {
  const cand = [...document.querySelectorAll('div,section,aside')].filter(e => {
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (r.width < 220 || r.height < 120) return false;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const bg = cs.backgroundColor;
    return bg !== 'rgba(0, 0, 0, 0)' || cs.backdropFilter !== 'none';
  });
  // keep only outermost of each nest
  const tops = cand.filter(e => !cand.some(o => o !== e && o.contains(e)));
  const boxes = tops.map(e => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 58),
      z: cs.zIndex, pos: cs.position,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (ox > 40 && oy > 40) overlaps.push({ a: a.text.slice(0, 30), b: b.text.slice(0, 30), areaPx: ox * oy });
  }
  return { openPanels: boxes.length, boxes, overlaps };
});

/* ------------------------------------------------------------------- run */
log('== open ==');
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);

await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
await sleep(1800);
await snapshot('deck-selection');
/* the deck step must be answered before Start becomes live */
log('  chose deck:', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
  if (!b) return false; b.click(); return true; }));
await sleep(1500);
await snapshot('table-seats');
for (let i = 0; i < 6; i++) {
  if (await pressText(/Start .*game/)) { log('  start pressed on try', i); break; }
  await pressText(/Choose opponents|Continue|Next/);
  await sleep(1000);
}
await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
await sleep(3000);
await pressText(/^Keep$/); await sleep(1200);
await pressTitle('Game menu'); await sleep(1200);
await pressTitle('Ignore mana entirely'); await sleep(600);
await pressTitle('Close the menu'); await sleep(600);

const handTitles = () => page.evaluate(() => [...document.querySelectorAll('button[title]')]
  .map(e => e.getAttribute('title')).filter(t => t && t.includes('Click to preview')));
const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false; el.click(); return true; }, t);

log('== play turns ==');
let sawStack = false, sawCombat = false;
for (let turn = 0; turn < 10; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(400); await pressText(/^Play land$/); await sleep(600); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 3)) {
    await clickHand(t); await sleep(350);
    if (await pressText(/^Cast$/)) {
      await sleep(300);
      const g = await game();
      if (!sawStack && g && g.stack > 0) { await snapshot('stack-populated'); sawStack = true; }
      for (let k = 0; k < 4; k++) { const did = await unblock(); if (!did) break; log('    unblock:', did); }
      await sleep(500);
    }
  }
  await page.evaluate(() => document.body.click()); await sleep(300);

  // walk phases so combat is reached rather than skipped
  for (let p = 0; p < 6; p++) {
    const g = await game();
    if (g && /combat|attack|block|declare/i.test(g.step || '')) {
      if (!sawCombat) { await snapshot('combat-step'); sawCombat = true; }
      const atk = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^Attack/i.test(x.getAttribute('title') || '') || /^(Attack|All attack|Declare attackers)$/i.test((x.innerText || '').trim()));
        if (!b) return false; b.click(); return true; });
      if (atk) { await sleep(900); await snapshot('combat-attackers-declared'); }
      break;
    }
    if (!(await pressText(/^NEXT$/))) break;
    await sleep(900);
    for (let k = 0; k < 3; k++) { if (!(await unblock())) break; }
  }

  const g = await game();
  log(`  T${g?.turn} ${g?.step} stack=${g?.stack} bf=${g?.bf} ${g?.life}`);
  if (g && g.status !== 'playing') break;
  await pressText(/^END TURN$/);
  await sleep(6000);
  for (let k = 0; k < 4; k++) { if (!(await unblock())) break; }
}
await sleep(1200);
await snapshot('midgame-populated');

log('== drive to an end ==');
let lastSig = '', stuckFor = 0;
for (let i = 0; i < 200; i++) {
  const g = await game();
  if (!g || g.status !== 'playing') { log('  game ended, status', g && g.status); break; }
  const sig = `${g.turn}/${g.step}/${g.stack}/${g.life}`;
  stuckFor = sig === lastSig ? stuckFor + 1 : 0;
  lastSig = sig;
  if (stuckFor === 20) {
    log('  !! no state change for 20 presses at', sig);
    await snapshot('stuck-state');
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && !b.disabled; })
      .map(b => ((b.innerText || '').trim() || b.getAttribute('title') || '?').slice(0, 40)).slice(0, 40));
    log('  buttons offered:', JSON.stringify(btns));
    break;
  }
  const did = await unblock();
  if (i % 10 === 0) log(`  i${i} T${g.turn} ${g.step} stack=${g.stack} ${g.life} -> ${did}`);
  await sleep(1000);
}
await sleep(1500);
await snapshot('end-state');

const report = { finalGame: await game(),
  consoleErrors: [...new Set(consoleErrors)], pageErrors: [...new Set(pageErrors)],
  netFails: [...new Set(netFails)].slice(0, 40), records };
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
log('\nwrote', `${OUT}/report.json`);
log('final:', JSON.stringify(report.finalGame));
log('console errors', report.consoleErrors.length, 'page errors', report.pageErrors.length, 'net fails', report.netFails.length);
await browser.close();
