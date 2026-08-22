/**
 * scripts/xmage/extract-effects.mjs
 *
 * Re-extract card behaviour from XMage KEEPING THE CONSTRUCTOR ARGUMENTS.
 *
 * ## Why this script exists
 * The previous extraction was import-based. It recorded which classes a card
 * file mentions and threw the arguments away, so fifty different board wipes
 * collapsed into one meaningless `[DestroyAllEffect]` signature and the standing
 * conclusion was that the map could not say what to destroy. The arguments were
 * in the source the whole time:
 *
 *     WrathOfGod:  new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true)
 *     Damnation:   new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true)
 *     Armageddon:  new DestroyAllEffect(StaticFilters.FILTER_LANDS)
 *
 * Keep them and the map stops being a fingerprint and becomes a recipe.
 *
 * ## One record, four questions
 * The output is built to answer all four, not just the first:
 *   PLAY            effect class + resolved arguments + trigger + cost + layer
 *   DECK BUILDING   roles and families per card, counted
 *   RECOMMENDATION  every card that uses an effect class with the same argument
 *   OPTIMISATION    the arguments are comparable, so two cards using the same
 *                   effect can be ordered by what they pass to it
 *
 * ## How it parses
 * Not a regex. `lib/java-parse.mjs` tokenizes the file and a recursive-descent
 * parser builds a real expression tree, so nested generics, multi-line
 * constructors and nested `new` calls come out intact. The parser's failure rate
 * is MEASURED, not estimated: every constructor is unparsed back to a token
 * stream and compared with the original token for token. `--fidelity` prints
 * that comparison.
 *
 * ## Argument vocabulary
 * Resolved against the engine index built by `index-engine.mjs`, so
 * `StaticFilters.FILTER_LANDS` is recorded as a filter constant whose
 * initialiser is `new FilterLandPermanent(...)`, `Duration.EndOfTurn` as an enum
 * constant of `mage.constants.Duration`, and an integer literal as an integer.
 * Anything that does not resolve is written down as unresolved WITH A REASON and
 * counted. Nothing is guessed.
 *
 * String literals are XMage's display text. They are recorded as present but
 * their contents are omitted, because that text is Wizards of the Coast rules
 * text, not XMage's to license, and our rules text comes from Scryfall's
 * `oracle_text` instead. Mana-symbol strings such as "{2}{W}" are kept, since
 * they are cost data rather than prose.
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. It is read from a clone OUTSIDE this
 * repository and nothing from it is vendored here. Comments are dropped by the
 * tokenizer before any analysis, so no oracle text reaches any output file.
 * Forge is GPL-3.0 and is not read, fetched or referenced anywhere.
 *
 * ## Usage
 *   node scripts/xmage/index-engine.mjs      # build the vocabulary first
 *   node scripts/xmage/extract-effects.mjs   # extract, write data + docs
 *   node scripts/xmage/extract-effects.mjs --limit 500
 *   node scripts/xmage/extract-effects.mjs --fidelity
 */

import { readFileSync, writeFileSync, mkdirSync, createWriteStream, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  tokenize, JavaParser, findAllConstructors, readImports, readPackage, roundTrip,
} from './lib/java-parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'scripts/coverage/.data');
const DOCS = join(REPO, 'docs/engine');

const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const CARDS_DIR = join(XMAGE_ROOT, 'Mage.Sets/src/mage/cards');

/* ------------------------------------------------------------------ *
 * 0. Inputs
 * ------------------------------------------------------------------ */

function loadEngineIndex() {
  const p = join(DATA, 'xmage-engine-index.json');
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run: node scripts/xmage/index-engine.mjs`);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** oracle_id -> XMage class, from the existing join. Reused, not rebuilt. */
function loadJoin() {
  const p = join(DATA, 'join.json');
  if (!existsSync(p)) return { rows: [], meta: {} };
  return JSON.parse(readFileSync(p, 'utf8'));
}

function walkJava(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.java')) out.push(p);
    }
  }
  return out.sort();
}

/* ------------------------------------------------------------------ *
 * 1. The sink vocabulary: where a card puts the things it builds.
 *
 * Derived by counting every `this.X(` and `this.getX().Y(` in all 32,168 card
 * files, not from memory. Anything a card calls that is NOT on this list is
 * counted as `sink-not-recognised` so the gap stays visible.
 * ------------------------------------------------------------------ */

/** `this.getXHalfCard()` and friends: which face of a multi-face card. */
const FACE_METHODS = {
  getLeftHalfCard: 'left',
  getRightHalfCard: 'right',
  getTopHalfCard: 'top',
  getBottomHalfCard: 'bottom',
  getSpellCard: 'adventure-spell',
  getMainCard: 'main',
  getFrontFace: 'front',
  getBackFace: 'back',
  getLeftHalfObject: 'left',
  getRightHalfObject: 'right',
};

const ABILITY_SINKS = new Set([
  'addEffect', 'addTarget', 'addCost', 'addMode', 'addHint', 'addWatcher',
  'setTargetAdjuster', 'setCostAdjuster', 'addSubAbility', 'setTriggerPhrase',
  'withFirstModeCost', 'withFirstModeFlavorWord', 'setAbilityWord',
  'addChoice', 'setRuleAtTheTop', 'concatBy', 'setModeTag',
]);
/** Chrome: real calls that carry no rules meaning we need. Not a miss. */
const IGNORED_SINKS = new Set([
  'setText', 'setRuleAtTheTop', 'withFlavorWord', 'setAbilityWord',
  'addHint', 'setTriggerPhrase', 'withFirstModeFlavorWord', 'concatBy',
  'setLockedFilter', 'setUseOnlyTargetName', 'setModeTag',
]);

/* ------------------------------------------------------------------ *
 * 2. Symbol resolution inside a card file
 * ------------------------------------------------------------------ */

class Resolver {
  constructor(engine, imports, wildcard, pkg, localTypes) {
    this.engine = engine;
    this.imports = imports;
    this.wildcard = wildcard;
    this.pkg = pkg;
    this.localTypes = localTypes; // classes/enums declared in this card file
    this.cache = new Map();
  }

  /** Simple or qualified name -> { fqn, rec } | { local: true } | null */
  resolve(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const r = this.resolveUncached(name);
    this.cache.set(name, r);
    return r;
  }

  resolveUncached(name) {
    // Already fully qualified, as in `mage.filter.predicate.Predicates.or(...)`.
    if (this.engine.classes[name]) return { fqn: name, rec: this.engine.classes[name] };

    const head = name.split('.')[0];
    const tail = name.split('.').slice(1).join('.');

    if (this.localTypes.has(name)) return { local: true, cls: name, base: this.localTypes.get(name).base };
    if (this.localTypes.has(head)) return { local: true, cls: name, base: this.localTypes.get(head).base };

    const viaImport = this.imports.get(head);
    if (viaImport) {
      const fqn = tail ? `${viaImport}.${tail}` : viaImport;
      const rec = this.engine.classes[fqn] ?? this.engine.classes[viaImport];
      if (rec) return { fqn: this.engine.classes[fqn] ? fqn : viaImport, rec, nested: !this.engine.classes[fqn] ? tail : null };
      return { fqn, rec: null };
    }

    for (const w of this.wildcard) {
      const fqn = `${w}.${name}`;
      if (this.engine.classes[fqn]) return { fqn, rec: this.engine.classes[fqn] };
      const fqnHead = `${w}.${head}`;
      if (tail && this.engine.classes[fqnHead]) return { fqn: fqnHead, rec: this.engine.classes[fqnHead], nested: tail };
    }

    const cands = this.engine.bySimple[head];
    if (cands && cands.length === 1) {
      return { fqn: cands[0], rec: this.engine.classes[cands[0]], nested: tail || null, via: 'bySimple' };
    }
    return null;
  }

  /**
   * `import static mage.filter.StaticFilters.FILTER_LANDS;` then a bare
   * `FILTER_LANDS`. The import maps the FIELD name, so the holder is the import
   * with its last segment removed.
   */
  staticImport(name) {
    const full = this.imports.get(name);
    if (!full) return null;
    if (this.engine.classes[full]) return null;
    const holder = full.split('.').slice(0, -1).join('.');
    const rec = this.engine.classes[holder];
    if (!rec) return null;
    return { holderFqn: holder, holderRec: rec, field: name };
  }
}

/** Fields every `CardImpl` has. A bare `subtype.add(...)` means `this.subtype`. */
const CARD_FIELDS = new Set([
  'subtype', 'supertype', 'cardType', 'color', 'power', 'toughness',
  'nightCard', 'flipCard', 'flipCardName', 'frameColor', 'frameStyle',
  'usesVariousArt', 'secondSideCardName', 'meldsWithClazz', 'mor', 'morSet',
]);

/** A handful of `java.lang` constants that appear as arguments. */
const JAVA_CONSTANTS = {
  'Integer.MAX_VALUE': { t: 'int', v: 2147483647, resolved: true },
  'Integer.MIN_VALUE': { t: 'int', v: -2147483648, resolved: true },
  'Long.MAX_VALUE': { t: 'int', v: 9223372036854775807, resolved: true },
};

/* ------------------------------------------------------------------ *
 * 3. Value evaluation, the part that keeps the arguments
 * ------------------------------------------------------------------ */

const MANA_STRING = /^"(\{[^}]*\})*"$/;

function stripQuotes(v) {
  return v.startsWith('"') ? v.slice(1, -1) : v;
}

class Extractor {
  constructor(engine, resolver, stats) {
    this.engine = engine;
    this.R = resolver;
    this.stats = stats;
    this.env = new Map();
    this.objects = [];
    this.unresolved = [];
    // One AST node, one value. Without this a builder chain evaluates its
    // receiver twice, which would build the same effect twice and make the
    // construction audit below meaningless.
    this.memo = new Map();
  }

  note(reason, detail) {
    this.unresolved.push(detail ? { reason, detail } : { reason });
    this.stats.unresolvedReasons.set(reason, (this.stats.unresolvedReasons.get(reason) ?? 0) + 1);
    if (detail) {
      const k = `${reason}|${detail}`;
      this.stats.unresolvedDetail.set(k, (this.stats.unresolvedDetail.get(k) ?? 0) + 1);
    }
  }

  /** Evaluate an expression into a value descriptor. Never throws. */
  val(node) {
    if (node == null) return { t: 'missing', resolved: false };
    if (this.memo.has(node)) return this.memo.get(node);
    const v = this.val_(node);
    this.memo.set(node, v);
    return v;
  }

  val_(node) {
    switch (node.k) {
      case 'lit': return this.lit(node);
      case 'paren': return this.val(node.e);
      case 'cast': return this.val(node.arg);
      case 'name': return this.name(node);
      case 'field': return this.fieldAccess(node);
      case 'new': return this.construct(node);
      case 'newarray': return this.array(node.init ? node.init.items : []);
      case 'arrayinit': return this.array(node.items);
      case 'call': return this.call(node);
      case 'unary':
        if (node.op === '-' && node.arg.k === 'lit' && ['int', 'long'].includes(node.arg.type)) {
          return { t: 'int', v: -Number(node.arg.v.replace(/[lL_]/g, '')), resolved: true };
        }
        this.note('expression-unary');
        return { t: 'unresolved', reason: 'expression-unary', resolved: false };
      case 'bin':
        this.note('expression-arithmetic');
        return { t: 'unresolved', reason: 'expression-arithmetic', resolved: false };
      case 'ternary':
        this.note('expression-ternary');
        return { t: 'unresolved', reason: 'expression-ternary', resolved: false };
      case 'lambda':
        this.note('lambda');
        return { t: 'unresolved', reason: 'lambda', resolved: false };
      case 'mref':
        this.note('method-reference');
        return { t: 'unresolved', reason: 'method-reference', resolved: false };
      case 'this': return { t: 'self', resolved: true };
      default:
        this.note('expression-' + node.k);
        return { t: 'unresolved', reason: 'expression-' + node.k, resolved: false };
    }
  }

  lit(node) {
    switch (node.type) {
      case 'int': case 'long':
        return { t: 'int', v: Number(node.v.replace(/[lL_]/g, '')), resolved: true };
      case 'double':
        return { t: 'double', v: Number(node.v.replace(/[fFdD_]/g, '')), resolved: true };
      case 'bool': return { t: 'bool', v: node.v === 'true', resolved: true };
      case 'null': return { t: 'null', resolved: true };
      case 'char': return { t: 'char', v: node.v, resolved: true };
      case 'str': {
        this.stats.stringArgs++;
        if (MANA_STRING.test(node.v) && node.v.length > 2) {
          return { t: 'mana', v: stripQuotes(node.v), resolved: true };
        }
        const inner = stripQuotes(node.v);
        if (inner.length <= 24 && !/\s/.test(inner)) {
          return { t: 'string', v: inner, resolved: true };
        }
        this.stats.textArgsOmitted++;
        // Display text. Present, deliberately not copied. See the header.
        return { t: 'text', omitted: true, len: inner.length, resolved: true };
      }
      default: return { t: 'unresolved', reason: 'literal-' + node.type, resolved: false };
    }
  }

  name(node) {
    const bound = this.env.get(node.id);
    if (bound) return bound;
    if (CARD_FIELDS.has(node.id)) return { t: 'selfField', field: node.id, resolved: true };
    const si = this.R.staticImport(node.id);
    if (si) {
      const v = this.constFrom(si.holderFqn, si.holderRec, si.field);
      if (v) return v;
    }
    const r = this.R.resolve(node.id);
    if (r?.local) {
      this.note('card-local-class', r.cls);
      return { t: 'bespoke', cls: r.cls, base: r.base ?? null, resolved: false };
    }
    if (r?.rec) return { t: 'classref', cls: r.rec.simple, fqn: r.fqn, role: r.rec.role, resolved: true };
    this.note('unknown-identifier', node.id);
    return { t: 'unresolved', reason: 'unknown-identifier', id: node.id, resolved: false };
  }

  /** A constant on an engine type: an enum member or a `static final` field. */
  constFrom(fqn, rec, field) {
    const consts = this.engine.enums[fqn];
    if (consts && consts.includes(field)) {
      this.stats.enumArgs++;
      return { t: 'enum', enum: rec.simple, fqn, v: field, resolved: true };
    }
    const holderFields = this.engine.staticFields[fqn];
    if (holderFields && holderFields[field]) {
      const f = holderFields[field];
      this.stats.constArgs++;
      return {
        t: 'const', cls: rec.simple, fqn, field,
        of: f.type ?? null, init: f.init ?? null, resolved: true,
      };
    }
    return null;
  }

  fieldAccess(node) {
    // A dotted constant such as StaticFilters.FILTER_LANDS or Duration.EndOfTurn.
    const path = flattenDots(node);
    if (path) {
      const holder = path.slice(0, -1).join('.');
      const field = path[path.length - 1];

      // `EquipAbility.class` is a class literal, not a static field.
      if (field === 'class') {
        const rc = this.R.resolve(holder);
        if (rc?.rec) return { t: 'classLiteral', cls: rc.rec.simple, fqn: rc.fqn, resolved: true };
        if (rc?.local) return { t: 'classLiteral', cls: holder, local: true, resolved: false };
      }
      const r = this.R.resolve(holder);

      if (r?.local) {
        this.note('card-local-class', holder);
        return { t: 'bespoke', cls: holder, base: r.base ?? null, field, resolved: false };
      }
      if (r?.rec) {
        const v = this.constFrom(r.fqn, r.rec, field);
        if (v) return v;
        // A field on a known engine class that the index has no record of. Real
        // and resolvable in principle, but not resolved HERE, so say so.
        this.note('unknown-static-field', `${r.rec.simple}.${field}`);
        return { t: 'unresolved', reason: 'unknown-static-field', cls: r.rec.simple, field, resolved: false };
      }
      if (JAVA_CONSTANTS[path.join('.')]) return JAVA_CONSTANTS[path.join('.')];
      // `this.something`
      if (path[0] === 'this') return { t: 'selfField', field: path.slice(1).join('.'), resolved: true };
      if (CARD_FIELDS.has(path[0])) return { t: 'selfField', field: path.join('.'), resolved: true };

      this.note('unknown-holder', holder);
      return { t: 'unresolved', reason: 'unknown-holder', holder, field, resolved: false };
    }
    const base = this.val(node.obj);
    if (base.t === 'obj') return { t: 'objField', obj: base.obj, field: node.name, resolved: false };
    this.note('field-of-expression');
    return { t: 'unresolved', reason: 'field-of-expression', resolved: false };
  }

  array(items) {
    const vals = items.map((i) => this.val(i));
    return { t: 'array', items: vals, resolved: vals.every((v) => v.resolved) };
  }

  construct(node) {
    this.stats.constructionsVisited++;
    this.constructionsVisited = (this.constructionsVisited ?? 0) + 1;
    const simple = node.type.name;
    const r = this.R.resolve(simple);

    const args = node.args.map((a) => this.val(a));

    if (r?.local) {
      // A class written by hand inside the card file. The class itself has to be
      // ported by hand, but its ARGUMENTS are ordinary vocabulary and are worth
      // exactly as much here as anywhere else, so they are kept.
      this.note('card-local-class', simple);
      // What KIND of hand-written thing it is, taken from what it extends.
      // `FishingPoleEffect extends OneShotEffect` is a one-shot effect that
      // happens to need writing by hand; saying so is more useful than
      // "card-local", and it is XMage's own word for it, not a guess.
      let localRole = 'card-local';
      if (r.base) {
        const cands = this.engine.bySimple[r.base];
        if (cands && cands.length === 1) localRole = this.engine.classes[cands[0]]?.role ?? 'card-local';
      }
      const obj = {
        cls: simple, fqn: null, role: localRole, bespoke: true,
        base: r.base ?? null, keyword: false, anon: !!node.body,
        args, named: null, paramMatch: 'card-local',
        layer: null, sublayer: null,
        effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
      };
      this.hoist(obj);
      this.objects.push(obj);
      return { t: 'obj', obj, resolved: false };
    }

    const rec = r?.rec ?? null;

    if (!rec) {
      this.note('unknown-class', simple);
      return { t: 'unresolved', reason: 'unknown-class', cls: simple, args, resolved: false };
    }

    const obj = {
      cls: rec.simple,
      fqn: r.fqn,
      role: rec.role,
      keyword: r.fqn.startsWith('mage.abilities.keyword.'),
      anon: !!node.body,
      args,
      named: null,
      paramMatch: 'none',
      layer: rec.layer ?? null,
      sublayer: rec.sublayer ?? null,
      effects: [],
      targets: [],
      costs: [],
      modes: [],
      watchers: [],
      mods: [],
    };

    if (node.body) {
      // `new SomeEffect(...) { ... }` is hand-written Java, not composition.
      this.note('anonymous-subclass', rec.simple);
      obj.resolvedArgs = false;
    }

    this.bindNames(obj, rec);
    this.hoist(obj);
    this.objects.push(obj);
    return { t: 'obj', obj, resolved: !node.body && args.every((a) => a.resolved) };
  }

  /** Pick the constructor overload and attach parameter names to the arguments. */
  bindNames(obj, rec) {
    const arity = obj.args.length;
    // XMage gives every effect a copy constructor, `Foo(final Foo effect)`. No
    // card ever calls it, and leaving it in the candidate set turns almost every
    // one-argument effect into a false tie.
    const usable = (rec.ctors ?? []).filter(
      (c) => !(c.params.length === 1 && c.params[0].type === rec.simple),
    );
    const cands = usable.filter((c) => {
      if (c.params.length === arity) return true;
      const last = c.params[c.params.length - 1];
      return last?.array && arity >= c.params.length - 1;
    });
    if (cands.length === 0) {
      obj.paramMatch = arity === 0 ? 'nullary' : 'no-ctor';
      if (arity > 0) this.stats.noCtorMatch++;
      return;
    }
    let chosen = cands[0];
    if (cands.length > 1) {
      let best = -1;
      let tie = false;
      for (const c of cands) {
        const s = this.scoreOverload(c, obj.args);
        if (s > best) { best = s; chosen = c; tie = false; }
        else if (s === best) tie = true;
      }
      obj.paramMatch = tie ? 'ambiguous-arity' : 'by-type';
      if (tie) this.stats.ambiguousOverload++;
    } else {
      obj.paramMatch = 'unique';
    }
    obj.named = obj.args.map((a, i) => {
      const p = chosen.params[Math.min(i, chosen.params.length - 1)];
      return p ? p.name : `arg${i}`;
    });
    obj.paramTypes = obj.args.map((a, i) => {
      const p = chosen.params[Math.min(i, chosen.params.length - 1)];
      return p ? p.type : null;
    });
    if (chosen.duration && !obj.duration) obj.duration = chosen.duration;
    if (chosen.layer) { obj.layer = chosen.layer; obj.sublayer = chosen.sublayer ?? null; }
  }

  /** Is a value of simple type `from` acceptable where `to` is wanted? */
  assignableTo(from, to) {
    if (from === to) return true;
    const cands = this.engine.bySimple[from];
    if (!cands || cands.length !== 1) return false;
    const rec = this.engine.classes[cands[0]];
    if (!rec) return false;
    return (rec.chain ?? []).some((c) => c.split('.').pop() === to);
  }

  scoreOverload(ctor, args) {
    let score = 0;
    for (let i = 0; i < args.length; i++) {
      const p = ctor.params[Math.min(i, ctor.params.length - 1)];
      if (!p) continue;
      const a = args[i];
      const ty = p.type;
      if (a.t === 'int' && ['int', 'Integer', 'long'].includes(ty)) score += 2;
      else if (a.t === 'bool' && ['boolean', 'Boolean'].includes(ty)) score += 2;
      else if ((a.t === 'text' || a.t === 'string' || a.t === 'mana') && ty === 'String') score += 2;
      else if (a.t === 'enum' && a.enum === ty) score += 3;
      else if (a.t === 'const' && a.of === ty) score += 3;
      else if (a.t === 'const' && a.of && this.assignableTo(a.of, ty)) score += 2;
      else if (a.t === 'obj') {
        if (a.obj.cls === ty) score += 3;
        else if (this.engine.classes[a.obj.fqn]?.chain?.some((c) => c.split('.').pop() === ty)) score += 2;
      } else if (a.t === 'array' && p.array) score += 1;
    }
    return score;
  }

  /** Sort an object's constructed arguments into effects / targets / costs. */
  hoist(obj) {
    obj.args.forEach((a, i) => {
      if (a.t !== 'obj') return;
      const role = a.obj.role;
      if (role && role.endsWith('-effect')) obj.effects.push(a.obj);
      else if (role === 'target') obj.targets.push(a.obj);
      else if (role === 'cost' || role === 'mana-cost') obj.costs.push(a.obj);
      else if (role === 'watcher') obj.watchers.push(a.obj);
      else if (role === 'mode') obj.modes.push(a.obj);
    });
    obj.args.forEach((a) => {
      if (a.t !== 'array') return;
      for (const it of a.items) {
        if (it.t === 'obj' && it.obj.role?.endsWith('-effect')) obj.effects.push(it.obj);
      }
    });
  }

  call(node) {
    // `X.getInstance()`, which is how XMage writes its keyword singletons.
    if (node.obj && node.name === 'getInstance' && node.args.length === 0) {
      const path = flattenDots(node.obj);
      if (path) {
        const r = this.R.resolve(path.join('.'));
        if (r?.rec) {
          return {
            t: 'obj', resolved: true,
            obj: {
              cls: r.rec.simple, fqn: r.fqn, role: r.rec.role,
              keyword: r.fqn.startsWith('mage.abilities.keyword.'),
              singleton: true, args: [], named: [], paramMatch: 'singleton',
              layer: r.rec.layer ?? null, sublayer: r.rec.sublayer ?? null,
              effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
            },
          };
        }
        if (r?.local) {
          this.note('card-local-class', path.join('.'));
          return { t: 'bespoke', cls: path.join('.'), base: r.base ?? null, resolved: false };
        }
      }
    }

    // `this.getLeftHalfCard()` used as an argument rather than a receiver, as
    // Sagas do: `new SagaAbility(this.getLeftHalfCard())`.
    if (FACE_METHODS[node.name] && node.args.length === 0) {
      const inner = node.obj;
      if (!inner || inner.k === 'this') {
        return { t: 'cardRef', face: FACE_METHODS[node.name], resolved: true };
      }
    }
    if (node.name === 'getSpellAbility' && node.args.length === 0) {
      const inner = node.obj;
      if (!inner || inner.k === 'this') return { t: 'spellRef', face: 'main', resolved: true };
      if (inner.k === 'call' && FACE_METHODS[inner.name]) {
        return { t: 'spellRef', face: FACE_METHODS[inner.name], resolved: true };
      }
    }

    // Builder chain on something we already have: `new X(..).setText(..)`.
    if (node.obj) {
      const base = this.val(node.obj);
      if (base.t === 'obj') {
        const argVals = node.args.map((a) => this.val(a));
        this.applyMod(base.obj, node.name, argVals);
        return base;
      }
      if (base.t === 'bespoke') return base;

      // `Arrays.asList(a, b)`, `List.of(...)` and `Set.of(...)` are a list literal
      // written the Java way. It is an array of resolved things, not a mystery.
      const holderPath = flattenDots(node.obj);
      if (holderPath && holderPath.length === 1
        && ['Arrays', 'List', 'Set', 'Collections', 'ImmutableList', 'EnumSet'].includes(holderPath[0])
        && ['asList', 'of', 'singletonList', 'singleton', 'emptyList'].includes(node.name)) {
        return this.array(node.args);
      }

      // A static factory such as `ProtectionAbility.from(ObjectColor.WHITE)`,
      // `DevourAbility.devourX()` or `CounterType.P1P1.createInstance(2)`.
      // These build the same kinds of thing `new` does, so they are recorded as
      // objects rather than as a separate shape nothing downstream reads.
      const path = flattenDots(node.obj);
      if (path) {
        const r = this.R.resolve(path.join('.'));
        if (r?.rec) {
          const argVals = node.args.map((a) => this.val(a));
          this.stats.factoryCalls++;
          const obj = {
            cls: r.rec.simple, fqn: r.fqn, role: r.rec.role,
            keyword: r.fqn.startsWith('mage.abilities.keyword.'),
            factory: { method: node.name, on: r.nested ?? null },
            args: argVals, named: null, paramMatch: 'factory',
            layer: r.rec.layer ?? null, sublayer: r.rec.sublayer ?? null,
            effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
          };
          this.hoist(obj);
          this.objects.push(obj);
          return { t: 'obj', obj, resolved: argVals.every((a) => a.resolved) };
        }
      }
      // The receiver did not resolve, but the arguments still have to be
      // evaluated. Returning here without doing so would silently drop every
      // `new` inside them, and the construction audit would never see it.
      const dropped = node.args.map((a) => this.val(a));
      this.note('call-on-unresolved', node.name);
      return {
        t: 'unresolved', reason: 'call-on-unresolved', method: node.name,
        args: dropped, resolved: false,
      };
    }

    const bareArgs = node.args.map((a) => this.val(a));
    this.note('bare-method-call', node.name);
    return {
      t: 'unresolved', reason: 'bare-method-call', method: node.name,
      args: bareArgs, resolved: false,
    };
  }

  /** A method called on an already-built object: `ability.addTarget(...)`. */
  applyMod(obj, method, argVals) {
    if (method === 'addEffect') { pushObjs(obj.effects, argVals); return; }
    if (method === 'addTarget' || method === 'setTargetPointer') { pushObjs(obj.targets, argVals); return; }
    if (method === 'addCost' || method === 'withFirstModeCost') { pushObjs(obj.costs, argVals); return; }
    if (method === 'addMode') { pushObjs(obj.modes, argVals); return; }
    if (method === 'addWatcher') { pushObjs(obj.watchers, argVals); return; }
    if (method === 'addSubAbility') { pushObjs(obj.subAbilities ??= [], argVals); return; }
    if (IGNORED_SINKS.has(method)) return;
    obj.mods.push({ m: method, args: argVals.filter((a) => a.t !== 'text') });
  }
}

function pushObjs(list, argVals) {
  for (const a of argVals) {
    if (a.t === 'obj') {
      list.push(a.obj);
    } else if (a.t === 'array') {
      for (const it of a.items) {
        if (it.t === 'obj') list.push(it.obj);
        else list.push({ cls: null, unresolved: it });
      }
    } else {
      // An effect we could not resolve is still an effect the card has. It is
      // recorded as unresolved rather than dropped, because dropping it would
      // quietly inflate every ratio computed downstream.
      list.push({ cls: null, unresolved: a });
    }
  }
}

/**
 * Every `new X(...)` in the constructor, and how many of them sit inside a
 * region the walker deliberately treats as opaque. Comparing this with the
 * number the walker actually VISITED is the extraction's own failure rate,
 * measured per card rather than assumed.
 *
 * ## This used to be unable to see its own blind spot
 *
 * A block-bodied lambda, `ability -> { ... }`, is stored by the parser as RAW
 * TOKENS, so the tree has no `new` nodes inside it. The old walk returned at
 * `k === 'lambda'` without looking at those tokens, so constructions in there
 * were counted neither in `total` nor in `opaque`, and the audit reported
 * `newInsideOpaque: 2` while 166 constructions across 38 cards were invisible
 * to it. "0 cards with a missed construction" was then true of a denominator
 * that excluded the misses, which is the same shape as the two coverage
 * overstatements this project has already made.
 *
 * So raw regions are now SCANNED FOR TOKENS. `new` followed by an identifier is
 * counted into `total` and into `opaque`, and the audit's own arithmetic —
 * `visited < total - opaque` — is unchanged. `opaque` becomes a real number
 * instead of a rounding error, and `docs/engine/XMAGE-EXTRACTION.md` prints it,
 * so the Saga chapters written as lambdas stop being silently absent.
 */
function countRawNews(toks) {
  if (!Array.isArray(toks)) return 0;
  let n = 0;
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i]?.t === 'id' && toks[i].v === 'new' && /^[A-Z]/.test(toks[i + 1]?.v ?? '')) n++;
  }
  return n;
}

function countNewNodes(stmts) {
  let total = 0;
  let opaque = 0;
  const raw = (toks) => { const n = countRawNews(toks); total += n; opaque += n; };
  const walk = (n, inOpaque) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x, inOpaque); return; }
    if (n.k === 'new') {
      total++;
      if (inOpaque) opaque++;
      // An anonymous class body is kept as raw tokens. Count what is in there
      // rather than pretending the region is empty.
      if (n.body) raw(n.body);
      for (const a of n.args) walk(a, inOpaque || !!n.body);
      return;
    }
    if (n.k === 'lambda') {
      if (n.bodyKind === 'expr') walk(n.body, true);
      else raw(n.raw);
      return;
    }
    if (n.k === 'opaque' || n.k === 'opaqueStmt') { raw(n.raw); return; }
    for (const key of Object.keys(n)) {
      if (key === 'head' || key === 'type') continue;
      if (key === 'raw') { raw(n[key]); continue; }
      walk(n[key], inOpaque);
    }
  };
  walk(stmts, false);
  return { total, opaque };
}

/** `a.b.c` as ['a','b','c'], or null if the base is not a plain name. */
function flattenDots(node) {
  const parts = [];
  let cur = node;
  while (cur && cur.k === 'field') { parts.unshift(cur.name); cur = cur.obj; }
  if (cur && cur.k === 'name') { parts.unshift(cur.id); return parts; }
  if (cur && cur.k === 'this') { parts.unshift('this'); return parts; }
  return null;
}

/* ------------------------------------------------------------------ *
 * 4. Walking one card's constructor
 * ------------------------------------------------------------------ */

/**
 * Field declarations in the card class body, outside any method.
 *
 * These matter more than they look. XMage hoists a card's filter into a static
 * field and then names it in the constructor:
 *
 *     private static final FilterCreaturePermanent filter =
 *             new FilterCreaturePermanent("Zombies you control");
 *     ...
 *     new BoostControlledEffect(1, 1, Duration.WhileOnBattlefield, filter)
 *
 * Without reading the field, the filter argument reads as an unknown
 * identifier, which is exactly the "the map cannot say what to destroy"
 * failure this extraction exists to remove.
 */
function readCardFields(toks, clsName) {
  // Body range of the card class.
  let start = -1;
  for (let i = 0; i < toks.length - 2; i++) {
    if (toks[i].t === 'id' && toks[i].v === 'class' && toks[i + 1].v === clsName) {
      let j = i + 2;
      while (j < toks.length && toks[j].v !== '{') j++;
      start = j;
      break;
    }
  }
  if (start < 0) return [];
  let depth = 0, end = start;
  for (let j = start; j < toks.length; j++) {
    if (toks[j].v === '{') depth++;
    else if (toks[j].v === '}') { depth--; if (depth === 0) { end = j; break; } }
  }

  const out = [];
  const initBlocks = [];
  let d = 0;
  for (let i = start; i < end; i++) {
    const t = toks[i];
    if (t.v === '{') { d++; continue; }
    if (t.v === '}') { d--; continue; }
    if (d !== 1) continue;

    // `static { filter.add(SubType.ZOMBIE.getPredicate()); }`
    //
    // 7,806 of the 32,168 card files build their filter this way, so skipping
    // these blocks would record "a creature filter" where the card actually
    // says "a Zombie you control". The filter IS the recipe, so the block is
    // parsed and replayed against the field it mutates.
    if (t.t === 'id' && t.v === 'static' && toks[i + 1]?.v === '{') {
      let bd = 0, close = i + 1;
      for (let j = i + 1; j < end; j++) {
        if (toks[j].v === '{') bd++;
        else if (toks[j].v === '}') { bd--; if (bd === 0) { close = j; break; } }
      }
      const p2 = new JavaParser(toks.slice(i + 2, close).concat([{ t: 'eof', v: '', p: 0, line: 0 }]));
      try { initBlocks.push(p2.parseBlockStatements(false)); } catch { /* counted by the audit */ }
      d++; // the `{` that follows is consumed by the scan above
      i = close;
      d--;
      continue;
    }

    if (!(t.t === 'id' && ['private', 'public', 'protected', 'static', 'final'].includes(t.v))) continue;
    if (i > start && toks[i - 1].t === 'id'
      && ['private', 'public', 'protected', 'static', 'final'].includes(toks[i - 1].v)) continue;

    let j = i;
    while (j < end && toks[j].t === 'id'
      && ['private', 'public', 'protected', 'static', 'final', 'transient', 'volatile'].includes(toks[j].v)) j++;
    if (toks[j]?.t === 'id' && ['class', 'enum', 'interface', 'record'].includes(toks[j].v)) continue;

    // Type ... name =
    let k = j, gd = 0, nameIdx = -1;
    for (; k < end; k++) {
      const v = toks[k].v;
      if (v === '<') gd++;
      else if (v === '>') gd--;
      else if (gd === 0 && v === '(') { nameIdx = -1; break; }
      else if (gd === 0 && v === ';') { nameIdx = -1; break; }
      else if (gd === 0 && toks[k].t === 'id' && toks[k + 1]?.v === '=') { nameIdx = k; break; }
    }
    if (nameIdx < 0) continue;

    const p = new JavaParser(toks.slice(nameIdx + 2, end + 1).concat([{ t: 'eof', v: '', p: 0, line: 0 }]));
    let expr = null;
    try { expr = p.parseExpression(); } catch { expr = null; }
    if (expr) out.push({ name: toks[nameIdx].v, expr });
    i = nameIdx;
  }
  return { fields: out, initBlocks };
}

/** Calls that hand back a sub-object of an ability rather than a new thing. */
const PASSTHROUGH_METHODS = new Set(['getModes', 'getEffects', 'getAllEffects', 'getTargets', 'getCosts']);

/**
 * Builder methods that return the ability itself, so a chain such as
 * `getSpellAbility().setAbilityWord(X).addHint(Y)` still lands on the ability.
 * Without this the outer call reads as a call on something unknown.
 */
const BUILDER_RETURNS_SELF = new Set([
  'setAbilityWord', 'withFlavorWord', 'setText', 'addHint', 'concatBy',
  'setTriggerPhrase', 'setRuleAtTheTop', 'withFirstModeFlavorWord',
  'setModeTag', 'setUseOnlyTargetName', 'withFirstModeCost', 'setIdentifier',
]);

/** Strip builder and pass-through calls to find the real receiver. */
function unwrapReceiver(node) {
  const labels = [];
  let cur = node;
  let guard = 0;
  while (cur && cur.k === 'call' && guard++ < 20
    && (BUILDER_RETURNS_SELF.has(cur.name) || PASSTHROUGH_METHODS.has(cur.name))) {
    if (PASSTHROUGH_METHODS.has(cur.name)) labels.unshift(cur.name);
    cur = cur.obj;
  }
  return { node: cur, prefix: labels.join('.') };
}

function faceOf(node, ex) {
  // this / implicit
  if (!node || node.k === 'this') return { kind: 'card', face: 'main' };
  if (node.k === 'call' && FACE_METHODS[node.name]) {
    const parent = faceOf(node.obj, ex);
    if (parent && parent.kind === 'card') return { kind: 'card', face: FACE_METHODS[node.name] };
    return null;
  }
  if (node.k === 'call' && node.name === 'getSpellAbility') {
    const parent = faceOf(node.obj, ex);
    if (parent && parent.kind === 'card') return { kind: 'spell', face: parent.face };
    return null;
  }
  return null;
}

function extractCard(path, engine, opts) {
  const src = readFileSync(path, 'utf8');
  const toks = tokenize(src);
  const pkg = readPackage(toks);
  const { single, wildcard } = readImports(toks);

  const relPath = relative(XMAGE_ROOT, path).replace(/\\/g, '/');
  const clsName = relPath.split('/').pop().replace(/\.java$/, '');

  // Types declared inside this card file are hand-written Java, not vocabulary.
  // Their SUPERCLASS is still worth keeping: `AcidicSoilEffect extends
  // OneShotEffect` says what kind of thing has to be written by hand.
  const localTypes = new Map();
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].t === 'id' && ['class', 'enum', 'interface', 'record'].includes(toks[i].v)
      && toks[i + 1].t === 'id' && toks[i - 1]?.v !== '.') {
      let base = null;
      for (let j = i + 2; j < toks.length && toks[j].v !== '{' && toks[j].v !== ';'; j++) {
        if (toks[j].t === 'id' && (toks[j].v === 'extends' || toks[j].v === 'implements') && toks[j + 1]?.t === 'id') {
          base = toks[j + 1].v;
          break;
        }
      }
      localTypes.set(toks[i + 1].v, { kind: toks[i].v, base });
    }
  }
  localTypes.delete(clsName);

  const out = {
    cls: clsName,
    path: relPath,
    base: null,
    superArgs: [],
    abilities: [],
    unresolved: [],
    flags: [],
  };

  const selfDecl = /public\s+(?:final\s+)?class\s+(\w+)\s+extends\s+([\w.]+)/.exec(src);
  out.base = selfDecl ? selfDecl[2] : null;

  const ctors = findAllConstructors(toks, clsName);
  const ctor = ctors.find((c) => c.params.some((t) => t.v === 'CardSetInfo')) ?? null;
  if (!ctor) {
    out.reason = 'no-constructor';
    return { rec: out, fidelity: null };
  }

  const body = toks.slice(ctor.open + 1, ctor.close);
  // Words that mean the card puts BEHAVIOUR somewhere. `addSubType` is a
  // printed characteristic, so it is deliberately not on this list: counting it
  // would report vanilla creatures as extraction misses.
  const BEHAVIOUR_WORDS = new Set(['addAbility', 'addAbilities', 'addEffect', 'addTarget', 'addMode']);
  const sinkWordsPresent = body.some((t) => t.t === 'id' && BEHAVIOUR_WORDS.has(t.v));

  let stmts;
  let parser;
  try {
    parser = new JavaParser(body.concat([{ t: 'eof', v: '', p: 0, line: 0 }]));
    stmts = parser.parseBlockStatements(false);
  } catch (e) {
    out.reason = 'parse-error';
    out.error = String(e.message);
    return { rec: out, fidelity: { ok: false, threw: true } };
  }

  const fidelity = opts.fidelity
    ? roundTrip(parser.toks.slice(0, parser.toks.length - 1), stmts)
    : null;

  const resolver = new Resolver(engine, single, wildcard, pkg, localTypes);
  const ex = new Extractor(engine, resolver, opts.stats);

  // The constructor's own parameters (ownerId, setInfo, ...) are known things,
  // not unresolved symbols. Bind them so they are never reported as misses.
  for (let i = 1; i < ctor.params.length; i++) {
    const t = ctor.params[i];
    const nextT = ctor.params[i + 1];
    if (t.t === 'id' && (!nextT || nextT.v === ',' || nextT.v === ')')) {
      ex.env.set(t.v, { t: 'ctorParam', name: t.v, resolved: true });
    }
  }

  // Class-body fields, evaluated in declaration order so later ones can name
  // earlier ones.
  const { fields: cardFields, initBlocks } = readCardFields(toks, clsName);
  for (const f of cardFields) ex.env.set(f.name, ex.val(f.expr));
  if (cardFields.length) out.flags.push('class-fields');

  const spellAbilities = new Map(); // face -> synthetic spell ability object

  const spellFor = (face) => {
    if (!spellAbilities.has(face)) {
      spellAbilities.set(face, {
        cls: 'SpellAbility', fqn: 'mage.abilities.SpellAbility', role: 'spell-ability',
        keyword: false, args: [], named: [], paramMatch: 'synthetic',
        layer: null, sublayer: null,
        effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
        face,
      });
    }
    return spellAbilities.get(face);
  };

  const emit = (obj, face, source) => {
    obj.face = face;
    obj.source = source;
    out.abilities.push(obj);
  };

  const runStatements = (list) => {
    for (const s of list) walkStatement(s);
  };

  function walkStatement(s) {
    switch (s.k) {
      case 'decl':
        for (const v of s.vars) {
          if (!v.init) { ex.env.set(v.name, { t: 'unset', resolved: false }); continue; }
          const val = ex.val(v.init);
          ex.env.set(v.name, val);
        }
        return;
      case 'expr': walkExpr(s.e); return;
      case 'block': runStatements(s.stmts); return;
      case 'control':
        out.flags.includes('control-flow') || out.flags.push('control-flow');
        if (s.body) walkStatement(s.body);
        if (s.elseBody) walkStatement(s.elseBody);
        return;
      case 'try':
        if (s.body) walkStatement(s.body);
        for (const c of s.tail) if (c.body) walkStatement(c.body);
        return;
      case 'return': case 'throw': case 'yield':
        if (s.e) ex.val(s.e);
        return;
      default:
        return;
    }
  }

  function walkExpr(e) {
    if (!e) return;

    if (e.k === 'ctorcall' && e.which === 'super') {
      out.superArgs = e.args.map((a) => ex.val(a));
      return;
    }

    if (e.k === 'assign') {
      // `this.power = new MageInt(2)` and friends.
      const lhs = flattenDots(e.l);
      const val = ex.val(e.r);
      if (lhs && lhs[0] === 'this') {
        out.fields ??= {};
        out.fields[lhs.slice(1).join('.')] = compactValue(val, 0);
        return;
      }
      if (e.l.k === 'name') { ex.env.set(e.l.id, val); return; }
      return;
    }

    if (e.k !== 'call') { ex.val(e); return; }

    const method = e.name;

    // `this.subtype.add(SubType.HUMAN)`, `this.color.setWhite(true)` and the
    // rest of the card-shape fields. These are printed characteristics, which
    // Scryfall already owns, so they are recorded as shape rather than dropped.
    const fieldPath = e.obj ? flattenDots(e.obj) : null;
    if (fieldPath && ((fieldPath[0] === 'this' && fieldPath.length >= 2)
      || (fieldPath.length === 1 && CARD_FIELDS.has(fieldPath[0])))) {
      if (fieldPath[0] !== 'this') fieldPath.unshift('this');
      const argVals = e.args.map((a) => ex.val(a));
      out.shape ??= [];
      out.shape.push({ m: `${fieldPath.slice(1).join('.')}.${method}`, args: argVals.map(compactValue) });
      return;
    }

    // `this.getSpellAbility().getModes().setMinModes(1)` and
    // `getSpellAbility().setAbilityWord(X).addHint(Y)`: unwrap to the receiver
    // that actually holds the rules meaning, and keep the label.
    const unwrapped = unwrapReceiver(e.obj);
    const receiverNode = unwrapped.node;
    const methodLabel = unwrapped.prefix ? `${unwrapped.prefix}.${method}` : method;

    const recv = faceOf(receiverNode, ex);

    // Card-level sink.
    if (recv && recv.kind === 'card') {
      const argVals = e.args.map((a) => ex.val(a));
      if (method === 'addAbility' || method === 'addAbilities') {
        for (const a of argVals) {
          if (a.t === 'obj') emit(a.obj, recv.face, 'addAbility');
          else if (a.t === 'array') { for (const it of a.items) if (it.t === 'obj') emit(it.obj, recv.face, 'addAbility'); }
          else if (a.t === 'bespoke' || (a.t === 'unresolved' && a.reason === 'bare-method-call')) {
            // `this.addAbility(createAbility())` calls a private helper in the card
            // file. Hand-written Java, recorded as such rather than lost.
            out.abilities.push({
              cls: a.cls ?? a.method, fqn: null, role: 'card-local', bespoke: true,
              base: a.base ?? null, face: recv.face, source: 'addAbility',
              args: [], effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
            });
          } else {
            opts.stats.unrecognisedAbilityArg++;
          }
        }
        return;
      }
      if (method === 'addWatcher') { return; }
      if (FACE_METHODS[method] || method === 'getSpellAbility') return;
      if (IGNORED_SINKS.has(method)) return;
      // Card shape, not behaviour: setPT, setStartingLoyalty, subtype.add, ...
      if (/^set|^finalize|^add(SubType|SuperType|CardType)/.test(method)) {
        out.shape ??= [];
        out.shape.push({ m: method, args: argVals.map(compactValue) });
        return;
      }
      opts.stats.sinkNotRecognised.set(method, (opts.stats.sinkNotRecognised.get(method) ?? 0) + 1);
      return;
    }

    // Spell-ability sink.
    if (recv && recv.kind === 'spell') {
      const sp = spellFor(recv.face);
      const argVals = e.args.map((a) => ex.val(a));
      if (methodLabel === method && ABILITY_SINKS.has(method)) { ex.applyMod(sp, method, argVals); return; }
      if (IGNORED_SINKS.has(method)) return;
      sp.mods.push({ m: methodLabel, args: argVals.filter((a) => a.t !== 'text') });
      return;
    }

    // Local variable sink: `ability.addTarget(...)`, including through a
    // pass-through such as `ability.getModes().setMaxModes(3)`.
    if (receiverNode && receiverNode.k === 'name') {
      const bound = ex.env.get(receiverNode.id);
      if (bound && bound.t === 'obj') {
        const argVals = e.args.map((a) => ex.val(a));
        ex.applyMod(bound.obj, methodLabel, argVals);
        return;
      }
    }

    // A static helper that mutates the card it is handed, which is how Cyclonic
    // Rift's overload is written:
    //     OverloadAbility.implementOverloadAbility(this, cost, target, effect)
    // Without this the card would read as vanilla, which it plainly is not.
    if (e.args.length
      && (e.args[0].k === 'this'
        || (e.args[0].k === 'call' && FACE_METHODS[e.args[0].name] && !e.args[0].args.length))) {
      const holder = e.obj ? flattenDots(e.obj) : null;
      const r = holder ? resolver.resolve(holder.join('.')) : null;
      if (r?.rec) {
        const argVals = e.args.map((a) => ex.val(a));
        const face = e.args[0].k === 'this' ? 'main' : FACE_METHODS[e.args[0].name];
        const obj = {
          cls: r.rec.simple, fqn: r.fqn, role: r.rec.role,
          keyword: r.fqn.startsWith('mage.abilities.keyword.'),
          helper: method, args: argVals.slice(1), named: null, paramMatch: 'static-helper',
          layer: r.rec.layer ?? null, sublayer: r.rec.sublayer ?? null,
          effects: [], targets: [], costs: [], modes: [], watchers: [], mods: [],
        };
        ex.hoist(obj);
        emit(obj, face, 'static-helper');
        return;
      }
    }

    ex.val(e);
  }

  for (const block of initBlocks) runStatements(block);
  if (initBlocks.length) out.flags.push('static-blocks');

  runStatements(stmts);

  const newNodes = countNewNodes([
    ...cardFields.map((f) => f.expr),
    ...initBlocks.flat(),
    ...stmts,
  ]);
  out.constructionAudit = {
    newInSource: newNodes.total,
    newInsideOpaque: newNodes.opaque,
    visited: ex.constructionsVisited ?? 0,
  };

  for (const [face, sp] of spellAbilities) {
    if (sp.effects.length || sp.targets.length || sp.costs.length || sp.modes.length || sp.mods.length) {
      out.abilities.push({ ...sp, face, source: 'spell' });
    }
  }

  out.unresolved = ex.unresolved;
  out.sinkWordsPresent = sinkWordsPresent;
  if (localTypes.size) out.flags.push('card-local-types');
  return { rec: out, fidelity };
}

/* ------------------------------------------------------------------ *
 * 5. Turning the working objects into the stored record
 * ------------------------------------------------------------------ */

function compactValue(v, depth = 0) {
  if (!v) return null;
  // A filter can be handed to a predicate that is then added back to the same
  // filter, which is a real cycle in the object graph. Depth-cap rather than
  // recurse forever.
  if (depth > 8) return { t: v.t ?? 'unknown', truncated: true };
  switch (v.t) {
    case 'int': case 'double': return { t: v.t, v: v.v };
    case 'bool': return { t: 'bool', v: v.v };
    case 'mana': return { t: 'mana', v: v.v };
    case 'string': return { t: 'string', v: v.v };
    case 'text': return { t: 'text', omitted: true, len: v.len };
    case 'null': return { t: 'null' };
    case 'char': return { t: 'char' };
    case 'enum': return { t: 'enum', enum: v.enum, v: v.v };
    case 'const': return { t: 'const', cls: v.cls, field: v.field, of: v.of ?? null, init: v.init ?? null };
    case 'classref': return { t: 'classref', cls: v.cls, role: v.role };
    case 'classLiteral': return { t: 'classLiteral', cls: v.cls };
    case 'cardRef': return { t: 'cardRef', face: v.face };
    case 'spellRef': return { t: 'spellRef', face: v.face };
    case 'ctorParam': return { t: 'ctorParam', name: v.name };
    case 'array': return { t: 'array', items: v.items.map((x) => compactValue(x, depth + 1)) };
    case 'obj': return { t: 'obj', obj: compactObject(v.obj, depth) };
    case 'factory': return { t: 'factory', cls: v.cls, method: v.method, args: v.args.map((x) => compactValue(x, depth + 1)) };
    case 'bespoke': return { t: 'bespoke', cls: v.cls, base: v.base ?? null, resolved: false };
    case 'self': return { t: 'self' };
    case 'selfField': return { t: 'selfField', field: v.field };
    case 'unresolved': return { t: 'unresolved', reason: v.reason, cls: v.cls ?? undefined, id: v.id ?? undefined };
    default: return { t: v.t ?? 'unknown', resolved: false };
  }
}

function compactObject(obj, depth = 0) {
  if (depth > 8) return { cls: obj.cls, fqn: obj.fqn, role: obj.role, truncated: true };
  const o = {
    cls: obj.cls,
    fqn: obj.fqn,
    role: obj.role,
  };
  if (obj.keyword) o.keyword = true;
  if (obj.singleton) o.singleton = true;
  if (obj.factory) o.factory = obj.factory;
  if (obj.helper) o.helper = obj.helper;
  if (obj.anon) o.anonymousSubclass = true;
  if (obj.bespoke) { o.bespoke = true; if (obj.base) o.bespokeBase = obj.base; }
  if (obj.layer) { o.layer = obj.layer; if (obj.sublayer) o.sublayer = obj.sublayer; }
  if (obj.duration) o.duration = obj.duration;

  if (obj.args?.length) {
    o.args = obj.args.map((a, i) => {
      const c = compactValue(a, depth + 1);
      if (obj.named && obj.named[i]) c.name = obj.named[i];
      if (obj.paramTypes && obj.paramTypes[i]) c.paramType = obj.paramTypes[i];
      return c;
    });
    o.paramMatch = obj.paramMatch;
  }
  const slot = (e, d) => (e.cls ? compactObject(e, d + 1) : { unresolved: compactValue(e.unresolved, d + 1) });
  if (obj.effects?.length) o.effects = obj.effects.map((e) => slot(e, depth));
  if (obj.targets?.length) o.targets = obj.targets.map((e) => slot(e, depth));
  if (obj.costs?.length) o.costs = obj.costs.map((e) => slot(e, depth));
  if (obj.modes?.length) o.modes = obj.modes.map((e) => slot(e, depth));
  if (obj.watchers?.length) o.watchers = obj.watchers.map((e) => slot(e, depth));
  if (obj.mods?.length) {
    o.mods = obj.mods.map((m) => ({ m: m.m, args: m.args.map((a) => compactValue(a, depth + 1)) }));
  }
  if (obj.face) o.face = obj.face;
  if (obj.source) o.source = obj.source;
  return o;
}

/** Every effect object reachable from an ability, flattened. */
function walkEffects(obj, fn, depth = 0) {
  if (!obj || depth > 8) return;
  for (const list of [obj.effects, obj.modes, obj.costs, obj.targets, obj.watchers]) {
    if (!list) continue;
    for (const e of list) {
      if (!e || !e.cls) continue;
      fn(e, depth + 1);
      walkEffects(e, fn, depth + 1);
    }
  }
  if (obj.args) {
    for (const a of obj.args) {
      if (a.t === 'obj') { fn(a.obj, depth + 1); walkEffects(a.obj, fn, depth + 1); }
      else if (a.t === 'array') for (const it of a.items) if (it.t === 'obj') { fn(it.obj, depth + 1); walkEffects(it.obj, fn, depth + 1); }
    }
  }
  if (obj.mods) {
    for (const m of obj.mods) {
      for (const a of m.args ?? []) {
        if (a.t === 'obj') { fn(a.obj, depth + 1); walkEffects(a.obj, fn, depth + 1); }
      }
    }
  }
}

/** Does every argument of this object resolve, all the way down? */
function fullyResolved(obj, depth = 0) {
  if (depth > 8) return false;
  if (obj.anon || obj.bespoke) return false;
  if (!obj.args) return true;
  for (const a of obj.args) {
    if (!argResolved(a, depth)) return false;
  }
  return true;
}

function argResolved(a, depth) {
  if (!a) return false;
  if (a.t === 'obj') return fullyResolved(a.obj, depth + 1);
  if (a.t === 'array') return a.items.every((i) => argResolved(i, depth + 1));
  if (a.t === 'factory') return a.args.every((i) => argResolved(i, depth + 1));
  return a.resolved === true;
}

/* ------------------------------------------------------------------ *
 * 6. Main
 * ------------------------------------------------------------------ */

function main() {
  const argv = process.argv.slice(2);
  const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
  const wantFidelity = argv.includes('--fidelity') || limit === Infinity;
  const t0 = Date.now();

  const engine = loadEngineIndex();
  const joinData = loadJoin();

  const byCls = new Map();
  for (const row of joinData.rows ?? []) {
    if (!row.cls) continue;
    if (!byCls.has(row.cls)) byCls.set(row.cls, []);
    byCls.get(row.cls).push(row);
  }

  const files = walkJava(CARDS_DIR).slice(0, limit === Infinity ? undefined : limit);

  const stats = {
    unresolvedReasons: new Map(),
    unresolvedDetail: new Map(),
    sinkNotRecognised: new Map(),
    stringArgs: 0,
    textArgsOmitted: 0,
    enumArgs: 0,
    constArgs: 0,
    factoryCalls: 0,
    noCtorMatch: 0,
    ambiguousOverload: 0,
    unrecognisedAbilityArg: 0,
    constructionsVisited: 0,
  };

  const counts = {
    files: files.length,
    parseErrors: 0,
    noConstructor: 0,
    withAbility: 0,
    withEffect: 0,
    withResolvedEffect: 0,           // >= 1 effect, all args resolved, >= 1 arg
    withResolvedEffectIncludingNullary: 0,
    onlyUnresolvedEffects: 0,
    withUnresolvedSlot: 0,
    keywordOnly: 0,
    joinedToScryfall: 0,
    commanderLegal: 0,
    nothing: 0,
    nothingVanilla: 0,
    nothingSinkMissed: 0,
    nothingParseError: 0,
    nothingNoCtor: 0,
    fidelityOk: 0,
    fidelityMismatch: 0,
    fidelityThrew: 0,
    fidelityStructuralTokens: 0,
    fidelityOpaqueTokens: 0,
    newInSource: 0,
    newInsideOpaque: 0,
    newVisited: 0,
    cardsWithMissedConstruction: 0,
  };

  const effectCards = new Map();     // effect fqn -> Set of card class
  const effectCardsCmd = new Map();  // effect fqn -> Set of card class, commander legal only
  const effectResolvedCards = new Map();
  const effectRole = new Map();
  const argShapes = new Map();       // "fqn(argsig)" -> count, the recipe census
  const shapesByClass = new Map();   // fqn -> Set of distinct argument shapes
  const roleCounts = new Map();
  const triggerCounts = new Map();
  const fidelitySamples = [];

  mkdirSync(DATA, { recursive: true });
  const ndjsonPath = join(DATA, 'xmage-card-effects.ndjson');
  const stream = createWriteStream(ndjsonPath, { encoding: 'utf8' });

  for (const path of files) {
    let res;
    try {
      res = extractCard(path, engine, { stats, fidelity: wantFidelity });
    } catch (e) {
      counts.parseErrors++;
      counts.nothing++;
      counts.nothingParseError++;
      stream.write(JSON.stringify({ cls: path.split(/[\\/]/).pop().replace('.java', ''), error: String(e.message) }) + '\n');
      continue;
    }
    const { rec, fidelity } = res;

    if (fidelity) {
      if (fidelity.threw) counts.fidelityThrew++;
      else if (fidelity.ok) counts.fidelityOk++;
      else {
        counts.fidelityMismatch++;
        if (fidelitySamples.length < 20) fidelitySamples.push({ cls: rec.cls, at: fidelity.at, expected: fidelity.expected, got: fidelity.got });
      }
      if (fidelity.stat) {
        counts.fidelityStructuralTokens += fidelity.stat.structural;
        counts.fidelityOpaqueTokens += fidelity.stat.opaque;
      }
    }

    if (rec.constructionAudit) {
      const a = rec.constructionAudit;
      counts.newInSource += a.newInSource;
      counts.newInsideOpaque += a.newInsideOpaque;
      counts.newVisited += a.visited;
      if (a.visited < a.newInSource - a.newInsideOpaque) counts.cardsWithMissedConstruction++;
    }

    const joinRows = byCls.get(rec.cls) ?? [];
    const commanderLegal = joinRows.some((r) => r.commanderLegal && !r.excluded);
    const names = [...new Set(joinRows.map((r) => r.name))];
    if (joinRows.length) counts.joinedToScryfall++;
    if (commanderLegal) counts.commanderLegal++;

    if (rec.reason === 'no-constructor') {
      counts.noConstructor++; counts.nothing++; counts.nothingNoCtor++;
      stream.write(JSON.stringify({ cls: rec.cls, path: rec.path, names, commanderLegal, reason: 'no-constructor' }) + '\n');
      continue;
    }
    if (rec.reason === 'parse-error') {
      counts.parseErrors++; counts.nothing++; counts.nothingParseError++;
      stream.write(JSON.stringify({ cls: rec.cls, path: rec.path, names, commanderLegal, reason: 'parse-error', error: rec.error }) + '\n');
      continue;
    }

    /* --- classify the card ---
     *
     * An EFFECT SLOT is a place the card puts an effect. It counts whether or
     * not we resolved what went in it, because counting only the ones we
     * resolved is exactly how a coverage number gets overstated. */
    const allEffects = [];
    let unresolvedSlots = 0;
    const slotWalk = (o, d = 0) => {
      if (!o || d > 8) return;
      for (const list of [o.effects, o.modes, o.costs, o.targets, o.watchers]) {
        if (!list) continue;
        for (const e of list) {
          if (!e) continue;
          if (!e.cls) { unresolvedSlots++; continue; }
          if (e.bespoke) unresolvedSlots++;
          else if (e.role && e.role.endsWith('-effect')) allEffects.push(e);
          slotWalk(e, d + 1);
        }
      }
      // Effects handed to a builder method rather than to `addEffect`, which is
      // how a Saga hangs an effect on a chapter.
      if (o.mods) {
        for (const m of o.mods) {
          for (const a of m.args ?? []) {
            if (a.t === 'obj') {
              if (a.obj.bespoke) unresolvedSlots++;
              else if (a.obj.role && a.obj.role.endsWith('-effect')) allEffects.push(a.obj);
              slotWalk(a.obj, d + 1);
            } else if (a.t === 'bespoke') unresolvedSlots++;
          }
        }
      }
      if (o.args) {
        for (const a of o.args) {
          if (a.t === 'obj') {
            if (a.obj.bespoke) unresolvedSlots++;
            else if (a.obj.role && a.obj.role.endsWith('-effect')) allEffects.push(a.obj);
            slotWalk(a.obj, d + 1);
          } else if (a.t === 'array') {
            for (const it of a.items) {
              if (it.t !== 'obj') continue;
              if (it.obj.bespoke) unresolvedSlots++;
              else if (it.obj.role && it.obj.role.endsWith('-effect')) allEffects.push(it.obj);
              slotWalk(it.obj, d + 1);
            }
          } else if (a.t === 'bespoke' && d === 0) {
            unresolvedSlots++;
          }
        }
      }
    };
    for (const ab of rec.abilities) {
      if (ab.bespoke) unresolvedSlots++;
      else if (ab.role && ab.role.endsWith('-effect')) allEffects.push(ab);
      slotWalk(ab);
    }

    const hasAbility = rec.abilities.length > 0;
    if (hasAbility) counts.withAbility++;
    if (allEffects.length || unresolvedSlots) counts.withEffect++;

    let resolvedEffectWithArgs = false;
    let resolvedEffectAny = false;
    for (const e of allEffects) {
      const ok = fullyResolved(e);
      if (ok) {
        resolvedEffectAny = true;
        if (e.args && e.args.length) resolvedEffectWithArgs = true;
      }
    }
    if (resolvedEffectWithArgs) counts.withResolvedEffect++;
    if (resolvedEffectAny) counts.withResolvedEffectIncludingNullary++;
    if ((allEffects.length || unresolvedSlots) && !resolvedEffectAny) counts.onlyUnresolvedEffects++;
    if (unresolvedSlots) counts.withUnresolvedSlot++;

    if (hasAbility && !allEffects.length && !unresolvedSlots) counts.keywordOnly++;

    let nothingReason = null;
    if (!hasAbility && !allEffects.length && !unresolvedSlots) {
      counts.nothing++;
      nothingReason = rec.sinkWordsPresent ? 'sink-not-recognised' : 'vanilla-no-ability-calls';
      if (rec.sinkWordsPresent) counts.nothingSinkMissed++;
      else counts.nothingVanilla++;
    }

    /* --- census --- */
    const seen = new Set();
    const record = (o) => {
      if (!o || !o.fqn || seen.has(o.fqn + '|' + o.cls)) return;
      seen.add(o.fqn + '|' + o.cls);
      effectRole.set(o.fqn, o.role);
      if (!effectCards.has(o.fqn)) effectCards.set(o.fqn, new Set());
      effectCards.get(o.fqn).add(rec.cls);
      if (commanderLegal) {
        if (!effectCardsCmd.has(o.fqn)) effectCardsCmd.set(o.fqn, new Set());
        effectCardsCmd.get(o.fqn).add(rec.cls);
      }
      if (fullyResolved(o)) {
        if (!effectResolvedCards.has(o.fqn)) effectResolvedCards.set(o.fqn, new Set());
        effectResolvedCards.get(o.fqn).add(rec.cls);
      }
    };

    for (const ab of rec.abilities) {
      record(ab);
      roleCounts.set(ab.role, (roleCounts.get(ab.role) ?? 0) + 1);
      if (ab.role === 'triggered-ability') {
        // A card-local triggered ability has no engine class, so it is keyed by
        // its own name rather than dropped.
        const key = ab.fqn ?? `card-local.${ab.cls}`;
        triggerCounts.set(key, (triggerCounts.get(key) ?? 0) + 1);
      }
      walkEffects(ab, record);
    }

    for (const e of allEffects) {
      if (!e.fqn) continue;
      const shape = '(' + (e.args ?? []).map(argSignature).join(', ') + ')';
      const sig = e.fqn + shape;
      argShapes.set(sig, (argShapes.get(sig) ?? 0) + 1);
      if (!shapesByClass.has(e.fqn)) shapesByClass.set(e.fqn, new Map());
      const m = shapesByClass.get(e.fqn);
      m.set(shape, (m.get(shape) ?? 0) + 1);
    }

    /* --- write --- */
    const outRec = {
      cls: rec.cls,
      path: rec.path,
      base: rec.base,
      names,
      oracleIds: joinRows.map((r) => r.oracle_id),
      commanderLegal,
      superArgs: rec.superArgs.map(compactValue),
      shape: rec.shape ?? undefined,
      fields: rec.fields ?? undefined,
      flags: rec.flags.length ? rec.flags : undefined,
      nothingReason: nothingReason ?? undefined,
      constructionAudit:
        rec.constructionAudit
        && rec.constructionAudit.visited < rec.constructionAudit.newInSource - rec.constructionAudit.newInsideOpaque
          ? rec.constructionAudit : undefined,
      abilities: rec.abilities.map((a) => decorateAbility(compactObject(a), engine)),
      unresolved: rec.unresolved.length ? tallyReasons(rec.unresolved) : undefined,
    };
    stream.write(JSON.stringify(outRec) + '\n');
  }

  stream.end();

  /* --- rankings --- */
  const rank = (map) => [...map.entries()]
    .map(([fqn, set]) => ({
      fqn,
      cls: fqn.split('.').pop(),
      role: effectRole.get(fqn) ?? 'other',
      cards: set.size,
      cardsResolved: effectResolvedCards.get(fqn)?.size ?? 0,
      cardsCommander: effectCardsCmd.get(fqn)?.size ?? 0,
    }))
    .sort((a, b) => b.cards - a.cards || a.fqn.localeCompare(b.fqn));

  const allRank = rank(effectCards);
  const cmdRank = [...effectCardsCmd.entries()]
    .map(([fqn, set]) => ({
      fqn,
      cls: fqn.split('.').pop(),
      role: effectRole.get(fqn) ?? 'other',
      cardsCommander: set.size,
      cards: effectCards.get(fqn)?.size ?? 0,
      cardsResolved: effectResolvedCards.get(fqn)?.size ?? 0,
    }))
    .sort((a, b) => b.cardsCommander - a.cardsCommander || a.fqn.localeCompare(b.fqn));

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', XMAGE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { /* recorded as unknown, never invented */ }

  const summary = {
    meta: {
      script: 'scripts/xmage/extract-effects.mjs',
      xmageCommit: commit,
      xmageLicence: 'MIT, Copyright (c) 2010 betasteward@gmail.com, https://github.com/magefree/mage',
      ranAt: new Date().toISOString(),
      cardFiles: counts.files,
      engineTypes: engine.meta.declaredTypes,
    },
    counts,
    stats: {
      stringArgs: stats.stringArgs,
      textArgsOmitted: stats.textArgsOmitted,
      enumArgs: stats.enumArgs,
      constArgs: stats.constArgs,
      factoryCalls: stats.factoryCalls,
      noCtorMatch: stats.noCtorMatch,
      ambiguousOverload: stats.ambiguousOverload,
      unrecognisedAbilityArg: stats.unrecognisedAbilityArg,
      unresolvedReasons: [...stats.unresolvedReasons].sort((a, b) => b[1] - a[1]),
      unresolvedDetailTop: [...stats.unresolvedDetail].sort((a, b) => b[1] - a[1]).slice(0, 60),
      sinkNotRecognised: [...stats.sinkNotRecognised].sort((a, b) => b[1] - a[1]).slice(0, 40),
    },
    fidelitySamples,
    distinctEffectClasses: allRank.length,
    roleCounts: [...roleCounts].sort((a, b) => b[1] - a[1]),
    topTriggers: [...triggerCounts].sort((a, b) => b[1] - a[1]).slice(0, 60),
    topArgShapes: [...argShapes].sort((a, b) => b[1] - a[1]).slice(0, 120),

    // The proof that the map is a recipe and not a fingerprint: how many
    // DIFFERENT argument shapes each effect class is used with. Under the old
    // import-only extraction every one of these would read as 1.
    recipeSpread: [...shapesByClass]
      .map(([fqn, m]) => ({
        fqn,
        cls: fqn.split('.').pop(),
        cards: effectCards.get(fqn)?.size ?? 0,
        distinctShapes: m.size,
      }))
      .sort((a, b) => b.distinctShapes - a.distinctShapes || b.cards - a.cards)
      .slice(0, 40),

    destroyAllEffect: [...(shapesByClass.get('mage.abilities.effects.common.DestroyAllEffect') ?? new Map())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15),
  };

  writeFileSync(join(DATA, 'xmage-extraction-summary.json'), JSON.stringify(summary, null, 1));
  writeFileSync(join(DATA, 'xmage-effect-rank.all.json'), JSON.stringify(allRank, null, 1));
  writeFileSync(join(DATA, 'xmage-effect-rank.commander.json'), JSON.stringify(cmdRank, null, 1));

  const docPath = writeDoc(summary, allRank, cmdRank);

  console.log(JSON.stringify({
    ms: Date.now() - t0,
    doc: relative(REPO, docPath),
    wrote: [
      relative(REPO, ndjsonPath),
      'scripts/coverage/.data/xmage-extraction-summary.json',
      'scripts/coverage/.data/xmage-effect-rank.all.json',
      'scripts/coverage/.data/xmage-effect-rank.commander.json',
    ],
    counts,
    distinctEffectClasses: allRank.length,
    top10: allRank.slice(0, 10),
  }, null, 1));

  return { summary, allRank, cmdRank, ndjsonPath };
}

/* ------------------------------------------------------------------ *
 * 7. The report. Written by the same run that measured it, so no number
 *    in the document was typed by a person.
 * ------------------------------------------------------------------ */

function pct(a, b) { return b === 0 ? '0.00' : ((100 * a) / b).toFixed(2); }
function num(n) { return n.toLocaleString('en-GB'); }

function mdTable(rows, cols) {
  const head = '| ' + cols.map((x) => x[0]).join(' | ') + ' |';
  const sep = '|' + cols.map(() => '---').join('|') + '|';
  const body = rows.map((r) => '| ' + cols.map((x) => x[1](r)).join(' | ') + ' |').join('\n');
  return [head, sep, body].join('\n');
}

function writeDoc(summary, allRank, cmdRank) {
  const c = summary.counts;
  const st = summary.stats;
  const N = c.files;

  const effectsAll = allRank.filter((r) => r.role.endsWith('-effect'));
  const effectsCmd = cmdRank.filter((r) => r.role.endsWith('-effect'));
  const cardLocal = (st.unresolvedReasons.find((r) => r[0] === 'card-local-class') || [null, 0])[1];

  const rankCols = [
    ['Effect class', (r) => r.cls],
    ['Package', (r) => r.fqn.replace(/\.[^.]+$/, '')],
    ['Cards', (r) => num(r.cards)],
    ['Of those, fully resolved', (r) => num(r.cardsResolved)],
    ['Commander legal', (r) => num(r.cardsCommander)],
  ];
  const cmdCols = [
    ['Effect class', (r) => r.cls],
    ['Package', (r) => r.fqn.replace(/\.[^.]+$/, '')],
    ['Commander legal cards', (r) => num(r.cardsCommander)],
    ['All cards', (r) => num(r.cards)],
    ['Fully resolved', (r) => num(r.cardsResolved)],
  ];

  const md = [
'# XMage extraction, keeping the arguments',
'',
'Generated by `scripts/xmage/extract-effects.mjs` on ' + summary.meta.ranAt + '.',
'Do not edit by hand. Every figure below is printed by that script from the run',
'that produced `scripts/coverage/.data/xmage-extraction-summary.json`.',
'',
'## Attribution and licence',
'',
'Behaviour in this document is derived from **XMage**, which is MIT licensed,',
'`Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.',
'XMage is read from a clone kept OUTSIDE this repository and nothing from it is',
'vendored here. The commit read was `' + summary.meta.xmageCommit + '`.',
'',
'Comment lines are stripped by the tokenizer before any analysis, and string',
'literal contents are not copied into the output unless they are mana symbols.',
'Those lines and strings carry Wizards of the Coast rules text, which is not',
"XMage's to license. Our rules text comes from Scryfall's `oracle_text`.",
'',
'Forge is GPL-3.0. It was not fetched, read or referenced.',
'',
'## What changed, and why it is the unlock',
'',
'The previous extraction recorded which classes a card file imports and threw the',
'constructor arguments away. That is why fifty different board wipes collapsed',
'into one `[DestroyAllEffect]` signature, and why the standing conclusion was',
'that the map could not say what to destroy. The arguments were in the source all',
'along:',
'',
'    WrathOfGod:  new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true)',
'    Damnation:   new DestroyAllEffect(StaticFilters.FILTER_PERMANENT_CREATURES, true)',
'    Armageddon:  new DestroyAllEffect(StaticFilters.FILTER_LANDS)',
'',
'They now come out as named parameters, because the engine index reads each',
"effect class's own constructor signatures:",
'',
'    WrathOfGod   DestroyAllEffect(filter = StaticFilters.FILTER_PERMANENT_CREATURES, noRegen = true)',
'    Armageddon   DestroyAllEffect(filter = StaticFilters.FILTER_LANDS)',
'',
'That is the difference between a fingerprint and a recipe.',
'',
'## How it parses, and the measured failure rate',
'',
'Not a regex. `scripts/xmage/lib/java-parse.mjs` tokenizes each file and a',
'recursive descent parser builds a real expression tree, so nested generics,',
'multi line constructors and nested `new` calls survive intact.',
'',
'Two independent checks run over the whole corpus on every extraction. Neither is',
'an estimate.',
'',
'**Check one, round trip.** Every constructor is parsed, then unparsed back into a',
"token stream from the tree's own fields, then compared with the original token",
'for token.',
'',
'| Measure | Count |',
'|---|---|',
'| Card constructors parsed | ' + num(N) + ' |',
'| Round trip identical | ' + num(c.fidelityOk) + ' (' + pct(c.fidelityOk, N) + '%) |',
'| Round trip differed | ' + num(c.fidelityMismatch) + ' |',
'| Parser threw | ' + num(c.fidelityThrew) + ' |',
'| Tokens rebuilt from the tree | ' + num(c.fidelityStructuralTokens) + ' |',
'| Tokens carried through as opaque text | ' + num(c.fidelityOpaqueTokens) + ' (' + pct(c.fidelityOpaqueTokens, c.fidelityStructuralTokens + c.fidelityOpaqueTokens) + '%) |',
'',
'The opaque tokens are anonymous class bodies, lambda blocks and control flow',
'headers, which the parser keeps as raw text on purpose. They are counted rather',
'than hidden.',
'',
'**Check two, construction audit.** A faithful parse does not prove the walker',
'visited everything it parsed. So the script also counts every `new X(...)` node',
'in the tree and compares it with the number the extractor actually evaluated.',
'',
'| Measure | Count |',
'|---|---|',
'| `new` expressions in the parsed source | ' + num(c.newInSource) + ' |',
'| Of those, inside a region kept opaque | ' + num(c.newInsideOpaque) + ' |',
'| Visited by the extractor | ' + num(c.newVisited) + ' |',
'| Cards where the extractor missed one | ' + num(c.cardsWithMissedConstruction) + ' |',
'',
"So the parser's measured failure rate over " + num(N) + ' card constructors is',
'**' + pct(N - c.fidelityOk, N) + "%**, and the walker's measured miss rate over",
num(c.newInSource) + ' constructions is',
'**' + pct(c.newInSource - c.newInsideOpaque - c.newVisited, c.newInSource) + '%**.',
'',
'## What the ' + num(N) + ' cards yielded',
'',
'The denominator everywhere below is **' + num(N) + ' XMage card files**, which is',
'the whole `Mage.Sets/src/mage/cards` tree. ' + num(c.joinedToScryfall) + ' of them',
'join to a Scryfall oracle id through the existing',
'`scripts/coverage/.data/join.json`, and ' + num(c.commanderLegal) + ' of those are',
'Commander legal.',
'',
'| Outcome | Cards | Share |',
'|---|---|---|',
'| At least one effect with every argument resolved, and at least one argument | ' + num(c.withResolvedEffect) + ' | ' + pct(c.withResolvedEffect, N) + '% |',
'| At least one effect with every argument resolved, counting no argument effects | ' + num(c.withResolvedEffectIncludingNullary) + ' | ' + pct(c.withResolvedEffectIncludingNullary, N) + '% |',
'| Has effects, but every one of them has an unresolved argument | ' + num(c.onlyUnresolvedEffects) + ' | ' + pct(c.onlyUnresolvedEffects, N) + '% |',
'| Abilities but no effect at all, which is a keyword only card | ' + num(c.keywordOnly) + ' | ' + pct(c.keywordOnly, N) + '% |',
'| Yielded nothing | ' + num(c.nothing) + ' | ' + pct(c.nothing, N) + '% |',
'',
'The second, third, fourth and fifth lines are disjoint and add to ' +
  num(c.withResolvedEffectIncludingNullary + c.onlyUnresolvedEffects + c.keywordOnly + c.nothing) +
  ', which is every one of the ' + num(N) + ' files. The first line is a subset of',
'the second.',
'',
'**Read the first two lines carefully.** The first is the strict number: the card',
'has an effect whose arguments were all resolved AND that effect actually takes',
'arguments, so the recipe says something. The second adds effects that take no',
'arguments at all, such as `new UntapSourceEffect()`, where "all arguments',
'resolved" is true because there are none. Both are stated because quoting only',
'the looser one is how a coverage figure gets overstated.',
'',
'**Neither of these is an automation figure.** They describe what was extracted',
'from XMage, not what our engine runs. The honest automation number is still the',
'one `verify-ability-coverage.mjs` produces by casting real spells through the',
'real reducer.',
'',
'### The cards that yielded nothing',
'',
'| Reason | Cards |',
'|---|---|',
'| Vanilla, the constructor makes no ability at all | ' + num(c.nothingVanilla) + ' |',
'| A sink the extractor does not recognise | ' + num(c.nothingSinkMissed) + ' |',
'| Constructor not found | ' + num(c.nothingNoCtor) + ' |',
'| Parse error | ' + num(c.nothingParseError) + ' |',
'',
'The vanilla claim was checked independently: none of those ' + num(c.nothingVanilla),
'files contains `addAbility`, `addEffect`, `addTarget`, `addMode` or a',
'`new ...Ability(` anywhere in the file, comments stripped.',
'',
'## Argument resolution',
'',
'| Argument kind | Count |',
'|---|---|',
'| Enum constants resolved, such as `Duration.EndOfTurn` and `CardType.SORCERY` | ' + num(st.enumArgs) + ' |',
'| Named constants resolved, such as `StaticFilters.FILTER_LANDS` | ' + num(st.constArgs) + ' |',
'| Static factory calls resolved, such as `CounterType.P1P1.createInstance(2)` | ' + num(st.factoryCalls) + ' |',
'| String literals seen | ' + num(st.stringArgs) + ' |',
'| Of those, display text whose contents were deliberately omitted | ' + num(st.textArgsOmitted) + ' |',
'| Overloads picked by argument type because arity alone was ambiguous | ' + num(st.ambiguousOverload) + ' |',
'| Constructions with no matching constructor in the engine index | ' + num(st.noCtorMatch) + ' |',
'',
'Mana symbol strings such as `"{2}{W}"` are kept in full, because they are cost',
'data rather than prose.',
'',
'### Everything that did not resolve, with its reason',
'',
mdTable(st.unresolvedReasons.map((x) => ({ reason: x[0], count: x[1] })), [
  ['Reason', (r) => '`' + r.reason + '`'],
  ['Occurrences', (r) => num(r.count)],
]),
'',
'`card-local-class` is by far the largest and it is not a defect in the',
'extractor. It means the card file declares its own Java class, so that class has',
'to be written by hand. Its ARGUMENTS are still kept, and where the local class',
'states what it extends, that superclass is recorded, so',
'`FishingPoleEffect extends OneShotEffect` is stored as a one shot effect that',
'needs writing rather than as an unknown.',
'',
'## The work order',
'',
'This is the point of the exercise. Each line is a primitive, and the count is the',
'number of real cards that stop being blocked when it is written.',
'',
'### Distinct effect classes ranked by cards, top 60 of ' + num(effectsAll.length),
'',
mdTable(effectsAll.slice(0, 60), rankCols),
'',
'### The same list ranked by Commander legal cards, top 60 of ' + num(effectsCmd.length),
'',
mdTable(effectsCmd.slice(0, 60), cmdCols),
'',
'The full rankings, which include every ability shape, cost, target, filter,',
'condition, dynamic value, token and watcher as well as effects, are in',
'`scripts/coverage/.data/xmage-effect-rank.all.json` and',
'`scripts/coverage/.data/xmage-effect-rank.commander.json`. Those files hold ' +
  num(allRank.length) + ' distinct classes in total, of which ' +
  num(effectsAll.length) + ' are effects.',
'',
'### What kind of ability the cards build',
'',
mdTable(summary.roleCounts.map((x) => ({ role: x[0], count: x[1] })), [
  ['Role', (r) => r.role],
  ['Ability instances across all cards', (r) => num(r.count)],
]),
'',
'### The most common triggers, top 30',
'',
mdTable(summary.topTriggers.slice(0, 30).map((x) => ({ fqn: x[0], count: x[1] })), [
  ['Trigger', (r) => r.fqn.split('.').pop()],
  ['Cards', (r) => num(r.count)],
]),
'',
'### The proof that this is a recipe and not a fingerprint',
'',
'The old extraction recorded a class name and nothing else, so every effect class',
'below would have read as ONE thing. Counting the distinct argument shapes each',
'class is actually used with says how much was being thrown away.',
'',
mdTable(summary.recipeSpread.slice(0, 25), [
  ['Effect class', (r) => r.cls],
  ['Cards using it', (r) => num(r.cards)],
  ['Distinct argument shapes', (r) => num(r.distinctShapes)],
]),
'',
'And the case the brief names, taken straight from the run rather than typed:',
'',
mdTable(summary.destroyAllEffect.map((x) => ({ shape: x[0], count: x[1] })), [
  ['`DestroyAllEffect` called with', (r) => '`' + r.shape + '`'],
  ['Cards', (r) => num(r.count)],
]),
'',
'### The most common recipes, top 40',
'',
'An effect class plus the SHAPE of its arguments. This is the list that makes the',
'map a recipe rather than a fingerprint: the same class appears more than once',
'with different arguments, which is exactly what the old extraction could not',
'see.',
'',
mdTable(summary.topArgShapes.slice(0, 40).map((x) => ({ sig: x[0], count: x[1] })), [
  ['Effect and arguments', (r) => '`' + r.sig.replace(/^[a-z0-9_.]+\./, '') + '`'],
  ['Uses', (r) => num(r.count)],
]),
'',
'## What is written where',
'',
'| File | What it holds |',
'|---|---|',
'| `scripts/coverage/.data/xmage-card-effects.ndjson` | One JSON record per card. Abilities with their trigger, cost, layer, effects, targets, modes and every argument. |',
'| `scripts/coverage/.data/xmage-engine-index.json` | Every XMage engine type: superclass chain, role, constructor parameter names, CR 613 layer, enum constants, static constants. |',
'| `scripts/coverage/.data/xmage-extraction-summary.json` | The counts on this page. |',
'| `scripts/coverage/.data/xmage-effect-rank.all.json` | Every primitive ranked by cards. |',
'| `scripts/coverage/.data/xmage-effect-rank.commander.json` | The same, ranked by Commander legal cards. |',
'',
'## One record, four questions',
'',
'The record shape was chosen so a single card row answers all four things the',
'engine has to answer, not only the first.',
'',
'| Question | What answers it in the record |',
'|---|---|',
'| PLAY, what happens on resolution | `abilities[].effects[]` with resolved arguments, plus `trigger`, `activationCost` and `layers` |',
'| DECK BUILDING, what this does for a list | `abilities[].role`, the effect packages, the counts per card |',
'| RECOMMENDATION, find me cards that do this | the effect `fqn` plus its argument shape, which is a join key across cards |',
'| OPTIMISATION, what beats what | the arguments are comparable values, so two cards using the same effect can be ordered by what they pass it |',
'',
'## Known limits, stated rather than buried',
'',
'1. **Card local Java is not solved by this.** ' + num(cardLocal) + ' references',
'   point at a class declared inside the card file. The arguments and the declared',
'   superclass are kept, the body is not.',
'2. **Anonymous class bodies and lambda bodies are opaque.** They are counted in',
'   the round trip table above and never silently skipped.',
'3. **Arithmetic in an argument does not resolve.** An argument written as',
'   `x + 1` is recorded as unresolved with reason `expression-arithmetic`.',
'4. **Display text is present but not copied.** ' + num(st.textArgsOmitted) + ' string',
'   arguments are recorded as text of a given length with the contents omitted,',
'   for the licence reason at the top of this page. They count as resolved,',
'   because they carry no rules meaning we need.',
'5. **Overload choice can be ambiguous.** ' + num(st.ambiguousOverload) + ' constructions',
'   had more than one constructor of the same arity and the same type score. The',
'   arguments are still recorded in order, only the parameter NAMES are uncertain,',
'   and `paramMatch` on each record says which case applied.',
'6. **This measures extraction, not automation.** Nothing here says a card runs.',
'',
  ].join('\n');

  mkdirSync(DOCS, { recursive: true });
  const out = join(DOCS, 'XMAGE-EXTRACTION.md');
  writeFileSync(out, md);
  return out;
}

/**
 * A comparable shape for one argument. One level of nesting is kept, because a
 * filter's own arguments and predicates are the difference between "creatures"
 * and "Zombies you control", which is the whole point of this extraction.
 */
function argSignature(a, depth = 0) {
  if (!a) return '?';
  switch (a.t) {
    case 'int': return 'int';
    case 'bool': return String(a.v);
    case 'mana': return 'mana';
    case 'string': return 'str';
    case 'text': return 'text';
    case 'enum': return `${a.enum}.${a.v}`;
    case 'const': return `${a.cls}.${a.field}`;
    case 'array': return 'array';
    case 'bespoke': return 'CARD_LOCAL';
    case 'classLiteral': return `${a.cls}.class`;
    case 'cardRef': return 'card';
    case 'spellRef': return 'spellAbility';
    case 'unresolved': return `UNRESOLVED:${a.reason}`;
    case 'factory': return `${a.cls}.${a.method}()`;
    case 'obj': {
      const o = a.obj;
      if (depth >= 1) return o.cls;
      const inner = [];
      for (const x of o.args ?? []) {
        const sg = argSignature(x, depth + 1);
        if (sg !== 'text' && sg !== 'str') inner.push(sg);
      }
      for (const m of o.mods ?? []) {
        for (const x of m.args ?? []) inner.push(`${m.m}:${argSignature(x, depth + 1)}`);
      }
      if (o.factory) inner.unshift(`${o.factory.on ?? ''}.${o.factory.method}()`);
      return inner.length ? `${o.cls}[${inner.join(' ')}]` : o.cls;
    }
    default: return a.t;
  }
}

/** Attach the trigger / cost / layer view the brief asks for. */
function decorateAbility(a, engine) {
  if (a.role === 'triggered-ability') {
    a.trigger = {
      cls: a.cls,
      fqn: a.fqn,
      args: (a.args ?? []).filter((x) => x.t !== 'obj' || !(x.obj.role ?? '').endsWith('-effect')),
    };
  }
  if (a.role === 'activated-ability' || a.role === 'mana-ability') {
    const costs = [...(a.costs ?? [])];
    for (const x of a.args ?? []) {
      if (x.t === 'obj' && ['cost', 'mana-cost'].includes(x.obj.role)) costs.push(x.obj);
      if (x.t === 'mana') costs.push({ cls: 'ManaCost', mana: x.v });
    }
    if (costs.length) a.activationCost = costs;
  }
  if (a.role === 'static-ability' || a.role === 'continuous-effect') {
    const layers = [];
    const scan = (o, d = 0) => {
      if (!o || d > 6) return;
      if (o.layer) layers.push({ cls: o.cls, layer: o.layer, sublayer: o.sublayer ?? null });
      for (const l of [o.effects, o.modes, o.args?.filter((x) => x.t === 'obj').map((x) => x.obj)]) {
        if (l) for (const c of l) scan(c, d + 1);
      }
    };
    scan(a);
    if (layers.length) a.layers = layers;
  }
  return a;
}

function tallyReasons(list) {
  const m = new Map();
  for (const u of list) m.set(u.reason, (m.get(u.reason) ?? 0) + 1);
  return Object.fromEntries(m);
}

export { extractCard, main };

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}
