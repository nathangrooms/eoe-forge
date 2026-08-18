/**
 * DeckMatrix — the card-ability DSL: the whole type space.
 *
 * ## What this is
 *
 * An ability is DATA. Nothing in this file is a function, a class, a closure or
 * a compiled regular expression. A `CardAbilities` value survives
 * `structuredClone`, `JSON.stringify`, and a Supabase `jsonb` column unchanged,
 * which is what lets a game be "a seed plus an action log" and lets the whole
 * engine run in the player's browser with the server only ordering and
 * revalidating actions.
 *
 * ## Provenance
 *
 * Written from scratch against our own `cards` table. Forge and XMage were read
 * for ARCHITECTURE ONLY — no script, Java class or data file from either
 * project was copied, ported, parsed or machine-converted into this repo. Two
 * ideas were taken because ideas and game mechanics are not copyrightable:
 * "abilities are data with a closed effect vocabulary" (Forge's card scripts)
 * and "every continuous effect carries an explicit CR 613 layer" (XMage's
 * `ContinuousEffectImpl`). Everything below is our own model.
 *
 * ## What we refused
 *
 * Forge's DSL is stringly typed and parsed at runtime: a typo in a mode name
 * yields a silently-skipped ability. That is precisely the silent-no-op class of
 * bug this work exists to kill, so every dispatch point here is a TypeScript
 * discriminated union and every `switch` over one ends in `assertNever`. A
 * missing case is a compile error, not a card that quietly does nothing.
 *
 * `tsconfig.app.json` sets `"strict": false` and `"noImplicitAny": false`, so
 * union narrowing alone will NOT catch a missing case for us. `assertNever` is
 * therefore a discipline this module enforces on itself, at runtime as well as
 * at compile time.
 *
 * ## The honesty contract, in the types
 *
 * `CardAbilities.unparsed` is non-empty exactly when text was not modelled, and
 * `coverage` is DERIVED from it (see `registry.ts`), never hand-set. There is no
 * way to spell "fully automated" while oracle text was dropped. Inside an
 * ability, `{ do: 'manual' }` is a first-class effect: a partly-modelled ability
 * runs its automated half and says the rest out loud.
 */

import type { InstanceId, ManaColor, PlayerId, Step, TokenSpec, Zone } from '../types.ts';

/* -------------------------------------------------------------------------- */
/* Scalars                                                                    */
/* -------------------------------------------------------------------------- */

export type Cmp = 'lt' | 'lte' | 'eq' | 'gte' | 'gt' | 'ne';

/**
 * How long a duration-limited continuous effect lasts. Deliberately four
 * values: everything else ("until end of combat", "until your next end step",
 * "for as long as this remains exiled") is refused with gap reason `duration`
 * rather than approximated.
 */
export type Duration =
  | 'end-of-turn'
  | 'your-next-turn'
  | 'while-source-on-battlefield'
  | 'permanent';

export const DURATIONS: readonly Duration[] = [
  'end-of-turn',
  'your-next-turn',
  'while-source-on-battlefield',
  'permanent',
] as const;

/* -------------------------------------------------------------------------- */
/* Selectors — the workhorse                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which permanents (or cards) an ability is talking about.
 *
 * Deliberately the same shape as `tagger.ts`'s `TagCondition`: a boolean tree of
 * plain records. That pattern is already proven across 34,088 catalogue rows
 * with verified TypeScript/SQL parity, and the same tree could later compile to
 * SQL for card-pool queries exactly the way the tagger already does.
 */
export type Selector =
  /** The permanent whose ability this is. */
  | { sel: 'self' }
  /** Matches nothing. Used by the compiler when a clause names no subject. */
  | { sel: 'none' }
  /** The subject currently bound by an enclosing `for-each`. */
  | { sel: 'each' }
  /** The Nth entry of the ability's `targets` array. */
  | { sel: 'target'; ref: number }
  /** The permanent that caused the trigger to fire (the creature that entered). */
  | { sel: 'trigger-source' }
  /** What an aura or equipment is attached to. */
  | { sel: 'attached' }
  | {
      sel: 'all';
      where: CardFilter;
      /** Defaults to `battlefield`. */
      zone?: Zone;
      controller?: PlayerSelector;
    };

/**
 * A predicate over one card. Power/toughness/keyword tests read the DERIVED
 * view, so an anthem is visible to "creatures with power 4 or greater" — which
 * is the whole reason continuous effects are a derived layer and not a write.
 */
export type CardFilter =
  | { is: 'type' | 'subtype' | 'supertype' | 'name' | 'keyword'; value: string }
  | { is: 'color'; value: ManaColor }
  | { is: 'colorless' }
  | { is: 'multicolored' }
  | { is: 'tapped' }
  | { is: 'untapped' }
  | { is: 'attacking' }
  | { is: 'blocking' }
  | { is: 'token' }
  | { is: 'commander' }
  /** Everything except the ability's own source. "Other creatures you control". */
  | { is: 'other' }
  | { is: 'any' }
  /**
   * Exactly these permanents, by instance id.
   *
   * CR 611.2c: the set a one-shot continuous effect applies to is locked in
   * when the effect is created. A pump that re-evaluated "creatures you
   * control" every time the board was read would grow to cover creatures cast
   * afterwards, which is wrong and is the kind of wrong nobody notices until
   * they lose to it. So `pump` and `gain-control` freeze their subjects here.
   */
  | { is: 'instance'; ids: string[] }
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
  | { who: 'owner-of'; of: Selector }
  /** The player currently bound by an enclosing `for-each-player`. */
  | { who: 'bound' };

/* -------------------------------------------------------------------------- */
/* Values and conditions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Forge's `Count$` idea, properly typed. `evalValue` always returns a finite
 * integer — never `NaN`, never `Infinity` — and clamps at zero where the rules
 * require it.
 */
export type ValueExpr =
  | number
  /** The X the player announced when activating or casting. */
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
  /** Integer division, floored, and division by zero is zero rather than a crash. */
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
  | { if: 'not'; of: Condition }
  | { if: 'and'; of: Condition[] }
  | { if: 'or'; of: Condition[] };

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One component of an activation cost. Every component of a cost is paid
 * together and atomically: `canPayCosts` is all-or-nothing.
 *
 * A cost with more than one legal payment NEVER picks for the player. It
 * reports the candidates and the caller supplies the chosen ids, so the
 * decision lands in the action log and every client replays it identically.
 */
export type Cost =
  /** "{2}{W}". Handed verbatim to `mana.ts` — this module has no mana logic. */
  | { pay: 'mana'; cost: string }
  | { pay: 'tap' }
  | { pay: 'untap' }
  | { pay: 'tap-others'; what: Selector; count: ValueExpr }
  | { pay: 'sacrifice'; what: Selector; count: ValueExpr }
  | { pay: 'discard'; what?: Selector; count: ValueExpr; random?: boolean }
  | { pay: 'exile'; from: Zone; what: Selector; count: ValueExpr }
  | { pay: 'life'; amount: ValueExpr }
  | { pay: 'remove-counters'; counter: string; count: ValueExpr; from?: Selector }
  /** Loyalty `+N` is an add-counters cost. */
  | { pay: 'add-counters'; counter: string; count: ValueExpr; to?: Selector }
  | { pay: 'return-to-hand'; what: Selector; count: ValueExpr }
  | { pay: 'reveal'; what: Selector; count: ValueExpr };

/* -------------------------------------------------------------------------- */
/* Targeting                                                                  */
/* -------------------------------------------------------------------------- */

export interface TargetSpec {
  /** Index into the ability's `targets` array; `{sel:'target', ref}` points here. */
  ref: number;
  what: 'card' | 'player' | 'any';
  filter?: CardFilter;
  /** Defaults to `battlefield` for cards. */
  zone?: Zone;
  controller?: PlayerSelector;
  min: number;
  max: number;
  /** "two target creatures" may not be the same creature twice. */
  distinct?: boolean;
  prompt: string;
}

/* -------------------------------------------------------------------------- */
/* Continuous effects (CR 613)                                                */
/* -------------------------------------------------------------------------- */

/**
 * One continuous modification, carrying its CR 613 layer EXPLICITLY.
 *
 * Forge infers the layer from which parameters are present, which makes
 * interactions surprising. XMage got this right: the layer is stated. We state
 * it too, and `continuous.ts` applies strictly in layer order.
 *
 * Layers 1 (copy) and 3 (text-changing) are deliberately absent — see
 * `GapReason` `copy-layer`. Layer 7d (+1/+1 and -1/-1 counters) is not an
 * ability at all: the runtime applies it from `CardInstance.counters` between
 * 7c and 7e, so nothing has to declare it.
 */
export type Modification =
  /** CR 613.1b, layer 2. */
  | { layer: 'control'; newController: PlayerSelector }
  /** Layer 4. */
  | { layer: 'type'; addTypes?: string[]; addSubtypes?: string[]; removeTypes?: string[] }
  /** Layer 5. */
  | { layer: 'color'; setColors: ManaColor[] }
  /** Layer 6 — KEYWORDS ONLY. Granting a whole nested ability is refused; see `granted-ability`. */
  | { layer: 'ability'; grant?: string[]; remove?: string[] }
  /** Layer 7b — "has base power and toughness 2/2". */
  | { layer: 'pt-set'; power: ValueExpr; toughness: ValueExpr }
  /** Layer 7c — anthems. */
  | { layer: 'pt-modify'; power: ValueExpr; toughness: ValueExpr }
  /** Layer 7e. */
  | { layer: 'pt-switch' }
  | {
      layer: 'cost-modify';
      applies: Selector;
      delta: ValueExpr;
      genericOnly?: boolean;
      forWhom: PlayerSelector;
    }
  | { layer: 'restriction'; rule: Restriction };

export type Restriction =
  | {
      rule: 'cant-attack' | 'cant-block' | 'must-attack' | 'cant-untap';
      who: Selector;
      unless?: Condition;
    }
  | { rule: 'cant-be-blocked-except-by'; who: Selector; by: CardFilter }
  | { rule: 'cant-be-targeted'; who: Selector; by: PlayerSelector }
  | { rule: 'cant-cast'; what: CardFilter; who: PlayerSelector }
  | { rule: 'max-lands-per-turn'; who: PlayerSelector; n: ValueExpr }
  | { rule: 'damage-prevention'; to: Selector; from?: Selector; amount: ValueExpr | 'all' };

/**
 * The order layers are applied in. Exported because `continuous.ts` sorts by it
 * and `continuous.test.ts` asserts against it — a layer order that lives in one
 * place cannot drift from the one that is tested.
 */
export const LAYER_ORDER: readonly Modification['layer'][] = [
  'control', // 2
  'type', // 4
  'color', // 5
  'ability', // 6
  'pt-set', // 7b
  'pt-modify', // 7c
  // 7d — counters, applied by the runtime, not declarable
  'pt-switch', // 7e
  'cost-modify',
  'restriction',
] as const;

/* -------------------------------------------------------------------------- */
/* Trigger events                                                             */
/* -------------------------------------------------------------------------- */

/**
 * When a triggered ability fires.
 *
 * A closed union rather than Forge's `Mode$` string, and that IS the point:
 * adding an event without handling it everywhere fails to compile, whereas a
 * typo in a stringly-typed mode yields an ability that never fires and never
 * complains.
 *
 * `enters`, `dies` and `leaves` are sugar; `triggers.ts` normalises them onto
 * `zone-change`, which is the general primitive.
 */
export type TriggerEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'dies'; who: Selector }
  | { on: 'leaves'; who: Selector; from?: Zone }
  | { on: 'zone-change'; who: Selector; from: Zone | 'any'; to: Zone | 'any' }
  | { on: 'attacks'; who: Selector }
  | { on: 'blocks'; who: Selector }
  | { on: 'becomes-blocked'; who: Selector }
  | {
      on: 'deals-damage';
      source: Selector;
      to?: 'any' | 'player' | 'creature' | 'planeswalker';
      combatOnly?: boolean;
    }
  | { on: 'dealt-damage'; who: Selector }
  | { on: 'cast'; what: CardFilter; by?: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector }
  | { on: 'tapped'; who: Selector }
  | { on: 'untapped'; who: Selector }
  | { on: 'counter-added'; who: Selector; counter: string }
  | { on: 'gains-life'; whose: PlayerSelector }
  | { on: 'loses-life'; whose: PlayerSelector }
  | { on: 'draws-card'; whose: PlayerSelector }
  | { on: 'sacrificed'; who: Selector };

/* -------------------------------------------------------------------------- */
/* Replacement events (CR 614)                                                */
/* -------------------------------------------------------------------------- */

export type ReplaceableEvent =
  | { on: 'enters'; who: Selector }
  | { on: 'damage'; to: Selector; from?: Selector; combatOnly?: boolean }
  | { on: 'draw'; whose: PlayerSelector }
  | { on: 'dies'; who: Selector }
  | { on: 'counter-placed'; target: Selector; counter: string }
  | { on: 'life-gain'; whose: PlayerSelector }
  | { on: 'life-loss'; whose: PlayerSelector }
  | { on: 'token-created'; whose: PlayerSelector }
  | { on: 'step'; step: Step; whose: PlayerSelector };

export type ReplacementResult =
  | { do: 'enters-tapped' }
  | { do: 'enters-with-counters'; counter: string; count: ValueExpr }
  | { do: 'enters-under-control'; controller: PlayerSelector }
  | { do: 'prevent'; amount: ValueExpr | 'all' }
  | { do: 'redirect'; to: PlayerSelector }
  /** Doubling Season, draw doublers, life doublers. */
  | { do: 'multiply'; factor: ValueExpr }
  /** "If it would die, exile it instead." */
  | { do: 'replace-zone'; to: Zone }
  | { do: 'skip' }
  /** "…and you gain 1 life" riders on an otherwise-unchanged event. */
  | { do: 'additional'; effects: Effect[] };

/* -------------------------------------------------------------------------- */
/* The effect vocabulary — closed, exhaustively switched                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything an ability can do. Closed on purpose: `runtime.ts` is the only
 * place this union is switched on, and that switch ends in `assertNever`, so
 * adding a member without handling it is a compile error and a thrown test.
 */
export type Effect =
  /* --- life and damage --- */
  | { do: 'gain-life'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'lose-life'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'set-life'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'damage'; to: Selector; amount: ValueExpr }
  | { do: 'damage-player'; who: PlayerSelector; amount: ValueExpr }
  | { do: 'poison'; who: PlayerSelector; amount: ValueExpr }

  /* --- cards and zones --- */
  | { do: 'draw'; who: PlayerSelector; count: ValueExpr }
  | { do: 'mill'; who: PlayerSelector; count: ValueExpr }
  | { do: 'discard'; who: PlayerSelector; count: ValueExpr; random?: boolean }
  | {
      do: 'move-zone';
      what: Selector;
      to: Zone;
      position?: 'top' | 'bottom' | number;
      tapped?: boolean;
    }
  | { do: 'destroy'; what: Selector }
  | { do: 'sacrifice'; who: PlayerSelector; what: CardFilter; count: ValueExpr }
  | { do: 'exile'; what: Selector }
  | {
      do: 'return-from';
      zone: Zone;
      who: PlayerSelector;
      what: CardFilter;
      count: ValueExpr;
      to: Zone;
    }
  | {
      do: 'search-library';
      who: PlayerSelector;
      what: CardFilter;
      count: ValueExpr;
      to: Zone;
      thenShuffle: boolean;
    }
  | { do: 'shuffle'; who: PlayerSelector }

  /* --- permanents --- */
  | { do: 'create-token'; who: PlayerSelector; token: TokenSpec; count: ValueExpr; tapped?: boolean }
  | { do: 'tap'; what: Selector }
  | { do: 'untap'; what: Selector }
  | { do: 'add-counters'; what: Selector; counter: string; count: ValueExpr }
  | { do: 'remove-counters'; what: Selector; counter: string; count: ValueExpr }
  | {
      do: 'pump';
      what: Selector;
      power: ValueExpr;
      toughness: ValueExpr;
      grant?: string[];
      duration: Duration;
    }
  | { do: 'gain-control'; what: Selector; who: PlayerSelector; duration: Duration }

  /* --- mana and table --- */
  | { do: 'add-mana'; who: PlayerSelector; mana: string }
  | { do: 'player-counter'; who: PlayerSelector; counter: string; count: ValueExpr }
  | { do: 'set-monarch'; who: PlayerSelector }
  | { do: 'lose-game'; who: PlayerSelector }
  | { do: 'win-game'; who: PlayerSelector }

  /* --- control flow --- */
  | { do: 'if'; condition: Condition; then: Effect[]; else?: Effect[] }
  /** Binds `{sel:'each'}` (or the each-player equivalent) inside `effects`. */
  | { do: 'for-each'; over: Selector; effects: Effect[] }
  | { do: 'for-each-player'; over: PlayerSelector; effects: Effect[] }
  | { do: 'repeat'; times: ValueExpr; effects: Effect[] }
  | {
      do: 'choose-mode';
      min: ValueExpr;
      max: ValueExpr;
      modes: Array<{ text: string; effects: Effect[] }>;
    }
  | { do: 'may'; who: PlayerSelector; text: string; effects: Effect[] }

  /* --- honesty --- */
  /**
   * THE LOAD-BEARING PIECE. When one clause of a multi-clause ability cannot be
   * modelled, the compiler emits it HERE, inside the ability, instead of
   * dropping it. The ability still runs its automated parts, the stack row
   * carries `needsManual`, and resolution emits a `NOTE` quoting the unhandled
   * clause verbatim. A half-resolved ability can never pass for a whole one.
   */
  | { do: 'manual'; text: string; hint?: string };

/* -------------------------------------------------------------------------- */
/* The ability union                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `approximate` still runs, but logs that it is an approximation. Anything
 * below `approximate` is not an `Ability` at all — it is an `UnparsedClause`.
 */
export type Confidence = 'exact' | 'approximate';

interface AbilityBase {
  /** Stable per card: 'a0', 'a1'. Appears in the action log and on the stack. */
  id: string;
  /** The verbatim oracle clause this came from. Shown on the stack; never invented. */
  text: string;
  confidence: Confidence;
}

export interface TriggeredAbility extends AbilityBase {
  kind: 'triggered';
  event: TriggerEvent;
  /** Defaults to `['battlefield']`. Graveyard and hand triggers say so. */
  activeZones?: Zone[];
  condition?: Condition;
  /** CR 603.4 — rechecked on resolution, not only on trigger. */
  interveningIf?: boolean;
  optional?: boolean;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
}

export interface ActivatedAbility extends AbilityBase {
  kind: 'activated';
  costs: Cost[];
  /** `['battlefield']` by default; cycling is `['hand']`. */
  activeZones?: Zone[];
  timing?: 'any' | 'sorcery';
  condition?: Condition;
  limit?: { per: 'turn' | 'game'; count: number };
  targets?: TargetSpec[];
  effects: Effect[];
  /** Mana abilities do not use the stack and cannot target (CR 605.1a). */
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
  /** "As ~ enters…" — applies to the source's own arrival. */
  selfReplacement?: boolean;
}

/** A spell's own effect: what an instant or sorcery does when it resolves. */
export interface SpellAbility extends AbilityBase {
  kind: 'spell';
  targets?: TargetSpec[];
  condition?: Condition;
  effects: Effect[];
}

export interface ManaAbility extends AbilityBase {
  kind: 'mana';
  costs: Cost[];
  activeZones?: Zone[];
  /** "{G}", "{C}{C}", or "any" for "one mana of any colour". */
  produces: string;
}

/**
 * A bare keyword. Kept as its own member rather than folded into `static` so
 * `keywords.ts` stays the single owner of the closed keyword set — this member
 * carries the word and nothing else, and the runtime never reinterprets it.
 */
export interface KeywordAbility extends AbilityBase {
  kind: 'keyword';
  keyword: string;
  /** "protection from red" → 'red'. */
  quality?: string;
}

export type Ability =
  | TriggeredAbility
  | ActivatedAbility
  | StaticAbility
  | ReplacementAbility
  | SpellAbility
  | ManaAbility
  | KeywordAbility;

export type AbilityKind = Ability['kind'];

/* -------------------------------------------------------------------------- */
/* Gaps — named so they cannot hide                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every reason a clause of oracle text can fail to become an `Ability`.
 *
 * These are stated out loud, one code each, so a gap is a countable fact rather
 * than a surprise at the table. `coverage.ts` histograms them across the
 * catalogue, so "what does the engine not do yet" is a query, not an opinion.
 */
export type GapReason =
  /** CR 613 layers 1 and 3: copy effects and text-changing effects. */
  | 'copy-layer'
  /** Cascade, suspend, flashback, alternative costs — modifications of *casting*. */
  | 'alt-cast'
  /** A static effect granting a whole nested ability, not just a keyword. */
  | 'granted-ability'
  /** CR 613.8 dependency ordering between continuous effects. */
  | 'layer-dependency'
  /** State-triggered abilities: "whenever you control no creatures". */
  | 'state-trigger'
  /** A duration outside the four we model. */
  | 'duration'
  /** Pile-splitting, naming a card, voting, choosing from a hidden hand. */
  | 'hidden-choice'
  /** Storm, magecraft counts, "if a creature died this turn" — needs event history. */
  | 'needs-history'
  /** Wishes, sideboard, companions, dungeons, the Ring, day/night. */
  | 'outside-game'
  /** "Damage can't be prevented" — a rule about rules, not about events. */
  | 'meta-replacement'
  /** Banding, and damage-assignment orders beyond our combat model. */
  | 'complex-combat'
  /** The authored entry's `oracleHash` no longer matches the card row. */
  | 'stale'
  /** Recognised as an ability, but this engine has no vocabulary for the effect. */
  | 'unmodelled';

export const GAP_REASONS: readonly GapReason[] = [
  'copy-layer',
  'alt-cast',
  'granted-ability',
  'layer-dependency',
  'state-trigger',
  'duration',
  'hidden-choice',
  'needs-history',
  'outside-game',
  'meta-replacement',
  'complex-combat',
  'stale',
  'unmodelled',
] as const;

export const GAP_REASON_LABELS: Record<GapReason, string> = {
  'copy-layer': 'Copy and text-changing effects (CR 613 layers 1 and 3)',
  'alt-cast': 'Alternative ways of casting a spell',
  'granted-ability': 'Granting a whole ability rather than a keyword',
  'layer-dependency': 'Dependency ordering between continuous effects (CR 613.8)',
  'state-trigger': 'State-triggered abilities',
  duration: 'A duration this engine does not model',
  'hidden-choice': 'A decision that cannot be offered as a closed list',
  'needs-history': 'Counting events earlier in the turn',
  'outside-game': 'Game objects outside the battlefield model',
  'meta-replacement': 'Effects that modify other replacement effects',
  'complex-combat': 'Combat beyond the current model',
  stale: 'Oracle text changed under an authored entry',
  unmodelled: 'No vocabulary for this effect yet',
};

export interface UnparsedClause {
  /** Verbatim, so the player reads what the card says and not a paraphrase. */
  text: string;
  reason: GapReason;
  /** Character span in the normalised oracle text. Drives clause accounting. */
  span: [number, number];
}

/* -------------------------------------------------------------------------- */
/* The top-level record                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `coverage` is DERIVED (see `registry.ts`), never hand-set:
 * `full` requires `unparsed.length === 0` AND no `{do:'manual'}` anywhere in the
 * ability tree. There is no way to spell "fully automated" while text was
 * dropped.
 */
export type Coverage = 'full' | 'partial' | 'manual' | 'none';

export type AbilitySource = 'compiler' | 'book' | 'book-partial';

export interface CardAbilities {
  /** Scryfall `oracle_id` where we have it, else the lower-cased card name. */
  oracleId: string;
  name: string;
  abilities: Ability[];
  /** NON-EMPTY means this card can never be reported as fully automated. */
  unparsed: UnparsedClause[];
  source: AbilitySource;
  /** Hash of the normalised oracle text this was derived from. */
  oracleHash: string;
  coverage: Coverage;
}

/* -------------------------------------------------------------------------- */
/* Exhaustiveness                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The discipline this module enforces on itself.
 *
 * `tsconfig.app.json` has `"strict": false`, so an unhandled union member does
 * not reliably fail to compile. Ending every `switch` over `Effect`, `Ability`,
 * `Selector`, `Modification`, `TriggerEvent`, `Cost` and friends with a call to
 * this turns "an ability that quietly did nothing" into a thrown error a test
 * catches. That is the whole bargain: loud beats silent.
 */
export function assertNever(value: never, context: string): never {
  const shown = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  throw new Error(`${context}: unhandled variant ${shown}`);
}

/**
 * Prove a value is the kind of thing that can go over a wire and into a jsonb
 * column: plain objects, arrays, strings, finite numbers, booleans and null.
 *
 * Called by the DSL tests on every construct. A closure or a `Map` sneaking
 * into an ability would break replay on a second client only — the worst kind
 * of bug to find late — so it is checked once, here, cheaply.
 */
export function assertSerialisable(value: unknown, path = '$'): void {
  if (value === null) return;
  const kind = typeof value;

  if (kind === 'string' || kind === 'boolean') return;
  if (kind === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error(`${path}: ${String(value)} is not a finite number`);
    }
    return;
  }
  if (kind === 'function') throw new Error(`${path}: functions are not serialisable`);
  if (kind === 'symbol') throw new Error(`${path}: symbols are not serialisable`);
  if (kind === 'bigint') throw new Error(`${path}: bigints are not JSON`);
  if (kind === 'undefined') {
    // `undefined` as an *own property value* is dropped by JSON.stringify, which
    // makes the round trip lossy. Optional fields must be absent, not undefined.
    throw new Error(`${path}: undefined is not serialisable — omit the key instead`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSerialisable(item, `${path}[${index}]`));
    return;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`${path}: ${(value as object).constructor?.name ?? 'class instance'} is not a plain object`);
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    assertSerialisable(item, `${path}.${key}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Small constructors — the tagger-style shorthand                            */
/* -------------------------------------------------------------------------- */

/*
 * These exist so hand-authored book entries read like the card and stay
 * diffable in review. They build literals and nothing else: no defaults are
 * hidden here that the interpreter would not also apply.
 */

export const YOU: PlayerSelector = { who: 'you' };
export const EACH_OPPONENT: PlayerSelector = { who: 'each-opponent' };
export const EACH_PLAYER: PlayerSelector = { who: 'each-player' };
export const SELF: Selector = { sel: 'self' };
export const TRIGGER_SOURCE: Selector = { sel: 'trigger-source' };

export function all(where: CardFilter, options: { zone?: Zone; controller?: PlayerSelector } = {}): Selector {
  const out: Selector = { sel: 'all', where };
  if (options.zone) (out as { zone?: Zone }).zone = options.zone;
  if (options.controller) (out as { controller?: PlayerSelector }).controller = options.controller;
  return out;
}

export function type(value: string): CardFilter {
  return { is: 'type', value: value.toLowerCase() };
}

export function subtype(value: string): CardFilter {
  return { is: 'subtype', value: value.toLowerCase() };
}

export function and(...of: CardFilter[]): CardFilter {
  return { is: 'and', of };
}

export function or(...of: CardFilter[]): CardFilter {
  return { is: 'or', of };
}

export function not(of: CardFilter): CardFilter {
  return { is: 'not', of };
}

/** "Creatures you control", the single most common selector on a card. */
export function creaturesYouControl(extra?: CardFilter): Selector {
  return all(extra ? and(type('creature'), extra) : type('creature'), { controller: YOU });
}

export function target(ref: number): Selector {
  return { sel: 'target', ref };
}
