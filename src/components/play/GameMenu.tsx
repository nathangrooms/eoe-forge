/**
 * The game menu, in the board's right-hand rail.
 *
 * Owner: *"Maybe there is a card scale slider for board and hand in the right
 * hand menu or something?"*
 *
 * Two sliders, because they are two different jobs: the board is a thing you
 * scan and the hand is a thing you read, so they do not want the same size.
 * Both reuse `CardSizeSlider`, which already persists per surface, and both are
 * *ceilings* — the board and the hand each shrink below the chosen size when
 * the cards would otherwise run off the edge.
 *
 * It lives in the same rail as the preview and is built from the same mat
 * material, so opening it moves the table over rather than covering it.
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CardSizeSlider,
  CARD_WIDTH_MAX,
  CARD_WIDTH_MIN,
} from '@/components/cards/CardSizeSlider';
import type { SeatingVariant } from '@/lib/game';
import { MatStylePicker } from './MatStylePicker';

export interface GameMenuProps {
  boardCardWidth: number;
  onBoardCardWidth: (width: number) => void;
  handCardWidth: number;
  onHandCardWidth: (width: number) => void;
  autoAdvance: boolean;
  onToggleAuto: () => void;
  botsPaused: boolean;
  onToggleBots: () => void;
  freeCast: boolean;
  onToggleFreeCast: () => void;
  /** Seating arrangements this pod size offers, so quads can be swapped back. */
  variant: SeatingVariant;
  variants: readonly SeatingVariant[];
  onVariant: (variant: SeatingVariant) => void;
  /** Shuffle back and draw one fewer. Lives here now the hand list is gone. */
  onMulligan: () => void;
  onLeave: () => void;
  onClose: () => void;
  className?: string;
  /**
   * The viewer's colour identity, so the playmat previews are tinted the way
   * their own seat will be. Optional: without it the previews are plain
   * charcoal, which still shows the texture honestly.
   */
  viewerColors?: readonly string[] | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="w-full">
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h4>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** A setting that is on or off. Surface tint when armed; no outline, ever. */
function MenuToggle({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-foreground text-background'
          : 'bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12]'
      )}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className={cn('text-[10px] uppercase tracking-wide', active ? 'opacity-80' : 'text-muted-foreground')}>
        {active ? 'On' : 'Off'}
      </span>
    </button>
  );
}

export function GameMenu({
  boardCardWidth,
  onBoardCardWidth,
  handCardWidth,
  onHandCardWidth,
  autoAdvance,
  onToggleAuto,
  botsPaused,
  onToggleBots,
  freeCast,
  onToggleFreeCast,
  variant,
  variants,
  onVariant,
  onMulligan,
  onLeave,
  onClose,
  viewerColors,
  className,
}: GameMenuProps) {
  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Game menu
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close the menu"
          aria-label="Close the menu"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4">
        <Section title="Card size">
          <div className="rounded-lg bg-foreground/[0.05] p-3">
            <p className="text-xs font-medium text-foreground">Board</p>
            <p className="mb-2 text-[10px] leading-tight text-muted-foreground">
              A ceiling. A crowded row shrinks below it rather than running off the mat.
            </p>
            <CardSizeSlider
              storageKey="play-board"
              value={boardCardWidth}
              onValueChange={onBoardCardWidth}
              min={CARD_WIDTH_MIN}
              max={CARD_WIDTH_MAX}
            />
          </div>

          <div className="rounded-lg bg-foreground/[0.05] p-3">
            <p className="text-xs font-medium text-foreground">Hand</p>
            <p className="mb-2 text-[10px] leading-tight text-muted-foreground">
              The hand is the biggest thing on the table. This is how big.
            </p>
            <CardSizeSlider
              storageKey="play-hand"
              value={handCardWidth}
              onValueChange={onHandCardWidth}
              min={CARD_WIDTH_MIN}
              max={CARD_WIDTH_MAX}
            />
          </div>
        </Section>

        <Section title="Playmat">
          {/* The surface, chosen rather than assigned. Every mat on the board
              follows this, and it is remembered between games. */}
          <MatStylePicker colors={viewerColors} />
        </Section>

        <Section title="Table">
          <MenuToggle
            label="Auto-advance steps"
            hint="Walk through every step that holds no decision"
            active={autoAdvance}
            onClick={onToggleAuto}
          />
          <MenuToggle
            label="Pause opponents"
            hint="Stop the bots without tearing the table down"
            active={botsPaused}
            onClick={onToggleBots}
          />
          <MenuToggle
            label="Free cast"
            hint="Goldfishing. Ignore mana entirely"
            active={freeCast}
            onClick={onToggleFreeCast}
          />
          {/*
            Redraw is a PLAYTEST tool, not the mulligan.

            The mulligan is a rule and it now has a rule's home: the opening
            hand, on the mat, before the first untap, where the game waits for
            an answer. Owner: *"No way to mulligan the first hand"* — which was
            true precisely because the only way in was this button, three
            presses deep behind a slider icon with nothing on the table saying
            a decision was owed.

            What is left here is the goldfishing escape hatch: shuffle back and
            draw a fresh seven at any point, so a playtester can look at another
            opening without dealing a new table. It says so, rather than
            claiming to be a mulligan.
          */}
          <button
            type="button"
            onClick={onMulligan}
            title="Playtest tool: shuffle your hand back and draw a fresh seven"
            className="w-full rounded-lg bg-foreground/[0.07] px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Redraw your hand
          </button>
        </Section>

        {variants.length > 1 && (
          <Section title="Seating">
            <div className="flex flex-wrap gap-1">
              {variants.map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onVariant(option)}
                  aria-pressed={variant === option}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors',
                    variant === option
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.07] text-muted-foreground hover:text-foreground'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </Section>
        )}

        <button
          type="button"
          onClick={onLeave}
          className="mt-auto w-full rounded-lg bg-foreground/[0.07] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Leave the table
        </button>
      </div>
    </div>
  );
}

export default GameMenu;
