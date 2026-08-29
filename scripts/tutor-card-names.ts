/**
 * Which of the fifty questions actually reaches a card, and where the ones that
 * do not are lost.
 *
 * The live run answers what a player gets. This answers why. `cardNamedInQuestion`
 * in `answer/index.ts` is not exported, so the body below is a VERBATIM COPY of
 * it, kept beside the real thing rather than paraphrased. It calls the real
 * `extractCardNames` and the real `cardByName` against the real catalogue, so
 * the only thing copied is the ten lines of control flow.
 *
 * It prints every candidate the extractor offered, in the order the function
 * tries them, and says which one was accepted or why each was thrown out.
 *
 *   deno run --allow-read --allow-net --allow-env --allow-write scripts/tutor-card-names.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { extractCardNames } from '../supabase/functions/mtg-brain/resolve-cards.ts';
import { cardByName } from '../supabase/functions/mtg-brain/answer/catalogue.ts';

const db = createClient(
  'https://udnaflcohfyljrsgqggy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g',
  { auth: { persistSession: false } },
);

async function named(question: string) {
  const { names } = extractCardNames(question);
  const asked = question.toLowerCase();
  const present = names.filter(n => n.length >= 4 && asked.includes(n.toLowerCase()));
  const worthTrying = [...present].sort((a, b) => b.length - a.length).slice(0, 4);
  const trace: string[] = [];
  for (const candidate of worthTrying) {
    const found = await cardByName(db, candidate);
    if (!found.ok || !found.value) { trace.push(`${candidate}: no card`); continue; }
    const resolved = found.value.name.toLowerCase().split(' // ')[0];
    if (!asked.includes(resolved)) { trace.push(`${candidate}: resolved to ${found.value.name}, not in the question`); continue; }
    const isAFragment = present.some(o => o.toLowerCase() !== resolved && o.toLowerCase().includes(resolved) && o.length > resolved.length);
    if (isAFragment) { trace.push(`${candidate}: resolved to ${found.value.name}, THROWN OUT as a fragment`); continue; }
    trace.push(`${candidate}: ACCEPTED ${found.value.name}`);
    return { name: found.value.name, trace, tried: worthTrying };
  }
  return { name: null, trace, tried: worthTrying };
}

const q = JSON.parse(await Deno.readTextFile('scripts/tutor-fifty.json'));
const out: any[] = [];
for (const x of q.questions) {
  const r = await named(x.q);
  out.push({ id: x.id, question: x.q, card: r.name, tried: r.tried, trace: r.trace });
  console.log(`${x.id} -> ${r.name ?? 'NO CARD'}  tried=[${r.tried.join(' ; ')}]`);
  for (const t of r.trace) console.log(`      ${t}`);
}
await Deno.writeTextFile('scratch/tutor-card-names.json', JSON.stringify(out, null, 2));
