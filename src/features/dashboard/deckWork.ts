/**
 * What is half-finished, said in one sentence per deck.
 *
 * This is the question the dashboard was worst at. It could tell you how many
 * decks you had and nothing about whether any of them could be played, which is
 * the only thing you actually want to know when you open the app. Measured
 * against the one account in this database with real decks, nine Commander
 * decks break down as: two with no cards in them at all, one with no commander,
 * five short of a hundred cards, and two finished. A count of "9" says none of
 * that.
 *
 * Every fact here is read off rows the dashboard already loads. Nothing is
 * estimated and nothing is invented: a deck with no recorded card rows is
 * reported as empty because it has no card rows, not because we guessed.
 *
 * Pure module. No React, no Supabase, so the rules are testable on their own.
 */

/**
 * How many cards a legal list needs, by format.
 *
 * Only formats the app actually offers are listed. An unknown format returns
 * `null` and the deck is never called short, because inventing a target for a
 * format we do not know would be inventing a fact.
 */
const DECK_SIZE: Record<string, number> = {
  commander: 100,
  edh: 100,
  duel: 100,
  oathbreaker: 60,
  brawl: 60,
  standard: 60,
  pioneer: 60,
  modern: 60,
  legacy: 60,
  vintage: 60,
  pauper: 60,
  historic: 60,
  explorer: 60,
  timeless: 60,
  alchemy: 60,
  limited: 40,
  draft: 40,
  sealed: 40,
};

/** Formats where a deck without a commander is unfinished rather than fine. */
const NEEDS_COMMANDER = new Set(['commander', 'edh', 'duel', 'brawl', 'oathbreaker']);

export function requiredDeckSize(format: string | null | undefined): number | null {
  const key = (format ?? '').trim().toLowerCase();
  return DECK_SIZE[key] ?? null;
}

export function formatNeedsCommander(format: string | null | undefined): boolean {
  return NEEDS_COMMANDER.has((format ?? '').trim().toLowerCase());
}

export type DeckIssue = 'empty' | 'no-commander' | 'short' | 'unscored';

export interface DeckWork {
  /** The single most important thing wrong, or null when the deck is finished. */
  issue: DeckIssue | null;
  /** One short sentence for the interface. No jargon, no dashes. */
  label: string;
  /** Cards still needed, when that is the issue. */
  shortBy: number;
  /**
   * Sort key, lowest first.
   *
   * Nearly-finished decks lead, because a deck one card short is the one you can
   * finish tonight. Empty decks come last: an empty deck is not half-finished,
   * it is unstarted, and it is also the only kind with no artwork to show, so
   * putting it first fills the front of a visual section with blank rectangles.
   */
  rank: number;
}

export interface DeckWorkInput {
  format: string | null | undefined;
  cardCount: number;
  hasCommander: boolean;
  /** True when a current power score exists for the list as it stands. */
  scored: boolean;
}

const FINISHED: DeckWork = { issue: null, label: 'Ready to play', shortBy: 0, rank: 1000 };

export function deckWork(deck: DeckWorkInput): DeckWork {
  const target = requiredDeckSize(deck.format);
  const needsCommander = formatNeedsCommander(deck.format);

  if (deck.cardCount <= 0) {
    return { issue: 'empty', label: 'No cards in it yet', shortBy: target ?? 0, rank: 3 };
  }

  if (needsCommander && !deck.hasCommander) {
    return { issue: 'no-commander', label: 'No commander picked', shortBy: 0, rank: 1 };
  }

  if (target !== null && deck.cardCount < target) {
    const shortBy = target - deck.cardCount;
    return {
      issue: 'short',
      label: `${shortBy} ${shortBy === 1 ? 'card' : 'cards'} short of ${target}`,
      shortBy,
      // Nearly finished sorts above barely started, capped below 1 so a deck
      // ninety cards short never falls behind a missing commander.
      rank: Math.min(shortBy, 900) / 1000,
    };
  }

  if (!deck.scored) {
    return { issue: 'unscored', label: 'Not scored yet', shortBy: 0, rank: 2 };
  }

  return FINISHED;
}

/**
 * Decks with something wrong, most worth doing first.
 *
 * Takes decks that already carry their `work`, because the deck hook computes it
 * once when it loads the rows and the widget should not decide a second time.
 * Two places deciding what is wrong with a deck is exactly how this product
 * ended up with five different power scores for one list.
 */
export function decksNeedingWork<T extends { work: DeckWork }>(decks: readonly T[]): T[] {
  return decks
    .filter(deck => deck.work.issue !== null)
    .sort((a, b) => a.work.rank - b.work.rank);
}
