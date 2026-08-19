/**
 * What a card offers while combat is being declared — the rules with no pixels.
 *
 *   node --test --experimental-strip-types src/components/play/combatUi.test.ts
 *
 * Owner: *"this game engine does not support attacking very well, its an
 * absolute mess and moves onto different screens, attack button should be a
 * sword icon or something too"*, and *"doesnt seem like enemy on play mode is
 * attacking, no way to attack with it and block stages"*.
 *
 * The answer was to put combat on the playmat: a sword chip on your creature
 * declares the attack, a shield on your creature followed by the attacker in
 * front of it declares the block. `combatUi.ts` is the part of that decision
 * with no DOM in it, and this file is what makes the claim at the top of that
 * module true — it was documented as tested before it was.
 *
 * Two properties matter more than the rest:
 *
 *   1. **a chip is never offered for an illegal play.** Every "can this" answer
 *      comes from `combat.ts`, so a card that the engine excludes must come
 *      back with no chip — and with a reason, because a greyed-out card that
 *      will not say why is the complaint that started this work.
 *   2. **the sentence is grammatical.** The bug this replaced shipped the
 *      literal string "You attacks a player": subject and verb were chosen by
 *      different code and the object was a placeholder nobody looked up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, createGame } from '../../lib/game/rules.ts';
import type { CardInstance, GameState, InstanceId, PlayerId } from '../../lib/game/types.ts';
import {
  cardCombatFor,
  combatSentence,
  combatStageFor,
  declaredAttackerIds,
} from './combatUi.ts';

/* ------------------------------------------------------------------ *
 * A table, built the same way `combat.test.ts` builds one
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  owner: PlayerId;
  name?: string;
  power?: string;
  toughness?: string;
  keywords?: string[];
  tapped?: boolean;
  summoningSick?: boolean;
  typeLine?: string;
}

function table(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    startingLife: 40,
    players: [
      { id: 'p1', name: 'You' },
      { id: 'p2', name: 'Yeva' },
      { id: 'p3', name: 'Surrak' },
    ],
  });

  for (const spec of specs) {
    state = addCard(
      state,
      {
        instanceId: spec.id,
        cardId: spec.id,
        name: spec.name ?? spec.id,
        ownerId: spec.owner,
        controllerId: spec.owner,
        typeLine: spec.typeLine ?? 'Creature — Test',
        power: spec.power ?? '2',
        toughness: spec.toughness ?? '2',
        keywords: spec.keywords ?? [],
        oracleText: '',
        counters: {},
        tapped: spec.tapped ?? false,
        summoningSick: spec.summoningSick ?? false,
      },
      'battlefield'
    );
  }

  return { ...state, status: 'playing' };
}

/** Put the game in a step, with an optional declared attack. */
function at(
  state: GameState,
  step: GameState['step'],
  activePlayerId: PlayerId,
  attacks: Array<{ attacker: InstanceId; defender: PlayerId; blockedBy?: InstanceId[] }> = []
): GameState {
  return {
    ...state,
    step,
    activePlayerId,
    combat: {
      attackers: attacks.map(a => ({
        attackerId: a.attacker,
        defenderPlayerId: a.defender,
        blockedBy: a.blockedBy ?? [],
      })),
    },
  };
}

const card = (state: GameState, id: string): CardInstance => state.cards[id];

/* ------------------------------------------------------------------ *
 * Which decision is owed
 * ------------------------------------------------------------------ */

test('the attack step belongs to the active player and to nobody else', () => {
  const state = table([{ id: 'bears', owner: 'p1' }]);
  const declaring = at(state, 'declare_attackers', 'p1');

  assert.equal(combatStageFor(declaring, 'p1'), 'attackers');
  assert.equal(combatStageFor(declaring, 'p2'), null);
});

test('the block step belongs to the seat being attacked, not to every seat', () => {
  const state = table([
    { id: 'bears', owner: 'p2' },
    { id: 'wall', owner: 'p1' },
    { id: 'bystander', owner: 'p3' },
  ]);
  const blocking = at(state, 'declare_blockers', 'p2', [
    { attacker: 'bears', defender: 'p1' },
  ]);

  assert.equal(combatStageFor(blocking, 'p1'), 'blockers', 'the defender owes a decision');
  assert.equal(combatStageFor(blocking, 'p3'), null, 'a third seat is not being attacked');
  assert.equal(combatStageFor(blocking, 'p2'), null, 'the attacker does not block itself');
});

test('a game that has not started offers nothing', () => {
  const state = { ...table([{ id: 'bears', owner: 'p1' }]), status: 'setup' as const };
  assert.equal(combatStageFor(at(state, 'declare_attackers', 'p1'), 'p1'), null);
});

/* ------------------------------------------------------------------ *
 * The sword
 * ------------------------------------------------------------------ */

test('an untapped, ready creature carries a live sword', () => {
  const state = at(table([{ id: 'bears', owner: 'p1' }]), 'declare_attackers', 'p1');
  const info = cardCombatFor(state, 'p1', card(state, 'bears'), 'attackers');

  assert.equal(info.chip, 'attack');
  assert.equal(info.enabled, true);
  assert.equal(info.dimmed, false);
  assert.match(info.label, /Attack with bears/);
  assert.match(info.label, /2\/2/, 'the sword says what it swings for');
});

test('a summoning-sick creature is dimmed and says exactly why', () => {
  const state = at(
    table([{ id: 'fresh', owner: 'p1', summoningSick: true }]),
    'declare_attackers',
    'p1'
  );
  const info = cardCombatFor(state, 'p1', card(state, 'fresh'), 'attackers');

  assert.equal(info.chip, null, 'no sword on a creature that cannot swing');
  assert.equal(info.dimmed, true);
  assert.match(info.label, /came down this turn/);
  assert.match(info.label, /haste/, 'the reason names the keyword that would fix it');
});

test('haste beats summoning sickness, and the sword comes back', () => {
  const state = at(
    table([{ id: 'fresh', owner: 'p1', summoningSick: true, keywords: ['haste'] }]),
    'declare_attackers',
    'p1'
  );
  assert.equal(cardCombatFor(state, 'p1', card(state, 'fresh'), 'attackers').chip, 'attack');
});

test('a tapped creature is dimmed, and so is one with defender', () => {
  const state = at(
    table([
      { id: 'tapped', owner: 'p1', tapped: true },
      { id: 'wall', owner: 'p1', keywords: ['defender'] },
    ]),
    'declare_attackers',
    'p1'
  );

  const tapped = cardCombatFor(state, 'p1', card(state, 'tapped'), 'attackers');
  assert.equal(tapped.dimmed, true);
  assert.match(tapped.label, /is tapped/);

  const wall = cardCombatFor(state, 'p1', card(state, 'wall'), 'attackers');
  assert.equal(wall.dimmed, true);
  assert.match(wall.label, /defender/);
});

test('a declared attacker offers to be called back rather than declared twice', () => {
  const state = at(table([{ id: 'bears', owner: 'p1' }]), 'declare_attackers', 'p1', [
    { attacker: 'bears', defender: 'p2' },
  ]);
  const info = cardCombatFor(state, 'p1', card(state, 'bears'), 'attackers');

  assert.equal(info.chip, 'attacking');
  assert.equal(info.enabled, true);
  assert.match(info.label, /call it back/);
  assert.deepEqual(declaredAttackerIds(state, 'p1'), ['bears']);
  assert.deepEqual(declaredAttackerIds(state, 'p2'), [], "somebody else's swing is not yours");
});

test("an opponent's creature carries nothing during your attack step", () => {
  const state = at(
    table([{ id: 'bears', owner: 'p1' }, { id: 'theirs', owner: 'p2' }]),
    'declare_attackers',
    'p1'
  );
  const info = cardCombatFor(state, 'p1', card(state, 'theirs'), 'attackers');
  assert.equal(info.chip, null);
  assert.equal(info.dimmed, false, 'not ours to grey out');
});

test('a land is not a combatant and is left completely alone', () => {
  const state = at(
    table([{ id: 'forest', owner: 'p1', typeLine: 'Basic Land — Forest' }]),
    'declare_attackers',
    'p1'
  );
  const info = cardCombatFor(state, 'p1', card(state, 'forest'), 'attackers');
  assert.equal(info.chip, null);
  assert.equal(info.dimmed, false);
});

test('outside combat the board is exactly the board it was', () => {
  const state = at(table([{ id: 'bears', owner: 'p1' }]), 'precombat_main', 'p1');
  const info = cardCombatFor(state, 'p1', card(state, 'bears'), null);
  assert.deepEqual(info, { chip: null, enabled: false, label: '', dimmed: false });
});

/* ------------------------------------------------------------------ *
 * The shield — a block is two presses because it is a pairing
 * ------------------------------------------------------------------ */

function blockingTable() {
  const state = table([
    { id: 'flier', owner: 'p2', name: 'Air Elemental', keywords: ['flying'], power: '4' },
    { id: 'ground', owner: 'p2', name: 'Baloth', power: '4', toughness: '4' },
    { id: 'bears', owner: 'p1', name: 'Bears' },
  ]);
  return at(state, 'declare_blockers', 'p2', [
    { attacker: 'flier', defender: 'p1' },
    { attacker: 'ground', defender: 'p1' },
  ]);
}

test('your untapped creature offers a shield, and arming it changes the chip', () => {
  const state = blockingTable();

  const idle = cardCombatFor(state, 'p1', card(state, 'bears'), 'blockers');
  assert.equal(idle.chip, 'block');
  assert.equal(idle.enabled, true);
  assert.match(idle.label, /Block with Bears/);

  const armed = cardCombatFor(state, 'p1', card(state, 'bears'), 'blockers', {
    armedBlockerId: 'bears',
  });
  assert.equal(armed.chip, 'armed');
  assert.match(armed.label, /now press the attacker/i, 'the gesture explains its second half');
});

test('an attacker carries an inert chip before a blocker is armed, and says so', () => {
  const state = blockingTable();
  const info = cardCombatFor(state, 'p1', card(state, 'ground'), 'blockers');

  assert.equal(info.chip, 'target', 'the chip exists so the gesture is discoverable');
  assert.equal(info.enabled, false);
  assert.match(info.label, /pick one of your creatures first/i);
});

test('with a blocker armed, a legal pairing goes live and an illegal one does not', () => {
  const state = blockingTable();
  const options = { armedBlockerId: 'bears' };

  const legal = cardCombatFor(state, 'p1', card(state, 'ground'), 'blockers', options);
  assert.equal(legal.enabled, true);
  assert.match(legal.label, /Block Baloth \(4\/4\) with Bears/);

  /* Evasion is the engine's answer, not a rule restated here: `canBlock` says
     a ground creature cannot block a flier, so the chip stays inert and names
     the pair rather than silently doing nothing. */
  const illegal = cardCombatFor(state, 'p1', card(state, 'flier'), 'blockers', options);
  assert.equal(illegal.enabled, false);
  assert.match(illegal.label, /Bears cannot block Air Elemental/);
});

test('a creature already in front of something offers to be taken back', () => {
  const state = at(
    table([
      { id: 'ground', owner: 'p2', name: 'Baloth', power: '4', toughness: '4' },
      { id: 'bears', owner: 'p1', name: 'Bears' },
    ]),
    'declare_blockers',
    'p2',
    [{ attacker: 'ground', defender: 'p1', blockedBy: ['bears'] }]
  );

  const info = cardCombatFor(state, 'p1', card(state, 'bears'), 'blockers');
  assert.equal(info.chip, 'blocking');
  assert.equal(info.enabled, true);
  assert.match(info.label, /is blocking Baloth/);
});

test('a tapped creature cannot block and is dimmed with the reason', () => {
  const state = at(
    table([
      { id: 'ground', owner: 'p2', power: '4', toughness: '4' },
      { id: 'bears', owner: 'p1', name: 'Bears', tapped: true },
    ]),
    'declare_blockers',
    'p2',
    [{ attacker: 'ground', defender: 'p1' }]
  );

  const info = cardCombatFor(state, 'p1', card(state, 'bears'), 'blockers');
  assert.equal(info.chip, null);
  assert.equal(info.dimmed, true);
  assert.match(info.label, /tapped and cannot block/);
});

test('an attack aimed at a third player is not yours to answer', () => {
  const state = at(
    table([
      { id: 'ground', owner: 'p2', power: '4', toughness: '4' },
      { id: 'bears', owner: 'p1' },
    ]),
    'declare_blockers',
    'p2',
    [{ attacker: 'ground', defender: 'p3' }]
  );

  const info = cardCombatFor(state, 'p1', card(state, 'ground'), 'blockers');
  assert.equal(info.chip, null, 'no chip on an attacker pointed somewhere else');
});

/* ------------------------------------------------------------------ *
 * The sentence — the "You attacks a player" bug, pinned
 * ------------------------------------------------------------------ */

test('the viewer attacking reads "You attack Yeva with 1 creature"', () => {
  const state = at(table([{ id: 'bears', owner: 'p1' }]), 'declare_attackers', 'p1', [
    { attacker: 'bears', defender: 'p2' },
  ]);

  const sentence = combatSentence(state, 'p1');
  assert.equal(sentence, 'You attack Yeva with 1 creature');
  assert.doesNotMatch(sentence, /You attacks/, 'the shipped bug: subject and verb disagreed');
  assert.doesNotMatch(sentence, /a player/, 'the shipped bug: the object was a placeholder');
});

test('somebody else attacking takes the third person, and names the real defender', () => {
  const state = at(
    table([{ id: 'bears', owner: 'p2' }, { id: 'baloth', owner: 'p2' }]),
    'declare_attackers',
    'p2',
    [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p1' },
    ]
  );

  assert.equal(combatSentence(state, 'p1'), 'Yeva attacks you with 2 creatures');
});

test('a swing split across two seats counts them rather than naming one', () => {
  const state = at(
    table([{ id: 'bears', owner: 'p2' }, { id: 'baloth', owner: 'p2' }]),
    'declare_attackers',
    'p2',
    [
      { attacker: 'bears', defender: 'p1' },
      { attacker: 'baloth', defender: 'p3' },
    ]
  );

  assert.equal(combatSentence(state, 'p1'), 'Yeva attacks 2 players with 2 creatures');
});

test('nothing declared says nothing at all', () => {
  const state = at(table([{ id: 'bears', owner: 'p1' }]), 'declare_attackers', 'p1');
  assert.equal(combatSentence(state, 'p1'), '');
});

/* ------------------------------------------------------------------ *
 * Copy rules, on the strings this module hands to a tooltip
 * ------------------------------------------------------------------ */

test('no combat label or refusal contains an em-dash', () => {
  /* `cardCombatFor().label` lands on `title` and `aria-label` of the chip in
     `GameCardView.tsx`, so it is read by a person and by a screen reader. It
     carried eight em-dashes, including one standing in for a stat line that
     could not be read. Project copy rules forbid them. */
  const state = table([
    { id: 'mine', owner: 'p1', name: 'Bears' },
    { id: 'sick', owner: 'p1', name: 'Baloth', summoningSick: true },
    { id: 'tapped', owner: 'p1', name: 'Elves', tapped: true },
    { id: 'wall', owner: 'p1', name: 'Wall', keywords: ['defender'] },
    { id: 'theirs', owner: 'p2', name: 'Ogre' },
  ]);

  const ids = ['mine', 'sick', 'tapped', 'wall', 'theirs'];
  const labels: string[] = [];
  const collect = (
    from: GameState,
    stage: 'attackers' | 'blockers',
    armed?: InstanceId | null
  ) => {
    for (const id of ids) {
      const instance = from.cards[id];
      if (!instance) continue;
      const info = cardCombatFor(from, 'p1', instance, stage, { armedBlockerId: armed ?? null });
      if (info.label) labels.push(info.label);
    }
  };

  collect(at(state, 'declare_attackers', 'p1'), 'attackers');
  collect(at(state, 'declare_attackers', 'p1', [{ attacker: 'mine', defender: 'p2' }]), 'attackers');
  const incoming = at(state, 'declare_blockers', 'p2', [{ attacker: 'theirs', defender: 'p1' }]);
  collect(incoming, 'blockers');
  collect(incoming, 'blockers', 'mine');

  assert.ok(labels.length > 0, 'the sweep produced no labels to check');
  for (const label of labels) {
    assert.equal(label.indexOf('—'), -1, `em-dash in a combat label: ${label}`);
  }
});
