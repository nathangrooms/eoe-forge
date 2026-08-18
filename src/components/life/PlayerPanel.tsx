/**
 * DeckMatrix — life counter: one player's panel.
 *
 * Judged as a Commander player with the phone flat in the middle of the table:
 * the life total has to be readable at arm's length and the wrong number must be
 * hard to hit. That drives every decision here.
 *
 *   - The panel is rotated to face its player (`seating.ts` owns the geometry),
 *     so "upper half" always means upper half *from where that player is sitting*.
 *   - Type scales in container-query units, not viewport units. A four-player
 *     pinwheel gives each seat a quarter of the screen; a two-player game gives
 *     each half. The same panel has to fill both, so it sizes off its own box.
 *   - Every tap lands in a pending buffer and shows as a running delta before it
 *     commits. A mis-tap is visible and reversible for over a second, which is
 *     what actually makes mis-taps harmless.
 *   - The panel sits on its seat's colour mat rather than on flat charcoal.
 *     Four identical dark rectangles are genuinely hard to tell apart across a
 *     table; four mats are not. The mat is scenery underneath everything — every
 *     tap target above it is unchanged, and the mat's own centre pool is what
 *     keeps a white life total readable on top of the art.
 */

import { useState } from 'react';
import { Biohazard, Crown, Minus, Plus, Skull, Sparkles, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  lossReasonLabel,
  seatBoxStyle,
  seatContentStyle,
  type FormatRules,
  type Player,
  type Seat,
} from '@/lib/game';

import { MatSurface } from './MatSurface';
import type { MatColor } from './mats';
import { useHoldRepeat } from './useHoldRepeat';
import { haptic } from './useImmersive';
import { COUNTER_ENERGY, COUNTER_EXPERIENCE } from './counters';
import type { PlayerView } from './useLifeGame';

/** Travel before a press is treated as a swipe rather than a tap. */
const SWIPE_PX = 56;

/* -------------------------------------------------------------------------- */
/* Corner placement                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Corners of the panel's content box, clockwise from its own top-left. "Own"
 * matters: a rotated seat's top-left is not the screen's top-left.
 */
type Corner = 0 | 1 | 2 | 3;

/**
 * Which content corner lands furthest from the middle of the board.
 *
 * The control cluster sits dead centre, which is the one point every seat can
 * reach — and in the three-player layout it is also where two panels meet, so a
 * chip pinned to a fixed corner ends up underneath it. Rotating the content by
 * `r` degrees clockwise moves corner `i` to visual corner `i + r/90`, so the
 * placement can just be solved rather than special-cased per layout.
 */
function outerCorner(seat: Seat): Corner {
  const { x, y, w, h } = seat.rect;
  const visual = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  let best = 0;
  let bestDistance = -1;
  visual.forEach((point, index) => {
    const distance = Math.hypot(point.x - 0.5, point.y - 0.5);
    if (distance > bestDistance + 1e-6) {
      bestDistance = distance;
      best = index;
    }
  });

  const turns = seat.rotation / 90;
  return ((((best - turns) % 4) + 4) % 4) as Corner;
}

/** The other end of the same content edge — never the inner corner. */
const ALONG_EDGE: Record<Corner, Corner> = { 0: 1, 1: 0, 2: 3, 3: 2 };

const CORNER_POSITION: Record<Corner, string> = {
  0: 'left-0 top-0 rounded-tl-2xl rounded-br-xl',
  1: 'right-0 top-0 rounded-tr-2xl rounded-bl-xl',
  2: 'right-0 bottom-0 rounded-br-2xl rounded-tl-xl',
  3: 'left-0 bottom-0 rounded-bl-2xl rounded-tr-xl',
};

const CORNER_ALIGN: Record<Corner, string> = {
  0: 'left-0 top-0 justify-start',
  1: 'right-0 top-0 justify-end',
  2: 'right-0 bottom-0 justify-end',
  3: 'left-0 bottom-0 justify-start',
};

export interface PlayerPanelProps {
  player: Player;
  seat: Seat;
  view: PlayerView;
  rules: FormatRules;
  /** The seat's colour, chosen at setup. Decides the mat under this panel. */
  mat: MatColor;
  /** `art_crop` for that colour, if the lookup found one. Optional by design. */
  matArt?: string | null;
  /** False once the game is complete — the reducer rejects further changes. */
  interactive: boolean;
  onNudgeLife: (delta: number) => void;
  onOpenDetail: () => void;
  reducedMotion: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tap halves                                                                 */
/* -------------------------------------------------------------------------- */

interface TapHalfProps {
  direction: 1 | -1;
  label: string;
  disabled: boolean;
  glyphSize: string;
  onStep: (delta: number) => void;
  onSwipe: () => void;
  reducedMotion: boolean;
}

function TapHalf({ direction, label, disabled, glyphSize, onStep, onSwipe, reducedMotion }: TapHalfProps) {
  const [pressed, setPressed] = useState(false);

  const handlers = useHoldRepeat({
    enabled: !disabled,
    swipePx: SWIPE_PX,
    onStep: () => {
      onStep(direction);
      haptic(6);
    },
    // The first step already fired on pointer-down; a gesture that turns out to
    // be a swipe has to hand those points back.
    onCancelSteps: steps => onStep(-direction * steps),
    onSwipe: () => {
      setPressed(false);
      haptic(14);
      onSwipe();
    },
  });

  const Glyph = direction === 1 ? Plus : Minus;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        'absolute inset-x-0 h-1/2 flex items-start justify-center outline-none',
        'transition-colors duration-100 focus-visible:bg-foreground/[0.09]',
        direction === 1 ? 'top-0' : 'bottom-0 items-end',
        // The plus half sits a shade lighter. Two tones make the split visible
        // at a glance — the whole defence against a mis-tap — and lighter for
        // "more" is the reading that needs no explaining. Done with a surface
        // tint, not a border.
        pressed ? 'bg-foreground/[0.11]' : direction === 1 ? 'bg-foreground/[0.04]' : 'bg-transparent',
        reducedMotion && 'transition-none',
        'motion-reduce:transition-none',
      )}
      style={{ touchAction: 'none' }}
      {...handlers}
      onPointerDown={event => {
        if (!disabled) setPressed(true);
        handlers.onPointerDown(event);
      }}
      onPointerUp={event => {
        setPressed(false);
        handlers.onPointerUp(event);
      }}
      onPointerCancel={event => {
        setPressed(false);
        handlers.onPointerCancel(event);
      }}
      onLostPointerCapture={() => {
        setPressed(false);
        handlers.onLostPointerCapture();
      }}
    >
      {/*
        White at low opacity rather than `text-muted-foreground`. The glyph now
        sits on whatever the mat's light is doing at the top or bottom edge of
        the panel, and a mid-grey the same lightness as a lit mat disappears
        completely. White with a shadow reads on all five, and stays recessive.
      */}
      <Glyph
        aria-hidden
        className="shrink-0 text-white/45 drop-shadow-[0_1px_2px_hsl(0_0%_0%/0.8)]"
        strokeWidth={2.5}
        style={{ width: glyphSize, height: glyphSize, margin: `calc(${glyphSize} * 0.25)` }}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Status chips                                                               */
/* -------------------------------------------------------------------------- */

interface ChipProps {
  icon: typeof Crown;
  value: number;
  tone?: string;
  fontSize: string;
  title: string;
}

function StatusChip({ icon: Icon, value, tone, fontSize, title }: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        // Solid ground under the chip: these sit on artwork now, and a
        // translucent muted pill loses its icon against a lit patch of mat.
        'inline-flex items-center gap-1 rounded-full bg-background/75 px-2 py-0.5 font-semibold leading-none tabular-nums',
        tone ?? 'text-muted-foreground',
      )}
      style={{ fontSize }}
    >
      <Icon aria-hidden style={{ width: '1.15em', height: '1.15em' }} />
      {value}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function PlayerPanel({
  player,
  seat,
  view,
  rules,
  mat,
  matArt,
  interactive,
  onNudgeLife,
  onOpenDetail,
  reducedMotion,
}: PlayerPanelProps) {
  // Container-query units read the seat box. A rotated seat has its width and
  // height swapped relative to that box, so "how tall does this panel look to
  // the player sitting at it" is `cqw` on the sideways seats and `cqh` on the
  // others. Everything on the panel scales off that one axis.
  const h = seat.isSideways ? 'cqw' : 'cqh';

  const dead = player.hasLost;
  const canTap = interactive && !dead;

  const lifeSize = `clamp(2.5rem, 33${h}, 12rem)`;
  const nameSize = `clamp(0.8rem, 7${h}, 1.35rem)`;
  const chipSize = `clamp(0.7rem, 6${h}, 1.1rem)`;
  const deltaSize = `clamp(0.9rem, 11${h}, 2.25rem)`;
  const glyphSize = `clamp(1.25rem, 11${h}, 2.75rem)`;

  const lifeTone =
    view.life <= 0
      ? 'text-destructive'
      : view.life <= 5
        ? 'text-destructive'
        : 'text-foreground';

  const energy = view.counters[COUNTER_ENERGY] ?? 0;
  const experience = view.counters[COUNTER_EXPERIENCE] ?? 0;

  const nameCorner = outerCorner(seat);
  const chipCorner = ALONG_EDGE[nameCorner];

  return (
    <div style={seatBoxStyle(seat)}>
      <div style={seatContentStyle(seat)}>
        <div
          role="group"
          aria-label={`${player.name}: ${player.life} life`}
          className={cn(
            'absolute inset-1 overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_hsl(0_0%_0%/0.35)]',
            'select-none',
          )}
          style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {/* The mat. First child, inert, and behind everything — the tap halves
              that follow are painted straight onto it. An eliminated seat keeps
              its mat, dimmed by the overlay at the bottom of this panel: the pod
              can still see whose colour that seat was. */}
          <MatSurface color={mat} art={matArt} tone="seat" />

          {canTap && (
            <>
              <TapHalf
                direction={1}
                label={`${player.name}: gain 1 life`}
                disabled={!canTap}
                glyphSize={glyphSize}
                onStep={onNudgeLife}
                onSwipe={onOpenDetail}
                reducedMotion={reducedMotion}
              />
              <TapHalf
                direction={-1}
                label={`${player.name}: lose 1 life`}
                disabled={!canTap}
                glyphSize={glyphSize}
                onStep={onNudgeLife}
                onSwipe={onOpenDetail}
                reducedMotion={reducedMotion}
              />
            </>
          )}

          {/* Life total. Inert: the halves underneath own every tap. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/* A dead player's total is not the headline any more — the reason is. */}
            {!dead && (
              <div
                className={cn('font-semibold leading-none tabular-nums', lifeTone)}
                style={{ fontSize: lifeSize, letterSpacing: '-0.03em' }}
              >
                {view.life}
              </div>
            )}

            {view.lifeDelta !== 0 && (
              <div
                className={cn(
                  'mt-[0.35em] rounded-full bg-muted px-[0.7em] py-[0.15em] font-semibold leading-none tabular-nums text-foreground',
                  !reducedMotion && 'transition-transform duration-150 motion-reduce:transition-none',
                )}
                style={{ fontSize: deltaSize }}
              >
                {view.lifeDelta > 0 ? `+${view.lifeDelta}` : view.lifeDelta}
              </div>
            )}
          </div>

          {/* Name — pinned to the corner furthest from the board's centre. */}
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label={`${player.name}: open details`}
            className={cn(
              // Opaque enough to hold its own over artwork: a 50% muted wash was
              // legible on flat charcoal and is not on a lit corner of a mat.
              'absolute flex max-w-[60%] items-center gap-1.5 bg-background/70 px-2 py-1 text-left font-medium leading-none text-foreground/85 outline-none focus-visible:bg-background',
              CORNER_POSITION[nameCorner],
            )}
            style={{ fontSize: nameSize, touchAction: 'none' }}
          >
            <span className="truncate">{player.name}</span>
          </button>

          {/*
            Counters that are actually in play — a counter at zero shows nothing.
            Deliberately inert: a chip is a small target sitting inside a tap
            half, so letting it swallow presses would turn "I meant +1" into
            "why did a sheet open".
          */}
          <div
            className={cn(
              'pointer-events-none absolute flex max-w-[45%] flex-wrap items-center gap-1 p-1',
              CORNER_ALIGN[chipCorner],
            )}
          >
            {rules.usesCommanderDamage && view.worstCommanderDamage > 0 && (
              <StatusChip
                icon={Crown}
                value={view.worstCommanderDamage}
                tone="text-type-commander"
                fontSize={chipSize}
                title={`Worst commander damage — lethal at ${rules.commanderDamageLethal}`}
              />
            )}
            {view.poison > 0 && (
              <StatusChip
                icon={Biohazard}
                value={view.poison}
                tone="text-mana-green"
                fontSize={chipSize}
                title={`Poison — lethal at ${rules.poisonLethal}`}
              />
            )}
            {energy > 0 && <StatusChip icon={Zap} value={energy} fontSize={chipSize} title="Energy" />}
            {experience > 0 && (
              <StatusChip icon={Sparkles} value={experience} fontSize={chipSize} title="Experience" />
            )}
          </div>

          {/* Eliminated: still on the table, still readable, no longer tappable. */}
          {dead && (
            <button
              type="button"
              onClick={onOpenDetail}
              aria-label={`${player.name} eliminated — open details`}
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-[0.4em] bg-background/65 text-center outline-none',
                !reducedMotion && 'transition-opacity duration-200 motion-reduce:transition-none',
              )}
              style={{ fontSize: nameSize, touchAction: 'none' }}
            >
              <Skull aria-hidden className="text-destructive" style={{ width: '2.4em', height: '2.4em' }} />
              <span className="font-semibold uppercase tracking-[0.18em] text-destructive">Eliminated</span>
              {player.lossReasons.length > 0 && (
                <span className="px-3 text-muted-foreground">{lossReasonLabel(player.lossReasons[0])}</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
