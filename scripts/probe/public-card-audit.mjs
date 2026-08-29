/**
 * Measures the public card page the way the phone and screen-reader personas
 * did: touch target sizes, accessible names, contrast of the smallest type, and
 * whether the price chart's axis can go below zero.
 *
 *   node scripts/probe/public-card-audit.mjs
 *   CARD=<uuid> WIDTH=390 node scripts/probe/public-card-audit.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const CARD = process.env.CARD || 'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const WIDTH = Number(process.env.WIDTH || 390);
const OUT = '.shots/launch-repair';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 844, deviceScaleFactor: 1 });
await page.goto(`${BASE}/cards/${CARD}`, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 3500));

const report = await page.evaluate(() => {
  const MIN = 24; // WCAG 2.2 AA target size minimum

  const name = el => {
    const label = el.getAttribute('aria-label');
    if (label) return label.trim();
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      return labelledby
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent?.trim() || '')
        .join(' ')
        .trim();
    }
    return (el.innerText || el.textContent || '').trim();
  };

  const controls = [...document.querySelectorAll('a[href], button, [role=button]')]
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        name: name(el).replace(/\s+/g, ' ').slice(0, 60),
        w: Math.round(r.width),
        h: Math.round(r.height),
        ariaPressed: el.getAttribute('aria-pressed'),
      };
    })
    .filter(c => c.w > 0 && c.h > 0);

  const tooSmall = controls.filter(c => c.w < MIN || c.h < MIN);

  // Duplicate accessible names among controls: how a reader hears the same
  // word twelve times and cannot tell one printing from another.
  const counts = {};
  for (const c of controls) counts[c.name] = (counts[c.name] || 0) + 1;
  const duplicated = Object.entries(counts)
    .filter(([, n]) => n > 2)
    .sort((a, b) => b[1] - a[1]);

  // Y axis tick labels anywhere on the page.
  const axis = [...document.querySelectorAll('text, tspan, .recharts-cartesian-axis-tick-value')]
    .map(t => (t.textContent || '').trim())
    .filter(t => /^-?\$/.test(t));
  const negative = axis.filter(t => /^\$-|^-\$/.test(t));

  // Any leaked engineering vocabulary in what a player reads.
  const body = document.body.innerText;
  const jargon = [
    'tags @>',
    'oracle_id',
    'statement timeout',
    'permission denied',
    'recommendation model',
    ' model',
    'null',
    'undefined',
  ].filter(w => body.includes(w));

  return {
    controls: controls.length,
    tooSmall,
    duplicated: duplicated.slice(0, 6),
    axis: [...new Set(axis)],
    negative: [...new Set(negative)],
    jargon,
    emDash: (body.match(/—/g) || []).length,
  };
});

await page.screenshot({ path: `${OUT}/card-audit-${WIDTH}.png`, fullPage: true });
console.log(JSON.stringify(report, null, 1));
await browser.close();
