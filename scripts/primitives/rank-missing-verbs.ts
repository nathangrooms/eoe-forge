/**
 * The other half of the ranking: cards the compiler calls `partial`.
 *
 *   node --experimental-strip-types scripts/primitives/rank-missing-verbs.ts
 *
 * `rank-engine-primitives.ts` ranks paths that block cards the compiler has
 * already modelled completely. This one ranks the verbs that stop it modelling
 * them at all — the `{do:'manual'}` markers and the `unparsed` clauses. A verb
 * here needs three things before a card runs (DSL member, compiler rule, engine
 * handler), so its cards are more expensive than a `missing` path in the other
 * table, and the two rankings must not be merged into one league.
 *
 * Buckets are keyed on the leading words of the NORMALISED clause, so
 * "Scry 2." and "scry 3." land together and nothing is bucketed by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileCardAbilities } from '../../src/lib/cards/abilities/compiler.ts';
import { effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import type { Ability, Effect } from '../../src/lib/cards/abilities/dsl.ts';
import type { AbilityCard } from '../../src/lib/cards/abilities/normalize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, 'scripts', 'primitives', '.data');

function walk(effects: readonly Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of effects ?? []) {
    out.push(e);
    if (e.do === 'if') { walk(e.then, out); walk(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') walk(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) walk(m.effects, out);
  }
  return out;
}

function allEffects(abilities: readonly Ability[]): Effect[] {
  const out: Effect[] = [];
  for (const a of abilities) walk(effectsOf(a), out);
  return out;
}

/** Leading words, digits folded to N, card names already stripped by normalize. */
function bucket(text: string, words: number): string {
  return text
    .toLowerCase()
    .replace(/[.,;:()"']/g, ' ')
    .replace(/\b\d+\b/g, 'N')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, words)
    .join(' ');
}

const printings: AbilityCard[] = JSON.parse(readFileSync(join(dataDir, 'catalogue.json'), 'utf8'));
const byOracle = new Map<string, AbilityCard>();
for (const card of printings) {
  const id = card.oracle_id ?? card.name ?? '';
  if (!byOracle.has(id)) byOracle.set(id, card);
}

/** cards keyed by bucket, and each card's full blocker-bucket set. */
const manualHist = new Map<string, Set<string>>();
const unparsedHist = new Map<string, Set<string>>();
const blockersOf = new Map<string, Set<string>>();
let partial = 0;

for (const [id, card] of byOracle) {
  let compiled;
  try { compiled = compileCardAbilities(card); } catch { continue; }
  if (compiled.coverage !== 'partial') continue;
  partial++;
  const keys = new Set<string>();
  for (const e of allEffects(compiled.abilities)) {
    if (e.do !== 'manual') continue;
    const b = 'manual: ' + bucket(e.text, 3);
    keys.add(b);
    if (!manualHist.has(b)) manualHist.set(b, new Set());
    manualHist.get(b)!.add(id);
  }
  for (const u of compiled.unparsed) {
    const b = `unparsed[${u.reason}]: ` + bucket(u.text, 3);
    keys.add(b);
    if (!unparsedHist.has(b)) unparsedHist.set(b, new Set());
    unparsedHist.get(b)!.add(id);
  }
  blockersOf.set(id, keys);
}

/** `solo` = cards this bucket is the ONLY thing standing in the way of. */
const solo = (b: string) => [...blockersOf.values()].filter((s) => s.size === 1 && s.has(b)).length;

const rows = [
  ...[...manualHist].map(([b, s]) => ({ bucket: b, cards: s.size, solo: solo(b) })),
  ...[...unparsedHist].map(([b, s]) => ({ bucket: b, cards: s.size, solo: solo(b) })),
].sort((a, b) => b.solo - a.solo || b.cards - a.cards);

writeFileSync(join(dataDir, 'missing-verb-order.json'), JSON.stringify({ partialCards: partial, rows }, null, 2));

console.log(`cards with coverage === 'partial'   ${partial}`);
console.log('');
console.log('   solo   touches  bucket   (solo = this is the ONLY blocker on the card)');
for (const r of rows.slice(0, 45)) {
  console.log(`  ${String(r.solo).padStart(5)}  ${String(r.cards).padStart(8)}  ${r.bucket}`);
}
