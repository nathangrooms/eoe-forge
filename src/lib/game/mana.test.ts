/**
 * What the engine believes it can pay for.
 *
 *   node --test --experimental-strip-types src/lib/game/mana.test.ts
 *
 * The owner's report was "just played against an enemy and they placed a 5 mana
 * card on first turn doesnt make any sense". The bot is not cheating: it calls
 * `planCastFromHand` without `ignoreMana`, so the engine genuinely *believed*
 * the cost was paid. Two separate miscounts were found by driving a real game
 * and printing what the bot thought it had, and both are pinned here.
 *
 *   1. A cost that parses to nothing is charged as nothing. Scryfall stores no
 *      top-level `mana_cost` for a double-faced card — the cost hangs off the
 *      face — so `parseCost(undefined).total === 0` and a five-drop was free.
 *      Our own `cards` table has 802 such rows (CLAUDE.md records the same 802
 *      for the sibling `oracle_text` case, which is the same population).
 *
 *   2. Every non-summoning-sick creature with a colour identity was counted as
 *      a mana dork. Measured in a real game: on turn 10 with five Forests the
 *      bot reported "9 untapped before" — five lands plus four Grizzly Bears.
 *      That is what actually lets a bot deploy off-curve, every turn, forever.
 *
 * And the inverse, which is the same miscount pointing the other way: every
 * colourless rock in Magic — Sol Ring, Arcane Signet, Mind Stone — has an empty
 * colour identity, so the old rule threw all of them away and the bot refused
 * casts it could afford.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from './rules.ts';
import { castingCostOf, manaSourcesFor, parseCost, planPayment } from './mana.ts';
import { planCastFromHand } from './moves.ts';
import type { CardInstance, GameState, PlayerId, Zone } from './types.ts';

const ME: PlayerId = 'p1';

function table(): GameState {
  return createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Bot' },
    ],
  });
}

function put(
  state: GameState,
  zone: Zone,
  card: Partial<CardInstance> & { instanceId: string; name: string }
): GameState {
  return addCard(
    state,
    {
      cardId: card.instanceId,
      ownerId: ME,
      controllerId: ME,
      typeLine: 'Creature — Bear',
      counters: {},
      tapped: false,
      summoningSick: false,
      ...card,
    },
    zone
  );
}

function forest(state: GameState, id: string): GameState {
  return put(state, 'battlefield', {
    instanceId: id,
    name: 'Forest',
    typeLine: 'Basic Land — Forest',
    manaCost: '',
    cmc: 0,
    colorIdentity: ['G'],
    oracleText: '({T}: Add {G}.)',
  });
}

/* -------------------------------------------------------------------------- */
/* 1. A cost we could not read is not a free cost                             */
/* -------------------------------------------------------------------------- */

test('a card with no printed cost string is charged its mana value', () => {
  // Exactly the shape a modal double-faced card arrives in: cmc present,
  // mana_cost absent because Scryfall hangs it off the face.
  const dfc: CardInstance = {
    instanceId: 'x',
    name: 'Two-faced five-drop',
    cmc: 5,
    typeLine: 'Creature — Horror',
  } as CardInstance;

  assert.equal(parseCost(dfc.manaCost).total, 0, 'the raw parse still reads nothing');
  assert.equal(castingCostOf(dfc), '{5}', 'but the engine charges the mana value instead');
});

test('a genuinely free spell stays free', () => {
  const zero: CardInstance = {
    instanceId: 'z',
    name: 'Ancestral Vision',
    manaCost: '',
    cmc: 0,
    typeLine: 'Sorcery',
  } as CardInstance;
  assert.equal(castingCostOf(zero), '');
  assert.equal(planPayment(castingCostOf(zero), []).ok, true);
});

test('a five-drop with no cost string cannot be cast off one land', () => {
  let state = table();
  state = forest(state, 'land1');
  state = put(state, 'hand', {
    instanceId: 'bomb',
    name: 'Two-faced five-drop',
    cmc: 5,
    typeLine: 'Creature — Horror',
    colorIdentity: ['G'],
    // No manaCost, which is the whole point.
  });

  const plan = planCastFromHand(state, ME, 'bomb');
  assert.equal(plan.ok, false, 'turn one, one land, five mana value: this must be refused');
  assert.match(plan.reason, /5 mana/);
});

/* -------------------------------------------------------------------------- */
/* 2. A creature is not a mana source because it happens to be green          */
/* -------------------------------------------------------------------------- */

test('a vanilla creature is not counted as a mana source', () => {
  let state = table();
  state = forest(state, 'land1');
  state = put(state, 'battlefield', {
    instanceId: 'bear',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    manaCost: '{1}{G}',
    cmc: 2,
    power: '2',
    toughness: '2',
    colorIdentity: ['G'],
    oracleText: '',
  });

  const sources = manaSourcesFor(state, ME);
  assert.deepEqual(
    sources.map(s => s.name),
    ['Forest'],
    'the bear taps for nothing and must not be counted'
  );
});

test('a real mana dork is counted, and for the colour its text names', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'dork',
    name: 'Llanowar Elves',
    typeLine: 'Creature — Elf Druid',
    manaCost: '{G}',
    cmc: 1,
    power: '1',
    toughness: '1',
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}.',
  });

  const sources = manaSourcesFor(state, ME);
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].produces, ['G']);
});

test('a summoning sick mana dork still cannot tap', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'dork',
    name: 'Llanowar Elves',
    typeLine: 'Creature — Elf Druid',
    colorIdentity: ['G'],
    oracleText: '{T}: Add {G}.',
    summoningSick: true,
  });
  assert.equal(manaSourcesFor(state, ME).length, 0);
});

/* -------------------------------------------------------------------------- */
/* 3. The inverse: refusing a cast it could afford                            */
/* -------------------------------------------------------------------------- */

test('a colourless rock produces mana even though its colour identity is empty', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'ring',
    name: 'Sol Ring',
    typeLine: 'Artifact',
    manaCost: '{1}',
    cmc: 1,
    colorIdentity: [],
    oracleText: '{T}: Add {C}{C}.',
  });

  const sources = manaSourcesFor(state, ME);
  assert.equal(sources.length, 1, 'Sol Ring is the most played card in the format');
  assert.deepEqual(sources[0].produces, [], 'and it produces no colour, which is different');
});

test('a signet pays a coloured pip', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'signet',
    name: 'Golgari Signet',
    typeLine: 'Artifact',
    colorIdentity: ['B', 'G'],
    oracleText: '{1}, {T}: Add {B}{G}.',
  });
  state = forest(state, 'land1');

  assert.equal(planPayment('{1}{G}', manaSourcesFor(state, ME)).ok, true);
});

test('a rock that makes any colour can pay any pip', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'orb',
    name: 'Chromatic Lantern',
    typeLine: 'Artifact',
    colorIdentity: [],
    oracleText: 'Lands you control have "{T}: Add one mana of any color." {T}: Add one mana of any color.',
  });

  const sources = manaSourcesFor(state, ME);
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0].produces.slice().sort(), ['B', 'G', 'R', 'U', 'W']);
});

test('an artifact with no mana text is not a mana source', () => {
  let state = table();
  state = put(state, 'battlefield', {
    instanceId: 'vial',
    name: 'Aether Vial',
    typeLine: 'Artifact',
    manaCost: '{1}',
    cmc: 1,
    colorIdentity: [],
    oracleText:
      'At the beginning of your upkeep, you may put a charge counter on Aether Vial.',
  });
  assert.equal(manaSourcesFor(state, ME).length, 0);
});

/* -------------------------------------------------------------------------- */
/* 4. The whole point: the bot cannot deploy off curve                        */
/* -------------------------------------------------------------------------- */

test('four bears and two lands do not cast a five-drop', () => {
  let state = table();
  state = forest(state, 'land1');
  state = forest(state, 'land2');
  for (let i = 0; i < 4; i++) {
    state = put(state, 'battlefield', {
      instanceId: `bear${i}`,
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      colorIdentity: ['G'],
      oracleText: '',
    });
  }
  state = put(state, 'hand', {
    instanceId: 'dino',
    name: 'Alpha Tyrranax',
    typeLine: 'Creature — Dinosaur',
    manaCost: '{4}{G}',
    cmc: 5,
    colorIdentity: ['G'],
    oracleText: '',
  });

  assert.equal(manaSourcesFor(state, ME).length, 2, 'two Forests, and nothing else taps');
  assert.equal(planCastFromHand(state, ME, 'dino').ok, false);
});
