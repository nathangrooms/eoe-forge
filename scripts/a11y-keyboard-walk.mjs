/**
 * Walk the signed-out app the way a keyboard and screen reader user does.
 *
 * Not an audit tool report. A WALK: press Tab, see where focus lands, ask what
 * a screen reader would say there, and ask whether the eye can find it. Then
 * try to actually do the thing, which here is sign up and read a deck.
 *
 * Everything it reports is read off the live page:
 *   - tab order, in the order the key presses produce it
 *   - the accessible name each stop would announce, computed the way an AT
 *     computes it (aria-label, then labelled control, then text, then title,
 *     then alt), so a stop that announces NOTHING shows up as nothing
 *   - whether a focus indicator is visible, by diffing the computed outline,
 *     box-shadow, border and background of the element focused against itself
 *     unfocused. A ring that only exists in a stylesheet nobody applied is
 *     invisible, and invisible is the whole problem.
 *   - contrast of real rendered text against the colour actually painted
 *     behind it, walking up ancestors for the first non-transparent background
 *   - images with no alt, form controls with no label, headings out of order
 *
 * Read only. It changes nothing and submits nothing.
 *
 *   node scripts/a11y-keyboard-walk.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const OUT = '.shots/a11y';
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const errors = [];
page.on('pageerror', e => errors.push(['pageerror', e.message.slice(0, 240)]));
page.on('console', m => {
  if (m.type() === 'error') errors.push(['console', m.text().slice(0, 240)]);
});
page.on('requestfailed', r =>
  errors.push(['netfail', `${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`])
);

/* ---------- page-side helpers, injected once per navigation ---------- */
const HELPERS = `
window.__a11y = (() => {
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05;
  };
  const txt = el => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();

  // Accessible name, near enough to what an AT computes for these shapes.
  const name = el => {
    if (!el) return '';
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const s = lb.split(/\\s+/).map(id => {
        const t = document.getElementById(id);
        return t ? txt(t) : '';
      }).filter(Boolean).join(' ');
      if (s) return s;
    }
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l && txt(l)) return txt(l);
    }
    const wrap = el.closest('label');
    if (wrap && txt(wrap)) return txt(wrap);
    const t = txt(el);
    if (t) return t.slice(0, 90);
    if (el.getAttribute('title')) return el.getAttribute('title').trim();
    if (el.tagName === 'IMG' && el.getAttribute('alt')) return el.getAttribute('alt').trim();
    if (el.tagName === 'INPUT' && el.placeholder) return '(placeholder only) ' + el.placeholder;
    // icon-only button: any inner svg carrying a title or aria-label
    const svg = el.querySelector && el.querySelector('svg[aria-label], svg > title');
    if (svg) return (svg.getAttribute?.('aria-label') || txt(svg)).trim();
    return '';
  };

  const role = el => {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (t === 'button') return 'button';
    if (t === 'input') return 'input:' + (el.type || 'text');
    if (t === 'select') return 'select';
    if (t === 'textarea') return 'textarea';
    return t;
  };

  const path = el => {
    const bits = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { bits.unshift(s + '#' + n.id); break; }
      const c = (n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className) || '';
      const cls = String(c).trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
      if (cls) s += '.' + cls;
      bits.unshift(s);
    }
    return bits.join('>');
  };

  const ringOf = el => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor,
            s.borderWidth, s.backgroundColor, s.color].join('|');
  };

  const parse = c => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const bgBehind = el => {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.95) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const ratio = el => {
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) return null;
    const bg = bgBehind(el);
    const f = fg.a < 1 ? over(fg, bg) : fg;
    const L1 = lum(f), L2 = lum(bg);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  return { vis, txt, name, role, path, ringOf, ratio, parse, lum, bgBehind };
})();
`;

async function inject() {
  await page.evaluate(HELPERS);
}

async function goto(path, waitMs = 2600) {
  errors.length = 0;
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(waitMs);
  await inject();
}

/* ---------- the walk ---------- */

async function tabWalk(max = 60) {
  // start from the very top of the document, as a real user landing on the page
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
    window.scrollTo(0, 0);
  });

  const stops = [];
  const seen = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    await sleep(70);
    const s = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { none: true, tag: a ? a.tagName : 'null' };
      const A = window.__a11y;
      const r = a.getBoundingClientRect();
      // measure the ring by diffing focused vs blurred computed style
      const focused = A.ringOf(a);
      a.blur();
      const blurred = A.ringOf(a);
      a.focus({ preventScroll: true });
      const cs = getComputedStyle(a);
      return {
        tag: a.tagName.toLowerCase(),
        role: A.role(a),
        name: A.name(a),
        path: A.path(a),
        ring: focused !== blurred,
        outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
        shadow: (cs.boxShadow || 'none').slice(0, 70),
        onscreen: r.top >= -2 && r.bottom <= innerHeight + 2 && r.width > 0,
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        href: a.getAttribute && a.getAttribute('href'),
        disabled: !!a.disabled,
        ariaHidden: !!a.closest('[aria-hidden="true"]'),
      };
    });
    if (s.none) { stops.push({ none: true, at: i }); continue; }
    const key = s.path + '|' + s.name + '|' + s.box.join(',');
    if (seen.has(key) && stops.length > 4) { stops.push({ cycled: true, at: i, name: s.name }); break; }
    seen.add(key);
    stops.push(s);
  }
  return stops;
}

async function pageFacts() {
  return page.evaluate(() => {
    const A = window.__a11y;
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(A.vis)
      .map(h => ({ level: +h.tagName[1], text: A.txt(h).slice(0, 70) }));

    const imgs = [...document.querySelectorAll('img')].filter(A.vis).map(i => ({
      alt: i.getAttribute('alt'),
      hasAlt: i.hasAttribute('alt'),
      src: (i.currentSrc || i.src || '').slice(-60),
      dec: i.getAttribute('role') === 'presentation' || i.getAttribute('alt') === '',
    }));

    const fields = [...document.querySelectorAll('input,select,textarea')]
      .filter(A.vis)
      .map(f => ({
        type: f.type || f.tagName.toLowerCase(),
        name: A.name(f),
        id: f.id || null,
        labelled: !!(f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') ||
                     (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) ||
                     f.closest('label')),
        required: f.required || f.getAttribute('aria-required') === 'true',
        describedby: f.getAttribute('aria-describedby'),
        invalid: f.getAttribute('aria-invalid'),
        autocomplete: f.getAttribute('autocomplete'),
      }));

    // every interactive thing, whether or not it is in the tab order
    const interactive = [...document.querySelectorAll('button,a[href],[role="button"],[onclick]')]
      .filter(A.vis)
      .map(b => ({ role: A.role(b), name: A.name(b), path: A.path(b),
                   tabindex: b.getAttribute('tabindex') }));
    const unnamed = interactive.filter(b => !b.name);

    // text contrast over real painted background
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const done = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = (n.nodeValue || '').trim();
      if (t.length < 3) continue;
      const el = n.parentElement;
      if (!el || done.has(el) || !A.vis(el)) continue;
      done.add(el);
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const weight = +cs.fontWeight || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const r = A.ratio(el);
      if (r == null) continue;
      const need = large ? 3 : 4.5;
      if (r < need) texts.push({ text: t.slice(0, 56), ratio: r, size: Math.round(size * 10) / 10,
                                 weight, need, path: A.path(el) });
    }

    const landmarks = [...document.querySelectorAll('main,nav,header,footer,[role="main"],[role="navigation"],[role="banner"],[role="contentinfo"],[role="search"]')]
      .filter(A.vis).map(l => l.tagName.toLowerCase() + (l.getAttribute('role') ? '[' + l.getAttribute('role') + ']' : ''));

    const live = [...document.querySelectorAll('[aria-live],[role="alert"],[role="status"]')]
      .map(l => ({ live: l.getAttribute('aria-live') || l.getAttribute('role'), text: A.txt(l).slice(0, 60) }));

    return {
      title: document.title,
      lang: document.documentElement.lang,
      viewport: (document.querySelector('meta[name="viewport"]') || {}).content,
      h1: headings.filter(h => h.level === 1).length,
      headings,
      imgs: { total: imgs.length, noAlt: imgs.filter(i => !i.hasAlt), decorative: imgs.filter(i => i.dec).length },
      fields,
      unnamed,
      interactiveCount: interactive.length,
      contrastFails: texts.sort((a, b) => a.ratio - b.ratio).slice(0, 18),
      landmarks: [...new Set(landmarks)],
      live,
      skipLink: (() => {
        const first = document.querySelector('a[href^="#"]');
        return first ? A.txt(first) || first.getAttribute('href') : null;
      })(),
    };
  });
}

const report = {};

async function visit(label, path, opts = {}) {
  log('\n' + '='.repeat(72));
  log('PAGE  ' + label + '   ' + path);
  log('='.repeat(72));
  await goto(path, opts.wait);
  const facts = await pageFacts();
  const stops = await tabWalk(opts.tabs || 45);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: !!opts.full });

  log(`title   "${facts.title}"`);
  log(`lang    ${facts.lang}   viewport: ${facts.viewport}`);
  log(`landmarks ${facts.landmarks.join(', ') || 'NONE'}`);
  log(`skip link: ${facts.skipLink || 'NONE'}`);
  log(`h1 count ${facts.h1}`);
  log('headings: ' + facts.headings.map(h => 'h' + h.level + ' ' + h.text).join(' | ').slice(0, 400));
  log(`images ${facts.imgs.total}, missing alt ${facts.imgs.noAlt.length}, decorative ${facts.imgs.decorative}`);
  facts.imgs.noAlt.slice(0, 8).forEach(i => log('   NO ALT  ...' + i.src));
  log(`interactive ${facts.interactiveCount}, UNNAMED ${facts.unnamed.length}`);
  facts.unnamed.slice(0, 14).forEach(u => log('   UNNAMED ' + u.role + '  ' + u.path));
  if (facts.fields.length) {
    log('fields:');
    facts.fields.forEach(f =>
      log(`   ${f.labelled ? 'ok ' : 'NO LABEL '} ${f.type.padEnd(9)} name="${f.name}" ac=${f.autocomplete} req=${f.required} invalid=${f.invalid} desc=${f.describedby}`)
    );
  }
  log(`live regions ${facts.live.length}: ` + facts.live.map(l => l.live).join(','));
  log(`contrast below AA: ${facts.contrastFails.length}`);
  facts.contrastFails.forEach(c =>
    log(`   ${String(c.ratio).padStart(5)}:1 need ${c.need}  ${c.size}px/${c.weight}  "${c.text}"`)
  );

  log('\nTAB ORDER (' + stops.length + ' presses):');
  stops.forEach((s, i) => {
    if (s.none) return log(`  ${String(i + 1).padStart(2)}. --- focus left the page (body) ---`);
    if (s.cycled) return log(`  ${String(i + 1).padStart(2)}. --- cycled back to start ---`);
    const flags = [
      s.ring ? '' : 'NO VISIBLE RING',
      s.onscreen ? '' : 'OFFSCREEN',
      s.name ? '' : 'NO ACCESSIBLE NAME',
      s.ariaHidden ? 'INSIDE aria-hidden' : '',
    ].filter(Boolean).join(' + ');
    log(`  ${String(i + 1).padStart(2)}. ${s.role.padEnd(12)} "${(s.name || '').slice(0, 46)}"  ${s.path.slice(0, 46)} ${flags ? '<< ' + flags : ''}`);
  });

  if (errors.length) {
    log('\nCONSOLE / NETWORK:');
    [...new Set(errors.map(e => e.join(' ')))].slice(0, 12).forEach(e => log('   ' + e));
  } else log('\nconsole clean');

  report[label] = { facts, stops, errors: [...new Set(errors.map(e => e.join(' ')))] };
}

/* ---------- run ---------- */
await visit('01-home', '/', { full: true, tabs: 55 });
await visit('02-login', '/login', { tabs: 25 });
await visit('03-register', '/register', { tabs: 30 });
await visit('04-forgot', '/forgot-password', { tabs: 18 });
await visit('05-reset', '/reset-password', { tabs: 18 });
await visit('06-play-online', '/play/online', { tabs: 45, wait: 4200 });
await visit('07-gated', '/decks', { tabs: 20 });
await visit('08-notfound', '/this-route-does-not-exist', { tabs: 15 });

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
log('\n\nwrote ' + OUT + '/report.json');
await browser.close();
