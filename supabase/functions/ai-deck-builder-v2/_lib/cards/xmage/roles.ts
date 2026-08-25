/**
 * What a card DOES, in terms a deck builder can add up and a search index can
 * invert.
 *
 * Behaviour here is derived from XMage (MIT, Copyright (c) 2010
 * betasteward@gmail.com). Forge is GPL-3.0 and was not read.
 *
 * ## The argument for putting this on the primitive, not the card
 *
 * The app today decides "this is removal" by matching oracle TEXT. That is why
 * recommendations are weak: text matching cannot tell Wrath of God from
 * Armageddon without a rule per phrasing, it has no idea how much a card ramps,
 * and it cannot answer "find me another card that does this" except by finding
 * cards that are worded alike.
 *
 * A role assigned per card is 32,469 judgements and every new card is a new
 * one. A role assigned per PRIMITIVE is 723 judgements for effect classes, and
 * it propagates to every card that uses one. That ratio is the entire reason
 * this file exists.
 *
 * ## And the argument for why it cannot be a constant on the primitive
 *
 * `DestroyAllEffect` is used across the corpus with 15 distinct argument
 * shapes. It is a board wipe with `FILTER_PERMANENT_CREATURES` and mass land
 * destruction with `FILTER_LANDS`. A per-primitive constant would have to pick
 * one and be wrong about the other, which is exactly the collapse the old
 * import-based extraction suffered.
 *
 * So a role is a function of (primitive, resolved arguments), and that function
 * is DATA, a rule table with no closures, for three reasons. It survives
 * `JSON.stringify` into the same jsonb column as everything else. It can be
 * compiled to SQL later so a "find me cards that do this" query runs in the
 * database instead of over a downloaded catalogue. And a rule table can be
 * diffed against the existing text tagger to find where the text tagger lies,
 * which is a measurable deliverable rather than an opinion.
 *
 * ## One table, two consumers
 *
 * Every rule emits both a role and search facets. They are not two tables,
 * because two tables drift and then the card that the deck builder calls ramp
 * is not returned by a search for ramp.
 */

import type { CardFilter, Cmp, PlayerSelector } from '../abilities/dsl.ts';
import {
  type AbilityRecord,
  type CardRecord,
  type Invocation,
  type PrimId,
  type Slot,
  type Value,
  abilitiesOf,
  arg,
  effectRootsOf,
  targetRootsOf,
} from './record.ts';

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

/**
 * The deck-builder roles.
 *
 * These names are NOT new. They are the canonical tags already in
 * `src/engine/knowledge/tagger.ts`, spelled identically, because that
 * vocabulary is already in the database, in `derive_card_tags`, in the deck
 * builder and on screen. Inventing a parallel vocabulary would mean every
 * consumer had to learn both and pick, and picking is where they disagree.
 *
 * What changes is not the words. It is where they come from: the tagger reads
 * oracle text with 66 regex rules, and this reads structure. Both can run, and
 * the diff between them is the measurement of how wrong the text tagger is.
 */
export type Role =
  /* interaction */
  | 'targeted-removal'
  | 'board-wipe'
  | 'bounce'
  | 'counterspell'
  | 'land-destruction'
  | 'graveyard-hate'
  | 'stax'
  | 'protection'
  /* resources */
  | 'ramp'
  | 'mana-rock'
  | 'mana-dork'
  | 'fast-mana'
  | 'treasure'
  | 'cost-reduction'
  | 'card-draw'
  | 'tutor'
  | 'tutor-broad'
  | 'tutor-narrow'
  | 'discard'
  | 'mill'
  | 'self-mill'
  /* board */
  | 'token-maker'
  | 'counters'
  | 'proliferate'
  | 'mass-pump'
  | 'untapper'
  | 'blink'
  | 'clone'
  /* graveyard */
  | 'graveyard-recursion'
  | 'reanimator'
  /* engines and endings */
  | 'sacrifice-outlet'
  | 'aristocrats'
  | 'extra-turn'
  | 'extra-combat'
  | 'lifegain'
  | 'finisher';

/**
 * A search facet. `key` is closed so the index schema is closed; a rule cannot
 * invent a column.
 *
 * The point of facets is that "find me cards that do this" stops being a text
 * search. A search for a one-sided creature wipe becomes
 * `effect=destroy-all AND object=creature AND symmetry=one-sided`, which is
 * three index lookups, and it returns cards whose oracle text shares no words
 * with the query.
 */
export type FacetKey =
  /** The primitive family: `destroy-all`, `create-token`, `draw`, `search-library`. */
  | 'effect'
  /** What the effect is pointed at: `creature`, `land`, `nonland-permanent`, `spell`. */
  | 'object'
  /** `one` for a targeted effect, `all` for a mass effect, `n` for a fixed count. */
  | 'scope'
  /** Whether it hits the controller too. */
  | 'symmetry'
  /** A role name, so role and facet search share one index. */
  | 'role'
  /** The counter kind, the token name, the mana produced. */
  | 'produces'
  /** The zone an effect moves things to. */
  | 'to-zone'
  /** The zone an effect takes things from. */
  | 'from-zone'
  /** The trigger event class, so "find me enters-the-battlefield payoffs" works. */
  | 'trigger'
  /** Present when the effect's magnitude is a hole. Lets a query exclude the unrunnable. */
  | 'unknown';

export interface Facet {
  key: FacetKey;
  value: string;
}

/* ------------------------------------------------------------------ *
 * Object classes: a small, honest filter classifier
 * ------------------------------------------------------------------ */

/**
 * What a filter selects, coarsely.
 *
 * This is deliberately NOT a filter subsumption engine. A general "does filter
 * A imply filter B" solver over the whole `CardFilter` language is a research
 * problem, and half-building one is how a classifier ends up quietly answering
 * `false` for cases it does not handle. Instead there is a closed list of
 * classes, each recognised by a specific check, and anything that matches none
 * of them answers `[]`, which callers must treat as "do not know", not as "no".
 */
export type ObjectClass =
  | 'creature'
  | 'land'
  | 'artifact'
  | 'enchantment'
  | 'planeswalker'
  | 'permanent'
  | 'nonland-permanent'
  | 'spell'
  | 'card'
  | 'token'
  | 'player';

/**
 * Which classes a filter certainly selects. Returns `[]` for "cannot tell",
 * which is a different answer from "selects nothing" and callers must not
 * conflate them.
 */
export function classifyFilter(filter: CardFilter): ObjectClass[] {
  const types = collectTypes(filter);
  const out: ObjectClass[] = [];
  for (const t of types) {
    const lower = t.toLowerCase();
    if (lower === 'creature') out.push('creature');
    else if (lower === 'land') out.push('land');
    else if (lower === 'artifact') out.push('artifact');
    else if (lower === 'enchantment') out.push('enchantment');
    else if (lower === 'planeswalker') out.push('planeswalker');
  }
  if (out.length > 0) return out;
  if (filter.is === 'any') return ['permanent'];
  // "any type except land", the nonland-permanent shape, the one Cyclonic Rift
  // uses and the one a whole class of sweepers uses.
  if (filter.is === 'not' && filter.of.is === 'type' && filter.of.value.toLowerCase() === 'land') {
    return ['nonland-permanent'];
  }
  if (filter.is === 'and') {
    const inner = filter.of.flatMap(classifyFilter);
    if (inner.length > 0) return Array.from(new Set(inner));
  }
  return [];
}

function collectTypes(filter: CardFilter): string[] {
  switch (filter.is) {
    case 'type':
      return [filter.value];
    case 'and':
      return filter.of.flatMap(collectTypes);
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * Symmetry: the axis text search cannot get right
 * ------------------------------------------------------------------ */

export type Symmetry = 'symmetric' | 'one-sided' | 'unknown';

/**
 * Does this affect the controller's own things as well?
 *
 * Derived from the controller scope on the resolved object set. Wrath of God's
 * filter has no controller restriction, so it is symmetric. Cyclonic Rift's
 * overload filter carries `TargetController.NOT_YOU`, so it is one-sided. Those
 * two facts are the whole reason one is a four-mana catch-up card and the other
 * is a seven-mana win condition, and no amount of reading their oracle text as
 * a bag of words recovers the difference.
 *
 * `unknown` when the controller scope did not resolve. Never defaulted to
 * `symmetric`: guessing symmetric on a one-sided card understates the card, and
 * guessing one-sided on a symmetric card recommends a spell that kills the
 * player's own board.
 */
export function symmetryOf(value: Value | undefined): Symmetry {
  if (!value || value.k !== 'objects') return 'unknown';
  if (!value.controller) return 'symmetric';
  switch (value.controller.who) {
    case 'each-opponent':
      return 'one-sided';
    case 'you':
      return 'one-sided';
    case 'each-player':
      return 'symmetric';
    default:
      return 'unknown';
  }
}

/* ------------------------------------------------------------------ *
 * Scale: how much
 * ------------------------------------------------------------------ */

/**
 * The magnitude of what a role does, and the reason `unknown` is a first class
 * answer rather than a zero.
 *
 * "Ramp" is not one thing. Cultivate ramps by one and fixes a second land;
 * Dockside Extortionist ramps by a number nobody can name at deck-building
 * time. A deck builder that treats both as `ramp: 1` gives bad advice, and one
 * that treats the unknown as `0` gives worse advice. So the answer is a union
 * and the caller must handle all three.
 */
export type Scale =
  | { s: 'fixed'; n: number }
  /** As many as the filter selects. A wipe. There is no number and inventing one is a lie. */
  | { s: 'all' }
  /** Counted from the board at resolution. `expr` is the `dsl.ts` value tree. */
  | { s: 'computed'; describe: string }
  /** The slot that says how much is a hole. Say so; do not substitute a number. */
  | { s: 'unknown'; reason: string };

/**
 * Where a rule reads a role's magnitude from.
 */
export type ScaleRef =
  | { from: 'const'; n: number }
  /** A named argument. Resolves to `fixed`, `computed` or `unknown` depending on the slot. */
  | { from: 'arg'; name: string }
  /** The role is mass by nature and has no number. */
  | { from: 'all' };

export function resolveScale(invocation: Invocation, ref: ScaleRef): Scale {
  if (ref.from === 'const') return { s: 'fixed', n: ref.n };
  if (ref.from === 'all') return { s: 'all' };
  const slot = arg(invocation, ref.name);
  if (!slot) return { s: 'unknown', reason: `no argument named ${ref.name}` };
  if (slot.hole) {
    return {
      s: 'unknown',
      reason: slot.hole.localName
        ? `${slot.hole.reason}: ${slot.hole.localName}`
        : slot.hole.reason,
    };
  }
  if (slot.carried) return { s: 'unknown', reason: `not lowered: ${describeCarried(slot)}` };
  const value = slot.value;
  if (value?.k === 'int') return { s: 'fixed', n: value.n };
  if (value?.k === 'amount') return { s: 'computed', describe: JSON.stringify(value.expr) };
  return { s: 'unknown', reason: `argument ${ref.name} is not a quantity` };
}

function describeCarried(slot: Slot): string {
  const c = slot.carried;
  if (!c) return 'nothing';
  switch (c.c) {
    case 'enum':
      return `${c.enumName}.${c.member}`;
    case 'const':
      return `${c.holder}.${c.field}`;
    case 'factory':
      return `${c.on}.${c.method}()`;
    case 'construct':
      return c.prim;
    default:
      return c.c;
  }
}

/* ------------------------------------------------------------------ *
 * The rule table
 * ------------------------------------------------------------------ */

/**
 * A test a rule runs against one invocation. Data, not a predicate function,
 * so the table serialises and can later be pushed into SQL.
 */
export type SlotTest =
  | { t: 'resolved'; name: string }
  | { t: 'int'; name: string; cmp: Cmp; n: number }
  | { t: 'bool'; name: string; b: boolean }
  /** The named argument resolved to an object set that certainly selects one of these. */
  | { t: 'objects'; name: string; any: ObjectClass[] }
  /** The named argument resolved to a player set matching one of these. */
  | { t: 'players'; name: string; any: Array<PlayerSelector['who']> }
  /** The named argument resolved to a zone. */
  | { t: 'zone'; name: string; any: string[] }
  | { t: 'not'; of: SlotTest }
  | { t: 'or'; of: SlotTest[] };

export interface Emission {
  role: Role;
  scale: ScaleRef;
  /** Extra facets beyond the ones derived automatically from the primitive. */
  facets?: Facet[];
}

export interface RoleRule {
  id: string;
  /** The primitives this rule speaks for. */
  prim: PrimId[];
  /** All must hold. Absent means the rule always fires for those primitives. */
  when?: SlotTest[];
  emit: Emission[];
  /**
   * A rule that reads a named argument is only sound when the parameter name
   * is trustworthy. `ambiguous-arity` means several constructor overloads
   * matched and the name may belong to a different one, so `assignRoles` skips
   * the rule rather than emitting a role from a coin toss.
   *
   * `names-agree` is NOT skipped: the overload is still unknown but every
   * candidate uses the same name at that position, so the name is sound even
   * though the constructor is not. See `Invocation.paramMatch`.
   */
  needsExactParams?: boolean;
}

export interface RoleAssignment {
  role: Role;
  scale: Scale;
  from: PrimId;
  ruleId: string;
}

/* ------------------------------------------------------------------ *
 * Seed rules
 *
 * Enough to carry the hard list end to end, and no more. The full table is the
 * ranked grind: 723 effect classes, ordered by how many Commander legal cards
 * each unlocks, in `scripts/coverage/.data/xmage-effect-rank.commander.json`.
 * The head of that list is CreateTokenEffect 2,371 cards,
 * DrawCardSourceControllerEffect 2,297, DamageTargetEffect 1,465,
 * AddCountersSourceEffect 1,376.
 *
 * These are seeds so that the worked examples in docs/engine/CARD-SEMANTICS.md
 * are PRINTED BY RUNNING CODE rather than typed by hand. A design document
 * whose examples were written out by its author has demonstrated nothing.
 * ------------------------------------------------------------------ */

export const ROLE_RULES: RoleRule[] = [
  {
    id: 'destroy-all/creatures',
    prim: ['xmage:DestroyAllEffect'],
    when: [{ t: 'objects', name: 'filter', any: ['creature'] }],
    needsExactParams: true,
    emit: [{ role: 'board-wipe', scale: { from: 'all' } }],
  },
  {
    id: 'destroy-all/lands',
    prim: ['xmage:DestroyAllEffect'],
    when: [{ t: 'objects', name: 'filter', any: ['land'] }],
    needsExactParams: true,
    emit: [
      { role: 'land-destruction', scale: { from: 'all' } },
      { role: 'stax', scale: { from: 'all' } },
    ],
  },
  {
    id: 'destroy-all/nonland',
    prim: ['xmage:DestroyAllEffect'],
    when: [{ t: 'objects', name: 'filter', any: ['nonland-permanent', 'permanent'] }],
    needsExactParams: true,
    emit: [{ role: 'board-wipe', scale: { from: 'all' } }],
  },
  {
    id: 'damage-target',
    prim: ['xmage:DamageTargetEffect'],
    needsExactParams: true,
    emit: [{ role: 'targeted-removal', scale: { from: 'arg', name: 'amount' } }],
  },
  {
    id: 'return-to-hand-target',
    prim: ['xmage:ReturnToHandTargetEffect'],
    emit: [{ role: 'bounce', scale: { from: 'const', n: 1 } }],
  },
  {
    id: 'counter-target',
    prim: ['xmage:CounterTargetEffect', 'xmage:CounterUnlessPaysEffect'],
    emit: [{ role: 'counterspell', scale: { from: 'const', n: 1 } }],
  },
  {
    id: 'draw-controller',
    prim: ['xmage:DrawCardSourceControllerEffect'],
    needsExactParams: true,
    emit: [{ role: 'card-draw', scale: { from: 'arg', name: 'amount' } }],
  },
  {
    id: 'search-lands-to-battlefield',
    prim: [
      'xmage:SearchLibraryPutOntoBattlefieldTappedRestInHandEffect',
      'xmage:SearchLibraryPutInPlayEffect',
    ],
    emit: [
      { role: 'ramp', scale: { from: 'const', n: 1 } },
      { role: 'tutor-narrow', scale: { from: 'const', n: 1 } },
    ],
  },
  {
    id: 'create-token',
    prim: ['xmage:CreateTokenEffect'],
    needsExactParams: true,
    emit: [{ role: 'token-maker', scale: { from: 'arg', name: 'amount' } }],
  },
  {
    id: 'tap-all',
    prim: ['xmage:TapAllEffect'],
    needsExactParams: true,
    emit: [{ role: 'stax', scale: { from: 'all' } }],
  },
  {
    id: 'win-game',
    prim: ['xmage:WinGameSourceControllerEffect'],
    emit: [{ role: 'finisher', scale: { from: 'const', n: 1 } }],
  },
  {
    id: 'reanimate-target',
    prim: ['xmage:ReturnFromGraveyardToBattlefieldTargetEffect'],
    emit: [
      { role: 'reanimator', scale: { from: 'const', n: 1 } },
      { role: 'graveyard-recursion', scale: { from: 'const', n: 1 } },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

function testSlot(invocation: Invocation, test: SlotTest): boolean {
  switch (test.t) {
    case 'not':
      return !testSlot(invocation, test.of);
    case 'or':
      return test.of.some((inner) => testSlot(invocation, inner));
    default:
      break;
  }
  const slot = arg(invocation, test.name);
  const value = slot?.value;
  switch (test.t) {
    case 'resolved':
      return value !== undefined;
    case 'int':
      return value?.k === 'int' && compare(value.n, test.cmp, test.n);
    case 'bool':
      return value?.k === 'bool' && value.b === test.b;
    case 'objects': {
      if (value?.k !== 'objects') return false;
      const classes = classifyFilter(value.filter);
      return classes.some((c) => test.any.includes(c));
    }
    case 'players':
      return value?.k === 'players' && test.any.includes(value.who.who);
    case 'zone':
      return value?.k === 'zone' && test.any.includes(value.zone);
    default:
      return false;
  }
}

function compare(a: number, cmp: Cmp, b: number): boolean {
  switch (cmp) {
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
      return a === b;
    case 'gte':
      return a >= b;
    case 'gt':
      return a > b;
    case 'ne':
      return a !== b;
    default:
      return false;
  }
}

/** Every role one invocation earns. Empty means no rule spoke for it, which is not "no role". */
export function assignRoles(invocation: Invocation, rules: RoleRule[] = ROLE_RULES): RoleAssignment[] {
  const out: RoleAssignment[] = [];
  for (const rule of rules) {
    if (!rule.prim.includes(invocation.prim)) continue;
    if (rule.needsExactParams && invocation.paramMatch === 'ambiguous-arity') continue;
    if (rule.when && !rule.when.every((t) => testSlot(invocation, t))) continue;
    for (const emission of rule.emit) {
      out.push({
        role: emission.role,
        scale: resolveScale(invocation, emission.scale),
        from: invocation.prim,
        ruleId: rule.id,
      });
    }
  }
  return out;
}

/**
 * The deck-builder view of a whole card: every role any of its abilities earns.
 *
 * Roles are NOT deduplicated across abilities. A card with two draw abilities
 * draws twice, and a builder totalling "how much draw is in this list" must see
 * both. Deduplication is the caller's decision, taken with the scales in hand.
 */
export function rolesOf(record: CardRecord, rules: RoleRule[] = ROLE_RULES): RoleAssignment[] {
  const out: RoleAssignment[] = [];
  for (const ability of abilitiesOf(record)) {
    for (const invocation of effectInvocations(ability)) {
      out.push(...assignRoles(invocation, rules));
    }
  }
  return out;
}

/** Effect invocations only. A filter or a cost is not a thing a card "does". */
function effectInvocations(ability: AbilityRecord): Invocation[] {
  const out: Invocation[] = [];
  const visit = (node: Invocation): void => {
    if (node.role === 'one-shot-effect' || node.role === 'continuous-effect') out.push(node);
    for (const child of node.children?.effects ?? []) visit(child);
  };
  for (const root of effectRootsOf(ability)) visit(root);
  return out;
}

/* ------------------------------------------------------------------ *
 * Facets
 * ------------------------------------------------------------------ */

/**
 * The search view of a card. Same rules, same invocations, no second pass.
 *
 * `unknown` facets are emitted on purpose. A query for reliable ramp should be
 * able to exclude cards whose magnitude is a hole, and it can only do that if
 * the holes are in the index.
 */
export function facetsOf(record: CardRecord, rules: RoleRule[] = ROLE_RULES): Facet[] {
  const out: Facet[] = [];
  const push = (key: FacetKey, value: string): void => {
    if (!out.some((f) => f.key === key && f.value === value)) out.push({ key, value });
  };

  for (const ability of abilitiesOf(record)) {
    if (ability.kind === 'triggered') push('trigger', shortName(ability.via.prim));

    // A targeted spell puts its object set on the TARGET, not on the effect.
    // Cyclonic Rift's overload filter is the whole reason the card is worth
    // seven mana and it lives on `TargetPermanent`, so an index that only read
    // effect arguments would miss it and answer "symmetric" by omission.
    for (const target of targetRootsOf(ability)) {
      const tf = arg(target, 'filter')?.value;
      if (tf?.k === 'objects') {
        for (const cls of classifyFilter(tf.filter)) push('object', cls);
        push('symmetry', symmetryOf(tf));
      }
    }

    for (const invocation of effectInvocations(ability)) {
      push('effect', kebab(shortName(invocation.prim)));

      const filter = arg(invocation, 'filter')?.value;
      if (filter?.k === 'objects') {
        for (const cls of classifyFilter(filter.filter)) push('object', cls);
        push('symmetry', symmetryOf(filter));
      }

      const token = arg(invocation, 'token')?.value;
      if (token?.k === 'invoke') push('produces', kebab(shortName(token.invocation.prim)));

      for (const assignment of assignRoles(invocation, rules)) {
        push('role', assignment.role);
        if (assignment.scale.s === 'unknown') push('unknown', assignment.role);
        if (assignment.scale.s === 'all') push('scope', 'all');
        if (assignment.scale.s === 'fixed') push('scope', String(assignment.scale.n));
        if (assignment.scale.s === 'computed') push('scope', 'computed');
      }
    }
  }
  return out;
}

function shortName(prim: PrimId): string {
  const colon = prim.indexOf(':');
  return colon >= 0 ? prim.slice(colon + 1) : prim;
}

function kebab(name: string): string {
  return name
    .replace(/Effect$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
