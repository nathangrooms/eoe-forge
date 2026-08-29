/**
 * ONE WALK THROUGH PLAY MODE, MEASURING AT EVERY SCREEN.
 *
 * Written for the "get evidence" pass. It opens the shipped Play page through
 * the project's own auth-free harness, plays a real game against bots, and at
 * each distinct screen records a screenshot plus the six answers the owner
 * asked for. Nothing here is answered from reading source.
 *
 * Measurement notes, each one paid for by an earlier pass getting it wrong:
 *  - A hand card is ROTATED for the fan. getBoundingClientRect returns the
 *    axis-aligned envelope of a rotated box and lies about aspect ratio, so
 *    the crop test reads offsetWidth/offsetHeight and object-fit instead.
 *  - Desaturation is checked on the img AND every ancestor, because a
 *    saturate(0) on a WRAPPER is what was really found on this project once.
 *  - "Action bar at the top" is answered by the Y of the buttons that drive
 *    the turn, not by which component file they live in.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { BASE, sleep, pressText, unblock, gameState } from './uiLib.mjs';

const W = 1600, H = 1000;
const OUT = '.shots/evidence-walk';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const health = { console: [], page: [], net: [] };
const screens = [];

async function openPage(browser, path) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  page.on('pageerror', e => health.page.push(e.message.slice(0, 240)));
  page.on('console', m => { if (m.type() === 'error') health.console.push(m.text().slice(0, 240)); });
  page.on('requestfailed', r => health.net.push(`${r.failure()?.errorText} ${r.url().slice(0, 130)}`));
  page.on('response', r => { if (r.status() >= 400) health.net.push(`HTTP ${r.status()} ${r.url().slice(0, 130)}`); });
  await page.setRequestInterception(true);
  page.on('request', r => r.url().includes('/@vite/client')
    ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
  return page;
}

/* ------------------------------------------------------------------ probes */

const MEASURE = page => page.evaluate(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const text = document.body.innerText || '';

  /* --- ASK 1: where do the turn-driving controls sit? --- */
  const TURN = /^(END TURN|NEXT|RESPOND|NO BLOCKS|NO ATTACKS|ATTACK|BLOCK|PASS|KEEP|MULLIGAN|DONE|CONFIRM ATTACK|LET IT RESOLVE|DECLARE)/i;
  const actionButtons = [...document.querySelectorAll('button')]
    .filter(b => TURN.test((b.innerText || '').trim()))
    .map(b => { const r = b.getBoundingClientRect(); return { label: (b.innerText || '').trim().slice(0, 24), y: Math.round(r.y), h: Math.round(r.height), x: Math.round(r.x) }; })
    .filter(b => b.h > 8);

  /* --- ASK 3: any friends list on screen? --- */
  const friends = [...document.querySelectorAll('*')].filter(el => {
    if (el.children.length > 0) return false;
    return /^(friends|friend list|add friend|online now)$/i.test((el.textContent || '').trim());
  }).map(el => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim(), y: Math.round(r.y), vis: r.width > 0 && r.height > 0 }; });

  /* --- ASK 4: card images whole and in colour? --- */
  const imgs = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) continue;
    const src = img.currentSrc || img.src || '';
    if (!/scryfall|\.png|\.jpg|\.jpeg|\.webp/i.test(src)) continue;
    const cs = getComputedStyle(img);
    const boxW = img.offsetWidth || r.width, boxH = img.offsetHeight || r.height;
    const natural = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
    let el = img, greyBy = null, d = 0;
    while (el && d < 14) {
      const s = getComputedStyle(el);
      const f = `${s.filter || ''} ${s.webkitFilter || ''}`;
      if (/grayscale\(\s*(?!0\s*\))|saturate\(\s*0*(\.0+)?\s*\)/.test(f)) { greyBy = `${el.tagName}.${String(el.className).slice(0, 50)} :: ${f.trim()}`; break; }
      el = el.parentElement; d++;
    }
    imgs.push({
      src: src.slice(-46), fit: cs.objectFit, boxAR: boxH ? +(boxW / boxH).toFixed(3) : null,
      natAR: natural ? +natural.toFixed(3) : null, grey: greyBy,
      cropped: cs.objectFit === 'cover' && natural && boxH ? Math.abs(boxW / boxH - natural) > 0.06 : false,
    });
  }

  /* --- ASK 5: is the window width used? --- */
  let widest = 0, widestSel = '';
  for (const el of document.querySelectorAll('main, section, div')) {
    const r = el.getBoundingClientRect();
    if (r.height < 200 || r.top > vh) continue;
    if (r.width > widest) { widest = r.width; widestSel = `${el.tagName}.${String(el.className).slice(0, 60)}`; }
  }
  // rightmost painted pixel of any sizeable element
  let rightMost = 0;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20 || r.top > vh || r.bottom < 0) continue;
    if (r.right > rightMost && r.right <= vw + 2) rightMost = r.right;
  }

  const g = window.__dmGame;
  return {
    vw, vh, actionButtons, friends,
    imgCount: imgs.length,
    cropped: imgs.filter(i => i.cropped),
    greyed: imgs.filter(i => i.grey),
    widest: Math.round(widest), widestSel, rightMost: Math.round(rightMost),
    hasChatComposer: !!document.querySelector('textarea, input[type=text]'),
    game: g ? { turn: g.turn, step: g.step, status: g.status, stack: (g.stack || []).length,
      hand: g.players[0]?.zones.hand.length, bf: g.players.map(p => p.zones.battlefield.length),
      life: g.players.map(p => `${p.name}:${p.life}`).join(' ') } : null,
    textHead: text.slice(0, 400).replace(/\n{2,}/g, '\n'),
  };
});

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const n = String(screens.length).padStart(2, '0');
  const file = `${OUT}/${n}-${name}.png`;
  await page.screenshot({ path: file });
  const m = await MEASURE(page);
  screens.push({ name, file, ...m });
  console.log(`\n=== [${n}] ${name} -> ${file}`);
  console.log(`    game: ${m.game ? JSON.stringify(m.game) : 'none'}`);
  console.log(`    action buttons (label@y): ${m.actionButtons.map(b => `${b.label}@${b.y}`).join(' | ') || 'NONE'}`);
  console.log(`    friends elements: ${m.friends.length ? JSON.stringify(m.friends) : 'NONE'}`);
  console.log(`    card imgs: ${m.imgCount}  cropped: ${m.cropped.length}  greyed: ${m.greyed.length}`);
  if (m.cropped.length) console.log(`      CROP: ${JSON.stringify(m.cropped.slice(0, 4))}`);
  if (m.greyed.length) console.log(`      GREY: ${JSON.stringify(m.greyed.slice(0, 4))}`);
  console.log(`    widest block: ${m.widest}/${m.vw}px (${m.widestSel})  rightmost painted: ${m.rightMost}`);
  return m;
}

/* -------------------------------------------------------------------- walk */

const run = async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 300000,
    args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
  });

  const page = await openPage(browser, 'play-harness.html');

  await shot(page, 'play-landing-modewall');

  // step one: pick versus bots
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(2000);
  await shot(page, 'deck-select');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
    if (b) b.click();
  });
  await sleep(1500);
  await shot(page, 'seat-select');

  await pressText(page, /Start .*game/);
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
  await sleep(3000);
  await shot(page, 'mulligan');

  await pressText(page, /^Keep$/);
  await sleep(2500);
  await shot(page, 'board-turn-one');

  // Play forward, capturing the first time we see a populated stack and combat.
  let sawStack = false, sawCombat = false, sawBoard = false;
  for (let i = 0; i < 260; i++) {
    const g = await gameState(page);
    if (!g) break;
    if (g.status === 'complete') break;
    if (!sawStack && g.stack > 0) { sawStack = true; await shot(page, 'stack-populated'); }
    if (!sawCombat && /combat|attack|block/i.test(g.step || '')) { sawCombat = true; await shot(page, 'combat'); }
    if (!sawBoard && g.bf >= 5 && g.turn >= 4) { sawBoard = true; await shot(page, 'board-midgame'); }
    if (sawStack && sawCombat && sawBoard && g.turn >= 9) break;
    await unblock(page);
    await sleep(300);
  }

  const mid = await gameState(page);
  console.log(`\n    after loop: ${JSON.stringify(mid)}`);
  if (!sawStack) console.log('    NOTE: stack never held anything during this walk');
  if (!sawCombat) console.log('    NOTE: never entered a combat step during this walk');
  if (!sawBoard) console.log('    NOTE: battlefield never reached 5 permanents by turn 4');

  await shot(page, 'board-late');

  // Interactivity: can a hand card be pressed, and does anything happen?
  const before = await gameState(page);
  const clicked = await page.evaluate(() => {
    const hand = [...document.querySelectorAll('[data-zone="hand"] img, [data-hand-card], .hand img')];
    const el = hand[Math.floor(hand.length / 2)];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    el.closest('button, [role=button], div')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { tag: el.tagName, y: Math.round(r.y) };
  });
  await sleep(1200);
  await shot(page, 'hand-card-pressed');
  console.log(`    hand press: ${JSON.stringify(clicked)} before=${JSON.stringify(before)}`);

  // run to the end
  for (let i = 0; i < 400; i++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    await unblock(page);
    await sleep(220);
  }
  await shot(page, 'game-end');

  /* ------------------------------------------------------- lobby, separately */
  const lobby = await openPage(browser, 'lobby-harness.html');
  await shot(lobby, 'lobby');
  const lobbyShape = await lobby.evaluate(() => {
    const t = document.body.innerText || '';
    return {
      composer: [...document.querySelectorAll('textarea, input')].map(e => ({
        tag: e.tagName, ph: e.placeholder || '', y: Math.round(e.getBoundingClientRect().y),
        h: Math.round(e.getBoundingClientRect().height),
      })),
      forumWords: ['topic', 'reply', 'replies', 'thread', 'board', 'post', 'discussion']
        .filter(w => new RegExp(`\\b${w}`, 'i').test(t)),
      chatWords: ['message', 'chat', 'say something', 'send']
        .filter(w => new RegExp(`\\b${w}`, 'i').test(t)),
      friends: /friend/i.test(t),
      head: t.slice(0, 700),
    };
  });
  console.log('\n=== LOBBY SHAPE ===');
  console.log(JSON.stringify(lobbyShape, null, 2));

  console.log('\n=== HEALTH ===');
  console.log(`pageerrors ${health.page.length}, console errors ${health.console.length}, net failures ${health.net.length}`);
  [...new Set(health.page)].slice(0, 20).forEach(e => console.log('  PAGEERROR ' + e));
  [...new Set(health.console)].slice(0, 30).forEach(e => console.log('  CONSOLE   ' + e));
  [...new Set(health.net)].slice(0, 30).forEach(e => console.log('  NET       ' + e));

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ screens, lobbyShape, health }, null, 2));
  console.log(`\nwrote ${OUT}/report.json  (${screens.length} screens)`);
  await browser.close();
};

run().catch(e => { console.error('WALK FAILED', e); process.exit(1); });
