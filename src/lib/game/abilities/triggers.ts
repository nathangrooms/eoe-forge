/**
 * DeckMatrix — the card-ability DSL: triggered abilities.
 *
 * ## Events are DERIVED, not dispatched
 *
 * XMage has a live `GameEvent` bus: something fires an event, listeners react,
 * and the game is a mutable object graph being mutated as it goes. That cannot
 * be replayed from a log, so we do the opposite. `eventsBetween(prev, next,
 * action)` DIFFS two states and says what happened. Two clients holding the
 * same before-and-after therefore derive the identical event list, without any
 * event ever crossing the wire.
 *
 * This is also why a trigger is not a subscription. There is nothing to
 * register, nothing to unregister, and no way for a permanent to leave a stale
 * listener behind when it dies — a whole class of bug that simply cannot occur
 * in a diffing model.
 *
 * ## Ordering
 *
 * Triggers are returned in APNAP order (active player first, then the rest in
 * turn order), and within one player in battlefield order. That is CR 603.3b's
 * rule and, just as importantly, it is deterministic: the order is a function
 * of the state, so it is the same on every screen.
 */

import type {
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  Step,
  Zone,
} from '../types.ts';
import type { Ability, TriggerEvent, TriggeredAbility } from './dsl.ts';
import { assertNever } from './dsl.ts';
import type { AbilityContext } from './query.ts';
import { evalCondition, resolveSelector, resolvePlayers } from './query.ts';
import { deriveState } from './continuous.ts';
import { abilitiesFor } from './registry.ts';

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export type AbilityEventKind =
  | 'zone-change'
  | 'attacks'
  | 'blocks'
  | 'becomes-blocked'
  | 'step'
  | 'tapped'
  | 'untapped'
  | 'counter-added'
  | 'gains-life'
  | 'loses-life'
  | 'draws-card'
  | 'cast'
  | 'deals-damage';

/**
 * One thing that happened, as a value.
 *
 * `stateForSubject` matters more than it looks: a permanent that DIED is in the
 * graveyard in the after-state, so "another creature you control dies" has to
 * be matched against the state where it was still on the battlefield. Carrying
 * the right state with the event is what stops death triggers silently missing.
 */
export interface AbilityEvent {
  kind: AbilityEventKind;
  subjectId?: InstanceId;
  playerId?: PlayerId;
  from?: Zone;
  to?: Zone;
  counter?: string;
  step?: Step;
  amount?: number;
  combat?: boolean;
  /** Which state a selector naming the subject should be resolved against. */
  stateForSubject: 'prev' | 'next';
}

function zoneMap(state: GameState): Record<InstanceId, Zone> {
  const out: Record<InstanceId, Zone> = {};
  for (const id of Object.keys(state.cards)) {
    const card = state.cards[id];
    if (card && !card.removedFromGame) out[id] = card.zone;
  }
  return out;
}

/**
 * What happened between two states, as a list of events.
 *
 * Pure and total: it looks only at the two states and the action that caused
 * the change, never at a clock or a counter outside the state.
 */
export function eventsBetween(prev: GameState, action: GameAction, next: GameState): AbilityEvent[] {
  const out: AbilityEvent[] = [];

  /* --- zone changes, the general primitive --- */
  const before = zoneMap(prev);
  const after = zoneMap(next);
  for (const id of Object.keys(after)) {
    const from = before[id];
    const to = after[id];
    if (from === to) continue;
    out.push({
      kind: 'zone-change',
      subjectId: id,
      from,
      to,
      // Something arriving is present in the after-state; something leaving is
      // only fully described by the before-state.
      stateForSubject: to === 'battlefield' ? 'next' : 'prev',
    });
  }
  for (const id of Object.keys(before)) {
    if (after[id] !== undefined) continue;
    out.push({ kind: 'zone-change', subjectId: id, from: before[id], stateForSubject: 'prev' });
  }

  /* --- tap state --- */
  for (const id of Object.keys(next.cards)) {
    const wasTapped = prev.cards[id]?.tapped;
    const isTapped = next.cards[id]?.tapped;
    if (wasTapped === undefined || wasTapped === isTapped) continue;
    if (next.cards[id]?.zone !== 'battlefield') continue;
    out.push({ kind: isTapped ? 'tapped' : 'untapped', subjectId: id, stateForSubject: 'next' });
  }

  /* --- counters --- */
  for (const id of Object.keys(next.cards)) {
    const wasCounters = prev.cards[id]?.counters;
    const nowCounters = next.cards[id]?.counters;
    if (!wasCounters || !nowCounters) continue;
    for (const counter of Object.keys(nowCounters)) {
      const added = (nowCounters[counter] ?? 0) - (wasCounters[counter] ?? 0);
      if (added <= 0) continue;
      out.push({
        kind: 'counter-added',
        subjectId: id,
        counter,
        amount: added,
        stateForSubject: 'next',
      });
    }
  }

  /* --- life --- */
  for (const player of next.players) {
    const was = prev.players.find(p => p.id === player.id);
    if (!was || was.life === player.life) continue;
    const delta = player.life - was.life;
    out.push({
      kind: delta > 0 ? 'gains-life' : 'loses-life',
      playerId: player.id,
      amount: Math.abs(delta),
      stateForSubject: 'next',
    });
  }

  /* --- draws --- */
  if (action.type === 'DRAW') {
    const player = next.players.find(p => p.id === action.playerId);
    const was = prev.players.find(p => p.id === action.playerId);
    const drawn = (player?.zones.hand.length ?? 0) - (was?.zones.hand.length ?? 0);
    for (let n = 0; n < drawn; n++) {
      out.push({ kind: 'draws-card', playerId: action.playerId, stateForSubject: 'next' });
    }
  }

  /* --- combat --- */
  if (action.type === 'ATTACK') {
    for (const declaration of action.attackers) {
      out.push({ kind: 'attacks', subjectId: declaration.attackerId, stateForSubject: 'next' });
    }
  }
  if (action.type === 'BLOCK') {
    for (const block of action.blocks) {
      out.push({ kind: 'blocks', subjectId: block.blockerId, stateForSubject: 'next' });
      out.push({ kind: 'becomes-blocked', subjectId: block.attackerId, stateForSubject: 'next' });
    }
  }

  /* --- damage --- */
  if (action.type === 'DAMAGE') {
    out.push({
      kind: 'deals-damage',
      subjectId: action.sourceInstanceId,
      playerId: action.targetPlayerId,
      amount: action.amount,
      combat: action.combat,
      stateForSubject: 'next',
    });
  }

  /* --- casting --- */
  if (action.type === 'CAST_SPELL') {
    out.push({ kind: 'cast', subjectId: action.instanceId, stateForSubject: 'next' });
  }

  /* --- steps --- */
  if (prev.step !== next.step || prev.activePlayerId !== next.activePlayerId) {
    out.push({
      kind: 'step',
      step: next.step,
      playerId: next.activePlayerId,
      stateForSubject: 'next',
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Does `event` fire this trigger, for this listening permanent?
 *
 * `ctx` is built around the LISTENER, so `{sel:'self'}` inside a trigger's
 * `who` means the listener and `{is:'other'}` excludes it — which is how
 * "another creature you control enters" reads correctly on the card that
 * carries it.
 */
export function eventMatches(
  trigger: TriggerEvent,
  event: AbilityEvent,
  ctx: AbilityContext
): boolean {
  const subjectIn = (selector: Parameters<typeof resolveSelector>[0]): boolean => {
    if (!event.subjectId) return false;
    return resolveSelector(selector, ctx).includes(event.subjectId);
  };

  switch (trigger.on) {
    case 'enters':
      return (
        event.kind === 'zone-change' &&
        event.to === 'battlefield' &&
        event.from !== 'battlefield' &&
        subjectIn(trigger.who)
      );

    case 'dies':
      return (
        event.kind === 'zone-change' &&
        event.from === 'battlefield' &&
        event.to === 'graveyard' &&
        subjectIn(trigger.who)
      );

    case 'leaves':
      return (
        event.kind === 'zone-change' &&
        event.from === (trigger.from ?? 'battlefield') &&
        event.to !== event.from &&
        subjectIn(trigger.who)
      );

    case 'zone-change':
      return (
        event.kind === 'zone-change' &&
        (trigger.from === 'any' || event.from === trigger.from) &&
        (trigger.to === 'any' || event.to === trigger.to) &&
        subjectIn(trigger.who)
      );

    case 'attacks':
      return event.kind === 'attacks' && subjectIn(trigger.who);

    case 'blocks':
      return event.kind === 'blocks' && subjectIn(trigger.who);

    case 'becomes-blocked':
      return event.kind === 'becomes-blocked' && subjectIn(trigger.who);

    case 'deals-damage': {
      if (event.kind !== 'deals-damage') return false;
      if (trigger.combatOnly && !event.combat) return false;
      if (trigger.to === 'player' && !event.playerId) return false;
      return subjectIn(trigger.source);
    }

    case 'dealt-damage':
      return event.kind === 'deals-damage' && subjectIn(trigger.who);

    case 'cast': {
      if (event.kind !== 'cast' || !event.subjectId) return false;
      if (trigger.by) {
        const card = ctx.state.cards[event.subjectId];
        const casters = resolvePlayers(trigger.by, ctx);
        if (!card || !casters.includes(card.controllerId)) return false;
      }
      return resolveSelector(
        { sel: 'all', where: trigger.what, zone: 'stack' },
        ctx
      ).includes(event.subjectId);
    }

    case 'step': {
      if (event.kind !== 'step' || event.step !== trigger.step) return false;
      const whose = resolvePlayers(trigger.whose, ctx);
      return !!event.playerId && whose.includes(event.playerId);
    }

    case 'tapped':
      return event.kind === 'tapped' && subjectIn(trigger.who);

    case 'untapped':
      return event.kind === 'untapped' && subjectIn(trigger.who);

    case 'counter-added':
      return (
        event.kind === 'counter-added' &&
        (trigger.counter === 'any' || event.counter === trigger.counter) &&
        subjectIn(trigger.who)
      );

    case 'gains-life': {
      if (event.kind !== 'gains-life') return false;
      const whose = resolvePlayers(trigger.whose, ctx);
      return !!event.playerId && whose.includes(event.playerId);
    }

    case 'loses-life': {
      if (event.kind !== 'loses-life') return false;
      const whose = resolvePlayers(trigger.whose, ctx);
      return !!event.playerId && whose.includes(event.playerId);
    }

    case 'draws-card': {
      if (event.kind !== 'draws-card') return false;
      const whose = resolvePlayers(trigger.whose, ctx);
      return !!event.playerId && whose.includes(event.playerId);
    }

    case 'sacrificed':
      // A sacrifice is a zone change the reducer does not distinguish from a
      // destruction, so this deliberately never fires rather than firing on
      // every death. Named in the gap list, not silently approximated.
      return false;

    default:
      return assertNever(trigger, 'eventMatches');
  }
}

/* -------------------------------------------------------------------------- */
/* Collection                                                                 */
/* -------------------------------------------------------------------------- */

export interface FiredTrigger {
  listenerId: InstanceId;
  listenerName: string;
  controllerId: PlayerId;
  ability: TriggeredAbility;
  event: AbilityEvent;
  /** The permanent that caused it, for `{sel:'trigger-source'}`. */
  triggerSourceId?: InstanceId;
}

/** APNAP: active player first, then the rest in seat order from them. */
function apnapOrder(state: GameState): PlayerId[] {
  const ids = state.players.map(player => player.id);
  const start = ids.indexOf(state.activePlayerId);
  if (start === -1) return ids;
  return [...ids.slice(start), ...ids.slice(0, start)];
}

/**
 * Every triggered ability that fires for these events, in the order they go on
 * the stack.
 *
 * A listener is checked in the state its `activeZones` names — battlefield by
 * default, and the BEFORE state for a permanent that has just left, so a
 * creature's own death trigger still sees itself.
 */
export function firedTriggers(
  prev: GameState,
  next: GameState,
  events: readonly AbilityEvent[]
): FiredTrigger[] {
  const fired: FiredTrigger[] = [];
  const order = apnapOrder(next);

  for (const event of events) {
    const perPlayer = new Map<PlayerId, FiredTrigger[]>();

    for (const state of [prev, next]) {
      const isPrev = state === prev;
      const derived = deriveState(state);

      for (const player of state.players) {
        for (const zone of ['battlefield', 'graveyard', 'hand', 'command'] as Zone[]) {
          for (const listenerId of player.zones[zone] ?? []) {
            const card = state.cards[listenerId];
            if (!card || card.removedFromGame) continue;

            for (const ability of abilitiesFor(card).abilities) {
              if (ability.kind !== 'triggered') continue;
              const zones = ability.activeZones ?? ['battlefield'];
              if (!zones.includes(zone)) continue;

              // Match in the state the event says describes its subject, so a
              // death trigger reads the board as it was.
              const wantPrev = event.stateForSubject === 'prev';
              if (wantPrev !== isPrev) continue;

              const ctx: AbilityContext = {
                state,
                derived,
                sourceId: listenerId,
                controllerId: card.controllerId,
                targets: [],
                x: 0,
                triggerSourceId: event.subjectId,
              };

              if (!eventMatches(ability.event, event, ctx)) continue;
              if (ability.condition && !evalCondition(ability.condition, ctx)) continue;

              const bucket = perPlayer.get(card.controllerId) ?? [];
              bucket.push({
                listenerId,
                listenerName: card.name,
                controllerId: card.controllerId,
                ability,
                event,
                triggerSourceId: event.subjectId,
              });
              perPlayer.set(card.controllerId, bucket);
            }
          }
        }
      }
    }

    // CR 603.3b — the active player's triggers go on the stack first.
    for (const playerId of order) {
      for (const trigger of perPlayer.get(playerId) ?? []) fired.push(trigger);
    }
  }

  return fired;
}

/**
 * Every triggered ability on a card, for the inspector and the coverage report.
 * Exported so a UI can show what a permanent is listening for without running a
 * game — the same data, asked a different way.
 */
export function triggeredAbilitiesOf(abilities: readonly Ability[]): TriggeredAbility[] {
  return abilities.filter((ability): ability is TriggeredAbility => ability.kind === 'triggered');
}
