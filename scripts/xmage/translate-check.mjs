/**
 * scripts/xmage/translate-check.mjs
 *
 * Verify the translation the same way the extraction verified itself: by
 * measuring it, not by looking at it and forming an impression.
 *
 * Three checks, and each one produces a number rather than a verdict.
 *
 * ## 1. The shared type inference agrees with the published ranking
 *
 * `lib/java-types.mjs` re-implements the receiver-type inference that
 * `api-surface-typed.mjs` does inline, because the translator needs to ask the
 * question one node at a time rather than once over a token stream. Two copies
 * of anything drift, so this rebuilds the whole by-root histogram THROUGH the
 * shared module and diffs it against `xmage-api-surface.json`, which is the
 * file `docs/engine/RUNTIME-API.md` quotes.
 *
 * One difference is deliberate and is reported as such: `java-types.mjs` breaks
 * a tie between a top-level type and a NESTED type of the same simple name in
 * favour of the top-level one. `Library` is the case that matters —
 * `mage.players.Library` is what `player.getLibrary()` returns and
 * `mage.game.ZoneChangeInfo.Library` is a helper no card touches. The counts do
 * not move; the class NAME on two of the biggest open rows does.
 *
 * ## 2. No call is silently dropped
 *
 * The translator does not translate an argument it is not going to pass on —
 * XMage's `Game`, `Ability` and display strings all get dropped, the last for
 * licence reasons. That is right, and it is also exactly how a translator hides
 * work. So for every EMITTED body this compares the calls the walk reached
 * against every call the Java body CONTAINS, and ranks what fell in the gap.
 *
 * ## 3. A readable sample
 *
 * Writes N Java bodies beside their TypeScript, deterministically chosen, so a
 * person can read them in pairs and count the disagreements. The disagreement
 * rate in the report is a HUMAN number; this script only prepares the pairs.
 *
 * Run: node scripts/xmage/translate-check.mjs [--sample 30]
 *
 * ## Licence
 * XMage is MIT, `Copyright (c) 2010 betasteward@gmail.com`,
 * https://github.com/magefree/mage. Read in place; nothing vendored. The
 * sample file this writes is a working artefact under `scratch/`, which is not
 * part of the repository's source.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, readImports, readPackage, JavaParser } from './lib/java-parse.mjs';
import { skipBalanced, readType } from './index-engine-methods.mjs';
import { resolveKeys, resolveTypeText } from './lib/java-types.mjs';
import { translateBody } from './lib/translate.mjs';
// The SAME finder the generator uses, imported rather than copied: a checker
// with its own copy silently measured a build that no longer existed.
import {
  applyMethods,
  classFields,
  inlineConstructorArgs,
  localClasses,
} from './lib/find-bodies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'scripts/coverage/.data');
const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const CARDS = join(XMAGE_ROOT, 'Mage.Sets/src/mage/cards');

const argv = process.argv.slice(2);
const SAMPLE = argv.includes('--sample') ? Number(argv[argv.indexOf('--sample') + 1]) : 30;

/* -------------------------------------------------------------------------- */
/* Walk everything once                                                       */
/* -------------------------------------------------------------------------- */

const files = [];
for (const d of readdirSync(CARDS)) {
  const dir = join(CARDS, d);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.java')) files.push(join(dir, f));
}
files.sort();

/** Check 1: the whole by-root histogram, rebuilt through the shared module. */
const mineByRoot = new Map();
let mineTotal = 0;

/** Check 2: calls a body contains vs calls the translation reached. */
const dropped = new Map();
let emittedBodies = 0;
let containedCalls = 0;
let reachedCalls = 0;

/** Check 3: the pairs a person reads. */
const pairs = [];

for (const path of files) {
  const cardCls = basename(path, '.java');
  let src;
  let toks;
  try { src = readFileSync(path, 'utf8'); toks = tokenize(src); } catch { continue; }

  const classes = localClasses(toks, cardCls);
  if (!classes.length) continue;

  const pkg = readPackage(toks);
  const imports = Object.fromEntries(readImports(toks).single);

  // --- check 1: the same region api-surface-typed.mjs measures
  const first = classes[0].open;
  let start = -1;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t === 'id' && toks[i].v === 'class' && toks[i - 1]?.v !== '.'
      && toks[i + 1]?.t === 'id' && toks[i + 1].v !== cardCls && toks[i + 2]?.v === 'extends') { start = i; break; }
  }
  if (start !== -1) {
    const superSimple = toks[start + 3]?.t === 'id' ? readType(toks, start + 3)?.text : null;
    const selfType = superSimple ? resolveTypeText(superSimple, imports, pkg) : null;
    const { keys } = resolveKeys(toks, start, toks.length - 1, imports, pkg, selfType);
    for (const rec of keys.values()) {
      if (rec.unqualified) continue;   // parity: the bare scanner only sees `.name(`
      mineTotal++;
      mineByRoot.set(rec.root, (mineByRoot.get(rec.root) ?? 0) + 1);
    }
  }

  // --- checks 2 and 3
  for (const cls of classes) {
    const methods = applyMethods(toks, cls.open, cls.close);
    if (!methods.length) continue;
    const fields = classFields(toks, cls.open, cls.close);
    const fieldValues = inlineConstructorArgs(toks, cls, fields);
    const selfType = resolveTypeText(cls.superName, imports, pkg);

    for (const m of methods) {
      let stmts;
      try {
        const slice = toks.slice(m.open + 1, m.close);
        slice.push({ t: 'eof', v: '', p: 0, line: 0 });
        stmts = new JavaParser(slice).parseBlockStatements(false);
      } catch { continue; }

      const result = translateBody({
        stmts, params: m.params, imports, pkg, selfType,
        gameVar: m.params[0].name, sourceVar: m.params[1].name,
        fields, fieldValues, toks, lo: m.sigOpen, hi: m.close,
      });
      if (!result.ok) continue;
      emittedBodies++;

      // Every call the Java body CONTAINS, by the same keying.
      const contained = [];
      const { keys } = resolveKeys(toks, m.sigOpen, m.close, imports, pkg, selfType);
      // ROOT keys on both sides. The translator keys on the root declarer,
      // because that is what one function in our API corresponds to, and
      // comparing a root against a declarer would report every inherited method
      // as dropped.
      for (const rec of keys.values()) if (!rec.unqualified) contained.push(rec.root);

      containedCalls += contained.length;
      reachedCalls += result.visited.length;
      // `reached` can EXCEED `contained`: a field inlined from the card's own
      // `new FooEffect(...)` brings calls with it that are not inside the apply
      // body at all. Those are extra translation, not missing translation.

      // Multiset difference: what the body has that the walk never reached.
      const seen = new Map();
      for (const k of result.visited) seen.set(k, (seen.get(k) ?? 0) + 1);
      for (const k of contained) {
        const n = seen.get(k) ?? 0;
        if (n > 0) { seen.set(k, n - 1); continue; }
        dropped.set(k, (dropped.get(k) ?? 0) + 1);
      }

      pairs.push({
        card: cardCls,
        cls: cls.name,
        java: sliceSource(src, toks, m.open, m.close),
        ts: result.ts,
      });
    }
  }
}

/** The original Java text of a token range, comments and all removed by tokenize. */
function sliceSource(src, toks, open, close) {
  return src.slice(toks[open].p, toks[close].p + 1);
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

const published = JSON.parse(readFileSync(join(DATA, 'xmage-api-surface.json'), 'utf8'));
const theirs = new Map(published.workOrder.map(r => [r.key, r.calls]));

let sameRows = 0;
let movedRows = 0;
const moved = [];
for (const [key, n] of mineByRoot) {
  const t = theirs.get(key);
  if (t === n) { sameRows++; continue; }
  movedRows++;
  moved.push({ key, mine: n, published: t ?? 0, delta: n - (t ?? 0) });
}
for (const [key, n] of theirs) if (!mineByRoot.has(key)) moved.push({ key, mine: 0, published: n, delta: -n });
moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

const droppedSorted = [...dropped.entries()].sort((a, b) => b[1] - a[1]);
const droppedTotal = droppedSorted.reduce((s, [, n]) => s + n, 0);

/*
 * The sample is drawn ONLY from bodies that survived the generator's typecheck
 * phase and are actually in `bodies.generated.ts`. Reading a body that was
 * dropped would verify something nothing runs, which is the shape of mistake
 * this project keeps making.
 */
const shipped = new Set(
  [...readFileSync(join(REPO, 'src/lib/game/xmage/bodies.generated.ts'), 'utf8')
    .matchAll(/^  "(.+)": \{$/gm)].map(m => m[1])
);
const shippedPairs = pairs.filter(p => shipped.has(`${p.card}::${p.cls}`));

// Deterministic: every Nth pair, so re-running picks the same ones.
const step = Math.max(1, Math.floor(shippedPairs.length / SAMPLE));
const chosen = [];
for (let i = 0; i < shippedPairs.length && chosen.length < SAMPLE; i += step) chosen.push(shippedPairs[i]);

mkdirSync(join(REPO, 'scratch/xmage'), { recursive: true });
const sampleText = chosen.map((p, i) => [
  `======================================================================`,
  `SAMPLE ${i + 1}/${chosen.length}   ${p.card} :: ${p.cls}`,
  `======================================================================`,
  `--- XMage Java (read in place, MIT, betasteward@gmail.com) ---`,
  p.java,
  ``,
  `--- translated TypeScript ---`,
  p.ts,
  ``,
].join('\n')).join('\n');
writeFileSync(join(REPO, 'scratch/xmage/translation-sample.txt'), sampleText);

/* -------------------------------------------------------------------------- */
/* Check 4: how much of what ships actually does something                    */
/* -------------------------------------------------------------------------- */

/*
 * A card-local class that overrides `apply` and returns a bare `true` is a real
 * XMage body and translates perfectly, and it is also worth nothing: the class
 * is an `AsThoughEffect` or a `ContinuousEffect` whose behaviour lives in a
 * different method entirely. Counting those inside the headline would inflate
 * it, so they are counted apart.
 */
const generated = readFileSync(join(REPO, 'src/lib/game/xmage/bodies.generated.ts'), 'utf8');
const trivial = shippedPairs.filter(p => /^\s*return (true|false);\s*$/.test(p.ts)).length;
const substantive = shippedPairs.length - trivial;

/* -------------------------------------------------------------------------- */
/* Check 5: no XMage wording reached the generated file                       */
/* -------------------------------------------------------------------------- */

/*
 * Measured rather than asserted. Every string literal in the generated bodies
 * is read back out and anything that looks like WORDING is reported. The
 * translator refuses a literal with a space or over 24 characters, so this
 * should be empty; if it is not, the rule has a hole and the number says so.
 */
const bodySection = generated.slice(generated.indexOf('export const TRANSLATED_BODIES'));
const literals = new Map();
// Scanned character by character rather than by regular expression: the pattern
// for "a double quoted string with escapes" needs enough backslashes that it is
// easier to get wrong than to read.
for (let i = 0; i < bodySection.length; i++) {
  if (bodySection[i] !== '"') continue;
  let text = '';
  let j = i + 1;
  for (; j < bodySection.length && bodySection[j] !== '"'; j++) {
    if (bodySection[j] === '\\') { text += bodySection[j + 1] ?? ''; j++; continue; }
    text += bodySection[j];
  }
  literals.set(text, (literals.get(text) ?? 0) + 1);
  i = j;
}
// The record's own fields are ours: `Card::EffectClass`, a base class name and
// a path into the clone.
const ours = /^(Mage\.Sets\/|[A-Za-z0-9_$]+(::[A-Za-z0-9_$]+)?$)/;
const wording = [...literals.keys()].filter(k => !ours.test(k) && (/\s/.test(k) || k.length > 24));

const out = {
  meta: { builtAt: new Date().toISOString(), checker: 'scripts/xmage/translate-check.mjs' },
  inference: {
    callsThroughSharedModule: mineTotal,
    callsInPublishedRanking: published.meta.totalCalls,
    rowsIdentical: sameRows,
    rowsThatMoved: movedRows,
    biggestMoves: moved.slice(0, 12),
  },
  droppedArguments: {
    emittedBodies,
    callsContained: containedCalls,
    callsReached: reachedCalls,
    callsDropped: droppedTotal,
    shareDropped: +((droppedTotal / containedCalls) * 100).toFixed(2),
    ranked: droppedSorted.slice(0, 25).map(([key, n]) => ({ key, calls: n })),
  },
  shipped: {
    bodies: shippedPairs.length,
    trivial,
    substantive,
    note: 'trivial = the whole translated body is `return true;` or `return false;`',
  },
  displayStrings: {
    distinctLiteralsInBodies: literals.size,
    literalsThatLookLikeWording: wording.length,
    examples: wording.slice(0, 10),
  },
  sample: { size: chosen.length, drawnFrom: shippedPairs.length, file: 'scratch/xmage/translation-sample.txt' },
};
writeFileSync(join(DATA, 'xmage-translation-check.json'), JSON.stringify(out, null, 1));

console.log('CHECK 1 — the shared inference against the published ranking');
console.log('  calls through lib/java-types.mjs : ' + mineTotal.toLocaleString());
console.log('  calls in xmage-api-surface.json  : ' + published.meta.totalCalls.toLocaleString());
console.log('  rows with an identical count     : ' + sameRows.toLocaleString());
console.log('  rows that moved                  : ' + movedRows.toLocaleString());
console.log('  biggest moves:');
for (const m of moved.slice(0, 8)) {
  console.log('    ' + String(m.delta > 0 ? '+' + m.delta : m.delta).padStart(7) + '  '
    + m.key.padEnd(44) + ' mine ' + String(m.mine).padStart(5) + '  published ' + String(m.published).padStart(5));
}
console.log('');
console.log('CHECK 2 — calls inside arguments the translation does not pass on');
console.log('  bodies that translate            : ' + emittedBodies.toLocaleString()
  + '   (phase one, before the generator drops the ones tsc rejects)');
console.log('  calls those bodies contain       : ' + containedCalls.toLocaleString());
console.log('  calls the translation reached    : ' + reachedCalls.toLocaleString());
console.log('  calls dropped with an argument   : ' + droppedTotal.toLocaleString()
  + '  (' + out.droppedArguments.shareDropped + '%)');
console.log('  what was dropped, biggest first:');
for (const r of droppedSorted.slice(0, 12)) {
  console.log('    ' + String(r[1]).padStart(5) + '  ' + r[0]);
}
console.log('');
console.log('CHECK 4 — what the shipped bodies actually contain');
console.log('  bodies in bodies.generated.ts    : ' + shippedPairs.length);
console.log('  whose whole body is return true/false : ' + trivial);
console.log('  substantive                      : ' + substantive);
console.log('');
console.log('CHECK 5 — XMage wording in the generated file');
console.log('  distinct string literals         : ' + literals.size);
console.log('  literals that look like wording  : ' + wording.length
  + (wording.length ? '   <- ' + JSON.stringify(wording.slice(0, 5)) : ''));
console.log('');
console.log('CHECK 3 — ' + chosen.length + ' pairs, drawn from the ' + shippedPairs.length + ' bodies that SHIP, written to scratch/xmage/translation-sample.txt');
console.log('  Read them. The disagreement rate is a number a person produces, not this script.');
