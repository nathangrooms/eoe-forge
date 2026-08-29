/**
 * Reachability: can a player actually get at what the engine implements?
 *
 *   node --test --experimental-strip-types src/lib/game/reachability.test.ts
 *
 * Every other test in this directory constructs a `GameAction` by hand and
 * feeds it to the reducer. That is the correct way to test rules, and it is
 * also the reason this file has to exist: a test proving `ATTACH` moves an
 * Equipment onto a creature passes exactly as well when nothing in the app has
 * ever built an `ATTACH`. The rules were green and the game had no equip
 * button, for months, because a green suite says nothing about whether a human
 * can reach any of it.
 *
 * So this file tests a different property. For each action the engine accepts,
 * *something outside the reducer and outside the tests* has to produce it. An
 * action nobody produces is dead weight: implemented, proven, unreachable.
 *
 * There are two honest ways to produce one, and the distinction matters:
 *
 *   ENGINE-PRODUCED. `DRAW`, `CREATE_TOKEN` and `RESOLVE_STACK` are made by
 *   the engine when effects resolve. No control should build a `DRAW`; a game
 *   where the interface hands out cards behind the rules' back is broken. For
 *   these, a producer inside `src/lib/game` is the right answer.
 *
 *   PLAYER-PRODUCED. `ATTACH`, `PASS_PRIORITY` and `CARD_COUNTER` encode a
 *   *choice*. The engine cannot invent them, because it does not know whether
 *   you want to equip the sword, respond to the spell, or add the charge
 *   counter. If no interface builds these, the engine sits waiting to be asked
 *   and never is, which is precisely how counterspells came to be unreachable
 *   rather than broken.
 *
 * The first check below asks only whether SOMETHING builds the action. That is
 * the easy half, and on its own it is close to useless: an action the engine
 * builds during its own resolution counts as reachable even when no human can
 * ever initiate it. `CARD_COUNTER` passed because effects put +1/+1 counters on
 * creatures, which says nothing about Aether Vial, where the player is the one
 * who has to decide whether to add the charge counter and no control asked.
 *
 * The second check, further down, asks the half that matters: is there a path
 * from something a PERSON can press to the code that builds the action. It has
 * to trace that path through the engine rather than grep components for action
 * literals, because the architecture deliberately puts action construction in
 * the engine and leaves the interface only dispatching batches.
 *
 * The list below is a ratchet, not a target. It records what was unreachable
 * when the check was written so the build stays green while the gaps close.
 * Removing a name is the point. Adding one needs a reason in the diff, because
 * it means something got built that no player can use.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const ENGINE = join('src', 'lib', 'game');

/**
 * Actions with no producer as of this check. Shrink it; do not grow it.
 *
 * `PASS_TURN`, `END_COMBAT` and `UNTAP_ALL` are superseded by `ADVANCE_STEP`
 * and the turn flow rather than merely unwired, and are candidates for deletion
 * instead of wiring. They are listed because the check cannot tell the
 * difference, and a name sitting here is the record that somebody has to
 * decide.
 *
 * `PHASE_CHANGE` is the one to look at if this file ever seems like overkill.
 * It is validated in `rules.ts`, reduced in two places, listed as a
 * network-authorised action, handled in `effects.ts`, and `GameFeed` carries a
 * filter to keep it out of the log. Six pieces of working code serving an
 * action that nothing has ever constructed.
 */
const KNOWN_UNREACHABLE = new Set([
  'ADD_REPLACEMENT',
  /* `ATTACH` came off this list when `attach.ts` landed. It is the name this
     file's own header was written about: proven by tests, reduced correctly,
     unattached correctly by `sba.ts` under CR 704.5n, and never once built.
     Now `moves.ts` builds one when an Aura is cast at a permanent, `stack.ts`
     builds one when an Aura spell resolves, and `to-actions.ts` builds one when
     a compiled `{do:'attach'}` runs, which is what "Equip {2}" compiles to. */
  /* `CAST_COMMANDER` came off this list when `commander.ts` landed. It had a
     validation entry, a reducer case and a log line, and the tax it exists to
     count was being counted somewhere else entirely — a side effect inside the
     `PLAY` and `CAST_SPELL` cases, keyed off the card happening to be in the
     command zone. So the action was dead and the feature was invisible: a
     commander cast could not be found in an action log at all. `moves.ts` now
     builds one as part of the cast batch, which is the single path a preview
     click and a bot batch both take. */
  'END_COMBAT',
  'PASS_TURN',
  'PHASE_CHANGE',
  'REMOVE_REPLACEMENT',
  'RESET',
  /* `UNTAP_ALL` came off this list on 29 Aug 2026. The note above it said
     somebody had to decide whether it was superseded by the turn flow or merely
     unwired, and the answer is merely unwired: the untap step untaps the ACTIVE
     player's permanents, and every card that untaps a permanent out of turn
     ("untap all creatures you control", "untap all lands you control") is one
     the compiled bridge did not read. `manual.ts::untapAll` builds it and
     `playerControlsFor` offers it as Untap everything on the seat panel. */
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** Action names the reducer declares, read from the `GameAction` union. */
function declaredActions(): string[] {
  const types = readFileSync(join(ENGINE, 'types.ts'), 'utf8');
  const union = types.slice(types.indexOf('export type GameAction'));
  const names = new Set<string>();
  for (const match of union.matchAll(/type: '([A-Z_]+)'/g)) names.add(match[1]);
  return [...names].sort();
}

const FILES = walk(SRC).filter(f => f !== join(ENGINE, 'types.ts'));

/**
 * Files that build the action, split by side of the boundary. `rules.ts` is
 * excluded throughout: it is the consumer, and a `case 'ATTACH':` in the
 * reducer is not evidence that anything ever sends one.
 */
function producers(action: string): { engine: string[]; ui: string[] } {
  const needle = `type: '${action}'`;
  const engine: string[] = [];
  const ui: string[] = [];
  for (const file of FILES) {
    if (file === join(ENGINE, 'rules.ts')) continue;
    if (!readFileSync(file, 'utf8').includes(needle)) continue;
    (file.startsWith(ENGINE) ? engine : ui).push(file);
  }
  return { engine, ui };
}

test('every engine action has something that produces it', () => {
  const dead = declaredActions().filter(action => {
    const { engine, ui } = producers(action);
    return engine.length === 0 && ui.length === 0;
  });

  const regressed = dead.filter(action => !KNOWN_UNREACHABLE.has(action));
  assert.deepEqual(
    regressed,
    [],
    `These actions are implemented and tested but nothing in the app ever ` +
      `builds one, so no player can reach them: ${regressed.join(', ')}. ` +
      `Either wire a control that produces the action, or delete it.`,
  );
});

test('the unreachable list does not outlive the gaps it records', () => {
  const stillDead = [...KNOWN_UNREACHABLE].filter(action => {
    const { engine, ui } = producers(action);
    return engine.length === 0 && ui.length === 0;
  });
  const fixed = [...KNOWN_UNREACHABLE].filter(a => !stillDead.includes(a));

  assert.deepEqual(
    fixed,
    [],
    `Now reachable, so remove from KNOWN_UNREACHABLE: ${fixed.join(', ')}. ` +
      `Leaving a fixed action on the list lets the next one hide behind it.`,
  );
});

/* -------------------------------------------------------------------------- */
/* The larger half: is there a control a PERSON can press                     */
/* -------------------------------------------------------------------------- */

/**
 * The check above passes as soon as ANYTHING builds an action, so an action the
 * engine constructs during its own resolution counts as reachable even when no
 * human can ever initiate it. That is the gap the header admits to, and it is
 * the one that mattered: `CAST_SPELL`, `PASS_PRIORITY` and `COUNTER_SPELL` all
 * had engine producers and 32 passing tests, and no player had ever put a spell
 * on the stack, so no counterspell had ever been castable. The owner reported
 * that as "counter spells dont work at all", which was the correct conclusion
 * from the only evidence available at the table.
 *
 * So this asks the harder question, and it has to ask it two hops deep. The
 * architecture is deliberately that the ENGINE builds actions and the interface
 * dispatches the batch — `manual.ts` returns the +1/+1 counter action and
 * `ManualPanel.tsx` calls `dispatch(control.actions)` — so a control can be
 * perfectly reachable with the action literal appearing nowhere near it.
 * Grepping components for `type: 'CARD_COUNTER'` would therefore report a wired
 * control as dead and push the next person to inline the literal into a
 * component, which is the wrong fix.
 *
 * The question asked instead: is there an engine export whose own body builds
 * this action, and is that export named anywhere outside `src/lib/game`.
 */

/** Split an engine module into its exported declarations, name and body. */
function exportedChunks(file: string): Array<{ name: string; body: string }> {
  const text = readFileSync(file, 'utf8');
  const out: Array<{ name: string; body: string }> = [];
  const parts = text.split(/\nexport /);
  for (const part of parts.slice(1)) {
    const match = part.match(
      /^(?:declare\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/
    );
    if (match) out.push({ name: match[1], body: part });
  }
  return out;
}

const ENGINE_EXPORTS = FILES.filter(
  f => f.startsWith(ENGINE) && f !== join(ENGINE, 'rules.ts')
).flatMap(exportedChunks);

const OUTSIDE_TEXT = FILES.filter(f => !f.startsWith(ENGINE))
  .map(f => readFileSync(f, 'utf8'))
  .join('\n');

const mentions = (text: string, name: string) =>
  new RegExp(String.raw`\b` + name.replace(/\$/g, String.raw`\$`) + String.raw`\b`).test(text);

/**
 * Engine exports a control can actually get to, transitively.
 *
 * A component names `manualControlsFor`; that function calls `cardCounter`;
 * `cardCounter` is what builds the action. Stopping at one hop would report a
 * wired control as dead and push the next person to inline the action literal
 * into a component, which is the wrong fix — the whole point of the split is
 * that the engine owns what an action IS and the interface only dispatches it.
 * So the seed is every export named outside the engine, and the closure follows
 * engine-to-engine calls from there.
 */
const REACHED_FROM_OUTSIDE = (() => {
  const reached = new Set<string>();
  for (const chunk of ENGINE_EXPORTS) {
    if (mentions(OUTSIDE_TEXT, chunk.name)) reached.add(chunk.name);
  }
  // Fixed point. Bounded by the number of exports, which is in the hundreds.
  for (let pass = 0; pass < 12; pass++) {
    let grew = false;
    for (const chunk of ENGINE_EXPORTS) {
      if (!reached.has(chunk.name)) continue;
      for (const other of ENGINE_EXPORTS) {
        if (reached.has(other.name)) continue;
        /* A CALL, not a mention. Following bare names would walk through type
           annotations and prose in comments and eventually mark the whole
           engine reachable, which would make this ratchet say nothing. */
        if (new RegExp(String.raw`\b` + other.name + String.raw`\s*\(`).test(chunk.body)) {
          reached.add(other.name);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return reached;
})();

/** Is there any path from a control a person can press to this action? */
function offeredToAPlayer(action: string): boolean {
  const needle = `type: '${action}'`;
  // One hop: a component builds the literal itself.
  if (producers(action).ui.length > 0) return true;
  // Otherwise: is an engine export that builds this action REACHED from
  // outside. `rules.ts` is excluded for the same reason as above — a `case` in
  // the reducer consumes an action, it does not produce one.
  for (const chunk of ENGINE_EXPORTS) {
    if (!chunk.body.includes(needle)) continue;
    if (REACHED_FROM_OUTSIDE.has(chunk.name)) return true;
  }
  return false;
}

/**
 * Actions the ENGINE owns. A control that hands out cards behind the rules'
 * back is not a missing feature, it is a broken game. Listed so they never land
 * in the ratchet below and get "fixed" by wiring a button to them.
 */
const ENGINE_OWNED = new Set([
  /* `DRAW`, `DAMAGE` and `DAMAGE_CARD` were all here, on the argument this
     file's own header makes: a game where the interface hands out cards behind
     the rules' back is broken. That argument describes a table where the cards
     run themselves, and it had already been overturned once, for `SET_MONARCH`,
     for exactly the reason it fails again here. The compiled bridge runs about
     2.7% of the catalogue, so "draw two cards" and "deal 3 damage to any
     target" — between them most of the printed instructions in Magic — are
     overwhelmingly on cards the engine never read.

     Measured 29 Aug 2026 by `scripts/playtest/action-census.mjs`, which walks
     the real import graph rather than looking for a name anywhere in the tree:
     the turn's own draw step was the ONLY thing in the app that had ever put a
     card into a hand, and combat and ability resolution the only things that
     had ever dealt damage. A player resolving Rhystic Study or a Shock by hand
     had nothing to press, and the nearest control — Toughness −3 — records
     something that is not damage and does not wear off at cleanup.

     Being listed here meant the check below could never ask whether a player
     could do either. `libraryControlsFor` and the `damage` groups of
     `manualControlsFor` and `playerControlsFor` offer them now.

     `MILL`, `LOSE`, `WIN` and `CLEANUP` were also on this list and are not
     actions: no such member exists in the `GameAction` union, so all four were
     inert. Removed rather than left as decoration. */
  'SHUFFLE',
  'RESOLVE_STACK',
  'PHASE_CHANGE',
  /* `SET_MONARCH` was here, on the argument that being the monarch is something
     a card does to you rather than a button you press. That argument describes
     a table where the cards run themselves, and this is not one: the compiled
     bridge owns about 2.7% of the catalogue, so the card that just crowned
     somebody is overwhelmingly likely to be one the engine never read. Being
     listed as engine-owned meant the check below could never ask whether a
     player could say so, and nothing could — measured on 29 Aug 2026, no
     control anywhere built one and no seat on the mat drew `state.monarchId`.
     `playerControlsFor` offers it now and `SeatMat` shows who holds it. */
]);

/**
 * Choices no control offers yet. Shrink it; do not grow it.
 *
 * Each name here is a rule the engine implements and a player cannot use. They
 * are ordinary gaps rather than mysteries: nobody has built the control.
 */
const KNOWN_UNOFFERED = new Set([
  'ADD_REPLACEMENT',
  /* `ATTACH` came off this list at the same time. The control is two controls:
     `AbilityPanel` draws the equip ability like any other activated ability,
     because the compiler now expands the printed keyword into the ability CR
     702.6a says it is, and `CenterPreview` draws the row of permanents an Aura
     may be cast at. The harness had measured Equipment attaching 136 chances 0
     times over 80 games. */
  'END_COMBAT',
  'PASS_TURN',
  /* `PUT_ABILITY_ON_STACK` came off this list when `activate.ts` landed and
     `AbilityPanel.tsx` drew the control that builds one. It was the largest
     name on it: every card in the catalogue reading "{T}: do something"
     depended on it, and the harness had measured a permanent with an activated
     ability reaching the battlefield 472 times over 80 games and an activated
     ability being used zero times. */
  /* `CAST_COMMANDER` came off this list at the same time. The control is the
     preview's own Cast button, which has always been there and always built a
     bare `PLAY`; it reads "Cast commander, 2 more mana" when there is tax, and
     `CommanderPanel` beside it prints the printed cost, the tax and the reason
     the tax exists. This is an app built around Commander and the harness had
     measured commander tax being charged 0 times in 80 games. */
  'REMOVE_REPLACEMENT',
  'RESET',
  /* `UNTAP_ALL` came off this list at the same time. See the note in
     `KNOWN_UNREACHABLE` above: the control is Untap everything on the seat
     panel, and it says how many permanents it is about to untap. */
]);

test('every action that encodes a player choice has a control that builds it', () => {
  const unoffered = declaredActions().filter(
    action => !ENGINE_OWNED.has(action) && !offeredToAPlayer(action)
  );

  const regressed = unoffered.filter(action => !KNOWN_UNOFFERED.has(action));
  assert.deepEqual(
    regressed,
    [],
    `Implemented in the engine, tested, and nothing a person can press ever ` +
      `builds one: ${regressed.join(', ')}. The engine sits waiting to be asked ` +
      `and never is, which from a seat at the table is indistinguishable from ` +
      `an engine that does not implement the rule.`,
  );
});

test('the unoffered list does not outlive the gaps it records', () => {
  const fixed = [...KNOWN_UNOFFERED].filter(action => offeredToAPlayer(action));
  assert.deepEqual(
    fixed,
    [],
    `Now offered to a player, so remove from KNOWN_UNOFFERED: ${fixed.join(', ')}. ` +
      `Leaving a closed gap on the list lets the next one hide behind it.`,
  );
});

/* -------------------------------------------------------------------------- */
/* The third door: reachable SOMEWHERE is not reachable AT THE TABLE          */
/* -------------------------------------------------------------------------- */

/**
 * `offeredToAPlayer` above is fooled in two ways it cannot see, and both were
 * caught by hand on 29 Aug 2026 rather than by this file.
 *
 * IT SEEDS ON A MENTION, NOT AN IMPORT. Any engine export whose NAME appears
 * anywhere outside `src/lib/game` counts as reached — including a name that
 * only appears in a comment, and including an identically-named export in a
 * module nothing imports. `src/lib/simulation/tokenGenerator.ts` exports its
 * own unrelated `createToken` and no file imports that module, so dead code was
 * vouching for a live engine name.
 *
 * IT DOES NOT ASK WHICH SURFACE. `LIFE_CHANGE` has a producer — the
 * phone-on-the-table life counter at `/life`, a different page — so it read as
 * offered for months while no control in play mode could change a life total.
 *
 * `scripts/playtest/action-census.mjs` answers both: it parses every `import`
 * in `src` into a graph, resolves `@/`, follows the re-export barrel, and then
 * asks whether the specific export that BUILDS an action is imported,
 * transitively, by a module the play page itself loads. It is a script as well
 * as a ratchet because the list it prints is worth reading on purpose, and it
 * is imported here rather than reimplemented so the two can never disagree.
 */
const NOT_AT_THE_TABLE = new Set([
  /* Resolving the stack is the engine's, and correctly so: objects leave the
     stack by resolving or being countered, and both are consequences of
     priority rather than a button. */
  'RESOLVE_STACK',
  /* Renaming a seat is offered on the life counter and nowhere in play. Low
     stakes and listed rather than quietly excused. */
  'SET_PLAYER_NAME',
  /* `ADD_MANA` came off this list on 29 Aug 2026. The note here used to say the
     free-cast toggle was the escape hatch, and that is a toggle which makes
     EVERYTHING free standing in for a control that adds one specific mana.
     `playerControlsFor` now offers {W}{U}{B}{R}{G}{C} on the seat panel, each
     showing how many of that colour are already floating, and `SeatMat` draws
     the pool on the seat band — because `state.manaPool` was read by no
     component anywhere in play mode, so mana that emptied itself at the end of
     every step under CR 500.4 did so invisibly. */
  /* An anthem by hand: "creatures you control get +1/+1 until end of turn".
     A player can nudge each creature's stats instead, which is correct per
     creature and does not expire on its own. Listed as the real gap it is. */
  'ADD_CONTINUOUS',
  /* Countering a spell. Casting a counterspell the compiler CAN read works; for
     one it cannot, the nearest by-hand move is taking the spell off the stack
     to a graveyard, which is the right result and does not fire "whenever a
     spell is countered". */
  'COUNTER_SPELL',
]);

test('every player choice has a control ON THE PLAY SURFACE that builds it', async () => {
  const { census } = await import('../../../scripts/playtest/action-census.mjs');
  const { rows } = census();

  const missing = rows
    .filter(row => !row.atTheTable)
    // An action nothing builds at all is already covered by the first test, and
    // reporting it twice would make this list about something else.
    .filter(row => row.resolution.length > 0 || row.moves.length > 0 || row.liveUi.length > 0)
    .map(row => row.action)
    .filter(action => !NOT_AT_THE_TABLE.has(action))
    .sort();

  assert.deepEqual(
    missing,
    [],
    `Built somewhere, but nothing the play page loads ever builds one: ` +
      `${missing.join(', ')}. An action reachable on another screen is not ` +
      `reachable at the table, and this is the third way that distinction has ` +
      `been missed on this project.`,
  );
});

test('the not-at-the-table list does not outlive the gaps it records', async () => {
  const { census } = await import('../../../scripts/playtest/action-census.mjs');
  const { rows } = census();
  const fixed = [...NOT_AT_THE_TABLE].filter(
    action => rows.find(row => row.action === action)?.atTheTable
  );
  assert.deepEqual(
    fixed,
    [],
    `Now reachable from play mode, so remove from NOT_AT_THE_TABLE: ${fixed.join(', ')}.`,
  );
});

/* -------------------------------------------------------------------------- */
/* The fourth door: an action can be reachable and the STATE still be dead     */
/* -------------------------------------------------------------------------- */

/**
 * Everything above asks about ACTIONS, and there is a way for the whole set of
 * them to pass while a piece of the game is untouchable.
 *
 * `CardInstance.faceDown` and `CardInstance.flipped` were declared, initialised
 * to `false` when a card is dealt, carried forward on every zone change, and
 * READ — `mana.ts::faceTypeLine` picks which half of a `Name // Name` type line
 * is in play off `flipped`, which decides whether a permanent counts as a land,
 * a creature, or a permanent at all. Grepping the whole of `src` on 29 Aug
 * 2026, nothing anywhere ever set either to `true` except the network
 * projection, which uses `faceDown` for an unrelated thing (a card in a hidden
 * zone that only you may see).
 *
 * No action was missing. Every check above passed. A morph could not be turned
 * down, a two-faced card could not be turned over, and "exile it face down" had
 * no control and never would have had one, because nothing was looking one
 * level below the action.
 *
 * `scripts/playtest/state-census.mjs` looks there: it cuts the reducer's apply
 * switch into per-action blocks, expands the engine helpers each block calls,
 * and asks which of them CHANGE each declared field — as opposed to laying it
 * down at its default while building a fresh object, which is how `CREATE_TOKEN`
 * mentions `faceDown` without being able to set one.
 */
const STATE_ONLY_ON_RESOLUTION = new Set([
  /* An anthem, and a replacement effect. Both are continuous effects a card
     creates while it resolves, and the by-hand answer for the 97% of cards the
     compiler cannot read is to nudge each affected permanent instead, which is
     correct per permanent and does not expire on its own. Listed as the real
     gaps they are rather than excused. */
  'GameState.timedEffects',
  'GameState.replacements',
]);

test('no field of the game state is beyond every player', async () => {
  const { stateCensus } = await import('../../../scripts/playtest/state-census.mjs');
  const dead = stateCensus()
    .filter((row: { verdict: string }) => row.verdict === 'NOTHING WRITES IT')
    .map((row: { owner: string; field: string }) => `${row.owner}.${row.field}`)
    .sort();

  assert.deepEqual(
    dead,
    [],
    `Declared on the game state, read by the engine, and no action writes it: ` +
      `${dead.join(', ')}. That is this file's subject one level down — the ` +
      `action census cannot see it, because no action is missing. Either give ` +
      `the field an action a control builds, or delete the field.`
  );
});

test('the resolution-only state list does not outlive the gaps it records', async () => {
  const { stateCensus } = await import('../../../scripts/playtest/state-census.mjs');
  const rows = stateCensus() as Array<{ owner: string; field: string; verdict: string }>;
  const stillEngineOnly = new Set(
    rows
      .filter(row => row.verdict === 'ONLY WHEN A CARD RESOLVES')
      .map(row => `${row.owner}.${row.field}`)
  );
  const fixed = [...STATE_ONLY_ON_RESOLUTION].filter(name => !stillEngineOnly.has(name));
  assert.deepEqual(
    fixed,
    [],
    `A player can change these now, so take them off STATE_ONLY_ON_RESOLUTION: ` +
      `${fixed.join(', ')}.`
  );
});

/* -------------------------------------------------------------------------- */
/* The same question asked of DATA rather than of actions                     */
/* -------------------------------------------------------------------------- */

/**
 * The port has to reach a real table, not just a script.
 *
 * This file's whole subject is the gap between "the engine implements it" and
 * "a player can get at it", and on 23 Aug 2026 the ported XMage behaviour was
 * sitting in exactly that gap in a form the action census above cannot see. No
 * action was missing. The DATA was: `XMAGE_LOWERED` is keyed by Scryfall
 * `oracle_id`, `card-abilities.ts` reads that id off `CardInstance.oracleId`,
 * and `PlayCard` had no field to carry one — so `buildTable` set none, every
 * lookup missed, and a table dealt from a deck of nothing but swappable cards
 * ran none of them.
 *
 * It measured as a gain of 305 cards the whole time, because
 * `verify-ability-coverage.mjs` hands the compiler a Scryfall row and a
 * Scryfall row always has an oracle id. Only a game built the way the app
 * builds one could see it, which is what this test is.
 */
test('a table dealt the way the app deals one runs the ported records', async () => {
  const { buildTable } = await import('./setup.ts');
  const { abilitiesFor } = await import('./abilities/card-abilities.ts');
  const { XMAGE_LOWERED } = await import('../cards/xmage/lowered.generated.ts');

  const oracleId = Object.keys(XMAGE_LOWERED)[0];
  assert.ok(oracleId, 'the shipped table must hold at least one record');

  // Deliberately a card whose oracle text is empty, so the oracle-text compiler
  // has nothing to work with and the ONLY way abilities can appear is the port.
  const deck = {
    id: 'reach', name: 'Reach', format: 'commander' as const, source: 'user-deck' as const,
    commanders: [],
    cards: Array.from({ length: 8 }, (_, i) => ({
      cardId: `print-${i}`,
      oracleId,
      name: 'Ported Card',
      typeLine: 'Creature — Bear',
      oracleText: '',
      power: '2',
      toughness: '2',
    })),
  };

  const { state } = buildTable({
    id: 'reach-table', seed: 1, now: 0, format: 'commander',
    seats: [{ deck, playerName: 'You', playerId: 'p1' }],
  });

  const instances = Object.values(state.cards);
  assert.ok(instances.length > 0, 'the table must have been dealt');

  const carrying = instances.filter(c => c.oracleId === oracleId);
  assert.equal(
    carrying.length,
    instances.length,
    'every card instance must carry the oracle id its deck row had, or the ported ' +
      'table cannot be looked up for any of them',
  );

  const fromPort = instances.filter(c => abilitiesFor(c).source === 'xmage');
  assert.equal(
    fromPort.length,
    instances.length,
    'every one of these cards must get its abilities from the port: the compiler ' +
      'has no oracle text to read, so anything else means the record was never consulted',
  );
});
