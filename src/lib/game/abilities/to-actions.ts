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
 */

import type { GameAction, GameState, InstanceId, PlayerId } from '../types.ts';
import type { Effect, PlayerSelector, Selector } from '../../cards/abilities/dsl.ts';
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

/* -------------------------------------------------------------------------- */
/* Result                                                                     */
/* -------------------------------------------------------------------------- */

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

function nameOf(state: GameState, playerId: PlayerId | undefined): string {
  return playerOf(state, playerId)?.name ?? 'A player';
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

      if (isPlayerSelector(effect.to)) {
        for (const targetPlayerId of livingIds(state, resolvePlayers(effect.to, ctx))) {
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

      for (const instanceId of resolveSelector(effect.to, ctx)) {
        const view = viewOf(ctx, instanceId);
        const card = cardOf(state, instanceId);
        if (!view || !card) continue;
        // The reducer has no "mark damage on a permanent" action, so lethality
        // is computed here and expressed as the zone change it causes. Saying
        // nothing would be the silent no-op this engine exists to prevent.
        const remaining = view.toughness - card.damage;
        if (remaining > 0 && amount >= remaining && !view.keywords.includes('indestructible')) {
          scope.out.push({ type: 'MOVE_ZONE', instanceId, to: 'graveyard', ...m });
        } else {
          scope.deferred.push(`${amount} damage marked on ${card.name}`);
        }
      }
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
      const count = evalValue(effect.count, ctx);
      if (count <= 0) break;
      for (const playerId of livingIds(state, resolvePlayers(effect.who, ctx))) {
        const hand = playerOf(state, playerId)?.zones.hand ?? [];
        if (hand.length === 0) continue;
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

    case 'return-from':
    case 'search-library':
      // Both need the player to pick from a zone we may not even be allowed to
      // show them. Named as a decision rather than resolved with a guess.
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.deferred.push(
          effect.do === 'search-library'
            ? `${nameOf(state, playerId)} searches their library`
            : `${nameOf(state, playerId)} returns a card from their ${effect.zone}`
        );
      }
      break;

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

    case 'pump': {
      // A pump is a duration-limited CONTINUOUS effect. `layers.ts` models one
      // properly and the state does not yet carry a list to put it in, so it is
      // named rather than faked with a permanent stat change that would never
      // wear off. Wrong-and-quiet is worse than absent-and-loud.
      const power = evalValue(effect.power, ctx);
      const toughness = evalValue(effect.toughness, ctx);
      const names = resolveSelector(effect.what, ctx).map(id => cardOf(state, id)?.name ?? id);
      if (names.length === 0) break;
      const grant = effect.grant?.length ? ` and gains ${effect.grant.join(', ')}` : '';
      scope.deferred.push(
        `${names.join(', ')} gets ${power >= 0 ? '+' : ''}${power}/${toughness >= 0 ? '+' : ''}${toughness}${grant} (${effect.duration})`
      );
      break;
    }

    case 'gain-control': {
      const names = resolveSelector(effect.what, ctx).map(id => cardOf(state, id)?.name ?? id);
      const [who] = resolvePlayers(effect.who, ctx);
      if (names.length === 0 || !who) break;
      scope.deferred.push(
        `${nameOf(state, who)} gains control of ${names.join(', ')} (${effect.duration})`
      );
      break;
    }

    /* --- mana and table --- */

    case 'add-mana':
      // `mana.ts` derives available mana from untapped permanents rather than
      // tracking a pool. Saying so is honest; a second pool here would be a
      // second implementation that drifts from the first.
      for (const playerId of resolvePlayers(effect.who, ctx)) {
        scope.deferred.push(`${nameOf(state, playerId)} adds ${effect.mana}`);
      }
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

    case 'counter': {
      // Countering is `stack.ts`'s `COUNTER_SPELL`, which needs the stack id the
      // target was announced with. Until an ability announces stack targets,
      // saying so beats guessing which object was meant.
      scope.deferred.push('counter target spell');
      break;
    }

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
      scope.deferred.push(
        `choose ${min === max ? min : `${min}-${max}`} of: ${effect.modes.map(mode => mode.text).join(' / ')}`
      );
      break;
    }

    case 'may': {
      // Never taken automatically: "you may" is the player's word, not ours.
      const [playerId] = resolvePlayers(effect.who, ctx);
      scope.deferred.push(`${nameOf(state, playerId)} may: ${effect.text}`);
      break;
    }

    /* --- honesty --- */

    case 'manual':
      scope.deferred.push(effect.hint ? `${effect.text} (${effect.hint})` : effect.text);
      break;

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
export function resolveAbilityActions(
  effects: readonly Effect[],
  ctx: AbilityContext,
  options: RunOptions & { sourceInstanceId?: InstanceId }
): GameAction[] {
  const run = runEffects(effects, ctx, options);
  const out = [...run.actions];
  const at = options.at ?? 0;
  const label = options.cause ?? 'An ability';

  for (const decision of run.deferred) {
    out.push({
      type: 'NOTE',
      instanceId: options.sourceInstanceId,
      message: `${label}: not resolved automatically — ${decision}`,
      at,
    });
  }

  if (out.length === 0) {
    // A trigger that fires and leaves no trace is indistinguishable from one
    // that never fired, and that ambiguity is the original bug.
    out.push({
      type: 'NOTE',
      instanceId: options.sourceInstanceId,
      message: `${label}: triggered, but there was nothing for it to do.`,
      at,
    });
  }

  return out;
}
