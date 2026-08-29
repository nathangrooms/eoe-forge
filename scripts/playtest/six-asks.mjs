/**
 * THE OWNER'S SIX ASKS, EACH ANSWERED YES OR NO WITH A MEASUREMENT.
 *
 *   1. action bar at the TOP
 *   2. lobby reads as a CHAT BOX, not a forum
 *   3. friends list in the play section
 *   4. FULL card images, never cropped, never desaturated
 *   5. FULL WIDTH, no narrow column stranded in a wide window
 *   6. fully interactive
 *
 * Every answer is a number read off the live DOM at 1600x1000, plus a
 * screenshot. Nothing is answered from reading source.
 *
 * ON MEASURING A CARD IMAGE, because three earlier passes on this project each
 * got this wrong in the same way: a hand card is ROTATED for the fan, and
 * `getBoundingClientRect` returns the AXIS-ALIGNED box of a rotated element.
 * Comparing that box's ratio to the card's natural ratio "finds" cropping that
 * is not there. So the crop test reads the element's own untransformed
 * `offsetWidth/offsetHeight` and the computed `object-fit`, and it checks
 * `filter`/`-webkit-filter` for desaturation on the image AND on every ancestor,
 * because a `saturate(0)` on a wrapper is what was actually found and removed
 * on this project once before.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = '.shots/six-asks';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

const W = 1600, H = 1000;

async function openPage(browser, path) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const health = { console: [], page: [], net: [] };
  page.on('pageerror', e => health.page.push(e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') health.console.push(m.text().slice(0, 200)); });
  page.on('requestfailed', r => health.net.push(`${r.failure()?.errorText} ${r.url().slice(0, 120)}`));
  page.on('response', r => { if (r.status() >= 400) health.net.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });
  await page.setRequestInterception(true);
  page.on('request', r => r.url().includes('/@vite/client')
    ? r.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB }) : r.continue());
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await sleep(6000); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
  return { page, health };
}

/* ---------------------------------------------------------------- measures */

/** ASK 4: every card image on screen, whole and in colour? */
const CARD_IMAGES = page => page.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;
    const src = img.currentSrc || img.src || '';
    if (!/scryfall|cards\.scryfall|card|\.png|\.jpg|\.jpeg|\.webp/i.test(src)) continue;
    const cs = getComputedStyle(img);

    // Untransformed layout box. A rotated fan card's client rect is the
    // axis-aligned envelope and lies about the aspect ratio.
    const boxW = img.offsetWidth || r.width;
    const boxH = img.offsetHeight || r.height;
    const natural = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
    const boxAR = boxH ? boxW / boxH : null;

    // Desaturation anywhere up the tree.
    let el = img, greyBy = null, depth = 0;
    while (el && depth < 12) {
      const s = getComputedStyle(el);
      const f = `${s.filter || ''} ${s.webkitFilter || ''} ${s.backdropFilter || ''}`;
      if (/grayscale|saturate\(\s*0*(\.0+)?\s*\)|saturate\(0/.test(f)) { greyBy = `${el.tagName}.${String(el.className).slice(0, 40)} :: ${f.trim()}`; break; }
      el = el.parentElement; depth += 1;
    }

    out.push({
      src: src.slice(-70), objectFit: cs.objectFit, objectPosition: cs.objectPosition,
      boxW, boxH, boxAR: boxAR ? Number(boxAR.toFixed(4)) : null,
      natural: natural ? Number(natural.toFixed(4)) : null,
      naturalPx: `${img.naturalWidth}x${img.naturalHeight}`,
      complete: img.complete, greyBy,
      /* Cropping only happens with `cover` AND a box whose ratio differs from
         the image's own. `contain` and `fill` never cut. */
      cropped: cs.objectFit === 'cover' && natural && boxAR ? Math.abs(boxAR - natural) > 0.02 : false,
      drift: natural && boxAR ? Number(Math.abs(boxAR - natural).toFixed(4)) : null,
    });
  }
  return out;
});

/** ASK 5: does the page fill the window? */
const WIDTH = page => page.evaluate(() => {
  const vw = window.innerWidth;
  const body = document.body.getBoundingClientRect();
  let widest = 0, widestSel = '';
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.height < 200) continue;
    if (r.width > widest) { widest = r.width; widestSel = el.tagName + '.' + String(el.className).slice(0, 50); }
  }
  const root = document.getElementById('root');
  return {
    viewport: vw,
    rootWidth: root ? Math.round(root.getBoundingClientRect().width) : null,
    rootPct: root ? Number(((root.getBoundingClientRect().width / vw) * 100).toFixed(1)) : null,
    widestTallBlock: Math.round(widest), widestSel,
    horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    bodyWidth: Math.round(body.width),
  };
});

/** ASK 1: is the primary action bar at the top? */
const BAR = page => page.evaluate(() => {
  const vh = window.innerHeight;
  const primary = [];
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.width < 40 || r.height < 24) continue;
    const t = (b.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    // The controls that MOVE THE GAME, by name.
    if (!/^(END TURN|ATTACK|DECLARE ATTACKERS|DECLARE BLOCKERS|NO ATTACKS|NO BLOCKS|ATTACK WITH \d+|CONFIRM \d+ BLOCKS?|RESPOND|LET IT RESOLVE|KEEP THIS HAND|MULLIGAN|KEEP|DAMAGE ORDER|GAME OVER|[A-Z][a-z]+'S TURN)$/i.test(t)) continue;
    primary.push({ text: t, y: Math.round(r.y), fromTop: Math.round(r.y), fromBottom: Math.round(vh - (r.y + r.height)), half: r.y + r.height / 2 < vh / 2 ? 'top' : 'bottom' });
  }
  const phasePills = [...document.querySelectorAll('*')]
    .filter(e => /^(Beginning|Main 1|Combat|Main 2|End|Declare Attackers|Declare Blockers|Untap)$/.test((e.textContent || '').trim()) && e.children.length === 0)
    .map(e => ({ t: e.textContent.trim(), y: Math.round(e.getBoundingClientRect().y) }));
  return { viewportHeight: vh, primary, phasePills };
});

/* ------------------------------------------------------------------- main */

const report = { viewport: `${W}x${H}`, asks: {} };
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'] });

/* ---- the play landing: modes, friends, full width, card art ---- */
{
  const { page, health } = await openPage(browser, 'play-harness.html');
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/01-play-landing.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/02-play-landing-full.png`, fullPage: true });

  const friends = await page.evaluate(() => {
    const hits = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && /friend/i.test(e.textContent || ''))
      .map(e => ({ text: (e.textContent || '').trim().slice(0, 60), y: Math.round(e.getBoundingClientRect().y), tag: e.tagName }));
    return { count: hits.length, hits: hits.slice(0, 10), bodyHasFriends: /friend/i.test(document.body.innerText || '') };
  });
  report.asks.friendsOnPlay = { ...friends, width: await WIDTH(page), shot: `${OUT}/01-play-landing.png` };
  report.asks.landingWidth = await WIDTH(page);
  report.asks.landingHealth = { console: health.console.length, page: health.page.length, net: [...new Set(health.net)].length };
  await page.close();
}

/* ---- the table: bar position, card art, width, interactivity ---- */
{
  const { page, health } = await openPage(browser, 'play-harness.html');
  const press = src => page.evaluate(s => {
    const re = new RegExp(s, 'i');
    const b = [...document.querySelectorAll('button')].find(x => !x.disabled && re.test((x.innerText || '').replace(/\s+/g, ' ').trim()));
    if (!b) return null; const l = (b.innerText || '').replace(/\s+/g, ' ').trim(); b.click(); return l;
  }, src);
  await press('VERSUS BOTS'); await sleep(2200);
  await press('Choose opponents'); await sleep(2200);
  await press('Start .*game');
  await page.waitForFunction('!!window.__dmGame', { timeout: 180000, polling: 400 });
  await sleep(3000);
  await page.screenshot({ path: `${OUT}/10-opening-hand.png` });
  report.asks.openingHandCards = await CARD_IMAGES(page);
  await press('KEEP THIS HAND'); await sleep(2500);
  await page.screenshot({ path: `${OUT}/11-turn-one.png` });

  report.asks.barTurnOne = await BAR(page);
  report.asks.tableWidth = await WIDTH(page);
  report.asks.cardsTurnOne = await CARD_IMAGES(page);

  // Play out a few turns so the board fills and the art count grows.
  for (let i = 0; i < 190; i += 1) {
    const s = await page.evaluate(() => {
      const g = window.__dmGame; if (!g) return null;
      return { turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status };
    });
    if (!s || s.status === 'complete' || s.turn >= 12) break;
    const landOpened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => !x.disabled && /You can play this as a land drop/.test(x.getAttribute('title') || ''));
      if (!b) return null; b.click(); return b.getAttribute('title');
    });
    if (landOpened) {
      await sleep(400); await press('^PLAY LAND$'); await sleep(500);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
      await sleep(300); continue;
    }
    const castOpened = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => !x.disabled && / You can cast this\./.test(x.getAttribute('title') || ''));
      if (!b) return null; b.click(); return b.getAttribute('title');
    });
    if (castOpened) {
      await sleep(450); const c = await press('^CAST$'); await sleep(600);
      await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Close the preview/i.test(x.getAttribute('title') || '')); if (b) b.click(); });
      await sleep(300); if (c) continue;
    }
    if (await press('^LET IT RESOLVE$')) { await sleep(400); continue; }
    if (/main/.test(s.step) && s.active === 'p1') { if (await press('^END TURN$')) { await sleep(500); continue; } }
    await sleep(280);
  }

  await page.screenshot({ path: `${OUT}/12-midgame.png` });
  report.asks.cardsMidgame = await CARD_IMAGES(page);
  report.asks.barMidgame = await BAR(page);
  report.asks.midgameWidth = await WIDTH(page);
  report.asks.midgameState = await page.evaluate(() => {
    const g = window.__dmGame;
    return g ? { turn: g.turn, step: g.step, life: g.players.map(p => `${p.name}:${p.life}`).join(' ') } : null;
  });
  report.asks.tableHealth = { console: [...new Set(health.console)], page: [...new Set(health.page)], net: [...new Set(health.net)] };
  await page.close();
}

/* ---- the lobby: chat box or forum ---- */
{
  const { page, health } = await openPage(browser, 'lobby-harness.html');
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/20-lobby.png` });
  await page.screenshot({ path: `${OUT}/21-lobby-full.png`, fullPage: true });

  report.asks.lobby = await page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/\s+/g, ' ');
    const composer = [...document.querySelectorAll('textarea, input[type=text]')].map(e => ({
      tag: e.tagName, placeholder: e.placeholder || '', y: Math.round(e.getBoundingClientRect().y),
      w: Math.round(e.getBoundingClientRect().width),
    }));
    // A chat box: one column of messages, newest at the bottom, composer last.
    const msgs = [...document.querySelectorAll('[class*=message], [class*=post], li, article')]
      .map(e => ({ y: Math.round(e.getBoundingClientRect().y), h: Math.round(e.getBoundingClientRect().height), t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) }))
      .filter(e => e.h > 12 && e.t.length > 3);
    const lowestMessage = msgs.length ? Math.max(...msgs.map(m => m.y)) : null;
    const composerY = composer.length ? Math.max(...composer.map(c => c.y)) : null;
    return {
      bodyStart: body.slice(0, 500),
      composer, composerBelowMessages: composerY !== null && lowestMessage !== null ? composerY > lowestMessage : null,
      messageCount: msgs.length, messageSample: msgs.slice(0, 8),
      forumWords: ['topic', 'thread', 'reply', 'replies', 'board', 'new topic'].filter(w => new RegExp(w, 'i').test(body)),
      chatWords: ['chat', 'message', 'say', 'send'].filter(w => new RegExp(w, 'i').test(body)),
    };
  });
  report.asks.lobbyWidth = await WIDTH(page);
  report.asks.lobbyHealth = { console: [...new Set(health.console)], page: [...new Set(health.page)], net: [...new Set(health.net)] };
  await page.close();
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
