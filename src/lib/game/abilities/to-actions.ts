/**
 * DeckMatrix — ability bridge: effects into actions.
 *
 * **The only place in the game engine that switches on the DSL's `Effect`
 * union.** One switch, ending in `assertNever`, so a new member of the effect
 * vocabulary is a compile error rather than a card that quietly does nothing.
 *
 * ## Effects become ordinary actions
 *
 * `runEffects` returns `GameAction[]`. It touches no state, mints no id from a
 * clock or a random source, and decides nothing a player decides. The reducer
 * folds what comes back, so an ability resolving is a sequence of logged,
 * replayable, undoable actions — the same ones a human could have pressed. That
 * is what keeps the action log the single authority and lets a second client
 * replay to byte-identical state.
 *
 * ## Decisions are deferred, never guessed
 *
 * When an effect needs a choice the engine cannot make on the player's behalf —
 * which card to discard, whether to take a "you may", which mode of a modal
 * spell — it does not pick. It records the decision in `EffectRun.deferred`, and
 * the caller emits one `NOTE` per entry quoting it verbatim. The ability still
 * does everything it can do on its own.
 *
 * Having the engine choose would be the same bug one level up: a card that
 * appeared to resolve and did something the player never agreed to is no better
 * than one that appeared to resolve and did nothing.
 *
 * ## The primitives are called from inside this switch, not beside it
 *
 * `abilities/primitives/` holds a gated implementation of ten of these verbs.
 * For a while it also held `adopt.ts`, a second walker that ran the primitives
 * in front of this one, so the folder could be measured without editing a file
 * other people were in. A second walker with its own copy of the `if` /
 * `for-each` / `repeat` logic is exactly the thing that drifts, and two clients
 * disagreeing about a card nobody changed is how the drift would show up.
 *
 * So the primitives are called from the cases below. One switch, still ending in
 * a throw, and `adopt.ts` now delegates here rather than walking anything.
 *
 * A primitive can return a CONTINUOUS EFFECT, which this file turns into an
 * `ADD_CONTINUOUS` action rather than handing back on the side. Everything that
 * changes the board has to be in the action log, or a +3/+3 exists on the screen
 * that cast it and nowhere else.
 */

import type { GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { CardDestination, Effect, PlayerSelector, Selector } from '../../cards/abilities/dsl.ts';
import { selectorsIn, watchQueriesIn } from '../../cards/abilities/dsl.ts';
import type { AbilityContext } from './context.ts';
import {
  cardOf,
  evalCondition,
  evalValue,
  isPlayerSelector,
  playerOf,
  resolvePlayers,
  resolveSelector,
  viewOf,
} from './context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './primitives/contract.ts';
import { gainControlToContinuous, pumpToContinuous } from './primitives/continuous.ts';
import { damageToPermanent } from './primitives/damage.ts';
import { returnFromForced, searchLibraryForced } from './primitives/zones.ts';
import { counterTargetSpell } from './primitives/stack.ts';
import { scryToActions, surveilToActions } from './primitives/library-order.ts';
import { addManaToActions } from './primitives/mana.ts';
/*
 * The translated XMage bodies, and the one function that runs one.
 *
 * `{do:'xmage-body'}` is the only member of the effect union whose behaviour is
 * not written in this repository by hand: it points at a body
 * `scripts/xmage/translate-bodies.mjs` produced from XMage's Java. The import
 * is direct rather than a registry the app fills in, because a registry can be
 * empty at the moment a card resolves and this cannot: if the key is missing,
 * the file and the record disagree, and the case below says so.
 *
 * XMage is MIT, Copyright (c) 2010 betasteward@gmail.com,
 * https://github.com/magefree/mage.
 */
import { TRANSLATED_BODIES } from '../xmage/bodies.generated.ts';
import { runXmageEffect, type XmageRun } from '../xmage/index.ts';

/**
 * A `CardDestination` in a player's words, for the note `look-and-pick` leaves.
 *
 * Assembled from the fields rather than looked up in a table of sentences, so a
 * destination the DSL can spell always has words, and a field added later
 * cannot leave a blank in the middle of a line somebody reads at the table.
 */
function placeOf(where: CardDestination): string {
  if (where.zone === 'library') {
    const end = where.position === 'top' ? 'on top of their library' : 'on the bottom of their library';
    return where.order ? `${end} in ${where.order === 'random' ? 'a random' : 'any'} order` : end;
  }
  if (where.zone === 'battlefield') {
    return where.tapped ? 'onto the battlefield tapped' : 'onto the battlefield';
  }
  if (where.zone === 'hand') return 'into their hand';
  if (where.zone === 'graveyard') return 'into their graveyard';
  if (where.zone === 'exile') return 'into exile';
  return `into ${where.zone}`;
}

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A modal decision this run could not take, WITH the legal answers attached.
 *
 * The difference between this and a line in `deferred` is the whole point. A
 * deferral is a sentence: it says what did not happen, and there is nothing a
 * caller can hand back. This carries the options, each with the index that
 * selects it, so a caller can ask a player and run the ability again with the
 * answer. That is the difference between an ability that is SILENT and one that
 * is PROMPTED, and it is why this exists rather than a better-worded note.
 *
 * Both are still produced for the same decision, so nothing that already reads
 * `deferred` changed behaviour when this was added.
 */
export interface ModeChoice {
  /**
   * Stable within one ability, assigned by POSITION in the effect tree rather
   * than by order of execution. `{do:'repeat'}` runs the same `choose-mode`
   * node several times and every one of them is the same question, so one
   * answer holds for all of them. A counter bumped per execution would ask the
   * same question twice and let a caller answer one iteration and not the next.
   */
  ref: string;
  /** One sentence, in a player's words. */
  prompt: string;
  min: number;
  max: number;
  /** `index` is what goes back in `RunOptions.modes`; `text` is the card's own. */
  options: Array<{ index: number; text: string }>;
}

export interface EffectRun {
  /** In order. Fed straight back through the reducer. */
  actions: GameAction[];
  /**
   * Decisions the engine declined to make for the player, verbatim.
   *
   * Never empty and ignored: the caller emits one `NOTE` per entry, so a
   * half-resolved ability is visible in the log before anyone has to notice
   * that the board did not change.
   */
  deferred: string[];
  /**
   * The subset of those decisions a caller can actually answer, with the legal
   * options attached. Empty when every decision this run met was one nothing
   * can enumerate, such as a bare "you may".
   */
  choices: ModeChoice[];
}

export interface RunOptions {
  /** Epoch ms from the originating action. Nothing here reads a clock. */
  at?: number;
  /** Prefixed onto every log line: "Ajani's Pridemate — enters". */
  cause?: string;
  /**
   * Seed for derived ids (tokens). Must come from state — a stack id, or
   * `${version}:${ordinal}` — never a uuid, or two clients mint different ids
   * for the same token and replay diverges on the next zone change.
   */
  idPrefix: string;
  /**
   * Modes the player has already chosen, keyed by `ModeChoice.ref`, each a list
   * of indexes into that node's own `modes` array.
   *
   * An answer that is not legal for its node — too few, too many, out of range,
   * the same mode twice — is NOT clamped into something legal. It is treated as
   * no answer at all, and the choice comes back unresolved with a line saying
   * why. Clamping would resolve a modal card in a mode nobody picked, which is
   * the same failure as guessing one.
   */
  modes?: Record<string, readonly number[]>;
  /**
   * Answer every `{do:'may'}` in this run with YES, instead of deferring it.
   *
   * OFF IN THE GAME AND IT MUST STAY OFF. A game that took "you may" for the
   * player would sacrifice their creature for them. The only caller that sets
   * it is `behaviour-probe.ts`, which is not playing a game: it is asking
   * whether a card CAN do the thing it says, and a card whose whole body sits
   * behind a "you may" answers that question only if somebody says yes.
   *
   * THE BIAS THIS BUYS, stated here so it travels with the switch rather than
   * living in a report nobody opens: yes is not the neutral answer. Answering
   * no would make every optional ability read as broken; answering yes makes a
   * card whose only content is optional read as working, which is a claim about
   * the card's effects and NOT a claim that anybody can be asked.
   *
   * That sentence used to end "and `verify-ability-coverage.mjs` still refuses
   * the card for it", which was NOT TRUE and was worth 41 cards in the passing
   * total. Nothing downstream was refusing them. `probeBehaviour` now refuses a
   * card whose effects only ran because this switch was on, so the claim above
   * is one the code makes rather than one a comment asserts.
   */
  answerMayYes?: boolean;
}

interface RunScope {
  options: RunOptions;
  counter: { value: number };
  out: GameAction[];
  deferred: string[];
  choices: ModeChoice[];
  /** Which `ref` belongs to which `choose-mode` node. See `ModeChoice.ref`. */
  modeRefs: Map<object, string>;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function runEffects(
  effects: readonly Effect[],
  ctx: AbilityContext,
  options: RunOptions
): EffectRun {
  const scope: RunScope = {
    options,
    counter: { value: 0 },
    out: [],
    deferred: [],
    choices: [],
    modeRefs: assignModeRefs(effects),
  };

  // E6 honesty gate, and it runs BEFORE anything else so the note is the first
  // thing in the log rather than buried under actions computed from a zero.
  //
  // A `{v:'watch'}` evaluated with no folded log answers 0. Zero is a wrong
  // answer, not a neutral one — "draw a card for each creature that died this
  // turn" would draw nothing and look like a card that simply did not do much.
  // So the query is named, verbatim, before the effects run.
  if (!ctx.watch) {
    for (const query of watchQueriesIn(effects)) {
      scope.deferred.push(
        `needs turn history this game does not keep yet: ${query.measure} of ${query.event.saw} (${query.window}). Any amount computed from it is 0, and 0 is not the real number`
      );
    }
  }
  // The same gate for "that card's mana value" after a revealed draw. Nothing
  // records which card the draw moved, so `{sel:'revealed'}` resolves to nobody
  // and a life total computed from it is 0. Said first, for the same reason.
  if (selectorsIn(effects).some(selector => selector.sel === 'revealed')) {
    scope.deferred.push(
      'names the card it revealed, and this game does not record which card a draw revealed yet. Any amount computed from it is 0, and 0 is not the real number'
    );
  }

  for (const effect of effects) runEffect(effect, ctx, scope);
  return { actions: scope.out, deferred: scope.deferred, choices: scope.choices };
}

/**
 * Give every `choose-mode` node in this tree a stable name.
 *
 * A pre-walk over the STATIC shape, in a fixed order, before anything runs.
 * That is what makes the name independent of how many times a node is reached:
 * a `choose-mode` inside a `{do:'repeat'}` gets one ref however many iterations
 * happen, so an answer covers all of them, and the ref does not move because a
 * condition went the other way on one board and not another.
 *
 * Keyed on object identity, which is safe here because the effect tree comes
 * out of the compiler's cache and is not rebuilt between the pre-walk and the
 * run three lines later.
 */
function assignModeRefs(effects: readonly Effect[]): Map<object, string> {
  const refs = new Map<object, string>();
  let next = 0;

  const walk = (list: readonly Effect[] | undefined): void => {
    for (const effect of list ?? []) {
      if (effect.do === 'choose-mode') {
        refs.set(effect as object, `m${next++}`);
        for (const mode of effect.modes) walk(mode.effects);
        continue;
      }
      if (effect.do === 'if') {
        walk(effect.then);
        walk(effect.else);
        continue;
      }
      if (effect.do === 'for-each' || effect.do === 'repeat' || effect.do === 'may') {
        walk(effect.effects);
        continue;
      }
      if (effect.do === 'unless-pays') walk(effect.effects);
    }
  };

  walk(effects);
  return refs;
}

/**
 * The modes a caller has legally chosen for this node, or null if it is still
 * an open question.
 *
 * Every way of being wrong returns null rather than a repaired answer. Out of
 * range, repeated, too few, too many: each of those is a caller that does not
 * agree with this file about what the card says, and resolving a modal card in
 * a mode nobody picked is worse than not resolving it.
 */
function chosenModes(
  answer: readonly number[] | undefined,
  modeCount: number,
  min: number,
  max: number
): number[] | null {
  if (!answer) return null;
  if (answer.length < min || answer.length > max) return null;
  const seen = new Set<number>();
  for (const index of answer) {
    if (!Number.isInteger(index) || index < 0 || index >= modeCount) return null;
    if (seen.has(index)) return null;
    seen.add(index);
  }
  // Card order, not the order they were handed in. A modal spell resolves its
  // chosen modes in the order they are printed (CR 601.2b), and two clients
  // that answered the same set differently must still land on one board.
  return [...seen].sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function meta(scope: RunScope): { at: number; cause?: string } {
  const at = scope.options.at ?? 0;
  return scope.options.cause ? { at, cause: scope.options.cause } : { at };
}

function nextId(scope: RunScope, kind: string): string {
  return `${scope.options.idPrefix}-${kind}${scope.counter.value++}`;
}

function livingIds(state: GameState, ids: PlayerId[]): PlayerId[] {
  return ids.filter(id => {
    const player = playerOf(state, id);
    return !!player && !player.hasLost && !player.conceded;
  });
}

function nameOf(state: GameState, playerId: PlayerId | undefined): string {
  return playerOf(state, playerId)?.name ?? 'A player';
}

/* -------------------------------------------------------------------------- */
/* Calling a primitive                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Everything a primitive is allowed to know beyond its effect and the state.
 *
 * Every field comes from state or from the originating action. `timestamp` is
 * `state.version`, which is a monotonic counter the reducer bumps on every
 * applied action, so two clients replaying one log assign the same CR 613
 * timestamps and "the last anthem wins" means the same thing on both screens. A
 * wall clock here would break that on the first re-render.
 */
function envFor(ctx: AbilityContext, scope: RunScope): PrimitiveEnv {
  return {
    idPrefix: scope.options.idPrefix,
    ordinal: scope.counter.value++,
    at: scope.options.at ?? 0,
    ...(scope.options.cause ? { cause: scope.options.cause } : {}),
    timestamp: ctx.state.version ?? 0,
  };
}

/**
 * Fold a primitive's result into the run, in place, in order.
 *
 * A returned `ContinuousEffect` becomes an `ADD_CONTINUOUS` action here. That is
 * the one translation this file does on a primitive's behalf, and it is done
 * here rather than in the primitive because a primitive returns data and never
 * decides how the engine stores it.
 */
function merge(scope: RunScope, result: PrimitiveResult): void {
  for (const action of result.actions) scope.out.push(action);
  for (const line of result.deferred) scope.deferred.push(line);
  const at = scope.options.at ?? 0;
  for (const effect of result.continuous) {
    scope.out.push({
      type: 'ADD_CONTINUOUS',
      effect,
      at,
      ...(scope.options.cause ? { cause: scope.options.cause } : {}),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* The switch                                                                 */
/* -------------------------------------------------------------------------- */

function runEffect(effect: Effect, ctx: AbilityContext, scope: RunScope): void {
  const m = meta(scope);
  const { state } = ctx;

  switch (effect.do) {
    /* --- life --- */

    case 'gain-life':
    case 'lose-life': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      const sign = effect.do === 'gain-life' ? 1 : -1;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'LIFE_CHANGE', playerId, delta: sign * amount, ...m });
      }
      break;
    }

    case 'set-life': {
      const life = evalValue(effect.amount, ctx);
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'SET_LIFE', playerId, life, ...m });
      }
      break;
    }

    case 'damage': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      const source = cardOf(state, ctx.sourceId);

      /*
       * "ANY TARGET" IS ONE REQUIREMENT WITH TWO KINDS OF ANSWER, and this is
       * the only effect in the vocabulary that has to cope with both.
       *
       * The compiler turns "deals 1 damage to any target" into
       * `to: {sel:'target', ref:0}` — a CARD selector — while the matching
       * `TargetSpec` is `what:'any'`, so the player is entitled to point it at a
       * seat. `resolveSelector` correctly names no card for a player target,
       * which meant the whole effect evaluated to nothing: a Prodigal Pyromancer
       * aimed at a player tapped, resolved and dealt no damage. Nothing caught
       * it before because nothing had ever announced a target for an ability.
       *
       * So a card selector pointing at a chosen PLAYER is read as that player.
       * Only here, and only for `{sel:'target'}`: every other effect in the DSL
       * names cards or players explicitly and would be changed, not fixed, by a
       * general rule.
       */
      const targetedPlayers: PlayerId[] = isPlayerSelector(effect.to)
        ? resolvePlayers(effect.to, ctx)
        : effect.to.sel === 'target' && ctx.targets[effect.to.ref]?.kind === 'player'
          ? [ctx.targets[effect.to.ref].playerId as PlayerId]
          : [];

      if (targetedPlayers.length > 0 || isPlayerSelector(effect.to)) {
        for (const targetPlayerId of livingIds(state, targetedPlayers)) {
          scope.out.push({
            type: 'DAMAGE',
            targetPlayerId,
            amount,
            sourcePlayerId: ctx.controllerId,
            sourceInstanceId: source?.instanceId,
            ...m,
          });
        }
        break;
      }

      /*
       * DAMAGE TO A PERMANENT IS MARKED, AND NOTHING ELSE HAPPENS. CR 119.3.
       *
       * This used to read the toughness, subtract damage already marked, and
       * emit a `MOVE_ZONE` to the graveyard when the incoming amount was lethal
       * — otherwise nothing but a note. Both halves were wrong, and the first
       * half was the dangerous one because it looked like it worked:
       *
       *   - two Shocks at a 4/4 killed nothing, because neither was lethal on
       *     its own and nothing accumulated;
       *   - deathtouch was ignored entirely (CR 702.2b), so a 1/1 deathtoucher
       *     pinging a 5/5 did nothing at all;
       *   - `DAMAGE_CARD` already existed, already carried a `deathtouch` flag,
       *     and already fed the `damagedByDeathtouch` field that `sba.ts` reads
       *     for CR 704.5h. The reducer was ready; nothing called it.
       *
       * `damageToPermanent` marks the damage and stops. Whether that is lethal
       * is CR 704.5g's business, and `sba.ts` runs immediately after every
       * action, which is exactly when 704.5g is supposed to be checked.
       */
      merge(scope, damageToPermanent(effect, ctx, envFor(ctx, scope)));
      break;
    }

    case 'poison': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'POISON', playerId, delta: amount, ...m });
      }
      break;
    }

    /* --- cards --- */

    case 'draw': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'DRAW', playerId, count, ...m });
        // "Reveal the top card of your library and put it into your hand" moves
        // the card exactly as `DRAW` does and shows it to the table on the way,
        // which `DRAW` cannot. The card reaches the hand; the showing is asked
        // for out loud. The compiler marks such an ability approximate for the
        // other half of the distance: CR 121.1 says this is not a draw, and a
        // "whenever you draw" trigger watching this `DRAW` would fire.
        if (effect.revealed) {
          scope.deferred.push(
            `${nameOf(state, playerId)} reveals the card as it goes to their hand; show it to the table`
          );
        }
      }
      break;
    }

    case 'mill': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        const library = playerOf(state, playerId)?.zones.library ?? [];
        for (const instanceId of library.slice(0, count)) {
          scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
        }
      }
      break;
    }

    case 'discard': {
      // `'hand'` is the whole hand, and the whole hand is a different size for
      // every player, so it is counted inside the loop rather than once above
      // it. A fixed count is evaluated once, as before.
      const fixed = effect.count === 'hand' ? null : evalValue(effect.count, ctx);
      if (fixed !== null && fixed <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        const hand = playerOf(state, playerId)?.zones.hand ?? [];
        if (hand.length === 0) continue;
        const count = fixed ?? hand.length;
        if (hand.length <= count) {
          // No choice to make: the whole hand goes.
          for (const instanceId of hand) {
            scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
          }
          continue;
        }
        // Which cards is the player's call, and a random discard needs the
        // seeded RNG the reducer owns. Neither decision belongs to a pure
        // effect interpreter.
        scope.deferred.push(
          `${nameOf(state, playerId)} discards ${count} card${count === 1 ? '' : 's'}${
            effect.random ? ' at random' : ''
          }`
        );
      }
      break;
    }

    case 'move-zone':
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({
          type: 'MOVE_ZONE',
          instanceId,
          to: effect.to as GameAction extends { to: infer T } ? T : never,
          ...(effect.position !== undefined ? { position: effect.position } : {}),
          ...m,
        } as GameAction);
      }
      break;

    case 'destroy':
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        if (viewOf(ctx, instanceId)?.keywords.includes('indestructible')) {
          scope.out.push({
            type: 'NOTE',
            instanceId,
            message: `${cardOf(state, instanceId)?.name ?? 'That permanent'} is indestructible and was not destroyed.`,
            ...m,
          });
          continue;
        }
        scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
      }
      break;

    case 'exile':
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'exile', ...m });
      }
      break;

    case 'sacrifice': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        // `who` names the sacrificing player, so the pool is what THEY control.
        // A selector that ignored that would let one player's ability eat
        // another player's board.
        const pool = resolveSelector(effect.what, ctx).filter(
          id => viewOf(ctx, id)?.controllerId === playerId
        );
        if (pool.length === 0) continue;
        if (pool.length <= count) {
          for (const instanceId of pool) {
            scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
          }
          continue;
        }
        scope.deferred.push(
          `${nameOf(state, playerId)} sacrifices ${count} of ${pool.length} eligible permanents`
        );
      }
      break;
    }

    /*
     * A ZONE MOVE IS ONLY A DECISION WHEN THERE IS SOMETHING TO DECIDE.
     *
     * This used to defer both, unconditionally, on the grounds that "both need
     * the player to pick from a zone we may not even be allowed to show them".
     * That is true when the pool is bigger than the count and false when it is
     * not. Raise Dead with exactly one creature in the graveyard has no decision
     * in it, and Rampant Growth shuffles the library whether or not it found a
     * land (CR 701.19), so a search that IS a decision still owes the table a
     * shuffle.
     *
     * The genuinely-a-choice case still defers, and must: guessing which card a
     * player tutors for is not automation, it is playing their deck for them.
     */
    case 'return-from':
      merge(scope, returnFromForced(effect, ctx, envFor(ctx, scope)));
      break;

    case 'search-library':
      merge(scope, searchLibraryForced(effect, ctx, envFor(ctx, scope)));
      break;

    /*
     * CR 701.18 and CR 701.44. Both defer, and both are supposed to.
     *
     * The primitives are unchanged from the day they were written and gated:
     * they read the top of the library so the deferral can say how many cards
     * are actually there, and they decide nothing. Which cards go to the bottom
     * or to the graveyard is the player's call on every board, so an engine that
     * picked would be resolving the card for them.
     *
     * A card whose only effect is one of these therefore produces no action and
     * reads SILENT on the probe, exactly as it did while the verb was staged.
     * The number this buys is a lowering number and not an automation number,
     * and the two must not be added together.
     */
    case 'scry':
      merge(scope, scryToActions(effect, ctx, envFor(ctx, scope)));
      break;

    case 'surveil':
      merge(scope, surveilToActions(effect, ctx, envFor(ctx, scope)));
      break;

    case 'look-and-pick': {
      /*
       * WHICH cards are taken is the player's, on every board, and so is the
       * order the rest go back in when the card gives them one. So this
       * produces no actions and says out loud what is on offer, in the same
       * shape as `discard`: the numbers are evaluated here, against the library
       * the player actually has, so the note cannot promise four cards off a
       * two-card library.
       */
      const look = evalValue(effect.look, ctx);
      const pick = evalValue(effect.pick, ctx);
      if (look <= 0) break;
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        const library = playerOf(state, playerId)?.zones.library ?? [];
        const seen = Math.min(look, library.length);
        if (seen === 0) continue;
        const taken = Math.min(pick, seen);
        scope.deferred.push(
          `${nameOf(state, playerId)} looks at the top ${seen} card${seen === 1 ? '' : 's'}` +
            `${seen < look ? ` (${look} asked for, ${library.length} in library)` : ''}` +
            `, puts ${effect.upTo ? 'up to ' : ''}${taken} of them ${placeOf(effect.pickedTo)}` +
            ` and the rest ${placeOf(effect.restTo)}`
        );
      }
      break;
    }

    case 'impulse': {
      /*
       * DEFERRED WHOLE, AND ON PURPOSE. The exile half is mechanical and this
       * function could emit it today; the permission half needs the game to
       * remember that THESE cards may be played from exile until a window
       * closes, and nothing in `GameState` holds that. Exiling without
       * granting would take the player's cards and give nothing back, which
       * is Mystic Forge resolving where Light Up the Stage was cast. So
       * nothing moves, and the note says what the card asks for in the
       * player's words, with the count evaluated against the real library.
       */
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      const window = effect.until === 'end-of-turn' ? 'until end of turn' : 'until the end of your next turn';
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        const library = playerOf(state, playerId)?.zones.library ?? [];
        const seen = Math.min(count, library.length);
        if (seen === 0) continue;
        scope.deferred.push(
          `exile the top ${seen} card${seen === 1 ? '' : 's'} of ${nameOf(state, playerId)}'s library` +
            `${seen < count ? ` (${count} asked for, ${library.length} in library)` : ''}` +
            `; ${window} they may be ${effect.permission === 'cast' ? 'cast' : 'played'} from exile` +
            ' (the engine cannot hold that permission, so nothing was exiled)'
        );
      }
      break;
    }

    case 'shuffle':
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({ type: 'SHUFFLE', playerId, ...m });
      }
      break;

    /* --- permanents --- */

    case 'create-token': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        for (let n = 0; n < count; n++) {
          scope.out.push({
            type: 'CREATE_TOKEN',
            playerId,
            token: effect.token as never,
            count: 1,
            ...(effect.tapped ? { tapped: true } : {}),
            // Derived, never random: two clients replaying the same log mint
            // the same token ids and stay in step.
            instanceId: nextId(scope, 'tk'),
            ...m,
          });
        }
      }
      break;
    }

    case 'tap':
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        if (cardOf(state, instanceId)?.tapped) continue;
        scope.out.push({ type: 'TAP', instanceId, ...m });
      }
      break;

    case 'untap':
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        if (!cardOf(state, instanceId)?.tapped) continue;
        scope.out.push({ type: 'UNTAP', instanceId, ...m });
      }
      break;

    case 'add-counters':
    case 'remove-counters': {
      const count = evalValue(effect.count, ctx);
      if (count === 0) break;
      const sign = effect.do === 'add-counters' ? 1 : -1;
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({
          type: 'CARD_COUNTER',
          instanceId,
          counter: effect.counter,
          delta: sign * count,
          ...m,
        });
      }
      break;
    }

    /*
     * A pump is a duration-limited CONTINUOUS effect, and for a long time this
     * case named one instead of making one, because `GameState` carried no list
     * to put it in. `layers.ts` had always modelled the effect properly; the
     * missing piece was storage, and the comment here said so honestly rather
     * than faking it with a permanent stat change that would never wear off.
     *
     * `GameState.timedEffects` is that list now. `pumpToContinuous` builds the
     * CR 613 record, `merge` turns it into an `ADD_CONTINUOUS` action, the
     * reducer stores it, `statics.ts` merges it into the layer pass, and its
     * `expiry` ends it without anyone having to remember to.
     *
     * It still defers when the selector matched nothing, because a spell that
     * resolved and found no legal recipient is a real event the log has to show.
     */
    case 'pump':
      merge(scope, pumpToContinuous(effect, ctx, envFor(ctx, scope)));
      break;

    case 'gain-control':
      merge(scope, gainControlToContinuous(effect, ctx, envFor(ctx, scope)));
      break;

    /*
     * CR 301.5c / 303.4f — the attachment moves onto the host.
     *
     * One `ATTACH` per attachment named by `what`, and `what` is the source
     * itself in every spelling the compiler emits today ("Attach this permanent
     * to target creature you control"). `to` names at most one host: an
     * attachment can only ever be on one permanent, so a selector that resolves
     * to several is a target that was never announced, and the first is the one
     * the announcement locked in.
     *
     * Nothing is checked here about whether the host is a LEGAL one. That is
     * `sba.ts`'s job under 704.5m/n, which already knows Equipment and Auras
     * thoroughly and runs immediately after this action is applied, and a second
     * legality check written here is a second one to disagree with it.
     */
    case 'attach': {
      const attachments = resolveSelector(effect.what, ctx);
      if (attachments.length === 0) break;
      const [host] = effect.to.sel === 'none' ? [] : resolveSelector(effect.to, ctx);
      if (effect.to.sel !== 'none' && !host) {
        // The target is gone. CR 608.2b has already blanked it, so say so
        // rather than silently leaving an Equipment on whatever it was on.
        const names = attachments.map(id => cardOf(state, id)?.name ?? id);
        scope.deferred.push(`${names.join(', ')} had nothing left to attach to`);
        break;
      }
      for (const instanceId of attachments) {
        if (cardOf(state, instanceId)?.attachedTo === host) continue;
        scope.out.push({ type: 'ATTACH', instanceId, toInstanceId: host ?? null, ...m });
      }
      break;
    }

    /* --- mana and table --- */

    case 'add-mana':
      /*
       * This case used to write a note. It said so plainly and it was right at
       * the time: `mana.ts` derived available mana by scanning untapped
       * permanents and there was no pool to put anything in, so a second pool
       * built here would have been a second implementation that drifted.
       *
       * `GameState.manaPool` exists now, so the mana goes in it. There is still
       * only one pool and one payment algorithm: `manaSourcesFor` offers the
       * floating mana and the untapped permanents to the same matcher.
       *
       * `addManaToActions` in `primitives/mana.ts` does the work, from inside
       * this switch, for the reason in the file header. It keeps the honesty
       * the note had: a count is honoured rather than flattened to one, a
       * restriction rides along verbatim, and a symbol that needs a choice
       * defers instead of guessing a colour.
       */
      merge(scope, addManaToActions(effect, ctx, envFor(ctx, scope)));
      break;

    case 'player-counter': {
      const count = evalValue(effect.count, ctx);
      if (count === 0) break;
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({ type: 'PLAYER_COUNTER', playerId, counter: effect.counter, delta: count, ...m });
      }
      break;
    }

    case 'set-monarch': {
      const [playerId] = resolvePlayers(effect.who, ctx);
      if (playerId) scope.out.push({ type: 'SET_MONARCH', playerId, ...m });
      break;
    }

    case 'lose-game':
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({ type: 'CONCEDE', playerId, ...m });
      }
      break;

    case 'win-game': {
      // Winning is "everyone else loses" in a pod, and the reducer already
      // derives the winner from who is left. Conceding the others is the honest
      // expression of it in the vocabulary the reducer has.
      const winners = resolvePlayers(effect.who, ctx);
      for (const player of state.players) {
        if (winners.includes(player.id) || player.hasLost) continue;
        scope.out.push({ type: 'CONCEDE', playerId: player.id, ...m });
      }
      break;
    }

    /*
     * Countering is `stack.ts`'s `COUNTER_SPELL`, which needs the stack id the
     * target was announced with. `StackTarget` has carried `kind:'stack'` and a
     * `stackId` the whole time and `AbilityContext.targets` carries the
     * announced list, so the missing piece was never a state change.
     *
     * `counterTargetSpell` also carries the rule that makes it safe. CR 608.2b:
     * a target that has become illegal is simply not affected, so a stack id no
     * longer on the stack is DROPPED. Firing at it anyway would counter whatever
     * object now holds that id, which is the worst available failure because it
     * is silent and it hits the wrong player's spell.
     */
    case 'counter':
      merge(scope, counterTargetSpell(effect, ctx, envFor(ctx, scope)));
      break;

    /* --- control flow --- */

    case 'if': {
      const branch = evalCondition(effect.condition, ctx) ? effect.then : effect.else;
      if (branch) for (const inner of branch) runEffect(inner, ctx, scope);
      break;
    }

    case 'for-each': {
      if (isPlayerSelector(effect.over)) {
        for (const playerId of resolvePlayers(effect.over, ctx)) {
          const bound: AbilityContext = { ...ctx, eachPlayerId: playerId, controllerId: playerId };
          for (const inner of effect.effects) runEffect(inner, bound, scope);
        }
        break;
      }
      for (const instanceId of resolveSelector(effect.over as Selector, ctx)) {
        const bound: AbilityContext = { ...ctx, eachCardId: instanceId };
        for (const inner of effect.effects) runEffect(inner, bound, scope);
      }
      break;
    }

    case 'repeat': {
      const times = evalValue(effect.times, ctx);
      // Bounded, so a miscompiled value can never hang a browser tab. Anything
      // past the cap is reported rather than run.
      const capped = Math.min(Math.max(times, 0), 64);
      if (capped < times) scope.deferred.push(`repeat ${times} times (capped at ${capped})`);
      for (let n = 0; n < capped; n++) {
        for (const inner of effect.effects) runEffect(inner, ctx, scope);
      }
      break;
    }

    case 'choose-mode': {
      const min = evalValue(effect.min, ctx);
      const max = evalValue(effect.max, ctx);
      if (min >= effect.modes.length && max >= effect.modes.length) {
        // "Choose all" is not a choice.
        for (const mode of effect.modes) {
          for (const inner of mode.effects) runEffect(inner, ctx, scope);
        }
        break;
      }
      const ref = scope.modeRefs.get(effect as object);
      const chosen = ref ? chosenModes(scope.options.modes?.[ref], effect.modes.length, min, max) : null;

      if (chosen) {
        // The player picked. This is the ONLY place a mode's effects run
        // without every mode running, and it happens because somebody answered.
        for (const index of chosen) {
          for (const inner of effect.modes[index].effects) runEffect(inner, ctx, scope);
        }
        break;
      }

      const wording = `choose ${min === max ? min : `${min}-${max}`} of: ${effect.modes
        .map(mode => mode.text)
        .join(' / ')}`;

      /*
       * The deferral is still emitted, word for word as it was before modes
       * could be answered at all. A caller that has not been taught to ask sees
       * exactly what it saw before, so adding the channel could not change any
       * existing card's behaviour.
       *
       * What is new is the entry beside it, which carries the options. An
       * answer that arrived and was not legal lands here too, and says so, so a
       * caller passing nonsense finds out instead of watching its answer be
       * quietly rounded into a legal one.
       */
      const rejected = ref && scope.options.modes?.[ref] ? ' (the answer given was not a legal set of modes)' : '';
      scope.deferred.push(`${wording}${rejected}`);

      if (ref) {
        scope.choices.push({
          ref,
          prompt: wording,
          min,
          max,
          options: effect.modes.map((mode, index) => ({ index, text: mode.text })),
        });
      }
      break;
    }

    case 'may': {
      // Never taken automatically: "you may" is the player's word, not ours.
      //
      // The one exception is a measuring run that set `answerMayYes`, and the
      // exception says so out loud at the moment it is taken rather than in a
      // comment somewhere else. See `RunOptions.answerMayYes` for the bias.
      if (scope.options.answerMayYes) {
        for (const inner of effect.effects) runEffect(inner, ctx, scope);
        break;
      }
      const [playerId] = resolvePlayers(effect.who, ctx);
      scope.deferred.push(`${nameOf(state, playerId)} may: ${effect.text}`);
      break;
    }

    case 'unless-pays': {
      // The decision belongs to somebody who is not the ability's controller,
      // and there is no way to ask them from inside a pure interpreter. Running
      // the effects would resolve Rhystic Study as though every opponent always
      // declined; skipping them would resolve it as though they always paid.
      // Both are wrong, so neither happens and the table is told what is owed.
      const askedIds = resolvePlayers(effect.who, ctx);
      const owed = effect.cost
        .map(cost =>
          cost.pay === 'mana' ? cost.cost
          // A computed generic amount, read off the board now so the note
          // names the number the player is actually being asked for.
          : cost.pay === 'generic-mana' ? `{${evalValue(cost.amount, ctx)}}`
          : cost.pay)
        .join(', ');
      const asked = askedIds.length
        ? askedIds.map(playerId => nameOf(state, playerId)).join(', ')
        : // `{who:'trigger-player'}` with nothing bound. Naming the gap beats
          // naming a player who was never asked.
          'the player this triggered on, who was never identified because the trigger bound no player';
      scope.deferred.push(`${asked} may pay ${owed}; if not, the ability resolves`);
      for (const inner of effect.effects) {
        // Reported, never run: the note has to describe what the opponent is
        // buying out of, or "may pay {1}" tells them nothing about the stakes.
        const preview = runEffects([inner], ctx, scope.options);
        for (const action of preview.actions) {
          scope.deferred.push(`  if not paid: ${action.type.toLowerCase().replace(/_/g, ' ')}`);
        }
        for (const decision of preview.deferred) scope.deferred.push(`  if not paid: ${decision}`);
      }
      break;
    }

    case 'do-if-cost-paid': {
      /*
       * "You may pay {2}. If you do, draw a card."
       *
       * The decision belongs to the CONTROLLER, and a pure interpreter cannot
       * take it for them for the same reason it cannot take a `{do:'may'}`:
       * running `then` gives them a card they never paid for, and running
       * `else` decides they refused. So the table is told what is on offer and
       * both branches are previewed, in the words of the actions they would
       * produce, because "you may pay {2}" says nothing about the stakes.
       *
       * `answerMayYes` deliberately does NOT reach here. That flag is a
       * measuring bias for a free choice; this choice has a price, and running
       * `then` without paying is a card that resolves and cheats. A measurement
       * that took it would be counting cards that do more than they print,
       * which is the failure this port refuses everywhere else.
       */
      const payerIds = resolvePlayers(effect.who, ctx);
      const owed = effect.cost
        .map(cost =>
          cost.pay === 'mana' ? cost.cost
          // A computed generic amount, read off the board now so the note
          // names the number the player is actually being asked for.
          : cost.pay === 'generic-mana' ? `{${evalValue(cost.amount, ctx)}}`
          : cost.pay)
        .join(', ');
      const payer = payerIds.length
        ? payerIds.map(playerId => nameOf(state, playerId)).join(', ')
        : 'the controller, who was never identified because no player was bound';
      scope.deferred.push(
        effect.optional
          ? `${payer} may pay ${owed}; if they do, the rest of the ability happens`
          : `${payer} pays ${owed} if able; if they do, the rest of the ability happens`
      );
      const preview = (label: string, effects: readonly Effect[]): void => {
        for (const inner of effects) {
          const run = runEffects([inner], ctx, scope.options);
          for (const action of run.actions) {
            scope.deferred.push(`  ${label}: ${action.type.toLowerCase().replace(/_/g, ' ')}`);
          }
          for (const decision of run.deferred) scope.deferred.push(`  ${label}: ${decision}`);
        }
      };
      preview('if paid', effect.then);
      preview('if not paid', effect.else ?? []);
      break;
    }

    /* --- honesty --- */

    case 'manual':
      scope.deferred.push(effect.hint ? `${effect.text} (${effect.hint})` : effect.text);
      break;

    /* --- a machine-translated XMage body --- */

    case 'xmage-body': {
      const body = TRANSLATED_BODIES[effect.key];
      if (!body) {
        // The record named a body this build does not carry. Said out loud
        // rather than skipped: a missing key is a generator and a bundle that
        // disagree, and the card would otherwise resolve to nothing in silence.
        scope.deferred.push(
          `this card's effect is a translated XMage body and this build does not carry it (${effect.key})`
        );
        break;
      }
      if (body.trivial) {
        // `TranslatedBody.trivial` means the whole body is `return true` or
        // `return false`. Those are real overrides on an AsThoughEffect or a
        // ContinuousEffect whose behaviour lives in a DIFFERENT method that was
        // never translated. Running one produces nothing and would look like a
        // card that resolved. Generation already refuses to emit these; this is
        // the second bar, at the point of use, because the first one lives in a
        // script and this one ships.
        scope.deferred.push(
          `this card's XMage body is an override with no behaviour in it (${effect.key})`
        );
        break;
      }

      let run: XmageRun;
      try {
        run = runXmageEffect(
          state,
          {
            sourceId: ctx.sourceId,
            controllerId: ctx.controllerId,
            targets: ctx.targets,
            x: ctx.x,
            idPrefix: `${scope.options.idPrefix}-x${scope.counter.value++}`,
            at: scope.options.at ?? 0,
            ...(scope.options.cause ? { cause: scope.options.cause } : {}),
          },
          body.run
        );
      } catch (error) {
        // A translated body is machine-written and can reach a facade that
        // refuses. That is a bug in the translation or in the facade and it is
        // reported as one, but it must not take the whole resolution down with
        // it: the other effects of this ability still run, and the log says what
        // happened here.
        scope.deferred.push(
          `this card's translated XMage body failed (${effect.key}): ${(error as Error)?.message ?? String(error)}`
        );
        break;
      }

      for (const line of run.deferred) scope.deferred.push(line);

      if (!run.ok) {
        // The body stopped on a question and returned nothing. `runXmageEffect`
        // guarantees the action list is empty, so there is nothing half-done to
        // fold. The question is named; answering it is a decision protocol that
        // does not reach this function yet.
        const asked = run.pending[0]?.prompt;
        scope.deferred.push(
          asked
            ? `this card asks a question the engine cannot answer here: ${asked}`
            : `this card's translated XMage body stopped on a decision (${effect.key})`
        );
        break;
      }

      for (const action of run.actions) scope.out.push(action);

      if (run.applied && run.actions.length === 0 && run.deferred.length === 0) {
        // The body said it applied and changed nothing. That is the silent card
        // this project has now shipped twice, and it is named here rather than
        // counted as automation.
        scope.deferred.push(
          `this card's translated XMage body reported success and changed nothing (${effect.key})`
        );
      }
      break;
    }

    default:
      // Not `assertNever`'s job alone: `tsconfig.app.json` sets `strict: false`,
      // so an unhandled member does not reliably fail to compile. Throwing turns
      // "an ability that quietly did nothing" into a failing test.
      throw new Error(
        `runEffect: unhandled effect ${JSON.stringify((effect as { do: string }).do)}`
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run an ability's effects and say out loud whatever the engine did not do.
 *
 * The note for a deferred decision is not optional and not conditional: there
 * is no path through this function that resolves an ability carrying a manual
 * clause without emitting one. That invariant has its own test, because it is
 * the whole promise — a card either resolves completely, or visibly says what
 * is left.
 */
export interface ResolutionOptions extends RunOptions {
  sourceInstanceId?: InstanceId;
  /**
   * How the ability reached the stack, for the one line that says it did
   * nothing. 'triggered' by default because triggers were the first caller.
   * An activated ability reporting itself as "triggered" is a small lie about
   * a real event, and not telling small lies about what happened is this
   * file's entire subject. 'resolved' is for an instant or sorcery, which was
   * neither triggered nor activated: it was cast.
   */
  verb?: 'triggered' | 'activated' | 'resolved';
}

export function resolveAbilityActions(
  effects: readonly Effect[],
  ctx: AbilityContext,
  options: ResolutionOptions
): GameAction[] {
  return resolveAbilityRun(effects, ctx, options).actions;
}

/**
 * The same resolution, with the answerable decisions still attached.
 *
 * `resolveAbilityActions` throws `choices` away, which is right for the stack:
 * by the time an object is resolving, its modes were chosen on announcement and
 * there is nobody left to ask. A caller that resolves an ability BEFORE it
 * reaches the stack — `activate.ts` with a mana ability, which CR 605.3a says
 * never uses the stack — is still in a position to ask, and needs them.
 *
 * One run, not two. Calling `runEffects` to look at the choices and then
 * `resolveAbilityActions` to get the actions would execute the effects twice;
 * they are pure so it would not corrupt anything, but it would double every
 * derived token id's ordinal and is the kind of thing that stops being harmless
 * later.
 */
export function resolveAbilityRun(
  effects: readonly Effect[],
  ctx: AbilityContext,
  options: ResolutionOptions
): { actions: GameAction[]; choices: ModeChoice[] } {
  const run = runEffects(effects, ctx, options);
  const out = [...run.actions];
  const at = options.at ?? 0;
  const label = options.cause ?? 'An ability';

  for (const decision of run.deferred) {
    out.push({
      type: 'NOTE',
      instanceId: options.sourceInstanceId,
      // No em-dash: this is copy a player reads at a table, and the project's
      // copy rules ban them in anything user-facing. A colon does the same job.
      message: `${label}: not resolved automatically: ${decision}`,
      at,
    });
  }

  if (out.length === 0) {
    // A trigger that fires and leaves no trace is indistinguishable from one
    // that never fired, and that ambiguity is the original bug.
    out.push({
      type: 'NOTE',
      instanceId: options.sourceInstanceId,
      message: `${label}: ${options.verb ?? 'triggered'}, but there was nothing for it to do.`,
      at,
    });
  }

  return { actions: out, choices: run.choices };
}
