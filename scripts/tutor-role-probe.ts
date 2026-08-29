/**
 * Which list questions the router can answer, before and after.
 *
 *   deno run --allow-read scripts/tutor-role-probe.ts
 *
 * The fifty in `tutor-fifty.json` name six jobs between them, and all six were
 * already in the hand-written table, so widening the vocabulary moves nothing
 * there. That is a true measurement and an incomplete one: it says the fifty do
 * not test this, not that it does not matter.
 *
 * So this asks one plain question per job the tagger can name, in the wording a
 * player would use, and runs both routers over it. The "before" table is the
 * 29 hand-written entries copied verbatim out of git, so the comparison is
 * against what actually shipped rather than against a description of it.
 *
 * `best-of` is the ask under test. It carries a second condition, `needs`,
 * which is `roleFrom(q) !== null`: a question asking for the best of something
 * we cannot name is not answered with the most played cards in Magic. So a job
 * with no wording does not merely lose its list, it falls out of routing
 * entirely and gets a stock refusal.
 */

import { chooseAsk, normalise } from '../supabase/functions/mtg-brain/answer/route.ts';
import { TAG_SYNONYMS } from '../supabase/functions/mtg-brain/answer/vocabulary.ts';

/** The table as it shipped, copied from git rather than described. */
const BEFORE: { tag: string; says: string; words: string[] }[] = [
  { tag: 'counterspell', says: 'counterspells', words: ['counterspell', 'counterspells', 'counter magic', 'counter spell', 'counter spells'] },
  { tag: 'removal-spot', says: 'spot removal', words: ['spot removal', 'targeted removal', 'single target removal'] },
  { tag: 'board-wipe', says: 'board wipes', words: ['board wipe', 'board wipes', 'sweeper', 'sweepers', 'wrath'] },
  { tag: 'removal', says: 'removal', words: ['removal'] },
  { tag: 'ramp', says: 'ramp', words: ['ramp', 'mana acceleration', 'accelerant'] },
  { tag: 'mana-rock', says: 'mana rocks', words: ['mana rock', 'mana rocks'] },
  { tag: 'mana-dork', says: 'mana creatures', words: ['mana dork', 'mana dorks', 'mana creature', 'mana creatures'] },
  { tag: 'card-draw', says: 'card draw', words: ['card draw', 'draw spell', 'draw spells', 'card advantage', 'draw engine'] },
  { tag: 'tutor', says: 'tutors', words: ['tutor', 'tutors'] },
  { tag: 'protection', says: 'protection', words: ['protection', 'protect my commander', 'commander protection'] },
  { tag: 'graveyard-hate', says: 'graveyard hate', words: ['graveyard hate', 'graveyard removal'] },
  { tag: 'recursion', says: 'recursion', words: ['recursion', 'reanimate', 'reanimation'] },
  { tag: 'token-maker', says: 'token makers', words: ['token maker', 'token makers', 'token generator'] },
  { tag: 'sacrifice-outlet', says: 'sacrifice outlets', words: ['sac outlet', 'sacrifice outlet', 'sacrifice outlets'] },
  { tag: 'equipment', says: 'equipment', words: ['equipment'] },
  { tag: 'stax', says: 'stax pieces', words: ['stax'] },
  { tag: 'extra-turn', says: 'extra turn spells', words: ['extra turn', 'extra turns'] },
  { tag: 'extra-combat', says: 'extra combat spells', words: ['extra combat', 'extra combats'] },
  { tag: 'wincon', says: 'ways to win', words: ['win condition', 'win conditions', 'wincon', 'wincons'] },
  { tag: 'fast-mana', says: 'fast mana', words: ['fast mana'] },
  { tag: 'treasure', says: 'treasure makers', words: ['treasure', 'treasures'] },
  { tag: 'proliferate', says: 'proliferate cards', words: ['proliferate'] },
  { tag: 'landfall', says: 'landfall cards', words: ['landfall'] },
  { tag: 'mill', says: 'mill cards', words: ['mill'] },
  { tag: 'lifegain', says: 'lifegain', words: ['lifegain', 'life gain'] },
  { tag: 'blink', says: 'blink effects', words: ['blink', 'flicker'] },
  { tag: 'infect', says: 'infect cards', words: ['infect'] },
  { tag: 'storm', says: 'storm cards', words: ['storm'] },
  { tag: 'cascade', says: 'cascade cards', words: ['cascade'] },
];

const roleUnder = (
  table: { tag: string; says: string; words: string[] }[],
  question: string
): string | null => {
  const text = normalise(question);
  let best: { tag: string; words: string } | null = null;
  for (const entry of table) {
    for (const word of entry.words) {
      if (!text.includes(` ${normalise(word).trim()} `)) continue;
      if (!best || word.length > best.words.length) best = { tag: entry.tag, words: word };
    }
  }
  return best?.tag ?? null;
};

/**
 * One question per job, phrased the way somebody looking at their own deck
 * would phrase it. Every one uses a `best-of` cue, so the only thing deciding
 * whether it routes is whether the job has words.
 */
const QUESTIONS = TAG_SYNONYMS.map(entry => ({
  tag: entry.tag,
  q: `What are the best ${entry.words[entry.words.length - 1]} for my commander deck?`,
}));

let gained = 0;
const rows: string[] = [];
for (const { tag, q } of QUESTIONS) {
  const before = roleUnder(BEFORE, q);
  const after = roleUnder(TAG_SYNONYMS, q);
  const askBefore = before ? 'best-of' : (chooseAskWithout(q) ?? 'nothing');
  const askAfter = chooseAsk(q)?.ask.id ?? 'nothing';
  if (askBefore === 'nothing' && askAfter !== 'nothing') gained++;
  rows.push(
    `| \`${tag}\` | ${JSON.stringify(q)} | ${askBefore} | ${askAfter} |`
  );
}

/**
 * What the router would have chosen with the old table: the same walk down
 * `ASKS`, with `best-of` skipped because its condition could not be met.
 */
function chooseAskWithout(q: string): string | null {
  const choice = chooseAsk(q);
  if (!choice) return null;
  if (choice.ask.id !== 'best-of') return choice.ask.id;
  return null;
}

console.log('| job | asked | routed to, before | routed to, after |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) console.log(r);
console.log(
  `\n${QUESTIONS.length} jobs asked for. ` +
    `${gained} routed nowhere before and reach a list now.`
);
