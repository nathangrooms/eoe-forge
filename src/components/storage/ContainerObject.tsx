import { memo } from 'react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import type { StoragePreviewCard, StorageType } from '@/types/storage';

/**
 * A storage container, drawn as the object it is.
 *
 * Storage is the thing this product knows that Moxfield and Archidekt do not:
 * not *whether* you own a card but *where it physically is*. That was being
 * rendered as a rounded rectangle with a parcel glyph and a definition list —
 * cards, unique, value — which is the same shape a shipping-tracker uses, and
 * says nothing about the shelf it describes.
 *
 * So a binder is drawn as a binder: rings down the spine and a nine-pocket page
 * with your actual cards in the pockets. A deck box is a box with a deck
 * standing in it. A bulk box is a long box with a row of cards on their edges.
 * Every card in every one of them is a real row from `storage_items`, at the
 * printing you own, ranked most valuable first — nothing here is decoration
 * standing in for data.
 *
 * ## Geometry
 *
 * Every dimension inside an object is a percentage of the object's own width,
 * never a pixel. The shelf is an `auto-fill minmax()` grid, so a tile is
 * anywhere from 300px to 500px wide depending on how the columns fall; a
 * binder built out of pixels is a binder that is right at exactly one column
 * count. Percentage padding and gaps resolve against the inline size in both
 * axes, so the whole object scales as one drawing.
 *
 * ## Surfaces, not borders
 *
 * Depth is three tints and a shadow: `bg-muted` is the shell of the object
 * (the cover, the box wall), `bg-background` is anything hollow (a pocket, the
 * mouth of a box, the well of a tray) and carries an inset shadow so it reads
 * as recessed, and the object as a whole sits on a heavy drop shadow so it
 * reads as sitting on the page rather than printed onto it. No strokes
 * anywhere.
 */

/** Cards a form can hold. The binder page is the reason `PREVIEW_LIMIT` is 9. */
const CAPACITY: Record<string, number> = {
  binder: 9,
  deckbox: 3,
  'deck-linked': 3,
  box: 5,
  shelf: 6,
  other: 3,
};

export function containerCapacity(type: StorageType | string): number {
  return CAPACITY[type] ?? 3;
}

/**
 * Recessed inner surfaces. Written out rather than reached for as a token
 * because there is no inset-shadow token — and an inset shadow is precisely
 * how a pocket reads as a hole instead of a grey square.
 */
const WELL = 'shadow-[inset_0_2px_5px_hsl(0_0%_0%/0.55)]';
const WELL_DEEP = 'shadow-[inset_0_4px_10px_hsl(0_0%_0%/0.7)]';
/** The object's own drop shadow — what puts it on a shelf. */
const OBJECT_SHADOW = 'shadow-2xl shadow-black/60';
/** Plastic. A single diagonal highlight, no colour, no second stop. */
const SHEEN =
  'pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/[0.07] via-transparent to-transparent';

interface FormProps {
  cards: StoragePreviewCard[];
  eager?: boolean;
}

/** A card as it sits in the object: real image, full frame, never cropped. */
function ObjectCard({
  card,
  eager,
  className,
}: {
  card: StoragePreviewCard;
  eager?: boolean;
  className?: string;
}) {
  return (
    <CardImage
      card={card}
      size="sm"
      // These render between roughly 70px and 190px wide and there can be nine
      // of them per container across a shelf of containers. `normal` (488px)
      // still over-samples the widest pocket; `large` would be four times the
      // pixels anything here can show.
      quality="normal"
      fill
      hideFlip
      eager={eager}
      interactive={false}
      imageClassName={cn('shadow-md shadow-black/50', className)}
    />
  );
}

/* ------------------------------------------------------------------ binder */

/**
 * Nine pockets and a set of rings.
 *
 * Empty pockets are drawn, not hidden. A binder with two cards in it is a
 * binder with seven empty pockets, and that reads instantly as "there is room
 * here" in a way that a 22% progress bar does not.
 */
function Binder({ cards, eager }: FormProps) {
  return (
    <div className={cn('relative w-full rounded-lg bg-muted p-[3.5%]', OBJECT_SHADOW)}>
      <div className="flex items-stretch gap-[3%]">
        {/* Rings down the spine. */}
        <div className="flex w-[5.5%] shrink-0 flex-col justify-evenly py-[6%]">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={cn('aspect-square w-full rounded-full bg-background', WELL)}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* The page. */}
        <div
          className={cn(
            'grid flex-1 grid-cols-3 gap-[3.5%] rounded-md bg-background/70 p-[3.5%]',
            WELL
          )}
        >
          {Array.from({ length: 9 }, (_, i) => {
            const card = cards[i];
            return (
              <div
                key={card?.id ?? `empty-${i}`}
                className={cn(
                  'relative aspect-[488/680] overflow-hidden rounded-[5%] bg-background',
                  WELL
                )}
              >
                {card && (
                  <div className="absolute inset-[3.5%]">
                    <ObjectCard card={card} eager={eager && i < 3} />
                  </div>
                )}
                <span className={cn(SHEEN, 'rounded-[5%]')} aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- deck box */

/**
 * A deck standing in an open box.
 *
 * The three cards fan from a shared bottom origin so they splay the way a deck
 * does when you tip the box, and the box wall is drawn last and sits in front
 * of their lower quarter — the cards are whole images, occluded by an object
 * nearer the viewer, which is what a deck box does to a deck.
 */
function DeckBox({ cards, eager }: FormProps) {
  const fan = cards.slice(0, 3);
  const angles = fan.length > 1 ? [-8, 0, 8] : [0];
  const shifts = fan.length > 1 ? ['-24%', '0%', '24%'] : ['0%'];

  return (
    <div className="relative w-full">
      {/* Cards, rising out of the box. */}
      <div className="relative mx-auto flex h-full w-[92%] items-end justify-center pb-[26%]">
        {fan.length > 0 ? (
          fan.map((card, i) => (
            <div
              key={card.id}
              className="w-[58%] origin-bottom transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${shifts[i]}) rotate(${angles[i]}deg)`,
                marginLeft: i > 0 ? '-46%' : undefined,
                // Middle card in front, so the fan reads as a deck seen from
                // the front rather than a staircase.
                zIndex: i === 1 ? 3 : 2 - Math.abs(1 - i),
              }}
            >
              <ObjectCard card={card} eager={eager && i === 1} />
            </div>
          ))
        ) : (
          // Empty box: the sleeve slot, with nothing in it.
          <div className={cn('aspect-[488/680] w-[58%] rounded-md bg-background', WELL_DEEP)} />
        )}
      </div>

      {/* The box itself. */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-[4] h-[40%] rounded-b-lg rounded-t-md bg-muted',
          OBJECT_SHADOW
        )}
      >
        {/* Mouth of the box. */}
        <div
          className={cn('absolute inset-x-[7%] top-[7%] h-[16%] rounded-full bg-background', WELL_DEEP)}
          aria-hidden="true"
        />
        {/* Lid seam — a tint change, not a rule. */}
        <div
          className="absolute inset-x-0 bottom-0 h-[38%] rounded-b-lg bg-background/25"
          aria-hidden="true"
        />
        <span className={SHEEN} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- bulk box */

/**
 * A long box with cards on their edges.
 *
 * Bulk is the container people have the most of and understand the least about
 * — the row of cards receding into the box, with only the front one square on,
 * is exactly what you see when you open one.
 */
function BulkBox({ cards, eager }: FormProps) {
  const row = cards.slice(0, 5);

  return (
    <div className="relative w-full">
      <div className="relative flex h-full w-full items-end justify-center pb-[18%] pl-[8%]">
        {row.length > 0 ? (
          row.map((card, i) => (
            <div
              key={card.id}
              className="w-[38%] origin-bottom"
              style={{
                marginLeft: i > 0 ? '-26%' : undefined,
                // Front card square on, the rest leaning back into the box.
                transform: `rotate(${i * 2.5}deg) translateY(${i * -1.5}%)`,
                zIndex: row.length - i,
              }}
            >
              <ObjectCard card={card} eager={eager && i === 0} />
            </div>
          ))
        ) : (
          <div className={cn('aspect-[488/680] w-[38%] rounded-md bg-background', WELL_DEEP)} />
        )}
      </div>

      {/* Box walls. */}
      <div
        className={cn('absolute inset-x-0 bottom-0 z-[9] h-[30%] rounded-lg bg-muted', OBJECT_SHADOW)}
      >
        <div
          className={cn('absolute inset-x-[4%] top-[9%] h-[22%] rounded-md bg-background', WELL_DEEP)}
          aria-hidden="true"
        />
        <span className={SHEEN} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- shelf */

/** Two ledges of cards standing on display. */
function Shelf({ cards, eager }: FormProps) {
  const rows = [cards.slice(0, 3), cards.slice(3, 6)];

  return (
    <div className={cn('w-full space-y-[4%] rounded-lg bg-muted p-[4%]', OBJECT_SHADOW)}>
      {rows.map((shelfRow, rowIndex) => (
        <div key={rowIndex} className="relative">
          <div className={cn('flex items-end gap-[4%] rounded-md bg-background/70 p-[3.5%]', WELL)}>
            {Array.from({ length: 3 }, (_, i) => {
              const card = shelfRow[i];
              return (
                <div key={card?.id ?? `empty-${rowIndex}-${i}`} className="w-1/3">
                  {card ? (
                    <ObjectCard card={card} eager={eager && rowIndex === 0} />
                  ) : (
                    <div
                      className={cn('aspect-[488/680] w-full rounded-[5%] bg-background', WELL)}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {/* The ledge the row stands on. */}
          <div className="h-[6px] rounded-b-md bg-background/50 shadow-md shadow-black/40" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- tray */

/** Anything else: a shallow tray with the cards laid in it. */
function Tray({ cards, eager }: FormProps) {
  const row = cards.slice(0, 3);

  return (
    <div className={cn('w-full rounded-lg bg-muted p-[4%]', OBJECT_SHADOW)}>
      <div className={cn('flex items-end gap-[4%] rounded-md bg-background/70 p-[4%]', WELL)}>
        {Array.from({ length: 3 }, (_, i) => {
          const card = row[i];
          return (
            <div key={card?.id ?? `empty-${i}`} className="w-1/3">
              {card ? (
                <ObjectCard card={card} eager={eager && i === 0} />
              ) : (
                <div className={cn('aspect-[488/680] w-full rounded-[5%] bg-background', WELL)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- export */

export interface ContainerObjectProps {
  type: StorageType | string;
  /** Real rows from the container. Empty is a legitimate, drawn state. */
  cards?: StoragePreviewCard[];
  /** Skip lazy-loading — for the objects above the fold. */
  eager?: boolean;
  className?: string;
}

function ContainerObjectBase({ type, cards = [], eager, className }: ContainerObjectProps) {
  const form = (() => {
    switch (type) {
      case 'binder':
        return <Binder cards={cards} eager={eager} />;
      case 'deckbox':
      case 'deck-linked':
        return <DeckBox cards={cards} eager={eager} />;
      case 'box':
        return <BulkBox cards={cards} eager={eager} />;
      case 'shelf':
        return <Shelf cards={cards} eager={eager} />;
      default:
        return <Tray cards={cards} eager={eager} />;
    }
  })();

  return (
    <div
      // Deck boxes and bulk boxes draw their cards standing above the box, and
      // that headroom has to come from somewhere: the two absolutely-positioned
      // forms are given a height here rather than each inventing one.
      className={cn(
        'flex w-full items-end justify-center',
        (type === 'deckbox' || type === 'deck-linked' || type === 'box') && 'h-full min-h-[13rem]',
        className
      )}
    >
      {form}
    </div>
  );
}

export const ContainerObject = memo(ContainerObjectBase);

export default ContainerObject;
