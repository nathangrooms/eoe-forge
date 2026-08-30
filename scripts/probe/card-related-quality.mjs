/**
 * What the card page actually recommends, read off the rendered page.
 *
 * Owner, 2026-08-30, relaying a friend: on the card detail page "there are
 * recommended cards, similar, works well with etc - my friend said they are
 * nowhere near alike". And: "Are we 100% confident this uses the engine too?"
 *
 * `CardRelated.tsx` says in its own header that "there is no recommendation
 * engine behind this page and it does not pretend there is". That is half
 * true and the half matters: the `Does the same thing` group DOES go through
 * the engine, because `@/lib/deck/recommend/similar` compiles both cards with
 * `facetsForCard` and ranks on shared effects and their arguments. Every other
 * group is a word or a tag: same creature type, shared keyword, same role tag,
 * seen in the same decklist.
 *
 * So the question is not whether the engine is wired in. It is which group a
 * player is actually looking at when they say the results are nowhere near
 * alike. This reads every group off the real page for cards whose right
 * answers a Magic player can state without argument, so the groups can be
 * judged separately instead of as one verdict.
 *
 * WHAT THE RUN ON 2026-08-30 SETTLED, so a later pass does not re-measure it.
 * `Does the same thing` was right and everything beside it was not.
 * `SIMILAR CARDS` matched a type, a colour and a mana value: Sol Ring returned
 * Phyrexian Dreadnought and Cement Shoes. `WORKS WELL WITH` showed the same
 * list as `Does the same thing` on four of six cards, and on Counterspell it
 * showed Aether Vial, Aether Hub, Abundant Countryside and Agent's Toolkit,
 * which is alphabetical order from an unsorted query. The page now runs two
 * sections, `Does the same thing` and `Works well with`, and the second is
 * combos or nothing.
 *
 *   node scripts/probe/card-related-quality.mjs
 *   CARDS="Sol Ring|Counterspell" node scripts/probe/card-related-quality.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

/* Overridable because several agents build this repo at once, and a `dist`
   deleted underneath a running probe fails it halfway with ENOENT on
   index.html. Build to a directory of your own: `dist-*` is gitignored.
   `npx vite build --outDir dist-related && DIST=dist-related node ...` */
const DIST = process.env.DIST || 'dist';
const PORT = Number(process.env.PORT || 4607);
const OUT = process.env.OUT || '.shots/card-related';
const SHIM = fs.readFileSync(path.resolve('scripts/refute-shim.js'), 'utf8');
const SUPABASE = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

/* Cards whose neighbours a player can name without argument, one per shape the
   page has to handle.

   The last five were added on 2026-08-30 because the first six were all spells
   with rules text, and the page has to survive the rest of the catalogue:
   Grizzly Bears is a vanilla creature, Command Tower a land, Teferi a
   planeswalker, and Cultivate is one of the 22.4% we hold no record for at all.
   Thassa's Oracle and Basalt Monolith are here for the opposite reason, as the
   cards a combo group has the most to say about.

   Separated by `|` and not by a comma, because half the planeswalkers in Magic
   have a comma in their name and "Teferi, Time Raveler" was silently probing
   two cards that do not exist. */
const CARDS = (process.env.CARDS ||
  "Sol Ring|Counterspell|Swords to Plowshares|Cultivate|Craterhoof Behemoth|Rhystic Study|" +
  "Grizzly Bears|Command Tower|Teferi, Time Raveler|Thassa's Oracle|Basalt Monolith"
).split('|').map(s => s.trim());

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, p); let e = path.extname(f);
  if (!e || !fs.existsSync(f)) { f = path.join(DIST, 'index.html'); e = '.html'; }
  res.writeHead(200, { 'content-type': MIME[e] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT, r));
fs.mkdirSync(path.resolve(OUT), { recursive: true });

async function idFor(name) {
  const url =
    `${SUPABASE}/rest/v1/cards_unique?select=id,name&name=eq.${encodeURIComponent(name)}&limit=1`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--disable-lcd-text', '--no-sandbox'],
});

const report = [];
for (const name of CARDS) {
  const id = await idFor(name);
  if (!id) { console.log(`${name}: not in the catalogue`); continue; }

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  await page.evaluateOnNewDocument(SHIM);
  await page.goto(`http://localhost:${PORT}/cards/${id}`, { waitUntil: 'networkidle0' });
  /* These groups each fire their own query; give them room. */
  await new Promise(r => setTimeout(r, 12000));

  const groups = await page.evaluate(() => {
    const out = [];
    /* Each group is a heading followed by a rail of card links. Read the
       headings rather than class names so a restyle does not blind this. */
    const headings = [...document.querySelectorAll('h2,h3,h4')]
      .filter(h => /works well with|similar|does the same|fills the same role|combines with|same deck|shares|plays with|related/i.test(h.innerText || ''));
    for (const h of headings) {
      /*
       * THE WALK STOPS AT THE SECTION, and it did not before.
       *
       * The old loop climbed until it found more than one card link, so an
       * EMPTY section climbed out of itself and reported its neighbour's list.
       * On 2026-08-30 that is exactly how Rhystic Study, which is in no
       * recorded combo and correctly draws no combo group, was read as showing
       * fourteen cards under WORKS WELL WITH. Half of the original finding was
       * this bug, and a probe that cannot see an empty group cannot check the
       * rule that an empty group must stay empty.
       */
      /* An h2 names the whole section; an h3 names one group inside it. */
      const scope =
        h.tagName === 'H2' ? h.closest('section') : h.parentElement;
      if (!scope) continue;
      /* The first paragraph under a tile is the card name. Reading innerText
         instead swept up the mana pips and the price and made every list
         unreadable. */
      const names = [...scope.querySelectorAll('a[href^="/cards/"]')]
        .map(a => {
          const p = a.querySelector('p');
          const img = a.querySelector('img');
          return (p?.textContent || img?.alt || a.innerText || '').trim();
        })
        .filter(Boolean);
      /* A group can be split into labelled sub-rails; keep the heading text
         so the reason it gives is visible next to what it produced. */
      out.push({ heading: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70), cards: [...new Set(names)].slice(0, 12) });
    }
    return out;
  });

  await page.screenshot({ path: path.join(path.resolve(OUT), `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), fullPage: true });
  await page.close();

  report.push({ name, groups });
  console.log('');
  console.log(`=== ${name} ===`);
  if (!groups.length) console.log('  (no recommendation groups rendered)');
  for (const g of groups) {
    console.log(`  ${g.heading}`);
    console.log(`    ${g.cards.length ? g.cards.join(', ') : '(empty)'}`);
  }
}

await browser.close();
server.close();
fs.writeFileSync(path.join(path.resolve(OUT), 'report.json'), JSON.stringify(report, null, 2));
console.log('');
console.log(`shots and json: ${OUT}`);
