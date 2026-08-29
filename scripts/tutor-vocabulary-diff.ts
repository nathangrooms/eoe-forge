/**
 * What Magic words mean, and who says so.
 *
 *   node --experimental-strip-types scripts/tutor-vocabulary-diff.ts
 *
 * `src/engine/knowledge/tagger.ts` decides what a card IS and writes the answer
 * into `cards.tags`. Tutor decides how a player says it. This prints the seam
 * between those two jobs: which names come from the engine, which words are
 * Tutor's own, and what is still on the fallback wording.
 *
 * WHAT IT LOOKED LIKE BEFORE `answer/vocabulary.ts` EXISTED, measured by an
 * earlier version of this script on 2026-08-29:
 *
 *     engine rules                                          66, writing 76 names
 *     Tutor's four hand-written tables named                76
 *     names Tutor used that no rule writes                   0
 *     names the engine writes that Tutor named nowhere       0
 *     synonym entries querying a legacy spelling             4 of 29
 *     ideas no wording could reach                          28 of 56
 *
 * The two lists agreed on every name. Nothing made them agree and nothing
 * checked. What they disagreed about was coverage: half the vocabulary could be
 * printed and none of it could be asked for.
 *
 * The assertions are in `src/lib/tutor/vocabulary.test.ts`. This changes
 * nothing and asserts nothing.
 */

import { TAG_RULES, ALL_TAGS } from '../src/engine/knowledge/tagger.ts';
import {
  ALIAS_TAGS,
  LOW_INFORMATION_TAGS,
  TAG_CARD_COUNT,
  TYPE_TAGS as ENGINE_TYPE_TAGS,
} from '../src/engine/knowledge/tag-signal.ts';
import {
  CANONICAL_TAGS,
  PHRASINGS,
  SUPERSEDED,
  TAG_SYNONYMS,
  TYPE_TAGS,
  UNION_NAMES,
  plainWords,
  spelledOut,
} from '../supabase/functions/mtg-brain/answer/vocabulary.ts';

const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
const head = (cells: string[], align?: string[]) => {
  console.log(row(cells));
  console.log(row(cells.map((_, i) => align?.[i] ?? '---')));
};

const writtenBy = (tag: string): string[] => {
  const out = new Set<string>();
  if (CANONICAL_TAGS.has(tag)) out.add(tag);
  for (const rule of TAG_RULES) if ((rule.also ?? []).includes(tag)) out.add(rule.tag);
  return Array.from(out).sort();
};

const ideas = Array.from(CANONICAL_TAGS).filter(t => !ENGINE_TYPE_TAGS.has(t));
const askable = new Set(TAG_SYNONYMS.map(s => s.tag));

console.log('## Counted now\n');
head(['', 'count'], ['---', '---:']);
console.log(row(['engine rules', String(TAG_RULES.length)]));
console.log(row(['names those rules write', String(ALL_TAGS.length)]));
console.log(row(['of those, legacy spellings', String(ALIAS_TAGS.size)]));
console.log(row(['ideas that are not a card type', String(ideas.length)]));
console.log(row(['ideas the engine calls too common to mean anything', String(LOW_INFORMATION_TAGS.size)]));
console.log(row(['**jobs a player can ask for**', `**${TAG_SYNONYMS.length}**`]));
console.log(row(['phrases that reach one', String(TAG_SYNONYMS.reduce((n, s) => n + s.words.length, 0))]));
console.log(row(['names Tutor writes its own words for', String(Object.keys(PHRASINGS).length)]));
console.log(row(['names still on the wording derived from the tag', String(ALL_TAGS.filter(t => !PHRASINGS[t]).length)]));

console.log('\n## Names one list holds and the other does not\n');
const invented = Object.keys(PHRASINGS).filter(t => !ALL_TAGS.includes(t));
const unphrased = ALL_TAGS.filter(t => !PHRASINGS[t]);
console.log(`Names Tutor writes words for that no rule writes: **${invented.length}**${invented.length ? ` (${invented.join(', ')})` : ''}`);
console.log(`\nNames the engine writes that fall back to the tag spelled out: **${unphrased.length}**\n`);
if (unphrased.length) {
  head(['tag', 'falls back to', 'hidden, askable or neither']);
  for (const tag of unphrased) {
    const where = TYPE_TAGS.has(tag)
      ? 'hidden, it is on the type line'
      : ALIAS_TAGS.has(tag)
        ? `hidden, a second spelling of ${writtenBy(tag).join(' and ')}`
        : askable.has(tag)
          ? 'askable'
          : 'neither';
    console.log(row([`\`${tag}\``, `"${spelledOut(tag)}"`, where]));
  }
}

console.log('\n## Which names Tutor asks for, and which rule writes each one\n');
head(['a player asks for', 'Tutor queries', 'written by', 'cards']);
for (const entry of [...TAG_SYNONYMS].sort((a, b) => a.tag.localeCompare(b.tag))) {
  const by = writtenBy(entry.tag);
  const note = UNION_NAMES.has(entry.tag)
    ? `${by.map(t => `\`${t}\``).join(' and ')}, a union with no single name`
    : by.map(t => `\`${t}\``).join(' and ');
  console.log(
    row([
      entry.words.map(w => `"${w}"`).join(', '),
      `\`${entry.tag}\``,
      note,
      String(TAG_CARD_COUNT[entry.tag] ?? 0),
    ])
  );
}

console.log('\n## What stays Tutor\'s, and why each one is phrasing rather than knowledge\n');
head(['tag', 'the engine name spelled out', 'the words a player also uses']);
for (const [tag, phrasing] of Object.entries(PHRASINGS)) {
  const extra = (phrasing.also ?? []).filter(w => w !== spelledOut(tag));
  if (!extra.length) continue;
  console.log(row([`\`${tag}\``, `"${spelledOut(tag)}"`, extra.map(w => `"${w}"`).join(', ')]));
}

console.log('\n## Saying one card back\n');
head(['tag', 'printed as']);
for (const tag of ideas.sort()) {
  if (TYPE_TAGS.has(tag)) continue;
  console.log(row([`\`${tag}\``, `"${plainWords(tag)}"`]));
}

console.log('\n## The judgements Tutor makes about which of two true statements to print\n');
head(['printed instead', 'when the card also carries']);
for (const [loser, winners] of Object.entries(SUPERSEDED)) {
  console.log(row([winners.map(w => `"${plainWords(w)}"`).join(' or '), `\`${loser}\`, "${plainWords(loser)}"`]));
}
