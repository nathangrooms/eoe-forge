import { Link } from 'react-router-dom';
import { CardImage } from '@/components/cards';
import { cn } from '@/lib/utils';
import { deckRailLine } from './deckRailLine';

/**
 * Your decks, drawn as the commanders that lead them.
 *
 * Owner: *"Where there is an opportunity to reference cards or images do it,
 * visual is always better"*, and *"try not to use cut cropped card images,
 * always show the full card image instead (means box size larger)"*. So a deck
 * here is a whole, uncropped commander card, and the fewer decks there are the
 * bigger those cards get, rather than three tiles huddled at the left of a
 * 1600px screen with nothing beside them.
 *
 * Three surfaces draw this: the tournaments page with nothing scheduled, the
 * proxy page with nothing on the list, and the settings export. All three were
 * pages about Magic with no Magic card anywhere on them.
 *
 * ## Two rules it enforces
 *
 * **Nothing is filtered out.** A deck whose commander has no artwork on file is
 * still drawn, as a card-shaped panel carrying its name, which is what
 * `CardImage` does when it has no image. The tournaments rail used to drop
 * those decks and then count them anyway, which is how a heading came to read
 * "2 decks in your library" above one card. A rail that shows everything cannot
 * make that mistake. When a caller genuinely has to cap the list, it passes the
 * real `total` and the line above says "Showing 6 of 30".
 *
 * **The card is whole.** No `object-fit: cover`, no art crop, no fixed-height
 * box. `CardImage` with `fill` inside a grid track keeps the 5:7 the printed
 * card has.
 */

export interface DeckRailItem {
  id: string;
  name: string;
  /** The commander's `cards` row. Null draws the named fallback, never a gap. */
  card: unknown;
  /**
   * Where the tile goes. Omitted where leaving would cost the reader something,
   * such as a half-filled sign-in sheet, and the tile is then just a picture.
   */
  href?: string;
  /** One short line under the name, e.g. "99 cards". Real figures only. */
  note?: string;
}

export interface DeckRailProps {
  decks: DeckRailItem[];
  /**
   * How many decks the library actually holds. Defaults to what is being drawn,
   * which is right whenever the caller is not capping the list.
   */
  total?: number;
  /** What these decks are ready for, e.g. "ready to print". */
  purpose?: string;
  /** Screen-reader name for the list. */
  label: string;
}

/**
 * How wide one card is allowed to get, by how many there are.
 *
 * A rail of two decks on a wide screen used to draw two 240px cards and leave
 * 1,100px of nothing to their right. The cap grows as the count falls so the
 * row fills either way, and the floor stops eight decks becoming eight
 * thumbnails.
 */
function widthCap(count: number): string {
  /* 26rem for one or two, up from 22. Two cards at the old cap filled 704px of
     the 1,250 a 1600px screen gives this rail, and the owner's note is
     explicit: "always show the full card image instead (means box size
     larger)". Two at 26rem is 848px, which is as far as this can go before a
     commander stops looking like a card and starts looking like a poster. */
  if (count <= 2) return '26rem';
  if (count <= 4) return '18rem';
  return '15rem';
}

/**
 * The smallest a track may be, which is what decides the column count on a
 * phone.
 *
 * 8rem rather than 10rem, because at 390px the wider floor left room for
 * exactly one track and twelve decks then became a 6,000px column nobody
 * scrolls to the end of. Two fit at 8rem, and on a desktop the cap above is
 * what governs, so nothing else changes.
 */
const TRACK_FLOOR = '8rem';

export function DeckRail({ decks, total, purpose, label }: DeckRailProps) {
  if (decks.length === 0) return null;

  return (
    <section aria-label={label}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {deckRailLine(total ?? decks.length, decks.length, purpose)}
      </p>
      <div
        className="mt-3 grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${TRACK_FLOOR}), ${widthCap(decks.length)}))`,
        }}
      >
        {decks.map(deck => {
          const body = (
            <>
              <CardImage
                card={deck.card ?? { name: deck.name }}
                size="lg"
                fill
                interactive={Boolean(deck.href)}
                title={deck.name}
                label={deck.name}
              />
              <p
                className={cn(
                  'mt-2 truncate text-sm font-medium text-foreground',
                  deck.href && 'group-hover:underline'
                )}
              >
                {deck.name}
              </p>
              {deck.note && <p className="truncate text-xs text-muted-foreground">{deck.note}</p>}
            </>
          );

          return deck.href ? (
            <Link
              key={deck.id}
              to={deck.href}
              className="group min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {body}
            </Link>
          ) : (
            <div key={deck.id} className="min-w-0">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
