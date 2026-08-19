/**
 * Dump EVERY card the independent verifier calls AUTOMATED, with the full
 * paragraph-by-paragraph mapping, so a human can read the oracle text and check
 * that nothing was skipped.
 *
 * The all-clauses bar is the claim under test: "AUTOMATED" is supposed to mean
 * every clause on the card is understood and executed. This prints, per card,
 * every normalised paragraph and the ability it became, plus the engine verdict
 * for that ability and the citation for the consumer that runs it.
 *
 * Usage: node --experimental-strip-types scripts/verify-automated-audit.mjs [--sample N]
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
const OUT = join(ROOT, 'scratch', 'verify-automated-audit.json');

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);
const RESTRICTIONS_COMBAT_READS = new Set(['cant-attack', 'cant-block']);

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

/** Effect members to-actions.ts names and never resolves. */
const NEVER_RESOLVED = new Set(['pump', 'gain-control', 'search-library', 'return-from', 'add-mana', 'counter']);

function neverResolvedVerb(effects) {
  for (const e of effects ?? []) {
    if (NEVER_RESOLVED.has(e.do)) return e.do;
    if (e.do === 'if') { const r = neverResolvedVerb(e.then) ?? neverResolvedVerb(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      const r = neverResolvedVerb(e.effects); if (r) return r;
    }
    if (e.do === 'choose-mode') for (const m of e.modes) { const r = neverResolvedVerb(m.effects); if (r) return r; }
  }
  return null;
}

function abilityVerdict(ability, owns, scryfallKeywords) {
  if (hasManualEffect(effectsOf(ability))) return { s: 'manual', why: '{do:manual}' };
  const verb = neverResolvedVerb(effectsOf(ability));
  if (verb) return { s: 'dead', why: `to-actions.ts names "${verb}" and never resolves it` };
  const decision = decisionIn(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered':
      // Ownership first. See scripts/verify-promptable-audit.mjs.
      if (!owns) return { s: 'dead', why: unrunnableReason(ability) ?? 'card not owned' };
      if (ability.optional) return { s: 'decision', why: 'optional trigger' };
      if (decision) return { s: 'decision', why: `contains ${decision}` };
      return { s: 'run', why: 'triggers.ts:468' };
    case 'static':
      if (decision) return { s: 'decision', why: `contains ${decision}` };
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') return { s: 'dead', why: 'cost-modify unread' };
        if (m.layer === 'restriction' && !RESTRICTIONS_COMBAT_READS.has(m.rule?.rule)) {
          return { s: 'dead', why: `restriction ${m.rule?.rule} unread` };
        }
        // A layer-6 grant of a keyword combat.ts never asks about is a badge.
        if (m.layer === 'ability') {
          for (const g of (m.grant ?? [])) {
            const word = String(g).toLowerCase();
            if (keywordSupport(word) !== 'engine') return { s: 'dead', why: `grants advisory "${word}"` };
          }
        }
      }
      return { s: 'run', why: 'statics.ts -> layers' };
    case 'replacement': {
      const self = ability.event?.on === 'enters' && ability.selfReplacement;
      const r = ability.result ?? {};
      if (self && r.do === 'enters-tapped') return { s: 'run', why: 'intrinsic.ts' };
      if (self && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return { s: 'run', why: 'intrinsic.ts' };
      return { s: 'dead', why: 'intrinsic.ts derives no such result' };
    }
    case 'keyword': {
      const kw = String(ability.keyword ?? '');
      if (keywordSupport(kw) !== 'engine') return { s: 'dead', why: `advisory ${kw.toLowerCase()}` };
      if (!scryfallKeywords.has(kw.toLowerCase())) return { s: 'dead', why: `${kw.toLowerCase()} not in card.keywords` };
      return { s: 'run', why: 'keywords.ts' };
    }
    default:
      return { s: 'dead', why: `${ability.kind}: no consumer` };
  }
}

if (!existsSync(SRC)) { console.error(`Missing ${SRC}`); process.exit(1); }

const pool = [];
for await (const c of rows(SRC)) {
  if (NOT_A_CARD.has(c.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
  if (c.digital) continue;
  if (!(c.games ?? []).includes('paper')) continue;
  pool.push(c);
}

const automated = [];

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;
  if (trace.normalized.paragraphs.length === 0) continue;

  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);

  const per = result.abilities.map(a => ({ a, v: abilityVerdict(a, owns, scryfallKeywords) }));
  if (result.unparsed.length) continue;
  if (per.some(p => p.v.s !== 'run')) continue;
  if (result.abilities.length === 0) continue;

  let probe;
  try { probe = probeBehaviour(result.abilities); }
  catch (err) { probe = { outcome: 'threw', error: err.message, actions: 0, deferred: [] }; }
  if (probe.outcome === 'threw' || probe.outcome === 'deferred') continue;

  const abilityLines = new Set();
  for (const a of result.abilities) for (const l of String(a.text ?? '').split('\n')) if (l.trim()) abilityLines.add(l.trim());

  automated.push({
    name: card.name,
    type_line: card.type_line ?? '',
    mana_cost: card.mana_cost ?? '',
    pt: card.power != null ? `${card.power}/${card.toughness}` : '',
    scryfall_keywords: card.keywords ?? [],
    oracle_text: String(card.oracle_text ?? ''),
    paragraphs: trace.normalized.paragraphs.map(p => ({
      raw: p.raw,
      norm: p.norm,
      face: p.face,
      mapped: abilityLines.has(p.raw.trim()),
    })),
    abilities: per.map(p => ({
      kind: p.a.kind,
      text: p.a.text,
      keyword: p.a.keyword,
      verdict: p.v.s,
      why: p.v.why,
      json: JSON.stringify(p.a).slice(0, 900),
    })),
    probe: { outcome: probe.outcome, actions: probe.actions },
  });
}

writeFileSync(OUT, JSON.stringify(automated, null, 2));
console.log(`AUTOMATED cards written: ${automated.length}`);
console.log(`unmapped paragraphs across all of them: ${automated.reduce((n, c) => n + c.paragraphs.filter(p => !p.mapped).length, 0)}`);
console.log(`wrote ${OUT}`);
