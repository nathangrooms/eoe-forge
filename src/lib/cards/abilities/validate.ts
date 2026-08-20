/**
 * Runtime validation of UNTRUSTED ability JSON against the DSL.
 *
 * `dsl.ts` is a type space, and TypeScript types are erased. A `CardAbilities`
 * that arrived from a model, a hand edit, or a `jsonb` column has had no contact
 * with the compiler and satisfies nothing. This file is the only thing standing
 * between such a value and the engine.
 *
 * ## Three properties, each chosen because the alternative loses meaning
 *
 * 1. **No coercion, ever.** `"3"` is not `3` and a validator that quietly makes
 *    it one has invented a number. Every mismatch is an error with a path.
 * 2. **Unknown keys are errors.** This is the one that actually catches models.
 *    `{do:'draw', who:…, count:2, target:{…}}` is a *valid* draw effect under a
 *    permissive validator, and the `target` the author meant is silently gone.
 *    Rejecting unknown keys turns "meaning dropped on the floor" into a loud
 *    failure, which is the entire contract of this folder one level up.
 * 3. **Errors accumulate.** A single first error tells you a card failed; the
 *    full list tells you *which grammar member the model keeps reaching for*,
 *    and that is a ranked build list for free.
 *
 * ## What it does NOT do
 *
 * It does not check that the DSL means what the oracle text says. A perfectly
 * shaped `{do:'draw', count:7}` on a card that draws one is schema-valid and
 * catastrophically wrong. That is `roundtrip.ts`'s job, and it is the reason
 * schema validation alone is never enough to accept model output.
 */

import type {
  Ability,
  CardFilter,
  Condition,
  Cost,
  Effect,
  Modification,
  PlayerSelector,
  ReplaceableEvent,
  ReplacementResult,
  Restriction,
  Selector,
  TargetSpec,
  TokenSpec,
  TriggerEvent,
  UnparsedClause,
  ValueExpr,
  WatchQuery,
  WatchedEvent,
} from './dsl.ts';

/* ------------------------------------------------------------------ *
 * The combinator kernel
 * ------------------------------------------------------------------ */

export interface ValidationError {
  path: string;
  message: string;
}

/** Pushes onto `errs` and returns `undefined` on failure. Never throws. */
type Check<T> = (value: unknown, path: string, errs: ValidationError[]) => T | undefined;

const bad = (errs: ValidationError[], path: string, message: string): undefined => {
  errs.push({ path, message });
  return undefined;
};

const shapeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') {
    const tag = ['do', 'sel', 'is', 'v', 'if', 'pay', 'on', 'layer', 'who', 'saw', 'rule', 'kind'].find(
      (k) => typeof (value as Record<string, unknown>)[k] === 'string',
    );
    return tag ? `object with ${tag}=${JSON.stringify((value as Record<string, unknown>)[tag])}` : 'object';
  }
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
};

const isNumber: Check<number> = (v, p, e) =>
  typeof v === 'number' && Number.isFinite(v) ? v : bad(e, p, `expected a finite number, got ${shapeOf(v)}`);

const isInt: Check<number> = (v, p, e) =>
  typeof v === 'number' && Number.isInteger(v) ? v : bad(e, p, `expected an integer, got ${shapeOf(v)}`);

const isString: Check<string> = (v, p, e) =>
  typeof v === 'string' ? v : bad(e, p, `expected a string, got ${shapeOf(v)}`);

/** A string that carries meaning. `""` as a counter kind or a keyword is a bug. */
const isNonEmptyString: Check<string> = (v, p, e) =>
  typeof v === 'string' && v.trim() !== '' ? v : bad(e, p, `expected a non-empty string, got ${shapeOf(v)}`);

const isBool: Check<boolean> = (v, p, e) =>
  typeof v === 'boolean' ? v : bad(e, p, `expected a boolean, got ${shapeOf(v)}`);

const isEnum = <T extends string>(allowed: readonly T[]): Check<T> => {
  const set = new Set<string>(allowed);
  return (v, p, e) =>
    typeof v === 'string' && set.has(v)
      ? (v as T)
      : bad(e, p, `expected one of ${allowed.join(' | ')}, got ${shapeOf(v)}`);
};

const isArrayOf = <T>(item: Check<T>, minLength = 0): Check<T[]> => (v, p, e) => {
  if (!Array.isArray(v)) return bad(e, p, `expected an array, got ${shapeOf(v)}`);
  if (v.length < minLength) return bad(e, p, `expected at least ${minLength} entries, got ${v.length}`);
  const out: T[] = [];
  let ok = true;
  v.forEach((entry, i) => {
    const checked = item(entry, `${p}[${i}]`, e);
    if (checked === undefined) ok = false;
    else out.push(checked);
  });
  return ok ? out : undefined;
};

interface FieldSpec {
  check: Check<unknown>;
  optional?: boolean;
}

const req = (check: Check<unknown>): FieldSpec => ({ check });
const opt = (check: Check<unknown>): FieldSpec => ({ check, optional: true });

/**
 * An object with a fixed key set. Unknown keys are ERRORS — see the header.
 * `tagKey` is validated by the dispatcher above, and is re-listed here so it is
 * not itself reported as unknown.
 */
function object<T>(fields: Record<string, FieldSpec>, tagKey?: string): Check<T> {
  const known = new Set(Object.keys(fields));
  if (tagKey) known.add(tagKey);
  return (v, p, e) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return bad(e, p, `expected an object, got ${shapeOf(v)}`);
    }
    const source = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let ok = true;

    for (const key of Object.keys(source)) {
      if (!known.has(key)) {
        bad(e, `${p}.${key}`, `unknown field — the DSL has no such property here`);
        ok = false;
      }
    }
    for (const [key, spec] of Object.entries(fields)) {
      const raw = source[key];
      if (raw === undefined || raw === null) {
        if (!spec.optional) {
          bad(e, `${p}.${key}`, 'required field is missing');
          ok = false;
        }
        continue;
      }
      const checked = spec.check(raw, `${p}.${key}`, e);
      if (checked === undefined) ok = false;
      else out[key] = checked;
    }
    if (tagKey && typeof source[tagKey] === 'string') out[tagKey] = source[tagKey];
    return ok ? (out as T) : undefined;
  };
}

/** Tagged union dispatch. The tag value is the error message when it is wrong. */
function union<T>(tagKey: string, variants: Record<string, Check<unknown>>, label: string): Check<T> {
  const tags = Object.keys(variants);
  return (v, p, e) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return bad(e, p, `expected a ${label} object, got ${shapeOf(v)}`);
    }
    const tag = (v as Record<string, unknown>)[tagKey];
    if (typeof tag !== 'string') return bad(e, p, `${label} is missing its "${tagKey}" tag`);
    const variant = variants[tag];
    if (!variant) {
      return bad(e, `${p}.${tagKey}`, `unknown ${label} "${tag}" — not a member of the DSL`);
    }
    return variant(v, p, e) as T | undefined;
  };
}

/** One of two disjoint unions, e.g. `Selector | PlayerSelector`. */
const either = <A, B>(a: Check<A>, b: Check<B>, aTag: string, bTag: string, label: string): Check<A | B> =>
  (v, p, e) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      return bad(e, p, `expected a ${label}, got ${shapeOf(v)}`);
    }
    const source = v as Record<string, unknown>;
    if (typeof source[aTag] === 'string') return a(v, p, e);
    if (typeof source[bTag] === 'string') return b(v, p, e);
    return bad(e, p, `expected a ${label} — needs a "${aTag}" or "${bTag}" tag`);
  };

/* ------------------------------------------------------------------ *
 * The vocabularies. Exported so `llm-validation.test.ts` can prove the
 * prompt the model is given and the grammar we accept are the same set.
 * ------------------------------------------------------------------ */

export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'stack'] as const;
export const STEPS = [
  'untap', 'upkeep', 'draw', 'precombat_main', 'begin_combat', 'declare_attackers',
  'declare_blockers', 'combat_damage', 'end_combat', 'postcombat_main', 'end', 'cleanup',
] as const;
export const CMPS = ['lt', 'lte', 'eq', 'gte', 'gt', 'ne'] as const;
export const DURATIONS = ['end-of-turn', 'your-next-turn', 'while-source-on-battlefield', 'permanent'] as const;
export const GAP_REASONS = [
  'copy-layer', 'alt-cast', 'granted-ability', 'layer-dependency', 'state-trigger', 'duration',
  'hidden-choice', 'needs-history', 'outside-game', 'meta-replacement', 'complex-combat', 'stale',
  'unrecognised', 'ambiguous', 'multi-face',
] as const;

const manaColor = isEnum(MANA_COLORS);
const zone = isEnum(ZONES);
const step = isEnum(STEPS);
const cmp = isEnum(CMPS);
const duration = isEnum(DURATIONS);

/* ------------------------------------------------------------------ *
 * Selectors, filters, players — mutually recursive, hence the thunks
 * ------------------------------------------------------------------ */

const selector: Check<Selector> = (v, p, e) => selectorImpl(v, p, e);
const cardFilter: Check<CardFilter> = (v, p, e) => cardFilterImpl(v, p, e);
const playerSelector: Check<PlayerSelector> = (v, p, e) => playerSelectorImpl(v, p, e);
const valueExpr: Check<ValueExpr> = (v, p, e) => valueExprImpl(v, p, e);
const condition: Check<Condition> = (v, p, e) => conditionImpl(v, p, e);
const effect: Check<Effect> = (v, p, e) => effectImpl(v, p, e);

const selectorImpl = union<Selector>('sel', {
  self: object({}, 'sel'),
  none: object({}, 'sel'),
  each: object({}, 'sel'),
  target: object({ ref: req(isInt) }, 'sel'),
  'trigger-source': object({}, 'sel'),
  'trigger-subject': object({}, 'sel'),
  attached: object({}, 'sel'),
  all: object({ where: req(cardFilter), zone: opt(zone), controller: opt(playerSelector) }, 'sel'),
}, 'selector');

const cardFilterImpl = union<CardFilter>('is', {
  type: object({ value: req(isNonEmptyString) }, 'is'),
  subtype: object({ value: req(isNonEmptyString) }, 'is'),
  supertype: object({ value: req(isNonEmptyString) }, 'is'),
  name: object({ value: req(isNonEmptyString) }, 'is'),
  keyword: object({ value: req(isNonEmptyString) }, 'is'),
  color: object({ value: req(manaColor) }, 'is'),
  colorless: object({}, 'is'),
  multicolored: object({}, 'is'),
  tapped: object({}, 'is'),
  untapped: object({}, 'is'),
  attacking: object({}, 'is'),
  blocking: object({}, 'is'),
  blocked: object({}, 'is'),
  token: object({}, 'is'),
  commander: object({}, 'is'),
  other: object({}, 'is'),
  any: object({}, 'is'),
  'has-counter': object({ counter: req(isNonEmptyString), atLeast: opt(isInt) }, 'is'),
  power: object({ cmp: req(cmp), value: req(valueExpr) }, 'is'),
  toughness: object({ cmp: req(cmp), value: req(valueExpr) }, 'is'),
  'mana-value': object({ cmp: req(cmp), value: req(valueExpr) }, 'is'),
  not: object({ of: req(cardFilter) }, 'is'),
  and: object({ of: req(isArrayOf(cardFilter, 1)) }, 'is'),
  or: object({ of: req(isArrayOf(cardFilter, 1)) }, 'is'),
}, 'card filter');

const playerSelectorImpl = union<PlayerSelector>('who', {
  you: object({}, 'who'),
  'each-opponent': object({}, 'who'),
  'each-player': object({}, 'who'),
  active: object({}, 'who'),
  defending: object({}, 'who'),
  monarch: object({}, 'who'),
  'trigger-player': object({}, 'who'),
  'target-player': object({ ref: req(isInt) }, 'who'),
  'controller-of': object({ of: req(selector) }, 'who'),
  'owner-of': object({ of: req(selector) }, 'who'),
}, 'player selector');

/* ------------------------------------------------------------------ *
 * Watchers
 * ------------------------------------------------------------------ */

const watchedEvent = union<WatchedEvent>('saw', {
  'spell-cast': object({ what: opt(cardFilter), by: opt(playerSelector) }, 'saw'),
  'land-played': object({ by: opt(playerSelector) }, 'saw'),
  died: object({ what: opt(cardFilter), controller: opt(playerSelector) }, 'saw'),
  entered: object({ what: opt(cardFilter), controller: opt(playerSelector) }, 'saw'),
  attacked: object({ what: opt(cardFilter), controller: opt(playerSelector) }, 'saw'),
  'token-created': object({ by: opt(playerSelector) }, 'saw'),
  drew: object({ by: opt(playerSelector) }, 'saw'),
  'gained-life': object({ by: opt(playerSelector) }, 'saw'),
  'lost-life': object({ by: opt(playerSelector) }, 'saw'),
  'dealt-damage': object({ by: opt(playerSelector), to: opt(isEnum(['player', 'permanent', 'any'] as const)) }, 'saw'),
}, 'watched event');

const watchQuery = object<WatchQuery>({
  event: req(watchedEvent),
  window: req(isEnum(['this-turn', 'this-game'] as const)),
  measure: req(isEnum(['events', 'amount'] as const)),
});

/* ------------------------------------------------------------------ *
 * Values and conditions
 * ------------------------------------------------------------------ */

const valueExprObject = union<Exclude<ValueExpr, number>>('v', {
  x: object({}, 'v'),
  count: object({ of: req(selector) }, 'v'),
  'count-players': object({ of: req(playerSelector) }, 'v'),
  power: object({ of: req(selector) }, 'v'),
  toughness: object({ of: req(selector) }, 'v'),
  'mana-value': object({ of: req(selector) }, 'v'),
  counters: object({ of: req(selector), counter: req(isNonEmptyString) }, 'v'),
  life: object({ of: req(playerSelector) }, 'v'),
  'cards-in': object({ zone: req(zone), of: req(playerSelector) }, 'v'),
  add: object({ of: req(isArrayOf(valueExpr, 1)) }, 'v'),
  sub: object({ a: req(valueExpr), b: req(valueExpr) }, 'v'),
  mul: object({ of: req(isArrayOf(valueExpr, 1)) }, 'v'),
  div: object({ a: req(valueExpr), b: req(valueExpr) }, 'v'),
  min: object({ of: req(isArrayOf(valueExpr, 1)) }, 'v'),
  max: object({ of: req(isArrayOf(valueExpr, 1)) }, 'v'),
  if: object({ condition: req(condition), then: req(valueExpr), else: req(valueExpr) }, 'v'),
  watch: object({ query: req(watchQuery) }, 'v'),
}, 'value expression');

function valueExprImpl(v: unknown, p: string, e: ValidationError[]): ValueExpr | undefined {
  if (typeof v === 'number') return isNumber(v, p, e);
  if (typeof v === 'string') {
    // The single most common model mistake, and the most dangerous: "2" reads as
    // a number to a human and as NaN to `evalValue`. Named explicitly so the
    // failure histogram distinguishes it from a structural error.
    return bad(e, p, `numbers must be numbers, not strings — got ${JSON.stringify(v)}`);
  }
  return valueExprObject(v, p, e);
}

const conditionImpl = union<Condition>('if', {
  count: object({ of: req(selector), cmp: req(cmp), value: req(valueExpr) }, 'if'),
  value: object({ a: req(valueExpr), cmp: req(cmp), b: req(valueExpr) }, 'if'),
  controls: object({ who: req(playerSelector), what: req(cardFilter), cmp: req(cmp), value: req(valueExpr) }, 'if'),
  step: object({ is: req(isArrayOf(step, 1)) }, 'if'),
  'your-turn': object({}, 'if'),
  'first-time-this-turn': object({ key: req(isNonEmptyString) }, 'if'),
  not: object({ of: req(condition) }, 'if'),
  and: object({ of: req(isArrayOf(condition, 1)) }, 'if'),
  or: object({ of: req(isArrayOf(condition, 1)) }, 'if'),
}, 'condition');

/* ------------------------------------------------------------------ *
 * Costs, tokens, mana restrictions
 * ------------------------------------------------------------------ */

/**
 * A mana cost string. Loose on purpose about which symbols exist — hybrid,
 * Phyrexian and snow all spell differently — but strict that it is braced
 * symbols and nothing else, because `"3 mana"` and `"{R}{R}"` are not the same
 * kind of thing and only one of them can be paid.
 */
const manaString: Check<string> = (v, p, e) => {
  const s = isString(v, p, e);
  if (s === undefined) return undefined;
  if (!/^(\{[^{}]{1,8}\})+$/.test(s.trim())) {
    return bad(e, p, `expected braced mana symbols like {2}{R}, got ${JSON.stringify(s)}`);
  }
  return s.trim();
};

const cost = union<Cost>('pay', {
  mana: object({ cost: req(manaString) }, 'pay'),
  tap: object({}, 'pay'),
  untap: object({}, 'pay'),
  'tap-others': object({ what: req(selector), count: req(valueExpr) }, 'pay'),
  sacrifice: object({ what: req(selector), count: req(valueExpr) }, 'pay'),
  discard: object({ what: opt(selector), count: req(valueExpr), random: opt(isBool) }, 'pay'),
  exile: object({ from: req(zone), what: req(selector), count: req(valueExpr) }, 'pay'),
  life: object({ amount: req(valueExpr) }, 'pay'),
  'remove-counters': object({ counter: req(isNonEmptyString), count: req(valueExpr), from: opt(selector) }, 'pay'),
  'add-counters': object({ counter: req(isNonEmptyString), count: req(valueExpr), to: opt(selector) }, 'pay'),
  'return-to-hand': object({ what: req(selector), count: req(valueExpr) }, 'pay'),
  reveal: object({ what: req(selector), count: req(valueExpr) }, 'pay'),
}, 'cost');

/**
 * `power`/`toughness` are strings because `*` and `1+*` exist. They are also the
 * shape that produced a real bug in this folder: `power:"x"` reads as 0 in
 * `powerOf`, so an X/X token arrived on the battlefield and was binned by state-
 * based actions on the spot. Anything not an integer, a signed integer or a `*`
 * form is refused here rather than reproduced.
 */
const ptString: Check<string> = (v, p, e) => {
  const s = isString(v, p, e);
  if (s === undefined) return undefined;
  if (!/^[+-]?(\d+|\*|\d+\+\*|\*\+\d+)$/.test(s.trim())) {
    return bad(e, p, `power/toughness must be a number or a * form, got ${JSON.stringify(s)}`);
  }
  return s.trim();
};

const tokenSpec = object<TokenSpec>({
  name: req(isNonEmptyString),
  typeLine: opt(isString),
  power: opt(ptString),
  toughness: opt(ptString),
  colorIdentity: opt(isArrayOf(manaColor)),
  keywords: opt(isArrayOf(isNonEmptyString)),
  oracleText: opt(isString),
});

const manaSpendRestriction = object({
  spendOn: req(isEnum(['cast', 'activate', 'cast-or-activate'] as const)),
  what: opt(cardFilter),
  text: req(isNonEmptyString),
});

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

const selectorOrPlayer = either(selector, playerSelector, 'sel', 'who', 'selector or player selector');

const lifeEffect = object({ who: req(playerSelector), amount: req(valueExpr) }, 'do');
const tapEffect = object({ what: req(selector) }, 'do');
const counterEffect = object({ what: req(selector), counter: req(isNonEmptyString), count: req(valueExpr) }, 'do');
const drawEffect = object({ who: req(playerSelector), count: req(valueExpr) }, 'do');

const effectImpl = union<Effect>('do', {
  'gain-life': lifeEffect,
  'lose-life': lifeEffect,
  'set-life': lifeEffect,
  damage: object({ to: req(selectorOrPlayer), amount: req(valueExpr) }, 'do'),
  poison: lifeEffect,
  draw: drawEffect,
  mill: drawEffect,
  discard: object({ who: req(playerSelector), count: req(valueExpr), random: opt(isBool) }, 'do'),
  'move-zone': object({
    what: req(selector),
    to: req(zone),
    position: opt((v, p, e) =>
      typeof v === 'number' ? isInt(v, p, e) : isEnum(['top', 'bottom'] as const)(v, p, e)),
    tapped: opt(isBool),
  }, 'do'),
  destroy: object({ what: req(selector) }, 'do'),
  sacrifice: object({ who: req(playerSelector), what: req(selector), count: req(valueExpr) }, 'do'),
  exile: object({ what: req(selector) }, 'do'),
  'return-from': object({
    zone: req(zone), who: req(playerSelector), what: req(selector), count: req(valueExpr), to: req(zone),
  }, 'do'),
  'search-library': object({
    who: req(playerSelector), what: req(selector), count: req(valueExpr), to: req(zone),
    thenShuffle: req(isBool), tapped: opt(isBool),
  }, 'do'),
  shuffle: object({ who: req(playerSelector) }, 'do'),
  'create-token': object({
    who: req(playerSelector), token: req(tokenSpec), count: req(valueExpr), tapped: opt(isBool),
  }, 'do'),
  tap: tapEffect,
  untap: tapEffect,
  'add-counters': counterEffect,
  'remove-counters': counterEffect,
  pump: object({
    what: req(selector), power: req(valueExpr), toughness: req(valueExpr),
    grant: opt(isArrayOf(isNonEmptyString)), duration: req(duration),
  }, 'do'),
  'gain-control': object({ what: req(selector), who: req(playerSelector), duration: req(duration) }, 'do'),
  attach: object({ what: req(selector), to: req(selector) }, 'do'),
  'add-mana': object({
    who: req(playerSelector), mana: req(manaString), count: opt(valueExpr), restriction: opt(manaSpendRestriction),
  }, 'do'),
  'player-counter': object({ who: req(playerSelector), counter: req(isNonEmptyString), count: req(valueExpr) }, 'do'),
  'set-monarch': object({ who: req(playerSelector) }, 'do'),
  'lose-game': object({ who: req(playerSelector) }, 'do'),
  'win-game': object({ who: req(playerSelector) }, 'do'),
  counter: object({ what: req(selector) }, 'do'),
  'unless-pays': object({
    who: req(playerSelector), cost: req(isArrayOf(cost, 1)), effects: req(isArrayOf(effect, 1)),
  }, 'do'),
  if: object({ condition: req(condition), then: req(isArrayOf(effect, 1)), else: opt(isArrayOf(effect, 1)) }, 'do'),
  'for-each': object({ over: req(selectorOrPlayer), effects: req(isArrayOf(effect, 1)) }, 'do'),
  repeat: object({ times: req(valueExpr), effects: req(isArrayOf(effect, 1)) }, 'do'),
  'choose-mode': object({
    min: req(valueExpr), max: req(valueExpr),
    modes: req(isArrayOf(object({ text: req(isNonEmptyString), effects: req(isArrayOf(effect, 1)) }), 1)),
  }, 'do'),
  may: object({
    who: req(playerSelector), text: req(isNonEmptyString), effects: req(isArrayOf(effect, 1)),
  }, 'do'),
  /**
   * `manual` is deliberately ABSENT. It is the hand-written compiler's marker
   * for "a human resolves this", and if untrusted JSON could carry one, LLM
   * output would be indistinguishable from compiler output in every coverage
   * table downstream. A `{do:'manual'}` from outside is an unknown effect and
   * fails here — which is exactly the intent.
   */
}, 'effect');

/* ------------------------------------------------------------------ *
 * Continuous modifications
 * ------------------------------------------------------------------ */

const amountOrAll: Check<ValueExpr | 'all'> = (v, p, e) =>
  v === 'all' ? 'all' : valueExpr(v, p, e);

const restrictionRule = union<Restriction>('rule', {
  'cant-attack': object({ who: req(selector), unless: opt(condition) }, 'rule'),
  'cant-block': object({ who: req(selector), unless: opt(condition) }, 'rule'),
  'must-attack': object({ who: req(selector), unless: opt(condition) }, 'rule'),
  'cant-untap': object({ who: req(selector), unless: opt(condition) }, 'rule'),
  'cant-be-blocked-except-by': object({ who: req(selector), by: req(selector) }, 'rule'),
  'cant-be-targeted': object({ who: req(selector), by: req(playerSelector) }, 'rule'),
  'cant-cast': object({ what: req(selector), who: req(playerSelector) }, 'rule'),
  'max-lands-per-turn': object({ who: req(playerSelector), n: req(valueExpr) }, 'rule'),
  'damage-prevention': object({ to: req(selector), from: opt(selector), amount: req(amountOrAll) }, 'rule'),
}, 'restriction');

const modification = union<Modification>('layer', {
  control: object({ newController: req(playerSelector) }, 'layer'),
  type: object({
    addTypes: opt(isArrayOf(isNonEmptyString)),
    addSubtypes: opt(isArrayOf(isNonEmptyString)),
    removeTypes: opt(isArrayOf(isNonEmptyString)),
  }, 'layer'),
  color: object({ setColors: req(isArrayOf(manaColor)) }, 'layer'),
  ability: object({ grant: opt(isArrayOf(isNonEmptyString)), remove: opt(isArrayOf(isNonEmptyString)) }, 'layer'),
  'pt-set': object({ power: req(valueExpr), toughness: req(valueExpr) }, 'layer'),
  'pt-modify': object({ power: req(valueExpr), toughness: req(valueExpr) }, 'layer'),
  'pt-switch': object({}, 'layer'),
  'cost-modify': object({
    applies: req(selector), delta: req(valueExpr), genericOnly: opt(isBool), forWhom: req(playerSelector),
  }, 'layer'),
  restriction: object({ rule: req(restrictionRule) }, 'layer'),
}, 'modification');

/* ------------------------------------------------------------------ *
 * Targets, triggers, replacements
 * ------------------------------------------------------------------ */

const targetSpec: Check<TargetSpec> = (v, p, e) => {
  const checked = object<TargetSpec>({
    ref: req(isInt),
    what: req(isEnum(['card', 'player', 'any'] as const)),
    filter: opt(cardFilter),
    zone: opt(zone),
    controller: opt(playerSelector),
    min: req(isInt),
    max: req(isInt),
    distinct: opt(isBool),
    prompt: req(isNonEmptyString),
  })(v, p, e);
  if (!checked) return undefined;
  if (checked.min < 0) return bad(e, `${p}.min`, 'min may not be negative');
  if (checked.max < checked.min) return bad(e, `${p}.max`, `max (${checked.max}) is below min (${checked.min})`);
  if (checked.max === 0) return bad(e, `${p}.max`, 'a target that can never be chosen is not a target');
  return checked;
};

const triggerEvent = union<TriggerEvent>('on', {
  enters: object({ who: req(selector) }, 'on'),
  dies: object({ who: req(selector) }, 'on'),
  leaves: object({ who: req(selector), from: opt(zone) }, 'on'),
  'zone-change': object({
    who: req(selector),
    from: req((v, p, e) => (v === 'any' ? 'any' : zone(v, p, e))),
    to: req((v, p, e) => (v === 'any' ? 'any' : zone(v, p, e))),
  }, 'on'),
  attacks: object({ who: req(selector) }, 'on'),
  blocks: object({ who: req(selector) }, 'on'),
  'becomes-blocked': object({ who: req(selector) }, 'on'),
  'deals-damage': object({
    source: req(selector),
    to: opt(isEnum(['any', 'player', 'creature', 'planeswalker'] as const)),
    combatOnly: opt(isBool),
  }, 'on'),
  'dealt-damage': object({ who: req(selector) }, 'on'),
  cast: object({ what: req(selector), by: opt(playerSelector) }, 'on'),
  step: object({ step: req(step), whose: req(playerSelector) }, 'on'),
  tapped: object({ who: req(selector) }, 'on'),
  untapped: object({ who: req(selector) }, 'on'),
  'counter-added': object({ who: req(selector), counter: req(isNonEmptyString) }, 'on'),
  'gains-life': object({ whose: req(playerSelector) }, 'on'),
  'loses-life': object({ whose: req(playerSelector) }, 'on'),
  'draws-card': object({ whose: req(playerSelector) }, 'on'),
  sacrificed: object({ who: req(selector) }, 'on'),
}, 'trigger event');

const replaceableEvent = union<ReplaceableEvent>('on', {
  enters: object({ who: req(selector) }, 'on'),
  damage: object({ to: req(selector), from: opt(selector), combatOnly: opt(isBool) }, 'on'),
  draw: object({ whose: req(playerSelector) }, 'on'),
  dies: object({ who: req(selector) }, 'on'),
  'counter-placed': object({ target: req(selector), counter: opt(isNonEmptyString) }, 'on'),
  'life-gain': object({ whose: req(playerSelector) }, 'on'),
  'life-loss': object({ whose: req(playerSelector) }, 'on'),
  'token-created': object({ whose: req(playerSelector) }, 'on'),
  step: object({ step: req(step), whose: req(playerSelector) }, 'on'),
}, 'replaceable event');

const replacementResult = union<ReplacementResult>('do', {
  'enters-tapped': object({}, 'do'),
  'enters-with-counters': object({ counter: req(isNonEmptyString), count: req(valueExpr) }, 'do'),
  'enters-under-control': object({ controller: req(playerSelector) }, 'do'),
  prevent: object({ amount: req(amountOrAll) }, 'do'),
  redirect: object({ to: req(targetSpec) }, 'do'),
  multiply: object({ factor: req(valueExpr) }, 'do'),
  'replace-zone': object({ to: req(zone) }, 'do'),
  skip: object({}, 'do'),
  additional: object({ effects: req(isArrayOf(effect, 1)) }, 'do'),
}, 'replacement result');

/* ------------------------------------------------------------------ *
 * Abilities
 * ------------------------------------------------------------------ */

const limit = object({ per: req(isEnum(['turn', 'game'] as const)), count: req(isInt) });
const confidence = isEnum(['exact', 'approximate'] as const);

/**
 * `id` and `confidence` are OPTIONAL here and assigned by the caller. A model is
 * told not to emit them; a `jsonb` round-trip will carry them. Accepting both
 * shapes keeps one validator for both directions.
 */
const abilityBase = { id: opt(isNonEmptyString), text: req(isString), confidence: opt(confidence) };

const ability = union<Ability>('kind', {
  triggered: object({
    ...abilityBase,
    event: req(triggerEvent),
    activeZones: opt(isArrayOf(zone)),
    condition: opt(condition),
    interveningIf: opt(isBool),
    optional: opt(isBool),
    limit: opt(limit),
    targets: opt(isArrayOf(targetSpec)),
    effects: req(isArrayOf(effect)),
  }, 'kind'),
  activated: object({
    ...abilityBase,
    costs: req(isArrayOf(cost)),
    activeZones: opt(isArrayOf(zone)),
    timing: opt(isEnum(['any', 'sorcery'] as const)),
    condition: opt(condition),
    limit: opt(limit),
    targets: opt(isArrayOf(targetSpec)),
    effects: req(isArrayOf(effect)),
    isManaAbility: opt(isBool),
    isLoyalty: opt(isBool),
  }, 'kind'),
  static: object({
    ...abilityBase,
    activeZones: opt(isArrayOf(zone)),
    condition: opt(condition),
    affects: req(selector),
    modifications: req(isArrayOf(modification, 1)),
  }, 'kind'),
  replacement: object({
    ...abilityBase,
    activeZones: opt(isArrayOf(zone)),
    condition: opt(condition),
    event: req(replaceableEvent),
    result: req(replacementResult),
    selfReplacement: opt(isBool),
  }, 'kind'),
  spell: object({
    ...abilityBase,
    targets: opt(isArrayOf(targetSpec)),
    effects: req(isArrayOf(effect)),
  }, 'kind'),
  mana: object({
    ...abilityBase,
    costs: req(isArrayOf(cost)),
    activeZones: opt(isArrayOf(zone)),
    effects: req(isArrayOf(effect, 1)),
  }, 'kind'),
  keyword: object({
    ...abilityBase,
    keyword: req(isNonEmptyString),
    parameter: opt(isNonEmptyString),
  }, 'kind'),
}, 'ability');

const unparsedClause = object<UnparsedClause>({
  text: req(isNonEmptyString),
  reason: req(isEnum(GAP_REASONS)),
  // Spans are computed downstream from the verbatim text, so an inbound clause
  // may legitimately arrive without one.
  span: opt((v, p, e) => {
    if (!Array.isArray(v) || v.length !== 2) return bad(e, p, 'span must be a [start, end] pair');
    const a = isInt(v[0], `${p}[0]`, e);
    const b = isInt(v[1], `${p}[1]`, e);
    return a === undefined || b === undefined ? undefined : [a, b];
  }),
});

/* ------------------------------------------------------------------ *
 * The public surface
 * ------------------------------------------------------------------ */

export type ValidationResult<T> =
  | { ok: true; value: T; errors: [] }
  | { ok: false; value: null; errors: ValidationError[] };

const wrap = <T>(value: T | undefined, errors: ValidationError[]): ValidationResult<T> =>
  value !== undefined && errors.length === 0
    ? { ok: true, value, errors: [] }
    : { ok: false, value: null, errors: errors.length ? errors : [{ path: '$', message: 'validation failed' }] };

/** One ability. `path` seeds the error paths so a caller can name the card. */
export function validateAbility(value: unknown, path = '$'): ValidationResult<Ability> {
  const errors: ValidationError[] = [];
  return wrap(ability(value, path, errors), errors);
}

export function validateAbilities(value: unknown, path = '$.abilities'): ValidationResult<Ability[]> {
  const errors: ValidationError[] = [];
  return wrap(isArrayOf(ability)(value, path, errors), errors);
}

export function validateUnparsed(value: unknown, path = '$.unparsed'): ValidationResult<UnparsedClause[]> {
  const errors: ValidationError[] = [];
  return wrap(isArrayOf(unparsedClause)(value, path, errors), errors);
}

/** Exported so callers can validate a single effect tree in isolation (tests, tools). */
export function validateEffects(value: unknown, path = '$.effects'): ValidationResult<Effect[]> {
  const errors: ValidationError[] = [];
  return wrap(isArrayOf(effect)(value, path, errors), errors);
}

/**
 * Every tag string this validator will accept, grouped by the key it hangs off.
 * `llm-validation.test.ts` compares this against the grammar the model is shown, in
 * both directions, so the prompt cannot describe a DSL we do not implement and
 * the DSL cannot grow a member the prompt never mentions.
 */
export const ACCEPTED_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  do: [
    'gain-life', 'lose-life', 'set-life', 'damage', 'poison', 'draw', 'mill', 'discard', 'move-zone',
    'destroy', 'sacrifice', 'exile', 'return-from', 'search-library', 'shuffle', 'create-token', 'tap',
    'untap', 'add-counters', 'remove-counters', 'pump', 'gain-control', 'attach', 'add-mana', 'player-counter',
    'set-monarch', 'lose-game', 'win-game', 'counter', 'unless-pays', 'if', 'for-each', 'repeat',
    'choose-mode', 'may',
    // ReplacementResult shares the `do` key.
    'enters-tapped', 'enters-with-counters', 'enters-under-control', 'prevent', 'redirect', 'multiply',
    'replace-zone', 'skip', 'additional',
  ],
  sel: ['self', 'none', 'each', 'target', 'trigger-source', 'trigger-subject', 'attached', 'all'],
  is: [
    'type', 'subtype', 'supertype', 'name', 'keyword', 'color', 'colorless', 'multicolored', 'tapped',
    'untapped', 'attacking', 'blocking', 'blocked', 'token', 'commander', 'other', 'any', 'has-counter',
    'power', 'toughness', 'mana-value', 'not', 'and', 'or',
  ],
  v: [
    'x', 'count', 'count-players', 'power', 'toughness', 'mana-value', 'counters', 'life', 'cards-in',
    'add', 'sub', 'mul', 'div', 'min', 'max', 'if', 'watch',
  ],
  if: ['count', 'value', 'controls', 'step', 'your-turn', 'first-time-this-turn', 'not', 'and', 'or'],
  pay: [
    'mana', 'tap', 'untap', 'tap-others', 'sacrifice', 'discard', 'exile', 'life', 'remove-counters',
    'add-counters', 'return-to-hand', 'reveal',
  ],
  on: [
    'enters', 'dies', 'leaves', 'zone-change', 'attacks', 'blocks', 'becomes-blocked', 'deals-damage',
    'dealt-damage', 'cast', 'step', 'tapped', 'untapped', 'counter-added', 'gains-life', 'loses-life',
    'draws-card', 'sacrificed',
    // ReplaceableEvent shares the `on` key.
    'damage', 'draw', 'counter-placed', 'life-gain', 'life-loss', 'token-created',
  ],
  layer: ['control', 'type', 'color', 'ability', 'pt-set', 'pt-modify', 'pt-switch', 'cost-modify', 'restriction'],
  who: [
    'you', 'each-opponent', 'each-player', 'active', 'defending', 'monarch', 'trigger-player',
    'target-player', 'controller-of', 'owner-of',
  ],
  saw: [
    'spell-cast', 'land-played', 'died', 'entered', 'attacked', 'token-created', 'drew', 'gained-life',
    'lost-life', 'dealt-damage',
  ],
  rule: [
    'cant-attack', 'cant-block', 'must-attack', 'cant-untap', 'cant-be-blocked-except-by',
    'cant-be-targeted', 'cant-cast', 'max-lands-per-turn', 'damage-prevention',
  ],
  kind: ['triggered', 'activated', 'static', 'replacement', 'spell', 'mana', 'keyword'],
});
