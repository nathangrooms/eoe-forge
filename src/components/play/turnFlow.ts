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
  eligibleAttackers,
  eligibleBlockers,
  isLand,
  isUnderAttack,
  planCastFromHand,
  planLandDrop,
  type GameState,
  type PlayerId,
} from '@/lib/game';

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
  | 'blockers';

export const DECISION_LABEL: Record<PlayDecision, string> = {
  main: 'Your main phase',
  'second-main': 'Second main phase',
  attackers: 'Declare attackers',
  blockers: 'Declare blockers',
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
 *   - **attackers** — only while there is something to swing with *and* nothing
 *     has been declared yet. Declaring an attack is itself the decision, so the
 *     step releases the moment attackers exist on the stack of declarations.
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

  // Blocking is answered before the turn check: it is the one decision a player
  // makes on somebody else's turn.
  if (state.step === 'declare_blockers' && isUnderAttack(state, playerId)) {
    return eligibleBlockers(state, playerId).length > 0 ? 'blockers' : null;
  }

  if (state.activePlayerId !== playerId) return null;

  switch (state.step) {
    case 'precombat_main':
      return 'main';

    case 'declare_attackers':
      if (state.combat.attackers.length > 0) return null;
      return eligibleAttackers(state, playerId).length > 0 ? 'attackers' : null;

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
