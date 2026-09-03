/**
 * "Reveal the top card of your library and put that card into your hand" and
 * the sentence that follows it.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/reveal-top.test.ts
 *
 * Yuriko, the Tiger's Shadow is the payoff of a whole archetype, and before
 * this rule her trigger compiled to two `{do:'manual'}` markers: the reveal fell
 * to `NAMED_MANUAL_EFFECTS` and "that card's mana value" had no card to mean.
 * Oracle text below is our own `cards` rows, verbatim.
 *
 * Half of this file is refusals. "That card" is only readable when THIS ability
 * revealed a card first, and a life total computed from a guessed card is the
 * confident wrong number the value grammar exists to prevent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';
import { effectsOf, selectorsIn } from './dsl.ts';
import type { Ability, Effect } from './dsl.ts';
import { validateAbilities } from './validate.ts';
import { renderAbilities } from './render.ts';

interface Row {
  name: string;
  type_line: string;
  oracle_text?: string;
}

const compile = (row: Row) => compileCardAbilities({ oracle_id: row.name, ...row });

const YURIKO: Row = {
  name: "Yuriko, the Tiger's Shadow",
  type_line: 'Legendary Creature — Human Ninja',
  oracle_text:
    'Commander ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand or the command zone tapped and attacking.)\n' +
    "Whenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card's mana value.",
};

const DARK_CONFIDANT: Row = {
  name: 'Dark Confidant',
  type_line: 'Creature — Human Wizard',
  oracle_text:
    'At the beginning of your upkeep, reveal the top card of your library and put that card into your hand. You lose life equal to its mana value.',
};

const REVEALED_DRAW: Effect = { do: 'draw', who: { who: 'you' }, count: 1, revealed: true };
const REVEALED_MANA_VALUE = { v: 'mana-value', of: { sel: 'revealed' } } as const;

const manualTexts = (ability: Ability): string[] =>
  effectsOf(ability).filter((e) => e.do === 'manual').map((e) => (e as { text: string }).text);

test('Yuriko: a Ninja trigger, a revealed draw, and each opponent losing that card\'s mana value', () => {
  const result = compile(YURIKO);
  const trigger = result.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger && trigger.kind === 'triggered', 'the combat damage trigger compiles');
  assert.equal(trigger.event.on, 'deals-damage');

  assert.deepEqual(trigger.effects, [
    REVEALED_DRAW,
    { do: 'lose-life', who: { who: 'each-opponent' }, amount: REVEALED_MANA_VALUE },
  ]);
  // Nothing on the trigger is a marker any more. Commander ninjutsu stays
  // unread, which is a different clause and a different piece of work.
  assert.deepEqual(manualTexts(trigger), []);
  // The runtime moves the card without showing it, so the ability says so.
  assert.equal(trigger.confidence, 'approximate');
  // The new selector and the new flag are both schema-valid.
  assert.deepEqual(validateAbilities(result.abilities).errors, []);
});

test('Dark Confidant: the same shape, aimed at yourself, and the whole card is read', () => {
  const result = compile(DARK_CONFIDANT);
  assert.equal(result.coverage, 'full');
  assert.equal(result.abilities.length, 1);
  assert.deepEqual(effectsOf(result.abilities[0]), [
    REVEALED_DRAW,
    { do: 'lose-life', who: { who: 'you' }, amount: REVEALED_MANA_VALUE },
  ]);
});

test('Sorin, Grim Nemesis: the loyalty ability carries it too, and "its mana value" is the same card', () => {
  const result = compile({
    name: 'Sorin, Grim Nemesis',
    type_line: 'Legendary Planeswalker — Sorin',
    oracle_text:
      '+1: Reveal the top card of your library and put that card into your hand. Each opponent loses life equal to its mana value.\n' +
      '−X: Sorin deals X damage to target creature or planeswalker and you gain X life.\n' +
      '−9: Create a number of 1/1 black Vampire Knight creature tokens with lifelink equal to the highest life total among all players.',
  });
  const plus = result.abilities.find((a) => a.kind === 'activated');
  assert.ok(plus && plus.kind === 'activated');
  assert.deepEqual(plus.effects, [
    REVEALED_DRAW,
    { do: 'lose-life', who: { who: 'each-opponent' }, amount: REVEALED_MANA_VALUE },
  ]);
});

test('Augury Adept: "you gain life equal to its mana value" reads through the same binding', () => {
  const result = compile({
    name: 'Augury Adept',
    type_line: 'Creature — Kithkin Wizard',
    oracle_text:
      'Whenever this creature deals combat damage to a player, reveal the top card of your library and put that card into your hand. You gain life equal to its mana value.',
  });
  assert.equal(result.coverage, 'full');
  assert.deepEqual(effectsOf(result.abilities[0]), [
    REVEALED_DRAW,
    { do: 'gain-life', who: { who: 'you' }, amount: REVEALED_MANA_VALUE },
  ]);
});

test('Ad Nauseam: "put it into your hand" is the same sentence, and the repeat stays a marker', () => {
  const result = compile({
    name: 'Ad Nauseam',
    type_line: 'Instant',
    oracle_text:
      'Reveal the top card of your library and put that card into your hand. You lose life equal to its mana value. You may repeat this process any number of times.',
  });
  const [spell] = result.abilities;
  assert.ok(spell && spell.kind === 'spell');
  assert.deepEqual(spell.effects.slice(0, 2), [
    REVEALED_DRAW,
    { do: 'lose-life', who: { who: 'you' }, amount: REVEALED_MANA_VALUE },
  ]);
  assert.deepEqual(manualTexts(spell), ['you may repeat this process any number of times']);
});

/* ------------------------------------------------------------------ *
 * Refusals. These are the load-bearing half.
 * ------------------------------------------------------------------ */

test('"its mana value" with no reveal in the ability is refused, not bound to anything', () => {
  // Dark Confidant's second sentence on its own. There is no card for "its"
  // to mean, and a life loss of "the mana value of nothing" is 0, which is a
  // wrong number that looks like a quiet one.
  const result = compile({
    name: 'No Antecedent',
    type_line: 'Enchantment',
    oracle_text: 'At the beginning of your upkeep, you lose life equal to its mana value.',
  });
  const [trigger] = result.abilities;
  assert.ok(trigger && trigger.kind === 'triggered');
  assert.deepEqual(manualTexts(trigger), ['you lose life equal to its mana value']);
  assert.equal(selectorsIn(trigger.effects).some((s) => s.sel === 'revealed'), false);
});

test('the binding does not leak from one ability to the next on the same card', () => {
  // Two paragraphs: the first reveals, the second does not. If `revealedCard`
  // lived anywhere but the per-ability build context, the second sentence of
  // paragraph two would read a card paragraph one revealed.
  const result = compile({
    name: 'Two Paragraphs',
    type_line: 'Creature — Human Wizard',
    oracle_text:
      'At the beginning of your upkeep, reveal the top card of your library and put that card into your hand.\n' +
      'Whenever this creature attacks, you lose life equal to its mana value.',
  });
  const attack = result.abilities.find((a) => a.kind === 'triggered' && a.event.on === 'attacks');
  assert.ok(attack && attack.kind === 'triggered');
  assert.deepEqual(manualTexts(attack), ['you lose life equal to its mana value']);
});

test('Caustic Bronco: the reveal is read and the conditional life loss is not guessed', () => {
  const result = compile({
    name: 'Caustic Bronco',
    type_line: 'Creature — Snake Horse Mount',
    oracle_text:
      "Whenever this creature attacks, reveal the top card of your library and put it into your hand. You lose life equal to that card's mana value if this creature isn't saddled. Otherwise, each opponent loses that much life.\n" +
      'Saddle 3 (Tap any number of other creatures you control with total power 3 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)',
  });
  const trigger = result.abilities.find((a) => a.kind === 'triggered');
  assert.ok(trigger && trigger.kind === 'triggered');
  assert.deepEqual(trigger.effects[0], REVEALED_DRAW);
  // Who loses the life depends on a state the compiler cannot read, so both
  // halves stay markers rather than one of them being picked.
  assert.equal(manualTexts(trigger).length, 2);
});

test('Keen Duelist: two players revealing is a different card and none of it is read', () => {
  const result = compile({
    name: 'Keen Duelist',
    type_line: 'Creature — Human Wizard',
    oracle_text:
      'At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand.',
  });
  const [trigger] = result.abilities;
  assert.ok(trigger && trigger.kind === 'triggered');
  assert.equal(effectsOf(trigger).every((e) => e.do === 'manual'), true);
});

test('the rendering says what the card says, so the round trip neither drops "reveal" nor invents "draw"', () => {
  const text = renderAbilities(compile(DARK_CONFIDANT).abilities).toLowerCase();
  assert.match(text, /reveal the top 1 cards of your library and put them into your hand/);
  assert.match(text, /the mana value of that card/);
  assert.doesNotMatch(text, /draws/);
});
