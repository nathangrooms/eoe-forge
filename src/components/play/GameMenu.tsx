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

import { useState } from 'react';
import { Flag, X } from 'lucide-react';
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
  /**
   * How many seats are played by the engine.
   *
   * ---------------------------------------------------------------------------
   * "PAUSE OPPONENTS" WAS DRAWN IN GOLDFISH, WHERE THERE ARE NO OPPONENTS
   * ---------------------------------------------------------------------------
   * Goldfish is one seat. `playModes.ts` says so in the words on the door:
   * *"1 seat. Nothing blocks and nothing attacks back."* The toggle was drawn
   * there anyway, promising to *"stop the bots without tearing the table down"*,
   * and pressing it changed nothing because there was nothing to stop.
   *
   * The owner's report was that the settings *"dont seem right"*. A control that
   * is present, pressable, and incapable of doing what its own hint says is
   * exactly that, and it is worse than a missing one: the player presses it,
   * sees no change, and learns not to trust the menu. So it is drawn only when
   * there is a bot to pause.
   */
  botCount?: number;
  freeCast: boolean;
  onToggleFreeCast: () => void;
  /** Seating arrangements this pod size offers, so quads can be swapped back. */
  variant: SeatingVariant;
  variants: readonly SeatingVariant[];
  onVariant: (variant: SeatingVariant) => void;
  /** Shuffle back and draw one fewer. Lives here now the hand list is gone. */
  onMulligan: () => void;
  /**
   * Give the game up. CR 104.3a, and the one legal move a player can always make.
   *
   * ---------------------------------------------------------------------------
   * IT DID NOT EXIST, AND THAT IS THE SHAPE THIS PROJECT KEEPS HITTING
   * ---------------------------------------------------------------------------
   * `CONCEDE` is a real reducer case (`rules.ts`), a real loss reason checked
   * first in `sba.ts`, and something cards themselves build
   * (`abilities/to-actions.ts`). Measured on 28 Aug 2026 by grepping every
   * `.ts`/`.tsx` under `src/components/play`, `src/pages` and
   * `src/components/lobby` for a `'CONCEDE'` string literal: ONE file matched,
   * and it was `src/pages/LifeCounter.tsx` — the phone-on-the-table counter, a
   * different surface. Nothing on the play table built one, ever.
   *
   * "Leave the table" is not this. It tears the table down locally and tells
   * the other seats nothing; conceding is a move IN the game that the rules
   * answer, that state-based actions pick up, and that hands the win to
   * somebody. On a networked table those are not close to the same thing.
   */
  onConcede: () => void;
  /** False once this seat has already conceded or the game is over. */
  canConcede?: boolean;
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
  botCount = 0,
  freeCast,
  onToggleFreeCast,
  variant,
  variants,
  onVariant,
  onMulligan,
  onConcede,
  canConcede = true,
  onLeave,
  onClose,
  viewerColors,
  className,
}: GameMenuProps) {
  /*
   * Confirmed in place, never in a centred dialog.
   *
   * CLAUDE.md section 12.3: *"I dont want any modal popups at all"*, and for a
   * confirmation: *"the destructive control swaps to Confirm/Cancel"*. So the
   * button becomes the question. It also resets itself whenever the menu is
   * closed, because this component unmounts with the rail.
   */
  const [confirmingConcede, setConfirmingConcede] = useState(false);

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
        {/*
          ORDER IS BY HOW OFTEN A SETTING IS TOUCHED, and it was not.

          Measured on 29 Aug 2026 at 1600x1000 with the menu open
          (`scripts/playtest/menu-reach.mjs`): the sections ran Card size,
          Playmat, Table, Seating, Give up, and the playmat picker is sixteen
          texture swatches roughly 700px tall. So `Free cast` sat at 973px and
          `Redraw your hand` at 1013px on a 1000px-tall window — off the bottom
          of the screen — behind a preference a player sets once and never
          touches again, while `Give up` is pinned to the bottom and reads as
          the end of the list.

          The owner said the settings are wrong. This is the shape of it: what
          you change DURING a game is now first, what you set once is last.
        */}
        <Section title="Table">
          <MenuToggle
            label="Auto-advance steps"
            hint="Walk through every step that holds no decision"
            active={autoAdvance}
            onClick={onToggleAuto}
          />
          {botCount > 0 && (
            <MenuToggle
              label={botCount === 1 ? 'Pause the opponent' : 'Pause opponents'}
              hint="Stop the bots without tearing the table down"
              active={botsPaused}
              onClick={onToggleBots}
            />
          )}
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
              follows this, and it is remembered between games.

              No link out to the playmat library from here, deliberately. This
              menu renders inside a running game, and following a route change
              unmounts the board and loses it. */}
          <MatStylePicker colors={viewerColors} />
          <p className="px-0.5 text-[10px] leading-tight text-muted-foreground">
            Your own pictures live on the playmat page, before a game starts.
          </p>
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

      </div>

      {/*
        PINNED, not scrolled.

        The first screenshot of this menu had Concede below the fold: the
        playmat picker is a sixteen-tile grid and it pushed both the way out of
        a game and the way to lose one off the bottom of a 1000px window. A
        control a player cannot find is the same as a control that does not
        exist, which is the whole defect this section was added to close. So the
        two ways out sit in a footer the scroll never moves.
      */}
      <div className="flex shrink-0 flex-col gap-2 px-3 pb-3 pt-2">
        {/* Giving the game up, and walking away from it. Two different things,
            so they are two controls and the words say which is which. */}
        <Section title="Give up">
          {confirmingConcede ? (
            <div className="rounded-lg bg-foreground/[0.05] p-3">
              <p className="text-xs font-medium text-foreground">Concede this game?</p>
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                You lose straight away and the game carries on without you.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingConcede(false);
                    onConcede();
                  }}
                  className="flex-1 rounded-md bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Concede
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingConcede(false)}
                  className="flex-1 rounded-md bg-foreground/[0.07] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Keep playing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canConcede}
              onClick={() => setConfirmingConcede(true)}
              title="Concede: you lose this game and the others play on"
              className="flex w-full items-center gap-2 rounded-lg bg-foreground/[0.07] px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.12] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Flag className="h-3.5 w-3.5" />
              Concede the game
            </button>
          )}
        </Section>

        <button
          type="button"
          onClick={onLeave}
          title="Close the table on this device. It is not a concession."
          className="w-full rounded-lg bg-foreground/[0.07] px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Leave the table
        </button>
      </div>
    </div>
  );
}

export default GameMenu;
