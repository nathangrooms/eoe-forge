import type { ReactNode } from 'react';
import { CardImage } from '@/components/cards';
import { ManaCost } from '@/components/ui/mana-cost';
import { cn } from '@/lib/utils';
import { scryfallImageUrl } from '@/lib/deck/deckCards';

/**
 * One card, drawn as a card.
 *
 * ## Why this exists
 *
 * Every tab on the deck page had something to say about specific cards and only
 * one of them showed you the card. The Legality tab named a banned card in a
 * sentence. The Value tab drew its missing cards at 64px, which is a thumbnail
 * of a thumbnail. The Analysis tab printed `cardA` and `cardB` of a synergy
 * pair as two runs of text. The EDH tab printed "3 game changers" with no names
 * at all. Owner: *"visual is always better"*, *"always show the full card
 * image"*.
 *
 * The reason it kept happening is that there was nowhere to reach for. The
 * decklist has `DeckCardGrid`, but that takes a `DeckCardRow` — a row of
 * `deck_cards` with a database id — and none of these are that. A legality
 * offender is a store card, a game changer is a name out of a catalogue, a
 * recommendation is a `cards` row that is not in the deck yet. So each panel
 * wrote its own `<img>` or, more often, gave up and wrote the name.
 *
 * This takes the loosest shape any of them can produce and draws the same tile.
 *
 * ## The rules it keeps, so nobody has to remember them
 *
 * The image goes through `CardImage`, so it is the whole card at the real
 * 63×88mm ratio, at the resolution the rendered width deserves, with the flip
 * affordance on a double-faced card. It is never cropped, never blurred, never
 * desaturated and never colour-shifted: Scryfall's terms forbid it and this
 * project has broken them twice. If a tile wants to say a card is a problem, it
 * says so in `caption` or in `badge`, not by dimming the art.
 *
 * ## Naming a card we have no row for
 *
 * `TileCard.name` is the only required field. A card named by
 * `src/engine/power/catalogs.ts` has a name and nothing else, and a tile with no
 * art is still the right shape — `CardImage` draws its own placeholder and the
 * name is under it either way. Pass `id` when you have the printing id even
 * without `image_uris`: Scryfall serves art at a path derived from it, which is
 * what `scryfallImageUrl` builds.
 */

export interface TileCard {
  name: string;
  /** Printing id. Enough on its own for art — see `scryfallImageUrl`. */
  id?: string | null;
  image_uris?: Record<string, string> | null;
  mana_cost?: string | null;
  type_line?: string | null;
  /** Carried straight through so `CardImage` can find a back face. */
  faces?: unknown;
  card_faces?: unknown;
  layout?: string | null;
}

export interface DeckCardTileProps {
  card: TileCard;
  /** Rendered width in px. Drives the Scryfall resolution as well as the box. */
  width?: number;
  onClick?: () => void;
  /** One line under the name. The figure or the reason this card is here. */
  caption?: ReactNode;
  /** A second line under the caption, for a longer explanation. */
  detail?: ReactNode;
  /** Drawn over the art, top left. Copies, a rank, a price. */
  badge?: ReactNode;
  /** Controls under the tile. Remove, replace, add to a list. */
  actions?: ReactNode;
  /** Draws the mana cost beside the name when the card carries one. */
  showManaCost?: boolean;
  eager?: boolean;
  className?: string;
}

export function DeckCardTile({
  card,
  width,
  onClick,
  caption,
  detail,
  badge,
  actions,
  showManaCost = true,
  eager = false,
  className,
}: DeckCardTileProps) {
  /* `image_url` is `CardImage`'s last fallback, and building it from the
     printing id is how a card that is only a name in a catalogue still gets
     its art once we have matched it to a row. */
  const forImage = {
    ...card,
    image_uris: card.image_uris ?? undefined,
    image_url: card.image_uris ? undefined : (scryfallImageUrl(card.id, 'normal') ?? undefined),
  };

  return (
    <div className={cn('group min-w-0', className)}>
      <CardImage
        card={forImage}
        size="lg"
        width={width}
        fill
        eager={eager}
        onClick={onClick}
        title={card.name}
      >
        {badge}
      </CardImage>

      {/* 13px, the same caption size the decklist settled on. The one place a
          player reads a card name at a glance, and the 10px it used to be was
          unreadable at arm's length. */}
      <div className="mt-2 flex items-start justify-between gap-1.5">
        <span className="line-clamp-2 text-sm font-medium leading-tight">{card.name}</span>
        {showManaCost && card.mana_cost ? (
          <ManaCost cost={card.mana_cost} size="sm" className="shrink-0" />
        ) : null}
      </div>

      {caption && <div className="mt-0.5 text-xs text-muted-foreground">{caption}</div>}
      {detail && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</div>}
      {actions && <div className="mt-2 flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/**
 * A badge that sits on the art.
 *
 * Card art is somebody else's picture and the theme tokens are not readable
 * against all of it, so anything drawn over a card carries its own dark ground.
 * That decision was already made once in `DeckCardGrid`; this is it, in a shape
 * the other tabs can use, so the fourth panel to want a pill over a card does
 * not pick a token that vanishes on a white border.
 */
export function TileBadge({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'absolute top-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white',
        align === 'left' ? 'left-1.5' : 'right-1.5',
        className
      )}
    >
      {children}
    </span>
  );
}

export default DeckCardTile;
