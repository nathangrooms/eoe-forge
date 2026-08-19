/**
 * When does the game actually need a human?
 *
 * Magic has twelve steps. A player makes a decision in about three of them, and
 * clicking through the other nine is not "playing Magic", it is operating a
 * turn-structure diagram. The engine keeps all twelve — priority, triggers and
 * a networked table all need them — and this module answers the one question
 * the surface has to ask on every state change:
 *
 *     is the game waiting on this seat for a real decision, or is it just
 *     waiting for someone to press next?
 *
 * If it is the latter, `/play` presses next itself.
 *
 * Nothing here mutates anything. It reads the same helpers the bot reads —
 * `eligibleAttackers`, `eligibleBlockers`, `planCastFromHand`, `planLandDrop` —
 * so the auto-advance and the rules can never disagree about whether a decision
 * exists. A step is skipped because the engine says nothing can happen in it,
 * never because a list of step names was hand-copied into the UI.
 */

import {
  controllerIn,
  eligibleAttackers,
  eligibleBlockers,
  isLand,
  advanceActions,
  hasPriority,
  hasResponse,
  isUnderAttack,
  manualDutiesFor,
  planCastFromHand,
  planLandDrop,
  stackOf,
  type GameAction,
  type GameState,
  type PlayerId,
  // Relative rather than the `@/` alias, for the same reason `combatUi.ts` is:
  // this module decides when the surface may press next on the player's behalf,
  // and `playCombatFlow.test.ts` drives exactly that decision under
  // `node --test`, which has no bundler to resolve an alias with.
} from '../../lib/game/index.ts';

/**
 * The decisions a player is ever stopped for. Anything not in this union is a
 * step the surface walks through on its own.
 */
export type PlayDecision =
  /** Precombat main: play a land, cast something, or declare you are done. */
  | 'main'
  /** Postcombat main, and only when something is actually castable. */
  | 'second-main'
  /** You have creatures that could attack and have not swung yet. */
  | 'attackers'
  /** Someone is attacking you and you have bodies to put in the way. */
  | 'blockers'
  /**
   * Something on your board goes off this step and the engine will not run it.
   *
   * This is the Aether Vial stop. An upkeep trigger has no moment of its own —
   * nothing enters, nothing dies, nothing lands in the feed — so at 130 ms a
   * step the whole upkeep was over before a player could have seen it. The
   * engine already knew the trigger was there and already knew it was declining
   * it; all that was missing was somewhere to say so and time to act.
   */
  | 'manual'
  /**
   * Somebody else's spell is on the stack and you are holding an answer.
   *
   * Offered ONLY when both halves are true. A prompt whose only answer is "no"
   * is noise, and a table that asks "respond?" after every cast trains a player
   * to hammer through it, which is how a real response would then get thrown
   * away. `hasResponse` in `respond.ts` is that two-part test, and it is the
   * owner's *"should detect if you can counter a cast from opponent"*.
   */
  | 'respond';

export const DECISION_LABEL: Record<PlayDecision, string> = {
  main: 'Your main phase',
  'second-main': 'Second main phase',
  attackers: 'Declare attackers',
  blockers: 'Declare blockers',
  manual: 'Resolve by hand',
  respond: 'Respond, or let it resolve',
};

export interface FlowOptions {
  /** Goldfish mode ignores mana, which changes what counts as "castable". */
  freeCast?: boolean;
}

/**
 * Is there a legal play in hand or the command zone right now?
 *
 * Used to decide whether a main phase is worth stopping in. The second main
 * phase of a turn where every card is uncastable is a step, not a decision.
 */
export function hasPlayableAction(
  state: GameState,
  playerId: PlayerId,
  options: FlowOptions = {}
): boolean {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return false;

  for (const instanceId of [...player.zones.hand, ...player.zones.command]) {
    const card = state.cards[instanceId];
    if (!card) continue;
    if (isLand(card)) {
      if (planLandDrop(state, playerId, instanceId).ok) return true;
    } else if (planCastFromHand(state, playerId, instanceId, { ignoreMana: options.freeCast }).ok) {
      return true;
    }
  }
  return false;
}

/**
 * True when this seat is the one holding the game up — its own turn, or a
 * declare-blockers step in which it is being attacked. Only a seat that holds
 * the game up is allowed to auto-advance it; otherwise two surfaces would race
 * to push the same step.
 */
export function controlsFlow(state: GameState, playerId: PlayerId): boolean {
  if (state.status !== 'playing') return false;
  /*
   * A non-empty stack changes who is holding the game up, and it is not the
   * active player. Priority passes round the table, so while something is
   * waiting to resolve the seat that owes a move is whoever holds priority —
   * that is the whole reason an instant is an instant. Answering this with
   * "whose turn is it" would leave a spell on the stack that nobody could pass
   * on, which is a hung game rather than a slow one.
   */
  if (stackOf(state).length > 0) return hasPriority(state, playerId);
  if (state.activePlayerId === playerId) return true;
  return state.step === 'declare_blockers' && isUnderAttack(state, playerId);
}

/**
 * The decision this seat owes the table right now, or `null` when the step can
 * be walked through.
 *
 * The three genuine stops:
 *
 *   - **main** — always. This is the one place per turn where a player is
 *     expected to look at the board and choose, so it is never skipped even
 *     with an empty hand; it is also where End Turn and Attack live.
 *   - **attackers** — while anything is still *able* to swing. Note "able", not
 *     "nothing declared yet". Attacks are declared one creature at a time from
 *     the preview, and releasing the step on the first declaration meant a
 *     player who swung with one creature had the rest of the step walked out
 *     from under them 130 ms later — a three-creature alpha strike was simply
 *     not expressible. Attacking taps (barring vigilance), so
 *     `eligibleAttackers` empties itself as the swing is declared and the step
 *     releases on its own once there is nothing left to add; until then the
 *     player says when they are done.
 *   - **blockers** — only when the attack is pointed at you and you have an
 *     untapped body that could get in the way. Being attacked with an empty
 *     board is not a decision, and the engine's bot politely waits for a human
 *     defender forever, so this is also what stops that deadlock.
 */
export function decisionFor(
  state: GameState,
  playerId: PlayerId,
  options: FlowOptions = {}
): PlayDecision | null {
  if (state.status !== 'playing') return null;

  /*
   * Anything on the stack answers first, and it answers for everybody.
   *
   * While a spell is waiting, the only legal thing to do is respond to it or
   * pass, so every other decision below is moot. Returning null when there is
   * no response available is what lets the surface pass on the player's behalf
   * instead of stopping to ask a question with one answer.
   */
  if (stackOf(state).length > 0) {
    if (!hasPriority(state, playerId)) return null;
    return hasResponse(state, playerId, options) ? 'respond' : null;
  }

  // Blocking is answered before the turn check: it is the one decision a player
  // makes on somebody else's turn.
  if (state.step === 'declare_blockers' && isUnderAttack(state, playerId)) {
    return eligibleBlockers(state, playerId).length > 0 ? 'blockers' : null;
  }

  if (state.activePlayerId !== playerId) return null;

  /*
   * A trigger the engine will not run, in the step it goes off in.
   *
   * Checked before the step switch because it is about the step's CONTENT
   * rather than its name: the upkeep and the end step are both steps this
   * surface otherwise walks straight past, and walking past is exactly right
   * when the board holds nothing that needs a person. `manualDutiesFor` returns
   * an empty list on almost every turn of almost every game, so this costs one
   * pass over the active player's battlefield against a memoised answer per
   * card, and buys the one turn where an Aether Vial is sitting there waiting.
   */
  if (manualDutiesFor(state, playerId).length > 0) return 'manual';

  switch (state.step) {
    case 'precombat_main':
      return 'main';

    case 'declare_attackers': {
      /*
       * The step releases when the PLAYER says so, not when the engine runs out
       * of creatures to offer.
       *
       * It used to release the moment `eligibleAttackers` came back empty. That
       * reads sensible and is wrong on a board: attacking taps (barring
       * vigilance), so the list empties itself as the swing is declared — and
       * the surface walked out of the step 130 ms after the last sword was
       * pressed, with no chance to look at what was declared, call one back, or
       * point the swing at a different seat. In a real game you say "attacks"
       * out loud; here you press Attack with N on the combat bar.
       *
       * So a seat holds the step while it has anything left to add OR anything
       * already declared. A seat with no creatures at all flows straight past,
       * because there is nothing to decide, and END TURN sweeps through in
       * every case — that path sets `forcing` and ignores decisions entirely.
       */
      if (eligibleAttackers(state, playerId).length > 0) return 'attackers';
      /*
       * `controllerIn`, not `card.controllerId`. The latter is the *printed*
       * controller — `layers.ts` documents it as "the battlefield controller
       * before any layer-2 effect" — so a creature attacking under a control
       * change answers to the wrong seat. `eligibleAttackers` on the line above
       * already asks the layer engine, and the two halves of one decision
       * disagreeing is how a swing gets walked out from under the player who
       * declared it: attacking taps, the eligible list empties, and this
       * fallback is then the only thing holding the step open.
       */
      const declared = state.combat.attackers.some(declaration => {
        const card = state.cards[declaration.attackerId];
        return !!card && controllerIn(state, card) === playerId;
      });
      return declared ? 'attackers' : null;
    }

    case 'postcombat_main':
      return hasPlayableAction(state, playerId, options) ? 'second-main' : null;

    default:
      return null;
  }
}

/** Can this seat swing right now, or reach a swing from where it is standing? */
export function canReachCombat(state: GameState, playerId: PlayerId): boolean {
  if (state.status !== 'playing') return false;
  if (state.activePlayerId !== playerId) return false;
  if (state.step !== 'precombat_main') return false;
  return eligibleAttackers(state, playerId).length > 0;
}

/**
 * What "press next" means for this seat right now.
 *
 * One helper, because there are two different next presses and picking the
 * wrong one is how a game hangs. With something on the stack, next is
 * `PASS_PRIORITY` — the consequences (resolve the top, or end the step) are
 * derived by `stackFollowUps` in the engine, so a surface never has to know
 * which it caused. With an empty stack, next is `advanceActions`, which is
 * also the only thing that turns the combat damage step into actual damage.
 *
 * Returns an empty batch when this seat has nothing to press, so a caller can
 * dispatch it unconditionally.
 */
export function flowActions(state: GameState, playerId: PlayerId, at = 0): GameAction[] {
  if (state.status !== 'playing') return [];
  if (stackOf(state).length > 0) {
    if (!hasPriority(state, playerId)) return [];
    return [{ type: 'PASS_PRIORITY', playerId, at }];
  }
  return advanceActions(state, at);
}
