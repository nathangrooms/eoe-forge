#!/usr/bin/env node
/**
 * THE ACCURACY BASELINE. 30 cards the PORT already passes, laid out so a person
 * can check them against the printed card by hand.
 *
 * A card that passes and is WRONG is worse than a card that refuses, because a
 * refusal is visible in the log and a wrong card is not. Coverage is measured by
 * a script; accuracy can only be established by reading the card. So this script
 * does not grade anything. It prints, per card:
 *
 *   Scryfall's oracle text, verbatim
 *   every ability the engine ended up with, as `dsl.ts` shapes
 *   what `probeBehaviour` did with them on the shipped probe board
 *
 * and a person marks each AGREES or DISAGREES.
 *
 * ## The sample is not chosen
 *
 * Cherry-picking is the failure this whole document exists to avoid, so the
 * sample is a fixed stride over the candidate list sorted by oracle id: an
 * arbitrary order nobody controls, taken at an interval fixed by the count. Run
 * it twice and it returns the same 30 cards. There is no seed to nudge and no
 * filter on what makes an interesting card.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied; every line of card wording printed below comes from Scryfall. Forge
 * is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-primary-accuracy-sample.mjs
 *      DM_SAMPLE=60 ... to widen it.
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
const OUT = join(ROOT, 'scratch', 'port-primary-accuracy-sample.json');

const WANT = Number(process.env.DM_SAMPLE ?? 30);

if (!existsSync(VERDICTS)) {
  console.error(`Missing ${VERDICTS}. Run DM_CARD_DUMP=1 verify-ability-coverage.mjs first.`);
  process.exit(1);
}

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

const dumped = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const verdictOf = new Map(dumped.cards.map((c) => [c.o, c]));
const PASSES = new Set(['AUTOMATED', 'PROMPTED']);

const candidates = [];
for (const card of pool) {
  const t = compileWithTrace(card);
  if (t.result.source !== 'xmage') continue;
  const v = verdictOf.get(t.result.oracleId);
  if (!v || !PASSES.has(v.v)) continue;
  candidates.push({ card, abilities: t.result.abilities, verdict: v.v });
}

candidates.sort((a, b) => (a.card.oracle_id < b.card.oracle_id ? -1 : 1));

const stride = Math.floor(candidates.length / WANT);
const sample = [];
for (let i = 0; sample.length < WANT && i * stride < candidates.length; i++) {
  sample.push(candidates[i * stride]);
}

console.log(`the port passes ${candidates.length} cards; sampling every ${stride}th, ${sample.length} cards`);
console.log('');

const out = [];
for (const [i, c] of sample.entries()) {
  const probe = probeBehaviour(c.abilities);
  const text = c.card.oracle_text ?? (c.card.card_faces ?? []).map((f) => f.oracle_text).filter(Boolean).join('\n//\n') ?? '';

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
  if (probe.answered.length) console.log('    answered: ' + probe.answered.join(' | '));
  if (probe.unbound.length) console.log('    unbound: ' + probe.unbound.join(' | '));
  if (probe.deferred.length) console.log('    deferred: ' + probe.deferred.join(' | '));
  console.log('');

  out.push({
    n: c.card.name,
    o: c.card.oracle_id,
    typeLine: c.card.type_line,
    oracle: text,
    verdict: c.verdict,
    abilities: c.abilities.map(({ text: _t, ...rest }) => rest),
    probe: { outcome: probe.outcome, actions: probe.actions, perAbility: probe.perAbility, answered: probe.answered, unbound: probe.unbound, deferred: probe.deferred },
  });
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), candidates: candidates.length, stride, sample: out }, null, 1));
console.log('wrote', OUT);
