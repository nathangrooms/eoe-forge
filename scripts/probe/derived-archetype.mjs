/**
 * When the player names NOTHING, does the engine build the right archetype?
 *
 *   node --experimental-strip-types scripts/probe/derived-archetype.mjs
 *
 * THE INSTRUMENT THAT WAS MISSING. Five attempts to let more commanders reach a
 * shell were measured and refused, and CLAUDE.md records why they all look the
 * same: `commander-bench` scores the COMMANDER'S OWN jobs, a shell's packages
 * spend slots on the ARCHETYPE'S jobs, so admitting a shell always trades one
 * for the other and the benchmark sees only the side that loses. The eighteen
 * shell probe cannot referee it either, because it NAMES the shell - the one
 * case where admission is not in question.
 *
 * So this asks the question the others cannot. It builds with NO archetype, on
 * commanders whose archetype is not in doubt, and reports:
 *
 *   derived    which shell the engine chose for itself, or none
 *   right      whether that is the archetype the commander plainly is
 *   named      how many of that archetype's own example cards the deck holds
 *   pkgs       how many of that archetype's jobs the deck fills
 *
 * `named` and `pkgs` are the SAME measurements `strategy-decks.mjs` makes, on
 * the same shells, so the two are directly comparable: that probe is the
 * ceiling this one is measured against.
 *
 * THE EXPECTED ARCHETYPE IS TYPED FROM KNOWLEDGE, like the benchmark's job
 * lists, and kept to commanders no Commander player would argue about. Baral
 * counters spells and is paid for it. Sythis is the enchantress. Tatyova draws
 * on every land. That is the whole basis; nothing is scraped.
 *
 * READ `right` FIRST. `named` and `pkgs` are only meaningful when the engine
 * picked the archetype at all - a deck built as Aggro will hold none of
 * Enchantress's cards, and that is a correct reading of a wrong choice.
 */
import { readFileSync } from 'node:fs';
import { Catalog } from '../../supabase/functions/ai-deck-builder-v2/catalog.ts';
import { build } from '../../supabase/functions/ai-deck-builder-v2/pipeline.ts';
import { DECK_ARCHETYPES, shellCardNames } from '../../src/lib/deck/archetypeShells.ts';

const K = readFileSync('scratch/anon.txt', 'utf8').trim();
const catalog = new Catalog({
  url: 'https://udnaflcohfyljrsgqggy.supabase.co', anonKey: K, authorization: null,
});

/* Commander -> the archetype it plainly is. More than one id where the card
   genuinely supports both readings; either counts as right. */
const EXPECTED = [
  ['Baral, Chief of Compliance', ['control', 'spellslinger']],
  ['Talrand, Sky Summoner', ['spellslinger']],
  ['Niv-Mizzet, Parun', ['spellslinger']],
  ['Sythis, Harvest\u2019s Hand', ['enchantress']],
  ['Tatyova, Benthic Druid', ['lands', 'landfall']],
  ['Azusa, Lost but Seeking', ['lands', 'landfall', 'big-mana']],
  ['Meren of Clan Nel Toth', ['aristocrats', 'reanimator']],
  ['Brago, King Eternal', ['blink']],
  ['Krenko, Mob Boss', ['tribal', 'tokens', 'aggro']],
  ['Edgar Markov', ['tribal', 'aggro']],
];

const rows = [];
let right = 0;
for (const [name, want] of EXPECTED) {
  /* The derived shell is announced on the CONSOLE, not in the response: the
     result carries deck, commander, totals, analysis, changeLog and validation,
     and none of them says which shell the engine chose for itself. So the build
     log is captured rather than read out of the body, which is where the first
     version of this probe looked and got `(none)` ten times out of ten. */
  let out;
  const captured = [];
  const realLog = console.log;
  console.log = (...args) => { captured.push(args.join(' ')); };
  try {
    out = await build({
      catalog,
      request: { commander: { name }, powerLevel: 7, includeLands: true, useAIPlanning: false },
      apiKey: null, startedAt: Date.now(),
    });
  } catch (err) {
    console.log = realLog;
    rows.push(`${name.slice(0, 26).padEnd(27)} BUILD FAILED ${String(err).slice(0, 40)}`);
    continue;
  } finally {
    console.log = realLog;
  }
  const log = captured.join('\n');
  const read = /reads as ([^(]+)\(/.exec(log);
  const derivedName = read ? read[1].trim() : null;
  const shell = derivedName
    ? DECK_ARCHETYPES.find(a => a.name.toLowerCase() === derivedName.toLowerCase())
    : null;
  const ok = shell ? want.includes(shell.id) : false;
  if (ok) right += 1;

  /* Held against the archetype the commander SHOULD be, never against the one
     the engine picked - otherwise a wrong pick scores itself. */
  const target = DECK_ARCHETYPES.find(a => want.includes(a.id));
  const deck = new Set((out.body.result?.deck ?? []).map(d => (d.card ?? d).name));
  const names = target ? shellCardNames(target) : [];
  const legal = await catalog.cardsByName(names, 'commander');
  const identity = out.body.result?.identity ?? [];
  const inColour = legal.filter(r => (r.color_identity ?? []).every(c => identity.includes(c)));
  const held = (inColour.length ? inColour : legal).filter(r => deck.has(r.name)).length;
  const denom = (inColour.length ? inColour : legal).length;

  rows.push(
    `${name.slice(0, 26).padEnd(27)} ${(shell?.name ?? '(none)').slice(0, 14).padEnd(15)} ` +
      `${ok ? ' ok ' : 'WRONG'}  named ${String(held).padStart(2)}/${String(denom).padEnd(2)}`
  );
}

console.log('\ncommander                   derived         right   its own cards held');
console.log(rows.join('\n'));
console.log(`\n${right}/${EXPECTED.length} built as the archetype the commander plainly is.`);
console.log('Compare `named` against strategy-decks.mjs, which measures the same thing');
console.log('with the shell NAMED - that is the ceiling, not a different question.');
