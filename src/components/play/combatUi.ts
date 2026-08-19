/**
 * What a click on a card means while combat is being declared.
 *
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens, attack button should be a
 * sword icon or something too"*, and earlier: *"doesnt seem like enemy on play
 * mode is attacking, no way to attack with it and block stages - needs to be
 * just like real MTG game and all actions that can be taken"*.
 *
 * So attacking is a sword on the creature, on the board the player is already
 * looking at, and this module is the part of that with no pixels in it: given a
 * state, a seat and a card, what does that card offer right now, and if it
 * offers nothing, why not. Keeping it separate from `SeatMat` is what makes it
 * testable without a DOM — every rule below is asserted in `combatUi.test.ts`,
 * which runs under `node --test` alongside the engine's own suites. That is why
 * the engine is imported by relative path here rather than through the `@/`
 * alias: `npm test` has no bundler to resolve one, and a module the tests
 * cannot load is a module whose rules are only claimed to be checked.
 *
 * ## Legality is asked, never restated
 *
 * `eligibleAttackers`, `eligibleBlockers`, `canBlock` and `validateBlockGroup`
 * live in `src/lib/game/combat.ts` and are the authority. Nothing here decides
 * whether a play is legal; it decides what to *draw*, and it draws it by asking.
 * The one thing this file does compute is the prose for a creature that cannot
 * take part — "tapped", "summoning sick" — because a greyed-out card that will
 * not say why is the complaint that produced this work in the first place.
 *
 * ## The two gestures
 *
 * **Attacking** is one press: the sword chip on your creature declares it, and
 * pressing it again takes it back. Both go straight to the engine, so
 * `state.combat` is the only record of who is swinging and the card inspector's
 * Attack button and the chip cannot disagree.
 *
 * **Blocking** is two presses, because a block is a pairing and a pairing needs
 * two ends: arm one of your creatures, then press the attacker it stands in
 * front of. That is also the order a player says it out loud in — "Bears blocks
 * the Baloth" — and it is why an incoming attacker always carries a chip, even
 * before anything is armed: the disabled chip is what tells you the gesture
 * exists.
 */

import {
  canBlock,
  controllerIn,
  eligibleAttackers,
  eligibleBlockers,
  hasKeywordIn,
  isCreatureIn,
  isUnderAttack,
  statLineIn,
  type CardInstance,
  type GameState,
  type PlayerId,
} from '../../lib/game/index.ts';

/** The decision being made on the board right now, from this seat's point of view. */
export type CombatStage = 'attackers' | 'blockers' | null;

/**
 * Which control a card carries.
 *
 *   attack    — your creature, able to swing, not yet declared
 *   attacking — your creature, already swinging; pressing takes it back
 *   block     — your creature, able to block; pressing arms it
 *   armed     — your creature, armed and waiting for an attacker to be named
 *   blocking  — your creature, already in front of something
 *   target    — an attacker pointed at you; pressing puts the armed body in its way
 */
export type CombatChipKind = 'attack' | 'attacking' | 'block' | 'armed' | 'blocking' | 'target';

export interface CardCombat {
  /** The control to draw on this card, or null for none. */
  chip: CombatChipKind | null;
  /** False draws the chip inert. A disabled chip always has a reason. */
  enabled: boolean;
  /** Said on hover and to a screen reader. Never empty when there is a chip. */
  label: string;
  /**
   * Grey the card out: it is a creature that this step is about and it cannot
   * take part. Reuses `GameCardView`'s existing `dimmed`, which is the same
   * language the hand uses for a card you cannot cast — deliberately not a
   * third vocabulary.
   */
  dimmed: boolean;
}

const NONE: CardCombat = { chip: null, enabled: false, label: '', dimmed: false };

/** Which combat decision this seat owes the table, or null. */
export function combatStageFor(state: GameState, viewerId: PlayerId): CombatStage {
  if (state.status !== 'playing') return null;
  if (state.step === 'declare_attackers' && state.activePlayerId === viewerId) return 'attackers';
  if (state.step === 'declare_blockers' && isUnderAttack(state, viewerId)) return 'blockers';
  return null;
}

/** Everything this seat has swinging, as instance ids. */
export function declaredAttackerIds(state: GameState, viewerId: PlayerId): string[] {
  return state.combat.attackers
    .filter(declaration => {
      const card = state.cards[declaration.attackerId];
      return !!card && controllerIn(state, card) === viewerId;
    })
    .map(declaration => declaration.attackerId);
}

/** The declaration this creature is blocking, or undefined. */
export function blockAssignmentOf(state: GameState, instanceId: string) {
  return state.combat.attackers.find(
    declaration => declaration.blockedBy.indexOf(instanceId) !== -1
  );
}

/** Attackers pointed at this seat, as declarations. */
export function attacksAgainst(state: GameState, viewerId: PlayerId) {
  return state.combat.attackers.filter(
    declaration => declaration.defenderPlayerId === viewerId && !!state.cards[declaration.attackerId]
  );
}

/**
 * Why this creature of yours cannot be declared, in words.
 *
 * Mirrors the checks in `eligibleAttackers` — deliberately, and only to explain
 * a card the engine has already excluded. The engine decides; this narrates.
 */
function whyCannotAttack(state: GameState, card: CardInstance): string {
  if (card.tapped) return `${card.name} is tapped.`;
  if (card.summoningSick && !hasKeywordIn(state, card, 'haste')) {
    return `${card.name} came down this turn and has no haste, so it cannot attack yet.`;
  }
  if (hasKeywordIn(state, card, 'defender')) return `${card.name} has defender.`;
  return `${card.name} cannot attack right now.`;
}

function whyCannotBlock(state: GameState, card: CardInstance): string {
  if (card.tapped) return `${card.name} is tapped and cannot block.`;
  return `${card.name} cannot block right now.`;
}

export interface CombatViewOptions {
  /** The blocker the player has picked up and not yet put in front of anything. */
  armedBlockerId?: string | null;
}

/**
 * What this one card offers this one seat, right now.
 *
 * Returns `NONE` for everything the stage is not about — an opponent's land, a
 * card in a graveyard, anything at all when no decision is owed — so the board
 * outside combat is exactly the board it was before.
 */
export function cardCombatFor(
  state: GameState,
  viewerId: PlayerId,
  card: CardInstance,
  stage: CombatStage,
  options: CombatViewOptions = {}
): CardCombat {
  if (!stage) return NONE;
  if (card.zone !== 'battlefield') return NONE;
  if (!isCreatureIn(state, card)) return NONE;

  const mine = controllerIn(state, card) === viewerId;

  if (stage === 'attackers') {
    if (!mine) return NONE;

    const attacking = state.combat.attackers.some(d => d.attackerId === card.instanceId);
    if (attacking) {
      return {
        chip: 'attacking',
        enabled: true,
        label: `${card.name} is attacking. Press to call it back.`,
        dimmed: false,
      };
    }

    const able = eligibleAttackers(state, viewerId).some(c => c.instanceId === card.instanceId);
    if (able) {
      return {
        chip: 'attack',
        enabled: true,
        label: `Attack with ${card.name} (${statLineIn(state, card) ?? '?'})`,
        dimmed: false,
      };
    }

    return { chip: null, enabled: false, label: whyCannotAttack(state, card), dimmed: true };
  }

  /* --- declare blockers ------------------------------------------------- */

  const armedId = options.armedBlockerId ?? null;
  const armed = armedId ? state.cards[armedId] ?? null : null;

  if (mine) {
    const assignment = blockAssignmentOf(state, card.instanceId);
    if (assignment) {
      const attacker = state.cards[assignment.attackerId];
      return {
        chip: 'blocking',
        enabled: true,
        label: `${card.name} is blocking ${attacker?.name ?? 'an attacker'}. Press to take it back.`,
        dimmed: false,
      };
    }

    const able = eligibleBlockers(state, viewerId).some(c => c.instanceId === card.instanceId);
    if (able) {
      const isArmed = armedId === card.instanceId;
      return {
        chip: isArmed ? 'armed' : 'block',
        enabled: true,
        label: isArmed
          ? `${card.name} is ready. Now press the attacker it blocks.`
          : `Block with ${card.name} (${statLineIn(state, card) ?? '?'})`,
        dimmed: false,
      };
    }

    return { chip: null, enabled: false, label: whyCannotBlock(state, card), dimmed: true };
  }

  /* Somebody else's creature. It only carries a control if it is swinging at
     this seat — an attack pointed at a third player is not ours to answer. */
  const incoming = state.combat.attackers.find(
    d => d.attackerId === card.instanceId && d.defenderPlayerId === viewerId
  );
  if (!incoming) return NONE;

  if (!armed) {
    return {
      chip: 'target',
      enabled: false,
      label: `${card.name} is attacking you. Pick one of your creatures first, then press this.`,
      dimmed: false,
    };
  }

  if (!canBlock(state, card, armed)) {
    return {
      chip: 'target',
      enabled: false,
      label: `${armed.name} cannot block ${card.name}.`,
      dimmed: false,
    };
  }

  return {
    chip: 'target',
    enabled: true,
    label: `Block ${card.name} (${statLineIn(state, card) ?? '?'}) with ${armed.name}`,
    dimmed: false,
  };
}

/* -------------------------------------------------------------------------- */
/* The sentence the combat bar says                                           */
/* -------------------------------------------------------------------------- */

/** A player's name, as a subject or an object, from this seat's point of view. */
export function nameOf(
  state: GameState,
  playerId: PlayerId | null | undefined,
  viewerId: PlayerId,
  capital: boolean
): string {
  if (!playerId) return capital ? 'Someone' : 'someone';
  if (playerId === viewerId) return capital ? 'You' : 'you';
  const player = state.players.find(p => p.id === playerId);
  return player?.name ?? (capital ? 'Someone' : 'someone');
}

/**
 * "You attack Yeva with 2." — one sentence, in a language a person speaks.
 *
 * The bug this replaces shipped the literal string **"You attacks a player"**:
 * the subject and the verb were chosen by different pieces of code and never
 * agreed, and the object was a placeholder nobody had ever looked up. Both are
 * chosen together here, once, and the object is the real defender's real name,
 * so the two halves cannot fall out of agreement again.
 */
export function combatSentence(state: GameState, viewerId: PlayerId): string {
  const declarations = state.combat.attackers.filter(d => !!state.cards[d.attackerId]);
  if (declarations.length === 0) return '';

  const attacker = state.cards[declarations[0].attackerId];
  const aggressorId = attacker ? controllerIn(state, attacker) : null;
  const isViewer = aggressorId === viewerId;

  const defenders = declarations
    .map(d => d.defenderPlayerId)
    .filter((id, index, all): id is PlayerId => !!id && all.indexOf(id) === index);

  const subject = nameOf(state, aggressorId, viewerId, true);
  const verb = isViewer ? 'attack' : 'attacks';
  const object =
    defenders.length === 1
      ? nameOf(state, defenders[0], viewerId, false)
      : `${defenders.length} players`;

  const count = declarations.length;
  return `${subject} ${verb} ${object} with ${count} creature${count === 1 ? '' : 's'}`;
}
