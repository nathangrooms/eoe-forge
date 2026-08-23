/**
 * Which cards to cut, decided by the same evaluation that produced the score.
 *
 * THE BUG THIS CLOSES
 * -------------------
 * `supabase/functions/deck-optimizer/swap-targets.ts` documented its own trap
 * in its header, and the documentation was correct:
 *
 *   > Change the comparison to `<=`, or let a numeric `NaN` through a different
 *   > parser, or coerce with `Number(x) || 0` anywhere upstream, and every
 *   > unmeasured card instantly becomes a 0%-playability card at the very top
 *   > of the cut list.
 *
 * It guarded against that carefully, but it could not fix the underlying
 * problem, which was that the optimiser had no way to measure castability
 * itself. The figure arrived in the request body from the client, sourced from
 * a scrape of edhpowerlevel.com, and when the scrape returned nothing the
 * optimiser asked a language model to choose cuts with no evidence at all.
 *
 * The engine now travels with the optimiser, so castability is computed from
 * the decklist in front of it. "Unmeasured" has stopped being a common case,
 * and the rule that unmeasured never means low is kept anyway, because a card
 * with no mana cost still has no castability figure and must not be read as 0%.
 *
 * WHY THE CUT REASON IS THE SCORE'S REASON
 * ----------------------------------------
 * Both halves of this file are the same functions the rest of the engine uses:
 *
 *   - castability comes from the roll-up that the `castability` subscore IS,
 *     so a card on the cut list for being uncastable is, by construction, one
 *     of the cards named in that subscore's `holdingBack` list;
 *   - fit comes from `scoreCandidate`, the same function that ranks cards the
 *     engine would ADD, so the reason to cut a card is the reverse of the
 *     reason another card would be suggested in its place.
 *
 * A player can therefore follow one thread from the number on the deck page to
 * the card at the top of the cut list. That was the point of the exercise.
 *
 * Pure. No network, no AI.
 */

import { isLandCard, manaValue, tagsOf, type EngineDeckEntry } from '../core/card.ts';
import type { CandidateCard, Color, DeckProfile, Role } from '../core/types.ts';
import { scoreCandidate, stableHash } from './rank.ts';
import { normalizeIdentity } from './query.ts';
import type { CardPlayability, DeckPlayability } from '../playability/castability.ts';

/** Below this a castability figure counts as a problem worth acting on. */
export const LOW_CASTABILITY_PCT = 40;

/** Why this card is on the list. Ordered: castability outranks thematic fit. */
export type CutGrounds = 'uncastable' | 'poor-fit';

export interface CutTarget {
  name: string;
  quantity: number;
  grounds: CutGrounds;
  /**
   * The exact figure, or null when the card has no mana cost to work from.
   * Null is never read as low, here or anywhere downstream.
   */
  castabilityPct: number | null;
  castabilityTurn: number | null;
  /** Score from the same ranker that ranks additions. Lower is worse. */
  fitScore: number;
  fillsRoles: Role[];
  sharedTags: string[];
  /** One sentence, built entirely from the numbers above it. */
  reason: string;
}

/** Turn an engine card into the shape the ranker reads. */
export function toCandidate(entry: EngineDeckEntry): CandidateCard {
  const card = entry.card;
  return {
    id: card.oracle_id ?? card.name,
    oracleId: card.oracle_id ?? card.name,
    name: card.name,
    typeLine: card.type_line ?? '',
    cmc: manaValue(card),
    colorIdentity: normalizeIdentity(card.color_identity ?? []) as Color[],
    tags: tagsOf(card),
    manaCost: card.mana_cost ?? null,
    usd: card.usd ?? null,
    legalities: (card.legalities ?? {}) as Record<string, string>,
    // Not known for a card already in the deck, and it would not change a cut
    // decision if it were: how often other people play a card says nothing
    // about whether THIS deck can cast it.
    edhrecRank: null,
  };
}

export interface ChooseCutsOptions {
  limit?: number;
  /** Percentage under which a card is cuttable for being uncastable. */
  threshold?: number;
}

/**
 * Rank this deck's own cards worst first.
 *
 * Lands are never offered. The land count is its own decision with its own
 * arithmetic, and cutting a land to add a spell is a different question from
 * cutting a weak spell. The commander is never offered either, because it
 * cannot be.
 *
 * Every card the caller may cut appears in the result, in order, so a caller
 * that wants five takes five and a caller that wants to explain the whole deck
 * has the whole deck. `limit` truncates on the last line and nowhere else,
 * which is the same discipline `rankCandidates` follows.
 */
export function chooseCuts(
  entries: readonly EngineDeckEntry[],
  playability: DeckPlayability,
  profile: DeckProfile,
  options: ChooseCutsOptions = {}
): CutTarget[] {
  const threshold = options.threshold ?? LOW_CASTABILITY_PCT;

  // `playability.cards` is positional over the same array the caller passed to
  // the power engine, so index alignment is the contract. Guard it rather than
  // assume it: a mismatch would attach one card's figure to another's name.
  const aligned =
    playability.cards.length === entries.length ? playability.cards : null;
  const byName = new Map<string, CardPlayability>();
  if (!aligned) {
    for (const card of playability.cards) byName.set(card.name.toLowerCase(), card);
  }

  const uncastable: CutTarget[] = [];
  const rest: CutTarget[] = [];

  entries.forEach((entry, i) => {
    if (entry.isCommander) return;
    if (isLandCard(entry.card)) return;

    const measured = aligned ? aligned[i] : byName.get(entry.card.name.toLowerCase());
    const pct = measured && typeof measured.pct === 'number' ? measured.pct : null;
    const turn = measured?.turn ?? null;

    const candidate = toCandidate(entry);
    const { score, fillsRoles, shared } = scoreCandidate(candidate, profile);
    const quantity = Math.max(1, Math.trunc(entry.quantity ?? 1));

    if (pct !== null && pct < threshold) {
      uncastable.push({
        name: entry.card.name,
        quantity,
        grounds: 'uncastable',
        castabilityPct: pct,
        castabilityTurn: turn,
        fitScore: score,
        fillsRoles,
        sharedTags: shared,
        reason:
          `You can only pay for this ${Math.round(pct)}% of the time by turn ${turn}, ` +
          `which is the same reason your castability score is where it is.`,
      });
      return;
    }

    rest.push({
      name: entry.card.name,
      quantity,
      grounds: 'poor-fit',
      castabilityPct: pct,
      castabilityTurn: turn,
      fitScore: score,
      fillsRoles,
      sharedTags: shared,
      reason: fitReason(shared, fillsRoles),
    });
  });

  /*
   * Worst castability first, then worst fit.
   *
   * Ties are broken by a hash of the name and not by the name, for the reason
   * `compareTied` in `rank.ts` gives at length: the fit score ties heavily, and
   * an alphabetical tie-break makes "which card should I cut" a question about
   * spelling. Hashing keeps the order independent of how the deck happened to
   * be stored, which is what the old comment here was buying, and drops the
   * bias it was paying for without noticing.
   */
  const spread = (a: { name: string }, b: { name: string }) =>
    stableHash(a.name) - stableHash(b.name) || a.name.localeCompare(b.name);
  uncastable.sort((a, b) => (a.castabilityPct ?? 0) - (b.castabilityPct ?? 0) || spread(a, b));
  rest.sort((a, b) => a.fitScore - b.fitScore || spread(a, b));

  const all = [...uncastable, ...rest];
  const limit = options.limit;
  return typeof limit === 'number' && limit >= 0 ? all.slice(0, limit) : all;
}

function fitReason(shared: readonly string[], fillsRoles: readonly Role[]): string {
  if (shared.length === 0 && fillsRoles.length === 0) {
    return 'This does not do what the rest of your deck does, and it does not cover a job you are short of.';
  }
  const bits: string[] = [];
  if (shared.length > 0) {
    bits.push(
      `shares ${shared.length} ${shared.length === 1 ? 'thing' : 'things'} with the deck ` +
        `(${shared.slice(0, 3).join(', ')})`
    );
  } else {
    bits.push('shares nothing with the rest of the deck');
  }
  if (fillsRoles.length > 0) {
    bits.push(`covers ${fillsRoles.join(' and ')}`);
  } else {
    bits.push('covers no job you are short of');
  }
  return `This ${bits.join(' but ')}.`;
}
