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
const PORT = Number(process.env.PORT || 4587);
const OUT = process.env.OUT || '.shots/nav-audit';
const WIDTHS = (process.env.WIDTHS || '1600x1000,390x844').split(',').map(s => s.split('x').map(Number));
const SETTLE = Number(process.env.SETTLE || 9000);
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
await new Promise(r => server.listen(PORT, r));
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
      for (const el of main.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        lowest = Math.max(lowest, r.bottom + window.scrollY);
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

      const mainRect = main.getBoundingClientRect();
      return {
        unanswered,
        emptyState,
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
    is still recorded, because it explains WHY a judged page has no
   art, but it no longer buys an exemption. */
const starved = desk.filter(r => r.unanswered.length > 0);
const starvedNames = new Set(starved.map(r => r.name));
const real = desk.filter(r => !starvedNames.has(r.name));
const dead = [...real].sort((a, b) => b.deadBelow - a.deadBelow).filter(r => r.deadBelow > 80);
const side = [...real].sort((a, b) => b.sideWaste - a.sideWaste).filter(r => r.sideWaste > 120);
const crop = [...real].filter(r => r.cropped > 0).sort((a, b) => b.cropped - a.cropped);
const bare = [...real].filter(r => r.cardArt === 0);

console.log(`  empty below the fold (${dead.length}):`);
for (const r of dead) console.log(`    ${r.name.padEnd(14)} ${r.deadBelow}px of ${r.viewH}`);
console.log(`  unused width (${side.length}):`);
for (const r of side) console.log(`    ${r.name.padEnd(14)} ${r.sideWaste}px of ${r.viewW}`);
console.log(`  cropped card art (${crop.length}):`);
for (const r of crop) console.log(`    ${r.name.padEnd(14)} ${r.cropped} of ${r.cardArt}   ${r.croppedExamples.join(', ')}`);
console.log(`  no card art at all (${bare.length}):`);
for (const r of bare) console.log(`    ${r.name.padEnd(14)} ${r.h1}`);

console.log('');
console.log(`NOT JUDGED, the fixture did not feed them (${starved.length}):`);
for (const r of starved) console.log(`    ${r.name.padEnd(14)} ${r.unanswered.length ? 'unanswered: ' + r.unanswered.join(', ') : 'empty state'}`);

fs.writeFileSync(path.join(path.resolve(OUT), 'audit.json'), JSON.stringify(rows, null, 2));
console.log('');
console.log(`shots and json: ${OUT}`);
