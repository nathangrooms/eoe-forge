import { Loader2, Fish } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardImage } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';

export interface GoldfishDeckOption {
  id: string;
  name: string;
  format: string;
  cardCount: number;
  colors: string[];
  commanderName: string | null;
  /** The card that represents the deck — commander, else its best creature. */
  faceCard: any | null;
}

interface GoldfishSetupProps {
  decks: GoldfishDeckOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onStart: () => void;
  starting: boolean;
}

/**
 * Pick the one deck to goldfish.
 *
 * The old setup asked for two decks because the page ran an AI-vs-AI match. A
 * goldfish has one list, so the picker is a wall of the real decks as their real
 * commanders — full cards, never cropped — and the chosen one is raised rather
 * than outlined.
 */
export function GoldfishSetup({ decks, selectedId, onSelect, onStart, starting }: GoldfishSetupProps) {
  const selected = decks.find(d => d.id === selectedId) ?? null;

  if (decks.length === 0) {
    return (
      <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
        <Fish className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-foreground">No decks to goldfish yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a deck first. Every card in it is drawn from your real list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Choose a deck
          </h2>
          <p className="text-xs text-muted-foreground">
            {decks.length} deck{decks.length === 1 ? '' : 's'} · card counts read from your lists
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {decks.map((deck, index) => {
            const active = deck.id === selectedId;
            /* A deck with no recorded cards cannot be shuffled, so it is shown
               (it is real) but not selectable. */
            const empty = deck.cardCount === 0;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => onSelect(deck.id)}
                aria-pressed={active}
                disabled={empty}
                className={cn(
                  'group rounded-xl p-2 text-left transition-all',
                  empty && 'cursor-not-allowed opacity-45',
                  active
                    ? 'bg-muted shadow-lg shadow-black/30'
                    : 'bg-muted/20 hover:bg-muted/50'
                )}
              >
                <div className={cn('transition-transform', active && 'scale-[1.02]')}>
                  {deck.faceCard ? (
                    <CardImage
                      card={deck.faceCard}
                      size="lg"
                      fill
                      eager={index < 8}
                      imageClassName={cn(!active && 'opacity-80 group-hover:opacity-100')}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center rounded-lg bg-muted/50"
                      style={{ aspectRatio: '488 / 680' }}
                    >
                      <Fish className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-foreground">{deck.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {deck.commanderName ?? 'No commander'}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ColorIdentity colors={deck.colors} size="sm" />
                  <span className="text-[0.7rem] text-muted-foreground">
                    {empty ? 'No cards recorded' : `${deck.cardCount} card${deck.cardCount === 1 ? '' : 's'}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        size="lg"
        className="h-12 w-full text-base"
        onClick={onStart}
        disabled={!selected || starting}
      >
        {starting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Shuffling {selected?.name}…
          </>
        ) : (
          <>
            <Fish className="mr-2 h-4 w-4" aria-hidden="true" />
            Goldfish {selected?.name ?? 'a deck'}
          </>
        )}
      </Button>
    </div>
  );
}
