#!/usr/bin/env node
/**
 * Emit the ported XMage behaviour as a file the SHIPPED APP can read.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place by `build-records.mjs` and nothing from it is vendored here. Display
 * string CONTENTS are never copied: those carry Wizards of the Coast rules
 * text, which is not XMage's to license, so the `text` on every emitted ability
 * comes from Scryfall's oracle text instead. Forge is GPL-3.0 and was not
 * fetched, read or referenced.
 *
 * ## Why this script exists
 *
 * `docs/engine/PORT-LOG.md` section 3 ends on the line that made this job:
 * "Nothing outside `src/lib/cards/xmage/` imports this module. So the number of
 * cards the shipped app plays from these records today is 0."
 *
 * It could not import it. `lowerCard` needs a `CardRecord`, `buildRecord` needs
 * a 90 MB NDJSON extraction and a checkout of XMage, and neither exists in a
 * browser. So the port was not unreachable because somebody forgot to write an
 * import; it was unreachable because there was no artifact to import. This
 * script produces that artifact: run the whole lowering once, here, offline,
 * and write the RESULT — `Ability[]` in `dsl.ts` shapes, keyed by Scryfall
 * oracle id — into a JSON file that ships.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/emit-lowered.mjs
 *
 * Reads:  the same two files `build-records.mjs` reads.
 * Writes: src/lib/cards/xmage/lowered.generated.ts
 *
 * A generated `.ts` rather than a `.json`, to match `tokens.generated.ts` and
 * `counters.generated.ts` next to it, and because a JSON module needs an import
 * attribute that `tsc`, Vite and `node --experimental-strip-types` each want
 * spelled slightly differently. There is nothing to gain from being the one
 * file in the folder that is loaded a different way.
 *
 * Every figure it prints is counted over every record the extraction produced.
 * Nothing is sampled and nothing is estimated.
 */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/lower.ts';
import { hasManualEffect, effectsOf } from '../../src/lib/cards/abilities/dsl.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO, 'src', 'lib', 'cards', 'xmage', 'lowered.generated.ts');

/* ------------------------------------------------------------------ *
 * What is allowed into the file, and why each bar is here
 *
 * Each of these drops real cards. Every one is a decision rather than an
 * omission, in the same spirit as PORT-LOG.md section 5.
 * ------------------------------------------------------------------ */

/**
 * A record whose join to Scryfall was not exact is a record that may describe a
 * DIFFERENT CARD. `Provenance.join` exists precisely so that is visible, and
 * shipping behaviour under the wrong oracle id is the worst failure available
 * here: the card would run, and it would be someone else's card.
 */
const JOIN_MUST_BE = 'exact';

const stats = {
  records: 0,
  noOracleId: 0,
  badJoin: 0,
  duplicateOracleId: 0,
  blocked: 0,
  vacuous: 0,
  manualEffect: 0,
  emitted: 0,
  abilities: 0,
};

const { records, meta } = await loadRecords();

/** oracle id -> lowered abilities. */
const table = Object.create(null);
const seen = new Set();

for (const record of records) {
  stats.records++;

  if (!record.oracleId) {
    stats.noOracleId++;
    continue;
  }
  if (record.provenance?.join !== JOIN_MUST_BE) {
    stats.badJoin++;
    continue;
  }

  const lowered = lowerCard(record);

  // ALL OR NOTHING, the same bar `lowerCard` and PORT-LOG.md already use. A
  // card whose second ability did not lower is a card that would run half of
  // itself and say nothing about the other half, which is the single failure
  // mode this project has now made three times.
  if (!lowered.ok) {
    stats.blocked++;
    continue;
  }
  if (lowered.vacuous) {
    stats.vacuous++;
    continue;
  }

  const abilities = lowered.abilities.map((a) => a.ability).filter(Boolean);
  if (abilities.length === 0) {
    stats.vacuous++;
    continue;
  }

  // A lowering that produced a `{do:'manual'}` marker is a lowering that says
  // "a human finishes this", and it cannot beat the compiler at anything. It is
  // dropped here rather than at read time so the shipped file contains only
  // records that could actually change a verdict.
  if (abilities.some((a) => hasManualEffect(effectsOf(a)))) {
    stats.manualEffect++;
    continue;
  }

  // Two XMage classes joined to one oracle id. Keeping the first is arbitrary,
  // so keep neither: an arbitrary choice between two behaviours is a per-case
  // judgement, and the whole point of the precedence rule is that there are
  // none of those.
  if (seen.has(record.oracleId)) {
    stats.duplicateOracleId++;
    delete table[record.oracleId];
    continue;
  }
  seen.add(record.oracleId);

  table[record.oracleId] = abilities;
  stats.emitted++;
  stats.abilities += abilities.length;
}

const body = JSON.stringify(table);

const file = `/**
 * GENERATED by scripts/xmage/emit-lowered.mjs. Do not edit by hand.
 *
 * The ported XMage behaviour, already lowered into \`dsl.ts\` \`Ability\` shapes
 * and keyed by Scryfall \`oracle_id\`. This is the file that makes the port
 * reachable: everything else in this folder needs a checkout of XMage and a
 * 90 MB extraction to produce an ability, and a browser has neither.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage's own display strings are
 * NOT copied: those carry Wizards of the Coast rules text, which is not
 * XMage's to license, so every \`text\` below is the empty string and the reader
 * in \`lowered.ts\` fills it from Scryfall's oracle text. Forge is GPL-3.0 and
 * was not fetched, read or referenced.
 *
 * Census, counted over all ${stats.records} records the extraction produced:
 *
 *   no Scryfall oracle id          ${String(stats.noOracleId).padStart(6)}
 *   join to Scryfall not exact     ${String(stats.badJoin).padStart(6)}
 *   at least one ability refused   ${String(stats.blocked).padStart(6)}
 *   no abilities at all            ${String(stats.vacuous).padStart(6)}
 *   lowered to a {do:'manual'}     ${String(stats.manualEffect).padStart(6)}
 *   two XMage classes, one card    ${String(stats.duplicateOracleId).padStart(6)}
 *   EMITTED                        ${String(stats.emitted).padStart(6)}  (${stats.abilities} abilities)
 *
 * XMage commit: ${meta.commit}
 * Built: ${new Date().toISOString()}
 */

import type { Ability } from '../abilities/dsl.ts';

/** Scryfall \`oracle_id\` to the whole card's abilities. All or nothing per card. */
export const XMAGE_LOWERED: Readonly<Record<string, readonly Ability[]>> = ${body} as unknown as Readonly<Record<string, readonly Ability[]>>;

export const XMAGE_LOWERED_STATS = ${JSON.stringify(stats)} as const;
`;

writeFileSync(OUT, file);

const size = file.length;
console.log('records read              ', stats.records);
console.log('  no oracle id            ', stats.noOracleId);
console.log('  join not exact          ', stats.badJoin);
console.log('  an ability did not lower', stats.blocked);
console.log('  no abilities at all     ', stats.vacuous);
console.log('  lowered to a manual mark', stats.manualEffect);
console.log('  two classes, one card   ', stats.duplicateOracleId);
console.log('EMITTED                   ', stats.emitted, `(${stats.abilities} abilities)`);
console.log('bytes                     ', size, `(${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log('wrote', OUT);
