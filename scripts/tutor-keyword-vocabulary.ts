/**
 * Generate the list of keyword names Tutor will answer a definition question about.
 *
 *   deno run --allow-net --allow-write --allow-env scripts/tutor-keyword-vocabulary.ts
 *   deno run --allow-net --allow-env scripts/tutor-keyword-vocabulary.ts --check
 *
 * WHY A GENERATED LIST OF NAMES, AND WHY ONLY NAMES
 * ------------------------------------------------
 * Routing happens before any read: the router decides what a question is asking
 * from the words alone, so "is one of these words a keyword" has to be
 * answerable without the catalogue in front of it. That needs a list.
 *
 * The list holds NAMES ONLY. A keyword name is vocabulary, the same kind of
 * thing as the format names and colour names already written into `voice.ts`.
 * The DEFINITION is never written down here and is read off a card every time a
 * player asks, because the definition is the part that would be a fabrication if
 * it drifted, and because Wizards prints it on the card and we hold every card.
 *
 * HOW A NAME EARNS ITS PLACE
 * --------------------------
 * `cards_unique.keywords` is Scryfall's own keyword list: 833 distinct names
 * over 23,048 card rows, measured 2026-08-29. Most of those carry no printed
 * definition anywhere, because ability words are italic flavour and never get
 * reminder text. So a name is kept only when at least one card in the catalogue
 * prints a reminder for it, which is what makes it answerable.
 *
 * The reminder is recognised strictly: the keyword must OPEN a line of the
 * card's rules text, with at most a cost between it and the opening bracket.
 * That strictness is load bearing. "Flying, first strike (This creature deals
 * combat damage before creatures without first strike.)" would otherwise hand
 * first strike's definition to flying.
 *
 * Measured with that rule on 2026-08-29: 215 keywords carry a definition,
 * backed by 4,296 cards.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const TARGET = 'supabase/functions/mtg-brain/answer/keyword-names.ts';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

/**
 * Walk the whole catalogue in pages rather than asking the database to do the
 * unnest and the regex. PostgREST is what the edge function has, and doing the
 * work the same way here means the generator cannot be measuring something the
 * function could not reproduce.
 */
const PAGE = 1000;
const counts = new Map<string, number>();
let scanned = 0;

for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from('cards_unique')
    .select('keywords, oracle_text')
    .not('keywords', 'eq', '{}')
    .not('oracle_text', 'is', null)
    .like('oracle_text', '%(%')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { keywords: string[] | null; oracle_text: string | null }[];
  if (!rows.length) break;
  scanned += rows.length;

  for (const row of rows) {
    const lines = (row.oracle_text ?? '').split('\n');
    for (const keyword of row.keywords ?? []) {
      if (!keyword) continue;
      if (reminderOn(lines, keyword)) counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  if (rows.length < PAGE) break;
}

/** The same strict rule the function uses, kept here so the two cannot disagree. */
function reminderOn(lines: string[], keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\b[^()]{0,14}\\(([^)]{12,})\\)`, 'i');
  return lines.some(line => pattern.test(line.trim()));
}

const names = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name]) => name);

const total = [...counts.values()].reduce((n, v) => n + v, 0);
const measured = new Date().toISOString().slice(0, 10);

const file = `/**
 * Every keyword a player can ask the meaning of, because a card in our
 * catalogue prints Wizards' own definition of it.
 *
 * GENERATED. Do not edit by hand.
 *   deno run --allow-net --allow-write --allow-env scripts/tutor-keyword-vocabulary.ts
 *
 * NAMES ONLY, AND THAT IS THE POINT. A definition is read off a card every time
 * somebody asks, by \`answer/glossary.ts\`. Writing the definitions down here
 * would be a copy that can drift from the card, and the card is the authority.
 *
 * A name is here only when at least one card OPENS a line of its rules text
 * with that keyword and a bracket, which is what a reminder text looks like.
 * Measured ${measured} over ${total.toLocaleString('en-US')} cards carrying such a line, from
 * ${scanned.toLocaleString('en-US')} rows of \`cards_unique\` that carry a keyword and a bracket.
 *
 * Sorted by how many cards back each one, most first.
 */

export const KEYWORD_NAMES: string[] = [
${names.map(n => `  ${JSON.stringify(n)},`).join('\n')}
];
`;

if (Deno.args.includes('--check')) {
  const current = await Deno.readTextFile(TARGET).catch(() => '');
  const currentNames = [...current.matchAll(/^  "(.+)",$/gm)].map(m => m[1]);
  const missing = names.filter(n => !currentNames.includes(n));
  const extra = currentNames.filter(n => !names.includes(n));
  console.log(`catalogue: ${names.length} keywords with a definition, ${total} cards backing them`);
  console.log(`file:      ${currentNames.length} names`);
  console.log(`in the catalogue and not in the file: ${missing.length}${missing.length ? ' -> ' + missing.join(', ') : ''}`);
  console.log(`in the file and not in the catalogue: ${extra.length}${extra.length ? ' -> ' + extra.join(', ') : ''}`);
  Deno.exit(missing.length || extra.length ? 1 : 0);
}

await Deno.writeTextFile(TARGET, file);
console.log(`${names.length} keywords written to ${TARGET}`);
console.log(`backed by ${total} cards, read from ${scanned} rows`);
