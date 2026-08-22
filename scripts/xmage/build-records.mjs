#!/usr/bin/env node
/**
 * Build card records in the shape `src/lib/cards/xmage/record.ts` describes,
 * and measure what that shape actually holds over the whole corpus.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. Comments are
 * stripped by the tokenizer and display-string CONTENTS are never copied: those
 * strings carry Wizards of the Coast rules text, which is not XMage's to
 * license. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/build-records.mjs
 *
 * Reads:
 *   scripts/coverage/.data/xmage-card-effects.ndjson   (extract-effects.mjs)
 *   scripts/coverage/.data/xmage-engine-index.json     (index-engine.mjs)
 *   $XMAGE_ROOT/Mage/src/main/java/mage/filter/StaticFilters.java
 *
 * Writes:
 *   scripts/coverage/.data/xmage-records.hardlist.json
 *   scripts/coverage/.data/xmage-record-shape.json
 *
 * Every figure this prints is counted here, over every card file the extraction
 * produced. Nothing is sampled and nothing is estimated.
 */

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize, JavaParser } from './lib/java-parse.mjs';
import {
  reportCoverage,
  coverageOf,
  rolesOf,
  facetsOf,
  comparisonClasses,
  compareCards,
  lowerCard,
  censusOf,
  slotsInRecord,
  reachableBySharedWork,
  abilitiesOf,
  invocationsInAbility,
  slotsInAbility,
} from '../../src/lib/cards/xmage/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const DATA = path.join(REPO, 'scripts', 'coverage', '.data');
const NDJSON = path.join(DATA, 'xmage-card-effects.ndjson');
const ENGINE = path.join(DATA, 'xmage-engine-index.json');

const XMAGE_ROOT =
  process.env.XMAGE_ROOT || 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const STATIC_FILTERS = path.join(
  XMAGE_ROOT,
  'Mage/src/main/java/mage/filter/StaticFilters.java',
);

/* ================================================================== *
 * 1. Filter vocabulary
 *
 * A filter class name is decoded from an EXPLICIT table, never decomposed from
 * its spelling. Decomposing an identifier is a text search wearing a hat, and a
 * text search is the thing this whole exercise replaces.
 *
 * 30 entries are enough that only 373 of the 17,197 filter constructions this
 * script sees, 2.2%, land on a class the table does not name. The other 34
 * classes are left unresolved on purpose rather than guessed.
 * ================================================================== */

const T = (value) => ({ is: 'type', value });
const NOT = (of) => ({ is: 'not', of });
const AND = (...of) => ({ is: 'and', of });
const OR = (...of) => ({ is: 'or', of });

/** filter class -> { filter, controller?, zone? }. `zone` is where the objects live. */
const FILTER_CLASSES = {
  FilterCreaturePermanent: { filter: T('Creature'), zone: 'battlefield' },
  FilterControlledPermanent: { filter: { is: 'any' }, zone: 'battlefield', controller: { who: 'you' } },
  FilterCard: { filter: { is: 'any' } },
  FilterPermanent: { filter: { is: 'any' }, zone: 'battlefield' },
  FilterControlledCreaturePermanent: { filter: T('Creature'), zone: 'battlefield', controller: { who: 'you' } },
  FilterSpell: { filter: { is: 'any' }, zone: 'stack' },
  FilterCreatureCard: { filter: T('Creature') },
  FilterControlledLandPermanent: { filter: T('Land'), zone: 'battlefield', controller: { who: 'you' } },
  FilterLandPermanent: { filter: T('Land'), zone: 'battlefield' },
  FilterPermanentCard: { filter: OR(T('Creature'), T('Artifact'), T('Enchantment'), T('Land'), T('Planeswalker'), T('Battle')) },
  FilterControlledArtifactPermanent: { filter: T('Artifact'), zone: 'battlefield', controller: { who: 'you' } },
  FilterLandCard: { filter: T('Land') },
  FilterArtifactPermanent: { filter: T('Artifact'), zone: 'battlefield' },
  FilterNonlandCard: { filter: NOT(T('Land')) },
  FilterAttackingCreature: { filter: AND(T('Creature'), { is: 'attacking' }), zone: 'battlefield' },
  FilterNonlandPermanent: { filter: NOT(T('Land')), zone: 'battlefield' },
  FilterInstantOrSorceryCard: { filter: OR(T('Instant'), T('Sorcery')) },
  FilterCreatureOrPlaneswalkerPermanent: { filter: OR(T('Creature'), T('Planeswalker')), zone: 'battlefield' },
  FilterArtifactCard: { filter: T('Artifact') },
  FilterBasicCard: { filter: { is: 'supertype', value: 'Basic' } },
  FilterEnchantmentPermanent: { filter: T('Enchantment'), zone: 'battlefield' },
  FilterCreatureSpell: { filter: T('Creature'), zone: 'stack' },
  FilterOpponentsCreaturePermanent: { filter: T('Creature'), zone: 'battlefield', controller: { who: 'each-opponent' } },
  FilterEnchantmentCard: { filter: T('Enchantment') },
  FilterInstantOrSorcerySpell: { filter: OR(T('Instant'), T('Sorcery')), zone: 'stack' },
  FilterControlledPlaneswalkerPermanent: { filter: T('Planeswalker'), zone: 'battlefield', controller: { who: 'you' } },
  FilterArtifactOrEnchantmentPermanent: { filter: OR(T('Artifact'), T('Enchantment')), zone: 'battlefield' },
  FilterControlledEnchantmentPermanent: { filter: T('Enchantment'), zone: 'battlefield', controller: { who: 'you' } },
  FilterAttackingOrBlockingCreature: { filter: AND(T('Creature'), OR({ is: 'attacking' }, { is: 'blocking' })), zone: 'battlefield' },
  FilterArtifactCreaturePermanent: { filter: AND(T('Artifact'), T('Creature')), zone: 'battlefield' },
};

/**
 * Predicates, folded into the filter.
 *
 * An UNRECOGNISED predicate makes the whole filter unresolved. That is the only
 * safe direction: every predicate NARROWS the set, so dropping one makes the
 * record claim a spell destroys all creatures when it destroys only some, and a
 * deck builder that believes it has a board wipe it does not have gives worse
 * advice than one that knows it does not know.
 */
const OBJECT_COLORS = { WHITE: 'W', BLUE: 'U', BLACK: 'B', RED: 'R', GREEN: 'G' };

/** Singleton predicates that name a characteristic the DSL filter language has. */
const SINGLETON_PREDICATES = {
  'TappedPredicate.TAPPED': { is: 'tapped' },
  'TappedPredicate.UNTAPPED': { is: 'untapped' },
  'AttackingPredicate.instance': { is: 'attacking' },
  'BlockingPredicate.instance': { is: 'blocking' },
  'AnotherPredicate.instance': { is: 'other' },
  'ColorlessPredicate.instance': { is: 'colorless' },
  'MulticoloredPredicate.instance': { is: 'multicolored' },
  'TokenPredicate.TRUE': { is: 'token' },
  'TokenPredicate.FALSE': { is: 'not', of: { is: 'token' } },
  'CommanderPredicate.instance': { is: 'commander' },
};

function foldPredicate(node) {
  if (!node || typeof node !== 'object') return null;

  if (node.t === 'enum') {
    const singleton = SINGLETON_PREDICATES[`${node.enum}.${node.v}`];
    if (singleton) return { filter: singleton };
    return null;
  }

  const obj = node.t === 'obj' ? node.obj : node;
  if (!obj) return null;

  if (obj.factory) {
    const { method, on } = obj.factory;
    // `CardType.getPredicate(CREATURE)`, `SubType.getPredicate(GOBLIN)`,
    // `SuperType.getPredicate(LEGENDARY)`, `TargetController.getControllerPredicate(NOT_YOU)`.
    if (obj.cls === 'CardType' && method === 'getPredicate') return { filter: T(titleCase(on)) };
    if (obj.cls === 'SubType' && method === 'getPredicate') return { filter: { is: 'subtype', value: titleCase(on) } };
    if (obj.cls === 'SuperType' && method === 'getPredicate') return { filter: { is: 'supertype', value: titleCase(on) } };
    if (obj.cls === 'TargetController' && method === 'getControllerPredicate') {
      const who = CONTROLLERS[on];
      return who ? { controller: who } : null;
    }
    // `Predicates.or(a, b)`, `.and(...)`, `.not(x)`. Every sub-predicate must
    // fold, and any controller a sub-predicate carries would be a controller
    // scope inside a boolean, which the selector shape cannot hold, so that
    // case is refused rather than flattened.
    if (obj.cls === 'Predicates' && (method === 'or' || method === 'and' || method === 'not')) {
      const inner = (obj.args ?? []).map(foldPredicate);
      if (inner.length === 0 || inner.some((i) => !i || !i.filter || i.controller)) return null;
      const parts = inner.map((i) => i.filter);
      if (method === 'not') return parts.length === 1 ? { filter: NOT(parts[0]) } : null;
      return { filter: method === 'or' ? OR(...parts) : AND(...parts) };
    }
  }

  const single = SINGLETON_PREDICATES[`${obj.cls}.instance`];
  if (single && !obj.args?.length) return { filter: single };

  if (obj.cls === 'ColorPredicate') {
    const arg0 = obj.args?.[0];
    const colour = arg0?.t === 'const' && arg0.cls === 'ObjectColor' ? OBJECT_COLORS[arg0.field] : null;
    return colour ? { filter: { is: 'color', value: colour } } : null;
  }

  // `NamePredicate` takes a card name, which is Wizards of the Coast text and
  // is omitted from the extraction on purpose. Refusing keeps the filter honest
  // rather than widening it to every card.
  return null;
}

/**
 * A filter's own constructor argument, folded into the filter.
 *
 * Two shapes reach here and both are real. An argument read off a card comes
 * through the extractor as a typed slot (`{t:'enum', enum:'SubType', ...}`); an
 * argument read off a `StaticFilters` field initialiser comes through as a raw
 * parse node (`{k:'field', on:{k:'name', id:'SubType'}, name:'SLIVER'}`),
 * because that initialiser was never a card expression. Nine of the 198 static
 * filters carry one, so both shapes have to be read or `FILTER_PERMANENT_SLIVERS`
 * comes out meaning every creature.
 *
 * Returns the `CardFilter` part, `SKIP` for the display-name String that every
 * one of these constructors also takes, or `null` to refuse the whole filter.
 */
const SKIP = Symbol('display-name');

function filterCtorArg(arg) {
  if (!arg || typeof arg !== 'object') return null;

  // Extractor slot shapes.
  if (arg.t === 'enum' && arg.enum === 'SubType') return { is: 'subtype', value: titleCase(arg.v) };
  if (arg.t === 'enum' && arg.enum === 'CardType') return T(titleCase(arg.v));
  if (arg.t === 'enum' && arg.enum === 'SuperType') return { is: 'supertype', value: titleCase(arg.v) };
  if (arg.t === 'text' || arg.t === 'string' || arg.t === 'str') return SKIP;

  // Raw parse nodes from a StaticFilters initialiser.
  if (arg.k === 'lit') return arg.type === 'str' ? SKIP : null;
  if (arg.k === 'field' && arg.on?.k === 'name' && typeof arg.name === 'string') {
    if (arg.on.id === 'SubType') return { is: 'subtype', value: titleCase(arg.name) };
    if (arg.on.id === 'CardType') return T(titleCase(arg.name));
    if (arg.on.id === 'SuperType') return { is: 'supertype', value: titleCase(arg.name) };
  }

  return null;
}

/** A short label for a constructor argument the filter reader refused. */
function describeCtorArg(arg) {
  if (!arg || typeof arg !== 'object') return String(arg);
  if (arg.t === 'enum') return `${arg.enum}.${arg.v}`;
  if (arg.t) return arg.t;
  if (arg.k === 'field') return `${arg.on?.id ?? '?'}.${arg.name}`;
  return arg.k ?? 'unknown';
}

/** A short label for a predicate the folder refused, for the refusal census. */
function describePredicate(node) {
  if (!node || typeof node !== 'object') return String(node);
  if (node.t === 'enum') return `${node.enum}.${node.v}`;
  if (node.t === 'const') return `${node.cls}.${node.field}`;
  const obj = node.t === 'obj' ? node.obj : node;
  if (obj && obj.factory) return `${obj.cls}.${obj.factory.method}(${obj.factory.on ?? ''})`;
  if (obj && obj.cls) return `new ${obj.cls}`;
  return node.t ?? 'unknown';
}

const CONTROLLERS = {
  YOU: { who: 'you' },
  OPPONENT: { who: 'each-opponent' },
  NOT_YOU: { who: 'each-opponent' },
  ANY: { who: 'each-player' },
};

function titleCase(s) {
  if (!s) return s;
  return s
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

/* ================================================================== *
 * 2. StaticFilters, replayed from source
 *
 * `xmage-engine-index.json` records each constant's INITIALISER but not the
 * `static { ... }` block that follows it, and for a third of these constants
 * the static block is where the meaning is:
 *
 *     FILTER_CARD_BASIC_LAND = new FilterLandCard(...)
 *     static { FILTER_CARD_BASIC_LAND.add(SuperType.BASIC.getPredicate()); }
 *
 * Reading only the initialiser records "land card" for Cultivate, which is
 * wrong in a way nothing downstream would notice. So the blocks are replayed
 * here from the one file that holds them.
 * ================================================================== */

function readStaticFilterPredicates() {
  if (!existsSync(STATIC_FILTERS)) {
    return { predicates: new Map(), adds: 0, file: null };
  }
  const src = readFileSync(STATIC_FILTERS, 'utf8');
  const toks = tokenize(src);
  const predicates = new Map();
  let adds = 0;

  for (let i = 0; i + 3 < toks.length; i++) {
    // `FILTER_X . add (`
    if (toks[i].t !== 'id' || !/^[A-Z][A-Z0-9_]*$/.test(toks[i].v)) continue;
    if (toks[i + 1].v !== '.' || toks[i + 2].v !== 'add' || toks[i + 3].v !== '(') continue;
    const field = toks[i].v;
    const parser = new JavaParser(toks.slice(i + 3));
    let args;
    try {
      args = parser.parseArgs();
    } catch {
      continue;
    }
    adds += 1;
    if (!predicates.has(field)) predicates.set(field, []);
    predicates.get(field).push(...args);
  }
  return { predicates, adds, file: 'Mage/src/main/java/mage/filter/StaticFilters.java' };
}

/**
 * Turns a parsed StaticFilters predicate expression into the same shape a card
 * file's `mods` produce, so one folder handles both.
 */
function predicateFromAst(node) {
  if (!node || typeof node !== 'object') return null;

  // `SuperType.BASIC.getPredicate()` / `CardType.CREATURE.getPredicate()`.
  if (node.k === 'call' && node.name && node.obj) {
    const chain = flattenName(node.obj);
    if (chain.length === 2) {
      return { t: 'obj', obj: { cls: chain[0], factory: { method: node.name, on: chain[1] } } };
    }
    // `Predicates.or(a, b)` and friends: the receiver is one name, the
    // arguments are themselves predicates.
    if (chain.length === 1) {
      return {
        t: 'obj',
        obj: {
          cls: chain[0],
          factory: { method: node.name, on: null },
          args: (node.args ?? []).map(predicateFromAst),
        },
      };
    }
  }
  // `new ColorPredicate(ObjectColor.BLACK)`.
  if (node.k === 'new' && node.type) {
    return {
      t: 'obj',
      obj: { cls: simpleTypeName(node.type), args: (node.args ?? []).map(predicateFromAst) },
    };
  }
  // `TappedPredicate.TAPPED`, `AnotherPredicate.instance`, `ObjectColor.BLACK`.
  if (node.k === 'name' || node.k === 'field') {
    const chain = flattenName(node);
    if (chain.length === 2) {
      // Static constants used as VALUES rather than predicates keep the `const`
      // shape, so `foldPredicate` can read `ObjectColor.BLACK` out of a
      // `ColorPredicate` argument.
      if (chain[0] === 'ObjectColor') return { t: 'const', cls: chain[0], field: chain[1] };
      return { t: 'enum', enum: chain[0], v: chain[1] };
    }
  }
  return null;
}

function simpleTypeName(type) {
  if (typeof type === 'string') return type.split('.').pop();
  if (type && typeof type === 'object') {
    const name = type.name ?? type.id ?? type.raw;
    if (typeof name === 'string') return name.split('.').pop();
  }
  return String(type);
}

function flattenName(node) {
  const out = [];
  let cur = node;
  for (let guard = 0; cur && guard < 16; guard++) {
    if (cur.k === 'name') {
      out.unshift(cur.id);
      break;
    }
    if (cur.k === 'field') {
      out.unshift(cur.name);
      cur = cur.obj;
      continue;
    }
    break;
  }
  return out.filter(Boolean);
}

/* ================================================================== *
 * 3. Normalising one extraction node into a Slot
 * ================================================================== */

const HOLE_REASONS = {
  'card-local-class': 'card-local-class',
  'expression-arithmetic': 'expression-arithmetic',
  'call-on-unresolved': 'call-on-unresolved',
  lambda: 'lambda',
  'unknown-identifier': 'unknown-symbol',
  'unknown-holder': 'unknown-symbol',
  'unknown-class': 'unknown-symbol',
  'expression-unary': 'expression-unary',
  'anonymous-subclass': 'anonymous-subclass',
  'method-reference': 'method-reference',
  'bare-method-call': 'bare-method-call',
};

class Normaliser {
  constructor(staticPredicates, engineClasses) {
    this.staticPredicates = staticPredicates;
    this.engineClasses = engineClasses ?? {};
    this.stats = {
      slots: 0,
      value: 0,
      carried: 0,
      hole: 0,
      filtersSeen: 0,
      filtersResolved: 0,
      filtersRefusedByPredicate: 0,
      filtersRefusedByCtorArg: 0,
      filtersNarrowedByCtorArg: 0,
      filtersUnknownClass: 0,
      constsSeen: 0,
      constsResolved: 0,
      staticFilterRefsSeen: 0,
      staticFilterRefsResolved: 0,
      ambiguousArity: 0,
      ambiguousArityNamesAgree: 0,
    };
    /** What the refusals actually were, so the next table entry is chosen by count and not by hunch. */
    this.refusedPredicates = new Map();
    this.refusedFilterCtorArgs = new Map();
    this.unknownFilterClasses = new Map();
    this.carriedByKind = new Map();
  }

  tally(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  slot(node) {
    const s = this.slotInner(node);
    this.stats.slots += 1;
    if (s.value !== undefined) this.stats.value += 1;
    else if (s.carried !== undefined) {
      this.stats.carried += 1;
      this.tally(this.carriedByKind, s.carried.c);
    } else this.stats.hole += 1;
    if (node && node.name) s.name = node.name;
    if (node && node.paramType) s.of = node.paramType;
    return s;
  }

  slotInner(node) {
    if (!node || typeof node !== 'object') return { hole: { reason: 'unknown-symbol' } };
    switch (node.t) {
      case 'int':
        return { value: { k: 'int', n: node.v } };
      case 'bool':
        return { value: { k: 'bool', b: node.v } };
      case 'mana':
        return { value: { k: 'mana', cost: node.v } };
      case 'string':
        // Only strings the extractor already judged safe reach here; display
        // text arrives as `t:'text'` with its contents omitted.
        return { value: { k: 'name', name: node.v } };
      case 'text':
        return { carried: { c: 'text', length: node.len ?? 0 } };
      case 'null':
        return { carried: { c: 'null' } };
      case 'classLiteral':
        return { carried: { c: 'class-literal', cls: node.cls } };
      case 'cardRef':
        return { carried: { c: 'card-ref', cls: node.cls } };
      case 'ctorParam':
        return { carried: { c: 'self', what: node.name === 'ownerId' ? 'owner' : 'set-info' } };
      case 'self':
        return { carried: { c: 'self', what: 'source' } };
      case 'selfField':
        return { carried: { c: 'self', what: 'field', field: node.field } };
      case 'array':
        return { value: { k: 'list', items: (node.items ?? []).map((i) => this.slot(i)).map((s) => s.value).filter(Boolean) } };
      case 'enum':
        return this.enumSlot(node);
      case 'const':
        return this.constSlot(node);
      case 'obj':
        return this.objSlot(node.obj);
      case 'bespoke':
        return {
          hole: {
            reason: 'card-local-class',
            declared: node.base ?? undefined,
            localName: node.cls ?? undefined,
          },
        };
      case 'unresolved':
        return {
          hole: {
            reason: HOLE_REASONS[node.reason] ?? 'unknown-symbol',
            localName: node.cls ?? undefined,
          },
        };
      default:
        return { carried: { c: 'enum', enumName: String(node.t), member: '?' } };
    }
  }

  enumSlot(node) {
    if (node.enum === 'Zone') {
      const zone = ZONES[node.v];
      if (zone) return { value: { k: 'zone', zone } };
    }
    if (node.enum === 'Duration') {
      const duration = DURATIONS[node.v];
      if (duration) return { value: { k: 'duration', duration } };
    }
    if (node.enum === 'TargetController') {
      const who = CONTROLLERS[node.v];
      if (who) return { value: { k: 'players', who } };
    }
    return { carried: { c: 'enum', enumName: node.enum, member: node.v } };
  }

  constSlot(node) {
    this.stats.constsSeen += 1;
    if (node.cls === 'StaticFilters') {
      this.stats.staticFilterRefsSeen += 1;
      if (node.init && node.init.cls) {
        const resolved = this.resolveFilter(
          node.init.cls,
          this.staticModsFor(node.field),
          node.init.args ?? [],
        );
        if (resolved) {
          this.stats.constsResolved += 1;
          this.stats.staticFilterRefsResolved += 1;
          return { value: resolved };
        }
      }
    }
    return { carried: { c: 'const', holder: node.cls, field: node.field, of: node.of } };
  }

  staticModsFor(field) {
    const asts = this.staticPredicates.get(field) ?? [];
    return asts.map((a) => ({ m: 'add', args: [predicateFromAst(a)] })).filter((m) => m.args[0] || m.args[0] === null);
  }

  objSlot(obj) {
    if (!obj) return { hole: { reason: 'unknown-symbol' } };
    if (obj.bespoke) {
      return {
        hole: {
          reason: 'card-local-class',
          declared: obj.bespokeBase ?? undefined,
          localName: obj.cls ?? undefined,
        },
      };
    }
    if (obj.role === 'filter') {
      const resolved = this.resolveFilter(obj.cls, obj.mods ?? [], obj.args ?? []);
      if (resolved) return { value: resolved };
      return { carried: this.construct(obj) };
    }
    if (obj.factory) {
      // The ARGUMENTS of a static factory are load bearing and were being
      // dropped here. `CounterType.P1P1.createInstance()` and
      // `CounterType.P1P1.createInstance(2)` are different cards, because
      // AddCountersSourceEffect reads the count off the Counter object and not
      // off its own `amount` parameter. Discarding them turned every "two
      // +1/+1 counters" into one, silently. `Carried.factory` always declared
      // an `args` field; nothing was filling it.
      const carried = { c: 'factory', on: obj.factory.on ?? obj.cls, method: obj.factory.method };
      if (obj.args?.length) carried.args = obj.args.map((a) => this.slot(a));
      return { carried };
    }
    // A construction we keep as a construction. Its own arguments are still
    // normalised, so a hole three levels down is still counted as a hole.
    return { value: { k: 'invoke', invocation: this.invocation(obj) } };
  }

  resolveFilter(cls, mods, ctorArgs = []) {
    this.stats.filtersSeen += 1;
    const base = FILTER_CLASSES[cls];
    if (!base) {
      this.stats.filtersUnknownClass += 1;
      this.tally(this.unknownFilterClasses, cls);
      return null;
    }
    let filter = base.filter;
    let controller = base.controller;
    const zone = base.zone;

    // The filter's OWN constructor arguments, which used to be dropped. Every
    // one of the 30 classes in FILTER_CLASSES takes at most a display-name
    // String and an optional SubType, checked against their sources, and the
    // SubType is a narrowing that changes what the card does. Ignoring it read
    // Arbor Elf's `new FilterPermanent(SubType.FOREST, "Forest")` as "any
    // permanent", so "untap target Forest" became "untap target permanent",
    // and Blur Sliver's "Sliver creatures you control have haste" became every
    // creature you control. An argument this does not understand refuses the
    // whole filter, same direction as an unknown predicate below.
    for (const arg of ctorArgs) {
      const part = filterCtorArg(arg);
      if (part === SKIP) continue;
      if (part === null) {
        this.stats.filtersRefusedByCtorArg += 1;
        this.tally(this.refusedFilterCtorArgs, `${cls}(${describeCtorArg(arg)})`);
        return null;
      }
      this.stats.filtersNarrowedByCtorArg += 1;
      filter = filter.is === 'any' ? part : AND(filter, part);
    }

    for (const m of mods) {
      if (m.m !== 'add') continue;
      const folded = foldPredicate(m.args?.[0]);
      if (!folded) {
        // See foldPredicate's header: an unknown predicate narrows the set, so
        // the whole filter is refused rather than reported too wide.
        this.stats.filtersRefusedByPredicate += 1;
        this.tally(this.refusedPredicates, describePredicate(m.args?.[0]));
        return null;
      }
      if (folded.filter) filter = filter.is === 'any' ? folded.filter : AND(filter, folded.filter);
      if (folded.controller) controller = folded.controller;
    }

    this.stats.filtersResolved += 1;
    const out = { k: 'objects', filter };
    if (controller) out.controller = controller;
    if (zone) out.zone = zone;
    return out;
  }

  construct(obj) {
    return {
      c: 'construct',
      prim: `xmage:${obj.cls}`,
      role: obj.role ?? 'other',
      args: (obj.args ?? []).map((a) => this.slot(a)),
      ...(obj.mods ? { mods: obj.mods.map((m) => ({ m: m.m, args: (m.args ?? []).map((a) => this.slot(a)) })) } : {}),
    };
  }

  /**
   * `ambiguous-arity` conflates two different situations. Several overloads
   * matched, which means the extractor cannot say which constructor ran; but
   * if every candidate of that arity uses the SAME parameter name at every
   * position, the names are still trustworthy even though the overload is not.
   *
   * `CreateTokenEffect(Token, int)` and `CreateTokenEffect(Token, DynamicValue)`
   * both call the second argument `amount`, which is why Dockside Extortionist
   * can still be recognised as a Treasure maker. Without this the ambiguity
   * guard in `assignRoles` refuses the whole rule and the card loses its role
   * for a reason that is not actually a doubt.
   */
  sharpenParamMatch(obj) {
    if (obj.paramMatch !== 'ambiguous-arity') return obj.paramMatch;
    this.stats.ambiguousArity += 1;
    const cls = this.engineClasses[obj.fqn];
    const arity = (obj.args ?? []).length;
    const candidates = (cls?.ctors ?? []).filter((c) => (c.params ?? []).length === arity);
    if (candidates.length < 2) return obj.paramMatch;
    for (let i = 0; i < arity; i++) {
      const first = candidates[0].params[i]?.name;
      if (!first || candidates.some((c) => c.params[i]?.name !== first)) return obj.paramMatch;
    }
    this.stats.ambiguousArityNamesAgree += 1;
    return 'names-agree';
  }

  invocation(obj) {
    const inv = {
      prim: obj.fqn ? `xmage:${obj.cls}` : `local:${obj.cls}`,
      role: obj.role ?? 'other',
      args: (obj.args ?? []).map((a) => this.slot(a)),
    };
    if (obj.paramMatch) inv.paramMatch = this.sharpenParamMatch(obj);
    if (obj.mods) inv.mods = obj.mods.map((m) => ({ m: m.m, args: (m.args ?? []).map((a) => this.slot(a)) }));
    // Same rule as at ability level: the extraction states one construction
    // twice, so `children` reuses the object already built inside `args` rather
    // than making a second copy of it. Object identity is what lets the census
    // walkers count it once.
    const fromArgs = indexByPrim(inv);
    const reuse = (raw) => fromArgs.get(`xmage:${raw.cls}`) ?? fromArgs.get(`local:${raw.cls}`) ?? this.invocation(raw);
    const children = {};
    if (obj.effects) children.effects = obj.effects.map(reuse);
    if (obj.targets) children.targets = obj.targets.map(reuse);
    if (obj.costs) children.costs = obj.costs.map(reuse);
    if (obj.modes) children.modes = obj.modes.map(reuse);
    if (Object.keys(children).length) inv.children = children;
    return inv;
  }
}

const ZONES = {
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  HAND: 'hand',
  LIBRARY: 'library',
  EXILED: 'exile',
  COMMAND: 'command',
  STACK: 'stack',
};

const DURATIONS = {
  EndOfTurn: 'end-of-turn',
  Custom: 'permanent',
  WhileOnBattlefield: 'while-source-on-battlefield',
  EndOfGame: 'permanent',
  UntilYourNextTurn: 'your-next-turn',
};

/* ================================================================== *
 * 4. Building a CardRecord
 * ================================================================== */

const ABILITY_KIND = {
  'spell-ability': 'spell',
  'triggered-ability': 'triggered',
  'activated-ability': 'activated',
  'static-ability': 'static',
  'mana-ability': 'mana',
};

function abilityKind(a) {
  if (a.keyword && a.role === 'static-ability') return 'keyword';
  return ABILITY_KIND[a.role] ?? 'static';
}

function layoutOf(base) {
  switch (base) {
    case 'TransformingDoubleFacedCard':
      return 'transform';
    case 'ModalDoubleFacedCard':
      return 'modal-dfc';
    case 'SplitCard':
      return 'split';
    case 'AdventureCard':
      return 'adventure';
    case 'MeldCard':
      return 'meld';
    case 'CardImpl':
    case 'LevelerCard':
      return 'normal';
    default:
      return 'other';
  }
}

/** Every invocation reachable from one invocation's arguments, keyed by primitive. */
function indexByPrim(invocation) {
  const out = new Map();
  const visit = (node) => {
    for (const slot of node.args ?? []) {
      const inner = slot.value?.k === 'invoke' ? slot.value.invocation : null;
      if (!inner) continue;
      if (!out.has(inner.prim)) out.set(inner.prim, inner);
      visit(inner);
    }
  };
  visit(invocation);
  return out;
}

function buildRecord(raw, norm, meta) {
  const layout = layoutOf(raw.base);
  const faceKinds = new Set(raw.abilities?.map((a) => a.face) ?? []);
  const multi = layout === 'transform' || layout === 'modal-dfc' || layout === 'split' || layout === 'adventure';

  const superArgs = raw.superArgs ?? [];
  const manaArgs = superArgs.filter((a) => a.t === 'mana').map((a) => a.v);
  const typeArrays = superArgs.filter((a) => a.t === 'array' && (a.items ?? []).some((i) => i.enum === 'CardType'));
  const subArrays = superArgs.filter((a) => a.t === 'array' && (a.items ?? []).some((i) => i.enum === 'SubType'));

  const faces = [];
  const addFace = (kind, index) => {
    const name = index === 0 ? (raw.names?.[0] ?? raw.cls).split(' // ')[0] : (raw.names?.[0] ?? raw.cls).split(' // ')[1] ?? raw.cls;
    faces.push({
      index,
      kind,
      name,
      mana: manaArgs[index] ?? (index === 0 ? (manaArgs[0] ?? null) : null),
      types: (typeArrays[index]?.items ?? typeArrays[0]?.items ?? []).map((i) => titleCase(i.v)),
      subtypes: (subArrays[index]?.items ?? []).map((i) => titleCase(i.v)),
      supertypes: [],
      abilities: [],
    });
  };

  if (multi && (faceKinds.has('left') || faceKinds.has('right') || faceKinds.has('adventure-spell'))) {
    addFace('left', 0);
    addFace(faceKinds.has('adventure-spell') ? 'adventure-spell' : 'right', 1);
  } else {
    addFace('main', 0);
  }

  // `subtype.add` and `supertype.add` from the constructor body.
  for (const m of raw.shape ?? []) {
    if (m.m === 'subtype.add') {
      const v = m.args?.[0]?.v;
      if (v) faces[0].subtypes.push(titleCase(v));
    }
    if (m.m === 'supertype.add') {
      const v = m.args?.[0]?.v;
      if (v) faces[0].supertypes.push(titleCase(v));
    }
    if (m.m === 'setPT') {
      const target = faces.find((f) => f.pt === undefined) ?? faces[0];
      target.pt = { power: String(m.args?.[0]?.v ?? '?'), toughness: String(m.args?.[1]?.v ?? '?') };
    }
    if (m.m === 'setStartingLoyalty') faces[0].startingLoyalty = String(m.args?.[0]?.v ?? '?');
  }
  if (raw.fields?.power) {
    faces[0].pt = {
      power: String(raw.fields.power.obj?.args?.[0]?.v ?? '?'),
      toughness: String(raw.fields.toughness?.obj?.args?.[0]?.v ?? '?'),
    };
  }

  const faceIndex = (kind) => {
    if (kind === 'right' || kind === 'adventure-spell') return Math.min(1, faces.length - 1);
    return 0;
  };

  (raw.abilities ?? []).forEach((a, i) => {
    const fi = faceIndex(a.face);
    const face = faces[fi] ?? faces[0];
    const via = norm.invocation({
      cls: a.cls,
      fqn: a.fqn,
      role: a.role,
      args: a.args,
      mods: a.mods,
      paramMatch: a.paramMatch,
    });

    // The extraction states the same construction twice: once as an argument to
    // the ability's constructor, and once in its own `effects` / `targets` /
    // `costs` list. Both are true. Normalising each separately would produce two
    // objects for one thing, and the slot census would count it twice, so the
    // already-normalised object inside `via` is reused where it exists. Object
    // identity is then what lets the walkers deduplicate.
    const fromVia = indexByPrim(via);
    const reuse = (raw) => fromVia.get(`xmage:${raw.cls}`) ?? fromVia.get(`local:${raw.cls}`) ?? norm.invocation(raw);

    const ability = {
      id: `f${fi}a${i}`,
      kind: abilityKind(a),
      via,
      effects: (a.effects ?? []).map(reuse),
      costs: (a.costs ?? []).map(reuse),
      targets: (a.targets ?? []).map(reuse),
    };

    if (a.modes?.length) {
      ability.modes = [
        { index: 0, effects: ability.effects, targets: ability.targets },
        ...a.modes.map((m, mi) => ({
          index: mi + 1,
          effects: (m.effects ?? []).map((e) => norm.invocation(e)),
          targets: (m.targets ?? []).map((t) => norm.invocation(t)),
        })),
      ];
    }

    const minModes = (a.mods ?? []).find((m) => m.m === 'getModes.setMinModes');
    const maxModes = (a.mods ?? []).find((m) => m.m === 'getModes.setMaxModes');
    if (minModes || maxModes) {
      ability.modeLimits = {
        min: minModes?.args?.[0]?.v ?? 1,
        max: maxModes?.args?.[0]?.v ?? 1,
      };
    }

    const iif = (a.mods ?? []).find((m) => m.m === 'withInterveningIf');
    if (iif) ability.interveningIf = norm.slot(iif.args?.[0]);

    if (a.keyword) {
      ability.keyword = { name: a.cls.replace(/Ability$/, '') };
      if (a.args?.length) ability.keyword.parameter = norm.slot(a.args[0]);
    }
    if (a.helper) ability.fromHelper = a.helper;

    face.abilities.push(ability);
  });

  return {
    oracleId: raw.oracleIds?.[0] ?? '',
    name: raw.names?.[0] ?? raw.cls,
    layout,
    faces,
    commanderLegal: !!raw.commanderLegal,
    provenance: {
      xmageClass: raw.cls,
      xmagePath: raw.path,
      xmageCommit: meta.commit,
      builtBy: 'scripts/xmage/build-records.mjs',
      builtAt: meta.now,
      join: raw.oracleIds?.length ? 'exact' : 'none',
    },
  };
}

/* ================================================================== *
 * 5. Run
 * ================================================================== */

const HARD_LIST = [
  'WrathOfGod',
  'Damnation',
  'Armageddon',
  'LightningBolt',
  'Cultivate',
  'RhysticStudy',
  'CyclonicRift',
  'SmotheringTithe',
  'DocksideExtortionist',
  'CrypticCommand',
  'BattleOfWits',
  'DelverOfSecrets',
  'AgadeemsAwakening',
  'Shock',
  'KodamasReach',
];

async function main() {
  const engine = JSON.parse(readFileSync(ENGINE, 'utf8'));
  const meta = { commit: engine.meta?.commit ?? engine.meta?.xmageCommit ?? 'unknown', now: new Date().toISOString() };

  const staticFilters = readStaticFilterPredicates();
  const norm = new Normaliser(staticFilters.predicates, engine.classes);

  const hard = new Map();
  const records = [];
  let lines = 0;

  const rl = createInterface({ input: createReadStream(NDJSON) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lines += 1;
    const raw = JSON.parse(line);
    const record = buildRecord(raw, norm, meta);
    records.push(record);
    if (HARD_LIST.includes(raw.cls)) hard.set(raw.cls, record);
  }

  /* ---- coverage over the whole corpus, with the seed tables ---- */
  const report = reportCoverage(records, 'XMage card files with an extracted record', { now: meta.now });

  /* ---- what the record adds on cards the TEXT compiler refuses outright ----
   *
   * `dsl-coverage.latest.json` marks a card `manual` when the oracle-text
   * compiler produced no abilities at all. Cultivate is one of them. The
   * question worth answering is whether structure gets anywhere on the cards
   * text could not, because "recommendations are weak" is the symptom and "the
   * app decides what a card does by matching its wording" is the cause. */
  const textCoverage = existsSync(path.join(DATA, 'dsl-coverage.latest.json'))
    ? JSON.parse(readFileSync(path.join(DATA, 'dsl-coverage.latest.json'), 'utf8')).cards
    : {};
  const versusText = { manualInText: 0, ofThoseSearchable: 0, ofThoseWithRole: 0, ofThosePlayable: 0 };

  /* ---- the shared vocabulary, and the tail that is not shared ----
   *
   * The whole approach rests on one ratio. A SHARED XMage class is used by many
   * cards, so writing its meaning once pays many times. A CARD-LOCAL class is
   * used by one card, so writing it pays once. Counting them separately is the
   * only way to tell work that pays many times from work that pays once, and it
   * is why `PrimId` prefixes the two differently. */
  const sharedByRole = new Map();
  const localClasses = new Set();
  for (const record of records) {
    for (const ability of abilitiesOf(record)) {
      for (const invocation of invocationsInAbility(ability)) {
        if (invocation.prim.startsWith('local:')) {
          localClasses.add(invocation.prim);
          continue;
        }
        if (!sharedByRole.has(invocation.role)) sharedByRole.set(invocation.role, new Set());
        sharedByRole.get(invocation.role).add(invocation.prim);
      }
      for (const slot of slotsInAbility(ability)) {
        if (slot.hole?.localName) localClasses.add(`local:${slot.hole.localName}`);
      }
    }
  }

  /* ---- the ceiling ----
   *
   * A shared primitive pays for every card that uses it. A card-local class
   * pays for one card. So the number of cards that could EVER be reached by
   * writing shared primitives, with no hand work at all, is the number of cards
   * with no hole anywhere in them. It is a ceiling and not a forecast, and it
   * is the honest limit of the whole approach. */
  const ceiling = { reachable: 0, needsAPerson: 0 };
  for (const record of records) {
    if (reachableBySharedWork(record)) ceiling.reachable += 1;
    else ceiling.needsAPerson += 1;
  }
  for (const record of records) {
    const text = textCoverage[record.oracleId];
    if (!text || text.coverage !== 'manual') continue;
    versusText.manualInText += 1;
    const cov = coverageOf(record);
    if (cov.searchable) versusText.ofThoseSearchable += 1;
    if (cov.aggregatablePartly) versusText.ofThoseWithRole += 1;
    if (cov.playable) versusText.ofThosePlayable += 1;
  }

  /* ---- the hard list, worked ---- */
  const worked = {};
  for (const cls of HARD_LIST) {
    const record = hard.get(cls);
    if (!record) {
      worked[cls] = { missing: true };
      continue;
    }
    const lowered = lowerCard(record);
    worked[cls] = {
      record,
      coverage: coverageOf(record),
      roles: rolesOf(record),
      facets: facetsOf(record),
      comparable: comparisonClasses(record),
      lowered: lowered.ok
        ? { ok: true, abilities: lowered.abilities }
        : { ok: false, blocked: lowered.blocked },
      census: censusOf(slotsInRecord(record)),
    };
  }

  const wrath = hard.get('WrathOfGod');
  const damnation = hard.get('Damnation');
  const armageddon = hard.get('Armageddon');
  const rift = hard.get('CyclonicRift');
  const comparisons = [];
  if (wrath && damnation) comparisons.push({ a: 'Wrath of God', b: 'Damnation', result: compareCards(wrath, damnation) });
  if (wrath && armageddon) comparisons.push({ a: 'Wrath of God', b: 'Armageddon', result: compareCards(wrath, armageddon) });
  if (wrath && rift) comparisons.push({ a: 'Wrath of God', b: 'Cyclonic Rift', result: compareCards(wrath, rift) });
  const bolt = hard.get('LightningBolt');
  const shock = hard.get('Shock');
  if (bolt && shock) comparisons.push({ a: 'Lightning Bolt', b: 'Shock', result: compareCards(bolt, shock) });
  const cultivate = hard.get('Cultivate');
  const reach = hard.get('KodamasReach');
  if (cultivate && reach) comparisons.push({ a: 'Cultivate', b: "Kodama's Reach", result: compareCards(cultivate, reach) });

  writeFileSync(
    path.join(DATA, 'xmage-records.hardlist.json'),
    JSON.stringify({ meta, worked, comparisons }, null, 1),
  );

  const topOf = (map, k) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);

  /* ---- cross-check against the extraction's own count ----
   *
   * `extract-effects.mjs` counts distinct effect classes over every `new` node
   * in the source. This script counts them over the built records, reachable
   * from an ability root. The two are independent walks of the same corpus, so
   * agreement is evidence the record shape did not quietly lose a branch, and
   * disagreement is a bug in whichever is smaller. */
  const rankPath = path.join(DATA, 'xmage-effect-rank.all.json');
  let crossCheck = null;
  if (existsSync(rankPath)) {
    const rank = JSON.parse(readFileSync(rankPath, 'utf8'))
      .filter((r) => r.role === 'one-shot-effect' || r.role === 'continuous-effect')
      .map((r) => `xmage:${r.cls}`);
    const mine = new Set([
      ...(sharedByRole.get('one-shot-effect') ?? []),
      ...(sharedByRole.get('continuous-effect') ?? []),
    ]);
    crossCheck = {
      extractionCounted: rank.length,
      recordsReach: mine.size,
      inExtractionNotInRecords: rank.filter((r) => !mine.has(r)).sort(),
      inRecordsNotInExtraction: [...mine].filter((r) => !rank.includes(r)).sort(),
    };
    console.log('');
    console.log('CROSS-CHECK, distinct effect classes');
    console.log(`  extract-effects.mjs counted over every new node   ${crossCheck.extractionCounted}`);
    console.log(`  reachable from an ability root in the records     ${crossCheck.recordsReach}`);
    console.log(`  in the extraction, not reached here              ${crossCheck.inExtractionNotInRecords.length} ${crossCheck.inExtractionNotInRecords.slice(0, 6).join(', ')}`);
    console.log(`  reached here, not in the extraction              ${crossCheck.inRecordsNotInExtraction.length} ${crossCheck.inRecordsNotInExtraction.slice(0, 6).join(', ')}`);
  }

  const shape = {
    meta: { ...meta, script: 'scripts/xmage/build-records.mjs', cardsRead: lines },
    staticFilters: { file: staticFilters.file, constants: staticFilters.predicates.size, adds: staticFilters.adds },
    normalisation: norm.stats,
    versusTextCompiler: versusText,
    sharedVocabulary: Object.fromEntries([...sharedByRole.entries()].map(([k, v]) => [k, v.size])),
    cardLocalClasses: localClasses.size,
    crossCheck,
    ceiling,
    carriedByKind: topOf(norm.carriedByKind, 40),
    refusedPredicates: topOf(norm.refusedPredicates, 40),
    unknownFilterClasses: topOf(norm.unknownFilterClasses, 40),
    coverage: report,
  };
  writeFileSync(path.join(DATA, 'xmage-record-shape.json'), JSON.stringify(shape, null, 1));

  /* ---- print ---- */
  const pct = (n, d) => `${((100 * n) / d).toFixed(2)}%`;
  console.log(`cards read                 ${lines}`);
  console.log(`StaticFilters replayed     ${staticFilters.predicates.size} constants, ${staticFilters.adds} add() calls`);
  console.log('');
  console.log('SLOT CENSUS, denominator is every argument slot in every record');
  const c = report.slots;
  console.log(`  total   ${c.total}`);
  console.log(`  value   ${c.value}  ${pct(c.value, c.total)}`);
  console.log(`  carried ${c.carried}  ${pct(c.carried, c.total)}`);
  console.log(`  hole    ${c.hole}  ${pct(c.hole, c.total)}`);
  console.log('  carried, by what it is:');
  for (const [k, v] of topOf(norm.carriedByKind, 10)) console.log(`    ${String(v).padStart(6)}  ${k}`);
  console.log('');
  console.log('FILTERS');
  const n = norm.stats;
  console.log(`  constructions seen       ${n.filtersSeen}`);
  console.log(`  resolved to a CardFilter ${n.filtersResolved}  ${pct(n.filtersResolved, n.filtersSeen)}`);
  console.log(`  refused, unknown class   ${n.filtersUnknownClass}`);
  console.log(`  refused, unknown pred    ${n.filtersRefusedByPredicate}`);
  console.log(`  refused, unknown ctor arg ${n.filtersRefusedByCtorArg}`);
  console.log(`  narrowed by ctor arg     ${n.filtersNarrowedByCtorArg}`);
  console.log(`  StaticFilters references ${n.staticFilterRefsResolved} of ${n.staticFilterRefsSeen} resolved`);
  console.log(`  ambiguous overloads      ${n.ambiguousArity}, of which ${n.ambiguousArityNamesAgree} have agreeing parameter names`);
  console.log('  top refused predicates:');
  for (const [k, v] of topOf(norm.refusedPredicates, 12)) console.log(`    ${String(v).padStart(6)}  ${k}`);
  console.log('');
  console.log(`FOUR COVERAGE NUMBERS, denominator ${report.denominator} (${report.denominatorMeaning})`);
  console.log(`  playable            ${report.playable}  ${pct(report.playable, report.denominator)}`);
  console.log(`  (vacuous, no abilities, NOT counted as playable) ${report.vacuous}`);
  console.log(`  aggregatable        ${report.aggregatable}  ${pct(report.aggregatable, report.denominator)}`);
  console.log(`  aggregatable partly ${report.aggregatablePartly}  ${pct(report.aggregatablePartly, report.denominator)}`);
  console.log(`  searchable          ${report.searchable}  ${pct(report.searchable, report.denominator)}`);
  console.log(`  comparable          ${report.comparable}  ${pct(report.comparable, report.denominator)}`);
  console.log('');
  console.log('SHARED VOCABULARY, distinct XMage classes the corpus invokes, by role');
  for (const [role, set] of [...sharedByRole.entries()].sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${String(set.size).padStart(6)}  ${role}`);
  }
  console.log(`  ${String(localClasses.size).padStart(6)}  CARD-LOCAL classes, used by one card each`);
  console.log('');
  console.log('THE CEILING, cards reachable by shared primitives alone');
  console.log(`  no hole and no card-local class  ${ceiling.reachable}  ${pct(ceiling.reachable, lines)}`);
  console.log(`  needs a person                   ${ceiling.needsAPerson}  ${pct(ceiling.needsAPerson, lines)}`);
  console.log('');
  console.log('CARDS THE ORACLE-TEXT COMPILER REFUSES OUTRIGHT (coverage "manual")');
  console.log(`  in dsl-coverage.latest.json, and joined to a record   ${versusText.manualInText}`);
  console.log(`  of those, the record makes searchable                 ${versusText.ofThoseSearchable}  ${pct(versusText.ofThoseSearchable, versusText.manualInText)}`);
  console.log(`  of those, the record gives at least one role          ${versusText.ofThoseWithRole}  ${pct(versusText.ofThoseWithRole, versusText.manualInText)}`);
  console.log(`  of those, the record makes playable with seed tables  ${versusText.ofThosePlayable}  ${pct(versusText.ofThosePlayable, versusText.manualInText)}`);
  console.log('');
  console.log('WORK ORDER, cards unblocked per missing lowering, top 25');
  for (const row of report.workOrder.slice(0, 25)) {
    console.log(`  ${String(row.cards).padStart(6)}  ${row.prim}`);
  }
}

/* ================================================================== *
 * 6. Reuse
 *
 * The record builder is the only thing that knows how to turn the extraction
 * into the shape `src/lib/cards/xmage/record.ts` describes. Two other scripts
 * need that and must not reimplement it: `port-progress.mjs` measures what the
 * lowering tables reach, and `make-fixtures.mjs` freezes real records for the
 * tests. A second copy of this would drift, and a fixture built by a drifted
 * copy tests a card that does not exist.
 * ================================================================== */

/** Every record the extraction produced, built once. */
export async function loadRecords() {
  const engine = JSON.parse(readFileSync(ENGINE, 'utf8'));
  const meta = {
    commit: engine.meta?.commit ?? engine.meta?.xmageCommit ?? 'unknown',
    now: new Date().toISOString(),
  };
  const staticFilters = readStaticFilterPredicates();
  const norm = new Normaliser(staticFilters.predicates, engine.classes);
  const records = [];
  const rl = createInterface({ input: createReadStream(NDJSON) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(buildRecord(JSON.parse(line), norm, meta));
  }
  return { records, meta, norm, staticFilters };
}

export { buildRecord, Normaliser, readStaticFilterPredicates };

const RUN_DIRECTLY =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (RUN_DIRECTLY) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
