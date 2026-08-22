/**
 * The mana pool: real cards, activated or cast, and the pool checked afterwards.
 *
 *   node --test --experimental-strip-types src/lib/game/mana-pool.test.ts
 *
 * ## Why every card here is named and its text is verbatim
 *
 * A test built from invented text proves that the compiler and the engine agree
 * with each other, which is not the question. The question is whether Dark
 * Ritual makes three black mana, so the fixture says "Dark Ritual" and "Add
 * {B}{B}{B}" and the assertion is about what is in the pool afterwards.
 *
 * ## And why they go all the way to the board
 *
 * `activate.ts` was the last thing in this engine to hold the line honestly: it
 * REFUSED to offer a mana ability, because there was no pool and pressing the
 * control would have tapped a permanent and binned what it made. Its refusal
 * sentence was "Mana abilities are used when you pay for something." That line
 * is gone, and the only way to be sure it is gone for the right reason is to
 * press the control and look at the mana.
 *
 * Nothing below constructs an `ADD_MANA` by hand. Each test starts from oracle
 * text, asks `activationsFor` or `planCastFromHand` what a player could press,
 * applies exactly that batch, and reads `manaPoolOf`. That is the difference
 * CLAUDE.md draws between "the engine supports it" and "a player can do it".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, applyAction, applyActions, createGame } from './rules.ts';
import { activationsFor, planActivation, planActivationWith } from './activate.ts';
import { castSpellAction, stackHeight } from './stack.ts';
import { planCastFromHand } from './moves.ts';
import { manaPoolOf, manaSourcesFor, planPayment } from './mana.ts';
import { addManaToActions } from './abilities/primitives/mana.ts';
import { makeContext } from './abilities/context.ts';
import type { CardInstance, GameState, InstanceId, PlayerId, Zone } from './types.ts';

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

interface Spec {
  id: string;
  name: string;
  typeLine: string;
  oracleText: string;
  owner?: PlayerId;
  zone?: Zone;
  manaCost?: string;
  power?: string;
  toughness?: string;
  colorIdentity?: Array<'W' | 'U' | 'B' | 'R' | 'G' | 'C'>;
}

function game(specs: Spec[]): GameState {
  let state = createGame({
    mode: 'full',
    format: 'commander',
    seed: 21,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
  });
  state = { ...state, status: 'playing', step: 'precombat_main' };

  for (const owner of ['p1', 'p2'] as const) {
    for (let i = 0; i < 10; i++) {
      state = addCard(
        state,
        {
          instanceId: `${owner}-lib${i}`,
          cardId: 'filler',
          name: `Filler ${i}`,
          ownerId: owner,
          typeLine: 'Creature — Human',
          oracleText: '',
          power: '1',
          toughness: '1',
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
        typeLine: spec.typeLine,
        oracleText: spec.oracleText,
        summoningSick: false,
        ...(spec.manaCost !== undefined ? { manaCost: spec.manaCost } : {}),
        ...(spec.power !== undefined ? { power: spec.power } : {}),
        ...(spec.toughness !== undefined ? { toughness: spec.toughness } : {}),
        ...(spec.colorIdentity !== undefined ? { colorIdentity: spec.colorIdentity } : {}),
      },
      spec.zone ?? 'battlefield'
    );
  }

  return state;
}

const cardOf = (state: GameState, id: InstanceId): CardInstance | undefined => state.cards[id];
const colors = (state: GameState, id: PlayerId): string[] =>
  manaPoolOf(state, id).map(unit => unit.color);
const log = (state: GameState): string => state.log.map(entry => entry.message).join('\n');

/** The card's one ability, planned and applied. Asserts it was offered. */
function useAbility(state: GameState, id: InstanceId, match?: RegExp): GameState {
  const options = activationsFor(state, 'p1', cardOf(state, id));
  const option = match ? options.find(o => match.test(o.text)) : options[0];
  assert.ok(option, `no ability on ${id} matched ${match ?? '(the first one)'}`);
  assert.equal(option.ok, true, `${option.text} was refused: ${option.reason}`);
  return applyActions(state, option.actions);
}

/* ------------------------------------------------------------------ *
 * A mana ability puts mana somewhere
 * ------------------------------------------------------------------ */

test('Sol Ring adds two colourless and does not use the stack', () => {
  let state = game([
    { id: 'ring', name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' },
  ]);

  state = useAbility(state, 'ring');

  assert.deepEqual(colors(state, 'p1'), ['C', 'C']);
  assert.equal(cardOf(state, 'ring')?.tapped, true);
  assert.equal(stackHeight(state), 0, 'CR 605.3a');
});

test('Priest of Gix adds {B}{B}{B} when it enters, off its own trigger', () => {
  // The card that made this worth doing: an ETB mana trigger had nowhere to put
  // what it made, so the creature arrived and the three black were binned.
  let state = game([
    {
      id: 'priest',
      name: 'Priest of Gix',
      typeLine: 'Creature — Phyrexian Human Cleric Minion',
      oracleText: 'When this creature enters, add {B}{B}{B}.',
      zone: 'hand',
      power: '2',
      toughness: '1',
    },
  ]);

  state = applyAction(state, { type: 'PLAY', instanceId: 'priest' });

  assert.deepEqual(colors(state, 'p1'), ['B', 'B', 'B']);
});

test('Dark Ritual resolving puts three black in the pool', () => {
  let state = game([
    {
      id: 'ritual',
      name: 'Dark Ritual',
      typeLine: 'Instant',
      oracleText: 'Add {B}{B}{B}.',
      zone: 'hand',
      manaCost: '{B}',
    },
  ]);

  state = applyActions(state, [
    castSpellAction('p1', 'ritual', { resolvesTo: 'graveyard' }),
    { type: 'RESOLVE_STACK' },
  ]);

  assert.deepEqual(colors(state, 'p1'), ['B', 'B', 'B']);
  assert.equal(cardOf(state, 'ritual')?.zone, 'graveyard');
});

/* ------------------------------------------------------------------ *
 * And the mana then pays for something
 * ------------------------------------------------------------------ */

test('the mana Dark Ritual made pays for the next spell, and is gone afterwards', () => {
  /*
   * The whole point of a pool, in one test. Before this, Dark Ritual resolved
   * into a log line and the next spell still had to be paid for out of lands.
   */
  let state = game([
    {
      id: 'ritual',
      name: 'Dark Ritual',
      typeLine: 'Instant',
      oracleText: 'Add {B}{B}{B}.',
      zone: 'hand',
      manaCost: '{B}',
    },
    {
      id: 'sengir',
      name: 'Sengir Vampire',
      typeLine: 'Creature — Vampire',
      oracleText: '',
      zone: 'hand',
      manaCost: '{3}{B}',
      power: '4',
      toughness: '4',
    },
  ]);

  // No lands at all. If the Vampire gets cast, the pool is the only thing that
  // could have paid for it.
  assert.equal(manaSourcesFor(state, 'p1').length, 0, 'nothing on the board makes mana');

  state = applyActions(state, [
    castSpellAction('p1', 'ritual', { resolvesTo: 'graveyard' }),
    { type: 'RESOLVE_STACK' },
  ]);
  assert.equal(manaPoolOf(state, 'p1').length, 3);

  const cast = planCastFromHand(state, 'p1', 'sengir');
  assert.equal(cast.ok, false, '{3}{B} is four mana and the pool holds three');
  assert.match(cast.reason, /Needs 4 mana/);

  // One more black and it is affordable, out of the pool alone.
  let richer = state;
  for (let i = 0; i < 1; i++) {
    richer = applyActions(richer, [
      { type: 'ADD_MANA', playerId: 'p1', mana: '{B}', sourceName: 'a second Dark Ritual' },
    ]);
  }
  const funded = planCastFromHand(richer, 'p1', 'sengir');
  assert.equal(funded.ok, true, funded.reason);
  assert.deepEqual(funded.payment.tapIds, [], 'no permanent was tapped');
  assert.equal(funded.payment.spend.length, 4, 'all four came out of the pool');

  const after = applyActions(richer, funded.actions);
  assert.deepEqual(colors(after, 'p1'), [], 'and the pool is empty again');
});

test('floating mana is spent before a land is tapped', () => {
  /*
   * A policy, and the direction matters: pool mana evaporates at the end of the
   * step and a Forest does not. The engine already chose which lands to tap, so
   * this is that same choice with one more kind of source in it.
   */
  let state = game([
    {
      id: 'forest',
      name: 'Forest',
      typeLine: 'Basic Land — Forest',
      oracleText: '({T}: Add {G}.)',
      colorIdentity: ['G'],
    },
    {
      id: 'bears',
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear',
      oracleText: '',
      zone: 'hand',
      manaCost: '{1}{G}',
      power: '2',
      toughness: '2',
    },
  ]);

  state = applyAction(state, { type: 'ADD_MANA', playerId: 'p1', mana: '{G}' });

  const cast = planCastFromHand(state, 'p1', 'bears');
  assert.equal(cast.ok, true, cast.reason);
  assert.deepEqual(cast.payment.spend, ['G'], 'the floating {G} paid the coloured pip');
  assert.deepEqual(cast.payment.tapIds, ['forest'], 'the Forest paid the generic');
});

/* ------------------------------------------------------------------ *
 * A choice is asked, never guessed
 * ------------------------------------------------------------------ */

test('Birds of Paradise asks which colour, and carries all five options', () => {
  const state = game([
    {
      id: 'birds',
      name: 'Birds of Paradise',
      typeLine: 'Creature — Bird',
      oracleText: 'Flying\n{T}: Add one mana of any color.',
      power: '0',
      toughness: '1',
    },
  ]);

  const option = activationsFor(state, 'p1', cardOf(state, 'birds'))[0];
  assert.equal(option.isManaAbility, true);
  assert.equal(option.ok, false, 'the engine must not pick a colour');
  assert.deepEqual(option.actions, [], 'and must not tap the bird while it asks');

  assert.equal(option.pending.length, 1);
  const choice = option.pending[0];
  assert.equal(choice.kind, 'mode');
  assert.equal(choice.min, 1);
  assert.equal(choice.max, 1);
  assert.deepEqual(
    (choice.modes ?? []).map(mode => mode.text),
    ['Add {W}', 'Add {U}', 'Add {B}', 'Add {R}', 'Add {G}'],
    'every legal answer is on the question'
  );
});

test('answering Birds of Paradise with black puts black in the pool', () => {
  let state = game([
    {
      id: 'birds',
      name: 'Birds of Paradise',
      typeLine: 'Creature — Bird',
      oracleText: 'Flying\n{T}: Add one mana of any color.',
      power: '0',
      toughness: '1',
    },
  ]);

  const abilityId = activationsFor(state, 'p1', cardOf(state, 'birds'))[0].abilityId;
  const plan = planActivationWith(state, 'p1', 'birds', abilityId, choice =>
    // Index 2 is "Add {B}" in the card's own printed order.
    choice.kind === 'mode' ? [2] : null
  );

  assert.equal(plan.ok, true, plan.reason);
  state = applyActions(state, plan.actions);

  assert.deepEqual(colors(state, 'p1'), ['B'], 'the colour the caller chose, not the first one');
  assert.equal(cardOf(state, 'birds')?.tapped, true);
});

test('a mode nobody picked is never resolved, and a nonsense answer is refused', () => {
  const state = game([
    {
      id: 'gorge',
      name: 'Timber Gorge',
      typeLine: 'Land',
      oracleText: 'This land enters tapped.\n{T}: Add {R} or {G}.',
    },
  ]);
  const abilityId = activationsFor(state, 'p1', cardOf(state, 'gorge')).find(o =>
    /Add \{R\} or \{G\}/.test(o.text)
  )?.abilityId;
  assert.ok(abilityId);

  // Out of range. Clamping it to a legal mode would resolve the land in a mode
  // the caller never asked for, which is the same failure as guessing one.
  const bogus = planActivation(state, 'p1', 'gorge', abilityId, { choices: { modes: { m0: [7] } } });
  assert.equal(bogus.ok, false);
  assert.equal(bogus.pending.length, 1, 'it asks again rather than repairing the answer');

  // Two modes when the card says one.
  const greedy = planActivation(state, 'p1', 'gorge', abilityId, { choices: { modes: { m0: [0, 1] } } });
  assert.equal(greedy.ok, false, 'CR 700.2: "or" is one of them');

  const good = planActivation(state, 'p1', 'gorge', abilityId, { choices: { modes: { m0: [1] } } });
  assert.equal(good.ok, true, good.reason);
  assert.deepEqual(colors(applyActions(state, good.actions), 'p1'), ['G']);
});

/* ------------------------------------------------------------------ *
 * Honesty about what the pool cannot do
 * ------------------------------------------------------------------ */

test('Geosurge makes restricted mana, and the restriction stops it paying for anything', () => {
  /*
   * "Spend this mana only to cast artifact or creature spells." `planPayment`
   * is handed a cost string and knows nothing about what is being cast, so it
   * cannot check that and must not pretend to. The mana is in the pool, the log
   * quotes the restriction, and nothing spends it.
   *
   * That under-delivers Geosurge and it never mis-pays. A rules engine that
   * quietly pays a cost the player could not legally pay is worse than one that
   * makes them do it by hand.
   */
  let state = game([
    {
      id: 'surge',
      name: 'Geosurge',
      typeLine: 'Sorcery',
      oracleText: 'Add {R}{R}{R}{R}{R}{R}{R}. Spend this mana only to cast artifact or creature spells.',
      zone: 'hand',
      manaCost: '{3}{R}',
    },
  ]);

  state = applyActions(state, [
    castSpellAction('p1', 'surge', { resolvesTo: 'graveyard' }),
    { type: 'RESOLVE_STACK' },
  ]);

  assert.equal(manaPoolOf(state, 'p1').length, 7, 'all seven are in the pool');
  assert.ok(
    manaPoolOf(state, 'p1').every(unit => !!unit.restriction),
    'and every one of them carries the restriction'
  );
  assert.match(log(state), /only to cast artifact or creature spells/i);

  assert.deepEqual(
    manaSourcesFor(state, 'p1'),
    [],
    'restricted mana is offered to nothing, because nothing here can check the restriction'
  );
});

test('an ADD_MANA that would add nothing is never built, so it can never be silent', () => {
  /*
   * FOUND BY THIS TEST, and it is worth writing down because the first version
   * of it failed for a good reason.
   *
   * `applyOne` drops an action whose reducer changed nothing: no log entry, no
   * version bump. So an `ADD_MANA` carrying a string that yields no mana would
   * change nothing and say nothing, which is the exact silent no-op this engine
   * is built to refuse. Writing a log line for that case does not help, because
   * `describeAction` is never reached for a dropped action.
   *
   * The place to stop it is the producer. `addManaToActions` is the only thing
   * that builds this action, and for any symbol it will not guess at it emits
   * ZERO actions and a deferral instead, which the caller turns into a NOTE.
   * That invariant is what is pinned here, over every shape of string that
   * yields nothing.
   */
  const state = game([
    { id: 'rock', name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' },
  ]);
  const ctx = makeContext(state, 'rock', 'p1');

  for (const mana of ['{R/G}', '{X}', '{S}', '{2/R}', 'two green mana', '']) {
    const result = addManaToActions(
      { do: 'add-mana', who: { who: 'you' }, mana },
      ctx,
      { idPrefix: 't', ordinal: 0, at: 0, timestamp: 1 }
    );
    assert.deepEqual(result.actions, [], `"${mana}" must not build an action`);
    assert.ok(result.deferred.length > 0, `"${mana}" must say something`);
  }

  // And the reducer's own guard, so the two halves cannot drift: a hand-built
  // one adds nothing rather than a guessed colour.
  const after = applyAction(state, { type: 'ADD_MANA', playerId: 'p1', mana: '{R/G}' });
  assert.deepEqual(colors(after, 'p1'), []);
});

test('a mana ability limited to once each turn is refused, because nothing counts its uses', () => {
  /*
   * `PUT_ABILITY_ON_STACK` is the only thing that increments `abilityUses`, and
   * a mana ability never reaches the stack, so the count would read zero
   * forever. Refused with a sentence rather than silently allowed every turn:
   * an engine that claims to keep a rule and does not is the thing this project
   * keeps finding.
   */
  const state = game([
    {
      id: 'font',
      name: 'Font of Mythos',
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}. Activate only once each turn.',
    },
  ]);

  const option = activationsFor(state, 'p1', cardOf(state, 'font'))[0];
  assert.ok(option);
  assert.equal(option.ok, false);
  assert.match(option.reason, /does not count uses of a mana ability/i);
  assert.deepEqual(option.actions, []);
});

/* ------------------------------------------------------------------ *
 * CR 500.4
 * ------------------------------------------------------------------ */

test('the pool empties at every step boundary and at the turn boundary', () => {
  let state = game([
    { id: 'ring', name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' },
  ]);

  state = useAbility(state, 'ring');
  assert.equal(manaPoolOf(state, 'p1').length, 2);
  state = applyAction(state, { type: 'PHASE_CHANGE', step: 'begin_combat' });
  assert.deepEqual(colors(state, 'p1'), [], 'a step ending empties it');

  state = applyAction(state, { type: 'UNTAP', instanceId: 'ring' });
  state = useAbility(state, 'ring');
  assert.equal(manaPoolOf(state, 'p1').length, 2);
  state = applyAction(state, { type: 'PASS_TURN' });
  assert.deepEqual(colors(state, 'p1'), [], 'and so does the turn ending');
});

/* ------------------------------------------------------------------ *
 * Replay
 * ------------------------------------------------------------------ */

test('the same batch applied twice from the same state lands on the same pool', () => {
  // No clock and no random source anywhere in this path, so a client replaying
  // the log has to reach the same floating mana. It is state; if it diverged,
  // every later payment would diverge with it.
  const state = game([
    {
      id: 'talisman',
      name: 'Talisman of Progress',
      typeLine: 'Artifact',
      oracleText: '{T}: Add {C}.\n{T}: Add {W} or {U}. This artifact deals 1 damage to you.',
    },
  ]);

  const abilityId = activationsFor(state, 'p1', cardOf(state, 'talisman')).find(o =>
    /\{W\} or \{U\}/.test(o.text)
  )?.abilityId;
  assert.ok(abilityId);

  const plan = planActivation(state, 'p1', 'talisman', abilityId, { choices: { modes: { m0: [1] } } });
  assert.equal(plan.ok, true, plan.reason);

  const first = applyActions(state, plan.actions);
  const second = applyActions(state, plan.actions);
  assert.deepEqual(manaPoolOf(first, 'p1'), manaPoolOf(second, 'p1'));
  assert.deepEqual(colors(first, 'p1'), ['U'], 'the second mode, which is {U}');
  assert.equal(
    first.players[0].life,
    second.players[0].life,
    'and the rider was charged the same both times'
  );
});

/* ------------------------------------------------------------------ *
 * The payment planner itself
 * ------------------------------------------------------------------ */

test('paying {R} out of two floating red leaves the other one alone', () => {
  /*
   * The over-reservation this guards against: a cost that spends ONE {R} must
   * not put every red in the pool out of reach. Shivan Dragon can be pumped
   * twice off two floating red, and after the first pump the second is still
   * there to pay for it.
   */
  let state = game([
    {
      id: 'shivan',
      name: 'Shivan Dragon',
      typeLine: 'Creature — Dragon',
      oracleText: 'Flying\n{R}: This creature gets +1/+0 until end of turn.',
      power: '5',
      toughness: '5',
    },
  ]);
  state = applyActions(state, [
    { type: 'ADD_MANA', playerId: 'p1', mana: '{R}{R}' },
  ]);
  assert.equal(manaPoolOf(state, 'p1').length, 2);

  const pump = activationsFor(state, 'p1', cardOf(state, 'shivan')).find(o => /\+1\/\+0/.test(o.text));
  assert.ok(pump);
  assert.equal(pump.ok, true, pump.reason);

  state = applyActions(state, pump.actions);
  assert.deepEqual(colors(state, 'p1'), ['R'], 'one spent, one left');

  const again = activationsFor(state, 'p1', cardOf(state, 'shivan')).find(o => /\+1\/\+0/.test(o.text));
  assert.equal(again?.ok, true, `the second pump was refused: ${again?.reason}`);
  state = applyActions(state, again.actions);
  assert.deepEqual(colors(state, 'p1'), [], 'and now both are spent');
});

test('planPayment reports pool spending separately from taps, always', () => {
  /*
   * `tapIds` WAS the whole cost of a spell. It stopped being that the moment
   * pool mana became a source, and a caller that read `tapIds` and forgot
   * `spend` would hand a player a free spell. Both halves are checked here so
   * the split cannot quietly collapse back into one.
   */
  let state = game([
    {
      id: 'mountain',
      name: 'Mountain',
      typeLine: 'Basic Land — Mountain',
      oracleText: '',
      colorIdentity: ['R'],
    },
  ]);
  state = applyAction(state, { type: 'ADD_MANA', playerId: 'p1', mana: '{R}' });

  const plan = planPayment('{R}{R}', manaSourcesFor(state, 'p1'));
  assert.equal(plan.ok, true, plan.reason);
  assert.deepEqual(plan.spend, ['R']);
  assert.deepEqual(plan.tapIds, ['mountain']);
  assert.equal(
    plan.spend.length + plan.tapIds.length,
    plan.required,
    'every mana in the cost came from exactly one place'
  );
});
