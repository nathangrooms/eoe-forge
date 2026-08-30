/**
 * Does the deck page's "Suggest cards" button actually suggest cards?
 *
 *   node scripts/probe/deck-suggest.mjs
 *
 * WHY
 * ---
 * `nav-audit` walks the Add tab and reports it clean, because at rest it is:
 * the suggestions live behind a button and the search results behind a query,
 * so the screen has nothing wrong with it until somebody presses something.
 *
 * Pressing it on 2026-08-30 found the candidate query returning HTTP 500,
 * `57014 canceling statement due to statement timeout`, and the panel then
 * printing "Nothing in the pool scored well enough against this deck" — a
 * verdict, over a query that never ran. Explained against the live database the
 * old query took 16,119 ms against the 8 s the `authenticated` role allows, so
 * the button had not worked for anybody since `cards` began holding every
 * printing.
 *
 * This is the check that would have caught it. It spies on `fetch` inside the
 * page rather than on Puppeteer's response events, because the response events
 * proved unreliable here and the thing worth knowing is exactly what the app
 * asked for and how long it waited.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4607);
const DECK = process.env.DECK || 'e0909132-5a48-4416-924c-dd2374d3d34d';
const SETTLE = Number(process.env.SETTLE || 9000);
const OUT = process.env.OUT || '.shots/deck-screens';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(DIST, p);
  let e = path.extname(f);
  if (!e || !fs.existsSync(f)) { f = path.join(DIST, 'index.html'); e = '.html'; }
  r.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
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
  await page.evaluateOnNewDocument(fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8'));

  /* The spy. Records every catalogue read the app makes, with how long it
     waited, so a timeout is visible as a duration and not only as a status. */
  await page.evaluateOnNewDocument(() => {
    window.__catalogue = [];
    const real = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const started = Date.now();
      const res = await real.apply(this, args);
      const isCandidateRead =
        url.indexOf('cards_pool') >= 0 ||
        url.indexOf('cards_unique') >= 0 ||
        url.indexOf('select=id,oracle_id,name') >= 0;
      if (isCandidateRead) {
        window.__catalogue.push({
          ms: Date.now() - started,
          status: res.status,
          table: url.indexOf('cards_pool') >= 0 ? 'cards_pool'
            : url.indexOf('cards_unique') >= 0 ? 'cards_unique' : 'cards',
        });
      }
      return res;
    };
  });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 160)));

  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK}?tab=add`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, SETTLE));

  const pressed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      x => (x.textContent || '').trim() === 'Suggest cards' || (x.textContent || '').trim() === 'Rank again'
    );
    if (!b) return false;
    b.click();
    return true;
  });
  check(pressed, 'the button is there to press');

  /* Generous: the point is to see the request finish, not to time the UI. */
  await new Promise(r => setTimeout(r, 20000));

  const reads = await page.evaluate(() => window.__catalogue || []);
  const result = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      art: [...document.querySelectorAll('img')].filter(i => /scryfall/i.test(i.currentSrc || i.src || '')).length,
      saysNothingFit: t.indexOf('Nothing in the pool scored well enough') >= 0,
      saysDidNotAnswer: t.indexOf('The card catalogue did not answer') >= 0,
    };
  });

  console.log(`\n  catalogue reads: ${reads.length}`);
  for (const r of reads) console.log(`    ${r.status}  ${String(r.ms).padStart(6)}ms  ${r.table}`);

  check(reads.length > 0, 'the button actually asked the catalogue for candidates');
  const bad = reads.filter(r => r.status >= 400);
  check(bad.length === 0, 'no candidate read failed', bad.map(b => `${b.status} on ${b.table}`).join(', '));
  const slow = reads.filter(r => r.ms > 8000);
  check(slow.length === 0, 'every candidate read fits the 8s authenticated timeout',
    slow.map(b => `${b.ms}ms on ${b.table}`).join(', '));
  check(!reads.some(r => r.table === 'cards'),
    'candidates come from a deduped source, not the printings table');

  /* The honesty check. A failed query must never be reported as a verdict. */
  check(!(bad.length > 0 && result.saysNothingFit),
    'a failed lookup is not reported as "nothing scored well enough"');

  check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));

  /* THE POINT OF THE BUTTON. Everything above can pass while the panel shows
     nothing: the query can succeed, return rows, and the ranker still render
     no cards. Two images is the page furniture, so anything at or below that
     means no suggestion was drawn. */
  check(result.art > 2, 'suggestions were actually drawn', `${result.art} card images`);
  check(!result.saysNothingFit, 'the panel is not claiming nothing fit');
  console.log(`\n  card images after: ${result.art}`);

  await page.screenshot({ path: path.join(OUT, 'deck-add-suggested.png'), fullPage: true });
  console.log(`  shot: ${path.join(OUT, 'deck-add-suggested.png')}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
