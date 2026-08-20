/**
 * Ranking lands as lands.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The optimiser used to pick its land candidates with `rankCandidates`, the
 * ranker built for spells, and then hand the top forty to the model. Measured
 * against the live catalogue on 2026-08-20, for the real four-colour Atraxa
 * deck `e0909132-5a48-4416-924c-dd2374d3d34d` (BGUW, 33 lands, 883 ranked
 * lands in identity):
 *
 *   1. Fountainport        2.86    18. Chocobo Camp        2.44
 *   2. Bojuka Bog          2.67    ...
 *   3. Field of Ruin       2.63    40. Flooded Strand      2.33
 *   4. The Gold Saucer     2.60
 *
 *   Command Tower  #438    Exotic Orchard  #478    Breeding Pool  #484
 *   City of Brass  #487    Watery Grave    #838    Path of Ancestry #700
 *
 * The best land in Commander was 438th of 883 in a four-colour deck, and none
 * of the fixing appeared in the forty the model was shown. That is not the
 * model choosing badly; it is the model choosing from a list with no mana
 * fixing in it.
 *
 * The cause is arithmetic, not judgement. The spell ranker's four signals do
 * this to a land:
 *
 *   role gap    every land carries the tag `land`, so every land fills the
 *               land role by the same amount. Identical for all of them.
 *   curve fit   every land is mana value 0. Identical for all of them.
 *   castability `null` — a land has no mana cost, so it is never measured.
 *   tag synergy the only term left that moves, and *a dual land's whole job is
 *               not a tag*. Producing two colours is invisible to the tagger.
 *
 * So the ordering collapses onto "which land has the most gimmick tags", plus
 * an EDHREC tilt that is null for 719 of the 1,194 commander-legal lands in
 * `cards_unique` (measured 2026-08-20). Hallowed Fountain, tags `[land]`,
 * scores 1.49. The Gold Saucer, tags `[card-draw, draw, land, ramp, sac-outlet,
 * sacrifice, sacrifice-outlet, token-maker, tokens, treasure]`, scores 2.60.
 *
 * WHAT THIS SCORES INSTEAD
 * ------------------------
 * The things that make a land good, each measured from data already held:
 *
 *   fixing     how many of the deck's OWN colours the land taps for, FREE,
 *              read out of the oracle text by {@link readLand} — which is a
 *              stricter reading than the castability engine's, and that
 *              header says why. Worth nothing in a mono-colour deck, worth
 *              everything in a four-colour one, and the weight scales that way
 *              on its own rather than by a special case.
 *   scarcity   whether it makes a colour this deck is actually short of, from
 *              the measured `sourcesByColour` of the deck's own mana base.
 *              "You have 6 white sources" is a fact about this deck; a land
 *              that fixes the colour you are starved of beats one that adds a
 *              fifth source of the colour you already have twelve of.
 *   tapped     a land that always enters tapped costs a turn of tempo. A real
 *              cost, so a real penalty — small, because a triome that enters
 *              tapped is still a triome.
 *   utility    the same shared-tag maths the spell ranker uses, kept because
 *              Bojuka Bog in a graveyard deck IS a good pick, but weighted
 *              BELOW fixing so it can no longer bury the mana base.
 *   owned      a land already in the user's collection costs nothing to add.
 *              The owner asked for this explicitly: free is a real advantage.
 *   cost       between two lands that do the same job, the cheaper one is the
 *              better recommendation. Small, logarithmic, and never applied to
 *              a land the user already owns.
 *   popularity the same weak prior, the same decay, the same weight as the
 *              spell ranker. A tilt among equals.
 *
 * WHAT IS MISSING, SAID PLAINLY
 * -----------------------------
 * There is no curated list of good lands in this product. `staples.json` names
 * fast mana, tutors, interaction, card advantage, protection, stax and win
 * conditions, and not one land. So within a tier — "taps for every colour you
 * play, for free, untapped" — the only thing left to separate a Command Tower
 * from a Forgotten Monument is `edhrec_rank`, and that is NULL for 719 of the
 * 1,194 commander-legal lands in `cards_unique` (measured 2026-08-20). Those
 * lands tie on score and sort by name. It is the weakest part of this file and
 * the fix is data, not weights.
 *
 * The weights are a starting position argued from deck-building practice, not
 * fitted to data. There is no labelled data in this product to fit them to and
 * this comment must not imply otherwise. What IS measured is the effect: see
 * the before/after in the module header of `index.ts`.
 *
 * Basics are not ranked here at all. They are filler, and filler is counted by
 * {@link basicFiller}, not recommended.
 *
 * {@link pairLandSwaps} uses the same scorer on the lands the deck ALREADY
 * plays, so "cut this land for that one" is one subtraction between two
 * numbers built the same way, rather than a second opinion that could disagree
 * with the ranking on the screen above it.
 *
 * Pure. No network, no AI.
 */

import {
  ineligibility,
  type CandidateCard,
  type Color,
  type DeckProfile,
} from './_engine/advise/index.ts';
import { sharedTagScore } from './_engine/knowledge/tag-signal.ts';
import type { ManaColour, ManaProfile } from './_engine/playability/castability.ts';
import { isBasicLand, isLandCard } from './validate.ts';

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ */

export const LAND_WEIGHTS = {
  fixing: 3.0,
  scarcity: 2.0,
  utility: 1.2,
  owned: 0.5,
  popularity: 0.8,
  /** Subtracted, not added. */
  entersTapped: 0.6,
  /** Subtracted, not added. Never applied to a land the user already owns. */
  cost: 0.6,
} as const;

/**
 * The price at which the cost penalty is at full strength.
 *
 * Cost is a tie-break, not a verdict, and this is a stated product position
 * rather than a measurement: between two lands that do the same job for this
 * deck, the cheaper one is the better recommendation, because the user has to
 * go and buy it. It is weighted below fixing on purpose — a fetchland is still
 * the right suggestion at $37 — and it is skipped entirely for a land already
 * in the collection, which costs nothing whatever the market says.
 *
 * Logarithmic because the difference between $0.20 and $2 matters more than
 * the difference between $40 and $50.
 */
const COST_CEILING_USD = 50;

/**
 * Sources of one colour below which a deck is short of that colour.
 *
 * Ten. The same figure as `MIN_SOURCES_PER_COLOUR` in the engine's
 * `build/generate.ts`, which the deck generator uses to decide when to top a
 * colour up with basics. It is not exported there, so this is a second copy
 * and the two must be read together: if one moves, move both, or the optimiser
 * and the generator will disagree about when a deck can cast its own cards.
 */
export const MIN_SOURCES_PER_COLOUR = 10;

/**
 * What a fetch land's fixing is worth against a land that just taps for it.
 *
 * A fetch reaches the colour, so it is fixing; it costs a card out of the deck
 * and, for the common ones, brings the land in tapped, so it is not the same
 * as tapping for the colour now. 0.7 is a judgement about that trade, not a
 * measurement, and nothing here should read as though it were.
 */
const FETCH_DISCOUNT = 0.7;

/** Saturation constant for tag synergy. Same value and shape as the spell ranker. */
const SYNERGY_SATURATION = 6;

/** The rank at which the popularity prior has decayed to nothing. Same as the spell ranker. */
const POPULARITY_HORIZON = 25000;

/* ------------------------------------------------------------------ *
 * Reading a land
 * ------------------------------------------------------------------ */

/**
 * Which basic a type line names, or null when it names none.
 *
 * Read off the type line rather than off the name, so `Snow-Covered Island`
 * and any future basic that is not called "Island" still answer correctly.
 */
export function basicColourOf(typeLine: string): ManaColour | 'C' | null {
  if (!/\bBasic\b/i.test(typeLine) || !/\bLand\b/i.test(typeLine)) return null;
  if (/\bPlains\b/i.test(typeLine)) return 'W';
  if (/\bIsland\b/i.test(typeLine)) return 'U';
  if (/\bSwamp\b/i.test(typeLine)) return 'B';
  if (/\bMountain\b/i.test(typeLine)) return 'R';
  if (/\bForest\b/i.test(typeLine)) return 'G';
  if (/\bWastes\b/i.test(typeLine)) return 'C';
  return null;
}

/** A pool land, with the rules text that says what it taps for. */
export interface LandCandidate extends CandidateCard {
  oracleText: string | null;
}

/**
 * Does this land ALWAYS enter tapped?
 *
 * Decided per sentence rather than over the whole text, because the difference
 * between a tapland and a shockland lives inside one sentence:
 *
 *   Temple of Enlightenment  "Temple of Enlightenment enters tapped."
 *   Hallowed Fountain        "As Hallowed Fountain enters, you may pay 3 life.
 *                             If you don't, it enters tapped."
 *   Sunpetal Grove           "Sunpetal Grove enters tapped unless you control
 *                             a Forest or a Plains."
 *
 * All three contain "enters tapped". Only the first is unconditional, and a
 * whole-text search would tax the other two for a cost they usually do not
 * pay. So the sentence carrying the clause is checked for the words that make
 * it conditional, and anything conditional is treated as untapped: the penalty
 * exists to describe a certain cost, and an uncertain one is not that.
 */
/**
 * Can you fill a land slot with this card by putting it on the battlefield?
 *
 * `isLandCard` asks whether the type line contains the word "land", which is
 * the right question for a card the deck already holds and the wrong one for a
 * card being offered to fill a land slot, because a two-faced type line
 * carries both faces:
 *
 *   Dowsing Dagger // Lost Vale        "Artifact — Equipment // Land"
 *   Agadeem's Awakening // Agadeem…    "Sorcery // Land"
 *
 * Dowsing Dagger is a {2} Equipment. It becomes a land only after the creature
 * it is attached to deals combat damage to a player. Casting it does not
 * increase your land count and it cannot be played as a land drop. Measured on
 * 2026-08-20 it was recommended as one of eight lands to a mono-white deck
 * counted as ten lands short.
 *
 * The front face is the one you may play from your hand as a land, so the
 * front face decides. This is deliberately strict about modal double-faced
 * lands too: they are real land drops, but they are a spell first, and a
 * recommendation list that is counted against a land shortfall should only
 * hold cards that are certainly lands. Under-offering costs a suggestion;
 * over-offering costs the reader a land they never gained.
 */
export function playableAsLand(typeLine: string): boolean {
  const front = typeLine.split('//')[0];
  return /\bland\b/i.test(front);
}

export function alwaysEntersTapped(oracleText: string | null | undefined): boolean {
  if (!oracleText) return false;
  for (const sentence of oracleText.split(/(?<=\.)\s+|\n/)) {
    if (!/\benters?\b[^.]{0,60}\btapped\b/i.test(sentence)) continue;
    // Words that make the clause conditional. `unless` covers the check lands
    // and the "unless you control two or fewer other lands" cycle; the pay /
    // if-you-don't pair covers shocks; `if you` covers the rest.
    if (/\bunless\b|\byou may pay\b|\bif you\b|\bchoose\b|\breveal\b/i.test(sentence)) continue;
    return true;
  }
  return false;
}

/**
 * How a land makes its colours.
 *
 * WHY THIS IS NOT `manaSourceFor`
 * -------------------------------
 * The castability engine's reader was the first thing tried here, and it is
 * the right answer to ITS question — "can this deck pay for that card" counts
 * a source as a source whatever hoop it makes you jump through. It is the
 * wrong answer to this one. Measured on the live catalogue for the four-colour
 * Atraxa deck on 2026-08-20, ranking on `manaSourceFor` put these at the top:
 *
 *   1. Evolving Wilds      2. Heap Gate      3. Abstergo Entertainment
 *   7. Castle Doom         9. Escape Tunnel  10. Command Tower
 *
 * Their real text, from `cards_unique`:
 *
 *   Heap Gate      "{T}: Add {C}.  {1}, {T}: Add one mana of any color."
 *   Castle Doom    "{T}: Add one mana of any color. Spend this mana only to
 *                   cast an artifact spell."
 *   Command Tower  "{T}: Add one mana of any color in your commander's colour
 *                   identity."
 *
 * Heap Gate charges {1} for the colour. Castle Doom's colour may only be spent
 * on artifacts. Neither is mana fixing, and both outranked the land that is.
 * So this reads the same text with the distinction the question needs:
 *
 *   free    an untapped tap, no extra cost, no restriction on what the mana
 *           may be spent on. This is what fixing means.
 *   gated   the colour exists but you pay for it — an extra mana, a sacrifice,
 *           a creature — or you may only spend it on one kind of spell. Real,
 *           and not fixing. Scored as nothing here, deliberately.
 *   fetch   it finds another land. Genuinely fixing, at the cost of a card and
 *           usually a tapped land, so it counts at a discount.
 *
 * Paying life is NOT a gate: Mana Confluence is a premium fixer and taxing it
 * for one life would be wrong.
 */
export interface LandReading {
  /** Colours of this deck an untaxed tap produces. */
  free: ManaColour[];
  /** Colours reachable only through a cost or a spending restriction. */
  gated: ManaColour[];
  /** It searches another land out of the library. */
  fetches: boolean;
  /** Colours the fetch can reach. Empty when it does not fetch. */
  fetched: ManaColour[];
  entersTapped: boolean;
}

/**
 * Basic land types and the colour they tap for.
 *
 * The same five pairs the castability engine keys on, which is where the rule
 * comes from: a printed basic land type IS a mana ability, and duals, shocks
 * and triomes carry no other text saying so. `Land — Forest Island` taps for
 * green or blue whether or not the reminder text survived the printing.
 */
const BASIC_TYPE_COLOUR: ReadonlyArray<readonly [RegExp, ManaColour]> = [
  [/\bPlains\b/i, 'W'],
  [/\bIsland\b/i, 'U'],
  [/\bSwamp\b/i, 'B'],
  [/\bMountain\b/i, 'R'],
  [/\bForest\b/i, 'G'],
];

const ALL_FIVE: readonly ManaColour[] = ['W', 'U', 'B', 'R', 'G'];

/** Is this activation cost just tapping, possibly plus life? */
function costIsFree(cost: string): boolean {
  if (!/\{T\}/i.test(cost)) return false;
  const withoutTap = cost.replace(/\{T\}/gi, '');
  // Any remaining mana symbol is a real price.
  if (/\{[0-9XYZWUBRGCS/]+\}/i.test(withoutTap)) return false;
  // Anything you have to give up is a real price. Life is not on this list on
  // purpose — see the header.
  //
  // No trailing `\b`: "Sacrifice" is followed by "e", a word character, so
  // `\bsacrific\b` matched nothing at all and Springjack Pasture — whose only
  // colour comes from "{T}, Sacrifice X Goats" — ranked FIRST of 883 lands on
  // the first run of this file.
  if (/\b(sacrific|exil|discard|remov|tap an|tap another|return|reveal)/i.test(withoutTap)) {
    return false;
  }
  return true;
}

/**
 * Is this activation cost cheap enough for a fetch to count as fixing?
 *
 * Every fetch sacrifices itself, so `costIsFree` rejects all of them and a
 * separate test is needed. What separates Evolving Wilds from Demolition Field
 * is the mana beside the sacrifice:
 *
 *   Evolving Wilds     "{T}, Sacrifice this land: Search your library for a
 *                       basic land card…"
 *   Flooded Strand     "{T}, Pay 1 life, Sacrifice this land: …"
 *   Demolition Field   "{2}, {T}, Sacrifice this land: Destroy target nonbasic
 *                       land an opponent controls. … You may search your
 *                       library for a basic land card…"
 *   Blighted Woodland  "{3}{G}, {T}, Sacrifice this land: Search your library
 *                       for up to two basic land cards…"
 *
 * All four search your own library. Only the first two are mana fixing; the
 * other two are effects that happen to end in a land. Without this test
 * Demolition Field ranked 9th of 883 on the Atraxa deck, credited with four
 * colours of fixing it charges {2} for.
 */
function fetchCostIsAffordable(cost: string): boolean {
  if (!/\{T\}/i.test(cost)) return false;
  const rest = cost.replace(/\{T\}/gi, '');
  return !/\{[0-9XYZWUBRGCS/]+\}/i.test(rest);
}

/**
 * Does this "Add" clause depend on something the deck may not have?
 *
 * Three real wordings, all of which the naive reading treats as five colours:
 *
 *   Reflecting Pool    "any type that a land you control could produce"
 *   Exotic Orchard     "any color that a land an opponent controls could produce"
 *   Plaza of Harmony   "any type that a Gate you control could produce"
 *   Plaza of Heroes    "any color among legendary permanents you control"
 *
 * The first two key off LANDS, which every deck has and this one has 33 of.
 * The last two key off a subtype the deck may hold none of, and this deck
 * holds no Gates. So a "could produce" clause counts as free only when its
 * subject is a land, and "among …" never does.
 */
function isConditionalProduction(clause: string): boolean {
  if (/\bamong\b/i.test(clause)) return true;
  if (/\bcould produce\b/i.test(clause)) return !/\bthat an?\s+lands?\b/i.test(clause);
  return false;
}

/** Colours named by an "Add ..." clause. */
function coloursInAddClause(clause: string): ManaColour[] {
  if (/\bany\s+(?:one\s+)?(?:colou?r|type)\b/i.test(clause)) return [...ALL_FIVE];
  const found = new Set<ManaColour>();
  for (const m of clause.matchAll(/\{([WUBRG])\}/gi)) {
    found.add(m[1].toUpperCase() as ManaColour);
  }
  return ALL_FIVE.filter(c => found.has(c));
}

export function readLand(land: LandCandidate, identity: readonly Color[]): LandReading {
  const inIdentity = new Set(identity as readonly string[]);
  const keep = (colours: readonly ManaColour[]) => colours.filter(c => inIdentity.has(c));

  const free = new Set<ManaColour>();
  const gated = new Set<ManaColour>();

  // 1. Printed basic land types. Definitive, and printed even when the
  //    reminder text is not.
  for (const [re, colour] of BASIC_TYPE_COLOUR) {
    if (re.test(land.typeLine)) free.add(colour);
  }

  const text = land.oracleText ?? '';
  let fetches = false;
  const fetched = new Set<ManaColour>();

  // 2. One ability per line, which is how Scryfall stores them.
  for (const line of text.split('\n')) {
    const add = /^(.*?):\s*Add\b([^]*)$/i.exec(line.replace(/^\(|\)$/g, '').trim());
    if (add) {
      const cost = add[1];
      const clause = add[2];
      // "Spend this mana only to cast a Dragon creature spell" is a colour you
      // cannot use to cast the rest of your deck. Not fixing.
      const restricted = /\bspend this mana only\b/i.test(clause);
      const reliable = costIsFree(cost) && !restricted && !isConditionalProduction(clause);
      const target = reliable ? free : gated;
      for (const colour of coloursInAddClause(clause)) target.add(colour);
    }

    // 3. Fetching. What it searches for is named two ways and both count:
    //    by land type ("a Plains or Island card") or by the word land ("a
    //    basic land card"). Testing only for the word is what put Flooded
    //    Strand 225th and Misty Rainforest 473rd on the first run — the two
    //    premium fetches in the format, read as lands that make nothing.
    //    A fetch that names no type reaches every colour the deck plays,
    //    because that is what its basics are.
    const search = /search your library for an?\s+([^.]*?)\s+card/i.exec(line);
    if (search && fetchCostIsAffordable(line.slice(0, line.indexOf(':') + 1))) {
      let named = false;
      for (const [re, colour] of BASIC_TYPE_COLOUR) {
        if (re.test(search[1])) {
          fetched.add(colour);
          named = true;
        }
      }
      if (named) {
        fetches = true;
      } else if (/\bland\b/i.test(search[1])) {
        fetches = true;
        for (const c of identity as readonly string[]) fetched.add(c as ManaColour);
      }
    }
  }

  // A colour you can have for free is not also a gated colour.
  for (const c of free) gated.delete(c);

  return {
    free: keep([...free].sort((a, b) => ALL_FIVE.indexOf(a) - ALL_FIVE.indexOf(b))),
    gated: keep([...gated].sort((a, b) => ALL_FIVE.indexOf(a) - ALL_FIVE.indexOf(b))),
    fetches,
    fetched: keep([...fetched].sort((a, b) => ALL_FIVE.indexOf(a) - ALL_FIVE.indexOf(b))),
    entersTapped: alwaysEntersTapped(land.oracleText),
  };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export interface LandSignal {
  kind:
    | 'fixing'
    | 'scarcity'
    | 'utility'
    | 'owned'
    | 'popularity'
    | 'enters-tapped'
    | 'cost';
  score: number;
  detail: string;
}

/** What the ranker measured about one land, kept so the UI can show it. */
export interface LandGrounds {
  /**
   * Colours of this deck the land produces for free, in WUBRG order.
   *
   * Free specifically. A colour behind an extra mana or a "spend this only to
   * cast a Dragon" clause is not in here, and the UI must not print it as
   * though it were — see {@link readLand}.
   */
  produces: ManaColour[];
  /** Colours it can reach by fetching another land. */
  fetches: ManaColour[];
  entersTapped: boolean;
  /** Copies in the user's collection. 0 when they own none or sent no collection. */
  ownedQuantity: number;
  usd: number | null;
}

export interface RankedLand {
  card: LandCandidate;
  score: number;
  signals: LandSignal[];
  grounds: LandGrounds;
  /** Assembled from the signals that actually fired. Never model text. */
  reason: string;
}

const COLOUR_NAMES: Record<ManaColour, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

/** "white, blue and green" */
function listColours(colours: readonly ManaColour[]): string {
  const names = colours.map(c => COLOUR_NAMES[c]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function scoreLand(args: {
  land: LandCandidate;
  profile: DeckProfile;
  manaProfile: ManaProfile | null;
  identity: readonly Color[];
  ownedQuantity: number;
}): RankedLand {
  const { land, profile, manaProfile, identity, ownedQuantity } = args;
  const signals: LandSignal[] = [];

  const reading = readLand(land, identity);
  const produces = reading.free;
  const entersTapped = reading.entersTapped;
  const colourCount = identity.length;

  // The colours this deck can actually rely on the land for: what it taps for
  // free, plus what it can go and find. A gated colour is in neither, because
  // "you may have blue for one extra mana" is not a blue source.
  const reliable = [...new Set([...reading.free, ...reading.fetched])].sort();

  /* --- Fixing ------------------------------------------------------- */
  // Producing one colour is what a basic does; the signal starts at the second
  // one. Divided by the colours the deck plays, so a two-colour land is most
  // of the answer in a two-colour deck and a third of it in a four-colour
  // one. A mono-colour deck gets no signal at all, which is right: there is
  // nothing to fix.
  if (colourCount > 1 && produces.length > 1) {
    const share = Math.min(1, (produces.length - 1) / (colourCount - 1));
    signals.push({
      kind: 'fixing',
      score: LAND_WEIGHTS.fixing * share,
      detail: `taps for ${listColours(produces)}`,
    });
  } else if (colourCount > 1 && reading.fetches && reading.fetched.length > 1) {
    // A fetch land reaches the same colours a turn later, for a card and
    // usually a tapped land, so it counts at a discount rather than in full.
    const share = Math.min(1, (reading.fetched.length - 1) / (colourCount - 1));
    signals.push({
      kind: 'fixing',
      score: LAND_WEIGHTS.fixing * FETCH_DISCOUNT * share,
      detail: `fetches ${listColours(reading.fetched)}`,
    });
  }

  /* --- Scarcity ----------------------------------------------------- */
  // Measured from the deck's own mana base, never assumed. No mana profile
  // means no signal rather than a zero, on the same rule the spell ranker
  // applies to castability: unknown is not "you have none".
  if (manaProfile && reliable.length) {
    let deficit = 0;
    const short: ManaColour[] = [];
    for (const colour of reliable) {
      const have = manaProfile.sourcesByColour[colour] ?? 0;
      const gap = MIN_SOURCES_PER_COLOUR - have;
      if (gap > 0) {
        deficit += gap;
        short.push(colour);
      }
    }
    if (deficit > 0) {
      const ceiling = MIN_SOURCES_PER_COLOUR * Math.max(1, colourCount);
      // The sentence names the worst colour only. Listing all of them put the
      // same forty words on every tile in a four-colour deck, which buries the
      // one thing that differs between the suggestions.
      const worst = short.reduce((a, b) =>
        (manaProfile.sourcesByColour[a] ?? 0) <= (manaProfile.sourcesByColour[b] ?? 0) ? a : b
      );
      const also = short.length - 1;
      signals.push({
        kind: 'scarcity',
        score: LAND_WEIGHTS.scarcity * Math.min(1, deficit / ceiling),
        detail:
          `you have only ${manaProfile.sourcesByColour[worst] ?? 0} ${COLOUR_NAMES[worst]} sources` +
          (also > 0 ? ` (and are short of ${also} more of your colours)` : ''),
      });
    }
  }

  /* --- Enters tapped ------------------------------------------------ */
  if (entersTapped) {
    signals.push({
      kind: 'enters-tapped',
      score: -LAND_WEIGHTS.entersTapped,
      detail: 'always enters tapped',
    });
  }

  /* --- Utility ------------------------------------------------------ */
  const raw = sharedTagScore(profile.signalTags, land.tags);
  if (raw > 0) {
    const shared = land.tags.filter(t => profile.signalTags.includes(t));
    signals.push({
      kind: 'utility',
      score: LAND_WEIGHTS.utility * (raw / (raw + SYNERGY_SATURATION)),
      detail: shared.length
        ? `does a job your deck already does (${shared.slice(0, 3).join(', ')})`
        : 'does something besides make mana',
    });
  }

  /* --- Owned, and what it would otherwise cost ---------------------- */
  // These two are one decision, which is why they sit together. A land in the
  // collection is free to the user, so it gets the bonus AND is exempt from
  // the price penalty; there is no sense charging somebody for a card they
  // already have in a box.
  if (ownedQuantity > 0) {
    signals.push({
      kind: 'owned',
      score: LAND_WEIGHTS.owned,
      detail: ownedQuantity > 1 ? `you own ${ownedQuantity}` : 'you already own it',
    });
  } else if (land.usd !== null && land.usd > 0) {
    // Unpriced is unknown, not free: a land with no USD price gets no signal
    // either way rather than the score of a $0 card.
    const share = Math.min(1, Math.log10(1 + land.usd) / Math.log10(1 + COST_CEILING_USD));
    signals.push({
      kind: 'cost',
      score: -LAND_WEIGHTS.cost * share,
      detail: `$${land.usd.toFixed(2)}`,
    });
  }

  /* --- Popularity --------------------------------------------------- */
  if (land.edhrecRank !== null && land.edhrecRank > 0) {
    const decay = Math.max(0, 1 - Math.log(land.edhrecRank) / Math.log(POPULARITY_HORIZON));
    if (decay > 0) {
      signals.push({
        kind: 'popularity',
        score: LAND_WEIGHTS.popularity * decay,
        detail: `played in a lot of decks (EDHREC rank ${land.edhrecRank.toLocaleString('en')})`,
      });
    }
  }

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  // Price is left out of the sentence because the tile already prints it above
  // the reason, and a suggestion that says "$0.24" twice reads as a mistake.
  // The signal itself stays, so the score is still the sum of what is listed.
  const spoken = signals.filter(s => s.kind !== 'cost').map(s => s.detail);
  const reason = spoken.length
    ? spoken.join('; ').replace(/^./, c => c.toUpperCase()) + '.'
    : 'A land, with nothing else measured about it.';

  return {
    card: land,
    score,
    signals,
    grounds: {
      produces,
      fetches: reading.fetched,
      entersTapped,
      ownedQuantity,
      usd: land.usd,
    },
    reason,
  };
}

/**
 * Rank the whole land pool, then truncate.
 *
 * Same order of operations the spell ranker is built on and for the same
 * reason: score everything, sort, and only then slice. `limit` is applied on
 * the last line and nowhere else.
 *
 * Eligibility is the engine's own `ineligibility`, unchanged, so a land that
 * is illegal, off-identity, already in the deck or basic cannot reach the user
 * through this path any more than through the other one.
 */
export function rankLands(args: {
  pool: readonly LandCandidate[];
  profile: DeckProfile;
  manaProfile: ManaProfile | null;
  identity: readonly Color[];
  /** Normalised card name -> copies owned. */
  owned: ReadonlyMap<string, number>;
  normalizeName: (name: string) => string;
  limit?: number;
}): RankedLand[] {
  const { pool, profile, manaProfile, identity, owned, normalizeName } = args;

  // One row per card, whatever the source did. `landPoolFor` reads
  // `cards_unique`, which carries a UNIQUE index on `oracle_id`, so this
  // cannot fire today — it is the guarantee rather than the mechanism, the
  // same relationship `dedupeByOracle` has with the spell pool. Cheapest wins,
  // ties on id, which is the convention the whole repo uses to pick a printing.
  const byOracle = new Map<string, LandCandidate>();
  for (const land of pool) {
    const prev = byOracle.get(land.oracleId);
    if (!prev) {
      byOracle.set(land.oracleId, land);
      continue;
    }
    const prevCost = prev.usd ?? Infinity;
    const cost = land.usd ?? Infinity;
    if (cost < prevCost || (cost === prevCost && land.id < prev.id)) {
      byOracle.set(land.oracleId, land);
    }
  }

  const eligible = [...byOracle.values()].filter(
    land =>
      isLandCard(land) &&
      playableAsLand(land.typeLine) &&
      !isBasicLand(land) &&
      ineligibility(land, profile) === null
  );

  const scored = eligible.map(land =>
    scoreLand({
      land,
      profile,
      manaProfile,
      identity,
      ownedQuantity: owned.get(normalizeName(land.name)) ?? 0,
    })
  );

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.card.name.localeCompare(b.card.name) ||
      a.card.oracleId.localeCompare(b.card.oracleId)
  );

  const limit = args.limit;
  return typeof limit === 'number' && limit >= 0 ? scored.slice(0, limit) : scored;
}

/* ------------------------------------------------------------------ *
 * Trading one land for another
 * ------------------------------------------------------------------ */

/**
 * The two signals that describe BUYING a land rather than playing it.
 *
 * `owned` and `cost` answer "what will this cost you to get", which is the
 * right question for a shopping list and the wrong one for "is this land
 * better than the one already in the deck". A land in the deck was paid for
 * long ago. Comparing a candidate's full score against a deck land's full
 * score would hand the candidate a free half point for sitting in a box, or
 * tax it for being expensive, and neither changes which land plays better.
 */
const ACQUISITION_SIGNALS: ReadonlySet<LandSignal['kind']> = new Set(['owned', 'cost']);

/**
 * How well a land plays in this deck, with the acquisition signals removed.
 *
 * This is the number both sides of a swap are compared on, so the comparison
 * is like for like. The full {@link RankedLand.score} still decides which
 * candidates are offered at all, because when two lands play the same the one
 * you already own is the better recommendation.
 */
export function landFit(ranked: RankedLand): number {
  return ranked.signals.reduce(
    (sum, s) => (ACQUISITION_SIGNALS.has(s.kind) ? sum : sum + s.score),
    0
  );
}

/** Colours this deck can count on a land for: tapped for free, or fetched. */
function coverageOf(grounds: LandGrounds): Set<ManaColour> {
  return new Set<ManaColour>([...grounds.produces, ...grounds.fetches]);
}

/** Everything in `b` is also in `a`. */
function covers(a: ReadonlySet<ManaColour>, b: ReadonlySet<ManaColour>): boolean {
  for (const colour of b) if (!a.has(colour)) return false;
  return true;
}

/**
 * Does this land change what OTHER lands tap for?
 *
 * Urborg, Tomb of Yawgmoth and Yavimaya, Cradle of Growth are the two cards in
 * the format printed on this template, and both are invisible to
 * {@link readLand}: they have no mana ability of their own, so the reader sees
 * a land that taps for nothing and the fit score treats them as the weakest
 * cards in the deck. Measured on the live catalogue on 2026-08-20 for the real
 * four-colour Atraxa deck, that put Yavimaya in the cut list at fit 0.00,
 * offered against Forbidden Orchard.
 *
 * That is not a bad weight, it is an unmeasured card, and the rule the whole
 * file runs on is that unknown is never scored as zero. So a land matching
 * this template is never offered as the card to cut. It can still be
 * RECOMMENDED, where the same silence only costs it a place in the ranking
 * rather than talking a player out of a card that is working.
 *
 * Textual, against the printed Oracle template, not a list of card names.
 * Anything printed on the same template in future is covered by construction.
 * Checked against `cards_unique` on 2026-08-20: 6 commander-legal lands
 * contain "in addition to its other", and only these two are about lands.
 */
export function changesOtherLands(oracleText: string | null | undefined): boolean {
  if (!oracleText) return false;
  return /\beach land is an? [a-z]+ in addition to its other land types\b/i.test(oracleText);
}

/** What one land does, in a phrase, from measurement only. */
function landPhrase(l: RankedLand): string {
  const parts: string[] = [];
  if (l.grounds.produces.length) parts.push(`taps for ${listColours(l.grounds.produces)}`);
  else if (l.grounds.fetches.length) parts.push(`fetches ${listColours(l.grounds.fetches)}`);
  else parts.push('taps for no colour this deck plays');
  if (l.grounds.entersTapped) parts.push('always enters tapped');
  return parts.join(' and ');
}

export interface LandSwap {
  /** The land the deck already plays. */
  out: RankedLand;
  /** The land to play instead. */
  in: RankedLand;
  /** Fit gained, both sides measured on the same signals. */
  gain: number;
  /** Why this land is the weakest link, measured. Never model text. */
  outReason: string;
  /** What actually changes: colours gained, tempo gained or given up. */
  gainNote: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Pair the weakest lands in the deck with the strongest lands it could play.
 *
 * WHY THIS IS NOT ASKED OF THE MODEL
 * ----------------------------------
 * Everything a land swap turns on is already measured. Which colours each side
 * taps for, for free, comes out of {@link readLand} against real oracle text.
 * Whether either enters tapped comes from {@link alwaysEntersTapped}. Which
 * colour the deck is short of sources for comes from the mana profile the
 * power score is built on. There is nothing left for a model to add except a
 * sentence, and a sentence about a mana base is exactly the thing it gets
 * wrong. So the pairing is arithmetic: it runs whether or not the model
 * answered, and every word shipped with it was assembled from a signal that
 * actually fired.
 *
 * TWO RULES, AND WHY EACH ONE EXISTS
 * ----------------------------------
 * **No colour may lose a source.** A swap is only offered when the incoming
 * land covers every colour of this deck the outgoing one covered. Without it
 * a total would happily trade the only red source in the deck for a better
 * white one, because a total does not know that the last source of a colour is
 * not interchangeable with the fifth source of another.
 *
 * **Something concrete has to improve.** The swap must add at least one colour
 * or take away a land that always enters tapped. A pair that is only "higher
 * score" is a rearrangement the user cannot check, and these weights are a
 * starting position argued from deck-building practice, not fitted to data. If
 * it cannot be said in plain words what gets better, it is not offered.
 *
 * A LAND THE DECK RUNS MORE THAN ONE OF IS NEVER CUT
 * --------------------------------------------------
 * This one is a safety rule about how a swap is applied, not about how a land
 * plays, and it is why "cut a Forest for Command Tower" is not offered even
 * though it is the best-known land upgrade in the format.
 *
 * A swap leaves this function as a pair of NAMES. Of the three screens that
 * apply one, the deck builder decrements the row's quantity, which is right;
 * the generated-deck screen in `AIBuilder` replaces the row and carries its
 * quantity across, which turns "cut a Forest" on a deck running three of them
 * into three copies of the incoming land. In Commander that is an illegal deck
 * and its own save gate refuses it.
 *
 * A name is not enough information to remove one copy of three, so a swap only
 * ever names a card the deck holds exactly one of. What a land-heavy deck
 * should do with its basics is already answered, and answered better, by
 * {@link basicFiller}: a count, not a trade.
 *
 * `allowBasicCuts` is the second, softer half of the same subject: even a
 * single basic is not worth trading while an empty slot is already earmarked
 * for a land, because then cutting a Forest to play Command Tower is a worse
 * version of simply adding Command Tower.
 *
 * Pure. Same inputs, same pairs, every time.
 */
/** One land the deck plays, and how many copies of it. */
export interface DeckLand {
  land: LandCandidate;
  /** Copies in the deck. Anything above one is never offered as a cut. */
  quantity: number;
}

export function pairLandSwaps(args: {
  /** Lands the deck plays, with their rules text and their copy count. */
  deckLands: readonly DeckLand[];
  /** Ranked pool lands, best first. Already free of anything in the deck. */
  candidates: readonly RankedLand[];
  profile: DeckProfile;
  manaProfile: ManaProfile | null;
  identity: readonly Color[];
  owned: ReadonlyMap<string, number>;
  normalizeName: (name: string) => string;
  /** May a basic land be the card cut? False while the deck is short of lands. */
  allowBasicCuts: boolean;
  /** Candidates already recommended as a plain add, by normalised name. */
  skipIn?: ReadonlySet<string>;
  /** Deck lands already recommended for removal, by normalised name. */
  skipOut?: ReadonlySet<string>;
  limit?: number;
  /** The least fit a pair must gain to be worth a user's attention. */
  minGain?: number;
}): LandSwap[] {
  const {
    deckLands,
    candidates,
    profile,
    manaProfile,
    identity,
    owned,
    normalizeName,
    allowBasicCuts,
  } = args;
  const skipIn = args.skipIn ?? new Set<string>();
  const skipOut = args.skipOut ?? new Set<string>();
  const limit = args.limit ?? 6;
  const minGain = args.minGain ?? 0.5;

  // Score the deck's own lands with the same function the pool is scored with.
  // One entry per distinct land: a deck running eight Forests is offered one
  // Forest to trade, not eight identical rows.
  const seen = new Set<string>();
  const held: Array<{ land: RankedLand; fit: number }> = [];
  for (const { land, quantity } of deckLands) {
    const key = normalizeName(land.name);
    if (!key || seen.has(key) || skipOut.has(key)) continue;
    seen.add(key);
    // A swap names one card. Naming a card the deck holds three of does not
    // say which copy, and one of the three screens that apply a swap takes the
    // whole row. See the header.
    if (quantity > 1) continue;
    if (isBasicLand(land) && !allowBasicCuts) continue;
    // Unmeasured, not weak. See `changesOtherLands`.
    if (changesOtherLands(land.oracleText)) continue;
    const ranked = scoreLand({
      land,
      profile,
      manaProfile,
      identity,
      ownedQuantity: owned.get(key) ?? 0,
    });
    held.push({ land: ranked, fit: landFit(ranked) });
  }

  // Weakest first, so the best candidate is offered against the worst land in
  // the deck rather than against whichever one happened to be listed first.
  held.sort((a, b) => a.fit - b.fit || a.land.card.name.localeCompare(b.land.card.name));

  const swaps: LandSwap[] = [];
  const usedOut = new Set<string>();

  for (const candidate of candidates) {
    if (swaps.length >= limit) break;
    const inKey = normalizeName(candidate.card.name);
    if (skipIn.has(inKey)) continue;
    const inFit = landFit(candidate);
    const inCoverage = coverageOf(candidate.grounds);

    for (const entry of held) {
      const outKey = normalizeName(entry.land.card.name);
      if (usedOut.has(outKey) || outKey === inKey) continue;

      const gain = inFit - entry.fit;
      if (gain < minGain) continue;

      const outCoverage = coverageOf(entry.land.grounds);
      if (!covers(inCoverage, outCoverage)) continue;

      // A FETCH IS NOT A SUBSTITUTE FOR A SOURCE ALREADY ON THE BATTLEFIELD.
      //
      // `coverageOf` folds fetching in with tapping, which is right for "can
      // this deck reach that colour" and wrong for "may this land replace that
      // one". A fetch is one shot: it sacrifices itself, costs a card, and
      // leaves a tapped basic behind. A land that taps for a colour does it
      // every turn. Measured on 2026-08-20 against the real precons, without
      // this test:
      //
      //   Karoo           "{T}: Add {C}{W}"  ->  Escape Tunnel  (taps for
      //                   nothing; its only ability sacrifices itself)
      //   Dormant Volcano "{T}: Add {C}{R}"  ->  Escape Tunnel
      //   Port of Karfell "{T}: Add {U}"     ->  Escape Tunnel
      //
      // All three passed the coverage rule through `fetched`, and all three
      // told a player to trade a repeatable coloured source for a land that
      // makes no mana. The response's own measured facts said so on the tile:
      // `removeGrounds.produces ["W"]` against `addGrounds.produces []`.
      //
      // So the free half must cover the free half on its own. A fetch may
      // still ADD reach on top; it may not stand in for what is being cut.
      const inFree = new Set(candidate.grounds.produces);
      const outFree = new Set(entry.land.grounds.produces);
      if (!covers(inFree, outFree)) continue;

      const added = [...inCoverage]
        .filter(c => !outCoverage.has(c))
        .sort((a, b) => ALL_FIVE.indexOf(a) - ALL_FIVE.indexOf(b));
      const untapped = entry.land.grounds.entersTapped && !candidate.grounds.entersTapped;
      // Nothing the user can check got better. Not offered.
      if (added.length === 0 && !untapped) continue;
      // TEMPO ONLY COUNTS ON A LAND THAT MAKES ONE OF YOUR COLOURS.
      //
      // "It comes in untapped" is a real gain on a land you tap for mana and
      // an empty one on a land that taps for nothing this deck can spend. When
      // neither side covers a colour, the only measured difference between
      // them is which turn they are live, and nothing in this file has an
      // opinion on which of two colourless utility lands is the better card —
      // the header says so, and `edhrec_rank` is null for 719 of the 1,194
      // commander-legal lands. Measured: in a mono-white deck this rule was
      // offering `Myriad Landscape -> Heap Gate`, both reading
      // `produces: []`, at fit +0.94, described as "does a job your deck
      // already does (ramp)". Heap Gate does not ramp.
      if (added.length === 0 && outCoverage.size === 0) continue;

      // Assembled as one sentence, because the two halves are one thought:
      // what you gain, and what it costs. Both are measured; neither is
      // dropped when it is the awkward one.
      const gained = added.length
        ? `Adds ${listColours(added)} as ${added.length === 1 ? 'a source' : 'sources'}` +
          `, on the same land drop`
        : '';
      const tempo = untapped
        ? `${gained ? ', and it' : 'It'} comes in untapped where the land it replaces does not`
        : !entry.land.grounds.entersTapped && candidate.grounds.entersTapped
          ? `${gained ? ', but it' : 'It'} always enters tapped, which the land it replaces does not`
          : '';

      swaps.push({
        out: entry.land,
        in: candidate,
        gain,
        outReason: `${entry.land.card.name} ${landPhrase(entry.land)}.`,
        gainNote: `${gained}${tempo}.`,
        priority: gain >= 2 ? 'high' : gain >= 1 ? 'medium' : 'low',
      });
      usedOut.add(outKey);
      break;
    }
  }

  return swaps;
}

/* ------------------------------------------------------------------ *
 * Basics, which are filler
 * ------------------------------------------------------------------ */

export interface BasicFillerColour {
  colour: ManaColour | 'C';
  name: string;
  quantity: number;
}

export interface BasicFiller {
  /** How many land slots are still empty after the recommended lands go in. */
  shortfall: number;
  byColour: BasicFillerColour[];
  /** One line, for the user. Not eight tiles. */
  note: string;
}

/**
 * How many basics this deck still needs, and of which colours.
 *
 * The owner's objection was that the lands tab recommended Plains, and it is
 * correct: a basic land is not advice. But "you are nine lands short" IS worth
 * saying, so it is said once, as a count, instead of nine times as a list of
 * suggestions.
 *
 * The split is by coloured pip demand measured from the deck's own spells,
 * with any colour left under {@link MIN_SOURCES_PER_COLOUR} topped up first —
 * the same two rules, in the same order, that `allocateBasics` applies when
 * the deck generator builds a mana base from nothing. Reimplemented here in
 * eight lines rather than called, because `allocateBasics` returns
 * `GeneratedEntry` objects built around the generator's `BuildCard`, and
 * fabricating those to read two numbers back out would be the more fragile
 * coupling of the two.
 *
 * Returns null when the deck is not short. A deck at its land target needs no
 * filler and must not be shown a filler line saying zero.
 *
 * THE COUNT IS CAPPED BY THE EMPTY SLOTS, NOT BY THE LAND SHORTFALL
 * ----------------------------------------------------------------
 * Those are two different numbers, and using the wrong one puts cards into
 * slots that do not exist. A deck can be further under its land target than it
 * is under its deck size, and a deck can be AT its deck size and still under
 * its land target. Both were measured on 2026-08-20, before this cap existed:
 *
 *   Ahoy Mateys (LCC) — 89 cards, 25 lands, target 37
 *     11 empty slots, 8 lands recommended, filler said 4 more basics.
 *     8 + 4 = 12 cards into 11 slots, under a line reading "4 slots are still
 *     empty after these" when 3 were.
 *
 *   The real Atraxa deck — 100 cards, 32 lands, target 37
 *     0 empty slots, and the filler still said 5 basics and "5 slots are still
 *     empty after these". Following it makes a 105 card Commander deck, which
 *     the deck's own save gate then refuses.
 *
 * `fillPlan` already counts the slots correctly — `landSlots` is
 * `min(missingCards, landShortfall)` — so the number existed and simply was
 * not consulted here. A deck with no empty slot now gets no filler line at
 * all, which is right: what that deck needs is a trade, and the land swaps are
 * what answer it.
 */
export function basicFiller(args: {
  landCount: number;
  idealLandCount: number;
  /** Non-basic lands the response is recommending. They fill slots too. */
  recommendedLands: number;
  /**
   * Slots this deck actually has for a land — `fillPlan.landSlots`, which is
   * already capped by how many cards the deck is short. Zero for a deck at its
   * size, which is exactly why it has to be passed in rather than defaulted.
   */
  emptyLandSlots: number;
  identity: readonly Color[];
  /** Coloured pips the deck's own spells demand, by colour. */
  pips: Record<ManaColour, number>;
  manaProfile: ManaProfile | null;
  /** Basic land names available in this identity, by colour. */
  basicNames: ReadonlyMap<ManaColour | 'C', string>;
}): BasicFiller | null {
  const room = Math.min(
    args.idealLandCount - args.landCount,
    Math.max(0, args.emptyLandSlots)
  );
  const shortfall = room - Math.max(0, args.recommendedLands);
  if (shortfall <= 0) return null;

  const colours = (args.identity as readonly string[]).filter(c =>
    args.basicNames.has(c as ManaColour)
  ) as ManaColour[];

  if (!colours.length) {
    const wastes = args.basicNames.get('C');
    const byColour: BasicFillerColour[] = wastes
      ? [{ colour: 'C', name: wastes, quantity: shortfall }]
      : [];
    return {
      shortfall,
      byColour,
      note: `${shortfall} more ${shortfall === 1 ? 'land' : 'lands'} to reach ${args.idealLandCount}${
        wastes ? `, which this identity can only fill with ${wastes}` : ''
      }.`,
    };
  }

  const counts = Object.fromEntries(colours.map(c => [c, 0])) as Record<ManaColour, number>;
  let left = shortfall;

  // 1. Colour repair: a colour the deck cannot reliably produce comes first,
  //    because a deck that cannot make its colours cannot cast its own cards.
  for (const colour of colours) {
    if (left <= 0) break;
    const deficit = MIN_SOURCES_PER_COLOUR - (args.manaProfile?.sourcesByColour[colour] ?? 0);
    if (deficit <= 0) continue;
    const take = Math.min(deficit, left);
    counts[colour] += take;
    left -= take;
  }

  // 2. Whatever is left, split by pip demand, largest remainder so the total
  //    is exact rather than rounded into a different number.
  if (left > 0) {
    const weights = colours.map(c => Math.max(0, args.pips[c] ?? 0));
    const total = weights.reduce((n, w) => n + w, 0);
    if (total <= 0) {
      for (let i = 0; i < left; i++) counts[colours[i % colours.length]] += 1;
      left = 0;
    } else {
      const exact = weights.map(w => (w / total) * left);
      const floors = exact.map(Math.floor);
      let placed = floors.reduce((n, f) => n + f, 0);
      colours.forEach((c, i) => (counts[c] += floors[i]));
      const order = colours
        .map((c, i) => ({ c, rem: exact[i] - floors[i] }))
        .sort((a, b) => b.rem - a.rem || a.c.localeCompare(b.c));
      let i = 0;
      while (placed < left && order.length) {
        counts[order[i % order.length].c] += 1;
        placed++;
        i++;
      }
      left = 0;
    }
  }

  const byColour = colours
    .filter(c => counts[c] > 0)
    .map(c => ({ colour: c, name: args.basicNames.get(c)!, quantity: counts[c] }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

  const parts = byColour.map(b => `${b.quantity} ${b.name}`);
  const list =
    parts.length <= 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

  return {
    shortfall,
    byColour,
    note:
      `${shortfall} slots are still empty after these. Filling them with basics ` +
      `split by what your spells cost means ${list}.`,
  };
}
