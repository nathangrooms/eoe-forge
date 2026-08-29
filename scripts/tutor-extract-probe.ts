/**
 * Which card name a question actually reaches, and which one is thrown away.
 *
 * WHY THIS EXISTS
 * ---------------
 * "Is Sol Ring legal in Modern?" gets the stock refusal and
 * "Sol Ring, legal in Modern?" prints the full legality. That is measured
 * against the live endpoint, so the behaviour is not in doubt. The cause was,
 * and reading `cardNamedInQuestion` is not proof of it.
 *
 * So this runs the REAL `extractCardNames` and then the REAL fragment test from
 * `answer/index.ts`, copied here as three lines rather than imported, because
 * the function it lives inside also needs a database handle. The copy is the
 * finding: if it ever stops matching the shipped code, this trace is wrong and
 * the disagreement is worth knowing about.
 *
 *   node --experimental-strip-types scripts/tutor-extract-probe.ts
 *
 * What it shows, on the questions that failed:
 *
 *   1. the guard rejects a real card because a phrase that RESOLVES TO NOTHING
 *      happens to contain it ("Is Sol Ring", "Sol Ring in")
 *   2. `slice(0, 4)` cuts the list before the real names are reached, which is
 *      why the Thassa's Oracle and Demonic Consultation question never looks up
 *      either card
 *   3. sorting longest first and returning on the first hit is what decides a
 *      two-card comparison, so the card named second can win
 */

import { extractCardNames } from '../supabase/functions/mtg-brain/resolve-cards.ts';

const questions = [
  'Is Sol Ring legal in Modern?',
  'Sol Ring, legal in Modern?',
  'Which formats can I play Lightning Bolt in?',
  'Lightning Bolt, which formats?',
  'Is Dockside Extortionist banned in commander?',
  "How does the Thassa's Oracle and Demonic Consultation combo work?",
  'Is Rhystic Study worth sixty dollars?',
  'Is Cultivate or Rampant Growth better in commander?',
  'Path to Exile or Swords to Plowshares, which is better?',
  'Can I run two copies of Sol Ring in my commander deck?',
];

for (const q of questions) {
  const { names } = extractCardNames(q);
  const asked = q.toLowerCase();

  /* The next three lines are `cardNamedInQuestion`, verbatim. */
  const present = names.filter(n => n.length >= 4 && asked.includes(n.toLowerCase()));
  const worthTrying = [...present].sort((a, b) => b.length - a.length).slice(0, 4);

  console.log(`\nQ: ${q}`);
  console.log(`  extracted : ${JSON.stringify(names)}`);
  console.log(`  tried     : ${JSON.stringify(worthTrying)}`);
  for (const candidate of worthTrying) {
    const isAFragment = present.some(
      other =>
        other.toLowerCase() !== candidate.toLowerCase() &&
        other.toLowerCase().includes(candidate.toLowerCase()) &&
        other.length > candidate.length
    );
    console.log(`    ${candidate}${isAFragment ? '   <- REJECTED as a fragment' : ''}`);
  }
}
