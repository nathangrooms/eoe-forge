/**
 * Two things the first two walks could only hint at.
 *
 * ONE. What happens when I follow a link. In a single page app nothing reloads,
 * so a screen reader is told nothing unless the app tells it: the title has to
 * change and focus has to go somewhere sensible. If focus stays where it was, I
 * have moved to a new page and my reading position is still on the old one, and
 * the only way to find out what I am looking at is to tab from wherever I am.
 *
 * TWO. The card page is the richest thing a signed out visitor can read, so it
 * stands in for reading a deck. It asks what the tab order actually contains,
 * because a div made focusable is a stop that announces no role, and what the
 * headings really say in the DOM, because text a stylesheet capitalises reads
 * fine and text typed in capitals can be spelled out letter by letter.
 *
 * Read only.
 *
 *   node scripts/a11y-route-and-card.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const CARD = process.env.CARD_ID || '5bef0790-aa1b-4144-8391-338e59e86115';
const OUT = '.shots/a11y';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

/* ---------- ONE: following a link ---------- */
log('='.repeat(72));
log('ONE  what a link press tells a screen reader');
log('='.repeat(72));

const state = () => page.evaluate(() => {
  const a = document.activeElement;
  return {
    url: location.pathname,
    title: document.title,
    h1: (document.querySelector('h1') || {}).innerText || null,
    focus: !a || a === document.body ? 'BODY (reading position lost)'
      : a.tagName.toLowerCase() + ' "' + ((a.getAttribute('aria-label') || (a.innerText || '').trim()).slice(0, 34)) + '"',
    scroll: Math.round(scrollY),
  };
});

await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
await sleep(2500);
log('landed:  ' + JSON.stringify(await state()));

// tab to "Log in" in the header (stop 4) and press Enter, keyboard only
await page.evaluate(() => { document.body.setAttribute('tabindex','-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); await sleep(70); }
log('focused: ' + JSON.stringify(await state()));
await page.keyboard.press('Enter');
await sleep(1600);
log('after Enter on "Log in":');
log('         ' + JSON.stringify(await state()));

// and the next Tab from there tells me where the reading order restarted
await page.keyboard.press('Tab'); await sleep(120);
log('next Tab lands on: ' + JSON.stringify((await state()).focus));

// browser Back, which a keyboard user leans on constantly
await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
await sleep(1400);
log('after Back:  ' + JSON.stringify(await state()));

/* ---------- TWO: the card page in detail ---------- */
log('\n' + '='.repeat(72));
log('TWO  the card page, the richest thing a stranger can read');
log('='.repeat(72));

await page.goto(BASE + '/cards/' + CARD, { waitUntil: 'networkidle2' });
await sleep(4000);

const card = await page.evaluate(() => {
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // headings: what the DOM says vs what is painted
  const heads = [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(h => ({
    level: +h.tagName[1],
    dom: (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
    painted: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 46),
    transform: getComputedStyle(h).textTransform,
  }));

  // everything reachable by Tab that is NOT a natively interactive element
  const focusableDivs = [...document.querySelectorAll('[tabindex]:not([tabindex="-1"])')]
    .filter(vis)
    .filter(e => !['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName))
    .map(e => ({
      tag: e.tagName.toLowerCase(),
      role: e.getAttribute('role'),
      label: e.getAttribute('aria-label'),
      text: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      keyHandler: !!(e.onkeydown || e.onkeypress || e.onkeyup),
      clickHandler: !!e.onclick,
    }));

  // toggle groups: is the chosen one announced as chosen
  const toggles = [...document.querySelectorAll('button')].filter(vis).filter(b =>
    /^(7d|30d|90d|1y|All|Prices|USD|EUR)$/i.test((b.innerText || '').trim())
  ).map(b => ({
    text: (b.innerText || '').trim(),
    pressed: b.getAttribute('aria-pressed'),
    selected: b.getAttribute('aria-selected'),
    current: b.getAttribute('aria-current'),
    role: b.getAttribute('role'),
    dataState: b.getAttribute('data-state'),
  }));

  // links whose name repeats, which a link list reads as a wall of the same word
  const names = {};
  [...document.querySelectorAll('a[href]')].filter(vis).forEach(a => {
    const n = (a.getAttribute('aria-label') || (a.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 40);
    if (!n) return;
    names[n] = names[n] || { n, count: 0, hrefs: [] };
    names[n].count++;
    if (names[n].hrefs.length < 3) names[n].hrefs.push((a.getAttribute('href') || '').slice(0, 46));
  });
  const dupes = Object.values(names).filter(x => x.count > 1);

  // tables: a screen reader needs headers to read a cell in context
  const tables = [...document.querySelectorAll('table')].filter(vis).map(t => ({
    caption: !!t.querySelector('caption'),
    th: t.querySelectorAll('th').length,
    scope: [...t.querySelectorAll('th')].filter(h => h.getAttribute('scope')).length,
    rows: t.querySelectorAll('tr').length,
  }));

  // any price rendered as an invented zero
  const zeros = [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && /^[$€£]0(\.00)?$/.test((e.textContent || '').trim()))
    .map(e => (e.textContent || '').trim());

  return { heads, focusableDivs, toggles, dupes, tables, zeros,
           imgAlts: [...document.querySelectorAll('img')].filter(vis).map(i => i.getAttribute('alt')) };
});

log('\nheadings, DOM text vs painted text:');
card.heads.forEach(h => log(`  h${h.level}  dom="${h.dom}"  painted="${h.painted}"  transform=${h.transform}`));

log(`\nfocusable non-interactive elements in the tab order: ${card.focusableDivs.length}`);
card.focusableDivs.slice(0, 12).forEach(d =>
  log(`   <${d.tag}> role=${d.role || 'NONE'} label=${d.label || 'NONE'} text="${d.text}" keys=${d.keyHandler}`));

log('\ntoggle buttons and whether the chosen one is announced:');
card.toggles.forEach(t => log('   ' + JSON.stringify(t)));

log('\nlink names used more than once:');
card.dupes.forEach(d => log(`   "${d.n}" x${d.count}  ->  ${d.hrefs.join(' , ')}`));

log('\ntables: ' + JSON.stringify(card.tables));
log('rendered zero prices: ' + JSON.stringify(card.zeros));
log('image alts: ' + JSON.stringify(card.imgAlts.slice(0, 14)));

await page.screenshot({ path: `${OUT}/13-card-full.png`, fullPage: true });

/* ---------- THREE: is there any <main> or skip link on the homepage ---------- */
log('\n' + '='.repeat(72));
log('THREE  landmarks and the way past the navigation');
log('='.repeat(72));
for (const p of ['/', '/login', '/register', '/play/online', '/cards/' + CARD]) {
  await page.goto(BASE + p, { waitUntil: 'networkidle2' }).catch(() => {});
  await sleep(2200);
  const l = await page.evaluate(() => {
    const vis = el => el.getBoundingClientRect().width > 0;
    return {
      main: document.querySelectorAll('main,[role="main"]').length,
      nav: document.querySelectorAll('nav,[role="navigation"]').length,
      header: document.querySelectorAll('header,[role="banner"]').length,
      footer: document.querySelectorAll('footer,[role="contentinfo"]').length,
      h1: [...document.querySelectorAll('h1')].filter(vis).map(h => (h.innerText || '').trim().slice(0, 44)),
      skip: [...document.querySelectorAll('a')].slice(0, 3)
        .map(a => ({ t: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 30), h: a.getAttribute('href') })),
      firstTabbableIsSkip: false,
      title: document.title,
    };
  });
  log(`  ${p.padEnd(46)} main=${l.main} nav=${l.nav} header=${l.header} footer=${l.footer} h1=${JSON.stringify(l.h1)}`);
  log(`  ${''.padEnd(46)} first links: ${JSON.stringify(l.skip)}`);
}

await browser.close();
