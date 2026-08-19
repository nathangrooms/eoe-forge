/**
 * One deck in, one verdict out.
 *
 * This is the seam the whole engine exists to create. Before it, the deck page
 * scored a deck one way, the optimiser chose cuts from a figure the client had
 * scraped off another website, and the two could disagree without either of
 * them being able to tell. A player who asked "why is my score low" and "why
 * are you telling me to cut this card" got two answers from two systems that
 * had never spoken.
 *
 * Now both questions are answered by one call, from one set of numbers:
 *
 *   - the score comes from `power/score.ts`;
 *   - the castability subscore inside it IS the exact roll-up in
 *     `playability/castability.ts`;
 *   - the cut list comes from that same roll-up plus `advise/rank.ts`, which
 *     is the same function that ranks the cards it would suggest ADDING.
 *
 * So the reason a card is at the top of the cut list is the reason the score is
 * what it is, and `src/engine/one-brain.test.ts` pins that equality rather than
 * leaving it to good intentions.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * It does not fetch anything. Candidates for ADDING to a deck need the card
 * catalogue, which means a query, so `recommend()` still takes an injected
 * `CandidateSource`. Everything here is computed from the decklist it is given,
 * which is why the same function runs unchanged in the browser and inside a
 * Deno edge function.
 */

import type { EngineCard, EngineDeckEntry } from './core/card.ts';
import { tagsOf, isLandCard, manaValue } from './core/card.ts';
import type { DeckCard, DeckProfile, Role } from './core/types.ts';
import { deriveDeckProfile } from './advise/profile.ts';
import { chooseCuts, type ChooseCutsOptions, type CutTarget } from './advise/cuts.ts';
import { computePower, type ComputePowerOptions, type PowerResult } from './power/score.ts';
import type { DeckPlayability } from './playability/castability.ts';

export interface EvaluateDeckOptions extends ComputePowerOptions, ChooseCutsOptions {
  /** Override the declared role targets, the way the recommender allows. */
  roleTargets?: Partial<Record<Role, number>>;
}

export interface DeckEvaluation {
  /** The score, its ten subscores, and the evidence under each of them. */
  power: PowerResult;
  /** The exact castability roll-up. The same object the score was built on. */
  playability: DeckPlayability;
  /** What the deck is made of and what it is short of. */
  profile: DeckProfile;
  /**
   * This deck's own cards, worst first. Not truncated unless asked, so a caller
   * that wants to explain the whole deck can.
   */
  cuts: CutTarget[];
}

/**
 * Evaluate a deck.
 *
 * The commander is identified by `isCommander` on an entry, which is also what
 * keeps it out of the library when castability is computed. A commander sits in
 * the command zone; counting it as a card you might draw would quietly inflate
 * every figure on the page.
 */
export function evaluateDeck(
  entries: readonly EngineDeckEntry[],
  options: EvaluateDeckOptions = {}
): DeckEvaluation {
  const format = (options.format || 'commander').toLowerCase();
  const commander = options.commander ?? entries.find(e => e.isCommander)?.card ?? null;

  // One computation. The cut list reads the playability object the score was
  // built from, rather than recomputing it and risking a second answer.
  const power = computePower(entries, { ...options, format, commander });

  const profile = deriveDeckProfile({
    format,
    colorIdentity: (commander?.color_identity ?? []) as string[],
    cards: entries.filter(e => !e.isCommander).map(toDeckCard),
    roleTargets: options.roleTargets,
    // The mana base the score was computed against, handed to the ranker so a
    // card this deck cannot support is neither suggested nor scored as if it
    // were castable. Same object, same numbers, one measurement.
    manaProfile: power.playability.profile,
  });

  const cuts = chooseCuts(entries, power.playability, profile, {
    limit: options.limit,
    threshold: options.threshold,
  });

  return { power, playability: power.playability, profile, cuts };
}

function toDeckCard(entry: EngineDeckEntry): DeckCard {
  return {
    oracleId: entry.card.oracle_id ?? entry.card.name,
    name: entry.card.name,
    typeLine: entry.card.type_line ?? '',
    cmc: manaValue(entry.card),
    tags: tagsOf(entry.card),
    quantity: Math.max(1, Math.trunc(entry.quantity ?? 1)),
  };
}

/** Re-exported so a caller does not have to know which file a helper lives in. */
export { isLandCard, manaValue, tagsOf };
export type { EngineCard, EngineDeckEntry, CutTarget, PowerResult, DeckPlayability };
