import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError } from '@/components/ui/toast-helpers';
import { formatTimeAgo } from '@/features/dashboard/value';
import { useCardLookup, type CardRow } from '@/features/dashboard/cardLookup';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { logActivity } from '@/lib/activityLogger';
import { getBestCardImage } from '@/lib/scryfall/card-utils';
import { cn } from '@/lib/utils';
import { describeDeckPower, formatPowerScore, powerTextClass } from '@/lib/deck/power';
import { Reveal } from './Reveal';

interface RecentDecksProps {
  decks: DeckSummary[];
  loading: boolean;
  error?: string | null;
  onToggleFavorite: (deckId: string) => Promise<boolean>;
}

/**
 * A deck's banner is its commander's illustration.
 *
 * `art_crop` is the right asset here and the one exception to "default to
 * `large`": this is a wide banner showing the *art*, not a card, and the crop is
 * 626 px of pure illustration with no frame, name bar or rules text to throw
 * away. When a printing has no crop we fall back to the full card image and
 * position it over the art box rather than its centre, which would frame the
 * type line.
 */
function bannerFor(card: CardRow | null): { src: string; objectPosition: string } | null {
  if (!card) return null;
  /* The WHOLE card, not the art crop. A cropped commander reads as a broken
     image to a Magic player — the frame, type line and mana cost are part of
     how the card is recognised. */
  const full = getBestCardImage(card, 'large') ?? getBestCardImage(card, 'normal');
  return full ? { src: full, objectPosition: 'center' } : null;
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
          <ul className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <li key={i} className="overflow-hidden rounded-xl bg-muted/30">
                <Skeleton className="aspect-[4/5] w-full" />
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
          <ul className="grid gap-4 sm:grid-cols-2">
            {visible.map((deck, index) => {
              const commander = lookup.resolve(deck.faceCardId, deck.commanderName);
              const banner = bannerFor(commander);
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
                    <div className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden bg-muted/40 p-4">
                      {banner ? (
                        <img
                          src={banner.src}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="h-full w-auto rounded-lg object-contain shadow-xl shadow-black/50 transition-transform duration-500 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
                        />
                      ) : (
                        /* No commander (or no art yet): the deck still reads
                           visually through its colour identity, at size. */
                        <div className="flex h-full w-full items-center justify-center">
                          <ColorIdentity colors={colors} size="lg" className="scale-150" />
                        </div>
                      )}

                      {/* The canonical score, on the same 1-decimal scale and
                          with the same band colour the deck tile uses. A stale
                          score is greyed and marked rather than stamped on the
                          art as if it were current. */}
                      {deck.power && (
                        <span
                          className={cn(
                            'absolute bottom-2 left-2 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums backdrop-blur',
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
                          {deck.power.stale && <span className="ml-1 opacity-70">·</span>}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={event => handleStar(event, deck)}
                        aria-pressed={deck.isFavorite}
                        aria-label={deck.isFavorite ? `Unstar ${deck.name}` : `Star ${deck.name}`}
                        className={cn(
                          'absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-background/85 backdrop-blur',
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

                    <div className="flex flex-1 flex-col p-3">
                      <button
                        type="button"
                        onClick={() => openDeck(deck)}
                        className="block max-w-full truncate text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      >
                        {deck.name}
                      </button>

                      {deck.commanderName && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {deck.commanderName}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <ColorIdentity colors={colors} size="xs" />
                        <span className="truncate text-[11px] text-muted-foreground">
                          <span className="capitalize">{deck.format}</span>
                          {deck.cardCount > 0 && <> &middot; {deck.cardCount} cards</>}
                          <> &middot; {formatTimeAgo(deck.updatedAt)}</>
                        </span>
                      </div>
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
