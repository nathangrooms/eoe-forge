/**
 * Fifteen cards, our compiled abilities against what XMage actually implements.
 *
 * The XMage side is NOT from memory. It comes from `scratch/xmage-ground-truth.json`,
 * which `scripts/xmage-ground-truth.mjs` built by reading a pinned MIT-licensed
 * checkout at C:/Users/natha/Software/xmage: the set files name a card class per
 * card, and the class's imports name the engine classes that card is assembled
 * from. 32,156 card names are in that map.
 *
 * The comparison is not "same number of things". An XMage class list includes
 * framework base types (Ability, Effect, OneShotEffect) that carry no behaviour,
 * and splits one line into several classes. What it is good for is a yes/no per
 * behaviour: does XMage carry a class for a thing we compiled nothing for, or
 * did we compile something XMage has no class for at all.
 *
 * The fifteen are chosen by a stated rule, not by eye:
 *   A. five we call AUTOMATED, evenly spaced through that list
 *   B. five my advisory-keyword-grant check flagged
 *   C. five the tranche reports name by hand
 *
 * Usage: node --experimental-strip-types scripts/verify-xmage-spotcheck.mjs
 * Local files only. No Supabase, no network, no model.
 */

import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const XMAGE = join(ROOT, 'scratch', 'xmage-ground-truth.json');
const AUDIT = join(ROOT, 'scratch', 'verify-automated-audit.json');
const OUT = join(ROOT, 'scratch', 'verify-xmage-spotcheck.txt');

if (!existsSync(XMAGE)) { console.error(`Missing ${XMAGE}`); process.exit(1); }
if (!existsSync(AUDIT)) { console.error(`Missing ${AUDIT} — run verify-automated-audit.mjs first`); process.exit(1); }

const xmage = JSON.parse(readFileSync(XMAGE, 'utf8'));
const classesFor = xmage.cardToClasses ?? {};
const audit = JSON.parse(readFileSync(AUDIT, 'utf8'));

/* The three groups, by the stated rule. */
const step = Math.floor(audit.length / 5);
const groupA = [0, 1, 2, 3, 4].map(i => audit[i * step].name);
const groupB = ['Corrosive Mentor', 'Wingrattle Scarecrow', 'Ekthi, Contaminator Priest', 'Sun Quan, Lord of Wu', 'Lord of Atlantis'];
const groupC = ['Peregrine Drake', 'Great Whale', 'Kazandu Stomper', 'Ruby Medallion', 'Welkin Tern'];
const WANT = [...groupA, ...groupB, ...groupC];
const groupOf = name => (groupA.includes(name) ? 'A automated' : groupB.includes(name) ? 'B advisory grant' : 'C named in the reports');

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

const found = new Map();
for await (const c of rows(SRC)) if (WANT.includes(c.name) && !found.has(c.name)) found.set(c.name, c);

/** Behaviour-bearing XMage classes: drop framework base types. */
const FRAMEWORK = new Set([
  'mage.abilities.Ability',
  'mage.abilities.effects.Effect',
  'mage.abilities.effects.OneShotEffect',
  'mage.abilities.effects.ContinuousEffect',
  'mage.abilities.condition.Condition',
  'mage.abilities.dynamicvalue.DynamicValue',
  'mage.abilities.effects.ReplacementEffectImpl',
  'mage.abilities.StaticAbility',
  'mage.abilities.TriggeredAbilityImpl',
]);
const shortName = c => c.split('.').pop();

const L = [];
const say = s => { L.push(s); console.log(s); };

say('XMAGE SPOT CHECK — 15 cards');
say(`xmage source: ${xmage.source?.repo} @ ${xmage.source?.commit} (${xmage.source?.licence})`);
say(`card->class map: ${Object.keys(classesFor).length} names`);
say('');

let mismatches = 0;
const summary = [];

for (const name of WANT) {
  const card = found.get(name);
  say('='.repeat(76));
  say(`${name}   [group ${groupOf(name)}]`);
  if (!card) { say('  NOT IN THE POOL'); continue; }

  const trace = compileWithTrace(card);
  const r = trace.result;
  say(`  type: ${card.type_line}`);
  say(`  oracle: ${String(card.oracle_text ?? '').replace(/\n/g, ' | ')}`);
  say(`  OURS  coverage=${r.coverage}  abilities=${r.abilities.length}  unparsed=${r.unparsed.length}`);

  const triggered = r.abilities.filter(a => a.kind === 'triggered');
  const owns = r.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);

  for (const a of r.abilities) {
    const manual = hasManualEffect(effectsOf(a));
    const kw = a.kind === 'keyword' ? ` ${a.keyword} (${keywordSupport(String(a.keyword ?? ''))})` : '';
    say(`    - ${a.kind}${kw}${manual ? '  [{do:manual}]' : ''}  ${JSON.stringify(a).slice(0, 220)}`);
  }
  for (const u of r.unparsed) say(`    ! unparsed (${u.reason}): ${u.text.replace(/\n/g, ' ')}`);
  say(`  engine owns triggers: ${owns}`);

  const xs = classesFor[name];
  if (!xs) { say('  XMAGE: card name not in the map'); mismatches++; summary.push(`${name}: not in XMage map`); continue; }
  const behaviour = xs.filter(c => !FRAMEWORK.has(c));
  say(`  XMAGE ${xs.length} classes, ${behaviour.length} behaviour-bearing:`);
  for (const c of behaviour) say(`    + ${shortName(c)}   (${c})`);
  summary.push({ name, ours: r.abilities.length, unparsed: r.unparsed.length, coverage: r.coverage, xmage: behaviour.map(shortName) });
}

say('');
say('='.repeat(76));
writeFileSync(OUT, L.join('\n'));
console.log(`\nwrote ${OUT}`);
