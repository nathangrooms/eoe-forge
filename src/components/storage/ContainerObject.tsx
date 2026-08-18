import { memo, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CardImage } from '@/components/cards';
import type { StoragePreviewCard, StorageType } from '@/types/storage';

/**
 * A storage container, drawn as the object it is.
 *
 * Storage is the thing this product knows that Moxfield and Archidekt do not:
 * not *whether* you own a card but *where it physically is*. That was being
 * rendered as a rounded rectangle with a parcel glyph over a definition list —
 * cards, unique, value — which is the shape a shipping tracker uses, and says
 * nothing about the shelf it describes.
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
 * anywhere from 300px to 500px wide depending on how the columns fall, and a
 * binder built out of pixels is a binder that is right at exactly one column
 * count. Percentage padding and margins resolve against the inline size in both
 * axes, so the whole object scales as a single drawing.
 *
 * ## Surfaces, not borders
 *
 * Depth is three tints, a gradient and a shadow — no strokes. The tint ladder
 * is set out at {@link SHELL} below; {@link MOULDED} is the gradient that turns
 * a box front from a panel into a body; and every object sits on a heavy drop
 * shadow, which is what puts it on a shelf rather than printing it onto the
 * page.
 */

/** Cards a form can hold. The binder page is why the API caps previews at 9. */
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
 * Three depths, in a fixed order, and every surface in this file is one of them.
 *
 * `SHELL` is the object's body — the cover, the box wall — and is the one real
 * surface token here: `accent`, a step off the `card` tile it stands on in both
 * themes. `PAGE` and `HOLLOW` are that shell **darkened**, not other tokens.
 *
 * They have to be, because the surface tokens only stack in one direction. In
 * dark the ladder runs background 4% → card 7% → muted 11% → accent 14%, so
 * `bg-background` is a convincing hole; in light the same tokens run background
 * *100%* → card 100% → muted 96% → accent 94%, and a pocket painted
 * `bg-background` becomes the brightest thing on the page — a hole that glows.
 * Light mode has no dark surface token at all, so a recess can only be made by
 * tinting, which is what the house style asks for anyway. Black alpha subtracts
 * light in both themes, and because each of these nests inside the last, the
 * darkening compounds: a pocket is the cover through two layers.
 */
const SHELL = 'bg-accent';
const PAGE = 'bg-black/20';
const HOLLOW = 'bg-black/50';
/** An empty sleeve standing where a card would be — an object, so not a hollow. */
const EMPTY_SLOT = 'bg-accent';
/**
 * Recessed inner surfaces. Written out rather than reached for as a token
 * because there is no inset-shadow token — and an inset shadow is precisely how
 * a pocket reads as a hole instead of a dark square.
 */
const WELL = 'shadow-[inset_0_2px_5px_hsl(0_0%_0%/0.55)]';
const WELL_DEEP = 'shadow-[inset_0_4px_10px_hsl(0_0%_0%/0.7)]';
/** The object's drop shadow — what puts it on a shelf. */
const OBJECT_SHADOW = 'shadow-2xl shadow-black/60';
/**
 * Plastic. One diagonal highlight, no colour, no second stop.
 *
 * White rather than `foreground`: a highlight is light being added, and
 * `foreground` is near-black in light mode, so the token version quietly
 * shaded the top-left corner of every pocket instead of catching it.
 */
const SHEEN =
  'pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-transparent';
/**
 * What turns a rounded rectangle into a box.
 *
 * A flat `bg-accent` panel with a dark pill on it read as a slab with a slot
 * cut in it — the first pass proved that twice. A single top-lit vertical
 * gradient across the whole front face is the cheapest possible cue that the
 * thing has a top edge catching light and a body falling away from it, and it
 * costs no colour and no stroke.
 */
const MOULDED =
  'pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-b from-white/[0.11] via-transparent to-black/35';

interface FormProps {
  cards: StoragePreviewCard[];
  eager?: boolean;
}

/** A card as it sits in the object: real image, full frame, never cropped. */
function ObjectCard({ card, eager }: { card: StoragePreviewCard; eager?: boolean }) {
  return (
    <CardImage
      card={card}
      size="sm"
      // These render between roughly 70px and 190px wide, and there can be nine
      // per container across a shelf of containers. `normal` (488px) still
      // over-samples the widest pocket; `large` would be four times the pixels
      // anything here is able to show.
      quality="normal"
      fill
      hideFlip
      eager={eager}
      interactive={false}
      imageClassName="shadow-md shadow-black/50"
    />
  );
}

/* ------------------------------------------------------------------ binder */

/**
 * Nine pockets and a set of rings.
 *
 * Empty pockets are drawn, not hidden. A binder with two cards in it is a
 * binder with seven empty pockets, and that reads instantly as "there is room
 * here" in a way a 22% progress bar does not.
 */
function Binder({ cards, eager }: FormProps) {
  return (
    <div className={cn('relative w-full rounded-lg p-[3.5%]', SHELL, OBJECT_SHADOW)}>
      <div className="flex items-stretch gap-[3%]">
        {/* Rings down the spine. */}
        <div className="flex w-[5.5%] shrink-0 flex-col justify-evenly py-[6%]">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={cn('aspect-square w-full rounded-full', HOLLOW, WELL)}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* The page, and the pockets cut into it. */}
        <div className={cn('grid flex-1 grid-cols-3 gap-[3.5%] rounded-md p-[3.5%]', PAGE, WELL)}>
          {Array.from({ length: 9 }, (_, i) => {
            const card = cards[i];
            return (
              <div
                key={card?.id ?? `empty-${i}`}
                className={cn(
                  'relative aspect-[488/680] overflow-hidden rounded-[5%]',
                  HOLLOW,
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

/* --------------------------------------------------------------- the boxes */

/**
 * A card standing in a box, or the card-shaped void where one would stand.
 *
 * The empty slot keeps the geometry of a filled one, so an empty deck box is
 * the same object as a full one with the deck lifted out — not a different,
 * shorter drawing. That is what lets a shelf of half-used containers line up.
 */
function Standing({
  card,
  eager,
  className,
  style,
}: {
  card: StoragePreviewCard | null;
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('origin-bottom', className)} style={style}>
      {card ? (
        <ObjectCard card={card} eager={eager} />
      ) : (
        <div className={cn('aspect-[488/680] w-full rounded-[5%]', EMPTY_SLOT, WELL_DEEP)} />
      )}
    </div>
  );
}

/**
 * A deck standing in an open box.
 *
 * Proportions are the whole job here. The first attempt fanned the cards with a
 * `translateX` *on top of* negative margins, which put the outer two past the
 * edge of the tile, and gave the box a height of 40% of a box whose height the
 * cards themselves defined — so it came out as a dark bar under a stack rather
 * than a thing the stack was standing in.
 *
 * The fan is now margins only and sized to land inside the object's own width:
 * three cards at 62% of a 70%-wide column, overlapping by half, is 87% across.
 * The box is a block with its own padding-derived height, pulled up over the
 * foot of the cards — drawn last, so it sits in front of them, which is what a
 * box does to the deck inside it.
 */
function DeckBox({ cards, eager }: FormProps) {
  // An empty deck box is an empty deck box — an open one, with the cavity
  // showing. The first pass stood a card-shaped grey slab up out of it, which
  // reads as *something is in here*, and is the one thing an empty container
  // must not say.
  if (cards.length === 0) return <OpenAndEmpty className="pt-[58%]" cavity="inset-x-[9%] top-[9%] bottom-[46%]" />;

  const fan = cards.slice(0, 3);
  const angles = fan.length > 1 ? [-6, 0, 6] : [0];

  return (
    <div className="w-full">
      <div className="relative z-0 mx-auto flex w-[70%] justify-center">
        {fan.map((card, i) => (
          <Standing
            key={card.id}
            card={card}
            eager={eager && i === Math.floor(fan.length / 2)}
            className="w-[62%]"
            style={{
              transform: `rotate(${angles[i] ?? 0}deg)`,
              marginLeft: i > 0 ? '-31%' : undefined,
              // Middle card in front, so the fan reads as a deck seen head-on
              // rather than as a staircase.
              zIndex: i === 1 ? 3 : 1,
            }}
          />
        ))}
      </div>

      {/* The box, in front of the deck's foot.

          Seen head-on you do not see *into* a deck box — you see its front face
          and the lip of its walls. The first pass drew a dark pill across the
          top as "the mouth", which from the front is not a thing that exists,
          and it read as a slot cut in a slab. What is left is the face itself:
          moulded by one top-lit gradient, with the recessed label panel every
          deck box has. It is deliberately short — the deck is the subject, and
          a box tall enough to hide half of it is a box with nothing to show. */}
      <div className={cn('relative z-10 -mt-[8%] w-full rounded-lg pt-[31%]', SHELL, OBJECT_SHADOW)}>
        <div
          className={cn('absolute inset-x-[13%] top-[26%] bottom-[15%] rounded-md', HOLLOW, WELL)}
          aria-hidden="true"
        />
        <span className={MOULDED} aria-hidden="true" />
        <span className={cn(SHEEN, 'rounded-lg')} aria-hidden="true" />
      </div>
    </div>
  );
}

/** A container with the lid off and nothing in it. */
function OpenAndEmpty({ className, cavity }: { className: string; cavity: string }) {
  return (
    <div className={cn('relative w-full rounded-lg', SHELL, OBJECT_SHADOW, className)}>
      <div className={cn('absolute rounded-md', cavity, HOLLOW, WELL_DEEP)} aria-hidden="true" />
      <span className={MOULDED} aria-hidden="true" />
      <span className={cn(SHEEN, 'rounded-lg')} aria-hidden="true" />
    </div>
  );
}

/**
 * A long box with cards on their edges.
 *
 * Bulk is the container people have most of and understand least about. The row
 * leaning back into the box, front card square on, is what you see when you open
 * one — and unlike the deck box it is a wide, low object, so it is drawn wide
 * and low rather than scaled off the same template.
 */
function BulkBox({ cards, eager }: FormProps) {
  if (cards.length === 0)
    return <OpenAndEmpty className="pt-[44%]" cavity="inset-x-[6%] top-[11%] bottom-[32%]" />;

  const row = cards.slice(0, 5);

  return (
    <div className="w-full">
      <div className="relative z-0 flex w-full justify-center">
        {row.map((card, i) => (
          <Standing
            key={card.id}
            card={card}
            eager={eager && i === 0}
            className="w-[38%]"
            style={{
              transform: `rotate(${(i - (row.length - 1) / 2) * 2.5}deg)`,
              marginLeft: i > 0 ? '-25%' : undefined,
              zIndex: row.length - i,
            }}
          />
        ))}
      </div>

      {/* A bulk box is a lid-off tray: low, wide, and with a visible lip along
          the top that the cards rise out of. */}
      <div className={cn('relative z-10 -mt-[11%] w-full rounded-lg pt-[26%]', SHELL, OBJECT_SHADOW)}>
        <div
          className="absolute inset-x-0 top-0 h-[22%] rounded-t-lg bg-white/[0.08]"
          aria-hidden="true"
        />
        <span className={MOULDED} aria-hidden="true" />
        <span className={cn(SHEEN, 'rounded-lg')} aria-hidden="true" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- shelf */

/** Two ledges of cards standing on display. */
function Shelf({ cards, eager }: FormProps) {
  const rows = [cards.slice(0, 3), cards.slice(3, 6)];

  return (
    <div className={cn('w-full space-y-[3%] rounded-lg p-[4%]', SHELL, OBJECT_SHADOW)}>
      {rows.map((shelfRow, rowIndex) => (
        <div
          key={rowIndex}
          className={cn('flex items-end gap-[4%] rounded-md p-[3.5%]', HOLLOW, WELL)}
        >
          {Array.from({ length: 3 }, (_, i) => (
            <Standing
              key={shelfRow[i]?.id ?? `slot-${rowIndex}-${i}`}
              card={shelfRow[i] ?? null}
              eager={eager && rowIndex === 0}
              className="w-1/3"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- tray */

/** Anything else: a shallow tray with the cards laid in it. */
function Tray({ cards, eager }: FormProps) {
  return (
    <div className={cn('w-full rounded-lg p-[4%]', SHELL, OBJECT_SHADOW)}>
      <div className={cn('flex items-end gap-[4%] rounded-md p-[4%]', HOLLOW, WELL)}>
        {Array.from({ length: 3 }, (_, i) => (
          <Standing
            key={cards[i]?.id ?? `slot-${i}`}
            card={cards[i] ?? null}
            eager={eager && i === 0}
            className="w-1/3"
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ export */

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

  return <div className={cn('flex w-full items-end justify-center', className)}>{form}</div>;
}

export const ContainerObject = memo(ContainerObjectBase);

export default ContainerObject;
