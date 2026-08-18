import puppeteer from 'puppeteer';

const only = process.argv[2] || '';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--force-color-profile=srgb', '--font-render-hinting=none'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1.5 });
await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => {
  if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text());
});

const url = `http://localhost:8081/aishot.html?v=${Date.now()}${only ? `&only=${only}` : ''}`;
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 9000));

// Walk the whole document (and every internal scroll pane) so lazily-loaded
// card art is actually decoded before the element screenshots are taken.
await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const panes = [
    document.scrollingElement,
    ...Array.from(document.querySelectorAll('*')).filter(
      el => el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY === 'auto'
    ),
  ];
  for (const pane of panes) {
    for (let y = 0; y <= pane.scrollHeight; y += 500) {
      pane.scrollTop = y;
      await sleep(60);
    }
    pane.scrollTop = 0;
  }
  await sleep(500);
  await Promise.all(
    Array.from(document.images).map(img =>
      img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; })
    )
  );
});
await new Promise(r => setTimeout(r, 4000));

const names = only ? [only] : ['commander', 'configure', 'build', 'result'];
const all = await page.$$('[data-shot]');
console.log('sections found:', all.length);

let i = 0;
for (const el of all) {
  const path = `C:/Users/natha/Desktop/Software/Deckmatrix/.shots/ai-${i}-${names[i] ?? i}.png`;
  await el.screenshot({ path });
  console.log('->', path);
  i++;
}

if (only === 'finder') {
  await page.screenshot({
    path: 'C:/Users/natha/Desktop/Software/Deckmatrix/.shots/ai-finder.png',
  });
}

await browser.close();
