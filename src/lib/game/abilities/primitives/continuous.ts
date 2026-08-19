/**
 * DeckMatrix — primitives that produce continuous effects.
 *
 * P01 `pumpToContinuous`, P02 `gainControlToContinuous`, and the four pure
 * helpers they compose. Specs: `scripts/primitives/specs/P0{1,2}.spec.json`,
 * `P1{1,2,3,4,5}.spec.json`.
 *
 * `to-actions.ts` defers every `{do:'pump'}` today, with an honest comment
 * saying why: "the state does not yet carry a list to put it in". That is the
 * single largest measured gap between REPRESENTABLE and AUTOMATED — 1,320 of the
 * 7,347 cards the compiler models completely are blocked on this one path, and
 * nothing else blocks them. `statics.ts` already derives continuous effects for
 * *static* abilities and hands them to `computeLayers`; these primitives produce
 * the same record for the one-shot, duration-limited case.
 *
 * The result is returned, not written. `PrimitiveResult.continuous` is a list
 * the caller merges into what it passes to `computeLayers` — so a pump is still
 * derived rather than stored, and replaying the log still lands on identical
 * state.
 */

import type { GameState, PlayerId } from '../../types.ts';
import type {
  ContinuousEffect,
  EffectPart,
  LayerSelector,
  SubLayer,
} from '../../layers.ts';
import type { Duration, Effect, Selector, ValueExpr } from '../../../cards/abilities/dsl.ts';
import type { AbilityContext } from '../context.ts';
import { cardOf, evalValue, resolvePlayers, resolveSelector } from '../context.ts';
import type { PrimitiveEnv, PrimitiveResult } from './contract.ts';
import { concatResults, defer, derivedId, nothing } from './contract.ts';

/* -------------------------------------------------------------------------- */
/* P13 — Expiry                                                               */
/* -------------------------------------------------------------------------- */

/**
 * When a continuous effect stops applying, as pure JSON.
 *
 * A closure would be the obvious implementation and is the wrong one: a client
 * that received only the action log has no way to reconstruct it, and the DSL's
 * central promise is that everything survives `structuredClone` and a `jsonb`
 * column. So expiry is a description, and whoever sweeps the effect list reads
 * it.
 *
 * `turn` is ABSOLUTE, never a countdown. A countdown has to be decremented by
 * something, and a replay that decremented once more or once fewer than the
 * original would end an effect on the wrong turn — a divergence that would only
 * show up several turns later, which is the worst kind.
 */
export type Expiry =
  | { kind: 'never' }
  | { kind: 'end-of-turn'; turn: number }
  | { kind: 'your-next-turn'; controllerId: PlayerId; afterTurn: number }
  | { kind: 'while-source' };

/** P13. Spec: `scripts/primitives/specs/P13.spec.json`. */
export function durationToExpiry(
  duration: Duration,
  state: GameState,
  controllerId: PlayerId
): Expiry {
  switch (duration) {
    case 'end-of-turn':
      return { kind: 'end-of-turn', turn: state.turn };
    case 'your-next-turn':
      return { kind: 'your-next-turn', controllerId, afterTurn: state.turn };
    case 'while-source-on-battlefield':
      // Not time-based. Giving it a turn number would end an anthem at cleanup.
      return { kind: 'while-source' };
    case 'permanent':
      return { kind: 'never' };
    default:
      // `strict` is off in `tsconfig.app.json`, so an unhandled member does not
      // reliably fail to compile. The conservative direction is "never expires"
      // being wrong loudly rather than "expires now" being wrong invisibly.
      return { kind: 'never' };
  }
}

/* -------------------------------------------------------------------------- */
/* P11 / P12 — parts                                                          */
/* -------------------------------------------------------------------------- */

/** P11. Spec: `scripts/primitives/specs/P11.spec.json`. */
export function ptModifyPart(
  power: ValueExpr,
  toughness: ValueExpr,
  ctx: AbilityContext
): EffectPart {
  return {
    sublayer: '7c' as SubLayer,
    modification: {
      kind: 'modify-pt',
      power: evalValue(power, ctx),
      toughness: evalValue(toughness, ctx),
    },
  };
}

/** P12. Spec: `scripts/primitives/specs/P12.spec.json`. */
export function grantAbilityPart(grant: readonly string[] | undefined): EffectPart | null {
  if (!grant || grant.length === 0) return null;
  return {
    sublayer: '6a' as SubLayer,
    modification: {
      kind: 'ability',
      addAbilities: grant.map(value => value.toLowerCase()),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* P15 — the affected set                                                     */
/* -------------------------------------------------------------------------- */

/**
 * P15. Spec: `scripts/primitives/specs/P15.spec.json`.
 *
 * Resolves NOW and pins the ids. CR 613.6: the set an effect applies to is
 * locked when it starts applying. Translating the filter into a
 * `LayerMatchFilter` would look tidier and would be wrong — Giant Growth would
 * start pumping whatever creature arrived next.
 */
export function selectorToLayerSelector(selector: Selector, ctx: AbilityContext): LayerSelector {
  const ids = resolveSelector(selector, ctx);
  if (ids.length === 0) return { kind: 'none' };
  return { kind: 'ids', ids: [...ids] };
}

/* -------------------------------------------------------------------------- */
/* P14 — assembly                                                             */
/* -------------------------------------------------------------------------- */

/** CR 613.8 dependency keys for one part. Derived, so a caller cannot forget it. */
function providesFor(part: EffectPart): string[] {
  switch (part.modification.kind) {
    case 'modify-pt':
      return ['modify-pt'];
    case 'set-pt':
      return ['set-pt'];
    case 'switch-pt':
      return ['switch-pt'];
    case 'ability':
      return part.modification.removeAbilities || part.modification.removeAllAbilities
        ? ['removing-ability']
        : ['adding-ability'];
    case 'control':
      return ['control-change'];
    case 'color':
      return ['color-change'];
    case 'type':
      return ['adding-subtype'];
    default:
      return [];
  }
}

/** P14. Spec: `scripts/primitives/specs/P14.spec.json`. */
export function assembleContinuous(
  parts: readonly EffectPart[],
  affects: LayerSelector,
  ctx: AbilityContext,
  env: PrimitiveEnv,
  note: string
): ContinuousEffect | null {
  if (parts.length === 0) return null;
  const provides = parts.flatMap(providesFor);
  const effect: ContinuousEffect = {
    id: derivedId(env, 'ce', 0),
    timestamp: env.timestamp,
    sourceId: ctx.sourceId,
    controllerId: ctx.controllerId,
    affects,
    parts: [...parts],
    note,
  };
  // `provides` is optional on `ContinuousEffect`; an empty array would be a
  // meaningless key list, and omitting it is how the layer engine spells "no
  // declared dependency".
  return provides.length > 0 ? { ...effect, provides } : effect;
}

/* -------------------------------------------------------------------------- */
/* P01 — pump                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * P01. Spec: `scripts/primitives/specs/P01.spec.json`.
 *
 * Measured: 1,320 of the 7,347 cards the compiler models completely are blocked
 * by this path and by nothing else
 * (`scripts/primitives/rank-engine-primitives.ts`).
 */
export function pumpToContinuous(
  effect: Extract<Effect, { do: 'pump' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const affects = selectorToLayerSelector(effect.what, ctx);
  if (affects.kind === 'none') {
    // A pump with no legal recipient is not nothing — it is a spell that
    // resolved and did nothing, and the log has to say so.
    return defer('nothing to pump');
  }

  const pt = ptModifyPart(effect.power, effect.toughness, ctx);
  const granted = grantAbilityPart(effect.grant);
  const parts = granted ? [pt, granted] : [pt];

  const expiry = durationToExpiry(effect.duration, ctx.state, ctx.controllerId);
  const power = evalValue(effect.power, ctx);
  const toughness = evalValue(effect.toughness, ctx);
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const grantNote = effect.grant?.length ? ` and ${effect.grant.join(', ')}` : '';
  const note = `${sign(power)}/${sign(toughness)}${grantNote} (${effect.duration})`;

  const continuous = assembleContinuous(parts, affects, ctx, env, note);
  if (!continuous) return defer(note);

  return {
    actions: [],
    deferred: [],
    // The expiry rides on the effect's note rather than on a field
    // `ContinuousEffect` does not have. `layers.ts` owns that type; widening it
    // is the DSL owner's call, and inventing a field here would be a fork.
    continuous: [{ ...continuous, note: `${note} [expiry:${expiry.kind}]` }],
  };
}

/* -------------------------------------------------------------------------- */
/* P02 — gain control                                                         */
/* -------------------------------------------------------------------------- */

/** P02. Spec: `scripts/primitives/specs/P02.spec.json`. */
export function gainControlToContinuous(
  effect: Extract<Effect, { do: 'gain-control' }>,
  ctx: AbilityContext,
  env: PrimitiveEnv
): PrimitiveResult {
  const affects = selectorToLayerSelector(effect.what, ctx);
  const [controller] = resolvePlayers(effect.who, ctx);
  if (affects.kind === 'none' || !controller) return defer('nothing to gain control of');

  const part: EffectPart = {
    sublayer: '2a' as SubLayer,
    modification: { kind: 'control', controller },
  };
  const names = (affects.kind === 'ids' ? affects.ids : [])
    .map(id => cardOf(ctx.state, id)?.name ?? id)
    .join(', ');
  const continuous = assembleContinuous(
    [part],
    affects,
    ctx,
    env,
    `control of ${names} (${effect.duration})`
  );
  if (!continuous) return nothing();
  return { actions: [], deferred: [], continuous: [continuous] };
}

/** Exported so the registry can fold several primitives in one resolution. */
export { concatResults };
