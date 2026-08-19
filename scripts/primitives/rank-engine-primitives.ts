/**
 * Ranks ENGINE primitives — not XMage classes — by the number of real cards
 * each one blocks from being AUTOMATED.
 *
 *   node --experimental-strip-types scripts/primitives/rank-engine-primitives.ts
 *
 * ## Why this is a different question from PRIMITIVE-BUILD-ORDER.md
 *
 * That document ranks XMage engine classes by cards they would make
 * REPRESENTABLE. This one ranks paths through *our* `to-actions.ts` switch by
 * cards they would make AUTOMATED. The two are the two numbers CLAUDE.md says
 * must never be conflated, and they have different top-20s: a card can be
 * `coverage === 'full'` — every clause modelled, no manual marker — and still
 * not run, because `runEffect` reaches its `case` and pushes a string onto
 * `deferred` instead of an action onto `out`.
 *
 * ## The addressable set
 *
 * Only cards the compiler already calls `full`. A `partial` card has unmodelled
 * text or a `{do:'manual'}` marker; writing an engine primitive cannot automate
 * it, because the front end never produced the effect in the first place. So the
 * ceiling measured here is exactly the gap between REPRESENTABLE and AUTOMATED,
 * which is the gap this harness exists to close.
 *
 * ## Blocker classification
 *
 * Each effect node is read for whether `runEffect` can turn it into actions:
 *
 *   - MISSING — the engine could do this and does not. `pump` defers because
 *     game state carries no continuous-effect list; `add-mana` defers because
 *     `mana.ts` derives mana instead of pooling it. These are the buildable ones.
 *   - CHOICE  — the effect requires a decision no engine may make for a player
 *     (`may`, a modal spell, which card to discard). Deferring is CORRECT. These
 *     are never counted as unlockable, because "automating" them would mean
 *     guessing on the player's behalf.
 *   - WRONG   — the path emits actions but the actions do not match the rules.
 *     Counted separately, because these cards look automated today and are not.
 *
 * `sacrifice` and `discard` defer only when the player has a real choice, so they
 * are classified CHOICE-CONDITIONAL: they are not blockers on a board where the
 * pool is forced. Counting them as blockers would overstate what is buildable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compileCardAbilities } from '../../src/lib/cards/abilities/compiler.ts';
import { effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import type { Ability, CardAbilities, Effect } from '../../src/lib/cards/abilities/dsl.ts';
import type { AbilityCard } from '../../src/lib/cards/abilities/normalize.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(root, 'scripts', 'primitives', '.data');

type Verdict = 'ok' | 'missing' | 'choice' | 'choice-conditional' | 'wrong';

/**
 * One row per path through `runEffect`. Hand-derived by reading the switch, and
 * the reading is checked mechanically: `verify-blocker-table.ts` asserts that
 * every `Effect['do']` appears here exactly once, so a new effect verb cannot be
 * added without this table noticing.
 */
export const BLOCKERS: Record<string, { verdict: Verdict; why: string }> = {
  /* --- paths that already emit actions --- */
  'gain-life': { verdict: 'ok', why: 'LIFE_CHANGE' },
  'lose-life': { verdict: 'ok', why: 'LIFE_CHANGE' },
  'set-life': { verdict: 'ok', why: 'SET_LIFE' },
  poison: { verdict: 'ok', why: 'POISON' },
  draw: { verdict: 'ok', why: 'DRAW' },
  mill: { verdict: 'ok', why: 'MOVE_ZONE per card' },
  'move-zone': { verdict: 'ok', why: 'MOVE_ZONE' },
  destroy: { verdict: 'ok', why: 'MOVE_ZONE, indestructible respected' },
  exile: { verdict: 'ok', why: 'MOVE_ZONE' },
  shuffle: { verdict: 'ok', why: 'SHUFFLE' },
  'create-token': { verdict: 'ok', why: 'CREATE_TOKEN, derived ids' },
  tap: { verdict: 'ok', why: 'TAP' },
  untap: { verdict: 'ok', why: 'UNTAP' },
  'add-counters': { verdict: 'ok', why: 'CARD_COUNTER' },
  'remove-counters': { verdict: 'ok', why: 'CARD_COUNTER' },
  'player-counter': { verdict: 'ok', why: 'PLAYER_COUNTER' },
  'set-monarch': { verdict: 'ok', why: 'SET_MONARCH' },
  'lose-game': { verdict: 'ok', why: 'CONCEDE' },
  'win-game': { verdict: 'ok', why: 'CONCEDE others' },
  if: { verdict: 'ok', why: 'branches, recurses' },
  'for-each': { verdict: 'ok', why: 'binds and recurses' },
  repeat: { verdict: 'ok', why: 'bounded loop' },

  /* --- the buildable gap --- */
  pump: { verdict: 'missing', why: 'no continuous-effect list in GameState; defers unconditionally' },
  'gain-control': { verdict: 'missing', why: 'defers unconditionally; layer 1 is a continuous effect' },
  'add-mana': { verdict: 'missing', why: 'mana.ts derives from untapped permanents, no pool to add to' },
  'return-from': { verdict: 'missing', why: 'defers unconditionally even when the choice is forced' },
  'search-library': { verdict: 'missing', why: 'defers unconditionally even when the library is empty' },
  counter: { verdict: 'missing', why: 'needs the announced stack target; defers unconditionally' },

  /* --- correct deferrals: a decision belongs to the player --- */
  may: { verdict: 'choice', why: 'CR 601.2 the word "may" is the player\'s' },
  'choose-mode': { verdict: 'choice', why: 'modal choice; runs only when "choose all"' },
  manual: { verdict: 'choice', why: 'the honesty marker itself' },
  discard: { verdict: 'choice-conditional', why: 'forced when hand <= count, a choice otherwise' },
  sacrifice: { verdict: 'choice-conditional', why: 'forced when pool <= count, a choice otherwise' },

  /* --- emits actions, but not the ones the rules call for --- */
  damage: { verdict: 'wrong', why: 'computes lethality inline and emits MOVE_ZONE; CR 119.3 marks damage and CR 704.5g destroys it as a state-based action. Ignores deathtouch, defers when non-lethal, and never emits DAMAGE_CARD.' },
};

/** Every effect node in a tree, flattened. */
function walk(effects: readonly Effect[] | undefined, out: Effect[] = []): Effect[] {
  for (const e of effects ?? []) {
    out.push(e);
    if (e.do === 'if') { walk(e.then, out); walk(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') walk(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) walk(m.effects, out);
  }
  return out;
}

function allEffects(abilities: readonly Ability[]): Effect[] {
  const out: Effect[] = [];
  for (const a of abilities) walk(effectsOf(a), out);
  return out;
}

/**
 * `damage` is only WRONG when it targets a permanent; damage to a player is a
 * plain `DAMAGE` action and is right. The distinction has to be made per node,
 * not per verb.
 */
function keyOf(effect: Effect): string {
  if (effect.do === 'damage') {
    const to = effect.to as { sel?: string; who?: string };
    return to.who ? 'damage:player' : 'damage:permanent';
  }
  return effect.do;
}

function verdictOf(key: string): Verdict {
  if (key === 'damage:player') return 'ok';
  if (key === 'damage:permanent') return 'wrong';
  return BLOCKERS[key]?.verdict ?? 'missing';
}

/* -------------------------------------------------------------------------- */

const printings: AbilityCard[] = JSON.parse(readFileSync(join(dataDir, 'catalogue.json'), 'utf8'));

/** One row per oracle_id — printings would rank by print run, not playability. */
const byOracle = new Map<string, AbilityCard>();
for (const card of printings) {
  const id = card.oracle_id ?? card.name ?? '';
  if (!byOracle.has(id)) byOracle.set(id, card);
}

const compiled = new Map<string, CardAbilities>();
let compileErrors = 0;
for (const [id, card] of byOracle) {
  try { compiled.set(id, compileCardAbilities(card)); } catch { compileErrors++; }
}

/** The addressable set: representable-complete, so only the engine can be at fault. */
const full = [...compiled.entries()].filter(([, c]) => c.coverage === 'full');

/** oracle_id -> the set of non-`ok` keys standing between it and running. */
const blockersOf = new Map<string, Set<string>>();
for (const [id, c] of full) {
  const keys = new Set<string>();
  for (const e of allEffects(c.abilities)) {
    const k = keyOf(e);
    if (verdictOf(k) !== 'ok') keys.add(k);
  }
  blockersOf.set(id, keys);
}

const histogram = new Map<string, number>();
for (const keys of blockersOf.values()) for (const k of keys) histogram.set(k, (histogram.get(k) ?? 0) + 1);

/** Cards with nothing in the way at all — the honest AUTOMATED baseline. */
const alreadyClear = [...blockersOf.values()].filter((s) => s.size === 0).length;

/**
 * Greedy marginal ranking. A card needs its WHOLE blocker set at once
 * (PRIMITIVE-BUILD-ORDER.md §3), so `solo` and `marginal` differ and summing
 * either column is meaningless.
 */
const buildable = [...histogram.keys()].filter((k) => {
  const v = verdictOf(k);
  return v === 'missing' || v === 'wrong' || v === 'choice-conditional';
});

const soloOf = (key: string) =>
  [...blockersOf.values()].filter((s) => s.size === 1 && s.has(key)).length;

const done = new Set<string>();
const order: Array<{ rank: number; key: string; verdict: Verdict; touches: number; solo: number; marginal: number; cumulative: number }> = [];
let cumulative = alreadyClear;
for (let rank = 1; rank <= buildable.length; rank++) {
  let best: { key: string; gain: number } | null = null;
  for (const key of buildable) {
    if (done.has(key)) continue;
    const trial = new Set([...done, key]);
    let gain = 0;
    for (const keys of blockersOf.values()) {
      if (keys.size === 0) continue;
      const clearedNow = [...keys].every((k) => trial.has(k));
      const clearedBefore = [...keys].every((k) => done.has(k));
      if (clearedNow && !clearedBefore) gain++;
    }
    if (!best || gain > best.gain) best = { key, gain };
  }
  if (!best) break;
  done.add(best.key);
  cumulative += best.gain;
  order.push({
    rank,
    key: best.key,
    verdict: verdictOf(best.key),
    touches: histogram.get(best.key) ?? 0,
    solo: soloOf(best.key),
    marginal: best.gain,
    cumulative,
  });
}

const report = {
  measuredAt: new Date(0).toISOString().slice(0, 10) + ' (see git log; nothing here reads a clock)',
  printings: printings.length,
  distinctOracleIds: byOracle.size,
  compileErrors,
  representableFull: full.length,
  automatedBaselineNoBlockers: alreadyClear,
  histogram: [...histogram].sort((a, b) => b[1] - a[1]).map(([key, cards]) => ({ key, verdict: verdictOf(key), cards })),
  order,
};

writeFileSync(join(dataDir, 'engine-primitive-order.json'), JSON.stringify(report, null, 2));

console.log(`printings                     ${report.printings}`);
console.log(`distinct oracle_id            ${report.distinctOracleIds}`);
console.log(`compile errors                ${report.compileErrors}`);
console.log(`coverage === 'full'           ${report.representableFull}   <- REPRESENTABLE, the addressable set`);
console.log(`of those, zero blockers       ${report.automatedBaselineNoBlockers}   <- AUTOMATED baseline`);
console.log('');
console.log('blocker histogram (cards among the full set whose tree contains this path)');
for (const h of report.histogram) console.log(`  ${String(h.cards).padStart(6)}  ${h.verdict.padEnd(19)} ${h.key}`);
console.log('');
console.log('greedy marginal order over the buildable paths');
console.log('  rank  marginal  cumulative  solo  touches  verdict              key');
for (const o of order) {
  console.log(
    `  ${String(o.rank).padStart(4)}  ${String(o.marginal).padStart(8)}  ${String(o.cumulative).padStart(10)}  ${String(o.solo).padStart(4)}  ${String(o.touches).padStart(7)}  ${o.verdict.padEnd(19)} ${o.key}`
  );
}
