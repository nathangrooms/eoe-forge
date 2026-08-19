/**
 * The fixture tournament events the screenshot scripts photograph.
 *
 * Shared by `tournament-shots.mjs` (the before/after review shots) and
 * `capture-app-screens.mjs` (the images the homepage can use), so the event in
 * a review shot and the event in a published screenshot are the same event.
 *
 * These have to be fixture, and it is worth being exact about why: a tournament
 * in this product lives in `localStorage` on the organiser's own machine, so
 * there is no server-side "real" event anywhere to read. What is NOT fixture is
 * everything a reader can check: the decks are the same fixture library the
 * dashboard shots use, and every commander on them is a real printing whose row
 * and artwork are read from the live `cards` table.
 *
 * Player names are invented and are meant to look invented. They are not the
 * names of any real user.
 */

/** The fixture deck library's ids, matching `scripts/dashboard-shim.js`. */
export const DECK_UUID = i => `dddddddd-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;

/** Real printing ids, the same ones `dashboard-shim.js` names. */
export const COMMANDERS = {
  atraxa: 'd0d33d52-3d28-4635-b985-51e126289259',
  edgar: 'a577ba08-0aa8-45be-aa83-d5078770127c',
  miirym: 'a934590b-5c70-4f07-af67-fbe817a99531',
  yuriko: 'fe9be3e0-076c-4703-9750-2a6b0a178bc9',
  krenko: '824b2d73-2151-4e5e-9f05-8f63e2bdcaa9',
  kaalia: 'e71c8c39-3fbb-4a42-9cf6-b3224f5a56fc',
  prosper: 'd743336e-d5c7-4053-a23d-92ec7581f74e',
  lyra: 'b2abce4d-ef21-4028-8a86-b7d1387bc937',
};

/** `[player, deck index in the shim's library, commander printing, deck name, colours]` */
const SEATS = [
  ['Nathan Reid', 0, COMMANDERS.atraxa, 'Atraxa counters', ['W', 'U', 'B', 'G']],
  ['Priya Shah', 5, COMMANDERS.krenko, 'Krenko goblins', ['R']],
  ['Marcus Webb', 1, COMMANDERS.edgar, 'Edgar Markov vampires', ['W', 'B', 'R']],
  ['Ana Torres', 3, COMMANDERS.miirym, 'Miirym dragons', ['U', 'B', 'G']],
  ['Joel Kim', 4, COMMANDERS.yuriko, 'Yuriko ninjas', ['U', 'B']],
  ['Ffion Davies', 6, COMMANDERS.kaalia, 'Kaalia reanimator', ['W', 'B', 'R']],
  ['Sam Okafor', 7, COMMANDERS.prosper, 'Prosper treasure', ['B', 'R']],
  ['Ines Duarte', 2, COMMANDERS.lyra, 'Angels', ['W']],
];

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

/**
 * Build the events.
 *
 * @param cardsById Map of printing id to the real `cards` row, so a
 *   registration names the commander the catalogue actually holds rather than a
 *   name typed into this file.
 */
export function buildEvents(cardsById) {
  const nameOf = id => cardsById.get(id)?.name ?? null;

  const registration = ([player, deckIndex, cardId, deckName, colors]) => [
    player,
    {
      deckId: DECK_UUID(deckIndex),
      deckName,
      format: 'commander',
      commanderName: nameOf(cardId),
      colors,
    },
  ];

  const swissPlayers = SEATS.slice(0, 6).map(s => s[0]);
  const [nathan, priya, marcus, ana, joel, ffion] = swissPlayers;

  /** A Friday night: two rounds down, the third half reported. */
  const swiss = {
    id: 'evt-friday',
    name: 'Friday Night Commander',
    format: 'swiss',
    gameFormat: 'Commander',
    status: 'in-progress',
    players: swissPlayers,
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
  const bracketPlayers = SEATS.map(s => s[0]);
  const bracket = {
    id: 'evt-store',
    name: 'Store Championship',
    format: 'single-elimination',
    gameFormat: 'Modern',
    status: 'in-progress',
    players: bracketPlayers,
    decks: Object.fromEntries(SEATS.map(registration)),
    dropped: [],
    rounds: [
      {
        number: 1,
        status: 'completed',
        matches: [
          match('b1-0', bracketPlayers[0], bracketPlayers[1], 2, 1, true),
          match('b1-1', bracketPlayers[2], bracketPlayers[3], 0, 2, true),
          match('b1-2', bracketPlayers[4], bracketPlayers[5], 2, 0, true),
          match('b1-3', bracketPlayers[6], bracketPlayers[7], 1, 2, true),
        ],
      },
      {
        number: 2,
        status: 'in-progress',
        matches: [
          match('b2-0', bracketPlayers[0], bracketPlayers[3], 2, 0, true),
          match('b2-1', bracketPlayers[4], bracketPlayers[7], 0, 0, false),
        ],
      },
      { number: 3, status: 'pending', matches: [match('b3-0', 'TBD', 'TBD', 0, 0, false)] },
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

  return { swiss, bracket, setup, all: [swiss, bracket, setup] };
}
