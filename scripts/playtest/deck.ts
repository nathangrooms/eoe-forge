/**
 * DeckMatrix playtest harness — seeded random decks.
 *
 * THE TENSION THIS FILE RESOLVES
 * ------------------------------
 * The owner asked for "random seeded decks so there is card variety every
 * time". A pile of 99 uniformly random cards satisfies the word "random" and
 * measures nothing: it has no mana base, casts two spells in twenty turns, and
 * every game ends the same boring way. The variety that matters is variety of
 * CARD BEHAVIOUR the harness gets to observe — equipment, counters, tokens,
 * fliers, auras, planeswalkers — not variety of unplayable cardboard.
 *
 * So the build is random inside a shape. Colour identity, the commander and the
 * specific cards are all drawn from the seed; the shape guarantees a mana base
 * that works and a minimum number of cards from each behaviour bucket, so ten
 * games meet equipment ten times instead of meeting it once by luck.
 *
 * Every choice comes from a seed-derived stream. Same seed, same decklist, on
 * any machine, forever — which is the only thing that makes a finding
 * reproducible rather than anecdotal.
 */

import type { PlayCard, PlayDeck } from '../../src/lib/game/setup.ts';
import type { Format, ManaColor } from '../../src/lib/game/types.ts';
import { makeRng, type Rng } from './rng.ts';
import { BASIC_FOR_COLOR, loadPool, playIdentityOf, type CardPool, type PoolCard, type PoolColor } from './pool.ts';

const COLORS: readonly PoolColor[] = ['W', 'U', 'B', 'R', 'G'];

export type DeckKind = 'commander' | 'sixty';

export interface BuildDeckOptions {
  seed: number;
  kind: DeckKind;
  /** Label used to derive this seat's stream, so seat 2's deck cannot move seat 1's. */
  label?: string;
  pool?: CardPool;
  size?: number;
  landCount?: number;
}

/* -------------------------------------------------------------------------- */
/* Behaviour buckets                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The buckets exist for one reason: the harness's primary signal is a card
 * whose text promises something and whose resolution changed nothing. To find
 * those, games have to keep meeting cards that promise something. Left to pure
 * chance a 61-spell deck is mostly vanilla creatures and the interesting paths
 * — ATTACH, counters, tokens, evasion — turn up once every few games.
 *
 * Each entry is a predicate over the card and a minimum number of slots.
 * Minimums are advisory: if the colour identity genuinely has no equipment the
 * slot is given back to the general pool rather than failing the build.
 */
interface Bucket {
  name: string;
  min: (spellSlots: number) => number;
  match: (card: PoolCard) => boolean;
}

const has = (card: PoolCard, pattern: RegExp): boolean => pattern.test(card.oracleText);

export const BUCKETS: readonly Bucket[] = [
  {
    // Bodies first. Without a board there is no combat, and combat is where
    // most of the engine actually runs.
    name: 'creature',
    min: slots => Math.round(slots * 0.42),
    match: card => card.isCreature,
  },
  {
    // Fliers by name, because "attacking with flyers" was asked for directly.
    name: 'flier',
    min: () => 4,
    match: card => card.isCreature && card.keywords.includes('flying'),
  },
  {
    // ATTACH has no producer anywhere in the app. Every game should carry
    // enough equipment that the gap shows up in the numbers, not in an anecdote.
    name: 'equipment',
    min: () => 3,
    match: card => card.typeLine.includes('Equipment'),
  },
  {
    name: 'aura',
    min: () => 2,
    match: card => card.typeLine.includes('Aura'),
  },
  {
    name: 'counters',
    min: () => 4,
    match: card => has(card, /\+1\/\+1 counter/i),
  },
  {
    name: 'tokens',
    min: () => 4,
    match: card => has(card, /\bcreate\b[^.]*\btoken/i),
  },
  {
    name: 'etb-trigger',
    min: () => 4,
    match: card => has(card, /enters(?: the battlefield)?,/i),
  },
  {
    name: 'instant',
    min: () => 4,
    match: card => card.typeLine.includes('Instant'),
  },
  {
    name: 'sorcery',
    min: () => 3,
    match: card => card.typeLine.includes('Sorcery'),
  },
  {
    name: 'enchantment',
    min: () => 2,
    match: card => card.typeLine.includes('Enchantment') && !card.typeLine.includes('Aura'),
  },
  {
    name: 'artifact',
    min: () => 2,
    match: card => card.typeLine.includes('Artifact') && !card.typeLine.includes('Equipment'),
  },
  {
    name: 'planeswalker',
    min: () => 1,
    match: card => card.typeLine.includes('Planeswalker'),
  },
  {
    name: 'mana-rock',
    // Not for coverage — for function. A deck that can only make mana from
    // lands stumbles, and a stumbling deck plays fewer cards per game.
    min: () => 3,
    match: card => !card.isLand && has(card, /\badds?\b[^.;\n]*\{[WUBRGC]\}/i),
  },
];

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/** Cards inside an identity: every pip and every identity symbol is available. */
function withinIdentity(card: PoolCard, identity: readonly PoolColor[]): boolean {
  return card.colorIdentity.every(color => identity.indexOf(color) !== -1);
}

/**
 * Cards the harness refuses to put in a deck, and why.
 *
 * This list is short on purpose. Every exclusion is a card the harness will
 * never observe, so an over-eager filter quietly shrinks coverage. These four
 * are excluded because they make the GAME not work, not because they are hard.
 */
function playable(card: PoolCard): boolean {
  // No cost and not a land: suspend-only cards, Evoke-only oddities. The engine
  // charges them their mana value, which is a fiction the harness should not add.
  if (!card.isLand && !card.manaCost) return false;
  // {X} in the cost is charged as zero generic by `mana.ts`, so an X spell is
  // cast for its coloured pips alone. That is an engine finding worth having,
  // but not on a card the deck builder chose forty of.
  if (card.manaCost.includes('{X}') && card.cmc <= 1) return false;
  // Cards whose whole text is about another format's zone.
  if (/\b(companion|sideboard|outside the game)\b/i.test(card.oracleText)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Land base                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A mana base that works, built from the same snapshot as everything else.
 *
 * Mostly basics, because a basic is the one land guaranteed to tap for the
 * colour it says. A minority of non-basics are mixed in for coverage: they are
 * where "enters tapped" lives, and `intrinsic.ts` derives that replacement
 * effect from oracle text, so a game with no non-basic lands never exercises it.
 */
function buildLands(
  pool: CardPool,
  identity: readonly PoolColor[],
  count: number,
  rng: Rng
): PoolCard[] {
  const colors = identity.length > 0 ? identity : (['C'] as unknown as PoolColor[]);

  const nonBasicCandidates = pool.cards.filter(card => {
    if (!card.isLand || card.isBasic) return false;
    if (card.isCreature) return false;
    if (!withinIdentity(card, identity)) return false;
    const produces = playIdentityOf(card, identity);
    if (produces.length === 0) return false; // A fetch taps for nothing. Do not fill a base with them.
    return produces.every(color => identity.indexOf(color) !== -1);
  });

  const nonBasicTarget = Math.min(nonBasicCandidates.length, Math.round(count * 0.25));
  const chosen: PoolCard[] = rng.sample(nonBasicCandidates, nonBasicTarget);

  const basicsByName = new Map<string, PoolCard>();
  for (const card of pool.cards) {
    if (!card.isBasic) continue;
    if (!basicsByName.has(card.name)) basicsByName.set(card.name, card);
  }

  const wanted =
    identity.length > 0
      ? identity.map(color => BASIC_FOR_COLOR[color])
      : ['Wastes'];
  const basicList = wanted.map(name => basicsByName.get(name)).filter((c): c is PoolCard => Boolean(c));

  if (basicList.length === 0) {
    throw new Error(
      `No basic lands in the snapshot for ${colors.join('') || 'colourless'}. ` +
        `A deck without lands cannot be played, so this build fails loudly rather than dealing one.`
    );
  }

  // Round-robin the basics so a two-colour deck gets both, not nineteen Forests.
  for (let i = chosen.length; i < count; i++) chosen.push(basicList[i % basicList.length]);
  return rng.shuffle(chosen).slice(0, count);
}

/* -------------------------------------------------------------------------- */
/* Spells                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The curve. Weighted towards the cheap end so something happens before turn
 * six: measured across early harness runs, a flat curve produced games where
 * both seats sat on four lands holding six-drops.
 */
const CURVE_WEIGHT: Record<number, number> = { 1: 5, 2: 7, 3: 6, 4: 4, 5: 3, 6: 2, 7: 1 };

function curveScore(card: PoolCard, rng: Rng): number {
  const bucket = Math.max(1, Math.min(7, Math.round(card.cmc)));
  return (CURVE_WEIGHT[bucket] ?? 1) * (0.5 + rng.next());
}

interface SpellPick {
  cards: PoolCard[];
  /** Which bucket minimums were met, for the run report. */
  buckets: Record<string, number>;
  /** Buckets the identity could not fill. Not an error, but worth printing. */
  unfilled: string[];
}

function chooseSpells(
  pool: CardPool,
  identity: readonly PoolColor[],
  slots: number,
  rng: Rng,
  exclude: Set<string>,
  copiesAllowed: number
): SpellPick {
  const candidates = pool.cards.filter(
    card =>
      !card.isLand &&
      playable(card) &&
      card.cmc >= 1 &&
      card.cmc <= 7 &&
      withinIdentity(card, identity) &&
      !exclude.has(card.name)
  );

  const chosen: PoolCard[] = [];
  const used = new Set<string>();
  const buckets: Record<string, number> = {};
  const unfilled: string[] = [];

  const take = (card: PoolCard): void => {
    chosen.push(card);
    used.add(card.name);
  };

  // Bucket minimums first, cheapest-weighted inside each bucket.
  for (const bucket of BUCKETS) {
    const want = Math.min(bucket.min(slots), Math.max(0, slots - chosen.length));
    if (want <= 0) continue;

    const matching = candidates.filter(card => !used.has(card.name) && bucket.match(card));
    if (matching.length === 0) {
      unfilled.push(bucket.name);
      continue;
    }

    const ranked = matching
      .map(card => ({ card, score: curveScore(card, rng) }))
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.card);

    const got = ranked.slice(0, want);
    for (const card of got) take(card);
    buckets[bucket.name] = got.length;
    if (got.length < want) unfilled.push(bucket.name);
  }

  // Then fill the rest at random, on curve.
  const rest = candidates.filter(card => !used.has(card.name));
  const ranked = rest
    .map(card => ({ card, score: curveScore(card, rng) }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.card);

  let cursor = 0;
  while (chosen.length < slots && cursor < ranked.length) take(ranked[cursor++]);

  // A 60-card list plays multiples. Duplicates are their own test: two copies
  // of one card on the battlefield is where a "spawning duplicates" bug lives.
  if (copiesAllowed > 1 && chosen.length > 0) {
    const duplicateTarget = Math.round(slots * 0.45);
    const seeds = rng.shuffle(chosen).slice(0, Math.ceil(duplicateTarget / (copiesAllowed - 1)));
    const withCopies: PoolCard[] = chosen.slice(0, Math.max(1, slots - duplicateTarget));
    let i = 0;
    while (withCopies.length < slots && seeds.length > 0) {
      withCopies.push(seeds[i % seeds.length]);
      i += 1;
    }
    return { cards: withCopies.slice(0, slots), buckets, unfilled };
  }

  return { cards: chosen.slice(0, slots), buckets, unfilled };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

function toPlayCard(card: PoolCard, identity: readonly PoolColor[]): PlayCard {
  return {
    cardId: card.id,
    name: card.name,
    manaCost: card.manaCost || undefined,
    cmc: card.cmc,
    typeLine: card.typeLine,
    power: card.power,
    toughness: card.toughness,
    // CR 306.5b — without it a planeswalker enters on 0 loyalty and every
    // minus ability is unaffordable forever. See `PoolCard.loyalty`.
    loyalty: card.loyalty,
    // The rewrite `mana.ts` depends on. See the header of `pool.ts`.
    colorIdentity: playIdentityOf(card, identity) as ManaColor[],
    keywords: card.keywords,
    // Always a string. Absent would mean "never loaded" to the engine, and the
    // harness's whole measurement is about what a card's text promised.
    oracleText: card.oracleText,
  };
}

export interface BuiltDeck {
  deck: PlayDeck;
  identity: PoolColor[];
  buckets: Record<string, number>;
  unfilled: string[];
  /** Card names in list order, for the replay log. */
  names: string[];
}

/**
 * Pick a commander. Identity is capped at three colours: a five-colour
 * commander is legal and produces a deck that cannot cast its own spells,
 * which measures the harness's mana base rather than the engine.
 */
function chooseCommander(pool: CardPool, rng: Rng): PoolCard {
  const candidates = pool.cards.filter(
    card =>
      card.isLegendaryCreature &&
      playable(card) &&
      card.cmc >= 2 &&
      card.cmc <= 6 &&
      card.colorIdentity.length >= 1 &&
      card.colorIdentity.length <= 3
  );
  if (candidates.length === 0) throw new Error('No legendary creatures in the snapshot.');
  return rng.pick(candidates);
}

export async function buildDeck(options: BuildDeckOptions): Promise<BuiltDeck> {
  const pool = options.pool ?? (await loadPool());
  const rng = makeRng(options.seed, options.label ?? `deck:${options.kind}`);

  if (options.kind === 'commander') {
    const size = options.size ?? 99;
    const landCount = options.landCount ?? 38;
    const commander = chooseCommander(pool, rng);
    const identity = commander.colorIdentity;

    const lands = buildLands(pool, identity, landCount, rng);
    const spells = chooseSpells(pool, identity, size - landCount, rng, new Set([commander.name]), 1);

    const cards = [...spells.cards, ...lands].map(card => toPlayCard(card, identity));

    return {
      deck: {
        id: `harness-cmd-${options.seed}`,
        name: `${commander.name} (seed ${options.seed})`,
        format: 'commander' as Format,
        cards,
        commanders: [toPlayCard(commander, identity)],
        source: 'seeded',
      },
      identity: [...identity],
      buckets: spells.buckets,
      unfilled: spells.unfilled,
      names: cards.map(c => c.name),
    };
  }

  // A 60-card list. No command zone, twenty life, multiples allowed.
  const size = options.size ?? 60;
  const landCount = options.landCount ?? 24;
  const colorCount = 1 + rng.int(2);
  const identity = rng.sample(COLORS, colorCount);

  const lands = buildLands(pool, identity, landCount, rng);
  const spells = chooseSpells(pool, identity, size - landCount, rng, new Set(), 4);
  const cards = [...spells.cards, ...lands].map(card => toPlayCard(card, identity));

  return {
    deck: {
      id: `harness-60-${options.seed}`,
      name: `${identity.join('') || 'C'} sixty (seed ${options.seed})`,
      format: 'standard' as Format,
      cards,
      commanders: [],
      source: 'seeded',
    },
    identity,
    buckets: spells.buckets,
    unfilled: spells.unfilled,
    names: cards.map(c => c.name),
  };
}
