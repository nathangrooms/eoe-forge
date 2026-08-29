/**
 * What this spell is being cast AT, chosen before it is cast.
 *
 * ## What this closes, and it is the one CLAUDE.md named
 *
 * > "The engine resolves a targeted spell correctly today. Nobody can pick the
 * > target. That one seam is worth more than the next ten primitives."
 *
 * `CastOptions.targets` has existed since the stack did. `cast-targets.ts` has
 * had the asker since the bot needed one. What did not exist was a control a
 * PERSON could press: `cardActions.ts` called `planCastFromHand` with no
 * targets, `Play.tsx` dispatched that plan, and Lightning Bolt reached the top
 * of the stack aimed at nobody and went to the graveyard. A seam only the bot
 * can use is worth nothing, and this project has shipped one of those before.
 *
 * ## It is the Aura's host row, for every other spell
 *
 * `AttachmentPanel` already draws exactly this for an Aura, because an Aura is
 * the one permanent that cannot be cast without naming something. A targeted
 * instant is in the same position and it is drawn the same way: a sentence
 * saying what the card wants, then a name per legal candidate, in the centre
 * preview's own details column. No dialog, no portal, no second surface.
 *
 * ## Nothing here decides anything, and nothing here re-derives a rule
 *
 * `planSpellTargets` is asked on every render against the state the board is
 * drawing, so a name on screen is a target CR 115.6 and the card's own filter
 * have both already agreed to. A spell with more than one target asks for them
 * one at a time and casts itself on the last press, the same accumulation
 * `AbilityPanel` does.
 *
 * ## A refusal is a sentence, never a dead button
 *
 * A spell whose only target has just died cannot be cast at all (CR 601.2c),
 * and saying so is the difference between a rule and a bug. That sentence comes
 * back from the engine rather than being written here.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  auraNeedsHost,
  planSpellTargets,
  spellNeedsATarget,
  type ActivationChoices,
  type CardInstance,
  type CastOptions,
  type GameState,
  type PlayerId,
  type StackTarget,
} from '@/lib/game';
import { TargetChoiceRow } from './TargetChoice';
import { handPlayVerdict } from './cardActions';

export interface SpellTargetPanelProps {
  state: GameState;
  viewerPlayerId: PlayerId;
  card: CardInstance;
  /**
   * Cast it, aimed. The page owns the reducer, the payment and the timing
   * check, exactly as it does for an ordinary cast; this only names the targets.
   */
  onCastAt?: (card: CardInstance, options: Pick<CastOptions, 'targets'>) => void;
  /**
   * Playtest escape hatch: ignore mana entirely.
   *
   * It has to reach the verdict below or the panel refuses a spell the rest of
   * the screen is offering. Measured when the check was first added without
   * this prop: free cast on, every targeted spell in hand still answered "needs
   * more mana" here while the fan showed it bright.
   */
  freeCast?: boolean;
  className?: string;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

export function SpellTargetPanel({
  state,
  viewerPlayerId,
  card,
  onCastAt,
  freeCast,
  className,
}: SpellTargetPanelProps) {
  const [choices, setChoices] = useState<ActivationChoices>({});

  /*
   * An Aura is left alone. `AttachmentPanel` already asks for its host, that
   * answer already rides onto the stack object as the target, and a second
   * asker would announce the same thing twice — which is the reason
   * `planCastWith` skips them too.
   */
  if (!onCastAt) return null;
  if (card.zone !== 'hand' && card.zone !== 'command') return null;
  if (card.controllerId !== viewerPlayerId) return null;
  if (auraNeedsHost(card)) return null;
  if (!spellNeedsATarget(card)) return null;

  /*
   * ASK WHETHER IT CAN BE CAST AT ALL BEFORE ASKING WHAT AT.
   *
   * This panel used to draw its target row for any targeted spell in your hand,
   * whatever the step and whatever the mana. `Play.tsx` catches it at the press
   * — `handleCast` checks `castTiming` and refuses with a toast — so nothing
   * illegal was ever cast, and an earlier reading of this file that said
   * otherwise was wrong. What was really wrong is that a player was invited to
   * choose a target for a sorcery during the opponent's untap step and only
   * told no afterwards.
   *
   * Measured over 4,000 real cards in the untap step, before this check: the
   * fan greyed 29 cards this panel still offered a target row for. Now the fan,
   * the action list and this panel all read `handPlayVerdict`.
   */
  const verdict = handPlayVerdict(state, viewerPlayerId, card, { freeCast });
  if (!verdict.ok && !verdict.needsTarget) {
    return (
      <div className={cn('w-full space-y-1.5', className)}>
        <Heading>Cast it at</Heading>
        <p className="text-[10px] leading-snug text-muted-foreground">{verdict.reason}</p>
      </div>
    );
  }

  /*
   * Planned fresh on every render, against the state the board is drawing. A
   * cached plan goes stale the moment anything moves, and a name that describes
   * a board from two actions ago is worse than no name at all.
   */
  const aim = planSpellTargets(state, viewerPlayerId, card, choices);
  const choice = aim.pending[0];

  const answer = (target: StackTarget) => {
    if (!choice) return;
    const targets = [...(choices.targets ?? [])];
    targets[choice.ref] = target;
    const merged: ActivationChoices = { ...choices, targets };

    // Does that finish it? Ask the engine rather than counting presses: a spell
    // whose second target is forced settles on the first answer.
    const next = planSpellTargets(state, viewerPlayerId, card, merged);
    if (!next.reason) {
      onCastAt(card, { targets: next.targets });
      setChoices({});
      return;
    }
    setChoices(merged);
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      <Heading>Cast it at</Heading>
      {choice ? (
        /*
         * Answered on the TABLE, not here. The legal permanents light up where
         * they already are and pressing one casts the spell at it; `AimLayer`
         * carries this card's own clause, a control per legal seat, and the way
         * out. This row draws nothing while that is true, which is also why the
         * preview around it stands aside. See `CenterPreview`.
         */
        <TargetChoiceRow
          state={state}
          choice={choice}
          onAnswer={answer}
          aim={{
            seatId: viewerPlayerId,
            sourceName: card.name,
            sourceInstanceId: card.instanceId,
            clause: card.oracleText,
            cancelLabel: 'Do not cast it',
            /* The whole announcement, not the last press of it. Nothing has
               been dispatched yet, so clearing every answer puts the player
               back exactly where they started, which is what CR 601.2 does to
               an announcement that cannot be completed. */
            onCancel: () => setChoices({}),
          }}
        />
      ) : aim.reason ? (
        /* CR 601.2c — a spell with no legal target cannot be cast at all. The
           engine's own sentence, not a paraphrase of it. */
        <p className="text-[10px] leading-snug text-muted-foreground">{aim.reason}</p>
      ) : (
        /* Every target is forced, so there is nothing to decide and one button
           finishes the whole announcement. Drawn as a button rather than cast
           on sight, because casting is still the player's press. */
        <button
          type="button"
          onClick={() => onCastAt(card, { targets: aim.targets })}
          title={`Cast ${card.name}`}
          className={cn(
            'flex h-9 w-full items-center justify-center rounded-md bg-foreground px-3',
            'text-[11px] font-semibold uppercase tracking-wide text-background transition-colors',
            'hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          Cast at {describeTargets(state, aim.targets)}
        </button>
      )}
    </div>
  );
}

/** "Grizzly Bears and Player 2", for the one-press case's label. */
function describeTargets(state: GameState, targets: readonly StackTarget[]): string {
  const named = targets
    .map(target =>
      target.kind === 'player'
        ? state.players.find(player => player.id === target.playerId)?.name
        : target.instanceId
          ? state.cards[target.instanceId]?.name
          : undefined
    )
    .filter((name): name is string => !!name);
  return named.length > 0 ? named.join(' and ') : 'it';
}

export default SpellTargetPanel;
