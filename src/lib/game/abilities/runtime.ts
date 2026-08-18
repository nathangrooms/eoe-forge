/**
 * DeckMatrix — the card-ability DSL: the runtime.
 *
 * **The only place in the codebase that switches on `Effect`.** One switch,
 * ending in `assertNever`, so a new member of the effect vocabulary is a
 * compile error and a thrown test rather than a card that quietly does nothing.
 *
 * ## Effects become ordinary actions
 *
 * `runEffects` returns `GameAction[]`. It does not touch state, does not
 * allocate ids from a clock or a random source, and does not decide anything a
 * player decides. The reducer folds what comes back, so an ability resolving is
 * an ordinary sequence of logged, replayable, undoable actions — the same ones
 * a human could have pressed. That is what keeps the action log the single
 * authority and lets a second client replay to byte-identical state.
 *
 * ## Decisions are deferred, never guessed
 *
 * When an effect needs a choice this engine cannot make on the player's behalf
 * — which card to discard, whether to take a "you may", which mode of a modal
 * spell — it does NOT pick. It records the decision in `EffectRun.deferred`,
 * and the caller turns each entry into a `NOTE` quoting the text verbatim. The
 * ability still does everything it can do on its own.
 *
 * The alternative was to have the engine choose. That is exactly the bug this
 * project is fixing, one level up: a card that appeared to resolve and did
 * something the player did not agree to is no better than one that appeared to
 * resolve and did nothing.
 */

import type { GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { Duration, Effect, Modification, Selector } from './dsl.ts';
import { assertNever } from './dsl.ts';
import type { AbilityContext } from './query.ts';
import { cardOf, evalCondition, evalValue, playerOf, resolvePlayers, resolveSelector } from './query.ts';
import { floatingEffect } from './continuous.ts';

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

export interface EffectRun {
  /** In order. Fed straight back through the reducer. */
  actions: GameAction[];
  /**
   * Decisions the engine declined to make for the player, verbatim. Never
   * empty and ignored: the caller emits one `NOTE` per entry, so a
   * half-resolved ability is visible in the log before anyone has to notice
   * that the board did not change.
   */
  deferred: string[];
}

export interface RunOptions {
  /** Epoch ms from the originating action. This module never reads a clock. */
  at?: number;
  /** Prefixed onto every log line: "Ajani's Pridemate — enters". */
  cause?: string;
  /**
   * Seed for derived ids (tokens, floating effects). Must be derived from
   * state — a stack id or `${version}:${index}` — never a uuid, or two clients
   * mint different ids for the same token and replay diverges.
   */
  idPrefix: string;
}

interface RunScope {
  options: RunOptions;
  counter: { value: number };
  out: GameAction[];
  deferred: string[];
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function runEffects(
  effects: readonly Effect[],
  ctx: AbilityContext,
  options: RunOptions
): EffectRun {
  const scope: RunScope = { options, counter: { value: 0 }, out: [], deferred: [] };
  for (const effect of effects) runEffect(effect, ctx, scope);
  return { actions: scope.out, deferred: scope.deferred };
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

/** Damage already marked on a permanent this turn, for lethality arithmetic. */
function markedDamage(ctx: AbilityContext, instanceId: InstanceId): number {
  return cardOf(ctx.state, instanceId)?.damage ?? 0;
}

/* -------------------------------------------------------------------------- */
/* The switch                                                                 */
/* -------------------------------------------------------------------------- */

function runEffect(effect: Effect, ctx: AbilityContext, scope: RunScope): void {
  const m = meta(scope);

  switch (effect.do) {
    /* --- life --- */

    case 'gain-life': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'LIFE_CHANGE', playerId, delta: amount, ...m });
      }
      break;
    }

    case 'lose-life': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'LIFE_CHANGE', playerId, delta: -amount, ...m });
      }
      break;
    }

    case 'set-life': {
      const life = evalValue(effect.amount, ctx);
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'SET_LIFE', playerId, life, ...m });
      }
      break;
    }

    case 'damage-player': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      const source = cardOf(ctx.state, ctx.sourceId);
      for (const targetPlayerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
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

    case 'damage': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      for (const instanceId of resolveSelector(effect.to, ctx)) {
        const view = ctx.derived.cards[instanceId];
        if (!view) continue;
        scope.out.push({
          type: 'CARD_DAMAGE',
          instanceId,
          amount,
          sourceInstanceId: ctx.sourceId,
          ...m,
        });
        // Lethal damage is computed here rather than left to a state-based
        // action, because the engine has no SBA pass for creature death and a
        // creature that took lethal damage and stayed alive is exactly the kind
        // of silent wrong this module exists to prevent.
        const lethal = view.toughness - markedDamage(ctx, instanceId);
        if (lethal > 0 && amount >= lethal && !view.keywords.includes('indestructible')) {
          scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
        }
      }
      break;
    }

    case 'poison': {
      const amount = evalValue(effect.amount, ctx);
      if (amount <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'POISON', playerId, delta: amount, ...m });
      }
      break;
    }

    /* --- cards --- */

    case 'draw': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        scope.out.push({ type: 'DRAW', playerId, count, ...m });
      }
      break;
    }

    case 'mill': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        const player = playerOf(ctx.state, playerId);
        if (!player) continue;
        for (const instanceId of player.zones.library.slice(0, count)) {
          scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
        }
      }
      break;
    }

    case 'discard': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        const player = playerOf(ctx.state, playerId);
        if (!player) continue;
        const hand = player.zones.hand;
        if (hand.length === 0) continue;
        if (hand.length <= count) {
          // No choice to make: the whole hand goes.
          for (const instanceId of hand) {
            scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
          }
          continue;
        }
        // More cards than the effect takes. Which ones is the player's call,
        // and a random discard needs the seeded RNG the reducer owns — neither
        // decision belongs to a pure effect interpreter.
        scope.deferred.push(
          `${player.name} discards ${count} card${count === 1 ? '' : 's'}${effect.random ? ' at random' : ''}`
        );
      }
      break;
    }

    case 'move-zone': {
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({
          type: 'MOVE_ZONE',
          instanceId,
          to: effect.to,
          ...(effect.position !== undefined ? { position: effect.position } : {}),
          ...m,
        });
      }
      break;
    }

    case 'destroy': {
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        const view = ctx.derived.cards[instanceId];
        if (view?.keywords.includes('indestructible')) {
          const card = cardOf(ctx.state, instanceId);
          scope.out.push({
            type: 'NOTE',
            instanceId,
            message: `${card?.name ?? 'That permanent'} is indestructible and was not destroyed.`,
            ...m,
          });
          continue;
        }
        scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
      }
      break;
    }

    case 'exile': {
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'exile', ...m });
      }
      break;
    }

    case 'sacrifice': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        const player = playerOf(ctx.state, playerId);
        if (!player) continue;
        // `who` names the sacrificing player, so the pool is filtered to what
        // THEY control. A selector that ignored that would let one player's
        // ability eat another player's board.
        const pool = resolveSelector({ sel: 'all', where: effect.what }, ctx).filter(
          id => ctx.derived.cards[id]?.controllerId === playerId
        );
        if (pool.length === 0) continue;
        if (pool.length <= count) {
          for (const instanceId of pool) {
            scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
          }
          continue;
        }
        scope.deferred.push(`${player.name} sacrifices ${count} of ${pool.length} eligible permanents`);
      }
      break;
    }

    case 'return-from':
    case 'search-library': {
      // Both need the player to pick from a zone we may not even be allowed to
      // show them. Named as a decision rather than resolved with a guess.
      const [playerId] = resolvePlayers(effect.who, ctx);
      const player = playerOf(ctx.state, playerId);
      scope.deferred.push(
        effect.do === 'search-library'
          ? `${player?.name ?? 'A player'} searches their library`
          : `${player?.name ?? 'A player'} returns a card from their ${effect.zone}`
      );
      break;
    }

    case 'shuffle': {
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({ type: 'SHUFFLE', playerId, ...m });
      }
      break;
    }

    /* --- permanents --- */

    case 'create-token': {
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(ctx.state, resolvePlayers(effect.who, ctx))) {
        for (let n = 0; n < count; n++) {
          scope.out.push({
            type: 'CREATE_TOKEN',
            playerId,
            token: effect.token,
            count: 1,
            ...(effect.tapped ? { tapped: true } : {}),
            instanceId: nextId(scope, 'tk'),
            ...m,
          });
        }
      }
      break;
    }

    case 'tap': {
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        if (cardOf(ctx.state, instanceId)?.tapped) continue;
        scope.out.push({ type: 'TAP', instanceId, ...m });
      }
      break;
    }

    case 'untap': {
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        if (!cardOf(ctx.state, instanceId)?.tapped) continue;
        scope.out.push({ type: 'UNTAP', instanceId, ...m });
      }
      break;
    }

    case 'add-counters': {
      const count = evalValue(effect.count, ctx);
      if (count === 0) break;
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({
          type: 'CARD_COUNTER',
          instanceId,
          counter: effect.counter,
          delta: count,
          ...m,
        });
      }
      break;
    }

    case 'remove-counters': {
      const count = evalValue(effect.count, ctx);
      if (count === 0) break;
      for (const instanceId of resolveSelector(effect.what, ctx)) {
        scope.out.push({
          type: 'CARD_COUNTER',
          instanceId,
          counter: effect.counter,
          delta: -count,
          ...m,
        });
      }
      break;
    }

    case 'pump': {
      const power = evalValue(effect.power, ctx);
      const toughness = evalValue(effect.toughness, ctx);
      const affected = resolveSelector(effect.what, ctx);
      if (affected.length === 0) break;

      const modifications: Modification[] = [{ layer: 'pt-modify', power, toughness }];
      if (effect.grant && effect.grant.length > 0) {
        modifications.push({ layer: 'ability', grant: effect.grant.map(k => k.toLowerCase()) });
      }

      // A pump is a duration-limited CONTINUOUS effect, not a write. It goes on
      // the state as plain data, is applied by `deriveState` at layer 7c, and
      // is removed by the reducer at cleanup — never by a timer, never by a
      // closure, so it replays exactly.
      scope.out.push({
        type: 'ADD_FLOATING',
        effect: floatingEffect({
          id: nextId(scope, 'fl'),
          sourceInstanceId: ctx.sourceId,
          controllerId: ctx.controllerId,
          name: cardOf(ctx.state, ctx.sourceId)?.name ?? 'An effect',
          affects: selectorForIds(affected),
          modifications,
          duration: effect.duration,
          createdTurn: ctx.state.turn,
        }),
        ...m,
      });
      break;
    }

    case 'gain-control': {
      const affected = resolveSelector(effect.what, ctx);
      const [newController] = resolvePlayers(effect.who, ctx);
      if (affected.length === 0 || !newController) break;
      scope.out.push({
        type: 'ADD_FLOATING',
        effect: floatingEffect({
          id: nextId(scope, 'fl'),
          sourceInstanceId: ctx.sourceId,
          controllerId: ctx.controllerId,
          name: cardOf(ctx.state, ctx.sourceId)?.name ?? 'An effect',
          affects: selectorForIds(affected),
          modifications: [{ layer: 'control', newController: effect.who }],
          duration: effect.duration,
          createdTurn: ctx.state.turn,
        }),
        ...m,
      });
      break;
    }

    /* --- mana and table --- */

    case 'add-mana': {
      // `mana.ts` is the one and only mana implementation and it derives
      // available mana from untapped permanents rather than tracking a pool.
      // Saying so is honest; inventing a second pool here would be a
      // second implementation that drifts.
      const [playerId] = resolvePlayers(effect.who, ctx);
      const player = playerOf(ctx.state, playerId);
      scope.deferred.push(`${player?.name ?? 'A player'} adds ${effect.mana} to their mana pool`);
      break;
    }

    case 'player-counter': {
      const count = evalValue(effect.count, ctx);
      if (count === 0) break;
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({
          type: 'PLAYER_COUNTER',
          playerId,
          counter: effect.counter,
          delta: count,
          ...m,
        });
      }
      break;
    }

    case 'set-monarch': {
      const [playerId] = resolvePlayers(effect.who, ctx);
      if (!playerId) break;
      scope.out.push({ type: 'SET_MONARCH', playerId, ...m });
      break;
    }

    case 'lose-game': {
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.out.push({ type: 'CONCEDE', playerId, ...m });
      }
      break;
    }

    case 'win-game': {
      // Winning is "everyone else loses" in a pod, and the reducer already
      // computes the winner from who is left. Conceding the opponents is the
      // honest expression of it in the vocabulary the reducer has.
      const winners = resolvePlayers(effect.who, ctx);
      for (const player of ctx.state.players) {
        if (winners.includes(player.id) || player.hasLost) continue;
        scope.out.push({ type: 'CONCEDE', playerId: player.id, ...m });
      }
      break;
    }

    /* --- control flow --- */

    case 'if': {
      const branch = evalCondition(effect.condition, ctx) ? effect.then : effect.else;
      if (branch) for (const inner of branch) runEffect(inner, ctx, scope);
      break;
    }

    case 'for-each': {
      for (const instanceId of resolveSelector(effect.over, ctx)) {
        const bound: AbilityContext = { ...ctx, eachCardId: instanceId };
        for (const inner of effect.effects) runEffect(inner, bound, scope);
      }
      break;
    }

    case 'for-each-player': {
      for (const playerId of resolvePlayers(effect.over, ctx)) {
        const bound: AbilityContext = { ...ctx, eachPlayerId: playerId };
        for (const inner of effect.effects) runEffect(inner, bound, scope);
      }
      break;
    }

    case 'repeat': {
      const times = evalValue(effect.times, ctx);
      // A repeat count is bounded so a miscompiled value can never hang a
      // browser. Anything beyond the cap is reported rather than run.
      const capped = Math.min(Math.max(times, 0), 64);
      if (capped < times) {
        scope.deferred.push(`repeat ${times} times (capped at ${capped})`);
      }
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
      scope.deferred.push(
        `choose ${min === max ? min : `${min}-${max}`} of: ${effect.modes.map(mode => mode.text).join(' / ')}`
      );
      break;
    }

    case 'may': {
      const [playerId] = resolvePlayers(effect.who, ctx);
      const player = playerOf(ctx.state, playerId);
      // Never taken automatically: "you may" is the player's word, not ours.
      scope.deferred.push(`${player?.name ?? 'A player'} may: ${effect.text}`);
      break;
    }

    /* --- honesty --- */

    case 'manual':
      scope.deferred.push(effect.hint ? `${effect.text} (${effect.hint})` : effect.text);
      break;

    default:
      return assertNever(effect, 'runEffect');
  }
}

/**
 * A selector naming exactly these instance ids.
 *
 * Pumps and control theft are resolved to concrete permanents at the moment
 * they happen (CR 611.2c: the set is locked in when the effect is created), so
 * the floating effect must not re-evaluate its subject later. Encoding the ids
 * as a filter keeps the floating effect plain serialisable data.
 */
function selectorForIds(ids: InstanceId[]): Selector {
  return { sel: 'all', where: { is: 'instance', ids: ids.slice() } };
}

/* -------------------------------------------------------------------------- */
/* Duration helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Human label for a duration, for log lines and stack rows. */
export function durationLabel(duration: Duration): string {
  switch (duration) {
    case 'end-of-turn':
      return 'until end of turn';
    case 'your-next-turn':
      return 'until your next turn';
    case 'while-source-on-battlefield':
      return 'while its source remains on the battlefield';
    case 'permanent':
      return 'permanently';
    default:
      return assertNever(duration, 'durationLabel');
  }
}
