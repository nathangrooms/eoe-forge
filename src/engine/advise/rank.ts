/**
 * Ranking: score the whole legal pool, then truncate.
 *
 * The order of operations is the entire point of this file.
 *
 *   eligible → score every survivor → sort → *then* take N
 *
 * An earlier bug in this repo did the opposite for card recommendations: it
 * matched tags loosely, took `.limit(40)`, and ranked those forty. That ranks
 * an arbitrary slice of the table very carefully. Nothing here may take a
 * limit before `rankCandidates` has scored the full pool, and
 * `recommend.test.ts` asserts it.
 *
 * The hard filters are applied twice — once in SQL (`query.ts`, the fast path)
 * and again here (the guarantee). That is not redundancy by accident. SQL is
 * how the pool gets small enough to move; this pass is why an illegal or
 * off-colour card cannot reach a user even if the query is later edited, the
 * adapter is swapped, or a cached row is stale. An illegal suggestion is worse
 * than no suggestion, so it is checked where it cannot be optimised away.
 *
 * Pure. No network, no AI.
 */

import { sharedTagScore, sharedTags as sharedSignalTags } from '../knowledge/tag-signal.ts';
import { cardPlayability, type ManaProfile } from '../playability/castability.ts';
import type {
  CandidateCard,
  DeckProfile,
  Recommendation,
  RecommendOptions,
  Role,
  Signal,
} from '../core/types.ts';
import { ROLES } from '../core/types.ts';
import { isLegalIn, withinIdentity } from './query.ts';
import { roleShortfall } from './profile.ts';
import { cardRole } from './roles.ts';
import { archetypeFit, planFit, worksAgainstPlan } from '../knowledge/behaviour.ts';

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ *
 *
 * Chosen so the signals rank in the order a deckbuilder would rank them, and
 * written down as named constants so the ordering can be argued with.
 *
 *   role gap   3.0  The actionable one. "You have 4 ramp and want 10" is a
 *                   concrete deficiency; a card that fixes it beats a card
 *                   that is merely thematically pleasant.
 *   cmdr fit   2.2  Does this card do what THIS commander does, read from both
 *                   cards' ability records. Placed above tag synergy and below
 *                   castability, deliberately: "its record proliferates and so
 *                   does the commander's" is a stronger claim than "it shares
 *                   the word ramp with the deck", and weaker than "you can
 *                   actually pay for it". A declared position with no empirical
 *                   basis, like every weight beside it, and the number that the
 *                   four-deck overlap measurement in `ENGINE-PICKS.md` was
 *                   chosen against.
 *   synergy    2.0  Does it belong here at all. IDF-weighted via tag-signal,
 *                   so a shared `storm` (worth 9.7) counts for far more than a
 *                   shared `ramp` (4.0), and platitudes are already stripped.
 *                   It is the FALLBACK now: a card with an ability record is
 *                   judged on what it does, and this is what is left for a card
 *                   that has none.
 *   curve      1.0  A tilt, not a verdict. Measured against the deck's own
 *                   mean mana value, so it invents no ideal curve.
 *   budget     1.0  Only consulted when the user asks about budget.
 *
 *   castable   2.5  Added when the mana base is known. Placed ABOVE synergy and
 *                   below role gap on a product decision, not a measurement: a
 *                   card you cannot reliably cast is worth nothing however well
 *                   it fits the theme, but a card that fixes a concrete
 *                   deficiency is still the more useful suggestion. It is also
 *                   a GATE — see `cannot-cast` in `ineligibility` — because
 *                   ranking an uncastable card lower still leaves it on the
 *                   list, and a suggestion the deck cannot support is not a
 *                   weak suggestion, it is a wrong one.
 *
 *                   2.5 is a starting position with no empirical basis, and it
 *                   must not be presented as one. There is no labelled data in
 *                   this product to fit it to.
 */
export const WEIGHTS = {
  roleGap: 3.0,
  playability: 2.5,
  commanderFit: 2.2,
  tagSynergy: 2.0,
  curveFit: 1.0,
  budgetFit: 1.0,
  popularity: 0.8,
} as const;

/**
 * The rank at which the popularity prior has decayed to nothing.
 *
 * `edhrec_rank` is a popularity ordering over the whole catalogue, so its
 * useful signal is concentrated at the top: the gap between rank 5 and rank 50
 * says something, the gap between 12,000 and 12,500 says nothing. A logarithmic
 * decay to zero at this rank is the shape that matches, and it puts the weight
 * BELOW curve fit, which is the point. It is a tilt among equals, not a reason.
 */
const POPULARITY_HORIZON = 25000;

/**
 * How much this call may lean on popularity, clamped so the ordering holds.
 *
 * `WEIGHTS.popularity` (0.8) is right for the optimiser, which ranks additions
 * to a deck that already exists: role gaps and shared tags are measured against
 * sixty real cards, so there is plenty of signal and popularity is a tie-break.
 *
 * A deck generator has none of that. Against a profile seeded with the
 * commander alone every role is equally short, so the role-gap signal is the
 * same 3.0 for every card that carries any role tag at all, and what is left to
 * separate them rewards being cheap. Measured on 2026-08-19 building an Atraxa
 * deck from the live catalogue: Bone Saw scored 7.50 and Sol Ring 7.34, and the
 * finished deck was thirty pieces of nearly-free Equipment. Popularity is the
 * only broad evidence in this whole schema that a card is one people actually
 * play — we hold no inclusion counts, no win rates and no synergy data — so a
 * caller with an empty deck is allowed to lean on it harder.
 *
 * It is CLAMPED to `WEIGHTS.playability`, and that is not a style choice. The
 * standing product rule is that a card you cannot reliably cast is worth
 * nothing however popular it is, so castability must outrank popularity. A
 * caller cannot break that rule by passing a bigger number; the clamp is here
 * rather than at the call site so it holds for every caller, present and
 * future.
 */
/**
 * How hard THIS caller leans on the commander plan.
 *
 * The default 2.2 is tuned for the optimiser, which is looking at a deck that
 * already exists: sixty real cards give `roleGap` and `tagSynergy` genuine
 * signal, so commander fit is one voice among several.
 *
 * A GENERATOR STARTS FROM NOTHING, and there the balance is wrong. There is no
 * deck to synergise with, so `tagSynergy` measures against air; every role is
 * maximally short, so `roleGap` pays the same 3.0 to anything carrying that
 * role. Fitting the commander is not one voice among several, it is the only
 * question being asked, and it was ranked BELOW filling a quota.
 *
 * A player saw the consequence immediately: a Krenko deck came back with 25
 * Treasure cards in it. Every one of them filled the ramp quota at 3.0 and
 * Krenko is a Goblin deck.
 *
 * Clamped the same way popularity is, and for the same reason: a card this
 * deck cannot cast is a bad card for this deck however well it fits the plan.
 */
function commanderFitWeight(options: RecommendOptions): number {
  const asked = options.commanderFitWeight;
  if (typeof asked !== 'number' || !Number.isFinite(asked) || asked < 0) {
    return WEIGHTS.commanderFit;
  }
  return Math.min(asked, WEIGHTS.playability * 1.6);
}

/**
 * The SHELL is worth less than the COMMANDER, because it is a guess.
 *
 * Both signals shared `commanderFitWeight` until 4 Sep 2026, which is 3.6 on an
 * empty deck. The commander is CERTAIN - it is in the deck and its plan is what
 * the deck does. The shell is INFERRED, one of eighteen picked by a cosine, and
 * the same card could score both and reach 7.2 while the whole popularity term
 * spans 2.4.
 *
 * That is the arithmetic behind a correct shell making a deck worse. Measured
 * on Sythis, Harvest's Hand built with the Enchantress shell against the same
 * build without it: the shell did its own job better, "other enchantresses"
 * going 3 to 5, and the deck lost a benchmark job because the role gaps then
 * filled with Charitable Levy (rank 7,032) and Altar of the Pantheon (6,181)
 * while Commander's Sphere (51) and Garruk's Uprising (90) left. The
 * popularity difference between rank 51 and rank 7,032 is about 1.17 and the
 * shell was handing out up to 3.6.
 *
 * `ARCHETYPE_FIT_SHARE` is what a guess is worth against a certainty. It is
 * still the largest single term after the role gap, so an on-theme card still
 * beats an off-theme one of similar standing; what it can no longer do is beat
 * a format staple by four points.
 */
const ARCHETYPE_FIT_SHARE = 0.6;

function archetypeFitWeight(options: RecommendOptions): number {
  return commanderFitWeight(options) * ARCHETYPE_FIT_SHARE;
}

function popularityWeight(options: RecommendOptions): number {
  const asked = options.popularityWeight;
  if (typeof asked !== 'number' || !Number.isFinite(asked) || asked < 0) {
    return WEIGHTS.popularity;
  }
  return Math.min(asked, WEIGHTS.playability);
}

/**
 * Below this a card is not offered at all.
 *
 * Deliberately well under the 40% at which a card in the deck already counts as
 * a problem. Refusing to SUGGEST is a stronger action than flagging something
 * already present, so the bar for it is set lower, and a card that merely looks
 * awkward is ranked down rather than hidden.
 */
export const UNCASTABLE_GATE_PCT = 25;

/**
 * Above this, castability stops being worth extra.
 *
 * THE OTHER HALF OF THE CHEAP AND COLOURLESS TIEBREAK, and the half that was
 * not diagnosed the first time round.
 *
 * `cardPlayability` answers a percentage, and paying `WEIGHTS.playability`
 * times that percentage looks neutral. It is not. A zero-mana colourless
 * artifact is castable 100% of the time by construction — every deck can pay
 * nothing — so it collects the full 2.5 for free, while a real card in two
 * colours at four mana collects perhaps 2.0. That is a flat 0.5 bonus for
 * costing nothing and asking for no colours, applied to every card in the pool,
 * on every pass. Measured on the Muldrotha build before this change: 61 of its
 * 64 nonland cards cost one mana or less, 51 were colourless, and it was
 * castable 94% of the time on average, which is the mark of a deck that
 * optimised for being payable rather than for doing anything.
 *
 * A percentage is the wrong shape for what this signal MEANS. "Can this deck
 * reliably pay for this card" is a threshold question. Once the answer is yes
 * there is nothing further to reward, and Ornithopter being more payable than
 * Birds of Paradise is not a fact about which is the better card.
 *
 * So the signal saturates: full credit at or above this figure, and it falls
 * away linearly below it toward the `cannot-cast` gate.
 *
 * 75 WAS STILL TOO HIGH, and 50 replaced it on 2026-08-23.
 *
 * The figure has to be one an ordinary on-colour card in a real deck actually
 * reaches, or the saturation never fires for anything except the colourless
 * cards it was written to stop rewarding. It did not: a five-drop in three
 * colours lands near 50%, so at a comfort point of 75 it still collected a
 * third less than a Bone Saw. Measured by `scratch/refute-eight.mjs` over eight
 * commanders on the 2026-08-19 snapshot with the comfort point at 75, counting
 * the 64 nonland spells of each finished deck:
 *
 *   mean mana value 1.33 to 2.08, and across all eight decks — 512 spells —
 *   exactly TWO cards cost five mana or more.
 *
 * Kaalia of the Vast, whose entire function is putting a seven-mana Angel or
 * Demon onto the battlefield attacking, was handed a 99 whose most expensive
 * nonland card cost three. At 50 the same eight decks run a mean of 1.80 to
 * 2.69 with a real four-drop band, and the thing this must not cost — actually
 * being able to cast the deck — did not move: the finished decks are castable
 * on curve 69% to 76% of the time, against 62% to 85% before.
 *
 * 50 is a declared choice and not a fit. It sits between the `cannot-cast` gate
 * at 25 and the 75 it replaced, and it says that paying for a card half the
 * time is comfortable in a format where the game lasts fifteen turns. It is not
 * pushed lower because the gap between "comfortable" and "refused" has to stay
 * wide enough for the signal to be a slope rather than a switch.
 *
 * THIS IS NOT THE WHOLE FIX AND MUST NOT BE READ AS ONE. Even at 50 the eight
 * decks hold no card at six mana or more. A deck with 35 lands and nothing to
 * ramp into is still the wrong deck, and the missing piece is a declared curve
 * target beside `COMMANDER_ROLE_TARGETS` in `advise/roles.ts` — written up as a
 * handover in `docs/design/ENGINE-PICKS.md` rather than invented here.
 */
export const CASTABILITY_COMFORT_PCT = 50;

/**
 * Saturation constant for tag synergy.
 *
 * `sharedTagScore` is an unbounded sum of IDF weights. Passing it through
 * `s / (s + K)` bounds it in [0, 1) smoothly, with no cliff: at K the signal is
 * at half strength. K = 6 puts "one rare shared tag" and "two ordinary shared
 * tags" at roughly the same place, which is the intended trade.
 */
const SYNERGY_SATURATION = 6;

/** Mana values away from the deck's mean at which curve fit saturates. */
const CURVE_SPAN = 3;

/** Below this, a curve difference is noise and no clause is emitted. */
const CURVE_MIN_REPORTABLE = 0.5;

/**
 * Spells a deck needs before it can be said to have a curve at all.
 *
 * The guard used to be `spellCount > 0`, which is true of a deck consisting of
 * one card — and that is not a hypothetical. The deck generator ranks its first
 * candidates against a profile seeded with the commander alone, whose "mean
 * mana value" is that commander's own cost. Measured on 2026-08-19 building an
 * Atraxa deck: every card at mana value 1 or less scored the full +1.0 for
 * "3.0 mana value below your curve", against a curve of one four-drop, and a
 * Bone Saw therefore outranked Swords to Plowshares.
 *
 * Eight is a judgement, not a measurement: enough cards that the mean is about
 * the deck rather than about one card, few enough that it stops mattering
 * almost immediately. Every real deck the optimiser sees is far past it, so
 * this changes nothing there.
 */
const CURVE_MIN_SPELLS = 8;

/** Default ceiling used to scale the budget signal when none is given. */
const DEFAULT_BUDGET_CEILING_USD = 20;

/** Tags that disqualify a card as a suggestion outright. */
const NEVER_SUGGEST_TAGS: ReadonlySet<string> = new Set(['basic-land']);

/* ------------------------------------------------------------------ *
 * Eligibility — the hard filters, restated
 * ------------------------------------------------------------------ */

export type Ineligibility =
  | 'illegal-in-format'
  | 'outside-color-identity'
  | 'already-in-deck'
  | 'never-suggest'
  | 'over-budget'
  | 'unpriced-under-budget-cap'
  | 'cannot-cast';

/**
 * Why this card may not be suggested, or null if it may.
 *
 * Returning the reason rather than a boolean makes the filter testable and
 * makes "why did my card vanish" answerable.
 */
export function ineligibility(
  card: CandidateCard,
  profile: DeckProfile,
  options: RecommendOptions = {}
): Ineligibility | null {
  if (!isLegalIn(card.legalities, profile.format)) return 'illegal-in-format';
  if (!withinIdentity(card.colorIdentity, profile.colorIdentity)) return 'outside-color-identity';
  if (profile.ownedOracleIds.has(card.oracleId)) return 'already-in-deck';
  if (card.tags.some(t => NEVER_SUGGEST_TAGS.has(t))) return 'never-suggest';

  if (typeof options.maxUsd === 'number') {
    // "Unknown price" is not "cheap". A budget list that quietly includes
    // unpriced cards is not a budget list.
    if (card.usd === null) return 'unpriced-under-budget-cap';
    if (card.usd > options.maxUsd) return 'over-budget';
  }

  // The same rule as prices, applied to castability: unknown is not zero. A
  // profile with no mana base, or a card with no cost, is simply not checked.
  const pct = castabilityPct(card, profile);
  if (pct !== null && pct < UNCASTABLE_GATE_PCT) return 'cannot-cast';

  return null;
}

/* ------------------------------------------------------------------ *
 * Castability
 * ------------------------------------------------------------------ */

/**
 * How often this deck could pay for this card, or null if we cannot say.
 *
 * Memoised per profile on the mana cost alone, because that is genuinely all
 * castability depends on: two cards costing `{1}{U}` have the same answer by
 * definition. Without this a 30,000-row pool would solve the same hypergeometric
 * thousands of times. The memo hangs off the profile object rather than off the
 * module, so it cannot leak between decks and cannot survive the profile.
 */
const castabilityMemo = new WeakMap<DeckProfile, Map<string, number | null>>();

export function castabilityPct(card: CandidateCard, profile: DeckProfile): number | null {
  const mana: ManaProfile | null | undefined = profile.manaProfile;
  if (!mana) return null;
  if (!card.manaCost) return null;

  let memo = castabilityMemo.get(profile);
  if (!memo) {
    memo = new Map();
    castabilityMemo.set(profile, memo);
  }
  const hit = memo.get(card.manaCost);
  if (hit !== undefined) return hit;

  let value: number | null = null;
  try {
    value = cardPlayability(
      { name: card.name, type_line: card.typeLine, mana_cost: card.manaCost, cmc: card.cmc },
      mana
    ).pct;
  } catch {
    // An unparseable cost is unknown, not unsupported.
    value = null;
  }
  memo.set(card.manaCost, value);
  return value;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * Score one card, and record which signals fired.
 *
 * Depends only on the card and the profile — never on the other candidates, and
 * never on position in the input array. That independence is what makes the
 * ranking insensitive to the order the database returns rows in.
 */
export function scoreCandidate(
  card: CandidateCard,
  profile: DeckProfile,
  options: RecommendOptions = {}
): { score: number; signals: Signal[]; fillsRoles: Role[]; shared: string[] } {
  const signals: Signal[] = [];

  /* --- Role gap ---------------------------------------------------- */
  // A card serving several short roles is credited for the worst one, not the
  // sum: a card is one card, and adding it closes one slot.
  const fillsRoles = ROLES.filter(
    role => cardRole(card, role) && roleShortfall(profile, role) > 0
  );
  let bestRole: Role | null = null;
  let bestShortfall = 0;
  for (const role of fillsRoles) {
    const s = roleShortfall(profile, role);
    // Strict `>`, over a list already in fixed `ROLES` order, so ties resolve
    // to the same role every time regardless of anything else.
    if (s > bestShortfall) {
      bestShortfall = s;
      bestRole = role;
    }
  }
  if (bestRole) {
    const have = profile.roleCounts[bestRole] ?? 0;
    const target = profile.roleTargets[bestRole] ?? 0;
    signals.push({
      kind: 'role-gap',
      score: WEIGHTS.roleGap * bestShortfall,
      /* "a" or "an", because "fills a interaction gap" was on screen. The
         role words are a closed set and all of them start with a consonant
         except interaction, so this is one test rather than a lookup. */
      detail: `fills a${/^[aeiou]/i.test(bestRole) ? 'n' : ''} ${bestRole} gap (${have} of ${target})`,
    });
  }

  /* --- Commander fit ------------------------------------------------- */
  /*
   * The answer to "every commander has unique style, so it needs to use the
   * brain to pick cards".
   *
   * Both halves come from ability records rather than from words. The plan is
   * read off the commander's record by `planForCommander`; the card is matched
   * against it by the facets on its own record. Atraxa's plan wants
   * `eff:proliferate` because Atraxa's record proliferates, and a card matches
   * because its record proliferates too — not because both oracle texts happen
   * to contain the same string.
   *
   * Silent for a card with no record, and silent for a commander with no plan.
   * That is the same rule castability follows: unknown produces no signal at
   * all rather than a zero that would read as "this fits nothing".
   */
  const fit = planFit(profile.commanderPlan ?? null, card);
  if (fit.fit > 0) {
    const best = fit.matched[0];
    signals.push({
      kind: 'commander-fit',
      score: commanderFitWeight(options) * fit.fit,
      detail:
        fit.matched.length === 1
          ? best.because
          : `${best.because}, and this does ${fit.matched.length} of what it wants`,
    });
  }

  /* --- Working against the plan ------------------------------------- */
  /*
   * THE FIRST NEGATIVE SIGNAL IN THIS MODEL, and the reason it took this long
   * is that the engine could not say the thing until 31 Aug 2026.
   *
   * The generator put Soul-Guide Lantern in a Meren deck: graveyard hate, in a
   * deck whose whole plan is a graveyard. Every signal above answers "how much
   * does this help", so a card that empties the resource the deck is built on
   * and a card that does nothing scored the same. The compiler could not even
   * read the card - "exile all graveyards" had no rule - and once it could,
   * `eff:exile-graveyard` had to be split from `eff:exile` or the card counted
   * as REMOVAL and got picked more often.
   *
   * ONE ENTRY, and the table is the honest shape rather than the ambitious one.
   * Anti-synergy is not a general theory here: it is a list of facts of the
   * form "this facet attacks that want", each one measured before it is added,
   * the same discipline `ROLE_FACETS` runs on. A second entry needs a second
   * measurement, not a second guess.
   *
   * The penalty is a FULL commander-fit weight, because the card is not merely
   * unhelpful — it is the deck's own plan being undone, and a small nudge would
   * leave it winning on popularity, which is exactly how it got in.
   */
  const against = worksAgainstPlan(profile.commanderPlan ?? null, card);
  if (against) {
    signals.push({
      kind: 'anti-synergy',
      score: -commanderFitWeight(options),
      detail: against.because,
    });
  }

  /* --- Archetype fit ------------------------------------------------ */
  /*
   * "Decks must be custom to them, as well as the archetype" - the owner.
   *
   * ADDED TO COMMANDER FIT RATHER THAN COMPETING WITH IT, and the addition is
   * the combination rule. `withArchetype` has already capped this axis below
   * the commander's, so a card that does only the archetype's job never
   * outranks one that does the commander's; a card that does BOTH collects both
   * and outranks either. That is what makes an Aristocrats Krenko a deck of the
   * Goblins that die rather than a deck of Goblins or a deck of sacrifice
   * outlets that are not Goblins.
   *
   * It shares `WEIGHTS.commanderFit` on purpose. The two signals ask the same
   * question of two different plans, so a weight of its own would be a second
   * place deciding how loud the archetype is, free to disagree with
   * `ARCHETYPE_SHARE`, which is the one place that decides it.
   *
   * Silent when the player asked for no archetype, or asked for one no shell
   * matched. Same rule as castability: unknown produces no signal at all.
   */
  const archFit = archetypeFit(profile.archetype ?? null, card);
  if (archFit.fit > 0) {
    const best = archFit.matched[0];
    signals.push({
      kind: 'archetype-fit',
      score: archetypeFitWeight(options) * archFit.fit,
      detail:
        archFit.matched.length === 1
          ? best.because
          : `${best.because}, and this does ${archFit.matched.length} of what the shell wants`,
    });
  }

  /* --- Tag synergy -------------------------------------------------- */
  const shared = sharedSignalTags(profile.signalTags, card.tags);
  const raw = sharedTagScore(profile.signalTags, card.tags);
  if (raw > 0 && shared.length > 0) {
    signals.push({
      kind: 'tag-synergy',
      score: WEIGHTS.tagSynergy * (raw / (raw + SYNERGY_SATURATION)),
      detail:
        `shares ${shared.length} ${shared.length === 1 ? 'tag' : 'tags'} with your deck ` +
        `(${shared.slice(0, 3).join(', ')})`,
    });
  }

  /* --- Curve fit ---------------------------------------------------- */
  // Positive delta = cheaper than the deck's own average.
  const delta = profile.meanCmc - card.cmc;
  if (profile.spellCount >= CURVE_MIN_SPELLS && Math.abs(delta) >= CURVE_MIN_REPORTABLE) {
    const clamped = Math.max(-1, Math.min(1, delta / CURVE_SPAN));
    signals.push({
      kind: 'curve-fit',
      score: WEIGHTS.curveFit * clamped,
      detail: `${Math.abs(delta).toFixed(1)} mana value ${delta > 0 ? 'below' : 'above'} your curve`,
    });
  }

  /* --- Castability --------------------------------------------------- */
  // Only ever reported when the deck's mana base is known. A card the engine
  // could not measure produces no signal at all, rather than a zero that would
  // read as "you definitely cannot cast this".
  const castable = castabilityPct(card, profile);
  if (castable !== null) {
    signals.push({
      kind: 'castability',
      // Saturating at `CASTABILITY_COMFORT_PCT`, so being MORE payable than
      // comfortably payable is worth nothing. See that constant for the whole
      // argument and for the Muldrotha deck that made it necessary.
      score: WEIGHTS.playability * Math.min(1, castable / CASTABILITY_COMFORT_PCT),
      detail: `you could pay for this ${Math.round(castable)}% of the time on turn ${Math.max(1, Math.round(card.cmc))}`,
    });
  }

  /* --- Popularity ---------------------------------------------------- */
  // Normally the weakest signal in the model, and deliberately so: it says
  // "other people play this", which is worth something when two cards are
  // otherwise level and worth nothing against a card that fixes a real
  // deficiency. Absent for a card the sync has not reached, because unknown is
  // not unpopular. See `popularityWeight` for the one case that raises it, and
  // for why it can never be raised past castability.
  if (card.edhrecRank !== null && card.edhrecRank > 0) {
    const decay = Math.max(
      0,
      1 - Math.log(card.edhrecRank) / Math.log(POPULARITY_HORIZON)
    );
    if (decay > 0) {
      signals.push({
        kind: 'popularity',
        score: popularityWeight(options) * decay,
        detail: `played in a lot of decks (EDHREC rank ${card.edhrecRank.toLocaleString('en')})`,
      });
    }
  }

  /* --- Budget ------------------------------------------------------- */
  const wantsBudget = options.preferBudget === true || typeof options.maxUsd === 'number';
  if (wantsBudget && card.usd !== null) {
    const ceiling = options.maxUsd ?? DEFAULT_BUDGET_CEILING_USD;
    if (ceiling > 0) {
      const cheapness = Math.max(0, 1 - Math.min(1, card.usd / ceiling));
      signals.push({
        kind: 'budget-fit',
        score: WEIGHTS.budgetFit * cheapness,
        detail: `$${card.usd.toFixed(2)}`,
      });
    }
  }

  const score = signals.reduce((sum, s) => sum + s.score, 0);
  return { score, signals, fillsRoles, shared };
}

/** Assemble the reason from the signals that actually fired. */
export function buildReason(signals: readonly Signal[]): string {
  if (!signals.length) return 'No distinguishing signal.';
  const parts = signals.map(s => s.detail);
  return parts.join('; ').replace(/^./, c => c.toUpperCase()) + '.';
}

/* ------------------------------------------------------------------ *
 * Dedupe
 * ------------------------------------------------------------------ */

/**
 * Collapse printings to cards, keeping the cheapest.
 *
 * `cards` stores printings: 32,881 commander-legal rows are 31,833 distinct
 * cards, and one card has four rows. Without this, a suggestion list can offer
 * Sol Ring three times. The cheapest printing is kept because the question a
 * budget answer needs is "what does it cost to add this card", and ties are
 * broken by `id` so the choice does not depend on row order.
 */
export function dedupeByOracle(cards: readonly CandidateCard[]): CandidateCard[] {
  const best = new Map<string, CandidateCard>();
  for (const card of cards) {
    const prev = best.get(card.oracleId);
    if (!prev || cheaper(card, prev)) best.set(card.oracleId, card);
  }
  return [...best.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
}

function cheaper(a: CandidateCard, b: CandidateCard): boolean {
  // Unpriced sorts last, so a priced printing always wins over an unpriced one.
  if (a.usd === null && b.usd === null) return a.id < b.id;
  if (a.usd === null) return false;
  if (b.usd === null) return true;
  if (a.usd !== b.usd) return a.usd < b.usd;
  return a.id < b.id;
}

/* ------------------------------------------------------------------ *
 * The ranker
 * ------------------------------------------------------------------ */

/**
 * WHAT HAPPENS WHEN THE SCORE HAS NO OPINION, which is most of the time.
 *
 * Until 2026-08-23 this was `a.card.name.localeCompare(b.card.name)`, and the
 * comment above it said the tie-breakers exist to make the result independent
 * of input order. They did. They also made it dependent on the alphabet, and
 * that turned out to be the single largest influence on what a generated deck
 * contains, because the score ties enormously:
 *
 *   Measured by `scratch/refute-ties.mjs` over eight commanders on the
 *   2026-08-19 catalogue snapshot, seeded with the commander alone. Ranking
 *   Kaalia of the Vast's 17,818 legal spells produced 3,472 distinct score
 *   values, and 5,074 of those cards scored exactly 5.3750. The deck needs 64
 *   spells and the 64th sat at 5.78, a whisker above that block, so the flex
 *   and role passes reached straight into a five-thousand-card tie and took it
 *   in alphabetical order. Kaalia's finished 99 drew 92% of its spells from
 *   names beginning A to I against a pool that is 46% A to I; Yuriko's drew
 *   91% against 43%. Across all eight decks the letter C was picked at 2.03x
 *   its share of the pool and the letter S at 0.51x, R at 0.30x, V at 0.22x.
 *   Sol Ring, Swords to Plowshares, Rhystic Study, Toxic Deluge and Vampiric
 *   Tutor lose to Academy Manufactor, Arcane Denial and Blood Artist for a
 *   reason that has nothing to do with Magic.
 *
 * A tie means the model genuinely cannot separate two cards, so the honest
 * answer is not to invent a preference — it is to break the tie WITHOUT A
 * SYSTEMATIC BIAS, and to say how much of the deck was decided this way.
 * `generateDeck` reports the tie mass in its notes for that reason.
 *
 *   1. `edhrecRank`, ascending, nulls last. The only broad evidence in this
 *      schema that a card is one people actually play. It is already a scoring
 *      signal at weight 0.8, so this line only decides cases the score could
 *      not: a ranked card against an unranked one, or two cards at the same
 *      rank. Preferring the played card there costs nothing and is never
 *      strong enough to overturn a real signal.
 *   2. A hash of the oracle id. Deterministic, so the same pool gives the same
 *      deck every time and the tie-breakers still make the result independent
 *      of input order; uniform over the catalogue, so it has no opinion about
 *      the first letter of a card's name, its price, its rarity or its set.
 *   3. The oracle id itself, which is unique after dedupe, so no two entries
 *      can compare equal and the sort is a total order.
 *
 * This does NOT make a tied pick a good pick. It removes one specific wrong
 * answer and leaves the real problem visible: a signal set that cannot tell
 * five thousand cards apart needs more signal, and the fix for that is a
 * commander plan that fires (`knowledge/behaviour.ts`) and an `edhrec_rank`
 * column that is not NULL on 19,592 rows.
 */
export function compareTied(a: CandidateCard, b: CandidateCard): number {
  const ar = a.edhrecRank !== null && a.edhrecRank > 0 ? a.edhrecRank : Number.POSITIVE_INFINITY;
  const br = b.edhrecRank !== null && b.edhrecRank > 0 ? b.edhrecRank : Number.POSITIVE_INFINITY;
  if (ar !== br) return ar - br;
  const ah = stableHash(a.oracleId);
  const bh = stableHash(b.oracleId);
  if (ah !== bh) return ah - bh;
  return a.oracleId.localeCompare(b.oracleId);
}

/**
 * FNV-1a over a key. Not cryptography; a spreader.
 *
 * The only property required is that it correlates with nothing a player or a
 * deck cares about. An oracle id is a random UUID assigned by Scryfall, so
 * hashing it is closer to shuffling than to sorting, and it is stable across
 * runs because the id is. `advise/cuts.ts` hashes the card NAME instead,
 * because a cut entry carries no id; hashing a name still destroys the
 * alphabetical ordering, which is the property being bought.
 */
export function stableHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Rank the full pool, then truncate.
 *
 * `options.limit` is applied on the last line and nowhere else.
 */
export function rankCandidates(
  pool: readonly CandidateCard[],
  profile: DeckProfile,
  options: RecommendOptions = {}
): Recommendation[] {
  // 1. Collapse printings to cards.
  const cards = dedupeByOracle(pool);

  // 2. Hard filters, restated in TypeScript.
  const eligible = cards.filter(c => ineligibility(c, profile, options) === null);

  // 3. Score every survivor. No truncation yet.
  const scored: Recommendation[] = eligible.map(card => {
    const { score, signals, fillsRoles, shared } = scoreCandidate(card, profile, options);
    return {
      card,
      score,
      signals,
      reason: buildReason(signals),
      fillsRoles,
      sharedTags: shared,
    };
  });

  // 4. Total order. See `compareTied` for what happens below the score, and
  //    why it is no longer the alphabet.
  scored.sort((a, b) => b.score - a.score || compareTied(a.card, b.card));

  // 5. Only now.
  const limit = options.limit;
  return typeof limit === 'number' && limit >= 0 ? scored.slice(0, limit) : scored;
}

/* ------------------------------------------------------------------ *
 * Is the popularity prior fit to rank with?
 * ------------------------------------------------------------------ */

/**
 * Whether `edhrecRank` can be trusted to order this pool, and whether what is
 * missing from it is missing for a reason the ranking will pick up.
 *
 * WHY THIS EXISTS. `scoreCandidate` above adds a popularity signal for a card
 * that carries a rank and nothing for a card that does not, on the stated
 * ground that unknown is not unpopular. That holds only while the absences are
 * unrelated to anything else about the card. When they are not, the prior stops
 * being a weak tilt toward what people play and becomes a strong tilt toward
 * whatever the absences correlate with — and every caller downstream, including
 * the deck generator, which raises this weight higher than any other caller
 * precisely because it has no deck to measure against, ranks on that instead.
 *
 * WHAT HAPPENED. Measured on the live catalogue on 2026-08-25: `cards_unique`,
 * the relation both the generator and the optimiser read their pool from, is a
 * materialized view whose last successful rebuild was 2026-08-20 and whose
 * scheduled rebuild has been skipping every night since. It froze mid-alphabet.
 * `edhrec_rank` was present on 13,183 of the 13,758 rows whose name begins A-H,
 * on 245 of the 868 beginning I, and on **0 of the 19,254 beginning J-Z**. Sol
 * Ring reads rank 1 in `cards` and NULL in the view.
 *
 * Eight commanders built through the live edge function that day came back with
 * **every nonbasic land in every deck** having a name beginning A-I, against
 * pools that are 42-46% A-I, because a land scores identically to every other
 * land on everything else the ranker measures and popularity was the only thing
 * separating them. The same eight builds with that one column repaired from
 * `cards` landed at 35-49%, on top of their pools, and went from a mean 3.3 to
 * 6.0 of the 60 most-played cards in their own colours.
 *
 * WHY IT COMPARES RATHER THAN COUNTS. Coverage alone cannot tell those two
 * worlds apart: 40% coverage is what both look like. What separates them is
 * whether the missing rows are missing for a reason the ranker can see. So this
 * splits the pool on the one property that has no business predicting how often
 * a card is played — the first letter of its name — and compares the coverage
 * of the halves. In a catalogue whose sync does not care about names they must
 * land on each other.
 *
 * The 2x cut is not tuned. On pools of six to twenty-five thousand cards a gap
 * that size cannot be sampling noise, and the healthy figure in `cards`, the
 * table the column is written to, is 86% to 99% for every letter of the
 * alphabet. Anything approaching 2x is a broken write path.
 *
 * This reports. It does not change any score: a deck ranked on a partial prior
 * is worse than one ranked on a whole prior and far better than one ranked on
 * none, and the repair is a database operation no code path here can perform.
 * What must not happen again is the silence.
 */
export function popularityCoverage(pool: readonly CandidateCard[]): {
  ranked: number;
  earlyShare: number;
  lateShare: number;
  skewedByName: boolean;
} {
  let early = 0;
  let earlyRanked = 0;
  let late = 0;
  let lateRanked = 0;

  for (const card of pool) {
    const initial = (card.name ?? '').charAt(0).toUpperCase();
    const ranked = card.edhrecRank !== null && card.edhrecRank > 0;
    if (initial >= 'A' && initial <= 'I') {
      early++;
      if (ranked) earlyRanked++;
    } else {
      late++;
      if (ranked) lateRanked++;
    }
  }

  const earlyShare = early ? earlyRanked / early : 0;
  const lateShare = late ? lateRanked / late : 0;
  const bigger = Math.max(earlyShare, lateShare);
  const smaller = Math.min(earlyShare, lateShare);

  return {
    ranked: earlyRanked + lateRanked,
    earlyShare,
    lateShare,
    // Both halves have to hold something before they can be compared, and a
    // pool with no ranks at all is not skewed — it separates nobody.
    skewedByName: early > 0 && late > 0 && bigger > 0 && smaller < bigger / 2,
  };
}
