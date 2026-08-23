/**
 * Apply one swap, and apply all of them, and see whether the deck agrees.
 *
 *   npm run build
 *   node scripts/optimiser-apply-measure.mjs dist head
 *
 * ## The question
 *
 * The owner reported "apply 9 swaps does nothing while a single swap works".
 * `ConfirmBar` carries a fix for one cause of that — the confirmation asking
 * its question below the fold — and this script exists to check whether the
 * report is fully answered, because "the button now does something" and "the
 * deck now holds the nine cards you asked for" are different claims and only
 * the second one is what was reported.
 *
 * ## What is compared, and why it is two readings and not one
 *
 * After each apply:
 *
 *   ON SCREEN   the names the decklist is drawing, read out of the DOM on the
 *               Cards tab. This is React's `rows` state, which is what the
 *               person is looking at.
 *   WRITTEN     the rows `deck_cards` actually holds, read out of the shim.
 *               This is what survives a reload.
 *   REQUESTS    every call to the Supabase origin inside the window.
 *
 * An optimistic list and a database can disagree, and a page that shows the
 * wrong one is the exact shape of "nothing happened". So both are read.
 *
 * ## Two page loads, not one
 *
 * Path A and Path B run in separate loads. Reading the decklist means opening
 * the Cards tab, and the deck page mounts one tab at a time, so opening Cards
 * unmounts the optimiser and takes its suggestion list with it. Measuring the
 * two paths in one session would mean the second path ran against a panel that
 * had been through a remount, which is not what a person does.
 *
 * Scryfall is left real, so the incoming card is resolved the way the page
 * resolves it. Those calls do not reach the Supabase origin and so are not
 * counted as requests, which is the rule `scripts/deck-save-measure.mjs`
 * counts under.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const DIST = process.argv[2] || 'dist';
const LABEL = process.argv[3] || 'run';
const PORT = Number(process.env.PORT || 4413);
const WIDTH = Number(process.env.WIDTH || 1600);
const HEIGHT = Number(process.env.HEIGHT || 1000);
const SWAPS = Number(process.env.SWAPS || 9);
/** Long: nine swaps are nine Scryfall lookups spaced 120ms apart, plus writes. */
const SETTLE = Number(process.env.SETTLE || 25000);

const here = path.dirname(fileURLToPath(import.meta.url));
const SHIM = fs.readFileSync(path.join(here, 'optimiser-apply-shim.js'), 'utf8');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.webmanifest']);

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) {
    file = path.join(DIST, 'index.html');
    ext = '.html';
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const body = fs.readFileSync(file);
  const accepts = String(req.headers['accept-encoding'] || '');
  const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' };
  if (COMPRESSIBLE.has(ext) && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(body, { level: 9 });
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = gz.length;
    res.writeHead(200, headers);
    return res.end(gz);
  }
  res.writeHead(200, headers);
  res.end(body);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DECK_ID = 'dddddddd-0000-4000-8000-00000000dm01';

/**
 * Click a control the way a person does, with the mouse.
 *
 * `element.click()` is not enough here and finding that out cost a run: Radix's
 * `TabsTrigger` opens on the POINTER event, so a synthetic click leaves the
 * strip exactly where it was and every later wait times out against a tab that
 * looks clicked and is not. Everything in this script goes through the mouse
 * for the same reason, so no control is measured through a path the interface
 * does not actually use.
 *
 * The element is scrolled to the middle of the viewport first, because the
 * swaps list has a sticky command bar at `top-2` and a control under it takes
 * the click on the bar instead.
 */
async function clickByText(page, selector, text) {
  const find = (sel, want) => {
    const nodes = [...document.querySelectorAll(sel)];
    return nodes.find(n =>
      (n.textContent || '').trim().toLowerCase().includes(want.toLowerCase())
    );
  };

  const found = await page.evaluate(
    (sel, want, src) => {
      // eslint-disable-next-line no-new-func
      const hit = new Function('return ' + src)()(sel, want);
      if (!hit) return false;
      hit.scrollIntoView({ block: 'center', behavior: 'instant' });
      return true;
    },
    selector,
    text,
    find.toString()
  );
  if (!found) return null;

  // Re-measured after the scroll has settled, so the coordinates are the ones
  // the pointer will actually land on.
  await sleep(250);
  const box = await page.evaluate(
    (sel, want, src) => {
      // eslint-disable-next-line no-new-func
      const hit = new Function('return ' + src)()(sel, want);
      if (!hit) return null;
      const r = hit.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        label: (hit.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      };
    },
    selector,
    text,
    find.toString()
  );
  if (!box) return null;
  await page.mouse.click(box.x, box.y);
  return box.label;
}

/**
 * Every name the page is drawing a card for.
 *
 * `CardImage` puts the card's name in `title` on a real element, so this reads
 * the decklist without needing a hook added to the app for the harness's
 * benefit. It over-collects — the commander hero has a title too — and that is
 * fine: the question is only ever whether a given name is present.
 */
const readScreen = page =>
  page.evaluate(() => [
    ...new Set([...document.querySelectorAll('[title]')].map(n => n.getAttribute('title'))),
  ]);

function summarise(requests) {
  const byKey = new Map();
  for (const r of requests) {
    const key = `${r.method} ${r.table}`;
    const cur = byKey.get(key) || { key, calls: 0, rows: 0 };
    cur.calls += 1;
    cur.rows += r.rows || 0;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}

function verdict(label, planned, state) {
  const screen = new Set(state.screen);
  const written = new Set(state.written);
  const rows = planned.map(p => ({
    remove: p.remove,
    add: p.add,
    goneScreen: !screen.has(p.remove),
    inScreen: screen.has(p.add),
    goneWritten: !written.has(p.remove),
    inWritten: written.has(p.add),
  }));
  const landedScreen = rows.filter(r => r.goneScreen && r.inScreen).length;
  const landedWritten = rows.filter(r => r.goneWritten && r.inWritten).length;
  console.log(`\n--- ${label} ---`);
  console.log(`   asked for : ${planned.length}`);
  console.log(`   ON SCREEN : ${landedScreen} of ${planned.length} landed`);
  console.log(`   WRITTEN   : ${landedWritten} of ${planned.length} landed`);
  console.log(`   deck rows written: ${state.written.length}`);
  for (const r of rows) {
    console.log(
      `     ${r.remove.padEnd(28).slice(0, 28)} -> ${r.add.padEnd(20).slice(0, 20)}` +
        `  screen[${r.goneScreen ? 'out' : 'STILL-IN'}/${r.inScreen ? 'in' : 'ABSENT'}]` +
        `  written[${r.goneWritten ? 'out' : 'STILL-IN'}/${r.inWritten ? 'in' : 'ABSENT'}]`
    );
  }
  console.log(
    `   requests  : ${state.requests.length} to apply` +
      (state.lookCost ? `  (+${state.lookCost} to then go and look at the decklist)` : '')
  );
  for (const row of summarise(state.requests)) {
    console.log(
      `      ${String(row.calls).padStart(2)} x  ${row.key}${row.rows ? `   (${row.rows} rows)` : ''}`
    );
  }
  return { label, planned, rows, landedScreen, landedWritten, requestCount: state.requests.length, requests: state.requests };
}

/**
 * Load the optimiser, run a pass, and land on the Swaps step.
 *
 * Finds it either way, on purpose. The optimiser was the third of nine tabs on
 * `/deck/:id` and is `/deck/:id/optimise` now, and a before-and-after that
 * needed two scripts would be two scripts to disagree. The route is tried
 * first; a build that does not have it falls back to the tab, and the mode is
 * reported so no reading is attributed to the wrong shape.
 */
async function openSwaps(browser, consoleErrors) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text().replace(/\s+/g, ' ').slice(0, 240));
  });
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));
  await page.evaluateOnNewDocument(`window.__DM_SWAP_COUNT = ${SWAPS};`);
  await page.evaluateOnNewDocument(SHIM);

  const hasPanel = () =>
    page.waitForFunction(
      () => [...document.querySelectorAll('button')].some(b => /Optimise deck/i.test(b.textContent || '')),
      { timeout: 45000 }
    );

  let mode = 'route';
  await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK_ID}/optimise`, {
    waitUntil: 'networkidle2',
    timeout: 120000,
  });
  try {
    await hasPanel();
  } catch {
    mode = 'tab';
    await page.goto(`http://127.0.0.1:${PORT}/deck/${DECK_ID}?tab=optimiser`, {
      waitUntil: 'networkidle2',
      timeout: 120000,
    });
    await hasPanel();
  }
  await sleep(2500);

  const deckTabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].map(t => (t.textContent || '').trim().replace(/\s+/g, ' '))
  );

  await clickByText(page, 'button', 'Optimise deck');
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(b => /Apply this swap/i.test(b.textContent || '')) ||
      [...document.querySelectorAll('[role="tab"]')].some(t => /Swaps/i.test(t.textContent || '')),
    { timeout: 120000 }
  );
  await sleep(3500);

  const steps = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')]
      .map(t => (t.textContent || '').trim().replace(/\s+/g, ' '))
      .filter(t => /Overview|Ideas|Cut|Swaps|Lands/i.test(t))
  );
  const planned = await page.evaluate(() => window.__dmPlannedSwaps || []);

  await clickByText(page, '[role="tab"]', 'Swaps');
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some(b => /Apply this swap/i.test(b.textContent || '')),
    { timeout: 60000 }
  );
  await sleep(1500);

  return { page, mode, deckTabs, steps, planned };
}

/** What the panel itself believes the deck is, without leaving it. */
async function panelCount(page) {
  return page.evaluate(() => {
    const m = /(\d+)\s*\/\s*(\d+)\s*cards/.exec(document.body.innerText || '');
    return m ? `${m[1]}/${m[2]}` : null;
  });
}

/**
 * Open the decklist and read it, without reloading.
 *
 * A reload would rebuild the shim's fixture and take the evidence with it, so
 * this is a click in both modes: the Cards tab when the optimiser is a tab, the
 * "Back to deck" link when it is a route. Both stay inside the same page, so
 * `deck_cards` is still whatever the apply left it as.
 */
async function readDeck(page, mode) {
  /* Taken BEFORE the navigation. When the optimiser is a route, going to look
     at the decklist loads the deck page, and those reads are the cost of
     looking rather than the cost of applying. Counting them would flatter or
     damn the apply depending only on which shape the optimiser is in. */
  const requests = await page.evaluate(() => window.__dmReq.slice());

  if (mode === 'route') await clickByText(page, 'a', 'Back to deck');
  else await clickByText(page, '[role="tab"]', 'Cards');
  await sleep(5000);
  const screen = await readScreen(page);
  const written = await page.evaluate(() =>
    (window.__dmDeckCards ? window.__dmDeckCards() : []).map(r => r.card_name)
  );
  const afterLook = await page.evaluate(() => window.__dmReq.length);
  return { screen, written, requests, lookCost: afterLook - requests.length };
}

(async () => {
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-lcd-text'],
  });

  const consoleErrors = [];
  const results = [];
  let tabStrip = [];
  let steps = [];

  console.log(`\n=== ${LABEL} · ${DIST} ===`);

  /* ------------------------------------------------ PATH A: one swap ---- */
  {
    const ctx = await openSwaps(browser, consoleErrors);
    tabStrip = ctx.deckTabs;
    steps = ctx.steps;
    console.log(`the optimiser is a: ${ctx.mode === 'route' ? 'ROUTE (/deck/:id/optimise)' : 'TAB on /deck/:id'}`);
    console.log(`tabs on that page : ${JSON.stringify(tabStrip)}`);
    console.log(`optimiser steps: ${JSON.stringify(steps)}`);
    console.log(`planned swaps  : ${ctx.planned.length}`);

    await ctx.page.evaluate(() => window.__dmResetReq());
    const clicked = await clickByText(ctx.page, 'button', 'Apply this swap');
    console.log(`\nclicked: ${JSON.stringify(clicked)}`);
    await sleep(SETTLE / 2);
    results.push(verdict('PATH A — one swap', [ctx.planned[0]], await readDeck(ctx.page, ctx.mode)));
    await ctx.page.close();
  }

  /* ------------------------------------- PATH B: every swap at once ----- */
  {
    const ctx = await openSwaps(browser, consoleErrors);
    await ctx.page.evaluate(() => window.__dmResetReq());

    const ticked = await ctx.page.evaluate(
      () => document.querySelectorAll('input[type="checkbox"]:checked').length
    );
    const clicked = await clickByText(ctx.page, 'button', 'Apply ');
    console.log(`\nswaps ticked on arrival: ${ticked}`);
    console.log(`clicked: ${JSON.stringify(clicked)}`);
    await sleep(2000);

    // Was the question actually put where it could be read? That is the fault
    // `ConfirmBar` exists to prevent, so it is measured rather than assumed.
    const confirm = await ctx.page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        /Confirm swaps/i.test(x.textContent || '')
      );
      if (!b) return { found: false };
      const box = b.getBoundingClientRect();
      return {
        found: true,
        topPx: Math.round(box.top),
        inViewport: box.top >= 0 && box.bottom <= window.innerHeight,
        scrollY: Math.round(window.scrollY),
        docHeight: Math.round(document.documentElement.scrollHeight),
      };
    });
    console.log(`confirmation: ${JSON.stringify(confirm)}`);

    await clickByText(ctx.page, 'button', 'Confirm swaps');
    await sleep(SETTLE);
    await ctx.page
      .waitForFunction(
        () => ![...document.querySelectorAll('button')].some(b => /Applying/i.test(b.textContent || '')),
        { timeout: 90000 }
      )
      .catch(() => console.log('   (still showing "Applying" when the wait expired)'));
    await sleep(4000);

    const panelSees = await panelCount(ctx.page);
    console.log(`the panel's own count after applying: ${panelSees}`);
    results.push(
      verdict(
        `PATH B — ${ctx.planned.length} swaps at once`,
        ctx.planned,
        await readDeck(ctx.page, ctx.mode)
      )
    );
    results[results.length - 1].confirm = confirm;
    await ctx.page.close();
  }

  /* ------------- PATH C: the whole pass, with nothing ticked by hand ---- */
  {
    const ctx = await openSwaps(browser, consoleErrors);
    await ctx.page.evaluate(() => window.__dmResetReq());

    const opened = await clickByText(ctx.page, 'button', 'Auto optimise');
    await sleep(1200);
    const planned = await ctx.page.evaluate(() => {
      const head = [...document.querySelectorAll('h4')].find(h =>
        /What this does, in order/i.test(h.textContent || '')
      );
      if (!head) return null;
      const list = head.parentElement.querySelector('ol');
      return [...list.querySelectorAll('li li')].map(li =>
        (li.textContent || '').trim().replace(/\s+/g, ' ')
      );
    });
    const ran = await clickByText(ctx.page, 'button', 'Apply all ');
    console.log(`\n--- PATH C — auto optimise ---`);
    console.log(`   opened  : ${JSON.stringify(opened)}`);
    console.log(`   planned : ${planned ? planned.length : 'no preview'} moves`);
    console.log(`   ran     : ${JSON.stringify(ran)}`);
    await sleep(SETTLE + 8000);
    await ctx.page
      .waitForFunction(
        () => ![...document.querySelectorAll('button')].some(b => /Applying/i.test(b.textContent || '')),
        { timeout: 90000 }
      )
      .catch(() => console.log('   (still showing "Applying" when the wait expired)'));
    await sleep(4000);

    // The receipt is the product's own claim about what happened. Compared
    // against `deck_cards`, which is what actually happened.
    const receipt = await ctx.page.evaluate(() => {
      const text = document.body.innerText;
      const moved = /(\d+)\s+card[s]? (?:changed|moved|in|out)/i.exec(text);
      const missed = /(\d+)\s+cards? did not move/i.exec(text) || /(\d+)\s+card did not move/i.exec(text);
      return {
        headline: (() => {
          const h = [...document.querySelectorAll('h3')].find(n =>
            /changed|Nothing changed/i.test(n.textContent || '')
          );
          return h ? h.textContent.trim().replace(/\s+/g, ' ') : null;
        })(),
        movedMatch: moved ? moved[0] : null,
        didNotMove: missed ? Number(missed[1]) : 0,
        undoOffered: [...document.querySelectorAll('button')].some(b =>
          /Undo all of it/i.test(b.textContent || '')
        ),
      };
    });
    const written = await ctx.page.evaluate(() =>
      (window.__dmDeckCards ? window.__dmDeckCards() : []).map(r => r.card_name)
    );
    const requests = await ctx.page.evaluate(() => window.__dmReq.slice());
    const before = new Set((await ctx.page.evaluate(() => window.__dmPlannedSwaps || [])).map(s => s.remove));
    const stillWritten = [...before].filter(n => written.includes(n)).length;

    console.log(`   receipt : ${JSON.stringify(receipt)}`);
    console.log(`   WRITTEN : ${before.size - stillWritten} of the ${before.size} swap targets are gone from deck_cards`);
    console.log(`   requests: ${requests.length}`);
    for (const row of summarise(requests)) {
      console.log(`      ${String(row.calls).padStart(2)} x  ${row.key}${row.rows ? `   (${row.rows} rows)` : ''}`);
    }
    results.push({
      label: 'PATH C — auto optimise',
      planned: planned ? planned.length : null,
      receipt,
      swapTargetsRemovedFromDatabase: before.size - stillWritten,
      swapTargets: before.size,
      requestCount: requests.length,
    });
    await ctx.page.close();
  }

  console.log(`\nconsole errors: ${consoleErrors.length}`);
  for (const e of [...new Set(consoleErrors)].slice(0, 12)) console.log(`   ${e}`);

  await browser.close();
  server.close();

  const out = path.join(here, '..', 'scratch');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `optimiser-apply-${LABEL}.json`),
    JSON.stringify({ label: LABEL, dist: DIST, tabStrip, steps, results, consoleErrors }, null, 2)
  );
})();
