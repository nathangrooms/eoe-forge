/**
 * TWO QUESTIONS THE LAST PROBE COULD NOT ANSWER.
 *
 * 1. The screenshot at declare_blockers plainly shows a NO BLOCKS control, and
 *    the previous probe's enabled-button list did not contain it. Either it is
 *    disabled, or it is not a <button>. Enumerate EVERYTHING with its disabled
 *    flag rather than guessing which.
 * 2. Can a creature be cast and then attack with? The last run finished with
 *    one land and nothing else on our side for sixteen turns while the hand
 *    kept saying "You can cast this", so casting is the thing to press on.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { BASE, sleep, pressText, gameState } from './uiLib.mjs';

const W = 1600, H = 1000, OUT = '.shots/controls';
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,c){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('data-vite-dev-id',id);s.textContent=c;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=c;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}`;

/** every interactive-looking node in the top band, disabled flag included */
const TOPBAND = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button,[role=button],a')) {
    const r = el.getBoundingClientRect();
    if (r.y > 220 || r.height < 10 || r.width < 20) continue;
    out.push({
      tag: el.tagName, label: (el.innerText || el.getAttribute('title') || '').trim().replace(/\n/g, ' ').slice(0, 40),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      pe: getComputedStyle(el).pointerEvents,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    });
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
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 220)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 220)); });
  await page.setRequestInterception(true);
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

  /* ---- try hard to cast a creature ---- */
  console.log('=== CASTING ===');
  const castLog = [];
  for (let t = 0; t < 400; t++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') break;
    if (g.active === 'p1' && g.step === 'precombat_main') {
      // land first
      const didLand = await page.evaluate(() => {
        const vh = window.innerHeight;
        const c = [...document.querySelectorAll('button')].find(b => {
          const r = b.getBoundingClientRect();
          return r.top > vh * 0.72 && /can play this as a land drop/i.test(b.getAttribute('title') || '');
        });
        if (!c) return false; c.click(); return true;
      });
      if (didLand) {
        await sleep(600);
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^PLAY LAND$/i.test((x.innerText || '').trim())); if (b) b.click(); });
        await sleep(800);
      }
      // then a creature
      const opened = await page.evaluate(() => {
        const vh = window.innerHeight;
        const c = [...document.querySelectorAll('button')].find(b => {
          const r = b.getBoundingClientRect();
          return r.top > vh * 0.72 && /You can cast this/i.test(b.getAttribute('title') || '');
        });
        if (!c) return null; const t = (c.getAttribute('title') || '').slice(0, 70); c.click(); return t;
      });
      if (opened) {
        await sleep(700);
        const controls = await page.evaluate(() => [...document.querySelectorAll('button')]
          .map(b => ({ l: (b.innerText || '').trim().slice(0, 26), d: !!b.disabled }))
          .filter(b => b.l && /CAST|PLAY|RESOLVE|hand/i.test(b.l)));
        const pressed = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].filter(x => !x.disabled)
            .find(x => /^CAST\b/i.test((x.innerText || '').trim()));
          if (!b) return null; b.click(); return (b.innerText || '').trim();
        });
        await sleep(1400);
        const after = await gameState(page);
        castLog.push({ turn: g.turn, opened: opened.slice(0, 40), controls, pressed, bf: after?.bf, stack: after?.stack });
        await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find(b => /Close the preview/i.test(b.getAttribute('title') || '')); if (x) x.click(); });
        await sleep(400);
      }
    }

    if (g.step === 'declare_blockers' && g.active !== 'p1') {
      await page.screenshot({ path: `${OUT}/blockers.png` });
      console.log('\n=== TOP BAND AT DECLARE_BLOCKERS (we defend) ===');
      console.table(await TOPBAND(page));
      const g2 = await gameState(page);
      console.log('state ' + JSON.stringify(g2));
      break;
    }
    await page.evaluate(() => {
      const pick = re => [...document.querySelectorAll('button')].filter(b => !b.disabled)
        .find(b => re.test((b.innerText || '').trim()));
      const l = pick(/^LET IT RESOLVE$/); if (l) return l.click();
      const e = pick(/^(END TURN|NEXT)$/); if (e) return e.click();
    });
    await sleep(320);
  }
  console.log('\ncast attempts:');
  castLog.forEach(c => console.log('  ' + JSON.stringify(c)));

  /* ---- now reach OUR declare_attackers with a creature out ---- */
  console.log('\n=== HUNTING OUR DECLARE_ATTACKERS ===');
  for (let t = 0; t < 500; t++) {
    const g = await gameState(page);
    if (!g || g.status === 'complete') { console.log('game ended ' + JSON.stringify(g)); break; }
    if (g.step === 'declare_attackers' && g.active === 'p1') {
      await page.screenshot({ path: `${OUT}/our-attackers.png` });
      console.log('state ' + JSON.stringify(g));
      console.log('--- top band ---');
      console.table(await TOPBAND(page));
      break;
    }
    await page.evaluate(() => {
      const pick = re => [...document.querySelectorAll('button')].filter(b => !b.disabled)
        .find(b => re.test((b.innerText || '').trim()));
      const l = pick(/^LET IT RESOLVE$/); if (l) return l.click();
      const n = pick(/^NO BLOCKS$/); if (n) return n.click();
      const e = pick(/^(END TURN|NEXT)$/); if (e) return e.click();
    });
    await sleep(300);
  }

  console.log('\n=== ERRORS ===\n' + ([...new Set(errs)].slice(0, 20).join('\n') || 'none'));
  await browser.close();
};
run().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
