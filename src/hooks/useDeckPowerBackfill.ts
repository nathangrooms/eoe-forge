import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeckSummary } from '@/lib/api/deckAPI';
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
 * Deliberately sequential and capped. Each deck costs one query plus a
 * 10,000-iteration seeded simulation, so it yields to the event loop between
 * decks and never runs more than {@link MAX_PER_PASS} in one go — a background
 * correctness pass must not make the page it is correcting feel slow.
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

    let stopped = false;

    (async () => {
      for (const deck of pending) {
        if (stopped || cancelled.current) return;
        // Yield between decks so the grid stays interactive while scoring.
        await new Promise(resolve => setTimeout(resolve, 0));
        await rescore(deck.id, deck.format);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [decks, rescore]);

  return { scoring, rescore };
}
