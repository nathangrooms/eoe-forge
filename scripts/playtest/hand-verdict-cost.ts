/**
 * WHAT THE FAN'S NEW VERDICT COSTS, PER RENDER.
 *
 * `ViewerHand` asks `handPlayVerdict` once per card in hand, on every render.
 * That now includes `planSpellTargets` for any spell that names a target, which
 * walks every permanent on the table. This measures the whole fan on a board
 * the size of a real four-player game, against what the old cost-only check
 * took, so "it is a bit more work" can be a number instead of a worry.
 */
import { loadPool } from './pool.ts';
import {
  addCard, createGame, isLand, planCastFromHand, planLandDrop,
  type GameState,
} from '../../src/lib/game/index.ts';
import { handPlayVerdict } from '../../src/components/play/cardActions.ts';

const pool = await loadPool();
const cards = pool.cards;

let state: GameState = createGame({
  id: 'cost', mode: 'full', format: 'commander',
  players: [
    { id: 'p1', name: 'You' }, { id: 'p2', name: 'A' },
    { id: 'p3', name: 'B' }, { id: 'p4', name: 'C' },
  ],
  seed: 3, now: 0,
});
state = { ...state, step: 'precombat_main', activePlayerId: 'p1', priorityPlayerId: 'p1' };

/* Sixty permanents across four seats, and twelve lands of mine, which is a
   board well past where a real commander game usually sits. */
const creatures = cards.filter((c: any) => /Creature/.test(c.typeLine ?? '') && c.manaCost).slice(0, 60);
let n = 0;
for (const seat of ['p1', 'p2', 'p3', 'p4'] as const) {
  for (let i = 0; i < 15; i++) {
    const c: any = creatures[n++ % creatures.length];
    state = addCard(state, {
      instanceId: `bf-${seat}-${i}`, cardId: `bf-${seat}-${i}`, ownerId: seat,
      name: c.name, typeLine: c.typeLine, manaCost: c.manaCost, power: c.power,
      toughness: c.toughness, oracleText: c.oracleText ?? '',
    }, 'battlefield');
  }
}
for (let i = 0; i < 12; i++) {
  state = addCard(state, {
    instanceId: `land-${i}`, cardId: `land-${i}`, ownerId: 'p1', name: 'Command Tower',
    typeLine: 'Land', colorIdentity: ['W', 'U', 'B', 'R', 'G'],
    oracleText: '{T}: Add one mana of any color.',
  }, 'battlefield');
}

/* Ten in hand, half of them spells that name a target, which is the expensive
   half and deliberately over-represented. */
const targeted = cards.filter((c: any) => /target/i.test(c.oracleText ?? '') && !/Land/.test(c.typeLine ?? ''));
const plain = cards.filter((c: any) => !/target/i.test(c.oracleText ?? '') && !/Land/.test(c.typeLine ?? ''));
const hand = [...targeted.slice(0, 5), ...plain.slice(0, 5)];
hand.forEach((c: any, i) => {
  state = addCard(state, {
    instanceId: `hand-${i}`, cardId: `hand-${i}`, ownerId: 'p1', name: c.name,
    typeLine: c.typeLine, manaCost: c.manaCost, cmc: c.cmc, power: c.power,
    toughness: c.toughness, oracleText: c.oracleText ?? '',
  }, 'hand');
});

const ids = Array.from({ length: 10 }, (_, i) => `hand-${i}`);
const oldWay = () => ids.forEach(id => {
  const card = state.cards[id];
  isLand(card) ? planLandDrop(state, 'p1', id) : planCastFromHand(state, 'p1', id);
});
const newWay = () => ids.forEach(id => handPlayVerdict(state, 'p1', state.cards[id]));

for (let i = 0; i < 20; i++) { oldWay(); newWay(); }   // warm

const time = (fn: () => void, runs: number) => {
  const t = process.hrtime.bigint();
  for (let i = 0; i < runs; i++) fn();
  return Number(process.hrtime.bigint() - t) / 1e6 / runs;
};

console.log(`board: ${Object.values(state.cards).filter(c => c.zone === 'battlefield').length} permanents, hand of ${ids.length}`);
console.log(`one whole fan, cost check only   ${time(oldWay, 300).toFixed(2)} ms`);
console.log(`one whole fan, handPlayVerdict   ${time(newWay, 300).toFixed(2)} ms`);
