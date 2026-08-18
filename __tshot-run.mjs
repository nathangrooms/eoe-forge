import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

await page.goto('http://localhost:8081/tshot.html?v=' + Date.now(), { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const root = document.getElementById('root');
  return { html: root ? root.innerHTML.length : -1, sections: document.querySelectorAll('section').length };
});
console.log(JSON.stringify(info));

const names = ['rail', 'header', 'rounds', 'standings', 'roster', 'podium', 'bracket'];
const all = await page.$$('[data-shot]');
console.log('found', all.length);
let idx = 0;
for (const el of all) {
  await el.screenshot({ path: `C:/Users/natha/Desktop/Software/Deckmatrix/.shots/t-${idx}-${names[idx] ?? idx}.png` });
  idx++;
}
console.log('captured', idx);
await browser.close();
