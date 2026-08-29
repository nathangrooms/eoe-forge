/**
 * CAN A PERSON ACTUALLY DO THINGS? And the three specific claims from the walk.
 *
 * The evidence walk drove the game with END TURN only, so it proved the game
 * RUNS and proved nothing about whether a player can act. This probe presses
 * the things a player presses: a land in hand, a creature on the table, the
 * attack control, the block control. It also settles three claims by DOM
 * measurement rather than by looking at a picture:
 *
 *   A. does the stack slot contain an <img>, or is it an empty box
 *   B. is the hand clipped by the bottom of the window
 *   C. do battlefield cards overlap each other
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { BASE, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const W = 1600, H = 1000, OUT = '.shots/interact';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

/* A. the stack slot */
const STACK = page => page.evaluate(() => {
  const label = [...document.querySelectorAll('*')].find(e =>
    e.children.length === 0 && /^THE STACK$/i.test((e.textContent || '').trim()));
  if (!label) return { present: false };
  let panel = label;
  for (let i = 0; i < 6 && panel.parentElement; i++) {
    panel = panel.parentElement;
    if (panel.getBoundingClientRect().height > 150) break;
  }
  const r = panel.getBoundingClientRect();
  const imgs = [...panel.querySelectorAll('img')].map(i => ({
    src: (i.currentSrc || i.src || '').slice(-50), w: Math.round(i.getBoundingClientRect().width),
    complete: i.complete, nat: i.naturalWidth,
  }));
  return { present: true, box: [Math.round(r.width), Math.round(r.height)], imgCount: imgs.length, imgs,
    text: (panel.innerText || '').replace(/\n+/g, ' | ').slice(0, 160) };
});

/* B. is the hand clipped by the viewport bottom */
const HAND = page => page.evaluate(() => {
  const vh = window.innerHeight;
  const cards = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 60 || r.height < 60) continue;
    if (r.top < vh * 0.72) continue;                 // hand band only
    cards.push({ top: Math.round(r.top), bottom: Math.round(r.bottom),
      cutBy: Math.round(Math.max(0, r.bottom - vh)),
      hiddenPct: Math.round(Math.max(0, r.bottom - vh) / r.height * 100) });
  }
  cards.sort((a, b) => a.top - b.top);
  return { vh, count: cards.length, clipped: cards.filter(c => c.cutBy > 2).length,
    worstHiddenPct: cards.reduce((m, c) => Math.max(m, c.hiddenPct), 0), sample: cards.slice(0, 6) };
});

/* C. battlefield overlap */
const OVERLAP = page => page.evaluate(() => {
  const vh = window.innerHeight;
  const boxes = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    if (r.top > vh * 0.72) continue;                  // exclude the hand
    if (r.width > 260) continue;                      // exclude the big preview
    boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom });
  }
  let pairs = 0, worst = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ow = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    const oh = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    if (ow > 2 && oh > 2) {
      pairs++;
      const frac = (ow * oh) / Math.min(a.w * a.h, b.w * b.h);
      if (frac > worst) worst = frac;
    }
  }
  return { cards: boxes.length, overlappingPairs: pairs, worstOverlapPct: Math.round(worst * 100) };
});

/* what is clickable in hand, really */
const HAND_TARGETS = page => page.evaluate(() => {
  const vh = window.innerHeight;
  const out = [];
  for (const el of document.querySelectorAll('button, [role=button], [draggable=true], [data-card-id], [data-card]')) {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.72 || r.width < 50) continue;
    out.push({ tag: el.tagName, cls: String(el.className).slice(0, 44),
      attrs: el.getAttributeNames().slice(0, 8).join(','),
      label: (el.getAttribute('title') || el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 46),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
  }
  return out;
});

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.setRequestInterception(true);
  const badImages = [];
  page.on('response', r => {
    if (/scryfall/.test(r.url()) && r.status() >= 400) badImages.push(`HTTP ${r.status()} ${r.url().slice(-70)}`);
  });
  page.on('request', r => r.url().includes('/@vite/client')
    ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
  await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);

  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || '')); if (b) b.click(); });
  await sleep(1800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || '')); if (b) b.click(); });
  await sleep(1400);
  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(2500);
  await pressText(page, /^Keep$/);
  await sleep(2500);

  console.log('=== B. HAND CLIPPING at turn 1 ===');
  console.log(JSON.stringify(await HAND(page), null, 2));

  console.log('\n=== WHAT IS CLICKABLE IN THE HAND BAND ===');
  const targets = await HAND_TARGETS(page);
  console.log(`${targets.length} candidates`);
  targets.slice(0, 10).forEach(t => console.log('  ' + JSON.stringify(t)));

  /* --- try to play a land, the single most basic action in Magic --- */
  const before = await gameState(page);
  console.log('\n=== PLAY A LAND ===');
  console.log('before ' + JSON.stringify(before));

  // find the DOM node for a land in hand and click it the way a person would
  const landClick = await page.evaluate(() => {
    const vh = window.innerHeight;
    const imgs = [...document.querySelectorAll('img')].filter(i => {
      const r = i.getBoundingClientRect();
      return r.top > vh * 0.72 && r.width > 60;
    });
    const alts = imgs.map(i => i.alt || i.getAttribute('alt') || '');
    const idx = alts.findIndex(a => /plains|island|swamp|mountain|forest/i.test(a));
    const target = idx >= 0 ? imgs[idx] : imgs[0];
    if (!target) return { ok: false, why: 'no hand imgs', alts };
    const r = target.getBoundingClientRect();
    return { ok: true, alt: target.alt, alts: alts.slice(0, 14),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + Math.min(r.height / 2, (vh - r.top) / 2)) };
  });
  console.log('hand image scan: ' + JSON.stringify(landClick));
  if (landClick.ok) {
    await page.mouse.click(landClick.cx, landClick.cy);
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/01-after-hand-click.png` });
    console.log('after click ' + JSON.stringify(await gameState(page)));
    const prompt = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('button')].filter(b => {
        const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 16;
      }).map(b => (b.innerText || '').trim().slice(0, 30)).filter(Boolean);
      return { buttons: [...new Set(bs)].slice(0, 24) };
    });
    console.log('buttons now: ' + JSON.stringify(prompt));
    // press whatever offers to play it
    const played = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => /^(PLAY|PLAY LAND|CAST|PUT IT ONTO|Play it|Cast it)/i.test((x.innerText || '').trim()));
      if (!b) return null; b.click(); return (b.innerText || '').trim();
    });
    console.log('pressed play control: ' + JSON.stringify(played));
    await sleep(1600);
    await page.screenshot({ path: `${OUT}/02-after-play.png` });
    const after = await gameState(page);
    console.log('after play ' + JSON.stringify(after));
    console.log(`>>> LAND PLAYED? battlefield ${before.bf} -> ${after.bf}, hand ${before.hand} -> ${after.hand}`);
  }

  /* --- run to a real combat where WE attack --- */
  console.log('\n=== COMBAT ===');
  let attacked = null, blocked = null;
  for (let i = 0; i < 300; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (!attacked && g.active === 'p1' && /declare_attack/.test(g.step)) {
      await page.screenshot({ path: `${OUT}/03-declare-attackers.png` });
      attacked = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('button')].filter(b => !b.disabled)
          .map(b => (b.innerText || '').trim()).filter(Boolean);
        return [...new Set(bs)].slice(0, 20);
      });
      console.log('at declare_attackers, buttons: ' + JSON.stringify(attacked));
    }
    if (!blocked && g.active !== 'p1' && /declare_block/.test(g.step)) {
      await page.screenshot({ path: `${OUT}/04-declare-blockers.png` });
      blocked = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('button')].filter(b => !b.disabled)
          .map(b => (b.innerText || '').trim()).filter(Boolean);
        return { buttons: [...new Set(bs)].slice(0, 20), text: (document.body.innerText || '').slice(0, 300).replace(/\n+/g, ' | ') };
      });
      console.log('at declare_blockers, ' + JSON.stringify(blocked));
    }
    if (g.stack > 0) {
      const s = await STACK(page);
      if (s.present) {
        console.log('\n=== A. THE STACK PANEL ===');
        console.log(JSON.stringify(s, null, 2));
        await page.screenshot({ path: `${OUT}/05-stack.png` });
      }
    }
    if (attacked && blocked) break;
    await unblock(page);
    await sleep(280);
  }

  const gLate = await gameState(page);
  console.log('\nlate state ' + JSON.stringify(gLate));
  console.log('\n=== C. BATTLEFIELD OVERLAP (late) ===');
  console.log(JSON.stringify(await OVERLAP(page), null, 2));
  console.log('\n=== B. HAND CLIPPING (late) ===');
  console.log(JSON.stringify(await HAND(page), null, 2));
  await page.screenshot({ path: `${OUT}/06-late.png` });

  console.log('\n=== FAILED SCRYFALL IMAGE REQUESTS ===');
  console.log(badImages.length ? [...new Set(badImages)].join('\n') : 'none');
  console.log('\n=== ERRORS ===');
  console.log(errs.length ? [...new Set(errs)].slice(0, 20).join('\n') : 'none');
  await browser.close();
};
run().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
