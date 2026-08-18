import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--disable-lcd-text'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:8081/tshot.html?v=' + Date.now(), { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const root = document.getElementById('root');
  const kids = root ? Array.from(root.children).map(c => c.tagName + '.' + c.className) : [];
  return {
    shots: document.querySelectorAll('[data-shot]').length,
    kids,
    inner: (() => { const d = document.querySelector('div.min-h-screen'); const c = d && d.firstElementChild; return c ? Array.from(c.children).map(x => x.tagName + '|' + x.className + '|' + JSON.stringify(Object.fromEntries(Array.from(x.attributes).map(a=>[a.name,a.value])))).slice(0,3) : null; })(),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
