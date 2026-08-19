import { useMemo, useState } from 'react';
import { Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError } from '@/components/ui/toast-helpers';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { cn } from '@/lib/utils';
import { describeDeckPower, formatPowerScore, powerTextClass } from '@/lib/deck/power';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';

/**
 * The decks you touched last, three at a time, paging through the rest.
 *
 * The owner's layout: "recent decks should be first 3 with scroll bar like on
 * card page". The card page's rail is `CardRail`, which hides the bar entirely
 * and pages with arrows that only appear when there is somewhere to go, so that
 * is what is underneath this rather than a second implementation. The old
 * six-tile grid is gone; three tiles across a third of the row each draw a
 * commander at roughly twice the width the grid gave them.
 *
 * A tile opens the deck at `/deck/:id`, the same destination the deck list uses.
 * It used to open `/deck-builder?deck=`, so the dashboard and the deck list sent
 * you to two different screens for the same click.
 */

const PER_VIEW = 3;

interface RecentDecksProps {
  className?: string;
  decks: DeckSummary[];
  /** Every deck the user has, which is usually more than the rail holds. */
  deckCount: number;
  loading: boolean;
  error?: string | null;
  onToggleFavorite: (deckId: string) => Promise<boolean>;
}

export function RecentDecks({
  className,
  decks,
  deckCount,
  loading,
  error,
  onToggleFavorite,
}: RecentDecksProps) {
  const [starredOnly, setStarredOnly] = useState(false);

  /* A deck reads as itself through its commander's art, not a coloured dot. The
     printing id is preferred so the deck shows the art the player picked. */
  const lookup = useCardLookup(
    decks.map(deck => deck.faceCardId),
    decks.map(deck => deck.commanderName)
  );

  const visible = useMemo(
    () => (starredOnly ? decks.filter(deck => deck.isFavorite) : decks),
    [decks, starredOnly]
  );

  const handleStar = async (event: React.MouseEvent, deck: DeckSummary) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      await onToggleFavorite(deck.id);
    } catch {
      showError('Could not update favourite', `${deck.name} was not changed.`);
    }
  };

  const hasStars = decks.some(deck => deck.isFavorite);

  return (
    <RailSection
      title="Recent decks"
      count={deckCount > 0 ? `${deckCount} ${deckCount === 1 ? 'deck' : 'decks'}` : undefined}
      to="/decks"
      linkLabel="All decks"
      perView={PER_VIEW}
      className={className}
      loading={loading}
      error={error}
      isEmpty={visible.length === 0}
      action={
        hasStars ? (
          <Button
            variant={starredOnly ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setStarredOnly(value => !value)}
            aria-pressed={starredOnly}
          >
            <Star className={cn('h-4 w-4', starredOnly && 'fill-current')} />
            Starred
          </Button>
        ) : undefined
      }
      empty={
        decks.length === 0 ? (
          <RailEmpty
            icon={Layers}
            headline="No decks yet"
            body="Start one and it shows up here, with its commander on the front."
            actionLabel="Build your first deck"
            actionTo="/decks/new"
          />
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">None of your recent decks are starred.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStarredOnly(false)}>
              Show all recent decks
            </Button>
          </div>
        )
      }
    >
      {visible.map((deck, index) => {
        const commander = lookup.resolve(deck.faceCardId, deck.commanderName);
        /* `user_decks.colors` is empty on plenty of real rows, which used to
           render a Commander deck as colourless. The commander's own identity is
           the authority when the deck has not recorded one. */
        const colors = deck.colors.length > 0 ? deck.colors : (commander?.color_identity ?? []);

        return (
          <div key={deck.id} className={railTileWidth(PER_VIEW)}>
            <RailTile
              to={`/deck/${deck.id}`}
              card={commander}
              colors={colors}
              fallbackNote={deck.cardCount === 0 ? 'No cards in this deck yet' : 'No card art yet'}
              eager={index < PER_VIEW}
              title={deck.name}
              action={
                <button
                  type="button"
                  onClick={event => handleStar(event, deck)}
                  aria-pressed={deck.isFavorite}
                  aria-label={deck.isFavorite ? `Unstar ${deck.name}` : `Star ${deck.name}`}
                  className={cn(
                    'relative z-10 -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                    'transition-colors hover:bg-background motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                >
                  <Star
                    className={cn(
                      'h-3.5 w-3.5',
                      deck.isFavorite ? 'fill-current text-foreground' : 'text-muted-foreground'
                    )}
                  />
                </button>
              }
              subtitle={
                deck.commanderName ? (
                  <span className="block truncate">{deck.commanderName}</span>
                ) : undefined
              }
              meta={
                <span className="flex items-center gap-2">
                  <ColorIdentity colors={colors} size="xs" />
                  {/* The canonical score, on the same scale and in the same band
                      colour the deck list uses. A stale score is greyed and
                      marked rather than shown as if it were current. */}
                  {deck.power && (
                    <span
                      className={cn(
                        'shrink-0 font-semibold tabular-nums',
                        deck.power.stale ? 'text-muted-foreground' : powerTextClass(deck.power.band)
                      )}
                      title={
                        deck.power.stale
                          ? 'Outdated. This deck changed after it was scored.'
                          : describeDeckPower(deck.power)
                      }
                    >
                      {formatPowerScore(deck.power.score)}
                      {deck.power.stale && <span className="ml-0.5 opacity-70">&middot;</span>}
                    </span>
                  )}
                  <span className="truncate">
                    {deck.cardCount > 0 && `${deck.cardCount} cards, `}
                    {formatTimeAgo(deck.updatedAt)}
                  </span>
                </span>
              }
            />
          </div>
        );
      })}
    </RailSection>
  );
}
