import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckSummary } from '@/lib/api/deckAPI';
import { scoreDecksInBatch } from '@/lib/api/deckPowerBatch';
import { scoreDeckById, type DeckPower } from '@/lib/deck/power';
import { usesPowerLevel } from '@/lib/deck/formats';

/**
 * Keeps a list of deck summaries scored.
 *
 * The deck list only holds summaries, and a summary carries whatever score was
 * last persisted. Before unification the list happily rendered that number as
 * current even when the deck had been rebuilt since — which is how the same
 * deck ended up showing 5 on one screen and 6.6 on another.
 *
 * Now a summary whose stored score is missing or stale comes back with
 * `power === null` / `power.stale`, and this hook quietly scores those decks in
 * the background from their real decklists, persisting each result so every
 * other surface converges on the same number.
 *
 * Capped at {@link MAX_PER_PASS} decks a pass, because the scoring itself is a
 * 10,000-iteration seeded simulation per deck: a background correctness pass
 * must not make the page it is correcting feel slow. The effect runs again
 * after each pass, so a large library still finishes on one visit.
 *
 * ## One read for the pass, one write for the pass
 *
 * This called `scoreDeckById` per deck, which is three requests each — read
 * that deck's cards, read `edh_analysis` back, write it. Measured on `/decks`
 * with 25 decks: 37 `deck_cards` reads and 36 `user_decks` writes, on top of
 * the summary calls.
 *
 * Thirty six writes for twenty five decks, because a deck could be picked up
 * again by the next pass while the previous pass was still working through it.
 * The whole batch is marked attempted before any of it starts now, so every
 * deck is scored exactly once.
 */

const MAX_PER_PASS = 12;

export interface DeckPowerBackfill {
  /** Deck ids currently being scored, for spinner state on the tile. */
  scoring: Set<string>;
  /** Force a rescore of one deck — wired to the tile's "Rescore" button. */
  rescore: (deckId: string, format: string) => Promise<void>;
}

export function useDeckPowerBackfill(
  decks: DeckSummary[],
  onScored: (deckId: string, power: DeckPower) => void
): DeckPowerBackfill {
  const [scoring, setScoring] = useState<Set<string>>(new Set());
  const onScoredRef = useRef(onScored);
  onScoredRef.current = onScored;

  /** Decks already attempted this session, so a failure is not retried forever. */
  const attempted = useRef<Set<string>>(new Set());
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const markScoring = useCallback((deckId: string, active: boolean) => {
    setScoring(prev => {
      const next = new Set(prev);
      if (active) next.add(deckId);
      else next.delete(deckId);
      return next;
    });
  }, []);

  /** The same spinner state, for a whole pass at once. */
  const markScoringMany = useCallback((deckIds: string[], active: boolean) => {
    setScoring(prev => {
      const next = new Set(prev);
      for (const id of deckIds) {
        if (active) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const rescore = useCallback(
    async (deckId: string, format: string) => {
      attempted.current.add(deckId);
      markScoring(deckId, true);
      try {
        const power = await scoreDeckById(deckId, format);
        if (power && !cancelled.current) onScoredRef.current(deckId, power);
      } finally {
        if (!cancelled.current) markScoring(deckId, false);
      }
    },
    [markScoring]
  );

  useEffect(() => {
    const pending = decks
      .filter(deck => usesPowerLevel(deck.format))
      .filter(deck => !deck.power || deck.power.stale)
      .filter(deck => !attempted.current.has(deck.id))
      .slice(0, MAX_PER_PASS);

    if (pending.length === 0) return;

    /* Claim the whole pass before any of it starts. `attempted` used to be
       written one deck at a time as the loop reached it, so the next pass —
       triggered by this pass updating the list it is watching — saw decks it
       had already started as still pending and scored them a second time. */
    const ids = pending.map(deck => deck.id);
    for (const id of ids) attempted.current.add(id);

    let stopped = false;
    markScoringMany(ids, true);

    (async () => {
      try {
        // Yield first, so the grid draws before the simulations start.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (stopped || cancelled.current) return;

        const scores = await scoreDecksInBatch(
          pending.map(deck => ({ id: deck.id, format: deck.format }))
        );

        if (stopped || cancelled.current) return;
        for (const [deckId, power] of scores) onScoredRef.current(deckId, power);
      } finally {
        if (!cancelled.current) markScoringMany(ids, false);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [decks, markScoringMany]);

  return { scoring, rescore };
}
