/**
 * The surface you play on and the shuffle, without leaving the setup screen.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE TWO CAME OFF THE PAGE
 * ---------------------------------------------------------------------------
 * Owner, 29 Aug 2026, on the load-in: *"its super confusing"*.
 *
 * Measured on the last step of versus bots at 1600 x 1000 before this existed:
 * the page ran 1,645px in a 1,000px window, and 750px of it was the playmat
 * catalogue. Fourteen texture tiles, eight colour buttons and an upload link,
 * stacked between the reader and the game. On a 390px phone the same screen ran
 * 3,216px in an 844px window and the playmat began at y=1,751, more than two
 * screens below the seats.
 *
 * A playmat is a preference that lasts for every game you will ever play here.
 * It is not a decision about THIS game, and it was sitting in the middle of the
 * one screen that is entirely about this game. So it is one press away instead
 * of scrolled past, in the right-hand slide-out the owner already approves for
 * an action taken without leaving the page.
 *
 * It is deliberately still VISIBLE from the setup screen, as a live preview of
 * the mat you will actually get, because the owner has asked once already:
 * *"I dont see the themed playmats?"* Hiding it entirely would earn that
 * question again. `SeatStep` draws that preview and opens this.
 *
 * Nothing here is a second copy. `MatStylePicker` is the same component the in
 * game menu and `/play/mats` use, reading and writing the same account
 * preference, so a mat chosen in any of the three is the mat in the other two.
 */

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { MatStylePicker } from './MatStylePicker';

export interface TableSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chosen deck's colours, so the previews show the mat this seat gets. */
  colors?: readonly string[] | null;
  seed: number;
  onSeed: (next: number) => void;
}

export function TableSettingsPanel({
  open,
  onOpenChange,
  colors,
  seed,
  onSeed,
}: TableSettingsPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetTitle className="sr-only">Table settings</SheetTitle>

        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Table settings</h2>
            <p className="text-sm text-muted-foreground">
              Your surface and your shuffle. Both are saved, so the next game starts the way
              this one did.
            </p>
          </div>

          <div>
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Playmat
            </h3>
            <MatStylePicker className="mt-3" colors={colors} showManageLink />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Drawn rather than photographed, so it stays sharp on any screen. Saved to your
              account, so it is the same on every device.
            </p>
          </div>

          <div>
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Shuffle seed
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground">
                {seed}
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() => onSeed(Math.floor(Math.random() * 100000) + 1)}
              >
                New seed
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              The shuffle is seeded, so the same seed and the same decks deal the same game.
              That is what makes a bad draw reproducible instead of anecdotal.
            </p>
          </div>

          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
