import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDashed, Layers, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError } from '@/components/ui/toast-helpers';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { decksNeedingWork } from '@/features/dashboard/deckWork';
import { cn } from '@/lib/utils';
import { describeDeckPower, formatPowerScore, powerTextClass } from '@/lib/deck/power';
import { RailSection, RailEmpty, railTileWidth } from './RailSection';
import { RailTile } from './RailTile';
import { recentDecksCount } from './railCount';

/**
 * The decks you touched last, five at a time, paging through the rest.
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
 *
 * WHY THIS ABSORBED "DECKS TO FINISH"
 * -----------------------------------
 * That was a second rail beside this one, fed from the SAME array and filtered
 * to the decks with something wrong. `decksNeedingWork` is a subset of what this
 * rail already holds, so the two could never show different decks — they could
 * only show the same decks twice, and measured on the dashboard they did: two
 * decks on the left, the same two on the right, smaller.
 *
 * That is not an edge case. `user_decks` holds 15 rows across 13 accounts, so
 * almost every real player has fewer decks than one rail shows, and for all of
 * them the second rail was a duplicate. It also cost the row two of its five
 * columns, which is why three tiles sat beside four hundred pixels of nothing.
 *
 * The information was worth keeping and the rail was not. What is unfinished is
 * a fact ABOUT a deck, so it belongs on the deck's own tile, and "show me only
 * those" is a filter, next to Starred, which is the same question in the same
 * shape. One rail, the full width of the page, five commanders across it.
 */

/* Five, not three. The rail spans the whole row now rather than three fifths
   of it, and three tiles across 1,600px drew each commander at a size the
   layout never asked for. */
const PER_VIEW = 5;

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
  const [unfinishedOnly, setUnfinishedOnly] = useState(false);

  /* A deck reads as itself through its commander's art, not a coloured dot. The
     printing id is preferred so the deck shows the art the player picked. */
  const lookup = useCardLookup(
    decks.map(deck => deck.faceCardId),
    decks.map(deck => deck.commanderName)
  );

  /* Filters compose, and "needs something" REORDERS as well as filtering:
     `decksNeedingWork` puts the deck you can finish tonight ahead of the one
     you have not started. That ordering was the whole value of the rail this
     absorbed, so it comes with it rather than being left behind. */
  const visible = useMemo(() => {
    const starred = starredOnly ? decks.filter(deck => deck.isFavorite) : decks;
    return unfinishedOnly ? decksNeedingWork(starred) : starred;
  }, [decks, starredOnly, unfinishedOnly]);

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
  const unfinishedCount = decks.filter(deck => deck.work.issue !== null).length;

  /*
   * THE RAIL FILLS THE ROW IT IS GIVEN.
   *
   * Five slots is right for an account with five decks and wrong for the ones
   * this database actually holds: 15 decks across 13 accounts, so a real player
   * has one or two and the rail drew them against six hundred pixels of empty
   * charcoal. A fixed slot count is a promise about how many decks you have.
   *
   * So the slots follow the contents, and a short rail ends with a tile that
   * starts a deck — the row is full either way, and what fills it is the thing
   * you would do next. Never below three: two tiles across this row would draw
   * a card 660px wide and 920px tall, which is not "bigger is better", it is a
   * card that no longer fits above the fold.
   */
  const showNewDeckTile = visible.length > 0 && visible.length < PER_VIEW;
  const perView = Math.max(
    3,
    Math.min(PER_VIEW, visible.length + (showNewDeckTile ? 1 : 0))
  );

  return (
    <RailSection
      title="Recent decks"
      /* Counts what is on the rail. `deckCount` is an exact count of every deck
         the account owns and `visible` is a 24-deck window with the Starred
         toggle applied on top, so the old heading kept saying "9 decks" while
         the rail showed the two that are starred. */
      count={recentDecksCount(deckCount, visible.length, starredOnly)}
      to="/decks"
      linkLabel="All decks"
      perView={perView}
      className={className}
      loading={loading}
      error={error}
      isEmpty={visible.length === 0}
      action={
        hasStars || unfinishedCount > 0 ? (
          <div className="flex items-center gap-1">
            {/* Each toggle appears only when it would select something. A
                "Needs work" button on an account whose decks are all ready is a
                control whose only outcome is an empty rail. */}
            {unfinishedCount > 0 && (
              <Button
                variant={unfinishedOnly ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setUnfinishedOnly(value => !value)}
                aria-pressed={unfinishedOnly}
              >
                <CircleDashed className="h-4 w-4" />
                Needs work
                <span className="ml-1 tabular-nums opacity-70">{unfinishedCount}</span>
              </Button>
            )}
            {hasStars && (
              <Button
                variant={starredOnly ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStarredOnly(value => !value)}
                aria-pressed={starredOnly}
              >
                <Star className={cn('h-4 w-4', starredOnly && 'fill-current')} />
                Starred
              </Button>
            )}
          </div>
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
            <p className="text-sm text-muted-foreground">
              {starredOnly && unfinishedOnly
                ? 'None of your starred decks need anything.'
                : unfinishedOnly
                  ? 'Every one of your recent decks is ready to play.'
                  : 'None of your recent decks are starred.'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                setStarredOnly(false);
                setUnfinishedOnly(false);
              }}
            >
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
          <div key={deck.id} className={railTileWidth(perView)}>
            <RailTile
              to={`/deck/${deck.id}`}
              card={commander}
              colors={colors}
              fallbackNote={deck.cardCount === 0 ? 'No cards in this deck yet' : 'No card art yet'}
              eager={index < perView}
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
              /* WHAT IS UNFINISHED OUTRANKS WHO IS COMMANDING. The commander is
                 already the largest thing on the tile — it is the artwork — so
                 printing its name underneath says a second time what the picture
                 said first. "3 cards short of 100" is the fact you cannot see by
                 looking, and it is the one you can act on. */
              subtitle={
                deck.work.issue !== null ? (
                  <span className="block truncate font-medium text-foreground">
                    {deck.work.label}
                  </span>
                ) : deck.commanderName ? (
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

      {showNewDeckTile && (
        /* The last slot of a short rail. Same width and the same card-shaped
           box as a deck tile so the row stays flat, drawn as an outline rather
           than a surface so it never reads as a deck you already have. */
        <div className={railTileWidth(perView)}>
          <Link
            to="/decks/new"
            className={cn(
              'group flex h-full flex-col overflow-hidden rounded-xl bg-muted/20',
              'transition-colors duration-200 hover:bg-accent motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <div
              className="flex w-full flex-col items-center justify-center gap-3 bg-muted/25"
              style={{ aspectRatio: CARD_ASPECT }}
            >
              <Plus className="h-8 w-8 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
            <div className="flex flex-1 flex-col p-3">
              <span className="truncate text-sm font-medium text-foreground">Start a new deck</span>
              <span className="mt-0.5 truncate text-xs text-muted-foreground">
                Pick a commander and build from there
              </span>
            </div>
          </Link>
        </div>
      )}
    </RailSection>
  );
}
