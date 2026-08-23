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
 *
 * ---------------------------------------------------------------------------
 * A SPELL ON THE STACK IS A CARD, AND THIS IS WHERE THE GREY BOX WAS
 * ---------------------------------------------------------------------------
 * Owner, on a screenshot: *"A CARD ON THE STACK RENDERS AS AN EMPTY GREY BOX
 * with its name in small text. A blank rectangle where a card should be is the
 * thing that most makes software look unfinished."*
 *
 * That was measured to this file and to nothing else. Across a whole real game
 * at two widths, 41 of 41 card views on the board painted real art and 0 were
 * placeholders; this strip measured 219.8 x 101 with **0 `<img>` and 0 card
 * views in it**, drawing the spell as a 195.8 x 24.5 text row — 4,797 px — at
 * the same moment the same card was on screen 700px below it at 257px wide. It
 * was not failing to load a picture. It never asked for one.
 *
 * A spell on the stack is a card in a zone, and `StackObject.cardInstanceId`
 * has always pointed at it. An ability is not a card, so an ability shows the
 * PERMANENT it came off — `sourceInstanceId`, which is what a player looks at
 * to work out what is about to happen — and says which of the two it is in
 * words. When the engine gives neither, the honest answer is a card back rather
 * than an empty rectangle: something is on the stack and we cannot show you
 * what.
 */

import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Playmat } from './Playmat';
import { CardBack } from './CardBack';
import { GameCardView } from './GameCardView';
import { ManaCost } from '@/components/ui/mana-cost';
import type { CardInstance, GameState, PlayerId, ResponseOption, StackObject } from '@/lib/game';

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

  /*
   * The card an object on the stack IS, or the permanent it came off.
   *
   * `cardInstanceId` for a spell, because the spell is the card. For an ability
   * there is no card — CR 113.3 — so this falls back to the source permanent,
   * which is what a player looks at to work out what is about to happen to
   * them. `cardFor` returning null is not a rendering failure and is not drawn
   * as an empty box; it is a card back, which says what is true.
   */
  const cardFor = (object: StackObject): CardInstance | null =>
    state.cards[object.cardInstanceId ?? object.sourceInstanceId ?? ''] ?? null;
  const isSpell = (object: StackObject) => Boolean(object.cardInstanceId);

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

      {/*
        Top first: the next thing to resolve reads first, and it is drawn as
        the CARD it is.

        The next object gets a card you can actually read at 108px; everything
        under it gets a 56px one, because the stack under the top is context
        rather than the decision. Both are real card views, so both carry the
        art, the frame and the layer engine's stat line, and neither of them is
        a rectangle with a name in it.
      */}
      <div className="relative flex items-end gap-2">
        {/* Five is what fits: 108 + four at 56 plus the gaps is about 390 of
            the strip's 672. A deeper stack says how much deeper rather than
            running off the end, because a scroll bar inside the table is the
            one thing this surface may never grow. */}
        {topFirst.slice(0, STACK_SHOWN).map((object, index) => {
          const card = cardFor(object);
          const width = index === 0 ? 108 : 56;
          const kind = isSpell(object) ? 'spell' : 'ability';
          const label = `${object.name}, ${kind} cast by ${nameOf(object.controllerId)}`;

          return (
            <div
              key={object.stackId}
              className={cn(
                'flex min-w-0 shrink-0 flex-col items-center gap-1 rounded-xl px-2 pb-1 pt-1',
                index === 0 ? 'bg-foreground/[0.12]' : 'bg-foreground/[0.05]'
              )}
              title={label}
            >
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {index === 0 ? 'Next' : `+${index}`}
              </span>
              {card ? (
                <GameCardView card={card} width={width} ignoreTapped title={label} />
              ) : (
                /* Nothing to show and we say so, rather than drawing a hole.
                   An object with neither a card nor a source is a triggered
                   ability the engine raised from a rule rather than from a
                   permanent. */
                <CardBack width={width} title={label} />
              )}
              <span
                className="max-w-full truncate text-[10px] font-semibold text-foreground"
                style={{ width }}
              >
                {object.name}
              </span>
              <span
                className="max-w-full truncate text-[10px] text-muted-foreground"
                style={{ width }}
              >
                {isSpell(object) ? nameOf(object.controllerId) : `${nameOf(object.controllerId)}, ability`}
              </span>
            </div>
          );
        })}

        {topFirst.length > STACK_SHOWN && (
          <span className="self-center rounded-full bg-foreground/[0.1] px-2 py-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {topFirst.length - STACK_SHOWN} more
          </span>
        )}
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
