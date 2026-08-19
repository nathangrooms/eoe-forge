/**
 * The census pool is not the paper card set. This measures by how much.
 *
 * `clause-census.mjs` and every script downstream of it drop a row when
 * `card.digital` is true or `games` has no 'paper'. On an "oracle cards" bulk
 * file, which carries ONE row per oracle id, that filter does not ask whether
 * the CARD is digital. It asks whether the printing Scryfall happened to pick
 * as that card's representative is digital.
 *
 * Black Lotus is the proof. Its row in this file is the Vintage Masters
 * printing: `digital: true, games: ["mtgo"], set: "vma"`. Black Lotus is
 * dropped from a pool that claims to be the paper card pool.
 *
 * The MTGO-only sets below are reprint sets by construction — every card in
 * them was printed on paper first — so every row this recovers is a paper card.
 * Arena and Alchemy rows are left out, because those are genuinely digital.
 *
 * Usage: node --experimental-strip-types scripts/verify-pool-gap.mjs
 * Local file only. No Supabase, no network, no model.
 */

import { createReadStream, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeBehaviour } from '../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'verify-pool-gap.txt');

/** MTGO-only sets that contain nothing but reprints of paper cards. */
const MTGO_REPRINT_SETS = new Set(['me1', 'me2', 'me3', 'me4', 'tpr', 'vma']);

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);
const READS = new Set(['cant-attack', 'cant-block']);

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

function decisionIn(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') return e.do;
    if (e.do === 'if') { const r = decisionIn(e.then) ?? decisionIn(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionIn(e.effects); if (r) return r; }
  }
  return null;
}

function verdictOf(ability, owns, kws) {
  if (hasManualEffect(effectsOf(ability))) return 'manual';
  const decision = decisionIn(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered':
      if (!owns) return 'dead';
      if (ability.optional || decision) return 'decision';
      return 'run';
    case 'static': {
      if (decision) return 'decision';
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') return 'dead';
        if (m.layer === 'restriction' && !READS.has(m.rule?.rule)) return 'dead';
        if (m.layer === 'ability') for (const g of (m.grant ?? [])) if (keywordSupport(String(g).toLowerCase()) !== 'engine') return 'dead';
      }
      return 'run';
    }
    case 'replacement': {
      const self = ability.event?.on === 'enters' && ability.selfReplacement;
      const r = ability.result ?? {};
      if (self && r.do === 'enters-tapped') return 'run';
      if (self && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return 'run';
      return 'dead';
    }
    case 'keyword': {
      const kw = String(ability.keyword ?? '').toLowerCase();
      if (keywordSupport(kw) !== 'engine') return 'dead';
      return kws.has(kw) ? 'run' : 'dead';
    }
    default:
      return 'dead';
  }
}

function classify(card) {
  const trace = compileWithTrace(card);
  const r = trace.result;
  if (trace.normalized.paragraphs.length === 0) return 'NO-TEXT';
  const kws = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const triggered = r.abilities.filter(a => a.kind === 'triggered');
  const owns = r.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);
  const vs = r.abilities.map(a => verdictOf(a, owns, kws));
  if (r.unparsed.length || vs.some(v => v === 'manual' || v === 'dead')) return 'SILENT';
  if (vs.some(v => v === 'decision')) return 'PROMPTABLE';
  if (r.abilities.length === 0) return 'SILENT';
  let probe;
  try { probe = probeBehaviour(r.abilities); }
  catch { return 'SILENT'; }
  if (probe.outcome === 'threw' || probe.outcome === 'deferred') return 'SILENT';
  return 'AUTOMATED';
}

if (!existsSync(SRC)) { console.error(`Missing ${SRC}`); process.exit(1); }

const recovered = [];
let censusPool = 0;
const censusCount = { AUTOMATED: 0, PROMPTABLE: 0, SILENT: 0, 'NO-TEXT': 0 };
const recoveredCount = { AUTOMATED: 0, PROMPTABLE: 0, SILENT: 0, 'NO-TEXT': 0 };

for await (const c of rows(SRC)) {
  if (NOT_A_CARD.has(c.layout) || NOT_A_GAME_PRODUCT.has(c.set_type) || NOT_A_NORMAL_GAME.has(c.layout)) continue;

  const inCensus = !c.digital && (c.games ?? []).includes('paper');
  const isPaperCardScryfallGaveADigitalRow = c.digital && MTGO_REPRINT_SETS.has(c.set);

  if (inCensus) { censusPool++; censusCount[classify(c)]++; continue; }
  if (!isPaperCardScryfallGaveADigitalRow) continue;

  recovered.push(c);
  recoveredCount[classify(c)]++;
}

const L = [];
const say = s => { L.push(s); console.log(s); };
const pct = (n, d) => ((n / d) * 100).toFixed(2);

say('POOL GAP — real paper cards the census filter drops');
say('');
say(`census pool as measured                       ${censusPool}`);
say(`paper cards recovered from MTGO reprint sets  ${recovered.length}`);
say(`  sets: ${[...MTGO_REPRINT_SETS].join(', ')}`);
say(`corrected pool                                ${censusPool + recovered.length}`);
say('');
say('sample of what was being dropped:');
for (const c of recovered.slice(0, 15)) say(`  ${c.name}  [${c.set}]`);
say('');
say('THE THREE METRICS, census pool vs corrected pool');
const N0 = censusPool;
const N1 = censusPool + recovered.length;
for (const k of ['AUTOMATED', 'PROMPTABLE', 'SILENT', 'NO-TEXT']) {
  const a = censusCount[k];
  const b = a + recoveredCount[k];
  say(`  ${k.padEnd(11)} census ${String(a).padStart(6)}  ${pct(a, N0)}%   corrected ${String(b).padStart(6)}  ${pct(b, N1)}%   (+${recoveredCount[k]})`);
}
say('');
say(`AUTOMATED moves from ${pct(censusCount.AUTOMATED, N0)}% to ${pct(censusCount.AUTOMATED + recoveredCount.AUTOMATED, N1)}%.`);

writeFileSync(OUT, L.join('\n'));
console.log(`\nwrote ${OUT}`);
