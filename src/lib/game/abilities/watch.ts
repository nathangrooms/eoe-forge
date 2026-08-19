/**
 * DeckMatrix — ability bridge: E6, watchers.
 *
 * ## The problem
 *
 * Game state answers "what is true now". A great many cards ask "what happened
 * earlier this turn", and state cannot answer that, because the moment an event
 * is over the state that recorded it has been overwritten. A creature that died
 * is not on the battlefield. A spell that resolved is not on the stack. Life
 * that was gained is indistinguishable from life that was never lost. XMage
 * solves this with `Watcher` objects — mutable observers the engine pokes on
 * every event and reads back later.
 *
 * ## Why this is not that
 *
 * A mutable watcher is a second source of truth living outside the action log.
 * Two clients replaying one log could disagree, an undo has to remember to
 * unpoke it, a checkpoint has to remember to serialise it, and nothing proves
 * any of that stayed in step. That is a mutable side channel, and a mutable
 * side channel is precisely how "looked automated, wasn't" happens.
 *
 * So a watcher here is not state. A `WatchQuery` (in the DSL, pure JSON) is a
 * QUESTION; a `WatchLog` is the answer material, and it is **derived by folding
 * the action log** — the artefact that is already the single authority. Same
 * log, same facts, on every client, for ever, with no bookkeeping to get wrong.
 * `deriveWatchLog` and `observeAction` are both pure: no clock, no randomness,
 * no mutation of anything the caller handed in.
 *
 * ## What it costs, stated plainly
 *
 * Nothing in the engine calls `deriveWatchLog` today, because `GameState` does
 * not carry its own action list — `applyActions` folds one it is given. So a
 * `{v:'watch'}` reaching `evalValue` without a log answers 0, and **0 is a
 * wrong answer, not a neutral one**. Two things stop that being silent:
 * `unrunnableReason` refuses to let the ability engine own a card whose effects
 * contain a watch query, and `runEffects` emits a note naming the query when
 * one is evaluated with no log present.
 *
 * This module raises what the DSL can REPRESENT. On its own it automates
 * nothing, and no figure derived from it may be quoted as an automation number.
 *
 * ## Snapshots
 *
 * A fact about an object carries a snapshot of that object's *unchanging*
 * characteristics — type, subtype, colour, mana value, controller. It carries
 * no power, no toughness, no keywords and no tapped state, because those move
 * after the event and a remembered value would be a fabrication. `CardFilter`
 * members that need them are rejected by the DSL's `isWatchableFilter` before a
 * query can be built, so `matchesSnapshot` never has to guess.
 */

import type { CardInstance, GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { CardFilter, WatchQuery, WatchedEvent } from '../../cards/abilities/dsl.ts';
import { parseTypeLine } from './context.ts';

/* -------------------------------------------------------------------------- */
/* The recorded facts                                                         */
/* -------------------------------------------------------------------------- */

/** An object as it was when the event happened. Only characteristics that do not move. */
export interface WatchedSnapshot {
  instanceId: InstanceId;
  name: string;
  types: string[];
  subtypes: string[];
  supertypes: string[];
  /** Lower-cased colour letters. */
  colors: string[];
  manaValue: number;
  controllerId: PlayerId;
  isToken: boolean;
  isCommander: boolean;
}

export type WatchedKind = WatchedEvent['saw'];

export interface WatchedFact {
  /** Position in the fold. Stable across replays; also the tie-break for ordering. */
  seq: number;
  /** The turn number the event happened on. */
  turn: number;
  kind: WatchedKind;
  /** Whose event it was: who cast, who drew, who gained, who dealt the damage. */
  playerId?: PlayerId;
  /**
   * The numeric payload — cards drawn, life gained, damage dealt, tokens made.
   * `1` for events that are just occurrences, so `measure:'events'` and
   * `measure:'amount'` agree on a single draw and diverge on a draw of three.
   */
  amount: number;
  object?: WatchedSnapshot;
  damageTo?: 'player' | 'permanent';
}

export interface WatchLog {
  /** The turn the fold reached. `'this-turn'` means facts whose `turn` equals this. */
  turn: number;
  facts: WatchedFact[];
}

/** Frozen so a caller cannot accidentally make the empty log the mutable one. */
export const EMPTY_WATCH_LOG: WatchLog = Object.freeze({ turn: 0, facts: Object.freeze([]) as WatchedFact[] });

/* -------------------------------------------------------------------------- */
/* Snapshots                                                                  */
/* -------------------------------------------------------------------------- */

export function snapshotOf(card: CardInstance | undefined): WatchedSnapshot | undefined {
  if (!card) return undefined;
  const { supertypes, types, subtypes } = parseTypeLine(card.typeLine);
  return {
    instanceId: card.instanceId,
    name: card.name,
    types,
    subtypes,
    supertypes,
    colors: (card.colorIdentity ?? []).map(color => String(color).toLowerCase()),
    manaValue: card.cmc ?? 0,
    controllerId: card.controllerId,
    isToken: !!card.isToken,
    isCommander: !!card.isCommander,
  };
}

/**
 * Does a past object satisfy a filter?
 *
 * Answers `false` for every predicate a snapshot cannot support. That would be
 * a silent under-count if such a filter could ever get here, so it cannot:
 * `isWatchableFilter` is the DSL-side gate and `assertWatchable` below is the
 * runtime one.
 */
export function matchesSnapshot(filter: CardFilter, snapshot: WatchedSnapshot): boolean {
  switch (filter.is) {
    case 'type':
      return snapshot.types.includes(filter.value.toLowerCase());
    case 'subtype':
      return snapshot.subtypes.includes(filter.value.toLowerCase());
    case 'supertype':
      return snapshot.supertypes.includes(filter.value.toLowerCase());
    case 'name':
      return snapshot.name.toLowerCase() === filter.value.toLowerCase();
    case 'color':
      return snapshot.colors.includes(String(filter.value).toLowerCase());
    case 'colorless':
      return snapshot.colors.filter(color => color !== 'c').length === 0;
    case 'multicolored':
      return snapshot.colors.filter(color => color !== 'c').length > 1;
    case 'token':
      return snapshot.isToken;
    case 'commander':
      return snapshot.isCommander;
    case 'any':
      return true;
    case 'mana-value':
      return typeof filter.value === 'number' ? compareNumbers(snapshot.manaValue, filter.cmp, filter.value) : false;
    case 'not':
      return !matchesSnapshot(filter.of, snapshot);
    case 'and':
      return filter.of.every(inner => matchesSnapshot(inner, snapshot));
    case 'or':
      return filter.of.some(inner => matchesSnapshot(inner, snapshot));
    default:
      return false;
  }
}

function compareNumbers(a: number, cmp: string, b: number): boolean {
  switch (cmp) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'eq': return a === b;
    case 'gte': return a >= b;
    case 'gt': return a > b;
    case 'ne': return a !== b;
    default: return false;
  }
}

/* -------------------------------------------------------------------------- */
/* The fold                                                                   */
/* -------------------------------------------------------------------------- */

function push(log: WatchLog, turn: number, fact: Omit<WatchedFact, 'seq' | 'turn'>): WatchLog {
  return { turn: log.turn, facts: [...log.facts, { seq: log.facts.length, turn, ...fact }] };
}

const LAND_TYPES = new Set(['land']);

/**
 * One action observed. Pure: returns a new log and touches neither state.
 *
 * `before` is the state the action was applied to, `after` the state it
 * produced. Both are needed: "a creature died" is a `MOVE_ZONE` to the
 * graveyard *from the battlefield*, and only `before` knows where it came from.
 *
 * Actions with no entry here contribute nothing, which is correct rather than
 * lossy — sacrifice, notably, is a `MOVE_ZONE` to the graveyard exactly like a
 * destruction and cannot be told apart from one after the fact, so the DSL has
 * no `saw:'sacrificed'` for a query to ask about.
 */
export function observeAction(
  log: WatchLog,
  before: GameState,
  action: GameAction,
  after: GameState
): WatchLog {
  const turn = before.turn;
  let next: WatchLog = log;

  switch (action.type) {
    case 'CAST_SPELL': {
      const card = before.cards[action.instanceId];
      next = push(next, turn, {
        kind: 'spell-cast',
        playerId: action.controllerId ?? card?.controllerId,
        amount: 1,
        object: snapshotOf(card),
      });
      break;
    }

    case 'PLAY':
    case 'MOVE_ZONE': {
      const card = before.cards[action.instanceId];
      const to = action.type === 'PLAY' ? (action.to ?? 'battlefield') : action.to;
      const snapshot = snapshotOf(card);
      const controllerId =
        ('controllerId' in action ? action.controllerId : undefined) ?? card?.controllerId;

      if (to === 'battlefield') {
        next = push(next, turn, { kind: 'entered', playerId: controllerId, amount: 1, object: snapshot });
        // A land entering from the hand is a land drop. Anything arriving from
        // elsewhere — a fetch, a reanimation — is not, and counting it would
        // make "if you've played a land this turn" true after a Crop Rotation.
        if (snapshot && snapshot.types.some(type => LAND_TYPES.has(type)) && card?.zone === 'hand') {
          next = push(next, turn, { kind: 'land-played', playerId: controllerId, amount: 1, object: snapshot });
        }
      } else if (to === 'graveyard' && card?.zone === 'battlefield') {
        next = push(next, turn, { kind: 'died', playerId: controllerId, amount: 1, object: snapshot });
      }
      break;
    }

    case 'ATTACK':
      for (const attacker of action.attackers) {
        const card = before.cards[attacker.attackerId];
        next = push(next, turn, {
          kind: 'attacked',
          playerId: card?.controllerId,
          amount: 1,
          object: snapshotOf(card),
        });
      }
      break;

    case 'DRAW':
      next = push(next, turn, { kind: 'drew', playerId: action.playerId, amount: action.count ?? 1 });
      break;

    case 'LIFE_CHANGE': {
      if (action.delta === 0) break;
      next = push(next, turn, {
        kind: action.delta > 0 ? 'gained-life' : 'lost-life',
        playerId: action.playerId,
        amount: Math.abs(action.delta),
      });
      break;
    }

    case 'DAMAGE':
      next = push(next, turn, {
        kind: 'dealt-damage',
        playerId: action.sourcePlayerId,
        amount: action.amount,
        damageTo: 'player',
      });
      break;

    case 'DAMAGE_CARD':
      next = push(next, turn, {
        kind: 'dealt-damage',
        playerId: action.sourcePlayerId,
        amount: action.amount,
        damageTo: 'permanent',
        object: snapshotOf(before.cards[action.instanceId]),
      });
      break;

    case 'CREATE_TOKEN':
      next = push(next, turn, {
        kind: 'token-created',
        playerId: action.playerId,
        amount: action.count ?? 1,
      });
      break;

    default:
      break;
  }

  // The fold always tracks the turn the game is actually on, so `'this-turn'`
  // means the same thing to a query asked between actions as to one asked
  // during resolution.
  return next.turn === after.turn ? next : { turn: after.turn, facts: next.facts };
}

/**
 * The whole log, folded.
 *
 * `apply` is a parameter rather than an import. `rules.ts` sits above this
 * folder in the dependency order — `triggers.ts` reaches into
 * `trigger-bridge.ts` — so importing `applyAction` here would close a cycle
 * through the module the entire engine depends on. Taking the reducer as an
 * argument keeps this module a leaf and keeps the fold honest: it replays the
 * same actions through the same reducer the game did, and cannot diverge.
 */
export function deriveWatchLog(
  initial: GameState,
  actions: readonly GameAction[],
  apply: (state: GameState, action: GameAction) => GameState
): WatchLog {
  let state = initial;
  let log: WatchLog = { turn: initial.turn, facts: [] };
  for (const action of actions) {
    const after = apply(state, action);
    log = observeAction(log, state, action, after);
    state = after;
  }
  return log;
}

/* -------------------------------------------------------------------------- */
/* Answering a query                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The one field of a `WatchedEvent` that names players, whatever it is called
 * on that member. `by` and `controller` never both appear, so one lookup
 * serves — and putting the knowledge here rather than at every call site means
 * a new member with a differently named field is a one-line change.
 */
export function playerSelectorOfEvent(event: WatchedEvent) {
  return 'by' in event ? event.by : 'controller' in event ? event.controller : undefined;
}

/** The object filter of a `WatchedEvent`, or `undefined` when it has none. */
export function filterOfEvent(event: WatchedEvent): CardFilter | undefined {
  return 'what' in event ? event.what : undefined;
}

/**
 * Answer a query against a folded log.
 *
 * `playerIds` is the already-resolved list the query's player selector named,
 * or `undefined` for "anybody" — resolving a `PlayerSelector` needs an
 * `AbilityContext`, and importing one here would point this module back at its
 * own caller. `context.ts` resolves it and passes the ids down.
 */
export function countWatched(
  query: WatchQuery,
  log: WatchLog,
  playerIds: readonly PlayerId[] | undefined
): number {
  const wanted = query.event.saw;
  const filter = filterOfEvent(query.event);
  const damageTo = query.event.saw === 'dealt-damage' ? query.event.to : undefined;

  let total = 0;
  for (const fact of log.facts) {
    if (fact.kind !== wanted) continue;
    if (query.window === 'this-turn' && fact.turn !== log.turn) continue;
    if (playerIds && (!fact.playerId || !playerIds.includes(fact.playerId))) continue;
    if (damageTo && damageTo !== 'any' && fact.damageTo !== damageTo) continue;
    if (filter) {
      if (!fact.object) continue;
      if (!matchesSnapshot(filter, fact.object)) continue;
    }
    total += query.measure === 'amount' ? fact.amount : 1;
  }
  return total;
}
