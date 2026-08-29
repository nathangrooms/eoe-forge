/**
 * The new Commander player's goal, run as a test: signed out, can I find a card
 * I own and read about it, without an account?
 *
 * Types a real card name into the homepage, waits for the search, follows the
 * first result, and reports what arrived.
 *
 *   node scripts/probe/public-search-walk.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const QUERY = process.env.QUERY || 'Atraxa, Praetors Voice';
const OUT = '.shots/launch-repair';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

for (const width of [390, 1440]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 160)));

  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));

  const inputs = await page.evaluate(
    () => document.querySelectorAll('input:not([type=hidden])').length
  );
  console.log(`\n=== ${width}px  inputs on the signed-out homepage: ${inputs}`);

  const box = await page.$('#home-search');
  if (!box) {
    console.log('  NO SEARCH BOX');
    await page.close();
    continue;
  }

  await box.scrollIntoView();
  await new Promise(r => setTimeout(r, 800));
  /* Clear it properly. A triple click plus Backspace left the preset behind
     and appended to it, which produced a nonsense query and a false failure. */
  await page.$eval('#home-search', el => {
    el.focus();
    el.setSelectionRange(0, el.value.length);
  });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type('#home-search', QUERY, { delay: 25 });
  await new Promise(r => setTimeout(r, 3500));

  const state = await page.evaluate(() => {
    const section = document.getElementById('home-search')?.closest('section');
    const links = [...(section?.querySelectorAll('a[href^="/cards/"]') ?? [])].map(a => ({
      name: a.getAttribute('aria-label'),
      href: a.getAttribute('href'),
    }));
    return {
      matches: section?.innerText.match(/[\d,]+ matches|no matches|searching…/)?.[0] ?? null,
      cardLinks: links.length,
      first: links[0] ?? null,
    };
  });
  console.log('  ' + JSON.stringify(state));
  await page.screenshot({ path: `${OUT}/home-search-${width}.png` });

  if (state.first) {
    await page.goto(BASE + state.first.href, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 3000));
    const landed = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      h1: document.querySelector('h1')?.innerText,
      priced: /\$\d/.test(document.body.innerText),
      legality: /legal in \d+ of \d+/i.test(document.body.innerText),
    }));
    console.log('  followed -> ' + JSON.stringify(landed));
    await page.screenshot({ path: `${OUT}/home-search-landed-${width}.png` });
  }

  if (errors.length) console.log('  ERRORS: ' + JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

await browser.close();
