/**
 * How many REAL cards do these primitives actually automate?
 *
 *   node --experimental-strip-types scripts/primitives/measure-unlocked.ts
 *
 * Not an estimate, not a sum of the specs' `unlocks` columns — those are solo
 * figures and `PRIMITIVE-BUILD-ORDER.md` §3 measures that summing them
 * overstates the truth by a factor of fifteen. This compiles every distinct
 * `oracle_id` in the catalogue, builds a board for it, RUNS its abilities twice
 * — once through the shipped `runEffects`, once through the primitives — and
 * counts the difference.
 *
 * ## Three numbers, and they are not interchangeable
 *
 * | number | what it is |
 * |---|---|
 * | REPRESENTABLE | the compiler modelled every clause: `coverage === 'full'` |
 * | AUTOMATED (today) | resolves through `to-actions.ts` with zero deferrals |
 * | AUTOMATED (with primitives adopted) | the same, through `adopt.ts` |
 *
 * The middle column is what a player experiences right now. The third is what
 * they would experience after one edit per case in `to-actions.ts`. Nothing in
 * this script changes the middle column: the primitives are NOT wired into the
 * shipped switch, so **today's automated count is unchanged and the delta is a
 * measurement of a pending change, not of a shipped one.**
 *
 * ## The board, and why the number is a lower bound
 *
 * Every card gets the same synthetic board: itself, two creatures each side, a
 * graveyard, a small library, an opponent. Targets are bound to the first legal
 * object. That is a fair, uniform environment and it is not every board a card
 * could see — a card that resolves cleanly here might still defer on a board
 * where a choice opens up, and one that defers here might be forced elsewhere.
 * The count is therefore an approximation with a known direction of error for
 * the choice-shaped verbs, and it is stated as such rather than rounded off.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileCardAbilities } from '../../src/lib/cards/abilities/compiler.ts';
import { effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import type { Ability, Effect } from '../../src/lib/cards/abilities/dsl.ts';
import type { AbilityCard } from '../../src/lib/cards/abilities/normalize.ts';
import { addCard, createGame } from '../../src/lib/game/rules.ts';
import type { GameState, StackTarget } from '../../src/lib/game/types.ts';
import { makeContext } from '../../src/lib/game/abilities/context.ts';
import { runEffects } from '../../src/lib/game/abilities/to-actions.ts';
import { runEffectsWithPrimitives } from '../../src/lib/game/abilities/primitives/adopt.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, 'scripts', 'primitives', '.data');

/* -------------------------------------------------------------------------- */
/* One board, shared shape, built fresh per card                              */
/* -------------------------------------------------------------------------- */

function boardFor(card: AbilityCard): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [{ name: 'P1' }, { name: 'P2' }],
    seed: 11,
  });
  state = { ...state, status: 'playing' };

  const bear = (id: string, owner: string, zone: 'battlefield' | 'graveyard' | 'library') =>
    addCard(
      state,
      { instanceId: id, cardId: id, name: 'Grizzly Bears', ownerId: owner, typeLine: 'Creature — Bear', power: '2', toughness: '2' },
      zone
    );

  state = bear('mine1', 'p1', 'battlefield');
  state = bear('mine2', 'p1', 'battlefield');
  state = bear('theirs1', 'p2', 'battlefield');
  state = bear('theirs2', 'p2', 'battlefield');
  state = bear('gy1', 'p1', 'graveyard');
  state = addCard(
    state,
    { instanceId: 'lib1', cardId: 'lib1', name: 'Forest', ownerId: 'p1', typeLine: 'Basic Land — Forest' },
    'library'
  );
  state = addCard(
    state,
    { instanceId: 'lib2', cardId: 'lib2', name: 'Island', ownerId: 'p1', typeLine: 'Basic Land — Island' },
    'library'
  );
  state = addCard(
    state,
    { instanceId: 'hand1', cardId: 'hand1', name: 'Grizzly Bears', ownerId: 'p1', typeLine: 'Creature — Bear', power: '2', toughness: '2' },
    'hand'
  );

  state = addCard(
    state,
    {
      instanceId: 'src',
      cardId: 'src',
      name: String(card.name ?? 'Source'),
      ownerId: 'p1',
      typeLine: String(card.type_line ?? 'Enchantment'),
      oracleText: card.oracle_text ?? undefined,
      power: card.power ?? undefined,
      toughness: card.toughness ?? undefined,
    },
    'battlefield'
  );

  return state;
}

/** Bind every declared target to the first plausible object. */
function targetsFor(ability: Ability): StackTarget[] {
  const specs = 'targets' in ability ? (ability.targets ?? []) : [];
  return specs.map((spec) => {
    if (spec.what === 'player') return { kind: 'player', playerId: 'p2' } as StackTarget;
    return { kind: 'card', instanceId: 'theirs1', zone: 'battlefield' } as StackTarget;
  });
}

function walk(effects: readonly Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of effects ?? []) {
    out.push(e);
    if (e.do === 'if') { walk(e.then, out); walk(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') walk(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) walk(m.effects, out);
  }
  return out;
}

/* -------------------------------------------------------------------------- */

const printings: AbilityCard[] = JSON.parse(readFileSync(join(dataDir, 'catalogue.json'), 'utf8'));
const byOracle = new Map<string, AbilityCard>();
for (const card of printings) {
  const id = card.oracle_id ?? card.name ?? '';
  if (!byOracle.has(id)) byOracle.set(id, card);
}

let representableFull = 0;
let automatedBefore = 0;
let automatedAfter = 0;
let threwBefore = 0;
let threwAfter = 0;
const newlyAutomated: string[] = [];
const stillBlocked = new Map<string, number>();

for (const [, card] of byOracle) {
  let compiled;
  try { compiled = compileCardAbilities(card); } catch { continue; }
  if (compiled.coverage !== 'full') continue;
  representableFull++;

  const state = boardFor(card);
  let deferredBefore = 0;
  let deferredAfter = 0;
  let brokeBefore = false;
  let brokeAfter = false;
  const blockers = new Set<string>();

  for (const ability of compiled.abilities) {
    const effects = effectsOf(ability);
    if (effects.length === 0) continue;
    const ctx = makeContext(state, 'src', 'p1', { targets: targetsFor(ability), defendingPlayerId: 'p2' });

    try {
      deferredBefore += runEffects(effects, ctx, { at: 0, idPrefix: 'm' }).deferred.length;
    } catch { brokeBefore = true; }

    try {
      const after = runEffectsWithPrimitives(effects, ctx, { at: 0, idPrefix: 'm', ordinal: 0, timestamp: 1 });
      deferredAfter += after.deferred.length;
      if (after.deferred.length > 0) {
        for (const e of walk(effects)) blockers.add(e.do);
      }
    } catch { brokeAfter = true; }
  }

  if (brokeBefore) threwBefore++;
  if (brokeAfter) threwAfter++;

  const cleanBefore = !brokeBefore && deferredBefore === 0;
  const cleanAfter = !brokeAfter && deferredAfter === 0;
  if (cleanBefore) automatedBefore++;
  if (cleanAfter) automatedAfter++;
  if (cleanAfter && !cleanBefore) newlyAutomated.push(String(card.name));
  if (!cleanAfter) for (const b of blockers) stillBlocked.set(b, (stillBlocked.get(b) ?? 0) + 1);
}

const report = {
  distinctOracleIds: byOracle.size,
  representableFull,
  automatedBefore,
  automatedAfterAdoption: automatedAfter,
  newlyAutomated: automatedAfter - automatedBefore,
  threwBefore,
  threwAfter,
  sampleNewlyAutomated: newlyAutomated.slice(0, 40).sort(),
  stillBlockedBy: [...stillBlocked].sort((a, b) => b[1] - a[1]).slice(0, 20),
};

writeFileSync(join(dataDir, 'unlocked.json'), JSON.stringify(report, null, 2));

console.log('');
console.log(`  distinct oracle_id                          ${report.distinctOracleIds}`);
console.log(`  REPRESENTABLE (coverage === 'full')         ${report.representableFull}`);
console.log('');
console.log(`  AUTOMATED today, shipped to-actions.ts      ${report.automatedBefore}`);
console.log(`  AUTOMATED with these primitives adopted     ${report.automatedAfterAdoption}`);
console.log(`  NEWLY automated by this work                ${report.newlyAutomated}`);
console.log('');
console.log(`  cards where the shipped switch THREW        ${report.threwBefore}`);
console.log(`  cards where the primitive path threw        ${report.threwAfter}`);
console.log('');
console.log('  a sample of the newly automated:');
for (const name of report.sampleNewlyAutomated.slice(0, 25)) console.log(`    ${name}`);
console.log('');
console.log('  what still blocks the rest (effect verbs present on a card that still defers):');
for (const [verb, n] of report.stillBlockedBy) console.log(`    ${String(n).padStart(6)}  ${verb}`);
console.log('');
