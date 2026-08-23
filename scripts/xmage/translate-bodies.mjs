/**
 * scripts/xmage/translate-bodies.mjs
 *
 * Translate XMage's card-local `apply(Game, Ability)` bodies into TypeScript
 * that calls `src/lib/game/xmage/`, by machine, from the parse tree.
 *
 * ## What it reads
 *
 * The 7,931 card files that declare their own Java class, found the same way
 * `api-surface-typed.mjs` finds them so the two agree on the denominator. Of
 * those, 5,965 declare `apply(Game game, Ability source)` on a card-local
 * class, which is the method that RUNS when the card resolves and the one that
 * maps exactly onto our `XmageBody = (game, source) => boolean`.
 *
 * ## What it writes
 *
 *   src/lib/game/xmage/bodies.generated.ts   the translated bodies
 *   scripts/coverage/.data/xmage-translation.json   every blocker, ranked
 *
 * GENERATED CODE IS GENERATED. `bodies.generated.ts` carries a header saying
 * so. Editing it by hand is a bug that comes back on the next run; the fix for
 * a wrong body is a fix in `lib/translate.mjs`.
 *
 * ## Two phases, because a body that does not typecheck is not a translation
 *
 * Phase one emits every body that has a complete mapping. Phase two runs `tsc`
 * over the emitted file alone, maps each error back to the body it came from,
 * and re-emits without those bodies, recording them as blocked with the
 * TypeScript error code. Both phases are deterministic, so re-running the
 * generator reproduces the same file. `--no-typecheck` skips phase two and is
 * for inspecting what phase one produced.
 *
 * Run:
 *   node scripts/xmage/translate-bodies.mjs
 *   node scripts/xmage/translate-bodies.mjs --census      (report only, no emit)
 *   node scripts/xmage/translate-bodies.mjs --card WrathOfGod
 *
 * ## Licence
 * Behaviour ported from **XMage**, MIT licensed,
 * `Copyright (c) 2010 betasteward@gmail.com`, https://github.com/magefree/mage.
 * The clone is read in place; nothing from it is vendored. XMage's display
 * strings are never copied: those carry Wizards of the Coast rules text.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tokenize, readImports, readPackage, JavaParser } from './lib/java-parse.mjs';
import { skipBalanced, readType } from './index-engine-methods.mjs';
import { resolveTypeText, engine } from './lib/java-types.mjs';
import { translateBody } from './lib/translate.mjs';
import {
  applyMethods,
  classFields,
  inlineConstructorArgs,
  localClasses,
} from './lib/find-bodies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'scripts/coverage/.data');
const OUT_TS = join(REPO, 'src/lib/game/xmage/bodies.generated.ts');
/**
 * `--card` scans one file, so everything it produces describes one file.
 * Sending it to scratch keeps a debugging run from leaving the shipped file
 * holding one body and the published report reading `withLocalClass: 1`.
 */
const ONE_TS = join(REPO, 'scratch/xmage/one-card.generated.ts');

const XMAGE_ROOT =
  process.env.XMAGE_ROOT ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const CARDS = join(XMAGE_ROOT, 'Mage.Sets/src/mage/cards');

const argv = process.argv.slice(2);
const CENSUS = argv.includes('--census');
const NO_TYPECHECK = argv.includes('--no-typecheck') || CENSUS;
const ONE = argv.includes('--card') ? argv[argv.indexOf('--card') + 1] : null;
const TARGET = ONE ? ONE_TS : OUT_TS;
if (ONE) mkdirSync(dirname(ONE_TS), { recursive: true });

/* -------------------------------------------------------------------------- */
/* The scan                                                                   */
/* -------------------------------------------------------------------------- */

const files = [];
for (const d of readdirSync(CARDS)) {
  const dir = join(CARDS, d);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir)) if (f.endsWith('.java')) files.push(join(dir, f));
}
files.sort();

const blockedCount = new Map();   // "kind:detail" -> bodies blocked
const blockedCards = new Map();   // "kind:detail" -> distinct card files
const stats = {
  cardFiles: files.length,
  withLocalClass: 0,
  withApply: 0,
  applyBodies: 0,
  emittedBodies: 0,
  emittedCards: 0,
  blockedBodies: 0,
  parseFailures: 0,
  callsInEmitted: 0,
  /** Bodies kept, but with something lost. See `degradations` for what. */
  degradedBodies: 0,
};

/** What was lost in a body that still emitted. Reported, never folded away. */
const degradations = new Map();

const emitted = [];   // { card, cls, superName, path, ts }

function note(kind, detail, card) {
  const k = `${kind}:${detail}`;
  blockedCount.set(k, (blockedCount.get(k) ?? 0) + 1);
  let set = blockedCards.get(k);
  if (!set) { set = new Set(); blockedCards.set(k, set); }
  set.add(card);
}

for (const path of files) {
  const cardCls = basename(path, '.java');
  if (ONE && cardCls !== ONE) continue;
  let toks;
  try { toks = tokenize(readFileSync(path, 'utf8')); } catch { stats.parseFailures++; continue; }

  const classes = localClasses(toks, cardCls);
  if (!classes.length) continue;
  stats.withLocalClass++;

  const pkg = readPackage(toks);
  const { single } = readImports(toks);
  const imports = Object.fromEntries(single);

  let fileHadApply = false;
  let fileEmitted = false;

  for (const cls of classes) {
    const methods = applyMethods(toks, cls.open, cls.close);
    if (!methods.length) continue;
    fileHadApply = true;
    const fields = classFields(toks, cls.open, cls.close);
    const fieldValues = inlineConstructorArgs(toks, cls, fields);
    const selfType = resolveTypeText(cls.superName, imports, pkg);

    for (const m of methods) {
      stats.applyBodies++;

      let stmts;
      try {
        const slice = toks.slice(m.open + 1, m.close);
        slice.push({ t: 'eof', v: '', p: 0, line: 0 });
        const parser = new JavaParser(slice);
        stmts = parser.parseBlockStatements(false);
      } catch (e) {
        stats.blockedBodies++;
        note('parse', String(e.message).slice(0, 40), cardCls);
        continue;
      }

      const result = translateBody({
        stmts,
        params: m.params,
        imports,
        pkg,
        selfType,
        gameVar: m.params[0].name,
        sourceVar: m.params[1].name,
        fields,
        fieldValues,
        toks,
        lo: m.sigOpen,
        hi: m.close,
      });

      if (!result.ok) {
        stats.blockedBodies++;
        for (const b of result.blocked) note(b.kind, b.detail, cardCls);
        continue;
      }

      stats.emittedBodies++;
      stats.callsInEmitted += result.calls;
      if (result.degraded.length) {
        stats.degradedBodies++;
        for (const d of result.degraded) degradations.set(d, (degradations.get(d) ?? 0) + 1);
      }
      fileEmitted = true;
      emitted.push({
        card: cardCls,
        cls: cls.name,
        superName: cls.superName,
        path: path.slice(XMAGE_ROOT.length + 1).replace(/\\/g, '/'),
        ts: result.ts,
      });
    }
  }
  if (fileHadApply) stats.withApply++;
  if (fileEmitted) stats.emittedCards++;
}

/* -------------------------------------------------------------------------- */
/* Emit                                                                       */
/* -------------------------------------------------------------------------- */

const HEADER = `/**
 * DeckMatrix — XMage card-local effect bodies, TRANSLATED BY MACHINE.
 *
 * !! GENERATED FILE. DO NOT EDIT. !!
 * Source of truth: scripts/xmage/translate-bodies.mjs and
 * scripts/xmage/lib/translate.mjs. A hand edit here is lost on the next run,
 * and a wrong body is fixed in the translator, never here.
 *
 * Regenerate:  node scripts/xmage/translate-bodies.mjs
 * Report:      scripts/coverage/.data/xmage-translation.json
 *
 * Each entry is one XMage card-local class whose \`apply(Game, Ability)\` method
 * translated completely. A body with ONE unmapped call, constructor, constant or
 * statement is not in this file at all: it is counted as blocked on that thing
 * by name, so the next tranche of API work is chosen by evidence rather than by
 * taste. Half a card resolving would be worse than no card resolving.
 *
 * Ported from **XMage**, MIT licensed, \`Copyright (c) 2010 betasteward@gmail.com\`,
 * https://github.com/magefree/mage. The clone is read in place and nothing from
 * it is vendored. XMage's display strings are NOT copied — those carry Wizards
 * of the Coast rules text, which is not XMage's to license. Where our API takes
 * a prompt the translator passes an empty string and the caller supplies wording
 * from Scryfall.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { XGame } from './objects.ts';
import type { XAbility } from './targets.ts';
import type { XmageBody } from './index.ts';
import { COLOR_CHOICES, CounterType, makeCards, makeChoice, makeToken } from './objects.ts';
import {
  CardType,
  Predicates,
  StaticFilters,
  SubType,
  SuperType,
  anotherPredicate,
  cardTypePredicate,
  controlledByPredicate,
  makeFilter,
  namePredicate,
  subTypePredicate,
  superTypePredicate,
  ownedByPredicate,
  tappedPredicate,
} from './filters.ts';
import { CardUtil, fixedTarget, makeTarget } from './targets.ts';

/** One translated body, with where in XMage it came from. */
export interface TranslatedBody {
  /** The XMage card class the body was read out of. */
  card: string;
  /** The card-local effect class that declared \`apply\`. */
  effect: string;
  /** What that class extends, which says when the body runs. */
  base: string;
  /** Path inside the XMage clone. Read in place; nothing vendored. */
  source: string;
  /**
   * True when the whole body is a bare return of true or false.
   *
   * These are real overrides and they translate perfectly, and they are worth
   * nothing on their own: the class is an AsThoughEffect or a
   * ContinuousEffect whose behaviour lives in a different method. Half of
   * what is in this file is one of these, so the flag is on the record rather
   * than in a document, and no caller can mistake one for behaviour by
   * accident.
   */
  trivial: boolean;
  run: XmageBody;
}
`;

function emitFile(list) {
  const parts = [HEADER, '\nexport const TRANSLATED_BODIES: Record<string, TranslatedBody> = {\n'];
  for (const b of list) {
    // Keyed `Card::EffectClass`. An effect class name alone is not unique
    // across 32,168 files, and a duplicate key silently overwrites a body.
    parts.push(`  ${JSON.stringify(`${b.card}::${b.cls}`)}: {\n`);
    parts.push(`    card: ${JSON.stringify(b.card)},\n`);
    parts.push(`    effect: ${JSON.stringify(b.cls)},\n`);
    parts.push(`    base: ${JSON.stringify(b.superName)},\n`);
    parts.push(`    source: ${JSON.stringify(b.path)},\n`);
    parts.push(`    trivial: ${isTrivial(b.ts)},\n`);
    parts.push(`    run: (game: XGame, source: XAbility): boolean => {\n`);
    parts.push(b.ts ? b.ts + '\n' : '');
    parts.push(`      return true;\n`);
    parts.push(`    },\n`);
    parts.push(`  },\n`);
  }
  parts.push('};\n\n');
  parts.push(`/**
 * How many bodies this file carries, and how many of them do anything. Both
 * read off the object rather than typed, so neither can drift from the file.
 */
export function translatedBodyCount(): { total: number; substantive: number } {
  const all = Object.values(TRANSLATED_BODIES);
  return { total: all.length, substantive: all.filter(b => !b.trivial).length };
}
`);
  return parts.join('');
}

/**
 * A body whose whole content is a bare return of true or false.
 *
 * Half of what translates is one of these: a required override on an
 * `AsThoughEffect` or a `ContinuousEffect` whose real behaviour lives in
 * another method. They are faithful translations and they do nothing, so the
 * record carries the flag and the report counts them apart from the rest.
 */
function isTrivial(ts) {
  return /^\s*return (true|false);\s*$/.test(ts ?? '');
}

/** Which body each line of the emitted file belongs to. */
function lineIndex(list) {
  const text = emitFile(list);
  const lines = text.split('\n');
  const owner = new Array(lines.length).fill(null);
  let cur = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^  "(.+)": \{$/.exec(lines[i]);
    if (m) { cur = n++; }
    owner[i] = cur;
  }
  return { text, owner };
}

if (CENSUS) {
  report();
} else {
  let list = emitted;
  let dropped = [];

  if (!NO_TYPECHECK) {
    const first = lineIndex(list);
    writeFileSync(TARGET, first.text);   // phase one, overwritten below
    const errors = typecheckErrors();
    const bad = new Set();
    for (const e of errors) {
      const owner = first.owner[e.line - 1];
      if (owner !== null && owner !== undefined) bad.add(owner);
      else bad.add(-1);
    }
    if (bad.has(-1)) {
      console.error('tsc reported an error outside any body. The generated preamble is wrong, not a card.');
      for (const e of errors.slice(0, 5)) console.error('  line ' + e.line + ' ' + e.code + ' ' + e.msg);
    }
    dropped = [...bad].filter(i => i >= 0).map(i => list[i]);
    for (const e of errors) {
      const owner = first.owner[e.line - 1];
      if (owner === null || owner === undefined) continue;
      note('typecheck', e.code, list[owner].card);
    }
    const badSet = new Set(dropped);
    list = list.filter(b => !badSet.has(b));
    stats.emittedBodies = list.length;
    stats.emittedCards = new Set(list.map(b => b.card)).size;
    stats.blockedBodies += dropped.length;
    stats.typecheckDropped = dropped.length;
  }

  // Same reason: one card must never overwrite the generated file with one body.
  writeFileSync(TARGET, emitFile(list));
  report(list);
}

/* -------------------------------------------------------------------------- */
/* Phase two: tsc over the emitted file alone                                 */
/* -------------------------------------------------------------------------- */

function typecheckErrors() {
  const tmp = join(REPO, 'scratch/xmage-typecheck');
  mkdirSync(tmp, { recursive: true });
  const cfg = join(tmp, 'tsconfig.json');
  writeFileSync(cfg, JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
      strict: true, noEmit: true, skipLibCheck: true,
      allowImportingTsExtensions: true, types: [],
    },
    files: [OUT_TS.replace(/\\/g, '/')],
  }, null, 1));

  let out = '';
  try {
    out = execFileSync(process.execPath,
      [join(REPO, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', cfg],
      { encoding: 'utf8', cwd: REPO, maxBuffer: 1 << 28 });
  } catch (e) {
    out = String(e.stdout ?? '') + String(e.stderr ?? '');
  }
  rmSync(tmp, { recursive: true, force: true });

  const errors = [];
  const re = /bodies\.generated\.ts\((\d+),\d+\): error (TS\d+): (.*)/g;
  let m;
  while ((m = re.exec(out))) errors.push({ line: +m[1], code: m[2], msg: m[3] });
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function report(list = emitted) {
  const ranked = [...blockedCount.entries()]
    .map(([k, n]) => {
      const i = k.indexOf(':');
      const cards = blockedCards.get(k);
      return {
        kind: k.slice(0, i), detail: k.slice(i + 1), bodies: n, cards: cards.size,
        example: [...cards].sort()[0],
      };
    })
    .sort((a, b) => b.bodies - a.bodies);

  const byKind = new Map();
  for (const r of ranked) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.bodies);

  const out = {
    meta: {
      builtAt: new Date().toISOString(),
      xmageCommit: engine.meta.xmageCommit,
      generator: 'scripts/xmage/translate-bodies.mjs',
      note: 'Blocked counts are FIRST blocker per body: a body stops at the first thing it cannot map, so these are the things to implement next, not a total of everything missing.',
    },
    stats,
    degradations: [...degradations.entries()].map(([kind, count]) => ({ kind, count })),
    blockedByKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([kind, bodies]) => ({ kind, bodies })),
    blocked: ranked,
    emittedCards: [...new Set(list.map(b => b.card))].sort(),
  };
  mkdirSync(DATA, { recursive: true });
  // `--card` scans one file, so its numbers describe one file. Writing them to
  // the shared report would leave the published figures reading
  // `withLocalClass: 1` until somebody noticed.
  if (!ONE) writeFileSync(join(DATA, 'xmage-translation.json'), JSON.stringify(out));

  console.log('card files scanned                 : ' + stats.cardFiles.toLocaleString());
  console.log('with a card-local class            : ' + stats.withLocalClass.toLocaleString());
  console.log('with apply(Game, Ability)          : ' + stats.withApply.toLocaleString());
  console.log('apply bodies found                 : ' + stats.applyBodies.toLocaleString());
  console.log('');
  console.log('BODIES EMITTED                     : ' + stats.emittedBodies.toLocaleString()
    + '  (' + (stats.emittedBodies / stats.applyBodies * 100).toFixed(1) + '% of apply bodies)');
  console.log('CARD FILES THAT EMIT SOMETHING     : ' + stats.emittedCards.toLocaleString()
    + '  (' + (stats.emittedCards / stats.withLocalClass * 100).toFixed(1) + '% of the 7,931)');
  console.log('bodies blocked                     : ' + stats.blockedBodies.toLocaleString());
  if (stats.typecheckDropped !== undefined) {
    console.log('  of which dropped by tsc          : ' + stats.typecheckDropped.toLocaleString());
  }
  console.log('bodies kept but degraded            : ' + stats.degradedBodies.toLocaleString());
  for (const [kind, count] of degradations) {
    console.log('    ' + String(count).padStart(5) + '  ' + kind + ' (occurrences, not bodies)');
  }
  console.log('');
  console.log('BLOCKED BY KIND:');
  for (const [kind, bodies] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(bodies).padStart(5) + '  ' + kind);
  }
  console.log('');
  console.log('THE WORK ORDER. What blocks the most bodies, first blocker only:');
  for (const r of ranked.slice(0, 45)) {
    console.log('  ' + String(r.bodies).padStart(5) + '  ' + String(r.cards).padStart(5) + ' cards  '
      + (r.kind + ' ').padEnd(20) + r.detail);
  }
}
