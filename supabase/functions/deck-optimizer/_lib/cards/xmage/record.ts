/**
 * The card record. One shape, four consumers.
 *
 * Behaviour in this file is derived from XMage, which is MIT licensed,
 * Copyright (c) 2010 betasteward@gmail.com, https://github.com/magefree/mage.
 * Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * ## What this file is for
 *
 * `scripts/xmage/extract-effects.mjs` reads every XMage card file and keeps the
 * CONSTRUCTOR ARGUMENTS. That turns a card from a fingerprint into a recipe:
 *
 *     Armageddon   DestroyAllEffect(filter = StaticFilters.FILTER_LANDS)
 *     Wrath of God DestroyAllEffect(filter = StaticFilters.FILTER_PERMANENT_CREATURES,
 *                                   noRegen = true)
 *
 * This file is the shape that recipe lands in, and the shape four different
 * parts of the app read:
 *
 *   PLAY            what happens when this resolves
 *   DECK BUILDING   what this does for a list
 *   RECOMMENDATION  find me cards that do this
 *   OPTIMISATION    what this does better than that
 *
 * All four read the same `Invocation` nodes. Nothing is stored twice, so the
 * four views cannot drift apart. `roles.ts` derives the deck-builder view and
 * the search view from one rule table; `compare.ts` derives the optimisation
 * view; `lower.ts` derives the play view. Each is a pure function of a record.
 *
 * ## The three-state slot, which is the whole design
 *
 * Every argument position is one of exactly three things:
 *
 *   value    we know what this means in DeckMatrix terms
 *   carried  we know exactly what XMage wrote and have not yet said what it
 *            means. Work queued, and countable.
 *   hole     the card declares its own Java class. There is no shared meaning
 *            to map, so a person has to write it. Work required, and countable.
 *
 * That is the anti-overstatement device. Coverage has been overstated twice on
 * this project: once by measuring a 12,000 row slice of 34,088 cards, and once
 * by calling a card automated when ONE of its abilities compiled. Both mistakes
 * share a cause. The unit of honesty was the card. Here the unit is the SLOT,
 * and unknowns are localised to the slot that holds them. A card with one hole
 * is still fully useful to deck building, search and comparison, and precisely
 * broken for play. `coverage.ts` reports that as four separate numbers, never
 * one.
 *
 * ## Why the record is not a `dsl.ts` `Effect` tree
 *
 * `../abilities/dsl.ts` has a closed `Effect` union of about forty members. The
 * corpus invokes 2,405 distinct primitives, of which 723 are effect classes,
 * and `CreateTokenEffect` alone appears with 982 distinct argument shapes.
 * Storing the corpus as `Effect` means either exploding that union past the
 * point where a runtime can exhaustively switch it, or collapsing the remainder
 * into `{do:'manual'}`, which is the silent drop this project already fought.
 *
 * So `Effect` is demoted from STORAGE to RUNTIME TARGET. It is the OUTPUT of
 * `lower()`, not the input. Everything else in `dsl.ts`, meaning `CardFilter`,
 * `Selector`, `PlayerSelector`, `ValueExpr`, `Condition`, `Duration`, `Zone`,
 * `TokenSpec`, `Cost` and `TargetSpec`, is reused here verbatim and is the
 * normalisation target for `carried` slots. There is no second filter language
 * and no second value language.
 *
 * ## Serialisation
 *
 * Pure JSON, same contract as `dsl.ts`: no functions, no classes, no `Map`, no
 * `Date`. `assertSerialisable` from `../abilities/dsl.ts` applies unchanged.
 */

import type {
  CardFilter,
  Condition,
  Cost,
  Duration,
  ManaColor,
  PlayerSelector,
  Selector,
  Step,
  TokenSpec,
  ValueExpr,
  Zone,
} from '../abilities/dsl.ts';

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * A primitive's stable id, namespaced by where its meaning came from.
 *
 *   `xmage:DestroyAllEffect`  a class in the XMage engine, read in place
 *   `dm:destroy-all`          a DeckMatrix primitive with no XMage counterpart
 *   `local:WrathOfGodEffect`  a class the card file declares itself
 *
 * The namespace is not decoration. `xmage:` ids are shared across many cards,
 * so writing one lowering pays for every card that uses it, and the ranked work
 * order in `docs/engine/XMAGE-EXTRACTION.md` counts exactly that. `local:` ids
 * are used by one card each, so each one costs a person and buys one card. The
 * two must never be totalled together, and prefixing them differently is what
 * stops that happening by accident.
 */
export type PrimId = string;

/**
 * What a primitive IS, taken from XMage's own class hierarchy as resolved by
 * `scripts/xmage/index-engine.mjs`. Never guessed from the name.
 *
 * The census below is the count of INVOCATIONS across all 32,168 card files,
 * printed by `scripts/xmage/extract-effects.mjs`. It is here so a reader can
 * see which of these matter before touching any of them.
 */
export type PrimRole =
  | 'one-shot-effect' // 60,030
  | 'continuous-effect' // 32,711
  | 'static-ability' // 29,287
  | 'target' // 22,054
  | 'triggered-ability' // 18,040
  | 'filter' // 17,381
  | 'enum' // 16,768
  | 'cost' // 13,786
  | 'activated-ability' // 11,493
  | 'spell-ability' // 8,680
  | 'mana-cost' // 5,533
  | 'token' // 5,531
  | 'predicate' // 4,106
  | 'dynamic-value' // 3,497
  | 'mana-ability' // 2,961
  | 'condition' // 2,351
  | 'mode' // 1,050
  | 'watcher' // 686
  | 'counter' // 2
  | 'card-local'
  | 'other';

/* ------------------------------------------------------------------ *
 * Values: the DeckMatrix-native half of a slot
 * ------------------------------------------------------------------ */

/**
 * A value we have already said the meaning of.
 *
 * Deliberately small. Every member is either a scalar or a `dsl.ts` type, so
 * the reducer, the search index and the deck builder all read the same filter
 * language and the same arithmetic language. Adding a member here is a real
 * decision; adding a `carried` shape is not, which is the correct asymmetry.
 */
export type Value =
  | { k: 'int'; n: number }
  | { k: 'bool'; b: boolean }
  /** A mana string in Scryfall notation, `{2}{W}{W}`. Safe to copy: it is symbols, not rules text. */
  | { k: 'mana'; cost: string }
  /** A bare identifier we control the vocabulary of: a counter name, a keyword name. */
  | { k: 'name'; name: string }
  | { k: 'colors'; colors: ManaColor[] }
  /**
   * A set of objects. `filter` is the `dsl.ts` filter language, so this is the
   * same value a reducer would use to pick legal targets and the same value the
   * search index inverts. `controller` and `zone` ride along because XMage puts
   * them inside the filter as predicates and DeckMatrix puts them on the
   * selector.
   */
  | { k: 'objects'; filter: CardFilter; controller?: PlayerSelector; zone?: Zone }
  | { k: 'players'; who: PlayerSelector }
  | { k: 'selector'; sel: Selector }
  /** A quantity. A literal is `{k:'int'}`; this is the computed kind. */
  | { k: 'amount'; expr: ValueExpr }
  | { k: 'condition'; cond: Condition }
  | { k: 'duration'; duration: Duration }
  | { k: 'zone'; zone: Zone }
  | { k: 'step'; step: Step }
  | { k: 'token'; token: TokenSpec }
  | { k: 'cost'; cost: Cost }
  | { k: 'list'; items: Value[] }
  /** A nested construction whose primitive we keep as a primitive. */
  | { k: 'invoke'; invocation: Invocation };

/* ------------------------------------------------------------------ *
 * Carried: the faithful but not yet lowered half
 * ------------------------------------------------------------------ */

/**
 * Exactly what XMage wrote, in XMage's own words, with nothing thrown away.
 *
 * A `carried` slot is not a failure. It is the difference between this
 * extraction and the import-based one that preceded it: the old one recorded
 * `[DestroyAllEffect]` and dropped `FILTER_LANDS`, so fifty board wipes and
 * every mass land destruction spell became one indistinguishable signature.
 * Keeping the reference means the meaning can be supplied later, once, for
 * every card that shares it.
 */
export type Carried =
  /** `Zone.BATTLEFIELD`, `SetTargetPointer.PLAYER`, `TargetController.NOT_YOU`. */
  | { c: 'enum'; enumName: string; member: string }
  /** `StaticFilters.FILTER_PERMANENT_CREATURES`. `of` is the declared type of the constant. */
  | { c: 'const'; holder: string; field: string; of?: string }
  /** `TargetController.NOT_YOU.getControllerPredicate()` and the other 12,628 static factory calls. */
  | { c: 'factory'; on: string; method: string; args?: Slot[] }
  /** A construction whose primitive has no lowering yet. Its own slots are still resolved. */
  | { c: 'construct'; prim: PrimId; role: PrimRole; args: Slot[]; mods?: Mod[] }
  /**
   * A display string. Its CONTENTS are deliberately absent: those strings carry
   * Wizards of the Coast rules text, which is not XMage's to license. Rules text
   * comes from Scryfall's `oracle_text`. Only the length is kept, so a reader
   * can tell an empty string from a paragraph.
   */
  | { c: 'text'; length: number }
  /** A reference to the card's own constructor parameters, or to `this`. */
  | { c: 'self'; what: 'source' | 'owner' | 'set-info' | 'field'; field?: string }
  | { c: 'null' }
  | { c: 'class-literal'; cls: string }
  /** Another card by name, for the handful of cards that name one. */
  | { c: 'card-ref'; cls: string };

/* ------------------------------------------------------------------ *
 * Holes: the honest half
 * ------------------------------------------------------------------ */

/**
 * Why a slot has no value and no reference worth keeping.
 *
 * These are the reasons `scripts/xmage/extract-effects.mjs` reports, and the
 * counts it printed over all 32,168 files are on each line. They are ordered by
 * how many cards they block, because that is the order they are worth attacking
 * in.
 */
export type HoleReason =
  /** 10,538 cards. The card file declares its own Java class. Nothing shared to map. */
  | 'card-local-class'
  /** 1,114. An arithmetic expression over things the extractor could not evaluate. */
  | 'expression-arithmetic'
  /** 81. A method called on a receiver that was itself unresolved. */
  | 'call-on-unresolved'
  /** 74. A lambda body. */
  | 'lambda'
  /** 45 + 31 + 6. An identifier, holder or class the engine index does not know. */
  | 'unknown-symbol'
  /** 20. A unary expression the extractor does not fold. */
  | 'expression-unary'
  /** 12. An anonymous subclass with a body. */
  | 'anonymous-subclass'
  /** 10. A method reference. */
  | 'method-reference'
  /** 7. A bare method call with no resolvable receiver. */
  | 'bare-method-call'
  /**
   * Not from the extractor. A slot a person deliberately marked as needing a
   * ruling, so review decisions survive a re-extraction instead of being
   * silently re-derived.
   */
  | 'needs-ruling';

/**
 * A known unknown.
 *
 * `declared` is the DECLARED SUPERCLASS, and it is the field that makes a hole
 * useful rather than merely honest. Dockside Extortionist's token count is a
 * `DynamicValue`, so the record still knows the effect creates SOME number of
 * Treasure tokens, which is enough for the deck builder to call it ramp and for
 * search to find it, and not enough for the reducer to run it. The hole is in
 * the count, not in the card.
 */
export interface Hole {
  reason: HoleReason;
  /** The declared base type: `DynamicValue`, `Condition`, `OneShotEffect`, `TargetAdjuster`. */
  declared?: string;
  /** The card-local class name, so the person writing it knows what to open. */
  localName?: string;
}

/* ------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------ */

/**
 * One argument position.
 *
 * `name` is XMage's own constructor parameter name, read from the class's
 * signature by `scripts/xmage/index-engine.mjs`. That is why an argument list
 * comes out labelled rather than as an unlabelled tuple, and it is why a role
 * rule can say "the `filter` argument" instead of "argument 0".
 *
 * `of` is the declared parameter type. It is kept even when the slot resolves,
 * because it is what lets a hole be typed and what lets a lowering assert it
 * got the shape it expected.
 */
export interface Slot {
  name?: string;
  of?: string;
  /** Exactly one of these three is present. `slotState` is the accessor. */
  value?: Value;
  carried?: Carried;
  hole?: Hole;
}

export type SlotState = 'value' | 'carried' | 'hole';

export function slotState(slot: Slot): SlotState {
  if (slot.value !== undefined) return 'value';
  if (slot.carried !== undefined) return 'carried';
  return 'hole';
}

/** The named argument of an invocation, or `undefined`. Order-independent lookup. */
export function arg(invocation: Invocation, name: string): Slot | undefined {
  return invocation.args.find((a) => a.name === name);
}

/** The named argument's value, only if it resolved. Never guesses from a carried slot. */
export function argValue(invocation: Invocation, name: string): Value | undefined {
  return arg(invocation, name)?.value;
}

/* ------------------------------------------------------------------ *
 * Modifiers
 * ------------------------------------------------------------------ */

/**
 * A method called on a construction after it was built.
 *
 * 7,806 card files build their filter in a `static { filter.add(...) }` block
 * outside the constructor, so a reader that only looked at constructor
 * arguments would record "creature filter" for a quarter of the corpus and be
 * wrong about what it filters. The extractor replays those blocks; this is
 * where the result lands.
 *
 * `withInterveningIf` (880 uses) and `getModes.setMinModes` (160) arrive the
 * same way, which is why an intervening if and a modal minimum are modifiers
 * here rather than fields: they are not constructor arguments in the source and
 * pretending otherwise would need a second, inventive mapping step.
 */
export interface Mod {
  /** `add`, `withInterveningIf`, `getModes.setMaxModes`, `subtype.add`, `setPT`. */
  m: string;
  args: Slot[];
}

export function mod(node: { mods?: Mod[] }, name: string): Mod | undefined {
  return node.mods?.find((m) => m.m === name);
}

/* ------------------------------------------------------------------ *
 * Invocations: the universal node
 * ------------------------------------------------------------------ */

/**
 * One `new X(...)` from the card source, with its arguments kept.
 *
 * Abilities, effects, triggers, costs, targets, filters, tokens, conditions and
 * dynamic values are all this one shape. That is on purpose: one node type
 * means one walker, one resolver, and exactly one place where a slot can be
 * recorded as a hole. A design with a separate node per role has a separate
 * place per role for an unknown to go missing, and things that can go missing
 * in nine places go missing.
 *
 * `children` is the extractor's own sorting of the nested constructions by what
 * XMage did with them. It is a VIEW over the argument tree, not a second copy:
 * every child also appears inside `args`, and `coverage.ts` walks `args` only,
 * so nothing is counted twice.
 */
export interface Invocation {
  prim: PrimId;
  role: PrimRole;
  args: Slot[];
  mods?: Mod[];
  children?: InvocationChildren;
  /**
   * How confident the extractor is that it matched the right constructor
   * overload. `unique` means the class declares one constructor of that arity.
   * `by-type` means several matched and the argument types picked one.
   * `ambiguous-arity` means several matched and the names may be wrong, which
   * happens 1,882 times and is the reason this field is not optional in
   * practice: a role rule that reads a named argument must be able to check
   * that the name was not a coin toss.
   */
  /*
   * `names-agree` is the case worth separating out. Several overloads matched,
   * so WHICH constructor ran is genuinely unknown, but every candidate calls
   * the argument at that position the same thing: `CreateTokenEffect(Token,
   * int)` and `CreateTokenEffect(Token, DynamicValue)` both call the second
   * argument `amount`. The overload is ambiguous; the name is not. Collapsing
   * the two cases means either discarding a reliable name or trusting an
   * unreliable one, and Dockside Extortionist is the card that shows what that
   * costs: refuse the name and it stops being ramp.
   */
  paramMatch?:
    | 'unique'
    | 'by-type'
    | 'names-agree'
    | 'ambiguous-arity'
    | 'static-helper'
    | 'card-local';
}

export interface InvocationChildren {
  effects?: Invocation[];
  targets?: Invocation[];
  costs?: Invocation[];
  modes?: Invocation[];
}

/* ------------------------------------------------------------------ *
 * Abilities
 * ------------------------------------------------------------------ */

/**
 * How an ability gets to do anything. Deliberately the same five words the
 * comprehensive rules use, not XMage's class names, because this is the field
 * every consumer switches on and it should mean the rules thing.
 */
export type AbilityKind =
  | 'spell'
  | 'triggered'
  | 'activated'
  | 'static'
  | 'mana'
  | 'replacement'
  | 'keyword';

export interface AbilityRecord {
  /** Stable within the card: 'f0a0', 'f1a2'. Face index then ability index. */
  id: string;
  kind: AbilityKind;
  /**
   * The ability class itself, as an invocation. For a triggered ability this is
   * where the EVENT lives: `xmage:EntersBattlefieldTriggeredAbility`,
   * `xmage:SpellCastOpponentTriggeredAbility`. The event is not a separate
   * field because in the source it is not separate data, it is the class, and
   * inventing a field would mean inventing the mapping too.
   */
  via: Invocation;
  /** What this ability does on resolution, in order. */
  effects: Invocation[];
  /** What it needs before it can be put on the stack. */
  costs: Invocation[];
  /** What it must be pointed at. */
  targets: Invocation[];
  /** Modal alternatives. Mode 0 is `effects` itself when the card is modal. */
  modes?: ModeRecord[];
  /** `getModes.setMinModes` / `setMaxModes`, when the card sets them. Default 1 and 1. */
  modeLimits?: { min: number; max: number };
  /**
   * CR 603.4. Checked when the trigger would go on the stack AND again on
   * resolution. A separate field from a condition inside `effects` because the
   * two check at different times and conflating them changes what the card does.
   */
  interveningIf?: Slot;
  /** A keyword ability's name and parameter: `flying`, `ward {2}`, `annihilator 2`. */
  keyword?: { name: string; parameter?: Slot };
  /** True where XMage used a shared static helper rather than constructing the ability. */
  fromHelper?: string;
}

export interface ModeRecord {
  index: number;
  effects: Invocation[];
  targets: Invocation[];
}

/* ------------------------------------------------------------------ *
 * Faces
 * ------------------------------------------------------------------ */

/**
 * Which physical face. The extractor labels every ability with one of these,
 * and the counts over the corpus are: main 58,493, right 1,208, left 1,067,
 * adventure-spell 200.
 */
export type FaceKind = 'main' | 'left' | 'right' | 'adventure-spell';

export interface FaceRecord {
  index: number;
  kind: FaceKind;
  name: string;
  /** Printed mana cost of THIS face. A modal double-faced card has two. */
  mana: string | null;
  types: string[];
  subtypes: string[];
  supertypes: string[];
  /** Printed power and toughness, as printed strings so `*` survives. */
  pt?: { power: string; toughness: string };
  startingLoyalty?: string;
  abilities: AbilityRecord[];
}

/**
 * How the faces relate. Taken from the XMage base class the card extends
 * (`TransformingDoubleFacedCard`, `ModalDoubleFacedCard`, `SplitCard`,
 * `AdventureCard`, `MeldCard`), never inferred from the name.
 *
 * This matters to all four consumers and differently to each. Play needs to
 * know which face may be cast. Deck building needs to know that Agadeem's
 * Awakening counts as a land in the mana base AND as a reanimation spell.
 * Search must not return the back face for a query the front face does not
 * answer. Optimisation must compare an MDFC land against a land, not against a
 * sorcery.
 */
export type Layout =
  | 'normal'
  | 'transform'
  | 'modal-dfc'
  | 'split'
  | 'adventure'
  | 'meld'
  | 'flip'
  | 'other';

/* ------------------------------------------------------------------ *
 * Provenance
 * ------------------------------------------------------------------ */

/**
 * Where every part of this record came from, so a wrong record can be traced to
 * the run that produced it rather than argued about.
 */
export interface Provenance {
  /** The XMage class the behaviour was read from. */
  xmageClass: string;
  /** Repo-relative path inside the XMage clone. The clone is read in place and never vendored. */
  xmagePath: string;
  /** The commit read. */
  xmageCommit: string;
  /** The script that produced this record, and when it ran. */
  builtBy: string;
  builtAt: string;
  /**
   * How the XMage class was matched to a Scryfall oracle id, carried through
   * from `scripts/coverage/.data/join.json`. A record built on a fuzzy join is
   * a record that may describe a different card, and that has to be visible.
   */
  join: 'exact' | 'normalised' | 'alias' | 'none';
}

/* ------------------------------------------------------------------ *
 * The record
 * ------------------------------------------------------------------ */

export interface CardRecord {
  /** Scryfall `oracle_id`. Printed truth is Scryfall's; behaviour is XMage's. */
  oracleId: string;
  /** Full name including `//` for multi-face cards, as Scryfall spells it. */
  name: string;
  layout: Layout;
  faces: FaceRecord[];
  /**
   * Format legality that the record itself depends on. Only Commander is kept
   * here because it is the only one that changes what the app should recommend;
   * everything else stays in the Scryfall row. `false` for Dockside
   * Extortionist, which is banned, and that is why it must not head a
   * recommendation list.
   */
  commanderLegal: boolean;
  provenance: Provenance;
}

/* ------------------------------------------------------------------ *
 * Walkers
 *
 * These exist so "does this record contain something we cannot do yet" is a
 * question the code answers, not a property somebody remembers to re-check.
 * Every container is listed once, here, and `coverage.ts` reads nothing else.
 * ------------------------------------------------------------------ */

/** Every invocation reachable from a slot, including through carried constructions. */
export function invocationsInSlot(slot: Slot): Invocation[] {
  const out: Invocation[] = [];
  if (slot.value) out.push(...invocationsInValue(slot.value));
  if (slot.carried && slot.carried.c === 'construct') {
    // A carried construction is still a real node with real arguments. Skipping
    // it would under-count both the work queued and the holes inside it.
    out.push({
      prim: slot.carried.prim,
      role: slot.carried.role,
      args: slot.carried.args,
      mods: slot.carried.mods,
    });
  }
  if (slot.carried && slot.carried.c === 'factory' && slot.carried.args) {
    for (const inner of slot.carried.args) out.push(...invocationsInSlot(inner));
  }
  return out;
}

function invocationsInValue(value: Value): Invocation[] {
  switch (value.k) {
    case 'invoke':
      return [value.invocation];
    case 'list':
      return value.items.flatMap(invocationsInValue);
    default:
      return [];
  }
}

/**
 * Every slot in an invocation tree, depth first, including slots inside carried
 * constructions and inside modifiers.
 *
 * `children` IS walked, but only because the builder shares one object between
 * `args` and `children` and the visit set is keyed on object identity. A child
 * added to an ability by a method call rather than by a constructor argument
 * appears only in `children`, so skipping it would lose real effects; a child
 * that came from an argument appears in both, so walking it naively would count
 * every nested effect in the corpus twice. Identity is what makes both correct
 * at once.
 */
export function slotsIn(invocation: Invocation): Slot[] {
  const out: Slot[] = [];
  const visited = new Set<Invocation>();
  const visit = (node: Invocation): void => {
    if (visited.has(node)) return;
    visited.add(node);
    for (const slot of node.args) {
      out.push(slot);
      for (const inner of invocationsInSlot(slot)) visit(inner);
    }
    for (const m of node.mods ?? []) {
      for (const slot of m.args) {
        out.push(slot);
        for (const inner of invocationsInSlot(slot)) visit(inner);
      }
    }
    const children = node.children;
    if (children) {
      for (const list of [children.effects, children.targets, children.costs, children.modes]) {
        for (const child of list ?? []) visit(child);
      }
    }
  };
  visit(invocation);
  return out;
}

/** Every invocation an ability owns, the ability class itself included. */
export function invocationsInAbility(ability: AbilityRecord): Invocation[] {
  const roots: Invocation[] = [
    ability.via,
    ...effectRootsOf(ability),
    ...ability.costs,
    ...targetRootsOf(ability),
  ];
  for (const slot of [ability.interveningIf, ability.keyword?.parameter]) {
    if (slot) roots.push(...invocationsInSlot(slot));
  }
  const seen = new Set<Invocation>();
  const out: Invocation[] = [];
  const take = (node: Invocation): void => {
    if (seen.has(node)) return;
    seen.add(node);
    out.push(node);
  };
  for (const root of roots) {
    take(root);
    for (const slot of slotsIn(root)) {
      for (const inner of invocationsInSlot(slot)) take(inner);
    }
  }
  return out;
}

/**
 * Every slot an ability owns, each counted once. The denominator for that
 * ability's slot census.
 *
 * The deduplication is not tidiness, it is correctness.
 * `EntersBattlefieldTriggeredAbility(new CreateTokenEffect(...))` puts the
 * effect BOTH in the ability constructor's arguments and in the extraction's
 * `effects` list, because those are two true statements about one construction.
 * The builder shares a single object between them, so object identity is what
 * tells the walker it has already been here. Without it every nested effect in
 * the corpus is counted twice and every ratio taken over the census is wrong.
 * The size of that error is measured rather than guessed: over all 32,168 cards
 * `scripts/xmage/build-records.mjs` normalises 186,362 slot positions and the
 * deduplicated census counts 184,524 distinct slots.
 */
export function slotsInAbility(ability: AbilityRecord): Slot[] {
  const seen = new Set<Slot>();
  const out: Slot[] = [];
  const take = (slots: Slot[]): void => {
    for (const slot of slots) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      out.push(slot);
    }
  };
  for (const root of [
    ability.via,
    ...effectRootsOf(ability),
    ...ability.costs,
    ...targetRootsOf(ability),
  ]) {
    take(slotsIn(root));
  }
  if (ability.interveningIf) {
    take([ability.interveningIf]);
    for (const inner of invocationsInSlot(ability.interveningIf)) take(slotsIn(inner));
  }
  if (ability.keyword?.parameter) take([ability.keyword.parameter]);
  return out;
}

/**
 * The effect trees an ability actually offers, counted once.
 *
 * A modal ability's mode 0 IS its own `effects` list, because that is how XMage
 * builds one: the first mode is the spell ability itself and `addMode` appends
 * the rest. Walking `effects` and then walking every mode counts mode 0 twice,
 * which made Cryptic Command report "counterspell" twice and would have
 * inflated every per-role total taken over the catalogue. One accessor, so the
 * mistake has one place to be made.
 */
export function effectRootsOf(ability: AbilityRecord): Invocation[] {
  if (ability.modes && ability.modes.length > 0) return ability.modes.flatMap((m) => m.effects);
  return ability.effects;
}

/** The targets an ability offers, modes included, counted once. */
export function targetRootsOf(ability: AbilityRecord): Invocation[] {
  if (ability.modes && ability.modes.length > 0) return ability.modes.flatMap((m) => m.targets);
  return ability.targets;
}

/** Every ability across every face, in face order. */
export function abilitiesOf(record: CardRecord): AbilityRecord[] {
  return record.faces.flatMap((f) => f.abilities);
}

/** Every slot in the record. The denominator for the card's slot census. */
export function slotsInRecord(record: CardRecord): Slot[] {
  return abilitiesOf(record).flatMap(slotsInAbility);
}

/**
 * Every `local:` primitive the record names.
 *
 * A card-local class can arrive two ways and they look different in the record.
 * As an ARGUMENT it becomes a `hole` slot, because there is a named parameter
 * with nothing in it: Dockside Extortionist's `amount`. As the EFFECT ITSELF it
 * becomes an `Invocation` with a `local:` primitive and no arguments, because
 * the card wrote its own effect class and passed it straight in: Rhystic
 * Study's `RhysticStudyDrawEffect`.
 *
 * Counting only holes therefore undercounts the hand-written tail by thousands
 * of cards. Both forms mean the same thing, that nothing shared can supply this,
 * so both have to be asked about together, and this is the accessor that does
 * it.
 */
export function localPrimitivesIn(record: CardRecord): PrimId[] {
  const out = new Set<PrimId>();
  for (const ability of abilitiesOf(record)) {
    for (const invocation of invocationsInAbility(ability)) {
      if (invocation.prim.startsWith('local:')) out.add(invocation.prim);
    }
  }
  return [...out];
}

/**
 * True when nothing in this record needs a person.
 *
 * This is the ceiling test. A shared XMage primitive is used by many cards, so
 * writing its meaning once pays many times over. A card-local class is used by
 * one card, so writing it pays once. The set of cards with neither a hole nor a
 * `local:` primitive is the most that shared work can ever reach, and stating
 * it is what stops "we will automate the catalogue" being said again.
 */
export function reachableBySharedWork(record: CardRecord): boolean {
  if (localPrimitivesIn(record).length > 0) return false;
  return slotsInRecord(record).every((slot) => slot.hole === undefined);
}
