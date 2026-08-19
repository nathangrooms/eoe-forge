/**
 * What a seat's identity band says about combat.
 *
 * Owner: *"attacking and blocking doesn't seem very clear at all"*,
 * *"declaring blockers etc is not ideal, should always be given the choice when
 * attacked"*.
 *
 * The mechanics were verified working by playing — the engine pauses at declare
 * blockers, `isUnderAttack` is right, the chips are on the cards. What was
 * missing is the sentence. Driving a real four-seat game with four creatures
 * pointed at the viewer, the entire screen said this about it:
 *
 *     T1  You attacked with 4 creatures.
 *
 * one line in a 224px log at the bottom-left corner, and nothing at all on the
 * seat being attacked. A player has to be able to read, without working it out:
 * who is attacking, how much is coming, and how much of it is already stopped.
 *
 * So this module answers exactly that, per seat, with no pixels in it. It lives
 * apart from `SeatMat.tsx` for the reason `seatLayout.ts` does: `npm test` is
 * `node --test` over `.ts` and cannot parse a file with JSX in it, so numbers
 * that live inside a component are numbers nothing can check.
 *
 * ## It asks the engine, it does not restate the rules
 *
 * `combatLanes` in `src/lib/game/combat.ts` already assembles every attacker
 * with its blockers, its defender, whether it is lethal unblocked and how many
 * blockers it needs. It had **no caller anywhere in the product** — the whole
 * "who is hitting whom" question was computed correctly and never shown. This
 * is that call site. `combatPowerIn` is the same story for the damage figure:
 * it is the layer engine's answer, so a pumped creature reads correctly here
 * without this file knowing what a pump is.
 */

import {
  combatLanes,
  combatPowerIn,
  combatToughnessIn,
  controllerIn,
  hasKeywordIn,
  type GameState,
  type PlayerId,
} from '../../lib/game/index.ts';

export interface IncomingLane {
  attackerId: string;
  name: string;
  power: number;
  /** Instance ids standing in front of it. */
  blockedBy: string[];
  /** How many bodies this attacker takes. Menace makes it two. */
  blockersRequired: number;
  /** Trample means some of it lands even when the lane is held. */
  tramples: boolean;
  /** Damage this lane puts on the player if nothing else changes. */
  toPlayer: number;
}

export interface IncomingAttack {
  /** Whether anything is pointed at this seat at all. */
  under: boolean;
  lanes: IncomingLane[];
  attackers: number;
  /** Attackers with nobody in front of them. */
  unblocked: number;
  /** Life this seat loses if the declaration resolves as it stands. */
  damage: number;
  /** True when that number is at least the seat's life total. */
  lethal: boolean;
  /** Names of the players swinging, ready to print. */
  fromNames: string[];
}

/** Nothing pointed at this seat. A shared object, so a board of four does not allocate four. */
const NO_ATTACK: IncomingAttack = {
  under: false,
  lanes: [],
  attackers: 0,
  unblocked: 0,
  damage: 0,
  lethal: false,
  fromNames: [],
};

/**
 * Everything pointed at one seat, and what it costs if nobody moves.
 *
 * The damage figure is deliberately the *if nothing changes* number rather than
 * a simulation: blockers can still be declared, tricks can still be cast, and a
 * board that promises an outcome it cannot guarantee is worse than one that
 * says nothing. Trample is the one exception worth counting, because a trampler
 * held by a single small blocker still takes a bite out of the player and a
 * defender who does not know that has been misled by the interface.
 */
export function incomingAttack(state: GameState, playerId: PlayerId): IncomingAttack {
  if (state.status !== 'playing') return NO_ATTACK;

  const lanes: IncomingLane[] = [];
  const fromNames: string[] = [];
  let damage = 0;
  let unblocked = 0;

  for (const lane of combatLanes(state)) {
    if (lane.defenderPlayerId !== playerId || !lane.attacker) continue;

    const power = Math.max(0, combatPowerIn(state, lane.attacker));
    const tramples = hasKeywordIn(state, lane.attacker, 'trample');
    const held = lane.blockers.length >= lane.blockersRequired;

    /* Held by too few bodies is not held at all: a menacing attacker with one
       creature in front of it is unblocked, and saying otherwise is the exact
       kind of quiet wrong answer the owner has been running into. */
    let toPlayer = 0;
    if (!held) {
      toPlayer = power;
      unblocked += 1;
    } else if (tramples) {
      /* Asked of the layer engine, not read off the printed line: a blocker
         holding a +1/+1 counter soaks one more, and `combatToughnessIn` is
         where that already lives. */
      const soak = lane.blockers.reduce(
        (sum, blocker) => sum + Math.max(0, combatToughnessIn(state, blocker)),
        0
      );
      toPlayer = Math.max(0, power - soak);
    }

    damage += toPlayer;
    lanes.push({
      attackerId: lane.attacker.instanceId,
      name: lane.attacker.name,
      power,
      blockedBy: [...lane.declaration.blockedBy],
      blockersRequired: lane.blockersRequired,
      tramples,
      toPlayer,
    });

    const owner = controllerIn(state, lane.attacker);
    const name = state.players.find(p => p.id === owner)?.name;
    if (name && fromNames.indexOf(name) === -1) fromNames.push(name);
  }

  if (lanes.length === 0) return NO_ATTACK;

  const player = state.players.find(p => p.id === playerId);
  return {
    under: true,
    lanes,
    attackers: lanes.length,
    unblocked,
    damage,
    lethal: !!player && damage >= player.life,
    fromNames,
  };
}

/**
 * The sentence the defending seat's band carries.
 *
 * Two facts and no jargon: how many are coming, and what it costs. The second
 * half changes as blockers go in, which is the whole point — a player assigning
 * blocks watches the number fall and knows when to stop.
 */
export function incomingSentence(attack: IncomingAttack): string {
  if (!attack.under) return '';

  const count = `${attack.attackers} attacker${attack.attackers === 1 ? '' : 's'}`;
  if (attack.damage === 0) {
    return `${count}, all blocked`;
  }
  if (attack.unblocked === attack.attackers) {
    return `${count}, ${attack.damage} damage`;
  }
  return `${count}, ${attack.damage} still getting through`;
}

/** What this seat is swinging with, for the attacker's own band. */
export interface OutgoingAttack {
  attacking: boolean;
  attackers: number;
  /** Total power declared, before any blocks. */
  power: number;
  /** Names of the seats being swung at. */
  atNames: string[];
}

const NO_SWING: OutgoingAttack = { attacking: false, attackers: 0, power: 0, atNames: [] };

export function outgoingAttack(state: GameState, playerId: PlayerId): OutgoingAttack {
  if (state.status !== 'playing') return NO_SWING;

  let attackers = 0;
  let power = 0;
  const atNames: string[] = [];

  for (const declaration of state.combat.attackers) {
    const card = state.cards[declaration.attackerId];
    if (!card || controllerIn(state, card) !== playerId) continue;
    attackers += 1;
    power += Math.max(0, combatPowerIn(state, card));
    const name = state.players.find(p => p.id === declaration.defenderPlayerId)?.name;
    if (name && atNames.indexOf(name) === -1) atNames.push(name);
  }

  if (attackers === 0) return NO_SWING;
  return { attacking: true, attackers, power, atNames };
}

export function outgoingSentence(swing: OutgoingAttack): string {
  if (!swing.attacking) return '';
  const at = swing.atNames.length === 1 ? swing.atNames[0] : `${swing.atNames.length} players`;
  return `Attacking ${at} with ${swing.attackers}`;
}

/* -------------------------------------------------------------------------- */
/* What one card says about combat                                            */
/* -------------------------------------------------------------------------- */

export interface CombatMark {
  role: 'attacker' | 'blocker';
  /** Short enough for a chip under a 62px card. Truncated by CSS beyond that. */
  text: string;
  /** The full sentence, for the title attribute and a screen reader. */
  detail: string;
}

/**
 * The line a permanent carries while combat is happening, or null.
 *
 * Owner: *"attacking and blocking doesn't seem very clear at all"*. Before this,
 * an attacking creature was drawn lifted and scaled with its power and toughness
 * over it, and that was the entire record on the board of who it was hitting.
 * With four creatures swinging at four different seats — which is the normal
 * shape of a Commander game — the board could not answer "who is attacking
 * whom" at all; the only place the answer existed was one line in the log.
 *
 * Blockers are the same question from the other side, and worse, because a
 * block is a PAIRING and a lifted card cannot show a pairing. Naming the
 * attacker on the blocker is what lets a player check their own assignment
 * without clicking anything.
 *
 * `viewerId` only changes the pronoun. Everything else is the same on every
 * seat, because an opponent's board has to be readable — that is the whole
 * point of the upright quads.
 */
export function combatMarkFor(
  state: GameState,
  instanceId: string,
  viewerId: PlayerId
): CombatMark | null {
  if (state.status !== 'playing' || state.combat.attackers.length === 0) return null;

  const attacking = state.combat.attackers.find(d => d.attackerId === instanceId);
  if (attacking) {
    const card = state.cards[instanceId];
    const defender = state.players.find(p => p.id === attacking.defenderPlayerId);
    const at = !defender ? 'someone' : defender.id === viewerId ? 'you' : defender.name;
    const held = attacking.blockedBy.length;

    if (held > 0) {
      return {
        role: 'attacker',
        text: `held by ${held}`,
        detail: `${card?.name ?? 'This creature'} is attacking ${at} and ${held} creature${
          held === 1 ? ' is' : 's are'
        } blocking it.`,
      };
    }
    return {
      role: 'attacker',
      text: `hits ${at}`,
      detail: `${card?.name ?? 'This creature'} is attacking ${at} and nothing is blocking it.`,
    };
  }

  const blocking = state.combat.attackers.find(d => d.blockedBy.indexOf(instanceId) !== -1);
  if (blocking) {
    const attacker = state.cards[blocking.attackerId];
    return {
      role: 'blocker',
      text: `blocks ${attacker?.name ?? 'it'}`,
      detail: `${state.cards[instanceId]?.name ?? 'This creature'} is blocking ${
        attacker?.name ?? 'an attacker'
      }.`,
    };
  }

  return null;
}
