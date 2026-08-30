/**
 * Press a button and say what happened.
 *
 *   node scripts/probe/press.mjs --route "/deck/<id>/optimise" --button "Optimise deck"
 *   node scripts/probe/press.mjs --route "/collection?tab=add-cards" --button "Cheap removal" --wait 20000
 *
 * WHY THIS EXISTS
 * ---------------
 * `nav-audit` measures a screen at rest, and the owner's brief says to click
 * every button. Those are different jobs, and the gap between them is where the
 * two worst defects of this audit were hiding:
 *
 *   Suggest cards      the candidate query took 16,119 ms against an 8 s
 *                      timeout, so it had never worked for anybody, and the
 *                      panel reported the failure as "nothing scored well
 *                      enough" — a verdict over a query that never ran
 *   the optimiser       `check_feature_access` answered null, so every audit
 *                      screenshotted a feature gate and the real screen had
 *                      never been seen
 *
 * Both screens measured clean at rest. Nothing is wrong with them until
 * somebody presses something.
 *
 * WHAT IT REPORTS
 * ---------------
 * The things that were wrong in those two cases, in the order they go wrong:
 * whether the button exists, what it asked the database for and how long it
 * waited, whether anything failed, whether the page threw, and whether the
 * screen actually changed. A press that leaves the page identical is a press
 * that did nothing, and it will not say so itself.
 *
 * It spies on `fetch` inside the page rather than on Puppeteer's response
 * events, because those proved unreliable on cached responses and the thing
 * worth knowing is exactly what the app asked for.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4613);
const SETTLE = Number(arg('settle', process.env.SETTLE || '9000'));
const WAIT = Number(arg('wait', '20000'));
const OUT = arg('out', '.shots/press');
/**
 * Undo Git Bash's path conversion, because it will happen again.
 *
 * MSYS rewrites an argument that looks like an absolute POSIX path into a
 * Windows one, so `--route "/deck/<id>/optimise"` arrives as
 * `C:/Program Files/Git/deck/<id>/optimise` and Puppeteer dies on
 * "Cannot navigate to invalid URL". It bit the screen walker through an env var
 * an hour before it bit this through an argument, and a comment in the other
 * file did not stop it. So the repair lives in the tool: anything that looks
 * like the Git install directory followed by a path is the path.
 */
const unmangle = route => {
  if (!route) return route;
  const mangled = route.match(/^[A-Za-z]:[\\/].*?[\\/]Git([\\/].*)$/i);
  const fixed = mangled ? mangled[1].replace(/\\/g, '/') : route;
  if (fixed !== route) console.log(`  (the shell rewrote the route; using ${fixed})`);
  return fixed;
};

const ROUTE = unmangle(arg('route'));
const BUTTON = arg('button');
/* Let the page reach the REAL edge functions. Off by default: they are slow
   and billed, and most screens do not need them. `/deck/:id/optimise` does,
   because its whole content is what one returns. */
const LIVE_FUNCTIONS = process.argv.includes('--live-functions');
const WIDTH = Number(arg('width', '1600'));
const HEIGHT = Number(arg('height', '1000'));

if (!ROUTE || !BUTTON) {
  console.error('usage: node scripts/probe/press.mjs --route <path> --button <label> [--wait ms]');
  process.exit(1);
}

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
  await page.setViewport({ width: WIDTH, height: HEIGHT });
  if (LIVE_FUNCTIONS) {
    await page.evaluateOnNewDocument(() => { window.__DM_LIVE_FUNCTIONS = true; });
    console.log('  (edge functions go to the real deployment)');
  }
  await page.evaluateOnNewDocument(fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8'));

  await page.evaluateOnNewDocument(() => {
    window.__net = [];
    const real = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const started = Date.now();
      let res;
      try {
        res = await real.apply(this, args);
      } catch (e) {
        window.__net.push({ ms: Date.now() - started, status: 0, url: String(url).slice(0, 200), threw: String(e).slice(0, 120) });
        throw e;
      }
      /* Supabase only. The point is what the app asked the database, not every
         font and chunk it loaded. */
      if (String(url).indexOf('supabase.co') >= 0) {
        const entry = { ms: Date.now() - started, status: res.status, url: decodeURIComponent(String(url)).slice(0, 200) };
        /* The BODY of a failure, because the status alone does not say why and
           a 500 from an edge function carries our own error. Cloned, so reading
           it here does not consume the stream the app is about to read. */
        if (res.status >= 400) {
          try {
            entry.body = (await res.clone().text()).slice(0, 400);
          } catch { entry.body = '(could not read)'; }
        }
        window.__net.push(entry);
      }
      return res;
    };
  });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));

  await page.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, SETTLE));

  const before = await page.evaluate(() => ({
    text: document.body.innerText,
    art: [...document.querySelectorAll('img')].filter(i => /scryfall/i.test(i.currentSrc || i.src || '')).length,
    height: document.documentElement.scrollHeight,
  }));
  await page.evaluate(() => { window.__net = []; });

  const pressed = await page.evaluate(label => {
    /* Exact first, then a prefix, then anywhere.

       `/scan`’s primary control reads "Start scanningScan": the visible
       words plus a screen-reader label the DOM concatenates. Exact matching
       reported the page’s main action missing. A real control’s text is not
       the string a person would name it by, so the matcher has to be looser
       than the label. Exact still wins when it exists, so a page with both
       "Save" and "Save as" presses the right one. */
    const wanted = label.trim().toLowerCase();
    /* Links count. `/scan`’s "Start scanning" is an `<a>` styled as a
       button, so a selector of `button` alone reported it missing and the
       page’s primary action looked unpressable. "Click every button" means
       every control, not every `<button>` tag. */
    const b = [...document.querySelectorAll('button, a[role="button"], a[href]')].find(
      x => (x.textContent || '').trim().toLowerCase() === wanted
    );
    const controls = [...document.querySelectorAll('button, a[role="button"], a[href]')];
    const chosen =
      b ??
      controls.find(x => (x.textContent || '').trim().toLowerCase().startsWith(wanted)) ??
      controls.find(x => (x.textContent || '').trim().toLowerCase().includes(wanted));
    if (!chosen) return false;
    chosen.click();
    return true;
  }, BUTTON);

  check(pressed, `"${BUTTON}" is on the page`);
  if (!pressed) {
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[role="button"], a[href]')]
        .map(b => (b.textContent || '').trim())
        .filter(t => t.length > 0 && t.length < 40)
        .slice(0, 30)
    );
    console.log(`\n  buttons that ARE there: ${labels.join(' | ')}`);
  } else {
    await new Promise(r => setTimeout(r, WAIT));

    const net = await page.evaluate(() => window.__net || []);
    const after = await page.evaluate(() => ({
      text: document.body.innerText,
      art: [...document.querySelectorAll('img')].filter(i => /scryfall/i.test(i.currentSrc || i.src || '')).length,
      height: document.documentElement.scrollHeight,
    }));

    console.log(`\n  ${net.length} request(s) after the press`);
    for (const n of net.slice(0, 12)) {
      const rel = n.url.replace(/^https:\/\/[^/]+\/(rest\/v1\/|functions\/v1\/)?/, '');
      console.log(`    ${String(n.status).padStart(3)}  ${String(n.ms).padStart(6)}ms  ${rel.slice(0, 120)}`);
    }

    const failed = net.filter(n => n.status >= 400 || n.status === 0);
    check(failed.length === 0, 'nothing the press asked for failed',
      failed.map(f => `${f.status} ${f.url.slice(0, 60)}`).join(' | '));
    for (const f of failed.slice(0, 3)) {
      if (f.body) console.log(`      body: ${f.body}`);
    }

    /* 8s is the `authenticated` role's statement_timeout. Anything above it is
       not slow, it is a guaranteed 57014 for a signed-in user. */
    const slow = net.filter(n => n.ms > 8000);
    check(slow.length === 0, 'nothing took longer than the 8s timeout allows',
      slow.map(s => `${s.ms}ms ${s.url.slice(0, 70)}`).join(' | '));

    check(pageErrors.length === 0, 'the page did not throw', pageErrors.join(' | '));

    const changed = after.text !== before.text || after.art !== before.art || after.height !== before.height;
    check(changed, 'the screen actually changed',
      `text ${before.text.length}->${after.text.length}, art ${before.art}->${after.art}, height ${before.height}->${after.height}`);

    /* A press that ends on a sentence about failure is worth seeing in full. */
    const trouble = after.text
      .split('\n')
      .filter(l => /could not|failed|went wrong|unable|error|nothing/i.test(l))
      .slice(0, 4);
    if (trouble.length) console.log(`\n  lines that read like trouble:\n    ${trouble.join('\n    ')}`);
  }

  const shot = path.join(OUT, `${ROUTE.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-${BUTTON.replace(/[^a-z0-9]+/gi, '-')}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`\n  shot: ${shot}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
