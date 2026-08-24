#!/usr/bin/env node
/**
 * WHAT THE THREE NEW VERBS ARE WORTH IF A SURFACE EVER DRAWS THEIR QUESTION.
 *
 * `do-if-cost-paid`, `scry`, `surveil` and `look-and-pick` are all DECISIONS,
 * so a card carrying one is PROMPTABLE and not PROMPTED, and PROMPTABLE is not
 * in the headline. That is the correct grading and it is why the sum did not
 * move. It is also a number, and this script is the only place it is stated.
 *
 * `verify-ability-coverage.mjs` separates PROMPTED from PROMPTABLE on one test:
 * every decision the card carries has to be one the engine measurably OFFERS
 * with its legal options and then honours. None of these four are, because no
 * file under `src/components`, `src/pages` or `src/hooks` draws one.
 *
 * So this reads the per-card dump and counts, for each verb, how many cards
 * carry that decision AND NOTHING ELSE that is unasked. Those are exactly the
 * cards that would cross into PROMPTED on the day a surface exists — no sooner,
 * and not because of any further work on the port.
 *
 * A CEILING, not a forecast. Nothing here says a person would enjoy answering
 * these, and nothing here has been played.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. Nothing is vendored
 * and no XMage display string is copied. Forge is GPL-3.0 and was not fetched,
 * read or referenced.
 *
 * Run: DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 *      node scripts/xmage/port-grow-price.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
if (!existsSync(VERDICTS)) {
  console.error(`Missing ${VERDICTS}. Run DM_CARD_DUMP=1 verify-ability-coverage.mjs first.`);
  process.exit(1);
}

const dump = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const NEW_VERBS = ['do-if-cost-paid', 'scry', 'surveil', 'look-and-pick'];

/** A decision line the probe already measured somebody answering. */
const asked = (line) => line.endsWith('[asked]');
const verbOf = (line) => NEW_VERBS.find((v) => line.endsWith(`contains ${v}`)) ?? null;

const rows = [];
for (const verb of [...NEW_VERBS, '(any of the four)']) {
  const wanted = verb === '(any of the four)' ? NEW_VERBS : [verb];
  let carries = 0;
  let soleBlocker = 0;
  let alreadyPassing = 0;
  const bySource = new Map();
  for (const card of dump.cards) {
    const dec = card.dec ?? [];
    if (!dec.some((line) => wanted.includes(verbOf(line)))) continue;
    carries += 1;
    if (card.v === 'AUTOMATED' || card.v === 'PROMPTED') { alreadyPassing += 1; continue; }
    if (card.v !== 'PROMPTABLE') continue;
    // PROMPTABLE, so at least one decision is unasked. Is every unasked one a
    // verb from this set? If so, a surface for these verbs alone moves the card.
    const unasked = dec.filter((line) => !asked(line));
    if (unasked.length === 0) continue;
    if (!unasked.every((line) => wanted.includes(verbOf(line)))) continue;
    soleBlocker += 1;
    bySource.set(card.s, (bySource.get(card.s) ?? 0) + 1);
  }
  rows.push({ verb, carries, alreadyPassing, soleBlocker, bySource: [...bySource].sort((a, b) => b[1] - a[1]) });
}

const N = dump.cards.length;
console.log(`pool ${N}   verdicts ${JSON.stringify(dump.tally)}`);
console.log('');
console.log('verb                 carries   already passing   would move if asked   by source');
for (const r of rows) {
  console.log(
    `${r.verb.padEnd(20)} ${String(r.carries).padStart(7)}   ${String(r.alreadyPassing).padStart(15)}   ${String(r.soleBlocker).padStart(19)}   ${r.bySource.map(([s, n]) => `${s} ${n}`).join(', ')}`,
  );
}

const any = rows[rows.length - 1];
const sum = (dump.tally.AUTOMATED ?? 0) + (dump.tally.PROMPTED ?? 0);
console.log('');
console.log(`AUTOMATED + PROMPTED today: ${sum} (${((sum / N) * 100).toFixed(2)}%)`);
console.log(
  `with a surface that draws these four questions and nothing else: ${sum + any.soleBlocker} (${(((sum + any.soleBlocker) / N) * 100).toFixed(2)}%), plus ${((any.soleBlocker / N) * 100).toFixed(2)} points`,
);
console.log('That is a CEILING. Nothing has been played and no surface exists.');
