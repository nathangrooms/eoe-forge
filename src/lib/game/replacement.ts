/**
 * DeckMatrix — shared game-state core: replacement effects (CR 614).
 *
 * ## Provenance
 *
 * Modelled on XMage's `mage.abilities.effects.ReplacementEffect` /
 * `ContinuousEffects.replaceEvent` (https://github.com/magefree/mage, MIT
 * licensed; notice retained, credited in the project's licences). The idea is
 * XMage's; the mechanism is not, for the usual reason.
 *
 * XMage walks a live event object through the applicable effects, mutating it,
 * and keeps a `Set` of already-applied effects **on the event object** so each
 * gets one bite. That set exists only inside one method call on one server. Our
 * games are replayed from an action log by every client, so a rule enforced by
 * transient in-memory bookkeeping is a rule that quietly stops holding on
 * replay.
 *
 * So the once-only set moved onto the action: `ActionMeta.replacedBy`. A
 * replacement produces a *new action* carrying the ids of everything that has
 * already touched this event, the reducer folds it, and the whole history of
 * the event is in the log. Replay reproduces it exactly, and the rule holds for
 * free.
 *
 * ## The rules encoded here
 *
 *   - **CR 614.1** a replacement effect watches for an event and replaces it
 *     with something else *before it happens*. Nothing is ever undone.
 *   - **CR 614.5** an effect gets exactly one opportunity to apply to an event,
 *     **and to any modified event resulting from it**. This is the part naive
 *     implementations get wrong: "if you would draw a card, draw two instead"
 *     does not loop, because the two-card draw it produces is still *the same
 *     event* as far as that effect is concerned. Inheriting `replacedBy` onto
 *     the produced actions is what encodes it, and it also guarantees the loop
 *     terminates — every pass consumes one effect from a finite list.
 *   - **CR 616.1** when several would apply at once, the affected player (or
 *     the affected permanent's controller) picks one, it applies, and then the
 *     rest are checked *again* against the modified event. So this module
 *     applies exactly one effect per call and lets the reducer re-enter; the
 *     re-check is not an optimisation, it is the rule.
 *   - **CR 614.13** a self-replacement effect — the object's own "this enters
 *     tapped" — applies before anything else that would modify the same event.
 *
 * ## The choice, and determinism
 *
 * CR 616.1 is a *player decision*, and a decision the engine invents is a
 * decision that can differ between clients. So the order travels in the action
 * as `replacementOrder`, chosen by the affected player's UI. When it is absent,
 * the fallback is a total order on effect id — deterministic everywhere, so a
 * client that never prompts still never diverges from one that does.
 * `pendingReplacementChoice` is how a UI knows to ask.
 */

import type {
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  ReplaceableEventKind,
  ReplacementEffect,
  ReplacementId,
  ReplacementMatch,
} from './types.ts';
import { getCard, getPlayer } from './rules.ts';

/* -------------------------------------------------------------------------- */
/* The event                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A game event that is *about to* happen, in the CR 700.1 sense. Derived from
 * the action, never stored: it exists only long enough to be matched against.
 */
export interface ReplaceableEvent {
  kind: ReplaceableEventKind;
  /** The player the event happens to — the one drawing, taking damage, gaining life. */
  playerId?: PlayerId;
  /** The permanent the event happens to. */
  instanceId?: InstanceId;
  /** Controller of that permanent. */
  controllerId?: PlayerId;
  typeLine?: string;
  /** Cards drawn, damage dealt, counters placed, life moved. */
  amount?: number;
  sourceInstanceId?: InstanceId;
  combat?: boolean;
  counter?: string;
}

/**
 * Which actions are replaceable events, and what event each one is. An action
 * not listed here is simply not something CR 614 can intercept in this engine —
 * `replaceAction` returns `null` and the reducer proceeds untouched, which is
 * why an engine with no registered effects behaves exactly as it did before
 * this module existed.
 */
export function eventForAction(state: GameState, action: GameAction): ReplaceableEvent | null {
  switch (action.type) {
    case 'DRAW':
      return { kind: 'draw', playerId: action.playerId, amount: Math.max(1, action.count ?? 1) };

    case 'DAMAGE':
      return {
        kind: 'damage',
        playerId: action.targetPlayerId,
        amount: action.amount,
        sourceInstanceId: action.sourceInstanceId,
        combat: !!action.combat,
      };

    case 'PLAY':
    case 'MOVE_ZONE': {
      const to = action.type === 'PLAY' ? action.to ?? 'battlefield' : action.to;
      if (to !== 'battlefield') return null;
      const card = getCard(state, action.instanceId);
      // Already in play: moving it around the battlefield is not an entry.
      if (!card || card.zone === 'battlefield') return null;
      return {
        kind: 'enters',
        instanceId: card.instanceId,
        controllerId: action.controllerId ?? card.controllerId,
        typeLine: card.typeLine,
      };
    }

    case 'CREATE_TOKEN':
      return {
        kind: 'enters',
        controllerId: action.playerId,
        typeLine: action.token.typeLine,
      };

    case 'CARD_COUNTER': {
      if (action.delta <= 0) return null;
      const card = getCard(state, action.instanceId);
      return {
        kind: 'counters',
        instanceId: action.instanceId,
        controllerId: card?.controllerId,
        typeLine: card?.typeLine,
        counter: action.counter,
        amount: action.delta,
      };
    }

    case 'LIFE_CHANGE':
      if (action.delta === 0) return null;
      return {
        kind: action.delta > 0 ? 'life-gain' : 'life-loss',
        playerId: action.playerId,
        amount: Math.abs(action.delta),
      };

    default:
      return null;
  }
}

/** Who chooses the order when several effects apply at once (CR 616.1). */
export function affectedPlayerOf(event: ReplaceableEvent): PlayerId | undefined {
  return event.playerId ?? event.controllerId;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export function replacementsOf(state: GameState): readonly ReplacementEffect[] {
  return state.replacements ?? [];
}

/** Registering the same id twice replaces it, so a re-entering permanent is idempotent. */
export function addReplacement(state: GameState, effect: ReplacementEffect): GameState {
  const existing = replacementsOf(state);
  const without = existing.filter(candidate => candidate.id !== effect.id);
  return { ...state, replacements: [...without, effect] };
}

export function removeReplacement(state: GameState, replacementId: ReplacementId): GameState {
  const existing = replacementsOf(state);
  const next = existing.filter(candidate => candidate.id !== replacementId);
  return next.length === existing.length ? state : { ...state, replacements: next };
}

/**
 * A registered effect only does anything while its source is on the
 * battlefield. Filtering here rather than demanding an explicit deregistration
 * means a permanent that dies stops applying immediately, with no bookkeeping
 * anyone can forget.
 *
 * Two exceptions: an effect with no source at all (an emblem, a rules-level
 * effect) is always live, and a self-replacement effect is live while its own
 * source is arriving — which is the entire point of "this land enters tapped".
 */
export function isActiveReplacement(state: GameState, effect: ReplacementEffect): boolean {
  if (effect.requiresBattlefield === false) return true;
  if (!effect.sourceInstanceId) return true;
  if (effect.selfReplacement) return true;
  const source = getCard(state, effect.sourceInstanceId);
  return !!source && source.zone === 'battlefield' && !source.removedFromGame;
}

export function activeReplacements(state: GameState): ReplacementEffect[] {
  return replacementsOf(state).filter(effect => isActiveReplacement(state, effect));
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

function matchesEvent(
  effect: ReplacementEffect,
  match: ReplacementMatch | undefined,
  event: ReplaceableEvent
): boolean {
  if (!match) return true;

  if (match.playerId !== undefined) {
    const affected = affectedPlayerOf(event);
    if (affected !== match.playerId) return false;
  }

  if (match.instanceId !== undefined) {
    const wanted = match.instanceId === 'self' ? effect.sourceInstanceId : match.instanceId;
    if (!wanted || wanted !== event.instanceId) return false;
  }

  if (match.controllerId !== undefined && event.controllerId !== match.controllerId) return false;

  if (match.typeLine !== undefined) {
    const line = (event.typeLine ?? '').toLowerCase();
    if (!line.includes(match.typeLine.toLowerCase())) return false;
  }

  if (match.sourceInstanceId !== undefined && event.sourceInstanceId !== match.sourceInstanceId) {
    return false;
  }

  if (match.combat !== undefined && !!event.combat !== match.combat) return false;

  if (match.minAmount !== undefined && (event.amount ?? 0) < match.minAmount) return false;

  if (match.counter !== undefined && event.counter !== match.counter) return false;

  return true;
}

/**
 * Every effect that would apply to this event right now — active, matching, and
 * not already used on it (CR 614.5).
 */
export function applicableReplacements(
  state: GameState,
  action: GameAction,
  event?: ReplaceableEvent | null
): ReplacementEffect[] {
  const target = event ?? eventForAction(state, action);
  if (!target) return [];
  const used = action.replacedBy ?? [];
  return activeReplacements(state).filter(
    effect =>
      effect.event === target.kind &&
      !used.includes(effect.id) &&
      matchesEvent(effect, effect.match, target)
  );
}

/**
 * CR 614.13 then CR 616.1: self-replacement effects first, then the affected
 * player's stated order, then a total order on id so two clients that were
 * never asked still agree.
 *
 * String comparison, not `localeCompare` — locale-sensitive ordering is exactly
 * the kind of thing that makes two clients disagree.
 */
export function chooseReplacement(
  candidates: readonly ReplacementEffect[],
  order: readonly ReplacementId[] = []
): ReplacementEffect | undefined {
  if (candidates.length === 0) return undefined;

  const rank = (effect: ReplacementEffect): number => {
    const index = order.indexOf(effect.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return candidates.slice().sort((a, b) => {
    const selfA = a.selfReplacement ? 0 : 1;
    const selfB = b.selfReplacement ? 0 : 1;
    if (selfA !== selfB) return selfA - selfB;
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * When two or more effects apply at once and the action carries no order, this
 * is what a UI should prompt the affected player with. Returning `null` means
 * there is nothing to ask about — one effect, or none.
 *
 * The engine does not block on the answer: absent an order it uses the id
 * fallback, so an unattended client still plays a legal, identical game.
 */
export function pendingReplacementChoice(
  state: GameState,
  action: GameAction
): { playerId?: PlayerId; event: ReplaceableEvent; options: ReplacementEffect[] } | null {
  const event = eventForAction(state, action);
  if (!event) return null;
  const options = applicableReplacements(state, action, event);
  if (options.length < 2) return null;
  const undecided = options.filter(
    effect => !effect.selfReplacement && !(action.replacementOrder ?? []).includes(effect.id)
  );
  if (undecided.length < 2) return null;
  return { playerId: affectedPlayerOf(event), event, options };
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A hard stop on pathological chains. The once-only rule already guarantees
 * termination — every pass consumes one effect from a finite registry — so this
 * only ever fires on a state someone has hand-built with hundreds of effects.
 */
const MAX_REPLACEMENTS_PER_EVENT = 32;

function scale(value: number, multiply?: number, plus?: number): number {
  const multiplied = multiply === undefined ? value : Math.trunc(value * multiply);
  return multiplied + (plus ?? 0);
}

function bumpCounters(
  counters: Record<string, number> | undefined,
  counter: string,
  delta: number
): Record<string, number> {
  const next = { ...(counters ?? {}) };
  const value = (next[counter] ?? 0) + delta;
  if (value <= 0) delete next[counter];
  else next[counter] = value;
  return next;
}

function scaleCounters(
  counters: Record<string, number> | undefined,
  multiply?: number,
  plus?: number
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(counters ?? {})) {
    const scaled = scale(value, multiply, plus);
    if (scaled > 0) next[key] = scaled;
  }
  return next;
}

/** The event simply does not happen — said out loud, never silently. */
function preventedNote(effect: ReplacementEffect, what: string, at: number): GameAction {
  return {
    type: 'NOTE',
    message: `${effect.name} replaced ${what} — it does not happen.`,
    instanceId: effect.sourceInstanceId,
    at,
  };
}

/**
 * Apply exactly one effect to one action, producing the actions that happen
 * instead.
 *
 * `null` means the effect matched the event but has no way to express itself
 * against this particular action shape. `replaceAction` turns that into a
 * spoken note rather than a silent no-op — see the call site.
 */
function applyOneReplacement(
  effect: ReplacementEffect,
  action: GameAction,
  event: ReplaceableEvent,
  at: number
): GameAction[] | null {
  const apply = effect.apply;

  switch (apply.op) {
    case 'skip':
      return [preventedNote(effect, describeEvent(event), at)];

    case 'instead':
      return apply.actions.map(next => ({ ...next, at: next.at ?? at }));

    case 'enters-tapped':
      if (action.type === 'PLAY' || action.type === 'MOVE_ZONE') {
        return [{ ...action, tapped: true }];
      }
      if (action.type === 'CREATE_TOKEN') return [{ ...action, tapped: true }];
      return null;

    case 'enters-with-counters':
      if (action.type === 'PLAY' || action.type === 'MOVE_ZONE') {
        return [{ ...action, counters: bumpCounters(action.counters, apply.counter, apply.count) }];
      }
      return null;

    case 'scale-counters':
      // Two shapes of the same idea: counters a permanent enters with, and
      // counters put on one already in play.
      if (action.type === 'PLAY' || action.type === 'MOVE_ZONE') {
        return [{ ...action, counters: scaleCounters(action.counters, apply.multiply, apply.plus) }];
      }
      if (action.type === 'CARD_COUNTER') {
        const delta = Math.max(0, scale(action.delta, apply.multiply, apply.plus));
        if (delta === 0) return [preventedNote(effect, describeEvent(event), at)];
        return [{ ...action, delta }];
      }
      return null;

    case 'prevent-damage': {
      if (action.type !== 'DAMAGE') return null;
      const prevented = apply.amount === undefined ? action.amount : Math.min(apply.amount, action.amount);
      const remaining = action.amount - prevented;
      if (remaining <= 0) return [preventedNote(effect, describeEvent(event), at)];
      return [{ ...action, amount: remaining }];
    }

    case 'scale-damage': {
      if (action.type !== 'DAMAGE') return null;
      let amount = scale(action.amount, apply.multiply, apply.plus);
      if (apply.min !== undefined) amount = Math.max(apply.min, amount);
      if (amount <= 0) return [preventedNote(effect, describeEvent(event), at)];
      return [{ ...action, amount }];
    }

    case 'redirect-damage':
      if (action.type !== 'DAMAGE') return null;
      // Redirected damage is dealt by the same source to a different player,
      // so commander damage does NOT follow it to the new recipient.
      return [{ ...action, targetPlayerId: apply.toPlayerId, commanderId: undefined }];

    case 'damage-as-poison':
      if (action.type !== 'DAMAGE') return null;
      return [{ ...action, infect: true }];

    case 'scale-draw': {
      if (action.type !== 'DRAW') return null;
      const count = scale(Math.max(1, action.count ?? 1), apply.multiply, apply.plus);
      if (count <= 0) return [preventedNote(effect, describeEvent(event), at)];
      return [{ ...action, count }];
    }

    case 'scale-life': {
      if (action.type !== 'LIFE_CHANGE') return null;
      const sign = action.delta < 0 ? -1 : 1;
      const magnitude = scale(Math.abs(action.delta), apply.multiply, apply.plus);
      if (magnitude <= 0) return [preventedNote(effect, describeEvent(event), at)];
      return [{ ...action, delta: sign * magnitude }];
    }

    default:
      return null;
  }
}

function describeEvent(event: ReplaceableEvent): string {
  switch (event.kind) {
    case 'draw':
      return `a draw of ${event.amount ?? 1}`;
    case 'damage':
      return `${event.amount ?? 0} damage`;
    case 'enters':
      return 'a permanent entering';
    case 'counters':
      return `${event.amount ?? 0} ${event.counter ?? ''} counters`.trim();
    case 'life-gain':
      return `gaining ${event.amount ?? 0} life`;
    case 'life-loss':
      return `losing ${event.amount ?? 0} life`;
    default:
      return 'an event';
  }
}

/**
 * The hook `applyAction` calls before reducing anything.
 *
 * Returns the actions that happen **instead** of `action`, or `null` when
 * nothing applies — which is the overwhelmingly common case, and always the
 * case when no replacement effect is registered, so this costs a state lookup
 * and nothing else.
 *
 * Exactly one effect is applied per call, on purpose. The reducer folds the
 * result back through `applyAction`, this runs again against the *modified*
 * event, and the next effect gets its turn. That re-check is CR 616.1, and it
 * is why "prevent 2 damage" then "double the damage" is not the same as the
 * other order — the second effect sees what the first one did.
 */
export function replaceAction(state: GameState, action: GameAction): GameAction[] | null {
  const used = action.replacedBy ?? [];
  if (used.length >= MAX_REPLACEMENTS_PER_EVENT) return null;
  if (replacementsOf(state).length === 0) return null;

  const event = eventForAction(state, action);
  if (!event) return null;

  const candidates = applicableReplacements(state, action, event);
  if (candidates.length === 0) return null;

  const chosen = chooseReplacement(candidates, action.replacementOrder ?? []);
  if (!chosen) return null;

  const at = action.at ?? state.updatedAt;
  const produced =
    applyOneReplacement(chosen, action, event, at) ??
    // The effect matched the event but has no way to modify *this* action —
    // "enters with counters" against a token, say, which the reducer creates
    // without a counters field. Letting that fall through would be the engine
    // silently not applying a card's text, which is the one thing it must never
    // do. So it says so, spends its one opportunity, and the event goes ahead
    // unmodified.
    [
      {
        type: 'NOTE',
        message: `${chosen.name} would replace ${describeEvent(event)} here, but the engine cannot apply it — resolve it by hand.`,
        instanceId: chosen.sourceInstanceId,
        at,
      } as GameAction,
      action,
    ];

  // CR 614.5 — the effect is spent for this event *and for everything the
  // replacement produced*, so the marker rides along on the output. The
  // player's chosen order rides along too, so a decision made once is not
  // re-asked halfway through the same event.
  const replacedBy = [...used, chosen.id];
  return produced.map(next => {
    // Most produced actions are `{ ...action, <modified field> }`, so they
    // arrive carrying the *old* marker list. Overwriting it with the new one is
    // the whole once-only rule: inheriting the stale list instead would leave
    // the effect eligible again and spin forever. Anything the produced action
    // added on its own is merged in rather than dropped.
    const merged = [...replacedBy];
    for (const previous of next.replacedBy ?? []) {
      if (!merged.includes(previous)) merged.push(previous);
    }
    const { id: _discarded, ...rest } = next as GameAction & { id?: string };
    return {
      ...(rest as GameAction),
      replacedBy: merged,
      replacementOrder: next.replacementOrder ?? action.replacementOrder,
      cause: next.cause ?? chosen.name,
      at: next.at ?? at,
    } as GameAction;
  });
}

/* -------------------------------------------------------------------------- */
/* Builders — the shapes an oracle-text compiler will emit                    */
/* -------------------------------------------------------------------------- */

/** "This permanent enters tapped." A self-replacement effect (CR 614.13). */
export function entersTapped(
  id: ReplacementId,
  name: string,
  sourceInstanceId: InstanceId
): ReplacementEffect {
  return {
    id,
    name,
    event: 'enters',
    sourceInstanceId,
    selfReplacement: true,
    match: { instanceId: 'self' },
    apply: { op: 'enters-tapped' },
  };
}

/** "This creature enters with N +1/+1 counters on it." */
export function entersWithCounters(
  id: ReplacementId,
  name: string,
  sourceInstanceId: InstanceId,
  counter: string,
  count: number
): ReplacementEffect {
  return {
    id,
    name,
    event: 'enters',
    sourceInstanceId,
    selfReplacement: true,
    match: { instanceId: 'self' },
    apply: { op: 'enters-with-counters', counter, count },
  };
}

/** "Creatures you control enter tapped" and similar table-wide effects. */
export function othersEnterTapped(
  id: ReplacementId,
  name: string,
  match: ReplacementMatch,
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return { id, name, event: 'enters', sourceInstanceId, match, apply: { op: 'enters-tapped' } };
}

/** "Prevent the next N damage", or all of it when `amount` is omitted. */
export function preventDamage(
  id: ReplacementId,
  name: string,
  match: ReplacementMatch,
  amount?: number,
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return { id, name, event: 'damage', sourceInstanceId, match, apply: { op: 'prevent-damage', amount } };
}

/** "...that damage is dealt to you instead." */
export function redirectDamage(
  id: ReplacementId,
  name: string,
  match: ReplacementMatch,
  toPlayerId: PlayerId,
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return {
    id,
    name,
    event: 'damage',
    sourceInstanceId,
    match,
    apply: { op: 'redirect-damage', toPlayerId },
  };
}

/** "If a source would deal damage to you, it deals double that damage instead." */
export function scaleDamage(
  id: ReplacementId,
  name: string,
  match: ReplacementMatch,
  apply: { multiply?: number; plus?: number; min?: number },
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return { id, name, event: 'damage', sourceInstanceId, match, apply: { op: 'scale-damage', ...apply } };
}

/** "If you would draw a card, draw two instead." */
export function scaleDraw(
  id: ReplacementId,
  name: string,
  playerId: PlayerId,
  apply: { multiply?: number; plus?: number },
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return {
    id,
    name,
    event: 'draw',
    sourceInstanceId,
    match: { playerId },
    apply: { op: 'scale-draw', ...apply },
  };
}

/** "If you would draw a card, instead ...". */
export function replaceDraw(
  id: ReplacementId,
  name: string,
  playerId: PlayerId,
  actions: GameAction[],
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return {
    id,
    name,
    event: 'draw',
    sourceInstanceId,
    match: { playerId },
    apply: { op: 'instead', actions },
  };
}

/** Doubling Season's half of counter doubling: counters placed on a permanent. */
export function scaleCounterPlacement(
  id: ReplacementId,
  name: string,
  match: ReplacementMatch,
  apply: { multiply?: number; plus?: number },
  sourceInstanceId?: InstanceId
): ReplacementEffect {
  return {
    id,
    name,
    event: 'counters',
    sourceInstanceId,
    match,
    apply: { op: 'scale-counters', ...apply },
  };
}

/* -------------------------------------------------------------------------- */
/* Prose                                                                      */
/* -------------------------------------------------------------------------- */

export function describeReplacement(state: GameState, effect: ReplacementEffect): string {
  const owner = effect.controllerId ? getPlayer(state, effect.controllerId)?.name : undefined;
  const who = owner ? `${owner}'s ` : '';
  return `${who}${effect.name}`;
}
