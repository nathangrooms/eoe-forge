/**
 * DeckMatrix — the render model for a player in an event.
 *
 * Built once at the top of the tournament tree and passed down. The alternative
 * — every pairing card, standings row and bracket seat resolving its own
 * commander artwork — costs one Supabase round trip per player on first paint,
 * and a sixteen-player event would open with sixteen requests in flight.
 */

import type { CardArt } from '@/hooks/useCardArt';
import type { PlayerDeck, Standing, Tournament } from './scoring';
import { commanderCardFor } from './useEventDecks';

export interface PlayerView {
  name: string;
  deck?: PlayerDeck;
  /** `CardImage`-shaped commander, or null when there is no art to draw. */
  card: { name: string; image_uris: Record<string, string> } | null;
  standing?: Standing;
  /** 1-based position in the current standings; undefined before any round. */
  rank?: number;
  dropped: boolean;
}

export function buildPlayerViews(
  tournament: Tournament,
  standings: Standing[],
  art: Map<string, CardArt>
): Map<string, PlayerView> {
  const rankOf = new Map(standings.map((s, i) => [s.player, i + 1]));
  const standingOf = new Map(standings.map(s => [s.player, s]));

  return new Map(
    tournament.players.map(name => {
      const deck = tournament.decks[name];
      return [
        name,
        {
          name,
          deck,
          card: commanderCardFor(deck, art),
          standing: standingOf.get(name),
          rank: rankOf.get(name),
          dropped: tournament.dropped.includes(name),
        },
      ];
    })
  );
}

/** A stand-in for a seat that is not a real player — BYE, or a bracket TBD. */
export function placeholderView(name: string): PlayerView {
  return { name, card: null, dropped: false };
}

export function viewFor(views: Map<string, PlayerView>, name: string): PlayerView {
  return views.get(name) ?? placeholderView(name);
}
