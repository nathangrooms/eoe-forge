#!/usr/bin/env node
/**
 * Generate the filter table from XMage's own filter classes and `StaticFilters`.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. Forge is GPL-3.0
 * and was not fetched, read or referenced.
 *
 * ## Why this is generated and not typed out
 *
 * The same reason `extract-tokens.mjs` is. After the token tranche the largest
 * family left on the translator's work order is filters, and it is a family
 * rather than a row: 181 bodies stop on a `StaticFilters.*` constant across 56
 * distinct constants, and 62 more stop on a `new FilterSomething()` across 22
 * classes. On a first-blocker ranking that is 78 rows of one and two, and it
 * never appears as a single line of work. It is one mapping.
 *
 * `translate.mjs` already carries 29 `StaticFilters` rows typed out by hand.
 * Hand transcribing the other 56 would be a day of work and would be wrong in a
 * handful of places nobody could find afterwards, because a filter that matches
 * one card type too many looks exactly like a correct one on every board where
 * that type is absent. Parsing them is one script whose failures are COUNTABLE:
 * every class it cannot read is reported by name and left out of the table, so
 * the gap is visible rather than filled with "any permanent".
 *
 * ## What is read, and what is deliberately not
 *
 * Read: the PREDICATES a filter's constructor chain adds, resolved through the
 * class's own supertypes up to a base filter that says which zone the filter
 * reads. Those are the rules content of a filter.
 *
 * Not read: the filter's NAME. XMage passes one to every constructor — "land
 * you control", "a nonland card" — and those are Wizards of the Coast wording,
 * not XMage's to license. The name this script emits is BUILT from the
 * predicates it resolved, never copied, which is the same rule
 * `extract-tokens.mjs` applies to a token's type line. It reaches a player only
 * as part of this engine's own log line.
 *
 * ## The rule that decides whether a filter is emitted
 *
 * Every predicate in the chain must resolve. One that does not and the whole
 * filter is refused and the thing that stopped it is recorded by name — the
 * same rule `translate.mjs` applies to a body, for the same reason. A filter
 * with a predicate quietly missing is a filter that matches too much, and the
 * card built on it destroys the wrong permanent.
 *
 * Run:
 *   node scripts/xmage/extract-filters.mjs
 * Writes:
 *   scripts/coverage/.data/xmage-filter-table.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize, findAllConstructors } from './lib/java-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const XMAGE_ROOT =
  process.env.XMAGE_ROOT || 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const FILTER_DIR = path.join(XMAGE_ROOT, 'Mage/src/main/java/mage/filter');
const OUT_JSON = path.join(REPO, 'scripts/coverage/.data/xmage-filter-table.json');

/* -------------------------------------------------------------------------- */
/* 1. Which base filter a chain bottoms out in                                */
/* -------------------------------------------------------------------------- */

/*
 * The base says WHAT THE FILTER READS, which no predicate can say. A
 * `FilterCard` is asked about cards in a zone and a `FilterPermanent` about
 * permanents on the battlefield, and the two are not interchangeable: a
 * "creature card" filter run over the battlefield would match the wrong things
 * in a way no predicate list could correct.
 *
 * `null` means the base carries a restriction this engine cannot express, so
 * every filter under it is refused rather than silently widened. `FilterSpell`
 * and `FilterStackObject` read the stack, which our `XFilter` does not; a
 * `FilterMana` is not an object filter at all.
 */
const BASES = {
  FilterObject: { zone: 'any', predicates: [] },
  FilterImpl: { zone: 'any', predicates: [] },
  FilterCard: { zone: 'card', predicates: [] },
  FilterPermanent: { zone: 'permanent', predicates: [] },
  FilterInPlay: { zone: 'permanent', predicates: [] },
  FilterPlayer: { zone: 'player', predicates: [] },
  FilterOpponent: { zone: 'player', predicates: ['OPPONENT'] },
  // Deliberately unsupported. Named so the report says which, not "unknown".
  FilterSpell: null,
  FilterStackObject: null,
  FilterMana: null,
  FilterAbility: null,
  FilterSource: null,
  FilterPermanentThisOrAnother: null,
};

/* -------------------------------------------------------------------------- */
/* 2. The predicate vocabulary                                                */
/* -------------------------------------------------------------------------- */

/*
 * Each entry turns one XMage predicate expression into the TypeScript
 * `filters.ts` already exports. Written as a matcher over the SOURCE TEXT of
 * the argument, because a predicate argument is a short static expression and
 * every form below was read out of the clone rather than guessed.
 *
 * An argument matching nothing here refuses the filter and is reported by its
 * own text, which is how the next tranche finds out what to add.
 */
const PREDICATES = [
  [/^CardType\.([A-Z_]+)\.getPredicate\(\)$/, m => `cardTypePredicate(${lit(m[1])})`],
  [/^SubType\.([A-Z_0-9]+)\.getPredicate\(\)$/, m => `subTypePredicate(${lit(m[1])})`],
  [/^SuperType\.([A-Z_]+)\.getPredicate\(\)$/, m => `superTypePredicate(${lit(m[1])})`],
  [/^new ColorPredicate\(ObjectColor\.([A-Z]+)\)$/, m => `colorPredicate(${lit(m[1])})`],
  [/^TargetController\.YOU\.getControllerPredicate\(\)$/, () => `controlledByPredicate()`],
  [/^TargetController\.OPPONENT\.getControllerPredicate\(\)$/, () => `controlledByOpponentPredicate()`],
  [/^TargetController\.YOU\.getOwnerPredicate\(\)$/, () => `ownedByPredicate()`],
  [/^AnotherPredicate\.instance$/, () => `anotherPredicate()`],
  [/^TappedPredicate\.TAPPED$/, () => `tappedPredicate(true)`],
  [/^TappedPredicate\.UNTAPPED$/, () => `tappedPredicate(false)`],
  /*
   * `TokenPredicate.FALSE` is "not a token". This engine records a token as a
   * card instance with no printing behind it, so `Predicates.not` over the
   * token flag is the honest spelling and `filters.ts` has no dedicated one.
   * It is left OUT rather than approximated: see `UNRESOLVED` below.
   */
];

const lit = name => JSON.stringify(String(name).toLowerCase().replace(/_/g, ' '));

/* -------------------------------------------------------------------------- */
/* 3. Reading one class                                                       */
/* -------------------------------------------------------------------------- */

/** Every `.java` under `mage/filter`, by simple class name. */
function indexFilterFiles() {
  const files = new Map();
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.java')) files.set(entry.name.slice(0, -5), full);
    }
  };
  walk(FILTER_DIR);
  return files;
}

/** The text of one balanced argument list, split at top-level commas. */
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '<') depth++;
    else if (c === ')' || c === '>') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/** `a . b ( c )` back to `a.b(c)`, so a predicate can be matched as text. */
const tidy = text =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ', ');

/** Every top-level `add(<expr>)` in a body, as tidied argument text. */
function addCalls(body, receiverPattern) {
  const out = [];
  const re = new RegExp(`${receiverPattern}add\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(body)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < body.length; end++) {
      if (body[end] === '(') depth++;
      else if (body[end] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ arg: tidy(body.slice(open + 1, end)), at: m.index });
  }
  return out;
}

/**
 * The predicates one class's own NO-ARGUMENT construction adds, and the class
 * it extends.
 *
 * ## The chain is longer than it looks, and half-walking it is the bug
 *
 * XMage's filters delegate several hops:
 *
 *     FilterControlledCreaturePermanent()       -> this("creature you control")
 *     FilterControlledCreaturePermanent(String) -> this(null, name)
 *     FilterControlledCreaturePermanent(SubType, String)
 *                                               -> super(name); add(CREATURE)
 *
 * and the supertype does the same again to add "you control". A walker that
 * followed ONE hop and returned what it had found produced an EMPTY predicate
 * list for that class — a filter matching every permanent on the battlefield,
 * under a name that says "creature you control". That is the shape of failure
 * this whole project keeps having to relearn, so the rule here is: a chain that
 * cannot be followed to its end REFUSES. It never returns the part it managed.
 *
 * ## Guarded adds, and why the parameters have to be bound
 *
 * `if (subtype != null) this.add(subtype.getPredicate())` is real, and whether
 * it fires depends on which constructor called this one. So each hop binds
 * parameter names to the argument expressions actually passed, and a guard on a
 * parameter bound to `null` is resolved rather than guessed. A guard on
 * anything else refuses the class.
 */
function readClass(source, className) {
  const superMatch = source.match(
    new RegExp(`class\\s+${className}\\s+extends\\s+([A-Za-z0-9_]+)`)
  );
  const parent = superMatch ? superMatch[1] : null;

  const toks = tokenize(source);
  const ctors = findAllConstructors(toks, className);
  if (ctors.length === 0) return { parent, noArg: false, adds: [], failed: [] };

  const bodyText = ctor => toks.slice(ctor.open + 1, ctor.close).map(t => t.v).join(' ');
  const paramList = ctor => {
    const text = tidy(ctor.params.map(t => t.v).join(' ')).replace(/^\(|\)$/g, '').trim();
    return text === '' ? [] : splitArgs(text);
  };
  const paramNames = ctor => paramList(ctor).map(p => p.split(' ').pop());

  let current = ctors.find(c => paramList(c).length === 0);
  if (!current) return { parent, noArg: false, adds: [], failed: [] };

  const adds = [];
  const failed = [];
  let bindings = new Map();
  const visited = new Set();

  for (let hop = 0; hop < 8; hop++) {
    if (visited.has(current.nameIndex)) {
      failed.push('constructor delegation cycle');
      break;
    }
    visited.add(current.nameIndex);
    const body = bodyText(current);

    /*
     * A guarded add is kept only when the guard is decided by a parameter this
     * walk has bound. Anything else refuses, because the alternative is
     * choosing a branch and shipping whichever filter that produced.
     */
    for (const guard of body.matchAll(/if\s*\(\s*([A-Za-z0-9_]+)\s*(!=|==)\s*null\s*\)/g)) {
      const [, name, op] = guard;
      const bound = bindings.get(name);
      if (bound === undefined) {
        failed.push(`guard on unbound ${name}`);
        continue;
      }
      const isNull = bound === 'null';
      // The only branch this table ever walks is the one a no-argument
      // construction takes, and every such parameter is bound to `null`.
      if ((op === '!=' && !isNull) || (op === '==' && isNull)) {
        failed.push(`guard on ${name} takes the branch this walk does not model`);
      }
    }
    // Everything a guard would have skipped is inside braces after the `if`.
    const unguarded = body.replace(/if\s*\([^)]*\)\s*\{[^{}]*\}/g, ' ').replace(/if\s*\([^)]*\)[^;]*;/g, ' ');

    for (const { arg } of addCalls(unguarded, '(?:this\\s*\\.\\s*)?')) {
      const mapped = resolvePredicate(arg);
      if (mapped === null) failed.push(arg);
      else adds.push(mapped);
    }

    const delegate = tidy(body).match(/^this\((.*?)\)\s*;/);
    if (!delegate) {
      // No `this(...)`: this is the constructor that calls `super(...)`, and
      // the chain within this class ends here.
      if (!/^\s*super\s*\(/.test(tidy(body))) {
        failed.push('constructor chain ends without calling super');
      }
      break;
    }
    const args = splitArgs(delegate[1]);
    const next = ctors.find(c => paramList(c).length === args.length && c !== current);
    if (!next) {
      failed.push(`no constructor of ${className} takes ${args.length} argument(s)`);
      break;
    }
    const names = paramNames(next);
    const nextBindings = new Map();
    for (let i = 0; i < names.length; i++) nextBindings.set(names[i], args[i]);
    bindings = nextBindings;
    current = next;
  }

  return { parent, noArg: true, adds, failed };
}

function resolvePredicate(text) {
  for (const [re, build] of PREDICATES) {
    const m = text.match(re);
    if (m) return build(m);
  }
  // `Predicates.not(X)` and `Predicates.or(A, B)`, recursively.
  const wrapped = text.match(/^Predicates\.(not|or|and)\((.*)\)$/);
  if (wrapped) {
    const parts = splitArgs(wrapped[2]).map(resolvePredicate);
    if (parts.some(p => p === null)) return null;
    return `Predicates.${wrapped[1]}(${parts.join(', ')})`;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* 4. The whole chain                                                         */
/* -------------------------------------------------------------------------- */

function resolveChain(name, files, cache, seen = new Set()) {
  if (cache.has(name)) return cache.get(name);
  if (seen.has(name)) return { ok: false, why: `cycle at ${name}` };
  seen.add(name);

  if (Object.prototype.hasOwnProperty.call(BASES, name)) {
    const base = BASES[name];
    const result = base
      ? { ok: true, zone: base.zone, predicates: [...base.predicates] }
      : { ok: false, why: `base ${name} reads something this engine's filter cannot` };
    cache.set(name, result);
    return result;
  }

  const file = files.get(name);
  if (!file) {
    const result = { ok: false, why: `no source for ${name}` };
    cache.set(name, result);
    return result;
  }

  const source = readFileSync(file, 'utf8');
  const own = readClass(source, name);
  if (!own.parent) {
    const result = { ok: false, why: `${name} extends nothing this script can follow` };
    cache.set(name, result);
    return result;
  }
  if (own.failed.length > 0) {
    const result = { ok: false, why: `predicate: ${own.failed[0]}` };
    cache.set(name, result);
    return result;
  }

  const parent = resolveChain(own.parent, files, cache, seen);
  if (!parent.ok) {
    cache.set(name, parent);
    return parent;
  }
  const result = {
    ok: true,
    zone: parent.zone,
    predicates: [...parent.predicates, ...own.adds],
    noArg: own.noArg,
  };
  cache.set(name, result);
  return result;
}

/* -------------------------------------------------------------------------- */
/* 5. Names, built and never copied                                           */
/* -------------------------------------------------------------------------- */

/*
 * The filter's message, BUILT from the predicates that resolved. XMage's own
 * string is never read. It is only ever shown inside this engine's own log
 * line, so it says what the filter matches and nothing more.
 */
function describe(zone, predicates) {
  const words = [];
  let controller = '';
  for (const p of predicates) {
    let m;
    if ((m = p.match(/^cardTypePredicate\("([^"]+)"\)$/))) words.push(m[1]);
    else if ((m = p.match(/^subTypePredicate\("([^"]+)"\)$/))) words.push(m[1]);
    else if ((m = p.match(/^superTypePredicate\("([^"]+)"\)$/))) words.unshift(m[1]);
    else if ((m = p.match(/^colorPredicate\("([^"]+)"\)$/))) words.unshift(m[1]);
    else if (p === 'controlledByPredicate()') controller = ' you control';
    else if (p === 'controlledByOpponentPredicate()') controller = ' an opponent controls';
    else if (p === 'ownedByPredicate()') controller = ' you own';
    else if (p === 'anotherPredicate()') words.unshift('another');
    else if (p === 'tappedPredicate(true)') words.unshift('tapped');
    else if (p === 'tappedPredicate(false)') words.unshift('untapped');
  }
  const noun = zone === 'card' ? 'card' : zone === 'player' ? 'player' : 'permanent';
  const head = words.length ? words.join(' ') : noun;
  const tail = words.length && zone === 'card' ? ' card' : '';
  return `${head}${tail}${controller}`;
}

/* -------------------------------------------------------------------------- */
/* 6. StaticFilters                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `StaticFilters.FILTER_X = new SomeFilterClass(...)`.
 *
 * ## The one argument that is safe to drop, and every other one is not
 *
 * A lone STRING LITERAL is the filter's NAME and nothing else:
 * `new FilterNonlandCard("a nonland card")` matches exactly what
 * `new FilterNonlandCard()` matches, and the string is Wizards wording this
 * project may not copy anyway. Dropping it is not an approximation, it is the
 * only reading available. 171 of the 198 constants are written that way, so
 * refusing them would have thrown away seven eighths of the table for a
 * difference that does not exist.
 *
 * ANY other argument narrows the filter — `new FilterCreatureCard(SubType.ELF,
 * "an Elf card")` — and taking the no-argument reading of it would produce a
 * filter that matches more than the card says, which is a card that destroys
 * the wrong permanent. Those are refused and reported by name.
 */
function readStaticFilters(source) {
  const out = {};
  const skipped = [];

  /*
   * THE STATIC BLOCK IS WHERE HALF THE MEANING LIVES, and ignoring it is the
   * second way this extraction can produce a filter that matches too much:
   *
   *     FILTER_CONTROLLED_UNTAPPED_CREATURES = new FilterControlledCreaturePermanent(…);
   *     static { FILTER_CONTROLLED_UNTAPPED_CREATURES.add(TappedPredicate.UNTAPPED); }
   *
   * Read from the declaration alone that constant is "creatures you control",
   * and a card built on it would let a player tap a creature that is already
   * tapped. So every `X.add(...)` anywhere in the file is collected against X,
   * and a constant with an `add` this script cannot resolve is REFUSED rather
   * than published without it.
   *
   * `setLockedFilter` is XMage protecting a shared constant from being mutated
   * by a card. It changes nothing about what the filter matches and there is
   * nothing here to protect, because this table is data and every use builds a
   * fresh filter.
   */
  const extras = new Map();
  const unresolved = new Map();
  for (const m of source.matchAll(/(FILTER_[A-Z0-9_]+)\s*\.\s*add\s*\(/g)) {
    const constant = m[1];
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++;
      else if (source[end] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const arg = tidy(source.slice(open + 1, end));
    const mapped = resolvePredicate(arg);
    if (mapped === null) {
      if (!unresolved.has(constant)) unresolved.set(constant, arg);
    } else {
      if (!extras.has(constant)) extras.set(constant, []);
      extras.get(constant).push(mapped);
    }
  }

  const re =
    /public\s+static\s+final\s+[A-Za-z0-9_<>, ]+\s+(FILTER_[A-Z0-9_]+)\s*=\s*new\s+([A-Za-z0-9_]+)\s*\(([^;]*)\)\s*;/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const [, constant, className, args] = m;
    const list = splitArgs(args.trim());
    const nameOnly = list.length === 0 || (list.length === 1 && /^".*"$/s.test(list[0]));
    if (!nameOnly) {
      skipped.push({ constant, className, why: `narrowed by ${list.length} argument(s)` });
      continue;
    }
    if (unresolved.has(constant)) {
      skipped.push({ constant, className, why: `static block: ${unresolved.get(constant)}` });
      continue;
    }
    out[constant] = { className, extras: extras.get(constant) ?? [] };
  }
  return { out, skipped };
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

function main() {
  if (!existsSync(FILTER_DIR)) {
    console.error(`No XMage filter directory at ${FILTER_DIR}. Set XMAGE_ROOT.`);
    process.exit(1);
  }
  const files = indexFilterFiles();
  const cache = new Map();

  const classes = {};
  const refusedClasses = [];
  for (const name of files.keys()) {
    if (!name.startsWith('Filter')) continue;
    if (Object.prototype.hasOwnProperty.call(BASES, name)) continue;
    const chain = resolveChain(name, files, cache);
    if (!chain.ok) {
      refusedClasses.push({ name, why: chain.why });
      continue;
    }
    if (chain.noArg === false) {
      refusedClasses.push({ name, why: 'no no-argument constructor' });
      continue;
    }
    classes[name] = {
      zone: chain.zone,
      predicates: chain.predicates,
      message: describe(chain.zone, chain.predicates),
    };
  }

  const staticSource = readFileSync(path.join(FILTER_DIR, 'StaticFilters.java'), 'utf8');
  const { out: constantToClass, skipped } = readStaticFilters(staticSource);
  const constants = {};
  const refusedConstants = [...skipped];
  for (const [constant, { className, extras }] of Object.entries(constantToClass)) {
    if (!classes[className]) {
      const chain = cache.get(className);
      refusedConstants.push({ constant, className, why: chain?.why ?? 'class not in the table' });
      continue;
    }
    const base = classes[className];
    const predicates = [...base.predicates, ...extras];
    constants[constant] = {
      className,
      zone: base.zone,
      predicates,
      message: describe(base.zone, predicates),
    };
  }

  const stats = {
    filterFiles: [...files.keys()].filter(n => n.startsWith('Filter')).length,
    classesRead: Object.keys(classes).length,
    classesRefused: refusedClasses.length,
    staticConstantsFound: Object.keys(constantToClass).length + skipped.length,
    staticConstantsRead: Object.keys(constants).length,
    staticConstantsRefused: refusedConstants.length,
  };

  mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  writeFileSync(
    OUT_JSON,
    JSON.stringify({ stats, classes, constants, refusedClasses, refusedConstants }, null, 1)
  );

  for (const [k, v] of Object.entries(stats)) {
    console.log(String(v).padStart(6) + '  ' + k);
  }
  console.log('\nrefused classes, by reason:');
  const why = new Map();
  for (const r of refusedClasses) why.set(r.why, (why.get(r.why) ?? 0) + 1);
  for (const [reason, n] of [...why].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log('  ' + String(n).padStart(4) + '  ' + reason);
  }
  console.log(`\nwrote ${OUT_JSON}`);
}

main();
