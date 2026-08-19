/**
 * The worklist for the ABILITY LAYER, and nothing else.
 *
 * `ability-layer-coverage.mjs` measures the whole picture, engine included.
 * This script answers a narrower question that a person working only in
 * `src/lib/cards/abilities/**` actually needs:
 *
 *   Which single lines, if the COMPILER learned to read them, would finish a
 *   card outright — and which would not, because something the engine owns is
 *   blocking the same card anyway.
 *
 * The difference matters. `~ can't be countered` sits on 89 cards, and if 85 of
 * those also carry an activated ability the compiler work buys nothing a player
 * can see, because `activatedAbilitiesOf` still has no call site. A ranking by
 * raw line frequency would put it near the top. A ranking by cards FINISHED
 * puts it where it belongs.
 *
 * Definitions, kept identical to `ability-layer-coverage.mjs` so the two can be
 * read side by side:
 *
 *   blocking status  unparsed | manual | dead   (per paragraph)
 *   MINE             unparsed or manual — the compiler could remove it here
 *   THEIRS           dead — a compiled ability nothing in the engine runs
 *
 * A card is "one line from done" when it has exactly ONE blocking paragraph.
 * Every such line is reported with how many cards it would finish, split by
 * whether the fix belongs to this folder or to the engine.
 *
 * No Supabase, no network, no model. Reads the cached bulk file on disk.
 *
 * Usage:  node --experimental-strip-types scripts/ability-worklist.mjs
 */

import { createReadStream, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  creatureTypeSet,
  nameSet,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'ability-worklist.json');

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* Same switch as ability-layer-coverage.mjs. Copied rather than imported
 * because that file is a script with top-level side effects. */
function decisionReason(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may') return 'may';
    if (e.do === 'choose-mode') return 'choose-mode';
    if (e.do === 'unless-pays') return 'unless-pays';
    if (e.do === 'if') { const r = decisionReason(e.then) ?? decisionReason(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionReason(e.effects); if (r) return r; }
  }
  return null;
}

function abilityStatus(ability, ownsTriggers) {
  const effects = effectsOf(ability);
  const decision = decisionReason(effects);
  switch (ability.kind) {
    case 'triggered':
      if (ability.optional) return 'decision';
      if (decision) return 'decision';
      return ownsTriggers ? 'run' : 'dead';
    case 'static':
      return decision ? 'decision' : 'run';
    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      if (selfEnters && r.do === 'enters-tapped') return 'run';
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return 'run';
      return 'dead';
    }
    case 'keyword':
      return keywordSupport(ability.keyword ?? '') === 'engine' ? 'run' : 'dead';
    default:
      return 'dead'; // activated, spell, mana
  }
}

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`);
  process.exit(1);
}

const all = [];
for await (const card of rows(SRC)) all.push(card);

const pool = [];
for (const card of all) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) continue;
  if (EXCLUDED_SET_TYPES.has(card.set_type)) continue;
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool.push(card);
}
void creatureTypeSet;
void nameSet;

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/** line -> {finishes, appears, status} for lines that are the SOLE blocker. */
const soleBlockerMine = new Map();
const soleBlockerTheirs = new Map();
/** line -> cards it blocks at all, whether or not it is the only blocker. */
const blocksAtAll = new Map();
/** For a sole-blocker line, one example card name. */
const example = new Map();
/** Every SILENT card whose blocking lines are ALL ours. */
const allMine = [];

let accountingFailures = 0;
let oneLineShort = 0;
let oneLineShortMine = 0;
let automatedWithUnconsumedRestriction = 0;
let automatedOnlyUnconsumedRestriction = 0;
const unconsumedSamples = [];
const verdicts = new Map();

function paragraphStatuses(trace, ownsTriggers) {
  const { result, normalized, consumedSpans } = trace;
  const consumed = new Set(consumedSpans.map(([a, b]) => `${a}:${b}`));
  const unparsedSpans = new Set(result.unparsed.map((u) => `${u.span[0]}:${u.span[1]}`));

  const byText = new Map();
  const rank = { run: 0, decision: 1, dead: 2, manual: 3 };
  for (const ability of result.abilities) {
    const st = hasManualEffect(effectsOf(ability)) ? 'manual' : abilityStatus(ability, ownsTriggers);
    for (const rawLine of String(ability.text ?? '').split('\n')) {
      const key = rawLine.trim();
      if (!key) continue;
      const prev = byText.get(key);
      if (!prev || rank[st] > rank[prev]) byText.set(key, st);
    }
  }

  const out = [];
  for (const para of normalized.paragraphs) {
    const spanKey = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(spanKey)) { out.push({ para, status: 'unparsed' }); continue; }
    if (consumed.has(spanKey)) {
      const st = byText.get(para.raw.trim());
      out.push({ para, status: st ?? 'unmapped' });
      continue;
    }
    out.push({ para, status: 'unaccounted' });
  }
  return out;
}

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;
  try { assertClausesAccounted(trace); } catch { accountingFailures++; }

  const triggered = result.abilities.filter((a) => a.kind === 'triggered');
  const owns =
    result.coverage === 'full' &&
    triggered.length > 0 &&
    triggered.every((a) => unrunnableReason(a) === null);

  const statuses = paragraphStatuses(trace, owns);
  if (!statuses.length) { bump(verdicts, 'NO-TEXT'); continue; }

  const abilityVerdicts = result.abilities.map((a) =>
    hasManualEffect(effectsOf(a)) ? 'manual' : abilityStatus(a, owns),
  );
  const verdict =
    result.unparsed.length || abilityVerdicts.includes('manual') || abilityVerdicts.includes('dead')
      ? 'SILENT'
      : abilityVerdicts.includes('decision')
        ? 'PROMPTABLE'
        : result.abilities.length === 0
          ? 'SILENT'
          : 'AUTOMATED';
  bump(verdicts, verdict);

  /* The restriction audit.
   *
   * `abilityStatus` calls every static ability 'run', citing `statics.ts`. That
   * is true for the CHARACTERISTIC layers — `toEffectPart` maps pt-set,
   * pt-modify, type, colour, ability-grant and control straight onto
   * `layers.ts`. It is NOT true for every `{layer:'restriction'}`. `scanStatics`
   * collects them all, but the only consumer outside that file is
   * `hasRestriction`, which answers for exactly four rules: cant-attack,
   * cant-block, must-attack, cant-untap. A `cant-be-blocked-except-by`, a
   * `damage-prevention`, a `cant-cast` or a `max-lands-per-turn` is scanned and
   * then read by nobody.
   *
   * So a card whose ONLY abilities are unconsumed restrictions is counted
   * AUTOMATED and does nothing. Tidal Kraken — "This creature can't be blocked"
   * — is in that set, and it appears in the coverage report's own list of
   * AUTOMATED samples. The number is printed rather than corrected, because the
   * fix is a combat-code change in `src/lib/game`, which this workflow does not
   * own. */
  if (verdict === 'AUTOMATED') {
    const mods = result.abilities.flatMap((a) => (a.kind === 'static' ? a.modifications : []));
    const restrictions = mods.filter((m) => m.layer === 'restriction');
    const consumedRules = new Set(['cant-attack', 'cant-block', 'must-attack', 'cant-untap']);
    const unconsumed = restrictions.filter((m) => !consumedRules.has(m.rule?.rule));
    if (unconsumed.length) {
      automatedWithUnconsumedRestriction++;
      // Does anything else on the card actually do something a player sees?
      const otherWork =
        mods.some((m) => m.layer !== 'restriction') ||
        result.abilities.some((a) => a.kind === 'triggered' || a.kind === 'replacement') ||
        result.abilities.some((a) => a.kind === 'keyword' && keywordSupport(a.keyword ?? '') === 'engine');
      if (!otherWork) {
        automatedOnlyUnconsumedRestriction++;
        if (unconsumedSamples.length < 15) unconsumedSamples.push(`${card.name} :: ${unconsumed.map((m) => m.rule.rule).join(',')}`);
      }
    }
  }

  if (verdict !== 'SILENT') continue;

  const blocking = statuses.filter(
    (s) => s.status === 'unparsed' || s.status === 'manual' || s.status === 'dead' || s.status === 'unmapped',
  );

  const seen = new Set();
  for (const b of blocking) {
    const key = `${b.status} :: ${b.para.norm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bump(blocksAtAll, key);
  }

  // Cards whose EVERY blocking line is ours. These are the only cards this
  // folder can finish on its own, at any number of lines.
  if (blocking.every((b) => b.status === 'unparsed' || b.status === 'manual')) {
    allMine.push({ name: card.name, lines: blocking.map((b) => `${b.status} :: ${b.para.norm}`) });
  }

  if (blocking.length !== 1) continue;
  oneLineShort++;
  const b = blocking[0];
  const key = `${b.status} :: ${b.para.norm}`;
  const mine = b.status === 'unparsed' || b.status === 'manual';
  if (mine) { oneLineShortMine++; bump(soleBlockerMine, key); }
  else bump(soleBlockerTheirs, key);
  if (!example.has(key)) example.set(key, card.name);
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const line = (s = '') => console.log(s);

line('=========================================================');
line(' ABILITY-LAYER WORKLIST — lines the COMPILER could finish');
line('=========================================================');
line();
line(`bulk file                 ${SRC}`);
line(`pool                      ${pool.length}`);
line(`accounting failures       ${accountingFailures}`);
line(`verdicts                  ${JSON.stringify(Object.fromEntries(verdicts))}`);
line();
line('-- AUTOMATED cards resting on a restriction nothing consumes --');
line(`  AUTOMATED cards carrying any unconsumed restriction   ${automatedWithUnconsumedRestriction}`);
line(`  of those, cards with NOTHING ELSE that a player sees  ${automatedOnlyUnconsumedRestriction}`);
line('  (scanStatics collects every restriction; only cant-attack, cant-block,');
line('   must-attack and cant-untap are read back, by hasRestriction)');
for (const s of unconsumedSamples) line(`    ${s}`);
line();

line(`SILENT cards one line from done          ${oneLineShort}`);
line(`   of those, the one line is OURS        ${oneLineShortMine}   (unparsed or manual)`);
line(`   of those, the one line is the ENGINE  ${oneLineShort - oneLineShortMine}   (dead)`);
line();

const mineTotal = [...soleBlockerMine.values()].reduce((a, b) => a + b, 0);
line(`-- top 120 lines OURS TO FIX, by cards each would finish (total ${mineTotal}) --`);
line('  finish  blocks  status    line');
for (const [k, v] of topOf(soleBlockerMine, 120)) {
  const [status, ...rest] = k.split(' :: ');
  line(`  ${String(v).padStart(6)}  ${String(blocksAtAll.get(k) ?? v).padStart(6)}  ${status.padEnd(9)} ${rest.join(' :: ').slice(0, 96)}`);
}
line();

line('-- top 40 lines the ENGINE owns, for contrast (we cannot move these) --');
for (const [k, v] of topOf(soleBlockerTheirs, 40)) {
  line(`  ${String(v).padStart(6)}  ${k.slice(0, 104)}`);
}
line();

writeFileSync(
  OUT,
  JSON.stringify(
    {
      pool: pool.length,
      verdicts: Object.fromEntries(verdicts),
      oneLineShort,
      oneLineShortMine,
      automatedWithUnconsumedRestriction,
      automatedOnlyUnconsumedRestriction,
      allMineCards: allMine.length,
      allMine,
      mine: [...soleBlockerMine.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ key: k, finishes: v, blocks: blocksAtAll.get(k) ?? v, example: example.get(k) })),
      theirs: [...soleBlockerTheirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map(([k, v]) => ({ key: k, finishes: v })),
    },
    null,
    2,
  ),
);
line(`written: ${OUT}`);
