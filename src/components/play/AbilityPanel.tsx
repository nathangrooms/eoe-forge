/**
 * The abilities on a permanent, and the button that uses one.
 *
 * ## What this closes
 *
 * The oracle-text compiler has always read a permanent's activated abilities
 * and `activatedAbilitiesOf` has always handed them out. Nothing called it, so
 * every card reading "{T}: do something" was a card that did nothing, and the
 * only thing a player could do with it was tap it by hand and resolve the text
 * in their head. `src/lib/game/activate.ts` is the engine half; this is the
 * half a person can press.
 *
 * ## It lives inside the centre preview, not in a surface of its own
 *
 * Clicking a card already puts it in the middle of the mat with its plays
 * beneath it. An ability IS a play, so it belongs in that list rather than in a
 * second panel a player has to find. No dialog, no portal, no backdrop: this is
 * a block of the preview's own details column.
 *
 * ## Choosing a target happens in place
 *
 * `planActivation` refuses to guess which creature you meant, so an ability
 * with more than one legal target comes back with the question attached.
 *
 * A TARGET is asked on the table: `TargetChoiceRow` publishes it, the legal
 * permanents light up where they already are, and pressing one answers the
 * question and uses the ability in the same gesture. Same seam as a cast spell
 * and a waiting trigger, so the three cannot drift apart.
 *
 * A COST that names cards is still a row here. "Sacrifice two creatures" is not
 * targeting, it takes more than one answer before anything happens, and the
 * legality behind it is a different function; pretending otherwise on the board
 * would say the wrong thing about what the press means. It is the next thing
 * this seam should take, not something to fake in the meantime.
 *
 * Answers accumulate either way, so an ability asking two things asks them one
 * after the other without ever leaving the card.
 *
 * ## One question at a time, even here
 *
 * A permanent can carry two abilities that both want a target, and both would
 * be asked at once by the list below. Two published questions would light the
 * board up for whichever rendered last, which is the board saying something the
 * player did not ask. So exactly one option ever takes the table: the one with
 * answers already given, or the only one asking. Anything else falls back to
 * the row of names, which is the honest drawing of "the interface cannot tell
 * which ability you mean yet".
 *
 * ## And a refusal is a sentence, never a dead button
 *
 * Same rule as `cardActions.ts`: an ability that cannot be used right now says
 * why in words. An ability that is simply absent from this list would be
 * indistinguishable from an engine that cannot read the card.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TargetChoiceRow } from './TargetChoice';
import {
  activationsFor,
  planActivation,
  type AbilityOption,
  type ActivationChoices,
  type CardInstance,
  type GameAction,
  type GameState,
  type PendingChoice,
  type PlayerId,
  type StackTarget,
} from '@/lib/game';

export interface AbilityPanelProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /** Playtest escape hatch, matching the cast path. */
  freeCast?: boolean;
  /** The batch goes here. The page holds the reducer. */
  onDispatch: (actions: GameAction[]) => void;
  className?: string;
}

/** Answers given so far, per ability. Cleared once the ability is used. */
type Answers = Record<string, ActivationChoices>;

function Chip({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-7 max-w-full items-center truncate rounded-md bg-foreground/[0.10] px-2',
        'text-[11px] font-medium text-foreground transition-colors hover:bg-foreground/[0.20]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      {label}
    </button>
  );
}

export function AbilityPanel({
  state,
  viewerPlayerId,
  card,
  freeCast,
  onDispatch,
  className,
}: AbilityPanelProps) {
  const [answers, setAnswers] = useState<Answers>({});

  /*
   * Planned fresh on every render, against the state the board is drawing. A
   * cached plan would go stale the moment anything moved, and a button that
   * describes a board from two actions ago is worse than no button.
   */
  const options = activationsFor(state, viewerPlayerId, card, { ignoreMana: freeCast }).map(option => {
    const given = answers[option.id];
    if (!given) return option;
    const replanned = planActivation(state, viewerPlayerId, card.instanceId, option.abilityId, {
      ignoreMana: freeCast,
      choices: given,
    });
    return { ...option, ...replanned } as AbilityOption;
  });

  if (options.length === 0) return null;

  const use = (option: AbilityOption) => {
    onDispatch(option.actions);
    setAnswers(current => {
      const next = { ...current };
      delete next[option.id];
      return next;
    });
  };

  /** Record one answer. If it completes the ability, use it straight away. */
  const answer = (option: AbilityOption, choice: PendingChoice, value: StackTarget | string) => {
    const given = answers[option.id] ?? {};
    /*
     * A cost naming two creatures is answered one press at a time, so the ids
     * ACCUMULATE. Replacing the list instead would leave a two-creature cost
     * permanently one short and the button permanently absent.
     */
    const merged: ActivationChoices =
      choice.kind === 'target'
        ? {
            ...given,
            targets: Object.assign([...(given.targets ?? [])], { [choice.ref]: value as StackTarget }),
          }
        : {
            ...given,
            costs: {
              ...(given.costs ?? {}),
              [choice.ref]: [
                ...new Set([...(given.costs?.[choice.ref] ?? []), value as string]),
              ],
            },
          };

    const plan = planActivation(state, viewerPlayerId, card.instanceId, option.abilityId, {
      ignoreMana: freeCast,
      choices: merged,
    });

    if (plan.ok) {
      onDispatch(plan.actions);
      setAnswers(current => {
        const next = { ...current };
        delete next[option.id];
        return next;
      });
      return;
    }
    setAnswers(current => ({ ...current, [option.id]: merged }));
  };

  const nameOf = (instanceId: string) => state.cards[instanceId]?.name ?? 'That card';
  const seatOf = (playerId: string) => state.players.find(p => p.id === playerId)?.name ?? 'A player';

  /*
   * WHICH ability gets the table.
   *
   * The one the player has already started answering, otherwise the only one
   * asking for a target. Two at once is not a tie to break, it is a question
   * the interface genuinely cannot ask yet, and the row of names is the honest
   * drawing of that.
   */
  const asking = options.filter(option => !option.ok && option.pending[0]?.kind === 'target');
  const aimed = asking.find(option => answers[option.id]) ?? (asking.length === 1 ? asking[0] : undefined);

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Abilities
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {options.some(option => option.ok) ? 'Ready to use' : 'Read what each one needs'}
        </span>
      </div>

      {options.map(option => {
        const choice = option.pending[0];
        return (
          <div key={option.id} className="rounded-lg bg-foreground/[0.05] p-2">
            {/* The card's own words. Never a paraphrase: a player has to be able
                to check what the engine thinks the card says. */}
            <p className="text-[11px] leading-snug text-foreground">{option.text}</p>

            {option.caution && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{option.caution}</p>
            )}

            {option.ok && (
              <button
                type="button"
                onClick={() => use(option)}
                title={`Use ${card.name}: ${option.text}`}
                className={cn(
                  'mt-1.5 flex h-9 w-full items-center justify-center rounded-md bg-foreground px-3',
                  'text-[11px] font-semibold uppercase tracking-wide text-background transition-colors',
                  'hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                {option.isLoyalty ? 'Use loyalty ability' : 'Use'}
              </button>
            )}

            {/* A TARGET: asked on the table. `TargetChoiceRow` publishes it and
                draws nothing, and the card the player presses is the answer.
                CR 400.7's zone snapshot is taken there, once, rather than being
                rebuilt by hand here as it used to be. */}
            {!option.ok && choice && choice.kind === 'target' && (
              <TargetChoiceRow
                state={state}
                choice={choice}
                onAnswer={target => answer(option, choice, target)}
                className="mt-1.5"
                aim={
                  option.id === aimed?.id
                    ? {
                        seatId: viewerPlayerId,
                        sourceName: card.name,
                        sourceInstanceId: card.instanceId,
                        /* The ability's own text, not the card's whole box. It
                           is the clause the player is checking the engine
                           against. */
                        clause: option.text,
                        cancelLabel: 'Do not use it',
                        onCancel: () =>
                          setAnswers(current => {
                            const next = { ...current };
                            delete next[option.id];
                            return next;
                          }),
                      }
                    : null
                }
              />
            )}

            {/* A COST that names cards. Not targeting, so not on the board:
                see the note at the top of this file. */}
            {!option.ok && choice && choice.kind !== 'target' && (
              <div className="mt-1.5 space-y-1.5">
                <p className="text-[10px] leading-snug text-muted-foreground">{choice.prompt}</p>
                <div className="flex flex-wrap gap-1">
                  {choice.playerIds.map(playerId => (
                    <Chip
                      key={`p:${playerId}`}
                      label={seatOf(playerId)}
                      onClick={() => answer(option, choice, { kind: 'player', playerId })}
                    />
                  ))}
                  {choice.instanceIds.map(instanceId => (
                    <Chip
                      key={`x:${instanceId}`}
                      label={nameOf(instanceId)}
                      onClick={() => answer(option, choice, instanceId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Not a button you cannot press. A sentence saying why there is no
                button. */}
            {!option.ok && !choice && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{option.reason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default AbilityPanel;
