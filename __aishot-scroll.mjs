import puppeteer from 'puppeteer';

const only = process.argv[2] || 'result';
const shots = Number(process.argv[3] || 3);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});

await page.goto(`http://localhost:8081/aishot.html?v=${Date.now()}&only=${only}`, {
  waitUntil: 'networkidle2',
  timeout: 90000,
});
await new Promise(r => setTimeout(r, 9000));

for (let i = 0; i < shots; i++) {
  const y = i * 950;
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y);
  await new Promise(r => setTimeout(r, 3500));
  const path = `C:/Users/natha/Desktop/Software/Deckmatrix/.shots/v-${only}-${i}.png`;
  await page.screenshot({ path });
  console.log('->', path);
}

await browser.close();
