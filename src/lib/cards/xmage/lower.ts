/**
 * Play: turning a record into a `dsl.ts` `Ability` the reducer can run.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The XMage clone is read in place, outside this repository, and nothing from
 * it is vendored here. Forge is GPL-3.0 and was not fetched, read or
 * referenced.
 *
 * ## Why lowering is a separate step and not the storage format
 *
 * The record holds the recipe. `../abilities/dsl.ts` holds a closed `Effect`
 * union the runtime exhaustively switches. Those are different jobs and the
 * corpus proves it: 723 distinct effect classes, `CreateTokenEffect` alone with
 * 982 distinct argument shapes. If the record could only hold what the reducer
 * already understands then extraction progress would be gated on reducer
 * progress, there would be no way to measure how much is left, and the ranked
 * work order that makes the grind countable would have nothing to rank.
 *
 * So: store the recipe faithfully, lower it on demand, and let the gap between
 * the two be the measurement.
 *
 * ## What lowering produces, and why it changed
 *
 * This used to produce `Effect[]`. That was enough for the hard list and wrong
 * for the corpus, because the top of the work order is not effects. It is
 * `xmage:SimpleStaticAbility` at 5,867 cards, which produces `Modification`,
 * and `keyword:Flying` at 3,103, which produces nothing at all: a keyword IS an
 * ability. An ability shape that can only hold effects has no honest place to
 * put either, and those two alone are more cards than every one-shot effect in
 * the top ten put together.
 *
 * So `lowerAbility` now produces a whole `Ability`: `TriggeredAbility` with its
 * event, `ActivatedAbility` with its costs, `StaticAbility` with its
 * modifications, `ReplacementAbility`, `ManaAbility`, `KeywordAbility`. The
 * tables it reads live next door, one per vocabulary, each with its own census
 * and its own list of what it refuses:
 *
 *   `keywords.ts`          XMage keyword classes  ->  `KeywordAbility`
 *   `triggers.ts`          trigger classes        ->  `TriggerEvent`
 *   `targets.ts`           target classes         ->  `TargetSpec`
 *   `costs.ts`             cost classes           ->  `Cost`
 *   `values.ts`            dynamic values         ->  `ValueExpr`
 *   `modifications.ts`     continuous effects     ->  `Modification`
 *   `tokens.generated.ts`  token classes          ->  `TokenSpec`
 *   this file              one-shot effects       ->  `Effect`
 *
 * ## Partial lowering is refused, on purpose
 *
 * `verify-ability-coverage.mjs` casts real spells through the real reducer and
 * DOWNGRADES anything that resolves silently. It downgraded 612 cards. Every
 * one of those is a card the engine believed it owned and did nothing for.
 *
 * A lowering that emits two of three effects and drops the third produces
 * exactly that failure, and produces it in a way no test notices, because the
 * ability did run and did change the board. So `lowerAbility` is all or
 * nothing: if any part of the ability has no lowering, the whole ability comes
 * back `ok: false` with the names of the primitives that are missing. Those
 * names are the work order.
 */

import type {
  Ability,
  ActivatedAbility,
  Cost,
  Duration,
  Effect,
  KeywordAbility,
  ManaAbility,
  PlayerSelector,
  ReplacementAbility,
  Selector,
  SpellAbility,
  StaticAbility,
  TargetSpec,
  TriggeredAbility,
  ValueExpr,
} from '../abilities/dsl.ts';
import {
  type AbilityRecord,
  type CardRecord,
  type Invocation,
  type ModeRecord,
  type PrimId,
  type Slot,
  abilitiesOf,
  arg,
} from './record.ts';
import { grantedKeywordFrom, lowerKeywordAbility } from './keywords.ts';
import { lowerTrigger } from './triggers.ts';
import { lowerTargets } from './targets.ts';
import { lowerCosts } from './costs.ts';
import { counterFrom, lowerValueSlot } from './values.ts';
import { lowerModifications } from './modifications.ts';
import { XMAGE_TOKENS } from './tokens.generated.ts';

/* ------------------------------------------------------------------ *
 * The contract
 * ------------------------------------------------------------------ */

/**
 * Turns one invocation into runtime effects.
 *
 * Returns `null` when the invocation's ARGUMENTS are not in a shape this
 * lowering handles, which is a different failure from "no lowering exists" and
 * has to be reported differently: the first is a gap in one function, the
 * second is a gap in the table. Conflating them makes the work order wrong.
 */
export type Lowering = (invocation: Invocation, ctx: LowerContext) => Effect[] | null;

export interface LowerContext {
  /** The ability being lowered, for effects whose meaning depends on their ability. */
  ability: AbilityRecord;
  /** The card, for `{sel:'self'}` and for the face's own characteristics. */
  record: CardRecord;
  /**
   * The targets in scope. For a modal spell these are the CHOSEN MODE'S targets,
   * not the ability's, because Cryptic Command's counter mode targets a spell
   * and its bounce mode targets a permanent, and a `{sel:'target', ref:0}` that
   * meant the ability's first target would point the bounce at the spell.
   */
  targets: Invocation[];
}

/**
 * The outcome of lowering one ability.
 *
 * A flat interface rather than a discriminated union, and for a reason worth
 * writing down: `tsconfig.app.json` sets `strict: false`, so the compiler does
 * not narrow a union on its `ok` discriminant. Callers of a union that does not
 * narrow end up casting, and a cast is where somebody eventually reads
 * `effects` off a failed result and runs a card that did not lower.
 *
 * `missing` and `refused` are always present and always empty on success, so
 * the work order can be totalled without asking whether the field exists.
 */
export interface LowerResult {
  ok: boolean;
  /** The runnable ability. Present only when `ok`. */
  ability?: Ability;
  /**
   * The ability's effects, flattened. Empty for a keyword, static or
   * replacement ability, which change the game without resolving anything.
   * Kept alongside `ability` because several callers want only this.
   */
  effects: Effect[];
  /** Primitives with no entry in any table. Each one is a countable unit of work. */
  missing: PrimId[];
  /** Primitives with an entry that refused these particular arguments. */
  refused: Array<{ prim: PrimId; why: string }>;
}

export interface LowerCardResult {
  ok: boolean;
  /** True only when the card lowered AND had no abilities at all. Never counted as playable. */
  vacuous: boolean;
  abilities: Array<{ id: string; effects: Effect[]; ability?: Ability }>;
  blocked: Array<{ id: string; result: LowerResult }>;
}

const fail = (missing: PrimId[], refused: Array<{ prim: PrimId; why: string }> = []): LowerResult => ({
  ok: false,
  effects: [],
  missing,
  refused,
});

/* ------------------------------------------------------------------ *
 * Argument readers
 *
 * Every reader returns `undefined` rather than a default. A default here is the
 * silent no-op with extra steps: `amount ?? 1` turns a hole into a card that
 * draws one and looks like it worked.
 * ------------------------------------------------------------------ */

function int(invocation: Invocation, name: string): number | undefined {
  const value = arg(invocation, name)?.value;
  return value?.k === 'int' ? value.n : undefined;
}

function bool(invocation: Invocation, name: string): boolean | undefined {
  const value = arg(invocation, name)?.value;
  return value?.k === 'bool' ? value.b : undefined;
}

/**
 * The objects a "…ControlledEffect" applies to.
 *
 * XMage's `BoostControlledEffect`, `GainAbilityControlledEffect` and their
 * siblings take a filter that describes the KIND of permanent and get "you
 * control" from the class, not from the filter. So a card that passes
 * `FILTER_CREATURE` means "creatures you control" and the filter alone says
 * "creatures".
 *
 * Garruk Wildspeaker is the card that showed this. Its "-4: Creatures you
 * control get +3/+3 and gain trample until end of turn" came out with the
 * boost correctly limited to your creatures and the TRAMPLE granted to every
 * creature on the battlefield, because the boost fell through to the default
 * and the grant read the passed filter. That is a card that runs, changes the
 * board, and hands your opponents trample.
 */
function controlledObjects(invocation: Invocation, name: string): Selector | undefined {
  const slot = arg(invocation, name);
  const value = slot?.value;
  if (value && value.k !== 'objects') return undefined;
  // The argument is there and did not resolve: a carried construction or a
  // hole. Falling through to "creatures" would widen it, so refuse.
  if (slot && value?.k !== 'objects') return undefined;
  const where = value?.k === 'objects' ? value.filter : { is: 'type' as const, value: 'Creature' };
  const sel: Selector = { sel: 'all', where, zone: 'battlefield' };
  (sel as { controller?: PlayerSelector }).controller =
    (value?.k === 'objects' ? value.controller : undefined) ?? { who: 'you' };
  return sel;
}

function objects(invocation: Invocation, name: string): Selector | undefined {
  const value = arg(invocation, name)?.value;
  if (value?.k !== 'objects') return undefined;
  const sel: Selector = { sel: 'all', where: value.filter };
  if (value.controller) (sel as { controller?: PlayerSelector }).controller = value.controller;
  if (value.zone) (sel as { zone?: typeof value.zone }).zone = value.zone;
  return sel;
}

/**
 * Does the record CARRY this argument at all?
 *
 * The difference between "XMage's constructor left this out, so its own
 * documented default applies" and "XMage passed something and we could not read
 * it" is the difference between a faithful default and a made-up answer. Only
 * the first is safe to fall back on. Every `?? default` in this file has to be
 * guarded by this, or a card whose filter did not resolve comes out claiming a
 * wider set than it affects and a card whose count did not resolve comes out
 * making one of something.
 */
function present(invocation: Invocation, name: string): boolean {
  return arg(invocation, name) !== undefined;
}

/**
 * A quantity, or `undefined`.
 *
 * Wraps `values.ts` so this file has ONE spelling of "how many" and cannot
 * resolve a literal while refusing a dynamic value in the same argument
 * position. Before `values.ts` existed, `amount` here read `{k:'int'}` only,
 * which quietly refused every card whose count is computed.
 */
function amount(invocation: Invocation, name: string): ValueExpr | undefined {
  const value = lowerValueSlot(arg(invocation, name));
  return value === null ? undefined : value;
}

/**
 * The effect's duration, falling back to the default the XMage class itself
 * declares. The fallback is passed in per effect rather than assumed, because
 * the defaults genuinely differ: `BoostTargetEffect` defaults to end of turn
 * and `BoostEnchantedEffect` to while on battlefield, both checked in their own
 * source files.
 */
function duration(invocation: Invocation, fallback: Duration): Duration | undefined {
  const slot = arg(invocation, 'duration');
  if (!slot) return fallback;
  return slot.value?.k === 'duration' ? slot.value.duration : undefined;
}

/** The first target's selector, by index into the targets in scope. */
function targetRef(ctx: LowerContext, index = 0): Selector | undefined {
  return ctx.targets.length > index ? { sel: 'target', ref: index } : undefined;
}

/** The target read as a PLAYER, for effects that damage or drain one. */
function targetPlayerRef(ctx: LowerContext, index = 0): PlayerSelector | undefined {
  return ctx.targets.length > index ? { who: 'target-player', ref: index } : undefined;
}

/**
 * Whether the target at `index` is a player rather than a permanent.
 *
 * `LoseLifeTargetEffect` and `DamageTargetEffect` both point at "the target",
 * and whether that target is a player or a creature decides which `dsl.ts`
 * selector they take. Reading it off the target's own class is the only way to
 * tell. Guessing would give Lightning Bolt one behaviour and Lava Spike
 * another.
 */
function targetIsPlayer(ctx: LowerContext, index = 0): boolean {
  const invocation = ctx.targets[index];
  if (!invocation) return false;
  return (
    invocation.prim === 'xmage:TargetPlayer' ||
    invocation.prim === 'xmage:TargetOpponent' ||
    invocation.prim === 'xmage:TargetPlayerOrPlaneswalker' ||
    invocation.prim === 'xmage:TargetOpponentOrPlaneswalker'
  );
}

/* ------------------------------------------------------------------ *
 * The effect table
 *
 * Ordered by how many cards each entry unblocks, taken from
 * `scripts/coverage/.data/xmage-record-shape.json`'s `coverage.workOrder`,
 * which counts cards whose play is blocked by that one primitive. The counts in
 * the comments are that measurement and nothing else. What each entry actually
 * BUYS is smaller, because most blocked cards are blocked by more than one
 * thing, and `scripts/xmage/port-progress.mjs` measures that separately by
 * adding the entries one at a time.
 * ------------------------------------------------------------------ */

export const LOWERINGS: Record<PrimId, Lowering> = {
  /* ---------------- tokens: 2,164 cards blocked ---------------- */

  /**
   * The token itself comes from `tokens.generated.ts`, parsed out of XMage's
   * 793 token classes by `scripts/xmage/extract-tokens.mjs`.
   *
   * A token whose constructor adds an ability this port cannot name as a
   * keyword is REFUSED, not emitted without it. A Treasure token with no
   * sacrifice ability is not a Treasure; it is a blank artifact that would sit
   * on the battlefield doing nothing while the deck builder counted it as ramp.
   *
   * ## The count is absent or it is refused. It is never assumed to be one.
   *
   * This line used to read `amount(invocation, 'amount') ?? 1`, which is the
   * exact thing the argument readers above forbid, and it produced cards that
   * RAN and were WRONG rather than cards that refused. Storm Herd, "create X
   * 1/1 white Pegasus creature tokens with flying, where X is your life total",
   * made one Pegasus. Hare Apparent made one Rabbit. 77 cards were counted as
   * fully lowered on that basis. An `amount` argument the record carries and
   * this port cannot read is a hole, so the whole effect is refused.
   */
  'xmage:CreateTokenEffect': (invocation) => {
    const slot = arg(invocation, 'token');
    if (slot?.value?.k !== 'invoke') return null;
    const cls = slot.value.invocation.prim.replace(/^xmage:/, '');
    const entry = XMAGE_TOKENS[cls];
    if (!entry || entry.otherAbilities.length > 0) return null;
    const read = amount(invocation, 'amount');
    if (present(invocation, 'amount') && read === undefined) return null;
    const count = read ?? 1;
    const effect: Effect = { do: 'create-token', who: { who: 'you' }, token: entry.spec, count };
    if (bool(invocation, 'tapped')) (effect as { tapped?: boolean }).tapped = true;
    return [effect];
  },

  /* ---------------- auras and equipment: 1,265 cards ---------------- */

  /**
   * `AttachEffect(Outcome)` carries no object of its own: what it attaches is
   * the source, and what it attaches TO is the ability's target. `Outcome` is
   * XMage's AI hint and means nothing to the rules, which is why it is read and
   * discarded rather than mapped onto something.
   */
  'xmage:AttachEffect': (_invocation, ctx) => {
    const to = targetRef(ctx);
    if (!to) return null;
    return [{ do: 'attach', what: { sel: 'self' }, to }];
  },

  /* ---------------- pumps: 1,192 + 862 + 357 cards ---------------- */

  'xmage:BoostTargetEffect': (invocation, ctx) => {
    const what = targetRef(ctx);
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    // The two-argument constructor delegates to `Duration.EndOfTurn`, checked
    // in BoostTargetEffect.java. A boost with no duration is not permanent.
    const dur = duration(invocation, 'end-of-turn');
    if (!what || power === undefined || toughness === undefined || !dur) return null;
    return [{ do: 'pump', what, power, toughness, duration: dur }];
  },

  'xmage:BoostSourceEffect': (invocation) => {
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    // Every BoostSourceEffect constructor takes a duration, so there is no
    // default to fall back on and an absent one is a refusal.
    const slot = arg(invocation, 'duration');
    const dur = slot?.value?.k === 'duration' ? slot.value.duration : undefined;
    if (power === undefined || toughness === undefined || !dur) return null;
    return [{ do: 'pump', what: { sel: 'self' }, power, toughness, duration: dur }];
  },

  'xmage:BoostControlledEffect': (invocation) => {
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (power === undefined || toughness === undefined || !dur) return null;
    const what = controlledObjects(invocation, 'filter');
    if (!what) return null;
    return [{ do: 'pump', what, power, toughness, duration: dur }];
  },

  /**
   * 188 cards. Every creature matching the filter, not only yours. The default
   * when no filter is passed is every creature, which is what makes this the
   * symmetric member of the family: reading it as "yours" would turn an
   * Overrun into a one-sided pump.
   */
  'xmage:BoostAllEffect': (invocation) => {
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (power === undefined || toughness === undefined || !dur) return null;
    // `BoostAllEffect`'s filterless constructors pass
    // `StaticFilters.FILTER_PERMANENT_ALL_CREATURES` themselves, checked in
    // BoostAllEffect.java, so that default is XMage's and not an invention. A
    // filter that IS passed and did not resolve is a different thing and is
    // refused rather than widened to every creature.
    if (present(invocation, 'filter') && !objects(invocation, 'filter')) return null;
    const what = objects(invocation, 'filter') ?? {
      sel: 'all',
      where: { is: 'type', value: 'Creature' },
      zone: 'battlefield',
    };
    return [{ do: 'pump', what, power, toughness, duration: dur }];
  },

  /** Auras and equipment that pump what they are on, from a resolving ability. */
  'xmage:BoostEnchantedEffect': (invocation) => {
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (power === undefined || toughness === undefined || !dur) return null;
    return [{ do: 'pump', what: { sel: 'attached' }, power, toughness, duration: dur }];
  },
  'xmage:BoostEquippedEffect': (invocation) => {
    const power = amount(invocation, 'power');
    const toughness = amount(invocation, 'toughness');
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (power === undefined || toughness === undefined || !dur) return null;
    return [{ do: 'pump', what: { sel: 'attached' }, power, toughness, duration: dur }];
  },

  /* ---------------- granted keywords: 995 + 440 cards ---------------- *
   *
   * `{do:'pump'}` with zero power and toughness is how `dsl.ts` spells "gains
   * an ability until end of turn": `grant` is a field on `pump`, not a member
   * of its own. Using the member that exists rather than adding one keeps the
   * runtime's exhaustive switch the size it already is.
   */

  'xmage:GainAbilityTargetEffect': (invocation, ctx) => {
    const what = targetRef(ctx);
    const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
    const dur = duration(invocation, 'end-of-turn');
    if (!what || !keyword || !dur) return null;
    return [{ do: 'pump', what, power: 0, toughness: 0, grant: [keyword], duration: dur }];
  },

  'xmage:GainAbilitySourceEffect': (invocation) => {
    const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (!keyword || !dur) return null;
    return [{ do: 'pump', what: { sel: 'self' }, power: 0, toughness: 0, grant: [keyword], duration: dur }];
  },

  /** 276 cards. "Creatures you control gain trample until end of turn." */
  'xmage:GainAbilityControlledEffect': (invocation) => {
    const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (!keyword || !dur) return null;
    const what = controlledObjects(invocation, 'filter');
    if (!what) return null;
    return [{ do: 'pump', what, power: 0, toughness: 0, grant: [keyword], duration: dur }];
  },

  /** Every creature, whoever controls it. */
  'xmage:GainAbilityAllEffect': (invocation) => {
    const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (!keyword || !dur) return null;
    // Every `GainAbilityAllEffect` constructor takes a filter, checked in
    // GainAbilityAllEffect.java, so there is no filterless form to default for.
    // One that did not resolve is refused: granting a keyword to every creature
    // on the board when the card grants it to Slivers is not a near miss.
    const what = objects(invocation, 'filter');
    if (!what) return null;
    return [{ do: 'pump', what, power: 0, toughness: 0, grant: [keyword], duration: dur }];
  },

  /** What the aura or equipment is on. */
  'xmage:GainAbilityAttachedEffect': (invocation) => {
    const keyword = grantedKeywordFrom(arg(invocation, 'ability'));
    const dur = duration(invocation, 'while-source-on-battlefield');
    if (!keyword || !dur) return null;
    return [{ do: 'pump', what: { sel: 'attached' }, power: 0, toughness: 0, grant: [keyword], duration: dur }];
  },

  /* ---------------- life: 1,118 + 232 + 215 + 188 cards ---------------- */

  'xmage:GainLifeEffect': (invocation) => {
    const life = amount(invocation, 'life');
    if (life === undefined) return null;
    return [{ do: 'gain-life', who: { who: 'you' }, amount: life }];
  },

  'xmage:LoseLifeSourceControllerEffect': (invocation) => {
    const n = amount(invocation, 'amount');
    if (n === undefined) return null;
    // `youLose` changes only the printed wording, checked in
    // LoseLifeSourceControllerEffect.java. Reading it as a change of WHO loses
    // would point the effect at the wrong player on 215 cards.
    return [{ do: 'lose-life', who: { who: 'you' }, amount: n }];
  },

  'xmage:LoseLifeOpponentsEffect': (invocation) => {
    const n = amount(invocation, 'amount');
    if (n === undefined) return null;
    return [{ do: 'lose-life', who: { who: 'each-opponent' }, amount: n }];
  },

  'xmage:LoseLifeTargetEffect': (invocation, ctx) => {
    const who = targetPlayerRef(ctx);
    const n = amount(invocation, 'amount');
    if (!who || n === undefined || !targetIsPlayer(ctx)) return null;
    return [{ do: 'lose-life', who, amount: n }];
  },

  /* ---------------- counters: 1,103 + 769 + 199 cards ---------------- *
   *
   * The counter's own count and the effect's `amount` are two separate
   * quantities and XMage combines them rather than adding them: a counter built
   * by `createInstance()` has a count of one, and a non-zero `amount` replaces
   * that. Checked in AddCountersSourceEffect.java. Adding them would double
   * every card that passes both.
   */

  'xmage:AddCountersSourceEffect': (invocation) => {
    const counter = counterFrom(arg(invocation, 'counter'));
    if (!counter) return null;
    const explicit = amount(invocation, 'amount');
    if (present(invocation, 'amount') && explicit === undefined) return null;
    return [{ do: 'add-counters', what: { sel: 'self' }, counter: counter.counter, count: explicit ?? counter.count }];
  },

  'xmage:AddCountersTargetEffect': (invocation, ctx) => {
    const what = targetRef(ctx);
    const counter = counterFrom(arg(invocation, 'counter'));
    if (!what || !counter) return null;
    const explicit = amount(invocation, 'amount');
    if (present(invocation, 'amount') && explicit === undefined) return null;
    return [{ do: 'add-counters', what, counter: counter.counter, count: explicit ?? counter.count }];
  },

  'xmage:AddCountersAllEffect': (invocation) => {
    const what = objects(invocation, 'filter');
    const counter = counterFrom(arg(invocation, 'counter'));
    if (!what || !counter) return null;
    const explicit = amount(invocation, 'amount');
    if (present(invocation, 'amount') && explicit === undefined) return null;
    return [{ do: 'add-counters', what, counter: counter.counter, count: explicit ?? counter.count }];
  },

  /* ---------------- removal: 1,101 + 323 cards ---------------- */

  'xmage:DestroyTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'destroy', what }];
  },

  'xmage:ExileTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'exile', what }];
  },

  'xmage:DestroyAllEffect': (invocation) => {
    const what = objects(invocation, 'filter');
    if (!what) return null;
    // `noRegen` is read and deliberately not used: regeneration is a shield the
    // reducer does not model, so encoding "cannot be regenerated" would be a
    // flag nothing reads. Reading it here means the day regeneration lands, the
    // grep for `noRegen` finds this line.
    void bool(invocation, 'noRegen');
    return [{ do: 'destroy', what }];
  },

  /* ---------------- tapping: 427 + 300 cards ---------------- */

  'xmage:TapTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'tap', what }];
  },

  'xmage:UntapTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'untap', what }];
  },

  'xmage:TapAllEffect': (invocation) => {
    const what = objects(invocation, 'filter');
    if (!what) return null;
    return [{ do: 'tap', what }];
  },

  /* ---------------- graveyard: 346 + 256 cards ---------------- */

  'xmage:ReturnFromGraveyardToHandTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'move-zone', what, to: 'hand' }];
  },

  'xmage:ReturnFromGraveyardToBattlefieldTargetEffect': (invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    // `attacking` puts the creature onto the battlefield already attacking,
    // which is a combat state `move-zone` cannot carry. Refused rather than
    // dropped: a reanimated attacker that arrives outside combat is a different
    // card and nothing downstream would notice the difference.
    if (bool(invocation, 'attacking')) return null;
    const effect: Effect = { do: 'move-zone', what, to: 'battlefield' };
    if (bool(invocation, 'tapped')) (effect as { tapped?: boolean }).tapped = true;
    return [effect];
  },

  /* ---------------- cards ---------------- */

  'xmage:DrawCardSourceControllerEffect': (invocation) => {
    const n = amount(invocation, 'amount');
    if (n === undefined) return null;
    // `youDraw` changes only the printed wording, checked in
    // DrawCardSourceControllerEffect.java.
    return [{ do: 'draw', who: { who: 'you' }, count: n }];
  },

  'xmage:DrawDiscardControllerEffect': (invocation) => {
    // The optional form is "you may draw, then discard", a choice `{do:'may'}`
    // would need printed text for. Refused rather than made mandatory: a
    // mandatory discard is a downside the card does not have.
    if (bool(invocation, 'optional')) return null;
    const draw = int(invocation, 'cardsToDraw');
    const discard = int(invocation, 'cardsToDiscard');
    if (draw === undefined || discard === undefined) return null;
    return [
      { do: 'draw', who: { who: 'you' }, count: draw },
      { do: 'discard', who: { who: 'you' }, count: discard },
    ];
  },

  'xmage:MillCardsControllerEffect': (invocation) => {
    const n = amount(invocation, 'numberCards');
    if (n === undefined) return null;
    return [{ do: 'mill', who: { who: 'you' }, count: n }];
  },

  'xmage:DiscardTargetEffect': (invocation, ctx) => {
    const who = targetPlayerRef(ctx);
    const n = amount(invocation, 'amount');
    if (!who || n === undefined || !targetIsPlayer(ctx)) return null;
    const effect: Effect = { do: 'discard', who, count: n };
    if (bool(invocation, 'randomDiscard')) (effect as { random?: boolean }).random = true;
    return [effect];
  },

  /* ---------------- damage ---------------- */

  'xmage:DamageTargetEffect': (invocation, ctx) => {
    const n = amount(invocation, 'amount');
    if (n === undefined) return null;
    const to = targetIsPlayer(ctx) ? targetPlayerRef(ctx) : targetRef(ctx);
    if (!to) return null;
    return [{ do: 'damage', to, amount: n }];
  },

  'xmage:DamagePlayersEffect': (invocation) => {
    const n = amount(invocation, 'amount');
    if (n === undefined) return null;
    const slot = arg(invocation, 'controller');
    if (slot && slot.value?.k !== 'players') return null;
    // No `controller` argument means EVERY player, including you. Reading it as
    // "each opponent" would turn a symmetric burn spell into a one-sided one,
    // which is most of what those cards cost.
    const who: PlayerSelector = slot?.value?.k === 'players' ? slot.value.who : { who: 'each-player' };
    return [{ do: 'damage', to: who, amount: n }];
  },

  'xmage:DamageAllEffect': (invocation) => {
    const n = amount(invocation, 'amount');
    const what = objects(invocation, 'filter');
    if (n === undefined || !what) return null;
    return [{ do: 'damage', to: what, amount: n }];
  },

  /* ---------------- searching: 247 + 245 cards ---------------- */

  'xmage:SearchLibraryPutInPlayEffect': (invocation) => {
    const what = searchTarget(invocation);
    if (!what) return null;
    const effect: Effect = {
      do: 'search-library',
      who: { who: 'you' },
      what: what.selector,
      count: what.count,
      to: 'battlefield',
      thenShuffle: true,
    };
    if (bool(invocation, 'tapped')) (effect as { tapped?: boolean }).tapped = true;
    return [effect];
  },

  'xmage:SearchLibraryPutInHandEffect': (invocation) => {
    const what = searchTarget(invocation);
    if (!what) return null;
    return [
      {
        do: 'search-library',
        who: { who: 'you' },
        what: what.selector,
        count: what.count,
        to: 'hand',
        thenShuffle: true,
      },
    ];
  },

  /* ---------------- the stack and the table ---------------- */

  'xmage:ReturnToHandTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'move-zone', what, to: 'hand' }];
  },

  'xmage:CounterTargetEffect': (_invocation, ctx) => {
    const what = targetRef(ctx);
    if (!what) return null;
    return [{ do: 'counter', what }];
  },

  'xmage:WinGameSourceControllerEffect': () => [{ do: 'win-game', who: { who: 'you' } }],

  /**
   * 183 cards, and this one is a deliberate empty result rather than an
   * oversight.
   *
   * `InfoEffect.apply` in XMage is `return true;` with no body. The class exists
   * to hang reminder text on an ability, and its text is the only thing it
   * carries. Lowering it to no effects is therefore FAITHFUL, not a silent
   * drop, and it is the one place in this file where producing nothing is the
   * right answer. It is written as an explicit entry so that a reader asking
   * "why does this card lower to nothing" finds this comment instead of
   * assuming a bug. The text itself is not copied out: it is Wizards of the
   * Coast wording and comes from Scryfall.
   */
  'xmage:InfoEffect': () => [],
};

/**
 * A search effect's library target: what may be found, and how many.
 *
 * The target is nested inside the effect rather than sitting on the ability,
 * because searching your own library does not use the targeting rules. That is
 * why it is read here and not through `lowerTargets`.
 */
function searchTarget(invocation: Invocation): { selector: Selector; count: number } | null {
  const target = arg(invocation, 'target')?.value;
  if (target?.k !== 'invoke') return null;
  const filter = arg(target.invocation, 'filter')?.value;
  if (filter?.k !== 'objects') return null;
  const count =
    int(target.invocation, 'maxNumTargets') ?? int(target.invocation, 'numTargets') ?? 1;
  return {
    selector: { sel: 'all', where: filter.filter, zone: 'library', controller: { who: 'you' } },
    count,
  };
}

/**
 * Effects with an entry deliberately absent, and why. Counts are cards blocked,
 * from the same work order.
 *
 * Naming these is the point of the list. An effect that is simply missing looks
 * like work nobody has got to; an effect that is listed here is work somebody
 * decided against, with the reason attached, and the next person does not have
 * to rediscover it.
 */
export const REFUSED_EFFECTS: Record<PrimId, string> = {
  'xmage:ScryEffect':
    '335 cards. `dsl.ts` has no `scry` member and no `surveil`. Both are proposed in docs/engine/CARD-SEMANTICS.md section 8 and neither can be faked: scrying is a hidden choice that changes the top of the library, and doing nothing is not a conservative approximation of it.',
  'xmage:SurveilEffect': '186 cards. Same.',
  'xmage:DoIfCostPaid':
    '580 cards. Needs `{do:"do-if-cost-paid"}`, proposed in the same section. `{do:"unless-pays"}` is the OPPOSITE polarity: it asks somebody else and runs the effects on refusal. Reusing it would resolve every one of these cards backwards.',
  'xmage:ConditionalOneShotEffect':
    '602 cards. Needs the condition table: 167 distinct condition classes appear across the corpus, 49 of them shared. `{do:"if"}` exists; the mapping from an XMage `Condition` to a `dsl.ts` one does not.',
  'xmage:CreateDelayedTriggeredAbilityEffect':
    '301 cards. Creates a trigger that fires later. `dsl.ts` abilities belong to cards, so a delayed one has nowhere to live.',
  'xmage:ExileUntilSourceLeavesEffect':
    'A linked pair: exile now, return when the source leaves. The link is state between two effects and no `Effect` member carries it.',
  'xmage:RegenerateSourceEffect':
    '161 cards. Regeneration is a replacement shield the reducer does not model, so a destroy would quietly happen anyway.',
  'xmage:LookLibraryAndPickControllerEffect':
    '241 cards. Look at N, take some, the rest go somewhere else. Three quantities and two destinations; `search-library` carries one of each.',
};

/* ------------------------------------------------------------------ *
 * Card-local effect classes, filled by a machine translation
 * ------------------------------------------------------------------ */

/**
 * Lowerings for the effect classes XMage's card files declare THEMSELVES.
 *
 * ## Why these are built rather than written
 *
 * Every other lowering in this file is one function that buys every card using
 * that engine class. A card-local class is used by exactly one card, so there is
 * no shared lowering to write: there are 7,931 separate Java bodies, and reading
 * them one at a time is the job `CLAUDE.md` says the port must not do.
 *
 * `scripts/xmage/translate-bodies.mjs` translates those bodies by machine into
 * `src/lib/game/xmage/bodies.generated.ts`. This turns each translated body into
 * a `{do:'xmage-body'}` pointer at it. The lowering is generic; the DATA — which
 * bodies exist — is passed in.
 *
 * ## Why the key set is a parameter and not an import
 *
 * The translated bodies live in `src/lib/game/`, and they have to: they call a
 * runtime facade that reads a `GameState`. This file is in `src/lib/cards/` and
 * is imported BY the game layer. Importing back the other way would make the
 * card compiler depend on the game engine, which is a direction nothing else in
 * this project takes.
 *
 * So the key set arrives as an argument. `scripts/xmage/emit-lowered.mjs` reads
 * the generated file and passes it in, once, offline. The shipped app reads only
 * the result.
 *
 * ## The class-name check is not paranoia
 *
 * A `PrimId` is `local:AbattoirGhoulEffect` — the effect class alone, with no
 * card on it. `TRANSLATED_BODIES` is keyed `AbattoirGhoul::AbattoirGhoulEffect`,
 * card included. Two different cards CAN declare an effect class with the same
 * name, and lowering one card to the other card's body would be the worst
 * failure available here: a card that runs and is someone else's. So the key is
 * rebuilt from this record's own `provenance.xmageClass` and a miss REFUSES
 * rather than falling back to a name match.
 */
export function xmageBodyLowerings(keys: Iterable<string>): Record<PrimId, Lowering> {
  const byKey = new Set<string>(keys);

  // Which effect class names appear at all, so the table has an entry to find.
  // The entry still checks the whole key, so an effect name shared by two cards
  // gets one table row and each card is decided on its own.
  const effectNames = new Set<string>();
  for (const key of byKey) {
    const cut = key.indexOf('::');
    if (cut > 0) effectNames.add(key.slice(cut + 2));
  }

  const table: Record<PrimId, Lowering> = {};
  for (const effectName of effectNames) {
    const prim: PrimId = `local:${effectName}`;
    table[prim] = (_invocation, ctx) => {
      const cls = ctx.record.provenance?.xmageClass;
      if (!cls) return null;
      const key = `${cls}::${effectName}`;
      if (!byKey.has(key)) return null;
      return [{ do: 'xmage-body', key, card: cls, effect: effectName }];
    };
  }
  return table;
}

/* ------------------------------------------------------------------ *
 * Ability classes that carry their own semantics
 *
 * Most abilities are a shell around effects, costs and targets the record
 * already holds. These are not: the meaning is in the XMage class and the card
 * file passes nothing. `new GreenManaAbility()` is the whole of "{T}: Add {G}",
 * and the record's cost list and effect list for it are both EMPTY, because in
 * the source both are on the superclass. The generic path would read that as an
 * ability that costs nothing and does nothing, and report it as lowered, which
 * is the silent-success failure this whole file is arranged to prevent.
 * ------------------------------------------------------------------ */

type AbilityRule = (ability: AbilityRecord, record: CardRecord) => LowerResult;

const manaAbility =
  (mana: string): AbilityRule =>
  (ability) => {
    const effects: Effect[] = [{ do: 'add-mana', who: { who: 'you' }, mana }];
    const lowered: ManaAbility = {
      id: ability.id,
      text: '',
      confidence: 'exact',
      kind: 'mana',
      costs: [{ pay: 'tap' }],
      activeZones: ['battlefield'],
      effects,
    };
    return { ok: true, ability: lowered, effects, missing: [], refused: [] };
  };

/**
 * "Add one mana of any color", spelled the way this repo already spells it: a
 * one-of-five `choose-mode`.
 *
 * That idiom is not invented here. `src/lib/cards/abilities/effect-rules.ts`
 * rule `add-mana-any-color` does exactly this on the oracle-text path, so a
 * card arriving through either path is the same card downstream.
 */
const ANY_COLOUR: Effect = {
  do: 'choose-mode',
  min: 1,
  max: 1,
  modes: ['{W}', '{U}', '{B}', '{R}', '{G}'].map((mana) => ({
    text: '',
    effects: [{ do: 'add-mana', who: { who: 'you' }, mana } as Effect],
  })),
};

const MANA_FACTORY: Record<string, string> = {
  WhiteMana: '{W}',
  BlueMana: '{U}',
  BlackMana: '{B}',
  RedMana: '{R}',
  GreenMana: '{G}',
  ColorlessMana: '{C}',
};

const COLOUR_SYMBOL: Record<string, string> = { W: '{W}', U: '{U}', B: '{B}', R: '{R}', G: '{G}' };

/**
 * A mana count small enough to be a real printed cost.
 *
 * `Mana` fields are plain ints and at least one card passes `Integer.MAX_VALUE`
 * through one, which turned `symbol.repeat(n)` into a `RangeError: Invalid
 * string length` and stopped the whole measurement. A bound is not tidiness
 * here: an unbounded repeat is the difference between a script that reports a
 * number and a script that crashes on card 5,727 of 32,168.
 */
const sane = (n: number): boolean => Number.isInteger(n) && n > 0 && n <= 30;

/**
 * A `mage.Mana` value as a Scryfall mana string, or `'any'` for one mana of any
 * colour, or `null`.
 *
 * `Mana` is a bag of counts per colour, so a plain concatenation is faithful:
 * `Mana(0,0,0,1,1,0,0,0)` is "{R}{G}", both of them, not a choice between them.
 * The `any` slot is the one that is not a symbol, and it is separated out
 * rather than spelled `{C}`, because colourless mana and any-colour mana are
 * different and a land that made colourless when it should make any colour
 * would fix nothing and break every multicolour deck that runs it.
 */
function manaFrom(slot: Slot | undefined): string | 'any' | null {
  if (!slot) return null;
  const carried = slot.carried;
  if (carried?.c === 'factory' && carried.on === 'Mana') {
    const symbol = MANA_FACTORY[carried.method];
    if (!symbol) return null;
    const first = carried.args?.[0]?.value;
    const n = first?.k === 'int' ? first.n : 1;
    return sane(n) ? symbol.repeat(n) : null;
  }
  const value = slot.value;
  if (value?.k !== 'invoke' || value.invocation.prim !== 'xmage:Mana') return null;
  const inv = value.invocation;

  const single = arg(inv, 'color');
  if (single?.carried?.c === 'enum' && single.carried.enumName === 'ColoredManaSymbol') {
    return COLOUR_SYMBOL[single.carried.member] ?? null;
  }

  const counts: Record<string, number> = {};
  for (const name of ['white', 'blue', 'black', 'red', 'green', 'generic', 'any', 'colorless']) {
    const n = int(inv, name);
    if (n === undefined) return null;
    if (n !== 0 && !sane(n)) return null;
    counts[name] = n;
  }
  const coloured =
    '{W}'.repeat(counts.white) +
    '{U}'.repeat(counts.blue) +
    '{B}'.repeat(counts.black) +
    '{R}'.repeat(counts.red) +
    '{G}'.repeat(counts.green) +
    '{C}'.repeat(counts.colorless);
  if (counts.any > 0) {
    // One mana of any colour, and nothing else, is the shape the repo already
    // has an idiom for. Anything mixed with it is refused rather than half
    // expressed.
    if (counts.any === 1 && coloured === '' && counts.generic === 0) return 'any';
    return null;
  }
  const generic = counts.generic > 0 ? `{${counts.generic}}` : '';
  const mana = generic + coloured;
  return mana === '' ? null : mana;
}

export const ABILITY_RULES: Record<PrimId, AbilityRule> = {
  /* Basic land mana abilities: 422 + 324 + 281 + 273 + 272 + 269 cards. The tap
   * cost is on XMage's `BasicManaAbility` superclass, not in the card file,
   * checked in BasicManaAbility.java. */
  'xmage:WhiteManaAbility': manaAbility('{W}'),
  'xmage:BlueManaAbility': manaAbility('{U}'),
  'xmage:BlackManaAbility': manaAbility('{B}'),
  'xmage:RedManaAbility': manaAbility('{R}'),
  'xmage:GreenManaAbility': manaAbility('{G}'),
  'xmage:ColorlessManaAbility': manaAbility('{C}'),

  /** 235 cards. Only the plain form; a cost argument means a different ability. */
  'xmage:AnyColorManaAbility': (ability) => {
    if (ability.via.args.some((a) => a.name === 'cost')) {
      return fail(
        ['xmage:AnyColorManaAbility'],
        [{ prim: 'xmage:AnyColorManaAbility', why: 'takes an activation cost this rule does not read' }],
      );
    }
    const lowered: ManaAbility = {
      id: ability.id,
      text: '',
      confidence: 'exact',
      kind: 'mana',
      costs: [{ pay: 'tap' }],
      activeZones: ['battlefield'],
      effects: [ANY_COLOUR],
    };
    return { ok: true, ability: lowered, effects: [ANY_COLOUR], missing: [], refused: [] };
  },

  /**
   * 333 cards. The general mana ability: a cost, and a `Mana` value or a mana
   * effect.
   *
   * It reaches here rather than through the generic path because a `Mana` value
   * is not an `Effect` in XMage, so the record's effect list for one of these is
   * empty and the generic path would call it an ability that does nothing.
   */
  'xmage:SimpleManaAbility': (ability) => {
    const mana = manaFrom(arg(ability.via, 'mana'));
    if (mana === null) {
      return fail(
        ['xmage:SimpleManaAbility'],
        [
          {
            prim: 'xmage:SimpleManaAbility',
            why: 'the mana argument is an effect or a mixture this rule does not read',
          },
        ],
      );
    }
    const lowered = lowerCosts(ability.costs);
    if (!lowered.ok || lowered.costs.length === 0) {
      return fail(lowered.missing, [
        ...lowered.refused,
        ...(lowered.costs.length === 0 ? [{ prim: 'xmage:SimpleManaAbility', why: 'no extracted cost' }] : []),
      ]);
    }
    const effects: Effect[] =
      mana === 'any' ? [ANY_COLOUR] : [{ do: 'add-mana', who: { who: 'you' }, mana }];
    const result: ManaAbility = {
      id: ability.id,
      text: '',
      confidence: 'exact',
      kind: 'mana',
      costs: lowered.costs,
      activeZones: ['battlefield'],
      effects,
    };
    return { ok: true, ability: result, effects, missing: [], refused: [] };
  },

  /**
   * 553 cards. XMage files `EntersBattlefieldTappedAbility` as a static ability
   * and it wraps `EntersBattlefieldEffect(TapSourceEffect(true))`, which is a
   * self-replacement. `dsl.ts` has `ReplacementAbility` with
   * `{do:'enters-tapped'}` for exactly this, so it lands there rather than in
   * the static path where it would apply at the wrong time. Checked in
   * EntersBattlefieldTappedAbility.java.
   */
  'xmage:EntersBattlefieldTappedAbility': (ability) => {
    const lowered: ReplacementAbility = {
      id: ability.id,
      text: '',
      confidence: 'exact',
      kind: 'replacement',
      event: { on: 'enters', who: { sel: 'self' } },
      result: { do: 'enters-tapped' },
      selfReplacement: true,
      activeZones: ['battlefield'],
    };
    return { ok: true, ability: lowered, effects: [], missing: [], refused: [] };
  },

  /**
   * 594 cards. "Equip {2}" is CR 702.6a: an activated ability, sorcery timing,
   * whose only effect is attaching the source to target creature you control.
   *
   * XMage supplies all of that from the class. `EquipAbility`'s constructor
   * adds `new AttachEffect(outcome, "Equip")` and defaults the target to
   * `TargetControlledCreaturePermanent`, so the record's effect and target
   * lists are both empty; only the cost is in the card file. Checked in
   * EquipAbility.java, including the CR 702.6c note that additional equip
   * restrictions narrow the target and never the attachment.
   */
  'xmage:EquipAbility': (ability) => {
    const costs = equipCost(ability);
    if (!costs) {
      return fail(['xmage:EquipAbility'], [{ prim: 'xmage:EquipAbility', why: 'the equip cost did not resolve' }]);
    }
    const explicit = arg(ability.via, 'target')?.value;
    const targetInvocation: Invocation =
      explicit?.k === 'invoke'
        ? explicit.invocation
        : { prim: 'xmage:TargetControlledCreaturePermanent', role: 'target', args: [] };
    const targets = lowerTargets([targetInvocation]);
    if (!targets.ok) return fail(targets.missing, targets.refused);
    const effects: Effect[] = [{ do: 'attach', what: { sel: 'self' }, to: { sel: 'target', ref: 0 } }];
    const lowered: ActivatedAbility = {
      id: ability.id,
      text: '',
      confidence: 'exact',
      kind: 'activated',
      costs,
      timing: 'sorcery',
      activeZones: ['battlefield'],
      targets: targets.specs,
      effects,
    };
    return { ok: true, ability: lowered, effects, missing: [], refused: [] };
  },
};

/**
 * Ability classes whose ACTIVATION COST is in the class rather than in the
 * record's cost list.
 *
 * Separate from `ABILITY_RULES` because these abilities are otherwise ordinary:
 * their effects and targets are in the record and go through the normal path.
 * Only the cost has to come from somewhere else.
 *
 * A rule here may legitimately return an EMPTY list, and that is why it returns
 * `Cost[] | null` rather than using length as the signal. A planeswalker's "0:"
 * is a real free ability and the generic path's "no cost means an extraction
 * gap" rule would refuse it.
 */
export const ABILITY_COSTS: Record<PrimId, (ability: AbilityRecord) => Cost[] | null> = {
  /**
   * 324 cards. Every planeswalker ability. `LoyaltyAbility(effect, loyalty)`
   * builds `PayLoyaltyCost(loyalty)` and sets sorcery timing, checked in
   * LoyaltyAbility.java. A positive number adds loyalty counters and a negative
   * one removes them, so the sign is the whole difference between "+1: draw a
   * card" and "-1: draw a card" and it is read rather than assumed.
   *
   * The one-argument form builds `PayVariableLoyaltyCost`, the "-X" abilities.
   * `Cost` has no member for a cost the player chooses that then becomes X, so
   * those refuse.
   */
  'xmage:LoyaltyAbility': (ability) => {
    const n = int(ability.via, 'loyalty');
    if (n === undefined) return null;
    if (n === 0) return [];
    return n > 0
      ? [{ pay: 'add-counters', counter: 'loyalty', count: n, to: { sel: 'self' } }]
      : [{ pay: 'remove-counters', counter: 'loyalty', count: -n, from: { sel: 'self' } }];
  },
};

/** The equip cost, which a card file gives either as a `Cost` or as a bare int. */
function equipCost(ability: AbilityRecord): Cost[] | null {
  const asInt = int(ability.via, 'cost');
  if (asInt !== undefined) return [{ pay: 'mana', cost: `{${asInt}}` }];
  const lowered = lowerCosts(ability.costs);
  return lowered.ok && lowered.costs.length > 0 ? lowered.costs : null;
}

/**
 * XMage's mana-cost classes, which do NOT live in the extraction's cost list.
 *
 * `COST_RULES` already knows how to lower each of these. The problem this set
 * solves is finding them at all.
 */
const MANA_COST_PRIMS = new Set<PrimId>([
  'xmage:ManaCostsImpl',
  'xmage:GenericManaCost',
  'xmage:ColoredManaCost',
  'xmage:VariableManaCost',
  'xmage:MonoHybridManaCost',
  'xmage:HybridManaCost',
]);

/**
 * EVERY cost of an activated or mana ability, including the mana.
 *
 * ## The bug this exists to close
 *
 * XMage registers an ability's non-mana costs one at a time
 * (`ability.addCost(new TapSourceCost())`) and the extraction collects those
 * into `AbilityRecord.costs`. It passes the MANA cost a different way, as a
 * constructor argument:
 *
 *     new SimpleActivatedAbility(new DestroyTargetEffect(true), new ManaCostsImpl("{2}{B}"))
 *
 * so the mana is in `ability.via.args` and never in `ability.costs`. Reading
 * only the list drops it. Notorious Assassin prints "{2}{B}, {T}, Discard a
 * card" and lowered to tap plus discard; Aboshan, Cephalid Emperor lowered to
 * no cost at all. `scratch/refute/cost-gap.mjs` counted it over the whole
 * extraction: of 13,823 activated and mana abilities, 2,004 carry their mana in
 * the cost list and **5,005 carry it only in the constructor argument**.
 *
 * Adding it rather than refusing, because unlike the intervening if above there
 * is somewhere for it to go: `COST_RULES` has lowered `ManaCostsImpl` since the
 * day costs were written, and the value is right there resolved. Refusing here
 * would throw away 5,005 abilities to avoid a bug that has a two-line fix.
 *
 * Only the mana classes are lifted, and only when the list does not already
 * carry one, so an ability whose cost list is already complete is untouched and
 * nothing can be charged twice.
 */
function activationCostsOf(ability: AbilityRecord): Invocation[] {
  if ((ability.costs ?? []).some((c) => MANA_COST_PRIMS.has(c.prim))) return [...ability.costs];
  const fromArgs: Invocation[] = [];
  for (const slot of ability.via.args ?? []) {
    const value = slot.value;
    if (value?.k === 'invoke' && MANA_COST_PRIMS.has(value.invocation.prim)) {
      fromArgs.push(value.invocation);
    }
  }
  // Mana first, the order the card prints it in.
  return [...fromArgs, ...(ability.costs ?? [])];
}

/* ------------------------------------------------------------------ *
 * Lowering
 * ------------------------------------------------------------------ */

/**
 * All or nothing. See the header for why.
 */
export function lowerAbility(
  ability: AbilityRecord,
  record: CardRecord,
  table: Record<PrimId, Lowering> = LOWERINGS,
): LowerResult {
  // An ability XMage built through a shared static helper is one the extraction
  // sees only partly. `OverloadAbility.implementOverloadAbility` adds BOTH the
  // overload ability and the spell's own base cast mode, and the record holds
  // only the first, so Cyclonic Rift comes out as an activated bounce with no
  // way to cast it for {1}{U}. Lowering that would produce a card that runs and
  // is wrong, which is worse than a card that refuses. 35 abilities across the
  // corpus arrive this way.
  if (ability.fromHelper) {
    return fail(
      [`helper:${ability.fromHelper}`],
      [{ prim: ability.via.prim, why: 'built by a static helper that adds abilities the record does not hold' }],
    );
  }

  // An adjuster is a Java object XMage attaches to an ability that rewrites its
  // targets or its cost AT CAST TIME. The record holds the adjuster's class
  // name and nothing about what it does, so an ability carrying one is an
  // ability whose target count or cost the record does not actually know.
  //
  // Word of Binding is the card that showed this. "Tap X target creatures"
  // arrives as one `TargetCreaturePermanent` with no counts plus
  // `setTargetAdjuster(new XTargetsCountAdjuster())`, and it was lowering to a
  // spell that taps exactly one creature. It ran, it tapped something, and it
  // was wrong. Same failure class as Cyclonic Rift and found the same way, by
  // walking a real card through.
  const adjuster = (ability.via.mods ?? []).find(
    (m) => m.m === 'setTargetAdjuster' || m.m === 'setCostAdjuster',
  );
  if (adjuster) {
    return fail(
      [`adjuster:${adjuster.args?.[0]?.value?.k === 'invoke' ? adjuster.args[0].value.invocation.prim : adjuster.m}`],
      [
        {
          prim: ability.via.prim,
          why: `${adjuster.m} rewrites the ability's targets or cost when it is cast, and the record holds only the adjuster's name`,
        },
      ],
    );
  }

  // An ability whose meaning is entirely in its XMage class, where the record's
  // own effect and cost lists are empty because the source puts them on a
  // superclass. Checked first, because the generic path would read those empty
  // lists as an ability that does nothing and call it lowered.
  const rule = ABILITY_RULES[ability.via.prim];
  if (rule) return rule(ability, record);

  if (ability.kind === 'keyword') {
    const lowered = lowerKeywordAbility(ability);
    if (!lowered.ok) {
      return fail([lowered.missing ?? ability.via.prim], [{ prim: ability.via.prim, why: lowered.why ?? '' }]);
    }
    return { ok: true, ability: lowered.ability as KeywordAbility, effects: [], missing: [], refused: [] };
  }

  if (ability.kind === 'static') return lowerStatic(ability);

  // A replacement ability changes an event before it happens. There is no table
  // from XMage's replacement classes to `ReplacementResult` yet, so these are
  // BLOCKED rather than run through the static path, which would apply them at
  // the wrong time.
  if (ability.kind === 'replacement') {
    return fail([ability.via.prim], [{ prim: ability.via.prim, why: 'no replacement-effect table yet' }]);
  }

  return lowerResolving(ability, record, table);
}

/**
 * A static ability: what it continuously changes, and what it applies to.
 *
 * An ability that produced no modifications and reported success would be the
 * exact failure `verify-ability-coverage.mjs` downgrades 612 cards for. So an
 * empty result is a refusal and `via.prim` names what has to be written.
 */
function lowerStatic(ability: AbilityRecord): LowerResult {
  if (ability.effects.length === 0) {
    // Same reasoning as the resolving path: no effect list means the effect is
    // a class the card declares itself, and naming that class keeps one card's
    // worth of work out of the shared work order.
    const local = localHoleIn(ability.via);
    return fail(
      [local ?? ability.via.prim],
      [
        {
          prim: ability.via.prim,
          why: local
            ? `the effect is a class this card declares itself (${local.replace(/^local:/, '')})`
            : 'static ability with no extracted effect',
        },
      ],
    );
  }
  const lowered = lowerModifications(ability.effects);
  if (!lowered.ok) return fail(lowered.missing, lowered.refused);
  if (lowered.sets.length === 0) {
    return fail([ability.via.prim], [{ prim: ability.via.prim, why: 'static ability lowered to no modifications' }]);
  }
  // One `StaticAbility` carries one `affects`. A card that boosts your
  // creatures AND grants them an ability has one set of objects and two
  // modifications, which is fine. A card whose two effects change DIFFERENT
  // sets cannot be one ability, and merging them would apply each modification
  // to both sets, so it refuses rather than merging.
  const first = lowered.sets[0];
  const sameObjects = lowered.sets.every((s) => JSON.stringify(s.affects) === JSON.stringify(first.affects));
  if (!sameObjects) {
    return fail(
      [ability.via.prim],
      [
        {
          prim: ability.via.prim,
          why: 'one static ability changing two different sets of objects; splitting it into two abilities is not modelled',
        },
      ],
    );
  }
  const zone = arg(ability.via, 'zone')?.value;
  const result: StaticAbility = {
    id: ability.id,
    text: '',
    confidence: 'exact',
    kind: 'static',
    affects: first.affects,
    modifications: lowered.sets.flatMap((s) => s.modifications),
  };
  if (zone?.k === 'zone') result.activeZones = [zone.zone];
  return { ok: true, ability: result, effects: [], missing: [], refused: [] };
}

/** A spell, triggered, activated or mana ability: something that resolves. */
function lowerResolving(
  ability: AbilityRecord,
  record: CardRecord,
  table: Record<PrimId, Lowering>,
): LowerResult {
  const effects: Effect[] = [];
  const missing: PrimId[] = [];
  const refused: Array<{ prim: PrimId; why: string }> = [];

  const runList = (list: Invocation[], targets: Invocation[]): Effect[] => {
    const out: Effect[] = [];
    for (const invocation of list) {
      const why = REFUSED_EFFECTS[invocation.prim];
      if (why) {
        missing.push(invocation.prim);
        refused.push({ prim: invocation.prim, why });
        continue;
      }
      const lowering = table[invocation.prim];
      if (!lowering) {
        missing.push(invocation.prim);
        continue;
      }
      const produced = lowering(invocation, { ability, record, targets });
      if (produced === null) {
        refused.push({ prim: invocation.prim, why: describeUnresolved(invocation) });
        continue;
      }
      out.push(...produced);
    }
    return out;
  };

  if (ability.effects.length === 0 && (ability.modes ?? []).length === 0) {
    // An ability with no effect list almost always has ONE reason: its effect
    // is a class the card file declares itself, so the extraction has no node
    // for it and the hole sits in the ability's own argument list instead.
    //
    // Reporting `xmage:SimpleActivatedAbility` here put that class at the head
    // of the work order after this port, at 1,839 cards, which read as one
    // lowering worth 1,839 cards. It is not: it is 1,839 separate Java classes
    // that exist once each. Naming the local class instead keeps the two kinds
    // of work apart, which is the entire reason `PrimId` prefixes them
    // differently.
    const local = localHoleIn(ability.via);
    return fail(
      [local ?? ability.via.prim],
      [
        {
          prim: ability.via.prim,
          why: local
            ? `the effect is a class this card declares itself (${local.replace(/^local:/, '')})`
            : 'ability has no extracted effects',
        },
      ],
    );
  }

  const targetsResult = lowerTargets(ability.targets);
  if (!targetsResult.ok) {
    missing.push(...targetsResult.missing);
    refused.push(...targetsResult.refused);
  }

  if (ability.modes && ability.modes.length > 0) {
    // `text` is left empty on purpose. A mode's printed words are Wizards of the
    // Coast rules text, which is not XMage's to license and is never copied out
    // of the extraction; the renderer fills it from Scryfall's `oracle_text` at
    // display time. An empty string here is a hole the renderer fills, not a
    // claim that the mode has no text.
    const modes = ability.modes.map((mode: ModeRecord) => ({
      text: '',
      effects: runList(mode.effects, mode.targets),
    }));
    const limits = ability.modeLimits ?? { min: 1, max: 1 };
    effects.push({ do: 'choose-mode', min: limits.min, max: limits.max, modes });
  } else {
    effects.push(...runList(ability.effects, ability.targets));
  }

  /*
   * AN INTERVENING IF REFUSES THE ABILITY. Widened 23 Aug 2026.
   *
   * It used to refuse only the case where the condition slot did not resolve,
   * on the reasoning that a resolved one could be carried through. It could
   * not. There is no mapping from an XMage `Condition` to a `dsl.ts` one —
   * PORT-LOG.md's own work order still lists it as 602 cards of unstarted work,
   * "167 distinct condition classes ... `{do:"if"}` exists; the mapping does
   * not" — so the resolved condition had nowhere to go. What the lowering did
   * with it was set `interveningIf: true`, a boolean, and the engine gates on a
   * different field: `dslConditionHolds` in `trigger-bridge.ts` reads
   * `ability.condition` and returns true when it is absent. Nothing in
   * `src/lib/game` reads `interveningIf` at all.
   *
   * So the guard read as a safety net and was the opposite of one: the
   * conditions it let through were exactly the ones the extractor UNDERSTOOD,
   * and they were then dropped. "At the beginning of your upkeep, if you have
   * exactly 1 life, you win the game" lowered to "at the beginning of your
   * upkeep, you win the game".
   *
   * Refusing is the safe half and the one this file already applies to costs
   * for the same reason: a card that does nothing is `silent-noted`, which the
   * app says out loud, while a card that runs the wrong half says nothing. When
   * the condition table exists this becomes a lowering rather than a refusal,
   * and the ability comes back with a real `condition`.
   */
  if (ability.interveningIf) {
    refused.push({
      prim: ability.via.prim,
      why:
        ability.interveningIf.value === undefined
          ? 'intervening if condition did not resolve'
          : 'intervening if condition has no dsl.ts equivalent to lower into',
    });
  }

  let trigger: ReturnType<typeof lowerTrigger> | null = null;
  if (ability.kind === 'triggered') {
    trigger = lowerTrigger(ability);
    if (!trigger.ok) {
      // `missing` only when the trigger CLASS has no entry. A class that has one
      // and refused these arguments is a hole in this card, not work to be done
      // on a primitive, and putting it in the work order would rank a table
      // entry that already exists.
      if (trigger.missing) missing.push(trigger.missing);
      refused.push({ prim: ability.via.prim, why: trigger.why ?? 'trigger did not resolve' });
    }
  }

  let costs: Cost[] = [];
  const fromClass = ABILITY_COSTS[ability.via.prim];
  if (fromClass) {
    const produced = fromClass(ability);
    if (produced === null) {
      missing.push(ability.via.prim);
      refused.push({ prim: ability.via.prim, why: 'the activation cost this class builds is not expressible' });
    } else {
      costs = produced;
    }
  } else if (ability.kind === 'activated' || ability.kind === 'mana') {
    const lowered = lowerCosts(activationCostsOf(ability));
    if (!lowered.ok) {
      missing.push(...lowered.missing);
      refused.push(...lowered.refused);
    }
    costs = lowered.costs;
    // An activated ability with no cost at all is an extraction gap far more
    // often than it is a free ability, so it refuses rather than being emitted
    // as free. Mana abilities whose cost lives on a superclass are handled by
    // `ABILITY_RULES` above and never reach here.
    if (costs.length === 0) {
      const local = localHoleIn(ability.via);
      if (local) missing.push(local);
      refused.push({
        prim: ability.via.prim,
        why: local
          ? `the cost is a class this card declares itself (${local.replace(/^local:/, '')})`
          : 'activated ability with no extracted cost',
      });
    }
  }

  // A COST THE LOWERED ABILITY HAS NOWHERE TO PUT.
  //
  // Found by walking three named cards through after this lowering was wired
  // into the shipped compiler, which is the only reason it was found at all.
  // `ability.costs` is read above for `activated` and `mana`, because
  // `ActivatedAbility` and `ManaAbility` have a `costs` field. `SpellAbility`
  // and `TriggeredAbility` do not, so the branch below simply never looked, and
  // an additional cast cost was dropped without a word:
  //
  //   Raze                  "sacrifice a land" -> destroys a land for free
  //   Harvest Pyre          "exile X cards from your graveyard" -> X is nothing,
  //                         so it deals 0 damage and still resolves
  //   Thunderherd Migration "reveal a Dinosaur or pay {1}" -> neither
  //
  // Every one of those RAN and was wrong, which PORT-LOG.md section 7 already
  // names as worse than a card that refuses. 304 spell abilities and 99
  // triggered ones across the corpus carry a cost this way.
  //
  // The blocker is the record shape rather than a missing table entry, so the
  // work order gets `dsl:` and not `xmage:`. Naming a cost primitive here would
  // rank a lowering that already exists and would still have nowhere to write
  // its answer.
  if ((ability.kind === 'spell' || ability.kind === 'triggered') && (ability.costs ?? []).length > 0) {
    missing.push(`dsl:${ability.kind === 'spell' ? 'SpellAbility' : 'TriggeredAbility'}.costs`);
    refused.push({
      prim: ability.via.prim,
      why: `the card declares an additional cost (${(ability.costs ?? []).map((c) => c.prim).join(', ')}) and this ability shape has no cost list to carry it`,
    });
  }

  if (missing.length > 0 || refused.length > 0) return fail(missing, refused);

  const base = { id: ability.id, text: '', confidence: 'exact' as const };
  const targets: TargetSpec[] = targetsResult.specs;

  // A TARGET REF POINTING AT NOTHING.
  //
  // Also found by a named card: Dawnbringer Cleric, "choose one — ... Destroy
  // target enchantment. ... Exile target card from a graveyard." A modal
  // ability keeps its targets on each MODE, `lowerTargets(ability.targets)`
  // reads the ability's own empty list, and each mode's effects still came out
  // holding `{sel:'target', ref:0}`. The result was an ability announcing no
  // targets whose effects all read target zero.
  //
  // That is not a near miss. An effect reading an unbound ref either does
  // nothing or hits whatever happens to be at index zero, and both of those are
  // a card that resolved and lied. Checked structurally, on the finished
  // ability, so it catches any other shape that loses a spec the same way
  // rather than just this one.
  const dangling = danglingTargetRef(effects, targets);
  if (dangling !== null) {
    return fail(
      [`dangling-target-ref:${ability.via.prim}`],
      [
        {
          prim: ability.via.prim,
          why: `an effect reads target ref ${dangling} and the ability announces no such target`,
        },
      ],
    );
  }

  if (ability.kind === 'triggered' && trigger?.event) {
    const lowered: TriggeredAbility = { ...base, kind: 'triggered', event: trigger.event, effects };
    if (targets.length > 0) lowered.targets = targets;
    if (trigger.optional) lowered.optional = true;
    /* No `interveningIf` marker is set here any more, and the line that set one
     * is gone rather than commented out. An ability carrying an intervening if
     * is refused above, so this point is unreachable for one; and the marker was
     * a boolean no consumer in `src/lib/game` ever read, which is what made the
     * dropped condition invisible. If it comes back it comes back as
     * `condition`, the field the engine actually gates on. */
    return { ok: true, ability: lowered, effects, missing: [], refused: [] };
  }
  if (ability.kind === 'activated') {
    const lowered: ActivatedAbility = { ...base, kind: 'activated', costs, effects };
    if (targets.length > 0) lowered.targets = targets;
    if (ability.via.prim === 'xmage:LoyaltyAbility') {
      lowered.isLoyalty = true;
      lowered.timing = 'sorcery';
      lowered.limit = { per: 'turn', count: 1 };
    }
    return { ok: true, ability: lowered, effects, missing: [], refused: [] };
  }
  if (ability.kind === 'mana') {
    const lowered: ManaAbility = { ...base, kind: 'mana', costs, effects };
    return { ok: true, ability: lowered, effects, missing: [], refused: [] };
  }
  const lowered: SpellAbility = { ...base, kind: 'spell', effects };
  if (targets.length > 0) lowered.targets = targets;
  return { ok: true, ability: lowered, effects, missing: [], refused: [] };
}

/**
 * The first target ref an effect tree reads that the ability does not announce,
 * or `null` when every ref has a spec.
 *
 * Walks the whole tree rather than the top level, because `choose-mode`,
 * `if`, `for-each`, `repeat`, `may` and `unless-pays` all nest effects and the
 * card that found this bug hid its refs three levels down inside modes.
 */
function danglingTargetRef(effects: readonly Effect[], specs: readonly TargetSpec[]): number | null {
  const announced = new Set(specs.map((s) => s.ref));
  let found: number | null = null;

  const walk = (node: unknown): void => {
    if (found !== null) return;
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.sel === 'target' && typeof record.ref === 'number' && !announced.has(record.ref)) {
      found = record.ref;
      return;
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(effects);

  return found;
}

/**
 * The card-local class an ability's own arguments name, as a `local:` primitive
 * id, or `undefined`.
 *
 * A `local:` id buys one card and an `xmage:` id buys every card that uses it.
 * They must never be totalled together, and this is what stops an ability whose
 * effect is card-local from being counted as a shared primitive.
 */
function localHoleIn(invocation: Invocation): PrimId | undefined {
  for (const slot of invocation.args) {
    if (slot.hole?.localName) return `local:${slot.hole.localName}`;
  }
  return undefined;
}

function describeUnresolved(invocation: Invocation): string {
  const bad = invocation.args.filter((slot: Slot) => slot.value === undefined);
  if (bad.length === 0) return 'arguments resolved but not in a shape this lowering handles';
  return bad
    .map((slot: Slot) => {
      const label = slot.name ?? '(unnamed)';
      if (slot.hole) {
        return `${label}: ${slot.hole.reason}${slot.hole.localName ? ` (${slot.hole.localName})` : ''}`;
      }
      return `${label}: not lowered`;
    })
    .join('; ');
}

/**
 * Every ability of every face, or the reason the card cannot be run.
 *
 * A card is runnable only when EVERY ability of every face lowers. This is the
 * rule the 59.26% figure in `dsl-coverage.latest.json` got wrong: it counted a
 * card as automated when ONE of its abilities compiled, which measures the
 * compiler and not the game. A card whose first ability runs and whose second
 * does nothing is a card that misleads a player mid-game.
 */
export function lowerCard(
  record: CardRecord,
  table: Record<PrimId, Lowering> = LOWERINGS,
): LowerCardResult {
  const abilities: Array<{ id: string; effects: Effect[]; ability?: Ability }> = [];
  const blocked: Array<{ id: string; result: LowerResult }> = [];
  for (const ability of abilitiesOf(record)) {
    const result = lowerAbility(ability, record, table);
    if (result.ok) abilities.push({ id: ability.id, effects: result.effects, ability: result.ability });
    else blocked.push({ id: ability.id, result });
  }
  // A card with no abilities is vacuously runnable, and that is a true but
  // useless fact about 350 vanilla creatures. It is flagged rather than merged
  // into the playable count, because "the engine runs this card" and "this card
  // does nothing" are different claims and only one of them is progress.
  return {
    ok: blocked.length === 0,
    vacuous: blocked.length === 0 && abilities.length === 0,
    abilities,
    blocked,
  };
}

/**
 * Which primitives block the most cards, over any set of records.
 *
 * This is the work order, and it is generated rather than maintained. Each
 * entry says how many cards would become runnable if that one lowering existed
 * and nothing else changed, so the grind can stop when the return per primitive
 * falls off instead of stopping when somebody gets bored.
 */
export function missingPrimitiveRanking(
  records: readonly CardRecord[],
  table: Record<PrimId, Lowering> = LOWERINGS,
): Array<{ prim: PrimId; cards: number }> {
  const counts = new Map<PrimId, Set<string>>();
  for (const record of records) {
    for (const ability of abilitiesOf(record)) {
      const result = lowerAbility(ability, record, table);
      if (result.ok) continue;
      for (const prim of result.missing) {
        if (!counts.has(prim)) counts.set(prim, new Set());
        counts.get(prim)!.add(record.oracleId);
      }
    }
  }
  return [...counts.entries()]
    .map(([prim, ids]) => ({ prim, cards: ids.size }))
    .sort((a, b) => b.cards - a.cards);
}

/** The `Ability` shapes a lowered record produces. Re-exported so callers need one import. */
export type { Ability };
