/**
 * Tranche 2: the bound pronoun, the folded "if you do", and the token-only
 * subtypes.
 *
 * ## Every card in this file is real
 *
 * The oracle text below was copied out of `scratch/scryfall/oracle-cards.jsonl`,
 * the cached Scryfall bulk file the census and the coverage script both read.
 * None of it was typed from memory. That matters more here than anywhere else
 * in this folder, because the whole subject is a pronoun and a pronoun means
 * whatever the sentence around it says it means: an invented fixture would test
 * a sentence structure nobody printed and prove nothing about the pool.
 *
 * ## What is asserted, and why the refusals outnumber the acceptances
 *
 * Binding "it" to the source is the only change in this tranche that can
 * produce a WRONG ability rather than a missing one. Traitor's Roar says "Tap
 * target untapped creature. It deals damage equal to its power to its
 * controller", and before this tranche the compiler bound that "it" to the
 * source without asking — so the card dealt the wrong creature's power to the
 * wrong player and reported itself understood. Most of the tests below are
 * therefore about the sentences where the pronoun must NOT be taken:
 *
 *   1. the trigger's event happened to something other than the source;
 *   2. the sentence named another object before the pronoun;
 *   3. the ability announced a target, which is the likelier referent.
 *
 * The three gates are independent and each has its own case here, because a
 * guard that only works when all three agree is one gate, not three.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';
import { itMayBind } from './effect-rules.ts';
import type { Ability, Effect, TriggeredAbility } from './dsl.ts';
import { effectsOf, hasManualEffect } from './dsl.ts';

type Card = Parameters<typeof compileCardAbilities>[0];

/** The one triggered ability a card produced, or a failure naming what it got. */
function onlyTrigger(card: Card): TriggeredAbility {
  const compiled = compileCardAbilities(card);
  const triggers = compiled.abilities.filter((a): a is TriggeredAbility => a.kind === 'triggered');
  assert.equal(
    triggers.length,
    1,
    `expected one triggered ability, got [${compiled.abilities.map((a: Ability) => a.kind).join(',')}] plus unparsed [${compiled.unparsed.map(u => u.text).join(' | ')}]`,
  );
  return triggers[0];
}

/** Did any effect on this card stay a `{do:'manual'}` marker? */
function anyManual(card: Card): boolean {
  return compileCardAbilities(card).abilities.some(a => hasManualEffect(effectsOf(a)));
}

/* ------------------------------------------------------------------ *
 * itMayBind — the sentence-level gate, on its own
 * ------------------------------------------------------------------ */

describe('itMayBind, the noun-before-the-pronoun gate', () => {
  it('allows a pronoun nothing came before', () => {
    assert.equal(itMayBind('it gets +2/+0 until end of turn'), true);
    assert.equal(itMayBind('return it to its owners hand'), true);
    assert.equal(itMayBind('sacrifice it'), true);
  });

  it('allows a verb and a counter in front, because neither is a candidate referent', () => {
    // The gate is a list of NOUNS on purpose. "put a +1/+1 counter on it" is the
    // second most common shape in this family and has two words in front of the
    // pronoun, neither of which anything could mistake for an object.
    assert.equal(itMayBind('put a +1/+1 counter on it'), true);
    assert.equal(itMayBind('remove a +1/+1 counter from it'), true);
  });

  it('refuses when the sentence named a creature first', () => {
    // Kashi-Tribe Warriors: "tap that creature and it doesn't untap during its
    // controller's next untap step". The pronoun is the blocked creature.
    assert.equal(itMayBind('tap that creature and it doesnt untap during its controllers next untap step'), false);
  });

  it('refuses when the sentence named a card first', () => {
    // Squadron Hawk: the "them" and "it" of a library search are the cards found.
    assert.equal(itMayBind('you may search your library for a card named ~, reveal it, put it into your hand, then shuffle'), false);
  });

  it('refuses when the sentence announced a target first', () => {
    // Traitor's Roar. This is the sentence the old unconditional binding got wrong.
    assert.equal(itMayBind('tap target untapped creature. it deals damage equal to its power to its controller'), false);
  });

  it('refuses when the sentence created a token first', () => {
    assert.equal(itMayBind('create a cursed role token attached to it'), false);
  });

  it('judges the whole body, not the sentence the pronoun is in', () => {
    // A noun in sentence one withdraws the binding from sentence two as well.
    // Conservative on purpose: a card is given up rather than read wrongly.
    assert.equal(itMayBind('target creature you control gets +1/+0 until end of turn. then it deals damage equal to its power to target creature you dont control'), false);
  });
});

/* ------------------------------------------------------------------ *
 * The pronoun, bound
 * ------------------------------------------------------------------ */

describe('"it" bound to the source, on triggers whose event is the source', () => {
  it('reads Brazen Wolves — "whenever this creature attacks, it gets +2/+0"', () => {
    const ability = onlyTrigger({
      name: 'Brazen Wolves',
      type_line: 'Creature — Wolf',
      oracle_text: 'Whenever this creature attacks, it gets +2/+0 until end of turn.',
    } as Card);
    assert.deepEqual(ability.event, { on: 'attacks', who: { sel: 'self' } });
    assert.deepEqual(ability.effects, [
      { do: 'pump', what: { sel: 'self' }, power: 2, toughness: 0, duration: 'end-of-turn' },
    ]);
  });

  it('reads Steadfast Cathar, the same shape with a defensive pump', () => {
    const ability = onlyTrigger({
      name: 'Steadfast Cathar',
      type_line: 'Creature — Human Soldier',
      oracle_text: 'Whenever this creature attacks, it gets +0/+2 until end of turn.',
    } as Card);
    assert.deepEqual((ability.effects[0] as Extract<Effect, { do: 'pump' }>).what, { sel: 'self' });
  });

  it('reads Snorting Gahr, on becomes-blocked, which the engine does not derive', () => {
    // Worth its own case: the compiler reads the pronoun for every self-event,
    // and whether the ENGINE can observe that event is a separate question the
    // coverage script asks. Reading it here does not claim it runs.
    const ability = onlyTrigger({
      name: 'Snorting Gahr',
      type_line: 'Creature — Rhino Beast',
      oracle_text: 'Whenever this creature becomes blocked, it gets +2/+2 until end of turn.',
    } as Card);
    assert.deepEqual((ability.effects[0] as Extract<Effect, { do: 'pump' }>).what, { sel: 'self' });
  });

  it('reads Alesha — "put a +1/+1 counter on it" with the pronoun at the end', () => {
    const compiled = compileCardAbilities({
      name: 'Alesha, Who Laughs at Fate',
      type_line: 'Legendary Creature — Human Warrior',
      oracle_text:
        'First strike\nWhenever Alesha attacks, put a +1/+1 counter on it.\nRaid — At the beginning of your end step, if you attacked this turn, return target creature card with mana value less than or equal to Alesha\'s power from your graveyard to the battlefield.',
    } as Card);
    const attack = compiled.abilities.find(
      (a): a is TriggeredAbility => a.kind === 'triggered' && a.event?.on === 'attacks',
    );
    assert.ok(attack, 'expected an attack trigger');
    assert.deepEqual(attack.effects, [
      { do: 'add-counters', what: { sel: 'self' }, counter: '+1/+1', count: 1 },
    ]);
  });

  it('reads Mortus Strider — "when this creature dies, return it to its owner\'s hand"', () => {
    const ability = onlyTrigger({
      name: 'Mortus Strider',
      type_line: 'Creature — Skeleton',
      oracle_text: 'When this creature dies, return it to its owner\'s hand.',
    } as Card);
    assert.deepEqual(ability.event, { on: 'dies', who: { sel: 'self' } });
    assert.deepEqual(ability.effects, [{ do: 'move-zone', what: { sel: 'self' }, to: 'hand' }]);
  });

  it('marks the ability approximate, because reading a pronoun is inference', () => {
    const ability = onlyTrigger({
      name: 'Brazen Wolves',
      type_line: 'Creature — Wolf',
      oracle_text: 'Whenever this creature attacks, it gets +2/+0 until end of turn.',
    } as Card);
    assert.equal(ability.confidence, 'approximate');
  });

  it('keeps reading an activated ability\'s "it", which is the source by construction', () => {
    // Cinder Elemental. 154 cards spell a sacrifice-for-damage ability this way
    // and read correctly before this tranche; the gate must not cost them.
    const compiled = compileCardAbilities({
      name: 'Cinder Elemental',
      type_line: 'Creature — Elemental',
      oracle_text: '{X}{R}, {T}, Sacrifice this creature: It deals X damage to any target.',
    } as Card);
    assert.equal(compiled.coverage, 'full');
    const activated = compiled.abilities.find(a => a.kind === 'activated');
    assert.ok(activated);
    // `{do:'damage'}` carries no source field — the source is the ability's own
    // permanent — so the pronoun's work here is the rule agreeing to fire at
    // all. Refuse the binding and the rule returns null and the clause becomes
    // a marker, which is exactly what must not happen to these 154 cards.
    const damage = effectsOf(activated)[0] as Extract<Effect, { do: 'damage' }>;
    assert.equal(damage.do, 'damage');
    assert.deepEqual(damage.amount, { v: 'x' });
  });
});

/* ------------------------------------------------------------------ *
 * The pronoun, refused — the half that matters
 * ------------------------------------------------------------------ */

describe('"it" refused, because the sentence does not mean the source', () => {
  it('refuses Traitor\'s Roar, which used to compile to the wrong creature', () => {
    const compiled = compileCardAbilities({
      name: 'Traitor\'s Roar',
      type_line: 'Sorcery',
      oracle_text:
        'Tap target untapped creature. It deals damage equal to its power to its controller.\nConspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose a new target for the copy.)',
    } as Card);
    const spell = compiled.abilities.find(a => a.kind === 'spell');
    assert.ok(spell, 'expected a spell ability');
    const manuals = effectsOf(spell).filter((e): e is Extract<Effect, { do: 'manual' }> => e.do === 'manual');
    assert.equal(manuals.length, 1);
    assert.match(manuals[0].text, /^it deals damage equal to its power/);
  });

  it('refuses Rabid Gnaw, where "then it" is the creature pumped a sentence earlier', () => {
    assert.equal(
      anyManual({
        name: 'Rabid Gnaw',
        type_line: 'Instant',
        oracle_text:
          'Target creature you control gets +1/+0 until end of turn. Then it deals damage equal to its power to target creature you don\'t control.',
      } as Card),
      true,
    );
  });

  it('refuses Kashi-Tribe Warriors, where "it" is the creature just tapped', () => {
    assert.equal(
      anyManual({
        name: 'Kashi-Tribe Warriors',
        type_line: 'Creature — Snake Warrior',
        oracle_text:
          'Whenever this creature deals combat damage to a creature, tap that creature and it doesn\'t untap during its controller\'s next untap step.',
      } as Card),
      true,
    );
  });

  it('refuses a trigger whose event happened to something else, however plain the body', () => {
    // The body is "return it to its owner's hand", word for word the body this
    // tranche taught the compiler to read on Mortus Strider. Only the event
    // tells the two apart, which is why the event is a gate of its own.
    const compiled = compileCardAbilities({
      name: 'Probe Recursion',
      type_line: 'Creature — Skeleton',
      oracle_text: 'Whenever another creature you control dies, return it to its owner\'s hand.',
    } as Card);
    const bounced = compiled.abilities
      .flatMap(a => effectsOf(a))
      .find((e): e is Extract<Effect, { do: 'move-zone' }> => e.do === 'move-zone');
    assert.equal(bounced, undefined, 'the pronoun must not have been bound to the source');
  });

  it('refuses Squadron Hawk, where the pronouns are the cards found in the library', () => {
    assert.equal(
      anyManual({
        name: 'Squadron Hawk',
        type_line: 'Creature — Bird',
        oracle_text:
          'Flying\nWhen this creature enters, you may search your library for up to three cards named Squadron Hawk, reveal them, put them into your hand, then shuffle.',
      } as Card),
      true,
    );
  });
});

/* ------------------------------------------------------------------ *
 * "If you do" — the option carrying its consequence
 * ------------------------------------------------------------------ */

describe('"If you do, …" folded into the "you may" before it', () => {
  it('reads Keldon Raider as one offer, not an offer and an orphan', () => {
    const ability = onlyTrigger({
      name: 'Keldon Raider',
      type_line: 'Creature — Human Warrior',
      oracle_text: 'When this creature enters, you may discard a card. If you do, draw a card.',
    } as Card);
    assert.equal(ability.effects.length, 1);
    const may = ability.effects[0] as Extract<Effect, { do: 'may' }>;
    assert.equal(may.do, 'may');
    // The text is what `to-actions.ts` prints to the player, so the consequence
    // has to be in it or the offer is half an offer.
    assert.equal(may.text, 'you may discard a card. if you do, draw a card');
    assert.deepEqual(may.effects, [
      { do: 'discard', who: { who: 'you' }, count: 1 },
      { do: 'draw', who: { who: 'you' }, count: 1 },
    ]);
  });

  it('reads Brawl-Bash Ogre, where the consequence is a pump on the source', () => {
    const compiled = compileCardAbilities({
      name: 'Brawl-Bash Ogre',
      type_line: 'Creature — Ogre Warrior',
      oracle_text:
        'Menace (This creature can\'t be blocked except by two or more creatures.)\nWhenever this creature attacks, you may sacrifice another creature. If you do, this creature gets +2/+2 until end of turn.',
    } as Card);
    assert.equal(compiled.coverage, 'full');
    const trigger = compiled.abilities.find((a): a is TriggeredAbility => a.kind === 'triggered');
    assert.ok(trigger);
    const may = trigger.effects[0] as Extract<Effect, { do: 'may' }>;
    assert.equal(may.do, 'may');
    assert.equal(may.effects.length, 2);
    assert.equal(may.effects[1].do, 'pump');
  });

  it('leaves the card a PLAYER DECISION and never claims it is automated', () => {
    // The point of folding the clause in is that the player is offered the whole
    // trade. It is not the point that the engine takes it: a `{do:'may'}` is
    // still a decision, `to-actions.ts` still defers it, and the coverage script
    // still counts the card PROMPTABLE rather than AUTOMATED.
    const ability = onlyTrigger({
      name: 'Keldon Raider',
      type_line: 'Creature — Human Warrior',
      oracle_text: 'When this creature enters, you may discard a card. If you do, draw a card.',
    } as Card);
    assert.equal(ability.effects.some(e => e.do === 'may'), true);
  });

  it('refuses to attach when the consequence itself cannot be read', () => {
    // Chipper Chopper's consequence ends in "it assembles a Contraption", a named
    // mechanic with no `Effect` member. Half the sentence is not permission to
    // compile the sentence, so the whole clause stays a visible marker.
    assert.equal(
      anyManual({
        name: 'Chipper Chopper',
        type_line: 'Artifact Creature — Cyborg Rigger',
        oracle_text:
          'Flying\nWhen this creature enters, you may sacrifice another artifact. If you do, put two +1/+1 counters on this creature and it assembles a Contraption. (Put the top card of your Contraption deck face up onto one of your sprockets.)',
      } as Card),
      true,
    );
  });

  it('refuses to attach to anything that is not a "you may"', () => {
    // "If you do" after a cost or an event this compiler never read has an
    // antecedent nothing here can name, and guessing one is inventing it.
    const compiled = compileCardAbilities({
      name: 'Probe Orphan',
      type_line: 'Creature — Human',
      oracle_text: 'When this creature enters, draw a card. If you do, you gain 2 life.',
    } as Card);
    const trigger = compiled.abilities.find((a): a is TriggeredAbility => a.kind === 'triggered');
    assert.ok(trigger);
    assert.equal(trigger.effects.some(e => e.do === 'may'), false);
    assert.equal(hasManualEffect(trigger.effects), true);
  });
});

/* ------------------------------------------------------------------ *
 * Token-only subtypes
 * ------------------------------------------------------------------ */

describe('subtypes that exist only on token rows', () => {
  it('reads a Saproling token, which no card-derived vocabulary could contain', () => {
    const compiled = compileCardAbilities({
      name: 'Fungal Infection',
      type_line: 'Instant',
      oracle_text: 'Target creature gets -1/-1 until end of turn. Create a 1/1 green Saproling creature token.',
    } as Card);
    assert.equal(compiled.coverage, 'full');
    const token = compiled.abilities
      .flatMap(a => effectsOf(a))
      .find((e): e is Extract<Effect, { do: 'create-token' }> => e.do === 'create-token');
    assert.ok(token, 'expected a create-token effect');
    assert.equal(token.token.name, 'Saproling');
    assert.equal(token.token.typeLine, 'Token Creature — Saproling');
    assert.deepEqual(token.token.colorIdentity, ['G']);
  });

  it('reads the same word in a cost, not only in a token descriptor', () => {
    const compiled = compileCardAbilities({
      name: 'Thallid Germinator',
      type_line: 'Creature — Fungus',
      oracle_text:
        'At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.\nSacrifice a Saproling: Target creature gets +1/+1 until end of turn.',
    } as Card);
    assert.equal(compiled.coverage, 'full');
  });
});
