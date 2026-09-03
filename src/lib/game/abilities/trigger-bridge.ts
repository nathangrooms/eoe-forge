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
  StackTarget,
  TriggerEvent as GameTriggerEvent,
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
import { playerSelectorsIn, selectorsIn, watchQueriesIn } from '../../cards/abilities/dsl.ts';
import { abilitiesFor, announcedTargetsOf, triggeredAbilitiesOf } from './card-abilities.ts';
import type { AbilityContext } from './context.ts';
import { evalCondition, makeContext, matchesFilter, resolvePlayers, viewOf } from './context.ts';
import { resolveAbilityActions } from './to-actions.ts';

/* -------------------------------------------------------------------------- */
/* Event vocabulary                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which game event this DSL trigger listens for, or `null` when the engine
 * cannot observe it.
 *
 * The game derives nine event kinds (`deriveTriggerEvents`) and the DSL
 * describes seventeen. This is the intersection. A DSL event with no entry here
 * is not a gap to paper over: the game genuinely never derives it, so an ability
 * waiting on it could never fire, and `null` keeps the card with the old
 * detector rather than handing it to an engine that would sit silent.
 *
 * ## It used to also demand a self-referential subject. It does not any more.
 *
 * "Whenever ~ enters" and "whenever another creature you control enters" are
 * the SAME event. The difference is not which event to listen for, it is which
 * object the event has to have happened to, and that is a separate question
 * with a separate answer: `triggerSubjectMatches` below. Folding the two
 * together is what limited every permanent to watching only itself.
 */
export function gameEventKindFor(event: DslTriggerEvent | undefined): TriggerEventKind | null {
  if (!event) return null;

  switch (event.on) {
    case 'enters':
      return 'enters';
    case 'dies':
      return 'dies';
    case 'attacks':
      return 'attacks';
    case 'blocks':
      return 'blocks';
    case 'deals-damage':
      return 'deals-damage';
    case 'cast':
      return 'cast';
    case 'draws-card':
      return 'draw';
    case 'step':
      // `deriveTriggerEvents` only ever emits these two steps as events.
      if (event.step === 'upkeep') return 'upkeep';
      if (event.step === 'end') return 'end-step';
      return null;
    default:
      // 'leaves', 'zone-change', 'becomes-blocked', 'dealt-damage', 'tapped',
      // 'untapped', 'tapped-for-mana', 'counter-added', 'gains-life',
      // 'loses-life', 'sacrificed'. The engine derives no event for any of
      // these. `tapped-for-mana` is Kinnan and the mana doublers: the record
      // is read for deck building, and nothing fires it in a game yet.
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Subjects: WHICH object the event has to have happened to                   */
/* -------------------------------------------------------------------------- */

/**
 * Subject selectors an event can be tested against.
 *
 * `self` is the object itself, `attached` is an Aura's or Equipment's host, and
 * `all` is a class of object described by a filter. Nothing else names a class:
 * `target` and `each` are bound during resolution and are empty while a trigger
 * is being detected, so matching against one would refuse every event forever,
 * which is a trigger that never fires and never says why. Those are refused by
 * `unrunnableReasons` instead, out loud.
 */
function subjectSelectorSupported(selector: Selector | undefined): boolean {
  if (!selector) return false;
  return selector.sel === 'self' || selector.sel === 'attached' || selector.sel === 'all';
}

/**
 * Player selectors an event's player can be tested against.
 *
 * `defending` and `trigger-player` both resolve to nobody unless something
 * bound them, and nothing binds them while a trigger is being detected, so an
 * event would never match one. Same reasoning as above, same treatment.
 */
const SUBJECT_PLAYERS: ReadonlySet<string> = new Set(['you', 'each-opponent', 'each-player', 'active']);

function subjectPlayerSupported(selector: PlayerSelector | undefined): boolean {
  return !!selector && 'who' in selector && SUBJECT_PLAYERS.has(selector.who);
}

/** Every subject this ability's event names, in the order they must all pass. */
function subjectSupported(event: DslTriggerEvent | undefined): boolean {
  if (!event) return false;
  switch (event.on) {
    case 'enters':
    case 'dies':
    case 'attacks':
    case 'blocks':
      return subjectSelectorSupported(event.who);
    case 'deals-damage':
      return subjectSelectorSupported(event.source);
    case 'cast':
      return subjectSelectorSupported(event.what) && (!event.by || subjectPlayerSupported(event.by));
    case 'draws-card':
    case 'step':
      return subjectPlayerSupported(event.whose);
    default:
      return false;
  }
}

/**
 * Does the object an event happened to satisfy the ability's subject?
 *
 * Evaluated in the WATCHING permanent's context, which is the whole point:
 * `{is:'other'}` means "other than the watcher" and `controller:{who:'you'}`
 * means "controlled by the watcher's controller". Soul Warden asking about the
 * creature that just entered gets a different answer from the creature itself
 * asking about the same event, and both answers are right.
 *
 * ## Zone is deliberately not checked
 *
 * A `dies` subject is spelled `{sel:'all', where:{creature}, zone:'battlefield'}`
 * and by the time anything looks at it the creature is in a graveyard. The
 * EVENT already fixes the zone, which is what makes it a dies event rather than
 * a discard, so the selector's zone could only ever refuse a subject the event
 * had already confirmed. The filter answers what CLASS of object it was; the
 * event answers where it was.
 */
export function triggerSubjectMatches(
  state: GameState,
  ability: TriggeredAbility,
  observer: { instanceId: InstanceId; controllerId: PlayerId },
  event: GameTriggerEvent
): boolean {
  const dsl = ability.event;
  if (!dsl) return false;
  const ctx = subjectContext(state, observer, event);

  switch (dsl.on) {
    case 'enters':
    case 'dies':
    case 'attacks':
    case 'blocks':
      return objectMatches(dsl.who, event.instanceId, ctx);

    case 'deals-damage':
      if (dsl.combatOnly && !event.combat) return false;
      if (!damageTargetMatches(dsl.to, event, ctx)) return false;
      return objectMatches(dsl.source, event.instanceId, ctx);

    case 'cast':
      if (dsl.by && !playerMatches(dsl.by, event.playerId, ctx)) return false;
      return objectMatches(dsl.what, event.instanceId, ctx);

    case 'draws-card':
    case 'step':
      return playerMatches(dsl.whose, event.playerId, ctx);

    default:
      return false;
  }
}

/**
 * The watcher's context, with the event's object and player bound.
 *
 * One function so detection and resolution cannot bind them differently. A
 * subject that matched at detection and resolved to a different object would be
 * the worst kind of bug here: the trigger fires for the right creature and does
 * its work to the wrong one.
 *
 * ## What reads these two bindings today, stated plainly
 *
 * `triggerSubjectId` is read by `{sel:'trigger-subject'}` and `triggerPlayerId`
 * by `{who:'trigger-player'}`. NEITHER SELECTOR IS PRODUCED BY THE ORACLE-TEXT
 * COMPILER, so no card in the catalogue reaches them through this path today.
 * They are in the validated DSL, `context.ts` resolves them, and the offline
 * LLM pipeline in `scripts/coverage/llm/` may emit them.
 *
 * They are bound here anyway, and that is a deliberate two lines rather than an
 * oversight: this function's whole job is to say what the context of THIS event
 * is, and an event does have an object and a player. Leaving them out would
 * make the next producer's first card resolve into nothing, silently. But the
 * claim being made is only "correctly bound", never "a player can reach it".
 *
 * `defendingPlayerId` is the opposite case and is very much reached. Eleven
 * fully-covered cards name `{who:'defending'}` in a triggered ability, eight of
 * them were already owned, and `resolvePlayers` answers NOBODY for an unbound
 * defender by design — so Leeching Sliver's "defending player loses 1 life" was
 * resolving into no actions at all. The declared defender has been sitting in
 * the event this whole time.
 */
function subjectContext(
  state: GameState,
  observer: { instanceId: InstanceId; controllerId: PlayerId },
  event: GameTriggerEvent
): AbilityContext {
  return makeContext(state, observer.instanceId, observer.controllerId, {
    triggerSourceId: observer.instanceId,
    ...(event.instanceId ? { triggerSubjectId: event.instanceId } : {}),
    ...(event.playerId ? { triggerPlayerId: event.playerId } : {}),
    // CR 506.2 — the defending player, and ONLY from an attacks event, where
    // `deriveTriggerEvents` puts the declared defender in `targetPlayerId`. On
    // a deals-damage event that same field is whoever took the damage, which is
    // the same seat in combat and a different one out of it, so binding it
    // there would aim "defending player loses 1 life" at a bystander.
    ...(event.kind === 'attacks' && event.targetPlayerId
      ? { defendingPlayerId: event.targetPlayerId }
      : {}),
  });
}

function objectMatches(
  selector: Selector | undefined,
  subjectId: InstanceId | undefined,
  ctx: AbilityContext
): boolean {
  if (!selector || !subjectId) return false;
  if (!ctx.state.cards[subjectId]) return false;

  switch (selector.sel) {
    case 'self':
      return subjectId === ctx.sourceId;

    case 'attached':
      return ctx.state.cards[ctx.sourceId]?.attachedTo === subjectId;

    case 'all': {
      if (selector.controller) {
        // Last known controller for an object that has already left, which is
        // what CR 603.10 means by looking at the game as it was.
        const controller = ctx.state.cards[subjectId]?.controllerId;
        if (!controller) return false;
        if (!resolvePlayers(selector.controller, ctx).includes(controller)) return false;
      }
      return matchesFilter(selector.where, subjectId, ctx);
    }

    default:
      return false;
  }
}

function playerMatches(
  selector: PlayerSelector | undefined,
  playerId: PlayerId | undefined,
  ctx: AbilityContext
): boolean {
  if (!selector || !playerId) return false;
  return resolvePlayers(selector, ctx).includes(playerId);
}

/** "deals damage to a creature" or "to a player" — what the event actually hit. */
function damageTargetMatches(
  to: 'any' | 'player' | 'creature' | 'planeswalker' | undefined,
  event: GameTriggerEvent,
  ctx: AbilityContext
): boolean {
  if (!to || to === 'any') return true;
  if (to === 'player') return !!event.targetPlayerId;
  if (!event.targetInstanceId) return false;
  return viewOf(ctx, event.targetInstanceId)?.types.includes(to) ?? false;
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
 *   - `{who:'trigger-player'}` needs `AbilityContext.triggerPlayerId`. The
 *     event carries a player now and `subjectContext` binds it, so this one
 *     was rebuilt as a narrow allowance: "that player" is unambiguous on a cast
 *     and a draw (Rhystic Study means the one who cast, Smothering Tithe the
 *     one who drew) and ambiguous everywhere else, so allow those two.
 *
 *     MEASURED, AND TAKEN BACK OUT (22 Aug 2026). Across all 32,469 cards,
 *     the number that became owned by it was ZERO: every card that names "that
 *     player" also carries something else this list refuses, usually the
 *     opponent-facing cost below. A relaxation that unlocks nothing is not free
 *     — it widens what ownership will accept, and the next card through it aims
 *     an effect at a seat nobody named. It goes back when a card needs it.
 *   - `{do:'unless-pays'}` is a decision belonging to somebody who is not the
 *     controller, and a pure interpreter has no way to ask them.
 *
 * Any of the three keeps the card with the old detector, which asks for it by
 * hand. Worse automation, better honesty — the trade goes the same way every
 * time.
 */
function unbindableEffectReason(
  effects: readonly Effect[],
  event: DslTriggerEvent | undefined
): string | null {
  const queries = watchQueriesIn(effects);
  if (queries.length > 0) {
    return `needs turn history (${queries[0].event.saw}, ${queries[0].window}), which nothing folds yet`;
  }
  if (playerSelectorsIn(effects).some(selector => selector.who === 'trigger-player')) {
    return `"that player": a ${JSON.stringify(event?.on ?? 'unknown')} event names no one player for it`;
  }
  if (selectorsIn(effects).some(selector => selector.sel === 'revealed')) {
    // "That card's mana value" after a revealed draw. `resolveSelector` answers
    // nobody for it because nothing records which card the draw moved, and an
    // owned Dark Confidant would then draw the card and charge no life.
    return 'names the card it revealed, and nothing records which card a draw revealed yet';
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
 * Puts the old blanket refusal on targeted triggers back, so the figures from
 * before they could be announced can be reproduced.
 *
 * The same escape hatch, and the same argument for it, as `DM_XMAGE_OFF` in
 * `src/lib/cards/xmage/lowered.ts` and `DM_ACTIVATED_DEAD` in
 * `scripts/verify-ability-coverage.mjs`: it can only ever make the engine claim
 * LESS than it does, so it is the direction that is safe to leave available.
 * There is no switch in the other direction.
 *
 * It exists because a change to what the engine OWNS changes what the playtest
 * harness plays, and "did that regress the twenty games" is a question that
 * needs the two runs to be the same binary. Read once, here, and guarded
 * because `process` does not exist in a browser.
 */
const TRIGGER_TARGETS_OFF =
  typeof process !== 'undefined' && process?.env?.DM_TRIGGER_TARGETS_OFF === '1';

/**
 * EVERY reason this triggered ability cannot be run. Empty when it can.
 *
 * `unrunnableReason` below returns the first of these, which is what ownership
 * needs and what every existing caller reads. The plural exists because the
 * singular MISREPORTS PLANNING, and it did so in a direction that flatters the
 * work: a measurement that ranks blockers by `unrunnableReason` sees Soul's
 * Attendant blocked only by "the engine derives no event for enters", so fixing
 * that event looks like it makes the card automated. It does not. The card also
 * says "you may", and clearing the first reason only uncovers the second.
 *
 * Two reasons on one ability is not two units of work half done, it is a card
 * that stays silent until both are gone. Any script sizing a tranche has to see
 * both, so both are returned.
 */
export function unrunnableReasons(ability: TriggeredAbility): string[] {
  const reasons: string[] = [];

  if (gameEventKindFor(ability.event) === null) {
    reasons.push(`the engine derives no event for ${JSON.stringify(ability.event?.on ?? 'unknown')}`);
  } else if (!subjectSupported(ability.event)) {
    // The event happens; the ability just describes the object it happens to in
    // a way no event can be tested against. Firing anyway would aim the trigger
    // at whatever moved, which is a worse answer than not firing.
    reasons.push('the subject is a selector no event can be matched against');
  }
  if (ability.optional) {
    // "You may" is the player's word. Taking it automatically is the same class
    // of bug as not resolving it at all — the board changed and nobody agreed.
    reasons.push('optional ("you may"), so the choice is the player\'s');
  }
  if (ability.limit) {
    // "Only once each turn" needs a per-turn usage count that GameState does
    // not carry. Ignoring it would let the ability fire every time.
    reasons.push(`limited to ${ability.limit.count} per ${ability.limit.per}, and nothing here counts how often it has been used`);
  }
  /*
   * TARGETS. This used to refuse every one of them, and the sentence was
   * "needs announced targets, which triggers cannot yet carry". It was true:
   * `PendingTrigger` had no `targets` field, so `{sel:'target'}` resolved to
   * nobody and an owned ability would have done half its job in silence. It
   * cost 1,364 ability hits on 1,077 cards over the 32,469 card pool, counted
   * by `scripts/xmage/trigger-target-census.mjs`. `DM_TRIGGER_TARGETS_OFF=1`
   * puts the old refusal back, so that figure can be reproduced.
   *
   * `announce.ts` carries them now, `drainTriggers` aims the ability before it
   * resolves, and `triggers.ts` rechecks CR 608.2b as it does. So the refusal
   * narrows to the shapes that still cannot be announced — and the bar is
   * `chooseTargetsFor`'s, not a new one invented here, because ownership
   * claiming what the asker cannot deliver is how a trigger ends up waiting for
   * an answer nobody can give.
   *
   * ASKED THROUGH `announcedTargetsOf`, WHICH IS THE OTHER HALF OF AGREEING
   * WITH IT. A REF NOTHING READS IS NOT A TARGET: a compiled `targets` list can
   * carry a spec no effect ever indexes, and refusing on one of those refuses
   * for nothing. `planTriggerTargets` filters the same way, so what ownership
   * promises and what the drain asks for are the same list by construction.
   *
   * Measured over the pool: 1,109 triggered abilities announce a target at all.
   * 985 specs are `min=1 max=1`, which is the shape this now accepts. 138 are
   * "up to" and 3 name two at once, and both stay refused:
   *
   *   min > 1  `chooseTargetsFor` announces one `StackTarget` per spec, so
   *            "two target creatures" would go on the stack half aimed and
   *            resolve against the wrong board.
   *   min = 0  "destroy up to one target artifact" makes DECLINING a real
   *            answer, and nothing anywhere can hand one back. Accepting it
   *            would either force a target the player did not want or halt the
   *            drain on a question with no legal reply.
   *
   * What that leaves refused is 117 cards, 64 of them at `coverage === 'full'`,
   * and the census prints both. "Up to" is the next tranche and it is a control
   * question rather than an engine one: the ask needs a way to say none.
   */
  const announced = announcedTargetsOf(ability);
  if (TRIGGER_TARGETS_OFF && announced.length > 0) {
    reasons.push('needs announced targets, which triggers cannot yet carry');
  }
  const unannounceable = announced.find(spec => spec.min !== 1);
  if (unannounceable) {
    reasons.push(
      unannounceable.min > 1
        ? `needs ${unannounceable.min} targets announced at once, which nothing can choose yet`
        : `"up to" ${unannounceable.max}, and declining a target is an answer nothing can give yet`
    );
  }
  if (needsHistory(ability.condition)) {
    // `evalCondition` answers `true` for 'first-time-this-turn' by design, so
    // an owned card carrying one would over-fire.
    reasons.push('condition needs per-turn history the state does not carry');
  }
  const unbindable = unbindableEffectReason(ability.effects, ability.event);
  if (unbindable) reasons.push(unbindable);

  return reasons;
}

/**
 * Why this triggered ability cannot be run, or `null` when it can.
 *
 * Returning the reason rather than a boolean is deliberate: it is what makes
 * ownership diagnosable in a test and explainable in a tooltip, instead of an
 * opaque false.
 *
 * The FIRST reason of possibly several. Ownership only cares whether there is
 * one, so this is the right answer for `abilityEngineOwns` and for a tooltip.
 * It is the wrong answer for planning — see `unrunnableReasons`.
 */
export function unrunnableReason(ability: TriggeredAbility): string | null {
  return unrunnableReasons(ability)[0] ?? null;
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
  /*
   * NO TEXT ON THIS CARD IS UNACCOUNTED FOR, whoever accounted for it.
   *
   * That is the question ownership actually asks, and `coverage` is the field
   * that answers it. Anything less and the old detector in `effects.ts` may
   * still be seeing a clause this bridge cannot.
   *
   * Which is why this reads `coverage` and NOT `compilerCoverage`. On a swapped
   * card those two disagree by design: `compilerCoverage` says the oracle-text
   * compiler did not finish the card, and `coverage` says the ported record
   * replaced the whole of it, so there is no unread clause left for the old
   * detector to be seeing. 587 cards with triggers sit on that difference, and
   * before `compilerCoverage` existed a reader here could not tell which of the
   * two meanings one word was handing them. Now they can, and this line names
   * the one it wants.
   */
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
  source: { instanceId: InstanceId; controllerId: PlayerId },
  event?: GameTriggerEvent
): boolean {
  if (!ability.condition) return true;
  return evalCondition(ability.condition, subjectContext(state, source, event ?? EVENTLESS));
}

/**
 * Stands in for an event on the two callers that have none.
 *
 * `previewTriggers` and the older single-argument callers ask whether a
 * condition holds outside any particular event. Binding nothing is the honest
 * answer there: `{sel:'trigger-subject'}` resolves to nobody and
 * `{who:'trigger-player'}` to nobody, exactly as they did before this file knew
 * about subjects at all.
 */
const EVENTLESS: GameTriggerEvent = { kind: 'enters' };

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
  options: {
    at?: number;
    cause?: string;
    idPrefix: string;
    event?: GameTriggerEvent;
    /**
     * CR 603.3d — what this ability was announced at, indexed by
     * `TargetSpec.ref`, with anything since gone illegal already blanked in
     * place by the caller (`triggers.ts`, through `blankIllegalTargets`).
     *
     * `{sel:'target', ref:n}` reads this array directly, so a hole resolves to
     * nobody, which is CR 608.2b for that one clause rather than for the whole
     * ability.
     *
     * Empty was the only value this could ever have before a `PendingTrigger`
     * could carry a target, and it was empty SILENTLY: `resolveSelector`
     * answered `[]`, "destroy target creature" destroyed nothing, and nothing
     * said so. `unrunnableReasons` kept every such card away from this path for
     * exactly that reason, and no longer has to.
     */
    targets?: StackTarget[];
  }
): GameAction[] {
  // The SAME binding detection used. If the two ever diverged, a trigger would
  // fire for the right creature and do its work to a different one, which is
  // the one bug in this area that no log line would make obvious.
  const ctx: AbilityContext = {
    ...subjectContext(state, source, options.event ?? EVENTLESS),
    targets: options.targets ?? [],
  };

  return resolveAbilityActions(ability.effects, ctx, {
    at: options.at ?? 0,
    ...(options.cause ? { cause: options.cause } : {}),
    idPrefix: options.idPrefix,
    sourceInstanceId: source.instanceId,
  });
}
