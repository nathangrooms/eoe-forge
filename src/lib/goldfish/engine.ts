/**
 * Solo goldfish engine.
 *
 * `/simulate` used to run `StepSimulator` — a two-player AI-vs-AI match hardcoded
 * to `player1`/`player2`, duplicating the multiplayer engine in `src/lib/game`
 * that `/play` owns. This replaces it with the thing a playtest tab is actually
 * for and that nothing else in the product does: **goldfishing a single list** —
 * draw, mulligan, and see how the deck unfolds against no opposition.
 *
 * Everything here is derived from the real `cards` rows in the deck. Nothing is
 * asserted that is not counted:
 *
 * - Mana is counted from the untapped sources on the battlefield, with colour
 *   requirements checked against what those sources actually produce (parsed
 *   from the basic land types and from `Add {…}` in the oracle text).
 * - Opening-hand statistics are solved exactly over the real library
 *   composition, not sampled and not guessed.
 * - The engine deliberately does NOT implement the stack, triggers, targeting or
 *   activated abilities. A goldfish answers "does this list function on curve",
 *   and every surface that shows a number here says which one it is.
 *
 * The opening-hand statistics below are the one exception to "everything here
 * is its own": they come from `engine/playability/opening.ts`, which is the
 * product's only implementation of that arithmetic. See `openingHandStats`.
 */

/* Relative and extensioned, like `lib/deck/powerAdapter.ts`, so `node --test`
   can import this module without a path-alias resolver. */
import { OPENING_HAND, openingLandDistribution } from '../../engine/playability/opening.ts';

/** Raw `cards` row plus an instance id, handed straight to `<CardImage>`. */
export interface GoldfishCard {
  uid: string;
  id: string;
  name: string;
  type_line: string;
  mana_cost: string | null;
  cmc: number;
  oracle_text: string | null;
  colors: string[];
  color_identity: string[];
  power: string | null;
  toughness: string | null;
  /** The whole row, so `CardImage` can pick a resolution and flip DFCs. */
  row: any;
}

export type Rng = () => number;

/** Deterministic PRNG so a seed reproduces a game exactly. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(input: readonly T[], rng: Rng): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof COLORS)[number];

export function toGoldfishCard(row: any, uid: string): GoldfishCard {
  return {
    uid,
    id: String(row?.id ?? uid),
    name: String(row?.name ?? 'Unknown card'),
    type_line: String(row?.type_line ?? ''),
    mana_cost: row?.mana_cost ?? null,
    cmc: Number(row?.cmc ?? 0) || 0,
    oracle_text: row?.oracle_text ?? null,
    colors: Array.isArray(row?.colors) ? row.colors : [],
    color_identity: Array.isArray(row?.color_identity) ? row.color_identity : [],
    power: row?.power ?? null,
    toughness: row?.toughness ?? null,
    row,
  };
}

export const isLand = (c: GoldfishCard) => /\bLand\b/i.test(c.type_line);
export const isCreature = (c: GoldfishCard) => /\bCreature\b/i.test(c.type_line);
export const isPermanent = (c: GoldfishCard) =>
  /\b(Creature|Artifact|Enchantment|Planeswalker|Land|Battle)\b/i.test(c.type_line);

/**
 * Does this card enter tapped? Read from the oracle text, which is where the
 * game actually says so. A land that enters tapped cannot pay for anything the
 * turn it is played, and pretending otherwise is the single biggest way a
 * goldfish lies to you.
 *
 * Conditional entries — a shockland's "if you don't pay 2 life, it enters
 * tapped", a Snarl's "if you don't reveal…" — are treated as untapped, because
 * the pilot gets to choose and usually does. That choice is stated in the
 * table's footnote rather than hidden here.
 */
export function entersTapped(c: GoldfishCard): boolean {
  const text = (c.oracle_text ?? '').toLowerCase();
  if (!text) return false;
  if (!/enters (the battlefield )?tapped/.test(text)) return false;
  if (/enters (the battlefield )?tapped unless/.test(text)) return false;
  if (/if you don't,[^.]*enters (the battlefield )?tapped/.test(text)) return false;
  return true;
}

/** "Add two mana of any one color" — the number is spelled out, so read it. */
function wordCount(clause: string): number {
  const match = clause.match(/\b(one|two|three|four|five)\b\s+mana/i);
  if (!match) return 1;
  return { one: 1, two: 2, three: 3, four: 4, five: 5 }[match[1].toLowerCase()] ?? 1;
}

/** Mana that has to be paid to activate the ability on this line. */
function activationMana(line: string): number {
  const colon = line.indexOf(':');
  if (colon < 0) return 0;
  const cost = line.slice(0, colon);
  let paid = 0;
  for (const symbol of cost.match(/\{[^}]+\}/g) ?? []) {
    const inner = symbol.slice(1, -1).toUpperCase();
    const numeric = Number(inner);
    if (Number.isFinite(numeric)) paid += numeric;
    else if (/^[WUBRGC]$/.test(inner)) paid += 1;
    // Hybrid still costs a mana (Mystic Gate's {W/U}); Phyrexian is paid in life.
    else if (inner.includes('/')) paid += inner.endsWith('/P') ? 0 : 1;
  }
  return paid;
}

const BASIC_TYPE_COLOR: Record<string, Color> = {
  plains: 'W',
  island: 'U',
  swamp: 'B',
  mountain: 'R',
  forest: 'G',
};

/**
 * Which colours a permanent can produce, read from the card itself.
 *
 * Basic land types come from the type line (a Sacred Foundry is `Land — Mountain
 * Plains` and really does produce RW). Everything else is parsed out of `Add {…}`
 * in the oracle text, which covers signets, Sol Ring, talismans and every
 * "add one mana of any colour" fixer.
 */
export function producedColors(c: GoldfishCard): { colors: Set<Color>; any: boolean; amount: number } {
  const colors = new Set<Color>();
  let any = false;
  let amount = 0;

  const line = c.type_line.toLowerCase();
  for (const [type, color] of Object.entries(BASIC_TYPE_COLOR)) {
    if (line.includes(type)) {
      colors.add(color);
      amount = Math.max(amount, 1);
    }
  }

  const text = c.oracle_text ?? '';
  /* One ability per line — that is how oracle text is written, and it is what
     keeps a rider like "Spend this mana only to cast an instant or sorcery
     spell" attached to the ability it restricts. Splitting by sentence instead
     detached the rider and let Great Hall of the Biblioplex, which taps for {C}
     plus a restricted any-colour, cast a white one-drop. */
  for (const line of text.split('\n')) {
    if (!/\badd\b/i.test(line)) continue;
    const clause = line.slice(line.toLowerCase().indexOf('add'));

    /* Restricted mana cannot be counted as general-purpose mana. */
    if (/spend this mana only/i.test(line)) continue;

    const pips = clause.match(/\{[WUBRGC]\}/g) ?? [];
    let clauseAmount = pips.length;

    /* "Add {G} or {U}" is ONE mana of a choice of colours, not two. Splitting
       the alternatives and taking the widest is right for both that and for
       "Add {W}{W}, {U}{U}, or {B}{B}". */
    if (/\bor\b/i.test(clause)) {
      const alternatives = clause.split(/,|\bor\b/i);
      clauseAmount = Math.max(
        1,
        ...alternatives.map(part => (part.match(/\{[WUBRGC]\}/g) ?? []).length)
      );
    }

    if (/any color/i.test(clause)) {
      any = true;
      clauseAmount = Math.max(clauseAmount, wordCount(clause));
    }

    /* A filter land pays to produce. Viridescent Bog reads "{1}, {T}: Add
       {B}{G}" — two mana out, one mana in, so it is worth exactly one, and
       reading only the right-hand side let a three-land board cast a four-drop
       commander on turn four. The activation cost is everything left of the
       colon; {T} and {Q} are not mana and do not count. */
    clauseAmount = Math.max(0, clauseAmount - activationMana(line));

    for (const pip of pips) {
      const symbol = pip.slice(1, -1);
      if (symbol === 'C') continue;
      colors.add(symbol as Color);
    }

    amount = Math.max(amount, clauseAmount);
  }

  // A land with no parseable text still taps for something — Wastes, utility
  // lands, anything our oracle text is missing. Count it as colourless rather
  // than as nothing, so the mana count is not silently short.
  if (amount === 0 && isLand(c)) amount = 1;

  return { colors, any, amount };
}

/** True for anything that can be tapped for mana at all. */
export const producesMana = (c: GoldfishCard) => producedColors(c).amount > 0;

export interface ManaRequirement {
  generic: number;
  /** Coloured pips, e.g. `{ G: 2, W: 1 }`. */
  pips: Partial<Record<Color, number>>;
  /** `{X}` in the cost — goldfished at X = 0. */
  hasX: boolean;
  total: number;
}

export function parseCost(manaCost: string | null | undefined): ManaRequirement {
  const req: ManaRequirement = { generic: 0, pips: {}, hasX: false, total: 0 };
  if (!manaCost) return req;
  const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
  for (const raw of symbols) {
    const symbol = raw.slice(1, -1).toUpperCase();
    if (symbol === 'X' || symbol === 'Y' || symbol === 'Z') {
      req.hasX = true;
      continue;
    }
    const numeric = Number(symbol);
    if (Number.isFinite(numeric)) {
      req.generic += numeric;
      continue;
    }
    // Hybrid and Phyrexian both have an escape hatch; treat them as generic so
    // the goldfish does not refuse a spell it could legally cast.
    if (symbol.includes('/')) {
      const colored = symbol.split('/').find(part => (COLORS as readonly string[]).includes(part));
      if (symbol.endsWith('/P') && colored) {
        req.generic += 0; // Phyrexian — payable with life
        continue;
      }
      if (colored) req.generic += 1;
      continue;
    }
    if ((COLORS as readonly string[]).includes(symbol)) {
      req.pips[symbol as Color] = (req.pips[symbol as Color] ?? 0) + 1;
      continue;
    }
    if (symbol === 'C') req.generic += 1;
  }
  req.total = req.generic + Object.values(req.pips).reduce((a, b) => a + (b ?? 0), 0);
  return req;
}

/** One untapped mana source and what it can make. */
interface Source {
  colors: Set<Color>;
  any: boolean;
  amount: number;
}

/**
 * Can these sources pay this cost?
 *
 * Greedy but correct for the shapes that occur: coloured pips are assigned first
 * to the sources that produce the fewest colours (so a mono-colour land is spent
 * before a five-colour fixer), then generic is paid from whatever is left.
 */
export function canPay(req: ManaRequirement, sources: Source[]): boolean {
  const pool = sources.flatMap(s =>
    Array.from({ length: s.amount }, () => ({ colors: s.colors, any: s.any }))
  );
  if (pool.length < req.total) return false;

  const used = new Set<number>();
  const entries = Object.entries(req.pips) as [Color, number][];
  // Rarest requirement first: a {G}{G}{G} cost must claim green sources before
  // a generic-flexible one takes them.
  entries.sort((a, b) => b[1] - a[1]);

  for (const [color, count] of entries) {
    for (let i = 0; i < (count ?? 0); i++) {
      let pick = -1;
      let pickWidth = Infinity;
      for (let j = 0; j < pool.length; j++) {
        if (used.has(j)) continue;
        const s = pool[j];
        const matches = s.any || s.colors.has(color);
        if (!matches) continue;
        const width = s.any ? 6 : s.colors.size;
        if (width < pickWidth) {
          pickWidth = width;
          pick = j;
        }
      }
      if (pick < 0) return false;
      used.add(pick);
    }
  }

  return pool.length - used.size >= req.generic;
}

/* ------------------------------------------------------------------ *
 * Deck → library
 * ------------------------------------------------------------------ */

export interface DeckList {
  /** Every card in the maindeck, expanded by quantity, commander excluded. */
  library: GoldfishCard[];
  commander: GoldfishCard | null;
}

export function buildDeckList(
  entries: { card_id: string; quantity: number; is_commander: boolean }[],
  rowsById: Map<string, any>
): DeckList {
  const library: GoldfishCard[] = [];
  let commander: GoldfishCard | null = null;
  let n = 0;

  for (const entry of entries) {
    const row = rowsById.get(entry.card_id);
    if (!row) continue;
    if (entry.is_commander && !commander) {
      commander = toGoldfishCard(row, `cmd-${n++}`);
      continue;
    }
    const quantity = Math.max(1, entry.quantity ?? 1);
    for (let i = 0; i < quantity; i++) library.push(toGoldfishCard(row, `c${n++}`));
  }

  return { library, commander };
}

/* ------------------------------------------------------------------ *
 * Opening-hand statistics — computed exactly, not sampled
 * ------------------------------------------------------------------ */

/**
 * How this library's opening seven divides up by land count.
 *
 * ## Why this stopped being a simulation
 *
 * It used to be one: 4,000 partial Fisher-Yates draws over the real library,
 * labelled on screen as "4,000 simulated draws". Two things were wrong with
 * that, and only the second one is obvious.
 *
 * The first is that drawing seven cards from a known library is a
 * hypergeometric and has a closed form. `engine/playability/opening.ts` was
 * written specifically to replace a sampled version of this exact figure on the
 * deck page, and the module header there explains at length why. Sampling it
 * again one tab over reintroduced the thing that was removed.
 *
 * The second is that it produced a SECOND ANSWER to a question the product
 * already answers. The deck page's "Keepable sevens" and this tab's "2 to 5
 * lands" are the same quantity. At 4,000 trials the sampled one carries about
 * three quarters of a percentage point of standard error, so the same deck read
 * differently on the two pages and moved every time the tab was reopened. One
 * implementation, one number: that is the rule the power score is already held
 * to, and there is no reason a playtest tab is exempt from it.
 *
 * The `rng` is therefore gone from this function. Nothing here is random any
 * more, so nothing here needs seeding.
 */
export interface OpeningStats {
  /** True once there are enough cards to draw a hand at all. */
  measured: boolean;
  /** Index = number of lands in the seven, value = share of hands (0–1). */
  landHistogram: number[];
  averageLands: number;
  /** Share of hands with 2–5 lands — the band most EDH lists want to keep. */
  keepableShare: number;
  /** Share of hands with six or seven lands. */
  floodShare: number;
  /** Share of hands with none or one. */
  screwShare: number;
}

export function openingHandStats(library: readonly GoldfishCard[]): OpeningStats {
  const size = library.length;
  const landCount = library.reduce((total, card) => total + (isLand(card) ? 1 : 0), 0);
  const shares = openingLandDistribution(size, landCount);

  if (!shares) {
    return {
      measured: false,
      landHistogram: new Array(8).fill(0),
      averageLands: 0,
      keepableShare: 0,
      floodShare: 0,
      screwShare: 0,
    };
  }

  return {
    measured: true,
    landHistogram: shares,
    /* The mean of a hypergeometric is draws * successes / population, exactly.
       Summing `share * lands` would give the same answer and is what the
       sampled version did; this says where the number comes from. */
    averageLands: (OPENING_HAND * landCount) / size,
    keepableShare: shares.slice(2, 6).reduce((a, b) => a + b, 0),
    screwShare: shares[0] + shares[1],
    floodShare: shares[6] + shares[7],
  };
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

export interface LogEntry {
  turn: number;
  text: string;
  cardUid?: string;
  cardName?: string;
}

export interface GoldfishState {
  turn: number;
  /** How many times the opening hand was thrown back. London mulligan. */
  mulligans: number;
  library: GoldfishCard[];
  hand: GoldfishCard[];
  battlefield: GoldfishCard[];
  graveyard: GoldfishCard[];
  commandZone: GoldfishCard[];
  /** Uids of permanents tapped for mana this turn. */
  tapped: Set<string>;
  /** Turn each permanent arrived — a mana creature is sick the turn it lands. */
  enteredTurn: Record<string, number>;
  landPlayed: boolean;
  /** Times the commander has been cast — drives commander tax. */
  commanderCasts: number;
  log: LogEntry[];
  /** Turn the commander first resolved, or null while it is still in the zone. */
  commanderTurn: number | null;
}

export function newGame(library: GoldfishCard[], commander: GoldfishCard | null, rng: Rng): GoldfishState {
  return {
    turn: 0,
    mulligans: 0,
    library: shuffle(library, rng),
    hand: [],
    battlefield: [],
    graveyard: [],
    commandZone: commander ? [commander] : [],
    tapped: new Set(),
    enteredTurn: {},
    landPlayed: false,
    commanderCasts: 0,
    log: [],
    commanderTurn: null,
  };
}

/** Draw the opening seven. London: always seven, bottom `mulligans` after keeping. */
export function drawOpening(state: GoldfishState, mulligans: number, rng: Rng): GoldfishState {
  const full = shuffle([...state.library, ...state.hand], rng);
  return {
    ...state,
    mulligans,
    hand: full.slice(0, 7),
    library: full.slice(7),
    log: [],
  };
}

/** Keep the hand, putting the chosen cards on the bottom of the library. */
export function keepHand(state: GoldfishState, bottomUids: string[]): GoldfishState {
  const bottom = new Set(bottomUids);
  const kept = state.hand.filter(c => !bottom.has(c.uid));
  const put = state.hand.filter(c => bottom.has(c.uid));
  return {
    ...state,
    hand: kept,
    library: [...state.library, ...put],
    turn: 0,
    log: [
      {
        turn: 0,
        text:
          state.mulligans === 0
            ? 'Kept a seven-card hand.'
            : `Kept after ${state.mulligans} mulligan${state.mulligans === 1 ? '' : 's'}, bottoming ${put.length}.`,
      },
    ],
  };
}

/**
 * Untapped mana sources currently on the battlefield.
 *
 * A creature that arrived this turn is summoning sick and cannot be tapped for
 * mana, which is exactly the difference between a Llanowar Elves that ramps and
 * one that does nothing until next turn.
 */
export function isManaReady(state: GoldfishState, card: GoldfishCard): boolean {
  if (state.tapped.has(card.uid)) return false;
  if (!isCreature(card)) return true;
  return (state.enteredTurn[card.uid] ?? -1) < state.turn;
}

export function availableSources(state: GoldfishState): Source[] {
  return state.battlefield
    .filter(c => isManaReady(state, c))
    .map(c => producedColors(c))
    .filter(s => s.amount > 0)
    .map(s => ({ colors: s.colors, any: s.any, amount: s.amount }));
}

export function availableMana(state: GoldfishState): number {
  return availableSources(state).reduce((sum, s) => sum + s.amount, 0);
}

/** Commander tax: two generic more for each previous cast from the command zone. */
export function costFor(state: GoldfishState, card: GoldfishCard, fromCommandZone: boolean): ManaRequirement {
  const req = parseCost(card.mana_cost);
  if (!fromCommandZone) return req;
  return { ...req, generic: req.generic + state.commanderCasts * 2, total: req.total + state.commanderCasts * 2 };
}

export function canCast(state: GoldfishState, card: GoldfishCard, fromCommandZone = false): boolean {
  if (isLand(card)) return false;
  return canPay(costFor(state, card, fromCommandZone), availableSources(state));
}

/**
 * Spend mana for a cost by tapping real permanents.
 *
 * Returns the uids tapped, or null when the cost cannot be paid. Sources are
 * chosen narrowest-first for exactly the reason {@link canPay} sorts that way.
 */
function paySources(state: GoldfishState, req: ManaRequirement): string[] | null {
  const candidates = state.battlefield
    .filter(c => isManaReady(state, c))
    .map(c => ({ uid: c.uid, ...producedColors(c) }))
    .filter(s => s.amount > 0);

  const units = candidates.flatMap(s =>
    Array.from({ length: s.amount }, () => ({ uid: s.uid, colors: s.colors, any: s.any }))
  );
  if (units.length < req.total) return null;

  const used = new Set<number>();
  const entries = (Object.entries(req.pips) as [Color, number][]).sort((a, b) => b[1] - a[1]);

  for (const [color, count] of entries) {
    for (let i = 0; i < (count ?? 0); i++) {
      let pick = -1;
      let pickWidth = Infinity;
      for (let j = 0; j < units.length; j++) {
        if (used.has(j)) continue;
        const unit = units[j];
        if (!(unit.any || unit.colors.has(color))) continue;
        const width = unit.any ? 6 : unit.colors.size;
        if (width < pickWidth) {
          pickWidth = width;
          pick = j;
        }
      }
      if (pick < 0) return null;
      used.add(pick);
    }
  }

  let generic = req.generic;
  for (let j = 0; j < units.length && generic > 0; j++) {
    if (used.has(j)) continue;
    used.add(j);
    generic--;
  }
  if (generic > 0) return null;

  return [...new Set(Array.from(used).map(j => units[j].uid))];
}

export function castCard(state: GoldfishState, uid: string, fromCommandZone = false): GoldfishState {
  const zone = fromCommandZone ? state.commandZone : state.hand;
  const card = zone.find(c => c.uid === uid);
  if (!card || isLand(card)) return state;

  const req = costFor(state, card, fromCommandZone);
  const paid = paySources(state, req);
  if (!paid) return state;

  const tapped = new Set(state.tapped);
  for (const id of paid) tapped.add(id);

  const resolvesToBattlefield = isPermanent(card);
  const label = fromCommandZone
    ? `Cast ${card.name} from the command zone for ${req.total}`
    : `Cast ${card.name} for ${req.total}`;

  return {
    ...state,
    tapped,
    hand: fromCommandZone ? state.hand : state.hand.filter(c => c.uid !== uid),
    commandZone: fromCommandZone ? state.commandZone.filter(c => c.uid !== uid) : state.commandZone,
    battlefield: resolvesToBattlefield ? [...state.battlefield, card] : state.battlefield,
    enteredTurn: resolvesToBattlefield
      ? { ...state.enteredTurn, [card.uid]: state.turn }
      : state.enteredTurn,
    graveyard: resolvesToBattlefield ? state.graveyard : [...state.graveyard, card],
    commanderCasts: fromCommandZone ? state.commanderCasts + 1 : state.commanderCasts,
    commanderTurn: fromCommandZone && state.commanderTurn === null ? state.turn : state.commanderTurn,
    log: [...state.log, { turn: state.turn, text: label, cardUid: card.uid, cardName: card.name }],
  };
}

export function playLand(state: GoldfishState, uid: string): GoldfishState {
  if (state.landPlayed) return state;
  const card = state.hand.find(c => c.uid === uid);
  if (!card || !isLand(card)) return state;

  const tapped = new Set(state.tapped);
  if (entersTapped(card)) tapped.add(card.uid);

  return {
    ...state,
    hand: state.hand.filter(c => c.uid !== uid),
    battlefield: [...state.battlefield, card],
    enteredTurn: { ...state.enteredTurn, [card.uid]: state.turn },
    landPlayed: true,
    tapped,
    log: [
      ...state.log,
      {
        turn: state.turn,
        text: entersTapped(card) ? `Played ${card.name}, tapped` : `Played ${card.name}`,
        cardUid: card.uid,
        cardName: card.name,
      },
    ],
  };
}

/**
 * Advance to the next turn: untap, draw (never on turn one on the play), reset
 * the land drop. Nothing is cast — casting is either a click or {@link autoPlay}.
 */
export function nextTurn(state: GoldfishState): GoldfishState {
  const turn = state.turn + 1;
  const drawing = turn > 1;
  const drawn = drawing ? state.library[0] : undefined;

  return {
    ...state,
    turn,
    tapped: new Set(),
    enteredTurn: {},
    landPlayed: false,
    library: drawing ? state.library.slice(1) : state.library,
    hand: drawn ? [...state.hand, drawn] : state.hand,
    log: [
      ...state.log,
      { turn, text: turn === 1 ? 'Turn 1. On the play, no draw.' : `Turn ${turn}. Drew ${drawn?.name ?? 'nothing (library empty)'}.` },
    ],
  };
}

/**
 * Play the turn the way a pilot roughly would: land first (untapped land
 * preferred when it lets something be cast this turn), then spells greedily by
 * descending mana value, commander included once it is affordable.
 */
export function autoPlay(state: GoldfishState): GoldfishState {
  let next = state;

  if (!next.landPlayed) {
    const lands = next.hand.filter(isLand);
    if (lands.length > 0) {
      // Prefer an untapped land — a tapped one contributes nothing this turn.
      const preferred = lands.find(l => !entersTapped(l)) ?? lands[0];
      next = playLand(next, preferred.uid);
    }
  }

  // Greedy: the most expensive castable spell first, repeating until nothing is
  // affordable. Highest mana value is the usual goldfish heuristic — it converts
  // the most mana per turn.
  for (let guard = 0; guard < 40; guard++) {
    const commander = next.commandZone[0];
    const options: { uid: string; fromCommandZone: boolean; cmc: number }[] = [];

    for (const card of next.hand) {
      if (isLand(card)) continue;
      if (canCast(next, card, false)) options.push({ uid: card.uid, fromCommandZone: false, cmc: card.cmc });
    }
    if (commander && canCast(next, commander, true)) {
      // The commander goes first when affordable — that is what a pilot does.
      options.push({ uid: commander.uid, fromCommandZone: true, cmc: 99 });
    }

    if (options.length === 0) break;
    options.sort((a, b) => b.cmc - a.cmc);
    const before = next;
    next = castCard(next, options[0].uid, options[0].fromCommandZone);
    if (next === before) break;
  }

  return next;
}

/* ------------------------------------------------------------------ *
 * Deck-level readouts
 * ------------------------------------------------------------------ */

export interface DeckShape {
  total: number;
  lands: number;
  ramp: number;
  creatures: number;
  averageMv: number;
  /** Index 0–7+, counts of nonland cards at that mana value. */
  curve: number[];
}

export function deckShape(library: readonly GoldfishCard[], commander: GoldfishCard | null): DeckShape {
  const all = commander ? [...library, commander] : [...library];
  const nonlands = all.filter(c => !isLand(c));
  const curve = new Array(8).fill(0);
  for (const card of nonlands) curve[Math.min(7, Math.round(card.cmc))]++;

  return {
    total: all.length,
    lands: all.filter(isLand).length,
    ramp: all.filter(c => !isLand(c) && producesMana(c)).length,
    creatures: all.filter(isCreature).length,
    averageMv: nonlands.length ? nonlands.reduce((sum, c) => sum + c.cmc, 0) / nonlands.length : 0,
    curve,
  };
}

/** Lands and mana producers currently in hand — the read a mulligan turns on. */
export function handShape(hand: readonly GoldfishCard[]) {
  const lands = hand.filter(isLand).length;
  const rocks = hand.filter(c => !isLand(c) && producesMana(c)).length;
  const nonlands = hand.filter(c => !isLand(c));
  const cheapest = nonlands.length ? Math.min(...nonlands.map(c => c.cmc)) : 0;
  return {
    lands,
    rocks,
    spells: nonlands.length,
    averageMv: nonlands.length ? nonlands.reduce((sum, c) => sum + c.cmc, 0) / nonlands.length : 0,
    cheapest,
  };
}
