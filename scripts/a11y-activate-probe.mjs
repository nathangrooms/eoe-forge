/**
 * The question a keyboard user cannot answer by reading source: does pressing
 * Enter on this thing DO anything.
 *
 * A div carrying role="button" and a tabindex announces itself as a button and
 * takes focus, and none of that is worth anything if the app only listens for
 * onClick. React attaches its listeners at the root, so no property on the
 * element reveals whether a key press is handled. The only honest test is to
 * put focus there, press the key, and look at what changed.
 *
 * Also finds where the invented zero price is written, because project law is
 * that a missing price is null and the smallest real one is 0.01.
 *
 * Read only.
 *
 *   node scripts/a11y-activate-probe.mjs
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const CARD = process.env.CARD_ID || '5bef0790-aa1b-4144-8391-338e59e86115';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(BASE + '/cards/' + CARD, { waitUntil: 'networkidle2' });
await sleep(4200);

const fingerprint = () => page.evaluate(() => ({
  url: location.pathname + location.search,
  // the printing shown in the header line, which is what picking a printing changes
  meta: (() => {
    const m = [...document.querySelectorAll('*')].find(e =>
      e.children.length === 0 && /#\d+\s*·/.test(e.textContent || ''));
    return m ? (m.textContent || '').trim().slice(0, 80) : null;
  })(),
  hero: (() => { const i = document.querySelector('img[alt]'); return i ? (i.currentSrc || i.src).slice(-40) : null; })(),
  panels: document.querySelectorAll('[role="dialog"],[data-state="open"]').length,
  bodyLen: (document.body.innerText || '').length,
}));

log('='.repeat(72));
log('CAN I ACTIVATE THE PRINTING TILES WITH THE KEYBOARD');
log('='.repeat(72));

const before = await fingerprint();
log('before: ' + JSON.stringify(before));

// focus the first role=button div by tabbing, never by clicking
const idx = await page.evaluate(() => {
  const all = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"])')]
    .filter(e => !['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(e.tagName));
  if (!all.length) return -1;
  all[0].focus();
  return all.length;
});
log('focusable non-native elements: ' + idx);
log('focused: ' + JSON.stringify(await page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a.tagName, role: a.getAttribute('role'), label: a.getAttribute('aria-label') };
})));

for (const key of ['Enter', 'Space']) {
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"])')]
      .filter(e => !['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(e.tagName));
    if (all[1]) all[1].focus();          // a printing that is not the one on screen
  });
  await page.keyboard.press(key);
  await sleep(1400);
  const after = await fingerprint();
  const changed = JSON.stringify(after) !== JSON.stringify(before);
  log(`\npress ${key}:  ${changed ? 'SOMETHING CHANGED' : 'NOTHING HAPPENED'}`);
  log('  after: ' + JSON.stringify(after));
}

// and the same tile with a mouse, to prove the control works and only the keyboard is shut out
await page.evaluate(() => {
  const all = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"])')]
    .filter(e => !['A','BUTTON','INPUT','SELECT','TEXTAREA'].includes(e.tagName));
  if (all[1]) all[1].click();
});
await sleep(1600);
const afterClick = await fingerprint();
log('\nsame tile with a mouse click: ' +
  (JSON.stringify(afterClick) !== JSON.stringify(before) ? 'SOMETHING CHANGED' : 'NOTHING HAPPENED'));
log('  after: ' + JSON.stringify(afterClick));

log('\n' + '='.repeat(72));
log('THE ZERO PRICE');
log('='.repeat(72));
const zero = await page.evaluate(() => {
  const hits = [...document.querySelectorAll('*')].filter(
    e => e.children.length === 0 && /^[$€£]\s?0(\.00)?$/.test((e.textContent || '').trim()));
  return hits.map(e => {
    let n = e, chain = [];
    for (let i = 0; n && i < 6; i++, n = n.parentElement) {
      const c = (n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) || '';
      chain.push(n.tagName.toLowerCase() + (String(c).trim() ? '.' + String(c).trim().split(/\s+/).slice(0,2).join('.') : ''));
    }
    const near = e.parentElement ? (e.parentElement.innerText || '').replace(/\s+/g,' ').trim().slice(0, 100) : '';
    return { text: (e.textContent || '').trim(), chain: chain.join(' < '), near };
  });
});
log(JSON.stringify(zero, null, 1));

// what the section around it is called
const section = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('*')].find(
    e => e.children.length === 0 && /^[$€£]\s?0(\.00)?$/.test((e.textContent || '').trim()));
  if (!hit) return null;
  let n = hit;
  while (n && n !== document.body) {
    const h = n.querySelector && n.querySelector('h1,h2,h3');
    if (h) return { heading: (h.textContent || '').trim(), block: (n.innerText || '').replace(/\s+/g,' ').trim().slice(0, 220) };
    n = n.parentElement;
  }
  return null;
});
log('\nsection it sits in: ' + JSON.stringify(section, null, 1));

await browser.close();
