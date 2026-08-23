/**
 * scripts/xmage/index-engine-methods.mjs
 *
 * `index-engine.mjs` records CONSTRUCTORS. This records METHODS: for every type
 * XMage's engine declares, the name, return type and arity of each method it
 * declares itself. That is the table `api-surface-typed.mjs` needs to answer
 * "what does `game.getPlayer(id)` evaluate to", which is the only way a call
 * histogram can be keyed by RECEIVER TYPE instead of by bare method name.
 *
 * Output: scripts/coverage/.data/xmage-engine-methods.json
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. The clone is read in place and nothing from
 * it is vendored here. Comments are dropped by the tokenizer before anything is
 * recorded, because those lines carry Wizards of the Coast rules text.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, readImports, readPackage } from './lib/java-parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const OUT_DIR = join(REPO, 'scripts/coverage/.data');

export const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';

const ENGINE_DIR = join(XMAGE_ROOT, 'Mage/src/main/java');

const MODIFIERS = new Set([
  'public', 'private', 'protected', 'static', 'final', 'abstract',
  'synchronized', 'native', 'transient', 'volatile', 'strictfp', 'default',
]);

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

/**
 * Read a type reference starting at `i`. Returns `{ text, end }` where `text`
 * keeps one level of generic argument (`List<Permanent>`), because the element
 * type is what makes `.get(0)` resolvable.
 */
export function readType(toks, i) {
  if (toks[i]?.t !== 'id') return null;
  let out = toks[i].v;
  let j = i + 1;
  while (toks[j]?.v === '.' && toks[j + 1]?.t === 'id') { out += '.' + toks[j + 1].v; j += 2; }
  if (toks[j]?.v === '<') {
    let depth = 0;
    const start = j;
    let closed = false;
    for (; j < toks.length; j++) {
      const v = toks[j].v;
      if (v === '<') depth++;
      else if (v === '>') { depth--; if (depth === 0) { j++; closed = true; break; } }
      else if (v === '>>') { depth -= 2; if (depth <= 0) { j++; closed = true; break; } }
      else if (v === ';' || v === '{' || v === ')') break;
    }
    if (!closed) return { text: out, end: start };
    const inner = toks.slice(start + 1, j - 1).map((t) => t.v).join('');
    out += '<' + inner + '>';
  }
  while (toks[j]?.v === '[' && toks[j + 1]?.v === ']') { out += '[]'; j += 2; }
  return { text: out, end: j };
}

/** Skip a balanced group, `i` pointing at the opener. Returns index past closer. */
export function skipBalanced(toks, i, open, close) {
  if (toks[i]?.v !== open) return i;
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    if (toks[j].v === open) depth++;
    else if (toks[j].v === close) { depth--; if (depth === 0) return j + 1; }
  }
  return toks.length;
}

/**
 * Every method declared directly in each type in this token stream, keyed by the
 * type's simple (possibly `Outer.Inner`) name.
 */
export function scanMethods(toks) {
  const byType = {};
  const scopes = [];
  let depth = 0;
  let pendingType = null;

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];

    if (t.t === 'punc' && t.v === '{') {
      depth++;
      if (pendingType) { scopes.push({ name: pendingType, bodyDepth: depth }); pendingType = null; }
      continue;
    }
    if (t.t === 'punc' && t.v === '}') {
      while (scopes.length && scopes[scopes.length - 1].bodyDepth >= depth) scopes.pop();
      depth--;
      continue;
    }
    if (t.t !== 'id') continue;

    if (['class', 'interface', 'enum', 'record'].includes(t.v)
      && toks[i - 1]?.v !== '.' && toks[i + 1]?.t === 'id') {
      const outer = scopes.map((s) => s.name).join('.');
      const name = toks[i + 1].v;
      pendingType = outer ? `${outer}.${name}` : name;
      let g = 0;
      for (let j = i + 2; j < toks.length; j++) {
        const v = toks[j].v;
        if (v === '<') g++;
        else if (v === '>') g--;
        else if (v === '{' && g <= 0) { i = j - 1; break; }
        else if (v === ';' && g <= 0) { pendingType = null; i = j; break; }
      }
      continue;
    }

    if (!scopes.length) continue;
    const owner = scopes[scopes.length - 1];
    if (depth !== owner.bodyDepth) continue;

    const prev = toks[i - 1];
    const atMemberStart = !prev || ['{', '}', ';', ')', '>'].includes(prev.v)
      || (prev.t === 'id' && MODIFIERS.has(prev.v));
    if (!atMemberStart) continue;
    if (MODIFIERS.has(t.v)) continue;

    let j = i;
    if (toks[j].v === '<') j = skipBalanced(toks, j, '<', '>');

    const rt = readType(toks, j);
    if (!rt) continue;
    if (toks[rt.end]?.t !== 'id' || toks[rt.end + 1]?.v !== '(') continue;
    const mname = toks[rt.end].v;
    const argOpen = rt.end + 1;
    const argClose = skipBalanced(toks, argOpen, '(', ')');
    let arity = 0;
    let d = 0;
    let sawToken = false;
    for (let k = argOpen + 1; k < argClose - 1; k++) {
      const v = toks[k].v;
      if (v === '(' || v === '<' || v === '[') d++;
      else if (v === ')' || v === '>' || v === ']') d--;
      else if (v === ',' && d === 0) arity++;
      sawToken = true;
    }
    if (sawToken) arity++;

    (byType[owner.name] ??= {});
    byType[owner.name][mname] ??= { ret: rt.text, arity };
    i = argClose - 1;
  }
  return byType;
}

export function buildMethodIndex() {
  const files = walkJava(ENGINE_DIR);
  const methods = {};

  for (const path of files) {
    const src = readFileSync(path, 'utf8');
    let toks;
    try { toks = tokenize(src); } catch { continue; }
    const pkg = readPackage(toks);
    const byType = scanMethods(toks);
    for (const [local, ms] of Object.entries(byType)) {
      methods[`${pkg}.${local}`] = ms;
    }
  }
  return { methods, files: files.length };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const t0 = Date.now();
  const idx = buildMethodIndex();
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, 'xmage-engine-methods.json');
  writeFileSync(out, JSON.stringify(idx));
  const total = Object.values(idx.methods).reduce((s, m) => s + Object.keys(m).length, 0);
  console.log(JSON.stringify({
    wrote: out, ms: Date.now() - t0,
    engineFiles: idx.files,
    typesWithMethods: Object.keys(idx.methods).length,
    declaredMethods: total,
    gameMethods: Object.keys(idx.methods['mage.game.Game'] ?? {}).length,
    playerMethods: Object.keys(idx.methods['mage.players.Player'] ?? {}).length,
    permanentMethods: Object.keys(idx.methods['mage.game.permanent.Permanent'] ?? {}).length,
  }, null, 1));
}
