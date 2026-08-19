/**
 * The ten things the power score measures, each one able to name its sources.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * The previous feature extractor produced nine bare numbers and threw away
 * everything it learned on the way to them. It also carried its own private
 * copy of card classification: a nine-line `extractCardTags` that decided a
 * card was "graveyard" if its rules text contained the word graveyard, sitting
 * a few directories away from an 815-line tagger built for exactly that job and
 * mirrored into Postgres. That made four taggers in one repository.
 *
 * Everything text-derived here now goes through `knowledge/tagger.ts`, the same
 * rules that wrote `cards.tags`. Curated judgement stays in the catalogues,
 * where it is a list of card names somebody can disagree with. The two are kept
 * apart on purpose: a catalogue hit says "somebody decided this card is fast
 * mana", a tag says "this card's rules text does this".
 *
 * Three subscores changed materially:
 *
 *   - `castability` is new, and is the heaviest weight in the model. It is the
 *     exact figure from `playability/castability.ts`, not an approximation.
 *     Before this, the power score was computed from a 10,000-iteration Monte
 *     Carlo in `deckbuilder/score/simulation.ts` whose generator repeats after
 *     15,824 states — about 161 distinct shuffles of a 99-card deck — so the
 *     "10,000 seeded draws" the deck page reported were roughly 161 draws
 *     counted sixty-two times each. The exact engine was already in the repo
 *     and was only being used for display.
 *
 *   - `consistency` is now the deck's distance from its own role targets, using
 *     the same `roleShortfall` the recommender uses to decide what to suggest.
 *     So "your consistency is low" and "add more ramp" are now the same fact
 *     measured once, rather than two subsystems with two opinions.
 *
 *   - `stax_pressure` dropped its two text heuristics. `text.includes("can't")`
 *     matched every creature that cannot be blocked, and `cost ... more ... mana`
 *     matched cost reducers. What is left is the curated stax list plus the
 *     `stax` tag, both of which mean what they say.
 *
 * And one was removed outright: `goldfish.exp_win_turn`, which was
 * `10 - (fastMana*0.06 + tutors*0.05 + wincon*0.1 + speed*0.03)`. There is no
 * measurement in that, only a constant and four arbitrary coefficients, and it
 * was displayed to players as an expected turn to win. Nothing replaces it,
 * because nothing in our data supports it.
 *
 * Pure. No network, no AI, no database.
 */

import {
  isLandCard,
  manaValue,
  tagsOf,
  type EngineCard,
  type EngineDeckEntry,
} from '../core/card.ts';
import { ROLES, type Role } from '../core/types.ts';
import { servesRole, roleTargetsFor } from '../advise/roles.ts';
import { sharedTagScore, signalTags } from '../knowledge/tag-signal.ts';
import type { DeckPlayability, ManaColour, ManaProfile } from '../playability/castability.ts';
import {
  STAPLES,
  TUTOR_TIERS,
  TWO_CARD_COMBOS,
  COMPACT_COMBOS,
  FINISHER_BOMBS,
  INEVITABILITY_ENGINES,
  MASSIVE_SWINGS,
  type WeightedList,
} from './catalogs.ts';
import { buildSubscore, type Contribution, type Subscore } from './evidence.ts';
import { SUBSCORE_WEIGHTS } from './weights.ts';

export { SUBSCORE_WEIGHTS };

/** Below this, a card counts as one you cannot reliably cast. */
export const LOW_CASTABILITY_PCT = 40;

/* ------------------------------------------------------------------ *
 * Shared measuring tape
 * ------------------------------------------------------------------ */

export interface SubscoreInput {
  /** Every line of the deck, commander included. */
  entries: readonly EngineDeckEntry[];
  commander: EngineCard | null;
  format: string;
  /** The exact castability roll-up for this decklist. */
  playability: DeckPlayability;
}

function qtyOf(entry: EngineDeckEntry): number {
  return Math.max(1, Math.trunc(entry.quantity ?? 1));
}

function lower(name: string): string {
  return (name ?? '').toLowerCase().trim();
}

/** Catalogue lookup: card name (lowercased) to the tier weight that named it. */
function tierIndex(group: Record<string, WeightedList>): Map<string, { tier: string; weight: number }> {
  const index = new Map<string, { tier: string; weight: number }>();
  for (const [tier, list] of Object.entries(group)) {
    for (const card of list.cards) {
      const key = lower(card);
      const prev = index.get(key);
      // A card listed in two tiers counts at its highest, so a reshuffle of the
      // catalogue cannot quietly demote a card.
      if (!prev || list.weight > prev.weight) index.set(key, { tier, weight: list.weight });
    }
  }
  return index;
}

const FAST_MANA_INDEX = tierIndex(STAPLES.fast_mana);
const INTERACTION_INDEX = tierIndex(STAPLES.interaction);
const CARD_ADVANTAGE_INDEX = tierIndex(STAPLES.card_advantage);
const PROTECTION_INDEX = tierIndex(STAPLES.protection);
const STAX_INDEX = tierIndex(STAPLES.stax);
const TUTOR_INDEX = tierIndex(TUTOR_TIERS);

/** Turn a tier key into something a player would say out loud. */
function tierWords(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\btier (\d)\b/, (_, n) => `tier ${n}`);
}

/* ------------------------------------------------------------------ *
 * 1. Castability — the primary metric
 * ------------------------------------------------------------------ */

/**
 * How reliably this deck can pay for its own cards.
 *
 * The value IS the deck's mean castability, so the subscore and the figure on
 * the deck page are the same number rather than two views of it. The evidence
 * splits both ways: `from` is each card's share of the mean, `holdingBack` is
 * the points each hard-to-cast card costs it. Those drags are, by construction,
 * the same cards the optimiser puts at the top of its cut list.
 */
export function castabilitySubscore(input: SubscoreInput): Subscore {
  const { playability } = input;
  const weight = SUBSCORE_WEIGHTS.castability;

  if (playability.scoredCount === 0 || playability.averagePct === null) {
    return buildSubscore({
      key: 'castability',
      weight,
      measured: 'No card in this list has a mana cost we can read, so there is nothing to work out.',
      credits: [],
      applicable: false,
      note: 'Add the full card details and this will fill in.',
    });
  }

  const total = playability.scoredCount;
  const credits: Contribution[] = [];
  const drags: Contribution[] = [];

  playability.cards.forEach((result, i) => {
    if (result.pct === null) return;
    const qty = qtyOf(input.entries[i]);
    const share = (result.pct * qty) / total;
    credits.push({
      name: result.name,
      quantity: qty,
      points: share,
      why: `castable ${Math.round(result.pct)}% of the time by turn ${result.turn}`,
    });
    if (result.pct < LOW_CASTABILITY_PCT) {
      drags.push({
        name: result.name,
        quantity: qty,
        points: ((100 - result.pct) * qty) / total,
        why:
          `only ${Math.round(result.pct)}% castable on turn ${result.turn}, ` +
          `with ${result.liveSources ?? 0} mana sources live by then`,
      });
    }
  });

  const below = playability.belowThresholdCount;
  return buildSubscore({
    key: 'castability',
    weight,
    value: playability.averagePct,
    measured:
      `Across ${total} cards with a mana cost, the average chance of being able to pay for one ` +
      `on the turn it costs is ${Math.round(playability.averagePct)}%. ` +
      (below > 0
        ? `${below} ${below === 1 ? 'card is' : 'cards are'} under ${playability.threshold}%.`
        : `Nothing is under ${playability.threshold}%.`),
    credits,
    drags,
  });
}

/* ------------------------------------------------------------------ *
 * 2. Speed
 * ------------------------------------------------------------------ */

/** Points per cheap spell. A deck of twenty two-drops is worth 24 here. */
const CHEAP_SPELL_POINTS = 1.2;
/** A mana producer the catalogue does not list, at two mana or less. */
const UNLISTED_ACCELERANT_POINTS = 3;

/**
 * How fast the deck can deploy.
 *
 * The old version of this was `fastMana*0.3 + tutors*0.25 + lowCurve*1.5 +
 * combos*0.2`, which counted the tutor and combo subscores a second time inside
 * speed and then weighted all three separately in the final sum. Tutors are
 * their own subscore; they are not counted here.
 */
export function speedSubscore(input: SubscoreInput): Subscore {
  const credits: Contribution[] = [];
  let cheapCount = 0;

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const name = lower(card.name);
    const tags = tagsOf(card);
    const listed = FAST_MANA_INDEX.get(name);

    if (listed) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: listed.weight * qty,
        why: `on the fast mana list, ${tierWords(listed.tier)}`,
      });
      continue;
    }

    if (isLandCard(card)) continue;

    if (manaValue(card) <= 2 && (tags.includes('fast-mana') || tags.includes('mana-rock') || tags.includes('mana-dork'))) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: UNLISTED_ACCELERANT_POINTS * qty,
        why: `makes mana for two or less`,
      });
      continue;
    }

    if (manaValue(card) <= 2) {
      cheapCount += qty;
      credits.push({
        name: card.name,
        quantity: qty,
        points: CHEAP_SPELL_POINTS * qty,
        why: `costs ${manaValue(card)}, so it comes down early`,
      });
    }
  }

  const listedCount = credits.filter(c => c.why.startsWith('on the fast mana list')).length;
  return buildSubscore({
    key: 'speed',
    weight: SUBSCORE_WEIGHTS.speed,
    measured:
      `${listedCount} ${listedCount === 1 ? 'card is' : 'cards are'} on the fast mana list and ` +
      `${cheapCount} more cost two or less.`,
    credits,
    note: 'Nothing here comes down early and nothing accelerates your mana.',
  });
}

/* ------------------------------------------------------------------ *
 * 3. Interaction
 * ------------------------------------------------------------------ */

const TAG_INTERACTION_POINTS: Record<string, { points: number; why: string }> = {
  counterspell: { points: 5, why: 'counters a spell' },
  'removal-sweeper': { points: 6, why: 'clears the board' },
  'board-wipe': { points: 6, why: 'clears the board' },
  'targeted-removal': { points: 4, why: 'removes one thing' },
  'removal-spot': { points: 4, why: 'removes one thing' },
  removal: { points: 3, why: 'answers something' },
};

/**
 * How much of the table's plan this deck can stop.
 *
 * A card on the curated interaction list is credited once, at its list weight,
 * and then skipped. The previous version credited a card from the list AND from
 * every text heuristic it also matched, so Swords to Plowshares scored as a
 * premium removal spell and again as a card whose text contains "exile".
 */
export function interactionSubscore(input: SubscoreInput): Subscore {
  const credits: Contribution[] = [];
  let listed = 0;

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const hit = INTERACTION_INDEX.get(lower(card.name));

    if (hit) {
      listed++;
      credits.push({
        name: card.name,
        quantity: qty,
        points: hit.weight * qty,
        why: `on the interaction list, ${tierWords(hit.tier)}`,
      });
      continue;
    }

    const tags = tagsOf(card);
    // One credit per card, at its strongest matching tag, so a card tagged both
    // `removal` and `targeted-removal` is one removal spell rather than two.
    let best: { points: number; why: string } | null = null;
    for (const tag of tags) {
      const rule = TAG_INTERACTION_POINTS[tag];
      if (rule && (!best || rule.points > best.points)) best = rule;
    }
    if (!best) continue;

    // Cheap answers are worth more than expensive ones, which is the one thing
    // the old heuristic had right.
    const cheap = manaValue(card) <= 2 ? 1.3 : 1;
    credits.push({
      name: card.name,
      quantity: qty,
      points: best.points * cheap * qty,
      why: manaValue(card) <= 2 ? `${best.why}, and cheaply` : best.why,
    });
  }

  return buildSubscore({
    key: 'interaction',
    weight: SUBSCORE_WEIGHTS.interaction,
    measured:
      `${credits.length} ${credits.length === 1 ? 'card' : 'cards'} can answer something, ` +
      `${listed} of them from the premium list.`,
    credits,
    note: 'Nothing in this deck can stop what anyone else is doing.',
  });
}

/* ------------------------------------------------------------------ *
 * 4. Tutors
 * ------------------------------------------------------------------ */

/** Catalogue weights are 0.35 to 1.0, so they need a scale to reach 0 to 100. */
const TUTOR_POINTS = 12;

export function tutorSubscore(input: SubscoreInput): { subscore: Subscore; quality: number; list: Array<{ name: string; quality: string; mv: number }> } {
  const credits: Contribution[] = [];
  const list: Array<{ name: string; quality: string; mv: number }> = [];
  let quality = 0;

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const hit = TUTOR_INDEX.get(lower(card.name));
    const tags = tagsOf(card);

    if (hit) {
      quality += hit.weight * qty;
      list.push({ name: card.name, quality: hit.tier, mv: manaValue(card) });
      credits.push({
        name: card.name,
        quantity: qty,
        points: hit.weight * TUTOR_POINTS * qty,
        why: `searches your library, ${tierWords(hit.tier)}`,
      });
      continue;
    }

    const broad = tags.includes('tutor-broad');
    const narrow = tags.includes('tutor-narrow');
    if (!broad && !narrow && !tags.includes('tutor')) continue;

    const w = broad ? 0.85 : narrow ? 0.4 : 0.6;
    quality += w * qty;
    list.push({ name: card.name, quality: broad ? 'broad' : narrow ? 'narrow' : 'category', mv: manaValue(card) });
    credits.push({
      name: card.name,
      quantity: qty,
      points: w * TUTOR_POINTS * qty,
      why: broad ? 'searches for any card' : 'searches for a particular kind of card',
    });
  }

  const subscore = buildSubscore({
    key: 'tutors',
    weight: SUBSCORE_WEIGHTS.tutors,
    measured: `${list.length} ${list.length === 1 ? 'card searches' : 'cards search'} your library.`,
    credits,
    note: 'Nothing here goes and finds a card, so every game plays out from whatever you draw.',
  });

  return { subscore, quality: Math.round(quality * 10) / 10, list };
}

/* ------------------------------------------------------------------ *
 * 5. Resilience
 * ------------------------------------------------------------------ */

export function resilienceSubscore(input: SubscoreInput): Subscore {
  const credits: Contribution[] = [];

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const hit = PROTECTION_INDEX.get(lower(card.name));

    if (hit) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: hit.weight * qty,
        why: `on the protection list, ${tierWords(hit.tier)}`,
      });
      continue;
    }

    const tags = tagsOf(card);
    if (tags.includes('protection')) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: 6 * qty,
        why: 'protects what you have played',
      });
      continue;
    }
    if (tags.includes('recursion') || tags.includes('graveyard-recursion') || tags.includes('reanimator')) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: 5 * qty,
        why: 'brings something back after it dies',
      });
    }
  }

  return buildSubscore({
    key: 'resilience',
    weight: SUBSCORE_WEIGHTS.resilience,
    measured: `${credits.length} ${credits.length === 1 ? 'card protects' : 'cards protect'} your board or rebuild it.`,
    credits,
    note: 'One board wipe and this deck starts again from nothing.',
  });
}

/* ------------------------------------------------------------------ *
 * 6. Card advantage
 * ------------------------------------------------------------------ */

export function cardAdvantageSubscore(input: SubscoreInput): Subscore {
  const credits: Contribution[] = [];

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const hit = CARD_ADVANTAGE_INDEX.get(lower(card.name));

    if (hit) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: hit.weight * qty,
        why: `on the card advantage list, ${tierWords(hit.tier)}`,
      });
      continue;
    }

    const tags = tagsOf(card);
    if (tags.includes('card-draw') || tags.includes('draw')) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: 5 * qty,
        why: 'draws you extra cards',
      });
    }
  }

  return buildSubscore({
    key: 'card_advantage',
    weight: SUBSCORE_WEIGHTS.card_advantage,
    measured: `${credits.length} ${credits.length === 1 ? 'card draws' : 'cards draw'} you more cards.`,
    credits,
    note: 'Nothing here refills your hand, so you play off the top after the first few turns.',
  });
}

/* ------------------------------------------------------------------ *
 * 7. Mana
 * ------------------------------------------------------------------ */

/** Share of the deck that should be lands. Declared policy for Commander. */
const TARGET_LAND_RATIO = 0.36;
/** Share of lands that may enter tapped before it starts costing points. */
const TOLERATED_TAPPED_RATIO = 0.3;

/**
 * Sources of one colour at which that colour counts as fully supported.
 *
 * Frank Karsten's tables put a single coloured pip on curve at roughly this
 * many sources in a 99-card deck. It is a published threshold rather than a
 * number invented here, and it is the only place the mana subscore looks at
 * colour at all.
 */
const SOURCES_PER_COLOUR = 14;

const ENTERS_TAPPED = /enters(?: the battlefield)? tapped/i;

/** How the mana subscore's 100 points are split. Declared, not fitted. */
const MANA_POINTS = { landCount: 40, colourCoverage: 30, fixing: 30 } as const;

/**
 * The mana base itself, as opposed to whether it can cast the deck.
 *
 * Castability already answers "can you pay for your cards". This answers the
 * separate question of whether the land base is well built. The first version
 * of this asked only about land count and gave a four-colour deck of nothing
 * but basic lands 99 out of 100 while castability read 32, which is two numbers
 * contradicting each other on the same screen. Colour coverage is now a third
 * of it, taken straight off the exact `ManaProfile` rather than from a second
 * pass over the rules text.
 */
export function manaSubscore(input: SubscoreInput, profile: ManaProfile): Subscore {
  const lands = input.entries.filter(e => isLandCard(e.card) && !e.isCommander);
  const landCount = lands.reduce((n, e) => n + qtyOf(e), 0);
  const deckSize = input.entries
    .filter(e => !e.isCommander)
    .reduce((n, e) => n + qtyOf(e), 0);

  if (landCount === 0) {
    return buildSubscore({
      key: 'mana',
      weight: SUBSCORE_WEIGHTS.mana,
      measured: 'This list has no lands in it.',
      credits: [],
      value: 0,
      note: 'Add a mana base and this will fill in.',
    });
  }

  const credits: Contribution[] = [];
  const drags: Contribution[] = [];

  const ratio = deckSize > 0 ? landCount / deckSize : 0;
  const ratioScore =
    MANA_POINTS.landCount * Math.max(0, 1 - Math.abs(ratio - TARGET_LAND_RATIO) * 4);

  // Colour coverage: for every colour the deck actually needs, how close it is
  // to the number of sources that colour wants.
  const identity = new Set<ManaColour>();
  for (const entry of input.entries) {
    for (const c of entry.card.color_identity ?? []) {
      if (c === 'W' || c === 'U' || c === 'B' || c === 'R' || c === 'G') identity.add(c);
    }
  }
  const needed = [...identity];
  const coverage =
    needed.length === 0
      ? 1
      : needed.reduce(
          (sum, c) => sum + Math.min(1, (profile.sourcesByColour[c] ?? 0) / SOURCES_PER_COLOUR),
          0
        ) / needed.length;
  const coverageScore = MANA_POINTS.colourCoverage * coverage;

  // Fixing: sources that make more than one colour, straight off the profile.
  const multi = profile.sources.filter(s => popcount(s.colourMask) > 1);
  const fixingScore = Math.min(MANA_POINTS.fixing, (multi.length / landCount) * 100);

  let tapped = 0;
  for (const entry of lands) {
    const qty = qtyOf(entry);
    if (ENTERS_TAPPED.test(entry.card.oracle_text ?? '')) {
      tapped += qty;
      drags.push({
        name: entry.card.name,
        quantity: qty,
        points: qty,
        why: 'comes into play tapped, so it does nothing the turn you play it',
      });
    }
  }
  const tappedRatio = tapped / landCount;
  const tappedPenalty = Math.max(0, (tappedRatio - TOLERATED_TAPPED_RATIO) * 30);

  const value = Math.max(
    0,
    Math.min(100, ratioScore + coverageScore + fixingScore - tappedPenalty)
  );

  // Evidence: the sources that do the fixing, credited with the fixing half.
  const perMulti = multi.length > 0 ? fixingScore / multi.length : 0;
  const seen = new Map<string, number>();
  for (const source of multi) seen.set(source.name, (seen.get(source.name) ?? 0) + 1);
  for (const [name, count] of seen) {
    credits.push({
      name,
      quantity: count,
      points: perMulti * count,
      why: 'makes more than one colour',
    });
  }
  // And the land count itself, which is the larger half. It is not a card, so
  // it is stated in `measured` rather than smuggled into the card list.

  return buildSubscore({
    key: 'mana',
    weight: SUBSCORE_WEIGHTS.mana,
    value,
    measured:
      `${landCount} lands in ${deckSize} cards, ${Math.round(ratio * 100)}% of the deck. ` +
      (needed.length > 0
        ? `${needed.map(c => `${profile.sourcesByColour[c] ?? 0} ${c}`).join(', ')} sources ` +
          `against the ${SOURCES_PER_COLOUR} a colour wants. `
        : '') +
      `${multi.length} ${multi.length === 1 ? 'source makes' : 'sources make'} more than one colour, ` +
      `and ${tapped} ${tapped === 1 ? 'land enters' : 'lands enter'} tapped.`,
    credits,
    drags,
    note: 'No land here makes more than one colour.',
  });
}

function popcount(mask: number): number {
  let n = 0;
  let m = mask;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * 8. Consistency
 * ------------------------------------------------------------------ */

/** The jobs a deck has to cover. Lands are counted by the mana subscore. */
const CONSISTENCY_ROLES: readonly Role[] = ['ramp', 'draw', 'removal', 'interaction', 'wincon'];

/**
 * Does the deck do all the jobs it needs to do.
 *
 * This is deliberately the same measurement the recommender uses when it
 * decides what to suggest: `roleTargetsFor` declares how many of each job a
 * format wants, and the shortfall against that is both why this subscore is low
 * and why a particular card gets recommended. One measurement, two uses, so the
 * advice and the score can never disagree about what the deck is short of.
 */
export function consistencySubscore(input: SubscoreInput): Subscore {
  const targets = roleTargetsFor(input.format);
  const counts = Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>;

  const credits: Contribution[] = [];
  const perRoleCards = new Map<Role, EngineDeckEntry[]>();

  for (const entry of input.entries) {
    if (entry.isCommander) continue;
    const qty = qtyOf(entry);
    const tags = tagsOf(entry.card);
    for (const role of CONSISTENCY_ROLES) {
      if (!servesRole(tags, role)) continue;
      counts[role] += qty;
      const bucket = perRoleCards.get(role) ?? [];
      bucket.push(entry);
      perRoleCards.set(role, bucket);
    }
  }

  // Each role is worth an equal share, and a card is credited with its slice of
  // the role it fills, capped at the target so the eleventh ramp spell does not
  // make the deck look more consistent than the tenth did.
  const share = 100 / CONSISTENCY_ROLES.length;
  const parts: string[] = [];
  let value = 0;

  for (const role of CONSISTENCY_ROLES) {
    const target = targets[role] ?? 0;
    const have = counts[role];
    parts.push(
      role === 'wincon'
        ? `${have} ${have === 1 ? 'way' : 'ways'} to win out of the ${target} you want`
        : `${have} ${role} out of the ${target} you want`
    );
    if (target <= 0) {
      value += share;
      continue;
    }
    const covered = Math.min(1, have / target);
    value += share * covered;

    const cards = perRoleCards.get(role) ?? [];
    const counted = Math.min(have, target);
    const perCard = counted > 0 ? (share * covered) / counted : 0;
    let used = 0;
    for (const entry of cards) {
      if (used >= counted) break;
      const qty = Math.min(qtyOf(entry), counted - used);
      used += qty;
      credits.push({
        name: entry.card.name,
        quantity: qty,
        points: perCard * qty,
        why: `one of your ${role === 'wincon' ? 'ways to win' : role} cards`,
      });
    }
  }

  return buildSubscore({
    key: 'consistency',
    weight: SUBSCORE_WEIGHTS.consistency,
    value,
    measured: `You have ${parts.join(', ')}.`,
    credits,
    note: 'This list does not cover any of the jobs a deck needs covered.',
  });
}

/* ------------------------------------------------------------------ *
 * 9. Stax pressure
 * ------------------------------------------------------------------ */

export function staxSubscore(input: SubscoreInput): Subscore {
  const credits: Contribution[] = [];

  for (const entry of input.entries) {
    const card = entry.card;
    const qty = qtyOf(entry);
    const hit = STAX_INDEX.get(lower(card.name));

    if (hit) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: hit.weight * qty,
        why: `on the resource denial list, ${tierWords(hit.tier)}`,
      });
      continue;
    }
    if (tagsOf(card).includes('stax')) {
      credits.push({
        name: card.name,
        quantity: qty,
        points: 5 * qty,
        why: 'makes the game harder for everyone else',
      });
    }
  }

  return buildSubscore({
    key: 'stax_pressure',
    weight: SUBSCORE_WEIGHTS.stax_pressure,
    measured: `${credits.length} ${credits.length === 1 ? 'card slows' : 'cards slow'} the rest of the table down.`,
    credits,
    note: 'Nothing here slows anyone else down.',
  });
}

/* ------------------------------------------------------------------ *
 * 10. Synergy
 * ------------------------------------------------------------------ */

/** Same saturation the recommender uses, so one shared rare tag lands alike. */
const SYNERGY_SATURATION = 6;

/**
 * How much the deck is actually built around its commander.
 *
 * The number comes from the same information-weighted tag comparison the
 * recommender uses to rank additions, so a card that shares `storm` with the
 * commander counts for far more than one that shares `ramp`. The old version
 * used its own nine-line tag list and returned a flat 50 for any deck without a
 * commander, which is a made-up passing grade for an unanswerable question.
 * Now it reports that it does not apply.
 */
export function synergySubscore(input: SubscoreInput): Subscore {
  const weight = SUBSCORE_WEIGHTS.synergy;
  const commander = input.commander;

  if (!commander) {
    return buildSubscore({
      key: 'synergy',
      weight,
      measured: 'There is no commander here to build around.',
      credits: [],
      applicable: false,
      note: 'Pick a commander and this will fill in.',
    });
  }

  const commanderTags = signalTags(tagsOf(commander));
  if (commanderTags.length === 0) {
    return buildSubscore({
      key: 'synergy',
      weight,
      measured: `${commander.name} does not push the deck in any one direction we can read.`,
      credits: [],
      applicable: false,
      note: 'A commander with no theme has nothing for the rest of the deck to match.',
    });
  }

  const spells = input.entries.filter(e => !e.isCommander && !isLandCard(e.card));
  const total = spells.reduce((n, e) => n + qtyOf(e), 0);
  if (total === 0) {
    return buildSubscore({
      key: 'synergy',
      weight,
      measured: 'There are no spells here to match against the commander.',
      credits: [],
      applicable: false,
      note: null,
    });
  }

  const credits: Contribution[] = [];
  let sum = 0;

  for (const entry of spells) {
    const qty = qtyOf(entry);
    const tags = tagsOf(entry.card);
    const raw = sharedTagScore(commanderTags, tags);
    if (raw <= 0) continue;
    const fit = raw / (raw + SYNERGY_SATURATION);
    const share = (fit * 100 * qty) / total;
    sum += share;
    const overlap = tags.filter(t => commanderTags.includes(t));
    credits.push({
      name: entry.card.name,
      quantity: qty,
      points: share,
      why: `does the same thing as ${commander.name} (${overlap.slice(0, 3).join(', ')})`,
    });
  }

  return buildSubscore({
    key: 'synergy',
    weight,
    value: sum,
    measured:
      `${credits.length} of ${spells.length} spells pull in the same direction as ${commander.name} ` +
      `(${commanderTags.slice(0, 3).join(', ')}).`,
    credits,
    note: `Nothing in this list does what ${commander.name} wants.`,
  });
}

/* ------------------------------------------------------------------ *
 * Diagnostics that are not subscores
 * ------------------------------------------------------------------ */

export interface GameChangerReport {
  count: number;
  classes: {
    compact_combo: number;
    finisher_bombs: number;
    inevitability_engines: number;
    massive_swing: number;
  };
  list: Array<{ name: string; class: string; reason: string }>;
}

/**
 * The cards that end games, from the curated catalogue only.
 *
 * Kept as a diagnostic rather than a subscore because the catalogue is a list
 * of about forty specific cards. It is a good answer to "does this deck have a
 * finisher" and a bad basis for a continuous 0 to 100 measurement.
 */
export function gameChangers(input: SubscoreInput): GameChangerReport {
  const names = new Set(input.entries.map(e => lower(e.card.name)));
  const has = (name: string) => names.has(lower(name));

  const out: GameChangerReport = {
    count: 0,
    classes: { compact_combo: 0, finisher_bombs: 0, inevitability_engines: 0, massive_swing: 0 },
    list: [],
  };

  for (const combo of COMPACT_COMBOS) {
    if (!has(combo.name)) continue;
    const partner = combo.requires.find(r => has(r));
    if (combo.requires.length > 0 && !partner) continue;
    out.classes.compact_combo++;
    out.list.push({
      name: combo.name,
      class: 'compact_combo',
      reason: partner ? `with ${partner}` : 'enabler present',
    });
  }

  const instSorc = countWhere(input.entries, c => /\b(instant|sorcery)\b/i.test(c.type_line ?? ''));
  const creatures = countWhere(input.entries, c => /\bcreature\b/i.test(c.type_line ?? ''));
  const ramp = countWhere(input.entries, c => tagsOf(c).includes('ramp'));

  for (const name of FINISHER_BOMBS.cards) {
    if (!has(name)) continue;
    const cond = FINISHER_BOMBS.conditional[name];
    if (cond) {
      if (cond.min_inst_sorc && instSorc < cond.min_inst_sorc) continue;
      if (cond.min_creatures && creatures < cond.min_creatures) continue;
      if (cond.min_ramp && ramp < cond.min_ramp) continue;
    }
    out.classes.finisher_bombs++;
    out.list.push({ name, class: 'finisher_bomb', reason: 'the deck supports it' });
  }

  for (const name of INEVITABILITY_ENGINES) {
    if (!has(name)) continue;
    out.classes.inevitability_engines++;
    out.list.push({ name, class: 'inevitability_engine', reason: 'wins slowly if left alone' });
  }

  for (const name of MASSIVE_SWINGS) {
    if (!has(name)) continue;
    out.classes.massive_swing++;
    out.list.push({ name, class: 'massive_swing', reason: 'turns a game around on its own' });
  }

  // Capped per class the way the previous engine capped them, so one archetype
  // cannot run the count away.
  out.classes.compact_combo = Math.min(out.classes.compact_combo, 3);
  out.classes.finisher_bombs = Math.min(out.classes.finisher_bombs, 3);
  out.classes.inevitability_engines = Math.min(out.classes.inevitability_engines, 3);
  out.classes.massive_swing = Math.min(out.classes.massive_swing, 3);
  out.count =
    out.classes.compact_combo +
    out.classes.finisher_bombs +
    out.classes.inevitability_engines +
    out.classes.massive_swing;

  return out;
}

/** Two-card combos both halves of which are in the list. */
export function comboPairs(input: SubscoreInput): Array<{ name: string; totalMv: number }> {
  const names = new Set(input.entries.map(e => lower(e.card.name)));
  return TWO_CARD_COMBOS.filter(combo => combo.cards.every(c => names.has(lower(c)))).map(c => ({
    name: c.name,
    totalMv: c.total_mv,
  }));
}

function countWhere(entries: readonly EngineDeckEntry[], predicate: (c: EngineCard) => boolean): number {
  let n = 0;
  for (const entry of entries) if (predicate(entry.card)) n += qtyOf(entry);
  return n;
}
