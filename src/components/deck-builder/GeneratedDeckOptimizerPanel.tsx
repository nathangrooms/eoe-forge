import { useMemo } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { AIOptimizerPanel, type OptimizerDeckCard } from './AIOptimizerPanel';
import type { DeckPower } from '@/lib/deck/power';

/**
 * Improve the deck you just generated, without leaving the page.
 *
 * Design law item 3: an action taken *without leaving the current context* is a
 * right-hand slide-out, never a centred dialog. The finished deck stays on
 * screen behind it, so a player can read a suggested swap against the list it
 * would change.
 *
 * WHY THIS IS A PANEL AND NOT A ROUTE
 * -----------------------------------
 * The generated deck does not exist in the database yet. Sending the player to
 * `/deck/:id` to optimise it would mean saving first, which is exactly the
 * decision they have not made — and it would throw away the reason to optimise
 * at all, which is to decide whether this list is worth keeping.
 *
 * WHAT IS CARRIED RATHER THAN RECOMPUTED
 * --------------------------------------
 * `power` is the evaluation the result screen already ran through
 * `computeDeckPower`, handed straight to the optimiser. The optimiser briefs
 * the model with that score and reasons about cuts from the same evaluation, so
 * the number on the page behind this panel and the number the advice is built
 * on are one object, not two computations that happen to agree today.
 *
 * The cards carry `oracle_text`, `color_identity`, `image_uris` and `prices`
 * because the optimiser's castability readout and its card art both need them.
 * They arrive that way from the generator now; before this session the edge
 * function did not select `image_uris` at all, so the same handoff would have
 * produced a panel of grey rectangles.
 */

export interface GeneratedDeckOptimizerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckName: string;
  /** The generated 99, in the shape the optimiser reads. */
  cards: OptimizerDeckCard[];
  commander?: (OptimizerDeckCard & { name: string }) | null;
  /** The evaluation the result screen already ran. Never recomputed here. */
  power: DeckPower | null;
  /** Apply a set of swaps to the unsaved list. */
  onApplyReplacements: (
    replacements: Array<{ remove: string; add: string; addCardId?: string | null; addCard?: any }>
  ) => void;
  onAddCard?: (cardName: string) => void;
  onRemoveCard?: (cardName: string) => void;
}

export function GeneratedDeckOptimizerPanel({
  open,
  onOpenChange,
  deckName,
  cards,
  commander,
  power,
  onApplyReplacements,
  onAddCard,
  onRemoveCard,
}: GeneratedDeckOptimizerPanelProps) {
  /*
   * Mounted only while open.
   *
   * The optimiser solves deck-wide castability on mount, and doing that behind
   * a closed panel would spend the work on every generated deck whether or not
   * anyone asked for advice.
   */
  const body = useMemo(
    () =>
      open ? (
        <AIOptimizerPanel
          // The deck has not been saved, so it has no id. The edge function
          // reads the decklist, the commander and the score out of
          // `deckContext` and never the id, so an empty one costs nothing and
          // inventing one would be a lie about a row that does not exist.
          deckId=""
          deckName={deckName}
          deckCards={cards}
          format="commander"
          commander={commander ?? undefined}
          power={power}
          onApplyReplacements={onApplyReplacements}
          onAddCard={onAddCard}
          onRemoveCard={onRemoveCard}
        />
      ) : null,
    [open, deckName, cards, commander, power, onApplyReplacements, onAddCard, onRemoveCard]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The panel's own copy is the description; without this Radix logs a
        // missing-`aria-describedby` warning on every open.
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-3xl"
      >
        {/* pr-12 clears the Sheet's own absolutely-placed close button. */}
        <div className="shrink-0 px-5 pb-3 pr-12 pt-5">
          <SheetTitle className="text-base font-semibold">Improve this deck</SheetTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Suggestions for {deckName}, from the same reading of the deck as the score behind
            this panel. Nothing changes until you apply it.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
