/**
 * Does the compiler recognise a card talking about ITSELF?
 *
 *   node --experimental-strip-types scripts/probe/self-name-gap.mjs
 *   SHOW=1 ... to list the cards
 *
 * `normalizeParagraph` replaces every spelling of the card's own name with `~`,
 * so "Whenever Ragavan deals combat damage" becomes "whenever ~ deals combat
 * damage" and one rule matches every card that says that. When a spelling is
 * MISSED the sentence keeps a proper noun in it, matches nothing, and the whole
 * ability is unread — which looks in every work list like a missing rule for a
 * shape we already handle.
 *
 * `selfNames` takes the short form only from a COMMA-separated title. This asks
 * how much that costs, by looking for a leftover run of the card's own name in
 * the normalised text.
 *
 * WHY IT IS A SEPARATE MEASUREMENT. An adversarial pass reported this as the
 * fix that must come first, at 137 commanders. CLAUDE.md's standing rule is to
 * confirm a finding with a second, differently-shaped measurement before acting
 * on it: three of four "defects" in one day were the instrument.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';

const cards = JSON.parse(readFileSync(new URL('../../scratch/commander-cache.json', import.meta.url), 'utf8'));

const { normalizeCard } = await import(
  new URL('../../src/lib/cards/abilities/normalize.ts', import.meta.url).href
);
const { compileWithTrace } = await import(
  new URL('../../src/lib/cards/abilities/compiler.ts', import.meta.url).href
);
const { isSubtypeWord } = await import(
  new URL('../../src/lib/cards/abilities/grammar.ts', import.meta.url).href
);

/**
 * The words of a card's name that could plausibly appear alone in its text.
 *
 * Stop words are dropped because "the", "of" and "and" are in half the
 * sentences on every card and would report every card as a miss.
 */
const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'to', 'in', 'on', 'for', 'from', 'with']);

/*
 * WORDS THAT ARE IN THE NAME AND ARE NOT THE CARD.
 *
 * The first run of this reported 268 cards and about half were wrong in the
 * same way: "Chatterfang, Squirrel General" left `squirrel`, "Koma, Cosmos
 * Serpent" left `serpent`, "Lathril, Blade of the Elves" left `elves`. Those
 * texts are talking about the creature TYPE, which is exactly why `selfNames`
 * refuses to shorten to a subtype in the first place. A probe that does not
 * apply the guard the code applies is measuring a different question.
 *
 * `isSubtypeWord` is the engine's own list and handles the plural, so `elves`
 * and `dragon` both fall out. GAME_WORDS is the rest: nouns that recur in
 * rules text and happen to appear in a name.
 */
const GAME_WORDS = new Set([
  'card', 'cards', 'mana', 'treasure', 'counter', 'counters', 'token', 'tokens',
  'hand', 'library', 'graveyard', 'battlefield', 'damage', 'life', 'turn',
  'combat', 'attack', 'block', 'spell', 'permanent', 'creature', 'land',
  'artifact', 'enchantment', 'instant', 'sorcery', 'player', 'opponent',
  'blade', 'sword', 'crown', 'balloon', 'warden', 'herald', 'hunter', 'general',
]);

function nameWords(name) {
  return String(name || '')
    .split(/[\s,'’//-]+/)
    .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
    .filter(w => w.length >= 4 && !STOP.has(w) && !GAME_WORDS.has(w) && !isSubtypeWord(w));
}

const hits = [];
let scanned = 0;

for (const card of cards) {
  const text = card.oracle_text || '';
  if (!text) continue;
  scanned++;

  let norm;
  try {
    norm = normalizeCard(card);
  } catch {
    continue;
  }
  const body = (norm?.text ?? '').toLowerCase();
  if (!body) continue;

  /*
   * A word of the name still standing in the normalised text. `~` is what a
   * folded name becomes, so anything left is a spelling `selfNames` did not
   * produce. Checking WORDS rather than the whole name is what catches the
   * short form: "sephiroth" survives while "sephiroth, planet's heir" does not.
   */
  const leftover = nameWords(card.name).filter(w => new RegExp(`\\b${w}\\b`).test(body));
  if (leftover.length === 0) continue;

  let coverage = '?';
  let unparsed = 0;
  try {
    const trace = compileWithTrace(card);
    coverage = trace.result.coverage;
    unparsed = (trace.result.unparsed ?? []).length;
  } catch {
    /* the compiler throwing is its own finding and not this one */
  }

  hits.push({ name: card.name, rank: card.edhrec_rank ?? null, leftover, coverage, unparsed });
}

hits.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));

const byCoverage = {};
for (const h of hits) byCoverage[h.coverage] = (byCoverage[h.coverage] ?? 0) + 1;

console.log(`\nCARDS WHOSE OWN NAME SURVIVES NORMALISATION\n`);
console.log(`  commanders with rules text   ${scanned}`);
console.log(`  name still in the text       ${hits.length}  ${((hits.length / scanned) * 100).toFixed(1)}%`);
console.log(`\n  and their coverage:`);
for (const [k, v] of Object.entries(byCoverage).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(k).padEnd(10)} ${String(v).padStart(5)}`);
}

/* A card that is already `full` has no problem, whatever is left in its text. */
const costing = hits.filter(h => h.coverage !== 'full');
console.log(`\n  NOT full, so the leftover may be why  ${costing.length}`);

if (process.env.SHOW) {
  console.log(`\n  most played first:\n`);
  for (const h of costing.slice(0, Number(process.env.SHOW) || 40)) {
    console.log(
      `  ${String(h.rank ?? '').padStart(6)}  ${h.name.slice(0, 40).padEnd(42)} ` +
        `${h.coverage.padEnd(8)} unread ${String(h.unparsed).padStart(2)}  left: ${h.leftover.join(' ')}`
    );
  }
}
