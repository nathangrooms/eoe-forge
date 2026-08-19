/**
 * WHAT A CLAUSE PATTERN CANNOT REACH.
 *
 * The batch plan measures work that a parser and an effect vocabulary can do.
 * This script measures the other thing: text whose difficulty is not in reading
 * it but in there being nowhere in the engine to put the answer. A pattern for
 * "enchanted creature gets +2/+2" is worthless without a layer system to apply
 * it in; a pattern for "becomes a copy of" is worthless without copiable values.
 *
 * ## What this is, and what it is not
 *
 * It is a TEXT COUNT over the census pool, the same discipline the decision
 * census used. It says how many cards contain a construction of a given shape.
 * It does NOT say those cards are broken, and it must never be quoted as
 * coverage. It is a sizing number for mechanisms.
 *
 * Each detector is paired with the engine fact that makes it structural, and
 * every detector can be sampled with `--samples <id>` so the matches can be
 * read rather than trusted.
 *
 * Local file only. No Supabase, no network, no model.
 *
 * Usage:  node scripts/structural-gaps.mjs [--samples <id>]
 */

import { createReadStream, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  facesOf,
  dropReminders,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'structural-gaps.json');

const argv = process.argv.slice(2);
const sampleId = argv.includes('--samples') ? argv[argv.indexOf('--samples') + 1] : null;

const out = [];
const line = (s = '') => { out.push(s); console.log(s); };
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield JSON.parse(l);
}

if (!existsSync(SRC)) { console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`); process.exit(1); }

const pool = [];
for await (const card of rows(SRC)) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) continue;
  if (EXCLUDED_SET_TYPES.has(card.set_type)) continue;
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool.push(card);
}

/** All faces, reminder text dropped, joined. The compiler only reads the front face; this reads both on purpose. */
function textOf(card) {
  return facesOf(card).map(f => dropReminders(f.text)).join('\n');
}

/**
 * X in the PRINTED MANA COST is a different population from X in rules text,
 * and the decision census counted the first. Both are reported so the two
 * documents can be compared without either being restated as the other.
 */
function manaCostOf(card) {
  if (card.mana_cost) return String(card.mana_cost);
  return (card.card_faces ?? []).map(f => String(f.mana_cost ?? '')).join('');
}
let xInManaCost = 0;

/*
 * Each detector names the MECHANISM it needs, and the engine fact that makes
 * it structural rather than a parsing job. The engine facts were read from the
 * files named, not inferred.
 */
const DETECTORS = [
  { id: 'cda', mechanism: 'Characteristic-defining ability: P/T computed from game state, in layer 7a, recomputed continuously',
    engineFact: 'layers.ts applies pt-set and pt-modify with fixed numbers; a value that must be recounted every time the board changes has no home',
    re: /power and toughness are each equal to|\bpower is equal to|\btoughness is equal to|\*\s*\/\s*\*/i },

  { id: 'grant-ability', mechanism: 'Continuous grant of an ability to other objects, layer 6',
    engineFact: 'statics.ts has an "ability" layer case, so the mechanism exists; the census only ever sees a keyword when it is PRINTED, so this is the population the text census structurally undercounts',
    re: /\b(gains?|have|has)\b[^.]{0,60}\b(flying|trample|haste|vigilance|lifelink|deathtouch|first strike|double strike|menace|reach|hexproof|indestructible|shroud|defender|protection|ward|fear|intimidate|banding|flash)\b/i },

  { id: 'copy', mechanism: 'Copiable values, CR 707: copy the printed object plus copy effects, not the current state',
    engineFact: 'no copy layer anywhere in src/lib/game; the census gap reason "copy-layer" is 187 clauses',
    re: /\bbecomes? a copy\b|\bcopy of\b|\bcopy that spell\b|\bcopy it\b|\bcreate a token that's a copy\b/i },

  { id: 'replacement-general', mechanism: 'General replacement and prevention, CR 614 and 615',
    engineFact: 'replacement.ts exists, but intrinsic.ts only DERIVES two results from a compiled ability: enters-tapped and a plain-number enters-with-counters',
    re: /\bif [^.]{0,80}\bwould\b[^.]{0,80}\binstead\b|\bprevent the next\b|\bprevent all\b|\benters? with\b|\benters? the battlefield with\b/i },

  { id: 'cost-modify', mechanism: 'Cost modification, applied while a spell is being announced',
    engineFact: 'statics.ts has a cost-modify case and parseCost has no X handling; cost changes must apply before payment, which is a different moment from the layer pass',
    re: /\bcosts? \{[^}]+\} (less|more) to cast\b|\bcost \{[^}]+\} (less|more)\b/i },

  { id: 'alt-cost', mechanism: 'Alternative and additional costs: a second legal way to cast the card',
    engineFact: 'CastOptions in moves.ts carries ignoreMana and nothing else, so there is no field saying which way a spell was cast',
    re: /\brather than pay\b|\bas an additional cost to cast\b|\byou may cast\b[^.]{0,60}\bwithout paying\b|\bwithout paying its mana cost\b/i },

  { id: 'x-cost', mechanism: 'A chosen X, stored on the stack object and used by the effect',
    engineFact: 'parseCost sets hasX and leaves X out of total; planPayment charges total; nothing on CAST_SPELL or StackObject carries a chosen X',
    re: /\{X\}/ },

  { id: 'type-change', mechanism: 'Type and subtype change, layer 4',
    engineFact: 'statics.ts has a type layer case; the hard part is that a land becoming a creature changes what every other rule says about it',
    re: /\bbecomes? an? [^.]{0,40}\b(creature|artifact|land|enchantment)\b|\bin addition to its other types\b|\bis still a\b/i },

  { id: 'zone-memory', mechanism: 'An object remembered across a zone change, CR 400.7',
    engineFact: 'exile-until-leaves needs a link between two different objects; a new object in a new zone is a new object and the DSL has no handle for the old one',
    re: /\bexile [^.]{0,60}until\b[^.]{0,40}\bleaves the battlefield\b|\breturn the exiled card\b|\bthe exiled card\b/i },

  { id: 'history', mechanism: 'Turn history: what happened earlier this turn or last turn',
    engineFact: 'the census gap reason "needs-history" is 290 clauses and the batch table names a PLATFORM item for it; GameState folds no per-turn history',
    re: /\bthis turn\b[^.]{0,40}\b(died|was dealt|cast|attacked)\b|\blast turn\b|\bsecond spell\b|\bthis turn, \b|\bif you('ve| have) cast\b/i },

  { id: 'outside-game', mechanism: 'Anything outside the game: sideboard, ante, the physical world',
    engineFact: 'the census gap reason "outside-game" is 241 clauses; there is no zone for it',
    re: /\boutside the game\b|\bsideboard\b|\bante\b/i },

  { id: 'randomness', mechanism: 'A random outcome the game must generate and both players must trust',
    engineFact: 'a coin flip or a die roll needs a seeded, replayable source, or a networked game desynchronises; nothing in GameState carries one',
    re: /\bflips? a coin\b|\brolls? a\b[^.]{0,20}\bdie\b|\brolls? \d*d\d+\b|\bat random\b/i },

  { id: 'multi-face', mechanism: 'The back face, and anything that switches between faces',
    engineFact: 'ability-layer-coverage.mjs records that only the FRONT face is compiled; back faces become multi-face or alt-cast gaps by design, 2,395 clauses',
    re: /\btransform\b|\bthe back face\b|\bmelds? with\b|\bunlock\b|\bdisturb\b|\bnightbound\b|\bdaybound\b/i },

  { id: 'player-order', mechanism: 'APNAP ordering, and effects that hand the order to a player',
    engineFact: 'ActionMeta.triggerOrder and replacementOrder exist, are honoured by rules.ts and replacement.ts, and nothing outside the engine sets either',
    re: /\bin any order\b|\bin an order\b|\bstarting with you\b|\bin turn order\b|\bAPNAP\b/i },

  { id: 'divided', mechanism: 'An amount split across several recipients, chosen at announcement',
    engineFact: '{op:"damage"} carries one scalar and one selector, so a split has nowhere to live',
    re: /\bdivided as you choose\b|\bdivided evenly\b|\bdistribute\b/i },

  { id: 'continuous-own-text', mechanism: 'A card that edits its own or another card\'s rules text',
    engineFact: 'text-changing effects operate in layer 3 and nothing in the DSL represents card text as data',
    re: /\btext of\b|\bloses all abilities\b|\bhas base power and toughness\b|\bgains? "\b|\bhas "\b/i },
];

const counts = new Map();
const samples = new Map();
const cardsHit = new Set();

for (const card of pool) {
  if (/\{X\}/.test(manaCostOf(card))) xInManaCost++;
  const t = textOf(card);
  if (!t.trim()) continue;
  for (const d of DETECTORS) {
    if (!d.re.test(t)) continue;
    counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    cardsHit.add(card.name);
    if (!samples.has(d.id)) samples.set(d.id, []);
    const s = samples.get(d.id);
    if (s.length < 25) s.push(`${card.name} :: ${t.replace(/\n/g, ' | ').slice(0, 150)}`);
  }
}

line('==========================================================');
line(' STRUCTURAL GAPS — what a clause pattern cannot reach');
line('==========================================================');
line();
line(` census pool                         ${pool.length}`);
line(` cards matching at least one detector ${cardsHit.size}  (${pct(cardsHit.size, pool.length)}%)`);
line();
line(' THIS IS A TEXT COUNT. It sizes mechanisms. It is not coverage, and a card');
line(' can appear under several detectors. Both faces are read here, unlike the');
line(' compiler, which reads only the front.');
line();
line('   cards    %pool   id                 mechanism');
for (const d of DETECTORS.slice().sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))) {
  const n = counts.get(d.id) ?? 0;
  line(`   ${String(n).padStart(6)}   ${pct(n, pool.length).padStart(6)}   ${d.id.padEnd(18)} ${d.mechanism}`);
}
line();
line(` cards with {X} in the PRINTED MANA COST: ${xInManaCost}  (${pct(xInManaCost, pool.length)}%)`);
line(' the decision census reported 532 for this. That count was over the same');
line(' pool but only the front face mana cost; this one adds face mana costs, so');
line(' the two are close and are not the same question. Neither is coverage.');
line();
line(' why each is structural, and the engine fact behind it');
for (const d of DETECTORS) {
  line(`   ${d.id}`);
  line(`     needs: ${d.mechanism}`);
  line(`     fact:  ${d.engineFact}`);
}

if (sampleId) {
  line();
  line(` -- samples for ${sampleId} --`);
  for (const s of samples.get(sampleId) ?? ['(no matches)']) line(`   ${s}`);
}

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  script: 'scripts/structural-gaps.mjs',
  pool: pool.length,
  cardsMatchingAny: cardsHit.size,
  xInPrintedManaCost: xInManaCost,
  detectors: DETECTORS.map(d => ({ id: d.id, mechanism: d.mechanism, engineFact: d.engineFact, re: String(d.re), cards: counts.get(d.id) ?? 0, samples: samples.get(d.id) ?? [] })),
}, null, 2));
line();
line(`written: ${OUT}`);
writeFileSync(join(ROOT, 'scratch', 'structural-gaps.txt'), out.join('\n'));
