/**
 * Does clicking a card on the Tutor shelf actually attach it?
 *
 *   node scripts/probe/tutor-shelf-click.mjs
 *
 * WHY THIS EXISTS SEPARATELY FROM `nav-audit`
 * -------------------------------------------
 * The audit screenshots a page at rest. It cannot tell a shelf of cards that
 * attaches one from a shelf of cards that is a picture of a shelf of cards, and
 * this project has shipped the second kind before: CLAUDE.md records a whole
 * period where play mode's engine supported counterspells, equip and mulligan
 * and no player could reach any of them, because every test built the action by
 * hand and nothing in the app ever constructed it.
 *
 * So this clicks the thing. It asserts three properties, in the order they
 * would break:
 *
 *   DRAWN     the shelf renders six real card names from the catalogue, not
 *             six skeletons that never resolved
 *   ATTACHES  clicking one changes the context header from "No deck or card
 *             attached" to that card's name
 *   REPLACES  the shelf then goes away, because a shelf of unrelated cards next
 *             to an attached card invites throwing the attachment away
 *
 * Signed out against the built app, same as `nav-audit`, which is why it reads
 * the catalogue over the anon key and needs no fixture.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4591);
const SETTLE = Number(process.env.SETTLE || 9000);
const OUT = process.env.OUT || '.shots/tutor-shelf';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST, 'index.html'); ext = '.html'; }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));
fs.mkdirSync(path.resolve(OUT), { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

const failures = [];
const check = (ok, what, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(what);
};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const shim = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
  await page.evaluateOnNewDocument(shim);

  await page.goto(`http://127.0.0.1:${PORT}/tutor`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, SETTLE));

  /* The shelf is the only place on this page with a heading of these words, so
     find it by what a person would read rather than by a class name. */
  const shelf = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find(
      p => p.textContent?.trim() === 'Pick a card to ask about'
    );
    if (!label) return null;
    const grid = label.parentElement?.nextElementSibling;
    const buttons = [...(grid?.querySelectorAll('button') ?? [])];
    return {
      count: buttons.length,
      names: buttons.map(b => b.querySelector('span')?.textContent?.trim() ?? ''),
      images: buttons.filter(b => b.querySelector('img')).length,
    };
  });

  check(Boolean(shelf), 'the shelf is on the page');
  if (shelf) {
    check(shelf.count === 6, 'six cards are offered', `count=${shelf.count}`);
    check(
      shelf.names.every(n => n.length > 0),
      'every tile names its card',
      shelf.names.join(', ')
    );
    check(shelf.images === shelf.count, 'every tile drew a picture', `${shelf.images}/${shelf.count}`);
  }

  const before = await page.evaluate(
    () => document.body.innerText.includes('No deck or card attached')
  );
  check(before, 'nothing is attached to begin with');

  const first = shelf?.names?.[0] ?? '';
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find(
      p => p.textContent?.trim() === 'Pick a card to ask about'
    );
    const grid = label?.parentElement?.nextElementSibling;
    grid?.querySelector('button')?.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  const after = await page.evaluate(() => document.body.innerText);
  check(after.includes(first), `clicking ${first} attaches it`, `looked for "${first}"`);
  check(!after.includes('No deck or card attached'), 'the context header stopped saying nothing is attached');
  check(!after.includes('Pick a card to ask about'), 'the shelf steps aside once a card is the subject');

  await page.screenshot({ path: path.join(OUT, 'attached.png'), fullPage: true });
  console.log(`\nshot: ${path.join(OUT, 'attached.png')}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
