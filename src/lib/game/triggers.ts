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
  InterveningCondition,
  PendingTrigger,
  PlayerId,
  StackTarget,
  TriggerEvent,
  TriggerEventKind,
  TriggerTiming,
} from './types.ts';
import { isLand } from './mana.ts';
// CR 603.3d — what a waiting trigger is pointed at, and whether anybody still
// has to be asked. `announce.ts` never imports this file back; the reason the
// dependency has to point one way is written there.
import {
  blankIllegalTargets,
  everyTargetIsGone,
  planTriggerTargets,
  triggerTargetSpecs,
} from './announce.ts';
import {
  TRIGGER_LABELS,
  actionsForTrigger,
  detectTriggers,
  manualNoteAction,
  noteForDeclinedTrigger,
} from './effects.ts';
import {
  abilityEngineOwns,
  describeAsDetected,
  dslConditionHolds,
  dslTriggerActions,
  gameEventKindFor,
  ownedTriggersOf,
  triggerSubjectMatches,
} from './abilities/trigger-bridge.ts';

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
 * The object the event happened to, and its controller's battlefield.
 *
 * This is the OLD detector's list and it is deliberately narrow. Every pattern
 * `effects.ts` recognises is self-referential ("when this creature enters"), so
 * showing it any object other than the one the event happened to would fire
 * every enters-the-battlefield trigger in play for one creature entering. The
 * wider list is `watchersFor` below, and only the ability engine reads it.
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
 * Every permanent that could be WATCHING this event, in a deterministic order.
 *
 * "Whenever another creature you control enters" is on a permanent the event
 * did not happen to, so a list built from the event's own object can never find
 * it. This walks the whole board, and the ability's own subject
 * (`triggerSubjectMatches`) decides which of those permanents actually cares.
 *
 * Order matters and is fixed: the event's own object first, so every trigger id
 * an existing game already produces keeps the value it had, then each seat in
 * turn order and each battlefield in arrival order. Never object key order,
 * never a clock. Two clients folding the same log build the same list.
 *
 * Widening this list is safe ONLY because the caller keeps the old detector on
 * `sourcesFor`. See the ownership fork in `triggersForEvents`.
 *
 * It takes no event, which is the point: every permanent in play is a candidate
 * for every event, and narrowing that here would be a second subject test
 * sitting a long way from the first one and free to disagree with it. The event
 * is asked about exactly once, by `triggerSubjectMatches`.
 */
function watchersFor(state: GameState, own: readonly CardInstance[]): CardInstance[] {
  const seen = new Set<string>();
  const out: CardInstance[] = [];

  const push = (card: CardInstance | undefined): void => {
    if (!card || seen.has(card.instanceId)) return;
    seen.add(card.instanceId);
    out.push(card);
  };

  for (const card of own) push(card);
  for (const player of state.players) {
    for (const id of player.zones.battlefield) {
      const card = state.cards[id];
      if (!card || card.removedFromGame) continue;
      if (card.controllerId !== player.id) continue;
      push(card);
    }
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
    const own = sourcesFor(state, event);
    const ownIds = new Set(own.map(card => card.instanceId));

    for (const card of watchersFor(state, own)) {
      const controllerId = controllerOf(card);

      // ── The ownership fork ────────────────────────────────────────────────
      // Exactly one of these two branches runs for any given card. This is the
      // only place in the engine where a card's triggers are enumerated, so
      // taking one list or the other — never the concatenation — is what makes
      // a doubled enters-the-battlefield trigger structurally impossible rather
      // than merely unlikely. See `abilities/trigger-bridge.ts`.
      if (abilityEngineOwns(card)) {
        ownedTriggersOf(card).forEach((ability, abilityIndex) => {
          if (gameEventKindFor(ability.event) !== event.kind) return;
          // WHICH object it happened to. The event kind alone would fire every
          // "whenever a creature you control enters" on the board for an
          // opponent's land.
          if (!triggerSubjectMatches(state, ability, { instanceId: card.instanceId, controllerId }, event)) {
            return;
          }
          // CR 603.4, first check — the compiled condition, evaluated for real.
          if (!dslConditionHolds(state, ability, { instanceId: card.instanceId, controllerId }, event)) {
            return;
          }

          out.push({
            id: `t${eventIndex}.${out.length}:${card.instanceId}#${abilityIndex}`,
            sourceInstanceId: card.instanceId,
            sourceName: card.name,
            controllerId,
            event,
            ability: describeAsDetected(ability),
            dsl: ability,
          });
        });
        continue;
      }

      // The old detector reads oracle text with a regex and has no notion of a
      // subject, so it may only ever be shown the object the event happened to.
      // Without this line, widening the walk above would make every card in
      // play with a detected enters trigger fire for somebody else's creature.
      if (!ownIds.has(card.instanceId)) continue;

      abilitiesOf(card).forEach((ability, abilityIndex) => {
        if (TIMING_EVENT[ability.timing] !== event.kind) return;

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

  // ── The ownership fork, resolution half ─────────────────────────────────
  // `dsl` is present exactly when `triggersForEvents` took the ability-engine
  // branch for this card, so these two paths are as mutually exclusive here as
  // they were at detection. The old `actionsForTrigger` below never sees an
  // owned trigger, and `to-actions.ts` never sees an unowned one.
  if (trigger.dsl) {
    // CR 603.4, second check — the same compiled condition, re-evaluated as the
    // ability resolves. A condition that has gone false says so rather than
    // vanishing, exactly as the old path does.
    if (!dslConditionHolds(state, trigger.dsl, {
      instanceId: trigger.sourceInstanceId,
      controllerId: trigger.controllerId,
    }, trigger.event)) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName}'s triggered ability did nothing — its condition was no longer true when it resolved: ${trigger.dsl.text}`,
          at,
        },
      ];
    }

    /*
     * WHAT IT IS POINTED AT, and the three rules that decide it. All three end
     * in a sentence rather than in an ability that runs and changes nothing,
     * because a trigger that "resolved" and did nothing is the loudest silent
     * no-op there is.
     *
     * ONE. Nobody announced. `drainTriggers` below does not allow that — it
     * settles or waits — but a hand-built trigger in a test, or a game saved
     * before `PendingTrigger.targets` existed, still can, and resolving one
     * would aim every `{sel:'target'}` at nobody in silence.
     */
    const specs = triggerTargetSpecs(trigger);
    if (specs.length > 0 && !trigger.targets) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName} triggered and was never pointed at anything, so nothing happened. Resolve it by hand: ${trigger.dsl.text}`,
          at,
        },
      ];
    }

    /*
     * TWO. CR 603.3d — the ability names a target and the board offered none,
     * so it is simply removed from the stack. The empty announcement is that
     * verdict, written by `planTriggerTargets`, and it has to be checked here
     * or an "enters, destroy target creature an opponent controls" played into
     * an empty board would run its effects against nobody and read as an engine
     * that had not understood the card.
     */
    if (specs.length > 0 && !(trigger.targets ?? []).some(Boolean)) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName}'s triggered ability was removed from the stack — there was nothing legal for it to target: ${trigger.dsl.text}`,
          at,
        },
      ];
    }

    /*
     * THREE. CR 608.2b, the recheck: the target is looked at AGAIN as the
     * ability resolves, and an ability all of whose targets have gone does not
     * resolve at all. Exactly the rule `stack.ts` applies to a spell, through
     * exactly the same two functions — which is the reason they moved to
     * `announce.ts` rather than being written twice.
     */
    const by = {
      controllerId: trigger.controllerId,
      sourceInstanceId: trigger.sourceInstanceId,
    };
    if (everyTargetIsGone(state, trigger.targets, by)) {
      return [
        {
          type: 'NOTE',
          instanceId: trigger.sourceInstanceId,
          message: `${trigger.sourceName}'s triggered ability did nothing — every target it was pointed at is now illegal.`,
          at,
        },
      ];
    }

    return dslTriggerActions(
      state,
      trigger.dsl,
      { instanceId: trigger.sourceInstanceId, controllerId: trigger.controllerId },
      {
        at,
        cause,
        // The event the trigger fired on, carried through so resolution binds
        // the same subject detection matched. `PendingTrigger.event` is plain
        // JSON, so a client replaying the log binds it identically.
        event: trigger.event,
        // Announced when this went on the stack, with anything since gone
        // illegal blanked IN PLACE rather than filtered out. Positions are the
        // contract — `{sel:'target', ref:n}` is a plain index — so compacting
        // would point the first half of the ability at the second half's
        // victim.
        targets: blankIllegalTargets(state, trigger.targets, by),
        // Derived from the trigger's own deterministic id and the state
        // version, so any token this ability mints gets the same id on every
        // client replaying the log.
        idPrefix: `${trigger.id}:${state.version}`,
      }
    );
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
  /**
   * True when the drain stopped because the top trigger is waiting to be
   * pointed at something. Distinct from the cap: this is the game working, not
   * the engine giving up, and it clears the moment somebody answers.
   */
  awaitingTargets: boolean;
}

/**
 * CR 603.3d — settle a trigger's targets, or say the drain has to wait.
 *
 * Three answers, and each one is a different thing to do next:
 *
 *   `resolve`  nothing to aim, or a FORCED choice the engine took itself. A
 *              lone legal candidate is not a decision, so most triggers never
 *              stop the game at all.
 *   `wait`     a real decision, and the engine decides nothing. The trigger
 *              stays at the top of the queue and its controller is asked. This
 *              is the halt, and `announce.ts` explains why it has to be one.
 *   `resolve`  again, for CR 603.3d's other half: an ability that names a
 *              target and finds none legal is removed from the stack. That is
 *              an ANSWER, not a question, so it must not wait — it goes through
 *              `resolveTriggerActions`, which prints the sentence.
 *
 * The forced answer is written onto the trigger rather than recomputed at
 * resolution, for the same reason `StackObject.targets` is a field: the choice
 * belongs to the moment the ability went on the stack, and a board that changed
 * underneath must not be able to re-aim it.
 */
function settleTargets(
  state: GameState,
  trigger: PendingTrigger
): { wait: boolean; trigger: PendingTrigger } {
  if (trigger.targets) return { wait: false, trigger };
  if (triggerTargetSpecs(trigger).length === 0) return { wait: false, trigger };

  const aim = planTriggerTargets(state, trigger);
  if (aim.pending.length > 0) return { wait: true, trigger };
  // Either settled outright, or impossible. Both resolve; `resolveTriggerActions`
  // and `everyTargetIsGone` between them say which happened.
  return { wait: false, trigger: { ...trigger, targets: aim.targets } };
}

/**
 * Resolve waiting triggers, top of the stack first, until the queue is empty.
 *
 * `apply` is injected — `rules.ts` passes its own reducer — so this module
 * depends on nothing that depends on it and the dependency points one way.
 * Anything a resolving trigger causes lands on the queue while the loop is
 * running and is picked up on the next turn of it, which is what makes a chain
 * of triggers resolve last-in-first-out without any recursion.
 *
 * ## It can now stop early without anything being wrong
 *
 * A trigger whose ability names a target and offers its controller a real
 * choice halts the loop. Everything below it waits too, which is correct: it is
 * not on the stack yet. The queue stays on `GameState.pendingTriggers`, where
 * `triggerAwaitingTargets` finds it, and the game resumes on an
 * `ANNOUNCE_TRIGGER_TARGETS`. A seat with nobody willing to answer is a hung
 * game — visible as a stall in the playtest harness, never as a trigger that
 * quietly did nothing.
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
    const queue = pendingTriggersOf(next);
    const top = queue[queue.length - 1];
    if (!top) return { state: next, resolved, drained: true, awaitingTargets: false };

    const settled = settleTargets(next, top);
    if (settled.wait) {
      return { state: next, resolved, drained: false, awaitingTargets: true };
    }

    const popped = popTrigger(next);
    if (!popped) return { state: next, resolved, drained: true, awaitingTargets: false };

    next = popped.state;
    resolved.push(settled.trigger);
    for (const action of resolveTriggerActions(next, settled.trigger, at)) {
      next = apply(next, action);
    }
  }

  if (pendingTriggersOf(next).length === 0) {
    return { state: next, resolved, drained: true, awaitingTargets: false };
  }

  // CR 104.4b would call this a draw. We stop, keep the remainder visible on
  // `pendingTriggers`, and say so out loud.
  next = apply(next, {
    type: 'NOTE',
    message: `Stopped after ${maxResolutions} triggered abilities — ${pendingTriggersOf(next).length} still waiting. In a real game this loop would be a draw; resolve the rest by hand.`,
    at,
  });
  return { state: next, resolved, drained: false, awaitingTargets: false };
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
 * ## NOT YET TAUGHT ABOUT THE ABILITY ENGINE — read before wiring this up
 *
 * This path and `stackEffectsFor` below still speak only the old
 * `DetectedEffect` vocabulary. A trigger owned by the ability engine carries
 * `PendingTrigger.dsl`, and its `ability.automated` is `false`, so it degrades
 * here to a "resolve by hand" line: safe and honest, but wrong — the engine
 * *would* have resolved it, through `drainTriggers` → `resolveTriggerActions`.
 *
 * Do not fix that by adding a second switch over `Effect` here. `to-actions.ts`
 * is deliberately the ONE switch over that union, and a second one is how the
 * two drift apart. The right fix is for `PUT_ABILITY_ON_STACK` to carry the
 * compiled ability and let resolution call `to-actions.ts`, the same way
 * `resolveTriggerActions` already does.
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
