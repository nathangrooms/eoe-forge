/* Seventh-pass independent walk. Assumes nothing landed. */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/seventh';
fs.mkdirSync(OUT, { recursive: true });
const CARD = process.env.CARD || 'ee6e5a35-fe21-4dee-b0ef-a8f2841511ad';
const ROUTES = [
  ['/', 'home'],
  ['/login', 'login'],
  ['/register', 'register'],
  ['/forgot-password', 'forgot'],
  ['/terms', 'terms'],
  ['/privacy', 'privacy'],
  ['/play/online', 'lobby'],
  [`/cards/${CARD}`, 'card'],
  ['/p/does-not-exist-slug', 'shared-missing'],
  ['/decks', 'gated-decks'],
  ['/play', 'gated-play'],
  ['/this-route-does-not-exist', 'notfound'],
];
const WIDTHS = [390, 1280, 1920];
const b = await puppeteer.launch({
  headless: 'new', protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});
const rows = [];
for (const w of WIDTHS) {
  for (const [route, name] of ROUTES) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: 900 });
    const errs = [], failed = [], http = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
    p.on('console', m => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
    p.on('requestfailed', r => failed.push(r.url().slice(0, 110)));
    p.on('response', r => { try { if (r.status() >= 400 && new URL(r.url()).host === new URL(BASE).host) http.push(r.status() + ' ' + r.url().slice(0, 110)); } catch {} });
    await p.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => errs.push('nav ' + e.message));
    await p.waitForFunction(() => document.querySelector('h1') || document.body.innerText.length > 200, { timeout: 30000 }).catch(() => errs.push('never rendered'));
    await new Promise(r => setTimeout(r, 2200));
    const info = await p.evaluate(() => {
      const txt = document.body.innerText;
      // SVG <text> is invisible to innerText. Chart tick labels live there.
      const svgText = [...document.querySelectorAll('svg text, svg tspan')].map(n => n.textContent).join(' | ');
      const hairlines = [...document.querySelectorAll('*')].filter(e => {
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        const s = getComputedStyle(e);
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
          const wpx = parseFloat(s['border' + side + 'Width']);
          if (wpx < 0.5) continue;
          const c = s['border' + side + 'Color'];
          const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
          if (!m) continue;
          const a = m[4] === undefined ? 1 : parseFloat(m[4]);
          if (a < 0.28) continue;
          const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
          // a visible hairline against a charcoal ground
          if (lum > 0.10) return true;
        }
        return false;
      }).length;
      const imgs = [...document.querySelectorAll('img')];
      return {
        title: document.title,
        main: document.querySelectorAll('main').length,
        h1: document.querySelectorAll('h1').length,
        h1text: [...document.querySelectorAll('h1')].map(h => h.innerText.trim().slice(0, 70)),
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        docH: document.documentElement.scrollHeight,
        zeroPrice: (txt.match(/\$0\.00(?!\d)/g) || []).length,
        zeroPriceSvg: (svgText.match(/\$-?0\.00(?!\d)/g) || []).length,
        negativeMoney: (txt.match(/\$-[\d.]+/g) || []).concat(svgText.match(/\$-[\d.]+/g) || []),
        unnamed: [...document.querySelectorAll('a[href],button,input,select,textarea')].filter(e => {
          const n = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('title') || e.getAttribute('placeholder') || '').trim();
          const r = e.getBoundingClientRect();
          return !n && r.width > 0 && r.height > 0;
        }).length,
        inputs: document.querySelectorAll('input,textarea').length,
        navs: document.querySelectorAll('nav').length,
        hairlines,
        imgsMissingAlt: imgs.filter(i => i.getAttribute('alt') === null).length,
        desaturated: imgs.filter(i => /grayscale|saturate\(0/.test(getComputedStyle(i).filter)).length,
        dialogs: document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length,
        links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
        bodyStart: txt.slice(0, 260).replace(/\s+/g, ' '),
      };
    }).catch(e => ({ evalFail: e.message }));
    const problems = [];
    if (errs.length) problems.push('console ' + JSON.stringify(errs.slice(0, 3)));
    if (failed.length) problems.push('reqfail ' + JSON.stringify(failed.slice(0, 2)));
    if (http.length) problems.push('http ' + JSON.stringify(http.slice(0, 2)));
    if (info.scrollW > info.innerW + 1) problems.push(`hscroll ${info.scrollW}>${info.innerW}`);
    if (info.main !== 1) problems.push('main=' + info.main);
    if (info.h1 !== 1) problems.push('h1=' + info.h1);
    if (info.zeroPrice) problems.push(info.zeroPrice + ' x $0.00 in text');
    if (info.zeroPriceSvg) problems.push(info.zeroPriceSvg + ' x $0.00 in svg');
    if (info.negativeMoney && info.negativeMoney.length) problems.push('negative money ' + JSON.stringify(info.negativeMoney.slice(0, 3)));
    if (info.unnamed) problems.push(info.unnamed + ' unnamed controls');
    if (info.hairlines) problems.push(info.hairlines + ' visible hairlines');
    if (info.imgsMissingAlt) problems.push(info.imgsMissingAlt + ' imgs no alt attr');
    if (info.desaturated) problems.push(info.desaturated + ' desaturated imgs');
    rows.push({ w, route, name, problems, info });
    console.log((problems.length ? 'FAIL ' : 'ok   ') + w + 'px ' + route + '  "' + info.title + '"' + (problems.length ? '\n      ' + problems.join(' | ') : ''));
    await p.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: false }).catch(() => {});
    if (w === 1280) await p.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true }).catch(() => {});
    await p.close();
  }
}
fs.writeFileSync(`${OUT}/walk7.json`, JSON.stringify(rows, null, 1));
await b.close();
const bad = rows.filter(r => r.problems.length).length;
console.log('\n' + (bad ? bad + ' combinations with problems' : 'all clean'));
