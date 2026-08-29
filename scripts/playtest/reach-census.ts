/**
 * DeckMatrix playtest harness — the REACHABILITY census.
 *
 * The question this answers is not "does the engine support it". It is the one
 * the owner keeps asking and the one this project keeps answering wrongly:
 *
 *     over real games, how many times did the game offer a player a legal
 *     decision that NO CONTROL ON SCREEN could have expressed?
 *
 * It counts three things, and each one is a number rather than an opinion:
 *
 *   1. RESPONSE WINDOWS THE SURFACE PASSES THROUGH.
 *      `turnFlow.decisionFor` stops the game for 'respond' only when
 *      `respond.hasResponse` is true, and `hasResponse` scans HAND ONLY. So a
 *      window where the seat's only answer is an activated ability on the
 *      battlefield returns null, and `/play`'s auto-advance presses
 *      PASS_PRIORITY 130 ms later. Counted here as `abilityOnlyWindows`.
 *
 *   2. BLOCK LANES WITH TWO OR MORE BLOCKERS.
 *      CR 509.2 gives the ATTACKING player the damage assignment order. The
 *      engine damages blockers in declaration order (`combat.ts` header says
 *      so) and no action exists to reorder them. Counted as `multiBlockLanes`.
 *
 *   3. CONCEDE. There is nothing to sample: `CONCEDE` is a real reducer case
 *      (`rules.ts`) and a real loss reason (`sba.ts`), and no file under
 *      `src/components/play/**` or `src/pages/Play.tsx` builds one. The census
 *      greps for it so the claim carries a count rather than a memory.
 *
 * Run:
 *   node --experimental-strip-types scripts/playtest/reach-census.ts --games 20 --seed 9000
 *
 * Prints JSON on stdout. Writes nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyAction } from '../../src/lib/game/rules.ts';
import { buildTable, mulliganActions } from '../../src/lib/game/setup.ts';
import { nextBotMove } from '../../src/lib/game/bot.ts';
import { hasPriority } from '../../src/lib/game/stack.ts';
import { hasResponse, responseOptions, spellToAnswer } from '../../src/lib/game/respond.ts';
import { activatablePermanents, isManaAbility } from '../../src/lib/game/activate.ts';
import { abilitiesFor } from '../../src/lib/game/abilities/card-abilities.ts';
import type { GameState, PlayerId } from '../../src/lib/game/types.ts';

import { loadPool } from './pool.ts';
import { buildDeck } from './deck.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const GAMES = Number(arg('games', '20'));
const SEED0 = Number(arg('seed', '9000'));
const PLAYERS = Number(arg('players', '4'));
const MAX_ACTIONS = Number(arg('max-actions', '9000'));

/**
 * Instant-speed, non-mana activated abilities this seat could use RIGHT NOW.
 *
 * `activatablePermanents` already refuses anything the timing rule forbids
 * (`activationTiming` is inside `planActivation`), so a sorcery-speed ability
 * never reaches this list while something is on the stack. Mana abilities are
 * dropped because paying for a spell is not "responding" and CR 605.3a keeps
 * them off the stack entirely.
 */
function instantSpeedAbilities(state: GameState, playerId: PlayerId): string[] {
  const out: string[] = [];
  for (const entry of activatablePermanents(state, playerId)) {
    const compiled = abilitiesFor(entry.card).abilities;
    for (const option of entry.options) {
      if (!option.ok) continue;
      if (option.isManaAbility) continue;
      const ability = compiled.find(a => a.id === option.abilityId);
      if (!ability || ability.kind !== 'activated') continue;
      if (ability.timing === 'sorcery') continue;
      out.push(`${entry.card.name} :: ${option.text.slice(0, 60)}`);
    }
  }
  return out;
}

interface Census {
  seeds: number[];
  games: number;
  finished: number;
  actionsApplied: number;
  /** Someone else's object on the stack and this seat holds priority. */
  responseWindows: number;
  /** ...and the hand held a legal answer. `decisionFor` returns 'respond'. */
  handAnswerWindows: number;
  /** ...and the hand held NOTHING but the battlefield did. Auto-passed. */
  abilityOnlyWindows: number;
  /**
   * Windows where `hasResponse` says STOP, which is the predicate
   * `turnFlow.decisionFor` actually calls. Before the fix this equalled
   * `handAnswerWindows` exactly, because `hasResponse` scanned the hand alone.
   * After it, it should equal hand + ability-only.
   */
  stoppedWindows: number;
  abilityOnlySamples: string[];
  /** Attack lanes blocked by two or more creatures. CR 509.2 ordering. */
  multiBlockLanes: number;
  multiBlockSamples: string[];
  /** Every lane that was blocked at all, as the denominator. */
  blockedLanes: number;
  /** Grep result, not a memory. */
  concedeProducersInPlayUi: number;
  concedeGrepPaths: string[];
}

function grepConcede(): { count: number; paths: string[] } {
  const roots = [
    path.join(ROOT, 'src', 'components', 'play'),
    path.join(ROOT, 'src', 'pages'),
    path.join(ROOT, 'src', 'components', 'lobby'),
  ];
  const paths: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\./.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (/['"]CONCEDE['"]/.test(text)) paths.push(path.relative(ROOT, full));
    }
  };
  roots.forEach(walk);
  return { count: paths.length, paths };
}

const pool = await loadPool();

const census: Census = {
  seeds: [], games: 0, finished: 0, actionsApplied: 0,
  responseWindows: 0, handAnswerWindows: 0, abilityOnlyWindows: 0, stoppedWindows: 0, abilityOnlySamples: [],
  multiBlockLanes: 0, multiBlockSamples: [], blockedLanes: 0,
  concedeProducersInPlayUi: 0, concedeGrepPaths: [],
};

const seenLanes = new Set<string>();

for (let g = 0; g < GAMES; g++) {
  const seed = SEED0 + g;
  census.seeds.push(seed);
  census.games += 1;

  const built = [];
  for (let i = 0; i < PLAYERS; i++) {
    built.push(await buildDeck({ seed, kind: 'commander', label: `deck:commander:seat${i}`, pool }));
  }
  const table = buildTable({
    id: `reach-${seed}`,
    seats: built.map((entry, index) => ({
      deck: entry.deck,
      playerName: `Bot ${index + 1}`,
      isBot: true,
    })),
    format: built[0].deck.format,
    seed,
    now: 0,
  });
  let state = table.state;

  // Same opening the runner uses, so the sample is a real game's boards.
  for (const player of state.players) {
    const batch = mulliganActions(state, player.id, 0);
    for (const action of batch) state = applyAction(state, action);
  }

  let n = 0;
  while (state.status === 'playing' && n < MAX_ACTIONS) {
    /* THE SEAT ROTATION IS COPIED FROM `runner.ts:seatOrder`, DELIBERATELY.
       My first pass asked only `priorityPlayerId ?? activePlayerId`, and
       priority sits with the ATTACKER during declare blockers, so the defender
       was never asked for a block. It reported 0 blocked lanes over six games
       and that number was my driver, not the game. */
    let move = null;
    const living = state.players.filter(p => !p.hasLost && !p.conceded).map(p => p.id);
    const order = state.step === 'declare_blockers'
      ? [...living.filter(id => id !== state.activePlayerId), ...living.filter(id => id === state.activePlayerId)]
      : [state.activePlayerId, ...living.filter(id => id !== state.activePlayerId)];
    for (const candidate of order) {
      const proposed = nextBotMove(state, candidate, { at: n, useStack: true });
      if (proposed && proposed.actions.length > 0) { move = proposed; break; }
    }
    if (!move) break;
    for (const action of move.actions) {
      const next = applyAction(state, action);
      if (next === state) continue;
      state = next;
      n += 1;
      census.actionsApplied += 1;

      /* --- 1. response windows, from every seat's side --- */
      for (const player of state.players) {
        if (player.hasLost || player.conceded) continue;
        if (!hasPriority(state, player.id)) continue;
        if (!spellToAnswer(state, player.id)) continue;
        census.responseWindows += 1;
        if (hasResponse(state, player.id)) census.stoppedWindows += 1;
        const inHand = responseOptions(state, player.id).length > 0;
        if (inHand) { census.handAnswerWindows += 1; continue; }
        const abilities = instantSpeedAbilities(state, player.id);
        if (abilities.length > 0) {
          census.abilityOnlyWindows += 1;
          if (census.abilityOnlySamples.length < 12) {
            census.abilityOnlySamples.push(`seed ${seed} T${state.turn} ${state.step} — ${abilities[0]}`);
          }
        }
      }

      /* --- 2. blocker ordering --- */
      for (const lane of state.combat.attackers) {
        if (lane.blockedBy.length === 0) continue;
        const key = `${seed}:${state.turn}:${lane.attackerId}:${lane.blockedBy.join(',')}`;
        if (seenLanes.has(key)) continue;
        seenLanes.add(key);
        census.blockedLanes += 1;
        if (lane.blockedBy.length >= 2) {
          census.multiBlockLanes += 1;
          if (census.multiBlockSamples.length < 12) {
            const attacker = state.cards[lane.attackerId]?.name ?? '?';
            const blockers = lane.blockedBy.map(id => state.cards[id]?.name ?? '?').join(' + ');
            census.multiBlockSamples.push(`seed ${seed} T${state.turn} ${attacker} blocked by ${blockers}`);
          }
        }
      }
    }
  }
  if (state.status === 'complete') census.finished += 1;
}

const concede = grepConcede();
census.concedeProducersInPlayUi = concede.count;
census.concedeGrepPaths = concede.paths;

console.log(JSON.stringify(census, null, 2));
