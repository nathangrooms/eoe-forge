/**
 * How many of each thing THIS commander's deck wants.
 *
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------
 * `advise/roles.ts` used to declare a Commander deck as ramp 10, draw 10,
 * removal 8, interaction 4, wincon 3, land 36, and a creature floor of 32, 24
 * or 12 by style. Seventy of the ninety-nine slots were spoken for before the
 * commander was read, and the same seventy for every commander in the format.
 *
 * The owner's objection is the whole of this file:
 *
 *   "we cannot force a specific amount of creatures/artifacts/sorceries etc —
 *    every commander is completely different"
 *   "Decks must be custom to them, as well as the archetype"
 *
 * They are right, and the reason a table cannot be fixed by choosing better
 * numbers is that the numbers disagree with each other by commander. Krenko
 * wants a board full of Goblins. Talrand wants a handful of bodies and a pile
 * of instants and sorceries. A lands deck wants neither. There is no single
 * row that is right for all three, so the row has to go.
 *
 * WHAT THE COMPOSITION IS DERIVED FROM
 * ------------------------------------
 * One idea, and it needs no table at all:
 *
 *   **A deck is shaped like the cards that do the commander's job.**
 *
 * `planForCommander` already reads a commander's own ability record into a list
 * of WANTS — Krenko wants `sub:goblin`, `cares:sub:goblin`, `tok:goblin`;
 * Talrand wants `type:instant`, `type:sorcery`, `cares:type:instant`. Those
 * wants are matched against the real legal pool by `planFit`, and the cards
 * that come back carry TYPE LINES. Nearly every card that satisfies "is a
 * Goblin" is a creature; nearly every card that satisfies "is an instant" is
 * not. So the creature share of a Krenko deck and the creature share of a
 * Talrand deck fall out of the two commanders' own records measured against the
 * same catalogue, and nobody has to write either number down.
 *
 * That is the answer to "what in the commander's text makes this deck want 40
 * creatures rather than 15": Krenko's text names a creature type, so the cards
 * that do his job are creatures, so the deck is creatures. Talrand's text names
 * two card types that are not creatures, so it is not.
 *
 * WHAT IS STILL DECLARED, AND WHY EACH ONE SURVIVES
 * ------------------------------------------------
 * Three things, and they are floors rather than quotas. The distinction is not
 * a word game: a quota says "take exactly this many and stop", a floor says
 * "below this the deck does not work". A floor never competes with the
 * commander's plan for slots it would otherwise have won, because the plan
 * takes everything above the floor.
 *
 *   1. LANDS. A deck has to be able to cast what it drew. This is not declared
 *      as a number at all — it is SOLVED, per commander, against the curve its
 *      own plan implies, using the same `castability.ts` hypergeometric that
 *      grades a finished deck. See {@link solveLandTarget}.
 *
 *   2. RAMP. Also solved rather than declared, and for a magnitude reason
 *      rather than a presence one: ramp exists to reach mana the lands do not
 *      reach on their own. A deck of two-drops needs almost none; a deck whose
 *      plan is seven-mana creatures needs a lot. See {@link solveRampFloor}.
 *
 *   3. DRAW, REMOVAL, INTERACTION and a WIN CONDITION. One rule for all four,
 *      and the only declared numbers left in the engine are the four TURNS in
 *      {@link WHEN_IT_MATTERS}. The count is derived: how many copies does a
 *      99-card deck need for the card to be in hand, more often than not, by
 *      the turn it is needed? That is a hypergeometric question and
 *      {@link copiesToSeeOne} answers it. Nothing here is a target; it is the
 *      point below which the deck will simply not have drawn one.
 *
 * There is NO creature floor and that removal is deliberate. A creature count
 * is exactly the "fixed number imposed from outside" the owner objected to, and
 * every job a creature does for a deck — blocking, ramping, ending the game —
 * is covered by a floor above that a creature is free to fill.
 *
 * Pure. No network, no AI, no database.
 */

import type { CandidateCard, Role } from '../core/types.ts';
import { ROLES } from '../core/types.ts';
import { planFit, type CommanderPlan } from '../knowledge/behaviour.ts';
import { cardRole, styleFor, type DeckStyle } from '../advise/roles.ts';
import {
  buildManaProfile,
  cardPlayability,
  coloursToMask,
  hypergeometricAtLeast,
  manaSourceFor,
  maskToColours,
  parseManaCost,
  type ManaColour,
  type PlayabilityCardInput,
} from '../playability/castability.ts';
import { CASTABILITY_COMFORT_PCT } from '../advise/rank.ts';

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** A pool row, as much of it as the shape needs. `BuildCard` satisfies this. */
export interface ShapeCard extends CandidateCard {
  oracleText?: string | null;
}

export interface ShapeInput {
  slots: number;
  /** The commander. Its cost and colours decide the land floor. */
  commander: ShapeCard;
  /** Read off the commander by `planForCommander`, before anything is ranked. */
  plan: CommanderPlan;
  identity: readonly string[];
  /** The whole legal pool, lands included. Never a slice. */
  pool: readonly ShapeCard[];
  style?: string | null;
  /** An explicit caller number wins over the derivation. See `DeckShape`. */
  landTarget?: number | null;
  /**
   * Build the mana base, or hand back 99 spells.
   *
   * The page's "Include manabase" toggle, which had ZERO mentions in the edge
   * function until 3 Sep 2026 and so has always built lands whatever the
   * player chose. `landTarget: 0` is the honest expression of "off": every
   * slot is a spell and the castability solver has nothing to solve.
   */
  includeLands?: boolean | null;
  roleTargets?: Partial<Record<Role, number>> | null;
}

export interface ShapeEvidence {
  /**
   * What the composition was read off.
   *
   * `archetype-shell` means the commander's own record produced no want and the
   * archetype the player asked for produced all of them. It is a worse answer
   * than `commander-record` and a much better one than `colour-identity`, so it
   * is named rather than folded into either.
   */
  source: 'commander-record' | 'commander-tags' | 'archetype-shell' | 'colour-identity';
  /** Pool cards satisfying at least one want, and the sum of their fit. */
  doers: number;
  doerWeight: number;
  /** Fit-weighted share of those cards that are creatures. Null in fallback. */
  creatureShare: number | null;
  /** Fit-weighted share that are instants or sorceries. */
  spellShare: number | null;
  /**
   * Creature share among the pool cards that can fill the floors.
   *
   * The other half of the composition. See the creature-target derivation for
   * why a deck is not shaped like its plan alone.
   */
  functionCreatureShare: number;
  /** Mean and upper-quartile mana value of the deck this plan implies. */
  impliedMeanCmc: number;
  impliedTopCmc: number;
  /** On-curve castability the solved land count reached, as a percentage. */
  landSolvePct: number;
  /** True when lands stopped paying before the comfort point was reached. */
  landSolveStalled: boolean;
  styleAsked: string | null;
  styleUsed: DeckStyle;
}

export interface DeckShape {
  slots: number;
  landTarget: number;
  spellSlots: number;
  /**
   * How many creatures this commander's record asks for.
   *
   * A TARGET, not a floor and not a quota: the generator tops up to it and also
   * stops taking creatures past it. Both directions matter. Before this had a
   * ceiling, Edgar Markov came back with 58 creatures out of 64 and no
   * interaction, because `commanderFit` at 2.2 applied to `sub:vampire` beats
   * everything else in a mono-tribal pool and nothing was counting.
   */
  creatureTarget: number;
  /** Floors, never quotas. `land` and `creature` are held elsewhere and are 0. */
  roleFloors: Record<Role, number>;
  /** Every number above, in a sentence built from what produced it. */
  because: string[];
  evidence: ShapeEvidence;
}

/* ------------------------------------------------------------------ *
 * The one table left, and it holds turns rather than slots
 * ------------------------------------------------------------------ */

/**
 * The turn each job has to have been drawn by.
 *
 * These four numbers are the only declared policy left in the deck's
 * composition, and they are deliberately turns rather than card counts: a turn
 * is a claim about the game, which can be argued about at a table, where a card
 * count is a claim about the deck, which is the thing that has to differ per
 * commander. The counts they produce are computed in {@link copiesToSeeOne}
 * from the size of a Commander library, and they change if the deck size does.
 *
 *   ramp 3         The turn acceleration stops being acceleration. This is
 *                  ramp's PRESENCE floor only, and it is the smaller half of
 *                  the answer: how much mana this particular deck needs is a
 *                  magnitude question that {@link solveRampFloor} solves
 *                  against its own curve, and the larger of the two wins.
 *   draw 5         The turn a deck that started on seven cards has spent them.
 *                  Nothing after this point happens without more cards.
 *   removal 6      The turn an opponent's commander is on the battlefield and
 *                  has attacked. A deck holding no answer at this point does
 *                  not get to have a plan of its own.
 *   interaction 5  Earlier than removal, because interaction is the half that
 *                  has to be held up rather than cast: a counterspell is only
 *                  interaction if it was already in hand.
 *   wincon 10      Commander games run long. A deck may take until here to
 *                  find the card that ends one, and no longer.
 *
 * `removal` and `interaction` do NOT vary with the commander, and that is
 * correct rather than an omission: what they answer is the other three players,
 * not this deck's own curve.
 */
const WHEN_IT_MATTERS: Readonly<Partial<Record<Role, number>>> = {
  ramp: 3,
  draw: 5,
  removal: 6,
  interaction: 5,
  /*
   * Turn six, the same as removal.
   *
   * A tutor is not a card you need on curve, it is the card you need once the
   * deck has a shape to find a piece for. Setting it earlier would buy tutors
   * at the cost of the ramp and draw that make them worth casting; setting it
   * later would mean a deck can be built with none at all, which is where this
   * started.
   */
  tutor: 6,
  /*
   * Turn five. Equipment and auras that protect a commander are wanted about
   * when the commander is: a little after it has been cast and before the
   * first removal spell arrives. Earlier would buy a Bone Saw over a ramp
   * spell; later leaves the deck with none, which is where this started.
   */
  enhance: 5,
  /*
   * Turn six, and it was four.
   *
   * Four reads well — you want the Boots down before the commander is worth
   * killing — and it asks for SEVEN copies, because `copiesToSeeOne` is
   * answering "how many do I need to have drawn one by then". Seven protection
   * cards in a 99-card deck is more than any real Commander list runs, and a
   * target the pool cannot fill does not stay a local problem: measured on
   * Meren, `protection` came out 3 of 7 and the four unfillable slots were
   * taken out of the budget every other role was competing for.
   *
   * Six is when a commander is genuinely under threat: it has been cast, it has
   * done something, and somebody has drawn an answer.
   */
  protection: 6,
  wincon: 10,
};

/**
 * How sure "you will have drawn one" has to be.
 *
 * DELIBERATELY THE WEAKEST CLAIM THAT STILL MEANS ANYTHING: more often than
 * not. A floor is the point below which a deck is broken, so it has to be set
 * where the deck breaks and not where the deck is comfortable. Raising this to
 * 75% roughly doubles every count below and turns four floors back into the
 * quota table this file exists to delete — measured: at 50% the four floors
 * come to 22 of 64 nonland slots, at 75% they come to 41.
 */
const SEEN_CONFIDENCE = 0.5;

/**
 * WHAT A REAL COMMANDER DECK ACTUALLY HOLDS, per role.
 *
 * Measured 3 Sep 2026 over the 192 real Commander decklists in `meta_decks`
 * (MTGJSON, MIT, already ingested) by running THIS FILE'S OWN `cardRole` over
 * their cards, so both sides of every comparison are the same question asked
 * the same way. Regenerate with `scripts/probe/real-deck-roles.mjs`, which
 * writes `scripts/probe/real-deck-roles.json`; these numbers are that file,
 * copied in because the engine is pure and may not read a database.
 *
 * IT IS EVIDENCE, NOT A TARGET. The floors above are still derived - how many
 * copies does a 99-card deck need to have drawn one by the turn it matters -
 * and that derivation is right about the SHAPE of the question. What it cannot
 * know is that real decks decline to pay for the answer: the hypergeometric
 * says four tutors and a real deck runs none, because a tutor you have not
 * drawn costs nothing and a tutor slot costs a card. So the derived floor is
 * clamped to what nine decks in ten actually hold, and the clamp is a fact
 * about decks rather than a number somebody liked.
 *
 * Measured before the clamp existed, our twenty benchmark decks sat inside the
 * real range on 81 of 200 role checks. `scripts/probe/deck-shape-check.mjs`.
 */
export const REAL_DECK_ROLES: Readonly<Record<Role, { p10: number; p50: number; p90: number; max: number }>> = {
  ramp:        { p10: 11, p50: 16, p90: 21, max: 31 },
  draw:        { p10: 11, p50: 17, p90: 24, max: 43 },
  removal:     { p10: 9,  p50: 13, p90: 20, max: 33 },
  interaction: { p10: 1,  p50: 4,  p90: 8,  max: 13 },
  tutor:       { p10: 0,  p50: 0,  p90: 2,  max: 12 },
  enhance:     { p10: 1,  p50: 5,  p90: 12, max: 32 },
  protection:  { p10: 0,  p50: 1,  p90: 5,  max: 10 },
  wincon:      { p10: 0,  p50: 0,  p90: 2,  max: 16 },
  land:        { p10: 37, p50: 38, p90: 40, max: 44 },
  creature:    { p10: 22, p50: 29, p90: 37, max: 45 },
};

/**
 * The most of one role any deck should hold.
 *
 * The p90 of what real decks run, scaled to this deck's size, and it replaces
 * a formula (`target * 2 + 4`) that let Prosper, Tome-Bound come back with 40
 * ramp pieces against a real p90 of 21. A ceiling is an absurdity guard, so it
 * sits at the top of normal rather than at the middle: a deck genuinely built
 * on mana may run 21 and none should run 40.
 */
export function roleCeilingFor(role: Role, slots: number): number {
  const band = REAL_DECK_ROLES[role];
  if (!band) return slots;
  return Math.max(1, Math.round((band.p90 * slots) / 99));
}

/** Cards in hand on the given turn, on the play: seven, then one a turn. */
function cardsSeenBy(turn: number): number {
  return 7 + Math.max(0, turn - 1);
}

/**
 * How many copies a library of this size needs for one to be in hand by then.
 *
 * The whole of the floor derivation. `hypergeometricAtLeast` is the same
 * function `castability.ts` uses to answer whether a deck can pay for a card,
 * so "will I have drawn it" and "can I cast it" are answered by one piece of
 * arithmetic rather than by a rule of thumb next to a computation.
 */
export function copiesToSeeOne(
  librarySize: number,
  cardsSeen: number,
  confidence: number
): number {
  if (librarySize <= 0 || cardsSeen <= 0) return 0;
  for (let n = 1; n <= librarySize; n++) {
    if (hypergeometricAtLeast(librarySize, n, cardsSeen, 1) >= confidence) return n;
  }
  return librarySize;
}

/**
 * How far a style may tilt a share the commander's record produced.
 *
 * A quarter each way, and it is a MULTIPLIER rather than a number because that
 * is the difference between a preference and an override. Creature mode makes a
 * Talrand deck slightly more creature-heavy than Talrand's own record implies;
 * it cannot make Talrand a creature deck, because Talrand is not one and asking
 * for one is asking for a worse Talrand deck. The owner's complaint was that
 * creature mode produced no creatures, not that it failed to produce forty.
 */
const STYLE_TILT: Readonly<Record<DeckStyle, number>> = {
  creatures: 1.25,
  balanced: 1.0,
  spells: 0.75,
};

/* ------------------------------------------------------------------ *
 * The derivation
 * ------------------------------------------------------------------ */

/** A provisional land count, used only to size the list the curve is read off. */
const PROVISIONAL_LANDS = 36;

/**
 * How many cards of the implied deck the land solve actually measures.
 *
 * Measuring all sixty-odd at every candidate land count, twice, is a few
 * thousand hypergeometric solves inside an edge function for a decision about
 * one number. Sixteen cards taken at even intervals from a list already ordered
 * best-first keeps the curve's shape: the sample's mean mana value is within a
 * tenth of the whole list's on every commander measured.
 */
const CURVE_SAMPLE = 16;

/** How many of the deck's top-end cards the ramp solve measures. */
const RAMP_PROBES = 8;

export function deriveDeckShape(input: ShapeInput): DeckShape {
  const slots = Math.max(1, input.slots);
  const style = styleFor(input.style ?? null);
  const because: string[] = [];

  const nonLand = input.pool.filter(c => !isLandLine(c.typeLine));
  const usefulLands = usefulLandsFor(
    input.identity,
    input.pool.filter(c => isLandLine(c.typeLine))
  );

  /* --- 1. The cards that do the commander's job --------------------- */

  const doers: { card: ShapeCard; fit: number }[] = [];
  let doerWeight = 0;
  let creatureWeight = 0;
  let spellWeight = 0;
  for (const card of nonLand) {
    const { fit } = planFit(input.plan, card);
    if (fit <= 0) continue;
    doers.push({ card, fit });
    doerWeight += fit;
    if (isCreatureLine(card.typeLine)) creatureWeight += fit;
    if (isInstantOrSorceryLine(card.typeLine)) spellWeight += fit;
  }

  /*
   * A COMMANDER WITH NO PLAN STILL GETS A DECK, and this is the half that
   * matters as much as the happy path.
   *
   * 23.8% of cards have no ability record, and Muldrotha, the Gravetide is one
   * of them: the compiler returns `coverage: 'manual'` with zero abilities for
   * "you may play a land and cast a permanent spell of each permanent type from
   * your graveyard", the XMage table holds no record for that oracle id, and
   * none of its tags map to a facet either, so `planForCommander` produces zero
   * wants and there are no doers to measure.
   *
   * The fallback is NOT a table — putting the deleted numbers back under
   * another name for the 24% of cases nobody looks at is how a table survives
   * being deleted. It is the same measurement taken over a wider set: the
   * composition of the cards people actually play IN THESE COLOURS, read off
   * `edhrecRank`, which is the only "what gets played" evidence this schema
   * holds. A Muldrotha deck therefore comes out shaped like an ordinary deck in
   * those colours rather than like nothing, every other floor is derived
   * exactly as it is for a commander with a record, and `evidence.source` says
   * `colour-identity` so the caller can see which of the two happened.
   */
  const usedFallback = doers.length === 0 || doerWeight <= 0;
  const source: ShapeEvidence['source'] = usedFallback
    ? 'colour-identity'
    : input.plan.archetype?.alone
      ? 'archetype-shell'
      : input.plan.fromTagsOnly
        ? 'commander-tags'
        : 'commander-record';

  const provisionalSpellSlots = Math.max(1, slots - PROVISIONAL_LANDS);

  /*
   * The deck this plan implies, best first.
   *
   * Used for two things and nothing else: the curve the land and ramp solves
   * are measured against, and the pip demand the provisional basics follow. It
   * is not the deck — the ranker builds that, against a mana base that does not
   * exist yet, which is why this has to be estimated here rather than read off
   * the result.
   */
  const implied: ShapeCard[] = usedFallback
    ? byPopularity(nonLand).slice(0, provisionalSpellSlots)
    : (() => {
        /*
         * Fit, then popularity, then the oracle id. NO MANA VALUE TIEBREAK, and
         * that omission is load-bearing: with `edhrec_rank` null on more than
         * half the catalogue, popularity ties constantly, and a mana-value
         * tiebreak underneath it sorted the cheapest cards to the front. The
         * curve read off the result came back at a mean of 1.0 for Krenko and
         * 0.84 for Meren, which is not a deck, and the land solve then answered
         * a question about a deck of one-drops. The oracle id is meaningless,
         * which is exactly what a tiebreak should be when there is nothing left
         * to say.
         */
        const best = [...doers]
          .sort(
            (a, b) =>
              b.fit - a.fit ||
              popRank(a.card) - popRank(b.card) ||
              a.card.oracleId.localeCompare(b.card.oracleId)
          )
          .map(d => d.card);
        if (best.length >= provisionalSpellSlots) return best.slice(0, provisionalSpellSlots);
        /*
         * Fewer doers than slots is the ordinary case, not an edge one: a plan
         * with three wants matches a few hundred cards in a mono-colour pool
         * and a deck holds sixty-four. The rest of the deck is the ramp, the
         * removal and the draw every deck runs, whose curve is a fact about the
         * format rather than about this commander, so it is padded from what
         * people play in these colours.
         */
        const taken = new Set(best.map(c => c.oracleId));
        const pad = byPopularity(nonLand).filter(c => !taken.has(c.oracleId));
        return [...best, ...pad.slice(0, provisionalSpellSlots - best.length)];
      })();

  const cmcs = implied.map(c => (Number.isFinite(c.cmc) ? c.cmc : 0)).sort((a, b) => a - b);
  const impliedMeanCmc = cmcs.length ? cmcs.reduce((n, v) => n + v, 0) / cmcs.length : 0;
  const impliedTopCmc = cmcs.length ? cmcs[Math.min(cmcs.length - 1, Math.floor(cmcs.length * 0.75))] : 0;

  /* --- 2. Lands, solved against that curve -------------------------- */

  const explicitLand =
    typeof input.landTarget === 'number' && Number.isFinite(input.landTarget)
      ? clamp(Math.round(input.landTarget), 0, slots)
      : null;

  const landFloor = landDropFloor(slots);
  /*
   * Ramp's PRESENCE floor seeds the land solve, because a deck's mana is its
   * lands plus its accelerants and neither can be solved with the other set to
   * zero. This is the same number the floor loop below arrives at; it is
   * computed here because the land solve runs first and needs it.
   */
  const rampSeed = copiesToSeeOne(
    Math.max(1, slots),
    cardsSeenBy(WHEN_IT_MATTERS.ramp ?? 3),
    SEEN_CONFIDENCE
  );
  const landArgs = {
    slots,
    identity: input.identity,
    commander: input.commander,
    implied,
    floor: landFloor,
    usefulLands,
  };
  let solved = solveLandTarget({ ...landArgs, rocks: rampSeed });

  let landTarget = input.includeLands === false ? 0 : (explicitLand ?? solved.lands);
  let spellSlots = Math.max(0, slots - landTarget);

  if (input.includeLands === false) {
    because.push('no lands, because you asked for the spells only');
  } else if (explicitLand !== null) {
    because.push(
      `${landTarget} lands because the caller asked for that many; the curve this ` +
        `commander implies would have taken ${solved.lands}`
    );
  } else if (solved.stalled) {
    because.push(
      `${landTarget} lands, a bound rather than a best: this deck's curve (mean mana value ` +
        `${impliedMeanCmc.toFixed(1)}) never stopped wanting another land inside the range a ` +
        `${slots}-card deck can hold, so it took the edge of that range and left the rest of ` +
        `the mana to ramp. ${solved.pct.toFixed(0)}% of it is castable on curve off lands alone`
    );
  } else {
    because.push(
      `${landTarget} lands, the count that leaves the most of THIS deck castable on curve: ` +
        `${slots - landTarget} nonland slots at ${solved.pct.toFixed(0)}% castable off lands ` +
        `alone, against a curve whose mean mana value is ${impliedMeanCmc.toFixed(1)}. ` +
        `${landFloor} is the floor below which any ${slots}-card deck misses its third land ` +
        `drop more often than not`
    );
  }

  /* --- 3. The floors ------------------------------------------------ */

  const library = Math.max(1, slots);
  const roleFloors = {} as Record<Role, number>;
  for (const role of ROLES) roleFloors[role] = 0;

  for (const role of ROLES) {
    const turn = WHEN_IT_MATTERS[role];
    if (turn === undefined) continue;
    const seen = cardsSeenBy(turn);
    const derived = copiesToSeeOne(library, seen, SEEN_CONFIDENCE);
    /* Clamped to what nine real decks in ten hold. The derivation answers "how
       many to have drawn one by then" and real decks decline to pay that for
       the narrow roles: it asks for four tutors and four win conditions where
       the 192-deck median for both is ZERO. Measured before this clamp, tutor
       was outside the real range on 12 of 20 benchmark decks and wincon on
       11. The wide roles (ramp, draw, removal) are unaffected - their derived
       floors already sit below p90 - so this only bites where the arithmetic
       was asking for something no deck runs. */
    const n = Math.min(derived, roleCeilingFor(role, library));
    roleFloors[role] = n;
    if (role === 'ramp') continue; // reported below, beside the magnitude half
    because.push(
      `${n} ${role}: fewer than that and a ${library}-card deck has not drawn one by turn ` +
        `${turn} (${seen} cards seen) more often than not`
    );
  }

  const rampPresence = roleFloors.ramp;
  const ramp = solveRampFloor({
    slots,
    landTarget,
    identity: input.identity,
    commander: input.commander,
    implied,
    usefulLands,
    topCmc: impliedTopCmc,
  });
  roleFloors.ramp = Math.max(rampPresence, ramp.count);
  because.push(`${roleFloors.ramp} ramp, the larger of two floors. ${ramp.because}`);

  /*
   * SECOND PASS, and only when the answer moved.
   *
   * The land solve was seeded with ramp's presence floor. A deck whose top end
   * needs more accelerants than that has more mana than the land solve was
   * told, and wants fewer lands as a result, so it is re-run once with the real
   * number. One pass back is enough: measured over the eight test commanders a
   * third pass never changed a land count, because the second solve's land
   * count only feeds the ramp solve through a curve that has already settled.
   */
  if (explicitLand === null && roleFloors.ramp !== rampSeed) {
    const again = solveLandTarget({ ...landArgs, rocks: roleFloors.ramp });
    if (again.lands !== landTarget) {
      because.push(
        `${again.lands} lands rather than ${landTarget}: the first pass assumed the ` +
          `${rampSeed} accelerants every deck of this size wants and this deck wants ` +
          `${roleFloors.ramp}`
      );
      solved = again;
      landTarget = again.lands;
      spellSlots = Math.max(0, slots - landTarget);
    }
  }

  /* --- 4. The composition ------------------------------------------- */

  const creatureShare = usedFallback ? null : creatureWeight / doerWeight;
  const spellShare = usedFallback ? null : spellWeight / doerWeight;

  const fallbackShare = usedFallback ? shareOfCreatures(implied) : 0;
  const planShare = creatureShare ?? fallbackShare;

  /*
   * A DECK IS ITS PLAN PLUS ITS FUNCTION, AND THE TWO HALVES ARE SHAPED
   * DIFFERENTLY. This is the decomposition, and both earlier versions of it
   * were measured and were wrong in opposite directions.
   *
   *   Plan share over the theme slots only:  Krenko asked for 22 creatures,
   *     FEWER than the fixed floor of 24 it replaced, because it treated every
   *     floor pick as though it could never be a creature and a Goblin that
   *     adds mana is ramp AND a Goblin.
   *   Plan share over the whole 63 nonland slots:  Edgar Markov asked for 60,
   *     because 96% of the cards that satisfy `sub:vampire` are creatures and
   *     the ramp, the removal and the card draw were being counted as though
   *     they were vampires too. Sixty creatures out of sixty-three is the
   *     failure `docs/design/ENGINE-PICKS.md` handover 4 recorded, arrived at
   *     from the other direction.
   *
   * So the two halves are measured separately and added. The floors will be
   * filled from the pool by cards that serve those roles, and how many of THOSE
   * are creatures is a fact about this colour identity that can be counted
   * rather than assumed: in mono-red a good share of the removal and the ramp
   * has a body, in blue-white almost none of it does. The rest of the deck is
   * the plan, and it is shaped like the plan.
   *
   * The result is still a whole-deck number, which is what `generateDeck`
   * counts against.
   */
  const floorSum = ROLES.reduce((n, r) => n + roleFloors[r], 0);
  const functionSlots = clamp(floorSum, 0, spellSlots);
  const themeSlots = spellSlots - functionSlots;
  const functionCreatureShare = functionShareOf(nonLand, roleFloors);

  const tilt = STYLE_TILT[style.style];
  const creatureTarget = clamp(
    Math.round((functionSlots * functionCreatureShare + themeSlots * planShare) * tilt),
    0,
    spellSlots
  );

  because.push(
    usedFallback
      ? `${creatureTarget} creatures: ${input.commander.name} has no plan to read, so the ` +
        `${themeSlots} slots that are not floors take the shape of what people play in ` +
        `${input.identity.join('') || 'colourless'}, ${(fallbackShare * 100).toFixed(0)}% ` +
        `creatures, and ${(functionCreatureShare * 100).toFixed(0)}% of the cards that can ` +
        `fill the ${functionSlots} floor slots are creatures too` +
        (style.style === 'balanced' ? '' : `, tilted for the ${style.style} style`)
      : `${creatureTarget} creatures: ${doers.length} cards in the pool do ` +
        `${jobPhrase(input)} and ${(planShare * 100).toFixed(0)}% of the work they ` +
        `do is done by creatures (${(spellShare! * 100).toFixed(0)}% by instants and ` +
        `sorceries), which shapes the ${themeSlots} slots that are not floors; ` +
        `${(functionCreatureShare * 100).toFixed(0)}% of the cards that can fill the ` +
        `${functionSlots} floor slots are creatures` +
        (style.style === 'balanced' ? '' : `, tilted for the ${style.style} style`)
  );

  /* --- 5. Explicit caller overrides win ------------------------------ */

  let finalCreatureTarget = creatureTarget;
  if (input.roleTargets) {
    for (const role of ROLES) {
      const v = input.roleTargets[role];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
      const n = Math.round(v);
      if (role === 'creature') finalCreatureTarget = clamp(n, 0, spellSlots);
      else roleFloors[role] = n;
      because.push(`${n} ${role} because the caller asked for that many`);
    }
  }
  roleFloors.land = 0;
  roleFloors.creature = 0;

  return {
    slots,
    landTarget,
    spellSlots,
    creatureTarget: finalCreatureTarget,
    roleFloors,
    because,
    evidence: {
      source,
      doers: doers.length,
      doerWeight,
      creatureShare,
      spellShare,
      functionCreatureShare,
      impliedMeanCmc,
      impliedTopCmc,
      landSolvePct: solved.pct,
      landSolveStalled: solved.stalled,
      styleAsked: input.style == null ? null : String(input.style),
      styleUsed: style.style,
    },
  };
}

/* ------------------------------------------------------------------ *
 * The two solves
 * ------------------------------------------------------------------ */

/** A land count is never below the point where the commander itself is stuck. */
interface LandSolveInput {
  slots: number;
  identity: readonly string[];
  commander: ShapeCard;
  implied: readonly ShapeCard[];
  floor: number;
  /** Accelerants the deck will also hold. Lands and ramp are solved together. */
  rocks: number;
  /** The real lands this deck may play, classified once. See {@link usefulLandsFor}. */
  usefulLands: readonly PlayabilityCardInput[];
}

/**
 * The fewest lands a deck of this size can function on at all.
 *
 * THE ONE FLOOR ON LANDS, and it is not a table entry: it is the smallest land
 * count at which a deck reaches THREE MANA BY TURN THREE more often than not,
 * computed off the deck size with the same hypergeometric as everything else.
 * For a 99-card Commander deck that is 29 lands, at 52.3%.
 *
 * Why three by turn three, and why it is a floor rather than a preference: a
 * deck that misses its third land drop half the time has not cast anything, and
 * that is true of a Goblin deck, a spellslinger and a lands deck alike. Nothing
 * below it is a functioning Commander deck whatever it is made of, and nothing
 * above it is imposed: the solve below is free to take more, and does.
 *
 * WHAT THIS REPLACED, because the first version was wrong in an instructive
 * way. It used to be "the fewest lands that cast the commander on curve", which
 * sounds better and measured worse: casting a six-mana Muldrotha on turn six
 * off lands alone at the comfort point needs FORTY-NINE lands, and the solve
 * dutifully returned 49. The mistake is that reaching a commander's mana is not
 * lands' job alone, it is lands AND ramp, so that requirement moved into
 * {@link solveRampFloor}, where the answer is a handful of accelerants instead
 * of half a deck of lands.
 */
function landDropFloor(slots: number): number {
  const library = Math.max(1, slots);
  for (let lands = 1; lands <= library; lands++) {
    if (hypergeometricAtLeast(library, lands, cardsSeenBy(3), 3) >= SEEN_CONFIDENCE) return lands;
  }
  return library;
}

/**
 * The land count that leaves the most of this deck castable on curve.
 *
 * NO THRESHOLD, AND THAT IS THE POINT. Two thresholded versions came before
 * this one and both collapsed onto their own floor:
 *
 *   "the fewest lands at which the deck's MEAN card reaches the comfort point"
 *     cleared the bar at 29 lands — the floor — for all eight test commanders,
 *     because a mean over a Commander deck is carried by the dozen one-drops
 *     and the Sol Ring that are castable whatever the mana base looks like.
 *   "…at which the deck's MEDIAN card reaches it" cleared at the floor for five
 *     of the eight. Better, and still a table: five decks with one number is
 *     what this file exists to stop.
 *
 * The trouble is that a threshold needs a level, no level in this repository is
 * derived from anything, and castability rises monotonically with lands, so any
 * level picked too low is met immediately and any level picked too high runs to
 * the ceiling. A quantity with an interior maximum needs no level at all, and
 * there is one sitting in plain sight:
 *
 *   **the expected number of this deck's own spells that are castable on
 *   curve** = (nonland slots) x (mean on-curve castability).
 *
 * Both halves move against each other and both are measured. Another land
 * raises the second and lowers the first; the peak is where the next land stops
 * paying for the spell it costs. It is the trade every deckbuilder makes
 * between being screwed and being flooded, written as an expectation over the
 * deck's own cards, and nobody has to declare where it sits.
 *
 * THE MEAN IS RIGHT HERE and the median was right before, which is not a
 * contradiction: the quantity being maximised is an expectation, so it has to
 * be built from an expectation. Under a threshold the question was "is half of
 * this deck comfortable", which is a question about the middle card.
 *
 * LANDS AND RAMP ARE SOLVED TOGETHER, and the version that solved lands alone
 * was measured and rejected too. A deck's mana is its lands PLUS its
 * accelerants, so a profile holding only lands has to buy the missing sources
 * in lands: the eight test commanders came back wanting 41 to 49 of them, which
 * is not a deck. The caller therefore seeds this with the accelerant count and
 * re-runs it once after {@link solveRampFloor} has answered, which is two
 * passes of a two-variable problem and converges on every commander measured.
 *
 * What does NOT go into the profile is the rest of the implied deck.
 * `buildManaProfile` reads every mana dork and every land that happens to be in
 * the list it is handed, and letting the plan's own cards count would answer
 * "how many lands plus whatever mana this commander's theme happens to
 * contain", which is a different question and one whose answer moves for
 * reasons that have nothing to do with the mana base. The spells are present as
 * cards that produce nothing, which keeps the library the right size for the
 * hypergeometric without putting mana into it.
 */
function solveLandTarget(input: LandSolveInput): { lands: number; pct: number; stalled: boolean } {
  const pips = pipsOf(input.implied);
  const sample = curveSample(input.implied);
  const commanderInput = toPlayability(input.commander, 1, true);

  /** Mean on-curve castability off `lands` lands and the deck's accelerants. */
  const measure = (lands: number): number => {
    const spells = Math.max(0, input.slots - lands);
    const rocks = Math.min(input.rocks, spells);
    const deck: PlayabilityCardInput[] = [
      commanderInput,
      ...provisionalBase(input.identity, input.usefulLands, lands, pips),
      ...(rocks > 0 ? [twoManaRock(rocks)] : []),
      filler(spells - rocks),
    ];
    const profile = buildManaProfile(deck);
    let total = 0;
    let n = 0;
    for (const card of sample) {
      const pct = cardPlayability(toPlayability(card, 1), profile).pct;
      if (pct === null) continue;
      total += pct;
      n += 1;
    }
    return n === 0 ? 100 : total / n;
  };

  /*
   * Half the deck, and it is an absurdity guard rather than a target.
   *
   * The maximum is interior on every commander measured, so this only catches a
   * pool so short of castable cards that another land keeps paying past the
   * point where the deck is no longer a deck.
   */
  /*
   * THE MOST LANDS ANY REAL DECK RUNS, scaled to this deck's size, and it was
   * half the deck. Half is an arithmetic convenience and it is not an
   * absurdity guard: Xenagos, God of Revels walked all the way to 49 lands in
   * a 99-card deck and the note said "a bound rather than a best", which is
   * true and is not a deck anybody would play. Four of the twenty benchmark
   * commanders were over 44.
   *
   * 40 is the ninetieth percentile of 192 real Commander decks (the largest
   * runs 44). The guard sits at p90 rather than at the maximum because the
   * decks it catches are exactly the ones whose castability never peaked -
   * they have a pool problem the mana base cannot fix, and the 41st land makes
   * them worse. A deck that genuinely wants 41 reaches it through the peak,
   * not through the guard.
   * A deck whose castability is still climbing at 44 has a pool problem the
   * mana base cannot fix, and buying the 45th land makes the deck worse in the
   * way a player would notice first.
   */
  const ceiling = Math.min(input.slots, Math.max(input.floor, roleCeilingFor('land', input.slots)));

  let best = Math.max(0, input.floor);
  let bestPct = measure(best);
  let bestScore = (input.slots - best) * bestPct;
  let peaked = false;

  for (let lands = best + 1; lands <= ceiling; lands++) {
    const pct = measure(lands);
    const score = (input.slots - lands) * pct;
    if (score <= bestScore) {
      // Past the peak. The curve is single-humped in every case measured, so
      // the first fall is the top; walking the rest would only cost time.
      peaked = true;
      break;
    }
    best = lands;
    bestPct = pct;
    bestScore = score;
  }

  // `stalled` now means "the walk hit a wall rather than a peak": the floor was
  // already past the top, or the ceiling was reached with the curve still
  // rising. Either way the number is a bound rather than an optimum, and the
  // caller says so.
  return { lands: best, pct: bestPct, stalled: !peaked };
}

interface RampSolveInput {
  slots: number;
  landTarget: number;
  identity: readonly string[];
  commander: ShapeCard;
  implied: readonly ShapeCard[];
  usefulLands: readonly PlayabilityCardInput[];
  topCmc: number;
}

/**
 * How much acceleration this deck's own top end needs.
 *
 * PRESENCE IS THE WRONG QUESTION FOR RAMP, which is why it is not in
 * {@link WHEN_IT_MATTERS} with the other four. "Have I drawn a mana rock" is
 * answered the same way for every deck in the format; "can I pay for the cards
 * I chose" is not, and it is the question that actually differs between a
 * Goblin deck and a reanimator deck.
 *
 * So it is solved for magnitude, twice, and the larger answer wins:
 *
 *   1. THE DECK'S TOP END. The cards at or above the implied deck's upper
 *      quartile mana value have to reach the comfort point. A deck whose plan
 *      is two-drops has an upper quartile of three and needs nothing; a deck
 *      whose plan is seven-mana creatures needs enough acceleration to cast
 *      them, and that number comes out of the same hypergeometric rather than
 *      out of a table.
 *
 *   2. CASTING THE COMMANDER ON CURVE. The commander is the only card available
 *      every game and the one the other ninety-nine were chosen for, so a deck
 *      that cannot reach its cost has not been built. This used to be a floor
 *      on LANDS and that was the wrong place for it: casting a six-mana
 *      Muldrotha on turn six off lands alone needs forty-nine lands, and off
 *      lands plus a handful of accelerants it needs neither.
 *
 * The probe is a plain two-mana rock producing the deck's colours. Real ramp is
 * better than that (a Sol Ring makes two, a Cultivate fixes and ramps), so the
 * count this returns is conservative in the direction that matters: it never
 * demands fewer accelerants than the deck turns out to need.
 */
function solveRampFloor(input: RampSolveInput): { count: number; because: string } {
  const pips = pipsOf(input.implied);
  const commanderInput = toPlayability(input.commander, 1, true);
  const spells = Math.max(0, input.slots - input.landTarget);

  /*
   * Sampled, for the same reason the land solve samples: the top end of a cheap
   * deck can be half its list, and re-scoring thirty cards against twenty
   * candidate rock counts is six hundred hypergeometric solves inside an edge
   * function for a decision about one number.
   */
  const topEnd = curveSample(
    input.implied.filter(c => (Number.isFinite(c.cmc) ? c.cmc : 0) >= input.topCmc),
    RAMP_PROBES
  );
  const castCommander: PlayabilityCardInput | null = input.commander.manaCost
    ? toPlayability(input.commander, 1)
    : null;

  const measure = (rocks: number, probes: readonly PlayabilityCardInput[]): number => {
    const deck: PlayabilityCardInput[] = [
      commanderInput,
      ...provisionalBase(input.identity, input.usefulLands, input.landTarget, pips),
      ...(rocks > 0 ? [twoManaRock(rocks)] : []),
      ...input.implied.slice(0, Math.max(0, spells - rocks)).map(c => toPlayability(c, 1)),
    ];
    const profile = buildManaProfile(deck);
    let total = 0;
    let n = 0;
    for (const probe of probes) {
      const pct = cardPlayability(probe, profile).pct;
      if (pct === null) continue;
      total += pct;
      n += 1;
    }
    return n === 0 ? 100 : total / n;
  };

  const solve = (probes: readonly PlayabilityCardInput[]): number => {
    if (probes.length === 0) return 0;
    for (let rocks = 0; rocks <= Math.min(20, spells); rocks++) {
      if (measure(rocks, probes) >= CASTABILITY_COMFORT_PCT) return rocks;
    }
    return Math.min(20, spells);
  };

  const forTopEnd = solve(topEnd.map(c => toPlayability(c, 1)));
  const forCommander = castCommander ? solve([castCommander]) : 0;
  const count = Math.max(forTopEnd, forCommander);

  return {
    count,
    because:
      `Magnitude wants ${count}: ${forTopEnd} accelerants to make this deck's own top end ` +
      `(mana value ${input.topCmc.toFixed(1)} and up) castable at ` +
      `${CASTABILITY_COMFORT_PCT}% off ${input.landTarget} lands, and ${forCommander} to cast ` +
      `${input.commander.name} itself on curve. Presence wants one drawn by turn 3.`,
  };
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

/**
 * Whose job the doers are doing, said in the sentence a player reads.
 *
 * The archetype is named only when it actually contributed a want, and it is
 * named SECOND, which is the sentence saying what the combination rule does:
 * the shell modifies the commander's plan rather than standing in for it. When
 * the commander produced nothing the shell is named on its own, because
 * pretending the commander shaped the deck would be a false explanation for a
 * real number.
 */
function jobPhrase(input: ShapeInput): string {
  const arch = input.plan.archetype;
  if (!arch || arch.wants.length === 0) return `${input.commander.name}'s job`;
  if (arch.alone) {
    return (
      `the ${arch.name} shell's job (${input.commander.name}'s own record asks for nothing, ` +
      `so the archetype you picked is the whole plan)`
    );
  }
  return `${input.commander.name}'s job or the ${arch.name} shell's`;
}

function isLandLine(typeLine: string | null | undefined): boolean {
  return /\bland\b/i.test((typeLine ?? '').split('//')[0]);
}

function isCreatureLine(typeLine: string | null | undefined): boolean {
  const front = (typeLine ?? '').split('//')[0];
  return /\bcreature\b/i.test(front) && !/\bland\b/i.test(front);
}

function isInstantOrSorceryLine(typeLine: string | null | undefined): boolean {
  return /\b(instant|sorcery)\b/i.test((typeLine ?? '').split('//')[0]);
}

/**
 * How many of the cards that can fill the floors are creatures, in this pool.
 *
 * Counted, not assumed. Each role is weighted by its own floor, so a deck that
 * needs twelve ramp and four win conditions is shaped mostly by what ramp looks
 * like in these colours. A role with no card in the pool contributes nothing
 * rather than a guess, and a pool with none of any of them returns zero, which
 * is the honest answer when there is nothing to count.
 */
function functionShareOf(
  nonLand: readonly ShapeCard[],
  floors: Record<Role, number>
): number {
  let weighted = 0;
  let weight = 0;
  for (const role of ROLES) {
    const want = floors[role];
    if (want <= 0) continue;
    let serving = 0;
    let creatures = 0;
    for (const card of nonLand) {
      if (!cardRole(card, role)) continue;
      serving += 1;
      if (isCreatureLine(card.typeLine)) creatures += 1;
    }
    if (serving === 0) continue;
    weighted += want * (creatures / serving);
    weight += want;
  }
  return weight === 0 ? 0 : weighted / weight;
}

function shareOfCreatures(cards: readonly ShapeCard[]): number {
  if (cards.length === 0) return 0;
  return cards.filter(c => isCreatureLine(c.typeLine)).length / cards.length;
}

/** `edhrec_rank` is null on more than half the catalogue; null sorts last. */
function popRank(card: ShapeCard): number {
  return card.edhrecRank ?? Number.MAX_SAFE_INTEGER;
}

/** Popularity, then the oracle id. See the sort above for why not mana value. */
function byPopularity(cards: readonly ShapeCard[]): ShapeCard[] {
  return [...cards].sort((a, b) => popRank(a) - popRank(b) || a.oracleId.localeCompare(b.oracleId));
}

/**
 * The cards the land solve actually measures, spread across the curve.
 *
 * Measuring all sixty-four at every candidate land count is a few thousand
 * hypergeometric solves inside an edge function for a decision about one
 * number. Every third card of a list already ordered best-first keeps the
 * curve's shape — the mean mana value of the sample is within a tenth of the
 * whole list on every commander measured — and costs a twentieth of the time.
 */
function curveSample(implied: readonly ShapeCard[], size = CURVE_SAMPLE): ShapeCard[] {
  if (implied.length <= size) return [...implied];
  const step = implied.length / size;
  const out: ShapeCard[] = [];
  for (let i = 0; i < size; i++) out.push(implied[Math.floor(i * step)]);
  return out;
}

function toPlayability(card: ShapeCard, quantity: number, isCommander = false): PlayabilityCardInput {
  return {
    name: card.name,
    type_line: card.typeLine,
    mana_cost: card.manaCost,
    cmc: card.cmc,
    oracle_text: card.oracleText ?? null,
    color_identity: [...card.colorIdentity],
    quantity,
    isCommander,
  };
}

/**
 * The stand-in accelerant: a two-mana rock making any of the deck's colours.
 *
 * DELIBERATELY THE WEAKEST ONE. Real ramp is better than this — a Sol Ring
 * makes two, a Cultivate fixes as well as ramps, a Birds of Paradise costs one
 * — so a count solved against this stand-in is never fewer accelerants than the
 * deck turns out to need. Being wrong in the direction of "the deck can pay for
 * its cards" is the safe way to be wrong about mana.
 */
function twoManaRock(quantity: number): PlayabilityCardInput {
  return {
    name: 'two-mana rock',
    type_line: 'Artifact',
    mana_cost: '{2}',
    cmc: 2,
    oracle_text: '{T}: Add one mana of any color.',
    color_identity: [],
    quantity,
  };
}

/** A card that produces nothing, so the library is the right SIZE for the maths. */
function filler(quantity: number): PlayabilityCardInput {
  return {
    name: 'unchosen spells',
    type_line: 'Creature',
    quantity: Math.max(0, quantity),
    color_identity: [],
  };
}

/**
 * Basics held back per colour before any nonbasic is chosen.
 *
 * The same two as `BASIC_FLOOR_PER_COLOUR` in `generate.ts`, for the same
 * reason: "search your library for a basic land" needs a target left in every
 * colour. Repeated rather than imported because `generate.ts` imports this
 * module and the constant is one number.
 */
const BASIC_FLOOR_PER_COLOUR = 2;

const BASIC_FOR: Record<ManaColour, { name: string; type: string }> = {
  W: { name: 'Plains', type: 'Basic Land — Plains' },
  U: { name: 'Island', type: 'Basic Land — Island' },
  B: { name: 'Swamp', type: 'Basic Land — Swamp' },
  R: { name: 'Mountain', type: 'Basic Land — Mountain' },
  G: { name: 'Forest', type: 'Basic Land — Forest' },
};

/**
 * The mana base the solves measure against, built the way the real one is.
 *
 * WHY NOT BASICS. A spread of basics was the first version and it is badly
 * wrong for a multicolour deck: a Mardu card wants three specific colours, a
 * pile of basics gives each of them a third of the time, and the solve buys the
 * shortfall in LANDS. Edgar Markov came back wanting forty-six of them and
 * never peaked, which is not a mana base, it is a measurement of the wrong deck.
 * Real Mardu decks fix with Command Tower and shocklands, and those are sitting
 * in the pool this function was already handed.
 *
 * So it mirrors {@link pickLands} in `generate.ts`: two basics per colour held
 * back first — the same `BASIC_FLOOR_PER_COLOUR` rule, so "search for a basic"
 * always has a target — and the rest spent on real lands that produce one of
 * the deck's colours, most played first. That is not a guess about the mana
 * base; it is approximately the mana base, chosen off the same rows by the same
 * rule, and the numbers move together when either changes.
 *
 * It is still conservative in the one way that matters: `manaSourceFor` cannot
 * see that a land enters tapped, so a base of tri-lands reads as better than it
 * plays. That errs toward more lands rather than fewer, which is the safe
 * direction for a number deciding whether the deck can pay for its cards.
 */
function provisionalBase(
  identity: readonly string[],
  useful: readonly PlayabilityCardInput[],
  count: number,
  pips: Record<ManaColour, number>
): PlayabilityCardInput[] {
  if (count <= 0) return [];
  const colours = identity.filter(c => c in BASIC_FOR) as ManaColour[];
  const basicFloor = Math.min(count, colours.length * BASIC_FLOOR_PER_COLOUR);
  const room = count - basicFloor;
  if (room <= 0 || useful.length === 0) return basicSpread(identity, count, pips);

  const taken = useful.slice(0, room);
  const shortfall = room - taken.length;
  return [...basicSpread(identity, basicFloor + shortfall, pips), ...taken];
}

/**
 * The nonbasic lands this identity may play, best first, classified once.
 *
 * `manaSourceFor` reads oracle text with regexes and the land pool runs to a
 * thousand rows, so classifying it inside the solve's inner loop cost roughly
 * thirty thousand regex passes per build. It does not change while the solve
 * runs, so it is computed once here and the solves are handed the answer.
 */
function usefulLandsFor(
  identity: readonly string[],
  landPool: readonly ShapeCard[]
): PlayabilityCardInput[] {
  const mask = coloursToMask(identity);
  if (mask === 0) return [];
  return landPool
    .filter(card => {
      const source = manaSourceFor(toPlayability(card, 1), mask);
      return !!source && (source.colourMask & mask) !== 0;
    })
    .sort((a, b) => popRank(a) - popRank(b) || a.oracleId.localeCompare(b.oracleId))
    .map(card => toPlayability(card, 1));
}

/**
 * Basics in proportion to the pips the implied deck demands.
 *
 * Used for the two-per-colour floor above, and as the whole base when the pool
 * holds no useful nonbasic land.
 *
 */
function basicSpread(
  identity: readonly string[],
  count: number,
  pips: Record<ManaColour, number>
): PlayabilityCardInput[] {
  if (count <= 0) return [];
  const colours = identity.filter(c => c in BASIC_FOR) as ManaColour[];
  if (colours.length === 0) {
    return [{ name: 'Wastes', type_line: 'Basic Land — Wastes', oracle_text: '{T}: Add {C}.', quantity: count }];
  }
  const weights = colours.map(c => Math.max(0.0001, pips[c] ?? 0));
  const total = weights.reduce((n, w) => n + w, 0);
  const exact = weights.map(w => (w / total) * count);
  const floors = exact.map(Math.floor);
  let assigned = floors.reduce((n, f) => n + f, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - floors[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; assigned < count; k++, assigned++) floors[order[k % order.length].i] += 1;
  return colours
    .map((c, i) => ({ colour: c, n: floors[i] }))
    .filter(x => x.n > 0)
    .map(x => ({
      name: BASIC_FOR[x.colour].name,
      type_line: BASIC_FOR[x.colour].type,
      quantity: x.n,
      color_identity: [],
    }));
}

/** Coloured pips the implied deck demands, read through `parseManaCost`. */
function pipsOf(cards: readonly ShapeCard[]): Record<ManaColour, number> {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  for (const card of cards) {
    const cost = parseManaCost(card.manaCost);
    if (!cost) continue;
    for (const cls of cost.classes) {
      const colours = maskToColours(cls.mask);
      if (!colours.length) continue;
      for (const colour of colours) out[colour] += cls.count / colours.length;
    }
  }
  return out;
}

function evenPips(identity: readonly string[]): Record<ManaColour, number> {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  for (const c of identity) if (c in out) out[c as ManaColour] = 1;
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
