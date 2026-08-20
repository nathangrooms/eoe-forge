import { useRef } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { CardImage, PrintingPicker } from '@/components/cards';
import { describePrinting } from '@/lib/cards/printings';
import type { RowArtState } from './useProxyArt';

/**
 * Every version of one card, to pick the one that gets printed.
 *
 * A right-hand slide-over, never a centred dialog: the list you are choosing
 * for stays on screen behind it and keeps its scroll position, which is the
 * owner's standing rule for an action taken without leaving the page.
 *
 * WHY IT IS ONE COMPONENT
 * -----------------------
 * The paste review screen already had this exact panel written inline, and the
 * proxy list needed the same thing for rows that are already saved. Two copies
 * of a printing shelf is how this product ends up with two shelves that
 * disagree, so there is one, and the only difference between the callers is
 * whether picking writes to the database. That difference is `saveState`.
 *
 * The shelf itself is `PrintingPicker`, the same one the card page and a
 * collection row use. Nothing about the art is touched on the way through: no
 * blur, no grey, no crop. Scryfall's terms require that and this project has
 * broken them twice.
 */
export interface ChangeArtPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card being changed, in the player's words. */
  cardName: string;
  /** Every printing shares one of these. Without it only `current` can show. */
  oracleId?: string | null;
  /** The printing chosen right now. Drawn immediately, ticked in the shelf. */
  current?: any;
  /** One line saying what picking one does. */
  note?: string;
  onPick: (printing: any) => void;
  /** Shut the panel the moment something is picked. */
  closeOnPick?: boolean;
  /**
   * How the save for THIS card is going. Omit where picking saves nothing, as
   * on the paste review screen, and the panel says nothing about saving.
   */
  saveState?: RowArtState | null;
  /** What went wrong, when `saveState` is 'error'. */
  problem?: string | null;
}

export function ChangeArtPanel({
  open,
  onOpenChange,
  cardName,
  oracleId,
  current,
  note,
  onPick,
  closeOnPick = false,
  saveState = null,
  problem = null,
}: ChangeArtPanelProps) {
  /*
   * The version that was on the list when this card's panel opened.
   *
   * TWO THINGS DEPEND ON HOLDING IT STILL.
   *
   * `PrintingPicker` re-reads every printing of the card whenever this prop
   * changes IDENTITY, and the caller hands it a brand new object after every
   * pick, and again when the list reloads after the write. Measured on 20 Aug
   * 2026 against the live catalogue: changing the art on four cards fetched
   * `cards` thirteen times, and Forest alone is 400 rows carrying image urls,
   * faces, prices and legalities each time. The prop is documented as the thing
   * to draw BEFORE the shelf arrives, so the first value is the only one it was
   * ever for. `selectedId` below is a string and still moves, which is what
   * draws the tick.
   *
   * The block below is deliberately NOT frozen: it shows whatever prints right
   * now, so a pick moves it, and the save line above it says whether that has
   * been kept yet.
   */
  const opened = useRef<{ key: string; printing: any } | null>(null);
  const key = String(oracleId ?? cardName);
  if (!opened.current || opened.current.key !== key) opened.current = { key, printing: current };
  const firstSeen = opened.current.printing ?? current;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetTitle className="sr-only">Choose which version of {cardName} to print</SheetTitle>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{cardName}</h2>
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
            {saveState && <SaveLine state={saveState} problem={problem} />}
          </div>

          {/*
            WHICH ONE IS ON THE LIST, SHOWN AND NOT ONLY TICKED.

            The shelf below asks the catalogue for the newest 400 printings and
            no more. A basic land has far more than that: Forest has 792 on
            20 Aug 2026. So a Forest sitting on the cheapest printing, which is
            an old one, is not on the shelf at all, nothing carries a tick, and
            the panel read as though the card had no version chosen. Measured on
            the page: 400 tiles, 0 ticked.

            This is the card itself, at the size a card is looked at, because
            the whole question here is which picture prints.
          */}
          {current && (
            <div className="flex items-center gap-4 rounded-xl bg-muted/20 p-3">
              <div className="w-[110px] shrink-0">
                <CardImage card={current} width={110} fill quality="normal" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  On your list now
                </p>
                <p className="truncate text-sm text-foreground">{describePrinting(current)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This is the picture that prints until you pick another one.
                </p>
              </div>
            </div>
          )}

          <PrintingPicker
            bare
            oracleId={oracleId ?? undefined}
            current={firstSeen}
            selectedId={current?.id ?? null}
            initial={0}
            heading="Every version we hold"
            note={null}
            onSelect={printing => {
              onPick(printing);
              if (closeOnPick) onOpenChange(false);
            }}
          />

          {!closeOnPick && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The saving state, next to the thing that caused it.
 *
 * This is the whole point of the panel staying open after a pick. The card
 * behind it has already changed; without this line the only evidence the
 * choice was kept is that the picture moved, and the deck optimiser proved
 * that reads as nothing having happened.
 */
function SaveLine({ state, problem }: { state: RowArtState; problem: string | null }) {
  if (state === 'error') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {problem ?? 'That did not save. Check your connection and try again.'}
      </p>
    );
  }

  if (state === 'saved') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Saved to your list.
      </p>
    );
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
      Saving your choice.
    </p>
  );
}

export default ChangeArtPanel;
