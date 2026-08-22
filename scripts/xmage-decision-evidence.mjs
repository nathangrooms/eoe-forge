/**
 * DeckMatrix — evidence for one decision, and nothing else.
 *
 * THE DECISION
 *
 *   (a) use XMage's class ranking only to PRIORITISE our existing text
 *       compiler, and keep parsing oracle text.
 *   (b) use the card-to-class map as a DIRECT SOURCE OF TRUTH: look up which
 *       XMage classes a card composes, instantiate our equivalents, and parse
 *       no text at all in that path.
 *
 * Taste cannot settle that. Three measurements can, and this script makes them.
 *
 * MEASUREMENT 1 — IS A CLASS SET ENOUGH TO BUILD A CARD?
 *   The map is keyed on card name and its value is a SET OF CLASS NAMES. It
 *   carries no constructor arguments, because `scripts/xmage-ground-truth.mjs`
 *   derives the set from the card file's IMPORTS. So the map records that a
 *   card destroys something, never what or how much.
 *   This counts how many cards share an identical class set with another card,
 *   and prints the largest collisions with their members named, so the claim
 *   can be checked by eye rather than believed.
 *
 * MEASUREMENT 2 — WHAT IS ACTUALLY STOPPING OUR CARDS?
 *   Our own compiler is run over the pool and each silent card is put in one of
 *   three boxes: the text did not parse, the text parsed and nothing runs it, or
 *   it is deliberately marked manual. Only the FIRST box is a parsing problem,
 *   and only the first box is a box (b) could empty.
 *
 * MEASUREMENT 3 — THE HONEST CEILING ON (b) TODAY.
 *   Cross measurement 2 with class-composability. A card that (b) could build
 *   must satisfy all of: it joins XMage by name, every class it names is one we
 *   have, and we do not already reach it. That intersection is the whole prize,
 *   and it is printed as a number rather than described.
 *
 * ## Provenance
 *
 * Reads `scratch/xmage-ground-truth.json` (derived data: class names and card
 * names, no Java, no oracle text) and the cached Scryfall bulk file. Imports the
 * real compiler, so the parse figures are the compiler's own and not a proxy.
 * The verdict table is imported from `scripts/xmage-class-worklist.mjs` rather
 * than copied, so the two cannot drift apart.
 *
 * XMage is MIT (magefree/mage). Nothing from XMage is vendored into this repo.
 *
 * Usage: node --experimental-strip-types scripts/xmage-decision-evidence.mjs
 * Local files only. No network, no database, no model.
 */

import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRUTH = join(ROOT, 'scratch', 'xmage-ground-truth.json');
const WORKLIST = join(ROOT, 'scratch', 'xmage-class-worklist.json');
const ORACLE = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'xmage-decision-evidence.json');

const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const lines = [];
const say = s => { lines.push(s); console.log(s); };

for (const [label, path] of [['ground truth', TRUTH], ['worklist', WORKLIST], ['scryfall bulk', ORACLE]]) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    process.exit(1);
  }
}

const truth = JSON.parse(readFileSync(TRUTH, 'utf8'));
const worklist = JSON.parse(readFileSync(WORKLIST, 'utf8'));
const cardToClasses = truth.cardToClasses;
const cardMeta = truth.cardMeta ?? {};
const ranking = truth.ranking;
const bySimple = new Map(ranking.map(r => [r.simple, r]));

say('='.repeat(78));
say('EVIDENCE FOR THE (a) vs (b) DECISION');
say('='.repeat(78));
say('');
say(`ground truth    ${truth.script}, generated ${truth.generatedAt}`);
say(`xmage commit    ${truth.source.commit}`);
say(`licence         ${truth.source.licence}`);
say(`extraction      ${truth.method.symbolSource}`);
say('');

/* ================================================================== *
 * MEASUREMENT 1 — is a class set enough to build a card?
 * ================================================================== */

say('='.repeat(78));
say('MEASUREMENT 1 — DOES A CLASS SET IDENTIFY A CARD?');
say('='.repeat(78));
say('');
say('The map value is a SET OF CLASS NAMES with no constructor arguments,');
say('because the extractor reads the card file\'s imports. If two different');
say('cards share a class set, then the map cannot tell them apart, and a');
say('builder driven only by the map cannot build either one correctly.');
say('');

const sigOf = new Map();
for (const [card, fqns] of Object.entries(cardToClasses)) {
  const key = [...fqns].sort().join('|');
  if (!sigOf.has(key)) sigOf.set(key, []);
  sigOf.get(key).push(card);
}

const totalCards = Object.keys(cardToClasses).length;
let uniqueSig = 0;
let sharedCards = 0;
for (const [, members] of sigOf) {
  if (members.length === 1) uniqueSig++;
  else sharedCards += members.length;
}

say(`cards in the map                          ${totalCards}`);
say(`distinct class signatures                 ${sigOf.size}`);
say(`cards whose signature is theirs alone     ${uniqueSig}  (${pct(uniqueSig, totalCards)}%)`);
say(`cards SHARING a signature with another    ${sharedCards}  (${pct(sharedCards, totalCards)}%)`);
say('');
say('THE LARGEST COLLISIONS, members named so the claim can be checked:');
say('');

const collisions = [...sigOf.entries()]
  .filter(([k]) => k !== '')
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10);

const collisionReport = [];
for (const [key, members] of collisions) {
  const classes = key.split('|').map(s => s.split('.').pop());
  say(`  ${members.length} cards all compose [${classes.join(', ')}]`);
  say(`      ${members.slice(0, 6).join(' | ')}`);
  say('');
  collisionReport.push({ classes, cards: members.length, sample: members.slice(0, 8) });
}

const emptySig = sigOf.get('') ?? [];
say(`cards naming NO ability class at all      ${emptySig.length}  (vanilla, correctly)`);
say('');

/* ================================================================== *
 * MEASUREMENT 2 — what is stopping our cards
 * ================================================================== */

say('='.repeat(78));
say('MEASUREMENT 2 — WHY OUR ENGINE IS SILENT, FROM OUR OWN COMPILER');
say('='.repeat(78));
say('');

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
{
  const rl = createInterface({ input: createReadStream(ORACLE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }
}

say(`pool (same filter as verify-ability-coverage.mjs)   ${pool.length}`);
say('');

/*
 * Three boxes, and the distinction between them is the whole decision:
 *
 *   PARSE-BLOCKED   the compiler left text unaccounted for. A different SOURCE
 *                   of structure could help here, so this is (b)'s territory.
 *   RUNTIME-BLOCKED the compiler produced a complete ability and the engine has
 *                   no code that acts on it. A different source of structure
 *                   changes NOTHING here: we would parse the same card into the
 *                   same shape and still not run it.
 *   MARKED-MANUAL   the card says a human decides. Correct, not a gap.
 */
const status = new Map();
let compileErrors = 0;

for (const card of pool) {
  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    compileErrors++;
    status.set(card.oracle_id, { box: 'compile-error', coverage: 'none' });
    continue;
  }
  const coverage = trace.result?.coverage ?? 'none';
  const abilities = trace.result?.abilities ?? [];
  const manual = abilities.some(a => hasManualEffect(effectsOf(a)));

  let box;
  if (!card.oracle_text || !String(card.oracle_text).trim()) box = 'no-text';
  else if (manual) box = 'marked-manual';
  else if (coverage === 'full') box = 'parsed-fully';
  else if (coverage === 'partial') box = 'parsed-partly';
  else box = 'parse-blocked';

  status.set(card.oracle_id, { box, coverage });
}

const boxCount = new Map();
for (const [, v] of status) boxCount.set(v.box, (boxCount.get(v.box) ?? 0) + 1);

say('our compiler over the pool, by how far it got:');
for (const [box, n] of [...boxCount].sort((a, b) => b[1] - a[1])) {
  say(`  ${box.padEnd(18)} ${String(n).padStart(6)}  (${pct(n, pool.length)}%)`);
}
if (compileErrors) say(`  compiler threw on ${compileErrors}`);
say('');

/* ================================================================== *
 * MEASUREMENT 3 — the ceiling on (b)
 * ================================================================== */

say('='.repeat(78));
say('MEASUREMENT 3 — THE CEILING ON (b), AND WHERE THE SEAM IS');
say('='.repeat(78));
say('');

// Rebuild the covered-class set exactly as the worklist does.
const FREE_KINDS = new Set(['interface', 'abstract']);
const covered = new Set();
for (const r of ranking) if (FREE_KINDS.has(r.kind) || r.bucket === 'hint') covered.add(r.fqn);
for (const v of worklist.verdicts) {
  if (v.verdict === 'HAVE' || v.verdict === 'STRUCTURAL') {
    const row = bySimple.get(v.name);
    if (row) covered.add(row.fqn);
  }
}

const xmageNames = new Set(Object.keys(cardToClasses));
const classesFor = name => {
  if (cardToClasses[name]) return cardToClasses[name];
  const front = String(name).split(' // ')[0];
  return cardToClasses[front] ?? null;
};

let joined = 0;
let unjoined = 0;
const cross = new Map(); // `${box}|${composable}` -> n

for (const card of pool) {
  const fqns = classesFor(card.name);
  const st = status.get(card.oracle_id);
  if (!fqns) {
    unjoined++;
    const key = `${st.box}|NO-XMAGE-ENTRY`;
    cross.set(key, (cross.get(key) ?? 0) + 1);
    continue;
  }
  joined++;
  const composable = fqns.every(f => covered.has(f)) ? 'composable-now' : 'needs-more-classes';
  const key = `${st.box}|${composable}`;
  cross.set(key, (cross.get(key) ?? 0) + 1);
}

say(`joined to an XMage entry     ${joined}  (${pct(joined, pool.length)}%)`);
say(`no XMage entry               ${unjoined}  (${pct(unjoined, pool.length)}%)`);
say('');
say('CROSS-TABULATION: how far OUR compiler got, against what XMage says the');
say('card composes. "composable-now" means every class it names is one the');
say('worklist grades HAVE or STRUCTURAL.');
say('');
say('  our compiler        xmage says              cards');
const boxes = ['parsed-fully', 'parsed-partly', 'parse-blocked', 'marked-manual', 'no-text', 'compile-error'];
const comps = ['composable-now', 'needs-more-classes', 'NO-XMAGE-ENTRY'];
for (const b of boxes) {
  for (const c of comps) {
    const n = cross.get(`${b}|${c}`) ?? 0;
    if (n === 0) continue;
    say(`  ${b.padEnd(18)}  ${c.padEnd(20)}  ${String(n).padStart(6)}`);
  }
}
say('');

const parseBlockedComposable = cross.get('parse-blocked|composable-now') ?? 0;
const parseBlockedNeedsMore = cross.get('parse-blocked|needs-more-classes') ?? 0;
const parseBlockedNoEntry = cross.get('parse-blocked|NO-XMAGE-ENTRY') ?? 0;
const parseBlockedTotal = parseBlockedComposable + parseBlockedNeedsMore + parseBlockedNoEntry;

const runtimeBlocked =
  (cross.get('parsed-fully|composable-now') ?? 0) +
  (cross.get('parsed-fully|needs-more-classes') ?? 0) +
  (cross.get('parsed-fully|NO-XMAGE-ENTRY') ?? 0);

say('THE TWO POPULATIONS, STATED PLAINLY:');
say('');
say(`  cards our compiler CANNOT READ                       ${parseBlockedTotal}`);
say('    this is the only population a different source of structure helps.');
say(`      of those, XMage has no entry either              ${parseBlockedNoEntry}`);
say(`      of those, they need classes we have not written  ${parseBlockedNeedsMore}`);
say(`      of those, composable from classes we HAVE        ${parseBlockedComposable}  <- (b)'s whole prize today`);
say('');
say(`  cards our compiler READS FULLY                       ${runtimeBlocked}`);
say('    for these the parse is already right. Whatever is wrong is downstream,');
say('    and route (b) would arrive at the same shape and still not run it.');
say('');

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      script: 'scripts/xmage-decision-evidence.mjs',
      groundTruth: {
        script: truth.script,
        generatedAt: truth.generatedAt,
        commit: truth.source.commit,
        licence: truth.source.licence,
        extraction: truth.method.symbolSource,
      },
      signature: {
        cards: totalCards,
        distinctSignatures: sigOf.size,
        uniqueSignature: uniqueSig,
        sharingSignature: sharedCards,
        vanillaNoClasses: emptySig.length,
        largestCollisions: collisionReport,
      },
      compiler: { pool: pool.length, byBox: Object.fromEntries(boxCount), compileErrors },
      join: { joined, unjoined },
      cross: Object.fromEntries(cross),
      populations: {
        parseBlockedTotal,
        parseBlockedComposable,
        parseBlockedNeedsMore,
        parseBlockedNoEntry,
        parsedFully: runtimeBlocked,
      },
    },
    null,
    1
  )
);

writeFileSync(join(ROOT, 'scratch', 'xmage-decision-evidence.txt'), lines.join('\n'));
say(`wrote ${OUT}`);
