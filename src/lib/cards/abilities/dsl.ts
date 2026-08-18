/**
 * DeckMatrix ability DSL — the type space.
 *
 * Abilities are DATA. Nothing in this file is a function, a closure, a class or
 * a regex object: a `CardAbilities` value survives `structuredClone`,
 * `JSON.stringify` and a Supabase `jsonb` column unchanged. That is the whole
 * point — a game is a JSON action log, the engine runs in the browser, and the
 * server only orders and revalidates.
 *
 * ## Where this file belongs
 * The engine plan puts this type space at `src/lib/game/ability-dsl.ts`. That
 * file is owned by the engine agent and does not exist yet, and `src/lib/game`
 * already imports `src/lib/cards/tagger.ts` (`effects.ts:59`), so the compiler
 * in this folder must not import from `game` — that would close an import
 * cycle. The types therefore live here for now, written to the agreed shape
 * field-for-field. When `game/ability-dsl.ts` lands, this file becomes a
 * one-line re-export and the compiler does not change: every module in
 * `src/lib/cards/abilities` imports its types from `./dsl.ts` and from nowhere
 * else, so the swap is a single-file edit with no drift surface.
 *
 * ## Two deliberate departures from the plan, both flagged
 * 1. `{ do: 'counter' }` is added to `Effect`. "Counter target spell" is on the
 *    build list and the plan gives the engine a real stack, but the effect
 *    vocabulary in the plan has no member for it. Marked PROPOSED below.
 * 2. `GapReason` gains `'unrecognised'`, `'ambiguous'` and `'multi-face'`. The
 *    plan names ten modelling gaps, but the overwhelmingly common case is "no
 *    rule matched this clause", which is not one of the ten. Without a code for
 *    it there is nowhere honest to put the bulk of the catalogue, and the
 *    anti-silent-no-op contract requires every clause to land somewhere.
 *
 * @see ./compiler.ts for the oracle-text front end.
 */

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** Mirrors `@/lib/game/types` `ManaColor`. Duplicated to keep this folder acyclic. */
export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** Mirrors `@/lib/game/types` `Zone`, plus the `'stack'` the plan adds. */
export type Zone =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command'
  | 'stack';

/** Mirrors `@/lib/game/types` `Step` exactly. */
export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'precombat_main'
  | 'begin_combat'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'combat_damage'
  | 'end_combat'
  | 'postcombat_main'
  | 'end'
  | 'cleanup';

export type Cmp = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'ne';

export type Duration =
  | 'end-of-turn'
  | 'your-next-turn'
  | 'while-source-on-battlefield'
  | 'permanent';

/** Mirrors `@/lib/game/types` `TokenSpec`. */
export interface TokenSpec {
  name: string;
  typeLine?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: ManaColor[];
  keywords?: string[];
  oracleText?: string;
}

/* ------------------------------------------------------------------ *
 * Selectors — the workhorse. Same boolean-tree shape as tagger.ts's
 * `TagCondition`, for the same reason: one declarative tree, one
 * interpreter, and a shape that could later compile to SQL.
 * ------------------------------------------------------------------ */

export type Selector =
  | { sel: 'self' }
  | { sel: 'none' }
  | { sel: 'each' }
  | { sel: 'target'; ref: number }
  | { sel: 'trigger-source' }
  | { sel: 'trigger-subject' }
  | { sel: 'attached' }
  | { sel: 'all'; where: CardFilter; zone?: Zone; controller?: PlayerSelector };

export type CardFilter =
  | { is: 'type' | 'subtype' | 'supertype' | 'name' | 'keyword'; value: string }
  | { is: 'color'; value: ManaColor }
  | { is: 'colorless' }
  | { is: 'multicolored' }
  | { is: 'tapped' }
  | { is: 'untapped' }
  | { is: 'attacking' }
  | { is: 'blocking' }
  | { is: 'blocked' }
  | { is: 'token' }
  | { is: 'commander' }
  | { is: 'other' }
  | { is: 'any' }
  | { is: 'has-counter'; counter: string; atLeast?: number }
  | { is: 'power' | 'toughness' | 'mana-value'; cmp: Cmp; value: ValueExpr }
  | { is: 'not'; of: CardFilter }
  | { is: 'and'; of: CardFilter[] }
  | { is: 'or'; of: CardFilter[] };

export type PlayerSelector =
  | { who: 'you' }
  | { who: 'each-opponent' }
  | { who: 'each-player' }
  | { who: 'active' }
  | { who: 'defending' }
  | { who: 'monarch' }
  | { who: 'target-player'; ref: number }
  | { who: 'controller-of'; of: Selector }
  | { who: 'owner-of'; of: Selector };

/* ------------------------------------------------------------------ *
 * Values and conditions.
 *
 * A quantity that has to be counted from the board ("where X is the number of
 * creatures you control") is a typed expression tree, not a number and not a
 * closure. A closure could not be replayed on a client that received only an
 * action log; a bare number could not express the count at all. The tree is
 * evaluated against state at the moment the rules ask for it, and it survives
 * `JSON.stringify` on the way there.
 * ------------------------------------------------------------------ */

export type ValueExpr =
  | number
  | { v: 'x' }
  | { v: 'count'; of: Selector }
  | { v: 'count-players'; of: PlayerSelector }
  | { v: 'power' | 'toughness' | 'mana-value'; of: Selector }
  | { v: 'counters'; of: Selector; counter: string }
  | { v: 'life'; of: PlayerSelector }
  | { v: 'cards-in'; zone: Zone; of: PlayerSelector }
  | { v: 'add'; of: ValueExpr[] }
  | { v: 'sub'; a: ValueExpr; b: ValueExpr }
  | { v: 'mul'; of: ValueExpr[] }
  | { v: 'div'; a: ValueExpr; b: ValueExpr }
  | { v: 'min'; of: ValueExpr[] }
  | { v: 'max'; of: ValueExpr[] }
  | { v: 'if'; condition: Condition; then: ValueExpr; else: ValueExpr };

export type Condition =
  | { if: 'count'; of: Selector; cmp: Cmp; value: ValueExpr }
  | { if: 'value'; a: ValueExpr; cmp: Cmp; b: ValueExpr }
  | { if: 'controls'; who: PlayerSelector; what: CardFilter; cmp: Cmp; value: ValueExpr }
  | { if: 'step'; is: Step[] }
  | { if: 'your-turn' }
  | { if: 'first-time-this-turn'; key: string }
  | { if: 'not'; of: Condition }
  | { if: 'and'; of: Condition[] }
  | { if: 'or'; of: Condition[] };

/* ------------------------------------------------------------------ *
 * Effects — a closed vocabulary, exhaustively switched by the runtime.
 * ------------------------------------------------------------------ */

export type Effect =
  /* life & damage */
  | { do: 'gain-life' | 'lose-life' | 'set-life'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'damage'; to: Selector | PlayerSelector; amount: ValueExpr }
  | { do: 'poison'; who: PlayerSelector; amount: ValueExpr }
  /* cards & zones */
  | { do: 'draw' | 'mill'; who: PlayerSelector; count: ValueExpr }
  | { do: 'discard'; who: PlayerSelector; count: ValueExpr; random?: boolean }
  | { do: 'move-zone'; what: Selector; to: Zone; position?: 'top' | 'bottom' | number; tapped?: boolean }
  | { do: 'destroy'; what: Selector }
  | { do: 'sacrifice'; who: PlayerSelector; what: Selector; count: ValueExpr }
  | { do: 'exile'; what: Selector }
  | { do: 'return-from'; zone: Zone; who: PlayerSelector; what: Selector; count: ValueExpr; to: Zone }
  | { do: 'search-library'; who: PlayerSelector; what: Selector; count: ValueExpr; to: Zone; thenShuffle: boolean; tapped?: boolean }
  | { do: 'shuffle'; who: PlayerSelector }
  /* permanents */
  | { do: 'create-token'; who: PlayerSelector; token: TokenSpec; count: ValueExpr; tapped?: boolean }
  | { do: 'tap' | 'untap'; what: Selector }
  | { do: 'add-counters' | 'remove-counters'; what: Selector; counter: string; count: ValueExpr }
  | { do: 'pump'; what: Selector; power: ValueExpr; toughness: ValueExpr; grant?: string[]; duration: Duration }
  | { do: 'gain-control'; what: Selector; who: PlayerSelector; duration: Duration }
  /* mana & table */
  | { do: 'add-mana'; who: PlayerSelector; mana: string }
  | { do: 'player-counter'; who: PlayerSelector; counter: string; count: ValueExpr }
  | { do: 'set-monarch'; who: PlayerSelector }
  | { do: 'lose-game' | 'win-game'; who: PlayerSelector }
  /* the stack.
   * PROPOSED ADDITION — not in the plan's vocabulary. "Counter target spell" is
   * on the build list and the plan gives the engine a real stack zone, so the
   * concept exists; only the effect member was missing. Flagged here so the DSL
   * owner accepts or rejects it deliberately rather than inheriting it. */
  | { do: 'counter'; what: Selector }
  /* control flow */
  | { do: 'if'; condition: Condition; then: Effect[]; else?: Effect[] }
  | { do: 'for-each'; over: Selector | PlayerSelector; effects: Effect[] }
  | { do: 'repeat'; times: ValueExpr; effects: Effect[] }
  | { do: 'choose-mode'; min: ValueExpr; max: ValueExpr; modes: Array<{ text: string; effects: Effect[] }> }
  | { do: 'may'; who: PlayerSelector; text: string; effects: Effect[] }
  /* honesty */
  | { do: 'manual'; text: string; hint?: string };

/* ------------------------------------------------------------------ *
 * Costs
 * ------------------------------------------------------------------ */

export type Cost =
  | { pay: 'mana'; cost: string }
  | { pay: 'tap' }
  | { pay: 'untap' }
  | { pay: 'tap-others'; what: Selector; count: ValueExpr }
  | { pay: 'sacrifice'; what: Selector; count: ValueExpr }
  | { pay: 'discard'; what?: Selector; count: ValueExpr; random?: boolean }
  | { pay: 'exile'; from: Zone; what: Selector; count: ValueExpr }
  | { pay: 'life'; amount: ValueExpr }
  | { pay: 'remove-counters'; counter: string; count: ValueExpr; from?: Selector }
  | { pay: 'add-counters'; counter: string; count: ValueExpr; to?: Selector }
  | { pay: 'return-to-hand'; what: Selector; count: ValueExpr }
  | { pay: 'reveal'; what: Selector; count: ValueExpr };

/* ------------------------------------------------------------------ *
 * Continuous modifications — explicit CR 613 layers, never inferred.
 * ------------------------------------------------------------------ */

export type Restriction =
  | { rule: 'cant-attack' | 'cant-block' | 'must-attack' | 'cant-untap'; who: Selector; unless?: Condition }
  | { rule: 'cant-be-blocked-except-by'; who: Selector; by: Selector }
  | { rule: 'cant-be-targeted'; who: Selector; by: PlayerSelector }
  | { rule: 'cant-cast'; what: Selector; who: PlayerSelector }
  | { rule: 'max-lands-per-turn'; who: PlayerSelector; n: ValueExpr }
  | { rule: 'damage-prevention'; to: Selector; from?: Selector; amount: ValueExpr | 'all' };

export type Modification =
  | { layer: 'control'; newController: PlayerSelector }
  | { layer: 'type'; addTypes?: string[]; addSubtypes?: string[]; removeTypes?: string[] }
  | { layer: 'color'; setColors: ManaColor[] }
  | { layer: 'ability'; grant?: string[]; remove?: string[] }
  | { layer: 'pt-set'; power: ValueExpr; toughness: ValueExpr }
  | { layer: 'pt-modify'; power: ValueExpr; toughness: ValueExpr }
  | { layer: 'pt-switch' }
  | { layer: 'cost-modify'; applies: Selector; delta: ValueExpr; genericOnly?: boolean; forWhom: PlayerSelector }
  | { layer: 'restriction'; rule: Restriction };

/* ------------------------------------------------------------------ *
 * Triggers and replacements
 * ------------------------------------------------------------------ */

export type TriggerEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'dies'; who: Selector }
  | { on: 'leaves'; who: Selector; from?: Zone }
  | { on: 'zone-change'; who: Selector; from: Zone | 'any'; to: Zone | 'any' }
  | { on: 'attacks'; who: Selector }
  | { on: 'blocks'; who: Selector }
  | { on: 'becomes-blocked'; who: Selector }
  | { on: 'deals-damage'; source: Selector; to?: 'any' | 'player' | 'creature' | 'planeswalker'; combatOnly?: boolean }
  | { on: 'dealt-damage'; who: Selector }
  | { on: 'cast'; what: Selector; by?: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector }
  | { on: 'tapped' | 'untapped'; who: Selector }
  | { on: 'counter-added'; who: Selector; counter: string }
  | { on: 'gains-life' | 'loses-life'; whose: PlayerSelector }
  | { on: 'draws-card'; whose: PlayerSelector }
  | { on: 'sacrificed'; who: Selector };

export type ReplaceableEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'damage'; to: Selector; from?: Selector; combatOnly?: boolean }
  | { on: 'draw'; whose: PlayerSelector }
  | { on: 'dies'; who: Selector }
  | { on: 'counter-placed'; target: Selector; counter: string }
  | { on: 'life-gain' | 'life-loss'; whose: PlayerSelector }
  | { on: 'token-created'; whose: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector };

export type ReplacementResult =
  | { do: 'enters-tapped' }
  | { do: 'enters-with-counters'; counter: string; count: ValueExpr }
  | { do: 'enters-under-control'; controller: PlayerSelector }
  | { do: 'prevent'; amount: ValueExpr | 'all' }
  | { do: 'redirect'; to: TargetSpec }
  | { do: 'multiply'; factor: ValueExpr }
  | { do: 'replace-zone'; to: Zone }
  | { do: 'skip' }
  | { do: 'additional'; effects: Effect[] };

/* ------------------------------------------------------------------ *
 * Targeting
 * ------------------------------------------------------------------ */

export interface TargetSpec {
  ref: number;
  what: 'card' | 'player' | 'any';
  filter?: CardFilter;
  zone?: Zone;
  controller?: PlayerSelector;
  min: number;
  max: number;
  distinct?: boolean;
  prompt: string;
}

/* ------------------------------------------------------------------ *
 * The ability union
 * ------------------------------------------------------------------ */

/** Fields every ability carries. `text` is verbatim oracle, never invented. */
export interface AbilityBase {
  /** Stable per card — 'a0', 'a1'. Appears in the action log. */
  id: string;
  /** The verbatim oracle clause this came from. Shown on the stack. */
  text: string;
  /** 'approximate' still runs, but the runtime logs that it is an approximation. */
  confidence: 'exact' | 'approximate';
}

export interface TriggeredAbility extends AbilityBase {
  kind: 'triggered';
  event: TriggerEvent;
  activeZones?: Zone[];
  condition?: Condition;
  interveningIf?: boolean;
  optional?: boolean;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
}

export interface ActivatedAbility extends AbilityBase {
  kind: 'activated';
  costs: Cost[];
  activeZones?: Zone[];
  timing?: 'any' | 'sorcery';
  condition?: Condition;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
  isManaAbility?: boolean;
  isLoyalty?: boolean;
}

export interface StaticAbility extends AbilityBase {
  kind: 'static';
  activeZones?: Zone[];
  condition?: Condition;
  affects: Selector;
  modifications: Modification[];
}

export interface ReplacementAbility extends AbilityBase {
  kind: 'replacement';
  activeZones?: Zone[];
  condition?: Condition;
  event: ReplaceableEvent;
  result: ReplacementResult;
  selfReplacement?: boolean;
}

/** The effect of an instant or sorcery, or the ETB-independent body of a spell. */
export interface SpellAbility extends AbilityBase {
  kind: 'spell';
  targets?: TargetSpec[];
  effects: Effect[];
}

export interface ManaAbility extends AbilityBase {
  kind: 'mana';
  costs: Cost[];
  activeZones?: Zone[];
  effects: Effect[];
}

export interface KeywordAbility extends AbilityBase {
  kind: 'keyword';
  keyword: string;
  /** "ward {2}", "annihilator 2", "protection from red" — the parameter, verbatim. */
  parameter?: string;
}

export type Ability =
  | TriggeredAbility
  | ActivatedAbility
  | StaticAbility
  | ReplacementAbility
  | SpellAbility
  | ManaAbility
  | KeywordAbility;

/* ------------------------------------------------------------------ *
 * The top-level record
 * ------------------------------------------------------------------ */

/**
 * Why a clause was not modelled. The first ten are the modelling gaps the plan
 * names; `complex-combat` and `stale` are its two extras. The last three are
 * additions this compiler needs and could not do without:
 *
 *   - `unrecognised` — no rule matched. The bulk of the catalogue. Without this
 *     code the compiler would have nowhere honest to put an unmatched clause,
 *     and "nowhere to put it" is exactly how a clause gets silently dropped.
 *   - `ambiguous`    — a rule matched but a precision guard rejected it. We know
 *     roughly what the clause is and refuse to guess the details. Counting these
 *     separately is what tells us which rule to sharpen next.
 *   - `multi-face`   — the clause belongs to a face other than the front. The
 *     compiler models the front face only; folding a transform back face into
 *     the front face's ability list would grant abilities the card does not have.
 */
export type GapReason =
  | 'copy-layer'
  | 'alt-cast'
  | 'granted-ability'
  | 'layer-dependency'
  | 'state-trigger'
  | 'duration'
  | 'hidden-choice'
  | 'needs-history'
  | 'outside-game'
  | 'meta-replacement'
  | 'complex-combat'
  | 'stale'
  | 'unrecognised'
  | 'ambiguous'
  | 'multi-face';

export interface UnparsedClause {
  text: string;
  reason: GapReason;
  /** Character span into the normalised text this record was derived from. */
  span: [number, number];
}

export interface CardAbilities {
  /** Scryfall `oracle_id` — stable across printings. The authoring key. */
  oracleId: string;
  name: string;
  abilities: Ability[];
  /** NON-EMPTY => this card can never be reported as fully automated. */
  unparsed: UnparsedClause[];
  source: 'compiler' | 'book' | 'book-partial';
  /** Hash of the normalised oracle text this was derived from. */
  oracleHash: string;
  /** DERIVED by `deriveCoverage`, never hand-set. */
  coverage: Coverage;
}

export type Coverage = 'full' | 'partial' | 'manual' | 'none';

/* ------------------------------------------------------------------ *
 * Derivations and guards
 * ------------------------------------------------------------------ */

/** True if any effect anywhere in the tree is a `{do:'manual'}` marker. */
export function hasManualEffect(effects: readonly Effect[] | undefined): boolean {
  if (!effects) return false;
  for (const e of effects) {
    if (e.do === 'manual') return true;
    if (e.do === 'if' && (hasManualEffect(e.then) || hasManualEffect(e.else))) return true;
    if (e.do === 'for-each' && hasManualEffect(e.effects)) return true;
    if (e.do === 'repeat' && hasManualEffect(e.effects)) return true;
    if (e.do === 'may' && hasManualEffect(e.effects)) return true;
    if (e.do === 'choose-mode' && e.modes.some((m) => hasManualEffect(m.effects))) return true;
  }
  return false;
}

/** Every effect list an ability owns, so `hasManualEffect` can be run over it. */
export function effectsOf(ability: Ability): Effect[] {
  switch (ability.kind) {
    case 'triggered':
    case 'activated':
    case 'spell':
    case 'mana':
      return ability.effects;
    case 'replacement':
      return ability.result.do === 'additional' ? ability.result.effects : [];
    case 'static':
    case 'keyword':
      return [];
    default:
      return assertNever(ability);
  }
}

/**
 * `coverage` is computed, never asserted. `'full'` demands that no text was
 * dropped AND that no ability carries a `{do:'manual'}` marker, so there is no
 * way to spell "fully automated" while a clause went unmodelled.
 */
export function deriveCoverage(abilities: readonly Ability[], unparsed: readonly UnparsedClause[]): Coverage {
  const anyManual = abilities.some((a) => hasManualEffect(effectsOf(a)));
  if (abilities.length === 0) return unparsed.length === 0 ? 'none' : 'manual';
  if (unparsed.length === 0 && !anyManual) return 'full';
  return 'partial';
}

/**
 * The one discipline `tsconfig.app.json` will not enforce for us: `strict` and
 * `noImplicitAny` are both off, so union narrowing alone does not turn a missing
 * `switch` case into a compile error. Every switch over `Effect`, `Ability`,
 * `Selector`, `Modification` or `TriggerEvent` ends here.
 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled ability-DSL variant: ${JSON.stringify(x)}`);
}

/**
 * Proves a value is pure JSON — no function, class instance, `Map`, `Set`,
 * `Date`, `undefined`-in-array or `NaN`. The DSL's central promise is that a
 * `CardAbilities` round-trips through `structuredClone` and a `jsonb` column
 * unchanged; this is the assertion that keeps the promise checkable.
 */
export function assertSerialisable(value: unknown, path = '$'): void {
  const t = typeof value;
  if (value === null || t === 'string' || t === 'boolean') return;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) throw new Error(`${path}: non-finite number`);
    return;
  }
  if (t === 'undefined') throw new Error(`${path}: undefined is not JSON`);
  if (t === 'function' || t === 'symbol' || t === 'bigint') throw new Error(`${path}: ${t} is not JSON`);
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      if (v === undefined) throw new Error(`${path}[${i}]: undefined in array`);
      assertSerialisable(v, `${path}[${i}]`);
    });
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path}: ${(value as object).constructor?.name ?? 'exotic object'} is not a plain object`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue; // an absent optional field; JSON.stringify drops it
    assertSerialisable(v, `${path}.${k}`);
  }
}

/* ------------------------------------------------------------------ *
 * Constructor helpers — the tagger's `t()` / `any()` / `all()` idiom.
 * Terse enough that a rule table reads like the oracle text it matches.
 * ------------------------------------------------------------------ */

export const SELF: Selector = { sel: 'self' };
export const YOU: PlayerSelector = { who: 'you' };
export const EACH_OPPONENT: PlayerSelector = { who: 'each-opponent' };
export const EACH_PLAYER: PlayerSelector = { who: 'each-player' };

export const type = (value: string): CardFilter => ({ is: 'type', value });
export const subtype = (value: string): CardFilter => ({ is: 'subtype', value });
export const keywordFilter = (value: string): CardFilter => ({ is: 'keyword', value });
export const notF = (of: CardFilter): CardFilter => ({ is: 'not', of });
export const andF = (...of: CardFilter[]): CardFilter => (of.length === 1 ? of[0] : { is: 'and', of });
export const orF = (...of: CardFilter[]): CardFilter => (of.length === 1 ? of[0] : { is: 'or', of });

/** `all` with a filter, optionally scoped to a controller and a zone. */
export const all = (
  where: CardFilter,
  controller?: PlayerSelector,
  zone?: Zone,
): Selector => {
  const s: Selector = { sel: 'all', where };
  if (controller) (s as { controller?: PlayerSelector }).controller = controller;
  if (zone) (s as { zone?: Zone }).zone = zone;
  return s;
};

export const target = (ref: number): Selector => ({ sel: 'target', ref });
export const targetPlayer = (ref: number): PlayerSelector => ({ who: 'target-player', ref });

export const manual = (text: string, hint?: string): Effect =>
  hint ? { do: 'manual', text, hint } : { do: 'manual', text };
