/**
 * INDEPENDENT re-derivation of the three ability-layer metrics.
 *
 * Written to refute `scripts/ability-layer-coverage.mjs`, not to agree with it.
 * It shares no code with that script: its own file reader, its own pool filter,
 * its own engine-consumer table (each entry re-checked by grepping the tree),
 * and its own card verdict. It imports only the real compiler and the real
 * engine predicates, because those are the things under test.
 *
 * Where it deliberately differs, and why:
 *
 *  1. THE ALL-CLAUSES BAR IS BINDING HERE. The other script computes the card
 *     verdict from the ability list alone and states that a paragraph its
 *     mapping cannot place is "counted rather than assumed away". Counted, but
 *     not counted AGAINST the card: an unplaceable paragraph does not stop a
 *     card being AUTOMATED there. This script fails the card. A paragraph that
 *     cannot be traced to a running ability is a paragraph nobody can show runs.
 *
 *  2. A CONSUMED PARAGRAPH THAT PRODUCED NO ABILITY IS A DROP. `classify` marks
 *     a span consumed and returns `classified.abilities`, which the compiler
 *     spreads. An empty array there satisfies `assertClausesAccounted` (the span
 *     is covered) while producing nothing. Measured, not assumed.
 *
 *  3. AN ENGINE KEYWORD IS ONLY LIVE IF SCRYFALL ALSO PRINTED IT. `keywords.ts`
 *     reads `card.keywords`, never the compiled ability, so a keyword the
 *     compiler read out of oracle text and Scryfall did not list is applied by
 *     nothing. Checked per card.
 *
 * Usage: node --experimental-strip-types scripts/verify-ability-coverage.mjs
 * Local file only. No Supabase, no network at run time, no model.
 */

import { createReadStream, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeBehaviour } from '../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'verify-ability-coverage.json');

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * 1. The pool, built from first principles
 * ------------------------------------------------------------------ */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Cached bulk file only; this script never downloads.`);
  process.exit(1);
}

const all = [];
for await (const card of rows(SRC)) all.push(card);

// Is the file one row per oracle id, as an "oracle cards" bulk file claims?
const oracleIds = new Set();
let missingOracleId = 0;
let duplicateOracleId = 0;
for (const c of all) {
  if (!c.oracle_id) { missingOracleId++; continue; }
  if (oracleIds.has(c.oracle_id)) duplicateOracleId++;
  oracleIds.add(c.oracle_id);
}

// My own exclusion sets, written from what the fields mean rather than copied.
const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const drop = new Map();
const pool = [];
for (const c of all) {
  if (NOT_A_CARD.has(c.layout)) { bump(drop, `layout ${c.layout}`); continue; }
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) { bump(drop, `set_type ${c.set_type}`); continue; }
  if (NOT_A_NORMAL_GAME.has(c.layout)) { bump(drop, `layout ${c.layout}`); continue; }
  if (c.digital) { bump(drop, 'digital only'); continue; }
  if (!(c.games ?? []).includes('paper')) { bump(drop, 'no paper printing'); continue; }
  pool.push(c);
}

const poolOracleIds = new Set(pool.map(c => c.oracle_id));

/* ------------------------------------------------------------------ *
 * 2. Does a live consumer run this ability?
 *
 * Every branch below was re-checked with grep in this session. The greps and
 * what they returned:
 *
 *   activatedAbilitiesOf   src/lib/game/abilities/card-abilities.ts:108 only.
 *                          DEFINED AND NEVER CALLED. -> dead
 *   ownedTriggersOf        trigger-bridge.ts:291 (def), triggers.ts:97 (import),
 *                          triggers.ts:468 (call). -> live, gated by
 *                          abilityEngineOwns, which is all-or-nothing per card.
 *   scanStatics            statics.ts:379 continuousEffectsFor -> statics.ts:402
 *                          layeredState -> characteristics.ts:88 -> combat.ts,
 *                          sba.ts. -> live for layer modifications.
 *   hasRestriction         statics.ts:441 (def); callers combat.ts:123, 141, 161
 *                          for 'cant-attack' and 'cant-block' ONLY. Every other
 *                          restriction rule is collected and never read. -> dead
 *   costAdjustmentFor      statics.ts:498 (def). No caller outside its own
 *                          tests. -> dead
 *   intrinsicReplacements  intrinsic.ts:78; handles enters-tapped and
 *                          enters-with-counters with a plain positive number.
 *                          Everything else falls through. -> dead
 *   keywords               keywords.ts reads card.keywords, NOT the compiled
 *                          ability. ENGINE_KEYWORDS + protection are enforced.
 *   spell / mana           no consumer reads a compiled spell or mana ability.
 * ------------------------------------------------------------------ */

const RESTRICTIONS_COMBAT_READS = new Set(['cant-attack', 'cant-block']);

/*
 * FOUND BY THIS REVIEW — the layer-6 grant of a keyword nothing enforces.
 *
 * `ability-layer-coverage.mjs` corrected itself in tranche 3 for two kinds of
 * static modification that `scanStatics` collects and nothing reads. It stopped
 * one level too early. A `{layer:'ability', grant:[...]}` modification DOES
 * reach a live reader: `toEffectPart` maps it, `layers.ts` applies it, and
 * `characteristics.ts:240 keywordsIn` returns the granted string. So the
 * classifier scores it `run`.
 *
 * What it does not ask is whether the granted keyword MEANS anything.
 * `hasKeywordIn` is only consulted by `combat.ts` for the fifteen names in
 * `ENGINE_KEYWORDS`. A creature granted "wither", "persist", "horsemanship" or
 * "living weapon" gets the word added to a list, renders a badge, and plays
 * exactly as it did before.
 *
 * That is the same player-visible outcome as a PRINTED advisory keyword, which
 * the same classifier scores `dead`. Scoring one dead and the other run is not
 * a judgement call, it is an inconsistency, and it runs in the direction that
 * flatters the number. Graded dead here.
 */
function deadGrant(modification) {
  for (const granted of modification.grant ?? []) {
    const k = String(granted).toLowerCase();
    if (keywordSupport(k) !== 'engine') return k;
  }
  return null;
}

/** The `{do:}` members that hand a decision to a player. Walks nested effects. */
function decisionIn(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') return e.do;
    if (e.do === 'if') { const r = decisionIn(e.then) ?? decisionIn(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionIn(e.effects); if (r) return r; }
  }
  return null;
}

function abilityVerdict(ability, ownsTriggers, scryfallKeywords, STRICT_GRANTS) {
  if (hasManualEffect(effectsOf(ability))) return { s: 'manual', why: '{do:manual} marker' };

  const decision = decisionIn(effectsOf(ability));

  switch (ability.kind) {
    case 'triggered':
      /*
       * SECOND DEFECT FOUND BY THIS REVIEW — ownership is asked FIRST.
       *
       * `ability-layer-coverage.mjs` asked `optional` and `decision` before
       * ownership, so a trigger `unrunnableReason` refuses outright was graded
       * `decision` because it said "you may", and the card landed in
       * PROMPTABLE — a bucket the reports describe as waiting only on a prompt.
       * 174 of the 262 in it are not waiting on a prompt: 74 need announced
       * targets a PendingTrigger cannot carry and 100 name an event
       * `deriveTriggerEvents` never emits. Measured by
       * scripts/verify-promptable-audit.mjs.
       */
      if (!ownsTriggers) return { s: 'dead', why: `trigger not owned: ${unrunnableReason(ability) ?? 'another clause on the card disqualified it'}` };
      if (ability.optional) return { s: 'decision', why: 'optional trigger' };
      if (decision) return { s: 'decision', why: `trigger contains ${decision}` };
      return { s: 'run', why: 'triggers.ts:468 ownedTriggersOf' };

    case 'static': {
      if (decision) return { s: 'decision', why: `static contains ${decision}` };
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') return { s: 'dead', why: 'cost-modify: costAdjustmentFor has no caller' };
        if (m.layer === 'restriction') {
          const rule = m.rule?.rule;
          if (!RESTRICTIONS_COMBAT_READS.has(rule)) return { s: 'dead', why: `restriction "${rule}": collected, never read` };
        }
        if (m.layer === 'ability' && STRICT_GRANTS) {
          const bad = deadGrant(m);
          if (bad) return { s: 'dead', why: `grants "${bad}", which combat.ts never asks about` };
        }
      }
      return { s: 'run', why: 'statics.ts -> layeredState -> characteristics.ts' };
    }

    case 'replacement': {
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      const r = ability.result ?? {};
      if (selfEnters && r.do === 'enters-tapped') return { s: 'run', why: 'intrinsic.ts enters-tapped' };
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
        return { s: 'run', why: 'intrinsic.ts enters-with-counters' };
      }
      return { s: 'dead', why: 'replacement: intrinsic.ts derives no such result' };
    }

    case 'keyword': {
      const kw = String(ability.keyword ?? '');
      if (keywordSupport(kw) !== 'engine') return { s: 'dead', why: `advisory keyword "${kw.toLowerCase()}"` };
      // The extra bar this script adds: keywords.ts reads card.keywords.
      if (!scryfallKeywords.has(kw.toLowerCase())) {
        return { s: 'dead', why: `engine keyword "${kw.toLowerCase()}" is not in card.keywords, which is the only list keywords.ts reads` };
      }
      return { s: 'run', why: 'keywords.ts reads card.keywords' };
    }

    case 'activated':
      return { s: 'dead', why: 'activated: activatedAbilitiesOf has no caller' };
    case 'spell':
      return { s: 'dead', why: 'spell: nothing runs a compiled spell on resolution' };
    case 'mana':
      return { s: 'dead', why: 'mana: mana.ts counts untapped sources instead' };
    default:
      return { s: 'dead', why: `unknown kind ${ability.kind}` };
  }
}

/* ------------------------------------------------------------------ *
 * 3. The run
 * ------------------------------------------------------------------ */

const verdicts = new Map();
const coverageHist = new Map();
const deadWhy = new Map();
const silentReason = new Map();

let accountingFailures = 0;
const accountingSamples = [];
let ownedByBridge = 0;

// Defect counters this script exists to find.
let consumedButNoAbility = 0;                 // a span was consumed and produced nothing
const consumedButNoAbilitySamples = [];
let automatedWithUnmappedParagraph = 0;       // AUTOMATED under their rule, refused under mine
const unmappedSamples = [];
let automatedWithoutFullCoverage = 0;
let keywordNotInScryfall = 0;
let deadGrantCost = 0;   // AUTOMATED under their grading, refused by the dead-grant rule
const keywordNotInScryfallSamples = [];

const automatedBy = new Map();
const automatedSamples = [];
const toProbe = [];

const DECISION_TEXT = /\byou may\b|\bchoose\b|\bup to\b|\bmay pay\b|\bof your choice\b|\bdivided as you choose\b/i;
const overReach = [];

/** Strip reminder text the way a reader would, for the over-reach text test only. */
function withoutReminders(text) {
  return String(text ?? '').replace(/\([^()]*\)/g, ' ');
}

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;

  try { assertClausesAccounted(trace); }
  catch (err) {
    accountingFailures++;
    if (accountingSamples.length < 10) accountingSamples.push(`${card.name}: ${err.message}`);
  }

  bump(coverageHist, result.coverage);

  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));

  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);
  if (owns) ownedByBridge++;

  const paragraphs = trace.normalized.paragraphs;
  if (paragraphs.length === 0) { bump(verdicts, 'NO-TEXT'); continue; }

  // Per-ability verdicts.
  // Two passes over the same abilities. `lenient` is their rule, kept so the
  // two runs can be compared line for line; `perAbility` is mine, which also
  // grades a grant of a keyword combat never asks about as dead.
  const lenient = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, false));
  const perAbility = result.abilities.map(a => abilityVerdict(a, owns, scryfallKeywords, true));
  for (const v of perAbility) if (v.s === 'dead') bump(deadWhy, v.why);

  // Paragraph coverage, made binding. Every non-blank front-face paragraph must
  // map to at least one ability, or be on the unparsed list.
  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const consumed = new Set(trace.consumedSpans.map(([a, b]) => `${a}:${b}`));
  const abilityLines = new Set();
  for (const a of result.abilities) {
    for (const line of String(a.text ?? '').split('\n')) {
      const k = line.trim();
      if (k) abilityLines.add(k);
    }
  }

  let unmapped = 0;
  let unaccounted = 0;
  for (const para of paragraphs) {
    const key = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(key)) continue;
    if (!consumed.has(key)) { unaccounted++; continue; }
    if (!abilityLines.has(para.raw.trim())) unmapped++;
  }

  if (unmapped > 0) {
    consumedButNoAbility++;
    if (consumedButNoAbilitySamples.length < 25) {
      consumedButNoAbilitySamples.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 150)}`);
    }
  }

  const anyManual = perAbility.some(v => v.s === 'manual');
  const anyDead = perAbility.some(v => v.s === 'dead');
  const anyDecision = perAbility.some(v => v.s === 'decision');

  // THEIR verdict rule, on THEIR lenient grading, so the two runs can be
  // compared line for line.
  const lManual = lenient.some(v => v.s === 'manual');
  const lDead = lenient.some(v => v.s === 'dead');
  const lDecision = lenient.some(v => v.s === 'decision');
  let theirs;
  if (result.unparsed.length || lManual || lDead) theirs = 'SILENT';
  else if (lDecision) theirs = 'PROMPTABLE';
  else if (result.abilities.length === 0) theirs = 'SILENT';
  else theirs = 'AUTOMATED';

  // MINE, on my grading, plus: an unplaced or unaccounted paragraph fails.
  let mine;
  if (result.unparsed.length || anyManual || anyDead) mine = 'SILENT';
  else if (anyDecision) mine = 'PROMPTABLE';
  else if (result.abilities.length === 0) mine = 'SILENT';
  else mine = 'AUTOMATED';

  if (theirs === 'AUTOMATED' && mine !== 'AUTOMATED') deadGrantCost++;
  if ((theirs === 'AUTOMATED' || theirs === 'PROMPTABLE') && (unmapped > 0 || unaccounted > 0)) {
    mine = 'SILENT';
    if (theirs === 'AUTOMATED') {
      automatedWithUnmappedParagraph++;
      if (unmappedSamples.length < 25) {
        unmappedSamples.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 150)}`);
      }
    }
  }

  if (mine === 'AUTOMATED' && result.coverage !== 'full') automatedWithoutFullCoverage++;

  // Did an engine keyword fail only because Scryfall did not print it?
  if (theirs !== 'SILENT') {
    for (const v of perAbility) {
      if (v.s === 'dead' && v.why.includes('is not in card.keywords')) {
        keywordNotInScryfall++;
        if (keywordNotInScryfallSamples.length < 20) keywordNotInScryfallSamples.push(`${card.name} :: ${v.why}`);
      }
    }
  }

  bump(verdicts, mine);
  bump(verdicts, `THEIRS:${theirs}`);

  if (mine === 'AUTOMATED' || mine === 'PROMPTABLE') {
    toProbe.push({ name: card.name, verdict: mine, abilities: result.abilities, oracle: card.oracle_text ?? '' });
  }

  if (mine === 'AUTOMATED') {
    const kinds = new Set(result.abilities.map(a => a.kind));
    bump(automatedBy, kinds.size === 1 && kinds.has('keyword') ? 'keyword lines only' : [...kinds].sort().join('+'));
    if (automatedSamples.length < 400) {
      automatedSamples.push({
        name: card.name,
        type: card.type_line ?? '',
        oracle: String(card.oracle_text ?? ''),
        kinds: [...kinds].sort(),
        paragraphs: paragraphs.length,
        abilities: result.abilities.length,
      });
    }
    if (DECISION_TEXT.test(withoutReminders(card.oracle_text))) {
      overReach.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 160)}`);
    }
  }

  if (mine === 'SILENT') {
    const worst = result.unparsed.length ? 'unparsed text'
      : anyManual ? '{do:manual} marker'
      : anyDead ? 'understood, nothing runs it'
      : unmapped > 0 ? 'consumed paragraph produced no ability'
      : unaccounted > 0 ? 'paragraph neither consumed nor unparsed'
      : 'text on the card, no ability came out';
    bump(silentReason, worst);
  }
}

/* ------------------------------------------------------------------ *
 * 4. The behaviour probe, on my AUTOMATED set
 * ------------------------------------------------------------------ */

const probeOut = new Map();
let downgraded = 0;
const probeDeferred = new Map();
const probeThrew = [];
let probeSilent = 0;
const probeSilentNames = [];

for (const e of toProbe) {
  let v;
  try { v = probeBehaviour(e.abilities); }
  catch (err) { v = { outcome: 'threw', actions: 0, deferred: [], error: err.message }; }
  bump(probeOut, `${e.verdict}/${v.outcome}`);
  if (e.verdict !== 'AUTOMATED') continue;
  if (v.outcome === 'threw') { downgraded++; if (probeThrew.length < 20) probeThrew.push(`${e.name} :: ${v.error ?? ''}`); }
  else if (v.outcome === 'deferred') { downgraded++; for (const d of v.deferred) bump(probeDeferred, d.slice(0, 90)); }
  else if (v.outcome === 'silent') { probeSilent++; if (probeSilentNames.length < 30) probeSilentNames.push(e.name); }
}

/* ------------------------------------------------------------------ *
 * 5. Report
 * ------------------------------------------------------------------ */

const N = pool.length;
const preAutomated = verdicts.get('AUTOMATED') ?? 0;
const promptable = verdicts.get('PROMPTABLE') ?? 0;
const noText = verdicts.get('NO-TEXT') ?? 0;
const preSilent = verdicts.get('SILENT') ?? 0;

const automated = preAutomated - downgraded;
const silent = preSilent + downgraded;

const L = [];
const say = s => { L.push(s); console.log(s); };

say('='.repeat(78));
say('INDEPENDENT VERIFICATION of the ability-layer coverage numbers');
say('='.repeat(78));
say('');
say('--- THE POOL ---');
say(`rows in the cached bulk file            ${all.length}`);
say(`distinct oracle_id                      ${oracleIds.size}`);
say(`rows with no oracle_id                  ${missingOracleId}`);
say(`rows repeating an oracle_id             ${duplicateOracleId}`);
say('excluded:');
for (const [k, v] of top(drop, 20)) say(`  ${k.padEnd(36)} ${v}`);
say(`POOL                                    ${N}`);
say(`distinct oracle_id in the pool          ${poolOracleIds.size}`);
say('');
say('--- ACCOUNTING ---');
say(`assertClausesAccounted failures         ${accountingFailures}`);
for (const s of accountingSamples) say(`  ${s}`);
say('');
say('--- THE THREE METRICS, my rule (an unplaceable paragraph fails the card) ---');
say(`AUTOMATED   ${String(automated).padStart(6)}  ${pct(automated, N)}%   (${preAutomated} before the probe, ${downgraded} downgraded)`);
say(`PROMPTED    ${String(0).padStart(6)}  0.00%   (no per-card choice UI exists; see the grep below)`);
say(`SILENT      ${String(silent).padStart(6)}  ${pct(silent, N)}%`);
say(`NO-TEXT     ${String(noText).padStart(6)}  ${pct(noText, N)}%`);
say(`PROMPTABLE  ${String(promptable).padStart(6)}  ${pct(promptable, N)}%   (memo, never inside PROMPTED)`);
say(`reconciles: ${automated} + ${promptable} + ${silent} + ${noText} = ${automated + promptable + silent + noText} of ${N}`);
say('');
say('--- THE SAME RUN, scored by THEIR rule ---');
const theirAuto = verdicts.get('THEIRS:AUTOMATED') ?? 0;
const theirPromptable = verdicts.get('THEIRS:PROMPTABLE') ?? 0;
const theirSilent = verdicts.get('THEIRS:SILENT') ?? 0;
say(`AUTOMATED pre-probe   ${theirAuto}   PROMPTABLE ${theirPromptable}   SILENT ${theirSilent}`);
say('');
say('--- DEFECTS THIS SCRIPT LOOKS FOR ---');
say(`cards with a consumed paragraph that produced NO ability   ${consumedButNoAbility}`);
for (const s of consumedButNoAbilitySamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED under their rule, refused under mine             ${automatedWithUnmappedParagraph}`);
for (const s of unmappedSamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED with coverage !== 'full'                         ${automatedWithoutFullCoverage}`);
say(`AUTOMATED under their grading, refused by the dead-grant rule ${deadGrantCost}`);
say(`engine keyword compiled but absent from card.keywords      ${keywordNotInScryfall}`);
for (const s of keywordNotInScryfallSamples.slice(0, 15)) say(`  ${s}`);
say(`AUTOMATED whose oracle text still carries a decision word  ${overReach.length}`);
for (const s of overReach.slice(0, 25)) say(`  ${s}`);
say('');
say('--- WHAT CARRIES AN AUTOMATED CARD ---');
for (const [k, v] of top(automatedBy, 15)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- COMPILER CEILING ---');
for (const [k, v] of top(coverageHist, 6)) say(`  ${k.padEnd(10)} ${String(v).padStart(6)}  ${pct(v, N)}%`);
say(`abilityEngineOwns (the "906" predicate)  ${ownedByBridge}  ${pct(ownedByBridge, N)}%`);
say('');
say('--- WHY SILENT ---');
for (const [k, v] of top(silentReason, 10)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- DEAD, by reason (ability hits, not cards) ---');
for (const [k, v] of top(deadWhy, 20)) say(`  ${String(v).padStart(6)}  ${k}`);
say('');
say('--- PROBE ---');
for (const [k, v] of top(probeOut, 10)) say(`  ${String(v).padStart(6)}  ${k}`);
say(`downgraded ${downgraded};  silent-on-probe-board (NOT downgraded) ${probeSilent}`);
for (const s of probeThrew) say(`  threw: ${s}`);
for (const [k, v] of top(probeDeferred, 12)) say(`  defer ${String(v).padStart(5)}  ${k}`);
say('');
say(`If every probe-silent card were also downgraded, AUTOMATED would be ${automated - probeSilent} (${pct(automated - probeSilent, N)}%).`);

writeFileSync(OUT, JSON.stringify({
  pool: { rows: all.length, distinctOracleIds: oracleIds.size, duplicateOracleId, pool: N, poolOracleIds: poolOracleIds.size, drop: Object.fromEntries(drop) },
  metrics: { automated, prompted: 0, silent, noText, promptable, preProbeAutomated: preAutomated, downgraded, probeSilent },
  theirs: { automated: theirAuto, promptable: theirPromptable, silent: theirSilent },
  defects: {
    consumedButNoAbility, consumedButNoAbilitySamples,
    automatedWithUnmappedParagraph, unmappedSamples,
    automatedWithoutFullCoverage,
    keywordNotInScryfall, keywordNotInScryfallSamples,
    deadGrantCost,
    overReach,
  },
  accountingFailures, accountingSamples,
  ownedByBridge,
  coverage: Object.fromEntries(coverageHist),
  automatedBy: Object.fromEntries(automatedBy),
  silentReason: Object.fromEntries(silentReason),
  deadWhy: Object.fromEntries(top(deadWhy, 60)),
  probe: { outcomes: Object.fromEntries(probeOut), deferred: Object.fromEntries(top(probeDeferred, 40)), threw: probeThrew, silentNames: probeSilentNames },
  automatedSamples,
}, null, 2));

console.log(`\nwrote ${OUT}`);
