/**
 * XMage `Condition` classes as `dsl.ts` `Condition` values.
 *
 * Behaviour here is derived from **XMage**, which is MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The clone is read in place, outside this repository, and nothing from it is
 * vendored. XMage's display strings are never copied: they carry Wizards of the
 * Coast rules text, which is not XMage's to license. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * ## Why this file exists before either class that needs it
 *
 * `docs/engine/EFFECT-CLASS-ORDER.md` ranks `ConditionalContinuousEffect` first
 * at 310 movable cards and `ConditionalOneShotEffect` third at 236. Both are
 * one shared class standing in front of a second table, and porting the outer
 * class without the inner one produces the worst outcome available: a card that
 * lowers, runs, and applies its effect unconditionally. Ashnod's Battle Gear
 * pumps while UNTAPPED, an Anurid Barkripper is 4/4 with an empty graveyard.
 * Those cards RUN and are WRONG, which is the failure mode the whole port is
 * arranged to prevent.
 *
 * So the condition table comes first, and anything it cannot say is refused by
 * name with the reason, exactly as `keywords.ts` and `modifications.ts` do.
 *
 * ## The census this was written against
 *
 * `scripts/xmage/condition-census.mjs` reads the `condition` slot of every
 * conditional carrier in the corpus. It found 138 distinct condition keys over
 * 1,406 shared card-slots plus 186 card-local holes. The counts on each entry
 * below are that measurement: CARDS, not invocations.
 *
 * The curve is the same shape as everything else in this port. The head is
 * `PermanentsOnTheBattlefieldCondition` at 274 cards; the median entry is worth
 * one card. This file writes the head and names the rest.
 *
 * ## A condition arrives in three shapes and they are not interchangeable
 *
 *   `value.k === 'invoke'`   a constructed condition with arguments
 *   `carried.c === 'enum'`   a singleton, `MyTurnCondition.instance`
 *   `carried.c === 'const'`  a shared static field
 *
 * plus `hole`, which is a `Condition` class the card file declares for itself
 * and is not shared work. `lowerCondition` takes the SLOT rather than an
 * `Invocation` for that reason.
 */

import type { CardFilter, Cmp, Condition, PlayerSelector, Selector, Step } from '../abilities/dsl.ts';
import { type Invocation, type Slot, arg } from './record.ts';
import { XMAGE_COUNTERS } from './counters.generated.ts';

/* ------------------------------------------------------------------ *
 * Argument readers
 * ------------------------------------------------------------------ */

/**
 * XMage's `ComparisonType` as a `dsl.ts` `Cmp`.
 *
 * The mapping is read off `ComparisonType.compare`, not off the member names:
 * `OR_LESS` is `<=` and `FEWER_THAN` is `<`, and a reader who guessed from the
 * names alone would have an even chance of putting a threshold one off.
 */
const COMPARISON: Record<string, Cmp> = {
  FEWER_THAN: 'lt',
  OR_LESS: 'lte',
  EQUAL_TO: 'eq',
  MORE_THAN: 'gt',
  OR_GREATER: 'gte',
};

/** The `ComparisonType` on a slot, or `undefined` when the slot is absent. `null` means present and unreadable. */
function comparison(invocation: Invocation, name: string): Cmp | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  if (slot.carried?.c !== 'enum' || slot.carried.enumName !== 'ComparisonType') return null;
  return COMPARISON[slot.carried.member] ?? null;
}

function int(invocation: Invocation, name: string): number | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  return slot.value?.k === 'int' ? slot.value.n : null;
}

function bool(invocation: Invocation, name: string): boolean | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  return slot.value?.k === 'bool' ? slot.value.b : null;
}

/**
 * A filter argument as a selector over one zone.
 *
 * Returns `null` when the slot is present and is not a resolved filter, which
 * is a refusal. A filter this port could not read is a filter that would widen
 * to "every permanent" if it were dropped, and "you control an artifact" is not
 * a conservative reading of "you control an artifact creature".
 */
function objectsSelector(
  invocation: Invocation,
  name: string,
  zone: 'battlefield' | 'graveyard',
  controller: PlayerSelector | undefined,
): Selector | null | undefined {
  const slot = arg(invocation, name);
  if (!slot) return undefined;
  if (slot.value?.k !== 'objects') return null;
  const sel: Selector = { sel: 'all', where: slot.value.filter, zone: slot.value.zone ?? zone };
  const own = slot.value.controller;
  if (controller) {
    // XMage ADDS a controller predicate to a copy of the filter. If the filter
    // already carried a different one the two contradict and the condition can
    // never hold, so it refuses rather than picking a winner.
    if (own && JSON.stringify(own) !== JSON.stringify(controller)) return null;
    (sel as { controller?: PlayerSelector }).controller = controller;
  } else if (own) {
    (sel as { controller?: PlayerSelector }).controller = own;
  }
  return sel;
}

/** "You control at least one X", the shape most of the enum conditions reduce to. */
const youControl = (what: CardFilter, atLeast = 1): Condition => ({
  if: 'controls',
  who: { who: 'you' },
  what,
  cmp: 'gte',
  value: atLeast,
});

/** Cards in a zone, counted rather than filtered. */
const cardsIn = (zone: 'hand' | 'graveyard' | 'library', cmp: Cmp, count: number): Condition => ({
  if: 'value',
  a: { v: 'cards-in', zone, of: { who: 'you' } },
  cmp,
  b: count,
});

const CREATURE: CardFilter = { is: 'type', value: 'Creature' };
const SELF: Selector = { sel: 'self' };
const ATTACHED: Selector = { sel: 'attached' };

/**
 * `SubType.AHN_CROP` as the subtype `dsl.ts` spells. The same transform
 * `scripts/xmage/build-records.mjs` applies where a `SubType` reaches a filter,
 * kept identical on purpose: two spellings of one subtype is a filter that
 * matches nothing, silently.
 */
function subType(member: string): string {
  return member
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/** Every slot of a varargs argument, in order. `arg` returns only the first. */
function allArgs(invocation: Invocation, name: string): Slot[] {
  return invocation.args.filter((a) => a.name === name);
}

/** A list of `SubType` enum slots as "is one of these subtypes". */
function anySubtype(slots: Slot[]): CardFilter | null {
  const parts: CardFilter[] = [];
  for (const slot of slots) {
    if (slot.carried?.c !== 'enum' || slot.carried.enumName !== 'SubType') return null;
    parts.push({ is: 'subtype', value: subType(slot.carried.member) });
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : { is: 'or', of: parts };
}

const OBJECT_COLOR: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
  WHITE: 'W',
  BLUE: 'U',
  BLACK: 'B',
  RED: 'R',
  GREEN: 'G',
};

/**
 * XMage's `PhaseStep` as the `Step` `dsl.ts` names. Only the members whose
 * meaning is identical are here; XMage's combat phases have a different
 * granularity and a near-miss on a step is an ability that fires in the wrong
 * window.
 */
const PHASE_STEP: Record<string, Step> = {
  UNTAP: 'untap',
  UPKEEP: 'upkeep',
  DRAW: 'draw',
  PRECOMBAT_MAIN: 'precombat_main',
  BEGIN_COMBAT: 'begin_combat',
  DECLARE_ATTACKERS: 'declare_attackers',
  DECLARE_BLOCKERS: 'declare_blockers',
  COMBAT_DAMAGE: 'combat_damage',
  END_COMBAT: 'end_combat',
  POSTCOMBAT_MAIN: 'postcombat_main',
  END_TURN: 'end',
  CLEANUP: 'cleanup',
};

/* ------------------------------------------------------------------ *
 * The singletons
 * ------------------------------------------------------------------ */

/**
 * Conditions XMage spells as an enum singleton, so there are no arguments to
 * read and the whole meaning is in the class. Keyed by `enumName`, and where
 * the enum has real members the member is part of the key.
 *
 * Counts are CARDS carrying that condition, from `condition-census.mjs`.
 */
export const CONDITION_SINGLETONS: Record<string, Condition> = {
  /** 100 cards. */
  'MyTurnCondition.instance': { if: 'your-turn' },
  /** 10 cards. */
  'NotMyTurnCondition.instance': { if: 'not', of: { if: 'your-turn' } },
  /**
   * "The active player is one of my opponents". In a two-player game that is
   * the negation of `MyTurnCondition`, and in a multiplayer game it still is,
   * because every player at the table is either you or an opponent. There is no
   * third case for a Commander pod, so this is exact rather than an
   * approximation.
   */
  'OnOpponentsTurnCondition.instance': { if: 'not', of: { if: 'your-turn' } },

  /** 77 cards. Seven or more cards in your graveyard, counted whole, not filtered. */
  'ThresholdCondition.instance': cardsIn('graveyard', 'gte', 7),
  /** 16 cards. */
  'HellbentCondition.instance': cardsIn('hand', 'eq', 0),
  /** 5 cards. */
  'HeckbentCondition.instance': cardsIn('hand', 'lte', 1),

  /** 21 cards. */
  'MetalcraftCondition.instance': youControl({ is: 'type', value: 'Artifact' }, 3),
  /**
   * 15 cards. `countAll` filters by the source's controller, checked in
   * `Battlefield.java`, so this really is "you control" and not "there is".
   */
  'FerociousCondition.instance': youControl(
    { is: 'and', of: [CREATURE, { is: 'power', cmp: 'gte', value: 4 }] },
    1,
  ),
  /** 11 cards. Two or more instant and/or sorcery cards in YOUR graveyard. */
  'SpellMasteryCondition.instance': {
    if: 'count',
    of: {
      sel: 'all',
      where: { is: 'or', of: [{ is: 'type', value: 'Instant' }, { is: 'type', value: 'Sorcery' }] },
      zone: 'graveyard',
      controller: { who: 'you' },
    },
    cmp: 'gte',
    value: 2,
  },

  /** 8 cards. */
  'FatefulHourCondition.instance': { if: 'value', a: { v: 'life', of: { who: 'you' } }, cmp: 'lte', b: 5 },

  /**
   * 45 cards between the two members. "The source is tapped."
   *
   * This is the shape `{if:'matches'}` was added to `dsl.ts` for, and the whole
   * family below is the same one question about a named permanent: is IT this
   * way. `{if:'count'}` cannot ask it, because there is no `CardFilter` member
   * meaning "is the source", so before `{if:'matches'}` existed the only honest
   * answer was to refuse.
   */
  'SourceTappedCondition.TAPPED': { if: 'matches', of: SELF, what: { is: 'tapped' } },
  'SourceTappedCondition.UNTAPPED': { if: 'matches', of: SELF, what: { is: 'untapped' } },
  /** 14 cards. */
  'SourceAttackingCondition.instance': { if: 'matches', of: SELF, what: { is: 'attacking' } },
};

/* ------------------------------------------------------------------ *
 * The constructed conditions
 * ------------------------------------------------------------------ */

export type ConditionRule = (invocation: Invocation) => Condition | null;

/**
 * Counts are CARDS, from `scripts/xmage/condition-census.mjs`, over the whole
 * 32,168-file corpus.
 */
export const CONDITION_RULES: Record<string, ConditionRule> = {
  /**
   * 274 cards, the head of the whole list.
   *
   * Four constructors, and the defaults are the entire content of this entry:
   * `onlyControlled` defaults to TRUE and the comparison defaults to
   * `MORE_THAN 0`. So the one-argument `new PermanentsOnTheBattlefieldCondition(
   * FILTER_CREATURE)` means "you control at least one creature", and reading it
   * as "there is at least one creature" would switch the ability on for every
   * board with any creature on it at all. Checked in
   * `PermanentsOnTheBattlefieldCondition.java`.
   */
  'xmage:PermanentsOnTheBattlefieldCondition': (invocation) => {
    const onlyControlled = bool(invocation, 'onlyControlled');
    if (onlyControlled === null) return null;
    const of = objectsSelector(
      invocation,
      'filter',
      'battlefield',
      onlyControlled === false ? undefined : { who: 'you' },
    );
    if (!of) return null;
    const cmp = comparison(invocation, 'type');
    if (cmp === null) return null;
    const count = int(invocation, 'count');
    if (count === null) return null;
    return { if: 'count', of, cmp: cmp ?? 'gt', value: count ?? 0 };
  },

  /**
   * 75 cards. Counters on the source itself.
   *
   * `SourceHasCounterCondition(counterType)` is `OR_GREATER 1`, the two-argument
   * form is `OR_GREATER amount`, and only the three-argument form carries a
   * comparison. Read off the constructor chain in the Java, because
   * `EQUAL_TO 0` is a real and common shape here ("as long as there are no
   * depletion counters on it") and defaulting a missing comparison to equality
   * would inverse those cards.
   */
  'xmage:SourceHasCounterCondition': (invocation) => {
    const counterSlot = arg(invocation, 'counterType');
    if (counterSlot?.carried?.c !== 'enum' || counterSlot.carried.enumName !== 'CounterType') return null;
    const counter = XMAGE_COUNTERS[counterSlot.carried.member];
    if (!counter) return null;
    const cmp = comparison(invocation, 'type');
    if (cmp === null) return null;
    const value = int(invocation, 'value');
    const amount = int(invocation, 'amount');
    if (value === null || amount === null) return null;
    return {
      if: 'value',
      a: { v: 'counters', of: { sel: 'self' }, counter },
      cmp: cmp ?? 'gte',
      b: value ?? amount ?? 1,
    };
  },

  /**
   * 22 cards. Cards in YOUR graveyard, `>= value`, optionally filtered.
   *
   * The comparison is fixed at `>=` in the Java, so there is none to read.
   * Without a filter this counts the graveyard whole, which is `{v:'cards-in'}`
   * and is cheaper than a selector over every card in it.
   */
  'xmage:CardsInControllerGraveyardCondition': (invocation) => {
    const value = int(invocation, 'value');
    if (value === null || value === undefined) return null;
    const of = objectsSelector(invocation, 'filter', 'graveyard', { who: 'you' });
    if (of === null) return null;
    if (of === undefined) return cardsIn('graveyard', 'gte', value);
    return { if: 'count', of, cmp: 'gte', value };
  },

  /**
   * 15 cards, and only in its default shape.
   *
   * XMage asks the question PER OPPONENT and answers true if ANY opponent
   * satisfies it. `{who:'each-opponent'}` on a selector is the UNION of the
   * opponents' permanents, and the two agree only when the test is "at least
   * one": three opponents with one artifact each is a union of three, which
   * satisfies "an opponent controls three or more" when no opponent does.
   *
   * So the default `MORE_THAN 0` constructor is exact and every other shape is
   * refused rather than approximated. That is 15 of the 16 cards using this.
   */
  'xmage:OpponentControlsPermanentCondition': (invocation) => {
    const cmp = comparison(invocation, 'type');
    const count = int(invocation, 'count');
    if (cmp === null || count === null) return null;
    if (cmp !== undefined && !(cmp === 'gt' && count === 0)) return null;
    if (count !== undefined && count !== 0) return null;
    const of = objectsSelector(invocation, 'filter', 'battlefield', { who: 'each-opponent' });
    if (!of) return null;
    return { if: 'count', of, cmp: 'gt', value: 0 };
  },

  /**
   * 9 cards. Only `TargetController.YOU`, which is the default.
   *
   * `{v:'life'}` SUMS over the players its selector resolves to, so
   * `{who:'each-opponent'}` would answer "the opponents have 60 life between
   * them" where XMage asks "does ANY opponent have 25 or more". Those are
   * different questions and the sum is the wrong one, so the OPPONENT and ANY
   * forms refuse.
   */
  'xmage:LifeCompareCondition': (invocation) => {
    const who = arg(invocation, 'targetController');
    if (who?.value?.k !== 'players' || who.value.who.who !== 'you') return null;
    const cmp = comparison(invocation, 'comparisonType');
    if (!cmp) return null;
    const amount = int(invocation, 'amount');
    if (amount === null || amount === undefined) return null;
    return { if: 'value', a: { v: 'life', of: { who: 'you' } }, cmp, b: amount };
  },

  /** 8 cards, `TargetController.YOU` only, for the same reason as above. */
  'xmage:CardsInHandCondition': (invocation) => {
    const who = arg(invocation, 'targetController');
    if (who && !(who.value?.k === 'players' && who.value.who.who === 'you')) return null;
    const cmp = comparison(invocation, 'type');
    if (!cmp) return null;
    const count = int(invocation, 'count');
    if (count === null || count === undefined) return null;
    return cardsIn('hand', cmp, count);
  },

  /**
   * 5 cards. An EXACT count, not a threshold: "as long as you control exactly
   * one creature". The comparison is `==` in the Java with no argument for it.
   */
  'xmage:CreatureCountCondition': (invocation) => {
    const who = arg(invocation, 'targetController');
    if (who?.value?.k !== 'players' || who.value.who.who !== 'you') return null;
    const count = int(invocation, 'creatureCount');
    if (count === null || count === undefined) return null;
    const of = objectsSelector(invocation, 'filter', 'battlefield', { who: 'you' }) ?? {
      sel: 'all' as const,
      where: CREATURE,
      zone: 'battlefield' as const,
      controller: { who: 'you' as const },
    };
    if (of === null) return null;
    return { if: 'count', of, cmp: 'eq', value: count };
  },

  /* ---------------- the attached-to family ----------------
   *
   * Four classes, one question: does the permanent this aura or equipment is
   * attached to match a filter. `{sel:'attached'}` names that permanent and
   * `{if:'matches'}` asks the question about it.
   *
   * Every one of them answers FALSE when nothing is attached, because
   * `resolveSelector` returns an empty list and `some` on an empty list is
   * false. That is the same answer XMage gives when `getAttachedTo` is null,
   * so the edge case is exact rather than approximated.
   * -------------------------------------------------------- */

  /** 33 cards. */
  'xmage:AttachedToMatchesFilterCondition': (invocation) => {
    const slot = arg(invocation, 'filter');
    if (slot?.value?.k !== 'objects') return null;
    return { if: 'matches', of: ATTACHED, what: slot.value.filter };
  },

  /**
   * 13 cards. The filter XMage builds is `FilterCreaturePermanent` PLUS the
   * colour, so the enchanted permanent has to be a creature as well. Dropping
   * the creature half would let Clout of the Dominus read an enchanted land as
   * blue.
   */
  'xmage:EnchantedCreatureColorCondition': (invocation) => {
    const slot = arg(invocation, 'color');
    const member =
      slot?.carried?.c === 'const' && slot.carried.holder === 'ObjectColor'
        ? slot.carried.field
        : slot?.carried?.c === 'enum' && slot.carried.enumName === 'ObjectColor'
          ? slot.carried.member
          : undefined;
    const color = member ? OBJECT_COLOR[member] : undefined;
    if (!color) return null;
    return { if: 'matches', of: ATTACHED, what: { is: 'and', of: [CREATURE, { is: 'color', value: color }] } };
  },

  /** 5 cards. Same class shape, subtype instead of colour, creature half kept. */
  'xmage:EnchantedCreatureSubtypeCondition': (invocation) => {
    const what = anySubtype(allArgs(invocation, 'string'));
    if (!what) return null;
    return { if: 'matches', of: ATTACHED, what: { is: 'and', of: [CREATURE, what] } };
  },

  /**
   * 10 cards. Varargs, and "any of these subtypes" rather than all of them:
   * XMage returns true on the FIRST match. A card that wants Human OR Angel
   * read as Human AND Angel matches nothing.
   *
   * No creature half here, unlike the two above: `EquippedHasSubtypeCondition`
   * checks `hasSubtype` on the attached permanent directly and builds no filter.
   */
  'xmage:EquippedHasSubtypeCondition': (invocation) => {
    const what = anySubtype(allArgs(invocation, 'subTypes'));
    if (!what) return null;
    return { if: 'matches', of: ATTACHED, what };
  },

  /** 9 cards. The same question about the SOURCE rather than what it is on. */
  'xmage:SourceMatchesFilterCondition': (invocation) => {
    const slot = arg(invocation, 'filter');
    if (slot?.value?.k !== 'objects') return null;
    return { if: 'matches', of: SELF, what: slot.value.filter };
  },

  /**
   * 6 cards. The ability's FIRST target, `{sel:'target', ref:0}`.
   *
   * Refusing would be safe and this does not, because the ref is checked: an
   * effect reading a target the ability does not announce is caught by
   * `danglingTargetRef` in `lower.ts` before the card is emitted, so a
   * condition reading ref 0 on an ability with no targets cannot ship.
   */
  'xmage:TargetHasSubtypeCondition': (invocation) => {
    const what = anySubtype(allArgs(invocation, 'subtypes'));
    if (!what) return null;
    return { if: 'matches', of: { sel: 'target', ref: 0 }, what };
  },

  /**
   * `IsStepCondition`. Small on its own and cheap, and it appears inside
   * `CompoundCondition`, which is where refusing it would cost the compound.
   * `onlyDuringYourSteps` defaults to TRUE.
   */
  'xmage:IsStepCondition': (invocation) => {
    const slot = arg(invocation, 'phaseStep');
    if (slot?.carried?.c !== 'enum' || slot.carried.enumName !== 'PhaseStep') return null;
    const step = PHASE_STEP[slot.carried.member];
    if (!step) return null;
    const yours = bool(invocation, 'onlyDuringYourSteps');
    if (yours === null) return null;
    const isStep: Condition = { if: 'step', is: [step] };
    return yours === false ? isStep : { if: 'and', of: [isStep, { if: 'your-turn' }] };
  },
};

/* ------------------------------------------------------------------ *
 * What this table will not say, and why
 * ------------------------------------------------------------------ */

/**
 * Conditions deliberately absent. Counts are cards, from the same census.
 *
 * A condition that is merely missing looks like work nobody got to. A condition
 * named here is work somebody decided against with the reason attached, and the
 * next person does not rediscover it. This is the same contract
 * `REFUSED_KEYWORDS` and `REFUSED_MODIFICATIONS` keep.
 */
export const REFUSED_CONDITIONS: Record<string, string> = {
  'xmage:EnchantedSourceCondition':
    '10 cards. COUNTS the enchantments attached to the source, which is the one member of this family `{if:"matches"}` does not reach. Attachments run one way in `dsl.ts`: a card knows what it is attached TO, and nothing asks what is attached to it.',
  'EquippedSourceCondition.instance': '15 cards. Same as above: "is something attached to me", asked from the wrong end.',
  'DeliriumCondition.instance':
    '33 cards. Four or more CARD TYPES among cards in your graveyard. `ValueExpr` counts cards and counts players; it cannot count distinct types of a thing.',
  'MorbidCondition.instance':
    '15 cards. "A creature died this turn" is a `{v:"watch"}` query, and `unrunnableReason` refuses any card carrying one because no action log is supplied to fold. It would lower and then never run, which buys nothing and hides the gap.',
  'RaidCondition.instance': 'Same: needs a watcher for "you attacked with a creature this turn".',
  'DrewTwoOrMoreCardsCondition.instance': 'Same: needs a watcher.',
  'DescendCondition.instance': 'Same family: needs permanent cards counted in your graveyard, which is a filter this port can build, but the enum carries the threshold in its member name and the census shows no member spelled out.',
  'KickedCondition.ONCE':
    '67 cards. Whether the spell was kicked. Kicker is not modelled: `keywords.ts` refuses the keyword itself, so nothing ever records that the extra cost was paid.',
  'ManaWasSpentCondition.WHITE':
    '14 cards across the enum. Which colour of mana paid for the spell. The engine does not record the provenance of mana spent.',
  'GiftWasPromisedCondition.instance': '13 cards. Same shape as kicked: an optional additional cost nothing records.',
  'CitysBlessingCondition.instance': '17 cards. The city\'s blessing is a per-player designation the game state does not carry.',
  'MonarchIsSourceControllerCondition.instance':
    '12 cards. `{who:"monarch"}` names the monarch and `Condition` has no member that compares one player selector to another, so "you are the monarch" cannot be asked.',
  'CastFromGraveyardSourceCondition.instance': '12 cards. Where the spell was cast from is not recorded on the permanent.',
  'MonstrousCondition.instance': '11 cards. Monstrosity is a one-way flag on a permanent; nothing sets or reads it.',
  'BargainedCondition.instance': '10 cards. An optional additional cost, same as kicked.',
  'CompletedDungeonCondition.instance': '9 cards. Dungeons are not modelled.',
  'TeamworkCondition.instance': '8 cards. Needs the count of creatures that attacked, which is a watcher.',
  'AdamantCondition.instance': '8 cards. Mana provenance, same as `ManaWasSpentCondition`.',
  'xmage:LockedInCondition':
    '29 cards. Evaluates the inner condition ONCE and keeps the answer for the rest of the effect. `StaticAbility.condition` is re-checked every time the layers are rebuilt, so a locked-in condition would silently become a live one and the effect would switch itself off when the board changed.',
  'xmage:OpponentControlsMoreCondition':
    '6 cards. Compares your count against EACH opponent\'s separately. A selector over `{who:"each-opponent"}` is their union, and the union is larger than any one of them, so the condition would hold on boards where no single opponent is ahead.',
  'CardsInOpponentGraveyardCondition.SEVEN':
    '9 cards across the enum. "An opponent has seven or more cards in their graveyard." `{v:"cards-in"}` sums over the players it resolves to, so the opponents\' graveyards would be added together.',
};

/* ------------------------------------------------------------------ *
 * The entry point
 * ------------------------------------------------------------------ */

export interface ConditionResult {
  ok: boolean;
  condition?: Condition;
  /** The primitive that has no entry, for the work order. Empty on success. */
  missing?: string;
  why?: string;
}

const miss = (missing: string, why: string): ConditionResult => ({ ok: false, missing, why });

/**
 * One condition slot as a `dsl.ts` `Condition`, or the name of what is missing.
 *
 * Recursion is deliberate and bounded by the record: `InvertCondition` and
 * `CompoundCondition` wrap other conditions, and their inner slots arrive in
 * exactly the same three shapes as the outer one, so the same function reads
 * them. A nested condition this table cannot say REFUSES THE WHOLE THING rather
 * than being dropped, which is the all-or-nothing rule `lower.ts` states and
 * the reason a half-lowered card cannot exist.
 */
export function lowerCondition(slot: Slot | undefined): ConditionResult {
  if (!slot) return miss('condition:absent', 'the conditional effect carries no condition argument');

  if (slot.hole) {
    const local = slot.hole.localName ?? slot.hole.declared ?? slot.hole.reason;
    return miss(`local:${local}`, `the condition is a class this card declares itself (${local})`);
  }

  if (slot.carried?.c === 'enum') {
    const key = `${slot.carried.enumName}.${slot.carried.member}`;
    const refused = REFUSED_CONDITIONS[key] ?? REFUSED_CONDITIONS[`${slot.carried.enumName}.instance`];
    if (refused) return miss(`condition:${slot.carried.enumName}`, refused);
    const found = CONDITION_SINGLETONS[key];
    if (found) return { ok: true, condition: found };
    return miss(`condition:${slot.carried.enumName}`, 'no entry in the condition table');
  }

  if (slot.value?.k === 'condition') return { ok: true, condition: slot.value.cond };

  if (slot.value?.k === 'invoke') {
    const invocation = slot.value.invocation;
    const prim = invocation.prim;

    // The two combinators. Written here rather than in the table because they
    // need `lowerCondition` itself and the table's rules take an invocation
    // only, which keeps every other entry unable to recurse by accident.
    if (prim === 'xmage:InvertCondition') {
      const inner = lowerCondition(arg(invocation, 'condition'));
      if (!inner.ok) return inner;
      return { ok: true, condition: { if: 'not', of: inner.condition } };
    }
    if (prim === 'xmage:CompoundCondition') {
      // Varargs: every slot named `conditions`, in order. `arg` returns the
      // first and would silently drop the rest, which would turn "tapped AND
      // your turn" into "tapped".
      const slots = invocation.args.filter((a) => a.name === 'conditions');
      if (slots.length === 0) return miss('condition:CompoundCondition', 'compound condition with no parts');
      const parts: Condition[] = [];
      for (const inner of slots) {
        const lowered = lowerCondition(inner);
        if (!lowered.ok) return lowered;
        parts.push(lowered.condition);
      }
      return { ok: true, condition: parts.length === 1 ? parts[0] : { if: 'and', of: parts } };
    }

    const refused = REFUSED_CONDITIONS[prim];
    if (refused) return miss(prim, refused);
    const rule = CONDITION_RULES[prim];
    if (!rule) return miss(prim, 'no entry in the condition table');
    const produced = rule(invocation);
    if (!produced) return miss(prim, 'arguments did not resolve into a condition');
    return { ok: true, condition: produced };
  }

  if (slot.carried?.c === 'const') {
    const key = `const:${slot.carried.holder}.${slot.carried.field}`;
    return miss(key, 'the condition is a shared static field with no entry');
  }

  return miss('condition:unreadable', 'the condition slot holds neither an invocation nor a known singleton');
}
