/**
 * By-hand control of a SEAT. The other half of `ManualPanel`.
 *
 * `ManualPanel` answers *what can I do to this card*. Nothing answered *what
 * can I do to this player*, and the measurement is stark: driving a real
 * goldfish game on 29 Aug 2026 and reading back every button on the table gave
 * twenty-eight by-hand controls on a permanent and ZERO anywhere that could
 * change a life total. `adjustLife`, `setLife`, `playerCounter` and
 * `PLAYER_COUNTER_PRESETS` were all exported from `src/lib/game/manual.ts` and
 * imported by nothing outside the engine.
 *
 * Owner: *"Also makes it feel more like playing magic, as you control the cards
 * and actions."* You also control your life total. With the ability bridge
 * running about 2.7% of the catalogue, the card that just drained you is almost
 * certainly one the engine did not read, and a life total only the engine may
 * touch is wrong by turn two of every game.
 *
 * ## Where it draws, and why it is not a card panel
 *
 * The board's right-hand rail, the same rail the zone browser and the game menu
 * use, opened by pressing a seat's life badge. Not a dialog: project law, and
 * `ZonePanel` records the owner's words for it. Not the centre-of-mat preview
 * either, because that surface belongs to a clicked CARD and putting a seat
 * there would mean two different subjects in one place.
 *
 * ## Every button is bound in the engine
 *
 * Same contract as `ManualPanel`: `playerControlsFor` returns the menu already
 * bound to `GameAction[]`, and this file dispatches batches. Nothing here knows
 * a rule, so the panel and the reducer cannot drift.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  manaPoolOf,
  playerControlsFor,
  setLife,
  type GameAction,
  type GameState,
  type PlayerControl,
  type PlayerId,
} from '@/lib/game';

export interface SeatPanelProps {
  state: GameState;
  /** The seat being edited. */
  playerId: PlayerId;
  /** The seat this device holds, so the panel can say when it is not yours. */
  viewerPlayerId: PlayerId;
  /** Every control ends here. The page holds the reducer. */
  onDispatch: (actions: GameAction[]) => void;
  /** Switch to another seat without closing and reopening. */
  onSeatChange?: (playerId: PlayerId) => void;
  onClose: () => void;
  className?: string;
}

function Chip({
  label,
  count,
  tone = 'quiet',
  title,
  onClick,
}: {
  label: string;
  count?: number;
  tone?: 'quiet' | 'active' | 'loud';
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-md px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'active' && 'bg-foreground text-background',
        tone === 'loud' && 'bg-foreground/[0.14] text-foreground hover:bg-foreground/[0.22]',
        tone === 'quiet' && 'bg-foreground/[0.07] text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 text-[10px] opacity-70">{count}</span>
      )}
    </button>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        {note && (
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/80">
            {note}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function SeatPanel({
  state,
  playerId,
  viewerPlayerId,
  onDispatch,
  onSeatChange,
  onClose,
  className,
}: SeatPanelProps) {
  const [typed, setTyped] = useState('');

  const player = state.players.find(p => p.id === playerId);
  const controls = playerControlsFor(state, playerId, Date.now());
  const group = (name: PlayerControl['group']) => controls.filter(c => c.group === name);

  if (!player) return null;

  const life = group('life');
  const roles = group('table-role');
  const commander = group('commander-damage');
  const untap = group('untap')[0];
  const pool = manaPoolOf(state, playerId);
  const mine = playerId === viewerPlayerId;

  /* An exact total, for the twenty-point swing that is not four presses of +5.
     Blank or nonsense does nothing rather than setting the life to zero, which
     is the difference between a typo and losing the game. */
  const commitTyped = () => {
    const value = Number.parseInt(typed, 10);
    if (Number.isFinite(value)) onDispatch(setLife(playerId, value, Date.now()));
    setTyped('');
  };

  return (
    <div className={cn('flex h-full w-full flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-2">
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {player.name}
          {!mine && ' · not your seat'}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close the seat controls"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Which seat. A pod is two to four names and a row of them is cheaper
          than closing this and finding the right life badge on the mat. */}
      {onSeatChange && state.players.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1 px-3 pb-2">
          {state.players.map(seat => (
            <button
              key={seat.id}
              type="button"
              onClick={() => onSeatChange(seat.id)}
              aria-pressed={seat.id === playerId}
              className={cn(
                'max-w-[9rem] truncate rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                seat.id === playerId
                  ? 'bg-foreground text-background'
                  : 'bg-foreground/[0.07] text-muted-foreground hover:text-foreground'
              )}
            >
              {seat.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
        {/* Life leads, and it leads at a size you can read across a table. The
            number is the subject of this panel; the buttons are how it moves. */}
        <Section title="Life" note={`starts at ${state.rules.startingLife}`}>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-semibold leading-none tabular-nums text-foreground">
              {player.life}
            </span>
            <div className="flex flex-wrap gap-1">
              {life.map(control => (
                <Chip
                  key={control.id}
                  label={control.label}
                  tone="loud"
                  title={control.hint}
                  onClick={() => onDispatch(control.actions)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <input
              value={typed}
              onChange={event => setTyped(event.target.value.replace(/[^-0-9]/g, '').slice(0, 4))}
              onKeyDown={event => {
                if (event.key === 'Enter') commitTyped();
              }}
              inputMode="numeric"
              placeholder="Set to"
              aria-label="Set life to an exact number"
              className="w-24 rounded-md bg-foreground/[0.07] px-2 py-1 text-[11px] tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Chip label="Set" title="Set this seat to that exact life total" onClick={commitTyped} />
          </div>
        </Section>

        {/* Damage is its own row and not a smaller life button. The log says
            "took 3 damage" rather than "lost 3 life", which is the difference
            between a burn spell and a Phyrexian cost, and a card that punishes
            one does not punish the other. Nothing outside combat and ability
            resolution had ever built a `DAMAGE`. */}
        <Section title="Damage" note="not the same as losing life">
          <div className="flex flex-wrap items-center gap-1">
            {group('damage').map(control => (
              <Chip
                key={control.id}
                label={control.label}
                title={control.hint}
                onClick={() => onDispatch(control.actions)}
              />
            ))}
          </div>
        </Section>

        <Section title="Poison" note={`${state.rules.poisonLethal} is lethal`}>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-lg font-semibold leading-none tabular-nums text-foreground">
              {player.poison}
            </span>
            {group('poison').map(control => (
              <Chip
                key={control.id}
                label={control.label}
                title={control.hint}
                onClick={() => onDispatch(control.actions)}
              />
            ))}
          </div>
        </Section>

        {commander.length > 0 && (
          <Section title="Commander damage" note={`${state.rules.commanderDamageLethal} from one is lethal`}>
            <div className="flex flex-wrap gap-1">
              {commander.map(control => (
                <Chip
                  key={control.id}
                  label={control.label}
                  count={control.count}
                  tone={control.id.startsWith('cmdr-:') ? 'active' : 'quiet'}
                  title={control.hint}
                  onClick={() => onDispatch(control.actions)}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Counters">
          <div className="flex flex-wrap gap-1">
            {group('counters').map(control => (
              <Chip
                key={control.id}
                label={control.label}
                count={control.count}
                title={control.hint}
                onClick={() => onDispatch(control.actions)}
              />
            ))}
          </div>
        </Section>

        {/*
          MANA IN THE POOL, BY HAND.

          `ADD_MANA` was one of four actions this engine only ever built while
          a card was resolving. `mana.ts::paymentActions` taps lands to pay for
          a cast, so casting worked; nothing could put mana IN a pool, which is
          what "Add {B}{B}{B}" needs on the 97% of cards the compiler cannot
          read. The escape hatch on offer was the free-cast toggle, which makes
          everything free — a blunt instrument standing in for a precise one.

          `planPayment` already spends the pool before it taps anything, so
          mana put here really does pay for the next spell. It empties at the
          end of the step under CR 500.4, which is why the note says so and why
          the seat band draws the pool: mana that vanishes with no warning is
          worse than no pool at all.
        */}
        <Section title="Mana" note={pool.length > 0 ? `${pool.length} floating, gone at end of step` : 'empties at end of step'}>
          <div className="flex flex-wrap items-center gap-1">
            {group('mana').map(control => (
              <Chip
                key={control.id}
                label={control.label}
                count={control.count}
                title={control.hint}
                onClick={() => onDispatch(control.actions)}
              />
            ))}
          </div>
        </Section>

        {/* Untapping the board. `UNTAP_ALL` sat on the unreachable list with a
            note asking somebody to decide whether it was superseded or merely
            unwired. It is merely unwired: the untap step untaps the ACTIVE
            player, and every card that untaps out of turn is one the engine
            did not read. */}
        <Section title="Untap" note={untap?.count ? `${untap.count} tapped` : 'nothing is tapped'}>
          <div className="flex flex-wrap items-center gap-1">
            {untap && (
              <Chip
                label={untap.label}
                title={untap.hint}
                onClick={() => onDispatch(untap.actions)}
              />
            )}
          </div>
        </Section>

        {/* The monarch and the initiative. Their own section because they are
            not a quantity: one seat has each of them, or nobody does. */}
        <Section title="Held for the table" note="one seat at a time">
          <div className="flex flex-wrap gap-1">
            {roles.map(control => (
              <Chip
                key={control.id}
                label={control.label}
                tone={control.active ? 'active' : 'quiet'}
                title={control.hint}
                onClick={() => onDispatch(control.actions)}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

export default SeatPanel;
