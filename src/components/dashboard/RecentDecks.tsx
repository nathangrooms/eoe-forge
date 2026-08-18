import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { CardImage, CardImageSkeleton, CARD_ASPECT } from '@/components/cards';
import { showError } from '@/components/ui/toast-helpers';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useCardLookup } from '@/features/dashboard/cardLookup';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { logActivity } from '@/lib/activityLogger';
import { cn } from '@/lib/utils';
import { describeDeckPower, formatPowerScore, powerTextClass } from '@/lib/deck/power';
import { Reveal } from './Reveal';

interface RecentDecksProps {
  decks: DeckSummary[];
  loading: boolean;
  error?: string | null;
  onToggleFavorite: (deckId: string) => Promise<boolean>;
}

export function RecentDecks({ decks, loading, error, onToggleFavorite }: RecentDecksProps) {
  const navigate = useNavigate();
  const [starredOnly, setStarredOnly] = useState(false);

  /* A deck reads as itself through its commander's art, not a coloured dot.
     The printing id is preferred so the deck shows the art the player picked. */
  const lookup = useCardLookup(
    decks.map(deck => deck.faceCardId),
    decks.map(deck => deck.commanderName)
  );

  const visible = useMemo(
    () => (starredOnly ? decks.filter(deck => deck.isFavorite) : decks),
    [decks, starredOnly]
  );

  const openDeck = (deck: DeckSummary) => {
    logActivity('deck_opened', 'deck', deck.id, {
      name: deck.name,
      format: deck.format,
      power: deck.power?.score ?? null,
    });
    navigate(`/deck-builder?deck=${deck.id}`);
  };

  const handleStar = async (event: React.MouseEvent, deck: DeckSummary) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      await onToggleFavorite(deck.id);
    } catch {
      showError('Could not update favourite', `${deck.name} was not changed.`);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">Recent decks</CardTitle>
        <div className="flex items-center gap-1">
          {decks.some(deck => deck.isFavorite) && (
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
          <Button variant="ghost" size="sm" asChild>
            <Link to="/decks">
              All decks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <li key={i} className="overflow-hidden rounded-xl bg-muted/30">
                <CardImageSkeleton fill size="lg" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : decks.length === 0 ? (
          <div className="py-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No decks yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Your decks show up here as soon as you build one.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/deck-builder">Build your first deck</Link>
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">None of your recent decks are starred.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStarredOnly(false)}>
              Show all recent decks
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((deck, index) => {
              const commander = lookup.resolve(deck.faceCardId, deck.commanderName);
              /* `user_decks.colors` is empty on plenty of real rows, which used
                 to render a Commander deck as colourless. The commander's own
                 identity is the authority when the deck has not recorded one. */
              const colors =
                deck.colors.length > 0 ? deck.colors : (commander?.color_identity ?? []);

              return (
                <Reveal as="li" key={deck.id} index={index} delay={index * 45}>
                  {/* The name button carries a stretched ::after so the whole
                      tile is one target, leaving the star independently
                      focusable above it. */}
                  <div className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-muted/30 shadow-lg shadow-black/20 transition-colors duration-200 hover:bg-accent focus-within:bg-accent motion-reduce:transition-none">
                    {/* Drawn by `CardImage`, not a hand-rolled `<img>` — that is
                        what CLAUDE.md asks for, and it is what right-sizes the
                        Scryfall asset to the width the card is actually drawn
                        at. The previous version letterboxed the card inside a
                        4:5 box with 16px of padding, so a 0.718-aspect card gave
                        up height to empty surface on both sides. The box is the
                        card's own aspect now: nothing cropped, nothing padded,
                        and the art is materially larger in the same tile. */}
                    <div className="relative w-full">
                      {commander ? (
                        <CardImage
                          card={commander}
                          fill
                          hideFlip
                          eager={index < 3}
                          imageClassName="rounded-none"
                        />
                      ) : (
                        /* No commander and no card with art: the deck still
                           reads visually through its colour identity, at size. */
                        <div
                          className="flex w-full flex-col items-center justify-center gap-3 bg-muted/40"
                          style={{ aspectRatio: CARD_ASPECT }}
                        >
                          {colors.length > 0 && (
                            <ColorIdentity colors={colors} size="lg" className="scale-150" />
                          )}
                          <span className="px-4 text-center text-xs text-muted-foreground">
                            {deck.cardCount === 0 ? 'No cards in this deck yet' : 'No card art yet'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openDeck(deck)}
                          title={deck.name}
                          className="block min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        >
                          {deck.name}
                        </button>

                        {/* Star and score sit BELOW the card, never on it. Both
                            were absolutely positioned over the art: the star
                            covered the printed mana cost, the score sat on the
                            collector line. Nothing overlays a card image. */}
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
                              deck.isFavorite
                                ? 'fill-current text-foreground'
                                : 'text-muted-foreground'
                            )}
                          />
                        </button>
                      </div>

                      {deck.commanderName && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {deck.commanderName}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <ColorIdentity colors={colors} size="xs" />
                        {/* The canonical score, on the same 1-decimal scale and
                            with the same band colour the /decks tile uses. A
                            stale score is greyed and marked rather than shown as
                            if it were current. */}
                        {deck.power && (
                          <span
                            className={cn(
                              'shrink-0 text-[11px] font-semibold tabular-nums',
                              deck.power.stale
                                ? 'text-muted-foreground'
                                : powerTextClass(deck.power.band)
                            )}
                            title={
                              deck.power.stale
                                ? 'Outdated — this deck changed after it was scored'
                                : describeDeckPower(deck.power)
                            }
                          >
                            {formatPowerScore(deck.power.score)}
                            {deck.power.stale && <span className="ml-0.5 opacity-70">·</span>}
                          </span>
                        )}
                        <span className="truncate text-[11px] capitalize text-muted-foreground">
                          {deck.format}
                        </span>
                      </div>

                      {/* Second line, so nothing truncates: the counts were
                          being cut to "Commander · 100…" on a 3-up grid. */}
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {deck.cardCount > 0 && (
                          <>
                            {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'} &middot;{' '}
                          </>
                        )}
                        {formatTimeAgo(deck.updatedAt)}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
