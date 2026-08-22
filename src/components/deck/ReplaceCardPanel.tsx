import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CardImage } from '@/components/cards';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { cardImage, type DeckCardRow } from '@/lib/deck/deckCards';
import { ManaCost } from '@/components/ui/mana-cost';

/**
 * Swap one card for another, without leaving the deck.
 *
 * ## Why a slide-over and not a tab
 *
 * Replacing used to set `cardToReplace`, jump you to a different tab, and draw
 * a banner up there explaining what you were in the middle of. You were then
 * choosing a replacement with the deck it is going into off screen, which is
 * the one thing you are comparing against. A right-hand panel keeps the deck
 * behind it, keeps its scroll position, and closes back to exactly where you
 * were. Never a centred dialog, which would cover the deck the same way the
 * tab switch did.
 *
 * Adding a card stays a tab, because browsing 34,000 cards wants the width.
 *
 * ## Body picks, eye opens
 *
 * `mode="pick"` throughout. Halfway through a swap, a click that navigated to
 * the card page would abandon the swap with the old card still in the deck.
 * Same rule as the storage picker, written the same way on purpose.
 */
export interface ReplaceCardPanelProps {
  /** The card being replaced. `null` closes the panel. */
  row: DeckCardRow | null;
  onOpenChange: (open: boolean) => void;
  /** Return true when the swap was accepted, so the panel can close itself. */
  onReplace: (row: DeckCardRow, card: unknown) => Promise<boolean>;
  /** Named so the panel can say what the colour identity is bounded by. */
  commanderName?: string;
}

export function ReplaceCardPanel({
  row,
  onOpenChange,
  onReplace,
  commanderName,
}: ReplaceCardPanelProps) {
  const name = row ? row.card?.name || row.card_name : '';

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetTitle className="sr-only">Replace {name}</SheetTitle>
        {row && (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-24 shrink-0">
                <CardImage
                  card={{
                    ...(row.card ?? {}),
                    id: row.card_id,
                    name,
                    image_uris: row.card?.image_uris ?? undefined,
                    image_url: cardImage(row, 'normal') ?? undefined,
                  }}
                  width={96}
                  fill
                  interactive={false}
                  title={name}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Replacing
                </p>
                <h2 className="text-lg font-semibold">{name}</h2>
                {row.card?.mana_cost ? (
                  <ManaCost cost={row.card.mana_cost} size="sm" className="mt-1" />
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  Pick a card below and it takes this one&rsquo;s place. The replacement goes in
                  before this comes out, so a refusal leaves the deck exactly as it is.
                </p>
                {commanderName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inside the colour identity of {commanderName}.
                  </p>
                )}
              </div>
            </div>

            <EnhancedUniversalCardSearch
              mode="pick"
              onCardAdd={async card => {
                const done = await onReplace(row, card);
                if (done) onOpenChange(false);
              }}
              placeholder={`Search for a replacement for ${name}`}
              showFilters
              showAddButton
              showWishlistButton={false}
              showViewModes
              sizeKey="dm.card-size.deck-replace"
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default ReplaceCardPanel;
