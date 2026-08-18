/**
 * DeckMatrix — the bridge between an event's roster and the user's real decks.
 *
 * A tournament in this product is not a generic bracket: a seat at a table is a
 * player *and the deck they registered*, and a deck is represented by its
 * commander. Two things live here.
 *
 *  1. `useMyDecks` — the decks available to register, each already carrying the
 *     `cards` row its commander needs to draw a full card image. One query for
 *     the decks, one for their cards, one for the commander printings; never one
 *     request per deck.
 *  2. `commanderCardFor` — turns a stored {@link PlayerDeck} (which keeps only
 *     the commander's *name*, so an event survives the deck being deleted) plus
 *     a resolved art map into something `CardImage` can draw.
 *
 * Nothing here invents a number: deck names, formats, colour identity and card
 * counts are all read from `user_decks` / `deck_cards`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { cardArtKey, type CardArt } from '@/hooks/useCardArt';
import type { PlayerDeck } from './scoring';

export interface DeckOption {
  id: string;
  name: string;
  format: string;
  colors: string[];
  commanderName: string | null;
  /** A `cards` row, ready for `CardImage`. Null when the deck has no commander. */
  commanderCard: CardRow | null;
  /** Mainboard cards, counted from `deck_cards`. */
  cardCount: number;
  updatedAt: string;
}

interface CardRow {
  id: string;
  name: string;
  image_uris: unknown;
  faces: unknown;
  color_identity: string[] | null;
  type_line: string | null;
  mana_cost: string | null;
}

/** What `PlayerDeck` keeps from a `DeckOption` when a player registers it. */
export function registrationFor(deck: DeckOption): PlayerDeck {
  return {
    deckId: deck.id,
    deckName: deck.name,
    format: deck.format,
    commanderName: deck.commanderName,
    colors: deck.colors,
  };
}

/**
 * A `CardImage`-shaped object for a registered deck's commander.
 *
 * `art` comes from `useCardArt`, which the caller batches across the whole
 * event — one request for every commander on the roster rather than one per
 * pairing card. Returns null when the commander has no artwork on file, which
 * is the signal to draw the designed fallback panel instead.
 */
export function commanderCardFor(
  deck: PlayerDeck | undefined,
  art: Map<string, CardArt>
): { name: string; image_uris: Record<string, string> } | null {
  if (!deck?.commanderName) return null;
  const hit = art.get(cardArtKey(deck.commanderName));
  if (!hit) return null;

  const uris: Record<string, string> = {};
  if (hit.large) uris.large = hit.large;
  if (hit.normal) uris.normal = hit.normal;
  if (hit.art_crop) uris.art_crop = hit.art_crop;
  if (Object.keys(uris).length === 0) return null;

  return { name: hit.name, image_uris: uris };
}

/**
 * Formats where a registered deck can be checked against the event's format.
 *
 * Limited deliberately: a Draft, Sealed, Cube or Casual event has no
 * constructed list to compare against, so flagging a mismatch there would be
 * noise rather than a warning.
 */
const CHECKABLE_FORMATS: Record<string, string> = {
  Standard: 'standard',
  Pioneer: 'pioneer',
  Modern: 'modern',
  Legacy: 'legacy',
  Vintage: 'vintage',
  Pauper: 'pauper',
  Commander: 'commander',
};

/** True when a registered deck is built for a different format than the event. */
export function formatMismatch(gameFormat: string, deck: PlayerDeck | undefined): boolean {
  if (!deck) return false;
  const expected = CHECKABLE_FORMATS[gameFormat];
  if (!expected) return false;
  return (deck.format ?? '').toLowerCase() !== expected;
}

/** Every commander name on an event's roster, for a single batched art lookup. */
export function commanderNames(decks: Record<string, PlayerDeck>): string[] {
  return Array.from(
    new Set(
      Object.values(decks)
        .map(d => d.commanderName)
        .filter((n): n is string => !!n)
    )
  );
}

export interface MyDecksState {
  decks: DeckOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * The signed-in user's decks, newest first.
 *
 * Three round trips regardless of deck count. `deck_cards` is read once with an
 * `in` filter and folded in memory; the commander printings are then fetched in
 * a single `in` on `cards.id`.
 */
export function useMyDecks(): MyDecksState {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setDecks([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: deckRows, error: deckError } = await supabase
          .from('user_decks')
          .select('id, name, format, colors, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (deckError) throw deckError;
        const rows = deckRows ?? [];
        if (rows.length === 0) {
          if (!cancelled) setDecks([]);
          return;
        }

        const { data: cardRows } = await supabase
          .from('deck_cards')
          .select('deck_id, card_id, card_name, quantity, is_commander, is_sideboard')
          .in('deck_id', rows.map(r => r.id));

        const counts: Record<string, number> = {};
        const commanders: Record<string, { id: string | null; name: string }> = {};
        for (const card of cardRows ?? []) {
          if (!card.is_sideboard) {
            counts[card.deck_id] = (counts[card.deck_id] ?? 0) + (Number(card.quantity) || 1);
          }
          if (card.is_commander && !commanders[card.deck_id]) {
            commanders[card.deck_id] = { id: card.card_id ?? null, name: card.card_name };
          }
        }

        const commanderIds = Array.from(
          new Set(
            Object.values(commanders)
              .map(c => c.id)
              .filter((id): id is string => !!id)
          )
        );

        const printings = new Map<string, CardRow>();
        if (commanderIds.length > 0) {
          const { data: printingRows } = await supabase
            .from('cards')
            .select('id, name, image_uris, faces, color_identity, type_line, mana_cost')
            .in('id', commanderIds);
          for (const row of (printingRows ?? []) as unknown as CardRow[]) {
            printings.set(row.id, row);
          }
        }

        const options: DeckOption[] = rows.map(row => {
          const commander = commanders[row.id];
          return {
            id: row.id,
            name: row.name,
            format: row.format ?? 'commander',
            colors: Array.isArray(row.colors) ? row.colors : [],
            commanderName: commander?.name ?? null,
            commanderCard: commander?.id ? printings.get(commander.id) ?? null : null,
            cardCount: counts[row.id] ?? 0,
            updatedAt: row.updated_at,
          };
        });

        if (!cancelled) setDecks(options);
      } catch (err) {
        console.error('Failed to load decks for tournament registration:', err);
        if (!cancelled) setError('Could not load your decks.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  return useMemo(() => ({ decks, loading, error, reload }), [decks, loading, error, reload]);
}
