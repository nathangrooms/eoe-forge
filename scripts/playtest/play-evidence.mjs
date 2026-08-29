/**
 * Evidence run for play mode. Drives the REAL Play page through the dev
 * harness (no auth gate), photographs every distinct screen, and measures the
 * owner's six asks objectively rather than by eye.
 *
 * Live database by default so CARD ART is real. DM_BLOCK_DB=1 to cut it.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = process.env.OUT || '.shots/evidence';
const BASE = process.env.BASE || 'http://127.0.0.1:8081';
const BLOCK_DB = process.env.DM_BLOCK_DB === '1';
fs.mkdirSync(OUT, { recursive: true });

let shotN = 0;
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const consoleErrors = [];
const pageErrors = [];
const netFails = [];

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

page.on('pageerror', e => { pageErrors.push(e.message.slice(0, 300)); log('  [pageerror]', e.message.slice(0, 200)); });
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') { consoleErrors.push(t.slice(0, 300)); log('  [console.error]', t.slice(0, 200)); }
});
page.on('requestfailed', r => {
  const s = `${r.failure()?.errorText} ${r.url().slice(0, 160)}`;
  netFails.push(s);
});
page.on('response', r => {
  if (r.status() >= 400) netFails.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`);
});

/* Vite HMR stub: a hot update mid-run reloads the page and wipes the dealt
   table. updateStyle must be real or the stylesheet vanishes. */
const VITE_CLIENT_STUB = `
export function createHotContext(){return{accept(){},acceptExports(){},dispose(){},prune(){},decline(){},invalidate(){},on(){},off(){},send(){},data:{}};}
const sheets=new Map();
export function updateStyle(id,content){let s=sheets.get(id);if(!s){s=document.createElement('style');s.setAttribute('type','text/css');s.setAttribute('data-vite-dev-id',id);s.textContent=content;document.head.appendChild(s);sheets.set(id,s);}else{s.textContent=content;}}
export function removeStyle(id){const s=sheets.get(id);if(s){document.head.removeChild(s);sheets.delete(id);}}
export function injectQuery(u){return u;}
`;
await page.setRequestInterception(true);
page.on('request', req => {
  const url = req.url();
  if (url.includes('/@vite/client')) {
    return req.respond({ status: 200, contentType: 'application/javascript', body: VITE_CLIENT_STUB });
  }
  if (BLOCK_DB && /supabase\.co\/rest\//.test(url)) return req.abort('failed');
  return req.continue();
});

const shot = async name => {
  const file = `${OUT}/${String(shotN++).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log('  shot ->', file);
  return file;
};

const pressText = re => page.evaluate(src => {
  const el = [...document.querySelectorAll('button')]
    .find(b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim()));
  if (!el) return false;
  el.click(); return true;
}, re.source);

const pressTitle = needle => page.evaluate(n => {
  const el = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title') || '').includes(n));
  if (!el) return false;
  el.click(); return true;
}, needle);

const game = () => page.evaluate(() => {
  const g = window.__dmGame;
  if (!g) return null;
  const p1 = g.players.find(p => p.id === 'p1');
  return {
    turn: g.turn, step: g.step, active: g.activePlayerId, status: g.status,
    stack: (g.stack || []).length,
    hand: p1.zones.hand.length,
    battlefield: p1.zones.battlefield.length,
    life: g.players.map(p => `${p.name}:${p.life}`).join(' '),
  };
});

/* ---------------------------------------------------------------- probes */

/** Where the primary action controls sit vertically. Top vs bottom, measured. */
const actionBarProbe = () => page.evaluate(() => {
  const vh = window.innerHeight;
  const words = /^(END TURN|NEXT|Keep|Mulligan|Cast|Play land|Attack|Block|No attacks|No blocks|Done|Pass|Resolve|Continue)$/i;
  const hits = [...document.querySelectorAll('button')]
    .map(b => ({ b, t: (b.innerText || '').trim() }))
    .filter(x => words.test(x.t))
    .map(x => {
      const r = x.b.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { text: x.t, y: Math.round(r.y), cy: Math.round(r.y + r.height / 2), half: (r.y + r.height / 2) < vh / 2 ? 'TOP' : 'BOTTOM' };
    }).filter(Boolean);
  return { vh, hits };
});

/** Card art integrity: crop and desaturation, over real <img> elements. */
const artProbe = () => page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')].filter(i => {
    const r = i.getBoundingClientRect();
    return r.width > 24 && r.height > 24;
  });
  const bad = [];
  let scryfall = 0;
  for (const i of imgs) {
    const cs = getComputedStyle(i);
    const src = i.currentSrc || i.src || '';
    if (/scryfall/i.test(src)) scryfall++;
    const fit = cs.objectFit;
    const filter = cs.filter;
    const desat = /grayscale|saturate\(0/.test(filter);
    // crop: object-fit cover, or a wrapper clipping with a card-ish aspect mismatch
    const cropped = fit === 'cover';
    if (desat || cropped) {
      bad.push({ src: src.slice(-60), fit, filter, alt: (i.alt || '').slice(0, 40) });
    }
  }
  return { total: imgs.length, scryfall, bad };
});

/** Full width: widest laid-out block vs viewport. */
const widthProbe = () => page.evaluate(() => {
  const vw = window.innerWidth;
  const r = document.getElementById('root').getBoundingClientRect();
  // widest visible element that is not the root
  let widest = 0;
  for (const el of document.querySelectorAll('div,section,main')) {
    const b = el.getBoundingClientRect();
    if (b.height > 80 && b.width > widest) widest = b.width;
  }
  return { vw, rootW: Math.round(r.width), widestBlock: Math.round(widest), pct: Math.round((widest / vw) * 100) };
});

const friendsProbe = () => page.evaluate(() => {
  const txt = document.body.innerText || '';
  const hasWord = /friend/i.test(txt);
  const nodes = [...document.querySelectorAll('*')].filter(e =>
    /friend/i.test(e.getAttribute?.('aria-label') || '')).length;
  return { hasWordFriend: hasWord, ariaFriendNodes: nodes };
});

const snapshot = async name => {
  const file = await shot(name);
  const rec = {
    screen: name, file,
    game: await game(),
    actionBar: await actionBarProbe(),
    art: await artProbe(),
    width: await widthProbe(),
    friends: await friendsProbe(),
  };
  log(`  [${name}] width ${rec.width.widestBlock}/${rec.width.vw} (${rec.width.pct}%) | imgs ${rec.art.total} scryfall ${rec.art.scryfall} bad ${rec.art.bad.length} | friends ${rec.friends.hasWordFriend}`);
  log(`  [${name}] actionbar: ${rec.actionBar.hits.map(h => h.text + '@' + h.cy + ':' + h.half).join(', ') || 'none'}`);
  if (rec.art.bad.length) log(`  [${name}] BAD ART:`, JSON.stringify(rec.art.bad.slice(0, 4)));
  records.push(rec);
  return rec;
};

const records = [];

/* ------------------------------------------------------------------ open */
log('== opening harness ==');
await page.goto(`${BASE}/play-harness.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(6000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);

await snapshot('play-landing-mode');

/* scroll to see the friends rail under the doors */
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sleep(600);
await shot('play-landing-scrolled');

/* ------------------------------------------------------- versus bots flow */
log('== choose versus bots ==');
log('  entered bots:', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /VERSUS BOTS/i.test(x.innerText || ''));
  if (!b) return false; b.click(); return true;
}));
await sleep(1500);
await snapshot('deck-selection');

/* the deck step may need a deck chosen; take the first offered */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /seeded|Use this deck|Choose/i.test(x.innerText || ''));
  if (b) b.click();
});
await sleep(1200);
await shot('deck-selected');

log('  forward:', await pressText(/Choose opponents|Continue|Next/));
await sleep(1500);
await snapshot('table-seats');

log('== start game ==');
log('  start:', await pressText(/Start .*game/));
try {
  await page.waitForFunction('!!window.__dmGame', { timeout: 120000, polling: 400 });
} catch (e) {
  log('  !! no game object appeared');
  await shot('start-failed');
}
await sleep(3500);
await snapshot('mulligan');

log('  keep:', await pressText(/^Keep$/));
await sleep(1200);
await snapshot('turn-one-board');

/* free cast so a board exists within a few turns */
log('  menu:', await pressTitle('Game menu')); await sleep(1400);
log('  free cast:', await pressTitle('Ignore mana entirely')); await sleep(700);
await pressTitle('Close the menu'); await sleep(700);

const handTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('button[title]')].map(e => e.getAttribute('title'))
    .filter(t => t && t.includes('Click to preview')));
const clickHand = t => page.evaluate(t => {
  const el = [...document.querySelectorAll('button[title]')].find(e => e.getAttribute('title') === t);
  if (!el) return false; el.click(); return true;
}, t);

/* --------------------------------------------------------- build a board */
log('== building a board ==');
let stackShot = false;
for (let turn = 0; turn < 7; turn++) {
  const titles = await handTitles();
  const l = titles.find(t => t.includes('land drop'));
  if (l) { await clickHand(l); await sleep(450); await pressText(/^Play land$/); await sleep(650); }
  for (const t of titles.filter(x => !x.includes('land drop')).slice(0, 4)) {
    await clickHand(t); await sleep(400);
    if (await pressText(/^Cast$/)) {
      await sleep(250);
      const g = await game();
      if (!stackShot && g && g.stack > 0) {
        await snapshot('stack-populated');
        stackShot = true;
      }
      await sleep(500);
    }
  }
  await page.evaluate(() => document.body.click());
  await sleep(300);
  const g = await game();
  log(`  T${g?.turn} ${g?.step}: ${g?.battlefield} permanents, stack ${g?.stack}, ${g?.life}`);
  if (turn < 6) { await pressText(/^END TURN$/); await sleep(9000); }
}
await sleep(1500);
await snapshot('midgame-board');

/* ------------------------------------------------------------- combat */
log('== combat ==');
/* push to a combat step and photograph whatever the attack UI is */
for (let i = 0; i < 12; i++) {
  const g = await game();
  if (g && /combat|attack|block|declare/i.test(g.step || '')) break;
  await pressText(/^(NEXT|END TURN)$/);
  await sleep(1200);
}
await sleep(800);
await snapshot('combat');

/* try to actually declare an attack */
const attacked = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /^Attack/i.test(b.getAttribute('title') || '') || /^Attack$/i.test((b.innerText || '').trim()));
  if (!el) return false; el.click(); return true;
});
log('  attack pressed:', attacked);
await sleep(1200);
await snapshot('combat-attacking');

/* ------------------------------------------------------- run to an end */
log('== running toward an end ==');
for (let i = 0; i < 60; i++) {
  const g = await game();
  if (!g || g.status !== 'playing') break;
  await pressText(/^(END TURN|NEXT|Keep|Continue|Done|No attacks|No blocks)$/);
  await sleep(1500);
}
await sleep(1200);
await snapshot('end-state');

/* ---------------------------------------------------------------- report */
const report = {
  base: BASE, blockedDb: BLOCK_DB,
  finalGame: await game(),
  consoleErrors: [...new Set(consoleErrors)],
  pageErrors: [...new Set(pageErrors)],
  netFails: [...new Set(netFails)].slice(0, 60),
  records: records.map(r => ({
    screen: r.screen, file: r.file, game: r.game,
    width: r.width, friends: r.friends,
    artTotal: r.art.total, artScryfall: r.art.scryfall, artBad: r.art.bad,
    actionBar: r.actionBar.hits,
  })),
};
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
log('\n== wrote', `${OUT}/report.json`);
log('console errors:', report.consoleErrors.length, '| page errors:', report.pageErrors.length, '| net fails:', report.netFails.length);
await browser.close();
