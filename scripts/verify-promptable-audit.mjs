/**
 * Is PROMPTABLE honest?
 *
 * The reports quote PROMPTABLE as "understood, needs a choice, waiting on a
 * prompt that has never been built". That sentence claims building the prompt
 * would finish the card. This checks the claim.
 *
 * The classifier in `ability-layer-coverage.mjs` tests a triggered ability in
 * this order:
 *
 *     if (ability.optional) return decision;
 *     if (decision)         return decision;
 *     if (!ownsTriggers)    return dead;
 *
 * `decision` is answered BEFORE ownership. So a trigger the engine would never
 * fire at all can still be graded `decision` on the strength of carrying a
 * "you may". If that happens, the card is not one prompt short. It is one
 * prompt AND one trigger-event derivation short, and the bucket is overstating.
 *
 * Usage: node --experimental-strip-types scripts/verify-promptable-audit.mjs
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'verify-promptable-audit.txt');

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

function verdictOf(ability, owns, scryfallKeywords) {
  if (hasManualEffect(effectsOf(ability))) return 'manual';
  const decision = decisionIn(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered':
      if (ability.optional || decision) return 'decision';
      return owns ? 'run' : 'dead';
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
      return scryfallKeywords.has(kw) ? 'run' : 'dead';
    }
    default:
      return 'dead';
  }
}

if (!existsSync(SRC)) { console.error(`Missing ${SRC}`); process.exit(1); }

const L = [];
const say = s => { L.push(s); console.log(s); };

let promptable = 0;
let notOwned = 0;
const notOwnedWhy = new Map();
const notOwnedSamples = [];
const decisionKind = new Map();
let onlyDecisionIsTrigger = 0;

for await (const card of rows(SRC)) {
  if (NOT_A_CARD.has(card.layout) || NOT_A_GAME_PRODUCT.has(card.set_type) || NOT_A_NORMAL_GAME.has(card.layout)) continue;
  if (card.digital || !(card.games ?? []).includes('paper')) continue;

  const trace = compileWithTrace(card);
  const r = trace.result;
  if (trace.normalized.paragraphs.length === 0) continue;
  if (r.unparsed.length) continue;

  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const triggered = r.abilities.filter(a => a.kind === 'triggered');
  const owns = r.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);

  const vs = r.abilities.map(a => verdictOf(a, owns, scryfallKeywords));
  if (vs.some(v => v === 'manual' || v === 'dead')) continue;
  if (!vs.some(v => v === 'decision')) continue;
  if (r.abilities.length === 0) continue;

  promptable++;

  // The question: would a prompt alone finish this card?
  const decisionAbilities = r.abilities.filter((_, i) => vs[i] === 'decision');
  const trig = decisionAbilities.filter(a => a.kind === 'triggered');
  if (trig.length) onlyDecisionIsTrigger++;

  // For every decision-carrying trigger, would the bridge run it at all?
  const blocked = [];
  for (const a of trig) {
    const why = unrunnableReason(a);
    if (why) blocked.push(why);
  }
  if (blocked.length) {
    notOwned++;
    for (const b of blocked) bump(notOwnedWhy, b);
    if (notOwnedSamples.length < 25) {
      notOwnedSamples.push(`${card.name} :: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 130)}  ->  ${blocked[0]}`);
    }
  }
  for (const a of decisionAbilities) bump(decisionKind, a.kind);
}

function bump(m, k) { m.set(k, (m.get(k) ?? 0) + 1); }

say('PROMPTABLE AUDIT — would a prompt alone finish the card?');
say('');
say(`PROMPTABLE cards                                        ${promptable}`);
say(`  of those, at least one decision is on a TRIGGERED ability  ${onlyDecisionIsTrigger}`);
say(`  of those, a decision-carrying trigger the bridge REFUSES   ${notOwned}`);
say('');
say('why the bridge refuses them:');
for (const [k, v] of [...notOwnedWhy.entries()].sort((a, b) => b[1] - a[1])) say(`  ${String(v).padStart(5)}  ${k}`);
say('');
say('samples:');
for (const s of notOwnedSamples) say(`  ${s}`);
say('');
say('the decision-carrying abilities, by kind:');
for (const [k, v] of [...decisionKind.entries()].sort((a, b) => b[1] - a[1])) say(`  ${String(v).padStart(5)}  ${k}`);
say('');
say(`So the number of PROMPTABLE cards a prompt ALONE would finish is ${promptable - notOwned}, not ${promptable}.`);

writeFileSync(OUT, L.join('\n'));
console.log(`\nwrote ${OUT}`);
