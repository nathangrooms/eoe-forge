/**
 * The stack, drawn into the mat, and the chance to answer it.
 *
 * Owner: *"no opportunity to use instants to counter a spell either?"* and
 * *"Counter spells dont work at all, should detect if you can counter a cast
 * from opponent."*
 *
 * `stack.ts` had all of this — announcement order, targeting, fizzling,
 * countering, priority, split second — and 32 tests. What it did not have was a
 * single caller outside the engine: grep for `state.stack` across the play
 * components returned nothing, so no spell had ever been on the stack and there
 * had never been a moment at which an instant could be cast. From a seat at the
 * table that is indistinguishable from an engine with no stack.
 *
 * ## What is drawn
 *
 * The stack, top first, because the top is what resolves next and that is the
 * thing the player is deciding about. Every object says who cast it, so
 * "somebody is doing something to me" reads before any card name does.
 *
 * ## When the answers are drawn
 *
 * Only when there are any. `responseOptions` returns the cards this player
 * could legally cast right now AND can pay for; when it is empty this strip
 * shows the stack and no buttons, and the page passes priority on the player's
 * behalf. A question with one answer is not a question, and asking it after
 * every cast is how a real chance to respond gets hammered through.
 *
 * Into the mat, in the table's own material, in the band the combat strip uses:
 * no dialog, no backdrop, no dimming, nothing covered.
 */

import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { ManaCost } from '@/components/ui/mana-cost';
import type { GameState, PlayerId, ResponseOption, StackObject } from '@/lib/game';

export interface StackStripProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  /** Bottom first, exactly as the engine holds it. This flips it for reading. */
  stack: readonly StackObject[];
  /** Cards the viewer could cast in response. Empty means there is no question. */
  responses: readonly ResponseOption[];
  /** True while the viewer is the one being waited on. */
  yourPriority: boolean;
  onRespond: (option: ResponseOption) => void;
  /** Let it resolve. One pass; the engine derives what that causes. */
  onPass: () => void;
  className?: string;
}

export function StackStrip({
  state,
  viewerPlayerId,
  stack,
  responses,
  yourPriority,
  onRespond,
  onPass,
  className,
}: StackStripProps) {
  if (stack.length === 0) return null;

  const topFirst = stack.slice().reverse();
  const nameOf = (playerId: PlayerId) =>
    playerId === viewerPlayerId
      ? 'You'
      : state.players.find(p => p.id === playerId)?.name ?? 'Someone';

  const top = topFirst[0];
  const theirs = top.controllerId !== viewerPlayerId;

  const headline = !yourPriority
    ? `Waiting for ${nameOf(state.priorityPlayerId)}`
    : responses.length > 0
      ? theirs
        ? `${nameOf(top.controllerId)} cast ${top.name}. You can answer it.`
        : `${top.name} is waiting. You can add to it.`
      : `${nameOf(top.controllerId)} cast ${top.name}`;

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex max-w-[min(94vw,42rem)] flex-col gap-1.5 overflow-hidden rounded-xl px-3 py-2 shadow-xl shadow-black/50',
        className
      )}
      role="group"
      aria-label="The stack"
    >
      <Playmat tone="board" rounded="rounded-xl" className="absolute inset-0 h-full w-full" />

      <div className="relative flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {/* "The stack" is the game's own word for it and every Magic player
              knows it. It is not product jargon. */}
          The stack
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">{headline}</span>
      </div>

      {/* Top first: the next thing to resolve reads first. */}
      <div className="relative flex flex-col gap-0.5">
        {topFirst.map((object, index) => (
          <div
            key={object.stackId}
            className={cn(
              'flex items-baseline gap-2 rounded-lg px-2 py-1',
              index === 0 ? 'bg-foreground/[0.12]' : 'bg-foreground/[0.05]'
            )}
          >
            <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {index === 0 ? 'Next' : `+${index}`}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
              {object.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {nameOf(object.controllerId)}
            </span>
          </div>
        ))}
      </div>

      {yourPriority && (
        <div className="relative flex flex-wrap items-center gap-1.5">
          {responses.map(option => (
            <button
              key={option.card.instanceId}
              type="button"
              onClick={() => onRespond(option)}
              title={
                option.counters
                  ? `Cast ${option.card.name} to counter ${top.name}.`
                  : `Cast ${option.card.name} in response.`
              }
              className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground/[0.12] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="max-w-[12rem] truncate">
                {option.counters ? `Counter with ${option.card.name}` : option.card.name}
              </span>
              <ManaCost cost={option.card.manaCost} size="sm" className="shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={onPass}
            className="ml-auto flex h-8 shrink-0 items-center rounded-lg bg-foreground px-3 text-xs font-semibold uppercase tracking-wide text-background shadow-lg shadow-black/50 transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Let it resolve
          </button>
        </div>
      )}
    </div>
  );
}

export default StackStrip;
