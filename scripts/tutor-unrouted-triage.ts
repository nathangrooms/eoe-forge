/**
 * Why each of the twenty-eight unrouted questions went nowhere, from the
 * deployed router itself rather than from reading the table by eye.
 *
 * `chooseAsk` is the phrase match. `route` adds the subject. A question can
 * fail at either step and the two failures need different fixes, so they are
 * reported apart:
 *
 *   NO PHRASE     nothing in ASKS matched the words. Fix: add a cue.
 *   NO SUBJECT    an ask matched and then had nothing to be about. Fix:
 *                 either widen `subjects`, or find the card the question named.
 *
 * Run with the repo's own runner, which strips types:
 *   node --experimental-strip-types scripts/tutor-unrouted-triage.ts
 */

import { readFileSync } from 'node:fs';
import { chooseAsk, route } from '../supabase/functions/mtg-brain/answer/route.ts';

const run = JSON.parse(readFileSync(new URL('./tutor-fifty-answers.json', import.meta.url), 'utf8'));

const unrouted = run.results.filter((r: any) => !r.routing || !r.routing.ask);

let noPhrase = 0;
let noSubject = 0;

for (const r of unrouted) {
  const choice = chooseAsk(r.question);
  // The harness attached a deck for some questions and never a card in focus.
  const have = { card: false, deck: Boolean(r.deck_attached), catalogue: true as const };
  const routed = route(r.question, have);

  if (!choice) {
    noPhrase++;
    console.log(`${r.id}  NO PHRASE    ${r.question}`);
  } else {
    noSubject++;
    console.log(
      `${r.id}  NO SUBJECT   ask=${choice.ask.id} cue="${choice.cue}" wants=${choice.ask.subjects.join('/')} ` +
        `missing=${routed?.missing ?? '?'}   ${r.question}`
    );
  }
}

console.log(`\nno phrase matched: ${noPhrase}   phrase matched but no subject: ${noSubject}   total ${unrouted.length}`);
