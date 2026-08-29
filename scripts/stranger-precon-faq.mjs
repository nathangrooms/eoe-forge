/**
 * Two questions the new Commander player has on the homepage: is the fourth
 * precon tile really empty, and what do the FAQ answers say once opened.
 * Signed out, writes nothing.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/stranger';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
const imgFails = [];
page.on('response', r => { if (r.status() >= 400) imgFails.push(r.status() + ' ' + r.url().slice(0, 140)); });
await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 3500));

// The precon rail: what is in each tile
const precons = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('h2,h3')];
  const h = heads.find(e => /Start from a precon/i.test(e.innerText));
  if (!h) return { error: 'heading not found' };
  let sec = h.closest('section') || h.parentElement;
  for (let i = 0; i < 6 && sec && sec.querySelectorAll('a[href="/precons"]').length < 2; i++) sec = sec.parentElement;
  const tiles = [...sec.querySelectorAll('a[href="/precons"]')].filter(a => a.querySelector('img') || a.innerText.trim());
  return tiles.map(a => {
    const img = a.querySelector('img');
    return {
      text: a.innerText.replace(/\n+/g, ' | ').slice(0, 120),
      hasImg: !!img,
      imgAlt: img?.getAttribute('alt') ?? null,
      imgSrc: (img?.currentSrc || img?.src || '').slice(0, 130),
      imgLoaded: img ? (img.complete && img.naturalWidth > 0) : null,
      naturalW: img?.naturalWidth ?? null,
      box: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(a.getBoundingClientRect()),
    };
  });
});
console.log('--- PRECON TILES ---');
console.log(JSON.stringify(precons, null, 2));

// FAQ: open every one and read the answer
const faq = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll('button')].filter(b => /\?$/.test(b.innerText.trim()));
  const out = [];
  for (const b of btns) {
    b.click();
    await new Promise(r => setTimeout(r, 350));
    const region = b.closest('[data-state],div')?.parentElement;
    out.push({ q: b.innerText.trim(), a: (region?.innerText || '').replace(b.innerText.trim(), '').trim().slice(0, 700) });
  }
  return out;
});
console.log('--- FAQ ---');
faq.forEach(f => console.log('\nQ: ' + f.q + '\nA: ' + f.a));

console.log('--- HTTP >=400 ---');
[...new Set(imgFails)].forEach(f => console.log('  ' + f));

await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2,h3')].find(e => /Start from a precon/i.test(e.innerText));
  h?.scrollIntoView({ block: 'start' });
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/precon-rail.png` });
await browser.close();
