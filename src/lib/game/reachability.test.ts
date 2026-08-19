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
 * WHAT THIS CHECK STILL CANNOT SEE, because it is the larger half of the
 * problem. Any producer satisfies it, so an action the engine builds during
 * resolution counts as reachable even when the *player-initiated* path is
 * missing. `CARD_COUNTER` passes because effects put +1/+1 counters on
 * creatures; that says nothing about Aether Vial, where the player is the one
 * who has to decide whether to add the charge counter, and no control asks.
 * The same holds for `PASS_PRIORITY`, `PUT_ABILITY_ON_STACK`, `COUNTER_SPELL`
 * and `MARK_MANUAL_RESOLVED`: all produced somewhere inside the engine, none
 * offered to a human. Passing this file means no action is entirely orphaned.
 * It does not mean the game asks you everything it should.
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
  'ATTACH',
  'CAST_COMMANDER',
  'END_COMBAT',
  'PASS_TURN',
  'PHASE_CHANGE',
  'REMOVE_REPLACEMENT',
  'RESET',
  'SET_INITIATIVE',
  'UNTAP_ALL',
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
