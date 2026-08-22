#!/usr/bin/env node
/**
 * ADVERSARIAL AUDIT: of the cards the XMage port says it LOWERS, how many can
 * the engine actually RUN?
 *
 * Written to refute `scripts/xmage/port-progress.mjs`, not to agree with it.
 * That script counts a card when every ability of every face turns into a
 * `dsl.ts` `Ability`. It says so plainly, and it is a real number, but it is a
 * number about SHAPE. This script asks the question the app is judged on: given
 * that shape, would `src/lib/game/**` do anything with it?
 *
 * ## The dispatch is modelled, not guessed
 *
 * Each `Ability` kind reaches the engine by a different door, so each is tested
 * at its own door and the doors are read out of the engine rather than listed
 * here:
 *
 *   spell / activated / mana   `runEffect` in `to-actions.ts`. Its `switch` has
 *                              a `default:` that THROWS, so an effect member
 *                              with no case is a crash, not a no-op. The case
 *                              labels are parsed out of the file at run time.
 *   triggered                  the same effect test, AND `unrunnableReason`
 *                              from `trigger-bridge.ts`, which is the engine's
 *                              own answer to "could this trigger ever fire".
 *                              Imported, not reimplemented.
 *   replacement                `intrinsicReplacements` in `intrinsic.ts` reads
 *                              exactly two results, and only on a self
 *                              replacement of `enters`. Anything else is
 *                              silently ignored by the engine.
 *   static                     `toEffectPart` in `statics.ts` turns one
 *                              `Modification` into one layer part, or `null`.
 *   keyword                    `keywords.ts`, which reads the printed keyword.
 *
 * ## Three verdicts, kept apart on purpose
 *
 *   LOWERS      what port-progress.mjs counts. Reproduced here so the other two
 *               share its denominator and the drop between them is readable.
 *   EXECUTABLE  nothing on the card would make the engine throw or silently
 *               drop an ability. The bar for "does not break", not for "plays".
 *   RUNS        executable, and every ability would actually do something: no
 *               `{do:'manual'}` and no `{do:'may'}` (both are handled, both
 *               execute nothing, both push a line of text for a human), and
 *               every triggered ability passes `unrunnableReason`.
 *
 * RUNS is the honest automation number for this pipeline and it is much smaller
 * than LOWERS. Quoting LOWERS as automation would be the third overstatement on
 * this project and it would have the same shape as the first two.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored. Forge is GPL-3.0 and was not fetched,
 * read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/coverage/xmage-runnable.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from '../xmage/build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';
import { unrunnableReasons } from '../../src/lib/game/abilities/trigger-bridge.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TO_ACTIONS = path.join(REPO, 'src', 'lib', 'game', 'abilities', 'to-actions.ts');

/* ------------------------------------------------------------------ *
 * What the reducer implements, read from the reducer
 * ------------------------------------------------------------------ */

/**
 * `runEffect` is one `switch (effect.do)`. Its `case` labels are the members
 * that do not fall through to the throwing `default`. Parsed from the file so
 * this audit cannot claim coverage the reducer does not have.
 */
function implementedEffects() {
  const src = readFileSync(TO_ACTIONS, 'utf8');
  const start = src.indexOf('function runEffect(');
  if (start < 0) throw new Error('to-actions.ts: runEffect not found');
  const sw = src.indexOf('switch (effect.do)', start);
  if (sw < 0) throw new Error('to-actions.ts: runEffect switch not found');
  let depth = 0;
  let end = src.length;
  for (let i = src.indexOf('{', sw); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const out = new Set();
  for (const m of src.slice(sw, end).matchAll(/case '([a-z0-9-]+)'/g)) out.add(m[1]);
  if (out.size < 10) throw new Error('to-actions.ts: parsed too few cases, the shape changed');
  return out;
}

/** Every effect member a card reaches, nested ones included. */
function walkEffects(effects, seen = []) {
  for (const e of effects ?? []) {
    if (!e || typeof e !== 'object') continue;
    seen.push(e.do);
    if (e.do === 'if') { walkEffects(e.then, seen); walkEffects(e.else, seen); }
    else if (['for-each', 'repeat', 'may', 'unless-pays', 'additional'].includes(e.do)) walkEffects(e.effects, seen);
    else if (e.do === 'choose-mode') for (const m of e.modes ?? []) walkEffects(m.effects, seen);
  }
  return seen;
}

const IMPLEMENTED = implementedEffects();
/** Handled by `runEffect`, executes nothing, defers a line of text to a human. */
const INERT = new Set(['manual', 'may']);
/** The only two replacement results `intrinsic.ts` bridges into the engine. */
const BRIDGED_REPLACEMENTS = new Set(['enters-tapped', 'enters-with-counters']);

/**
 * One ability, at its own door. `{ throws, dropped, inert }`.
 *   throws   an effect member `runEffect` has no case for
 *   dropped  the engine has no path for this ability at all, so it is silent
 *   inert    it reaches the engine and deliberately does nothing by itself
 */
function judge(ability) {
  const out = { throws: [], dropped: null, inert: [] };
  if (!ability) { out.dropped = 'lowering produced no Ability'; return out; }

  switch (ability.kind) {
    case 'spell': case 'activated': case 'mana': case 'triggered': {
      const dos = walkEffects(ability.effects);
      out.throws = [...new Set(dos)].filter((d) => !IMPLEMENTED.has(d));
      out.inert = [...new Set(dos)].filter((d) => INERT.has(d));
      if (dos.length === 0) out.dropped = `${ability.kind} ability with no effects`;
      if (ability.kind === 'triggered') {
        const reasons = unrunnableReasons(ability);
        if (reasons.length) out.inert.push(...reasons.map((r) => `trigger: ${r}`));
      }
      return out;
    }
    case 'replacement': {
      const result = ability.result;
      if (ability.event?.on !== 'enters' || !ability.selfReplacement) {
        out.dropped = `replacement on ${JSON.stringify(ability.event?.on ?? '?')} — intrinsic.ts reads only self replacements of enters`;
      } else if (!BRIDGED_REPLACEMENTS.has(result?.do)) {
        out.dropped = `replacement result ${JSON.stringify(result?.do ?? '?')} — intrinsic.ts bridges only ${[...BRIDGED_REPLACEMENTS].join(' and ')}`;
      } else if (result.do === 'enters-with-counters' && typeof result.count !== 'number') {
        out.dropped = 'enters-with-counters with a non-numeric count — intrinsic.ts skips it';
      }
      return out;
    }
    case 'static': {
      if (!ability.modifications || ability.modifications.length === 0) {
        out.dropped = 'static ability with no modifications — statics.ts has nothing to place';
      }
      return out;
    }
    case 'keyword':
      return out;
    default:
      out.dropped = `unknown ability kind ${JSON.stringify(ability.kind)}`;
      return out;
  }
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const { records } = await loadRecords();

let lowers = 0, vacuous = 0, executable = 0, runs = 0;
const throwTally = new Map();
const dropTally = new Map();
const inertTally = new Map();
const kindTally = new Map();

for (const record of records) {
  const lowered = lowerCard(record);
  if (!lowered.ok) continue;
  if (lowered.vacuous) { vacuous += 1; continue; }
  lowers += 1;

  const verdicts = lowered.abilities.map((entry) => judge(entry.ability));
  for (const entry of lowered.abilities) kindTally.set(entry.ability?.kind ?? 'none', (kindTally.get(entry.ability?.kind ?? 'none') ?? 0) + 1);

  const throws = [...new Set(verdicts.flatMap((v) => v.throws))];
  const drops = [...new Set(verdicts.map((v) => v.dropped).filter(Boolean))];
  const inert = [...new Set(verdicts.flatMap((v) => v.inert))];

  for (const t of throws) throwTally.set(t, (throwTally.get(t) ?? 0) + 1);
  if (throws.length || drops.length) {
    for (const d of drops) dropTally.set(d, (dropTally.get(d) ?? 0) + 1);
    continue;
  }
  executable += 1;
  if (inert.length) { for (const i of inert) inertTally.set(i, (inertTally.get(i) ?? 0) + 1); continue; }
  runs += 1;
}

const N = records.length;
const pct = (n) => `${((100 * n) / N).toFixed(2)}%`;
const top = (m, n = 20) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log(`denominator, XMage card files with a record       ${N}`);
console.log('');
console.log(`LOWERS      every ability of every face lowers    ${lowers}  ${pct(lowers)}`);
console.log(`EXECUTABLE  nothing throws, nothing is dropped    ${executable}  ${pct(executable)}`);
console.log(`RUNS        executable and every ability acts     ${runs}  ${pct(runs)}`);
console.log(`vacuous, no abilities, excluded from all three    ${vacuous}`);
console.log('');
console.log('cards whose lowering would make runEffect throw:');
for (const [k, v] of top(throwTally)) console.log(`   ${String(v).padStart(6)}  ${k}`);
if (throwTally.size === 0) console.log('   none');
console.log('');
console.log('cards with an ability the engine has no path for:');
for (const [k, v] of top(dropTally)) console.log(`   ${String(v).padStart(6)}  ${k}`);
if (dropTally.size === 0) console.log('   none');
console.log('');
console.log('cards that reach the engine but do nothing, by reason:');
for (const [k, v] of top(inertTally, 25)) console.log(`   ${String(v).padStart(6)}  ${k}`);
console.log('');
console.log('abilities produced, by kind:');
for (const [k, v] of top(kindTally)) console.log(`   ${String(v).padStart(6)}  ${k}`);

writeFileSync(
  path.join(REPO, 'scripts', 'coverage', '.data', 'xmage-runnable.json'),
  JSON.stringify(
    {
      meta: {
        script: 'scripts/coverage/xmage-runnable.mjs',
        measuredAt: new Date().toISOString(),
        denominator: N,
        denominatorMeaning: 'XMage card files with an extracted record',
        implementedRead: 'src/lib/game/abilities/to-actions.ts runEffect switch, read at run time',
      },
      lowers, executable, runs, vacuous,
      wouldThrow: Object.fromEntries(throwTally),
      dropped: Object.fromEntries(dropTally),
      inert: Object.fromEntries(inertTally),
      abilityKinds: Object.fromEntries(kindTally),
    },
    null,
    1,
  ),
);
