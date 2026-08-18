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
 */

import { useState } from 'react';
import { Biohazard, Crown, Minus, Plus, Skull, Sparkles, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ColorIdentity } from '@/components/ui/mana-cost';
import {
  lossReasonLabel,
  seatBoxStyle,
  seatContentStyle,
  type FormatRules,
  type Player,
  type Seat,
} from '@/lib/game';

import { useHoldRepeat } from './useHoldRepeat';
import { haptic } from './useImmersive';
import { COUNTER_ENERGY, COUNTER_EXPERIENCE } from './counters';
import type { PlayerView } from './useLifeGame';

/** Travel before a press is treated as a swipe rather than a tap. */
const SWIPE_PX = 56;

export interface PlayerPanelProps {
  player: Player;
  seat: Seat;
  view: PlayerView;
  rules: FormatRules;
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
        'transition-colors duration-100 focus-visible:bg-foreground/[0.07]',
        direction === 1 ? 'top-0' : 'bottom-0 items-end',
        pressed ? 'bg-foreground/[0.09]' : 'bg-transparent',
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
      <Glyph
        aria-hidden
        className="shrink-0 text-muted-foreground/45"
        style={{ width: glyphSize, height: glyphSize, margin: `calc(${glyphSize} * 0.28)` }}
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
        'inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 font-semibold leading-none tabular-nums',
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

  const lifeSize = `clamp(2.25rem, 33${h}, 13rem)`;
  const nameSize = `clamp(0.7rem, 5.5${h}, 1.35rem)`;
  const chipSize = `clamp(0.65rem, 4.6${h}, 1.1rem)`;
  const deltaSize = `clamp(0.8rem, 8${h}, 2.5rem)`;
  const glyphSize = `clamp(1rem, 7${h}, 2.75rem)`;

  const lifeTone =
    view.life <= 0
      ? 'text-destructive'
      : view.life <= 5
        ? 'text-destructive'
        : 'text-foreground';

  const energy = view.counters[COUNTER_ENERGY] ?? 0;
  const experience = view.counters[COUNTER_EXPERIENCE] ?? 0;
  const colors = player.commanders[0]?.colorIdentity ?? [];

  return (
    <div style={seatBoxStyle(seat)}>
      <div style={seatContentStyle(seat)}>
        <div
          role="group"
          aria-label={`${player.name}: ${player.life} life`}
          className={cn(
            'absolute inset-1 overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_hsl(0_0%_0%/0.35)]',
            'select-none',
            dead && 'bg-muted/40',
          )}
          style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        >
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
            <div
              className={cn('font-semibold leading-none tabular-nums', lifeTone, dead && 'opacity-45')}
              style={{ fontSize: lifeSize, letterSpacing: '-0.03em' }}
            >
              {view.life}
            </div>

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

          {/* Name — top-left, i.e. the far corner from the player, clear of thumbs. */}
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label={`${player.name}: open details`}
            className="absolute left-0 top-0 flex max-w-[70%] items-center gap-1.5 rounded-br-xl rounded-tl-2xl bg-muted/50 px-2 py-1 text-left font-medium leading-none text-muted-foreground outline-none focus-visible:bg-muted"
            style={{ fontSize: nameSize, touchAction: 'none' }}
          >
            <span className="truncate">{player.name}</span>
            {colors.length > 0 && <ColorIdentity colors={colors} size="xs" />}
          </button>

          {/* Counters that are actually in play. Absent counters show nothing. */}
          <div className="absolute right-1 top-1 flex flex-wrap items-center justify-end gap-1">
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
                'absolute inset-0 flex flex-col items-center justify-center gap-[0.4em] bg-background/70 text-center outline-none',
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
