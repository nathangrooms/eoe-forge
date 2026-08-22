/**
 * Which cards compile to a `kind:'spell'` ability, and which do not.
 *
 *   node --experimental-strip-types scripts/measure-spell-ability-shape.mjs
 *
 * ## Why this number is load-bearing
 *
 * `stack.ts` runs every `kind:'spell'` ability on a resolving stack object
 * without first checking the card's type line. That is only safe if the compiler
 * never emits one for a permanent, because a creature spell resolving IS the
 * creature entering, and running a spell body as well would do the card's text
 * twice.
 *
 * So `compiledSpellActions` cites a count, and this is the script that produces
 * it rather than a number somebody remembered. Coverage on this project has been
 * misreported before by quoting a figure whose denominator nobody could name.
 *
 * Reads the cached Scryfall bulk file only. No network, no database, no model.
 * Prints counts and a handful of names; writes nothing to the repository, and
 * reproduces no oracle text.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileCardAbilities } from '../src/lib/cards/abilities/compiler.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Cached bulk file only; this script never downloads.`);
  process.exit(1);
}

const IS_INSTANT_OR_SORCERY = /\b(Instant|Sorcery)\b/;

let instantSorcery = 0;
let instantSorceryWithSpell = 0;
let permanent = 0;
let permanentWithSpell = 0;
let skipped = 0;
const permanentSamples = [];

const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });

for await (const line of rl) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (!row.type_line || row.digital) continue;

  let compiled;
  try {
    compiled = compileCardAbilities({
      id: row.id,
      oracle_id: row.oracle_id,
      name: row.name,
      type_line: row.type_line,
      oracle_text: row.oracle_text ?? null,
      keywords: row.keywords ?? [],
      mana_cost: row.mana_cost ?? null,
      cmc: row.cmc ?? null,
      power: row.power ?? null,
      toughness: row.toughness ?? null,
    });
  } catch {
    skipped++;
    continue;
  }

  const hasSpellBody = compiled.abilities.some(ability => ability.kind === 'spell');

  if (IS_INSTANT_OR_SORCERY.test(row.type_line)) {
    instantSorcery++;
    if (hasSpellBody) instantSorceryWithSpell++;
    continue;
  }

  permanent++;
  if (!hasSpellBody) continue;
  permanentWithSpell++;
  // Every name here is a card `stack.ts` would run twice. An empty list is the
  // whole point of the script; a non-empty one is a bug report.
  if (permanentSamples.length < 25) permanentSamples.push(`${row.name} [${row.type_line}]`);
}

const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

console.log('');
console.log('Cards compiling to at least one `kind:"spell"` ability');
console.log('-----------------------------------------------------');
console.log(`instants and sorceries   ${instantSorceryWithSpell} of ${instantSorcery}  (${pct(instantSorceryWithSpell, instantSorcery)}%)`);
console.log(`permanents               ${permanentWithSpell} of ${permanent}  (${pct(permanentWithSpell, permanent)}%)`);
if (skipped > 0) console.log(`rows the compiler threw on, excluded from both  ${skipped}`);
console.log('');

if (permanentWithSpell === 0) {
  console.log('SAFE. `compiledSpellActions` may run every spell body it finds without');
  console.log('checking the type line, because no permanent has one.');
  process.exit(0);
}

console.log('NOT SAFE. These permanents carry a spell body, and `stack.ts` would run it');
console.log('on top of whatever the permanent does once it is on the battlefield:');
for (const name of permanentSamples) console.log(`  ${name}`);
process.exitCode = 1;
