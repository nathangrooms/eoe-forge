/**
 * scripts/xmage/lib/java-types.mjs
 *
 * Local type inference for XMage card-local method bodies, factored out so the
 * TRANSLATOR and the MEASUREMENT agree on what a receiver is.
 *
 * `api-surface-typed.mjs` does the same inference inline. It is deliberately not
 * edited to import this file: it produced the ranking that
 * `docs/engine/RUNTIME-API.md` quotes, and changing the script that produced a
 * published number is how numbers quietly drift. Instead
 * `scripts/xmage/translate-check.mjs` re-derives the histogram THROUGH this
 * module and diffs it against `xmage-api-surface.json`, so the duplication is
 * checked by measurement rather than trusted.
 *
 * What it gives a caller:
 *   resolveKeys(toks, region, imports, pkg, selfType) — a Map from the token
 *   index of a `.name(` call to `{ key, root, ret, owner }`, the same
 *   `Declarer#method` / `RootDeclarer#method` keys the ranking is built on.
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. The clone is read in place; nothing from it
 * is vendored. Comments are dropped by the tokenizer before anything is read,
 * because those lines carry Wizards of the Coast oracle text.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readType, skipBalanced } from '../index-engine-methods.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const DATA = join(REPO, 'scripts/coverage/.data');

export const engine = JSON.parse(readFileSync(join(DATA, 'xmage-engine-index.json'), 'utf8'));
export const methodIdx = JSON.parse(readFileSync(join(DATA, 'xmage-engine-methods.json'), 'utf8'));

/* -------------------------------------------------------------------------- */
/* Simple name -> fully qualified name                                        */
/* -------------------------------------------------------------------------- */

const PREFER = [
  'mage.game.', 'mage.players.', 'mage.abilities.', 'mage.cards.', 'mage.target.',
  'mage.filter.', 'mage.counters.', 'mage.constants.', 'mage.',
];

export const simpleToFqn = new Map();
for (const [simple, list] of Object.entries(engine.bySimple)) {
  if (list.length === 1) { simpleToFqn.set(simple, list[0]); continue; }
  let best = null;
  let bestRank = 1e9;
  for (const fqn of list) {
    const rank = PREFER.findIndex(p => fqn.startsWith(p));
    const r = rank === -1 ? 500 + fqn.length : rank * 100 + fqn.length;
    if (r < bestRank) { bestRank = r; best = fqn; }
  }
  simpleToFqn.set(simple, best);
}

const methodCache = new Map();
function methodsOf(fqn) {
  if (methodCache.has(fqn)) return methodCache.get(fqn);
  const out = new Map();
  const rec = engine.classes[fqn];
  for (const c of [fqn, ...(rec?.chain ?? [])]) {
    const ms = methodIdx.methods[c];
    if (!ms) continue;
    for (const [name, sig] of Object.entries(ms)) if (!out.has(name)) out.set(name, { ...sig, owner: c });
  }
  methodCache.set(fqn, out);
  return out;
}

const rootCache = new Map();
function rootDeclarer(fqn, name) {
  const k = `${fqn}#${name}`;
  if (rootCache.has(k)) return rootCache.get(k);
  const rec = engine.classes[fqn];
  let best = fqn;
  let bestDepth = -1;
  for (const anc of rec?.chain ?? []) {
    if (!methodIdx.methods[anc]?.[name]) continue;
    const d = (engine.classes[anc]?.chain ?? []).length;
    if (bestDepth === -1 || d < bestDepth) { bestDepth = d; best = anc; }
  }
  rootCache.set(k, best);
  return best;
}

function lookup(fqn, name) {
  const hit = methodsOf(fqn).get(name);
  if (!hit) return null;
  return { owner: hit.owner, ret: hit.ret, root: rootDeclarer(hit.owner, name), params: hit.params ?? null };
}

export function short(fqn) {
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
/* java.util                                                                  */
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

export function splitGeneric(t) {
  if (!t) return { head: null, arg: null };
  const lt = t.indexOf('<');
  if (lt === -1) return { head: t.replace(/\[\]$/, ''), arg: null };
  return { head: t.slice(0, lt), arg: t.slice(lt + 1, -1) };
}

export function builtinCall(t, name) {
  const { head, arg } = splitGeneric(t);
  const simple = head?.split('.').pop();
  const sub = r => {
    if (!r) return null;
    const [k, v] = (arg ?? '').split(',');
    return r.replace('$E', arg ?? '?').replace('$K', k ?? '?').replace('$V', (v ?? k) ?? '?');
  };
  if (COLLECTIONS.has(simple)) { const r = COLLECTION_RET[name]; return { key: `Collection#${name}`, ret: r ? sub(r) : null }; }
  if (MAPS.has(simple)) { const r = MAP_RET[name]; return { key: `Map#${name}`, ret: r ? sub(r) : null }; }
  if (simple === 'Stream' || simple === 'IntStream' || simple === 'LongStream') { const r = STREAM_RET[name]; return { key: `Stream#${name}`, ret: r ? sub(r) : null }; }
  if (simple === 'Optional' || simple === 'OptionalDouble' || simple === 'OptionalInt') { const r = OPTIONAL_RET[name]; return { key: `Optional#${name}`, ret: r ? sub(r) : null }; }
  if (simple === 'String' || simple === 'StringBuilder' || simple === 'CharSequence') { const r = STRING_RET[name]; return { key: `String#${name}`, ret: r ? sub(r) : (simple === 'StringBuilder' ? 'StringBuilder' : null) }; }
  if (simple === 'UUID') return { key: `UUID#${name}`, ret: name === 'equals' ? 'boolean' : name === 'toString' ? 'String' : null };
  if (simple === 'Integer' || simple === 'int' || simple === 'Long' || simple === 'Double') return { key: `Number#${name}`, ret: name === 'equals' ? 'boolean' : name === 'intValue' ? 'int' : null };
  if (simple === 'Boolean' || simple === 'boolean') return { key: `Boolean#${name}`, ret: name === 'booleanValue' ? 'boolean' : null };
  return null;
}

/* -------------------------------------------------------------------------- */
/* The environment                                                            */
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

export function resolveTypeText(text, imports, pkg) {
  const { head, arg } = splitGeneric(text);
  if (!head) return null;
  const resolveOne = s => {
    if (!s) return null;
    const bare = s.replace(/\[\]$/, '').trim();
    if (!bare || bare === '?') return null;
    if (bare.includes('.')) return bare;
    if (imports[bare]) return imports[bare];
    if (engine.classes[`${pkg}.${bare}`]) return `${pkg}.${bare}`;
    if (simpleToFqn.has(bare)) return simpleToFqn.get(bare);
    return bare;
  };
  const h = resolveOne(head);
  if (!h) return null;
  if (!arg) return h;
  const a = resolveOne(arg.split(',')[0]);
  return `${h}<${a ?? '?'}>`;
}

/** Flat `name -> fqn` environment over `[lo, hi)`. First binding wins. */
export function collectEnv(toks, lo, hi, imports, pkg) {
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

    if (next === '=' || next === ';' || next === ',') {
      const prev = toks[i - 1]?.v;
      const declStart = !prev || ['{', '}', ';', '(', ')'].includes(prev)
        || (toks[i - 1].t === 'id' && MODIFIERS.has(prev));
      if (declStart) { bind(after.v, rt.text); i = rt.end; }
      continue;
    }
    if (next === ':') { bind(after.v, rt.text); i = rt.end; continue; }
    if (next === ',' || next === ')') { bind(after.v, rt.text); i = rt.end; continue; }
  }
  return env;
}

export function fieldType(owner, name, imports, pkg) {
  const { head } = splitGeneric(owner);
  const consts = engine.enums?.[head];
  if (consts && consts.includes(name)) return head;
  const sf = engine.staticFields?.[head];
  if (sf && sf[name]?.type) return resolveTypeText(sf[name].type, imports, pkg);
  return null;
}

/**
 * Walk `[lo, hi)` and record, for every `.name(` call token index, the
 * `Declarer#method` key, the root key and the return type.
 *
 * This is the SAME walk `api-surface-typed.mjs` performs. It returns a map
 * rather than a histogram so the translator can ask "what is the receiver of
 * the call at this token" while it walks the parse tree.
 */
export function resolveKeys(toks, lo, hi, imports, pkg, selfType) {
  const keys = new Map();   // token index of the '.' -> record
  const heads = new Map();  // token index of an identifier -> its inferred type
  const env = collectEnv(toks, lo, hi, imports, pkg);

  const headType = i => {
    const t = toks[i];
    if (t.t === 'str') return 'String';
    if (t.t === 'num') return 'int';
    if (t.t !== 'id') return null;
    if (t.v === 'this' || t.v === 'super') return selfType;
    if (env.has(t.v)) return env.get(t.v);
    if (imports[t.v]) return imports[t.v];
    if (engine.classes[`${pkg}.${t.v}`]) return `${pkg}.${t.v}`;
    if (simpleToFqn.has(t.v)) return simpleToFqn.get(t.v);
    if (/^[A-Z]/.test(t.v)) return t.v;
    return null;
  };

  function scanRange(a, b) {
    let i = a;
    while (i < b) {
      const t = toks[i];

      if (t.t === 'id' && t.v === 'new') {
        const rt = readType(toks, i + 1);
        if (rt) {
          const ctorType = resolveTypeText(rt.text, imports, pkg);
          let j = rt.end;
          if (toks[j]?.v === '(') { const c = skipBalanced(toks, j, '(', ')'); scanRange(j + 1, c - 1); j = c; }
          if (toks[j]?.v === '{') { const c = skipBalanced(toks, j, '{', '}'); scanRange(j + 1, c - 1); j = c; }
          i = walkChain(ctorType, j, b);
          continue;
        }
      }

      if (t.v === '(' && toks[i + 1]?.t === 'id' && !NOT_A_TYPE.has(toks[i + 1].v) && /^[A-Z]/.test(toks[i + 1].v)) {
        const rt = readType(toks, i + 1);
        if (rt && toks[rt.end]?.v === ')' && (toks[rt.end + 1]?.t === 'id' || toks[rt.end + 1]?.v === '(')) {
          const cast = resolveTypeText(rt.text, imports, pkg);
          const j = rt.end + 1;
          if (toks[j].v === '(') {
            const c = skipBalanced(toks, j, '(', ')');
            scanRange(j + 1, c - 1);
            i = walkChain(cast, c, b);
            continue;
          }
          i = walkChain(cast, j + 1, b);
          continue;
        }
      }

      if (t.v === '(') {
        const c = skipBalanced(toks, i, '(', ')');
        scanRange(i + 1, c - 1);
        i = walkChain(null, c, b);
        continue;
      }

      if ((t.t === 'id' && !NOT_A_TYPE.has(t.v)) || t.t === 'str') {
        if (toks[i - 1]?.v !== '.') {
          const ht = headType(i);
          if (ht) heads.set(i, ht);
          const j = i + 1;
          if (toks[j]?.v === '(') {
            const c = skipBalanced(toks, j, '(', ')');
            scanRange(j + 1, c - 1);
            const own = selfType ? lookup(selfType, t.v) : null;
            if (own) {
              keys.set(i, {
                at: i, name: t.v, unqualified: true,
                key: `${short(own.owner)}#${t.v}`,
                root: `${short(own.root)}#${t.v}`,
                ret: resolveTypeText(own.ret, imports, pkg),
              });
            } else {
              keys.set(i, { at: i, name: t.v, unqualified: true, key: `?#${t.v}`, root: `?#${t.v}`, ret: null });
            }
            i = walkChain(own ? resolveTypeText(own.ret, imports, pkg) : null, c, b);
            continue;
          }
          i = walkChain(ht, j, b);
          continue;
        }
      }
      i++;
    }
  }

  function walkChain(type, i, b) {
    let cur = type;
    while (i < b) {
      if (toks[i]?.v === '[') { const c = skipBalanced(toks, i, '[', ']'); scanRange(i + 1, c - 1); i = c; cur = null; continue; }
      if (toks[i]?.v !== '.' || toks[i + 1]?.t !== 'id') break;
      const name = toks[i + 1].v;

      if (toks[i + 2]?.v !== '(') {
        cur = cur ? fieldType(cur, name, imports, pkg) : null;
        i += 2;
        continue;
      }

      let key = `?#${name}`;
      let root = key;
      let ret = null;
      if (cur) {
        const bi = builtinCall(cur, name);
        if (bi) { key = bi.key; root = bi.key; ret = bi.ret; }
        else {
          const { head } = splitGeneric(cur);
          const hit = head ? lookup(head, name) : null;
          if (hit) {
            key = `${short(hit.owner)}#${name}`;
            root = `${short(hit.root)}#${name}`;
            ret = resolveTypeText(hit.ret, imports, pkg);
          } else if (head && engine.classes[head]) { key = `${short(head)}#${name}`; root = key; }
        }
      }
      keys.set(i + 1, { at: i + 1, name, unqualified: false, key, root, ret, recv: cur });

      const close = skipBalanced(toks, i + 2, '(', ')');
      scanRange(i + 3, close - 1);
      i = close;
      cur = ret;
    }
    return i;
  }

  scanRange(lo, hi);
  return { keys, heads, env };
}

export { lookup, NOT_A_TYPE, MODIFIERS };
