/**
 * Press EVERY control on a page and report which ones misbehave.
 *
 *   node scripts/probe/sweep.mjs --route "/collection"
 *   node scripts/probe/sweep.mjs --route "/admin?tab=sync" --admin
 *   node scripts/probe/sweep.mjs --route "/deck/<id>?tab=add" --live-functions
 *
 * WHY
 * ---
 * `press.mjs` presses one named control, and every time it has been pointed at
 * something nobody had pressed it found a defect: "Suggest cards" had been
 * failing for eleven days behind a 16 s query, the templates panel read a field
 * the function has never returned, and `/scan`'s primary action was an `<a>` the
 * probe could not even see. Pressing them one at a time finds one at a time.
 *
 * This presses all of them. Each control gets a FRESH page load, because a
 * press that navigates, opens a panel or mutates state would otherwise change
 * what the next press means.
 *
 * WHAT IT WILL NOT PRESS
 * ----------------------
 * Anything destructive or outward-facing. The harness is signed in as a fixture
 * account against the REAL database for world-readable tables, and a sweep that
 * cheerfully clicks "Delete deck" is a sweep that deletes a deck. The denylist
 * is matched loosely and errs toward skipping: a control that is skipped is a
 * control somebody presses by hand, which is a much smaller cost than the
 * alternative.
 *
 * WHAT COUNTS AS MISBEHAVING
 * --------------------------
 *   FAILED     a request the press made came back 4xx/5xx, with its body
 *   SLOW       a request took longer than the 8 s an authenticated PostgREST
 *              call is allowed, which is not slowness, it is a guaranteed 57014
 *   THREW      the page raised
 *   NOTHING    the screen is byte-identical afterwards. Not always a defect —
 *              a toggle that was already off, a tab already open — so it is
 *              reported separately from the failures rather than counted as one.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { pressControl, CONTROLS } from './pressControl.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/* Git Bash POSIX-path-converts an argument that looks like a path. See the
   note in `press.mjs`; this is the same repair for the same reason. */
const unmangle = route => {
  if (!route) return route;
  const m = route.match(/^[A-Za-z]:[\\/].*?[\\/]Git([\\/].*)$/i);
  return m ? m[1].replace(/\\/g, '/') : route;
};

const DIST = process.env.DIST || 'dist';
/**
 * Whatever port is free, unless one is named.
 *
 * The fixed default meant a second probe started while the first was still
 * running died on EADDRINUSE, and working around that by hand produced
 * PORT=475RANDOM, which is not a port. Both failures cost a run. listen(0)
 * asks the operating system for a free one and the real number is read back
 * after it binds, so two probes can never collide and there is nothing to
 * pick. Setting PORT still pins it, for the case where something outside has
 * to reach the server.
 */
const PORT_REQUEST = Number(process.env.PORT || 0);
const ROUTE = unmangle(arg('route'));
const SETTLE = Number(arg('settle', '7000'));
const WAIT = Number(arg('wait', '6000'));
const LIMIT = Number(arg('limit', '40'));
const AS_ADMIN = process.argv.includes('--admin');
const LIVE_FUNCTIONS = process.argv.includes('--live-functions');

if (!ROUTE) {
  console.error('usage: node scripts/probe/sweep.mjs --route <path> [--admin] [--live-functions]');
  process.exit(1);
}

/**
 * Never pressed.
 *
 * Destructive, outward-facing, or navigation that leaves the page under test.
 * `sign out` is here because the rest of the sweep would then run signed out
 * and report every control as broken.
 */
const SKIP = [
  'delete', 'remove', 'destroy', 'clear', 'reset', 'wipe', 'purge',
  'sign out', 'log out', 'logout',
  'buy', 'checkout', 'purchase', 'pay', 'list it', 'sell',
  'publish', 'share', 'send', 'post', 'submit', 'invite',
  'unschedule', 'cancel', 'disable', 'revoke', 'block', 'report',
  'sync now', 'start sync', 'run sync', 'resume sync', 'backfill', 'retag',
  'skip to main content', 'open navigation menu', 'collapse',
];
/**
 * Matched on WORD BOUNDARIES, not as a substring.
 *
 * `share` is on the list so "Share deck" is never pressed. As a substring it
 * also matches **Plowshares**, so every control belonging to Swords to
 * Plowshares — open it, add it, wishlist it, put it on the shopping list, put
 * it on the proxy list — was silently skipped on `/cards`. Five controls on the
 * product's most-used screen, unpressable by anything, because of a card name.
 *
 * A skip that is invisible is worse than a press that fails: the run still says
 * "no control misbehaved". Erring toward skipping is right for DESTRUCTION and
 * wrong for spelling.
 */
const skipped = label => {
  const text = label.toLowerCase();
  return SKIP.some(bad => {
    /* Escape nothing: every entry is letters and spaces. Boundaries on both
       ends, so "cancel" still catches "Cancel" and "cancelled" but "share"
       no longer catches "plowshares". */
    const re = new RegExp(`(^|[^a-z])${bad}([^a-z]|$)`, 'i');
    return re.test(text);
  });
};

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
await new Promise(r => server.listen(PORT_REQUEST, r));
/** The port it actually got. */
const PORT = server.address().port;

const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

/** A page with the harness and the network spy already installed. */
async function open() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  if (AS_ADMIN) await page.evaluateOnNewDocument(() => { window.__DM_ADMIN = true; });
  if (LIVE_FUNCTIONS) await page.evaluateOnNewDocument(() => { window.__DM_LIVE_FUNCTIONS = true; });
  await page.evaluateOnNewDocument(SHIM);
  await page.evaluateOnNewDocument(() => {
    window.__net = [];
    const real = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const t = Date.now();
      const res = await real.apply(this, args);
      if (String(url).indexOf('supabase.co') >= 0) {
        const e = { ms: Date.now() - t, status: res.status, url: decodeURIComponent(String(url)).slice(0, 160) };
        if (res.status >= 400) {
          try { e.body = (await res.clone().text()).slice(0, 220); } catch { e.body = '(unreadable)'; }
        }
        window.__net.push(e);
      }
      return res;
    };
  });
  return page;
}

const snapshot = () =>
  ({
    text: document.body.innerText,
    art: [...document.querySelectorAll('img')].filter(i => /scryfall/i.test(i.currentSrc || i.src || '')).length,
    height: document.documentElement.scrollHeight,
    href: location.pathname + location.search,
    /* COLOUR, because text, height and href are all blind to a theme switch.
       Settings' Light and Dark buttons reported "no request and no change"
       while working perfectly: they repaint the page and move nothing. A
       control the sweep cannot see the effect of is a control it silently
       under-reports, which is the same class of hole as the synthetic click. */
    theme:
      getComputedStyle(document.body).backgroundColor +
      '|' +
      (document.documentElement.getAttribute('class') ?? ''),
  });


try {
  /* One load to find out what is on the page. */
  const first = await open();
  await first.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, SETTLE));
  /* TEXT, THEN title, THEN aria-label.

     A card tile is an <a> wrapping an <img> and nothing else, so its
     textContent is empty and the old filter dropped it. That is not a rare
     shape here: every deck tile, every card in every rail and all eleven
     archetype strips are image-only links, which means the sweep could not see
     the most common clickable thing in the product. Both attributes are already
     set for screen readers, so there is nothing to add to the app. */
  const labels = await first.evaluate(
    sel =>
      [...document.querySelectorAll(sel)]
        .map(b =>
          (
            (b.textContent || '').trim() ||
            b.getAttribute('title') ||
            b.getAttribute('aria-label') ||
            ''
          ).replace(/\s+/g, ' ')
        )
        .filter(t => t.length > 0 && t.length < 60),
    CONTROLS
  );
  await first.close();

  const unique = [...new Set(labels)];
  const willPress = unique.filter(l => !skipped(l)).slice(0, LIMIT);
  const willSkip = unique.filter(l => skipped(l));

  console.log(`${ROUTE}`);
  console.log(`  ${unique.length} controls, pressing ${willPress.length}, skipping ${willSkip.length} as destructive or navigational`);
  if (willSkip.length) console.log(`  skipped: ${willSkip.join(' | ')}\n`);

  const trouble = [];
  const didNothing = [];

  for (const label of willPress) {
    const page = await open();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
    await page.goto(`http://127.0.0.1:${PORT}${ROUTE}`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, SETTLE));

    const before = await page.evaluate(snapshot);
    await page.evaluate(() => { window.__net = []; });

    const hit = await pressControl(page, label);

    if (!hit) { await page.close(); continue; }

    /* LOOK EARLY AS WELL AS LATE, because the only evidence a control worked
       is often a toast, and a toast is gone in about four seconds.

       The collection’s Backup button builds a JSON blob in memory, triggers
       a download and calls `showSuccess`. It makes no request and mutates no
       DOM that survives, so measuring once after a five second wait reported
       "no request and no change" on a button that works perfectly. */
    await new Promise(r => setTimeout(r, 1200));
    const early = await page.evaluate(snapshot).catch(() => before);
    await new Promise(r => setTimeout(r, Math.max(0, WAIT - 1200)));

    const net = await page.evaluate(() => window.__net || []);
    const late = await page.evaluate(snapshot).catch(() => before);
    const differs = a => a.text !== before.text || a.art !== before.art ||
      a.height !== before.height || a.href !== before.href || a.theme !== before.theme;
    const after = differs(early) ? early : late;

    const failed = net.filter(n => n.status >= 400);
    const slow = net.filter(n => n.ms > 8000);
    const changed = differs(early) || differs(late);

    if (failed.length || slow.length || errors.length) {
      trouble.push({ label, failed, slow, errors });
      console.log(`  FAIL  ${label}`);
      for (const f of failed) console.log(`          ${f.status} ${f.url.slice(40, 130)}\n          ${f.body ?? ''}`);
      for (const sl of slow) console.log(`          ${sl.ms}ms ${sl.url.slice(40, 120)}`);
      /*
       * A SLOW QUERY AND A BUSY MACHINE LOOK THE SAME IN THIS LIST, and they
       * are not the same finding. Pressing "Start 2-player game" once reported
       * twelve unrelated reads — wishlist, profiles, playmat prefs — every one
       * of them at 32.6 SECONDS, which read as the game engine blocking the
       * page. It was not: a heartbeat in the page measured the main thread busy
       * for 147ms, and the same sweep run on its own came back clean. Three
       * builds and two other probes were running at the time.
       *
       * The tell is that they all take the SAME time. One slow query is slow
       * for its own reasons; a queue behind a saturated connection releases
       * together.
       */
      if (slow.length >= 3) {
        const times = slow.map(s => s.ms);
        const spread = (Math.max(...times) - Math.min(...times)) / Math.max(...times);
        if (spread < 0.1) {
          console.log(
            `          ^ all ${slow.length} within ${Math.round(spread * 100)}% of each other, which is contention rather than a slow query. Re-run this route on its own before believing it.`
          );
        }
      }
      for (const e of errors) console.log(`          threw: ${e}`);
    } else if (!changed) {
      /* HOW MANY REQUESTS IT MADE, because "nothing changed" alone cannot
         tell a Refresh that quietly refetched identical rows from a Refresh
         wired to nothing. Zero requests AND no change is the shape worth
         looking at. */
      didNothing.push({ label, requests: net.length });
    } else {
      console.log(`  ok    ${label}`);
    }
    await page.close();
  }

  if (didNothing.length) {
    console.log(`\n  pressed and the screen did not change (${didNothing.length}):`);
    const silent = didNothing.filter(d => d.requests === 0).map(d => d.label);
    const quiet = didNothing.filter(d => d.requests > 0);
    if (quiet.length) {
      console.log(`    asked the database and drew the same thing: ${quiet.map(d => `${d.label} (${d.requests})`).join(' | ')}`);
    }
    if (silent.length) {
      console.log(`    NO REQUEST AND NO CHANGE: ${silent.join(' | ')}`);
    }
    console.log('    Not automatically a defect: a toggle already off, or a tab already open.');
  }
  console.log(trouble.length ? `\n${trouble.length} control(s) misbehaved` : '\nno control misbehaved');
} finally {
  await browser.close();
  server.close();
}
