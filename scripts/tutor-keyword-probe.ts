/**
 * Ask Tutor what every keyword means, and check the answer against the card.
 *
 *   deno run --allow-net --allow-read --allow-env scripts/tutor-keyword-probe.ts
 *   deno run ... scripts/tutor-keyword-probe.ts --all      every one of the 208
 *
 * WHAT THIS IS CHECKING, AND WHY IT IS NOT THE SAME AS THE FIFTY
 * -------------------------------------------------------------
 * The fifty say whether a question routes. This says whether the thing at the
 * end of the route is right, which is a different claim and the one that can do
 * harm. A definition read off the wrong line of the wrong card would be a
 * confident wrong answer about a rule, and a player takes a rule to a table.
 *
 * So every definition it fetches is checked back against the card it came from:
 * the card is read again, and the line the definition was taken from has to
 * still open with that keyword. Nothing here trusts the parse it is measuring.
 *
 * The default run is the keywords players actually ask about, which is fast.
 * `--all` walks the whole generated list, which is 208 keywords and two reads
 * each in the worst case.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  KEYWORD_NAMES,
  keywordDefinition,
  keywordsNamedIn,
} from '../supabase/functions/mtg-brain/answer/glossary.ts';

const SUPABASE_URL = 'https://udnaflcohfyljrsgqggy.supabase.co';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkbmFmbGNvaGZ5bGpyc2dxZ2d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NjAyMDAsImV4cCI6MjA3MDQzNjIwMH0.SrKLHsJmBfXHmPlVirfglxJXkUMly4bKhjzFkx7ew5g';

const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });

/** The keywords a beginner asks about, which is what the fifty are made of. */
const ASKED_ABOUT = [
  'Flying', 'Trample', 'Deathtouch', 'Lifelink', 'Vigilance', 'Menace', 'Reach',
  'Haste', 'Hexproof', 'Shroud', 'Ward', 'Defender', 'First strike',
  'Double strike', 'Indestructible', 'Flash', 'Prowess', 'Protection',
  'Overload', 'Cascade', 'Storm', 'Convoke', 'Delve', 'Flashback', 'Cycling',
  'Kicker', 'Equip', 'Crew', 'Infect', 'Persist', 'Undying', 'Evoke',
  'Madness', 'Morph', 'Surveil', 'Scry', 'Proliferate', 'Investigate',
];

const list = Deno.args.includes('--all') ? KEYWORD_NAMES : ASKED_ABOUT;

let found = 0;
let missing = 0;
let failed = 0;
let verified = 0;
const unverified: string[] = [];
const times: number[] = [];

for (const keyword of list) {
  const started = performance.now();
  const read = await keywordDefinition(db, keyword);
  const ms = Math.round(performance.now() - started);
  times.push(ms);

  if (!read.ok) {
    failed++;
    console.log(`FAILED   ${keyword}: ${read.why}`);
    continue;
  }
  if (!read.value) {
    missing++;
    console.log(`NONE     ${keyword}  [${ms} ms]`);
    continue;
  }
  found++;

  /* Read the card back and check the line is really that keyword's reminder.
     A definition that cannot be found again on the card it was said to come
     off is a parse fault, and it is the only fault here that could reach a
     player as a wrong rule. */
  const back = await db
    .from('cards_unique')
    .select('name, oracle_text')
    .ilike('name', read.value.readOff)
    .limit(1);
  const text = (back.data?.[0]?.oracle_text ?? '') as string;
  const line = text.split('\n').find(l =>
    l.trim().toLowerCase().startsWith(keyword.toLowerCase()) &&
    l.includes(read.value!.definition)
  );
  if (line) verified++;
  else unverified.push(`${keyword} (off ${read.value.readOff})`);

  console.log(
    `${line ? 'OK      ' : 'UNCHECKED'} ${keyword}  [${ms} ms, ${read.value.agreeing}/${read.value.parsed} agree of ${read.value.sampled} read${read.value.varies ? ", VARIES" : ""}, off ${read.value.readOff}]`
  );
  console.log(`         ${read.value.definition}`);
}

times.sort((a, b) => a - b);
console.log('\n' + '='.repeat(70));
console.log(`${list.length} keywords asked`);
console.log(`  a definition came back      ${found}`);
console.log(`  no definition in the sample ${missing}`);
console.log(`  the read failed             ${failed}`);
console.log(`  checked back against the card it came off: ${verified} of ${found}`);
for (const u of unverified) console.log(`    not checked back: ${u}`);
console.log(
  `latency  min ${times[0]} ms  median ${times[Math.floor(times.length / 2)]} ms  max ${times[times.length - 1]} ms`
);

/* The routing half: a keyword has to be findable in a sentence before any of
   the above happens, and a name that is also an ordinary English word is where
   that goes wrong. */
const NOT_KEYWORD_QUESTIONS = [
  'What is the best black removal spell under one dollar?',
  'How many lands should I run in a commander deck?',
  'What are the best two card infinite combos in commander?',
  'How do I build a commander deck for under fifty dollars?',
  'What does Sol Ring do?',
  'What does Doubling Season do with planeswalkers?',
  'Explain Cyclonic Rift in plain terms',
  'What cards are banned in commander?',
  'How much is Black Lotus worth?',
  'Which lands can I upgrade?',
  'What are the best ramp cards for my deck?',
  'Is Cultivate or Rampant Growth better in commander?',
  'What is my win condition in this deck?',
  'How much commander damage kills a player?',
  'What is the difference between exile and destroy?',
  'How does the stack work in Magic?',
  'What happens if I have two legendary creatures with the same name on the battlefield?',
  'Do I lose the game as soon as my library is empty?',
];

console.log('\nquestions that must NOT be read as keyword questions:');
let falseFires = 0;
for (const q of NOT_KEYWORD_QUESTIONS) {
  const hits = keywordsNamedIn(q);
  if (hits.length) {
    falseFires++;
    console.log(`  FIRED  ${q}  -> ${hits.map(h => h.name).join(', ')}`);
  }
}
console.log(`  ${falseFires} of ${NOT_KEYWORD_QUESTIONS.length} fired`);
