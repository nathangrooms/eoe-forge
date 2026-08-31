/**
 * Photograph the Engine and Words screens in `/admin`.
 *
 *   node scripts/admin-engine-shots.mjs
 *
 * The gate is faked by `scripts/admin-shim.js` and NOTHING ELSE IS: every
 * number in these shots is the live database answering a real anonymous
 * request, because `engine_coverage()`, `engine_vocabulary()` and
 * `cards_unique` are all granted to `anon`. Read that shim's header.
 *
 * It scrolls before capturing and waits on `naturalWidth`, for the reason
 * CLAUDE.md gives at length: `fullPage: true` never moves the viewport, so a
 * lazy image below the first screenful has never been requested and photographs
 * as a grey box. That misread three screens in one day.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '.shots');
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE ?? 'http://localhost:8080';
const SHIM = fs.readFileSync(path.join(here, 'admin-shim.js'), 'utf8');

const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

/** Scroll the whole page so lazy images are actually asked for, then settle. */
async function scrollThrough(tab) {
  await tab.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  });
  /* `complete` is ALSO true for an image that finished failing. */
  await tab
    .waitForFunction(
      () => [...document.images].every(i => i.naturalWidth > 0 || i.dataset.dmOptional === '1'),
      { timeout: 12000 }
    )
    .catch(() => log('  (some images did not load)'));
  await tab.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function shoot(label, { tab: adminTab, width, height, clicks = [], fullPage = true }) {
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));
  tab.on('console', m => {
    if (m.type() === 'error') log('  [console]', m.text().slice(0, 200));
  });

  /*
   * `domcontentloaded`, NOT `networkidle2`.
   *
   * The admin page fires a lot of requests and several of them 401 by design
   * (owner-scoped tables an anonymous key may not read), so the network never
   * goes quiet and `networkidle2` waits for a condition that will not arrive.
   * It survived until the machine was busy with a workflow, then timed out at
   * 60 s on the first shot. Waiting for the thing we actually need, which is
   * the tab strip, is both faster and correct.
   */
  await tab.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tab.waitForSelector('[role="tab"]', { timeout: 60000 });

  /* Radix opens on POINTER events; a synthetic el.click() silently does
     nothing. CLAUDE.md records a sweep reporting all nine admin tabs as
     "no change" for exactly this reason. Use Puppeteer's own click. */
  const tabs = await tab.$$('[role="tab"]');
  for (const t of tabs) {
    const text = await tab.evaluate(el => el.textContent?.trim() ?? '', t);
    if (text.toLowerCase().includes(adminTab)) {
      await t.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2500));

  for (const sel of clicks) {
    const el = await tab.$(sel);
    if (el) {
      await el.click();
      await new Promise(r => setTimeout(r, 1800));
    } else {
      log(`  (no element for ${sel})`);
    }
  }

  await scrollThrough(tab);

  const h = await tab.evaluate(() => document.body.scrollHeight);
  const file = path.join(OUT, `${label}.png`);
  await tab.screenshot({ path: file, fullPage });
  log(`  ${label}  ${width}x${height}  page ${h}px  -> .shots/${label}.png`);
  await tab.close();
}

await shoot('admin-engine-1600', { tab: 'engine', width: 1600, height: 1000 });
await shoot('admin-words-1600', { tab: 'words', width: 1600, height: 1000 });
await shoot('admin-words-390', { tab: 'words', width: 390, height: 844 });

/* A shell opened. The panel is the part that draws real cards, so it is the
   part most likely to be wrong: a name that no longer resolves photographs as a
   grey rectangle and nothing else would say so. */
await shoot('admin-words-shell', {
  tab: 'words',
  width: 1600,
  height: 1000,
  clicks: ['button:has(h3)'],
  fullPage: false,
});

/*
 * HIGH RESOLUTION, SECTION BY SECTION.
 *
 * Owner: *"tried sending this to friend but its super blurry on whatsapp"*.
 * A 1,592 x 4,930 full-page capture is 8:1, and every messaging app downsizes
 * a tall image to fit a preview before it compresses it, so the type is gone
 * before the recipient ever taps it. Two changes fix it: `deviceScaleFactor: 2`
 * so the type is drawn at twice the pixels, and one image per section so each
 * one is a sane shape.
 */
async function sections(label, { tab: adminTab, width = 1500, slice = 950 }) {
  const tab = await browser.newPage();
  await tab.setViewport({ width, height: slice, deviceScaleFactor: 2 });
  await tab.evaluateOnNewDocument(SHIM);
  /*
   * `domcontentloaded`, NOT `networkidle2`.
   *
   * The admin page fires a lot of requests and several of them 401 by design
   * (owner-scoped tables an anonymous key may not read), so the network never
   * goes quiet and `networkidle2` waits for a condition that will not arrive.
   * It survived until the machine was busy with a workflow, then timed out at
   * 60 s on the first shot. Waiting for the thing we actually need, which is
   * the tab strip, is both faster and correct.
   */
  await tab.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tab.waitForSelector('[role="tab"]', { timeout: 60000 });
  for (const t of await tab.$$('[role="tab"]')) {
    const text = await tab.evaluate(el => el.textContent?.trim() ?? '', t);
    if (text.toLowerCase().includes(adminTab)) { await t.click(); break; }
  }
  await new Promise(r => setTimeout(r, 2500));
  await scrollThrough(tab);

  /*
   * FIXED VIEWPORT SLICES, NOT DOM SECTIONS.
   *
   * The first version walked up from each `h2` to find its card. It found the
   * left navigation's own headings, produced two 232px-wide pictures of nothing,
   * and missed the last section entirely. Slicing the viewport cannot miss
   * anything and cannot pick the wrong ancestor; the overlap means a heading
   * that lands on a boundary appears whole in one of the two.
   */
  const total = await tab.evaluate(() => document.body.scrollHeight);
  const overlap = 60;
  let n = 0;
  for (let y = 0; y < total; y += slice - overlap) {
    await tab.evaluate(top => window.scrollTo(0, top), y);
    await new Promise(r => setTimeout(r, 250));
    n++;
    const file = path.join(OUT, `${label}-${String(n).padStart(2, '0')}.png`);
    await tab.screenshot({ path: file });
  }
  log(`  ${label}  ${n} slices, ${width * 2}px wide at 2x, page ${total}px`);
  await tab.close();
}

await sections('share-engine', { tab: 'engine' });
await sections('share-words', { tab: 'words' });

await browser.close();
log('done');
