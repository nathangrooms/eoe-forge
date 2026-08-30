/**
 * Every screen behind a menu entry, as a ROUTES list for `nav-audit`.
 *
 *   node scripts/probe/screens.mjs deck            # print the list
 *   ROUTES=$(node scripts/probe/screens.mjs deck) node scripts/probe/nav-audit.mjs
 *
 * WHY
 * ---
 * The left menu is fourteen routes and the app is not. One deck page carries
 * eight tabs and three card views, so ten screens hide behind one entry in
 * `NAV`, and the audit measured whichever of them the bare URL happens to show.
 * The owner's brief says "view every possible screen"; this is the list of
 * them.
 *
 * The tab and view names are read from `DeckInterface.tsx` rather than copied,
 * so a tab added there appears here without anybody remembering to add it. A
 * hand-kept list would drift the day it was written, and a screen nobody walks
 * is a screen nobody has looked at.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DECK = process.env.DECK || 'e0909132-5a48-4416-924c-dd2374d3d34d';
/* Sol Ring's representative printing in `cards_unique`. A real id, so the
   card page draws a real card rather than a not-found state. */
const CARD = process.env.CARD || 'a7fc546e-7e3c-436d-a0b9-9ac3548ec344';

/** Tab ids, straight out of the component that declares them. */
function deckTabs() {
  const src = fs.readFileSync(path.resolve('src/pages/DeckInterface.tsx'), 'utf8');
  const block = src.match(/const DECK_TABS[^=]*=\s*\[([\s\S]*?)\n\];/);
  const from = block ? block[1] : src;
  return [...from.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map(m => m[1]);
}

/** The card views the Cards tab accepts, from the same file's own guard. */
function deckViews() {
  const src = fs.readFileSync(path.resolve('src/pages/DeckInterface.tsx'), 'utf8');
  const guard = src.match(/viewParam === '([a-z]+)'[\s\S]{0,120}?viewParam === '([a-z]+)'[\s\S]{0,60}?viewParam === '([a-z]+)'/);
  return guard ? [guard[1], guard[2], guard[3]] : ['visual'];
}

export const SETS = {
  /* The deck page: every tab, and every card view of the tab that has them. */
  deck() {
    const out = [];
    for (const view of deckViews()) out.push([`deck-cards-${view}`, `/deck/${DECK}?view=${view}`]);
    for (const tab of deckTabs()) {
      if (tab === 'cards') continue; // covered by the views above
      out.push([`deck-${tab}`, `/deck/${DECK}?tab=${tab}`]);
    }
    return out;
  },

  /* The deck page's own sub-routes, which are separate destinations rather
     than tabs and so are never reached by a query string. */
  'deck-routes': () =>
    ['commander', 'optimise', 'export', 'share', 'proxies', 'testhand'].map(leaf => [
      `deck-${leaf}`,
      `/deck/${DECK}/${leaf}`,
    ]),

  /* The collection's four sections. Same shape as the deck tabs: one menu
     entry, four screens.

     READ FROM THE SOURCE, like the deck tabs above, and the first draft of this
     one was hardcoded and wrong. It guessed `cards` and `add`; the page calls
     them `collection` and `add-cards`, so three of the four walks landed on an
     unrecognised tab and measured an empty 1,080px page. Then the run reported
     three collection screens with "no card art at all", which is a probe
     inventing a defect. Anything hand-copied here drifts the day it is
     written. */
  collection() {
    const src = fs.readFileSync(path.resolve('src/pages/Collection.tsx'), 'utf8');
    const m = src.match(/const TABS = \[([^\]]+)\]/);
    const tabs = m
      ? [...m[1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
      : ['collection'];
    return tabs.map(tab => [`collection-${tab}`, `/collection?tab=${tab}`]);
  },

  /**
   * The routes that are NOT in the left menu and were therefore never walked.
   *
   * `App.tsx` declares about sixty. The menu is fourteen of them, and the audit
   * had only ever seen the menu plus whatever sub-routes were added by hand. So
   * `/cards/:id` — the card page the owner asked about by name, where the
   * "recommended cards" complaint lives — had never been screenshotted, nor had
   * Scan, Templates, Shopping or the storage pages.
   *
   * Auth, legal and `:param` routes needing a fixture that does not exist are
   * left out on purpose: a walk that 404s tells you nothing. Anything here has
   * to be reachable signed out with the harness.
   */
  rest: () => [
    ['card-detail', `/cards/${CARD}`],
    ['scan', '/scan'],
    ['templates', '/templates'],
    ['smart-builder', '/smart-builder'],
    ['shopping', '/shopping'],
    ['decks-new', '/decks/new'],
    ['collection-import', '/collection/import'],
    ['collection-insurance', '/collection/insurance'],
    ['collection-storage-page', '/collection/storage'],
    ['play-mats', '/play/mats'],
    ['tournament-new', '/tournament/new'],
    ['landing', '/landing'],
  ],

  /**
   * The pages a VISITOR sees. Walk these with `SHIM=off`.
   *
   * The harness fakes a session, so `/` redirects to the dashboard and the
   * marketing homepage had never been walked. The owner’s standing brief
   * opens by calling it "complete AI slop", which makes it the one page in
   * the app with a recorded complaint against it and no measurement.
   */
  public: () => [
    ['home-marketing', '/'],
    ['login', '/login'],
    ['register', '/register'],
    ['privacy', '/privacy'],
    ['terms', '/terms'],
  ],

  /* Play is a flow rather than a page: mode, then deck, then the table. */
  play: () => [
    ['play-modes', '/play'],
    ['play-goldfish-deck', '/play?mode=goldfish&step=deck'],
    ['play-bots-deck', '/play?mode=bots&step=deck'],
    ['play-bots-seats', '/play?mode=bots&step=table'],
    ['play-playtest-deck', '/play?mode=playtest&step=deck'],
    ['play-online', '/play/online'],
  ],
};

/* CLI only when run directly. `nav-audit` imports SETS instead, because
   passing a route list through the shell is not safe on Windows: Git Bash
   POSIX-path-converts an argument that looks like an absolute path, so
   ROUTES=$(node screens.mjs deck-routes) turned the FIRST route from
   "/deck/<id>/commander" into "C:/Program Files/Git/deck/<id>/commander" and
   the walk died on an invalid URL. Only the first one, which is the kind of
   corruption that reads as a code bug for twenty minutes. */
const invokedDirectly =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const which = process.argv[2];
  if (!which || !SETS[which]) {
    console.error(`usage: node scripts/probe/screens.mjs <${Object.keys(SETS).join('|')}>`);
    process.exit(1);
  }
  process.stdout.write(SETS[which]().map(([n, r]) => `${n}=${r}`).join(','));
}
