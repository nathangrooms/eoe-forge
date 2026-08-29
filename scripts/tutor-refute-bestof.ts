/**
 * How often does the budget `best-of` path miss the statement timeout?
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-refute-bestof.ts
 *
 * The review that added the budget filter reported q34 refusing in one run of
 * six and answering in the other five, and called the timeout pre-existing. It
 * refused in all three of my first three runs, so the rate is measured here
 * rather than argued about. Two questions, ten runs each, alternating so a warm
 * cache from one does not flatter the other.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

const QUESTIONS = [
  'What is the best black removal spell under one dollar?',
  'What is the best white removal spell under two dollars?',
  'What are the best 3 mana counterspells in commander?',
];

const RUNS = 8;
const tally: Record<string, { ok: number; refused: number; ms: number[] }> = {};
for (const q of QUESTIONS) tally[q] = { ok: 0, refused: 0, ms: [] };

for (let i = 0; i < RUNS; i++) {
  for (const q of QUESTIONS) {
    const t = performance.now();
    const worked = await answerFromCatalogue({
      message: q,
      deckContext: null,
      deckCards: [],
      identity: [],
      db,
      userDb: null,
    });
    const ms = Math.round(performance.now() - t);
    tally[q].ms.push(ms);
    const failed = /could not be read just now/.test(worked?.message ?? '');
    if (failed) tally[q].refused++;
    else tally[q].ok++;
    console.log(`run ${i + 1}  ${failed ? 'REFUSED' : 'ok     '}  ${String(ms).padStart(5)} ms  ${q}`);
  }
}

console.log('\n--- summary ---');
for (const q of QUESTIONS) {
  const t = tally[q];
  const sorted = [...t.ms].sort((a, b) => a - b);
  console.log(
    `${t.refused}/${RUNS} refused   min ${sorted[0]} median ${sorted[Math.floor(sorted.length / 2)]} max ${sorted[sorted.length - 1]} ms   ${q}`
  );
}
