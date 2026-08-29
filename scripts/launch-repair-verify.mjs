/**
 * Re-walks the routes touched by the launch repair pass and reports whether
 * each fix is actually visible in a browser, rather than merely present in a
 * file. Every claim in the repair report should be reproducible by running
 * this.
 *
 *   node scripts/launch-repair-verify.mjs
 *   CHECKS=sticky,viewport node scripts/launch-repair-verify.mjs
 *
 * Writes screenshots to .shots/launch-repair/.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/launch-repair';
fs.mkdirSync(OUT, { recursive: true });

const only = (process.env.CHECKS || '').split(',').filter(Boolean);
const want = name => only.length === 0 || only.includes(name);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const pass = (name, detail) => results.push({ name, ok: true, detail });
const fail = (name, detail) => results.push({ name, ok: false, detail });

async function newPage(width = 1440, height = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  return page;
}

// ---------------------------------------------------------------- A3 viewport
if (want('viewport')) {
  const page = await newPage(390, 844);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  const v = await page.evaluate(() =>
    document.querySelector('meta[name=viewport]')?.getAttribute('content')
  );
  const blocked = /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(v || '');
  blocked ? fail('A3 pinch zoom', v) : pass('A3 pinch zoom', v);
  await page.close();
}

// -------------------------------------------------------------- C12 theme col
if (want('theme')) {
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t = await page.evaluate(() =>
    document.querySelector('meta[name=theme-color]')?.getAttribute('content')
  );
  /^#0a0a0b$/i.test(t || '') ? pass('C12 theme-color', t) : fail('C12 theme-color', t);
  await page.close();
}

// ------------------------------------------------------------- C11 og / cards
if (want('og')) {
  const page = await newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const og = await page.evaluate(() => ({
    image: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    url: document.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
    twitterSite: document.querySelector('meta[name="twitter:site"]')?.getAttribute('content'),
  }));
  const absolute = /^https:\/\//.test(og.image || '');
  const res = await page.goto(BASE + '/og-image.jpg', { timeout: 30000 }).catch(() => null);
  const status = res ? res.status() : 0;
  absolute && status === 200 && !og.twitterSite
    ? pass('C11 social card', `${og.image} -> ${status}, canonical ${og.canonical}`)
    : fail('C11 social card', JSON.stringify({ ...og, status }));
  await page.close();
}

// ------------------------------------------------------------ C1 sticky nav
if (want('sticky')) {
  for (const [w, h] of [[390, 844], [768, 1024], [1400, 900]]) {
    const page = await newPage(w, h);
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    await page.evaluate(() => window.scrollTo(0, 6000));
    await sleep(700);
    const info = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find(
        n => getComputedStyle(n).position === 'sticky' && n.querySelector('a,button')
      );
      return {
        found: !!el,
        top: el ? Math.round(el.getBoundingClientRect().top) : null,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        scrollY: Math.round(window.scrollY),
        docW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    const stuck = info.found && info.top >= -2 && info.top < h;
    const noOverflow = info.docW <= info.innerW + 1;
    await page.screenshot({ path: `${OUT}/sticky-${w}.png` });
    stuck && noOverflow
      ? pass(`C1 sticky @${w}`, `top ${info.top} at scrollY ${info.scrollY}, overflow-x ${info.bodyOverflowX}, docW ${info.docW} <= ${info.innerW}`)
      : fail(`C1 sticky @${w}`, JSON.stringify(info));
    await page.close();
  }
}

// --------------------------------------------------------- A2 terms / privacy
if (want('terms')) {
  const page = await newPage();
  await page.goto(BASE + '/register', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map(a => ({ t: a.innerText.trim(), h: a.getAttribute('href') }))
      .filter(l => /terms|privacy/i.test(l.t + l.h))
  );
  await page.screenshot({ path: `${OUT}/register.png`, fullPage: true });
  const hasBoth = links.some(l => l.h === '/terms') && links.some(l => l.h === '/privacy');
  hasBoth ? pass('A2 register links', JSON.stringify(links)) : fail('A2 register links', JSON.stringify(links));

  for (const route of ['/terms', '/privacy']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1200);
    const info = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      h1: document.querySelector('h1')?.innerText.trim(),
      chars: document.body.innerText.length,
      main: document.querySelectorAll('main').length,
    }));
    await page.screenshot({ path: `${OUT}${route.replace('/', '/')}.png`, fullPage: true });
    info.path === route && info.chars > 1000 && info.main > 0
      ? pass(`A2 ${route}`, JSON.stringify(info))
      : fail(`A2 ${route}`, JSON.stringify(info));
  }
  await page.close();
}

// --------------------------------------------------------------- A4 real 404
if (want('notfound')) {
  const page = await newPage();
  const seen = {};
  for (const route of ['/this-route-does-not-exist', '/decks', '/play']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1500);
    seen[route] = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 220));
    await page.screenshot({ path: `${OUT}/nf-${route.replace(/\W+/g, '_')}.png` });
  }
  const distinct = seen['/this-route-does-not-exist'] !== seen['/decks'];
  distinct
    ? pass('A4 404 distinct from gate', JSON.stringify(seen, null, 1))
    : fail('A4 404 distinct from gate', JSON.stringify(seen, null, 1));
  await page.close();
}

// ------------------------------------------------------- C4 skip link + main
if (want('landmarks')) {
  const page = await newPage();
  for (const route of ['/', '/login', '/register', '/terms']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1200);
    const info = await page.evaluate(() => {
      const first = document.querySelector('a[href^="#"]');
      return {
        main: document.querySelectorAll('main').length,
        skip: first ? first.innerText.trim() : null,
        skipHref: first ? first.getAttribute('href') : null,
      };
    });
    info.main === 1 && /skip/i.test(info.skip || '')
      ? pass(`C4 landmarks ${route}`, JSON.stringify(info))
      : fail(`C4 landmarks ${route}`, JSON.stringify(info));
  }
  await page.close();
}

// ------------------------------------------------------------ C3 title + focus
if (want('titles')) {
  const page = await newPage();
  const titles = {};
  for (const route of ['/', '/login', '/register', '/terms', '/privacy', '/play/online']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(1400);
    titles[route] = await page.evaluate(() => document.title);
  }
  const unique = new Set(Object.values(titles)).size;
  unique === Object.keys(titles).length
    ? pass('C3 page titles', JSON.stringify(titles, null, 1))
    : fail('C3 page titles', JSON.stringify(titles, null, 1));
  await page.close();
}

// ------------------------------------------------------------- C2 nav anchors
if (want('navanchors')) {
  const page = await newPage(390, 844);
  await page.goto(BASE + '/play/online', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map(a => ({ t: a.innerText.trim(), h: a.getAttribute('href') }))
      .filter(l => /features|faq/i.test(l.t))
  );
  const good = hrefs.length > 0 && hrefs.every(l => l.h.startsWith('/#'));
  good ? pass('C2 nav anchors', JSON.stringify(hrefs)) : fail('C2 nav anchors', JSON.stringify(hrefs));
  await page.close();
}

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
}
console.log(`\n${results.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
