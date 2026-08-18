/**
 * DeckMatrix — shared game-state core: triggered abilities (CR 603).
 *
 * ## Provenance
 *
 * Ported from XMage (https://github.com/magefree/mage), MIT licensed — the
 * model of `mage.abilities.TriggeredAbility`, the `GameEvent` /
 * `TriggeredAbilities` pair, and `GameState#addTriggeredAbility` plus the
 * "check triggered, then put on the stack" step of `GameImpl`. The MIT notice
 * is retained for the ported portion and XMage is credited in the project's
 * licences.
 *
 * ## What was translated rather than copied
 *
 * XMage fires an event object into a listener graph; each `TriggeredAbility`
 * subclass answers `checkTrigger(event, game)` in Java, and the ability that
 * results is a live object with a `resolve(game)` body. None of that ports:
 * DeckMatrix's product requirement is that *a game is its action log*, so state
 * holds no class instances and every step is a pure function.
 *
 * The four pieces, translated:
 *
 *   1. **Events are derived, not dispatched.** `deriveTriggerEvents` diffs the
 *      state before and after an action. That is what lets a death caused by a
 *      *state-based action* trigger a "dies" ability — nothing in the action
 *      says a creature died, but the two states differ. An event bus would have
 *      needed every mutation site to remember to publish.
 *   2. **An ability is data.** `DetectedTrigger` (read off oracle text by
 *      `effects.ts`) replaces the subclass. There is no per-card code, and there
 *      will not be: the 25,000 card classes are replaced by the oracle-text
 *      compiler, per the direction document.
 *   3. **The waiting list is state.** CR 603.3 says a trigger waits until a
 *      player would next receive priority. `GameState.pendingTriggers` is that
 *      list — XMage's `state.triggered` — and it is a plain serialisable array,
 *      so a client replaying the log rebuilds the identical stack.
 *   4. **Resolution is a pure function to `GameAction[]`.** A trigger resolving
 *      is therefore an ordinary sequence of logged, replayable actions.
 *
 * ## Ordering, and why it is deterministic
 *
 * CR 603.3b: the active player's triggers go on the stack first, then each
 * other player's in turn order, so the *last* on is the first to resolve.
 * Within one player's own batch the rules give that player the choice.
 *
 * A choice cannot be made inside a pure reducer, so the choice arrives *with
 * the action*: `ActionMeta.triggerOrder` carries the controller's preferred
 * stacking order, and `previewTriggers` lets a client compute the ids to choose
 * between before it sends anything. No prompt, no round trip, no divergence —
 * two clients folding the same log produce byte-identical stacks. With no
 * preference supplied the default order is used: source battlefield order, then
 * declaration order, then ability index. Never object key order, never a clock.
 *
 * ## Intervening "if" — CR 603.4
 *
 * Checked twice, as the rule requires: once here, when the trigger would go on
 * the stack (a false condition means it never triggers at all), and again in
 * `resolveTriggerActions` as it resolves. A condition the engine cannot
 * classify comes back `unknown` from `parseIntervening`, which keeps the whole
 * trigger manual rather than guessing at it.
 *
 * ## The honesty rule
 *
 * A trigger that fired in the game but not in the engine emits a `NOTE`. A
 * trigger only half-understood says which half is outstanding. A trigger whose
 * intervening "if" turned false on resolution says so instead of vanishing.
 * Silence is the bug this module exists to prevent.
 *
 * Pure: no clock, no randomness, no I/O, no mutation of the input state.
 */

import type {
  CardInstance,
  DetectedTrigger,
  GameAction,
  GameState,
  InstanceId,
  InterveningCondition,
  PendingTrigger,
  PlayerId,
  TriggerEvent,
  TriggerEventKind,
  TriggerTiming,
} from './types.ts';
import { isLand } from './mana.ts';
import {
  TRIGGER_LABELS,
  actionsForTrigger,
  detectTriggers,
  manualNoteAction,
  noteForDeclinedTrigger,
} from './effects.ts';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How many triggers may resolve as the consequence of a single player action.
 *
 * Real Magic allows a trigger loop to run forever and calls the game a draw
 * (CR 104.4b). A playtest tool must not hang, so the drain is capped and the
 * remainder is left on `pendingTriggers` with a `NOTE` saying so — visible,
 * rather than a game that quietly stopped triggering.
 */
export const MAX_TRIGGER_RESOLUTIONS = 24;

/** Which event kind each oracle-text timing listens for. */
const TIMING_EVENT: Record<TriggerTiming, TriggerEventKind> = {
  etb: 'enters',
  death: 'dies',
  attack: 'attacks',
  blocks: 'blocks',
  'deals-damage': 'deals-damage',
  upkeep: 'upkeep',
  'end-step': 'end-step',
  cast: 'cast',
  draw: 'draw',
};

/**
 * Timings that fire on something happening to the ability's own source, as
 * opposed to something happening to its controller.
 *
 * Every pattern `effects.ts` recognises is self-referential ("when **this
 * creature** enters"), so a self-event is matched against the event's own
 * instance and nothing else. "Whenever *another* creature you control enters"
 * is not detected at all, and lands in `manualNotes` — the honest answer.
 */
const SELF_EVENTS: ReadonlySet<TriggerEventKind> = new Set<TriggerEventKind>([
  'enters',
  'dies',
  'attacks',
  'blocks',
  'deals-damage',
  'cast',
]);

/* -------------------------------------------------------------------------- */
/* Abilities                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every triggered ability on one card, in a stable order.
 *
 * A thin pass over `effects.ts` so the index of an ability is a stable part of
 * a trigger's id. Cards with no oracle text return an empty list, which is why
 * `automationFor` reports `unknown` rather than `vanilla` for them: "we did not
 * load the text" and "this card has no abilities" must never look the same.
 */
export function abilitiesOf(card: CardInstance | null | undefined): DetectedTrigger[] {
  return detectTriggers(card);
}

/* -------------------------------------------------------------------------- */
/* CR 603.4 — evaluating an intervening "if"                                  */
/* -------------------------------------------------------------------------- */

/**
 * Evaluate a parsed intervening condition.
 *
 * Returns `null` — not `false` — when the engine cannot judge it. The three
 * answers are genuinely different: true fires, false does not trigger at all,
 * and null means a human has to decide, which the caller turns into a note.
 */
export function evaluateIntervening(
  state: GameState,
  controllerId: PlayerId,
  condition: InterveningCondition | undefined
): boolean | null {
  if (!condition) return true;

  switch (condition.kind) {
    case 'controls': {
      let count = 0;
      for (const player of state.players) {
        for (const id of player.zones.battlefield) {
          const card = state.cards[id];
          if (!card || card.removedFromGame) continue;
          if (card.controllerId !== controllerId) continue;
          if ((card.typeLine ?? '').toLowerCase().includes(condition.typeWord)) count += 1;
        }
      }
      return count >= condition.atLeast;
    }
    case 'life-at-least': {
      const player = state.players.find(p => p.id === controllerId);
      return player ? player.life >= condition.amount : null;
    }
    case 'life-at-most': {
      const player = state.players.find(p => p.id === controllerId);
      return player ? player.life <= condition.amount : null;
    }
    case 'your-turn':
      return state.activePlayerId === controllerId;
    case 'unknown':
      return null;
    default:
      return null;
  }
}

/** Plain prose for a condition, for the log line and the manual note. */
export function describeIntervening(condition: InterveningCondition): string {
  switch (condition.kind) {
    case 'controls':
      return `you control ${condition.atLeast} or more ${condition.typeWord}s`;
    case 'life-at-least':
      return `you have ${condition.amount} or more life`;
    case 'life-at-most':
      return `you have ${condition.amount} or less life`;
    case 'your-turn':
      return `it is your turn`;
    case 'unknown':
      return condition.text;
    default:
      return 'a condition the engine does not evaluate';
  }
}

/* -------------------------------------------------------------------------- */
/* Deriving events                                                            */
/* -------------------------------------------------------------------------- */

/** Every id in a battlefield array, for the zone-change diff. */
function zoneOf(state: GameState, id: InstanceId): string | undefined {
  return state.cards[id]?.zone;
}

/**
 * What happened between these two states, as triggered abilities see it.
 *
 * Order is fixed and never depends on object key iteration: zone changes first,
 * sorted by instance id; then the events the action itself describes, in the
 * order the action lists them; then the step change. Two clients folding the
 * same log therefore derive the identical event list.
 */
export function deriveTriggerEvents(
  prev: GameState,
  action: GameAction,
  next: GameState
): TriggerEvent[] {
  const events: TriggerEvent[] = [];
  if (next.mode !== 'full') return events;

  /* --- zone changes --- */
  for (const id of Object.keys(next.cards).sort()) {
    const after = next.cards[id];
    const before = prev.cards[id];

    if (!before) {
      // A card that did not exist a moment ago: a minted token. It enters if it
      // arrived on the battlefield.
      if (after.zone === 'battlefield') {
        events.push({
          kind: 'enters',
          instanceId: id,
          playerId: after.controllerId,
          toZone: 'battlefield',
        });
      }
      continue;
    }

    if (before.zone === after.zone) continue;

    if (after.zone === 'battlefield') {
      events.push({
        kind: 'enters',
        instanceId: id,
        playerId: after.controllerId,
        fromZone: before.zone,
        toZone: 'battlefield',
      });
    } else if (before.zone === 'battlefield' && after.zone === 'graveyard') {
      // CR 700.4 — "dies" is battlefield to graveyard and nothing else. A token
      // that ceased to exist still died, so `removedFromGame` is not a reason to
      // skip it; its controller is read from the state before it left.
      events.push({
        kind: 'dies',
        instanceId: id,
        playerId: before.controllerId,
        fromZone: 'battlefield',
        toZone: 'graveyard',
      });
    }

    if (before.zone === 'library' && after.zone === 'hand') {
      events.push({
        kind: 'draw',
        instanceId: id,
        playerId: after.ownerId,
        fromZone: 'library',
        toZone: 'hand',
      });
    }
  }

  /* --- what the action itself says --- */
  switch (action.type) {
    case 'PLAY': {
      // Playing a land is not casting a spell (CR 305.1). Everything else that
      // left a hand or the command zone under a PLAY was cast.
      const card = next.cards[action.instanceId];
      const from = prev.cards[action.instanceId]?.zone;
      if (card && !isLand(card) && (from === 'hand' || from === 'command')) {
        events.push({
          kind: 'cast',
          instanceId: action.instanceId,
          playerId: card.controllerId,
          fromZone: from,
          toZone: card.zone,
        });
      }
      break;
    }

    case 'CAST_SPELL': {
      const card = next.cards[action.instanceId];
      if (card) {
        events.push({
          kind: 'cast',
          instanceId: action.instanceId,
          playerId: action.controllerId ?? card.controllerId,
        });
      }
      break;
    }

    case 'ATTACK': {
      for (const declaration of action.attackers) {
        const card = next.cards[declaration.attackerId];
        if (!card) continue;
        events.push({
          kind: 'attacks',
          instanceId: declaration.attackerId,
          playerId: card.controllerId,
          targetPlayerId: declaration.defenderPlayerId,
          targetInstanceId: declaration.defenderInstanceId,
        });
      }
      break;
    }

    case 'BLOCK': {
      for (const block of action.blocks) {
        const card = next.cards[block.blockerId];
        if (!card) continue;
        events.push({
          kind: 'blocks',
          instanceId: block.blockerId,
          playerId: card.controllerId,
          targetInstanceId: block.attackerId,
        });
      }
      break;
    }

    case 'DAMAGE': {
      if (action.sourceInstanceId && action.amount > 0) {
        events.push({
          kind: 'deals-damage',
          instanceId: action.sourceInstanceId,
          playerId: action.sourcePlayerId,
          targetPlayerId: action.targetPlayerId,
          amount: action.amount,
          combat: action.combat,
        });
      }
      break;
    }

    case 'DAMAGE_CARD': {
      if (action.sourceInstanceId && action.amount > 0) {
        events.push({
          kind: 'deals-damage',
          instanceId: action.sourceInstanceId,
          playerId: action.sourcePlayerId,
          targetInstanceId: action.instanceId,
          amount: action.amount,
          combat: action.combat,
        });
      }
      break;
    }

    default:
      break;
  }

  /* --- the step turning over --- */
  if (prev.step !== next.step || prev.activePlayerId !== next.activePlayerId) {
    const kind: TriggerEventKind | null =
      next.step === 'upkeep' ? 'upkeep' : next.step === 'end' ? 'end-step' : null;
    if (kind) events.push({ kind, playerId: next.activePlayerId });
  }

  return events;
}

/* -------------------------------------------------------------------------- */
/* Matching events to abilities                                               */
/* -------------------------------------------------------------------------- */

/**
 * The permanents whose abilities could see this event, in a deterministic
 * order.
 *
 * A self-event looks only at the object it happened to — which may already have
 * left the battlefield, because a "dies" trigger's source is in a graveyard by
 * the time anything looks at it. A controller-wide event walks that player's
 * battlefield in arrival order.
 */
function sourcesFor(state: GameState, event: TriggerEvent): CardInstance[] {
  if (SELF_EVENTS.has(event.kind)) {
    const card = event.instanceId ? state.cards[event.instanceId] : undefined;
    return card ? [card] : [];
  }

  const controller = state.players.find(player => player.id === event.playerId);
  if (!controller) return [];
  const out: CardInstance[] = [];
  for (const id of controller.zones.battlefield) {
    const card = state.cards[id];
    if (!card || card.removedFromGame) continue;
    if (card.controllerId !== controller.id) continue;
    out.push(card);
  }
  return out;
}

/**
 * The controller of an ability is the controller of its source (CR 603.2).
 *
 * For a permanent that has already left the battlefield the field still holds
 * the last controller, which is what "last known information" means here.
 */
function controllerOf(card: CardInstance): PlayerId {
  return card.controllerId ?? card.ownerId;
}

/**
 * Every ability that triggers on these events, in detection order — before
 * CR 603.3b ordering is applied.
 *
 * The CR 603.4 condition is checked here, as the trigger would go on the stack:
 * a condition that is definitely false means the ability never triggers at all,
 * which is why it produces nothing rather than a suppressed entry.
 */
export function triggersForEvents(
  state: GameState,
  events: readonly TriggerEvent[]
): PendingTrigger[] {
  const out: PendingTrigger[] = [];

  events.forEach((event, eventIndex) => {
    for (const card of sourcesFor(state, event)) {
      abilitiesOf(card).forEach((ability, abilityIndex) => {
        if (TIMING_EVENT[ability.timing] !== event.kind) return;

        const controllerId = controllerOf(card);
        // CR 603.4, first check. `null` (a condition we cannot judge) is treated
        // as "trigger anyway" so the player is told about it, rather than an
        // ability disappearing on a technicality nobody can see.
        // `return`, not `continue`: this is a `forEach` callback and the
        // enclosing `for` loop is one level further out.
        if (evaluateIntervening(state, controllerId, ability.intervening) === false) return;

        out.push({
          id: `t${eventIndex}.${out.length}:${card.instanceId}#${abilityIndex}`,
          sourceInstanceId: card.instanceId,
          sourceName: card.name,
          controllerId,
          event,
          ability,
        });
      });
    }
  });

  return out;
}

/** Detect the events an applied action caused, and the triggers they set off. */
export function collectTriggers(
  prev: GameState,
  action: GameAction,
  next: GameState
): PendingTrigger[] {
  if (next.mode !== 'full' || next.status !== 'playing') return [];
  return triggersForEvents(next, deriveTriggerEvents(prev, action, next));
}

/**
 * What triggers this action *would* cause, without applying anything.
 *
 * This is what a client calls to show a controller the batch it is about to
 * order. Detection is pure, so the ids it returns are exactly the ids the
 * reducer will mint, and they can be handed straight back on
 * `ActionMeta.triggerOrder`.
 */
export function previewTriggers(
  prev: GameState,
  action: GameAction,
  next: GameState
): PendingTrigger[] {
  return orderTriggers(next, collectTriggers(prev, action, next), action.triggerOrder);
}

/* -------------------------------------------------------------------------- */
/* CR 603.3b — the order they go on the stack                                 */
/* -------------------------------------------------------------------------- */

/** Seat distance from the active player, so turn order starts at the active player. */
function turnOrderIndex(state: GameState, playerId: PlayerId): number {
  const count = state.players.length || 1;
  const activeSeat = state.players.find(p => p.id === state.activePlayerId)?.seat ?? 0;
  const seat = state.players.find(p => p.id === playerId)?.seat ?? 0;
  return (seat - activeSeat + count) % count;
}

/**
 * Put a batch of simultaneous triggers into the order they go on the stack,
 * bottom first.
 *
 * CR 603.3b: the active player's go on first, then each other player's in turn
 * order. Because the stack is last-in-first-out, that means a non-active
 * player's trigger *resolves first* — which is the real rule, and the thing an
 * implementation gets backwards if it just resolves in detection order.
 *
 * Within one controller's own batch the rules give that player the choice, and
 * `preferred` is where the choice arrives: a list of trigger ids in the order
 * that player wants them stacked, so the last id listed resolves first. Ids
 * that are not theirs, are unknown, or are repeated are ignored, and anything
 * they left out keeps its default position after the ones they named. An
 * invalid choice can therefore never desynchronise two clients — it degrades to
 * the default, which both derive identically.
 */
export function orderTriggers(
  state: GameState,
  triggers: readonly PendingTrigger[],
  preferred?: readonly string[]
): PendingTrigger[] {
  if (triggers.length < 2) return [...triggers];

  const byController = new Map<PlayerId, PendingTrigger[]>();
  for (const trigger of triggers) {
    const group = byController.get(trigger.controllerId);
    if (group) group.push(trigger);
    else byController.set(trigger.controllerId, [trigger]);
  }

  const controllers = [...byController.keys()].sort(
    (a, b) => turnOrderIndex(state, a) - turnOrderIndex(state, b)
  );

  const out: PendingTrigger[] = [];
  for (const controllerId of controllers) {
    const group = byController.get(controllerId) ?? [];
    if (!preferred || preferred.length === 0) {
      out.push(...group);
      continue;
    }

    const remaining = new Map(group.map(trigger => [trigger.id, trigger]));
    const chosen: PendingTrigger[] = [];
    for (const id of preferred) {
      const trigger = remaining.get(id);
      if (!trigger) continue;
      remaining.delete(id);
      chosen.push(trigger);
    }
    // Anything the controller did not mention keeps its default position, after
    // the ones they did.
    out.push(...chosen, ...group.filter(trigger => remaining.has(trigger.id)));
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* The waiting list                                                           */
/* -------------------------------------------------------------------------- */

/** The triggers waiting to resolve, bottom of the stack first. */
export function pendingTriggersOf(state: GameState): readonly PendingTrigger[] {
  return state.pendingTriggers ?? [];
}

/** CR 603.3 — put a batch on top of whatever is already waiting. */
export function enqueueTriggers(
  state: GameState,
  triggers: readonly PendingTrigger[]
): GameState {
  if (triggers.length === 0) return state;
  return { ...state, pendingTriggers: [...pendingTriggersOf(state), ...triggers] };
}

/** Take the top trigger off. Null when nothing is waiting. */
export function popTrigger(
  state: GameState
): { state: GameState; trigger: PendingTrigger } | null {
  const queue = pendingTriggersOf(state);
  if (queue.length === 0) return null;
  return {
    trigger: queue[queue.length - 1],
    state: { ...state, pendingTriggers: queue.slice(0, -1) },
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/** "Ajani's Pridemate — enters the battlefield", for the `cause` on every action. */
export function describeTrigger(trigger: PendingTrigger): string {
  return `${trigger.sourceName} — ${TRIGGER_LABELS[trigger.ability.timing].toLowerCase()}`;
}

/**
 * What one trigger does, as ordinary actions.
 *
 * Four outcomes, and all four are visible:
 *
 *   - the CR 603.4 condition is now false — the ability does nothing, and says
 *     so, because an ability that vanishes silently is indistinguishable from a
 *     bug;
 *   - the condition cannot be judged — the ability is handed to the player;
 *   - the ability is understood — its effects become real actions;
 *   - the ability is not understood, or only half of it is — a `NOTE` names
 *     what is left to do by hand.
 */
export function resolveTriggerActions(
  state: GameState,
  trigger: PendingTrigger,
  at = 0
): GameAction[] {
  const card = state.cards[trigger.sourceInstanceId];
  const ability = trigger.ability;
  const cause = describeTrigger(trigger);

  // CR 603.4, second check: the condition is looked at again on resolution.
  const condition = ability.intervening;
  if (condition) {
    const verdict = evaluateIntervening(state, trigger.controllerId, condition);
    if (verdict === false) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName}'s triggered ability did nothing — "${describeIntervening(condition)}" was no longer true when it resolved.`,
          at,
        },
      ];
    }
    if (verdict === null) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName} triggered, but the engine does not evaluate "if ${describeIntervening(condition)}". Resolve it by hand: ${ability.clause}`,
          at,
        },
      ];
    }
  }

  // The source may have left the battlefield — a dies trigger's source is in a
  // graveyard by now — but its abilities still resolve (CR 603.6d / 603.10).
  if (!card) {
    return [
      {
        type: 'NOTE',
        message: `${trigger.sourceName} triggered (${TRIGGER_LABELS[ability.timing].toLowerCase()}) but its source has left the game. Resolve it by hand: ${ability.clause}`,
        at,
      },
    ];
  }

  const out: GameAction[] = [];
  if (ability.automated) {
    out.push(...actionsForTrigger(state, card, ability, at).map(a => ({ ...a, cause })));
  }
  const note = noteForDeclinedTrigger(card, ability, at);
  if (note) out.push(note);
  return out;
}

/**
 * The note the engine owes a player for a spell that resolved without the
 * engine applying anything.
 *
 * An instant that "resolved" and did nothing is the loudest silent no-op there
 * is, and the original complaint this whole subsystem answers. It is not a
 * trigger, so it sits beside them rather than inside them.
 */
export function spellResolutionNotes(
  prev: GameState,
  action: GameAction,
  next: GameState,
  at = 0
): GameAction[] {
  if (next.mode !== 'full') return [];
  if (action.type !== 'PLAY' || action.to !== 'graveyard') return [];
  const card = next.cards[action.instanceId];
  if (!card) return [];

  const note = manualNoteAction(card, at, 'resolves');
  if (note) return [note];
  return [
    {
      type: 'NOTE',
      instanceId: card.instanceId,
      message: `${card.name} resolves — the engine applies no spell effects; resolve it by hand.`,
      at,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Draining the queue                                                         */
/* -------------------------------------------------------------------------- */

export interface TriggerDrainResult {
  state: GameState;
  /** Triggers resolved, in resolution order. */
  resolved: PendingTrigger[];
  /** False when the cap was reached and triggers are still waiting. */
  drained: boolean;
}

/**
 * Resolve waiting triggers, top of the stack first, until the queue is empty.
 *
 * `apply` is injected — `rules.ts` passes its own reducer — so this module
 * depends on nothing that depends on it and the dependency points one way.
 * Anything a resolving trigger causes lands on the queue while the loop is
 * running and is picked up on the next turn of it, which is what makes a chain
 * of triggers resolve last-in-first-out without any recursion.
 */
export function drainTriggers(
  state: GameState,
  apply: (state: GameState, action: GameAction) => GameState,
  at = 0,
  maxResolutions = MAX_TRIGGER_RESOLUTIONS
): TriggerDrainResult {
  let next = state;
  const resolved: PendingTrigger[] = [];

  for (let i = 0; i < maxResolutions; i++) {
    const popped = popTrigger(next);
    if (!popped) return { state: next, resolved, drained: true };

    next = popped.state;
    resolved.push(popped.trigger);
    for (const action of resolveTriggerActions(next, popped.trigger, at)) {
      next = apply(next, action);
    }
  }

  if (pendingTriggersOf(next).length === 0) {
    return { state: next, resolved, drained: true };
  }

  // CR 104.4b would call this a draw. We stop, keep the remainder visible on
  // `pendingTriggers`, and say so out loud.
  next = apply(next, {
    type: 'NOTE',
    message: `Stopped after ${maxResolutions} triggered abilities — ${pendingTriggersOf(next).length} still waiting. In a real game this loop would be a draw; resolve the rest by hand.`,
    at,
  });
  return { state: next, resolved, drained: false };
}

/* -------------------------------------------------------------------------- */
/* Bridge to the stack                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The waiting triggers as `PUT_ABILITY_ON_STACK` actions, bottom of the stack
 * first.
 *
 * `drainTriggers` resolves triggers immediately, which is what every surface in
 * this app currently expects and what keeps a two-player playtest readable.
 * When the priority loop in `stack.ts` is driving a game instead, this is the
 * handoff: at the point a player would receive priority, the waiting list is
 * emptied onto the real stack and the ordinary resolution machinery takes it
 * from there.
 *
 * The `effects` list is deliberately only what the engine understands. A
 * trigger it does not understand still goes on the stack — the ability really
 * did trigger — carrying a single `note` effect, so it resolves into a line
 * that tells the player what to do rather than into nothing.
 */
export function triggerStackActions(state: GameState, at = 0): GameAction[] {
  return pendingTriggersOf(state).map(trigger => ({
    type: 'PUT_ABILITY_ON_STACK' as const,
    controllerId: trigger.controllerId,
    kind: 'triggered' as const,
    name: `${trigger.sourceName} (${TRIGGER_LABELS[trigger.ability.timing].toLowerCase()})`,
    sourceInstanceId: trigger.sourceInstanceId,
    effects: stackEffectsFor(state, trigger),
    at,
    cause: describeTrigger(trigger),
  }));
}

/** One trigger's effects in the stack's declarative DSL. */
export function stackEffectsFor(
  state: GameState,
  trigger: PendingTrigger
): NonNullable<Extract<GameAction, { type: 'PUT_ABILITY_ON_STACK' }>['effects']> {
  const ability = trigger.ability;
  const out: NonNullable<
    Extract<GameAction, { type: 'PUT_ABILITY_ON_STACK' }>['effects']
  > = [];

  if (ability.automated) {
    for (const effect of ability.effects) {
      switch (effect.kind) {
        case 'gain-life':
          out.push({ op: 'life', amount: effect.amount, to: { from: 'controller' } });
          break;
        case 'lose-life':
          out.push({ op: 'life', amount: -effect.amount, to: { from: 'controller' } });
          break;
        case 'each-opponent-loses-life':
          out.push({ op: 'life', amount: -effect.amount, to: { from: 'each-opponent' } });
          break;
        case 'damage-each-opponent':
          out.push({ op: 'damage', amount: effect.amount, to: { from: 'each-opponent' } });
          break;
        case 'draw':
          out.push({ op: 'draw', count: effect.amount, to: { from: 'controller' } });
          break;
        case 'counter-on-self':
          out.push({
            op: 'counters',
            counter: '+1/+1',
            delta: effect.amount,
            to: { from: 'source' },
          });
          break;
        case 'create-token':
          if (effect.token) {
            out.push({
              op: 'token',
              token: effect.token,
              count: effect.amount,
              tapped: effect.tapped,
              to: { from: 'controller' },
            });
          }
          break;
      }
    }
  }

  // The honesty rule, carried onto the stack: an ability the engine cannot run
  // resolves into a line saying so, never into nothing.
  const outstanding = ability.automated ? ability.residual : ability.clause;
  if (outstanding) {
    out.push({
      op: 'note',
      message: `${trigger.sourceName} (${TRIGGER_LABELS[ability.timing].toLowerCase()}) — resolve by hand: ${outstanding}`,
    });
  }

  return out;
}
