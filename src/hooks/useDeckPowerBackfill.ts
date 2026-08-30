import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * The three fields this hook reads, and nothing else.
 *
 * It asked for a whole `deckAPI.DeckSummary`, which the dashboard cannot
 * supply: `features/dashboard/hooks.ts` carries its own slimmer `DeckSummary`
 * with none of `counts`, `curve` or `mana` on it. Demanding fields it never
 * touches is what kept the dashboard off this hook, and keeping the dashboard
 * off this hook is why the same deck read 5.3 on one screen and "Not scored
 * yet" on another.
 *
 * Structural, so both shapes satisfy it without either being changed. That the
 * two `DeckSummary` types exist at all is a separate piece of duplication and
 * not one to resolve from here.
 */
export interface ScorableDeck {
  id: string;
  format: string;
  power: DeckPower | null;
}

export interface DeckPowerBackfill {
  /** Deck ids currently being scored, for spinner state on the tile. */
  scoring: Set<string>;
  /** Force a rescore of one deck — wired to the tile's "Rescore" button. */
  rescore: (deckId: string, format: string) => Promise<void>;
}

export function useDeckPowerBackfill(
  decks: readonly ScorableDeck[],
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

    (async () => {
      try {
        // Yield first, so the grid draws before the simulations start.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (stopped || cancelled.current) {
          /* Nothing was scored, so nothing was attempted. A claim left standing
             here strands these decks unscored for the rest of the session,
             because the pass that would have retried them skips anything
             `attempted` already holds. */
          for (const id of ids) attempted.current.delete(id);
          return;
        }

        /* One deck spinning at a time, the way it looked before the reads were
           batched. Marking the whole pass at once was measured on `/decks` with
           25 decks as twelve tiles saying "Scoring…" together where the old
           loop showed at most two. The QUERIES are batched; the picture is not
           allowed to change. */
        await scoreDecksInBatch(
          pending.map(deck => ({ id: deck.id, format: deck.format })),
          {
            onScoring: deckId => {
              if (!cancelled.current) markScoring(deckId, true);
            },
            /* Gated on UNMOUNT only, exactly like `rescore`. Not on `stopped`:
               delivering a score changes `decks`, which re-runs this effect,
               which runs the cleanup and sets `stopped` — so a pass that
               checked it would hand back its first deck and silently drop the
               other eleven. Measured on `/decks` with 25 decks: the header read
               "3 scored" instead of "25 scored", and the tiles that lost their
               score were already marked attempted, so nothing retried them. */
            onScored: (deckId, power) => {
              if (cancelled.current) return;
              markScoring(deckId, false);
              onScoredRef.current(deckId, power);
            },
          }
        );
      } finally {
        /* A deck whose score never landed must not spin for ever. */
        if (!cancelled.current) markScoringMany(ids, false);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [decks, markScoring, markScoringMany]);

  return { scoring, rescore };
}
