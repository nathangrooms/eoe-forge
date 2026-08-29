/**
 * The two halves of the goal: get through sign up, and read a deck.
 *
 * Part one does NOT create an account. It trips the one check that runs before
 * any network call, mismatched passwords, and then asks the only question that
 * matters to somebody who cannot see the screen: was I told, and can I find the
 * field that is wrong? A toast that fades is not an answer if it is gone before
 * the reader reaches it, and a field with no aria-invalid cannot be found by
 * tabbing back through the form.
 *
 * Part two walks the public deck and public card routes with the keyboard.
 *
 * Read only. It never submits a valid sign up and never enters a real address.
 *
 *   node scripts/a11y-error-and-deck.mjs
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
const errs = [];
page.on('pageerror', e => errs.push('pageerror ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 200)); });

const focusInfo = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return { at: 'body (nowhere)' };
    return {
      at: a.tagName.toLowerCase() + (a.id ? '#' + a.id : ''),
      name: a.getAttribute('aria-label') || a.id || (a.innerText || '').trim().slice(0, 40),
    };
  });

// everything that a screen reader would actually speak on its own
const liveSnapshot = () =>
  page.evaluate(() => {
    const regions = [...document.querySelectorAll('[aria-live],[role="alert"],[role="status"],[role="log"]')];
    return regions.map(r => ({
      live: r.getAttribute('aria-live'),
      role: r.getAttribute('role'),
      atomic: r.getAttribute('aria-atomic'),
      text: (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      hidden: getComputedStyle(r).display === 'none' || r.getAttribute('aria-hidden') === 'true',
    }));
  });

const fieldState = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('input')].map(f => ({
      id: f.id,
      invalid: f.getAttribute('aria-invalid'),
      desc: f.getAttribute('aria-describedby'),
      descText: (() => {
        const d = f.getAttribute('aria-describedby');
        if (!d) return null;
        const t = document.getElementById(d);
        return t ? (t.innerText || '').trim().slice(0, 80) : 'ID NOT FOUND: ' + d;
      })(),
    }))
  );

/* ---------------- part one: a failed sign up ---------------- */
log('='.repeat(72));
log('PART ONE  sign up, mismatched passwords (no account is created)');
log('='.repeat(72));

await page.goto(BASE + '/register', { waitUntil: 'networkidle2' });
await sleep(1800);

log('\nbefore submit, live regions:');
(await liveSnapshot()).forEach(r => log('   ', JSON.stringify(r)));

// fill it with the keyboard only, exactly as the persona would
await page.evaluate(() => { document.body.setAttribute('tabindex','-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
const typeInto = async (presses, text) => {
  for (let i = 0; i < presses; i++) { await page.keyboard.press('Tab'); await sleep(60); }
  await page.keyboard.type(text, { delay: 12 });
};
await typeInto(3, 'keyboardwalker');           // Username (3rd stop)
await page.keyboard.press('Tab'); await sleep(60);
await page.keyboard.type('not-a-real-signup@example.invalid', { delay: 12 });  // Email
await page.keyboard.press('Tab'); await sleep(60);
await page.keyboard.type('correcthorse1', { delay: 12 });                     // Password
await page.keyboard.press('Tab'); await sleep(60);                            // show password btn
await page.keyboard.press('Tab'); await sleep(60);
await page.keyboard.type('DIFFERENT-on-purpose', { delay: 12 });              // Confirm

log('\nfocus before activating submit: ' + JSON.stringify(await focusInfo()));
// reach the submit button by keyboard and press Enter, as a keyboard user does
await page.keyboard.press('Tab'); await sleep(60);   // show password
await page.keyboard.press('Tab'); await sleep(60);   // Create account
log('focus on submit: ' + JSON.stringify(await focusInfo()));
await page.keyboard.press('Enter');

for (const t of [150, 500, 1500, 3500, 6000, 9000]) {
  await sleep(t === 150 ? 150 : t - (t === 500 ? 150 : 0));
  const live = await liveSnapshot();
  const withText = live.filter(r => r.text);
  log(`\n  +${t}ms  focus=${JSON.stringify(await focusInfo())}`);
  log(`         announced: ${withText.length ? withText.map(r => `[${r.role || r.live}] "${r.text}"`).join(' | ') : 'NOTHING IN ANY LIVE REGION'}`);
  if (t === 1500) {
    await page.screenshot({ path: `${OUT}/09-register-error.png` });
    log('         field state: ' + JSON.stringify(await fieldState()));
  }
}

// where does the error text actually live in the DOM?
const errHome = await page.evaluate(() => {
  const hit = [...document.querySelectorAll('*')].filter(
    e => e.children.length === 0 && /do not match|match/i.test(e.textContent || '')
  );
  return hit.map(e => {
    let n = e, chain = [];
    for (let i = 0; n && i < 8; i++, n = n.parentElement) {
      chain.push(n.tagName.toLowerCase() +
        (n.getAttribute && n.getAttribute('role') ? '[role=' + n.getAttribute('role') + ']' : '') +
        (n.getAttribute && n.getAttribute('aria-live') ? '[live=' + n.getAttribute('aria-live') + ']' : ''));
    }
    return { text: (e.textContent || '').trim().slice(0, 90), chain: chain.join(' < ') };
  });
});
log('\nwhere the error text sits: ' + JSON.stringify(errHome, null, 1));

/* ---------------- part two: read a deck ---------------- */
log('\n' + '='.repeat(72));
log('PART TWO  read a deck, and the public card page');
log('='.repeat(72));

const walk = async (label, path, max = 30) => {
  errs.length = 0;
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(3500);
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map(h => (h.innerText || '').trim().slice(0, 80)),
    headings: [...document.querySelectorAll('h1,h2,h3')].map(h => 'h' + h.tagName[1] + ' ' + (h.innerText || '').trim().slice(0, 50)),
    landmarks: [...new Set([...document.querySelectorAll('main,nav,header,footer,[role="main"]')].map(l => l.tagName.toLowerCase()))],
    bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    imgsNoAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
    imgs: [...document.querySelectorAll('img')].slice(0, 6).map(i => i.getAttribute('alt')),
  }));
  await page.evaluate(() => { document.body.setAttribute('tabindex','-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
  const stops = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab'); await sleep(60);
    const s = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return { none: true };
      const t = (a.getAttribute('aria-label') || (a.innerText || a.textContent || '').replace(/\s+/g,' ').trim() || a.getAttribute('title') || '').slice(0, 50);
      return { tag: a.tagName.toLowerCase(), name: t };
    });
    if (s.none) { stops.push('--- body ---'); break; }
    stops.push(s.tag + ' "' + s.name + '"');
    if (stops.length > 3 && stops[stops.length - 1] === stops[0]) { stops.push('--- cycled ---'); break; }
  }
  await page.screenshot({ path: `${OUT}/${label}.png` });
  log(`\n-- ${label}  ${path}`);
  log('   title: ' + JSON.stringify(facts.title));
  log('   h1: ' + JSON.stringify(facts.h1) + '   landmarks: ' + (facts.landmarks.join(',') || 'NONE'));
  log('   headings: ' + facts.headings.join(' | ').slice(0, 260));
  log('   images missing alt: ' + facts.imgsNoAlt + '  alts: ' + JSON.stringify(facts.imgs));
  log('   what is read out: "' + facts.bodyText + '"');
  log('   tab stops: ' + stops.join(' -> ').slice(0, 500));
  if (errs.length) log('   ERRORS: ' + [...new Set(errs)].slice(0, 6).join(' ;; '));
  else log('   console clean');
};

await walk('10-public-deck-missing', '/p/some-shared-deck');
await walk('11-public-card', '/cards/00000000-0000-0000-0000-000000000000');

// a real card id, so the public card page is judged loaded rather than empty
await walk('12-public-card-real', '/cards/' + (process.env.CARD_ID || ''), 30);

await browser.close();
log('\nshots in ' + OUT);
