/**
 * scripts/xmage/index-engine.mjs
 *
 * Builds the vocabulary that `extract-effects.mjs` resolves card arguments
 * against. It reads XMage's ENGINE source (Mage/src/main/java), not the card
 * files, and records for every declared type:
 *
 *   - its fully-qualified name, kind and superclass chain, resolved through the
 *     declaring file's own imports so two classes sharing a simple name never
 *     collide;
 *   - its constructor parameter lists, WITH PARAMETER NAMES, which is what lets
 *     a card's positional arguments be reported as
 *     `DestroyAllEffect(filter = FILTER_LANDS, noRegen = true)` instead of as
 *     an unlabelled tuple;
 *   - the CR 613 layer and sublayer where the class states one in its own
 *     `super(...)` call, so a static ability can carry the layer XMage assigns
 *     it rather than one we guessed;
 *   - enum constants for `mage.constants.*`, and the initialiser of every
 *     `StaticFilters.FILTER_*` constant.
 *
 * Output: scripts/coverage/.data/xmage-engine-index.json
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`. It is read from a
 * clone outside this repository and nothing from it is vendored here. Comments
 * are dropped by the tokenizer before anything is recorded, because those lines
 * carry Wizards of the Coast rules text.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tokenize, JavaParser, readImports, readPackage } from './lib/java-parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT_DIR = join(REPO, 'scripts/coverage/.data');

export const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';

const ENGINE_DIR = join(XMAGE_ROOT, 'Mage/src/main/java');

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

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'abstract',
  'sealed', 'non', 'strictfp', 'default',
]);

/**
 * Scan a token stream for every type declaration and, for classes, every
 * constructor signature. Nested types are recorded under `Outer.Inner`.
 */
function scanDeclarations(toks, pkg) {
  const decls = [];
  const scopeStack = []; // { name, depth }
  let depth = 0;

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];

    if (t.t === 'punc' && t.v === '{') { depth++; continue; }
    if (t.t === 'punc' && t.v === '}') {
      depth--;
      while (scopeStack.length && scopeStack[scopeStack.length - 1].depth > depth) scopeStack.pop();
      continue;
    }

    if (t.t !== 'id') continue;
    if (!['class', 'interface', 'enum', 'record'].includes(t.v)) continue;
    // `X.class` literal, or the word used as an identifier.
    if (toks[i - 1]?.v === '.') continue;
    if (toks[i + 1]?.t !== 'id') continue;

    const kind = t.v;
    const name = toks[i + 1].v;

    // Modifiers immediately before the keyword.
    let k = i - 1;
    let isAbstract = false;
    while (k >= 0 && toks[k].t === 'id' && MODIFIERS.has(toks[k].v)) {
      if (toks[k].v === 'abstract') isAbstract = true;
      k--;
    }

    // Walk the header to `{`, collecting extends / implements.
    let j = i + 2;
    let ext = null;
    const impl = [];
    let mode = null;
    let genericDepth = 0;
    for (; j < toks.length; j++) {
      const u = toks[j];
      if (u.v === '<') { genericDepth++; continue; }
      if (u.v === '>') { genericDepth--; continue; }
      if (u.v === '{' && genericDepth <= 0) break;
      if (u.v === ';' && genericDepth <= 0) break;
      if (u.t === 'id' && u.v === 'extends') { mode = 'ext'; continue; }
      if (u.t === 'id' && (u.v === 'implements' || u.v === 'permits')) { mode = u.v === 'implements' ? 'impl' : null; continue; }
      if (genericDepth > 0) continue;
      if (u.t === 'id' && mode === 'ext' && !ext) ext = qualifiedFrom(toks, j), j = qualifiedEnd(toks, j);
      else if (u.t === 'id' && mode === 'impl') { impl.push(qualifiedFrom(toks, j)); j = qualifiedEnd(toks, j); }
    }

    const outer = scopeStack.map((s) => s.name).join('.');
    const localName = outer ? `${outer}.${name}` : name;
    const fqn = pkg ? `${pkg}.${localName}` : localName;

    decls.push({ fqn, simple: name, localName, pkg, kind, abstract: isAbstract, ext, impl, headerEnd: j });
    scopeStack.push({ name: localName, depth });
  }

  return decls;
}

function qualifiedFrom(toks, j) {
  const parts = [toks[j].v];
  let k = j + 1;
  while (toks[k]?.v === '.' && toks[k + 1]?.t === 'id') { parts.push(toks[k + 1].v); k += 2; }
  return parts.join('.');
}
function qualifiedEnd(toks, j) {
  let k = j;
  while (toks[k + 1]?.v === '.' && toks[k + 2]?.t === 'id') k += 2;
  return k;
}

/** Constructor signatures of `simpleName`, with parameter names kept. */
function scanConstructors(toks, simpleName) {
  const out = [];
  for (let i = 1; i < toks.length - 1; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== simpleName) continue;
    if (toks[i + 1].v !== '(') continue;
    const prev = toks[i - 1];
    if (!prev) continue;
    if (prev.v === 'new' || prev.v === '.' || prev.v === 'return') continue;
    const vis = ['public', 'private', 'protected'].includes(prev.v) ? prev.v : 'package';
    if (vis === 'package' && !['{', '}', ';'].includes(prev.v)) continue;

    // Parameter list.
    let j = i + 1, d = 0, end = -1;
    for (; j < toks.length; j++) {
      if (toks[j].v === '(') d++;
      else if (toks[j].v === ')') { d--; if (d === 0) { end = j; break; } }
    }
    if (end < 0) continue;
    let after = end + 1;
    while (after < toks.length && !['{', ';'].includes(toks[after].v)) after++;
    if (toks[after]?.v !== '{') continue;

    const params = parseParams(toks.slice(i + 2, end));
    if (params === null) continue;

    // Body, so `super(... Layer.X, SubLayer.Y ...)` can be read off it.
    let bd = 0, bodyEnd = after;
    for (let m = after; m < toks.length; m++) {
      if (toks[m].v === '{') bd++;
      else if (toks[m].v === '}') { bd--; if (bd === 0) { bodyEnd = m; break; } }
    }
    out.push({ vis, params, bodyStart: after, bodyEnd });
  }
  return out;
}

function parseParams(toks) {
  if (!toks.length) return [];
  const params = [];
  let start = 0, gd = 0;
  const pieces = [];
  for (let i = 0; i < toks.length; i++) {
    const v = toks[i].v;
    if (v === '<' || v === '(') gd++;
    else if (v === '>' || v === ')') gd--;
    else if (v === ',' && gd === 0) { pieces.push(toks.slice(start, i)); start = i + 1; }
  }
  pieces.push(toks.slice(start));

  for (const piece of pieces) {
    const clean = piece.filter((t) => !(t.t === 'id' && t.v === 'final'));
    if (!clean.length) return null;
    const nameTok = clean[clean.length - 1];
    if (nameTok.t !== 'id') return null;
    const typeToks = clean.slice(0, -1);
    if (!typeToks.length) return null;
    const varargs = typeToks[typeToks.length - 1]?.v === '.';
    let base = typeToks.filter((t) => t.v !== '.' || true);
    // Simple type name = last identifier before any generic args or brackets.
    let simple = null, gd2 = 0;
    for (const t of typeToks) {
      if (t.v === '<') gd2++;
      else if (t.v === '>') gd2--;
      else if (gd2 === 0 && t.t === 'id') simple = t.v;
    }
    const isArray = typeToks.some((t) => t.v === '[') || varargs;
    params.push({ name: nameTok.v, type: simple ?? '?', array: isArray });
  }
  return params;
}

/** `Layer.X` / `SubLayer.Y` / `Duration.Z` named inside a constructor body. */
function readLayerHints(toks, from, to) {
  let layer = null, sublayer = null, duration = null;
  for (let i = from; i < to; i++) {
    const t = toks[i];
    if (t.t !== 'id' || toks[i + 1]?.v !== '.' || toks[i + 2]?.t !== 'id') continue;
    if (t.v === 'Layer' && !layer) layer = toks[i + 2].v;
    else if (t.v === 'SubLayer' && !sublayer) sublayer = toks[i + 2].v;
    else if (t.v === 'Duration' && !duration) duration = toks[i + 2].v;
  }
  return { layer, sublayer, duration };
}

/** Enum constant names: identifiers at the head of the enum body. */
function readEnumConstants(toks, headerEnd) {
  const out = [];
  let i = headerEnd + 1;
  let d = 0;
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (t.v === '(' || t.v === '{' || t.v === '[') { d++; continue; }
    if (t.v === ')' || t.v === '}' || t.v === ']') { d--; if (d < 0) break; continue; }
    if (d > 0) continue;
    if (t.v === ';') break;
    if (t.t === 'id' && t.v === '@') continue;
    if (t.t === 'id' && (toks[i - 1]?.v === ',' || i === headerEnd + 1 || toks[i - 1]?.v === '}')) {
      if (/^[A-Za-z_$]/.test(t.v)) out.push(t.v);
    }
  }
  return out;
}

/**
 * `static final T NAME = <expr>;` fields, grouped by the simple name of the
 * type that declares them. `parseInit` controls whether the initialiser
 * expression is parsed as well as named.
 */
function readStaticFields(toks, parseInit) {
  const out = {};
  const owner = [];
  let depth = 0;
  const ownerAt = new Array(toks.length).fill(null);
  {
    const stack = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'id' && ['class', 'interface', 'enum', 'record'].includes(t.v)
        && toks[i + 1]?.t === 'id' && toks[i - 1]?.v !== '.') {
        let j = i + 2, gd = 0;
        for (; j < toks.length; j++) {
          if (toks[j].v === '<') gd++;
          else if (toks[j].v === '>') gd--;
          else if (toks[j].v === '{' && gd <= 0) break;
          else if (toks[j].v === ';' && gd <= 0) { j = -1; break; }
        }
        if (j > 0) stack.push({ name: toks[i + 1].v, open: j, depth: null });
      }
      if (t.v === '{') { depth++; const top = stack[stack.length - 1]; if (top && top.depth === null && toks[i] === toks[top.open]) top.depth = depth; }
      else if (t.v === '}') {
        const top = stack[stack.length - 1];
        if (top && top.depth === depth) stack.pop();
        depth--;
      }
      ownerAt[i] = stack.length ? stack[stack.length - 1].name : null;
    }
  }

  for (let i = 0; i < toks.length - 4; i++) {
    if (!(toks[i].t === 'id' && toks[i].v === 'static')) continue;
    if (!(toks[i + 1].t === 'id' && toks[i + 1].v === 'final')) continue;
    // type ... name =
    let j = i + 2, gd = 0;
    const typeStart = j;
    for (; j < toks.length; j++) {
      const v = toks[j].v;
      if (v === '<') gd++;
      else if (v === '>') gd--;
      else if (gd === 0 && toks[j].t === 'id' && toks[j + 1]?.v === '=') break;
      else if (gd === 0 && v === ';') { j = -1; break; }
    }
    if (j < 0 || j >= toks.length) continue;
    const name = toks[j].v;
    let typeSimple = null, gd3 = 0;
    for (let m = typeStart; m < j; m++) {
      if (toks[m].v === '<') gd3++;
      else if (toks[m].v === '>') gd3--;
      else if (gd3 === 0 && toks[m].t === 'id') typeSimple = toks[m].v;
    }
    let expr = null;
    if (parseInit) {
      const p = new JavaParser(toks.slice(j + 2, Math.min(j + 2 + 400, toks.length)).concat([{ t: 'eof', v: '', p: 0, line: 0 }]));
      try { expr = p.parseExpression(); } catch { expr = null; }
    }
    const cls = ownerAt[i] ?? '?';
    (out[cls] ??= {})[name] = { type: typeSimple, init: expr ? summariseInit(expr) : null };
  }
  return out;
}

/** A compact, JSON-safe shape of a static field initialiser. */
function summariseInit(node) {
  switch (node.k) {
    case 'new':
      return {
        k: 'new', cls: node.type.name.split('.').pop(),
        args: node.args.map(summariseInit),
      };
    case 'call':
      return {
        k: 'call',
        on: node.obj ? summariseInit(node.obj) : null,
        name: node.name,
        args: node.args.map(summariseInit),
      };
    case 'field': return { k: 'field', on: summariseInit(node.obj), name: node.name };
    case 'name': return { k: 'name', id: node.id };
    case 'lit': return { k: 'lit', type: node.type, v: node.type === 'str' ? undefined : node.v };
    case 'arrayinit': return { k: 'array', items: node.items.map(summariseInit) };
    case 'newarray': return { k: 'array', items: node.init ? node.init.items.map(summariseInit) : [] };
    case 'paren': return summariseInit(node.e);
    default: return { k: 'other', kind: node.k };
  }
}

/* ------------------------------------------------------------------ */

export function buildEngineIndex() {
  const files = walkJava(ENGINE_DIR);
  const classes = {};
  const bySimple = new Map();
  const enums = {};
  const staticFields = {};
  const fileOf = new Map();

  for (const path of files) {
    const src = readFileSync(path, 'utf8');
    const toks = tokenize(src);
    const pkg = readPackage(toks);
    const { single, wildcard } = readImports(toks);
    const decls = scanDeclarations(toks, pkg);

    for (const d of decls) {
      const rec = {
        fqn: d.fqn, simple: d.simple, pkg: d.pkg, kind: d.kind, abstract: d.abstract,
        extRaw: d.ext, implRaw: d.impl,
        imports: Object.fromEntries(single),
        wildcard,
        ctors: [],
      };

      if (d.kind === 'class' || d.kind === 'enum' || d.kind === 'record') {
        const ctors = scanConstructors(toks, d.simple);
        for (const c of ctors) {
          const hints = readLayerHints(toks, c.bodyStart, c.bodyEnd);
          rec.ctors.push({ vis: c.vis, params: c.params, ...hints });
        }
        const withLayer = rec.ctors.find((c) => c.layer);
        if (withLayer) { rec.layer = withLayer.layer; rec.sublayer = withLayer.sublayer ?? null; }
      }

      if (d.kind === 'enum') {
        enums[d.fqn] = readEnumConstants(toks, d.headerEnd);
      }

      classes[d.fqn] = rec;
      if (!bySimple.has(d.simple)) bySimple.set(d.simple, []);
      bySimple.get(d.simple).push(d.fqn);
      fileOf.set(d.fqn, path);
    }

    // `public static final` fields of every engine class. Their NAMES are what
    // lets `ObjectColor.BLACK` resolve at all; their INITIALISERS are only
    // parsed for the packages where the initialiser is the meaning, because
    // parsing all of them costs time and buys nothing.
    const parseInit = /^(mage\.filter|mage\.abilities\.dynamicvalue|mage\.abilities\.condition|mage\.constants)/.test(pkg) || pkg === 'mage';
    const fields = readStaticFields(toks, parseInit);
    for (const d of decls) {
      if (d.localName.includes('.')) continue;
      const own = fields[d.simple];
      if (own && Object.keys(own).length) staticFields[d.fqn] = own;
    }
  }

  /* Resolve extends/implements to fully-qualified names. */
  const resolveName = (rec, simple) => {
    if (!simple) return null;
    const head = simple.split('.')[0];
    if (rec.imports[head]) {
      const base = rec.imports[head];
      return simple.includes('.') ? `${base}.${simple.split('.').slice(1).join('.')}` : base;
    }
    const samePkg = `${rec.pkg}.${simple}`;
    if (classes[samePkg]) return samePkg;
    for (const w of rec.wildcard) {
      if (classes[`${w}.${simple}`]) return `${w}.${simple}`;
    }
    const cands = bySimple.get(simple.split('.').pop());
    if (cands && cands.length === 1) return cands[0];
    return null;
  };

  for (const rec of Object.values(classes)) {
    rec.ext = resolveName(rec, rec.extRaw);
    rec.impl = rec.implRaw.map((s) => resolveName(rec, s)).filter(Boolean);
    delete rec.extRaw; delete rec.implRaw; delete rec.imports; delete rec.wildcard;
  }

  /* Transitive supertypes. */
  const chainCache = new Map();
  function chainOf(fqn, seen = new Set()) {
    if (chainCache.has(fqn)) return chainCache.get(fqn);
    if (seen.has(fqn)) return [];
    seen.add(fqn);
    const rec = classes[fqn];
    if (!rec) return [];
    const out = [];
    for (const parent of [rec.ext, ...rec.impl].filter(Boolean)) {
      out.push(parent, ...chainOf(parent, seen));
    }
    const uniq = [...new Set(out)];
    chainCache.set(fqn, uniq);
    return uniq;
  }
  for (const [fqn, rec] of Object.entries(classes)) rec.chain = chainOf(fqn);

  /* Role, from the resolved chain. XMage decides this, not a name list. */
  const ROLE_BY_SUPER = [
    ['mage.abilities.effects.ContinuousEffectImpl', 'continuous-effect'],
    ['mage.abilities.effects.ReplacementEffectImpl', 'replacement-effect'],
    ['mage.abilities.effects.PreventionEffectImpl', 'replacement-effect'],
    ['mage.abilities.effects.RestrictionEffect', 'restriction-effect'],
    ['mage.abilities.effects.ContinuousRuleModifyingEffectImpl', 'rule-modifying-effect'],
    ['mage.abilities.effects.AsThoughEffectImpl', 'as-though-effect'],
    ['mage.abilities.effects.CostModificationEffectImpl', 'cost-modification-effect'],
    ['mage.abilities.effects.common.ManaEffect', 'mana-effect'],
    ['mage.abilities.effects.OneShotEffect', 'one-shot-effect'],
    ['mage.abilities.effects.Effect', 'effect'],
    ['mage.abilities.TriggeredAbilityImpl', 'triggered-ability'],
    ['mage.abilities.TriggeredAbility', 'triggered-ability'],
    ['mage.abilities.mana.ManaAbility', 'mana-ability'],
    ['mage.abilities.mana.ActivatedManaAbilityImpl', 'mana-ability'],
    ['mage.abilities.ActivatedAbilityImpl', 'activated-ability'],
    ['mage.abilities.ActivatedAbility', 'activated-ability'],
    ['mage.abilities.SpellAbility', 'spell-ability'],
    ['mage.abilities.StaticAbility', 'static-ability'],
    ['mage.abilities.Ability', 'ability'],
    ['mage.abilities.costs.mana.ManaCost', 'mana-cost'],
    ['mage.abilities.costs.Cost', 'cost'],
    ['mage.abilities.condition.Condition', 'condition'],
    ['mage.abilities.dynamicvalue.DynamicValue', 'dynamic-value'],
    ['mage.target.Target', 'target'],
    ['mage.filter.Filter', 'filter'],
    ['mage.filter.predicate.Predicate', 'predicate'],
    ['mage.game.permanent.token.TokenImpl', 'token'],
    ['mage.watchers.Watcher', 'watcher'],
    ['mage.abilities.keyword.KeywordAbilityInfo', 'keyword'],
    ['mage.counters.Counter', 'counter'],
    ['mage.abilities.Mode', 'mode'],
  ];

  for (const [fqn, rec] of Object.entries(classes)) {
    const chain = new Set([fqn, ...rec.chain]);
    let role = null;
    for (const [sup, r] of ROLE_BY_SUPER) {
      if (chain.has(sup)) { role = r; break; }
    }
    if (!role && rec.kind === 'enum') role = 'enum';
    rec.role = role ?? 'other';
  }

  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', XMAGE_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch { /* left as unknown rather than invented */ }

  return {
    meta: {
      xmageCommit: commit,
      builtAt: new Date().toISOString(),
      engineFiles: files.length,
      declaredTypes: Object.keys(classes).length,
      note: 'Built by scripts/xmage/index-engine.mjs from XMage (MIT) read in place. Nothing vendored.',
    },
    classes,
    bySimple: Object.fromEntries([...bySimple].map(([k, v]) => [k, v])),
    enums,
    staticFields,
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const t0 = Date.now();
  const idx = buildEngineIndex();
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'xmage-engine-index.json');
  writeFileSync(out, JSON.stringify(idx));
  const roles = {};
  for (const r of Object.values(idx.classes)) roles[r.role] = (roles[r.role] ?? 0) + 1;
  console.log(JSON.stringify({
    wrote: out,
    ms: Date.now() - t0,
    engineFiles: idx.meta.engineFiles,
    declaredTypes: idx.meta.declaredTypes,
    enums: Object.keys(idx.enums).length,
    staticFilters: Object.keys(idx.staticFields['mage.filter.StaticFilters'] ?? {}).length,
    roles: Object.entries(roles).sort((a, b) => b[1] - a[1]),
  }, null, 1));
}
