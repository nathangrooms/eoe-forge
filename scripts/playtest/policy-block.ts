/**
 * DeckMatrix playtest harness — one policy per table, for turn length.
 *
 *   node --experimental-strip-types scripts/playtest/policy-block.ts 9100 30
 *
 * `run.ts --ab` mixes the two casting policies at ONE table. That answers which
 * is stronger and it cannot answer whether a policy makes GAMES longer, because
 * every game contains both. This puts a whole table on one policy at a time, so
 * a turn count is about the policy rather than about who is sitting next to
 * whom, and runs the same seeds twice.
 *
 * It is how the "does the bot hold mana it never spends" guard was checked when
 * the counterspell reserve landed: a bot that holds up mana and forgets to use
 * it shows here as games that run much longer, and a bot that deadlocks shows
 * as games that do not finish.
 *
 * Two arguments, both optional: the base seed and how many games. Prints two
 * lines and writes nothing.
 */
import { runGame } from './runner.ts';
import { loadPool } from './pool.ts';

const pool = await loadPool();
const base = Number(process.argv[2] ?? 9100);
const count = Number(process.argv[3] ?? 30);

for (const policy of ['permanents-only', 'all'] as const) {
  let turns = 0;
  let stalled = 0;
  const capped: number[] = [];
  for (let i = 0; i < count; i++) {
    const record = await runGame({
      seed: base + i,
      kind: 'commander',
      players: 4,
      pool,
      castingPolicyBySeat: [policy, policy, policy, policy],
    });
    turns += record.turns;
    if (!record.ended) {
      stalled++;
      capped.push(base + i);
    }
  }
  console.log(
    `${policy.padEnd(16)} ${count} games, ${turns} turns (${(turns / count).toFixed(1)} per game), ` +
      `${stalled} did not finish${capped.length ? ` (${capped.join(', ')})` : ''}`
  );
}
