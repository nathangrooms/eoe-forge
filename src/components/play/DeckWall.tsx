/**
 * The deck wall. ONE of them, for all four modes.
 *
 * Owner: *"maybe deck select could be the full cards - maybe reuse from deck
 * pages?"*
 *
 * Card art is allowed here in a way it is not on a mode cover, and the
 * difference is the whole point: a deck tile shows the commander card WHOLE and
 * UNMODIFIED, which is exactly what Scryfall's terms permit. A cover would need
 * the image darkened under type, which they forbid. So a full card on a deck,
 * never a card as a background.
 *
 * ---------------------------------------------------------------------------
 * THIS REPLACES TWO WALLS, IT DOES NOT ADD A THIRD
 * ---------------------------------------------------------------------------
 * `PlaytestSetup` and `GoldfishSetup` each carried their own copy of this grid,
 * with their own card size, their own empty deck rule and their own wording,
 * and the old `PlaySetup` had a dropdown instead of a wall. All three now call
 * this. A
 * change to how a deck is drawn on the way to a table lands in every mode at
 * once, which is the project law this phase is most likely to break.
 *
 * `ModernDeckTile` on `/decks` is a different job and stays where it is: it
 * manages a deck, with edit, delete, duplicate, export and a collection
 * progress bar. What is reused from it is what should be, the pieces:
 * `CardImage` for the commander, `PowerScoreBadge` for the one power score in
 * the product, `ColorIdentity` for the pips.
 */

import { CardImage, CARD_ASPECT } from '@/components/cards';
import { ColorIdentity } from '@/components/ui/mana-cost';
import { PowerScoreBadge } from '@/components/deck/PowerScore';
import { cn } from '@/lib/utils';
import { Layers } from 'lucide-react';
import type { PlayDeckOption } from './usePlayDecks';
import { cardCountLine, deckPlayability } from './playDeckView';
import type { PlayModeId } from './playModes';

export interface DeckWallProps {
  decks: PlayDeckOption[];
  mode: PlayModeId;
  /** The chosen deck, or null. */
  value: string | null;
  onChoose: (deckId: string) => void;
  /**
   * An extra tile before the real decks, for the modes where "no deck of mine"
   * is a legitimate answer. Absent for online, where it is not.
   */
  seeded?: { label: string; hint: string; chosen: boolean; onChoose: () => void } | null;
  className?: string;
}

/**
 * The grid.
 *
 * Cards are LARGE and the wall uses the full width of the page: at 1920 with
 * the nav rail that is seven across, at 1280 five, and the tile never shrinks
 * below half a phone screen.
 */
export function DeckWall({ decks, mode, value, onChoose, seeded, className }: DeckWallProps) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        className
      )}
    >
      {seeded && (
        <button
          type="button"
          onClick={seeded.onChoose}
          aria-pressed={seeded.chosen}
          className={cn(
            'motion-press group min-w-0 rounded-xl p-2 text-left',
            seeded.chosen ? 'bg-muted shadow-lg shadow-black/30' : 'bg-muted/20 hover:bg-muted/50'
          )}
        >
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted/40 px-3 text-center"
            style={{ aspectRatio: CARD_ASPECT }}
          >
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs leading-tight text-muted-foreground">{seeded.hint}</span>
          </div>
          <p className="mt-2 truncate text-sm font-medium text-foreground">{seeded.label}</p>
          <p className="truncate text-xs text-muted-foreground">Built from the card database</p>
        </button>
      )}

      {decks.map((deck, index) => (
        <DeckWallTile
          key={deck.id}
          deck={deck}
          mode={mode}
          chosen={value === deck.id}
          eager={index < 8}
          onChoose={() => onChoose(deck.id)}
        />
      ))}
    </div>
  );
}

/**
 * One deck.
 *
 * A deck that cannot be played in this mode is drawn, dimmed, and carries the
 * reason on its own tile. It is not hidden: a wall that silently disagrees with
 * the deck list sends the reader looking for a deck that is right in front of
 * them.
 */
export function DeckWallTile({
  deck,
  mode,
  chosen,
  eager,
  onChoose,
}: {
  deck: PlayDeckOption;
  mode: PlayModeId;
  chosen: boolean;
  eager?: boolean;
  onChoose: () => void;
}) {
  const verdict = deckPlayability(deck, mode);

  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={!verdict.playable}
      aria-pressed={chosen}
      className={cn(
        'motion-press group flex min-w-0 flex-col rounded-xl p-2 text-left',
        !verdict.playable && 'cursor-not-allowed',
        chosen ? 'bg-muted shadow-lg shadow-black/30' : 'bg-muted/20 hover:bg-muted/50'
      )}
    >
      <div className={cn(!verdict.playable && 'opacity-45')}>
        {deck.faceCard ? (
          <CardImage
            card={deck.faceCard}
            size="lg"
            fill
            eager={eager}
            imageClassName={cn(
              'transition-opacity duration-200',
              !chosen && 'opacity-85 group-hover:opacity-100'
            )}
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-lg bg-muted/50"
            style={{ aspectRatio: CARD_ASPECT }}
          >
            <Layers className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
      </div>

      <p className="mt-2 truncate text-sm font-medium text-foreground">{deck.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {deck.commanderName ?? 'No commander set'}
      </p>

      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <ColorIdentity colors={deck.colors} size="sm" />
        <span className="truncate text-[0.7rem] text-muted-foreground">
          {deck.formatLabel} · {cardCountLine(deck)}
        </span>
      </div>

      {/* The one power score in the product, drawn by the one component that
          draws it. An unscored deck says so rather than reading as a zero. */}
      <PowerScoreBadge power={deck.power} className="mt-1.5" />

      {verdict.note && (
        <p className="mt-1.5 text-[0.7rem] leading-snug text-foreground">{verdict.note}</p>
      )}
    </button>
  );
}
