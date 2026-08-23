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
import { LOWERINGS, lowerCard, xmageBodyLowerings } from '../../src/lib/cards/xmage/lower.ts';
import { hasManualEffect, effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import { TRANSLATED_BODIES } from '../../src/lib/game/xmage/bodies.generated.ts';

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

/* ------------------------------------------------------------------ *
 * The card-local bodies, joined in here and nowhere else
 * ------------------------------------------------------------------ */

/**
 * `TRANSLATED_BODIES` lives in `src/lib/game/`, because a translated body calls
 * a runtime facade that reads a `GameState`. `lower.ts` lives in
 * `src/lib/cards/` and is imported BY the game layer, so it cannot import back.
 *
 * This script is the only place the two meet. It runs offline, under node, where
 * importing both is free, and what ships is the RESULT: a `{do:'xmage-body'}`
 * pointer in `lowered.generated.ts` and the body itself in the file it already
 * lived in. No new module edge in the app.
 *
 * ## Only the substantive half is offered
 *
 * Half of `TRANSLATED_BODIES` is `trivial: true` — a body that is nothing but
 * `return true;` or `return false;`. Those are required overrides on an
 * `AsThoughEffect` or a `ContinuousEffect` whose real behaviour lives in a
 * different method that was never translated. They translate perfectly and they
 * are worth nothing, and a card lowered to one would RESOLVE and do nothing,
 * which is the failure this whole port keeps making. They are excluded here, and
 * `to-actions.ts` refuses them a second time at the point of use.
 */
const bodyKeys = Object.entries(TRANSLATED_BODIES)
  .filter(([, body]) => !body.trivial)
  .map(([key]) => key);

const LOWERINGS_WITH_BODIES = { ...LOWERINGS, ...xmageBodyLowerings(bodyKeys) };

stats.translatedBodiesAvailable = Object.keys(TRANSLATED_BODIES).length;
stats.translatedBodiesSubstantive = bodyKeys.length;
stats.cardsUsingABody = 0;
stats.bodyPointers = 0;

/** Every `{do:'xmage-body'}` anywhere in these abilities, at any depth. */
function countBodyPointers(value) {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countBodyPointers(v), 0);
  if (!value || typeof value !== 'object') return 0;
  let n = value.do === 'xmage-body' ? 1 : 0;
  for (const v of Object.values(value)) n += countBodyPointers(v);
  return n;
}

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

  const lowered = lowerCard(record, LOWERINGS_WITH_BODIES);

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

  // Counted by walking the whole ability, not `effectsOf`. `effectsOf` returns
  // an ability's TOP-LEVEL effects, and a pointer can sit inside a mode or an
  // `if`. The first version of this counter used `effectsOf` and reported 173
  // where the file held 176, which is a header disagreeing with the data
  // underneath it.
  const pointers = countBodyPointers(abilities);
  if (pointers > 0) {
    stats.cardsUsingABody++;
    stats.bodyPointers += pointers;
  }

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
 * Of the emitted cards, ${stats.cardsUsingABody} carry at least one
 * \`{do:'xmage-body'}\` pointer (${stats.bodyPointers} pointers in total) at a
 * machine-translated XMage body in \`src/lib/game/xmage/bodies.generated.ts\`.
 * ${stats.translatedBodiesSubstantive} substantive bodies were offered, out of
 * ${stats.translatedBodiesAvailable} translated. A pointer answers the
 * RESOLUTION question only: it carries no verb, so the deck-building,
 * recommendation and optimisation consumers get nothing from it.
 *
 * XMage commit: ${meta.commit}
 *
 * There is deliberately NO BUILD TIMESTAMP here. There was one, and it was the
 * only thing in this file that differed between two runs over identical
 * inputs: every record matched byte for byte and the file hashes still did not,
 * so "the generator output is byte-reproducible" was a gate that could be
 * claimed and never checked. The XMage commit above is what actually identifies
 * the input, and unlike a clock it reads the same on every machine that
 * regenerates from it.
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
console.log('  bodies offered          ', stats.translatedBodiesSubstantive, `(of ${stats.translatedBodiesAvailable} translated)`);
console.log('  cards using one         ', stats.cardsUsingABody, `(${stats.bodyPointers} pointers)`);
console.log('bytes                     ', size, `(${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log('wrote', OUT);
