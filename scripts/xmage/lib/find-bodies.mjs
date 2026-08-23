/**
 * scripts/xmage/lib/find-bodies.mjs
 *
 * Where a card-local `apply(Game, Ability)` body IS, what its class knows, and
 * what its fields are actually set to.
 *
 * This lives in one file because two things need it and they must not disagree:
 * `translate-bodies.mjs`, which emits, and `translate-check.mjs`, which
 * measures what was emitted. When the two carried their own copies, a fix to
 * the generator left the checker reporting the numbers of a build that no
 * longer existed — the checker said 936 bodies while the generator had written
 * 758. A verification that can drift from the thing it verifies is not a
 * verification.
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. The clone is read in place; nothing from it
 * is vendored.
 */

import { JavaParser } from './java-parse.mjs';
import { skipBalanced, readType } from '../index-engine-methods.mjs';

/**
 * Every card-local class in a file: the ones declared alongside the card class
 * rather than the card class itself. `{ name, superName, open, close }` where
 * open/close are the token indices of its braces.
 */
export function localClasses(toks, cardCls) {
  const out = [];
  for (let i = 0; i < toks.length - 3; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== 'class' || toks[i - 1]?.v === '.') continue;
    if (toks[i + 1]?.t !== 'id' || toks[i + 1].v === cardCls) continue;
    if (toks[i + 2]?.v !== 'extends') continue;
    const sup = readType(toks, i + 3);
    if (!sup) continue;
    let j = sup.end;
    while (j < toks.length && toks[j].v !== '{') {
      if (toks[j].v === '(') { j = skipBalanced(toks, j, '(', ')'); continue; }
      j++;
    }
    if (toks[j]?.v !== '{') continue;
    const close = skipBalanced(toks, j, '{', '}');
    out.push({ name: toks[i + 1].v, superName: sup.text, open: j, close: close - 1 });
    i = close - 1;
  }
  return out;
}

/**
 * Field names declared directly in a class body, with the declared type and any
 * initialiser expression. A body cannot use a field silently: either its value
 * is known here or the body blocks on it.
 */
export function classFields(toks, open, close) {
  const fields = new Map();   // name -> { type, init }
  let depth = 0;
  for (let i = open; i < close; i++) {
    const v = toks[i].v;
    if (v === '{') { depth++; continue; }
    if (v === '}') { depth--; continue; }
    if (depth !== 1) continue;
    if (toks[i].t !== 'id') continue;
    const rt = readType(toks, i);
    if (!rt) continue;
    const after = toks[rt.end];
    if (after?.t !== 'id') continue;
    const next = toks[rt.end + 1]?.v;
    if (next !== '=' && next !== ';' && next !== ',') continue;

    let init = null;
    if (next === '=') {
      // `private static final FilterCard filter = new FilterCreatureCard();`
      let end = rt.end + 2;
      let d = 0;
      while (end < close) {
        const t = toks[end].v;
        if (t === '(' || t === '[' || t === '{') d++;
        else if (t === ')' || t === ']' || t === '}') d--;
        else if (t === ';' && d === 0) break;
        end++;
      }
      const slice = toks.slice(rt.end + 2, end);
      slice.push({ t: 'eof', v: '', p: 0, line: 0 });
      try { init = new JavaParser(slice).parseExpression(); } catch { init = null; }
      i = end;
    } else {
      i = rt.end;
    }
    if (!fields.has(after.v)) fields.set(after.v, { type: rt.text, init });
  }
  return fields;
}

/**
 * What a card-local effect's fields are actually SET TO, by reading the one
 * place the card constructs it.
 *
 * XMage writes `class FooEffect extends OneShotEffect { private final
 * FilterPermanent filter; FooEffect(FilterPermanent filter) { this.filter =
 * filter; } }` and then, in the card, `new FooEffect(StaticFilters.FILTER_LAND)`.
 * The field IS a constant; it just takes two hops to see it. Following those
 * hops is ordinary constant propagation over the tree, and it is the single
 * biggest thing standing between a body and a translation: 328 bodies stopped
 * on an unknown `filter` before this existed.
 *
 * It refuses to guess in the two cases where guessing would be wrong: more than
 * one construction site with DIFFERENT arguments (the field is genuinely not a
 * constant), and a constructor that computes rather than assigns.
 */
/**
 * Calls made ON a field after it is declared, which are part of its value.
 *
 * XMage builds a filter in two steps and the second step is where the meaning
 * is:
 *
 *     private static final FilterPermanent filter = new FilterPermanent();
 *     static { filter.add(SubType.FOREST.getPredicate()); }
 *
 * Reading only the declaration gives "any permanent", so Llanowar Druid untaps
 * EVERY permanent instead of every Forest, and Crimson Honor Guard counts every
 * permanent instead of every commander. Both were emitting quietly wrong bodies
 * until the sample read caught them.
 *
 * A static initialiser sits at brace depth two inside the class, which is why
 * `classFields` does not see it. This walks the class body for
 * `<field>.<method>(...)` and returns the calls in order, so the inlined value
 * becomes `new FilterPermanent().add(...)` — the whole construction rather than
 * its first line.
 */
export function fieldMutations(toks, cls, name) {
  const calls = [];
  for (let i = cls.open; i < cls.close; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== name) continue;
    if (toks[i - 1]?.v === '.') continue;
    if (toks[i + 1]?.v !== '.' || toks[i + 2]?.t !== 'id' || toks[i + 3]?.v !== '(') continue;
    const close = skipBalanced(toks, i + 3, '(', ')');
    const slice = toks.slice(i, close);
    slice.push({ t: 'eof', v: '', p: 0, line: 0 });
    try {
      const node = new JavaParser(slice).parseExpression();
      if (node.k === 'call' && node.obj?.k === 'name' && node.obj.id === name) calls.push(node);
    } catch { /* unreadable: treated as no mutation, and the field then blocks */ }
    i = close - 1;
  }
  return calls;
}

/** Rebuild `x.a().b()` as a tree, with `base` at the bottom of the chain. */
export function withMutations(base, calls) {
  let node = base;
  for (const call of calls) node = { k: 'call', obj: node, name: call.name, args: call.args };
  return node;
}

export function inlineConstructorArgs(toks, cls, fields) {
  const bound = new Map();   // field name -> expression node

  // Declaration initialisers are already the value, PLUS whatever a static
  // initialiser then does to them.
  for (const [name, f] of fields) {
    if (!f.init) continue;
    bound.set(name, withMutations(f.init, fieldMutations(toks, cls, name)));
  }

  // `this.field = param;` inside a constructor whose parameter list we can read.
  const assignments = [];    // { field, paramIndex }
  let params = null;
  for (let i = cls.open; i < cls.close; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== cls.name) continue;
    if (toks[i + 1]?.v !== '(') continue;
    const pClose = skipBalanced(toks, i + 1, '(', ')');
    if (toks[pClose]?.v !== '{') continue;

    const ps = [];
    let k = i + 2;
    while (k < pClose - 1) {
      if (toks[k].v === 'final') { k++; continue; }
      const rt = readType(toks, k);
      if (!rt || toks[rt.end]?.t !== 'id') break;
      ps.push({ type: rt.text, name: toks[rt.end].v });
      k = rt.end + 1;
      if (toks[k]?.v === ',') k++; else break;
    }
    // The copy constructor takes the effect itself. It carries no new values.
    if (ps.length === 1 && ps[0].type === cls.name) { i = skipBalanced(toks, pClose, '{', '}') - 1; continue; }
    const bClose = skipBalanced(toks, pClose, '{', '}');

    for (let j = pClose; j < bClose; j++) {
      if (toks[j].v !== 'this' || toks[j + 1]?.v !== '.' || toks[j + 2]?.t !== 'id') continue;
      if (toks[j + 3]?.v !== '=') continue;
      if (toks[j + 4]?.t !== 'id' || toks[j + 5]?.v !== ';') continue;   // only a bare parameter
      const idx = ps.findIndex(p => p.name === toks[j + 4].v);
      if (idx === -1) continue;
      assignments.push({ field: toks[j + 2].v, paramIndex: idx });
    }
    params = ps;
    i = bClose - 1;
  }

  if (!assignments.length) return bound;

  // Every `new <cls>(...)` in the file. The card constructs its own effect, so
  // the site is in the same file and no cross-file resolution is needed.
  const sites = [];
  for (let i = 0; i < toks.length - 2; i++) {
    if (toks[i].v !== 'new' || toks[i + 1]?.v !== cls.name || toks[i + 2]?.v !== '(') continue;
    const close = skipBalanced(toks, i + 2, '(', ')');
    const slice = toks.slice(i + 1, close);
    slice.push({ t: 'eof', v: '', p: 0, line: 0 });
    try {
      const p = new JavaParser([{ t: 'id', v: 'new', p: 0, line: 0 }, ...slice]);
      const node = p.parseExpression();
      if (node.k === 'new') sites.push(node.args);
    } catch { /* an unparsable site means no binding, which blocks rather than guesses */ }
    i = close - 1;
  }
  if (sites.length !== 1) return bound;   // ambiguous or absent: do not guess

  for (const a of assignments) {
    const arg = sites[0][a.paramIndex];
    if (arg && !bound.has(a.field)) bound.set(a.field, arg);
  }
  return bound;
}

/**
 * `apply(Game g, Ability a)` inside a class body. Returns the parameter names,
 * the token index of the opening brace and of the closing one.
 */
export function applyMethods(toks, open, close) {
  const out = [];
  for (let i = open; i < close; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== 'apply') continue;
    if (toks[i + 1]?.v !== '(') continue;
    const parenClose = skipBalanced(toks, i + 1, '(', ')');
    if (toks[parenClose]?.v !== '{') continue;
    const params = [];
    let k = i + 2;
    while (k < parenClose - 1) {
      if (toks[k].v === 'final') { k++; continue; }
      const rt = readType(toks, k);
      if (!rt || toks[rt.end]?.t !== 'id') break;
      params.push({ type: rt.text, name: toks[rt.end].v });
      k = rt.end + 1;
      if (toks[k]?.v === ',') k++;
      else break;
    }
    if (params.length !== 2) continue;
    if (params[0].type !== 'Game' || params[1].type !== 'Ability') continue;
    const bodyClose = skipBalanced(toks, parenClose, '{', '}');
    // `sigOpen` is the '(' of the signature: the parameters have to be inside
    // the region the type environment is built from, or `game` and `source`
    // have no type and every call on them reads as unresolved.
    out.push({ params, sigOpen: i + 1, open: parenClose, close: bodyClose - 1 });
    i = bodyClose - 1;
  }
  return out;
}
