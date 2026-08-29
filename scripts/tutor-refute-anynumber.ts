/**
 * The thirteen cards that carry their OWN copy limit in their printed text,
 * asked of the `copies` ask.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-refute-anynumber.ts
 *
 * `A deck can have any number of cards named Relentless Rats.` is on the card.
 * `ALL_FORMATS.cardLimits.exceptions` holds only Vintage's restricted list, so
 * `cardFaults` reads the format default and nothing reads the card. The answer
 * is a confident number the card contradicts.
 *
 * The clause is read here straight out of `cards_unique.oracle_text` so the
 * comparison is against the card and not against memory.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { answerFromCatalogue } from '../supabase/functions/mtg-brain/answer/index.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

const { data, error } = await db
  .from('cards_unique')
  .select('name, oracle_text, legalities')
  .ilike('oracle_text', '%A deck can have%')
  .limit(60);
if (error) throw new Error(error.message);

const rows = (data ?? []) as { name: string; oracle_text: string; legalities: Record<string, string> }[];
rows.sort((a, b) => a.name.localeCompare(b.name));

let wrong = 0;
for (const row of rows) {
  const clause = row.oracle_text.match(/A deck can have [^.]*\./)?.[0] ?? '';
  for (const format of ['commander', 'modern']) {
    if (row.legalities?.[format] !== 'legal') continue;
    const worked = await answerFromCatalogue({
      message: `How many copies of ${row.name} can I play in ${format}?`,
      deckContext: null,
      deckCards: [],
      identity: [],
      db,
      userDb: null,
    });
    const said = (worked?.message ?? '(nothing)')
      .split('\n')
      .filter(l => l.trim())
      .slice(2)
      .join(' ')
      .slice(0, 110);
    const anyNumber = /any number/i.test(clause);
    const capped = clause.match(/up to (nine|seven)/i)?.[1];
    const contradicts = anyNumber
      ? /^(Up to \d+ copies|One copy)/.test(said)
      : capped
        ? !said.includes(capped === 'nine' ? '9' : '7')
        : false;
    if (contradicts) wrong++;
    console.log(
      `${contradicts ? 'WRONG ' : '  ok  '} ${row.name.padEnd(26)} ${format.padEnd(10)} said: ${said}`
    );
    if (contradicts) console.log(`        the card says: ${clause}`);
  }
}
console.log(`\n${wrong} answers contradict the card's own printed clause`);
