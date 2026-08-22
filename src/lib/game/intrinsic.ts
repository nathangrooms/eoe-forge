/**
 * DeckMatrix — the replacement effects a card carries in its own oracle text.
 *
 * ## The bug this exists for
 *
 * Owner: *"Some cards have 'this land enters tapped' - need to ensure this
 * actually works in playmode"*. It did not. Guildgates, Jungle Hollow and every
 * common dual entered UNTAPPED, which hands the player a free untapped land
 * every single time and changes the game.
 *
 * Every piece of the machinery was already built and none of it was connected:
 *
 *   - the compiler reads `"This land enters tapped."` and emits a
 *     `ReplacementAbility` with `{ do: 'enters-tapped' }` — verified against the
 *     live catalogue's real wording;
 *   - `replacement.ts` has `entersTapped()`, applies `enters-tapped` to a `PLAY`
 *     action, and honours CR 614.13 / 614.5 / 616.1 around it;
 *   - `rules.ts` runs `replaceAction` on every action.
 *
 * What was missing was the wire between the first and the second.
 * `state.replacements` is only ever written by an explicit `REGISTER_REPLACEMENT`
 * action, and nothing in play mode emits one — `replacementAbilitiesOf` had
 * **zero call sites in the entire tree**. So a compiled "enters tapped" was
 * produced and dropped on the floor.
 *
 * ## Why they are derived and not registered
 *
 * A self-replacement belongs to a card that is *arriving*. Registering it would
 * mean emitting a REGISTER action at some earlier moment — as the card is drawn,
 * or dealt, or moved — and every one of those moments is a place a code path can
 * forget. Worse, a registration is state: it can be stale, it can be duplicated,
 * and it has to be replayed in the right order.
 *
 * Deriving it from the card cannot be forgotten and cannot go stale. The card's
 * oracle text IS the effect; asking the card the moment the event happens is
 * both cheaper and impossible to desynchronise. `applicableReplacements` folds
 * these in beside the registered ones, and CR 614.5's once-only rule falls out
 * unchanged because the ids are stable per (instance, ability).
 *
 * Explicit registration stays for everything that genuinely *is* state: a
 * table-wide "creatures enter tapped", an emblem, a one-shot shield.
 *
 * ## Scope, stated honestly
 *
 * Only the two self-replacements the engine can carry out on its own are mapped:
 * "enters tapped" and "enters with N counters". Everything else the compiler can
 * produce — redirects, prevention shields, zone replacements — needs a target or
 * a choice that a derived effect has nowhere to get, so it is left alone rather
 * than half-applied. Project law: nothing fabricated.
 */

import type { CardInstance, GameState, ReplacementEffect } from './types.ts';
import { replacementAbilitiesOf } from './abilities/card-abilities.ts';
import { evalCondition, makeContext } from './abilities/context.ts';
import type { Condition } from '@/lib/cards/abilities/dsl';

/**
 * Namespace for a derived effect's id.
 *
 * It has to be stable across replays (so `replacedBy` means the same thing on
 * every client) and it must never collide with a registered effect's id.
 */
export function intrinsicReplacementId(instanceId: string, abilityId: string): string {
  return `intrinsic:${instanceId}:${abilityId}`;
}

/** True when this effect was derived from a card rather than registered. */
export function isIntrinsicReplacement(effect: ReplacementEffect): boolean {
  return effect.id.startsWith('intrinsic:');
}

/**
 * The self-replacement effects this card's own oracle text gives it.
 *
 * Returns `[]` for the overwhelming majority of cards, which is the cheap path
 * and the one that runs on every action: `abilitiesFor` is memoised on the
 * card's oracle text, so a board of 120 permanents shares one compile per
 * distinct card and every call after that is a `Map` hit.
 */
export function intrinsicReplacements(card: CardInstance | null | undefined): ReplacementEffect[] {
  if (!card) return [];

  const out: ReplacementEffect[] = [];

  for (const ability of replacementAbilitiesOf(card)) {
    // Only the card's own arrival. A replacement that watches something else
    // is a registered, board-wide effect and is not this module's business.
    if (ability.event.on !== 'enters') continue;
    if (!ability.selfReplacement) continue;

    const id = intrinsicReplacementId(card.instanceId, ability.id);

    if (ability.result.do === 'enters-tapped') {
      out.push({
        id,
        name: ability.text,
        event: 'enters',
        sourceInstanceId: card.instanceId,
        selfReplacement: true,
        match: { instanceId: 'self' },
        apply: { op: 'enters-tapped' },
      });
      continue;
    }

    if (ability.result.do === 'enters-with-counters') {
      /* `count` is a `ValueExpr` in the DSL and only a plain number can be
         acted on without a game context. A card that says "enters with X
         counters, where X is the number of Forests you control" is left to the
         player rather than resolved as some invented number. */
      const count = ability.result.count;
      if (typeof count !== 'number' || count <= 0) continue;
      out.push({
        id,
        name: ability.text,
        event: 'enters',
        sourceInstanceId: card.instanceId,
        selfReplacement: true,
        match: { instanceId: 'self' },
        apply: { op: 'enters-with-counters', counter: ability.result.counter, count },
      });
    }
  }

  return out;
}

/**
 * The derived effects that could apply to the permanent named by an event.
 *
 * Kept separate from `intrinsicReplacements` so `replacement.ts` can ask the
 * question in one line without knowing that a `GameState` holds its cards in a
 * map.
 */
export function intrinsicReplacementsFor(
  state: GameState,
  instanceId: string | undefined
): ReplacementEffect[] {
  if (!instanceId) return [];
  const card = state.cards[instanceId];
  if (!card) return [];

  /* CONDITIONAL SELF-REPLACEMENTS, which is nearly all of them on lands.
     ------------------------------------------------------------------
     "This land enters tapped unless you control a legendary creature" compiles
     to an `enters-tapped` result carrying a condition. The condition is the
     whole card: applied unconditionally the land always comes in tapped, which
     is a penalty it does not always have; ignored entirely it never does, which
     is the drawback deleted. Neither is the printed card.

     `intrinsicReplacements` has no state and cannot answer the question, so it
     is answered here, where there is one. A condition that cannot be evaluated
     leaves the effect in place, because the compiler only attaches one to a
     land whose DEFAULT is to enter tapped, and the default is the safer of the
     two wrong answers. */
  const derived = intrinsicReplacements(card);
  if (derived.length === 0) return derived;

  const conditions = conditionsByAbility(card);
  if (conditions.size === 0) return derived;

  return derived.filter(effect => {
    const condition = conditions.get(effect.id);
    if (!condition) return true;
    try {
      return evalCondition(condition, makeContext(state, card.instanceId, card.controllerId));
    } catch {
      return true;
    }
  });
}

/**
 * The condition on each self-replacement this card carries, keyed by the same
 * id `intrinsicReplacements` stamps, so the two can be lined up without
 * compiling the card twice.
 */
function conditionsByAbility(card: CardInstance): Map<string, Condition> {
  const out = new Map<string, Condition>();
  for (const ability of replacementAbilitiesOf(card)) {
    if (ability.event.on !== 'enters' || !ability.selfReplacement) continue;
    if (!ability.condition) continue;
    out.set(intrinsicReplacementId(card.instanceId, ability.id), ability.condition);
  }
  return out;
}
