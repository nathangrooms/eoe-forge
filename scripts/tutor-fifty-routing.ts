/**
 * Which of the fifty questions the router recognises at all.
 *
 * The live run in `tutor-fifty-run.mjs` is the measurement. This is the
 * diagnostic beside it, and it answers one question the live run cannot:
 * a request that came back with no `routing` field either matched no phrase in
 * the table, or matched one and then had nothing to be about. Those are
 * different defects with different fixes, and the response looks the same for
 * both.
 *
 * It calls `chooseAsk` out of the deployed router itself rather than a copy, so
 * it cannot drift from what the function does. `chooseAsk` needs no database:
 * it is the phrase table and nothing else. Whether a card was found is left to
 * the live run, which had the catalogue in front of it.
 *
 *   deno run --allow-read scripts/tutor-fifty-routing.ts
 */

import { chooseAsk, pointsAtSomething, roleFrom } from '../supabase/functions/mtg-brain/answer/route.ts';

const questions = JSON.parse(await Deno.readTextFile('scripts/tutor-fifty.json'));

const rows = questions.questions.map((q: any) => {
  const choice = chooseAsk(q.q);
  return {
    id: q.id,
    question: q.q,
    deck: q.deck ?? null,
    ask: choice?.ask.id ?? null,
    cue: choice?.cue ?? null,
    gap: choice?.ask.gap ?? null,
    subjects: choice?.ask.subjects ?? null,
    points_at_something: pointsAtSomething(q.q),
    role_named: roleFrom(q.q)?.says ?? null,
  };
});

console.log(JSON.stringify(rows, null, 2));
