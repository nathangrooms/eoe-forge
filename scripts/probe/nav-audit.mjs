/**
 * Every item in the left menu, measured against the owner's standing brief.
 *
 * Owner: "Ensure we are utilising the full width of the app - no weird small
 * windows or unutilised space", "try not to use cut cropped card images, always
 * show the full card image instead (means box size larger)", "Visual is always
 * better".
 *
 * Those are three checkable properties, so this checks them rather than
 * screenshotting and squinting:
 *
 *   DEAD BELOW    viewport height minus where content actually ends. A page
 *                 that stops 300px above the fold on a laptop is the "weird
 *                 small window" complaint.
 *   SIDE WASTE    viewport width minus the widest laid-out block, ignoring the
 *                 nav. A max-width container on a 1600px screen shows up here.
 *   CROPPED ART   card images drawn with `object-fit: cover` and a box whose
 *                 aspect is not a card's 5:7. Those are the cut-off images.
 *   CARD ART      how many card images the page shows at all. A page about
 *                 cards with none is the "be more visual" note.
 *
 * Screenshots go beside the numbers so a person can look, but the numbers are
 * what gets acted on.
 *
 *   node scripts/probe/nav-audit.mjs
 *   ONLY=collection,decks node scripts/probe/nav-audit.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

/* Overridable so a run can be pointed at a COPY of `dist`. Two agents sharing
   one checkout means `npm run build` elsewhere empties `dist` mid-walk, and the
   audit then dies on a missing `index.html` halfway through the menu. Snapshot
   the build, point DIST at the snapshot, and the walk is immune. */
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
const OUT = process.env.OUT || '.shots/nav-audit';
const WIDTHS = (process.env.WIDTHS || '1600x1000,390x844').split(',').map(s => s.split('x').map(Number));
const SETTLE = Number(process.env.SETTLE || 9000);
/*
 * A ROW THAT DEPENDS ON A LIVE FUNCTION CAN FLAKE, and `precons` is the one.
 *
 * `fetch-precons` is in the shim’s passthrough list, so that page makes a real
 * network call for 184 rows. It answers in about 627 ms on its own and can
 * exceed the settle window part-way through a fourteen-page sequential walk,
 * and the page then measures as its own empty state: 265px dead, no card art.
 * Seen on 2026-08-30, and `ONLY=precons` immediately gave 5,475px and 48 card
 * images on the same build.
 *
 * So a single bad row on a page backed by a live function is not a finding
 * yet. Re-run that page alone before believing it. Raising SETTLE helps and
 * costs every other page the same seconds, which is why it is not the default.
 */
/**
 * SHIM=off walks the app SIGNED OUT.
 *
 * The harness fakes a session, so `/` has always redirected to the dashboard
 and the marketing homepage — the thing the owner's brief opens by calling
 * "complete AI slop" — had never been screenshotted by this audit at all.
 * Without the shim the app boots as a visitor and card data still comes from
 * the real anon API, which is world-readable.
 */
const USE_SHIM = process.env.SHIM !== 'off';
/*
 * ADMIN=1 walks as an admin.
 *
 * The shim has read `window.__DM_ADMIN` since it was written and nothing has
 * ever set it, so `/admin` — the Dev Console this project is told to keep
 * updated — has never been loaded by the audit at all. Setting it declares
 * the FIXTURE account admin, exactly as the entitlement stub does; the real
 * gate is `profiles.is_admin` read server-side and is untouched.
 */
const AS_ADMIN = process.env.ADMIN === '1';
const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const DECK = 'e0909132-5a48-4416-924c-dd2374d3d34d';

/* The left menu, in the order it is drawn. */
const NAV = [
  ['home', '/dashboard'],
  ['card-search', '/cards'],
  ['tutor', '/tutor'],
  ['collection', '/collection'],
  ['decks', '/decks'],
  ['deck-detail', `/deck/${DECK}`],
  ['proxies', '/proxies'],
  ['marketplace', '/marketplace'],
  ['play', '/play'],
  ['life', '/life'],
  ['tournaments', '/tournament'],
  ['precons', '/precons'],
  ['wishlist', '/wishlist'],
  ['settings', '/settings'],
];
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

/**
 * A different list of screens, for the same three checks.
 *
 * The menu is fourteen routes and the app is not. One deck page carries eight
 * tabs and three card views, which is ten screens behind a single entry in
 * `NAV`, and this walk saw exactly one of them: whatever the URL shows with no
 * query string. The owner's brief is "view every possible screen", so the walk
 * has to be able to take a list rather than only the menu.
 *
 *   ROUTES='cards-table=/deck/<id>?view=table,mana=/deck/<id>?tab=mana' \
 *     node scripts/probe/nav-audit.mjs
 *
 * `scripts/probe/screens.mjs` builds the long ones so they are not typed by
 * hand. Anything measured here is measured the same way as the menu, which is
 * the point of putting it here instead of in a second copy of the file.
 */
const parsePairs = spec =>
  spec.split(',').map(pair => {
    const at = pair.indexOf('=');
    return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
  });

/*
 * `SCREENS=<set>` is the safe way in, and `ROUTES=` is kept for one-offs.
 *
 * Passing a route list through the shell is not safe on Windows. Git Bash
 * POSIX-path-converts an argument that looks like an absolute path, so
 * `ROUTES=$(node screens.mjs deck-routes)` turned the FIRST route from
 * `/deck/<id>/commander` into `C:/Program Files/Git/deck/<id>/commander` and
 * the walk died on `Cannot navigate to invalid URL`. Only the first one, which
 * is exactly the kind of corruption that reads as a code bug rather than as an
 * environment quirk.
 *
 * Importing the set removes the shell from the path entirely:
 *
 *   SCREENS=deck-routes node scripts/probe/nav-audit.mjs
 */
const { SETS } = await import('./screens.mjs');
const wanted = process.env.SCREENS;
if (wanted && !SETS[wanted]) {
  console.error(`unknown screen set "${wanted}". Known: ${Object.keys(SETS).join(', ')}`);
  process.exit(1);
}
const ROUTES = wanted
  ? SETS[wanted]()
  : process.env.ROUTES
    ? parsePairs(process.env.ROUTES)
    : null;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  let ext = path.extname(file);
  if (!ext || !fs.existsSync(file)) { file = path.join(DIST, 'index.html'); ext = '.html'; }
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT_REQUEST, r));
/** The port it actually got. */
const PORT = server.address().port;
fs.mkdirSync(path.resolve(OUT), { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  /* Subpixel antialiasing puts coloured fringes on thin type over dark
     backgrounds and reads as a styling bug that is not there. */
  args: ['--disable-lcd-text', '--no-sandbox'],
});

const rows = [];
for (const [name, route] of (ROUTES ?? NAV)) {
  if (ONLY && !ONLY.has(name)) continue;
  for (const [w, h] of WIDTHS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    if (AS_ADMIN) await page.evaluateOnNewDocument(() => { window.__DM_ADMIN = true; });
    if (USE_SHIM) await page.evaluateOnNewDocument(SHIM);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 90)));
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, SETTLE));

    const m = await page.evaluate(() => {
      const main = document.querySelector('main') ?? document.body;
      const view = { w: window.innerWidth, h: window.innerHeight };

      let lowest = 0;
      let widest = 0;

      /*
       * A FULL-BLEED HERO IMAGE IS CONTENT, wherever it sits in the tree.
       *
       * `lowest` walks the children of `main`, and the sign-in page's art strip
       * is a sibling of `main` rather than a descendant of it, so the page
       * reported 155px "empty below the fold" while a 1592x1000 image covered
       * every pixel of it. Measured: main's own bottom is 1000, the art's is
       * 1000, and the lowest CHILD of main is the form card at 845.
       *
       * Counting `main` itself instead would be wrong — it is `min-h-screen` on
       * most pages, so every page would report zero and the rule would stop
       * working. The narrow thing that is actually missing is an image as wide
       * as the window.
       */
      for (const img of document.querySelectorAll('img')) {
        const r = img.getBoundingClientRect();
        if (r.width < view.w * 0.9 || r.height < 200) continue;
        lowest = Math.max(lowest, r.bottom + window.scrollY);
        /* And the width, for the same reason. The sign-in page reported 572px
           of "unused width" on a screen an art strip covers edge to edge. */
        widest = Math.max(widest, r.width);
      }
      /*
       * CONTENT INSIDE A HORIZONTAL SCROLLER SAYS NOTHING ABOUT THE PAGE'S WIDTH.
       *
       * The deck page's ten-tab strip is 762px wide inside an
       * `overflow-x: auto` rail, which is exactly right on a phone: the tabs
       * scroll sideways. But it made `widest` 774 on a 390px screen, and the
       * one-column rule below compares a card grid against `widest`, so every
       * grid on that page was reported as "310px inside 774px, room for two"
       * on a screen with room for one. Three false positives in one run,
       * against a deliberate and correct piece of layout.
       *
       * `document.documentElement.scrollWidth` was 382 against a 390 client
       * width on that same page, which is the page itself saying it does not
       * overflow. A checker that contradicts that is the thing at fault.
       */
      /* ANY ancestor that CLIPS, not only one that scrolls.
         The first version tested for `auto` and `scroll`, and the homepage's
         marquee is `w-max` at 4,208px inside `overflow-hidden`, so `widest`
         came back 3,865 on a 390px screen and every card grid under it read as
         narrow. `hidden` and `clip` clip just as firmly as a scroller does,
         and a child nobody can see the right-hand end of says nothing about how
         much room the page has.

         This does not hide a real overflow bug. Content genuinely wider than
         the page is caught by `ovfX`, which compares the document's own
         scrollWidth against its clientWidth, and that is a separate column in
         the table. Here it read 382 against 390. */
      const inClippedBox = el => {
        let p = el.parentElement;
        for (let d = 0; p && d < 12; d++, p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== 'visible') return true;
        }
        return false;
      };

      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        lowest = Math.max(lowest, r.bottom + window.scrollY);
        /* Height still counts: a tall thing inside a sideways rail is still on
           the page and still pushes the fold down. Only its WIDTH is
           meaningless, and only when it exceeds the window. */
        if (r.right > view.w && inClippedBox(el)) continue;
        widest = Math.max(widest, r.right);
      }

      /* A card image is one served from Scryfall. Cropped means the box is
         showing less than the whole card: object-fit cover, or a box whose
         aspect ratio is not a card's 5:7 (0.714) within a tolerance. */
      const CARD_ASPECT = 5 / 7;
      let cardArt = 0;
      let cropped = 0;
      const croppedExamples = [];

      /* ART DRAWN AS A BACKGROUND, which this used to miss entirely.
         ------------------------------------------------------------------
         The Life counter reported "no card art at all" through several runs
         and the page is covered in it: every seat is a colour-identity ground
         built from a real card, and the caption underneath names the card it
         came from. They are CSS `background-image` on a div rather than an
         `<img>`, so a scan of `img` elements saw nothing and the page sat in
         the offenders list being wrong.

         Counted, never crop-checked. These are `art_crop` by design, so the
         5:7 test would flag every one of them, and CLAUDE.md approves the
         treatment by name. A false alarm that cannot be silenced is worse than
         no check, because the next person learns to skip the list. */
      for (const el of document.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') continue;
        if (!/scryfall/i.test(bg)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        cardArt += 1;
      }

      for (const img of document.querySelectorAll('img')) {
        const src = img.currentSrc || img.src || '';
        if (!/scryfall|cards\.scryfall/i.test(src)) continue;
        const r = img.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        cardArt += 1;
        const cs = getComputedStyle(img);
        const fit = cs.objectFit;
        /* THE LAYOUT BOX, NOT THE BOUNDING RECT.
           ----------------------------------------------------------------
           `getBoundingClientRect()` is transform-aware, so it returns the
           AXIS-ALIGNED box of a rotated element. The homepage hero fans seven
           cards at 5 degrees apiece; each one measured 276x334 instead of
           208x291 and read as ratio 0.83 against a card’s 0.71, so the fan
           was reported as two cropped cards on a page that crops none.

           `offsetWidth`/`offsetHeight` are the untransformed layout box,
           which is what "is this box the wrong shape for a card" actually
           means. A rotated card is still a card.

           Kept `r` for the size floor above, because a card rotated off the
           edge of the screen should still be skipped on its rendered size. */
        const boxW = img.offsetWidth || r.width;
        const boxH = img.offsetHeight || r.height;
        const aspect = boxW / boxH;
        const off = Math.abs(aspect - CARD_ASPECT) / CARD_ASPECT;

        /* A BLURRED GROUND IS NOT A CROPPED CARD, and CLAUDE.md approves it by
           name: "The art would be CROPPED if shown sharp, so blurring it
           removes the crop complaint entirely. There is no detail left to cut
           off." The dashboard's "What your collection is worth" panel is
           exactly that, `blur(40px) opacity 0.6 scale-125` behind a scrim, and
           flagging it would mean deleting the one thing putting Magic's colour
           back into a deliberately monochrome interface.

           Blur is checked up the ancestor chain because the filter is
           sometimes on a wrapper, and low opacity counts on its own because a
           background at 0.6 is not being read as a card either. */
        let blurred = /blur\(/.test(cs.filter || '');
        let up = img.parentElement;
        for (let i = 0; i < 6 && up && !blurred; i++) {
          blurred = /blur\(/.test(getComputedStyle(up).filter || '');
          up = up.parentElement;
        }
        const faded = Number(cs.opacity || '1') < 0.75;
        if (blurred || faded) continue;

        /* `art_crop` IS A CROP AND THAT IS THE POINT.
           ------------------------------------------------------------------
           Scryfall publishes `art_crop` as its own asset: the illustration
           without the frame, for exactly the use the homepage makes of it in
           `HomeNewSets`, where a 3:2 tile stands for a SET rather than for a
           card. Flagging it reported eight crops on a page that cuts up no
           cards, and the component's own comment says so a line above the
           markup: "set tiles: art_crop is correct here, a tile stands for a
           SET".

           The owner's rule is about a CARD being shown cut off. An asset whose
           whole purpose is to be the art alone cannot break it, so it is
           counted as art and never crop-checked — the same exemption the
           blurred grounds above already have, for the same reason. */
        if (/\/art_crop\//i.test(src)) continue;

        if (fit === 'cover' && off > 0.12) {
          cropped += 1;
          if (croppedExamples.length < 3) {
            croppedExamples.push(`${Math.round(boxW)}x${Math.round(boxH)} ratio ${aspect.toFixed(2)}`);
          }
        }
      }

      /* WHAT THE FIXTURE NEVER ANSWERED.
         Without this the audit cannot tell "this page shows nothing because it
         is badly designed" from "this page shows nothing because the harness
         does not proxy edge functions". Both look like an empty screen and
         only one is worth fixing. Measured: /decks drew its Create New Deck
         empty state and /precons said "0 precons" while the LIVE fetch-precons
         function returns 184 rows in 627 ms. Two ghosts, and acting on either
         would have been a change to working code. */
      const rpc = window.__dmRpc;
      const all = Array.isArray(rpc)
        ? [...new Set(rpc.filter(Boolean).map(String))]
        : rpc && typeof rpc === 'object'
          ? Object.keys(rpc)
          : [];

      /* A WRITE THAT WENT NOWHERE IS NOT A STARVED PAGE. The harness must not
         write, so `persist_deck_power_batch`, `touch_presence` and their kind
         returning null is the fixture behaving correctly, and counting them
         made /decks report itself unjudgeable on a run where it rendered both
         decks with real card art. Only a READ coming back empty can leave a
         page with nothing to draw. */
      const isWrite = (n) =>
        /^(rpc|fn):(persist|set|touch|track|record|log|upsert|save|insert|update|delete|increment|claim|sweep)_/.test(n);
      const unanswered = all.filter((n) => !isWrite(n)).slice(0, 6);

      /* An empty state is a page telling you it has nothing, which is a
         different thing from a page that is thin. Recognised by the words the
         codebase actually uses. */
      const body = (main.innerText || '').toLowerCase();
      const emptyState = /\b(no |0 |nothing |create new|get started|none yet|nobody has)/.test(body)
        && main.querySelectorAll('img').length === 0;

      /*
       * A CARD GRID LAYING OUT ONE COLUMN IN A BOX THAT COULD FIT TWO.
       *
       * The measurement that was missing. `/deck/:id` on a 390px phone was
       * 36,111 pixels of scroll — forty-three screens for a hundred cards —
       * while scoring perfectly on dead space, unused width, cropped art and
       * horizontal overflow, because none of those is about how many cards sit
       * on a row. Every other surface managed two columns at that width; this
       * one missed by two pixels of padding and nothing said so.
       *
       * THE TEST IS NOT THE GRID'S OWN WIDTH, and the first draft of this got
       * that wrong: it skipped anything under 320px, and the grid it was
       * written to catch was 310. Two 150px cards plus a 12px gap need 312, so
       * by its own width that grid genuinely could not fit two — the fault was
       * 48px of desktop padding upstream of it, not the grid.
       *
       * SECOND DRAFT, AND THE FIRST ONE CRIED WOLF. Comparing the grid's width
       * against the page's flagged three grids on the deck page at 390px that
       * were all correct. The archetype panel's grid is 278px because it sits
       * inside a panel with 16px of padding inside a card with 20px more, and
       * it fills that 278px exactly. Two cards do not go in 278px. The rule was
       * reporting the panel's own frame as waste.
       *
       * The question is not "is this grid narrower than the page". It is
       * "COULD ANOTHER COLUMN FIT". So: take the rendered track, and ask
       * whether two of them plus a gap go inside the page.
       *
       *   archetype, 390px   278 * 2 + 12 = 568 > 382   no room, not a fault
       *   the cut lists       already two tracks, skipped
       *   the grid this rule was written for, at 1600
       *                       310 * 2 + 12 = 632 < 774   room, flagged
       *
       * WHAT IT STILL CANNOT SEE: the track is what the grid RESOLVED to, not
       * what the tile asked for. `minmax(180px, 1fr)` in a 278px box gives one
       * 278px track, and the rule reads 278 rather than 180, so a single
       * stretched column that could have been two smaller ones goes
       * unreported. That is deliberate. The owner's standing instruction is
       * that a bigger card beats a smaller one, so a checker guessing wrong in
       * this direction argues for the layout the brief already asks for, and a
       * checker guessing wrong in the other direction is one nobody reads.
       */
      const oneColumn = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'grid') continue;
        if (el.querySelectorAll('img').length < 5) continue;
        const tracks = cs.gridTemplateColumns.split(' ').filter(Boolean);
        if (tracks.length !== 1) continue;
        const track = parseFloat(tracks[0]);
        if (!Number.isFinite(track) || track < 40) continue;
        const gap = parseFloat(cs.columnGap) || 0;
        if (track * 2 + gap > widest) continue; // a second column does not fit
        const w = Math.round(el.getBoundingClientRect().width);
        oneColumn.push(
          `${w}px of ${Math.round(widest)}px, one ${Math.round(track)}px column where two fit, ` +
            `${el.querySelectorAll('img').length} cards`
        );
      }

      const mainRect = main.getBoundingClientRect();
      return {
        unanswered,
        emptyState,
        oneColumn,
        pageH: document.documentElement.scrollHeight,
        contentEnds: Math.round(lowest),
        viewH: view.h,
        viewW: view.w,
        mainLeft: Math.round(mainRect.left),
        widest: Math.round(widest),
        cardArt,
        cropped,
        croppedExamples,
        h1: document.querySelector('h1')?.innerText?.split('\n')[0]?.slice(0, 40) ?? '(no h1)',
        overflowX: document.documentElement.scrollWidth - view.w,
      };
    });

    const deadBelow = Math.max(0, m.viewH - m.contentEnds);
    /* Waste to the RIGHT of the widest block, inside the content column. */
    const sideWaste = Math.max(0, m.viewW - m.widest);

    rows.push({ name, route, w, h, ...m, deadBelow, sideWaste, errors: errors.length });

    /*
     * SCROLL THE WHOLE PAGE BEFORE CAPTURING IT.
     *
     * `fullPage: true` stitches a tall image without ever scrolling the
     * viewport, and `CardImage` is `loading="lazy"` like every image should be,
     * so anything below the first screenful has never been asked for. The
     * screenshot then shows real card art at the top and empty grey boxes
     * underneath — which looks exactly like a page whose images are broken.
     *
     * That misread three separate screens on 30 Aug: the dashboard's activity
     * rail, the collection value rail, and four of the eleven archetype tiles,
     * each time sending me to look for a defect that a probe then proved was
     * not there (`naturalWidth > 0` on every one of them).
     *
     * So the page is walked to the bottom, given a moment for what that
     * triggers, and returned to the top before the capture. The MEASUREMENTS
     * above are taken first and are untouched by this.
     *
     * IT IS NOT COMPLETE, AND THE REMAINDER IS KNOWN. On the Templates page two
     * tiles out of eleven still capture grey, reproducibly, under three
     * different wait strategies — while a probe reading `naturalWidth` on the
     * same page after the same scroll finds all 33 images loaded. So a grey box
     * in a screenshot is EVIDENCE, not proof. Before acting on one, read the
     * image with a probe: `naturalWidth > 0` is the authority and a picture is
     * not.
     */
    await page.evaluate(async () => {
      const step = window.innerHeight;
      const end = document.documentElement.scrollHeight;
      for (let y = 0; y < end; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    /*
     * Then WAIT FOR THEM, rather than waiting a fixed moment and hoping.
     *
     * The first version awaited `decode()` on whatever was incomplete at that
     * instant, which misses every image the last scroll step had only just
     * requested — measured, it left the bottom two tiles of the Templates page
     * grey while the nine above them were correct, which is the same misread
     * this whole block exists to stop.
     *
     * Polls instead, with a ceiling, because an image that genuinely 404s must
     * not hang the walk. A capture with a broken image in it is a finding; a
     * walk that never finishes is not.
     */
    await page
      .evaluate(async () => {
        const deadline = performance.now() + 8000;
        /* `complete` alone is the wrong test: it is ALSO true for an image
           that has finished failing, and true for one with no src, so a poll
           on it exits while the picture is still absent. `naturalWidth > 0`
           is the condition that means there is something to paint, and it is
           the same test the probes use to judge a tile loaded. */
        const pending = () =>
          [...document.images].filter(i => !(i.complete && i.naturalWidth > 0));
        while (pending().length > 0 && performance.now() < deadline) {
          await Promise.race([
            Promise.all(pending().map(i => i.decode().catch(() => {}))),
            new Promise(r => setTimeout(r, 400)),
          ]);
        }
      })
      .catch(() => {});
    /* `complete` means decoded, not painted, and `fullPage` re-rasterises the
       whole document in one pass. Two frames plus a beat, or the bottom of a
       long page captures the frame before its images were composited. */
    await page
      .evaluate(
        () =>
          new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 1200)))
          )
      )
      .catch(() => {});

    await page.screenshot({ path: path.join(path.resolve(OUT), `${name}-${w}.png`), fullPage: true });
    await page.close();
  }
}
await browser.close();
server.close();

const hdr =
  'page'.padEnd(14) + 'width'.padStart(6) + 'pageH'.padStart(7) +
  'dead'.padStart(6) + 'side'.padStart(6) + 'ovfX'.padStart(6) +
  'art'.padStart(5) + 'crop'.padStart(6) + 'err'.padStart(5) + '  h1';
console.log(hdr);
console.log('-'.repeat(hdr.length));
for (const r of rows) {
  console.log(
    r.name.padEnd(14) +
    String(r.w).padStart(6) +
    String(r.pageH).padStart(7) +
    String(r.deadBelow).padStart(6) +
    String(r.sideWaste).padStart(6) +
    String(r.overflowX > 0 ? r.overflowX : 0).padStart(6) +
    String(r.cardArt).padStart(5) +
    String(r.cropped).padStart(6) +
    String(r.errors).padStart(5) +
    '  ' + r.h1
  );
}

console.log('');
console.log('WORST OFFENDERS, by the owner\'s own three rules:');
const desk = rows.filter(r => r.w >= 1000);
/* A page the fixture starved is not a page with a layout problem. It is
   excluded from the verdict and listed separately, so nobody spends an hour
   fixing a screen that works in production. */
/* STARVED MEANS A READ WENT UNANSWERED, and nothing else.
   The emptyState heuristic used to sit here too and it was excluding pages
   that deserve judging: Settings and the Life Counter have no card images BY
   DESIGN, not because the fixture failed them, and an empty Wishlist is a real
   state a real user sees on their first visit. An empty state still has to fill
   the screen well, so it is exactly the kind of surface this audit exists for.
   The flag is still recorded, because it explains WHY a judged page has no
   art, but it no longer buys an exemption. */
const starved = desk.filter(r => r.unanswered.length > 0);
const starvedNames = new Set(starved.map(r => r.name));
const real = desk.filter(r => !starvedNames.has(r.name));
const dead = [...real].sort((a, b) => b.deadBelow - a.deadBelow).filter(r => r.deadBelow > 80);
const side = [...real].sort((a, b) => b.sideWaste - a.sideWaste).filter(r => r.sideWaste > 120);
const crop = [...real].filter(r => r.cropped > 0).sort((a, b) => b.cropped - a.cropped);
const bare = [...real].filter(r => r.cardArt === 0);
/* Judged at EVERY width, not only desktop, because this is the one rule that
   only ever fired on a phone. */
const oneCol = rows.filter(r => (r.oneColumn ?? []).length > 0);

console.log(`  empty below the fold (${dead.length}):`);
for (const r of dead) console.log(`    ${r.name.padEnd(14)} ${r.deadBelow}px of ${r.viewH}`);
console.log(`  unused width (${side.length}):`);
for (const r of side) console.log(`    ${r.name.padEnd(14)} ${r.sideWaste}px of ${r.viewW}`);
console.log(`  cropped card art (${crop.length}):`);
for (const r of crop) console.log(`    ${r.name.padEnd(14)} ${r.cropped} of ${r.cardArt}   ${r.croppedExamples.join(', ')}`);
console.log(`  a card grid in one column with room for two (${oneCol.length}):`);
for (const r of oneCol) {
  console.log(`    ${r.name.padEnd(14)} at ${r.w}px: ${r.oneColumn.join(' | ')}, page ${r.pageH}px`);
}
console.log(`  no card art at all (${bare.length}):`);
for (const r of bare) console.log(`    ${r.name.padEnd(14)} ${r.h1}`);

console.log('');
console.log(`NOT JUDGED, the fixture did not feed them (${starved.length}):`);
for (const r of starved) console.log(`    ${r.name.padEnd(14)} ${r.unanswered.length ? 'unanswered: ' + r.unanswered.join(', ') : 'empty state'}`);

fs.writeFileSync(path.join(path.resolve(OUT), 'audit.json'), JSON.stringify(rows, null, 2));
console.log('');
console.log(`shots and json: ${OUT}`);
