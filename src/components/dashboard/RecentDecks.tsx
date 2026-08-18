import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Layers, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { showError } from '@/components/ui/toast-helpers';
import { formatTimeAgo } from '@/features/dashboard/value';
import type { DeckSummary } from '@/features/dashboard/hooks';
import { logActivity } from '@/lib/activityLogger';
import { useCardArt, cardArtKey } from '@/hooks/useCardArt';
import { cn } from '@/lib/utils';

interface RecentDecksProps {
  decks: DeckSummary[];
  loading: boolean;
  error?: string | null;
  onToggleFavorite: (deckId: string) => Promise<boolean>;
}

/** Power level is one of the few places colour carries MTG meaning. */
function powerToneClass(level: number): string {
  if (level <= 3) return 'text-power-1';
  if (level <= 6) return 'text-power-4';
  if (level <= 8) return 'text-power-7';
  return 'text-power-10';
}

export function RecentDecks({ decks, loading, error, onToggleFavorite }: RecentDecksProps) {
  const navigate = useNavigate();
  /* A deck reads as itself through its commander's art, not through a coloured dot. */
  const art = useCardArt(decks.map(d => d.commanderName));
  const [starredOnly, setStarredOnly] = useState(false);

  const visible = useMemo(
    () => (starredOnly ? decks.filter(deck => deck.isFavorite) : decks),
    [decks, starredOnly]
  );

  const openDeck = (deck: DeckSummary) => {
    logActivity('deck_opened', 'deck', deck.id, {
      name: deck.name,
      format: deck.format,
      power: deck.powerLevel,
    });
    navigate(`/deck-builder?deck=${deck.id}`);
  };

  const handleStar = async (event: React.MouseEvent, deck: DeckSummary) => {
    event.stopPropagation();
    try {
      await onToggleFavorite(deck.id);
    } catch {
      showError('Could not update favourite', `${deck.name} was not changed.`);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
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
          <ul className="divide-y divide-border border-t border-border">
            {[0, 1, 2, 3].map(i => (
              <li key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-4 w-16" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-4 w-8" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="border-t border-border py-8 text-center text-sm text-destructive">{error}</p>
        ) : decks.length === 0 ? (
          <div className="border-t border-border py-10 text-center">
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
          <div className="border-t border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">None of your recent decks are starred.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStarredOnly(false)}>
              Show all recent decks
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map(deck => {
              const commander = deck.commanderName
                ? art.get(cardArtKey(deck.commanderName))
                : null;
              return (
              <li key={deck.id}>
                {/* One button covers the row (via the stretched ::after) so the
                    star stays a separate, independently focusable control. */}
                <div className="group relative flex items-center gap-3 overflow-hidden rounded-xl bg-muted/25 px-2 py-2 transition-colors hover:bg-accent focus-within:bg-accent">
                  {/* Commander art as the row's identity. */}
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {commander?.art_crop ? (
                      <img
                        src={commander.art_crop}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ColorIdentity colors={deck.colors} size="sm" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openDeck(deck)}
                      className="block max-w-full truncate text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      {deck.name}
                    </button>
                    {deck.commanderName && (
                      <p className="truncate text-xs text-muted-foreground">{deck.commanderName}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <ColorIdentity colors={deck.colors} size="xs" />
                      <span className="truncate text-[11px] text-muted-foreground">
                        <span className="capitalize">{deck.format}</span>
                        {deck.cardCount > 0 && <> &middot; {deck.cardCount} cards</>}
                        <> &middot; {formatTimeAgo(deck.updatedAt)}</>
                      </span>
                    </div>
                  </div>

                  {deck.powerLevel > 0 && (
                    <span
                      className={cn(
                        'shrink-0 text-xs font-semibold tabular-nums',
                        powerToneClass(deck.powerLevel)
                      )}
                      title={`Power level ${deck.powerLevel.toFixed(1)}`}
                    >
                      {deck.powerLevel.toFixed(1)}
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8 shrink-0"
                    onClick={event => handleStar(event, deck)}
                    aria-pressed={deck.isFavorite}
                    aria-label={deck.isFavorite ? `Unstar ${deck.name}` : `Star ${deck.name}`}
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        deck.isFavorite ? 'fill-current text-foreground' : 'text-muted-foreground'
                      )}
                    />
                  </Button>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
