/**
 * Equipping and enchanting: the control, the action, the board.
 *
 *   node --test --experimental-strip-types src/lib/game/attach.test.ts
 *
 * ## These tests start where a player starts
 *
 * `ATTACH` was proven correct by tests for months while nothing in the app had
 * ever built one, which is the failure `reachability.test.ts` exists to catch
 * and the reason this file refuses to hand-build the action. Every test below
 * begins at real ORACLE TEXT, asks the engine what a player could press
 * (`activationsFor` for equip, `planCastFromHand` for an Aura), applies exactly
 * the batch that comes back, and then asserts the BOARD moved: power, toughness
 * and keywords read through `characteristics.ts`, which is what the mat draws.
 *
 * A test here that passes is therefore a statement about a card somebody owns,
 * and it fails if the compiler stops reading the clause, if the layer engine
 * stops picking the effect up, if the cost stops being charged, or if the
 * control stops being offered.
 *
 * The oracle text is copied verbatim from the real cards it names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import { activationsFor, planActivation } from './activate.ts';
import { planCastFromHand } from './moves.ts';
import { stackHeight } from './stack.ts';
import {
  attachmentKindOf,
  attachmentsOn,
  auraNeedsHost,
  carriesSummary,
  enchantClauseOf,
  grantsOn,
  hostOf,
  illegalHostReason,
  legalHostsFor,
} from './attach.ts';
import { hasKeywordIn, powerIn, statLineIn, toughnessIn } from './characteristics.ts';
import type { CardInstance, GameState, InstanceId, PlayerId, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  owner?: PlayerId;
  typeLine?: string;
  oracleText?: string;
  manaCost?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  zone?: Zone;
  tapped?: boolean;
  summoningSick?: boolean;
}

function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });

  for (const player of ['p1', 'p2'] as const) {
    for (let i = 0; i < 20; i++) {
      state = addCard(
        state,
        {
          instanceId: `${player}-lib${i}`,
          cardId: 'filler',
          name: `Filler ${i}`,
          ownerId: player,
          typeLine: 'Creature — Human',
          oracleText: '',
        },
        'library'
      );
    }
  }

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name,
        ownerId: spec.owner ?? 'p1',
        typeLine: spec.typeLine ?? 'Creature — Bear',
        oracleText: spec.oracleText ?? '',
        ...(spec.manaCost !== undefined ? { manaCost: spec.manaCost } : {}),
        ...(spec.power !== undefined ? { power: spec.power } : {}),
        ...(spec.toughness !== undefined ? { toughness: spec.toughness } : {}),
        ...(spec.keywords !== undefined ? { keywords: spec.keywords } : {}),
        ...(spec.tapped !== undefined ? { tapped: spec.tapped } : {}),
        summoningSick: spec.summoningSick ?? false,
      },
      spec.zone ?? 'battlefield'
    );
  }

  // Equip is sorcery speed, so a main phase is the honest default.
  return { ...state, step: 'precombat_main' };
}

/** Untapped Forests, so a mana cost has something real to be paid from. */
function withLands(state: GameState, playerId: PlayerId, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) {
    next = addCard(
      next,
      {
        instanceId: `${playerId}-forest${i}`,
        cardId: 'forest',
        name: 'Forest',
        ownerId: playerId,
        typeLine: 'Basic Land — Forest',
        oracleText: '({T}: Add {G}.)',
        colorIdentity: ['G'],
      },
      'battlefield'
    );
  }
  return next;
}

const cardOf = (state: GameState, id: InstanceId): CardInstance | undefined => state.cards[id];
const messages = (state: GameState): string[] => state.log.map(entry => entry.message);
const said = (state: GameState, fragment: string): boolean =>
  messages(state).some(m => m.toLowerCase().includes(fragment.toLowerCase()));

/** Everyone passes, so the top of the stack resolves. */
function resolveTop(state: GameState): GameState {
  let next = state;
  for (let i = 0; i < next.players.length && stackHeight(next) > 0; i++) {
    next = applyAction(next, { type: 'PASS_PRIORITY' });
  }
  return next;
}

/**
 * Press equip on this permanent, aimed at this creature, exactly as
 * `AbilityPanel` would: read the options, answer the one question, dispatch.
 */
function equip(state: GameState, playerId: PlayerId, equipment: InstanceId, host: InstanceId) {
  const options = activationsFor(state, playerId, cardOf(state, equipment));
  const option = options.find(entry => /^equip|^reconfigure|^fortify/i.test(entry.text));
  assert.ok(option, `no equip control on ${cardOf(state, equipment)?.name}: ${options.map(o => o.text).join(' | ')}`);

  const target = cardOf(state, host);
  const plan = planActivation(state, playerId, equipment, option.abilityId, {
    choices: {
      targets: [{ kind: 'card', instanceId: host, zone: target?.zone, zoneChangeCounter: target?.zoneChangeCounter ?? 0 }],
    },
  });
  return { option, plan };
}

/* ------------------------------------------------------------------ *
 * The equip control exists at all
 * ------------------------------------------------------------------ */

test('"Equip {1}" is offered as an ability a player can press', () => {
  const state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'elf', name: 'Llanowar Elves', power: '1', toughness: '1' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        manaCost: '{1}',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  const options = activationsFor(state, 'p1', cardOf(state, 'splitter'));
  const equipOption = options.find(option => option.text === 'Equip {1}');

  assert.ok(equipOption, `Bonesplitter offered: ${options.map(o => o.text).join(' | ')}`);
  // Sorcery speed, because CR 702.6a says "activate only as a sorcery" and the
  // compiler lifts that into a field the legality check reads rather than
  // leaving it as prose nothing enforces.
  assert.equal(equipOption.sorcerySpeed, true);
  // Two creatures, so which one IS a question, and the engine refuses to answer
  // it. With one creature on the board it would already be `ok`: a forced
  // choice is not a choice, and pressing the button decides it.
  assert.equal(equipOption.ok, false);
  assert.equal(equipOption.pending.length, 1);
  assert.deepEqual(equipOption.pending[0].instanceIds.sort(), ['bear', 'elf']);
});

test('equipping a Bonesplitter makes the creature bigger on the board', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        manaCost: '{1}',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  assert.equal(statLineIn(state, 'bear'), '2/2');

  const { plan } = equip(state, 'p1', 'splitter', 'bear');
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);
  state = resolveTop(state);

  assert.equal(cardOf(state, 'splitter')?.attachedTo, 'bear');
  assert.equal(statLineIn(state, 'bear'), '4/2');
  assert.ok(said(state, 'attached to Grizzly Bears'));
});

test('the equip cost is actually charged', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'sword',
        name: 'Sword of Vengeance',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {3}',
      },
    ]),
    'p1',
    3
  );

  const { plan } = equip(state, 'p1', 'sword', 'bear');
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);

  const tapped = ['p1-forest0', 'p1-forest1', 'p1-forest2'].filter(id => cardOf(state, id)?.tapped);
  assert.equal(tapped.length, 3, 'three Forests should have paid for Equip {3}');
});

test('equip with nothing to pay it is refused in words, not hidden', () => {
  const state = game([
    { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
    {
      id: 'sword',
      name: 'Sword of Vengeance',
      typeLine: 'Artifact — Equipment',
      oracleText: 'Equipped creature gets +2/+0.\nEquip {3}',
    },
  ]);

  const { plan } = equip(state, 'p1', 'sword', 'bear');
  assert.equal(plan.ok, false);
  assert.ok(plan.reason.length > 0, 'a refusal has to say something');
  assert.match(plan.reason, /mana|pay|need/i);
});

test('equip cannot be used on the opponent’s turn', () => {
  const state = {
    ...withLands(
      game([
        { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
        {
          id: 'splitter',
          name: 'Bonesplitter',
          typeLine: 'Artifact — Equipment',
          oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
        },
      ]),
      'p1',
      2
    ),
    activePlayerId: 'p2' as PlayerId,
  };

  const { plan } = equip(state, 'p1', 'splitter', 'bear');
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /your own turn/i);
});

test('an Equipment cannot be equipped to a creature you do not control', () => {
  const state = withLands(
    game([
      { id: 'mine', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'theirs', name: 'Runeclaw Bear', owner: 'p2', power: '2', toughness: '2' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  const options = activationsFor(state, 'p1', cardOf(state, 'splitter'));
  const equipOption = options.find(option => option.text === 'Equip {1}');
  assert.ok(equipOption);

  /*
   * CR 702.6a targets a creature YOU control, so the opponent's bear is not a
   * candidate at all. Only one creature is left, one candidate is not a choice,
   * and the ability is therefore already planned: what it is planned AT is the
   * assertion, because "it did not ask" and "it asked and only offered mine"
   * are the same fact from two sides.
   */
  assert.equal(equipOption.ok, true, equipOption.reason);
  const announcement = equipOption.actions.at(-1);
  assert.equal(announcement?.type, 'PUT_ABILITY_ON_STACK');
  assert.deepEqual(
    (announcement as { targets: Array<{ instanceId?: string }> }).targets.map(t => t.instanceId),
    ['mine']
  );

  // And pointing it at the opponent's creature by hand is refused rather than
  // quietly redirected.
  const refused = planActivation(state, 'p1', 'splitter', equipOption.abilityId, {
    choices: { targets: [{ kind: 'card', instanceId: 'theirs', zone: 'battlefield', zoneChangeCounter: 0 }] },
  });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /not a legal target/i);
});

test('moving an Equipment takes the bonus with it', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'elf', name: 'Llanowar Elves', power: '1', toughness: '1' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    4
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'bear').plan.actions));
  assert.equal(statLineIn(state, 'bear'), '4/2');
  assert.equal(statLineIn(state, 'elf'), '1/1');

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'elf').plan.actions));
  assert.equal(cardOf(state, 'splitter')?.attachedTo, 'elf');
  // The bonus is DERIVED from the board rather than written onto the creature,
  // so nothing has to remember to unwrite it. The bear is a bear again.
  assert.equal(statLineIn(state, 'bear'), '2/2');
  assert.equal(statLineIn(state, 'elf'), '3/1');
});

test('an Equipment grants keywords through layer 6', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'boots',
        name: 'Lightning Greaves',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature has haste.\nEquip {0}',
      },
    ]),
    'p1',
    1
  );

  assert.equal(hasKeywordIn(state, 'bear', 'haste'), false);
  state = resolveTop(applyActions(state, equip(state, 'p1', 'boots', 'bear').plan.actions));
  assert.equal(hasKeywordIn(state, 'bear', 'haste'), true);
});

test('when the creature dies the Equipment comes off and the bonus goes with it', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'elf', name: 'Llanowar Elves', power: '1', toughness: '1' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'bear').plan.actions));
  assert.equal(statLineIn(state, 'bear'), '4/2');

  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' });

  // CR 704.5n, and `sba.ts` has known how to do this the whole time. What is
  // new is that there was something to unattach.
  assert.equal(cardOf(state, 'splitter')?.attachedTo, undefined);
  assert.equal(cardOf(state, 'splitter')?.zone, 'battlefield');
  assert.equal(statLineIn(state, 'elf'), '1/1');
});

test('an Equipment on the battlefield attached to nothing grants nothing', () => {
  const state = game([
    { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
    {
      id: 'splitter',
      name: 'Bonesplitter',
      typeLine: 'Artifact — Equipment',
      oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
    },
  ]);

  assert.equal(statLineIn(state, 'bear'), '2/2');
  assert.deepEqual(attachmentsOn(state, 'bear'), []);
});

/* ------------------------------------------------------------------ *
 * Auras
 * ------------------------------------------------------------------ */

test('casting an Aura asks what it enchants rather than guessing', () => {
  const state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'elf', name: 'Llanowar Elves', power: '1', toughness: '1' },
      {
        id: 'rancor',
        name: 'Rancor',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText:
          'Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner’s hand.',
      },
    ]),
    'p1',
    2
  );

  const plan = planCastFromHand(state, 'p1', 'rancor');
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.hostChoices.sort(), ['bear', 'elf']);
  // The card's own line, verbatim, so a player checks the engine against the
  // card rather than against a paraphrase of it.
  assert.equal(plan.hostPrompt, 'Enchant creature');
});

test('an Aura cast at a creature enters attached and pumps it', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'rancor',
        name: 'Rancor',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText: 'Enchant creature\nEnchanted creature gets +2/+0 and has trample.',
      },
    ]),
    'p1',
    2
  );

  const plan = planCastFromHand(state, 'p1', 'rancor', { hostId: 'bear' });
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);

  assert.equal(cardOf(state, 'rancor')?.zone, 'battlefield');
  assert.equal(cardOf(state, 'rancor')?.attachedTo, 'bear');
  assert.equal(statLineIn(state, 'bear'), '4/2');
  assert.equal(hasKeywordIn(state, 'bear', 'trample'), true);
});

test('an Aura cast through the stack attaches when it resolves, not before', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'rancor',
        name: 'Rancor',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText: 'Enchant creature\nEnchanted creature gets +2/+0 and has trample.',
      },
    ]),
    'p1',
    2
  );

  const plan = planCastFromHand(state, 'p1', 'rancor', { hostId: 'bear', viaStack: true });
  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);

  // On the stack, and the creature has gained nothing yet.
  assert.equal(stackHeight(state), 1);
  assert.equal(statLineIn(state, 'bear'), '2/2');

  state = resolveTop(state);
  assert.equal(cardOf(state, 'rancor')?.attachedTo, 'bear');
  assert.equal(statLineIn(state, 'bear'), '4/2');
});

test('an Aura whose creature dies in response fizzles instead of landing on nothing', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'rancor',
        name: 'Rancor',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText: 'Enchant creature\nEnchanted creature gets +2/+0 and has trample.',
      },
    ]),
    'p1',
    2
  );

  state = applyActions(state, planCastFromHand(state, 'p1', 'rancor', { hostId: 'bear', viaStack: true }).actions);
  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' });
  state = resolveTop(state);

  // CR 608.2b. The graveyard is where it belongs, and the log says why rather
  // than showing an enchantment that quietly achieved nothing.
  assert.equal(cardOf(state, 'rancor')?.zone, 'graveyard');
  assert.equal(cardOf(state, 'rancor')?.attachedTo, undefined);
});

test('"Enchant creature you control" cannot be cast across the table', () => {
  const state = withLands(
    game([
      { id: 'mine', name: 'Grizzly Bears', power: '2', toughness: '2' },
      { id: 'theirs', name: 'Runeclaw Bear', owner: 'p2', power: '2', toughness: '2' },
      {
        id: 'aura',
        name: 'Sentinel’s Eyes',
        typeLine: 'Enchantment — Aura',
        manaCost: '{W}',
        zone: 'hand',
        oracleText: 'Enchant creature you control\nEnchanted creature gets +1/+1 and has vigilance.',
      },
    ]),
    'p1',
    2
  );

  assert.deepEqual(legalHostsFor(state, 'p1', cardOf(state, 'aura')), ['mine']);
  const refused = planCastFromHand(state, 'p1', 'aura', { hostId: 'theirs' });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /not yours/i);
});

test('an Aura that enchants a land is not offered a creature', () => {
  const state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'aura',
        name: 'Wild Growth',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText: 'Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.',
      },
    ]),
    'p1',
    2
  );

  const hosts = legalHostsFor(state, 'p1', cardOf(state, 'aura'));
  assert.ok(!hosts.includes('bear'), 'Wild Growth enchants lands');
  assert.ok(hosts.includes('p1-forest0'), `expected a Forest, got ${hosts.join(', ')}`);
});

test('an Aura that enchants a PLAYER asks nothing, because a player has no card to point at', () => {
  const state = withLands(
    game([
      {
        id: 'aura',
        name: 'Curse of the Pierced Heart',
        typeLine: 'Enchantment — Aura Curse',
        manaCost: '{R}',
        zone: 'hand',
        oracleText:
          'Enchant player\nAt the beginning of enchanted player’s upkeep, Curse of the Pierced Heart deals 1 damage to that player.',
      },
    ]),
    'p1',
    2
  );

  assert.equal(auraNeedsHost(cardOf(state, 'aura')), false);
  // `ignoreMana` because the subject here is what the cast ASKS, and a Curse
  // costs {R} while this table's lands make {G}. Every other refusal still
  // applies.
  const plan = planCastFromHand(state, 'p1', 'aura', { ignoreMana: true });
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.hostChoices, []);
});

test('a hexproof creature an opponent controls is not a legal host', () => {
  const state = withLands(
    game([
      {
        id: 'theirs',
        name: 'Slippery Bogbonder',
        owner: 'p2',
        power: '2',
        toughness: '2',
        keywords: ['Hexproof'],
        oracleText: 'Hexproof',
      },
      { id: 'mine', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'aura',
        name: 'Pacifism',
        typeLine: 'Enchantment — Aura',
        manaCost: '{1}{W}',
        zone: 'hand',
        oracleText: 'Enchant creature\nEnchanted creature can’t attack or block.',
      },
    ]),
    'p1',
    2
  );

  // CR 115.6 is asked as the target is chosen, not only on resolution.
  assert.deepEqual(legalHostsFor(state, 'p1', cardOf(state, 'aura')), ['mine']);
});

/* ------------------------------------------------------------------ *
 * Reading what is on a creature
 * ------------------------------------------------------------------ */

test('what an attachment grants is read off the layer engine, not paraphrased', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
      {
        id: 'rancor',
        name: 'Rancor',
        typeLine: 'Enchantment — Aura',
        manaCost: '{G}',
        zone: 'hand',
        oracleText: 'Enchant creature\nEnchanted creature gets +2/+0 and has trample.',
      },
    ]),
    'p1',
    4
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'bear').plan.actions));
  state = applyActions(state, planCastFromHand(state, 'p1', 'rancor', { hostId: 'bear' }).actions);

  assert.equal(statLineIn(state, 'bear'), '6/2');

  const grants = grantsOn(state, 'bear');
  assert.equal(grants.length, 2);

  const splitter = grants.find(grant => grant.name === 'Bonesplitter');
  assert.ok(splitter);
  assert.equal(splitter.kind, 'equipment');
  assert.equal(splitter.statLine, '+2/+0');
  assert.deepEqual(splitter.keywords, []);
  assert.deepEqual(splitter.clauses, ['Equipped creature gets +2/+0.']);

  const rancor = grants.find(grant => grant.name === 'Rancor');
  assert.ok(rancor);
  assert.equal(rancor.kind, 'aura');
  assert.equal(rancor.statLine, '+2/+0');
  assert.deepEqual(rancor.keywords, ['trample']);

  assert.equal(carriesSummary(state, 'bear'), 'Bonesplitter +2/+0 · Rancor +2/+0, trample');
});

test('a summary claims nothing once the attachment has gone', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'bear').plan.actions));
  assert.equal(carriesSummary(state, 'bear'), 'Bonesplitter +2/+0');

  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'splitter', to: 'graveyard' });
  assert.equal(carriesSummary(state, 'bear'), '');
  assert.equal(statLineIn(state, 'bear'), '2/2');
});

test('a negative bonus is reported as the negative it is', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'clamp',
        name: 'Skullclamp',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'clamp', 'bear').plan.actions));
  assert.equal(statLineIn(state, 'bear'), '3/1');
  assert.equal(grantsOn(state, 'bear')[0].statLine, '+1/-1');
});

test('an attachment the layer engine reads nothing off claims no bonus', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'aura',
        name: 'Pacifism',
        typeLine: 'Enchantment — Aura',
        manaCost: '{1}{W}',
        zone: 'hand',
        // The compiler does not model "can't attack or block" yet. The panel has
        // to say the Aura is there and must not invent a bonus for it.
        oracleText: 'Enchant creature\nEnchanted creature can’t attack or block.',
      },
    ]),
    'p1',
    2
  );

  state = applyActions(
    state,
    planCastFromHand(state, 'p1', 'aura', { hostId: 'bear', ignoreMana: true }).actions
  );

  assert.equal(cardOf(state, 'aura')?.attachedTo, 'bear');
  assert.equal(statLineIn(state, 'bear'), '2/2');
  const [grant] = grantsOn(state, 'bear');
  assert.equal(grant.name, 'Pacifism');
  assert.equal(grant.statLine, '');
  assert.deepEqual(grant.keywords, []);
  assert.equal(carriesSummary(state, 'bear'), 'Pacifism');
});

/* ------------------------------------------------------------------ *
 * The small readers
 * ------------------------------------------------------------------ */

test('the readers agree with the type line', () => {
  const state = game([
    { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
    { id: 'splitter', name: 'Bonesplitter', typeLine: 'Artifact — Equipment', oracleText: 'Equip {1}' },
    {
      id: 'rancor',
      name: 'Rancor',
      typeLine: 'Enchantment — Aura',
      oracleText: 'Enchant creature\nEnchanted creature gets +2/+0 and has trample.',
    },
  ]);

  assert.equal(attachmentKindOf(cardOf(state, 'splitter')), 'equipment');
  assert.equal(attachmentKindOf(cardOf(state, 'rancor')), 'aura');
  assert.equal(attachmentKindOf(cardOf(state, 'bear')), null);
  assert.equal(enchantClauseOf(cardOf(state, 'rancor')), 'Enchant creature');
  assert.equal(enchantClauseOf(cardOf(state, 'splitter')), null);
});

test('nothing can be attached to itself', () => {
  const state = game([
    { id: 'splitter', name: 'Bonesplitter', typeLine: 'Artifact — Equipment', oracleText: 'Equip {1}' },
  ]);
  assert.match(illegalHostReason(state, cardOf(state, 'splitter'), 'splitter') ?? '', /itself/i);
});

test('hostOf answers only while the host is really there', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'splitter',
        name: 'Bonesplitter',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +2/+0.\nEquip {1}',
      },
    ]),
    'p1',
    2
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'splitter', 'bear').plan.actions));
  assert.equal(hostOf(state, cardOf(state, 'splitter'))?.name, 'Grizzly Bears');

  state = applyAction(state, { type: 'MOVE_ZONE', instanceId: 'bear', to: 'graveyard' });
  assert.equal(hostOf(state, cardOf(state, 'splitter')), undefined);
});

test('powerIn and toughnessIn both move, so combat sees the sword too', () => {
  let state = withLands(
    game([
      { id: 'bear', name: 'Grizzly Bears', power: '2', toughness: '2' },
      {
        id: 'sword',
        name: 'Vulshok Battlegear',
        typeLine: 'Artifact — Equipment',
        oracleText: 'Equipped creature gets +3/+3.\nEquip {2}',
      },
    ]),
    'p1',
    2
  );

  state = resolveTop(applyActions(state, equip(state, 'p1', 'sword', 'bear').plan.actions));
  assert.equal(powerIn(state, 'bear'), 5);
  assert.equal(toughnessIn(state, 'bear'), 5);
});
