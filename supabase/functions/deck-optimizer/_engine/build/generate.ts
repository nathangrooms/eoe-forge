/**
 * The deck generator: build a legal deck out of the ranked pool.
 *
 * WHAT THIS REPLACES
 * ------------------
 * `supabase/functions/ai-deck-builder-v2` used to assemble a deck like this:
 *
 *   1. ask a language model to recall twenty card names from memory,
 *   2. fetch `.limit(8000)` rows from `cards` with no `order by`,
 *   3. string-match the model's names against that arbitrary slice,
 *   4. fill the rest with a private `scoreCard` heuristic: +4 mythic, +2 rare,
 *      `5 - cmc`, and +2 per keyword shared with the commander's oracle text.
 *
 * Measured against the live catalogue on 2026-08-19, step 2 returned 8,000 of
 * ~55,000 commander-legal PRINTINGS — 6,336 distinct cards, about a fifth of
 * the format — and that slice contained no Arcane Signet, no Command Tower and
 * no Doubling Season. So the model's names mostly matched nothing, the three
 * hardcoded staples mostly could not be found, and the deck was filled by
 * "cheap and rare" over whichever fifth of Magic the index scan happened to
 * reach first. That is why a generated Atraxa deck came back with no
 * proliferate cards and with Venom, Iron Spider, Vashta Nerada and Aang in it.
 *
 * WHAT IT DOES INSTEAD
 * --------------------
 * The same order of operations the optimiser already uses, in the same words:
 *
 *   RETRIEVE  the complete legal pool, never a slice (the caller's job; this
 *             module takes the pool as an argument and never fetches).
 *   RANK      every card with `advise/rank.ts` — the SAME `scoreCandidate`
 *             that ranks additions in the optimiser and orders cuts in
 *             `evaluate.ts`. There is no second scoring function here.
 *   GROUND    a model may only reorder cards that are already in the ranked
 *             pool, and it says so in the type: `preferOracleIds`, not names.
 *             A name a model recalled cannot enter this function.
 *   VALIDATE  the caller still checks the result; `evaluateDeck` is returned
 *             alongside it so what the deck IS and how good it is come from
 *             one computation.
 *
 * PLAYABILITY DRIVES IT, IT DOES NOT DECORATE IT
 * ----------------------------------------------
 * The mana base is chosen FIRST, and every spell is then ranked against that
 * real mana base. `rank.ts` weights castability at 2.5 and refuses outright
 * (`cannot-cast`) below 25%, so a card this deck could not reliably pay for is
 * never picked rather than picked and apologised for afterwards. The exact
 * multivariate hypergeometric in `playability/castability.ts` is what answers
 * that question; nothing here approximates it.
 *
 * Pure. No network, no AI, no database.
 */

import type { CandidateCard, DeckCard, DeckProfile, Role } from '../core/types.ts';
import { ROLES } from '../core/types.ts';
import type { EngineCard, EngineDeckEntry } from '../core/card.ts';
import { deriveDeckProfile } from '../advise/profile.ts';
import { rankCandidates, scoreCandidate } from '../advise/rank.ts';
import { cardRole, styleFor, type DeckStyle } from '../advise/roles.ts';
import { worksAgainstPlan } from '../knowledge/behaviour.ts';
/* Identity only. Legality is settled by the pool query before a card ever
   reaches this module, so re-testing it here would be a second opinion about
   something already decided. */
import { withinIdentity } from '../advise/query.ts';
import { planFit } from '../knowledge/behaviour.ts';
import { TYPE_TAGS, LOW_INFORMATION_TAGS } from '../knowledge/tag-signal.ts';
import { deriveDeckShape, type DeckShape } from './shape.ts';
import { normalizeIdentity } from '../advise/query.ts';
import {
  facetBackground,
  facetCoverage,
  planForArchetype,
  planForCommander,
  withArchetype,
  type ArchetypeInfluence,
  type ArchetypeInput,
  type ArchetypePlan,
  type CommanderPlan,
} from '../knowledge/behaviour.ts';
import {
  buildManaProfile,
  coloursToMask,
  manaSourceFor,
  maskToColours,
  parseManaCost,
  type ManaColour,
  type ManaProfile,
  type PlayabilityCardInput,
} from '../playability/castability.ts';
import { chooseCuts } from '../advise/cuts.ts';
import { evaluateDeck, type DeckEvaluation } from '../evaluate.ts';

/* ------------------------------------------------------------------ *
 * The colour floor
 * ------------------------------------------------------------------ */

/**
 * How many of the nonland slots must carry one of the commander's colours.
 *
 * DECLARED POLICY, in the same shape and for the same reason as
 * `CREATURE_TARGETS` in `advise/roles.ts`: a number the product chose, written
 * down where it can be argued with rather than buried in a scoring weight.
 *
 * Half. A Commander deck with 35 lands has 64 nonland slots, and half of them
 * is the point below which the deck stops being a deck in those colours: it
 * still leaves room for the thirty-odd artifacts a genuine artifact deck wants,
 * and it is far enough under the fifty-plus coloured cards an ordinary
 * two-colour list runs that it can never be the binding constraint for one.
 *
 * A colourless commander returns 0 and the pass never runs.
 */
export const COLOURED_FLOOR_SHARE = 0.5;

export function colouredFloorFor(identity: readonly string[], spellSlots: number): number {
  if (identity.length === 0) return 0;
  return Math.floor(spellSlots * COLOURED_FLOOR_SHARE);
}

/** Does this card carry any colour at all? Colour identity, not the mana cost. */
function hasColour(card: { colorIdentity?: readonly string[] | null }): boolean {
  return (card.colorIdentity ?? []).length > 0;
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/**
 * A pool card, plus the two columns the ranker does not need and the mana
 * base does.
 *
 * `oracleText` is what tells a Command Tower from a Rogue's Passage: colour
 * identity cannot, because Command Tower's identity is empty and it still taps
 * for every colour you play. The caller fetches it for LANDS ONLY — the whole
 * point of `selectColumns` leaving it out is that a 30,000-row pool does not
 * need it — and the generator says so by leaving the field optional.
 */
export interface BuildCard extends CandidateCard {
  oracleText?: string | null;
  /**
   * The card's faces, for the multi-face layouts.
   *
   * `oracle_text` is NULL on every transform, modal DFC, split, adventure and
   * prepare card, so a double-faced commander arrives with no text at all and
   * the plan concludes it says nothing. Fetched for the deck's own cards only,
   * never for the pool, for the same width reason as `oracleText` above.
   */
  faces?: readonly { oracle_text?: string | null }[] | null;
  keywords?: readonly string[] | null;
}

/** The five colours a basic land can be, plus the colourless case. */
export type BasicColour = ManaColour | 'C';

export interface GenerateDeckInput {
  format?: string;
  /** The commander. Its tags seed the synergy signal for the whole build. */
  commander: BuildCard;
  /**
   * Every legal card in the commander's identity. NOT a slice.
   *
   * Lands in here must carry `oracleText`, or the mana base is chosen blind.
   * Basic lands may be present or absent; they are excluded either way, by
   * `NEVER_SUGGEST_TAGS` in the ranker, and supplied through `basics`.
   */
  pool: readonly BuildCard[];
  /** Basic lands with real database ids, by colour. */
  basics: Readonly<Partial<Record<BasicColour, BuildCard>>>;
  /** Cards in the deck excluding the commander. 99 for Commander. */
  slots?: number;
  /**
   * A land count the CALLER insists on. Leave it out, which is the normal case.
   *
   * Omitted, the land count is solved per commander against the curve its own
   * plan implies — see `build/shape.ts`. Supplying a number here overrides that
   * solve, and the shape reports both so a caller can see what it overruled.
   * `pipeline.ts` used to pass 35 unconditionally, which meant every deck in
   * the format ran 35 lands whatever it was made of.
   */
  landTarget?: number;
  /**
   * Role counts the CALLER insists on. Leave it out, which is the normal case.
   *
   * Same rule as `landTarget`: the floors are derived per commander and an
   * explicit number is a caller who knows what they want.
   */
  roleTargets?: Partial<Record<Role, number>>;
  /**
   * The deck style the user picked: `creatures`, `balanced` or `spells`.
   *
   * A TILT, no longer a number. It used to set the creature floor outright —
   * 32, 24 or 12 — and that is one of the fixed numbers this engine no longer
   * holds: the creature count is derived from what the commander's own record
   * asks for, and the style moves that derived share a quarter in either
   * direction. So creature mode makes a Talrand deck a little more creature
   * heavy than Talrand implies and cannot make Talrand a creature deck, which
   * is right, because Talrand is not one.
   *
   * An unrecognised name falls back to `balanced` and says so; it never throws,
   * because this arrives from a request body and a bad style must still produce
   * a deck.
   */
  style?: DeckStyle | string | null;
  /**
   * The archetype the player asked for, as the cards that shell is made of.
   *
   * NOT A NAME. `aristocrats` means nothing to the engine and a table turning
   * it into something would be somebody's opinion frozen in a column. The
   * caller resolves the shell's card names against the catalogue, reads each
   * one with the same producer that reads the pool, and hands the facets over;
   * `planForArchetype` works out what the shell wants from what its own cards
   * do, and `withArchetype` folds that into the commander's plan as a modifier.
   *
   * Absent, which is the normal case for an optimiser or a test, and the build
   * is shaped by the commander alone exactly as before.
   */
  archetype?: ArchetypeInput | null;
  /** Whole-deck price ceiling in USD, or null for no ceiling. */
  budgetUsd?: number | null;
  /**
   * Oracle ids a planner asked for.
   *
   * Deliberately ids and not names. A name is something a model can invent; an
   * oracle id can only have come from a row this function was handed, so the
   * grounding is enforced by the signature rather than by a prompt.
   */
  preferOracleIds?: readonly string[];
  avoidOracleIds?: readonly string[];
}

/**
 * `refined` is a card a refinement round swapped IN, replacing one the deck-aware
 * evaluation ranked worst. Kept distinct from `commander` and `flex` so a
 * decklist can be read for what each pass decided.
 */
export type Bucket = 'land' | 'basic' | Role | 'flex' | 'commander' | 'refined';

/** Where the deck's picks came from: behaviour records, or the old tag words. */
export interface BuildEvidence {
  /** The plan read off the commander, or null when its record was empty. */
  plan: CommanderPlan | null;
  /**
   * The archetype shell that was folded into that plan, or null.
   *
   * Carried separately from `plan.archetype` so a caller can tell "no archetype
   * was asked for" from "one was asked for and its cards produced nothing".
   * The second happens: a shell whose cards the catalogue cannot resolve, or
   * whose cards the compiler cannot read, has no wants to contribute, and a
   * response that showed only the merged plan would look identical either way.
   */
  archetype: ArchetypePlan | null;
  /** Pool cards carrying an ability record, and the pool size. */
  poolWithRecord: number;
  poolSize: number;
  /** Chosen nonland cards carrying an ability record, and how many were chosen. */
  pickedWithRecord: number;
  pickedSpells: number;
  /** The style asked for, and the one used. They differ when the name was unknown. */
  styleAsked: string | null;
  styleUsed: DeckStyle;
  /**
   * How many of each thing this commander asked for, and why.
   *
   * The replacement for the role-target table, carried out to the caller so the
   * numbers a deck was built to can be read beside the deck. `shape.because`
   * holds one sentence per number, each built from what produced it.
   */
  shape: DeckShape;
}

export interface GeneratedEntry {
  card: BuildCard;
  quantity: number;
  /** The engine's own signal sentence. Never model text, never invented. */
  reason: string;
  score: number;
  bucket: Bucket;
  /** True when a planner asked for this card from the ranked shortlist. */
  preferred: boolean;
}

export interface GeneratedDeck {
  entries: GeneratedEntry[];
  /** Copies, not rows. A 99-card deck lives in far fewer than 99 entries. */
  totalCopies: number;
  landCopies: number;
  spellCopies: number;
  totalUsd: number;
  manaProfile: ManaProfile;
  roleFill: Record<Role, { picked: number; target: number }>;
  /** Quotas the pool could not fill. Reported, never papered over. */
  shortfalls: string[];
  /** What happened, in numbers, for the change log. */
  notes: string[];
  /** Score, castability, profile and cut order from ONE computation. */
  evaluation: DeckEvaluation;
  /**
   * How much of this build was behaviour and how much was still word matching.
   *
   * Returned rather than logged, because the fallback to tags is invisible from
   * the outside and a caller that cannot see it cannot tell a deck the engine
   * reasoned about from a deck it pattern-matched.
   */
  evidence: BuildEvidence;
}

/* ------------------------------------------------------------------ *
 * Declared policy
 * ------------------------------------------------------------------ *
 *
 * These are CHOICES, written down so they can be argued with, not
 * measurements. The role targets themselves are not here: they come from
 * `roles.ts`, which already declares them for the whole engine.
 */

/** Cards in a Commander deck besides the commander. A rule, not a policy. */
const COMMANDER_SLOTS = 99;

/**
 * Basic lands held back before anything else, by how many colours the deck plays.
 *
 * WAS TWO PER COLOUR, AND THAT PRODUCED DECKS THAT CANNOT WORK. Measured on a
 * generated Adeline deck, mono white: 9 fetchlands, 4 of them Plains-only, and
 * the deck held TWO Plains. Seven of those fetches find nothing. Ghalta spent
 * $119 on green fetches over two Forests. Yuriko ran 11 fetchlands and 4 basics.
 *
 * The floor was reserved BEFORE the lands are chosen, so it could not know how
 * many of them would want a basic, and two per colour left every remaining slot
 * to nonbasics. A mono-coloured deck reserved two lands and filled thirty-three.
 *
 * Against the 192 real Commander decklists in `meta_decks`, the median basic
 * count is NINETEEN. These numbers are read off that rather than reasoned from
 * first principles, and they fall with colour count for the reason every player
 * knows: a five colour deck needs its lands to fix, and a mono coloured deck
 * has nothing to fix, so its lands may as well be untapped and free.
 *
 * It is still a FLOOR. A deck that wants more basics than this gets them; this
 * only stops the mana base being sold off for fetchlands that find nothing.
 */
function basicFloorFor(colours: number): number {
  if (colours <= 1) return 12;
  if (colours === 2) return 9;
  if (colours === 3) return 7;
  if (colours === 4) return 6;
  return 5;
}

/**
 * How wide a shortlist the later passes re-rank.
 *
 * The first ranking sees the whole pool. Passes two and three re-rank only the
 * top of it, because re-scoring 30,000 rows three times inside an edge function
 * is minutes of hypergeometric solving for a decision about 63 cards. A card
 * outside the best 1,500 at the seed profile is not going to climb into the
 * best 63 once the deck has cards in it, and this is the one place the module
 * trades exactness for time — deliberately, and in the open.
 */
const SHORTLIST = 1500;

/**
 * Minimum sources per colour the mana base aims for.
 *
 * The conventional Commander figure, and the number the basics allocation is
 * pushed toward when the nonbasic lands leave a colour short. It is a target,
 * not a guarantee: a pool with no fixing cannot be made to fix.
 */
const MIN_SOURCES_PER_COLOUR = 10;

/**
 * How hard this module leans on EDHREC popularity.
 *
 * WAS 2.0. NOW THE OPTIMISER'S OWN 0.8, AND THE CHANGE IS THE POINT.
 *
 * The 2.0 was a patch on a hole that has since been filled. The argument for it
 * ran: against a profile seeded with the commander alone every role is equally
 * short, so role-gap contributes the same 3.0 to every card carrying any role
 * TAG, and everything left rewards being cheap and colourless. That was true,
 * and popularity was the only thing left to break the tie with.
 *
 * Two things then made it false.
 *
 *   1. Roles come from ability records now, not from tags, so "carries any role
 *      tag" is no longer a club anyone can join. Bone Saw's record is a static
 *      +1/+0 and an `attach`; it matches no role, so it collects no role-gap at
 *      all, where the `voltron` tag used to make it a win condition. Sol Ring's
 *      record contains `add-mana`, so Sol Ring is still ramp.
 *   2. `commander-fit` gives the seed profile something real to separate cards
 *      by, which is what popularity was standing in for.
 *
 * Leaning on popularity was also actively harmful given the data: measured on
 * 2026-08-23, `edhrec_rank` is populated on only 13,440 of 33,032 `cards_unique`
 * rows and is NULL for Sol Ring, Swords to Plowshares and Rhystic Study while
 * Bone Saw carries rank 6,734. At 2.0 that gap was worth 1.4 points to Bone Saw
 * and nothing to Sol Ring. Weighting a column that is missing on the best cards
 * in the format is not a tie-break, it is a bias toward whatever the sync
 * happened to reach.
 *
 * Still below `WEIGHTS.playability` by the standing rule: a card this deck
 * cannot cast is a bad card for this deck however many others play it.
 * `rank.ts` clamps it there as well, so the rule survives someone editing this
 * constant.
 *
 * RAISED TO 2.4 ON 2026-08-29, BECAUSE THE MEASUREMENT ABOVE STOPPED BEING
 * TRUE. Everything argued above was right when it was written. The third
 * paragraph is the load-bearing one: `edhrec_rank` was populated on 13,440 of
 * 33,032 rows and was NULL for Sol Ring, Swords to Plowshares and Rhystic Study
 * while Bone Saw carried 6,734, so weighting it was a bias toward whatever the
 * sync had reached rather than toward what people play.
 *
 * The sync has since filled the column and nobody came back to the weight.
 * Re-measured today:
 *
 *   rows with a rank   13,440 of 33,032  ->  32,067 of 33,032   (97.1%)
 *   Sol Ring                       NULL  ->  1
 *   Arcane Signet                  NULL  ->  3
 *   Swords to Plowshares           NULL  ->  11
 *   Skullclamp                     NULL  ->  40
 *   Bone Saw                      6,734  ->  6,727
 *
 * The column now ranks exactly the cards a Commander player expects at the top,
 * and the argument for discounting it is gone with the nulls.
 *
 * WHY IT MATTERS THIS MUCH TO THIS CALLER, and why 0.8 is still right for the
 * optimiser. Building from an EMPTY deck there is nothing to synergise with, so
 * `tagSynergy` has no signal; every role is maximally short, so `roleGap` pays
 * the same 3.0 to anything carrying that role; and `commander-fit` is silent
 * for the 23% of commanders whose text we cannot read. Popularity is then the
 * only evidence left about whether a card is any good, and it was the smallest
 * weight in the table.
 *
 * The cost was measurable and a player saw it immediately. A generated Krenko
 * deck contained ONE of nineteen cards a Krenko player would call obvious: no
 * Sol Ring, no Goblin Chieftain, no Purphoros, no Shared Animosity, no
 * Skullclamp, and fifteen cards ranked worse than 10,000th.
 *
 * 2.4 rather than the old 2.0: it has to beat `tagSynergy` (2.0), which on an
 * empty deck is measuring against nothing, while staying under `playability`
 * (2.5), which the standing rule above requires.
 */
/*
 * MEASURED BACK TO 2.4 on 2026-08-30, and the paragraph above is why it should
 * never have been anything else: its own argument ends "2.4 rather than the old
 * 2.0", and the constant underneath it said 1.8. The value drifted down when
 * EMPTY_DECK_COMMANDER_FIT went to 3.6 and nobody re-read the sentence that
 * says popularity has to beat tagSynergy (2.0).
 *
 * The cost showed up as exactly the complaint the owner relayed, "there are
 * cards he would absolutely never include". Six decks, same commanders, same
 * pool, only this number moved:
 *
 *              median edhrec_rank                        past 15,000  staples  orphans
 *   1.8   6696 / 4484 / 4400 / 1551 / 2219 / 5090             26       30/54      3
 *   2.4   5941 / 2446 / 4077 / 1528 / 1923 / 3412             16       31/54      2
 *   3.0   5483 / 1711 / 4077 / 1528 / 1878 / 3412             16       31/54      2
 *
 * Commander fit paid one point of keyed synergy for it, 85% to 84%, which is
 * the trade being made deliberately: a card ranked 14,050th carrying one
 * matching facet is not a better answer than a card ranked 400th carrying the
 * same one.
 *
 * 3.0 measures no better and breaks the standing rule above by passing
 * playability (2.5), so it is not taken. rank.ts clamps it there anyway; a
 * value that relies on being clamped is a value that lies about itself.
 */
const EMPTY_DECK_POPULARITY = 2.4;

/**
 * How hard a build from nothing leans on the commander's own plan.
 *
 * ABOVE `roleGap` (3.0), which is the change that matters and the one a player
 * asked for: "it needs to understand the commander and find cards that
 * synergise and complement it, rank cannot be the answer."
 *
 * They are right, and the weights said otherwise. Filling a role quota paid
 * 3.0, fitting the commander paid 2.2, so a card that ticked a box beat a card
 * that did what the commander does. Building from an empty deck that is
 * backwards twice over, because with no cards on the table every role is
 * equally short and `roleGap` pays the same 3.0 to everything carrying a role
 * at all. It was the largest weight and the least discriminating.
 *
 * Popularity is 1.2 rather than the 2.4 it was briefly raised to. Raising it
 * did improve the measurable quality, median rank 2,695 to 2,092, and that was
 * still the wrong lever: it makes "what other people play" the driver, which
 * produces a deck of staples that has nothing to do with the commander. It is
 * a tie-break between cards that fit equally well, which is what it was always
 * meant to be, and now it sits below the plan rather than beside it.
 */
const EMPTY_DECK_COMMANDER_FIT = 3.6;

/* ------------------------------------------------------------------ *
 * The generator
 * ------------------------------------------------------------------ */

/**
 * Cards every Commander deck runs, whatever the commander.
 *
 * The owner, 3 Sep 2026: *"sol ring should be in every deck - its a staple no
 * deck can live without."* Sol Ring is the most played card in the format and
 * Arcane Signet the third, and both are colourless, so there is no deck they
 * cannot go in. Before this they were merely very likely: Chulane's Sol Ring
 * arrived in review round three, replacing Kodama's Reach, because the ramp
 * floor had been filled by mana creatures the plan wanted more. A card the
 * whole format agrees on is not something a ranker should have to rediscover
 * per deck. They are PREFERRED, the same mechanism a caller uses to ask for a
 * card by name: taken first, never cut, and the deck says so.
 */
const FORMAT_STAPLE_NAMES: ReadonlySet<string> = new Set(['Sol Ring', 'Arcane Signet']);

export function generateDeck(input: GenerateDeckInput): GeneratedDeck {
  const format = (input.format ?? 'commander').toLowerCase();
  const slots = input.slots ?? COMMANDER_SLOTS;

  /*
   * READ THE COMMANDER, before anything is ranked against it.
   *
   * Everything downstream is measured against this plan, so it is the first
   * thing computed and it is computed from the commander's own ability record.
   * A commander with no record returns a plan with no wants, the commander-fit
   * signal never fires, and the build falls back to the behaviour it had
   * before — visibly, through `evidence.plan.fromTagsOnly`, rather than
   * silently.
   */
  const commanderPlan = planForCommander({
    name: input.commander.name,
    typeLine: input.commander.typeLine,
    facets: input.commander.facets ?? null,
    tags: input.commander.tags,
    /* Read only when the compiled facets produce no wants. 17% of the 400
       most-built commanders were in that state, Teysa and Muldrotha among
       them, and got a deck with no commander in it. */
    oracleText: input.commander.oracleText ?? null,
    /* And the faces, because `oracleText` is NULL for every double-faced
       legend and without this they all read as cards that say nothing.
       Measured: 31.7% of all commander silence was this one field. */
    faces: input.commander.faces ?? null,
  });

  /*
   * THEN THE ARCHETYPE, ON TOP OF THE COMMANDER RATHER THAN INSTEAD OF IT.
   *
   * `request.archetype` used to reach the language model's prompt and nothing
   * else, so the same commander built the same ninety-nine cards whichever
   * strategy the player picked. `planForArchetype` reads the shell's own cards
   * the way `planForCommander` reads the commander's, and `withArchetype`
   * places the shell's loudest want below the commander's loudest so an
   * Aristocrats Krenko is still a Goblin deck. Everything downstream reads one
   * plan and needs to know nothing about archetypes: the ranker, the creature
   * share, the implied curve and the land solve all move because the wants
   * moved.
   */
  /*
   * The shell is read AGAINST THIS POOL, not in the abstract, and that is what
   * keeps a want from ranking everything. `cares:type:creature` is on five of
   * the Aristocrats shell's twelve cards and on 21% of every card a mono-red
   * commander may play, so it separates nothing; `trig:dies` is on four of the
   * twelve and 2.6% of the pool, so it separates a deck. See
   * `planForArchetype`. The lands are left out because the wants are used to
   * pick spells and to measure what share of the deck has a body; the mana base
   * is chosen with no plan at all.
   */
  const archetypePlan = input.archetype
    ? planForArchetype(
        input.archetype,
        facetBackground(
          input.pool.filter(c => !isLandCandidate(c)),
          slots
        )
      )
    : null;
  const plan = withArchetype(commanderPlan, archetypePlan);

  const style = styleFor(input.style ?? null);
  const identity = normalizeIdentity(input.commander.colorIdentity);
  const preferred = new Set(input.preferOracleIds ?? []);
  const avoided = new Set(input.avoidOracleIds ?? []);

  /*
   * THEN DERIVE THE SHAPE, and this is where the table used to be.
   *
   * `roleTargetsFor` returned ramp 10, draw 10, removal 8, interaction 4,
   * wincon 3, land 36 and a creature floor of 24 for every commander in the
   * format. It is not called from here any more. `deriveDeckShape` reads the
   * plan above against the real pool and answers the same questions per
   * commander: how many of the cards that do THIS commander's job are
   * creatures, how many lands does the curve those cards imply actually need,
   * and how few of each other job can a 99-card deck hold and still expect to
   * have drawn one. Everything it returns carries the sentence that produced
   * it, in `shape.because`.
   */
  const shape = deriveDeckShape({
    slots,
    commander: input.commander,
    plan,
    identity,
    pool: input.pool,
    style: input.style ?? null,
    landTarget: input.landTarget ?? null,
    roleTargets: input.roleTargets ?? null,
  });

  const landTarget = shape.landTarget;
  /*
   * The floors, plus the two roles the floors deliberately do not hold.
   *
   * `land` is the solved count and `creature` is the derived target. Both are
   * put back on this record because the ranker measures a role GAP against it:
   * a deck that wants forty creatures should rank creatures higher than a deck
   * that wants six, and that is exactly the difference this number carries.
   */
  /* A TRIBAL DECK IS A CREATURE DECK. Giada, Font of Hope's Angels were 7 of
     20 with the creature floor at 19, because half of those nineteen slots
     went to the Angel-matters payoffs the plan also wants. Every human tribal
     list runs the tribe first and the payoffs around it; twenty-six is the
     low end of what they run. */
  const tribalFloor = commanderPlan.tribe ? 26 : 0;
  const targets = {
    ...shape.roleFloors,
    land: landTarget,
    creature: Math.max(shape.creatureTarget, tribalFloor),
  } as Record<Role, number>;

  const notes: string[] = [];
  const shortfalls: string[] = [];

  /*
   * The same options for every pass, so the three rankings differ only in the
   * profile they are measured against.
   *
   * `preferBudget` is deliberately NOT set from `budgetUsd`. The budget here is
   * a ceiling on the WHOLE deck, and `trimToBudget` enforces it exactly at the
   * end. Turning it into a per-card preference as well would pay for the same
   * constraint twice, and the second payment is the damaging one: it adds up to
   * a full point for being cheap to every card in the pool, which on a $500
   * budget that a $53 deck never approaches is a pure bias toward junk.
   */
  const rankOptions = {
    popularityWeight: EMPTY_DECK_POPULARITY,
    commanderFitWeight: EMPTY_DECK_COMMANDER_FIT,
  };

  const pool = input.pool.filter(c => !avoided.has(c.oracleId) && c.oracleId !== input.commander.oracleId);

  /* ---------------------------------------------------------------- *
   * 1. The mana base, before anything that has to be cast off it.
   * ---------------------------------------------------------------- */

  const basicFloor = basicFloorFor(identity.length);
  const nonBasicRoom = Math.max(0, landTarget - basicFloor);

  const landPool = pool.filter(isLandCandidate);
  /*
   * A LAND IS PICKED FOR THE MANA IT MAKES, NOT FOR A WORD IT SHARES WITH THE
   * COMMANDER, so the land seed carries neither tags nor the plan.
   *
   * Only the land quota is short, so the role-gap signal is about lands and
   * nothing else. An Evolving Wilds is tagged `ramp` too, and crediting that
   * here would rank fixing against a ramp quota it is not being asked to fill.
   * That much was already true. What was not, and what
   * `scratch/refute-lands.mjs` measured on 2026-08-23:
   *
   * With the commander's tags in the seed, every land that shares any tag with
   * the commander collects `tag-synergy` of about 0.70, and the ENTIRE
   * popularity spread across 641 Mardu lands is 0.11 to 0.75. So one shared
   * word outweighs the whole of the only evidence we hold about which lands
   * people actually play. Ranking Edgar Markov's lands that way put Field of
   * the Dead, Castle Ardenvale, Abandoned Air Temple, Dark Depths and Adagia,
   * Windswept Bastion in the top eight and Command Tower at 41, Godless Shrine
   * at 81 and Blood Crypt at 83. Kaalia of the Vast has the same three colours
   * and no plan, so nothing fired for her and the same code returned Command
   * Tower, Exotic Orchard, Evolving Wilds, Bojuka Bog, Flooded Strand, Godless
   * Shrine and Blood Crypt in that order. Same colours, same pool, same
   * function: the deck with a working commander plan got the worse mana base.
   * Measured castability on curve for the Edgar deck, before and after this
   * line: 62% and 75%. Both Mardu decks now get the same mana base, which is
   * the right answer: a mana base is a function of the colours, and two decks
   * in the same three colours wanting different lands was the symptom.
   *
   * The cost is real and small: Cavern of Souls is a genuinely better land in
   * Edgar's deck than in most, and this cannot see that any more. It is still
   * picked, because it is the 15th most played land in these colours, and a
   * signal that promotes Dark Depths over Command Tower is not paying for
   * itself.
   */
  const seedForLands = seedProfile(
    format,
    identity,
    { ...input.commander, tags: [], facets: null },
    null,
    { ...zeroRoleTargets(), land: landTarget },
    null,
    // A land is picked for the mana it makes, and that is as true of the
    // archetype as it is of the commander. See the note above.
    null
  );

  const rankedLands = rankCandidates(landPool, seedForLands, rankOptions);
  const chosenLands = pickLands(rankedLands, preferred, nonBasicRoom, identity);

  const commanderInput = toPlayabilityInput(input.commander, 1, true);
  const landInputs = chosenLands.map(r => toPlayabilityInput(r.card as BuildCard, 1));

  /*
   * A library of the right SIZE, before the spells exist.
   *
   * `castability` divides by `librarySize`, so building the profile from 36
   * lands alone would present a 36-card deck with a 36-land mana base and rate
   * everything castable. The spells are not chosen yet, so they stand in as
   * cards that produce nothing — which is what all but the handful of rocks
   * among them will in fact be. That understates the deck's mana slightly and
   * never overstates it, which is the right direction for a gate.
   */
  const provisionalDeck: PlayabilityCardInput[] = [
    commanderInput,
    ...landInputs,
    ...basicPlaceholders(identity, input.basics, landTarget - chosenLands.length),
    {
      name: 'unchosen spells',
      type_line: 'Creature',
      quantity: Math.max(0, slots - landTarget),
      color_identity: identity,
    },
  ];
  const provisionalMana = buildManaProfile(provisionalDeck);

  /* ---------------------------------------------------------------- *
   * 2. Role quotas, ranked against that mana base.
   * ---------------------------------------------------------------- */

  const spellSlots = Math.max(0, slots - landTarget);

  /*
   * ONE ROLE SET PER CARD, for the whole build.
   *
   * `cardRole` is asked eight times per card by `neediestRole` alone, and again
   * by the staple pass, the short-role top-up and the creature floor. On a
   * five-colour commander the pool is the whole catalogue, so that is well over
   * a hundred thousand calls, each one walking the facet list and then the tag
   * fallback. Najeela came back WORKER_RESOURCE_LIMIT.
   *
   * A card's roles are a pure function of its facets, tags and type line, none
   * of which change during a build, so the second answer can never differ from
   * the first.
   */
  const roleMemo = new Map<string, Set<Role>>();
  const rolesOf = (card: BuildCard): Set<Role> => {
    let roles = roleMemo.get(card.oracleId);
    if (!roles) {
      roles = new Set(ROLES.filter(role => cardRole(card, role)));
      roleMemo.set(card.oracleId, roles);
    }
    return roles;
  };

  /*
   * ONE `planFit` PER CARD, for the whole build.
   *
   * Three places ask it and two of them walk the entire ranked pool. On a
   * five-colour commander that pool is the catalogue, so the answer was being
   * computed about thirty thousand times, and Najeela came back
   * WORKER_RESOURCE_LIMIT — a five-colour deck that had built in 4.4 seconds on
   * 30 Aug stopped building at all.
   *
   * `planFit` is a pure function of the plan and the card's facets and the plan
   * does not change during a build, so the second call can never differ from
   * the first. Keyed on `oracleId` because the pool is deduped by it already.
   */
  const fitMemo = new Map<string, ReturnType<typeof planFit>>();
  const fitOf = (card: BuildCard) => {
    let hit = fitMemo.get(card.oracleId);
    if (!hit) {
      hit = planFit(commanderPlan, card);
      fitMemo.set(card.oracleId, hit);
    }
    return hit;
  };

  const spellPool = pool.filter(c => !isLandCandidate(c));

  /*
   * THE COMMANDER'S OWN PLAN, and the archetype BESIDE it rather than inside it.
   *
   * `plan` is the merged list and it is what `deriveDeckShape` measured the
   * composition against, because a card that does either job is a card this
   * deck is made of. Ranking is the other question, and there the two have to
   * stay apart so they can be added: see `withArchetype` for the measurement
   * that made that necessary and `rank.ts` for the addition.
   */
  const roleProfile = seedProfile(
    format,
    identity,
    input.commander,
    provisionalMana,
    {
      ...targets,
      land: 0, // lands are done; a land quota here would re-open it
    },
    commanderPlan,
    plan.archetype ?? null
  );
  if (format === 'commander') {
    const staples: string[] = [];
    for (const c of spellPool) {
      if (!FORMAT_STAPLE_NAMES.has(c.name) || avoided.has(c.oracleId) || preferred.has(c.oracleId)) continue;
      preferred.add(c.oracleId);
      staples.push(c.name);
    }
    if (staples.length) notes.push(`${staples.join(' and ')} go in every Commander deck`);
  }
  const rankedSpells = rankCandidates(spellPool, roleProfile, rankOptions);

  const shortlist = rankedSpells.slice(0, SHORTLIST).map(r => r.card as BuildCard);

  const picked: GeneratedEntry[] = chosenLands.map(r => ({
    card: r.card as BuildCard,
    quantity: 1,
    reason: r.reason,
    score: r.score,
    bucket: 'land' as Bucket,
    preferred: preferred.has(r.card.oracleId),
  }));

  const takenOracleIds = new Set(picked.map(e => e.card.oracleId));

  /* The commander's own themes, as the tag ranker sees them. Used to keep the
     staples pass off anything the synergy pass can explain. */
  const commanderThemes = new Set(
    (input.commander.tags ?? []).filter(tag => !TYPE_TAGS.has(tag) && !LOW_INFORMATION_TAGS.has(tag))
  );

  const roleFill = {} as Record<Role, { picked: number; target: number }>;
  for (const role of ROLES) roleFill[role] = { picked: 0, target: role === 'land' ? landTarget : targets[role] };
  roleFill.land.picked = chosenLands.length;

  /* ---------------------------------------------------------------- *
   * 1b. THE CARDS EVERY DECK PLAYS, before the ones this deck plays.
   * ---------------------------------------------------------------- *
   *
   * A player looked at a generated Krenko deck and said the cards do not
   * complement the commander. Fixing that, by putting commander-fit above the
   * role quotas, took Goblins from 15 to 27 and took format staples to ZERO.
   * Sol Ring, Skullclamp, Lightning Greaves, Arcane Signet: none of them made
   * the deck, and every one is in the large majority of real Krenko lists.
   *
   * Both readings are right, and that is the point. Sol Ring is not in 82% of
   * Krenko decks because it synergises with Krenko. It is there because it is
   * the best card in the format and it goes in every deck regardless of what
   * the commander does. Synergy cannot explain it and should not have to.
   *
   * ONE RANKER WAS BEING ASKED TWO QUESTIONS. "What does this commander want"
   * and "what does every deck want" are different, and with a single score the
   * larger weight simply won: at commanderFit 2.2 the deck was 25 Treasure
   * cards and no Goblins, and at 3.6 it was 27 Goblins and no Sol Ring. Tuning
   * between them trades one complaint for the other, which is what tuning it
   * twice actually did.
   *
   * So a small number of slots are settled first, on QUALITY rather than fit,
   * exactly as a person builds: a handful of auto-includes, then sixty cards
   * chosen for the commander. Deliberately small. These slots are taken away
   * from the commander's deck, so every one past the obvious few makes the
   * deck less about the commander, which is the complaint this began with.
   *
   * Chosen by `edhrec_rank` alone within a role, because that is the only
   * evidence we hold about which card a format actually plays, and here it is
   * being asked the one question it can answer: not "is this good with
   * Krenko", but "do Commander decks play this". A rank of 1 means every deck
   * plays it. */
  const STAPLE_SLOTS_PER_ROLE: Partial<Record<Role, number>> = {
    ramp: 3,
    draw: 2,
    removal: 2,
    interaction: 1,
  };

  /* And only when there is a real contest to win. These slots exist because a
     staple loses its slot to one of several thousand synergy cards; with a pool
     barely larger than the deck, nothing is competing and the role quotas below
     will reach the same cards anyway, stating the role they filled instead of a
     rank. Below the floor this pass would not be helping, it would be taking a
     card off a pass that explains itself better. */
  const STAPLE_PASS_MIN_POOL = 500;

  if (spellPool.length >= STAPLE_PASS_MIN_POOL)
  for (const [role, count] of Object.entries(STAPLE_SLOTS_PER_ROLE) as [Role, number][]) {
    const best = spellPool
      .filter(c => !takenOracleIds.has(c.oracleId))
      .filter(c => cardRole(c, role))
      /* The ranker refuses these for every other pass and this one skips the
         ranker, so it has to refuse them itself. Without this the staple slots
         are the best cards in the FORMAT rather than the best ones this deck
         can legally play, and the test that caught it is the right one:
         "Lightning Bolt is outside the identity". */
      .filter(c => withinIdentity(c.colorIdentity, identity))
      /* ONLY CARDS THE COMMANDER HAS NO OPINION ABOUT.
         This pass exists for cards that belong in a deck for reasons synergy
         cannot express. A card the plan already wants is not one of those, and
         claiming it here would take it from the pass that can say WHY: the
         first version labelled Contentious Plan "one of the cards Commander
         plays most for draw" in a proliferate deck, when the true reason is
         that it proliferates. The card was right and the sentence was wrong,
         which is its own kind of lie.

         So the two passes are made strictly complementary: synergy explains
         what it can, and this fills what is left with what every deck plays. */
      .filter(c => fitOf(c).fit <= 0)
      /* And nothing that shares a theme with the commander either. A card can
         be synergistic through its TAGS without the plan naming it, which is
         how the proliferate commander's Contentious Plan slipped through the
         planFit test above. Both routes into the synergy pass have to be
         closed or this one takes a card whose real reason it cannot state. */
      .filter(c => !(c.tags ?? []).some(tag => commanderThemes.has(tag)))
      .filter(c => typeof c.edhrecRank === 'number' && c.edhrecRank > 0)
      .sort((a, b) => (a.edhrecRank as number) - (b.edhrecRank as number))
      .slice(0, count);

    for (const card of best) {
      picked.push({
        card,
        quantity: 1,
        reason: `one of the cards Commander plays most for ${role} (rank ${card.edhrecRank})`,
        score: 0,
        bucket: role as Bucket,
        preferred: preferred.has(card.oracleId),
      });
      takenOracleIds.add(card.oracleId);
      roleFill[role].picked += 1;
    }
  }

  // Pass one: fill the role quotas, best card first, planner picks ahead of
  // the rest at equal eligibility. A card counts for ONE role — the one it is
  // scored against in `scoreCandidate` — because a card is one card.
  //
  // `creature` is zeroed here and filled by its own pass below. It is a FLOOR
  // across the whole deck, not a quota competing with the others: a mana dork
  // taken as ramp is still a creature, and making it choose between the two
  // would either lose the ramp slot or double-count the card.
  /*
   * THE COLOURLESS BUDGET, and it is a cap rather than a floor because a floor
   * arrives too late.
   *
   * See `colouredFloorFor` for the policy and the measurement. Written as a
   * top-up pass after the quotas it could not do its job: with a pool of 500
   * colourless artifacts against 120 coloured cards the role quotas took 35
   * colourless cards first, the creature floor took most of what was left, and
   * the top-up reached 28 of the 31 it needed with nowhere to put the rest.
   * Neither floor may cut what an earlier pass chose, so the only way to keep
   * the room is to not spend it. Every pass below stops taking colourless
   * cards once this many are in.
   */
  const colourlessCap = spellSlots - colouredFloorFor(identity, spellSlots);
  let colourlessPicked = 0;
  /*
   * A COLOURLESS BUDGET HELD BACK, for the same reason the deck slots are.
   *
   * The reserved commander-fit pass runs after the quota loop and could not
   * spend, because the quota loop had already filled the colourless cap. A
   * Meren deck came out with exactly 15 of 15 colourless cards — Vexing Bauble,
   * Soul-Guide Lantern (graveyard hate, in a graveyard deck), Crowded Crypt,
   * Mask of Griselbrand, Heirloom Blade and Realmbreaker among them — and
   * Ashnod's Altar, the card the whole deck needs, could not be added because
   * the budget was gone.
   *
   * Reserving deck slots without reserving the colourless budget reserves
   * nothing for a colourless card, and the cards this pass exists to rescue are
   * mostly artifacts.
   */
  const COLOURLESS_FIT_RESERVE = 2;
  let colourlessLimit = Math.max(0, colourlessCap - COLOURLESS_FIT_RESERVE);
  const overColourlessCap = (card: BuildCard) => !hasColour(card) && colourlessPicked >= colourlessLimit;

  /* ---------------------------------------------------------------- *
   * 2a. What the commander asked for and the quotas cannot reach.
   * ---------------------------------------------------------------- *
   *
   * THIS WAS TWO PASSES WITH TWO BUDGETS and that was the bug. One ran BEFORE
   * the quota loop and took up to four cards that serve no role at all; the
   * other ran after it with six reserved slots. Both spent from the same 59
   * spell slots, and the role targets summed to 49, so four cards that fill no
   * target left four targets unfillable. Measured on Meren: the quota loop hit
   * its cap after seeing 472 cards with `tutor` 3 short, `protection` 3 short
   * and `wincon` 2 short, which is why Swiftfoot Boots — score 7.31, in the
   * pool, not taken, and serving a role that was three slots short — never got
   * a look.
   *
   * One pass, one budget, one rule. Both jobs are the same job: a card the
   * commander asks for that the quota system cannot reach, whether because it
   * serves no role or because the role it serves is full. The pass below is
   * that pass, and `COMMANDER_FIT_RESERVE` is the whole of what it may spend.
   */
  const COMMANDER_FIT_RESERVE = 8;

/**
 * Slots per package of the chosen shell(s).
 *
 * TWO, which is SIX for one shell, and the sweep below is over that total. Measured on the seven-deck roster and on
 * Syr Vondam against the two human-built decks, moving only this number:
 *
 *     budget   Vondam archetype   roster keyed   staples   past15k
 *        6          11/60              69%        45/61       0
 *        9          10/60              68%        44/61       1
 *       12          11/60              67%        44/61       1
 *       16          13/60              64%        41/61       1
 *
 * Six buys the whole of the archetype gain that twelve buys and costs less of
 * everything else, so twelve is simply worse. Sixteen buys two more archetype
 * cards for three points of commander synergy and four staples, which is not a
 * trade worth making: a deck that is more on-shell and less on-COMMANDER is not
 * what was asked for.
 */
const PACKAGE_BUDGET_PER_PACKAGE = 2;
/**
 * How much of a package a card has to do to fill one of its slots.
 *
 * A package's wants are normalised, so 1.0 is a card carrying every facet the
 * package's own exemplars agreed on and the single loudest facet alone is
 * usually about 0.55. Above this floor means the card does more than the one
 * broad thing, which is the conjunction the pass exists for: `trig:enters` is
 * on hundreds of cards, `trig:enters` AND a value effect is Mulldrifter.
 */
const PACKAGE_MATCH = 0.6;
  const COMMANDER_RESCUE_FIT = 0.45;

  /*
   * SLOTS HELD BACK FROM THE QUOTA LOOP for the pass below it.
   *
   * Zero when the commander's plan says nothing, because then there is no
   * second axis to reserve for and holding slots back would only make the deck
   * worse. Six is small against a 64-slot spell count and it is spent on the
   * cards the plan asks for loudest, so the worst case is six cards that fit
   * the commander instead of six that filled a quota.
   */
  /*
   * A COMMANDER THAT ASKS FOR MORE THINGS NEEDS MORE SLOTS TO ASK THEM WITH.
   *
   * Eight was a fixed number against a fixed assumption: that a commander is
   * one strategy and eight cards is enough to say so. Syr Vondam is not. He is
   * paid when your creatures die OR are exiled, which is aristocrats AND blink,
   * and eight slots split across two strategies is four cards of each, which is
   * neither.
   *
   * The role floors take 48 of 55 nonland slots, so whatever the commander
   * wants has to fit in what is left. A commander with three loud wants can say
   * what it is in eight; one with eight loud wants cannot.
   *
   * LOUD is 0.7, which is where the plan stops describing the commander and
   * starts describing things that would be nice. Capped at 16 so the floors
   * always keep a working majority: the deck still has to draw cards, remove
   * things and make mana, and a deck that is all theme loses to one that works.
   */
  const loudWants = commanderPlan.wants.filter(w => w.weight >= 0.7).length;
  const fitReserve =
    commanderPlan.wants.length > 0
      ? Math.min(16, COMMANDER_FIT_RESERVE + Math.max(0, loudWants - 3))
      : 0;
  /*
   * THE ARCHETYPE'S PACKAGES NEED THEIR SLOTS HELD BACK TOO, and the first
   * version of this did not do that: the package pass ran after the quota loop
   * and the commander reserve had already spent all 55 nonland slots, so it
   * reported "Things worth blinking 0/4" three times and changed nothing.
   *
   * A reserved slot is only reserved if it is taken out of the budget BEFORE
   * the loop that would otherwise spend it.
   *
   * When a shell is chosen the two theme mechanisms share, rather than stack:
   * the packages ARE the archetype, said more precisely than a flat want list
   * can, so the commander reserve shrinks to make room. 6 + 12 = 18 of 55,
   * which leaves the floors a working majority.
   */
  /*
   * SCALED BY HOW MANY PACKAGES THERE ARE, not a flat number.
   *
   * Six was measured against a single shell, which is three packages, so each
   * got two cards. A commander that reads as TWO shells has six packages, and a
   * flat six then buys one card each — six packages of one card is not two
   * strategies, it is six gestures. Syr Vondam came out with "Sacrifice outlets
   * 1/1, Fodder 1/1, Death payoffs 1/1, Things worth blinking 1/1".
   *
   * Two per package holds the measured single-shell behaviour exactly (3 x 2 =
   * 6) and gives a two-shell commander the twelve it needs. Capped so a shell
   * that grows a fourth package cannot quietly take the deck over.
   */
  const packageCount = archetypePlan?.packages?.length ?? 0;
  const packageBudget = packageCount > 0 ? Math.min(14, PACKAGE_BUDGET_PER_PACKAGE * packageCount) : 0;
  const commanderReserve = packageBudget > 0 ? Math.min(fitReserve, 6) : fitReserve;
  const quotaSlots = Math.max(0, spellSlots - commanderReserve - packageBudget);

  const quota = { ...targets, land: 0, creature: 0 } as Record<Role, number>;
  for (const rec of orderPreferredFirst(playedFirst(rankedSpells), preferred)) {
    if (picked.length - chosenLands.length >= quotaSlots) break;
    const card = rec.card as BuildCard;
    if (takenOracleIds.has(card.oracleId)) continue;
    if (overColourlessCap(card)) continue;
    const role = neediestRole(card, quota, rolesOf(card));
    if (!role) continue;
    if (!hasColour(card)) colourlessPicked += 1;
    quota[role] -= 1;
    roleFill[role].picked += 1;
    takenOracleIds.add(card.oracleId);
    picked.push({
      card,
      quantity: 1,
      reason: rec.reason,
      score: rec.score,
      bucket: role,
      preferred: preferred.has(card.oracleId),
    });
  }

  /* ---------------------------------------------------------------- *
   * 2a+. The reserved slots, spent on fit and nothing else.
   * ---------------------------------------------------------------- *
   *
   * See the long note at 2a-. This is the half that reaches a card whose role
   * exists and whose quota is already full, which is the Ashnod's Altar case
   * and the one the earlier pass could not touch.
   *
   * WHICH WANT FIRST is decided by the plan; WHICH CARD SERVES IT is decided by
   * the ranker's own score. Ordering the whole pass by fit was tried and is
   * wrong, and the card that proves it is Cauldron of Essence.
   *
   * `planFit` is a noisy-OR, so a card matching five of the commander's wants
   * weakly outscores the card that IS one of them. Cauldron of Essence, rank
   * 2,508, matched five at 0.829 and took the `cost:sacrifice` slot; Ashnod's
   * Altar and Viscera Seer sat at 0.720 for doing the single thing a Meren deck
   * cannot function without, and the deck came out with Grave Pact, Dictate of
   * Erebos, Grim Haruspex and Midnight Reaper in it and nothing at all to
   * sacrifice a creature to. Lowering EXTRA_WANT_DECAY helps and cannot fix it:
   * five weak matches will always sum past one strong one somewhere.
   *
   * So the reserve guarantees each want is SERVED, and the best card that
   * serves it is the one that goes in. Fit is still the gate — a card below
   * COMMANDER_RESCUE_FIT is not really being asked for, and that gate is where
   * a cheap unplayed card with real synergy gets its place, which is the half
   * of "popularity gets no vote" that was right.
   */
  if (commanderReserve > 0) {
    /* The held-back colourless budget is released for exactly this pass, and
       stays released afterwards: the passes below it are the flex and land
       fills, and holding it shut for them would only leave the deck short. */
    colourlessLimit = colourlessCap;
    const wantWeightOf = new Map(commanderPlan.wants.map(w => [w.facet as string, w.weight]));
    const byFit = rankedSpells
      .filter(rec => {
        const card = rec.card as BuildCard;
        return !takenOracleIds.has(card.oracleId) && !overColourlessCap(card);
      })
      .map(rec => {
        const hit = fitOf(rec.card as BuildCard);
        return { rec, fit: hit.fit, want: hit.matched?.[0]?.facet ?? null };
      })
      .filter(entry => entry.fit >= COMMANDER_RESCUE_FIT)
      /* AND NOTHING THAT WORKS AGAINST THE PLAN. This pass ignores `score` by
         design, so the ranker's anti-synergy penalty cannot reach it: Soul-Guide
         Lantern shares `cares:zone:graveyard` with a graveyard commander, scored
         a real fit on it, and was taken carrying a reason that said in so many
         words that it empties graveyards and the deck is built on using one.

         AFTER the fit floor, never before it. Asked of every ranked spell this
         is another walk of the whole pool, and on a five-colour commander that
         pool is the catalogue. Above the floor it is a few hundred cards. */
      .filter(entry => !worksAgainstPlan(commanderPlan, entry.rec.card as BuildCard))
      /*
       * Want weight first, then HOW PLAYED, and score is not consulted at all.
       *
       * `rec.score` was the tie-break and it put Codex Shredder (rank 2,387) in
       * a Meren deck ahead of Ashnod's Altar (rank 134) for the `cost:sacrifice`
       * slot, 11.09 against 9.33. Almost the whole gap is `roleGap`: the Altar
       * classifies as ramp and the ramp quota was full at 11 of 8, so it scored
       * nothing for its role while the Shredder scored the full 3.0 for a role
       * that was short.
       *
       * Which is the role term sneaking back into the ONE pass that exists
       * because role quotas cannot reach a card. Ordering by score here undoes
       * the reason the pass was written.
       *
       * Total fit is not the answer either: it is a noisy-OR, so a card that
       * does five of the commander's jobs weakly outranks the card that IS one
       * of them, and Cauldron of Essence at rank 2,508 wins that ordering.
       *
       * Within one want, every candidate does the same thing. What separates
       * them is how good a card it is, and `edhrec_rank` is the only broad
       * evidence of that we hold.
       */
      .sort(
        (a, b) =>
          (wantWeightOf.get(b.want ?? '') ?? 0) - (wantWeightOf.get(a.want ?? '') ?? 0) ||
          ((a.rec.card as BuildCard).edhrecRank ?? Number.MAX_SAFE_INTEGER) -
            ((b.rec.card as BuildCard).edhrecRank ?? Number.MAX_SAFE_INTEGER) ||
          b.fit - a.fit
      );

    /*
     * ONE CARD PER THING THE COMMANDER ASKS FOR, before a second card for
     * anything.
     *
     * Taking the six highest-fit cards outright sounds right and is not, and
     * Meren of Clan Nel Toth is the case that shows it. Her plan asks for
     * `ctr:experience` at 0.90 and `eff:proliferate` at 0.80 before
     * `cost:sacrifice` at 0.72, so a straight fit ordering spent all six slots
     * on proliferate and the deck STILL had no sacrifice outlet — which is the
     * exact defect these slots were added to fix, reproduced one layer up.
     *
     * A commander asks for several things and a deck has to do all of them.
     * The loudest want monopolising the reserve is the same failure as a role
     * quota monopolising the deck, so the fix is the same shape: serve each
     * want once, then come back round.
     *
     * `matched[0]` is the card's own best reason, so the pass is grouped by why
     * each card was wanted rather than by anything imposed from outside.
     */
    /*
     * THE RESERVE SPENDS ON WHAT THE DECK HAS NOT GOT, NOT ON WHAT THE
     * COMMANDER SAYS LOUDEST.
     *
     * The owner, on Syr Vondam: *"this commander benefits from 2 strategies
     * together"*. He is paid when your creatures die OR are exiled, so his plan
     * correctly asks for `cost:sacrifice` 0.90 and `eff:exile-own` 0.85 at the
     * same time — aristocrats AND blink. The generated deck was 67% on theme
     * and every themed card was aristocrats. Not one blink card.
     *
     * Two things caused that and they compound:
     *
     *   `planFit` is a NOISY-OR, so a card matching sacrifice, dies and
     *   create-token together scores 0.90 while Cloudshift, which matches the
     *   one facet that IS the other strategy, scores 0.868. The bigger cluster
     *   always wins on total fit.
     *
     *   Black holds hundreds of aristocrats cards and white holds about twenty
     *   blink cards. So the quota loop fills the deck from the larger pool, and
     *   then the reserve — ordered by WANT WEIGHT — spends its slots on
     *   `cost:sacrifice` first, which is the half the deck already has.
     *
     * A want that fifteen cards already serve does not need a reserved slot. A
     * want that NOTHING serves is the whole reason this pass exists. So the
     * priority of a want is its weight divided by how many cards already serve
     * it, seeded from the cards the quota loop actually picked.
     *
     * Vondam: after the quota loop `cost:sacrifice` is served by a dozen cards
     * and drops to 0.90/13, while `eff:exile-own` is served by none and stays
     * at 0.85. Blink takes the slots, and keeps taking them until it is no
     * longer the thing the deck is most short of.
     *
     * This is not a Vondam rule. Every commander with two strategies had the
     * smaller-pool half squeezed out, and the ones with a single strategy are
     * unaffected because their one cluster is under-served until it is served.
     */
    const servedCount = new Map<string, number>();
    for (const entry of picked) {
      const facets = (entry.card as BuildCard).facets;
      if (!facets) continue;
      for (const f of facets) {
        if (wantWeightOf.has(f)) servedCount.set(f, (servedCount.get(f) ?? 0) + 1);
      }
    }
    /*
     * HOW MANY CARDS A WANT NEEDS BEFORE IT IS A STRATEGY RATHER THAN A CARD.
     *
     * The first version of this divided the weight by the number of cards
     * already serving it, which is right about the direction and wrong about
     * the shape: it makes the SECOND card for a want worth half the first, so
     * the reserve spread one card across eight different wants and Vondam's
     * blink half came out as a single copy of Ephemerate. One blink spell in a
     * 99-card deck is not a blink deck; it is a blink card.
     *
     * A want as loud as 0.85 is a thing the deck is supposed to DO, and doing
     * it takes about as many cards as any other role floor. So a want has a
     * target, proportional to how loudly it is asked for, and its urgency is
     * how far short of that target the deck currently is. A want at or past its
     * target contributes nothing and the slots move to the next thing missing.
     *
     * Ten is the scale because the role floors this competes with come out
     * around six to eight, and a commander's loudest want should be worth at
     * least as much as a generic floor. It is deliberately NOT tuned per
     * commander: a number fitted to Syr Vondam is a number that will be wrong
     * for the next one.
     */
    const WANT_TARGET_SCALE = 10;
    const targetFor = (want: string) =>
      Math.max(1, Math.round((wantWeightOf.get(want) ?? 0) * WANT_TARGET_SCALE));

    /** How far short of its target this want is, weighted by how loud it is. */
    const urgency = (want: string | null) => {
      if (!want) return 0;
      const weight = wantWeightOf.get(want) ?? 0;
      const short = targetFor(want) - (servedCount.get(want) ?? 0);
      if (short <= 0) return 0;
      return weight * (short / targetFor(want));
    };

    let reserved = 0;
    const reservedNames: string[] = [];
    const remaining = byFit.filter(e => !takenOracleIds.has((e.rec.card as BuildCard).oracleId));

    while (reserved < commanderReserve && picked.length - chosenLands.length < spellSlots) {
      let best: (typeof remaining)[number] | null = null;
      let bestUrgency = -1;
      for (const entry of remaining) {
        const card = entry.rec.card as BuildCard;
        if (takenOracleIds.has(card.oracleId)) continue;
        /* Re-checked inside the loop, not only in the filter above: this pass
           picks cards, so the colourless tally moves as it runs. */
        if (overColourlessCap(card)) continue;
        const u = urgency(entry.want);
        if (u > bestUrgency) { bestUrgency = u; best = entry; continue; }
        if (u === bestUrgency && best) {
          /* Within one want every candidate does the same thing, so what
             separates them is how good a card it is. */
          const a = card.edhrecRank ?? Number.MAX_SAFE_INTEGER;
          const b = (best.rec.card as BuildCard).edhrecRank ?? Number.MAX_SAFE_INTEGER;
          if (a < b) best = entry;
        }
      }
      if (!best) break;

      const card = best.rec.card as BuildCard;
      if (!hasColour(card)) colourlessPicked += 1;
      takenOracleIds.add(card.oracleId);
      reserved += 1;
      reservedNames.push(card.name);
      /* Every want this card serves gets more served, not only the one it was
         chosen for: a card doing two of the commander's jobs really does both,
         and counting one would send the next slot after a job now covered. */
      for (const f of card.facets ?? []) {
        if (wantWeightOf.has(f)) servedCount.set(f, (servedCount.get(f) ?? 0) + 1);
      }
      picked.push({
        card,
        quantity: 1,
        reason: best.rec.reason,
        score: best.rec.score,
        bucket: 'commander',
        preferred: preferred.has(card.oracleId),
      });
      /* The role tally still moves, so the shortfall lines below stay honest:
         a card taken here that happens to serve a short role really did fill
         it, and reporting it as missing would be a lie about the deck. */
      const filled = ROLES.find(role => role !== 'land' && quota[role] > 0 && rolesOf(card).has(role));
      if (filled) {
        quota[filled] -= 1;
        roleFill[filled].picked += 1;
      }
    }

    if (reserved > 0) {
      notes.push(
        `${reserved} card${reserved === 1 ? '' : 's'} chosen purely on how well ` +
          `${commanderPlan.commanderName} wants them, whatever role they fill: ` +
          reservedNames.join(', ')
      );
      /*
       * WHICH OF THE COMMANDER'S OWN ASKS THE DECK STILL HAS NOTHING FOR.
       *
       * A deck that ends with a loud want served by one card or none is the
       * two-strategy failure, and it is invisible from the decklist: Syr
       * Vondam's came back 67% on theme with every themed card belonging to the
       * same half of him. Saying it out loud is how the next one gets noticed
       * without anyone running a probe.
       */
      const stillShort = [...wantWeightOf.entries()]
        .filter(([facet, weight]) => weight >= 0.6 && (servedCount.get(facet) ?? 0) < 2)
        .sort((a, b) => b[1] - a[1])
        .map(([facet]) => facet);
      if (stillShort.length) {
        notes.push(
          `still short of ${commanderPlan.commanderName}'s own asks: ${stillShort.join(', ')}`
        );
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * 2a++. The archetype's PACKAGES, each filled to its share.
   * ---------------------------------------------------------------- *
   *
   * A SHELL IS NOT A BAG OF TWELVE CARDS. It is three or four packages with
   * names, and until now `planForArchetype` flattened them into one want list
   * before anything could use them.
   *
   * What that costs is measurable. Blink's twelve cards flatten to a list in
   * which `trig:enters` and `eff:exile-own` are two wants among many, so a card
   * carrying either one scores. Kept apart, the packages say something much
   * sharper:
   *
   *     The blinks              cares:zone:exile + eff:return-from
   *     Things worth blinking   trig:enters@1.00 + eff:draw@0.75
   *     Doubling the arrival    eff:exile-own + trig:enters
   *
   * "Things worth blinking" is the one that could never be expressed before.
   * `trig:enters` alone is on hundreds of cards and most of them are not worth
   * blinking; `trig:enters` AND a value effect is Mulldrifter, Solemn
   * Simulacrum, Cloudblazer, Sun Titan. Measured against the two human-built
   * Vondam decks, the generator was finding 1 of those 30 cards.
   *
   * A CONJUNCTION, WHICH IS THE POINT. `planFit` is a noisy-OR over the whole
   * plan, so it can never say "this card does BOTH of these things"; that is
   * the same limitation that let a card matching three wants weakly outrank the
   * card that IS the strategy. Scoring against ONE package restores the
   * conjunction, because a package's wants describe a single job.
   *
   * Each package gets its share of the budget, and share is exemplar count over
   * the shell's. A shell that names four blink spells and four things to blink
   * is saying those matter equally, and nothing else in the data disagrees.
   */
  const shellPackages = archetypePlan?.packages ?? [];
  if (shellPackages.length > 0) {
    /*
     * Twelve, against 55-odd nonland slots. Enough that each of three packages
     * gets four cards, which is what the shell itself names, and small enough
     * that the role floors keep a working majority: a deck that is all theme
     * loses to one that draws cards and removes things.
     */
    /* declared at module scope */
    /*
     * How much of a package a card has to do. The wants of a package are
     * normalised, so 1.0 is a card carrying every facet the package's own
     * exemplars agreed on, and the loudest single facet alone is usually
     * around 0.55. Above that floor means the card does more than the one
     * broad thing, which is exactly the conjunction this pass exists for.
     */
    /* declared at module scope */

    const packageFit = (card: BuildCard, wants: readonly { facet: string; weight: number }[]) => {
      const facets = card.facets;
      if (!facets || facets.length === 0) return 0;
      const has = new Set(facets as readonly string[]);
      let hit = 0;
      let total = 0;
      for (const w of wants) {
        total += w.weight;
        if (has.has(w.facet)) hit += w.weight;
      }
      return total > 0 ? hit / total : 0;
    };

    const filledBy: string[] = [];
    for (const pkg of shellPackages) {
      const slots = Math.max(1, Math.round(packageBudget * pkg.share));
      let taken = 0;
      const tookNames: string[] = [];
      /*
       * Ordered by how much of the package the card does, then by how played it
       * is. Within one package every candidate does the same job, so what
       * separates them is how good a card it is — the same reasoning the
       * commander reserve uses, and the reason a rank-10,744 card does not take
       * a slot from a rank-12 one.
       */
      /*
       * THE PACKAGE SAYS WHAT JOB. THE COMMANDER SAYS WHOSE DECK.
       *
       * Ordering by package fit alone put KRENKO, MOB BOSS in an Edgar Markov
       * deck. Edgar is a Vampire commander whose whole card is "make a Vampire
       * token whenever you cast a Vampire spell", he reads as the Tokens shell
       * because he does make tokens, and the Tokens shell's "Token makers"
       * package then took the two best token makers in the pool — both Goblins.
       * Every step was locally correct and the deck was wrong.
       *
       * So the package's job stays PRIMARY and the commander breaks its ties.
       * Between two cards that make tokens equally well, Edgar gets the Vampire
       * that makes Vampires rather than the Goblin that makes Goblins; rank
       * breaks what is left, so a card people actually play wins between two
       * equal answers.
       *
       * ORDERING BY COMMANDER FIT FIRST WAS TRIED AND IS WRONG, measured: jobs
       * done fell 12/24 to 10/24 and the groups a deck could not do at all rose
       * 4 to 7. `planFit` is a noisy-OR and saturates, so a card matching a
       * handful of the commander's wants scores 1.0 and beats the card that
       * actually does the package's job. The whole reason this pass exists is
       * to fill a job the quota loop cannot reach, and a card that half-does
       * the job for a commander who loves it is still not doing the job.
       */
      const candidates = rankedSpells
        .filter(rec => !takenOracleIds.has((rec.card as BuildCard).oracleId))
        .map(rec => {
          const card = rec.card as BuildCard;
          const hit = fitOf(card);
          return { rec, fit: packageFit(card, pkg.wants), commander: hit.fit };
        })
        .filter(entry => entry.fit >= PACKAGE_MATCH)
        .sort(
          (a, b) =>
            b.fit - a.fit ||
            ((a.rec.card as BuildCard).edhrecRank ?? Number.MAX_SAFE_INTEGER) -
              ((b.rec.card as BuildCard).edhrecRank ?? Number.MAX_SAFE_INTEGER)
        );

      for (const { rec } of candidates) {
        if (taken >= slots) break;
        if (picked.length - chosenLands.length >= spellSlots) break;
        const card = rec.card as BuildCard;
        if (takenOracleIds.has(card.oracleId)) continue;
        if (overColourlessCap(card)) continue;
        /* Nothing that works against the commander's own plan, for the same
           reason the commander reserve refuses it: this pass ignores `score`,
           so the ranker's anti-synergy penalty cannot reach it. */
        if (worksAgainstPlan(commanderPlan, card)) continue;
        if (!hasColour(card)) colourlessPicked += 1;
        takenOracleIds.add(card.oracleId);
        taken += 1;
        tookNames.push(card.name);
        picked.push({
          card,
          quantity: 1,
          reason: rec.reason,
          score: rec.score,
          bucket: 'commander',
          preferred: preferred.has(card.oracleId),
        });
        const filled = ROLES.find(role => role !== 'land' && quota[role] > 0 && rolesOf(card).has(role));
        if (filled) {
          quota[filled] -= 1;
          roleFill[filled].picked += 1;
        }
      }
      /* NAMED, not counted. "Sacrifice outlets 2/2" reads as a success and can
         still be two cards nobody would call a sacrifice outlet; the names are
         how that is caught without running a probe. */
      filledBy.push(`${pkg.name} ${taken}/${slots}${tookNames.length ? ` (${tookNames.join(", ")})` : ""}`);
    }
    if (filledBy.length) {
      notes.push(`${archetypePlan?.name} packages filled: ${filledBy.join(', ')}`);
    }
  }

  /* ---------------------------------------------------------------- *
   * 2a+. Roles the first pass left short, filled directly.
   * ---------------------------------------------------------------- *
   *
   * `neediestRole` is decided ONCE per card, in score order, and sends the card
   * to whichever role is neediest AT THAT MOMENT. A card that serves both
   * `enhance` and `protection` is spent on enhance while enhance is still the
   * shorter of the two, and by the time protection is the neediest role the
   * loop has already walked past every card that could have filled it.
   *
   * Measured on Meren: `protection` 3 of 7 and `wincon` 1 of 4 with NINE deck
   * slots still unspent. Swiftfoot Boots was in the pool, unclaimed, serving a
   * role four slots short, and nothing was going back for it.
   *
   * So this goes back for it. One walk per short role, in ranked order, taking
   * anything that serves it. A quota system that does not meet its quotas while
   * slots remain is not a quota system.
   *
   * A role the POOL cannot supply still ends short and is still reported below.
   * `wincon` is the standing case: its facet list is deliberately narrow and
   * most finishers reach the role through the tag fallback, so a target of four
   * is often more than the pool holds.
   */
  /* Ordered ONCE, outside both loops. Calling `orderPreferredFirst` inside the
     `while` re-sorted 10,913 cards for every slot filled and took a Meren build
     from 1.7 s to 8.8 s. */
  const topUpOrder = orderPreferredFirst(playedFirst(rankedSpells), preferred);
  for (const role of ROLES) {
    if (role === 'land' || role === 'creature') continue;
    let from = 0;
    while (quota[role] > 0) {
      if (picked.length - chosenLands.length >= quotaSlots) break;
      /* And the cursor does not restart. Every candidate before it has already
         been taken or refused for this role, so rescanning them is the same
         quadratic walk one level down. */
      let found = -1;
      for (let i = from; i < topUpOrder.length; i++) {
        const candidate = topUpOrder[i].card as BuildCard;
        if (takenOracleIds.has(candidate.oracleId)) continue;
        if (overColourlessCap(candidate)) continue;
        if (!rolesOf(candidate).has(role)) continue;
        found = i;
        break;
      }
      if (found < 0) break;
      from = found + 1;
      const rec = topUpOrder[found];
      const card = rec.card as BuildCard;
      if (!hasColour(card)) colourlessPicked += 1;
      quota[role] -= 1;
      roleFill[role].picked += 1;
      takenOracleIds.add(card.oracleId);
      picked.push({
        card,
        quantity: 1,
        reason: rec.reason,
        score: rec.score,
        bucket: role,
        preferred: preferred.has(card.oracleId),
      });
    }
  }

  for (const role of ROLES) {
    if (role === 'land' || role === 'creature') continue;
    if (quota[role] > 0) {
      shortfalls.push(
        `${quota[role]} of ${targets[role]} ${role} slots could not be filled from the legal pool`
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * 2b. The creature count the commander asked for.
   * ---------------------------------------------------------------- *
   *
   * THE FIX FOR "IT BARELY ADDS ANY CREATURES, EVEN WHEN I DO CREATURE MODE",
   * and no longer a fixed number: `shape.creatureTarget` is what fraction of
   * the cards that do THIS commander's job turn out to be creatures, applied to
   * the slots the floors left. Krenko's plan wants Goblins and nearly every
   * Goblin is a creature, so it comes out high; Talrand's plan wants instants
   * and sorceries, so it comes out low; and neither number was written down by
   * anybody.
   *
   * Counted across everything already picked, not filled from zero. The role
   * floors above take mana dorks, removal creatures and Craterhoof Behemoths
   * without being asked to, and every one of those is a creature; topping up
   * from zero would run the deck to sixty bodies and starve the rest of it.
   *
   * The top-up walks the same ranking as pass one, so a creature is chosen for
   * the same reasons any other card is — including the commander-fit signal,
   * which is what makes Krenko's creature slots fill with Goblins rather than
   * with whatever creature happens to be popular. It only ever ADDS creatures
   * up to the target; it never cuts a non-creature to make room, because the
   * floors are the deck's job list and a creature count is not worth a missing
   * sweeper. The CEILING is enforced later, in the flex pass.
   */
  const creatureFloor = targets.creature;
  const colourFloor = colouredFloorFor(identity, spellSlots);
  let creaturesPicked = picked.filter(e => cardRole(e.card, 'creature')).length;
  let colouredPicked = picked.filter(e => !cardRole(e.card, 'land') && hasColour(e.card)).length;

  /**
   * Take cards off the seed ranking until `enough()` or the deck is full.
   *
   * Shared by both floors so they cannot drift apart, and so a card taken for
   * one is counted by the other. `wanted` is the test a card has to pass;
   * `bucket` is only a label for the entry.
   */
  const fillTo = (
    enough: () => boolean,
    wanted: (card: BuildCard) => boolean,
    bucket: Bucket
  ) => {
    if (enough()) return;
    for (const rec of orderPreferredFirst(playedFirst(rankedSpells), preferred)) {
      if (enough()) break;
      if (picked.length - chosenLands.length >= spellSlots) break;
      const card = rec.card as BuildCard;
      if (takenOracleIds.has(card.oracleId)) continue;
      if (!wanted(card)) continue;
      if (overColourlessCap(card)) continue;
      takenOracleIds.add(card.oracleId);
      if (cardRole(card, 'creature')) creaturesPicked += 1;
      if (hasColour(card)) colouredPicked += 1;
      else colourlessPicked += 1;
      picked.push({
        card,
        quantity: 1,
        reason: rec.reason,
        score: rec.score,
        bucket,
        preferred: preferred.has(card.oracleId),
      });
    }
  };

  /*
   * COLOURED CREATURES FIRST, and this sweep is the whole reason the two floors
   * are written together instead of one after the other.
   *
   * Both floors only ADD, so they compete for the same nonland slots, and
   * whichever runs first spends them. Written as two independent passes with
   * the creature floor first, Urza, Lord High Artificer came back with 40
   * creatures and 46 of 64 spells colourless: the creature top-up had taken
   * artifact creatures, which are the highest-ranked creatures in a mono-blue
   * pool, and by the time the colour floor ran there were fourteen slots left
   * and it needed twenty-eight.
   *
   * A card that closes both floors at once closes both for free, so those are
   * taken first and neither floor can starve the other.
   */
  fillTo(
    () => creaturesPicked >= creatureFloor || colouredPicked >= colourFloor,
    card => cardRole(card, 'creature') && hasColour(card),
    'creature'
  );
  fillTo(() => creaturesPicked >= creatureFloor, card => cardRole(card, 'creature'), 'creature');

  roleFill.creature.picked = creaturesPicked;
  if (creaturesPicked < creatureFloor) {
    shortfalls.push(
      `${creatureFloor - creaturesPicked} of ${creatureFloor} creature slots could not be ` +
        `filled from the legal pool`
    );
  }

  /* ---------------------------------------------------------------- *
   * 2c. The colour floor.
   * ---------------------------------------------------------------- *
   *
   * THE FIX FOR "IT IS JUST TAKING ADVANTAGE OF COLOURLESS ARTIFACTS".
   *
   * Same shape as the creature floor above and for the same kind of reason: a
   * requirement the ranker structurally cannot see, stated declaratively
   * instead of tuned into a weight.
   *
   * WHAT THE RANKER SEES. `WEIGHTS.playability` pays a card for how reliably
   * this deck can pay for it, and a colourless card is castable by every deck
   * that can pay its generic cost. So every colourless card collects the full
   * 2.5 and a real card in two colours at four mana collects perhaps 2.0.
   * `CASTABILITY_COMFORT_PCT` was added to blunt that and does not remove it:
   * the comfort point is 75%, and plenty of honest on-colour cards never reach
   * 75%. Measured by `scratch/refute-colour.mjs` on the 2026-08-19 snapshot,
   * colourless share of the legal spell pool against colourless share of the
   * finished 64, after every other fix in this pass had landed:
   *
   *   Urza                 pool 34.0%   deck 96.9%   x2.85
   *   Ghave                pool 13.5%   deck 40.6%   x3.01
   *   Meren                pool 19.8%   deck 45.3%   x2.29
   *   Niv-Mizzet           pool 19.7%   deck 43.8%   x2.22
   *   Kaalia               pool 13.4%   deck 25.0%   x1.87
   *   Yuriko               pool 19.7%   deck 29.7%   x1.51
   *
   * Six of eight decks came back one and a half to three times more colourless
   * than the pool they were drawn from. Urza's mono-blue 99 contained two blue
   * spells. Nobody asked for that deck: a player who picks a commander has
   * picked its colours, and a 99 that does not play them is not the deck they
   * asked for however castable it is.
   *
   * WHAT THIS DOES NOT DO. It does not fix the scoring bias, which is still
   * there and still measurable; it states the requirement the scoring cannot
   * express. Like the creature floor it only ever ADDS, never cuts, so a
   * genuine artifact deck keeps its artifacts — Urza goes to a deck that is
   * half blue cards and half artifacts rather than one that is all artifacts.
   * A colourless commander has an empty identity and this pass never runs.
   */
  fillTo(() => colouredPicked >= colourFloor, card => hasColour(card), 'flex');
  roleFill.creature.picked = creaturesPicked;

  if (colourFloor > 0 && colouredPicked < colourFloor) {
    shortfalls.push(
      `${colourFloor - colouredPicked} of ${colourFloor} slots for cards in the commander's ` +
        `colours could not be filled from the legal pool`
    );
  }

  /* ---------------------------------------------------------------- *
   * 3. Flex slots, re-ranked against the deck as it now stands.
   * ---------------------------------------------------------------- */

  /*
   * THE PLAN, AS THIS DECK STILL NEEDS IT.
   *
   * `planFit` is deck-blind: a want at 0.9 scores 0.9 on the first card that
   * carries it and on the thirty-fifth. In Kinnan's deck that made every rock
   * a perfect fit forever, so the review rounds - built to make the deck
   * better - cut Craterhoof Behemoth and Avenger of Zendikar for Endurance
   * Bobblehead and Lotus Ring, each swap explained by the commander wanting
   * mana. The reserve pass already knows better: it spends on what the deck
   * has NOT got, a want's urgency being how far short of a target it is.
   * The same arithmetic here, applied to the plan the rounds score against:
   * each want's weight is scaled by its shortfall, floored at a quarter so a
   * saturated want still prefers the on-theme card over an off-theme one,
   * but no longer over a card the deck actually lacks.
   *
   * Target per want is weight x 30, NOT the reserve's ten. Measured with ten
   * on 3 Sep 2026: Krenko's eleventh Goblin and Niv-Mizzet's tenth instant
   * scored a quarter and were swapped for Sol Ring and Rhystic Study, keyed
   * synergy fell from 71% to 64% across the roster and the benchmark medians
   * collapsed toward staple piles. A human Goblin deck runs thirty Goblins
   * and a spellslinger deck thirty instants; the reserve's ten is the right
   * scale for spending eight slots across many wants, not for deciding when
   * a deck has enough of its own theme.
   */
  const WANT_SATURATION = 30;
  const withUrgency = (
    plan: typeof commanderPlan,
    deck: ReadonlyArray<{ card: BuildCard; bucket: Bucket }>
  ): typeof commanderPlan => {
    if (!plan) return plan;
    const served = new Map<string, number>();
    for (const entry of deck) {
      if (entry.bucket === 'land' || entry.bucket === 'basic') continue;
      for (const f of new Set<string>(entry.card.facets ?? [])) served.set(f, (served.get(f) ?? 0) + 1);
    }
    return {
      ...plan,
      wants: plan.wants.map(w => {
        const target = Math.max(1, Math.round(w.weight * WANT_SATURATION));
        const have = served.get(w.facet) ?? 0;
        const shortfall = Math.max(0.35, 1 - have / target);
        return { ...w, weight: w.weight * shortfall };
      }),
    };
  };
  const flexRoom = spellSlots - (picked.length - chosenLands.length);
  if (flexRoom > 0) {
    // The profile now has real tags, a real curve and real role counts, so
    // synergy and curve fit finally have something to measure against. At the
    // seed profile `spellCount` is 0 and curve fit cannot fire at all.
    /* Against the plan AS THE DECK STILL NEEDS IT, for the same reason the
       review rounds are: Kinnan's untappers at 0.6 lost every flex slot to
       the twenty-first rock at 0.9. */
    const nowProfile = deckProfileFrom(
      format,
      identity,
      input.commander,
      picked,
      provisionalMana,
      targets,
      withUrgency(commanderPlan, picked),
      plan.archetype ?? null
    );
    const rerank = rankCandidates(
      shortlist.filter(c => !takenOracleIds.has(c.oracleId)),
      nowProfile,
      rankOptions
    );

    /*
     * THE CREATURE TARGET IS A CEILING HERE, AND THAT HALF IS NEW.
     *
     * The floor above answers "it barely adds any creatures". This answers the
     * opposite failure, which was measured and left open in
     * `docs/design/ENGINE-PICKS.md` handover 4: Edgar Markov came back with 58
     * creatures out of 64 nonland cards and essentially no interaction, because
     * `commanderFit` at 2.2 applied to `sub:vampire` beats every other signal
     * in a mono-tribal pool and this pass had nothing telling it to stop. A
     * derived number that only ever pushes one way is half a derivation.
     *
     * Two passes rather than a hard refusal. The first spends the flex slots on
     * everything that is NOT a creature once the target is met, which is where
     * a tribal deck picks up its sweepers and its card draw. The second exists
     * because a ceiling must never leave the deck short: if the pool has
     * nothing else to give, more creatures beat empty slots, and the deck says
     * so through the note below rather than silently.
     */
    /*
     * A FLOOR IS NOT A LICENCE. Kinnan, Bonder Prodigy's one loud want is
     * `eff:add-mana`, so every rock in the pool scored as if it were the
     * plan and the flex pass, which takes cards in score order, took rocks
     * until the deck was thirty-five ramp pieces with a median EDHREC rank
     * of 242. No human list has ever looked like that. A role may run to
     * twice its target plus four here; a card whose every role is already
     * there is skipped, and the pass moves on to the next thing the deck
     * lacks. The counts are kept for the same reason: before this the flex
     * pass reported nothing to `roleFill`, so the review rounds could not
     * see what it had done.
     */
    const roleCeiling = (role: Role) => (roleFill[role]?.target ?? 0) * 2 + 4;
    const overCeiling = (card: BuildCard) => {
      const rs = [...rolesOf(card)].filter(r => r !== 'land');
      return rs.length > 0 && rs.every(r => roleFill[r] && roleFill[r].picked >= roleCeiling(r));
    };
    const takeFlex = (wanted: (card: BuildCard) => boolean) => {
      for (const rec of orderPreferredFirst(rerank, preferred)) {
        if (picked.length - chosenLands.length >= spellSlots) break;
        const card = rec.card as BuildCard;
        if (takenOracleIds.has(card.oracleId)) continue;
        if (overColourlessCap(card)) continue;
        if (!wanted(card)) continue;
        if (!preferred.has(card.oracleId) && overCeiling(card)) continue;
        takenOracleIds.add(card.oracleId);
        for (const r of rolesOf(card)) if (roleFill[r]) roleFill[r].picked += 1;
        if (cardRole(card, 'creature')) creaturesPicked += 1;
        if (hasColour(card)) colouredPicked += 1;
        else colourlessPicked += 1;
        picked.push({
          card,
          quantity: 1,
          reason: rec.reason,
          score: rec.score,
          bucket: 'flex',
          preferred: preferred.has(card.oracleId),
        });
      }
    };

    takeFlex(card => !cardRole(card, 'creature') || creaturesPicked < creatureFloor);
    const beforeOverflow = creaturesPicked;
    takeFlex(() => true);
    if (creaturesPicked > beforeOverflow) {
      notes.push(
        `${creaturesPicked - beforeOverflow} creature${creaturesPicked - beforeOverflow === 1 ? '' : 's'} ` +
          `over the ${creatureFloor} this commander asked for, because the pool had nothing ` +
          `else left that this deck could use`
      );
    }
  }

  const spellsPicked = picked.length - chosenLands.length;
  if (spellsPicked < spellSlots) {
    shortfalls.push(`${spellSlots - spellsPicked} spell slots could not be filled from the legal pool`);
  }

  /* ---------------------------------------------------------------- *
   * 4. Basics, allocated by the pips the chosen spells actually ask for.
   * ---------------------------------------------------------------- */

  const basicSlots = slots - picked.reduce((n, e) => n + e.quantity, 0);
  const basicEntries = allocateBasics({
    identity,
    basics: input.basics,
    slots: Math.max(0, basicSlots),
    pips: pipDemand(picked),
    sourcesByColour: buildManaProfile([
      commanderInput,
      ...picked.map(e => toPlayabilityInput(e.card, e.quantity)),
    ]).sourcesByColour,
  });
  picked.push(...basicEntries);
  // Basics are lands. Reporting the nonbasic count as the land count is how a
  // 36-land deck comes to say "27 of 35 lands" beside its own manabase.
  roleFill.land.picked += basicEntries.reduce((n, e) => n + e.quantity, 0);

  /* ---------------------------------------------------------------- *
   * 4b. Refinement rounds: the deck reviews itself before anyone sees it.
   * ---------------------------------------------------------------- *
   *
   * The owner: *"It doesn't seem like the system is even reviewing the deck as
   * it spurts all cards out at once, I'd expect multiple rounds of
   * optimisation before displaying."* They were describing the code exactly.
   * Every pass above chooses cards against a profile of the deck AS IT WAS
   * WHEN THAT PASS RAN — the quota loop against a seed profile holding only
   * the commander, the flex fill against whatever the quota loop left. Nothing
   * ever looked at the finished deck and asked whether every card still
   * belonged.
   *
   * Measured on the 20-commander benchmark before this existed, the same gap
   * repeated across commanders that share nothing else:
   *
   *     creatures that tap for mana   Kinnan 0/8   Chulane 0/6   Animar 0/5
   *     sacrifice outlets on demand   Korvold 0/4  Muldrotha 0/3
   *
   * Kinnan's plan correctly wants creatures that make mana. The ramp floor is
   * filled before that plan is consulted, by the best ramp in the pool, which
   * is rocks; by the time a dork is considered, ramp is full. A Signet has
   * commander fit 0 in that deck and Llanowar Elves has 1.0, and the only pass
   * that could have said so had already run.
   *
   * THE ROUND. Evaluate the whole deck with the same functions that score it
   * on the deck page, take the cards the evaluation ranks worst, and for each
   * one ask the ranker for the best card not yet in the deck — scored against
   * a profile of THIS deck, commander plan and all. Swap only when the
   * replacement clearly beats the cut and still serves a role the deck needs.
   * Repeat until a round changes nothing.
   *
   * WHY THE CUT SCORE AND THE CANDIDATE SCORE ARE COMPARABLE. `chooseCuts`
   * scores a deck card with `scoreCandidate` against the profile, and
   * `rankCandidates` scores a pool card with the same function against the
   * same profile. Same scale, same signals, same reason strings. A swap is
   * therefore a statement the engine can defend in one sentence: this card
   * scores X here, that one scores Y here, and Y is enough better to act on.
   *
   * WHY `evaluateDeck`'S OWN CUTS ARE NOT USED. Its profile is built without
   * the commander plan or the archetype — it is the deck page's evaluation and
   * carries only what a saved deck carries. Cuts chosen from it are
   * commander-blind, and a commander-blind cut list would cut the themed card
   * and keep the staple every time. `deckProfileFrom` passes both, so the
   * cuts here know what the commander wants.
   *
   * BEFORE THE BUDGET STEP, NOT AFTER IT. The first placement ran after the
   * trim, and a round then swapped the $400 card the trim had just removed
   * straight back in: rank 1, high score, and the loop never looked at price.
   * The trim has to have the last word, so this runs first and the trim
   * cleans up whatever it chose. A price guard below is belt and braces for
   * the case where a budget is set and a round would exceed it on its own.
   *
   * THE MARGIN is the guard against churn. Two cards within a point of each
   * other are a coin-flip, and swapping on a coin-flip makes the deck
   * different rather than better. 0.75 is a quarter of `roleGap` and a third
   * of `commanderFit`: a real signal, not noise.
   */
  const REFINE_ROUNDS = 4;
  const REFINE_CUTS_PER_ROUND = 5;
  const REFINE_MARGIN = 0.75;

  const refineLog: string[] = [];
  let refineSwaps = 0;

  for (let round = 1; round <= REFINE_ROUNDS; round++) {
    const roundEntries: EngineDeckEntry[] = [
      { card: toEngineCard(input.commander), quantity: 1, isCommander: true },
      ...picked.map(e => ({ card: toEngineCard(e.card), quantity: e.quantity })),
    ];
    const roundEval = evaluateDeck(roundEntries, { format, commander: toEngineCard(input.commander) });
    const roundPlan = withUrgency(commanderPlan, picked);
    const roundProfile = deckProfileFrom(
      format,
      identity,
      input.commander,
      picked,
      roundEval.playability.profile,
      targets,
      roundPlan,
      plan.archetype ?? null
    );

    /* Worst first, by the evaluation's own ordering. Lands are never offered
       by `chooseCuts`; basics and the commander are excluded by it too. A card
       the caller asked for by name is never cut: they asked. */
    const cuts = chooseCuts(roundEntries, roundEval.playability, roundProfile, {
      limit: REFINE_CUTS_PER_ROUND * 3,
    }).filter(cut => {
      const entry = picked.find(e => e.card.name === cut.name);
      return entry && !entry.preferred && entry.bucket !== 'land' && entry.bucket !== 'basic';
    }).slice(0, REFINE_CUTS_PER_ROUND);
    if (cuts.length === 0) break;

    /*
     * THE SAME SCALE ON BOTH SIDES, and the first version of this got it wrong.
     *
     * `chooseCuts` scores a deck card with `scoreCandidate(card, profile)` and
     * NO options, so commander fit is weighted 2.2 and popularity 0.8 — the
     * optimiser's defaults. `rankCandidates` below is handed `rankOptions`,
     * which weight them 3.6 and 2.4. Same function, different weights, and the
     * result was every card in the deck scoring 0.6 to 3.4 while every card
     * outside it scored 8 to 9. Solemn Simulacrum, rank 38, went out at 3.1 for
     * a rank-1,545 Human at 8.1, and twenty cards were swapped in four rounds
     * on a margin that measured nothing. Measured: 17/71 jobs to 15/71, junk
     * from 0 to 7.
     *
     * So the cut is re-scored here with the options the replacement is scored
     * with. `chooseCuts` still decides the ORDER (castability first, then
     * fit); this decides the NUMBER the margin is tested against.
     */
    /*
     * AND LEAVE-ONE-OUT, which matters more than the options did.
     *
     * Re-scoring with `rankOptions` changed nothing: the numbers were identical
     * to the decimal. The asymmetry is structural. A card IN the deck is scored
     * against a profile that CONTAINS it, so the role it fills reads as full and
     * `roleGap` pays it nothing, while a card OUTSIDE the deck sees that same
     * role one short and is paid the full 3.0 for filling it. Every member
     * loses to every outsider by construction, whatever the weights.
     *
     * So each cut is scored against the deck WITHOUT it — the profile a
     * replacement would actually be measured against. Now the two numbers
     * answer the same question: if this slot were empty, how well would this
     * card fill it. Five profile builds a round, over ~60 cards; cheap.
     */
    const cutScore = new Map<string, number>();
    for (const cut of cuts) {
      const idx = picked.findIndex(e => e.card.name === cut.name);
      if (idx < 0) continue;
      const without = picked.filter((_, i) => i !== idx);
      const loo = deckProfileFrom(
        format,
        identity,
        input.commander,
        without,
        roundEval.playability.profile,
        targets,
        withUrgency(commanderPlan, without),
        plan.archetype ?? null
      );
      /*
       * THE BUILDCARD, NOT `toCandidate(entry)`. That helper rebuilds a
       * candidate from an EngineCard and carries no `facets` and
       * `edhrecRank: null` — right for a cut list read on its own, and a
       * six-point handicap the moment the number is compared against a pool
       * card that has both. Commander fit, archetype fit and popularity all
       * read zero for every deck member and full for every outsider. The card
       * in `picked` is the same object the ranker scored when it went in.
       */
      cutScore.set(cut.name, scoreCandidate(picked[idx].card, loo, rankOptions).score);
    }

    /* The best cards NOT in the deck, scored against the deck as it stands. */
    const replacements = rankCandidates(
      shortlist.filter(c => !takenOracleIds.has(c.oracleId)),
      roundProfile,
      rankOptions
    );

    let swapsThisRound = 0;
    for (const cut of cuts) {
      const outIdx = picked.findIndex(e => e.card.name === cut.name);
      if (outIdx < 0) continue;
      const outEntry = picked[outIdx];
      const outRoles = rolesOf(outEntry.card);

      const replacement = replacements.find(rec => {
        const card = rec.card as BuildCard;
        if (takenOracleIds.has(card.oracleId)) return false;
        if (rec.score - (cutScore.get(cut.name) ?? cut.fitScore) < REFINE_MARGIN) return false;
        /* The same rank floor the quota loop uses. Without it a round swapped
           Kogla, the Titan Ape for a rank-14,071 card on a 1.1 margin: the
           replacement did more in the profile and was a card nobody plays. */
        if (typeof card.edhrecRank === 'number' && card.edhrecRank > PLAYED_ENOUGH_RANK) return false;
        if (typeof input.budgetUsd === 'number' && input.budgetUsd > 0) {
          const spent = picked.reduce((n, e) => n + (e.card.usd ?? 0) * e.quantity, 0);
          const delta = (card.usd ?? 0) - (outEntry.card.usd ?? 0);
          if (spent + delta > input.budgetUsd) return false;
        }
        if (worksAgainstPlan(commanderPlan, card)) return false;
        /* Colour discipline holds through a swap: a colourless card may only
           replace a colourless card once the cap is reached, and a coloured
           card is always allowed to replace a colourless one. */
        if (!hasColour(card) && hasColour(outEntry.card) && overColourlessCap(card)) return false;
        /* The deck's shape holds too. The replacement must do a job the cut
           did, or a job the deck is still short of; otherwise a role the floors
           filled on purpose is quietly emptied. */
        const inRoles = rolesOf(card);
        const keepsShape =
          [...outRoles].some(r => inRoles.has(r)) ||
          [...inRoles].some(r => roleFill[r] && roleFill[r].picked < roleFill[r].target);
        /* And never below a floor: Craterhoof out for a Bobblehead "fills a
           protection gap" and empties the win condition slot it came from. */
        const breaksAFloor = [...outRoles].some(
          r => roleFill[r] && !inRoles.has(r) && roleFill[r].picked - 1 < roleFill[r].target
        );
        if (breaksAFloor) return false;
        return keepsShape;
      });
      if (!replacement) continue;

      const inCard = replacement.card as BuildCard;
      takenOracleIds.delete(outEntry.card.oracleId);
      takenOracleIds.add(inCard.oracleId);
      if (!hasColour(outEntry.card)) colourlessPicked -= 1;
      if (!hasColour(inCard)) colourlessPicked += 1;
      for (const r of outRoles) if (roleFill[r]) roleFill[r].picked -= 1;
      for (const r of rolesOf(inCard)) if (roleFill[r]) roleFill[r].picked += 1;
      picked[outIdx] = {
        card: inCard,
        quantity: 1,
        reason: replacement.reason,
        score: replacement.score,
        bucket: 'refined',
        preferred: false,
      };
      swapsThisRound++;
      refineSwaps++;
      refineLog.push(
        `round ${round}: ${outEntry.card.name} out (${(cutScore.get(cut.name) ?? cut.fitScore).toFixed(1)}, ${cut.grounds === 'uncastable' ? 'hard to cast' : 'weak fit'}) ` +
          `for ${inCard.name} (${replacement.score.toFixed(1)}): ${replacement.reason}`
      );
    }
    if (swapsThisRound === 0) break;
  }

  if (refineSwaps > 0) {
    notes.push(
      `reviewed the finished deck in ${Math.min(REFINE_ROUNDS, Number(refineLog.length ? refineLog[refineLog.length - 1].match(/^round (\d+)/)?.[1] ?? '1' : '0'))} ` +
        `round${refineSwaps === 1 ? '' : 's'} and swapped ${refineSwaps} card${refineSwaps === 1 ? '' : 's'} ` +
        `for ones that do more in THIS deck`
    );
    for (const line of refineLog) notes.push(line);
  } else {
    notes.push('reviewed the finished deck: no card could be clearly improved on');
  }

  /* ---------------------------------------------------------------- *
   * 5. Budget, enforced on the deck rather than guessed per card.
   * ---------------------------------------------------------------- */

  if (typeof input.budgetUsd === 'number' && input.budgetUsd > 0) {
    const outcome = trimToBudget({
      picked,
      spellPool: shortlist,
      landPool: rankedLands.map(r => r.card as BuildCard),
      taken: takenOracleIds,
      budgetUsd: input.budgetUsd,
      identity,
    });
    if (outcome.swaps > 0) {
      notes.push(
        `${outcome.swaps} card${outcome.swaps === 1 ? '' : 's'} swapped for cheaper ones, ` +
          `taking the deck from $${outcome.before.toFixed(0)} to $${outcome.after.toFixed(0)}`
      );
    }
    if (outcome.after > input.budgetUsd) {
      shortfalls.push(
        `This deck costs $${outcome.after.toFixed(0)}, over the $${input.budgetUsd} budget. ` +
          `Nothing cheaper was left that the deck could still use.`
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * 6. One evaluation for the score, the castability and the cut order.
   * ---------------------------------------------------------------- */

  const entries: EngineDeckEntry[] = [
    { card: toEngineCard(input.commander), quantity: 1, isCommander: true },
    ...picked.map(e => ({ card: toEngineCard(e.card), quantity: e.quantity })),
  ];
  const evaluation = evaluateDeck(entries, { format, commander: toEngineCard(input.commander) });

  const totalCopies = picked.reduce((n, e) => n + e.quantity, 0);
  const landCopies = picked
    .filter(e => e.bucket === 'land' || e.bucket === 'basic')
    .reduce((n, e) => n + e.quantity, 0);
  const totalUsd = picked.reduce((n, e) => n + (e.card.usd ?? 0) * e.quantity, 0);

  notes.push(
    `${totalCopies} cards in ${picked.length} entries, ${landCopies} lands ` +
      `(${basicEntries.reduce((n, e) => n + e.quantity, 0)} basic)`
  );
  notes.push(
    `castable on curve ${evaluation.playability.averagePct === null ? 'not measured' : `${Math.round(evaluation.playability.averagePct)}% of the time on average`}`
  );

  /* ---------------------------------------------------------------- *
   * 7. Say how much of this was behaviour and how much was words.
   * ---------------------------------------------------------------- */

  // Recounted here rather than trusted from the floor pass, because the flex
  // pass and the budget trim both run after it and both change the answer.
  const finalCreatures = picked.filter(e => cardRole(e.card, 'creature')).length;
  roleFill.creature.picked = finalCreatures;

  const spellEntries = picked.filter(e => e.bucket !== 'land' && e.bucket !== 'basic');
  const pickedCoverage = facetCoverage(spellEntries.map(e => e.card));
  const poolCoverage = facetCoverage(pool);

  notes.push(
    `${finalCreatures} creatures against the ${creatureFloor} this commander's own record ` +
      `asked for, ${style.style} style` +
      (style.matchedStyle ? '' : ` (you asked for "${String(input.style)}", which is not a style)`)
  );
  /*
   * The shape's own argument, verbatim, on the object the caller already reads.
   *
   * Every number in it is derived and every sentence says what derived it, so
   * a player asking "why 38 lands" and an engineer asking "why did this deck
   * come out with six creatures" read the same answer. This is the line that
   * makes the derivation checkable instead of merely present.
   */
  for (const line of shape.because) notes.push(line);
  /*
   * "No wants" and "no record" are different failures and this used to print
   * the second when it meant the first. Kaalia of the Vast has a record — the
   * compiler read her flying and her type line — and it produced no want,
   * because the clause that makes her Kaalia is the one it refused. Telling the
   * player there is no record for her is not true, and it points at the wrong
   * thing to fix.
   */
  /*
   * THE COMMANDER'S OWN WANTS, not the merged ones.
   *
   * `plan.wants` now holds the archetype's as well, and printing those after
   * this commander's name would put words in the commander's mouth: a Krenko
   * deck would report that Krenko wants `trig:dies`, which Krenko does not. The
   * archetype gets its own line below.
   */
  notes.push(
    commanderPlan.wants.length === 0
      ? commanderPlan.fromTagsOnly
        ? `no ability record for ${input.commander.name}, so this deck was picked on tags alone`
        : `${input.commander.name} has an ability record but nothing in it says what the deck ` +
          `should do, so this deck was picked on roles and tags alone`
      : `${input.commander.name} wants ${commanderPlan.wants
          .slice(0, 4)
          .map(w => w.facet)
          .join(', ')}${plan.tribe ? `, tribe ${plan.tribe}` : ''}` +
          (commanderPlan.fromTagsOnly ? ' (read from tags, not from a record)' : '')
  );
  /*
   * WHAT THE ARCHETYPE ACTUALLY DID, in the change log the player can open.
   *
   * Three different things can happen and they must not read alike: no
   * archetype asked for, one asked for whose cards said nothing, and one that
   * moved the plan. The third line names the wants it added, so a player who
   * picked Aristocrats and got a deck that is not one can see whether the
   * archetype was silent or was simply outvoted by the commander.
   */
  if (archetypePlan) {
    const arch = plan.archetype;
    notes.push(
      arch && arch.wants.length > 0
        ? `${archetypePlan.name} shaped this build: ${archetypePlan.read} of its ` +
          `${archetypePlan.named} cards were read, and ${arch.wants.length} things they have in ` +
          `common became wants, ${arch.added} of them things ${input.commander.name} had not ` +
          `asked for. Strongest first: ` +
          `${arch.wants
            .slice(0, 4)
            .map(w => w.facet)
            .join(', ')}. ` +
          (arch.alone
            ? `${input.commander.name} asked for nothing, so the archetype is the whole plan`
            : `The shell is capped below ${input.commander.name}'s own strongest want, so the ` +
              `commander still decides what this deck is`)
        : `${archetypePlan.name} changed nothing: ${archetypePlan.read} of its ` +
          `${archetypePlan.named} cards were found, ${archetypePlan.withoutRecord} of those ` +
          `have no ability record, and of what the rest share, ` +
          `${archetypePlan.dropped.filter(d => d.reason === 'rare').length} things are too rare ` +
          `in these colours to fill a deck and ` +
          `${archetypePlan.dropped.filter(d => d.reason === 'common').length} are too common to ` +
          `mean anything. This deck was shaped by ${input.commander.name} alone`
    );
  }
  notes.push(
    `${pickedCoverage.withRecord} of ${pickedCoverage.total} chosen spells had an ability ` +
      `record (${pickedCoverage.pct.toFixed(0)}%); the rest fell back to tags. Pool: ` +
      `${poolCoverage.withRecord} of ${poolCoverage.total} (${poolCoverage.pct.toFixed(0)}%)`
  );

  /*
   * HOW MANY OF THESE PICKS THE SCORE ACTUALLY CHOSE.
   *
   * The most useful number in this list and the one that was missing. A pick
   * whose score is shared with hundreds of other cards was not chosen by the
   * model at all — `compareTied` in `rank.ts` decided it, and `compareTied`
   * knows nothing about Magic. Until 2026-08-23 that line was the alphabet, and
   * the reason nobody noticed for so long is that the deck came back looking
   * confident either way. Counting it here makes "the engine had no opinion
   * about 41 of these 64 cards" a fact on the object a caller already reads,
   * rather than something you have to write a script to discover.
   *
   * Counted against the seed ranking, which is what the role passes and the
   * creature and colour floors drew from.
   */
  const tieSize = new Map<string, number>();
  for (const rec of rankedSpells) {
    const k = rec.score.toFixed(4);
    tieSize.set(k, (tieSize.get(k) ?? 0) + 1);
  }
  const scoreOf = new Map(rankedSpells.map(r => [r.card.oracleId, r.score.toFixed(4)]));
  let tiedPicks = 0;
  let widestTie = 0;
  for (const e of spellEntries) {
    const k = scoreOf.get(e.card.oracleId);
    const n = k === undefined ? 0 : (tieSize.get(k) ?? 0);
    if (n > 1) tiedPicks += 1;
    if (n > widestTie) widestTie = n;
  }
  notes.push(
    `${tiedPicks} of ${spellEntries.length} spells were picked out of a group the score could ` +
      `not separate` +
      (widestTie > 1 ? `, the widest being ${widestTie} cards on the same score` : '') +
      `; those were settled by popularity and then by a hash, not by the model`
  );

  return {
    entries: picked,
    totalCopies,
    landCopies,
    spellCopies: totalCopies - landCopies,
    totalUsd,
    manaProfile: evaluation.playability.profile,
    roleFill,
    shortfalls,
    notes,
    evaluation,
    evidence: {
      plan: plan.wants.length > 0 ? plan : null,
      archetype: archetypePlan,
      poolWithRecord: poolCoverage.withRecord,
      poolSize: poolCoverage.total,
      pickedWithRecord: pickedCoverage.withRecord,
      pickedSpells: pickedCoverage.total,
      styleAsked: input.style == null ? null : String(input.style),
      styleUsed: style.style,
      shape,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function isLandCandidate(card: CandidateCard): boolean {
  return /\bland\b/i.test((card.typeLine ?? '').split('//')[0]);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function zeroRoleTargets(): Record<Role, number> {
  const out = {} as Record<Role, number>;
  for (const role of ROLES) out[role] = 0;
  return out;
}

/**
 * The profile a build starts from: the commander alone.
 *
 * The commander's tags ARE the deck's theme at this point, which is exactly
 * what `sharedTagScore` should be measuring a candidate against. Atraxa carries
 * `proliferate`, so proliferate cards outrank everything else on synergy from
 * the first pass, which is the whole reason the old text-keyword heuristic
 * could not be kept.
 */
function seedProfile(
  format: string,
  identity: readonly string[],
  commander: BuildCard,
  manaProfile: ManaProfile | null,
  roleTargets: Partial<Record<Role, number>>,
  commanderPlan: CommanderPlan | null,
  archetype: ArchetypeInfluence | null
): DeckProfile {
  return deriveDeckProfile({
    format,
    colorIdentity: identity,
    cards: [toDeckCard(commander, 1)],
    roleTargets,
    manaProfile,
    commanderPlan,
    archetype,
  });
}

function deckProfileFrom(
  format: string,
  identity: readonly string[],
  commander: BuildCard,
  picked: readonly GeneratedEntry[],
  manaProfile: ManaProfile | null,
  roleTargets: Partial<Record<Role, number>>,
  commanderPlan: CommanderPlan | null,
  archetype: ArchetypeInfluence | null
): DeckProfile {
  return deriveDeckProfile({
    format,
    colorIdentity: identity,
    cards: [toDeckCard(commander, 1), ...picked.map(e => toDeckCard(e.card, e.quantity))],
    roleTargets,
    manaProfile,
    commanderPlan,
    archetype,
  });
}

function toDeckCard(card: BuildCard, quantity: number): DeckCard {
  return {
    oracleId: card.oracleId,
    name: card.name,
    typeLine: card.typeLine,
    cmc: card.cmc,
    tags: card.tags,
    // Carried, or the profile counts roles off tags for cards the pool already
    // has records for and the deck the ranker is measured against stops being
    // the deck the ranker built.
    facets: card.facets ?? null,
    quantity,
  };
}

function toPlayabilityInput(
  card: BuildCard,
  quantity: number,
  isCommander = false
): PlayabilityCardInput {
  return {
    name: card.name,
    type_line: card.typeLine,
    mana_cost: card.manaCost,
    cmc: card.cmc,
    oracle_text: card.oracleText ?? null,
    color_identity: card.colorIdentity,
    quantity,
    isCommander,
  };
}

function toEngineCard(card: BuildCard): EngineCard {
  return {
    name: card.name,
    type_line: card.typeLine,
    mana_cost: card.manaCost,
    cmc: card.cmc,
    oracle_text: card.oracleText ?? null,
    color_identity: card.colorIdentity,
    keywords: card.keywords ?? null,
    legalities: card.legalities,
    oracle_id: card.oracleId,
    usd: card.usd,
    tags: card.tags,
  };
}

/** The role this card should be credited for: the one the deck needs most. */
function neediestRole(
  card: BuildCard,
  quota: Record<Role, number>,
  roles: ReadonlySet<Role>
): Role | null {
  let best: Role | null = null;
  let bestLeft = 0;
  for (const role of ROLES) {
    if (quota[role] <= 0) continue;
    if (!roles.has(role)) continue;
    // Strict `>` over a fixed role order, so ties resolve the same way every
    // time — the same rule `scoreCandidate` uses.
    if (quota[role] > bestLeft) {
      bestLeft = quota[role];
      best = role;
    }
  }
  return best;
}

/**
 * Planner picks first, then everything else, each half in ranked order.
 *
 * A planner cannot promote a card that did not survive ranking, and cannot
 * award it a score. All it can do is choose between cards the engine already
 * ranks as eligible, which is the strongest form of grounding available: the
 * model's influence is bounded by the pool it was shown.
 */
function orderPreferredFirst<T extends { card: CandidateCard }>(
  ranked: readonly T[],
  preferred: ReadonlySet<string>
): T[] {
  if (preferred.size === 0) return ranked as T[];
  const first: T[] = [];
  const rest: T[] = [];
  for (const r of ranked) (preferred.has(r.card.oracleId) ? first : rest).push(r);
  return [...first, ...rest];
}

/**
 * How badly played a card has to be before the deck looks elsewhere first.
 *
 * NOT A BAN, and the difference is the whole design. A card past this rank can
 * still be taken; it just does not get to take a role slot while a card people
 * actually play is available for the same slot.
 *
 * The owner, twice, months apart: *"there are cards he would absolutely never
 * include"*. Measured across the seven audit decks, 22 cards past EDHREC rank
 * 15,000 reached a deck. The cause is not that the ranker is wrong about them,
 * it is that the ranker has no notion of card QUALITY except popularity, and
 * popularity is weighted 2.4 against commander fit at 3.6. So Oathkeeper,
 * Takeno's Daisho — rank 10,744, a three-mana Equipment costing two more to
 * equip — beats Swiftfoot Boots at rank 12 for a protection slot, because it
 * carries one facet the commander asked for and Boots carries none.
 *
 * LOWERING THE FIT WEIGHT WAS TRIED FIRST AND REJECTED, with the numbers in
 * `scripts/probe/fit-weight-sweep.mjs`: every value below 3.6 buys staples and
 * kills junk and pays for it in keyed synergy, 72% to 68%, because the quota
 * loop stops preferring cards that fit. Raising the reserve cap to compensate
 * does nothing at all — 16, 22 and 28 measure identically, since these
 * commanders never reach the cap. There is no free lunch on that axis, and
 * trading theme away is the opposite of what was asked for.
 *
 * This axis has one. A rank floor separates "does this card do the job" from
 * "is this card any good", which the score conflates, and it leaves the fit
 * weight alone so a themed card that people actually play still wins.
 *
 * 12,000 rather than 15,000: the complaint is measured at 15,000, so a floor
 * set there would only ever tie it, and the cards between 12,000 and 15,000 are
 * the same kind of card. Not lower, because a narrow colour or a small pool
 * genuinely runs out of played cards, and this must degrade to "take it anyway"
 * rather than to a deck that is short.
 */
const PLAYED_ENOUGH_RANK = 12_000;

/**
 * Cards people actually play, then the rest, each half still in score order.
 *
 * Effectively a two-pass fill without a second loop: the quota loop walks this
 * in order, so it exhausts the played cards for a role before it will consider
 * an unplayed one, and a role the pool genuinely cannot fill any other way
 * still gets filled.
 */
function playedFirst<T extends { card: CandidateCard }>(ranked: readonly T[]): T[] {
  const played: T[] = [];
  const fringe: T[] = [];
  for (const r of ranked) {
    const rank = (r.card as { edhrecRank?: number | null }).edhrecRank;
    (typeof rank === 'number' && rank <= PLAYED_ENOUGH_RANK ? played : fringe).push(r);
  }
  return [...played, ...fringe];
}

/**
 * Choose the nonbasic mana base: fixing first, then whatever is best.
 *
 * Ranking alone is not enough here. `rank.ts` scores a land on popularity and
 * tags, and neither of those knows that this deck needs blue sources — so a
 * purely ranked mana base can come back as a pile of famous colourless utility
 * lands that produce nothing the commander can spend. What a land makes is read
 * with `manaSourceFor`, the same classifier `buildManaProfile` uses, so there is
 * one answer to "what does this land tap for" and the mana base is chosen with
 * it rather than repaired afterwards.
 *
 * Sweep one takes lands that raise a colour still under
 * {@link MIN_SOURCES_PER_COLOUR}. Sweep two spends whatever room is left on the
 * best remaining lands, which is where the utility lands earn their place.
 * A colourless commander has no colours to fix, so sweep one does nothing and
 * the whole allowance goes to sweep two.
 */
function pickLands<T extends { card: CandidateCard }>(
  ranked: readonly T[],
  preferred: ReadonlySet<string>,
  limit: number,
  identity: readonly string[]
): T[] {
  if (limit <= 0) return [];
  const deckColourMask = coloursToMask(identity);
  const wanted = maskToColours(deckColourMask);

  /*
   * "UNTAPPED FIRST" WAS TRIED HERE ON 2026-08-25 AND MEASURED WORSE. THE
   * NUMBERS, SO NOBODY BUILDS IT AGAIN.
   *
   * The reasoning is good and the result is not. A land that enters tapped does
   * nothing the turn you play it, `mana` in `power/subscores.ts` already docks a
   * finished deck for exactly that, and this function was choosing mana bases
   * with no idea which lands entered tapped. So the obvious move is to order
   * untapped before tapped inside each tier, reading the printed text with a
   * sentence-scoped test (needed because "As Breeding Pool enters, you may pay
   * 2 life. If you don't, it enters tapped" is not a tapland, and Gateway
   * Plaza's second-sentence "unless" is not an escape clause).
   *
   * Eight commanders, built through the live edge function both ways:
   *
   *              taplands/38   castable   mana subscore   land staples
   *   before          4.9        82.7%        94.9          7.3 / 25
   *   untapped-first  0.0        82.8%        95.1          7.0 / 25
   *
   * and with the popularity column repaired from `cards`, which is the state
   * this engine will be in once the catalogue view is rebuilt:
   *
   *   before          3.8        83.4%        95.1         13.6 / 25
   *   untapped-first  0.0        83.6%        95.1         12.4 / 25
   *
   * "land staples" is how many of the 25 most-played lands in that commander's
   * colours the deck holds, counted from `public.cards`. So the rule buys two
   * tenths of a point of castability and costs a card of real quality per deck.
   * What it actually dropped was Bojuka Bog, Azorius Chancery, Golgari Rot
   * Farm, Barren Moor, Forgotten Cave and the Guildgates, and what it put in
   * their place was Abstergo Entertainment, Daily Bugle Building, Heap Gate,
   * Holdout Settlement and Gond Gate — untapped, and worse.
   *
   * The reason is that the scorer's own tolerance is 30% taplands and these
   * mana bases sit at 13%. There was no tapland problem to solve. The junk in
   * these mana bases is not tapped, it is unranked: see `popularityCoverage` in
   * the pipeline for what was actually wrong with them that day.
   */
  const order = orderPreferredFirst(ranked, preferred);

  const have = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  const chosen: T[] = [];
  const taken = new Set<string>();

  const accept = (rec: T, colours: readonly ManaColour[]) => {
    chosen.push(rec);
    taken.add(rec.card.oracleId);
    for (const colour of colours) have[colour] += 1;
  };

  const coloursOf = (rec: T): ManaColour[] => landColours(rec.card as BuildCard, deckColourMask);

  // Pass one: cover every colour up to `MIN_SOURCES_PER_COLOUR`.
  for (const rec of order) {
    if (chosen.length >= limit) break;
    const colours = coloursOf(rec);
    if (colours.some(c => wanted.includes(c) && have[c] < MIN_SOURCES_PER_COLOUR)) {
      accept(rec, colours);
    }
  }

  /*
   * WHAT IS LEFT, AND A LAND THAT TAPS FOR NOTHING GOES LAST.
   *
   * This used to be one loop that accepted any remaining land in rank order,
   * and `accept(rec, coloursOf(rec))` does not care that `coloursOf` came back
   * empty. Every land in the catalogue scores identically — mana value 0, so
   * full castability, and the land quota is the only role short, so full role
   * gap — so this loop was never choosing anything. It was reading
   * `rankCandidates`' tie-break.
   *
   * While that tie-break was alphabetical the loop looked fine, because the A
   * to C end of Magic's land names is unusually strong: Ancient Tomb, Arid
   * Mesa, Battlefield Forge, Blood Crypt, Bloodstained Mire, Caves of Koilos,
   * Cavern of Souls, City of Brass, Clifftop Retreat, Command Tower. Replacing
   * the alphabet with an unbiased hash in `rank.ts` removed that accident, and
   * the real behaviour surfaced in one run: the Edgar Markov mana base came
   * back as Abandoned Air Temple, Big Apple, 3 a.m., Cradle of the Accursed,
   * Crawling Barrens, Dunes of the Dead, Foundry of the Consuls and Dark
   * Depths, which taps for no mana at all, over three basic lands.
   *
   * So the tiers are stated here rather than left to a tie-break to imply. A
   * land that produces one of the deck's colours beats a land that produces
   * colourless, which beats a land that produces nothing; inside a tier the
   * ranking still decides. This is not new policy — `castability.ts` has always
   * scored a finished deck on exactly this distinction, and this is the first
   * time the builder agrees with it.
   */
  const tierOf = (rec: T): number => {
    const colours = coloursOf(rec);
    /*
     * THREE TIERS AND NOT MORE, and the fourth one was tried and removed.
     *
     * The obvious refinement is to rank a land by how many of the deck's
     * colours it makes, on the reasoning that a Command Tower beats a Castle
     * Ardenvale. Measured on the Mardu decks it makes the mana base worse, not
     * better: what actually sits at the top of "produces all three" is Ancient
     * Ziggurat, Crystal Grotto, Gateway Plaza, Gond Gate and Holdout
     * Settlement, and those displaced Battlefield Forge and Caves of Koilos.
     * Fixing every colour and entering tapped is not better than fixing two and
     * entering untapped, and this function cannot see the difference. Inside a
     * tier the popularity order already puts Command Tower first, so the
     * refinement was buying nothing and paying for it. Reading "enters tapped"
     * off the text was tried too, and the note above `order` has its numbers.
     */
    if (colours.some(c => wanted.includes(c))) return 0;
    if (colours.length > 0) return 1;
    return landMakesNothing(rec.card as BuildCard, deckColourMask) ? 2 : 1;
  };

  /*
   * TIER 2 IS NOT TAKEN AT ALL. THE SLOT GOES BACK AND BECOMES A BASIC.
   *
   * Tier 2 is "produces no mana in this deck", and the loop used to accept it
   * once the first two tiers ran out — which they do, because `nonBasicRoom`
   * is `landTarget` minus a floor of two basics per colour, so it asks for
   * thirty-odd nonbasic lands whether or not thirty-odd are worth playing.
   * A tier the ranking cannot reject is a tier that always fills.
   *
   * A basic land is the alternative, it is free, it enters untapped, it makes
   * the colour, and a fetchland can find it. So a land that makes no mana is
   * strictly worse than the card that would otherwise sit in the slot, and
   * "strictly worse" is not a judgement call.
   *
   * Measured on ten commanders built against the live catalogue on 2026-08-28,
   * every tier-2 land that had been chosen, in every deck:
   *
   *   Grand Arbiter (WU)  Wooded Foothills, Bloodstained Mire,
   *                       Verdant Catacombs, Yavimaya, Cradle of Growth
   *   Meren (BG)          Flooded Strand, Yavimaya
   *   Uril (GRW)          Polluted Delta, Yavimaya
   *   Teysa (BW)          Wooded Foothills, Yavimaya
   *   Windgrace (BGR)     Flooded Strand
   *   Edgar (BRW)         Yavimaya
   *   Ghalta (G)          Polluted Delta
   *
   * Thirteen cards over ten decks and not one of them does anything: a
   * fetchland naming two basic types the deck does not play finds nothing, and
   * Yavimaya makes every land a Forest in six decks with no green. Zero
   * tier-2 lands in the ten were cards a player would keep, so the exchange
   * has no measured cost.
   *
   * The slot is not lost. `spellSlots` is fixed at `slots - landTarget` and
   * `basicSlots` is whatever the deck has not filled, so a nonbasic refused
   * here comes back as a basic and the land count is unchanged.
   *
   * `producesAnyMana` decides the boundary and is deliberately generous: a row
   * whose `oracleText` was never fetched is assumed to make mana, so a column
   * the caller did not select can never delete a real land from a mana base.
   */
  for (let tier = 0; tier <= 1; tier++) {
    if (chosen.length >= limit) break;
    for (const rec of order) {
      if (chosen.length >= limit) break;
      if (taken.has(rec.card.oracleId)) continue;
      if (tierOf(rec) !== tier) continue;
      accept(rec, coloursOf(rec));
    }
  }

  return chosen;
}

/**
 * Which of the deck's colours a land makes, read the one way this engine reads it.
 *
 * Shared so that the two places that decide whether a land is worth a slot —
 * `pickLands` when it chooses the mana base, and `trimToBudget` when it
 * replaces one to hit a price — cannot answer the question differently.
 */
function landColours(card: BuildCard, deckColourMask: number): ManaColour[] {
  const source = manaSourceFor(
    {
      name: card.name,
      type_line: card.typeLine,
      mana_cost: card.manaCost,
      cmc: card.cmc,
      oracle_text: card.oracleText ?? null,
      color_identity: card.colorIdentity,
    },
    deckColourMask
  );
  return source ? maskToColours(source.colourMask) : [];
}

/**
 * A land that produces no mana at all in THIS deck.
 *
 * The bottom tier of `pickLands`, extracted so the budget trimmer can refuse
 * the same cards. Both a fetchland naming two basic types the deck does not
 * play and a land with no mana ability at all land here.
 */
function landMakesNothing(card: BuildCard, deckColourMask: number): boolean {
  return landColours(card, deckColourMask).length === 0 && !producesAnyMana(card);
}

/**
 * Does this land tap for mana at all?
 *
 * `manaSourceFor` answers "which of the DECK's colours does this make", so a
 * land that makes only colourless comes back with an empty colour list and is
 * indistinguishable there from a Dark Depths that makes nothing. That
 * difference decides the last tier above, so it is read off the printed text
 * instead, which is the division of sources CLAUDE.md declares.
 *
 * A row with no `oracleText` cannot be told apart either way, and is assumed to
 * produce mana rather than assumed not to, so a column the caller did not fetch
 * can never push a real land to the bottom of the pile.
 */
function producesAnyMana(card: BuildCard): boolean {
  const text = card.oracleText;
  if (typeof text !== 'string' || text.length === 0) return true;
  return /\badd\s+(\{|one mana|two mana|three mana|mana of|an amount)/i.test(text);
}

/** Placeholder basics used only to size the provisional library. */
function basicPlaceholders(
  identity: readonly string[],
  basics: Readonly<Partial<Record<BasicColour, BuildCard>>>,
  count: number
): PlayabilityCardInput[] {
  if (count <= 0) return [];
  const colours = (identity.length ? identity : ['C']) as BasicColour[];
  const available = colours.filter(c => basics[c]);
  if (!available.length) return [];
  const per = Math.floor(count / available.length);
  const extra = count - per * available.length;
  return available.map((colour, i) =>
    toPlayabilityInput(basics[colour] as BuildCard, per + (i < extra ? 1 : 0))
  );
}

/**
 * Coloured pips the chosen spells actually demand, by colour.
 *
 * Read through `parseManaCost` rather than a fresh regex, so hybrid, phyrexian
 * and X costs are counted the way the castability engine counts them. A hybrid
 * pip is split across the colours that can pay it, because it genuinely can be
 * paid by any of them.
 */
export function pipDemand(entries: readonly GeneratedEntry[]): Record<ManaColour, number> {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  for (const entry of entries) {
    const cost = parseManaCost(entry.card.manaCost);
    if (!cost) continue;
    for (const cls of cost.classes) {
      const colours = maskToColours(cls.mask);
      if (!colours.length) continue;
      const share = (cls.count * Math.max(1, entry.quantity)) / colours.length;
      for (const colour of colours) out[colour] += share;
    }
  }
  return out;
}

interface AllocateBasicsInput {
  identity: readonly string[];
  basics: Readonly<Partial<Record<BasicColour, BuildCard>>>;
  slots: number;
  pips: Record<ManaColour, number>;
  sourcesByColour: Record<ManaColour, number>;
}

/**
 * Split the remaining land slots between basics.
 *
 * Two rules, in order:
 *
 *   1. Any colour the nonbasic lands left under {@link MIN_SOURCES_PER_COLOUR}
 *      gets topped up first. A deck that cannot produce a colour cannot cast
 *      the cards it picked in that colour, and castability is the primary
 *      metric, so this outranks everything else.
 *   2. Whatever is left is split in proportion to the coloured pips the chosen
 *      spells demand, by largest remainder so the total is exact. A deck whose
 *      spells are two thirds black should not run five basics of each colour.
 */
export function allocateBasics(input: AllocateBasicsInput): GeneratedEntry[] {
  const { slots, basics } = input;
  if (slots <= 0) return [];

  const colours = (
    input.identity.length ? normalizeIdentity(input.identity) : []
  ).filter(c => basics[c as BasicColour]) as ManaColour[];

  if (!colours.length) {
    const colourless = basics.C;
    if (!colourless) return [];
    return [
      {
        card: colourless,
        quantity: slots,
        reason: `${slots} colourless sources, the only basic this identity may run.`,
        score: 0,
        bucket: 'basic',
        preferred: false,
      },
    ];
  }

  const counts = Object.fromEntries(colours.map(c => [c, 0])) as Record<ManaColour, number>;
  let left = slots;

  // 1. Colour repair.
  for (const colour of colours) {
    if (left <= 0) break;
    const deficit = MIN_SOURCES_PER_COLOUR - (input.sourcesByColour[colour] ?? 0);
    if (deficit <= 0) continue;
    const take = Math.min(deficit, left);
    counts[colour] += take;
    left -= take;
  }

  // 2. Pip weight, largest remainder.
  if (left > 0) {
    const weights = colours.map(c => Math.max(0, input.pips[c] ?? 0));
    const total = weights.reduce((n, w) => n + w, 0);
    if (total <= 0) {
      // No coloured pips at all: split evenly rather than invent a preference.
      for (let i = 0; i < left; i++) counts[colours[i % colours.length]] += 1;
      left = 0;
    } else {
      const exact = weights.map(w => (w / total) * left);
      const floors = exact.map(Math.floor);
      let assigned = floors.reduce((n, f) => n + f, 0);
      const order = exact
        .map((value, i) => ({ i, remainder: value - floors[i] }))
        .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
      const extra = left - assigned;
      for (let k = 0; k < extra; k++) floors[order[k % order.length].i] += 1;
      colours.forEach((c, i) => (counts[c] += floors[i]));
      left = 0;
    }
  }

  return colours
    .filter(c => counts[c] > 0)
    .map(colour => {
      const card = basics[colour as BasicColour] as BuildCard;
      const pips = Math.round(input.pips[colour] ?? 0);
      return {
        card,
        quantity: counts[colour],
        reason: `${counts[colour]} to support ${pips} ${colourName(colour)} pip${pips === 1 ? '' : 's'} in the deck.`,
        score: 0,
        bucket: 'basic' as Bucket,
        preferred: false,
      };
    });
}

const COLOUR_NAMES: Record<ManaColour, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

function colourName(colour: ManaColour): string {
  return COLOUR_NAMES[colour];
}

/**
 * Bring the deck inside the price ceiling by swapping, not by deleting.
 *
 * WHAT THE FIRST VERSION GOT WRONG
 * --------------------------------
 * It refused to touch lands. On the Atraxa build measured on 2026-08-19 that
 * was catastrophic rather than merely conservative: the mana base alone came to
 * about $700 against a $500 budget — Diamond Valley and High Market are Reserved
 * List cards — so the loop worked its way down the SPELLS, replaced sixty of
 * them with twenty-cent Food tokens, hit its own iteration guard, and returned a
 * deck that was both ruined and still $217 over. It had spent the entire deck
 * paying for a bill it was forbidden from reading.
 *
 * So both halves are replaceable now, each within its own class: a land becomes
 * a cheaper land, a spell becomes a cheaper spell. Swapping a land for a spell
 * would leave a deck it cannot cast, and castability is the metric everything
 * else here answers to.
 *
 * It stops on the first pass that makes no progress rather than grinding to a
 * fixed count, and the caller reports the outcome either way. A $500 budget
 * against a pool whose cheapest legal mana base costs $700 is a fact about the
 * request; the honest answer is to say the number rather than to keep mutilating
 * the deck in pursuit of it.
 */
interface TrimBudgetInput {
  picked: GeneratedEntry[];
  spellPool: readonly BuildCard[];
  landPool: readonly BuildCard[];
  taken: Set<string>;
  budgetUsd: number;
  /**
   * The deck's colours, so a cheaper LAND can be checked for being a land.
   *
   * WHY THIS ARGUMENT EXISTS. The replacement was `pool.find(c => not taken &&
   * cheaper && isLandCandidate(c) === wantsLand)` — the first cheap enough row
   * of the right kind, in rank order, and nothing asked whether it made mana.
   * `pickLands` is careful about that and this undid it afterwards.
   *
   * Grand Arbiter Augustin IV, Azorius, $400 budget, built against the live
   * catalogue on 2026-08-28. Four of the swaps it made:
   *
   *   Misty Rainforest  $35.59  ->  Wooded Foothills      $17.05
   *   Scalding Tarn     $37.64  ->  Bloodstained Mire     $17.34
   *   Arid Mesa         $31.19  ->  Yavimaya, Cradle...   $15.53
   *   Mana Confluence   $35.25  ->  Verdant Catacombs     $28.76
   *
   * Every card on the left finds or makes white or blue. Not one on the right
   * does: Wooded Foothills fetches a Mountain or a Forest, Bloodstained Mire a
   * Swamp or a Mountain, Verdant Catacombs a Swamp or a Forest, and Yavimaya
   * makes every land a Forest in a deck with no green. The trimmer took four
   * working lands out of the mana base and put four blank cards in, and the
   * only thing it checked was the price.
   *
   * So the class a land is replaced within is not "land", it is "land that
   * makes mana this deck can spend".
   */
  identity: readonly string[];
}

interface TrimBudgetOutcome {
  swaps: number;
  before: number;
  after: number;
}

function trimToBudget(input: TrimBudgetInput): TrimBudgetOutcome {
  const { picked, taken, budgetUsd } = input;
  const deckColourMask = coloursToMask(input.identity);
  const priceOf = (e: GeneratedEntry) => (e.card.usd ?? 0) * e.quantity;
  const total = () => picked.reduce((n, e) => n + priceOf(e), 0);

  const before = total();
  let swaps = 0;

  // Generous, because each pass removes exactly one expensive card and a deck
  // can legitimately hold ninety-nine of them. The no-progress break below is
  // the real terminator; this only stops a pathological pool from spinning.
  for (let guard = 0; guard < 400; guard++) {
    if (total() <= budgetUsd) break;

    let worstIndex = -1;
    let worstPrice = 0;
    for (let i = 0; i < picked.length; i++) {
      const entry = picked[i];
      // A basic land costs pennies and is the thing everything else falls back
      // to. A planner pick is a deliberate choice and is left alone.
      if (entry.bucket === 'basic' || entry.preferred) continue;
      const price = priceOf(entry);
      if (price > worstPrice) {
        worstPrice = price;
        worstIndex = i;
      }
    }
    if (worstIndex < 0 || worstPrice <= 0) break;

    const removed = picked[worstIndex];
    const wantsLand = removed.bucket === 'land';
    const pool = wantsLand ? input.landPool : input.spellPool;
    const affordable = (c: BuildCard) =>
      !taken.has(c.oracleId) &&
      (c.usd ?? 0) < worstPrice &&
      isLandCandidate(c) === wantsLand &&
      // A cheaper land still has to be a mana source. See `identity`.
      (!wantsLand || !landMakesNothing(c, deckColourMask));

    /*
     * A CHEAPER CARD THAT DOES THE SAME JOB, and only then a cheaper card.
     *
     * This used to take the first affordable card of the right kind — land or
     * spell — and nothing else. Measured on a $500 Meren build: Vampiric Tutor
     * at $50.89 was replaced by Zulaport Cutthroat at $1.00, and Imperial Seal
     * at $165.15 by Vengeful Bloodwitch. Both substitutes are aristocrats
     * creatures and neither is a tutor, so the deck lost its ability to find a
     * card and gained a second copy of a job it already had.
     */
    const sameJob = ROLES.includes(removed.bucket as Role)
      ? pool.find(c => affordable(c) && cardRole(c, removed.bucket as Role))
      : undefined;
    const replacement = sameJob ?? pool.find(affordable);

    if (!replacement) {
      // Nothing cheaper of the right kind. Stop rather than move on to the next
      // most expensive card, because that is how a mana base nobody may touch
      // ends up being paid for out of the spells.
      break;
    }

    taken.delete(removed.card.oracleId);
    taken.add(replacement.oracleId);
    /*
     * AND THE LABEL FOLLOWS THE CARD, not the slot it fell into.
     *
     * The bucket used to be inherited outright, so the deck told a player that
     * Zulaport Cutthroat was one of its tutors. The result screen groups by
     * this field, so an inherited label is not a cosmetic slip: it is the deck
     * describing itself wrongly, in the one place a player looks to check what
     * the builder did.
     */
    const keepsJob = ROLES.includes(removed.bucket as Role) && cardRole(replacement, removed.bucket as Role);
    const nowServes = keepsJob
      ? (removed.bucket as Role)
      : (ROLES.find(role => role !== 'land' && cardRole(replacement, role)) ?? 'flex');

    picked[worstIndex] = {
      card: replacement,
      quantity: 1,
      reason:
        `${replacement.name} at $${(replacement.usd ?? 0).toFixed(2)} in place of ` +
        `${removed.card.name} at $${worstPrice.toFixed(2)}, to stay inside the budget.` +
        (keepsJob
          ? ''
          : ` Nothing cheaper does the same job, so the deck is one ${removed.bucket} short.`),
      score: removed.score,
      bucket: nowServes as Bucket,
      preferred: false,
    };
    swaps++;
  }

  return { swaps, before, after: total() };
}
