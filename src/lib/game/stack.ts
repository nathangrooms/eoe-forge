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
/*
 * CR 608.2b, shared with the triggered-ability half. `targetIsLegal` below says
 * why the rule lives over there rather than here.
 */
import { blankIllegalTargets, targetStillLegal, type TargetingSource } from './announce.ts';
import { resolvesToGraveyard } from './mana.ts';
import { auraNeedsHost } from './attach.ts';
// The honesty note for a spell that resolved and did nothing, built by the
// same function `spellResolutionNotes` uses for the non-stack cast path, so
// both print the same sentence for the same card.
import { manualNoteAction } from './effects.ts';
/*
 * The ability bridge, for a stack object carrying `abilityId`.
 *
 * Only these three modules, never `./abilities/index.ts`: that barrel also
 * re-exports `statics.ts`, which imports `layers.ts`, and the import graph
 * stays shallower without it. None of the three reaches back into `stack.ts`
 * or `rules.ts`, so there is no cycle to reason about.
 */
import { abilitiesFor, announcedTargetsOf } from './abilities/card-abilities.ts';
import { makeContext } from './abilities/context.ts';
import { resolveAbilityActions } from './abilities/to-actions.ts';

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
 * The object a stack target was chosen for, in the shape the shared rule takes.
 *
 * `sourceInstanceId` falls back to `cardInstanceId` because a SPELL is its own
 * source: an instant has no separate permanent behind it, and protection is
 * judged against the card being cast.
 */
function targetingSourceOf(object: StackObject): TargetingSource {
  return {
    controllerId: object.controllerId,
    sourceInstanceId: object.sourceInstanceId ?? object.cardInstanceId,
  };
}

/**
 * CR 608.2b — is this target still a legal one.
 *
 * THE RULE ITSELF MOVED, and this is now a two-line adapter onto it. It lives
 * in `announce.ts` because a triggered ability has to ask exactly the same
 * question and cannot reach this file: `triggers.ts` is imported by `rules.ts`,
 * which this module already depends on. Writing the second copy over there is
 * how one path ends up with the CR 400.7 flicker check and the other does not.
 *
 * The signature is unchanged, because a dozen callers and the tests read it.
 */
export function targetIsLegal(
  state: GameState,
  object: StackObject,
  target: StackTarget
): boolean {
  return targetStillLegal(state, target, targetingSourceOf(object));
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
            message: `${object.name} deals ${effect.amount} damage to a permanent. Mark it by hand.`,
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
 * A stack object carrying `abilityId`, resolved through the compiled ability.
 *
 * Three things it does NOT do, each of them a decision:
 *
 *   - it does not re-check the ability's cost. Costs were paid at activation
 *     (CR 601.2h / 602.2b) and a cost that has become unpayable since is not a
 *     reason to refund one;
 *   - it does not re-check timing. An ability announced legally resolves even
 *     if the step has moved on, which is the whole reason instants exist;
 *   - it does not silently vanish when the ability cannot be found. A source
 *     that left the game between activation and resolution still resolves its
 *     ability (CR 608.2 uses last known information), and the card object
 *     stays in `state.cards` after a zone change, so the usual case is covered.
 *     The remaining case says so in a `NOTE`.
 *
 * `idPrefix` is derived from the stack id and the state version, both of which
 * every client reproduces identically when replaying the log, so a token this
 * ability mints gets the same id everywhere.
 */
function compiledAbilityActions(
  state: GameState,
  object: StackObject,
  at: number
): GameAction[] {
  if (!object.abilityId) return compiledSpellActions(state, object, at);

  const sourceId = object.sourceInstanceId ?? object.cardInstanceId;
  const source = sourceId ? getCard(state, sourceId) : undefined;
  if (!source) {
    return [
      {
        type: 'NOTE',
        message: `${object.name} resolves, but its source has left the game. Resolve it by hand.`,
        at,
      },
    ];
  }

  const ability = abilitiesFor(source).abilities.find(entry => entry.id === object.abilityId);
  if (!ability || !('effects' in ability)) {
    return [
      {
        type: 'NOTE',
        instanceId: source.instanceId,
        message: `${object.name} resolves, but the engine can no longer read that ability off ${source.name}. Resolve it by hand.`,
        at,
      },
    ];
  }

  return resolveAbilityActions(ability.effects, contextForResolution(state, object, source.instanceId), {
    at,
    cause: object.name,
    idPrefix: `${object.stackId}:${state.version}`,
    sourceInstanceId: source.instanceId,
    verb: object.kind === 'activated' ? 'activated' : 'triggered',
    // Chosen when this was ANNOUNCED, not now. Working a mode out at resolution
    // would let a board that changed in response pick a different one, and two
    // clients replaying the same log could land on different modes.
    ...(object.modes ? { modes: object.modes } : {}),
  });
}

/**
 * The context a resolving object's effects are evaluated in.
 *
 * POSITIONS ARE THE CONTRACT, so an illegal target is blanked in place and
 * never filtered out. `{sel:'target', ref: n}` is a plain index into this array;
 * compacting it with `legalTargetsOf` would slide target 1 into slot 0 and point
 * the first half of the ability at the second half's victim — a partial fizzle
 * turned into a wrong resolution, which is worse than either. A blank entry
 * resolves to nobody in `context.ts`, which is exactly CR 608.2b for the part of
 * the ability that named it.
 */
function contextForResolution(state: GameState, object: StackObject, sourceId: InstanceId) {
  return makeContext(state, sourceId, object.controllerId, {
    targets: blankIllegalTargets(state, object.targets, targetingSourceOf(object)),
    triggerSourceId: sourceId,
  });
}

/**
 * AN INSTANT OR SORCERY RESOLVING RUNS ITS OWN COMPILED TEXT.
 *
 * This is the half of resolution that was missing, and it was missing quietly.
 * `compiledAbilityActions` returned an empty list for anything without an
 * `abilityId`, and a spell cast from hand has none — the `abilityId` field
 * exists for an activated or triggered ability, which is a different object on
 * the stack. So Lightning Bolt reached the top of the stack, resolved, moved
 * itself to the graveyard, and dealt no damage. Divination drew nothing. Wrath
 * of God destroyed nothing.
 *
 * Nothing was broken. `compileCardAbilities` produced a `kind:'spell'` ability
 * with the right effects, `runEffects` would have executed them, and 1,842
 * tests were green throughout. Nobody called the one with the other. That is the
 * project's own law from CLAUDE.md, "green tests do not mean a player can reach
 * it", playing out on the largest single group of cards in the game.
 *
 * ## Why this can be done without checking the card type
 *
 * Measured over the cached Scryfall bulk file, one row per oracle id: 3,648 of
 * 7,358 instants and sorceries compile to at least one `kind:'spell'` ability,
 * and **0 of 29,136 permanents do**. The compiler only ever emits this kind for
 * an instant or a sorcery, so running every one of them here cannot double up
 * with a permanent's static or triggered abilities. The count is reproducible;
 * the script is `scripts/measure-spell-ability-shape.mjs`, and it exits non-zero
 * if a permanent ever grows one.
 *
 * The permanent case is genuinely different and is already handled elsewhere: a
 * creature spell resolving IS the creature entering, which `resolutionActionsFor`
 * does with a `PLAY`, and whatever it then does comes from its triggered and
 * static abilities on the battlefield.
 */
function compiledSpellActions(
  state: GameState,
  object: StackObject,
  at: number
): GameAction[] {
  if (object.kind !== 'spell' || !object.cardInstanceId) return [];
  const card = getCard(state, object.cardInstanceId);
  if (!card) return [];

  const spells = abilitiesFor(card).abilities.filter(ability => ability.kind === 'spell');
  if (spells.length === 0) return [];

  const ctx = contextForResolution(state, object, card.instanceId);
  const out: GameAction[] = [];

  spells.forEach((ability, ordinal) => {
    /*
     * CR 601.2c — a spell that requires a target is cast AT something, chosen on
     * announcement. Nothing announces one for a spell yet: `CastOptions.targets`
     * exists and no surface fills it, because picking a target for a spell needs
     * a picker and a legality check that only exist for activated abilities so
     * far (`activate.ts`, `AbilityPanel`).
     *
     * Left alone, `{sel:'target'}` resolves to nobody and the card produces the
     * generic "nothing for it to do" line, which reads as though the spell was
     * pointless rather than unaimed. Two different problems should not print the
     * same sentence, so this one names itself.
     */
    /*
     * `announcedTargetsOf`, not `ability.targets`, and they differ for 221 of
     * the 6,786 instants and sorceries in the card snapshot. The raw list can
     * hold a `ref` that no effect reads — Personify carries six, Careful
     * Consideration seventeen — and reading it here printed "no target was
     * chosen" about spells that name no target at all. The caster asks the same
     * function, so the two halves can no longer disagree about how many targets
     * a spell has, which is what they were doing in both directions at once.
     */
    const wanted = announcedTargetsOf(ability);
    if (wanted.length > 0 && object.targets.length === 0) {
      out.push({
        type: 'NOTE',
        instanceId: card.instanceId,
        message: `${object.name} resolves, but no target was chosen when it was cast, so there is nothing for it to affect. Aim it by hand.`,
        at,
      });
      return;
    }

    out.push(
      ...resolveAbilityActions(ability.effects, ctx, {
        at,
        cause: object.name,
        // Distinct from the ability path's prefix by the `s` and the ordinal, so
        // a token minted by a spell can never collide with one minted by an
        // ability that happened to resolve at the same state version.
        idPrefix: `${object.stackId}:${state.version}:s${ordinal}`,
        sourceInstanceId: card.instanceId,
        verb: 'resolved',
        // As on the ability path: chosen when the spell was cast, not now.
        ...(object.modes ? { modes: object.modes } : {}),
      })
    );
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
        message: `${object.name} was countered on resolution. Every target it was cast at is now illegal.`,
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

  /*
   * CR 303.4f — an Aura spell resolving is the Aura entering ATTACHED to what
   * it was cast at, in one step.
   *
   * Read here rather than left to a following `ATTACH` because state-based
   * actions run after every action and CR 704.5m bins an Aura attached to
   * nothing, so the two-step version put every Aura in the graveyard on arrival.
   *
   * `willFizzle` above has already ended the resolution if the host is gone, so
   * reaching this line means the target was rechecked and is still legal.
   *
   * The equip half of this subject is the opposite shape and goes the opposite
   * way: it is a printed activated ability (CR 702.6a), it moves a permanent
   * that is already in play, and it reaches `ATTACH` through `to-actions.ts`
   * like every other compiled effect.
   */
  const auraHost =
    card && destination === 'battlefield' && auraNeedsHost(card)
      ? object.targets.find(target => target.kind === 'card' && !!target.instanceId)?.instanceId
      : undefined;

  // CR 608.3 — a permanent spell resolving *is* the permanent entering. Do that
  // first so the object's own effects, and any ETB trigger, see it in play.
  if (card && destination === 'battlefield') {
    out.push({
      type: 'PLAY',
      instanceId: card.instanceId,
      to: 'battlefield',
      controllerId: object.controllerId,
      ...(auraHost ? { attachedTo: auraHost } : {}),
      at,
      cause: object.name,
    });
  }

  // A compiled ability resolves through `to-actions.ts`, the ONE switch over
  // the DSL's effect union. Before this existed, an activated ability could be
  // announced onto the stack and resolved into nothing at all, because the
  // stack's own `StackEffect` vocabulary has eleven members and the compiler
  // emits into one with thirty.
  const beforeEffects = out.length;

  out.push(...compiledAbilityActions(state, object, at));

  object.effects.forEach((effect, ordinal) => {
    out.push(...actionsForEffect(state, object, effect, at, ordinal));
  });

  const didSomething = out.length > beforeEffects;

  // CR 608.2m — an instant or sorcery is put into its owner's graveyard as the
  // final part of its own resolution, after its effects.
  if (card && destination !== 'battlefield') {
    /*
     * THE HONESTY RULE, ONE STEP EARLIER THAN IT USED TO BE.
     *
     * The check at the bottom of this function asks whether the whole
     * resolution produced no actions. For an instant or a sorcery it never can:
     * CR 608.2m always adds the move to the graveyard, so a spell whose text
     * the compiler could not model went from hand to graveyard having done
     * nothing and having said nothing.
     *
     * That was unreachable until now and is exactly the project's own law about
     * green tests. No bot had ever cast a sorcery, so no sorcery had ever
     * resolved, so the hole had never been stood on. The pass that taught the
     * bot to cast them stood on it 48 times in twenty games and the harness
     * filed all 48 as `silent-untold` — the one verdict the audit says must
     * stay at zero, because a card that does nothing and says nothing is
     * indistinguishable from a card that worked.
     *
     * So the emptiness is measured across the EFFECTS, before the graveyard
     * move is added, and the note is written in the order it happened: it
     * resolved, it did nothing, it went to the graveyard.
     *
     * `manualNoteAction` first, and the same call `spellResolutionNotes` makes,
     * so the two paths print the SAME sentence for the same card. That function
     * is the honesty rule for the non-stack cast, which fires on a `PLAY` to
     * the graveyard; this is its twin for the stack path, which ends in a
     * `MOVE_ZONE` and which it therefore never saw.
     */
    if (!didSomething) {
      out.push(
        manualNoteAction(card, at, 'resolves') ?? {
          type: 'NOTE',
          message: `${object.name} resolves. No effects were applied. Resolve it by hand.`,
          instanceId: object.cardInstanceId,
          at,
        }
      );
    }
    out.push({ type: 'MOVE_ZONE', instanceId: card.instanceId, to: destination, at, cause: object.name });
  }

  // The same rule for everything else: an object that resolved and did nothing
  // at all says so.
  if (out.length === 0) {
    out.push({
      type: 'NOTE',
      message: `${object.name} resolves. No effects were applied. Resolve it by hand.`,
      instanceId: object.cardInstanceId,
      at,
    });
  }

  return out;
}

/**
 * Instants and sorceries resolve to the graveyard; everything else stays in play.
 *
 * ONE FACE AT A TIME, and the whole string is the trap. A modal double-faced
 * card carries both faces in its type line, so `Aquatic Alchemist // Bubble Up`
 * reads "Creature - Elemental // Instant". Asking whether the word "instant"
 * appears ANYWHERE in that finds the back face and sends a creature to the
 * graveyard the moment it resolves.
 *
 * The playtest harness caught it as 13 `permanent-card-resolved-into-the-
 * graveyard` violations across 10 of 120 games, which is every modal
 * double-faced card and every Adventure with a spell on the back: unplayable,
 * silently, with no refusal from the engine because nothing was illegal. Only
 * wrong.
 *
 *   node --experimental-strip-types scripts/playtest/run.ts --seed 5010  *     --games 1 --kind commander --players 2 --verify
 *
 * THE RULE LIVES IN `mana.ts`, not here, and that matters. `moves.ts` builds
 * the cast action and stamps `resolvesTo` from `resolvesToGraveyard`, and that
 * value wins over this function, which answers only when nothing set one. Both
 * files used to hold their own copy: fixing this one changed nothing, and the
 * harness proved it by replaying 120 games to a byte-identical 50,170 actions
 * with the same 13 violations. One owner now.
 */
export function defaultResolutionZone(card: CardInstance): Zone {
  return resolvesToGraveyard(card) ? 'graveyard' : 'battlefield';
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
    ...(action.modes ? { modes: action.modes } : {}),
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
    ...(action.abilityId ? { abilityId: action.abilityId } : {}),
    ...(action.modes ? { modes: action.modes } : {}),
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
  /** CR 601.2b - modes chosen on announcement. See `StackObject.modes`. */
  modes?: Record<string, readonly number[]>;
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
    modes: options.modes,
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
    /** The compiled ability's id on the source card. See `StackObject.abilityId`. */
    abilityId?: string;
    /** CR 602.2b - modes chosen on announcement. See `StackObject.modes`. */
    modes?: Record<string, readonly number[]>;
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
    abilityId: options.abilityId,
    modes: options.modes,
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
