/**
 * DeckMatrix — the bridge between an event's roster and the user's real decks.
 *
 * A tournament in this product is not a generic bracket: a seat at a table is a
 * player *and the deck they registered*, and a deck is represented by its
 * commander.
 *
 * The loader itself is `useDeckLibrary` in `@/hooks/useDeckLibrary`, and it is
 * re-exported here as `useMyDecks` because the proxy page and the settings
 * export want exactly the same rows. It used to live in this file, where only
 * an event could reach it, and the alternative to moving it was a second and a
 * third copy quietly disagreeing about what a deck is.
 *
 * What stays here is what only an event needs: `commanderCardFor`, which turns
 * a stored {@link PlayerDeck} (which keeps only the commander's *name*, so an
 * event survives the deck being deleted) plus a resolved art map into something
 * `CardImage` can draw.
 *
 * Nothing here invents a number: deck names, formats, colour identity and card
 * counts are all read from `user_decks` / `deck_cards`.
 */

import { cardArtKey, type CardArt } from '@/hooks/useCardArt';
import {
  useDeckLibrary,
  type DeckLibraryState,
  type DeckOption,
} from '@/hooks/useDeckLibrary';
import type { PlayerDeck } from './scoring';

export type { DeckOption };
export type MyDecksState = DeckLibraryState;

/** The decks available to register. One loader, shared with proxies and export. */
export const useMyDecks = useDeckLibrary;

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
