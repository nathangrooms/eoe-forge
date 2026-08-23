/**
 * WHERE THE STATIC PROBE AND A REAL GAME DISAGREE.
 *
 * Two measurements of the same cards, taken by code that shares nothing:
 *
 *   the probe    `verify-ability-coverage.mjs` compiles every card, grades it,
 *                and runs its abilities on one fixed seven object board.
 *                Verdict per card: AUTOMATED / PROMPTED / PROMPTABLE / SILENT.
 *
 *   the game     `playtest/run.ts` plays twenty complete games and
 *                `playtest/analyze.ts` replays them through the real reducer,
 *                watching each resolution from outside and asking whether the
 *                state moved when the card's text was DUE.
 *                Verdict per card: acted / correctly-quiet / silent-*.
 *
 * Neither is the truth. They are two instruments, and the ONLY thing this file
 * does is put them on the same rows and print the cells where they differ,
 * because a cell where they agree teaches nothing and a cell where they differ
 * is a defect in one of them.
 *
 * THE TWO DISAGREEMENTS, and they are not symmetric:
 *
 *   FALSE REFUSAL   the probe says SILENT or PROMPTABLE, and the card ACTED in
 *                   a real game. The probe is wrong. Every one of these is a
 *                   card the port already plays and the number does not credit.
 *
 *   FALSE PASS      the probe says AUTOMATED or PROMPTED, and the card was
 *                   SILENT in a real game with its text due. The probe is
 *                   wrong in the direction that flatters, which is the one this
 *                   project treats as the dangerous one.
 *
 * A card that was `correctly-quiet` is EXCLUDED from both. Nothing was due, so
 * the game said nothing about it and reading agreement or disagreement into
 * that would be inventing evidence. That exclusion is what keeps this file from
 * being an argument for a bigger number.
 *
 * Usage:
 *   DM_CARD_DUMP=1 node --experimental-strip-types scripts/verify-ability-coverage.mjs
 *   node --experimental-strip-types scripts/playtest/run.ts --seed 1 --games 20 --max-turns 200 --verify
 *   DM_ALL_SIGHTINGS=1 node --experimental-strip-types scripts/playtest/analyze.ts --run <run>
 *   node --experimental-strip-types scripts/probe-vs-play.mjs <run>
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = process.argv[2] ?? 'commander-2p-seed1-x20';
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const SIGHTINGS = join(ROOT, 'scratch', 'playtest', 'reports', `sightings-${RUN.replace(/[^\w.+-]/g, '_')}.json`);
const OUT = join(ROOT, 'scratch', 'probe-vs-play.json');

for (const f of [VERDICTS, SIGHTINGS]) {
  if (!existsSync(f)) { console.error(`Missing ${f}. See the usage block at the top of this file.`); process.exit(1); }
}

const dump = JSON.parse(readFileSync(VERDICTS, 'utf8'));
const play = JSON.parse(readFileSync(SIGHTINGS, 'utf8'));

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

/*
 * The join is BY NAME, and that is the weakest link in this file, so it is
 * measured rather than assumed. The probe keys on oracle id and the harness
 * keys on the printed name, and a name that does not join is dropped and
 * COUNTED, so a silent join failure cannot quietly shrink either side.
 */
const probeOf = new Map();
for (const c of dump.cards) if (!probeOf.has(c.n)) probeOf.set(c.n, c);

/* What the GAME said, reduced to three states, and the reduction is the whole
   argument so it is written out rather than buried in a filter:
     acted        the state moved when the text was due.
     silent       the text was due and the state did not move.
     no-evidence  nothing was due. The game is SILENT ABOUT THIS CARD and it
                  is excluded from every comparison below. */
function gameSays(s) {
  const v = s.verdicts ?? {};
  const acted = v['acted'] ?? 0;
  const silent =
    (v['silent-noted'] ?? 0) + (v['silent-marked'] ?? 0) + (v['silent-untold'] ?? 0) +
    (v['silent-drawback'] ?? 0) + (v['dead-on-arrival'] ?? 0) + (v['text-not-loaded'] ?? 0);
  if (acted > 0 && silent === 0) return 'acted';
  if (silent > 0 && acted === 0) return 'silent';
  if (acted > 0 && silent > 0) return 'both';
  return 'no-evidence';
}

const passing = v => v === 'AUTOMATED' || v === 'PROMPTED';

/*
 * HOW STRONG IS "ACTED", and this function is the reason this file is not a
 * ninety-four card argument for a bigger number.
 *
 * `acted` in the harness means one thing: the resolution left a state
 * difference that was not bookkeeping. It does NOT mean the card's printed text
 * ran, and the two instruments are not asking the same question:
 *
 *   the probe   grades EVERY paragraph. One unreadable line fails the card.
 *   the game    credits ANY movement during the resolution.
 *
 * So a card with four paragraphs, three of them unreadable, that entered tapped
 * is `acted`. Against a probe that graded all four it is not a disagreement at
 * all; it is the all-or-nothing card rule working as designed. Counting it as a
 * probe defect would be loosening the grading by arithmetic instead of by code,
 * which is the one move this project has agreed not to make.
 *
 * Measured on this very run: `Blade of the Sixth Pride` is a VANILLA 3/1 with no
 * oracle text, and it is filed `acted` with a footprint of "manaPool changed,
 * pendingTriggers changed, players.p2.life changed". None of those are its
 * doing. The harness attributes every difference inside one action to whatever
 * resolved, so a card that cannot possibly have acted can be credited. That
 * leak is small and it is real, and it is why the column below exists.
 *
 *   OTHER-OBJECT  something outside this card moved: another card's state, a
 *                 life total, combat, a zone change, a queued trigger. This is
 *                 the only strength that can CONTRADICT a probe refusal, and
 *                 even then only if the moved thing is what the refused
 *                 paragraph was for.
 *   SELF-ONLY     only the card's own tapped flag, counters or attachment
 *                 moved. Real, and usually one clause of several. It does not
 *                 speak for the paragraphs the probe refused.
 *   NOT-ITS-DOING the card has no text at all, so nothing in the footprint can
 *                 be its work. A harness attribution leak, counted openly.
 */
function evidenceStrength(row, probeRow) {
  const fp = row.footprint ?? [];
  if (probeRow.v === 'NO-TEXT') return 'NOT-ITS-DOING';
  if (fp.length === 0) return 'SELF-ONLY';
  const other = fp.some(f =>
    /^another card's/.test(f) || /^players\./.test(f) || /^combat/.test(f) ||
    /moved .* to /.test(f) || /^pendingTriggers/.test(f) || /^timedEffects/.test(f) ||
    /new card\(s\) appeared/.test(f) || /ceased to exist/.test(f) || /^countered /.test(f)
  );
  return other ? 'OTHER-OBJECT' : 'SELF-ONLY';
}

const cross = new Map();
let unjoined = 0;
const unjoinedNames = [];
const falseRefusals = [];
const falsePasses = [];
const agreeWorks = [];
const bothWays = [];
let noEvidence = 0;

for (const s of play.sightings) {
  const p = probeOf.get(s.name);
  if (!p) { unjoined++; if (unjoinedNames.length < 20) unjoinedNames.push(s.name); continue; }
  const g = gameSays(s);
  if (g === 'no-evidence') { noEvidence++; continue; }
  bump(cross, `${p.v} / ${g}`);
  const row = {
    name: s.name, probe: p.v, game: g, resolutions: s.resolutions, silent: s.silent,
    verdicts: s.verdicts, mechanic: s.mechanic, moment: s.moment,
    footprint: s.footprint ?? [],
    probeOutcome: p.p ?? null, probeActions: p.pa ?? null,
    unparsed: p.u, manual: p.m, dead: p.d ?? [], decision: p.dec ?? [],
    probeDeferred: p.df ?? [], probeUnbound: p.ub ?? [],
  };
  row.strength = evidenceStrength(row, p);
  if (g === 'both') bothWays.push(row);
  else if (!passing(p.v) && g === 'acted') falseRefusals.push(row);
  else if (passing(p.v) && g === 'silent') falsePasses.push(row);
  else if (passing(p.v) && g === 'acted') agreeWorks.push(row);
}

const L = [];
const say = s => { L.push(s); console.log(s); };

say('='.repeat(92));
say('THE PROBE AGAINST A REAL GAME');
say('='.repeat(92));
say('');
say(`probe verdicts   ${VERDICTS}   (${dump.generatedAt})`);
say(`real play        ${SIGHTINGS}   (${play.gamesAnalysed} games)`);
say('');
say(`distinct cards that resolved in the twenty games   ${play.distinctCardsResolved}`);
say(`  joined to a probe verdict by name                ${play.sightings.length - unjoined}`);
say(`  NOT joined (dropped, and counted here so the drop cannot hide) ${unjoined}`);
for (const n of unjoinedNames) say(`     ${n}`);
say(`  joined but the game had NOTHING DUE, so it says nothing   ${noEvidence}`);
say(`  joined and the game DID say something                     ${play.sightings.length - unjoined - noEvidence}`);
say('');

say('--- THE CROSS TABLE (only cards the game had something to say about) ---');
say(`  ${'probe verdict / what the game did'.padEnd(46)} cards`);
for (const [k, v] of [...cross.entries()].sort((a, b) => b[1] - a[1])) {
  say(`  ${k.padEnd(46)} ${String(v).padStart(5)}`);
}
say('');

say(`--- FALSE REFUSALS: the probe refused it, a real game played it: ${falseRefusals.length} ---`);
say('(the probe is wrong on every one of these, and each is a card the port already plays)');
const byReason = new Map();
for (const r of falseRefusals) {
  const why = r.unparsed > 0 ? 'probe: unparsed text on the card'
    : r.manual > 0 ? 'probe: {do:manual} marker on the card'
    : r.dead.length ? `probe: ${r.dead[0].slice(0, 62)}`
    : r.decision.length ? `probe: ${r.decision[0].slice(0, 62)}`
    : `probe: behaviour refused (${r.probeOutcome})`;
  bump(byReason, why);
}
for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) say(`  ${String(v).padStart(4)}  ${k}`);
say('');
say('');
say('  HOW STRONG IS THE EVIDENCE, because "acted" is a weaker word than it looks:');
const byStrength = new Map();
for (const r of falseRefusals) bump(byStrength, r.strength);
for (const [k, v] of [...byStrength.entries()].sort((a, b) => b[1] - a[1])) {
  const gloss = k === 'OTHER-OBJECT'
    ? 'something outside the card moved. This can contradict the probe.'
    : k === 'SELF-ONLY'
      ? 'only the card\'s own tapped/counters/attachment moved. Usually one clause of several.'
      : 'the card has NO TEXT, so none of it is the card\'s doing. A harness attribution leak.';
  say(`  ${String(v).padStart(4)}  ${k.padEnd(14)} ${gloss}`);
}
say('');
say('  Only the OTHER-OBJECT rows are candidates for a probe defect, and even those');
say('  are candidates rather than proof: the probe grades EVERY paragraph and the');
say('  game credits ANY movement, so a card can act on one clause and still carry');
say('  three the probe was right to refuse.');
say('');
say('  the OTHER-OBJECT rows, with what actually moved:');
for (const r of falseRefusals.filter(x => x.strength === 'OTHER-OBJECT').slice(0, 45)) {
  say(`    ${r.name.padEnd(32).slice(0, 32)} ${r.probe.padEnd(11)} ${(r.footprint.join('; ') || '-').slice(0, 62)}`);
}
say('');
say('  the SELF-ONLY rows (the card entered tapped, or attached, and nothing else):');
for (const r of falseRefusals.filter(x => x.strength === 'SELF-ONLY').slice(0, 40)) {
  say(`    ${r.name.padEnd(32).slice(0, 32)} ${r.probe.padEnd(11)} ${(r.footprint.join('; ') || '(no footprint recorded)').slice(0, 62)}`);
}
say('');

say(`--- FALSE PASSES: the probe passed it, a real game left it silent: ${falsePasses.length} ---`);
say('(the probe is wrong in the direction that flatters, which is the one that matters)');
for (const r of falsePasses) {
  say(`    ${r.name.padEnd(34).slice(0, 34)} ${r.probe.padEnd(11)} silent ${String(r.silent).padStart(3)}/${String(r.resolutions).padStart(3)}   ${r.mechanic ?? ''}`);
}
if (falsePasses.length === 0) say('    none');
say('');

say(`--- BOTH WAYS: the same card acted on one resolution and was silent on another: ${bothWays.length} ---`);
for (const r of bothWays) {
  say(`    ${r.name.padEnd(34).slice(0, 34)} ${r.probe.padEnd(11)} ${JSON.stringify(r.verdicts)}`);
}
if (bothWays.length === 0) say('    none');
say('');

say(`--- AGREED, both say it works: ${agreeWorks.length} ---`);
say('');

const judged = falseRefusals.length + falsePasses.length + agreeWorks.length + bothWays.length;
const strong = falseRefusals.filter(r => r.strength === 'OTHER-OBJECT').length;
say('--- WHAT THIS COSTS THE HEADLINE ---');
say(`Of ${judged} cards both instruments judged, they disagree on ${falseRefusals.length + falsePasses.length + bothWays.length}.`);
say(`The probe refuses ${falseRefusals.length} cards a real game moved something for, and passes`);
say(`${falsePasses.length} cards a real game left silent.`);
say('');
say(`Of the ${falseRefusals.length} refusals, ${strong} moved something OUTSIDE the card and are worth reading one`);
say(`by one. The rest moved only their own tapped flag or nothing attributable, and`);
say(`against a probe that grades every paragraph they are not disagreements at all.`);
say('');
say('This is a sample of what twenty commander games happen to draw, NOT the corpus.');
say('It cannot be scaled to 32,469 cards and no rate below is a corpus rate. What it');
say('CAN do is name a defect: a false refusal here is a probe defect that also exists');
say('on every corpus card of the same shape, and that shape is printed above.');

writeFileSync(OUT, JSON.stringify({
  run: RUN, probeGeneratedAt: dump.generatedAt, games: play.gamesAnalysed,
  distinctCardsResolved: play.distinctCardsResolved,
  unjoined, unjoinedNames, noEvidence, judged,
  cross: Object.fromEntries(cross),
  falseRefusalReasons: Object.fromEntries(byReason),
  falseRefusals, falsePasses, bothWays,
  agreeWorks: agreeWorks.map(r => r.name),
}, null, 1));
say('');
say(`wrote ${OUT}`);
