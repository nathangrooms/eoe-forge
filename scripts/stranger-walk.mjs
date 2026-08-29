/**
 * The new Commander player walk: signed out, desktop, every public surface.
 *
 * Goal being tested: can somebody who owns one precon and forty loose cards,
 * who has never heard of this product, work out whether it is worth an account?
 *
 * So this records what a person actually receives on each page: the words, the
 * links, the console errors, the failed requests. It signs in nowhere and
 * writes nothing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/stranger';
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = (process.env.ROUTES || '/,/login,/register,/forgot-password,/reset-password,/play/online,/dashboard,/collection,/decks,/tutor,/cards,/precons').split(',');

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

let bucket = { errors: [], failed: [], http: [] };
page.on('pageerror', e => bucket.errors.push('pageerror: ' + e.message.slice(0, 300)));
page.on('console', m => {
  if (m.type() === 'error') bucket.errors.push('console: ' + m.text().slice(0, 300));
});
page.on('requestfailed', r => bucket.failed.push(r.url().slice(0, 160) + ' :: ' + (r.failure()?.errorText || '')));
page.on('response', r => {
  if (r.status() >= 400) bucket.http.push(r.status() + ' ' + r.url().slice(0, 160));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = {};

for (const route of ROUTES) {
  bucket = { errors: [], failed: [], http: [] };
  const slug = route.replace(/[^a-z0-9]+/gi, '_') || 'root';
  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => bucket.errors.push('nav: ' + e.message));
  await sleep(2500);

  const info = await page.evaluate(() => {
    const txt = document.body.innerText.replace(/\n{3,}/g, '\n\n');
    const links = [...document.querySelectorAll('a[href]')].map(a => ({
      t: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 60),
      h: a.getAttribute('href'),
    }));
    const buttons = [...document.querySelectorAll('button')].map(b =>
      (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 60)
    ).filter(Boolean);
    const imgs = [...document.querySelectorAll('img')].map(i => ({
      alt: i.getAttribute('alt'),
      src: (i.currentSrc || i.src || '').slice(0, 100),
      broken: i.complete && i.naturalWidth === 0,
    }));
    return {
      url: location.pathname + location.search,
      title: document.title,
      scrollH: document.documentElement.scrollHeight,
      docW: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      text: txt,
      links, buttons, imgs,
    };
  }).catch(e => ({ error: e.message }));

  await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true }).catch(() => {});
  report[route] = { ...info, console: bucket };
  console.log('=== ' + route + ' -> ' + (info.url || '?'));
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
console.log('written ' + OUT + '/report.json');
