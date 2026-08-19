/**
 * Photograph the REAL app into `public/screens/`, for the homepage to show.
 *
 * ===========================================================================
 * HOW TO RE-RUN THIS (read this bit even if you read nothing else)
 * ===========================================================================
 *
 *     npm run dev                     # any vite server on this repo
 *     node scripts/app-shots.mjs      # ~4 minutes, writes public/screens/
 *
 *     BASE=http://127.0.0.1:8080 node scripts/app-shots.mjs   # other port
 *     ONLY=collection,card node scripts/app-shots.mjs         # one or two scenes
 *     WIDTHS=1280 node scripts/app-shots.mjs                  # skip the 2x pass
 *
 * Commit whatever lands in `public/screens/`. The harness files it writes
 * (`app-shots-harness.html`, `src/dev/__appShotsHarness.tsx`) are gitignored.
 *
 * ---------------------------------------------------------------------------
 * WHEN TO RE-RUN IT — this is the part that matters
 * ---------------------------------------------------------------------------
 * A screenshot is a claim about what the app looks like today. Left alone it
 * quietly stops being true, and a homepage showing a screen the app no longer
 * has is a fabrication in exactly the way the transcribed power weights were:
 * nobody typed a lie, the truth simply moved and the page did not.
 *
 * So re-run it whenever you change what one of the photographed screens looks
 * like — the play table, the deck builder, the life counter, the tournament
 * manager, the collection page, the card page — and whenever you change the app
 * shell (`TopNavigation`, `LeftNavigation`) or the design tokens, because those
 * are in every picture. `public/screens/manifest.json` carries `generatedAt`;
 * if it is older than the last change to those areas, the pictures are stale.
 *
 * Docs: `docs/overhaul/APP-SCREENSHOTS.md`.
 *
 * ===========================================================================
 * WHAT IS REAL IN THESE IMAGES, STATED PLAINLY
 * ===========================================================================
 * REAL: the pages. Every pixel is the shipped component tree rendering through
 * the providers `App.tsx` gives it, inside the same shell `App.tsx` builds. No
 * recreation, no CSS mockup, no retouching. Every card, every card image, every
 * card name, every price and every type line is a row read out of the live
 * catalogue. The deck in the builder is a Wizards precon decklist, fetched from
 * the `fetch-precons` edge function at capture time.
 *
 * FIXTURE: who owns what. A signed-out request may never be shown a real
 * person's collection, decks or wishlist, so the account in the picture is
 * invented, modelled on the shape of the one real account in this database that
 * has data. See `scripts/dashboard-shim.js`. Tournament events are fixture for a
 * second reason: they live in `localStorage` on the organiser's own machine, so
 * there is no server-side "real" event to read.
 *
 * NOT DONE ANYWHERE: no credentials are entered, no real user's data is read,
 * and no number on screen is written by this script.
 *
 * ---------------------------------------------------------------------------
 * DATABASE DISCIPLINE
 * ---------------------------------------------------------------------------
 * Every read here is a keyed lookup — `id=eq.`, `id=in.(…)`, `name=in.(…)` —
 * against indexed columns, in chunks, cached to `.shots/app/` so a second run
 * asks for nothing. Deck lists resolve through `cards_unique` (one row per
 * card), never `cards` (every printing): a 100-name `in.()` against `cards`
 * returns every printing of every name and is both wrong and heavy. No scans,
 * no counts, no cron.
 *
 * ---------------------------------------------------------------------------
 * LINEAGE
 * ---------------------------------------------------------------------------
 * This supersedes `scripts/capture-app-screens.mjs`, which shot four of these
 * scenes without the app shell around them. Two scripts writing one manifest is
 * how a screenshot set goes stale without anyone noticing, so there is one.
 * The hard parts were solved elsewhere and are reused rather than reinvented:
 *
 *   - mounting a real page with App.tsx's providers minus the auth gate —
 *     `scripts/play-combat-shots.mjs`
 *   - the PostgREST fixture and the invented-but-shaped-right account —
 *     `scripts/dashboard-shim.js`, `scripts/tournament-shim.js`
 *   - holding the page still while other agents save files —
 *     `scripts/storage-shots.mjs` (the deaf WebSocket below)
 *   - driving a real game to a mid-game board — `scripts/play-combat-shots.mjs`
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

import { buildEvents } from './fixture-events.mjs';

const OUT = process.env.OUT || 'public/screens';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const ONLY = process.env.ONLY || '';
const QUALITY = Number(process.env.QUALITY || 82);
const CACHE = '.shots/app';

/**
 * 1600 is the picture; 1920 is its 2x. Each width is CAPTURED at that width
 * rather than resized from one big shot, so the layout in the picture is the
 * layout the app really has there.
 *
 * Not 1280: the shell's 256px rail leaves 1024px of page, and the deck header's
 * right-hand column overhangs that. The 1280 shot came back with `Edit deck`
 * sliced down the middle, which reads as a broken build rather than as a narrow
 * window. 1600 is the width the app is actually used at.
 */
const WIDTHS = (process.env.WIDTHS || '1600,1920').split(',').map(Number);
const heightFor = width => Math.round(width * 0.625); // 16:10, the shape of a laptop

const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const REST = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const FUNCTIONS = 'https://udnaflcohfyljrsgqggy.supabase.co/functions/v1';
const HEADERS = { apikey: ANON, Authorization: `Bearer ${ANON}` };

/** Everything any photographed screen reads off a card row. */
const COLUMNS = [
  'id', 'oracle_id', 'name', 'set_code', 'collector_number', 'type_line', 'mana_cost',
  'cmc', 'colors', 'color_identity', 'rarity', 'layout', 'image_uris', 'faces', 'prices',
  'is_legendary', 'oracle_text', 'power', 'toughness', 'keywords', 'legalities', 'tags',
].join(',');

/** The precon whose decklist stands in for the account's own deck. */
const PRECON = process.env.PRECON || 'Eldrazi Incursion';

/** Which of the dashboard fixture's decks gets the real list. `d1`. */
const DECK_ID = 'dddddddd-0000-4000-8000-000000000000';

/** The card the card page is a page for. Real printing id, from the fixture. */
const CARD_PAGE_ID = 'd0d33d52-3d28-4635-b985-51e126289259'; // Atraxa, Praetors' Voice

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Reading the real rows                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Read once, cache to disk.
 *
 * Reading from inside the browser made every capture depend on a shared
 * free-tier database answering inside its eight second statement timeout, and
 * one slow job in another session was enough to blank a page.
 */
function cached(name, produce) {
  const file = path.join(CACHE, `${name}.json`);
  if (fs.existsSync(file)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    log(`  ${name}: ${Array.isArray(value) ? value.length : 1} from cache`);
    return Promise.resolve(value);
  }
  return produce().then(value => {
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  });
}

async function getJSON(url, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 90)}`);
      return await res.json();
    } catch (error) {
      if (attempt === attempts) throw error;
      await sleep(1200 * attempt);
    }
  }
  return null;
}

const quote = value => `"${String(value).replace(/"/g, '')}"`;

/** Keyed lookup, chunked. `table` is `cards` or `cards_unique`. */
async function cardsWhereIn(table, column, values, chunkSize = 40) {
  const unique = [...new Set(values.filter(Boolean))];
  const rows = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const list = unique.slice(i, i + chunkSize).map(quote).join(',');
    const url = `${REST}/${table}?select=${COLUMNS}&${column}=in.(${encodeURIComponent(list)})`;
    const batch = await getJSON(url);
    if (Array.isArray(batch)) rows.push(...batch);
  }
  return rows;
}

/* -------------------------------------------- the fixture account's cards */

/**
 * The printing ids the dashboard fixture names, read out of the shim itself so
 * a change there is picked up rather than silently diverging.
 */
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SHIM = fs.readFileSync(path.join(here, 'dashboard-shim.js'), 'utf8');
const TOURNAMENT_SHIM = fs.readFileSync(path.join(here, 'tournament-shim.js'), 'utf8');
const DECK_SHIM = fs.readFileSync(path.join(here, 'app-shots-shim.js'), 'utf8');

const FIXTURE_CARD_IDS = [
  ...new Set(
    (SHIM.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [])
      .map(q => q.slice(1, -1))
      .filter(id => !id.startsWith('dddddddd') && !id.startsWith('00000000'))
  ),
  CARD_PAGE_ID,
];

/* ------------------------------------------------------------ mat artwork */

/**
 * The cards behind the life counter's five colour mats.
 *
 * `useMatArt` asks for all of them in one `name in (…)`. When that times out
 * the counter falls back to its CSS mats — correct behaviour in the app and
 * WRONG in a published screenshot, because it would publish the degraded render
 * as if it were the normal one. Candidate names are read out of
 * `src/components/life/mats.ts` rather than copied; which candidate wins for
 * which colour is still decided by the app's own code.
 */
const MAT_CANDIDATES = (() => {
  const source = fs.readFileSync('src/components/life/mats.ts', 'utf8');
  const names = new Set();
  for (const line of source.match(/art:\s*\[[^\]]*\]/g) ?? []) {
    for (const quoted of line.match(/'[^']+'|"[^"]+"/g) ?? []) names.add(quoted.slice(1, -1));
  }
  return [...names];
})();

/* ------------------------------------------------------------ the decklist */

/**
 * A real Commander decklist, from the same edge function `/precons` calls.
 *
 * Resolved through `cards_unique`: the decklist cites printings, a third of
 * which the local table does not hold, and a name lookup against `cards` would
 * return every printing of every name. One row per card is what a decklist
 * means.
 */
async function loadPreconDeck() {
  const list = await getJSON(`${FUNCTIONS}/fetch-precons?action=list`);
  const item = (list?.precons ?? []).find(p => p.name === PRECON && !/Collector/.test(p.id));
  if (!item) throw new Error(`no precon named "${PRECON}"`);

  const deck = await getJSON(
    `${FUNCTIONS}/fetch-precons?action=get&deck=${encodeURIComponent(item.id)}`
  );
  const names = deck.cards.map(c => c.card_name);
  const rows = await cardsWhereIn('cards_unique', 'name', names);

  const byName = new Map(rows.map(row => [row.name.toLowerCase(), row]));
  const resolved = deck.cards
    .map(card => {
      const row = byName.get(card.card_name.toLowerCase());
      return row
        ? {
            card_id: row.id,
            card_name: row.name,
            quantity: card.quantity,
            is_commander: Boolean(card.is_commander),
          }
        : null;
    })
    .filter(Boolean);

  const missing = deck.cards.length - resolved.length;
  log(
    `  decklist: ${item.name} (${item.set}) — ${resolved.length} of ${deck.cards.length} cards resolved` +
      (missing ? `, ${missing} not in the catalogue and dropped` : '')
  );

  return { deckId: DECK_ID, name: item.name, rows: resolved, cards: rows };
}

log('reading real rows');
const fixtureCards = await cached('fixture-cards', () =>
  cardsWhereIn('cards', 'id', FIXTURE_CARD_IDS)
);
const matCards = await cached('mat-art', () =>
  /* `cards_unique`, not `cards`: a name lookup against `cards` returns every
     printing of every candidate — a thousand rows for twenty pictures, all of
     which then have to be serialised into every page this script opens. */
  cardsWhereIn('cards_unique', 'name', MAT_CANDIDATES)
);
const deck = await cached('precon-deck', loadPreconDeck);

/** Everything the browser is allowed to answer a `cards` request from. */
const CARD_ROWS = [...new Map([...fixtureCards, ...matCards, ...deck.cards].map(r => [r.id, r])).values()];
const EVENTS = buildEvents(new Map(CARD_ROWS.map(r => [r.id, r]))).all;
log(`  ${CARD_ROWS.length} distinct card rows in hand\n`);

/* -------------------------------------------------------------------------- */
/* The harness                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A dev-only entry that mounts the REAL pages — not copies — with the providers
 * `App.tsx` gives them, inside the same shell `App.tsx` builds, and without the
 * auth gate. Written here rather than committed because a page that renders the
 * app without a session should not be a file that ships; Vite's build input is
 * `index.html` alone, so it is never bundled either way.
 *
 * `?chrome=1` wraps the page in `TopNavigation` + `LeftNavigation` exactly as
 * `App.tsx` does. That is the difference between a picture of a page and a
 * picture of the app, and it is why these shots read as in-app screens. `/play`
 * and `/life` in a game are `fixed inset-0` overlays that cover the shell in
 * the real product too, so they are shot without it.
 */
const HARNESS_HTML = 'app-shots-harness.html';
const HARNESS_ENTRY = 'src/dev/__appShotsHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>App shots</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness. Written by scripts/app-shots.mjs.
 * Not shipped, not routed, not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import { TopNavigation } from '../components/navigation/TopNavigation';
import { LeftNavigation } from '../components/navigation/LeftNavigation';
import Tournament from '../pages/Tournament';
import LifeCounter from '../pages/LifeCounter';
import DeckInterface from '../pages/DeckInterface';
import DeckBuilder from '../pages/DeckBuilder';
import Collection from '../pages/Collection';
import CardDetail from '../pages/CardDetail';
import Play from '../pages/Play';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const search = new URLSearchParams(location.search);
const start = search.get('route') || '/collection';
const chrome = search.get('chrome') === '1';

/* The signed-in shell, copied from App.tsx so the picture has the app's own
   header and rail around it rather than a bare page on a black field. */
function Shell({ children }: { children: React.ReactNode }) {
  if (!chrome) return <>{children}</>;
  return (
    <div className="min-h-screen bg-background overflow-x-hidden max-w-full">
      <div className="fixed top-0 left-0 right-0 z-50">
        <TopNavigation />
      </div>
      <div className="flex pt-16 md:pt-16">
        <div className="hidden md:block fixed left-0 top-16 bottom-0 z-40">
          <LeftNavigation />
        </div>
        <main
          id="main-content"
          className="flex-1 min-h-[calc(100vh-4rem)] w-full max-w-full md:ml-[var(--nav-rail-w)] pb-1 md:pb-4 transition-[margin] duration-200"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[start]}>
            <Shell>
              <Routes>
                <Route path="/tournament" element={<Tournament />} />
                <Route path="/life" element={<LifeCounter />} />
                <Route path="/play" element={<Play />} />
                <Route path="/deck/:id" element={<DeckInterface />} />
                <Route path="/deck-builder" element={<DeckBuilder />} />
                <Route path="/collection" element={<Collection />} />
                <Route path="/cards/:id" element={<CardDetail />} />
                <Route path="*" element={<Collection />} />
              </Routes>
            </Shell>
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`
);

/* -------------------------------------------------------------------------- */
/* The scenes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One picture the homepage could use.
 *
 *   route   — what the app is asked for
 *   chrome  — draw the app's header and rail around it
 *   ready   — text that proves the right page drew, not a skeleton
 *   act     — drive the page to the state worth photographing
 *   anchor  — scroll until this text sits near the top, for pages whose best
 *             part is below the fold. Text rather than pixels, so the framing
 *             survives the page growing a row.
 *   settle  — extra ms before the shutter, for pages that animate in
 *   caption — what this screen is, carried into the manifest so whoever wires
 *             it up does not have to guess
 */
const SCENES = [
  {
    key: 'collection',
    route: '/collection',
    chrome: true,
    ready: 'Collection',
    caption: 'A collection with its cards, its value and what each copy is worth.',
  },
  {
    key: 'deck-builder',
    route: `/deck-builder?deck=${DECK_ID}`,
    chrome: true,
    ready: deck.name,
    settle: 3000,
    /* The stats band is the top of this page and the CARDS are the point of it,
       so the shot is framed on the tab bar with the grid under it. */
    anchor: { text: 'Cards', offset: -84 },
    caption: 'The deck builder holding a real 100-card Commander list, grouped, counted and priced.',
  },
  {
    key: 'deck',
    route: `/deck/${DECK_ID}`,
    chrome: true,
    ready: deck.name,
    caption: 'A Commander deck: its commander, its curve, its playability and what it is worth.',
  },
  {
    key: 'card',
    route: `/cards/${CARD_PAGE_ID}`,
    chrome: true,
    ready: 'Praetors',
    settle: 2600,
    caption: 'The card page: the card whole and large, every printed detail, prices and art variants.',
  },
  {
    key: 'tournament',
    route: '/tournament?event=evt-friday',
    chrome: true,
    ready: 'Friday Night Commander',
    caption: 'Round three of a Swiss event, with every seat showing the deck it registered.',
  },
  {
    key: 'tournament-standings',
    route: '/tournament?event=evt-friday',
    chrome: true,
    ready: 'Friday Night Commander',
    act: async tab => pressText(tab, /^Standings$/),
    caption: 'Live standings with DCI tiebreakers and every player’s round-by-round record.',
  },
  {
    key: 'life-counter',
    route: '/life',
    chrome: false,
    ready: 'player game',
    settle: 2500,
    act: playLife,
    caption: 'The life counter mid-game, one panel per seat, each turned to face its player.',
  },
  {
    key: 'play-table',
    route: '/play',
    chrome: false,
    ready: 'player game',
    settle: 2500,
    act: playTable,
    caption: 'A real game in the browser: a mid-game board, the commander in its zone, the hand along the edge.',
  },
];

/* ------------------------------------------------------------ page driving */

/** A button by its visible text, exactly how a player reads it. */
const pressText = (tab, re) =>
  tab.evaluate(src => {
    const el = [...document.querySelectorAll('button')].find(
      b => !b.disabled && new RegExp(src, 'i').test((b.innerText || '').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }, re.source);

/**
 * Dispatched on the element rather than at its coordinates: the play HUD floats
 * over the table and a coordinate click can be swallowed by whatever sits on
 * top. Same helper `play-combat-shots.mjs` settled on.
 */
const pressTitle = (tab, needle) =>
  tab.evaluate(needle => {
    const el = [...document.querySelectorAll('button')].find(e =>
      `${e.getAttribute('title') || ''} ${e.getAttribute('aria-label') || ''}`.includes(needle)
    );
    if (!el) return false;
    el.click();
    return true;
  }, needle);

/**
 * The life counter, mid-game rather than at kick-off.
 *
 * A picture of four seats all reading 40 is a picture of a game that has not
 * started, which is the empty state wearing a coat. So the totals are moved the
 * only way the app allows: by pressing the panels' own minus controls, the same
 * press a player makes. Nothing is written into storage and no number is typed.
 */
async function playLife(tab) {
  if (!(await pressText(tab, /^Start 4-player game$/))) return 'no-start';
  await sleep(2600);

  /* Player -> how many points it has lost. A coherent table: one seat well
     ahead, one under real pressure, two in the middle. */
  const damage = { 'Player 1': 7, 'Player 2': 12, 'Player 3': 3, 'Player 4': 21 };

  for (const [player, points] of Object.entries(damage)) {
    const box = await tab.evaluate(player => {
      const el = [...document.querySelectorAll('button')].find(
        b => (b.getAttribute('aria-label') || '') === `${player}: lose 1 life`
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, player);
    if (!box) return 'no-lose-control';

    /* Real mouse presses, not synthetic clicks: the panel's first step fires on
       pointer DOWN (see `useHoldRepeat`), so a dispatched click does nothing.
       This is literally the press a player makes. */
    for (let press = 0; press < points; press += 1) {
      await tab.mouse.click(box.x, box.y, { delay: 20 });
      await sleep(40);
    }
  }

  await sleep(1600);
  return true;
}

/**
 * A real game, driven to a board worth photographing.
 *
 * Straight out of `scripts/play-combat-shots.mjs`: start the table, turn on the
 * shipped free-cast playtest toggle so a board actually assembles inside a
 * screenshot run's patience, then play a land and cast what is castable, for a
 * few turns. Free cast is a control the product ships in its own game menu; it
 * changes what is affordable, not what the cards are.
 */
async function playTable(tab) {
  await pressText(tab, /^Cautious$/);
  await sleep(400);
  if (!(await pressText(tab, /^Start 4-player game$/))) {
    if (!(await pressText(tab, /^Start 2-player game$/))) return 'no-start';
  }
  await sleep(7000);

  await pressTitle(tab, 'Game menu');
  await sleep(1200);
  await pressTitle(tab, 'ignore mana entirely');
  await sleep(700);
  await pressTitle(tab, 'Close the menu');
  await sleep(700);

  const handTitles = () =>
    tab.evaluate(() =>
      [...document.querySelectorAll('button[title]')]
        .map(el => el.getAttribute('title') || '')
        .filter(t => t.includes('Click to preview'))
    );

  const clickHand = title =>
    tab.evaluate(title => {
      const el = [...document.querySelectorAll('button[title]')].find(
        e => e.getAttribute('title') === title
      );
      if (!el) return false;
      el.click();
      return true;
    }, title);

  const railEnabled = label =>
    tab.evaluate(label => {
      const el = [...document.querySelectorAll('button')].find(
        b => (b.innerText || '').trim().toUpperCase() === label.toUpperCase()
      );
      return el ? !el.disabled : null;
    }, label);

  const clickRail = label =>
    tab.evaluate(label => {
      const el = [...document.querySelectorAll('button')].find(
        b => (b.innerText || '').trim().toUpperCase() === label.toUpperCase() && !b.disabled
      );
      if (!el) return false;
      el.click();
      return true;
    }, label);

  for (let turn = 0; turn < 4; turn += 1) {
    const land = (await handTitles()).find(t => t.includes('playable as a land drop'));
    if (land) {
      await clickHand(land);
      await clickRail('Play land');
      await sleep(500);
    }
    for (let cast = 0; cast < 6; cast += 1) {
      const hand = await handTitles();
      let played = false;
      for (const title of hand) {
        if (title.includes('playable as a land drop')) continue;
        await clickHand(title);
        await sleep(250);
        if ((await railEnabled('Cast')) === true) {
          await clickRail('Cast');
          await sleep(700);
          played = true;
          break;
        }
      }
      if (!played) break;
    }
    await clickRail('Close');
    await sleep(400);
    if (turn < 3) {
      await pressText(tab, /^END TURN$/);
      await sleep(6000);
    }
  }

  /* Land on the table view rather than whatever the last click left focused. */
  await pressTitle(tab, 'Table');
  await sleep(1200);
  return true;
}

/* -------------------------------------------------------------------------- */
/* The shoot                                                                  */
/* -------------------------------------------------------------------------- */

const browser = await puppeteer.launch({
  headless: 'new',
  // A board of thirty-odd Scryfall images makes captureScreenshot slow enough
  // to trip the default 30s protocol timeout on a cold cache.
  protocolTimeout: 240000,
  // Subpixel antialiasing draws coloured fringes on thin type over charcoal and
  // reads as a magenta rendering fault that is not there.
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const written = [];

async function capture(scene, width) {
  const height = heightFor(width);
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });

  await tab.evaluateOnNewDocument(
    `window.__dmCards = ${JSON.stringify(CARD_ROWS)};
     window.__dmEvents = ${JSON.stringify(EVENTS)};
     window.__dmDeck = ${JSON.stringify(deck)};`
  );
  await tab.evaluateOnNewDocument(SHIM);
  await tab.evaluateOnNewDocument(TOURNAMENT_SHIM);
  await tab.evaluateOnNewDocument(DECK_SHIM);

  /**
   * No hot reload during the run.
   *
   * Other agents edit this tree while this runs, and every save made Vite push a
   * full reload: the page re-mounted mid-run and the shutter caught an empty
   * root. Blocking `/@vite/client` outright was tried and is wrong — the React
   * refresh preamble comes through that same client, so the app never mounts.
   * Taking away the socket it would listen on leaves every module exactly as it
   * normally is. Lifted from `scripts/storage-shots.mjs`.
   */
  await tab.evaluateOnNewDocument(() => {
    class DeafSocket {
      constructor() {
        this.readyState = 3; // CLOSED
      }
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    window.WebSocket = DeafSocket;
  });

  tab.on('pageerror', e => log('    [pageerror]', e.message.slice(0, 150)));

  const url =
    `${BASE}/${HARNESS_HTML}?route=${encodeURIComponent(scene.route)}` +
    `&chrome=${scene.chrome ? 1 : 0}`;

  /* Reload until the page has drawn. A dev server shared with other agents will
     serve a 500 for one module mid-save, which leaves an empty root. */
  let drawn = false;
  for (let attempt = 1; attempt <= 4 && !drawn; attempt += 1) {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let waited = 0; waited < 30000; waited += 500) {
      await sleep(500);
      try {
        const state = await tab.evaluate(() => ({
          text: document.body.innerText,
          skeletons: document.querySelectorAll('.animate-pulse').length,
        }));
        const settled = state.skeletons === 0 || waited >= 18000;
        if (state.text.includes(scene.ready) && settled && waited >= 2500) {
          drawn = true;
          break;
        }
      } catch {
        /* Vite reloaded under the evaluate. Look again. */
      }
    }
    if (!drawn) log(`    nothing drawn on attempt ${attempt}, reloading`);
  }

  if (!drawn) {
    log(`    [${scene.key} ${width}] page never drew; not writing an image`);
    await tab.close();
    return false;
  }

  if (scene.anchor) {
    const found = await tab.evaluate(({ text, offset }) => {
      const match = [...document.querySelectorAll('button, h2, h3, [role="tablist"]')].find(el =>
        (el.textContent || '').trim().startsWith(text)
      );
      if (!match) return false;
      const top = match.getBoundingClientRect().top + window.scrollY + (offset || 0);
      window.scrollTo({ top, behavior: 'instant' });
      return true;
    }, scene.anchor);
    if (!found) {
      log(`    [${scene.key} ${width}] no "${scene.anchor.text}" to frame on; not writing an image`);
      await tab.close();
      return false;
    }
    await sleep(900);
  }

  if (scene.act) {
    const result = await scene.act(tab);
    if (result !== true && result !== undefined) {
      log(`    [${scene.key} ${width}] could not reach the state to photograph (${result}); not writing an image`);
      await tab.close();
      return false;
    }
    await sleep(1200);
  }

  /* Images arrive a beat after the text and `CardImage` fades its blur-up
     placeholder out. Waiting on decode rather than on a guess. */
  try {
    await tab.evaluate(async () => {
      const images = [...document.images].filter(i => !i.complete);
      await Promise.all(images.map(i => i.decode().catch(() => {})));
    });
  } catch {
    /* reloaded mid-wait; the settle below still covers it */
  }
  await sleep(scene.settle ?? 1800);

  const file = `${OUT}/${scene.key}-${width}.webp`;
  await tab.screenshot({ path: file, type: 'webp', quality: QUALITY, fullPage: false });
  const bytes = fs.statSync(file).size;
  log(`    wrote ${file}  ${width}x${height}  ${(bytes / 1024).toFixed(0)} KB`);
  written.push({
    scene: scene.key,
    width,
    height,
    bytes,
    file: `/screens/${scene.key}-${width}.webp`,
  });

  await tab.close();
  return true;
}

for (const scene of SCENES) {
  if (ONLY && !ONLY.split(',').includes(scene.key)) continue;
  log(`\n${scene.key}`);
  for (const width of WIDTHS) await capture(scene, width);
}

await browser.close();

/* -------------------------------------------------------------------------- */
/* The manifest                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What was written, when, and how big. `generatedAt` is the thing to check a
 * screenshot's age against: whatever consumes these can pick a width, and a
 * reviewer can tell at a glance whether the pictures predate the last change to
 * the screens they show.
 */
const manifest = {
  generatedAt: new Date().toISOString(),
  script: 'scripts/app-shots.mjs',
  docs: 'docs/overhaul/APP-SCREENSHOTS.md',
  note:
    'Screenshots of the real running app. Every page, card, card image, price and ' +
    'type line is the shipped component tree rendering real catalogue rows. The deck ' +
    'is a Wizards precon decklist. Ownership and the tournament events are fixture, ' +
    'because no anonymous request may be shown a real person’s collection and ' +
    'because events live in the organiser’s own browser.',
  deck: { name: deck.name, cards: deck.rows.length },
  screens: SCENES.filter(scene => written.some(w => w.scene === scene.key)).map(scene => ({
    key: scene.key,
    caption: scene.caption,
    sources: written
      .filter(w => w.scene === scene.key)
      .sort((a, b) => a.width - b.width)
      .map(({ width, height, file }) => ({ width, height, src: file })),
  })),
};

const existing = `${OUT}/manifest.json`;
if (ONLY && fs.existsSync(existing)) {
  /* A one-scene run must not throw away the other scenes' entries. */
  const previous = JSON.parse(fs.readFileSync(existing, 'utf8'));
  const fresh = new Set(manifest.screens.map(s => s.key));
  manifest.screens = [
    ...manifest.screens,
    ...(previous.screens ?? []).filter(s => !fresh.has(s.key)),
  ].sort((a, b) => SCENES.findIndex(s => s.key === a.key) - SCENES.findIndex(s => s.key === b.key));
}

fs.writeFileSync(existing, `${JSON.stringify(manifest, null, 2)}\n`);
log(`\nwrote ${existing}  (${manifest.screens.length} screens, ${written.length} files)`);

const shot = new Set(written.map(w => w.scene));
const missing = SCENES.filter(s => !shot.has(s.key) && (!ONLY || ONLY.split(',').includes(s.key)));
if (missing.length > 0) log(`NOT captured: ${missing.map(s => s.key).join(', ')}`);

process.exit(0);
