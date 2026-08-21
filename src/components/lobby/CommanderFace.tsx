import { CardImage, type CardImageSize } from '@/components/cards';
import type { LobbyCommander } from '@/lib/lobby';

/**
 * What somebody brought, shown as the card itself.
 *
 * The owner's rule: card art wherever a card is referenced, never a coloured
 * dot where art is available. A seat at a table IS a commander to everyone
 * looking at it, so the lobby draws the commander rather than writing its name
 * in grey.
 *
 * The art comes through `CardImage` like every other card in the product. It
 * right-sizes the Scryfall asset per rendered size, and it never crops, which
 * is the reason nothing here rolls its own `<img>`.
 *
 * A commander travels on the seat as a `CardIdentity`, which is camel case and
 * carries `imageUrl`. `getBestCardImage` reads `image_url` as its last
 * fallback, so the shape is adapted here in one place rather than at four call
 * sites.
 */

function toCardShape(commander: LobbyCommander) {
  return {
    id: commander.cardId,
    name: commander.name,
    image_url: commander.imageUrl,
    type_line: commander.typeLine,
    color_identity: commander.colorIdentity,
  };
}

export interface CommanderFaceProps {
  commanders: LobbyCommander[];
  size?: CardImageSize;
  /** What to draw when the seat has not chosen a deck yet. */
  emptyLabel?: string;
}

export function CommanderFace({
  commanders,
  size = 'md',
  emptyLabel = 'No deck yet',
}: CommanderFaceProps) {
  if (commanders.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-muted/40 text-[11px] text-muted-foreground"
        style={{ width: WIDTHS[size], aspectRatio: '488 / 680' }}
      >
        {emptyLabel}
      </div>
    );
  }

  // Partner commanders are two real cards and both are face up on a real table.
  return (
    <div className="flex items-end gap-2">
      {commanders.slice(0, 2).map((commander, index) => (
        <CardImage
          key={`${commander.cardId}-${index}`}
          card={toCardShape(commander)}
          size={size}
          title={commander.name}
        />
      ))}
    </div>
  );
}

/** Kept in step with CARD_IMAGE_SIZES, for the placeholder only. */
const WIDTHS: Record<CardImageSize, number> = {
  xs: 48,
  sm: 110,
  md: 180,
  lg: 250,
  xl: 340,
};
