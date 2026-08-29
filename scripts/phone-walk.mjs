/**
 * The phone player at 390px, signed out.
 *
 * The goal being tested is a real one: somebody at a table, one thumb, dim
 * light, wants to look a card up mid game. So this does not admire pages. It
 * measures the four things that decide whether a thumb can use a page at all:
 *
 *   1. HORIZONTAL OVERFLOW. A page wider than the viewport means every vertical
 *      scroll drifts sideways and text runs off the edge. Reported per element
 *      so the culprit is named, not just the page.
 *   2. TAP TARGETS. Anything interactive whose rendered box is under 44px in
 *      either direction is a miss for a thumb. Apple's number, and the one the
 *      WCAG 2.2 target-size minimum (24px) is a weaker version of.
 *   3. HOVER-ONLY CONTENT. A phone has no hover. Anything that only reveals
 *      itself on :hover is invisible on a phone, permanently.
 *   4. CONTRAST. Dim light is the constraint. Small text under 4.5:1 against
 *      what is actually painted behind it is unreadable at a table.
 *
 * Plus console errors and failed requests on every page, and a screenshot.
 *
 * Reads only. Changes nothing. Start the dev server first, then:
 *   node scripts/phone-walk.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/phone-walk';
const W = 390;
const H = 844;
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Real ids read out of the live cards table, so nothing here is invented.
   The unpriced printings are deliberate: a $0.00 on screen is always a bug. */
const CARD_PRICED = 'b4b36435-55b3-4615-8812-af41d4fc64d9'; // Deflecting Swat (cmm), usd 71.25
const CARD_UNPRICED = '8a2a7ae1-467c-4eca-9ce2-39692804e492'; // Deflecting Swat (cmm), usd null
const CARD_DFC = 'abff6c81-65a4-48fa-ba8f-580f87b0344a'; // Delver of Secrets (mid), transform

const ROUTES = [
  ['home', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['forgot-password', '/forgot-password'],
  ['card-priced', `/cards/${CARD_PRICED}`],
  ['card-unpriced', `/cards/${CARD_UNPRICED}`],
  ['card-dfc', `/cards/${CARD_DFC}`],
  ['lobby', '/play/online'],
  ['shared-deck-missing', '/p/does-not-exist'],
  ['bounced-collection', '/collection'],
  ['bounced-play', '/play'],
];

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const report = [];

for (const [name, route] of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  const errors = [];
  const failed = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
  page.on('response', r => {
    if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`);
  });

  let landed = route;
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e) {
    errors.push(`goto: ${e.message.slice(0, 160)}`);
  }
  /* Long settle on purpose. A first pass at 2.2s caught a card page still
     saying "Loading card…" and reported an empty page as a structural fact.
     It was transient. Measure the settled page, and report the wait separately
     (scripts/phone-timing.mjs) rather than confusing slow with broken. */
  await sleep(7000);
  landed = new URL(page.url()).pathname + new URL(page.url()).search;

  const measured = await page.evaluate(vw => {
    const out = {};

    /* ---- overflow: who is actually wider than the screen ---- */
    out.docWidth = document.documentElement.scrollWidth;
    out.bodyWidth = document.body.scrollWidth;
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const right = r.left + r.width;
      if (right > vw + 1.5 || r.left < -1.5) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && r.width <= vw + 2) continue;
        /* only report the OUTERMOST offender, not every descendant */
        if (wide.some(w => w.el.contains(el))) continue;
        wide.push({
          el,
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 110),
          left: Math.round(r.left),
          right: Math.round(right),
          width: Math.round(r.width),
          text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70),
        });
      }
    }
    out.overflow = wide.map(({ el, ...rest }) => rest).slice(0, 14);

    /* ---- tap targets ---- */
    const SEL = 'a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="link"], [tabindex]:not([tabindex="-1"])';
    const small = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      if (r.top > document.documentElement.scrollHeight) continue;
      const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 46);
      if (r.width < 44 || r.height < 44) {
        const key = `${el.tagName}|${label}|${Math.round(r.width)}x${Math.round(r.height)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        small.push({
          tag: el.tagName.toLowerCase(),
          label: label || '(no text)',
          w: Math.round(r.width),
          h: Math.round(r.height),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
        });
      }
    }
    out.smallTargets = small.slice(0, 30);
    out.smallTargetCount = small.length;

    /* ---- interactive elements with no accessible name ---- */
    const nameless = [];
    for (const el of document.querySelectorAll('a[href], button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const txt = (el.innerText || '').trim();
      const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const imgAlt = [...el.querySelectorAll('img')].map(i => i.alt).join('').trim();
      if (!txt && !aria && !imgAlt) {
        nameless.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70) });
      }
    }
    out.namelessControls = nameless.slice(0, 12);

    /* ---- hover-only rules in the stylesheets that hide/show ---- */
    let hoverOnly = 0;
    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          if (!rule.selectorText || !/:hover/.test(rule.selectorText)) continue;
          const t = rule.style && (rule.style.opacity || rule.style.display || rule.style.visibility);
          if (t) hoverOnly++;
        }
      }
    } catch {}
    out.hoverRevealRules = hoverOnly;

    /* ---- money on screen: a rendered $0.00 is always invented ---- */
    const body = document.body.innerText || '';
    out.zeroPrices = (body.match(/[$£€]\s?0\.00\b/g) || []).length;
    out.priceStrings = (body.match(/[$£€]\s?\d[\d,]*\.\d{2}/g) || []).slice(0, 12);

    /* ---- contrast of small text against what is painted behind it ---- */
    const lum = c => {
      const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    const parse = str => {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(x => parseFloat(x));
      return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    const bgOf = el => {
      let n = el;
      let acc = null;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.92) return c.rgb;
        if (c && c.a > 0) acc = acc || c.rgb;
        n = n.parentElement;
      }
      return acc || [10, 10, 10];
    };
    const low = [];
    const cseen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let checked = 0;
    while ((node = walker.nextNode()) && checked < 900) {
      const txt = (node.textContent || '').trim();
      if (txt.length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.top > 4000) continue;
      checked++;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      if (!fg) continue;
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const bg = bgOf(el);
      const a = fg.a === undefined ? 1 : fg.a;
      const eff = fg.rgb.map((v, i) => v * a + bg[i] * (1 - a));
      const l1 = lum(eff), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const need = large ? 3 : 4.5;
      if (ratio < need) {
        const key = `${cs.color}|${Math.round(size)}|${txt.slice(0, 24)}`;
        if (cseen.has(key)) continue;
        cseen.add(key);
        low.push({
          text: txt.slice(0, 50),
          ratio: Math.round(ratio * 100) / 100,
          need,
          size: Math.round(size),
          color: cs.color,
          bg: `rgb(${bg.map(Math.round).join(',')})`,
        });
      }
    }
    out.lowContrast = low.slice(0, 18);
    out.lowContrastCount = low.length;

    /* ---- images with no alt ---- */
    out.imagesNoAlt = [...document.querySelectorAll('img')].filter(i => !i.getAttribute('alt')).length;
    out.imagesTotal = document.querySelectorAll('img').length;

    /* ---- how far a thumb has to scroll ---- */
    out.pageHeight = document.documentElement.scrollHeight;

    /* ---- first words on screen, for the report ---- */
    out.headline = (document.querySelector('h1')?.innerText || '').trim().slice(0, 120);
    out.firstText = (document.body.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300);

    return out;
  }, W);

  await page.screenshot({ path: path.join(OUT, `${name}-top.png`) });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, `${name}-bottom.png`) });
  await page.evaluate(() => window.scrollTo(0, 0));

  report.push({ name, route, landed, errors: [...new Set(errors)].slice(0, 10), failed: [...new Set(failed)].slice(0, 10), ...measured });
  console.log(`\n=== ${name}  ${route}  ->  ${landed}`);
  console.log(`    doc ${measured.docWidth}px / viewport ${W}px   height ${measured.pageHeight}px`);
  console.log(`    overflow offenders ${measured.overflow.length}   small taps ${measured.smallTargetCount}   low contrast ${measured.lowContrastCount}   nameless ${measured.namelessControls.length}`);
  console.log(`    zero prices ${measured.zeroPrices}   imgs no alt ${measured.imagesNoAlt}/${measured.imagesTotal}   errors ${errors.length}   failed reqs ${failed.length}`);
  await page.close();
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nwrote ${path.join(OUT, 'report.json')}`);
await browser.close();
