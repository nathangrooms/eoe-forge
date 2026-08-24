/**
 * XMage `Target` classes as `dsl.ts` `TargetSpec` values.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * Read in place, never vendored. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Why a target table exists at all
 *
 * An `Effect` says `{sel:'target', ref:0}`. What ref 0 legally IS lives on the
 * ability, in `TargetSpec`. Without this table every targeted card lowers to an
 * effect pointed at nothing in particular, which is the shape that lets a
 * bounce spell target a land when the card says creature.
 *
 * `scripts/xmage/census.mjs targets` counted **106 distinct target classes**
 * over all 32,168 card files, and the top ten cover 81.9% of the cards that
 * target anything. Twenty-nine entries is enough.
 *
 * ## The two things this file refuses to do
 *
 * It never decomposes a class name into a filter. `TargetOpponentsCreature-
 * Permanent` is in the table with an explicit filter and an explicit
 * controller; it is not read as the words "opponents", "creature",
 * "permanent". Decomposing an identifier is a text search wearing a hat and it
 * is exactly what this port replaces.
 *
 * It never invents a prompt. `TargetSpec.prompt` is a UI label, and the one
 * this file emits is the object NOUN from the type, never XMage's own message
 * string. Those strings carry Wizards of the Coast wording and the extraction
 * omits their contents on purpose.
 */

import type { CardFilter, PlayerSelector, TargetSpec, Zone } from '../abilities/dsl.ts';
import { type Invocation, arg } from './record.ts';

const T = (value: string): CardFilter => ({ is: 'type', value });
const AND = (...of: CardFilter[]): CardFilter => ({ is: 'and', of });
const OR = (...of: CardFilter[]): CardFilter => ({ is: 'or', of });
const NOT = (of: CardFilter): CardFilter => ({ is: 'not', of });

export interface TargetEntry {
  what: 'card' | 'player' | 'any';
  filter?: CardFilter;
  zone?: Zone;
  controller?: PlayerSelector;
  /** The UI label. A type noun, not rules text. */
  prompt: string;
  /** Default count when the class is constructed with no explicit numbers. */
  min?: number;
  max?: number;
}

/**
 * Counts are cards, from `scripts/xmage/census.mjs targets`, denominator 32,168
 * XMage card files.
 */
export const XMAGE_TARGETS: Record<string, TargetEntry> = {
  'xmage:TargetCreaturePermanent': { what: 'card', filter: T('Creature'), zone: 'battlefield', prompt: 'creature' }, // 3,887
  'xmage:TargetPermanent': { what: 'card', filter: { is: 'any' }, zone: 'battlefield', prompt: 'permanent' }, // 3,015
  'xmage:TargetCardInYourGraveyard': { what: 'card', filter: { is: 'any' }, zone: 'graveyard', controller: { who: 'you' }, prompt: 'card in your graveyard' }, // 965
  'xmage:TargetPlayer': { what: 'player', prompt: 'player' }, // 934
  'xmage:TargetControlledCreaturePermanent': { what: 'card', filter: T('Creature'), zone: 'battlefield', controller: { who: 'you' }, prompt: 'creature you control' }, // 851
  /**
   * "Any target" is CR 115.4: a creature, a player, a planeswalker or a battle.
   * `TargetSpec.what` has no member for that mixture, and `'any'` is the member
   * that means it, so the filter rides along to say which permanents qualify.
   */
  'xmage:TargetAnyTarget': { what: 'any', filter: OR(T('Creature'), T('Planeswalker'), T('Battle')), prompt: 'any target' }, // 743
  'xmage:TargetOpponent': { what: 'player', controller: { who: 'each-opponent' }, prompt: 'opponent' }, // 653
  'xmage:TargetCardInLibrary': { what: 'card', filter: { is: 'any' }, zone: 'library', controller: { who: 'you' }, prompt: 'card in your library' }, // 607
  'xmage:TargetSpell': { what: 'card', filter: { is: 'any' }, zone: 'stack', prompt: 'spell' }, // 500
  'xmage:TargetControlledPermanent': { what: 'card', filter: { is: 'any' }, zone: 'battlefield', controller: { who: 'you' }, prompt: 'permanent you control' }, // 335
  'xmage:TargetOpponentsCreaturePermanent': { what: 'card', filter: T('Creature'), zone: 'battlefield', controller: { who: 'each-opponent' }, prompt: 'creature an opponent controls' }, // 273
  'xmage:TargetLandPermanent': { what: 'card', filter: T('Land'), zone: 'battlefield', prompt: 'land' }, // 260
  'xmage:TargetCardInGraveyard': { what: 'card', filter: { is: 'any' }, zone: 'graveyard', prompt: 'card in a graveyard' }, // 238
  'xmage:TargetArtifactPermanent': { what: 'card', filter: T('Artifact'), zone: 'battlefield', prompt: 'artifact' }, // 198
  'xmage:TargetCardInHand': { what: 'card', filter: { is: 'any' }, zone: 'hand', controller: { who: 'you' }, prompt: 'card in your hand' }, // 179
  'xmage:TargetNonlandPermanent': { what: 'card', filter: NOT(T('Land')), zone: 'battlefield', prompt: 'nonland permanent' }, // 151
  'xmage:TargetCreatureOrPlaneswalker': { what: 'card', filter: OR(T('Creature'), T('Planeswalker')), zone: 'battlefield', prompt: 'creature or planeswalker' }, // 140
  'xmage:TargetEnchantmentPermanent': { what: 'card', filter: T('Enchantment'), zone: 'battlefield', prompt: 'enchantment' }, // 104
  'xmage:TargetAttackingCreature': { what: 'card', filter: AND(T('Creature'), { is: 'attacking' }), zone: 'battlefield', prompt: 'attacking creature' }, // 90
  'xmage:TargetAttackingOrBlockingCreature': { what: 'card', filter: AND(T('Creature'), OR({ is: 'attacking' }, { is: 'blocking' })), zone: 'battlefield', prompt: 'attacking or blocking creature' }, // 61
  'xmage:TargetCardInOpponentsGraveyard': { what: 'card', filter: { is: 'any' }, zone: 'graveyard', controller: { who: 'each-opponent' }, prompt: "card in an opponent's graveyard" }, // 37
  'xmage:TargetControlledLandPermanent': { what: 'card', filter: T('Land'), zone: 'battlefield', controller: { who: 'you' }, prompt: 'land you control' }, // 34
  'xmage:TargetPermanentOrPlayer': { what: 'any', filter: { is: 'any' }, prompt: 'permanent or player' }, // 32
  'xmage:TargetControlledArtifactPermanent': { what: 'card', filter: T('Artifact'), zone: 'battlefield', controller: { who: 'you' }, prompt: 'artifact you control' },
  'xmage:TargetCreatureCard': { what: 'card', filter: T('Creature'), prompt: 'creature card' },
  'xmage:TargetArtifactOrEnchantmentPermanent': { what: 'card', filter: OR(T('Artifact'), T('Enchantment')), zone: 'battlefield', prompt: 'artifact or enchantment' },
};

/**
 * Target classes deliberately left out, with the reason.
 *
 * These are not "not done yet". Each one asks something `TargetSpec` cannot
 * say, and a spec that quietly dropped the extra condition would let a player
 * make an illegal choice the engine then honoured.
 */
export const REFUSED_TARGETS: Record<string, string> = {
  'xmage:TargetCardInASingleGraveyard':
    '29 cards. Every card taken has to come from ONE graveyard, and a TargetSpec names a set of legal choices rather than a partition of one. It HAD an entry, and the entry kept the restriction in its PROMPT and nowhere else, so Famished Ghoul offered "up to two target cards from a single graveyard" and would have accepted one from each of two. A prompt is text a player reads; the selector is what the engine checks, and only the second decides what is legal.',
  'xmage:TargetCreaturePermanentAmount':
    '55 cards. Divided damage: the player splits an amount among the targets as they are chosen. `TargetSpec` has a count of targets and no amount per target.',
  'xmage:TargetAnyTargetAmount': '42 cards. Same.',
  'xmage:TargetStackObject':
    '37 cards. Targets a spell OR an ability on the stack. `TargetSpec` filters cards; an ability on the stack is not a card.',
  'xmage:TargetSacrifice':
    'A target the CONTROLLER chooses as a cost rather than as a target of the ability. Recording it as a target would put it on the stack, where an opponent could respond to a choice that has already happened.',
  'xmage:TargetPlayerOrPlaneswalker':
    "124 cards. It had an entry, `{what:'any', filter: Planeswalker}`, and the entry could not be addressed. `{do:'damage'}` takes `Selector | PlayerSelector` and the two are different shapes, so `lower.ts` has to decide which one a target is BEFORE it knows what the player picked: `targetIsPlayer` said player, and Vulshok Replica's \"It deals 3 damage to target player or planeswalker\" lowered to damage aimed at a player. Point it at a planeswalker and the damage does not go where the card sends it. There is no `dsl.ts` member for a target that is either, so the honest answer is a refusal until there is one.",
  'xmage:TargetOpponentOrPlaneswalker': '36 cards. Same shape, same refusal.',
};

/**
 * A UI label for an overriding filter, from the TYPE it names, or `null`.
 *
 * Deliberately narrow, and for the same reason `keywords.ts`'s `objectNoun` is:
 * describing a compound filter means writing a phrase, and a written phrase is
 * rules text this project takes from Scryfall. An unnameable filter keeps the
 * class's own label, which is at worst too broad and never invented.
 */
function promptNoun(filter: CardFilter | undefined): string | null {
  if (!filter) return null;
  if (filter.is === 'type' || filter.is === 'subtype' || filter.is === 'supertype') return filter.value.toLowerCase();
  if (filter.is === 'and') {
    const parts = filter.of.map(promptNoun);
    return parts.every(Boolean) ? parts.join(' ') : null;
  }
  return null;
}

function intArg(invocation: Invocation, name: string): number | undefined {
  const value = arg(invocation, name)?.value;
  return value?.k === 'int' ? value.n : undefined;
}

/**
 * XMage spells "any number of targets" as `Integer.MAX_VALUE`. Carried through
 * as itself rather than clamped, because a clamp would be a made-up limit and
 * the caller can read `Number.MAX_SAFE_INTEGER` as "no limit" without guessing.
 */
const JAVA_MAX_INT = 2147483647;

export interface TargetLowering {
  ok: boolean;
  spec?: TargetSpec;
  missing?: string;
  why?: string;
}

/**
 * One target construction, lowered, at position `ref` in the ability's target
 * list.
 *
 * A `filter` argument on the construction OVERRIDES the class's default,
 * because that is what it does in XMage: `new TargetPermanent(filter)` is a
 * permanent matching that filter and not any permanent. An unresolved filter
 * argument is refused rather than ignored: ignoring it widens the legal set,
 * and a widened target set is how a spell ends up destroying something the card
 * does not allow.
 */
export function lowerTarget(invocation: Invocation, ref: number): TargetLowering {
  const refused = REFUSED_TARGETS[invocation.prim];
  if (refused) return { ok: false, missing: invocation.prim, why: refused };

  const entry = XMAGE_TARGETS[invocation.prim];
  if (!entry) return { ok: false, missing: invocation.prim, why: 'no entry in the target table' };

  const filterSlot = invocation.args.find((a) => a.name === 'filter');
  let filter = entry.filter;
  let controller = entry.controller;
  let zone = entry.zone;
  let prompt = entry.prompt;
  if (filterSlot) {
    if (filterSlot.value?.k !== 'objects') {
      // Deliberately NOT reported as a missing primitive. The class is in the
      // table; this one card passed a filter that did not resolve. Reporting it
      // as missing put `xmage:TargetPermanent` near the top of the work order
      // after the port, which read as "write this and unlock 657 cards" when
      // the entry was already written and the 657 were 657 separate filters.
      return {
        ok: false,
        why: 'the filter argument did not resolve, and ignoring it would widen what may legally be chosen',
      };
    }
    filter = filterSlot.value.filter;
    controller = filterSlot.value.controller ?? entry.controller;
    zone = (filterSlot.value.zone as Zone) ?? entry.zone;
    // The class's prompt describes the class's default object, so it is wrong
    // the moment a filter overrides it. Stone Rain is `new
    // TargetPermanent(FILTER_LAND)` and was coming out with the filter set to
    // Land and the prompt reading "permanent". The filter is what the rules
    // enforce so nothing was illegal, but the player was being asked the wrong
    // question, which is its own kind of wrong.
    const noun = promptNoun(filter);
    if (noun) prompt = noun;
  }

  const numTargets = intArg(invocation, 'numTargets');
  const min = intArg(invocation, 'minNumTargets') ?? numTargets ?? entry.min ?? 1;
  const max = intArg(invocation, 'maxNumTargets') ?? numTargets ?? entry.max ?? 1;

  const spec: TargetSpec = {
    ref,
    what: entry.what,
    min,
    max: max === JAVA_MAX_INT ? Number.MAX_SAFE_INTEGER : max,
    prompt,
  };
  if (filter) spec.filter = filter;
  if (zone) spec.zone = zone;
  if (controller) spec.controller = controller;
  return { ok: true, spec };
}

/**
 * Every target of an ability or a mode, in order, or the first refusal.
 *
 * All or nothing, for the same reason `lowerAbility` is: an ability with two
 * targets and one spec is an ability whose second `{sel:'target', ref:1}`
 * points at nothing, and an effect pointed at nothing does not visibly fail.
 */
export function lowerTargets(invocations: readonly Invocation[]): {
  ok: boolean;
  specs: TargetSpec[];
  missing: string[];
  refused: Array<{ prim: string; why: string }>;
} {
  const specs: TargetSpec[] = [];
  const missing: string[] = [];
  const refused: Array<{ prim: string; why: string }> = [];
  invocations.forEach((invocation, index) => {
    const result = lowerTarget(invocation, index);
    if (result.ok && result.spec) specs.push(result.spec);
    else {
      if (result.missing) missing.push(result.missing);
      if (result.why) refused.push({ prim: invocation.prim, why: result.why });
    }
  });
  return { ok: missing.length === 0 && refused.length === 0, specs, missing, refused };
}
