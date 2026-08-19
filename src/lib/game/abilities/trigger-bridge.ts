/**
 * DeckMatrix — ability bridge: who owns a card's triggers.
 *
 * ## The hazard this file exists to remove
 *
 * Two trigger systems can see the same card.
 *
 *   - **The old detector** — `effects.ts`'s `detectTriggers`, a regex pass over
 *     oracle text producing `DetectedTrigger`. `triggers.ts` reaches it through
 *     `abilitiesOf`.
 *   - **The ability engine** — the oracle-text compiler in
 *     `src/lib/cards/abilities/`, producing a typed `TriggeredAbility` whose
 *     effects `to-actions.ts` turns into real `GameAction`s.
 *
 * If both enumerated one card's triggers, every enters-the-battlefield trigger
 * in the game would fire twice. That is not a tuning problem to be careful
 * about — it is a structural one, and it is solved structurally: there is
 * exactly ONE place a card's triggers are enumerated (`triggersForEvents`), and
 * it takes one list or the other, never the concatenation. `abilityEngineOwns`
 * is the switch, and because the two branches are mutually exclusive by
 * construction, no tuning of the predicate can ever produce a double fire — a
 * wrong answer changes *which* system handles a card, never *how many* do.
 *
 * ## What "owns" means, and why it is this strict
 *
 * A card is owned by the ability engine only when the engine understands the
 * whole card. Partial ownership is the failure mode to avoid: if the engine
 * took a card whose second ETB clause it never modelled, that clause would stop
 * firing, because the old detector no longer looks at the card at all. So
 * ownership is all-or-nothing per card and demands, all of them:
 *
 *   1. `coverage === 'full'` — the compiler accounted for every clause of
 *      oracle text and left no `{do:'manual'}` marker. This is derived by
 *      `deriveCoverage`, never asserted, so it cannot be spelled optimistically.
 *   2. At least one triggered ability — otherwise there is nothing to own, and
 *      handing the card over would only silence the old detector.
 *   3. Every triggered ability is *runnable* — see `unrunnableReason`. One
 *      unrunnable trigger disqualifies the whole card.
 *
 * Ownership is therefore derived from the card's own compiled abilities. There
 * is no list of card names anywhere in this file, and there must never be one:
 * a hand-maintained roster is a second classifier that drifts from the first.
 *
 * Pure: no clock, no randomness, no I/O.
 */

import type {
  CardInstance,
  DetectedTrigger,
  GameAction,
  GameState,
  InstanceId,
  PlayerId,
  TriggerEventKind,
  TriggerTiming,
} from '../types.ts';
import type {
  Condition,
  Effect,
  PlayerSelector,
  Selector,
  TriggerEvent as DslTriggerEvent,
  TriggeredAbility,
} from '../../cards/abilities/dsl.ts';
import { playerSelectorsIn, watchQueriesIn } from '../../cards/abilities/dsl.ts';
import { abilitiesFor, triggeredAbilitiesOf } from './card-abilities.ts';
import { evalCondition, makeContext } from './context.ts';
import { resolveAbilityActions } from './to-actions.ts';

/* -------------------------------------------------------------------------- */
/* Event vocabulary                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The game only derives nine event kinds (`deriveTriggerEvents`), and the DSL
 * describes seventeen. This is the intersection — the ones the engine can
 * actually observe happening.
 *
 * A DSL event with no entry here is not a bug and not a gap to paper over: the
 * game genuinely never derives that event, so an ability waiting on it could
 * never fire. Returning `null` keeps the card with the old detector rather than
 * handing it to an engine that would sit silent.
 */
function selfSel(selector: Selector | undefined): boolean {
  return !!selector && selector.sel === 'self';
}

function you(selector: PlayerSelector | undefined): boolean {
  return !!selector && selector.who === 'you';
}

/**
 * Which game event this DSL trigger listens for, or `null` when the engine
 * cannot observe it.
 *
 * Restricted to *self-referential* subjects on the permanent events. That is
 * not timidity, it is what `sourcesFor` can deliver: for a self-event it hands
 * back exactly the object the event happened to, so `{who:{sel:'self'}}` is
 * satisfied by construction. "Whenever ANOTHER creature you control enters"
 * needs the battlefield walked instead, and matching it against the self-event
 * source would fire it for the wrong permanent.
 *
 * The three player-wide events (`upkeep`, `end-step`, `draw`) are the opposite
 * case: `sourcesFor` walks the event player's battlefield, so `whose:'you'` is
 * likewise satisfied by construction, and any other `whose` is not.
 */
export function gameEventKindFor(event: DslTriggerEvent | undefined): TriggerEventKind | null {
  if (!event) return null;

  switch (event.on) {
    case 'enters':
      return selfSel(event.who) ? 'enters' : null;
    case 'dies':
      return selfSel(event.who) ? 'dies' : null;
    case 'attacks':
      return selfSel(event.who) ? 'attacks' : null;
    case 'blocks':
      return selfSel(event.who) ? 'blocks' : null;
    case 'deals-damage':
      return selfSel(event.source) ? 'deals-damage' : null;
    case 'cast':
      return selfSel(event.what) ? 'cast' : null;
    case 'draws-card':
      return you(event.whose) ? 'draw' : null;
    case 'step':
      if (!you(event.whose)) return null;
      // `deriveTriggerEvents` only ever emits these two steps as events.
      if (event.step === 'upkeep') return 'upkeep';
      if (event.step === 'end') return 'end-step';
      return null;
    default:
      // 'leaves', 'zone-change', 'becomes-blocked', 'dealt-damage', 'tapped',
      // 'untapped', 'counter-added', 'gains-life', 'loses-life', 'sacrificed'.
      // The engine derives no event for any of these.
      return null;
  }
}

/** The old vocabulary's name for a game event, for labels and the log line. */
const TIMING_FOR_EVENT: Record<TriggerEventKind, TriggerTiming> = {
  enters: 'etb',
  dies: 'death',
  attacks: 'attack',
  blocks: 'blocks',
  'deals-damage': 'deals-damage',
  upkeep: 'upkeep',
  'end-step': 'end-step',
  cast: 'cast',
  draw: 'draw',
};

/* -------------------------------------------------------------------------- */
/* Runnability                                                                */
/* -------------------------------------------------------------------------- */

/** Does this condition tree lean on history the state does not carry? */
function needsHistory(condition: Condition | undefined): boolean {
  if (!condition) return false;
  switch (condition.if) {
    case 'first-time-this-turn':
      return true;
    case 'not':
      return needsHistory(condition.of);
    case 'and':
    case 'or':
      return (condition.of ?? []).some(needsHistory);
    default:
      return false;
  }
}

/**
 * Does this effect tree lean on something the resolution context cannot bind?
 *
 * Three DSL members can be spelled perfectly and still resolve to nothing here,
 * and all three would do it QUIETLY, which is the failure this folder exists to
 * prevent:
 *
 *   - `{v:'watch'}` needs a folded action log (`watch.ts`). Nothing supplies
 *     one, so every watch expression evaluates to 0 — and 0 is a wrong answer,
 *     not a small one. "Draw a card for each creature that died this turn"
 *     would draw nothing and read as a card that just did not do much.
 *   - `{who:'trigger-player'}` needs `AbilityContext.triggerPlayerId`, and
 *     `dslTriggerActions` has no player to bind: the game's trigger events
 *     carry a source permanent, not the opponent whose cast or draw fired it.
 *   - `{do:'unless-pays'}` is a decision belonging to somebody who is not the
 *     controller, and a pure interpreter has no way to ask them.
 *
 * Any of the three keeps the card with the old detector, which asks for it by
 * hand. Worse automation, better honesty — the trade goes the same way every
 * time.
 */
function unbindableEffectReason(effects: readonly Effect[]): string | null {
  const queries = watchQueriesIn(effects);
  if (queries.length > 0) {
    return `needs turn history (${queries[0].event.saw}, ${queries[0].window}), which nothing folds yet`;
  }
  if (playerSelectorsIn(effects).some(selector => selector.who === 'trigger-player')) {
    return '"that player" — the trigger carries no player for it to name';
  }
  if (effects.some(hasUnlessPays)) {
    return 'an opponent-facing optional cost, which nothing can offer them';
  }
  return null;
}

/** `{do:'unless-pays'}` anywhere in the tree, including inside a `may` or a mode. */
function hasUnlessPays(effect: Effect): boolean {
  if (effect.do === 'unless-pays') return true;
  if (effect.do === 'if') return effect.then.some(hasUnlessPays) || (effect.else ?? []).some(hasUnlessPays);
  if (effect.do === 'for-each' || effect.do === 'repeat' || effect.do === 'may') {
    return effect.effects.some(hasUnlessPays);
  }
  if (effect.do === 'choose-mode') return effect.modes.some(mode => mode.effects.some(hasUnlessPays));
  return false;
}

/**
 * Why this triggered ability cannot be run, or `null` when it can.
 *
 * Returning the reason rather than a boolean is deliberate: it is what makes
 * ownership diagnosable in a test and explainable in a tooltip, instead of an
 * opaque false.
 */
export function unrunnableReason(ability: TriggeredAbility): string | null {
  if (gameEventKindFor(ability.event) === null) {
    return `the engine derives no event for ${JSON.stringify(ability.event?.on ?? 'unknown')}`;
  }
  if (ability.optional) {
    // "You may" is the player's word. Taking it automatically is the same class
    // of bug as not resolving it at all — the board changed and nobody agreed.
    return 'optional ("you may") — the choice is the player\'s';
  }
  if (ability.limit) {
    // "Only once each turn" needs a per-turn usage count that GameState does
    // not carry. Ignoring it would let the ability fire every time.
    return `limited to ${ability.limit.count} per ${ability.limit.per} — state carries no usage count`;
  }
  if (ability.targets && ability.targets.length > 0) {
    // Nothing announces targets for a trigger yet, so `{sel:'target'}` would
    // resolve to nothing and the ability would quietly do half its job.
    return 'needs announced targets, which triggers cannot yet carry';
  }
  if (needsHistory(ability.condition)) {
    // `evalCondition` answers `true` for 'first-time-this-turn' by design, so
    // an owned card carrying one would over-fire.
    return 'condition needs per-turn history the state does not carry';
  }
  const unbindable = unbindableEffectReason(ability.effects);
  if (unbindable) return unbindable;
  return null;
}

/* -------------------------------------------------------------------------- */
/* Ownership                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * True when the ability engine owns this card's triggers.
 *
 * `effects.ts` carries an older, narrower trigger detector for every card this
 * bridge does not model. Both firing for one card would double every
 * enters-the-battlefield trigger in the game, so exactly one of them is in
 * charge per card and this is the predicate that decides.
 *
 * Derived from the compiled abilities alone — see the file header for why the
 * three conditions are what they are.
 */
export function abilityEngineOwns(card: CardInstance | null | undefined): boolean {
  if (!card) return false;

  const record = abilitiesFor(card);
  // The compiler dropped no text and left no manual marker. Anything less and
  // the old detector may still be seeing something this engine cannot.
  if (record.coverage !== 'full') return false;

  const triggered = triggeredAbilitiesOf(card);
  if (triggered.length === 0) return false;

  // All or nothing: one unrunnable trigger and the whole card stays behind,
  // because a card split across both systems is the partial-ownership bug.
  return triggered.every(ability => unrunnableReason(ability) === null);
}

/**
 * The triggered abilities the engine will run for this card, in compiler order.
 *
 * Empty unless the engine owns the card, so a caller cannot accidentally run
 * these *alongside* the old detector's list.
 */
export function ownedTriggersOf(card: CardInstance | null | undefined): TriggeredAbility[] {
  return abilityEngineOwns(card) ? triggeredAbilitiesOf(card) : [];
}

/**
 * A compiled ability described in the old vocabulary, so every existing
 * consumer of `PendingTrigger.ability` keeps working.
 *
 * `automated` is `false` on purpose, and it is not a lie: it means "the *old*
 * engine automates none of this", which is exactly true. Everything that has
 * not been explicitly taught about the ability engine — `stackEffectsFor`,
 * `noteForDeclinedTrigger`, the UI badges — therefore degrades to quoting the
 * verbatim clause and asking for it by hand, which is the honest fallback. The
 * one path that HAS been taught, `resolveTriggerActions`, branches before it
 * ever reads this field.
 *
 * `clause` is `ability.text`, the verbatim oracle clause the compiler recorded.
 * Nothing here is invented.
 */
export function describeAsDetected(ability: TriggeredAbility): DetectedTrigger {
  const kind = gameEventKindFor(ability.event);
  return {
    timing: kind ? TIMING_FOR_EVENT[kind] : 'etb',
    clause: ability.text,
    // The old `DetectedEffect` vocabulary cannot express what will actually
    // resolve this ability. Claiming an effect list here would be inventing one.
    effects: [],
    automated: false,
  };
}

/* -------------------------------------------------------------------------- */
/* CR 603.4 — the condition between the event and the effect                  */
/* -------------------------------------------------------------------------- */

/**
 * Does this ability's condition hold right now?
 *
 * Checked twice, as CR 603.4 requires and as the old detector already does with
 * its `intervening`: once as the trigger would go on the stack, and again as it
 * resolves. An ability with no condition always holds.
 *
 * `unrunnableReason` has already excluded the one condition `evalCondition`
 * cannot honestly answer (`first-time-this-turn`, which it reports as `true` by
 * design), so every condition reaching here is one the engine really evaluates.
 */
export function dslConditionHolds(
  state: GameState,
  ability: TriggeredAbility,
  source: { instanceId: InstanceId; controllerId: PlayerId }
): boolean {
  if (!ability.condition) return true;
  const ctx = makeContext(state, source.instanceId, source.controllerId, {
    triggerSourceId: source.instanceId,
  });
  return evalCondition(ability.condition, ctx);
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run one owned triggered ability, as ordinary actions.
 *
 * `idPrefix` is derived from the trigger's own id and the state version, both
 * of which every client reproduces identically when replaying the log, so any
 * token this ability mints gets the same id everywhere. A uuid here would
 * desynchronise two clients on the next zone change.
 */
export function dslTriggerActions(
  state: GameState,
  ability: TriggeredAbility,
  source: { instanceId: InstanceId; controllerId: PlayerId },
  options: { at?: number; cause?: string; idPrefix: string }
): GameAction[] {
  const ctx = makeContext(state, source.instanceId, source.controllerId, {
    triggerSourceId: source.instanceId,
  });

  return resolveAbilityActions(ability.effects, ctx, {
    at: options.at ?? 0,
    ...(options.cause ? { cause: options.cause } : {}),
    idPrefix: options.idPrefix,
    sourceInstanceId: source.instanceId,
  });
}
