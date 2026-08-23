/**
 * scripts/xmage/api-surface-typed.mjs
 *
 * `api-surface.mjs` counts by METHOD NAME. That merges every `getId` in XMage
 * into one row, so its ranking cannot be used as a work order: you cannot
 * implement `.getId()`, you implement `Permanent#getId` and `Ability#getId` and
 * they are different functions on different objects in our engine.
 *
 * This script counts the same calls keyed by RESOLVED RECEIVER TYPE. It does
 * local type inference over each card-local class body:
 *
 *   - method parameters, local declarations, enhanced-for variables and the
 *     card-local class's own fields give a name-to-type environment;
 *   - `new Foo(...)`, casts `((Permanent) x)`, string and boolean literals give
 *     the rest of the chain heads;
 *   - the engine method table from `index-engine-methods.mjs` types every step
 *     of a chain, so `game.getPlayer(id).getLibrary().size()` is counted as
 *     three calls on three different receivers rather than three bare names;
 *   - the class chain from `index-engine.mjs` resolves inherited methods, so
 *     `GameImpl#getPlayer` is found on `Game`.
 *
 * Anything that does not resolve is reported as `?` and counted, because the
 * unresolved share is the honesty of the number. It is never silently dropped.
 *
 * Run:  node scripts/xmage/api-surface-typed.mjs
 * Out:  scripts/coverage/.data/xmage-api-surface.json
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. The clone is read in place; nothing is
 * vendored. Comments are dropped by the tokenizer before anything is recorded.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, readImports, readPackage } from './lib/java-parse.mjs';
import { readType, skipBalanced } from './index-engine-methods.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'scripts/coverage/.data');

const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const CARDS = join(XMAGE_ROOT, 'Mage.Sets/src/mage/cards');

/* -------------------------------------------------------------------------- */
/* The engine tables                                                          */
/* -------------------------------------------------------------------------- */

const engine = JSON.parse(readFileSync(join(DATA, 'xmage-engine-index.json'), 'utf8'));
const methodIdx = JSON.parse(readFileSync(join(DATA, 'xmage-engine-methods.json'), 'utf8'));

/** simple name -> fqn, ambiguity broken by preferring `mage.` core packages. */
const PREFER = [
  'mage.game.', 'mage.players.', 'mage.abilities.', 'mage.cards.', 'mage.target.',
  'mage.filter.', 'mage.counters.', 'mage.constants.', 'mage.',
];
const simpleToFqn = new Map();
for (const [simple, list] of Object.entries(engine.bySimple)) {
  if (list.length === 1) { simpleToFqn.set(simple, list[0]); continue; }
  let best = null;
  let bestRank = 1e9;
  for (const fqn of list) {
    const rank = PREFER.findIndex((p) => fqn.startsWith(p));
    const r = rank === -1 ? 500 + fqn.length : rank * 100 + fqn.length;
    if (r < bestRank) { bestRank = r; best = fqn; }
  }
  simpleToFqn.set(simple, best);
}

/** Methods visible on `fqn`, own first then up the resolved supertype chain. */
const methodCache = new Map();
function methodsOf(fqn) {
  if (methodCache.has(fqn)) return methodCache.get(fqn);
  const out = new Map();
  const rec = engine.classes[fqn];
  const chain = [fqn, ...(rec?.chain ?? [])];
  for (const c of chain) {
    const ms = methodIdx.methods[c];
    if (!ms) continue;
    for (const [name, sig] of Object.entries(ms)) if (!out.has(name)) out.set(name, { ...sig, owner: c });
  }
  methodCache.set(fqn, out);
  return out;
}

/**
 * The type a method call on `fqn` evaluates to, plus the type that DECLARES the
 * method. The declaring type is what the histogram is keyed on: `getId` called
 * on `PermanentImpl` and on `Permanent` are the same function to implement.
 */
function lookup(fqn, name) {
  const ms = methodsOf(fqn);
  const hit = ms.get(name);
  if (!hit) return null;
  return { owner: hit.owner, ret: hit.ret };
}

/* -------------------------------------------------------------------------- */
/* Built-in types                                                             */
/* -------------------------------------------------------------------------- */

const COLLECTIONS = new Set([
  'List', 'ArrayList', 'LinkedList', 'Set', 'HashSet', 'LinkedHashSet', 'TreeSet',
  'Collection', 'Iterable', 'Deque', 'ArrayDeque', 'Queue',
]);
const MAPS = new Set(['Map', 'HashMap', 'LinkedHashMap', 'TreeMap', 'EnumMap', 'ConcurrentHashMap']);

const COLLECTION_RET = {
  get: '$E', iterator: 'Iterator<$E>', stream: 'Stream<$E>', size: 'int', isEmpty: 'boolean',
  add: 'boolean', addAll: 'boolean', remove: 'boolean', removeAll: 'boolean', contains: 'boolean',
  containsAll: 'boolean', clear: 'void', forEach: 'void', toArray: 'Object[]', sort: 'void',
  removeIf: 'boolean', retainAll: 'boolean', getFirst: '$E', getLast: '$E', indexOf: 'int',
  set: '$E', addFirst: 'void', addLast: 'void', poll: '$E', peek: '$E', push: 'void', pop: '$E',
  subList: 'List<$E>', equals: 'boolean', hashCode: 'int', toString: 'String',
};
const MAP_RET = {
  get: '$V', put: '$V', containsKey: 'boolean', containsValue: 'boolean', remove: '$V',
  keySet: 'Set<$K>', values: 'Collection<$V>', entrySet: 'Set<Entry>', size: 'int',
  isEmpty: 'boolean', clear: 'void', forEach: 'void', getOrDefault: '$V',
  computeIfAbsent: '$V', putIfAbsent: '$V', merge: '$V', putAll: 'void', compute: '$V',
};
const STREAM_RET = {
  filter: 'Stream<$E>', map: 'Stream<?>', mapToInt: 'IntStream', mapToObj: 'Stream<?>',
  flatMap: 'Stream<?>', collect: '?', count: 'int', anyMatch: 'boolean', allMatch: 'boolean',
  noneMatch: 'boolean', findFirst: 'Optional<$E>', findAny: 'Optional<$E>', forEach: 'void',
  sorted: 'Stream<$E>', distinct: 'Stream<$E>', limit: 'Stream<$E>', skip: 'Stream<$E>',
  toList: 'List<$E>', sum: 'int', max: 'Optional<$E>', min: 'Optional<$E>', boxed: 'Stream<?>',
  peek: 'Stream<$E>', reduce: '?', mapToLong: 'LongStream', average: 'OptionalDouble',
};
const OPTIONAL_RET = {
  get: '$E', isPresent: 'boolean', isEmpty: 'boolean', orElse: '$E', orElseGet: '$E',
  ifPresent: 'void', map: 'Optional<?>', filter: 'Optional<$E>', orElseThrow: '$E',
};
const STRING_RET = {
  equals: 'boolean', equalsIgnoreCase: 'boolean', length: 'int', isEmpty: 'boolean',
  contains: 'boolean', startsWith: 'boolean', endsWith: 'boolean', substring: 'String',
  toLowerCase: 'String', toUpperCase: 'String', replace: 'String', split: 'String[]',
  trim: 'String', concat: 'String', charAt: 'char', indexOf: 'int', hashCode: 'int',
  toString: 'String', format: 'String', join: 'String', valueOf: 'String', repeat: 'String',
  matches: 'boolean', compareTo: 'int', chars: 'IntStream',
};

/** Split `Foo<Bar>` into head and one generic argument. */
function splitGeneric(t) {
  if (!t) return { head: null, arg: null };
  const lt = t.indexOf('<');
  if (lt === -1) return { head: t.replace(/\[\]$/, ''), arg: null };
  return { head: t.slice(0, lt), arg: t.slice(lt + 1, -1) };
}

/**
 * Resolve a builtin receiver. Returns `{ key, ret }` or null when `t` is not a
 * builtin. `key` is the histogram row.
 */
function builtinCall(t, name) {
  const { head, arg } = splitGeneric(t);
  const simple = head?.split('.').pop();
  const sub = (r) => {
    if (!r) return null;
    const [k, v] = (arg ?? '').split(',');
    return r.replace('$E', arg ?? '?').replace('$K', k ?? '?').replace('$V', (v ?? k) ?? '?');
  };
  if (COLLECTIONS.has(simple)) {
    const r = COLLECTION_RET[name];
    return { key: `Collection#${name}`, ret: r ? sub(r) : null };
  }
  if (MAPS.has(simple)) {
    const r = MAP_RET[name];
    return { key: `Map#${name}`, ret: r ? sub(r) : null };
  }
  if (simple === 'Stream' || simple === 'IntStream' || simple === 'LongStream') {
    const r = STREAM_RET[name];
    return { key: `Stream#${name}`, ret: r ? sub(r) : null };
  }
  if (simple === 'Optional' || simple === 'OptionalDouble' || simple === 'OptionalInt') {
    const r = OPTIONAL_RET[name];
    return { key: `Optional#${name}`, ret: r ? sub(r) : null };
  }
  if (simple === 'String' || simple === 'StringBuilder' || simple === 'CharSequence') {
    const r = STRING_RET[name];
    return { key: `String#${name}`, ret: r ? sub(r) : (simple === 'StringBuilder' ? 'StringBuilder' : null) };
  }
  if (simple === 'UUID') {
    return { key: `UUID#${name}`, ret: name === 'equals' ? 'boolean' : name === 'toString' ? 'String' : null };
  }
  if (simple === 'Integer' || simple === 'int' || simple === 'Long' || simple === 'Double') {
    return { key: `Number#${name}`, ret: name === 'equals' ? 'boolean' : name === 'intValue' ? 'int' : null };
  }
  if (simple === 'Boolean' || simple === 'boolean') {
    return { key: `Boolean#${name}`, ret: name === 'booleanValue' ? 'boolean' : null };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Per-card local type environment                                            */
/* -------------------------------------------------------------------------- */

const NOT_A_TYPE = new Set([
  'return', 'if', 'for', 'while', 'switch', 'case', 'new', 'throw', 'else', 'do', 'try',
  'catch', 'finally', 'break', 'continue', 'this', 'super', 'null', 'true', 'false',
  'instanceof', 'assert', 'synchronized', 'default', 'yield', 'var',
]);
const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized',
  'native', 'transient', 'volatile', 'strictfp', 'default',
]);

/** `List<Permanent>` -> resolved with the file's imports where possible. */
function resolveTypeText(text, imports, pkg) {
  const { head, arg } = splitGeneric(text);
  if (!head) return null;
  const resolveOne = (s) => {
    if (!s) return null;
    const bare = s.replace(/\[\]$/, '').trim();
    if (!bare || bare === '?') return null;
    if (bare.includes('.')) return bare;
    if (imports[bare]) return imports[bare];
    if (engine.classes[`${pkg}.${bare}`]) return `${pkg}.${bare}`;
    if (simpleToFqn.has(bare)) return simpleToFqn.get(bare);
    return bare; // builtin or unknown; kept verbatim
  };
  const h = resolveOne(head);
  if (!h) return null;
  if (!arg) return h;
  const a = resolveOne(arg.split(',')[0]);
  return `${h}<${a ?? '?'}>`;
}

/**
 * Collect `name -> type` for the region `[lo, hi)`. Deliberately flat: one
 * environment per card file rather than per method scope. XMage card bodies
 * name their variables the same way everywhere (`game`, `source`, `controller`,
 * `permanent`), so the collision rate is low and the first binding wins.
 */
function collectEnv(toks, lo, hi, imports, pkg) {
  const env = new Map();
  const bind = (name, text) => {
    if (env.has(name)) return;
    const t = resolveTypeText(text, imports, pkg);
    if (t) env.set(name, t);
  };

  for (let i = lo; i < hi; i++) {
    const t = toks[i];
    if (t.t !== 'id' || NOT_A_TYPE.has(t.v) || MODIFIERS.has(t.v)) continue;
    if (toks[i - 1]?.v === '.') continue;

    const rt = readType(toks, i);
    if (!rt) continue;
    const after = toks[rt.end];
    if (after?.t !== 'id' || NOT_A_TYPE.has(after.v)) continue;
    const next = toks[rt.end + 1]?.v;

    // `Type name = ...` / `Type name;` / `Type name, other;` — a declaration.
    if (next === '=' || next === ';' || next === ',') {
      const prev = toks[i - 1]?.v;
      const declStart = !prev || ['{', '}', ';', '(', ')'].includes(prev)
        || (toks[i - 1].t === 'id' && MODIFIERS.has(prev));
      if (declStart) { bind(after.v, rt.text); i = rt.end; }
      continue;
    }
    // `Type name : collection` — enhanced for.
    if (next === ':') { bind(after.v, rt.text); i = rt.end; continue; }
    // `(Type name, Type name)` — parameter list of a method or a catch.
    if (next === ',' || next === ')') { bind(after.v, rt.text); i = rt.end; continue; }
  }
  return env;
}

/* -------------------------------------------------------------------------- */
/* The scan                                                                   */
/* -------------------------------------------------------------------------- */

const files = [];
for (const d of readdirSync(CARDS)) {
  const dir = join(CARDS, d);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.java')) files.push(join(dir, f));
}

const byName = new Map();      // bare method name -> calls   (parity with api-surface.mjs)
const byType = new Map();      // `Type#method`    -> calls
const rowMeta = new Map();     // `Type#method`    -> { role, ret, cards:Set }
let totalCalls = 0;
let resolvedCalls = 0;
let bodies = 0;

function bump(map, k, n = 1) { map.set(k, (map.get(k) ?? 0) + n); }

for (const path of files) {
  const src = readFileSync(path, 'utf8');
  const cardCls = basename(path, '.java');
  let toks;
  try { toks = tokenize(src); } catch { continue; }

  // The region the original script measures: from the first card-local class
  // declaration to the end of the file.
  let start = -1;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t === 'id' && toks[i].v === 'class' && toks[i - 1]?.v !== '.'
      && toks[i + 1]?.t === 'id' && toks[i + 1].v !== cardCls && toks[i + 2]?.v === 'extends') {
      start = i; break;
    }
  }
  if (start === -1) continue;
  bodies++;

  const pkg = readPackage(toks);
  const { single } = readImports(toks);
  const imports = Object.fromEntries(single);
  const env = collectEnv(toks, start, toks.length, imports, pkg);

  // `this` is the card-local class; its supertype is the engine type whose API
  // an unqualified or `this.` call reaches.
  const superSimple = toks[start + 3]?.t === 'id' ? readType(toks, start + 3)?.text : null;
  const selfType = superSimple ? resolveTypeText(superSimple, imports, pkg) : null;

  const seenHere = new Set();

  const headType = (i) => {
    const t = toks[i];
    if (t.t === 'str') return 'String';
    if (t.t === 'num') return 'int';
    if (t.t !== 'id') return null;
    if (t.v === 'this' || t.v === 'super') return selfType;
    if (env.has(t.v)) return env.get(t.v);
    if (imports[t.v]) return imports[t.v];               // static call on an imported class
    if (engine.classes[`${pkg}.${t.v}`]) return `${pkg}.${t.v}`;
    if (simpleToFqn.has(t.v)) return simpleToFqn.get(t.v);
    if (/^[A-Z]/.test(t.v)) return t.v;                   // unknown class, still a receiver
    return null;
  };

  /** Walk `[lo, hi)` as expressions, counting every `.name(` it can type. */
  function scanRange(lo, hi) {
    let i = lo;
    while (i < hi) {
      const t = toks[i];

      if (t.t === 'id' && t.v === 'new') {
        const rt = readType(toks, i + 1);
        if (rt) {
          const ctorType = resolveTypeText(rt.text, imports, pkg);
          let j = rt.end;
          if (toks[j]?.v === '(') { const close = skipBalanced(toks, j, '(', ')'); scanRange(j + 1, close - 1); j = close; }
          if (toks[j]?.v === '{') { const close = skipBalanced(toks, j, '{', '}'); scanRange(j + 1, close - 1); j = close; }
          i = walkChain(ctorType, j, hi);
          continue;
        }
      }

      // Cast: `(Type) expr`
      if (t.v === '(' && toks[i + 1]?.t === 'id' && !NOT_A_TYPE.has(toks[i + 1].v)
        && /^[A-Z]/.test(toks[i + 1].v)) {
        const rt = readType(toks, i + 1);
        if (rt && toks[rt.end]?.v === ')' && (toks[rt.end + 1]?.t === 'id' || toks[rt.end + 1]?.v === '(')) {
          const cast = resolveTypeText(rt.text, imports, pkg);
          let j = rt.end + 1;
          if (toks[j].v === '(') {
            const close = skipBalanced(toks, j, '(', ')');
            scanRange(j + 1, close - 1);
            i = walkChain(cast, close, hi);
            continue;
          }
          // `(Type) name...` — the cast wins over the name's own type.
          const close = j + 1;
          i = walkChain(cast, close, hi);
          continue;
        }
      }

      if ((t.t === 'id' && !NOT_A_TYPE.has(t.v)) || t.t === 'str') {
        if (toks[i - 1]?.v !== '.') {
          const ht = headType(i);
          let j = i + 1;
          // `name(...)` — unqualified call. Not counted (parity with the bare
          // scanner, which only sees `.name(`), but its arguments are scanned.
          if (toks[j]?.v === '(') {
            const close = skipBalanced(toks, j, '(', ')');
            scanRange(j + 1, close - 1);
            const own = selfType ? lookup(selfType, t.v) : null;
            i = walkChain(own ? resolveTypeText(own.ret, imports, pkg) : null, close, hi);
            continue;
          }
          i = walkChain(ht, j, hi);
          continue;
        }
      }
      i++;
    }
  }

  /**
   * `type` is what sits to the left of position `i`. Consume `.name(...)` and
   * `.field` for as long as the chain runs, counting each call.
   */
  function walkChain(type, i, hi) {
    let cur = type;
    while (i < hi) {
      if (toks[i]?.v === '[') { const c = skipBalanced(toks, i, '[', ']'); scanRange(i + 1, c - 1); i = c; cur = null; continue; }
      if (toks[i]?.v !== '.' || toks[i + 1]?.t !== 'id') break;
      const name = toks[i + 1].v;

      if (toks[i + 2]?.v !== '(') {
        // Field access. Types are not tracked through fields; the chain head is
        // lost, which is honest rather than guessed.
        const f = cur ? fieldType(cur, name) : null;
        cur = f;
        i += 2;
        continue;
      }

      totalCalls++;
      bump(byName, name);

      let key = '?';
      let ret = null;
      if (cur) {
        const bi = builtinCall(cur, name);
        if (bi) { key = bi.key; ret = bi.ret; }
        else {
          const { head } = splitGeneric(cur);
          const hit = head ? lookup(head, name) : null;
          if (hit) { key = `${short(hit.owner)}#${name}`; ret = resolveTypeText(hit.ret, imports, pkg); }
          else if (head && engine.classes[head]) key = `${short(head)}#${name}`;
          else key = `?#${name}`;
        }
      } else key = `?#${name}`;

      if (key !== '?' && !key.startsWith('?#')) resolvedCalls++;
      bump(byType, key);
      const meta = rowMeta.get(key) ?? { ret: null, role: null, cards: 0 };
      if (!meta.ret && ret) meta.ret = ret;
      if (!meta.role && cur) meta.role = engine.classes[splitGeneric(cur).head]?.role ?? null;
      rowMeta.set(key, meta);
      if (!seenHere.has(key)) { seenHere.add(key); meta.cards++; }

      const close = skipBalanced(toks, i + 2, '(', ')');
      scanRange(i + 3, close - 1);
      i = close;
      cur = ret;
    }
    return i;
  }

  function fieldType(owner, name) {
    const { head } = splitGeneric(owner);
    const sf = engine.staticFields?.[head];
    if (sf && sf[name]?.type) return resolveTypeText(sf[name].type, imports, pkg);
    return null;
  }

  scanRange(start, toks.length - 1);
}

function short(fqn) {
  if (!fqn) return '?';
  const parts = fqn.split('.');
  const out = [];
  for (let k = parts.length - 1; k >= 0; k--) {
    if (!/^[A-Z]/.test(parts[k])) break;
    out.unshift(parts[k]);
  }
  return out.length ? out.join('.') : parts[parts.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function cumulative(sorted, total) {
  const need = {};
  let cum = 0;
  sorted.forEach(([, n], i) => {
    cum += n;
    for (const m of [50, 80, 90, 95, 99]) if (need[m] === undefined && cum >= (total * m) / 100) need[m] = i + 1;
  });
  return need;
}

const nameSorted = [...byName.entries()].sort((a, b) => b[1] - a[1]);
const typeSorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
const nameTotal = nameSorted.reduce((s, [, n]) => s + n, 0);
const typeTotal = typeSorted.reduce((s, [, n]) => s + n, 0);

const needName = cumulative(nameSorted, nameTotal);
const needType = cumulative(typeSorted, typeTotal);

const unresolved = typeSorted.filter(([k]) => k.startsWith('?#')).reduce((s, [, n]) => s + n, 0);

const out = {
  meta: {
    builtAt: new Date().toISOString(),
    xmageCommit: engine.meta.xmageCommit,
    cardFilesWithLocalClass: bodies,
    totalCalls,
    resolvedCalls,
    unresolvedCalls: unresolved,
    resolvedShare: +(resolvedCalls / totalCalls * 100).toFixed(2),
    distinctByName: nameSorted.length,
    distinctByType: typeSorted.length,
    note: 'Built by scripts/xmage/api-surface-typed.mjs over XMage (MIT), read in place.',
  },
  cumulativeByName: needName,
  cumulativeByType: needType,
  rows: typeSorted.map(([k, n]) => ({
    key: k, calls: n, cards: rowMeta.get(k)?.cards ?? 0,
    ret: rowMeta.get(k)?.ret ?? null, role: rowMeta.get(k)?.role ?? null,
  })),
  byName: nameSorted.map(([k, n]) => ({ name: k, calls: n })),
};

mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, 'xmage-api-surface.json'), JSON.stringify(out));

const pct = (n) => ((n / typeTotal) * 100).toFixed(1) + '%';
console.log('card files with a card-local class : ' + bodies);
console.log('total method calls in those bodies : ' + totalCalls.toLocaleString());
console.log('receiver type RESOLVED             : ' + resolvedCalls.toLocaleString() + '  (' + out.meta.resolvedShare + '%)');
console.log('');
console.log('DISTINCT rows, keyed by NAME       : ' + nameSorted.length);
console.log('DISTINCT rows, keyed by TYPE#NAME  : ' + typeSorted.length);
console.log('');
console.log('rows needed to cover that share of all calls:');
console.log('  share   by NAME   by TYPE#NAME');
for (const m of [50, 80, 90, 95, 99]) {
  console.log('   ' + String(m).padStart(2) + '%   ' + String(needName[m]).padStart(6) + '   ' + String(needType[m]).padStart(12));
}
console.log('');
console.log('top 40 by receiver type:');
let cum = 0;
for (const [k, n] of typeSorted.slice(0, 40)) {
  cum += n;
  console.log('  ' + String(n).padStart(5) + '  ' + pct(n).padStart(6) + '  cum ' + pct(cum).padStart(6) + '  ' + k);
}
console.log('');
console.log('the biggest names that SPLIT across receivers:');
const splits = [];
for (const [name, n] of nameSorted.slice(0, 60)) {
  const owners = typeSorted.filter(([k]) => k.endsWith('#' + name) && !k.startsWith('?#'));
  if (owners.length > 1) splits.push([name, n, owners.length, owners.slice(0, 4)]);
}
for (const [name, n, count, top] of splits.slice(0, 12)) {
  console.log('  .' + name + '() ' + n + ' calls -> ' + count + ' receivers: '
    + top.map(([k, c]) => k.split('#')[0] + ' ' + c).join(', '));
}
