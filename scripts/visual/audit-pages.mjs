/**
 * Photograph and measure every page in the left nav, at two desktop sizes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every interesting page sits behind `ProtectedRoute`, so a screenshot run with
 * no credentials has only ever been able to reach `/login`. That is why most of
 * this application has been changed without anyone looking at the result.
 *
 * HOW THE AUTH GATE IS BYPASSED (no credentials, no account, no network login)
 * ---------------------------------------------------------------------------
 * `scripts/play-combat-shots.mjs` solves this for one page by writing a
 * dev-only entry that mounts `Play` with App.tsx's providers and no auth gate.
 * That works, but it renders the page *without the shell* — and the shell is
 * exactly what this audit is about: the fixed rail, the `md:ml-[var(--nav-rail-w)]`
 * offset, and how much of the remaining band each page actually fills.
 *
 * So this runs the REAL `index.html` -> `src/main.tsx` -> `src/App.tsx` and
 * swaps one module underneath it. A throwaway Vite config aliases
 * `@/components/AuthProvider` to a stub that returns a signed-in user. Nothing
 * in `src/` is modified. `App.tsx`, `ProtectedRoute`, `TopNavigation`,
 * `LeftNavigation` and every page are the shipped code, unedited, and
 * `BrowserRouter` works so any route can be reached by URL.
 *
 * WHAT THE SCREENSHOTS DO AND DO NOT SHOW  <-- read this before quoting a shot
 * ----------------------------------------
 * The stub user is not a real Supabase session. Requests still carry the anon
 * key, so Row Level Security returns nothing for user-scoped tables: your
 * decks, your collection, your wishlist are all legitimately empty. Public
 * tables (`cards`, precons, listings) do return real rows.
 *
 * Therefore: an empty region in these shots is only a finding if the page fails
 * to render a proper empty state, or if the empty state itself is misbuilt.
 * "No decks" on /decks is the harness, not a bug. Layout, width, gutters, card
 * size, overflow and console errors are all measured faithfully.
 *
 * The harness files are written to `scratch/visual-audit/`, which .gitignore
 * already excludes ("Agent working files — never ship to Lovable").
 *
 * USAGE
 *   node scripts/visual/audit-pages.mjs                 # all routes
 *   node scripts/visual/audit-pages.mjs collection cards
 *   PORT=8099 node scripts/visual/audit-pages.mjs
 *
 * OUTPUT
 *   .shots/audit/<slug>-<width>.png        what fits on screen
 *   .shots/audit/<slug>-<width>-full.png   the whole scroll height
 *   .shots/audit/audit.json                every measurement, machine readable
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const HARNESS = path.join(REPO, 'scratch', 'visual-audit');
const OUT = path.join(REPO, '.shots', 'audit');
/**
 * Deliberately not 8080 (the shipped dev port) or 8099 (`play-combat-shots.mjs`).
 * A server already listening is NEVER reused: the first run of this script found
 * another agent's play harness on 8099, served the wrong application, and
 * reported "shell did not render" for every page. A free port is found instead,
 * so the only thing this script can ever photograph is the app it started.
 */
const PORT_BASE = Number(process.env.PORT || 8123);
let PORT = PORT_BASE;
let BASE = `http://127.0.0.1:${PORT}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ routes */
/**
 * Every left-nav destination (see `src/components/navigation/nav-items.ts`)
 * plus the sub-pages those items own. `settings` is reached from the top nav
 * account menu rather than the rail, and `templates` is routed but not linked
 * from either — both are included because a user can still land on them.
 */
const ROUTES = [
  { slug: 'home', path: '/', nav: 'Home' },

  { slug: 'collection', path: '/collection', nav: 'My Collection' },
  { slug: 'collection-import', path: '/collection/import', nav: 'My Collection', sub: true },
  { slug: 'collection-insurance', path: '/collection/insurance', nav: 'My Collection', sub: true },
  { slug: 'scan', path: '/scan', nav: 'Scan Cards' },
  { slug: 'scan-camera', path: '/scan/camera', nav: 'Scan Cards', sub: true },
  { slug: 'wishlist', path: '/wishlist', nav: 'Wishlist' },

  { slug: 'decks', path: '/decks', nav: 'My Decks' },
  { slug: 'decks-new', path: '/decks/new', nav: 'New Deck' },
  { slug: 'deck-builder', path: '/deck-builder', nav: 'My Decks', sub: true },
  { slug: 'deck-builder-commander', path: '/deck-builder/commander', nav: 'My Decks', sub: true },
  { slug: 'smart-builder', path: '/smart-builder', nav: 'Deck Generator' },
  { slug: 'precons', path: '/precons', nav: 'Precons' },

  { slug: 'play', path: '/play', nav: 'Play a Game', ownedElsewhere: true },
  { slug: 'life', path: '/life', nav: 'Life Counter', ownedElsewhere: true },
  { slug: 'simulate', path: '/simulate', nav: 'Playtest', ownedElsewhere: true },
  { slug: 'tournament', path: '/tournament', nav: 'Tournaments' },
  { slug: 'tournament-new', path: '/tournament/new', nav: 'Tournaments', sub: true },

  { slug: 'cards', path: '/cards', nav: 'Card Search' },
  { slug: 'marketplace', path: '/marketplace', nav: 'Marketplace' },
  { slug: 'brain', path: '/brain', nav: 'MTG Brain' },

  { slug: 'admin', path: '/admin', nav: 'Admin' },
  { slug: 'settings', path: '/settings', nav: '(top nav)' },
  { slug: 'templates', path: '/templates', nav: '(unlinked)' },
];

const VIEWPORTS = [
  { width: 1680, height: 1050 },
  { width: 1280, height: 720 },
];

/* ----------------------------------------------------------- harness files */
/**
 * A stand-in for `@/components/AuthProvider`. Same two exports, same shape,
 * no network and no credentials — `user` is a plain object, not a session.
 * `isAdmin` is true so the Admin group renders in the rail and `/admin` is
 * reachable; that is a UI concern only, the database still enforces RLS.
 */
const AUTH_STUB = `/* Written by scripts/visual/audit-pages.mjs. Not shipped, not routed, not built. */
import { createContext, useContext } from 'react';

const user = {
  id: '00000000-0000-4000-8000-000000000000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'visual-audit@localhost',
  app_metadata: {},
  user_metadata: { username: 'visual-audit' },
  created_at: '1970-01-01T00:00:00.000Z',
};

const value = {
  user,
  session: null,
  loading: false,
  isAdmin: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
};

const Ctx = createContext(value);

export function AuthProvider({ children }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
`;

/**
 * The shipped `vite.config.ts` with two changes: the auth alias goes in front
 * of the `@/` alias, and `lovable-tagger` is dropped so its data attributes do
 * not appear in the DOM being measured.
 */
const VITE_CONFIG = port => `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

export default defineConfig({
  root,
  envDir: root,
  server: {
    host: '127.0.0.1',
    port: ${port},
    strictPort: true,
    /*
     * HMR and the file watcher are OFF, and this is not an optimisation.
     *
     * Other agents edit \`src/\` while this audit runs. With HMR on, a page was
     * being hot-reloaded between the settle and the screenshot: captures came
     * back half-rendered, a save caught mid-write showed Vite's compile-error
     * overlay instead of the product, and one run stalled for eight minutes
     * reloading \`/cards\` on every keystroke someone else made.
     *
     * Off, each page is whatever the module graph held when that page was
     * requested. Captures stop moving under the camera.
     */
    hmr: false,
    watch: { ignored: ['**/*'] },
  },
  plugins: [react()],
  resolve: {
    alias: [
      // Order matters: the specific rule must win over the '@/' catch-all.
      { find: /^@\\/components\\/AuthProvider(\\.tsx)?$/, replacement: path.join(here, 'auth-stub.tsx') },
      { find: /^@\\//, replacement: root + '/src/' },
    ],
  },
});
`;

function writeHarness(port) {
  fs.mkdirSync(HARNESS, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(HARNESS, 'auth-stub.tsx'), AUTH_STUB);
  fs.writeFileSync(path.join(HARNESS, 'vite.config.mjs'), VITE_CONFIG(port));
}

/* ------------------------------------------------------------- dev server */
const portOpen = port =>
  new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    const done = v => { s.destroy(); resolve(v); };
    s.on('connect', () => done(true));
    s.on('error', () => resolve(false));
    setTimeout(() => done(false), 1000);
  });

/** First port from PORT_BASE upwards that nothing is already listening on. */
async function freePort() {
  for (let p = PORT_BASE; p < PORT_BASE + 25; p++) {
    if (!(await portOpen(p))) return p;
    log(`port ${p} is busy — not reusing it, trying the next one`);
  }
  throw new Error(`no free port in ${PORT_BASE}..${PORT_BASE + 24}`);
}

async function startServer() {
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  writeHarness(PORT);

  const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) throw new Error(`vite not found at ${vite} — run npm install`);

  const child = spawn(
    process.execPath,
    [vite, '--config', path.join(HARNESS, 'vite.config.mjs'), '--port', String(PORT), '--strictPort'],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', d => process.stdout.write('  [vite] ' + d));
  child.stderr.on('data', d => process.stderr.write('  [vite!] ' + d));

  for (let i = 0; i < 60; i++) {
    if (await portOpen(PORT)) { log(`vite up on ${BASE}`); await sleep(1200); return child; }
    await sleep(500);
  }
  child.kill();
  throw new Error('vite did not start within 30s');
}

/* -------------------------------------------------------------- the probe */
/**
 * Measured in the page, because these are questions about rendered geometry and
 * there is no honest way to answer them from the source.
 *
 * The "content band" is the union of every visible element inside `<main>` that
 * actually paints something — text, an image, or its own background. Comparing
 * it to `<main>`'s own box is what turns "the page feels narrow" into a number:
 * a page that fills its band has gutters near zero, a `max-w-3xl` island on a
 * 1680px screen leaves several hundred pixels of nothing down each side.
 */
const PROBE = () => {
  const round = n => Math.round(n);
  const styleOf = el => window.getComputedStyle(el);

  const isVisible = el => {
    const s = styleOf(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    if (Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  const main = document.querySelector('#main-content');
  const mainRect = main ? main.getBoundingClientRect() : null;

  /* --- the content band inside main ------------------------------------- */
  let bandLeft = Infinity;
  let bandRight = -Infinity;
  let bandBottom = -Infinity;
  let painted = 0;

  if (main) {
    for (const el of main.querySelectorAll('*')) {
      if (!isVisible(el)) continue;
      const s = styleOf(el);
      /* Toasters, command palettes and drawers are DOM descendants of <main>
         but are positioned against the viewport, so they sit outside main's box
         and would report a negative gutter. They are not page content. */
      if (s.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;

      const paints =
        el.tagName === 'IMG' ||
        el.tagName === 'SVG' ||
        el.tagName === 'CANVAS' ||
        s.backgroundImage !== 'none' ||
        (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') ||
        (el.children.length === 0 && (el.textContent || '').trim().length > 0);

      if (!paints) continue;
      painted++;
      bandLeft = Math.min(bandLeft, r.left);
      bandRight = Math.max(bandRight, r.right);
      bandBottom = Math.max(bandBottom, r.bottom + window.scrollY);
    }
  }

  const band =
    painted > 0
      ? { left: round(bandLeft), right: round(bandRight), width: round(bandRight - bandLeft) }
      : null;

  const gutters =
    band && mainRect
      ? { left: round(band.left - mainRect.left), right: round(mainRect.right - band.right) }
      : null;

  /* --- cards ------------------------------------------------------------ */
  /* `CardImage` is the only thing in the product that sets this aspect ratio
     (`CARD_ASPECT = '488 / 680'`), so this counts real card frames and ignores
     the blur-up under-layer, which is an absolutely-positioned child. */
  const frames = [];
  for (const el of document.querySelectorAll('*')) {
    const s = styleOf(el);
    if (s.aspectRatio !== '488 / 680') continue;
    if (!isVisible(el)) continue;
    frames.push(round(el.getBoundingClientRect().width));
  }
  frames.sort((a, b) => a - b);
  const cards = frames.length
    ? {
        count: frames.length,
        min: frames[0],
        median: frames[Math.floor(frames.length / 2)],
        max: frames[frames.length - 1],
      }
    : { count: 0 };

  /* Hand-rolled card art that skipped `CardImage` — a direct design-law breach.
     Only counts images actually served from Scryfall that are NOT inside a
     frame carrying the canonical aspect ratio. */
  const rogue = [];
  for (const img of document.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!/scryfall/i.test(src)) continue;
    let inFrame = false;
    for (let p = img.parentElement, hops = 0; p && hops < 4; p = p.parentElement, hops++) {
      if (styleOf(p).aspectRatio === '488 / 680') { inFrame = true; break; }
    }
    if (!inFrame && isVisible(img)) {
      rogue.push({ w: round(img.getBoundingClientRect().width), src: src.slice(0, 90) });
    }
  }

  /* --- overflow --------------------------------------------------------- */
  /* The shell sets `overflow-x-hidden` in three places, so content that is too
     wide is silently CLIPPED rather than given a scrollbar. Both are recorded:
     a clip is worse than a scrollbar, because nothing tells the user. */
  const scrollers = [];
  const clipped = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    if (el.clientWidth < 120) continue;
    if (!isVisible(el)) continue;
    const s = styleOf(el);
    const entry = {
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 110),
      client: el.clientWidth,
      scroll: el.scrollWidth,
      over: el.scrollWidth - el.clientWidth,
    };
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') scrollers.push(entry);
    else if (s.overflowX === 'hidden' || s.overflowX === 'clip') clipped.push(entry);
  }
  const byOver = (a, b) => b.over - a.over;

  /* --- state ------------------------------------------------------------ */
  /* Another agent editing `src/` while this runs will be caught mid-save, and
     the page then shows Vite's compile-error overlay instead of the product.
     That is contamination, not a finding — it must never be reported as one. */
  const overlay = document.querySelector('vite-error-overlay');
  const buildError = overlay
    ? (overlay.shadowRoot?.querySelector('.message')?.textContent || 'vite compile error')
        .trim()
        .slice(0, 200)
    : null;

  const text = (document.body.innerText || '').trim();
  const heading = (() => {
    const h = main && main.querySelector('h1, h2');
    return h ? (h.innerText || '').trim().slice(0, 80) : null;
  })();

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docScrollWidth: document.documentElement.scrollWidth,
    docScrollHeight: document.documentElement.scrollHeight,
    pageHScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    main: mainRect
      ? { left: round(mainRect.left), width: round(mainRect.width) }
      : null,
    /* The rail as rendered, not as declared — `main` is offset by
       `md:ml-[var(--nav-rail-w)]`, so main.left IS the reserved width and a
       mismatch between the two is itself the bug. */
    railWidth: (() => {
      const nav = document.querySelector('#main-content')?.parentElement
        ?.querySelector('nav, [data-nav-rail]');
      return nav ? round(nav.getBoundingClientRect().width) : null;
    })(),
    navRailState: document.documentElement.dataset.navRail || null,
    band,
    gutters,
    cards,
    rogueCardImages: rogue.slice(0, 5),
    scrollers: scrollers.sort(byOver).slice(0, 4),
    clipped: clipped.sort(byOver).slice(0, 4),
    buildError,
    heading,
    textLength: text.length,
    textHead: text.slice(0, 220).replace(/\s+/g, ' '),
    looksBlank: text.length < 120,
  };
};

/* -------------------------------------------------------------- the walk */
async function main() {
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const routes = only.length ? ROUTES.filter(r => only.includes(r.slug)) : ROUTES;
  if (!routes.length) {
    log(`no route matched ${only.join(', ')}`);
    log(`known: ${ROUTES.map(r => r.slug).join(' ')}`);
    process.exit(1);
  }

  const server = await startServer();

  const browser = await puppeteer.launch({
    headless: 'new',
    /* A grid of Scryfall art makes captureScreenshot slow enough to trip the
       default 30s protocol timeout on a cold cache. */
    protocolTimeout: 240000,
    args: [
      /* Subpixel antialiasing puts magenta fringes on thin type over a dark
         background. It reads as a colour bug that is not there, and it has
         already cost this project real time. */
      '--disable-lcd-text',
      '--font-render-hinting=none',
      '--no-sandbox',
    ],
  });

  /* The scanner asks for a camera. Deny it rather than let the prompt hang. */
  const ctx = browser.defaultBrowserContext();
  await ctx.clearPermissionOverrides();
  await ctx.overridePermissions(BASE, []);

  const results = [];

  for (const route of routes) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ ...vp, deviceScaleFactor: 1 });

      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];

      page.on('console', m => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
      });
      page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 240)));
      page.on('requestfailed', r => {
        failedRequests.push({
          url: r.url().slice(0, 140),
          reason: (r.failure() && r.failure().errorText) || 'unknown',
        });
      });
      page.on('response', r => {
        if (r.status() >= 400) {
          failedRequests.push({ url: r.url().slice(0, 140), reason: `HTTP ${r.status()}` });
        }
      });

      const url = `${BASE}${route.path}`;
      log(`\n== ${route.slug}  ${route.path}  @${vp.width}x${vp.height}`);

      let navError = null;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      } catch (e) {
        /* networkidle2 legitimately never arrives on a page that polls or holds
           a socket open. That is not a failure — take the shot anyway. */
        navError = String(e.message).slice(0, 120);
      }

      /* Let images decode and any post-fetch layout settle. */
      await sleep(3500);
      try {
        await page.evaluate(async () => {
          await Promise.all(
            [...document.images]
              .filter(i => !i.complete)
              .map(i => new Promise(res => { i.onload = i.onerror = res; setTimeout(res, 3000); })),
          );
        });
      } catch { /* page navigated or closed under us */ }
      await sleep(500);

      let probe = null;
      let probeError = null;
      try {
        probe = await page.evaluate(PROBE);
      } catch (e) {
        probeError = String(e.message).slice(0, 200);
      }

      const shot = path.join(OUT, `${route.slug}-${vp.width}.png`);
      const shotFull = path.join(OUT, `${route.slug}-${vp.width}-full.png`);
      try {
        await page.screenshot({ path: shot });
        await page.screenshot({ path: shotFull, fullPage: true });
      } catch (e) {
        log('  screenshot FAILED:', String(e.message).slice(0, 120));
      }

      const record = {
        slug: route.slug,
        path: route.path,
        nav: route.nav,
        sub: Boolean(route.sub),
    /* src/components/play/** and src/lib/game/** belong to a concurrent
       workflow. Captured for completeness; not a basis for findings while
       that rewrite is in flight. */
    ownedElsewhere: Boolean(route.ownedElsewhere),
        width: vp.width,
        height: vp.height,
        shot: path.relative(REPO, shot).replace(/\\/g, '/'),
        navError,
        probeError,
        consoleErrors: [...new Set(consoleErrors)].slice(0, 8),
        pageErrors: [...new Set(pageErrors)].slice(0, 8),
        failedRequests: dedupeRequests(failedRequests).slice(0, 8),
        ...probe,
      };
      results.push(record);
      summarise(record);

      await page.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(results, null, 2));
  log(`\nwrote ${results.length} records -> ${path.relative(REPO, path.join(OUT, 'audit.json'))}`);

  await browser.close();
  if (server) server.kill();
  process.exit(0);
}

function dedupeRequests(list) {
  const seen = new Map();
  for (const r of list) {
    const key = r.url.replace(/[?&].*$/, '') + ' ' + r.reason;
    if (!seen.has(key)) seen.set(key, { ...r, url: r.url.replace(/[?&].*$/, ''), n: 1 });
    else seen.get(key).n++;
  }
  return [...seen.values()];
}

/** One line per page, so a bad run is obvious without opening the JSON. */
function summarise(r) {
  if (r.buildError) {
    log(`  CONTAMINATED — vite compile error, another agent is mid-save: ${r.buildError.slice(0, 90)}`);
    log('  re-run this route; do NOT report it as a finding');
    return;
  }
  if (!r.main) { log('  no <main id="main-content"> — shell did not render'); return; }
  const g = r.gutters;
  const fill = r.band && r.main.width ? Math.round((r.band.width / r.main.width) * 100) : 0;
  log(`  main ${r.main.width}px  band ${r.band ? r.band.width : '?'}px (${fill}% filled)` +
      (g ? `  gutters L${g.left} R${g.right}` : ''));
  log(`  cards ${r.cards.count}` +
      (r.cards.count ? ` (min ${r.cards.min} / med ${r.cards.median} / max ${r.cards.max} px)` : ''));
  if (r.pageHScroll) log('  !! page scrolls horizontally');
  if (r.clipped.length) log(`  !! clipped x${r.clipped.length}: ${r.clipped[0].cls.slice(0, 60)} (+${r.clipped[0].over}px)`);
  if (r.rogueCardImages.length) log(`  !! ${r.rogueCardImages.length} hand-rolled card <img>`);
  if (r.looksBlank) log(`  !! near-blank (${r.textLength} chars)`);
  if (r.pageErrors.length) log(`  !! pageerror: ${r.pageErrors[0]}`);
  if (r.consoleErrors.length) log(`  console errors x${r.consoleErrors.length}: ${r.consoleErrors[0].slice(0, 100)}`);
  if (r.failedRequests.length) log(`  failed requests x${r.failedRequests.length}: ${r.failedRequests[0].reason} ${r.failedRequests[0].url.slice(0, 70)}`);
}

main().catch(async e => {
  console.error('AUDIT FAILED:', e);
  process.exit(1);
});
