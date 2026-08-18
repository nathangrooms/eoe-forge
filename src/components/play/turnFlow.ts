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

  // Blocking is answered before the turn check: it is the one decision a player
  // makes on somebody else's turn.
  if (state.step === 'declare_blockers' && isUnderAttack(state, playerId)) {
    return eligibleBlockers(state, playerId).length > 0 ? 'blockers' : null;
  }

  if (state.activePlayerId !== playerId) return null;

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
      const declared = state.combat.attackers.some(declaration => {
        const card = state.cards[declaration.attackerId];
        return !!card && card.controllerId === playerId;
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
