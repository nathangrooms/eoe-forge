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
import { rankCandidates } from '../advise/rank.ts';
import { roleTargetsFor, cardRole, creatureTargetFor, type DeckStyle } from '../advise/roles.ts';
import { normalizeIdentity } from '../advise/query.ts';
import {
  facetCoverage,
  planForCommander,
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
import { evaluateDeck, type DeckEvaluation } from '../evaluate.ts';

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
  /** Overrides the declared land target. Defaults to `roles.ts`. */
  landTarget?: number;
  roleTargets?: Partial<Record<Role, number>>;
  /**
   * The deck style the user picked: `creatures`, `balanced` or `spells`.
   *
   * It sets ONE number, the creature floor in `roles.ts`, and the generator
   * reports which style it actually used in `notes` so "you asked for creature
   * mode and got a creature deck" is checkable rather than assumed. An
   * unrecognised name falls back to `balanced` and says so; it never throws,
   * because this arrives from a request body and a bad style must still produce
   * a deck.
   *
   * Before this existed the owner's creature mode reached the language model
   * planner as prompt text and nothing else — `pipeline.ts` passed `archetype`
   * to `planFromShortlist` and never to `generateDeck` — which is why creature
   * mode produced Atraxa 7 creatures, Krenko 3, Talrand 4 and Muldrotha 7.
   */
  style?: DeckStyle | string | null;
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

export type Bucket = 'land' | 'basic' | Role | 'flex';

/** Where the deck's picks came from: behaviour records, or the old tag words. */
export interface BuildEvidence {
  /** The plan read off the commander, or null when its record was empty. */
  plan: CommanderPlan | null;
  /** Pool cards carrying an ability record, and the pool size. */
  poolWithRecord: number;
  poolSize: number;
  /** Chosen nonland cards carrying an ability record, and how many were chosen. */
  pickedWithRecord: number;
  pickedSpells: number;
  /** The style asked for, and the one used. They differ when the name was unknown. */
  styleAsked: string | null;
  styleUsed: DeckStyle;
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
 * Basic lands held back per colour of the identity, before anything else.
 *
 * Two, so that "search your library for a basic land" always has a target left
 * in every colour. Ramp that fetches basics is a large share of every green
 * deck and a Cultivate with nothing to find is a dead card.
 */
const BASIC_FLOOR_PER_COLOUR = 2;

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
 */
const EMPTY_DECK_POPULARITY = 0.8;

/* ------------------------------------------------------------------ *
 * The generator
 * ------------------------------------------------------------------ */

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
  const plan = planForCommander({
    name: input.commander.name,
    typeLine: input.commander.typeLine,
    facets: input.commander.facets ?? null,
    tags: input.commander.tags,
  });

  const style = creatureTargetFor(input.style ?? null);
  const targets = roleTargetsFor(format, input.roleTargets, input.style ?? null);
  const landTarget = clamp(input.landTarget ?? targets.land, 0, slots);
  const identity = normalizeIdentity(input.commander.colorIdentity);
  const preferred = new Set(input.preferOracleIds ?? []);
  const avoided = new Set(input.avoidOracleIds ?? []);

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
  const rankOptions = { popularityWeight: EMPTY_DECK_POPULARITY };

  const pool = input.pool.filter(c => !avoided.has(c.oracleId) && c.oracleId !== input.commander.oracleId);

  /* ---------------------------------------------------------------- *
   * 1. The mana base, before anything that has to be cast off it.
   * ---------------------------------------------------------------- */

  const basicFloor = identity.length * BASIC_FLOOR_PER_COLOUR;
  const nonBasicRoom = Math.max(0, landTarget - basicFloor);

  const landPool = pool.filter(isLandCandidate);
  const seedForLands = seedProfile(format, identity, input.commander, null, {
    // Only the land quota is short, so the role-gap signal is about lands and
    // nothing else. An Evolving Wilds is tagged `ramp` too, and crediting that
    // here would rank fixing against a ramp quota it is not being asked to fill.
    ...zeroRoleTargets(),
    land: landTarget,
  }, plan);

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
  const spellPool = pool.filter(c => !isLandCandidate(c));

  const roleProfile = seedProfile(format, identity, input.commander, provisionalMana, {
    ...targets,
    land: 0, // lands are done; a land quota here would re-open it
  }, plan);
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
  const roleFill = {} as Record<Role, { picked: number; target: number }>;
  for (const role of ROLES) roleFill[role] = { picked: 0, target: role === 'land' ? landTarget : targets[role] };
  roleFill.land.picked = chosenLands.length;

  // Pass one: fill the role quotas, best card first, planner picks ahead of
  // the rest at equal eligibility. A card counts for ONE role — the one it is
  // scored against in `scoreCandidate` — because a card is one card.
  //
  // `creature` is zeroed here and filled by its own pass below. It is a FLOOR
  // across the whole deck, not a quota competing with the others: a mana dork
  // taken as ramp is still a creature, and making it choose between the two
  // would either lose the ramp slot or double-count the card.
  const quota = { ...targets, land: 0, creature: 0 } as Record<Role, number>;
  for (const rec of orderPreferredFirst(rankedSpells, preferred)) {
    if (picked.length - chosenLands.length >= spellSlots) break;
    const card = rec.card as BuildCard;
    if (takenOracleIds.has(card.oracleId)) continue;
    const role = neediestRole(card, quota);
    if (!role) continue;
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

  for (const role of ROLES) {
    if (role === 'land' || role === 'creature') continue;
    if (quota[role] > 0) {
      shortfalls.push(
        `${quota[role]} of ${targets[role]} ${role} slots could not be filled from the legal pool`
      );
    }
  }

  /* ---------------------------------------------------------------- *
   * 2b. The creature floor.
   * ---------------------------------------------------------------- *
   *
   * THE FIX FOR "IT BARELY ADDS ANY CREATURES, EVEN WHEN I DO CREATURE MODE".
   *
   * Counted across everything already picked, not filled from zero. The role
   * quotas above take mana dorks, removal creatures and Craterhoof Behemoths
   * without being asked to, and every one of those is a creature; topping up
   * from zero would run the deck to sixty bodies and starve the rest of it.
   *
   * The top-up walks the same ranking as pass one, so a creature is chosen for
   * the same reasons any other card is — including the commander-fit signal,
   * which is what makes Krenko's creature slots fill with Goblins rather than
   * with whatever creature happens to be popular. It only ever ADDS creatures
   * up to the floor; it never cuts a non-creature to make room, because the
   * five role quotas are the deck's job list and a creature count is not worth
   * a missing sweeper.
   */
  const creatureFloor = targets.creature;
  let creaturesPicked = picked.filter(e => cardRole(e.card, 'creature')).length;
  if (creaturesPicked < creatureFloor) {
    for (const rec of orderPreferredFirst(rankedSpells, preferred)) {
      if (creaturesPicked >= creatureFloor) break;
      if (picked.length - chosenLands.length >= spellSlots) break;
      const card = rec.card as BuildCard;
      if (takenOracleIds.has(card.oracleId)) continue;
      if (!cardRole(card, 'creature')) continue;
      takenOracleIds.add(card.oracleId);
      creaturesPicked += 1;
      picked.push({
        card,
        quantity: 1,
        reason: rec.reason,
        score: rec.score,
        bucket: 'creature',
        preferred: preferred.has(card.oracleId),
      });
    }
  }
  roleFill.creature.picked = creaturesPicked;
  if (creaturesPicked < creatureFloor) {
    shortfalls.push(
      `${creatureFloor - creaturesPicked} of ${creatureFloor} creature slots could not be ` +
        `filled from the legal pool`
    );
  }

  /* ---------------------------------------------------------------- *
   * 3. Flex slots, re-ranked against the deck as it now stands.
   * ---------------------------------------------------------------- */

  const flexRoom = spellSlots - (picked.length - chosenLands.length);
  if (flexRoom > 0) {
    // The profile now has real tags, a real curve and real role counts, so
    // synergy and curve fit finally have something to measure against. At the
    // seed profile `spellCount` is 0 and curve fit cannot fire at all.
    const nowProfile = deckProfileFrom(format, identity, input.commander, picked, provisionalMana, targets, plan);
    const rerank = rankCandidates(
      shortlist.filter(c => !takenOracleIds.has(c.oracleId)),
      nowProfile,
      rankOptions
    );
    for (const rec of orderPreferredFirst(rerank, preferred)) {
      if (picked.length - chosenLands.length >= spellSlots) break;
      const card = rec.card as BuildCard;
      if (takenOracleIds.has(card.oracleId)) continue;
      takenOracleIds.add(card.oracleId);
      picked.push({
        card,
        quantity: 1,
        reason: rec.reason,
        score: rec.score,
        bucket: 'flex',
        preferred: preferred.has(card.oracleId),
      });
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
   * 5. Budget, enforced on the deck rather than guessed per card.
   * ---------------------------------------------------------------- */

  if (typeof input.budgetUsd === 'number' && input.budgetUsd > 0) {
    const outcome = trimToBudget({
      picked,
      spellPool: shortlist,
      landPool: rankedLands.map(r => r.card as BuildCard),
      taken: takenOracleIds,
      budgetUsd: input.budgetUsd,
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
    `${finalCreatures} creatures against a floor of ${creatureFloor} for the ` +
      `${style.style} style` +
      (style.matchedStyle ? '' : ` (you asked for "${String(input.style)}", which is not a style)`)
  );
  notes.push(
    plan.wants.length === 0
      ? `no ability record for ${input.commander.name}, so this deck was picked on tags alone`
      : `${input.commander.name} wants ${plan.wants
          .slice(0, 4)
          .map(w => w.facet)
          .join(', ')}${plan.tribe ? `, tribe ${plan.tribe}` : ''}` +
          (plan.fromTagsOnly ? ' (read from tags, not from a record)' : '')
  );
  notes.push(
    `${pickedCoverage.withRecord} of ${pickedCoverage.total} chosen spells had an ability ` +
      `record (${pickedCoverage.pct.toFixed(0)}%); the rest fell back to tags. Pool: ` +
      `${poolCoverage.withRecord} of ${poolCoverage.total} (${poolCoverage.pct.toFixed(0)}%)`
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
      poolWithRecord: poolCoverage.withRecord,
      poolSize: poolCoverage.total,
      pickedWithRecord: pickedCoverage.withRecord,
      pickedSpells: pickedCoverage.total,
      styleAsked: input.style == null ? null : String(input.style),
      styleUsed: style.style,
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
  commanderPlan: CommanderPlan | null
): DeckProfile {
  return deriveDeckProfile({
    format,
    colorIdentity: identity,
    cards: [toDeckCard(commander, 1)],
    roleTargets,
    manaProfile,
    commanderPlan,
  });
}

function deckProfileFrom(
  format: string,
  identity: readonly string[],
  commander: BuildCard,
  picked: readonly GeneratedEntry[],
  manaProfile: ManaProfile | null,
  roleTargets: Partial<Record<Role, number>>,
  commanderPlan: CommanderPlan | null
): DeckProfile {
  return deriveDeckProfile({
    format,
    colorIdentity: identity,
    cards: [toDeckCard(commander, 1), ...picked.map(e => toDeckCard(e.card, e.quantity))],
    roleTargets,
    manaProfile,
    commanderPlan,
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
function neediestRole(card: BuildCard, quota: Record<Role, number>): Role | null {
  let best: Role | null = null;
  let bestLeft = 0;
  for (const role of ROLES) {
    if (quota[role] <= 0) continue;
    if (!cardRole(card, role)) continue;
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
  const order = orderPreferredFirst(ranked, preferred);
  const deckColourMask = coloursToMask(identity);
  const wanted = maskToColours(deckColourMask);

  const have = { W: 0, U: 0, B: 0, R: 0, G: 0 } as Record<ManaColour, number>;
  const chosen: T[] = [];
  const taken = new Set<string>();

  const accept = (rec: T, colours: readonly ManaColour[]) => {
    chosen.push(rec);
    taken.add(rec.card.oracleId);
    for (const colour of colours) have[colour] += 1;
  };

  const coloursOf = (rec: T): ManaColour[] => {
    const card = rec.card as BuildCard;
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
  };

  for (const rec of order) {
    if (chosen.length >= limit) break;
    const colours = coloursOf(rec);
    if (colours.some(c => wanted.includes(c) && have[c] < MIN_SOURCES_PER_COLOUR)) {
      accept(rec, colours);
    }
  }

  for (const rec of order) {
    if (chosen.length >= limit) break;
    if (taken.has(rec.card.oracleId)) continue;
    accept(rec, coloursOf(rec));
  }

  return chosen;
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
}

interface TrimBudgetOutcome {
  swaps: number;
  before: number;
  after: number;
}

function trimToBudget(input: TrimBudgetInput): TrimBudgetOutcome {
  const { picked, taken, budgetUsd } = input;
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
    const replacement = pool.find(
      c =>
        !taken.has(c.oracleId) &&
        (c.usd ?? 0) < worstPrice &&
        isLandCandidate(c) === wantsLand
    );

    if (!replacement) {
      // Nothing cheaper of the right kind. Stop rather than move on to the next
      // most expensive card, because that is how a mana base nobody may touch
      // ends up being paid for out of the spells.
      break;
    }

    taken.delete(removed.card.oracleId);
    taken.add(replacement.oracleId);
    picked[worstIndex] = {
      card: replacement,
      quantity: 1,
      reason:
        `${replacement.name} at $${(replacement.usd ?? 0).toFixed(2)} in place of ` +
        `${removed.card.name} at $${worstPrice.toFixed(2)}, to stay inside the budget.`,
      score: removed.score,
      bucket: removed.bucket,
      preferred: false,
    };
    swaps++;
  }

  return { swaps, before, after: total() };
}
