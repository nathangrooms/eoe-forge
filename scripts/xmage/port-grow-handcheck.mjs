#!/usr/bin/env node
/**
 * THE HAND CHECK FOR A NEW DSL MEMBER.
 *
 * A new `Effect` member is a claim: "this shape means what the printed card
 * says". The lowering count going up does not test that claim, and neither
 * does the probe, which only asks whether SOMETHING happened. The only thing
 * that tests it is a person reading the printed card beside the shape the port
 * produced, so this script puts the two next to each other and grades nothing.
 *
 * Per card it prints:
 *
 *   Scryfall's oracle text, verbatim
 *   every ability the SHIPPED compiler ended up with, as `dsl.ts` shapes
 *   what `probeBehaviour` did with them on the shipped probe board
 *
 * and a person marks each AGREES or DISAGREES against the printed card.
 *
 * ## The sample is not chosen
 *
 * Candidates are every card in the paper pool where `compileWithTrace` returned
 * an XMage record that carries the named verb somewhere in its effect trees.
 * They are sorted by oracle id, which is an arbitrary order nobody controls,
 * and a fixed stride walks them. Run it twice and the same cards come back.
 * There is no seed to nudge and no filter on what makes an interesting card.
 *
 * `DM_ALREADY` names JSON files from earlier rounds whose cards are excluded by
 * oracle id, for the same reason `port-open-accuracy-sample.mjs` keeps a list:
 * a round of fixes derived from a sample cannot be graded on that sample.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied: they carry Wizards of the Coast rules text, which is not XMage's to
 * license, so every line of card wording printed below comes from Scryfall.
 * Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/port-grow-handcheck.mjs do-if-cost-paid
 *   DM_SAMPLE=20 node ... scry surveil
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { probeBehaviour } from '../../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');

const verbs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (verbs.length === 0) {
  console.error('name at least one effect verb, e.g. do-if-cost-paid');
  process.exit(1);
}
const WANT = Number(process.env.DM_SAMPLE ?? 10);
const OUT = join(ROOT, 'scratch', `port-grow-handcheck.${verbs.join('+')}.json`);

const alreadyChecked = new Set();
for (const path of (process.env.DM_ALREADY ?? '').split(';').filter(Boolean)) {
  const full = join(ROOT, path);
  if (!existsSync(full)) {
    console.error(`Missing ${full}. An earlier sample has to be readable to be excluded.`);
    process.exit(1);
  }
  for (const row of JSON.parse(readFileSync(full, 'utf8')).sample) alreadyChecked.add(row.o);
}

/* The same pool filters the shipped coverage script uses, copied rather than
 * imported because that script is a program and not a module. A different pool
 * would make every count here incomparable with the headline. */
const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }
}

const verdictOf = existsSync(VERDICTS)
  ? new Map(JSON.parse(readFileSync(VERDICTS, 'utf8')).cards.map((c) => [c.o, c]))
  : new Map();

/** Every `do:` string anywhere in a value, however deeply nested. */
function verbsIn(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const v of value) verbsIn(v, out);
    return out;
  }
  if (typeof value.do === 'string') out.add(value.do);
  for (const k of Object.keys(value)) verbsIn(value[k], out);
  return out;
}

const want = new Set(verbs);
const candidates = [];
let excluded = 0;
for (const card of pool) {
  const t = compileWithTrace(card);
  if (t.result.source !== 'xmage') continue;
  const present = verbsIn(t.result.abilities);
  if (![...want].some((v) => present.has(v))) continue;
  if (alreadyChecked.has(t.result.oracleId)) { excluded++; continue; }
  candidates.push({ card, abilities: t.result.abilities, verdict: verdictOf.get(t.result.oracleId)?.v ?? '(not dumped)' });
}

candidates.sort((a, b) => (a.card.oracle_id < b.card.oracle_id ? -1 : 1));

const stride = Math.max(1, Math.floor(candidates.length / WANT));
const sample = [];
for (let i = 0; sample.length < WANT && i * stride < candidates.length; i++) {
  sample.push(candidates[i * stride]);
}

console.log(`verbs ${[...want].join(', ')}`);
console.log(`cards where the SHIPPED compiler ran an xmage record carrying one: ${candidates.length + excluded}`);
if (excluded) console.log(`${excluded} were hand checked in an earlier round and are excluded`);
console.log(`sampling every ${stride}th of the remaining ${candidates.length}, ${sample.length} cards`);
{
  const tally = new Map();
  for (const c of candidates) tally.set(c.verdict, (tally.get(c.verdict) ?? 0) + 1);
  console.log('verdicts across all candidates: ' + [...tally].map(([k, v]) => `${k} ${v}`).join('  '));
}
console.log('');

const out = [];
for (const [i, c] of sample.entries()) {
  const probe = probeBehaviour(c.abilities);
  const text =
    c.card.oracle_text ??
    (c.card.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') ??
    '';

  console.log('='.repeat(78));
  console.log(`${String(i + 1).padStart(2)}. ${c.card.name}   [${c.verdict}]   ${c.card.oracle_id}`);
  console.log(`    ${c.card.type_line}   ${c.card.mana_cost ?? ''}`);
  console.log('');
  console.log('SCRYFALL ORACLE TEXT:');
  for (const line of String(text).split('\n')) console.log('    ' + line);
  console.log('');
  console.log('WHAT THE ENGINE RUNS:');
  for (const a of c.abilities) {
    const { text: _t, ...rest } = a;
    console.log('    ' + JSON.stringify(rest));
  }
  console.log('');
  console.log(`PROBE: ${probe.outcome}, ${probe.actions} actions`);
  for (const p of probe.perAbility) console.log(`    ${p.id} ${p.kind}: ${p.outcome}, ${p.actions} actions`);
  if (probe.deferred.length) console.log('    deferred: ' + probe.deferred.join(' | '));
  console.log('');

  out.push({
    n: c.card.name,
    o: c.card.oracle_id,
    typeLine: c.card.type_line,
    oracle: text,
    verdict: c.verdict,
    abilities: c.abilities.map(({ text: _t, ...rest }) => rest),
    probe: {
      outcome: probe.outcome,
      actions: probe.actions,
      perAbility: probe.perAbility,
      deferred: probe.deferred,
    },
  });
}

writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), verbs: [...want], excluded, candidates: candidates.length, stride, sample: out }, null, 1),
);
console.log('wrote', OUT);
