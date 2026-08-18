/**
 * DeckMatrix — shared game-state core: the stack and priority (CR 117, 405, 608).
 *
 * ## Provenance
 *
 * The model here is ported from XMage (https://github.com/magefree/mage,
 * MIT licensed) — specifically the shape of `mage.game.stack.SpellStack`,
 * `mage.game.stack.StackObject` and the priority loop in `mage.game.GameImpl`.
 * The MIT notice is retained for the ported portions and XMage is credited in
 * the project's licences.
 *
 * ## What was deliberately NOT ported
 *
 * XMage's stack holds live Java objects and resolution is `object.resolve(game)`
 * — a virtual call on a mutable graph, with each of ~25,000 card classes
 * supplying its own body. That is a fine design for a JVM server holding each
 * game in memory. It is the wrong design here, because DeckMatrix's product
 * requirement is that *a game is its action log*: pure functions, no clock, no
 * unseeded randomness, no class instances in state, everything
 * `JSON.stringify`-able, so a client replaying the log lands on byte-identical
 * state and only actions ever cross the wire.
 *
 * So the model was translated, not the mechanism:
 *
 *   - a `StackObject` is a plain record (`types.ts`), not an object with methods;
 *   - what it *does* is a list of declarative `StackEffect` values — the same
 *     DSL the oracle-text compiler emits into;
 *   - resolution is a pure function from a `StackObject` to `GameAction[]`,
 *     which the reducer then folds. A resolution is therefore a sequence of
 *     ordinary logged actions, replayable and undoable like anything else;
 *   - split second and "can't be countered" are flags on the record, checked in
 *     one place each, rather than subclasses or special cases in the loop.
 *
 * ## The rules encoded here
 *
 *   - **CR 601** announcement: the card leaves hand or the command zone for the
 *     stack, targets are locked in, and its controller keeps priority.
 *   - **CR 117.3–117.4** priority: whoever holds it may act; passing moves it in
 *     turn order; a full round of passes resolves one object (or, on an empty
 *     stack, ends the step); after a resolution priority returns to the active
 *     player, and every player has to pass again.
 *   - **CR 608.2b** fizzling: targets are checked *again* on resolution. If every
 *     target an object was announced with is now illegal, it does not resolve.
 *     If only some are illegal, it resolves and does as much as it can. Note
 *     that "can't be countered" does **not** save a spell from this — CR 608.2b
 *     is not countering, which is why `cantBeCountered` is checked in
 *     `COUNTER_SPELL` and nowhere near `willFizzle`.
 *   - **CR 400.7 / 608.2b** a card that has changed zones since it was targeted
 *     is a new object and therefore an illegal target. That is why
 *     `StackTarget` records the zone it was chosen in.
 *   - **CR 702.61a** split second: while such a spell is on the stack, nothing
 *     but mana abilities and triggers may go on the stack.
 *
 * Nothing here applies anything. Every function is either a selector over state
 * or a pure state transform called by `rules.ts`.
 */

import type {
  CardInstance,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  StackEffect,
  StackObject,
  StackObjectId,
  StackTarget,
  StackTargetSelector,
  ValidationResult,
  Zone,
} from './types.ts';
import { getCard, getPlayer, isAlive, livingPlayers, nextLivingPlayer } from './rules.ts';
import { canBeTargetedBy } from './keywords.ts';

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The stack, bottom first. Always read through this: `GameState.stack` is
 * optional so a state persisted before the stack existed still loads.
 */
export function stackOf(state: GameState): readonly StackObject[] {
  return state.stack ?? [];
}

/** CR 405.2 — the last object put on the stack is the first to resolve. */
export function stackTop(state: GameState): StackObject | undefined {
  const stack = stackOf(state);
  return stack.length > 0 ? stack[stack.length - 1] : undefined;
}

export function stackIsEmpty(state: GameState): boolean {
  return stackOf(state).length === 0;
}

export function stackHeight(state: GameState): number {
  return stackOf(state).length;
}

export function stackObject(state: GameState, stackId: StackObjectId): StackObject | undefined {
  return stackOf(state).find(object => object.stackId === stackId);
}

/** CR 702.61a — is a split-second spell waiting on the stack right now. */
export function hasSplitSecond(state: GameState): boolean {
  return stackOf(state).some(object => !!object.splitSecond);
}

/** Players who have passed in succession since the stack last changed. */
export function passedPriorityOf(state: GameState): readonly PlayerId[] {
  return state.passedPriority ?? [];
}

export function hasPriority(state: GameState, playerId: PlayerId): boolean {
  return state.priorityPlayerId === playerId;
}

/**
 * CR 117.4 — has every player still in the game passed since the last object
 * resolved. Players who have lost are not in the rotation.
 */
export function allPlayersPassed(state: GameState): boolean {
  const passed = passedPriorityOf(state);
  const living = livingPlayers(state);
  if (living.length === 0) return false;
  return living.every(player => passed.includes(player.id));
}

/**
 * Whether this player may put something on the stack right now, and why not if
 * they may not. Split second (CR 702.61a) is the interesting case: it is a flag
 * on one stack object, checked once, rather than a special case threaded
 * through the priority loop.
 */
export function canRespond(state: GameState, playerId: PlayerId): ValidationResult {
  const player = getPlayer(state, playerId);
  if (!player) return { ok: false, reason: 'Unknown player.' };
  if (!isAlive(player)) return { ok: false, reason: 'That player has left the game.' };
  if (state.status !== 'playing') return { ok: false, reason: 'The game is over.' };
  if (!hasPriority(state, playerId)) return { ok: false, reason: 'You do not have priority.' };
  if (hasSplitSecond(state)) {
    return { ok: false, reason: 'A spell with split second is on the stack.' };
  }
  return { ok: true };
}

/** The stack, top first, for a UI that draws it downwards. */
export function stackTopFirst(state: GameState): StackObject[] {
  return stackOf(state).slice().reverse();
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * CR 608.2b — is this target still a legal one.
 *
 * Three ways a target goes illegal between announcement and resolution:
 * the player left the game, the card changed zones (CR 400.7 — what is there
 * now is a different object), or it gained hexproof/shroud/protection.
 */
export function targetIsLegal(
  state: GameState,
  object: StackObject,
  target: StackTarget
): boolean {
  switch (target.kind) {
    case 'player': {
      const player = target.playerId ? getPlayer(state, target.playerId) : undefined;
      return !!player && isAlive(player);
    }
    case 'card': {
      const card = target.instanceId ? getCard(state, target.instanceId) : undefined;
      if (!card || card.removedFromGame) return false;
      // Changed zones since it was targeted: a new object, so not our target.
      if (target.zone && card.zone !== target.zone) return false;
      // ...and the counter catches what the zone alone cannot — flickered out
      // and straight back, same zone, different object (CR 400.7).
      if (
        target.zoneChangeCounter !== undefined &&
        (card.zoneChangeCounter ?? 0) !== target.zoneChangeCounter
      ) {
        return false;
      }
      const source = object.sourceInstanceId ?? object.cardInstanceId;
      const sourceCard = source ? getCard(state, source) : undefined;
      return canBeTargetedBy(card, object.controllerId, sourceCard);
    }
    case 'stack':
      return !!target.stackId && !!stackObject(state, target.stackId);
    default:
      return false;
  }
}

/** The subset of an object's announced targets that are still legal. */
export function legalTargetsOf(state: GameState, object: StackObject): StackTarget[] {
  return object.targets.filter(target => targetIsLegal(state, object, target));
}

/**
 * CR 608.2b — an object that was announced with targets and has none left does
 * not resolve. An object announced with *no* targets never fizzles, however
 * dead its would-be victims are, which is the half naive implementations lose.
 */
export function willFizzle(state: GameState, object: StackObject): boolean {
  if (object.targets.length === 0) return false;
  return legalTargetsOf(state, object).length === 0;
}

/**
 * Recipients for one effect. An omitted selector means "the object's first
 * target if it has any, otherwise its controller" — the templating that covers
 * both "target player draws a card" and "you draw a card".
 */
function selectTargets(
  state: GameState,
  object: StackObject,
  selector: StackTargetSelector | undefined
): StackTarget[] {
  const resolved: StackTargetSelector =
    selector ??
    (object.targets.length > 0 ? { from: 'target', index: 0 } : { from: 'controller' });

  switch (resolved.from) {
    case 'target': {
      const target = object.targets[resolved.index];
      if (!target) return [];
      return targetIsLegal(state, object, target) ? [target] : [];
    }
    case 'controller':
      return [{ kind: 'player', playerId: object.controllerId }];
    case 'source': {
      const id = object.sourceInstanceId ?? object.cardInstanceId;
      if (!id) return [];
      const card = getCard(state, id);
      return card ? [{ kind: 'card', instanceId: id, zone: card.zone }] : [];
    }
    case 'each-player':
      return livingPlayers(state).map(player => ({
        kind: 'player' as const,
        playerId: player.id,
      }));
    case 'each-opponent':
      return livingPlayers(state)
        .filter(player => player.id !== object.controllerId)
        .map(player => ({ kind: 'player' as const, playerId: player.id }));
    case 'ref':
      return targetIsLegal(state, object, resolved.ref) ? [resolved.ref] : [];
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

function sourceCardOf(state: GameState, object: StackObject): CardInstance | undefined {
  const id = object.sourceInstanceId ?? object.cardInstanceId;
  return id ? getCard(state, id) : undefined;
}

/**
 * Compile one declarative effect into actions. Targets that went illegal have
 * already been filtered out, so an effect with nothing left to point at simply
 * produces nothing — that is partial fizzling, and it is correct.
 *
 * An effect the reducer has no action for produces a `NOTE` rather than
 * nothing, because the one invariant of this engine is that it never silently
 * does nothing.
 */
function actionsForEffect(
  state: GameState,
  object: StackObject,
  effect: StackEffect,
  at: number,
  ordinal: number
): GameAction[] {
  const cause = object.name;
  const out: GameAction[] = [];

  if (effect.op === 'note') {
    return [{ type: 'NOTE', message: effect.message, instanceId: object.cardInstanceId, at, cause }];
  }

  const targets = selectTargets(state, object, effect.to);

  targets.forEach((target, index) => {
    switch (effect.op) {
      case 'damage': {
        if (target.kind !== 'player' || !target.playerId) {
          out.push({
            type: 'NOTE',
            message: `${object.name} deals ${effect.amount} damage to a permanent — mark it by hand.`,
            instanceId: target.instanceId,
            at,
            cause,
          });
          break;
        }
        const sourceCard = sourceCardOf(state, object);
        out.push({
          type: 'DAMAGE',
          targetPlayerId: target.playerId,
          amount: effect.amount,
          sourcePlayerId: object.controllerId,
          sourceInstanceId: sourceCard?.instanceId,
          infect: effect.infect,
          at,
          cause,
        });
        break;
      }

      case 'life':
        if (target.kind === 'player' && target.playerId) {
          out.push({ type: 'LIFE_CHANGE', playerId: target.playerId, delta: effect.amount, at, cause });
        }
        break;

      case 'poison':
        if (target.kind === 'player' && target.playerId) {
          out.push({ type: 'POISON', playerId: target.playerId, delta: effect.amount, at, cause });
        }
        break;

      case 'draw':
        if (target.kind === 'player' && target.playerId) {
          out.push({ type: 'DRAW', playerId: target.playerId, count: effect.count, at, cause });
        }
        break;

      case 'counters':
        if (target.kind === 'card' && target.instanceId) {
          out.push({
            type: 'CARD_COUNTER',
            instanceId: target.instanceId,
            counter: effect.counter,
            delta: effect.delta,
            at,
            cause,
          });
        }
        break;

      case 'tap':
        if (target.kind === 'card' && target.instanceId) {
          out.push({ type: 'TAP', instanceId: target.instanceId, at, cause });
        }
        break;

      case 'untap':
        if (target.kind === 'card' && target.instanceId) {
          out.push({ type: 'UNTAP', instanceId: target.instanceId, at, cause });
        }
        break;

      case 'move':
        if (target.kind === 'card' && target.instanceId) {
          out.push({ type: 'MOVE_ZONE', instanceId: target.instanceId, to: effect.zone, at, cause });
        }
        break;

      case 'counter-spell':
        if (target.kind === 'stack' && target.stackId) {
          out.push({ type: 'COUNTER_SPELL', stackId: target.stackId, reason: object.name, at, cause });
        }
        break;

      case 'token':
        if (target.kind === 'player' && target.playerId) {
          const count = Math.max(1, effect.count ?? 1);
          for (let n = 0; n < count; n++) {
            out.push({
              type: 'CREATE_TOKEN',
              playerId: target.playerId,
              token: effect.token,
              count: 1,
              tapped: effect.tapped,
              // Deterministic and collision-free: stack id is minted from a
              // monotonic counter, so two clients derive identical ids.
              instanceId: `${object.stackId}-e${ordinal}-${index}-${n}`,
              at,
              cause,
            });
          }
        }
        break;

      default:
        break;
    }
  });

  return out;
}

/**
 * Everything a resolving object does, as actions, in order.
 *
 * `state` must be the state *after* the object has been popped off the stack —
 * CR 608.2 resolves an object that is no longer on the stack for the purposes
 * of its own effects, and it matters for a spell that counts objects on the
 * stack.
 */
export function resolutionActionsFor(
  state: GameState,
  object: StackObject,
  at = 0
): GameAction[] {
  const card = object.cardInstanceId ? getCard(state, object.cardInstanceId) : undefined;

  // CR 608.2b — every target gone means it never resolves. The card still ends
  // up in the graveyard, and the log says why rather than showing a spell that
  // silently achieved nothing.
  if (willFizzle(state, object)) {
    const out: GameAction[] = [
      {
        type: 'NOTE',
        message: `${object.name} was countered on resolution — every target it was cast at is now illegal.`,
        instanceId: object.cardInstanceId,
        at,
      },
    ];
    if (card) {
      out.push({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: 'graveyard', at, cause: object.name });
    }
    return out;
  }

  const out: GameAction[] = [];
  const destination: Zone = object.resolvesTo ?? (card ? defaultResolutionZone(card) : 'graveyard');

  // CR 608.3 — a permanent spell resolving *is* the permanent entering. Do that
  // first so the object's own effects, and any ETB trigger, see it in play.
  if (card && destination === 'battlefield') {
    out.push({
      type: 'PLAY',
      instanceId: card.instanceId,
      to: 'battlefield',
      controllerId: object.controllerId,
      at,
      cause: object.name,
    });
  }

  object.effects.forEach((effect, ordinal) => {
    out.push(...actionsForEffect(state, object, effect, at, ordinal));
  });

  // CR 608.2m — an instant or sorcery is put into its owner's graveyard as the
  // final part of its own resolution, after its effects.
  if (card && destination !== 'battlefield') {
    out.push({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: destination, at, cause: object.name });
  }

  // The honesty rule: an object that resolved and did nothing at all says so.
  if (out.length === 0) {
    out.push({
      type: 'NOTE',
      message: `${object.name} resolves — the engine applies no effects for it; resolve it by hand.`,
      instanceId: object.cardInstanceId,
      at,
    });
  }

  return out;
}

/** Instants and sorceries resolve to the graveyard; everything else stays in play. */
export function defaultResolutionZone(card: CardInstance): Zone {
  const line = (card.typeLine ?? '').toLowerCase();
  return line.includes('instant') || line.includes('sorcery') ? 'graveyard' : 'battlefield';
}

/* -------------------------------------------------------------------------- */
/* State transforms — called by the reducer in rules.ts                        */
/* -------------------------------------------------------------------------- */

/** Deterministic ids, minted off a monotonic counter that lives in state. */
function mintStackId(state: GameState): { stackId: StackObjectId; nextStackId: number } {
  const next = (state.nextStackId ?? 0) + 1;
  return { stackId: `s${next}`, nextStackId: next };
}

/**
 * CR 117.3c — a player who puts something on the stack keeps priority, and
 * everyone else has to pass again from scratch.
 */
function withObjectOnStack(state: GameState, object: StackObject, nextStackId: number): GameState {
  return {
    ...state,
    stack: [...stackOf(state), object],
    nextStackId,
    priorityPlayerId: object.controllerId,
    passedPriority: [],
  };
}

/** CR 601 — announce a spell. `rules.ts` moves the card; this builds the object. */
export function castSpell(
  state: GameState,
  action: Extract<GameAction, { type: 'CAST_SPELL' }>
): { state: GameState; object: StackObject } | null {
  const card = getCard(state, action.instanceId);
  if (!card) return null;

  const controllerId = action.controllerId ?? card.controllerId ?? card.ownerId;
  const minted = mintStackId(state);
  const stackId = action.stackId ?? minted.stackId;

  // Optional flags are only written when they are actually set. A key holding
  // `undefined` disappears through `JSON.stringify`, so a state built in memory
  // and the same state rehydrated off the wire would not compare equal — and
  // anything hashing state for a desync check would see two different games.
  const object: StackObject = {
    stackId,
    kind: 'spell',
    name: card.name,
    controllerId,
    cardInstanceId: card.instanceId,
    targets: action.targets ?? [],
    effects: action.effects ?? [],
    resolvesTo: action.resolvesTo ?? defaultResolutionZone(card),
    ...(action.splitSecond ? { splitSecond: true } : {}),
    ...(action.cantBeCountered ? { cantBeCountered: true } : {}),
    turn: state.turn,
  };

  return { state: withObjectOnStack(state, object, minted.nextStackId), object };
}

/** CR 602 / 603 — put an activated or triggered ability on the stack. */
export function putAbilityOnStack(
  state: GameState,
  action: Extract<GameAction, { type: 'PUT_ABILITY_ON_STACK' }>
): { state: GameState; object: StackObject } | null {
  if (!getPlayer(state, action.controllerId)) return null;
  const minted = mintStackId(state);
  const stackId = action.stackId ?? minted.stackId;

  const object: StackObject = {
    stackId,
    kind: action.kind ?? 'triggered',
    name: action.name,
    controllerId: action.controllerId,
    ...(action.sourceInstanceId ? { sourceInstanceId: action.sourceInstanceId } : {}),
    targets: action.targets ?? [],
    effects: action.effects ?? [],
    turn: state.turn,
  };

  return { state: withObjectOnStack(state, object, minted.nextStackId), object };
}

/**
 * CR 608 — take the top object off. The card it left behind is moved by the
 * follow-up actions `resolutionActionsFor` produces, so the whole resolution is
 * visible in the log as ordinary actions.
 *
 * CR 117.3b — the active player receives priority afterwards, and everybody has
 * to pass again.
 */
export function popStack(state: GameState): { state: GameState; object: StackObject } | null {
  const stack = stackOf(state);
  if (stack.length === 0) return null;
  const object = stack[stack.length - 1];
  return {
    object,
    state: {
      ...state,
      stack: stack.slice(0, -1),
      priorityPlayerId: state.activePlayerId,
      passedPriority: [],
    },
  };
}

/**
 * CR 701.5 — remove an object from the stack without resolving it. The card, if
 * there is one, is moved to the graveyard by a follow-up action.
 *
 * `cantBeCountered` is refused in `validateAction`, not here, so a UI gets a
 * reason it can show rather than a silently ignored click.
 */
export function counterStackObject(state: GameState, stackId: StackObjectId): GameState {
  const stack = stackOf(state);
  const index = stack.findIndex(object => object.stackId === stackId);
  if (index === -1) return state;
  return {
    ...state,
    stack: [...stack.slice(0, index), ...stack.slice(index + 1)],
    passedPriority: [],
  };
}

/**
 * CR 117.3d — pass priority. Everyone passing in succession is what resolves
 * the top of the stack, or ends the step on an empty one; that consequence is
 * derived in `stackFollowUps` so the log shows it as its own action.
 */
export function passPriority(state: GameState, playerId: PlayerId): GameState {
  const passed = passedPriorityOf(state);
  const nextPassed = passed.includes(playerId) ? [...passed] : [...passed, playerId];

  const living = livingPlayers(state);
  const everyone = living.every(player => nextPassed.includes(player.id));

  if (everyone) {
    // Priority is handed on by the follow-up (resolution or step change); the
    // pass list stays full so `stackFollowUps` can see the round completed.
    return { ...state, passedPriority: nextPassed };
  }

  const upNext = nextLivingPlayer(state, playerId);
  return {
    ...state,
    passedPriority: nextPassed,
    priorityPlayerId: upNext?.id ?? state.priorityPlayerId,
  };
}

/** Wipe the stack and the priority round. Used by `resetGame`. */
export function clearStack(state: GameState): GameState {
  return { ...state, stack: [], passedPriority: [], nextStackId: 0 };
}

/**
 * Give priority to the active player and start a fresh round of passes. Called
 * by `rules.ts` whenever a step or turn begins (CR 117.3a).
 */
export function resetPriority(state: GameState): GameState {
  if (state.priorityPlayerId === state.activePlayerId && passedPriorityOf(state).length === 0) {
    return state;
  }
  return { ...state, priorityPlayerId: state.activePlayerId, passedPriority: [] };
}

/* -------------------------------------------------------------------------- */
/* Derived follow-ups — the hook `applyAction` calls                          */
/* -------------------------------------------------------------------------- */

/**
 * What else has to happen because of the action just applied. Pure, and derived
 * from state alone, so every client computes the identical chain from the same
 * log — which is the whole reason these are derived rather than sent.
 */
export function stackFollowUps(
  prev: GameState,
  action: GameAction,
  next: GameState,
  at = 0
): GameAction[] {
  if (next.status !== 'playing') return [];

  switch (action.type) {
    case 'PASS_PRIORITY': {
      if (!allPlayersPassed(next)) return [];
      // CR 117.4 — a full round of passes resolves the top object, or ends the
      // step when there is nothing to resolve.
      return stackIsEmpty(next)
        ? [{ type: 'ADVANCE_STEP', at }]
        : [{ type: 'RESOLVE_STACK', at }];
    }

    case 'RESOLVE_STACK': {
      const object = stackTop(prev);
      if (!object) return [];
      return resolutionActionsFor(next, object, at);
    }

    case 'COUNTER_SPELL': {
      const object = stackObject(prev, action.stackId);
      if (!object?.cardInstanceId) return [];
      const card = getCard(next, object.cardInstanceId);
      if (!card || card.zone !== 'stack') return [];
      return [
        {
          type: 'MOVE_ZONE',
          instanceId: card.instanceId,
          to: 'graveyard',
          at,
          cause: action.reason ?? 'Countered',
        },
      ];
    }

    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Composite moves — what a UI or a bot actually calls                        */
/* -------------------------------------------------------------------------- */

/**
 * Passing priority, as an action. The consequences (resolving, or advancing the
 * step) are derived by `stackFollowUps`, so a client only ever has to send
 * this one.
 */
export function passPriorityAction(state: GameState, playerId?: PlayerId, at = 0): GameAction {
  return { type: 'PASS_PRIORITY', playerId: playerId ?? state.priorityPlayerId, at };
}

/**
 * Pass for every player in turn order until the stack is empty and the step is
 * ready to end. This is the "nobody wants to respond" button, and the bot's
 * default answer to holding priority.
 */
export function passUntilResolved(state: GameState, at = 0): GameAction[] {
  const out: GameAction[] = [];
  const living = livingPlayers(state);
  // One pass per living player is exactly a full round; the round's consequence
  // is derived, so this never needs to know what it will cause.
  for (let i = 0; i < living.length; i++) {
    out.push({ type: 'PASS_PRIORITY', at });
  }
  return out;
}

export interface CastOnStackOptions {
  targets?: StackTarget[];
  effects?: StackEffect[];
  resolvesTo?: Zone;
  splitSecond?: boolean;
  cantBeCountered?: boolean;
  stackId?: StackObjectId;
  at?: number;
}

/** Announce a spell onto the stack. Mana is `moves.ts`'s problem, not this one. */
export function castSpellAction(
  controllerId: PlayerId,
  instanceId: InstanceId,
  options: CastOnStackOptions = {}
): GameAction {
  return {
    type: 'CAST_SPELL',
    instanceId,
    controllerId,
    targets: options.targets,
    effects: options.effects,
    resolvesTo: options.resolvesTo,
    splitSecond: options.splitSecond,
    cantBeCountered: options.cantBeCountered,
    stackId: options.stackId,
    at: options.at ?? 0,
  };
}

/** Put a triggered or activated ability on the stack. */
export function abilityAction(
  controllerId: PlayerId,
  name: string,
  options: {
    kind?: 'triggered' | 'activated';
    sourceInstanceId?: InstanceId;
    targets?: StackTarget[];
    effects?: StackEffect[];
    stackId?: StackObjectId;
    at?: number;
  } = {}
): GameAction {
  return {
    type: 'PUT_ABILITY_ON_STACK',
    controllerId,
    name,
    kind: options.kind ?? 'triggered',
    sourceInstanceId: options.sourceInstanceId,
    targets: options.targets,
    effects: options.effects,
    stackId: options.stackId,
    at: options.at ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Target builders                                                            */
/* -------------------------------------------------------------------------- */

export function targetPlayer(playerId: PlayerId): StackTarget {
  return { kind: 'player', playerId };
}

/**
 * Target a permanent or card. The zone is captured now, because on resolution
 * "same card, different zone" means "different object" (CR 400.7).
 */
export function targetCard(state: GameState, instanceId: InstanceId): StackTarget {
  const card = getCard(state, instanceId);
  return {
    kind: 'card',
    instanceId,
    ...(card ? { zone: card.zone, zoneChangeCounter: card.zoneChangeCounter ?? 0 } : {}),
  };
}

export function targetStackObject(stackId: StackObjectId): StackTarget {
  return { kind: 'stack', stackId };
}

/* -------------------------------------------------------------------------- */
/* Prose                                                                      */
/* -------------------------------------------------------------------------- */

export function describeStackObject(state: GameState, object: StackObject): string {
  const controller = getPlayer(state, object.controllerId)?.name ?? 'A player';
  const flags: string[] = [];
  if (object.splitSecond) flags.push('split second');
  if (object.cantBeCountered) flags.push("can't be countered");
  const suffix = flags.length > 0 ? ` (${flags.join(', ')})` : '';

  if (object.kind === 'spell') return `${controller} cast ${object.name}${suffix}.`;
  const verb = object.kind === 'activated' ? 'activated' : 'triggered';
  return `${object.name} ${verb}${suffix}.`;
}

/** One line per object, top of the stack first. For the game feed and the HUD. */
export function describeStack(state: GameState): string[] {
  return stackTopFirst(state).map(object => describeStackObject(state, object));
}
