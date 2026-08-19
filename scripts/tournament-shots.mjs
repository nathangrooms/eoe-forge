/**
 * Photograph the real tournament floor, beside the homepage's mock of it.
 *
 * Technique is scripts/dashboard-shots.mjs, which is scripts/play-combat-shots.mjs:
 * a dev-only entry that mounts the REAL page with the providers App.tsx gives it
 * and without the auth gate. No credentials are entered anywhere.
 *
 * Data:
 *   - Every card row and every commander image is READ FROM THE LIVE DATABASE.
 *   - The events themselves are fixture, and they have to be: tournaments live
 *     in `localStorage` on the TO's own machine, so there is no such thing as a
 *     "real" event to read. The fixture is a plausible Friday night: six named
 *     players, a Swiss event two rounds in, and an eight-player bracket.
 *   - The decks the players register come from scripts/dashboard-shim.js, the
 *     same fixture library the dashboard shots use, so the commander art on a
 *     pairing card is a real printing of a real card.
 *
 *   node scripts/tournament-shots.mjs               # every view, both sizes
 *   TAG=after node scripts/tournament-shots.mjs
 *   ONLY=pairings node scripts/tournament-shots.mjs
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT || '.shots/tournament';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const TAG = process.env.TAG || 'before';
const ONLY = process.env.ONLY || '';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HARNESS_HTML = 'tournament-harness.html';
const HARNESS_ENTRY = 'src/dev/__tournamentHarness.tsx';

fs.mkdirSync('src/dev', { recursive: true });
fs.writeFileSync(
  HARNESS_HTML,
  `<!DOCTYPE html>
<html lang="en" class="dark">
  <head><meta charset="UTF-8" /><title>Tournament harness</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${HARNESS_ENTRY}"></script>
  </body>
</html>
`
);

fs.writeFileSync(
  HARNESS_ENTRY,
  `/* Gitignored puppeteer harness for the tournament floor and the homepage's
 * mock of it. Written by scripts/tournament-shots.mjs. Not shipped, not routed,
 * not built. */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import Tournament from '../pages/Tournament';
import TournamentNew from '../pages/TournamentNew';
import LifeCounter from '../pages/LifeCounter';
import { HomeTournaments } from '../components/marketing/HomeTournaments';
import { HomeLifeCounter } from '../components/marketing/HomeLifeCounter';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const start = new URLSearchParams(location.search).get('route') || '/tournament';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[start]}>
            <Routes>
              <Route path="/tournament" element={<Tournament />} />
              <Route path="/tournament/new" element={<TournamentNew />} />
              <Route path="/life" element={<LifeCounter />} />
              {/* The homepage's own modules, mounted alone so the mock and the
                  real page can be photographed at the same width. */}
              <Route path="/mock/tournaments" element={<div className="bg-background"><HomeTournaments /></div>} />
              <Route path="/mock/life" element={<div className="bg-background"><HomeLifeCounter /></div>} />
              <Route path="*" element={<Tournament />} />
            </Routes>
            <Toaster position="top-center" />
          </MemoryRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
`
);

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SHIM = fs.readFileSync(path.join(here, 'dashboard-shim.js'), 'utf8');
const TOURNAMENT_SHIM = fs.readFileSync(path.join(here, 'tournament-shim.js'), 'utf8');

/* -------------------------------------------------------------- card rows */

const CACHE = `${OUT}/cards.json`;
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';
const COLUMNS =
  'id,name,set_code,collector_number,type_line,mana_cost,color_identity,' +
  'rarity,layout,image_uris,faces,prices,is_legendary,oracle_text';

const CARD_IDS = [
  ...new Set(
    (SHIM.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [])
      .map(quoted => quoted.slice(1, -1))
      .filter(id => !id.startsWith('dddddddd') && !id.startsWith('00000000'))
  ),
];

async function loadCardRows() {
  const found = new Map();
  const seed = '.shots/dashboard/cards.json';
  for (const file of [CACHE, seed]) {
    if (found.size >= CARD_IDS.length) break;
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) found.set(row.id, row);
  }
  if (found.size >= CARD_IDS.length) {
    log(`  card rows: ${found.size} from cache`);
    fs.writeFileSync(CACHE, JSON.stringify([...found.values()]));
    return [...found.values()];
  }

  for (const id of CARD_IDS) {
    for (let attempt = 0; attempt < 6 && !found.has(id); attempt += 1) {
      try {
        const res = await fetch(
          `https://udnaflcohfyljrsgqggy.supabase.co/rest/v1/cards?select=${COLUMNS}&id=eq.${id}`,
          { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } }
        );
        if (!res.ok) throw new Error(String(res.status));
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) found.set(id, rows[0]);
        else break;
      } catch {
        await sleep(1200 * (attempt + 1));
      }
    }
  }

  const rows = [...found.values()];
  log(`  card rows: ${rows.length} of ${CARD_IDS.length} read from the database`);
  if (rows.length > 0) fs.writeFileSync(CACHE, JSON.stringify(rows));
  return rows;
}

const CARD_ROWS = await loadCardRows();
const byId = new Map(CARD_ROWS.map(r => [r.id, r]));

/* ------------------------------------------------------------- the events */

/** The fixture library's deck ids, matching scripts/dashboard-shim.js. */
const DECK_UUID = i => `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;

const C = {
  atraxa: 'd0d33d52-3d28-4635-b985-51e126289259',
  edgar: 'a577ba08-0aa8-45be-aa83-d5078770127c',
  miirym: 'a934590b-5c70-4f07-af67-fbe817a99531',
  yuriko: 'fe9be3e0-076c-4703-9750-2a6b0a178bc9',
  krenko: '824b2d73-2151-4e5e-9f05-8f63e2bdcaa9',
  kaalia: 'e71c8c39-3fbb-4a42-9cf6-b3224f5a56fc',
  prosper: 'd743336e-d5c7-4053-a23d-92ec7581f74e',
  lyra: 'b2abce4d-ef21-4028-8a86-b7d1387bc937',
};

/** [player, deck index in the shim's DECKS, commander printing] */
const SEATS = [
  ['Nathan Reid', 0, C.atraxa, 'Atraxa counters', ['W', 'U', 'B', 'G']],
  ['Priya Shah', 5, C.krenko, 'Krenko goblins', ['R']],
  ['Marcus Webb', 1, C.edgar, 'Edgar Markov vampires', ['W', 'B', 'R']],
  ['Ana Torres', 3, C.miirym, 'Miirym dragons', ['U', 'B', 'G']],
  ['Joel Kim', 4, C.yuriko, 'Yuriko ninjas', ['U', 'B']],
  ['Ffion Davies', 6, C.kaalia, 'Kaalia reanimator', ['W', 'B', 'R']],
  ['Sam Okafor', 7, C.prosper, 'Prosper treasure', ['B', 'R']],
  ['Ines Duarte', 2, C.lyra, 'Angels', ['W']],
];

const nameOf = id => byId.get(id)?.name ?? null;

function registration([player, deckIndex, cardId, deckName, colors]) {
  return [
    player,
    {
      deckId: DECK_UUID(deckIndex),
      deckName,
      format: 'commander',
      commanderName: nameOf(cardId),
      colors,
    },
  ];
}

const match = (id, p1, p2, s1, s2, done) => ({
  id,
  player1: p1,
  player2: p2,
  player1Score: done ? s1 : 0,
  player2Score: done ? s2 : 0,
  result: done ? (s1 > s2 ? 'p1' : s2 > s1 ? 'p2' : 'draw') : undefined,
  winner: done ? (s1 > s2 ? p1 : s2 > s1 ? p2 : undefined) : undefined,
  status: done ? 'completed' : 'pending',
});

const SWISS_PLAYERS = SEATS.slice(0, 6).map(s => s[0]);
const [nathan, priya, marcus, ana, joel, ffion] = SWISS_PLAYERS;

/** A Friday night, two rounds down, the third half reported. */
const swiss = {
  id: 'evt-friday',
  name: 'Friday Night Commander',
  format: 'swiss',
  gameFormat: 'Commander',
  status: 'in-progress',
  players: SWISS_PLAYERS,
  decks: Object.fromEntries(SEATS.slice(0, 6).map(registration)),
  dropped: [],
  rounds: [
    {
      number: 1,
      status: 'completed',
      matches: [
        match('r1-1', nathan, priya, 2, 0, true),
        match('r1-2', marcus, ana, 1, 2, true),
        match('r1-3', joel, ffion, 2, 1, true),
      ],
    },
    {
      number: 2,
      status: 'completed',
      matches: [
        match('r2-1', nathan, ana, 2, 1, true),
        match('r2-2', joel, marcus, 1, 1, true),
        match('r2-3', priya, ffion, 0, 2, true),
      ],
    },
    {
      number: 3,
      status: 'in-progress',
      matches: [
        match('r3-1', nathan, joel, 2, 0, true),
        match('r3-2', ana, ffion, 0, 0, false),
        match('r3-3', marcus, priya, 0, 0, false),
      ],
    },
  ],
  currentRound: 3,
  swissRounds: 3,
  roundLengthMinutes: 50,
  timer: { remainingMs: 14 * 60_000 + 22_000, endsAt: null, running: false },
  createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
};

/** Eight seats, quarter-finals done, semi-finals live. */
const BRACKET_PLAYERS = SEATS.map(s => s[0]);
const bracket = {
  id: 'evt-store',
  name: 'Store Championship',
  format: 'single-elimination',
  gameFormat: 'Modern',
  status: 'in-progress',
  players: BRACKET_PLAYERS,
  decks: Object.fromEntries(SEATS.map(registration)),
  dropped: [],
  rounds: [
    {
      number: 1,
      status: 'completed',
      matches: [
        match('b1-0', BRACKET_PLAYERS[0], BRACKET_PLAYERS[1], 2, 1, true),
        match('b1-1', BRACKET_PLAYERS[2], BRACKET_PLAYERS[3], 0, 2, true),
        match('b1-2', BRACKET_PLAYERS[4], BRACKET_PLAYERS[5], 2, 0, true),
        match('b1-3', BRACKET_PLAYERS[6], BRACKET_PLAYERS[7], 1, 2, true),
      ],
    },
    {
      number: 2,
      status: 'in-progress',
      matches: [
        match('b2-0', BRACKET_PLAYERS[0], BRACKET_PLAYERS[3], 2, 0, true),
        match('b2-1', BRACKET_PLAYERS[4], BRACKET_PLAYERS[7], 0, 0, false),
      ],
    },
    {
      number: 3,
      status: 'pending',
      matches: [match('b3-0', 'TBD', 'TBD', 0, 0, false)],
    },
  ],
  currentRound: 2,
  swissRounds: 3,
  roundLengthMinutes: 50,
  timer: { remainingMs: 50 * 60_000, endsAt: null, running: false },
  createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
};

/** Not started, so the roster is the whole screen. */
const setup = {
  id: 'evt-sunday',
  name: 'Sunday Commander League',
  format: 'swiss',
  gameFormat: 'Commander',
  status: 'setup',
  players: SEATS.slice(0, 5).map(s => s[0]),
  decks: Object.fromEntries(SEATS.slice(0, 3).map(registration)),
  dropped: [],
  rounds: [],
  currentRound: 0,
  swissRounds: 3,
  roundLengthMinutes: 50,
  timer: { remainingMs: 50 * 60_000, endsAt: null, running: false },
  createdAt: new Date().toISOString(),
};

const EVENTS = { populated: [swiss, bracket, setup], empty: [] };

/* ------------------------------------------------------------------ shoot */

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--disable-lcd-text', '--font-render-hinting=none', '--no-sandbox'],
});

const SIZES = [
  ['1680x1050', 1680, 1050],
  ['1280x720', 1280, 720],
];

/**
 * Every view worth a picture.
 *
 *   route  — what the app is asked for
 *   events — which fixture events exist in this browser
 *   tab    — a view-switcher button to press once the page has drawn
 *   ready  — text that proves the right thing rendered
 */
const SCENES = [
  { key: 'pairings', route: '/tournament?event=evt-friday', events: 'populated', ready: 'Round 3' },
  { key: 'standings', route: '/tournament?event=evt-friday', events: 'populated', tab: 'Standings', ready: 'Friday Night Commander' },
  { key: 'players', route: '/tournament?event=evt-friday', events: 'populated', tab: 'Players', ready: 'Friday Night Commander' },
  { key: 'bracket', route: '/tournament?event=evt-store', events: 'populated', tab: 'Bracket', ready: 'Store Championship' },
  { key: 'roster', route: '/tournament?event=evt-sunday', events: 'populated', ready: 'Sunday Commander League' },
  { key: 'empty', route: '/tournament', events: 'empty', ready: 'Tournaments' },
  { key: 'new-event', route: '/tournament/new', events: 'empty', ready: 'event' },
  { key: 'mock-tournaments', route: '/mock/tournaments', events: 'empty', ready: 'Run the pod' },
];

async function capture(scene, [label, width, height], fullPage) {
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });
  await tab.evaluateOnNewDocument(
    `window.__dmCards = ${JSON.stringify(CARD_ROWS)};
     window.__dmEvents = ${JSON.stringify(EVENTS[scene.events])};`
  );
  await tab.evaluateOnNewDocument(SHIM);
  await tab.evaluateOnNewDocument(TOURNAMENT_SHIM);
  tab.on('pageerror', e => log('  [pageerror]', e.message.slice(0, 200)));

  const url = `${BASE}/${HARNESS_HTML}?route=${encodeURIComponent(scene.route)}`;

  /* Reload until the page has drawn. Several agents share this dev server and
     any of them saving a file mid-load makes Vite serve a 500 for one module,
     which leaves an empty root and a screenshot of nothing. */
  let text = '';
  for (let attempt = 1; attempt <= 4 && !text; attempt += 1) {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let waited = 0; waited < 20000; waited += 500) {
      await sleep(500);
      try {
        const drawn = await tab.evaluate(() => ({
          text: document.body.innerText,
          skeletons: document.querySelectorAll('.animate-pulse').length,
        }));
        /* Skeletons gone is the ideal, but one slow query should not cost the
           shot, so after fifteen seconds a drawn page counts as drawn. */
        const settled = drawn.skeletons === 0 || waited >= 15000;
        if (drawn.text.includes(scene.ready) && settled && waited >= 2500) {
          text = drawn.text;
          break;
        }
      } catch {
        /* Vite reloaded under the evaluate. Look again. */
      }
    }
    if (!text) log(`  [${scene.key}] nothing drawn on attempt ${attempt}, reloading`);
  }

  if (scene.tab) {
    try {
      const pressed = await tab.evaluate(name => {
        const button = [...document.querySelectorAll('button')].find(
          b => b.textContent?.trim() === name
        );
        if (!button) return false;
        button.click();
        return true;
      }, scene.tab);
      if (!pressed) log(`  [${scene.key}] no "${scene.tab}" button found`);
      await sleep(1200);
    } catch {
      log(`  [${scene.key}] could not press "${scene.tab}"`);
    }
  }

  await sleep(2500);

  const file = `${OUT}/${TAG}-${scene.key}-${label}${fullPage ? '-full' : ''}.png`;
  await tab.screenshot({ path: file, fullPage });
  log('  shot ->', file);

  try {
    text = await tab.evaluate(() => document.body.innerText);
  } catch {
    /* reloaded between shot and read */
  }
  fs.writeFileSync(`${OUT}/${TAG}-${scene.key}-${label}.txt`, text);

  /* The two things this project keeps regressing on. */
  const emDashes = (text.match(/—/g) || []).length;
  log(`  [${scene.key} ${label}] em-dash x${emDashes}   ${text.length} chars of copy`);

  await tab.close();
}

for (const scene of SCENES) {
  if (ONLY && !ONLY.split(',').includes(scene.key)) continue;
  for (const size of SIZES) {
    await capture(scene, size, false);
  }
  await capture(scene, SIZES[0], true);
}

await browser.close();
process.exit(0);
