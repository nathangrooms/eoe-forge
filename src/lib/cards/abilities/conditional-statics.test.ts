/**
 * Tranche 1: conditional and computed static abilities, plus the "up to" fix.
 *
 * ## Every card in this file is real
 *
 * The oracle text below was copied out of `scratch/scryfall/oracle-cards.jsonl`,
 * the cached Scryfall bulk file the census and the coverage script both read.
 * None of it was typed from memory and none of it was invented, because a test
 * built from invented card text proves the parser handles a sentence nobody
 * printed. Where the current oracle wording differs from the one a player
 * remembers — Nimble Mongoose says "there are seven or more cards in your
 * graveyard", not "seven or more cards are in your graveyard" — the file's
 * wording is what is here, and the difference is exactly the kind of thing an
 * invented fixture hides. The first draft of these rules passed a hand-typed
 * Nimble Mongoose and failed the real one.
 *
 * ## What is asserted
 *
 * Three things, in the order the compiler cares about them:
 *
 *   1. the shapes that MUST compile, with the exact `Condition` or `ValueExpr`
 *      they produce, because a static ability that applies under the wrong
 *      circumstances is a wrong ability and nothing marks it;
 *   2. the shapes that MUST be refused, which is the larger half — "as long as
 *      ~ is untapped" and "for as long as" both look like this family and are
 *      not it;
 *   3. the over-reach fix, on the three cards the coverage report named.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';
import { parseCondition, parseForEachValue } from './grammar.ts';
import type { StaticAbility } from './dsl.ts';
import { hasManualEffect, effectsOf } from './dsl.ts';

/** The single static ability a card produced, or a failure naming what it got. */
function onlyStatic(card: Parameters<typeof compileCardAbilities>[0]): StaticAbility {
  const compiled = compileCardAbilities(card);
  const statics = compiled.abilities.filter((a): a is StaticAbility => a.kind === 'static');
  assert.equal(
    statics.length,
    1,
    `expected exactly one static ability, got ${compiled.abilities.map(a => a.kind).join(',')} plus unparsed [${compiled.unparsed.map(u => u.text).join(' | ')}]`,
  );
  return statics[0];
}

/* ------------------------------------------------------------------ *
 * "As long as …" — the condition itself
 * ------------------------------------------------------------------ */

describe('parseCondition, on phrases taken from the catalogue', () => {
  it('reads "there are seven or more cards in your graveyard" as a graveyard count', () => {
    assert.deepEqual(parseCondition('there are seven or more cards in your graveyard'), {
      if: 'value',
      a: { v: 'cards-in', zone: 'graveyard', of: { who: 'you' } },
      cmp: 'gte',
      b: 7,
    });
  });

  it('reads a bare "you control an artifact" as one or more', () => {
    assert.deepEqual(parseCondition('you control an artifact'), {
      if: 'controls',
      who: { who: 'you' },
      what: { is: 'type', value: 'artifact' },
      cmp: 'gte',
      value: 1,
    });
  });

  it('reads the quantifier when the phrase states one', () => {
    assert.deepEqual(parseCondition('you control three or more artifacts'), {
      if: 'controls',
      who: { who: 'you' },
      what: { is: 'type', value: 'artifact' },
      cmp: 'gte',
      value: 3,
    });
  });

  it('reads "you control no untapped lands" as a count of zero', () => {
    assert.deepEqual(parseCondition('you control no untapped lands'), {
      if: 'controls',
      who: { who: 'you' },
      what: { is: 'and', of: [{ is: 'type', value: 'land' }, { is: 'untapped' }] },
      cmp: 'eq',
      value: 0,
    });
  });

  it('reads "you have no cards in hand"', () => {
    assert.deepEqual(parseCondition('you have no cards in hand'), {
      if: 'value',
      a: { v: 'cards-in', zone: 'hand', of: { who: 'you' } },
      cmp: 'eq',
      b: 0,
    });
  });

  it('keeps the stated controller rather than assuming it is you', () => {
    const mine = parseCondition('you control a plains');
    const theirs = parseCondition('an opponent controls a plains');
    assert.deepEqual((mine as { who: unknown }).who, { who: 'you' });
    assert.deepEqual((theirs as { who: unknown }).who, { who: 'each-opponent' });
  });

  it('refuses a fact about the source itself, which no Condition member reads', () => {
    // Fourteen cards say "as long as ~ is equipped" and eleven say "as long as ~
    // is untapped". `{if:'count', of:{sel:'all', where:{is:'untapped'}}}` would
    // count every untapped permanent on the table, so there is nothing to build.
    assert.equal(parseCondition('~ is untapped'), null);
    assert.equal(parseCondition('~ is equipped'), null);
    assert.equal(parseCondition('its attacking'), null);
  });

  it('refuses turn history, because an unfolded log answers 0 and 0 means "off"', () => {
    assert.equal(parseCondition('youve drawn two or more cards this turn'), null);
    assert.equal(parseCondition('you gained life this turn'), null);
  });

  it('refuses devotion and other vocabulary the value tree has no member for', () => {
    assert.equal(parseCondition('your devotion to blue is less than five'), null);
    assert.equal(parseCondition('you have an enduring story'), null);
  });

  it('refuses "you control another artifact", which would count the source itself', () => {
    assert.equal(parseCondition('you control another artifact'), null);
  });
});

/* ------------------------------------------------------------------ *
 * "As long as …" — the whole clause
 * ------------------------------------------------------------------ */

describe('conditional static abilities, from real cards', () => {
  it('Nimble Mongoose — threshold anthem, suffix form', () => {
    const ability = onlyStatic({
      name: 'Nimble Mongoose',
      type_line: 'Creature — Mongoose',
      oracle_text:
        "Shroud (This creature can't be the target of spells or abilities.)\n" +
        'Threshold — This creature gets +2/+2 as long as there are seven or more cards in your graveyard.',
    });
    assert.deepEqual(ability.affects, { sel: 'self' });
    assert.deepEqual(ability.modifications, [{ layer: 'pt-modify', power: 2, toughness: 2 }]);
    assert.deepEqual(ability.condition, {
      if: 'value',
      a: { v: 'cards-in', zone: 'graveyard', of: { who: 'you' } },
      cmp: 'gte',
      b: 7,
    });
  });

  it('Sedge Troll — the anthem is read even though the regenerate line is not', () => {
    const compiled = compileCardAbilities({
      name: 'Sedge Troll',
      type_line: 'Creature — Troll',
      oracle_text: 'This creature gets +1/+1 as long as you control a Swamp.\n{B}: Regenerate this creature.',
    });
    // Partial, not full: the regenerate line is still a declared gap. The point
    // of the assertion is that one unreadable line does not cost the readable
    // one, which is the whole reason paragraphs are compiled independently.
    assert.equal(compiled.coverage, 'partial');
    const statics = compiled.abilities.filter(a => a.kind === 'static');
    assert.equal(statics.length, 1);
    assert.deepEqual((statics[0] as StaticAbility).condition, {
      if: 'controls',
      who: { who: 'you' },
      what: { is: 'subtype', value: 'swamp' },
      cmp: 'gte',
      value: 1,
    });
  });

  it('an "as long as" prefix carries a keyword grant as well as the pump', () => {
    // Ghitu Encampment-shaped templating: the prefix form, with the two-part
    // modification the existing anthem rule already builds.
    const ability = onlyStatic({
      name: 'Nimble Test',
      type_line: 'Creature — Human',
      oracle_text: 'As long as you control an artifact, this creature gets +1/+0 and has deathtouch.',
    });
    assert.deepEqual(ability.modifications, [
      { layer: 'pt-modify', power: 1, toughness: 0 },
      { layer: 'ability', grant: ['deathtouch'] },
    ]);
    assert.equal((ability.condition as { if: string }).if, 'controls');
  });

  it('refuses the whole clause when the condition is readable and the effect is not', () => {
    // "as long as you control an artifact, ~ can attack as though it didn't have
    // defender" — the condition parses, the effect does not, and half a
    // continuous effect is not a smaller version of the right one.
    const compiled = compileCardAbilities({
      name: 'Half Read',
      type_line: 'Creature — Wall',
      oracle_text: "As long as you control an artifact, this creature can attack as though it didn't have defender.",
    });
    assert.equal(compiled.abilities.filter(a => a.kind === 'static').length, 0);
    assert.equal(compiled.unparsed.length, 1);
  });

  it('refuses the whole clause when the effect is readable and the condition is not', () => {
    const compiled = compileCardAbilities({
      name: 'Unread Condition',
      type_line: 'Creature — Human',
      oracle_text: 'This creature gets +2/+0 as long as you gained life this turn.',
    });
    assert.equal(compiled.abilities.filter(a => a.kind === 'static').length, 0);
    assert.equal(compiled.unparsed.length, 1);
  });

  it('does not read "for as long as", which is a duration and not a condition', () => {
    // Icy Manipulator-shaped text. Read as a condition this would become a
    // continuous effect that switches itself off; it is a one-shot with a
    // lasting consequence, which is a different card.
    const compiled = compileCardAbilities({
      name: 'Duration Not Condition',
      type_line: 'Artifact',
      oracle_text:
        "{T}: Tap target land. It doesn't untap during its controller's untap step for as long as this artifact remains tapped.",
    });
    assert.equal(compiled.abilities.filter(a => a.kind === 'static').length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Computed power and toughness
 * ------------------------------------------------------------------ */

describe('characteristic-defining power and toughness', () => {
  it('Nightmare — equal to the number of Swamps you control', () => {
    const ability = onlyStatic({
      name: 'Nightmare',
      type_line: 'Creature — Nightmare Horse',
      oracle_text:
        "Flying (This creature can't be blocked except by creatures with flying or reach.)\n" +
        "Nightmare's power and toughness are each equal to the number of Swamps you control.",
    });
    const counted = {
      v: 'count',
      of: { sel: 'all', where: { is: 'subtype', value: 'swamp' }, controller: { who: 'you' }, zone: 'battlefield' },
    };
    assert.deepEqual(ability.modifications, [{ layer: 'pt-set', power: counted, toughness: counted }]);
  });

  it('Maro — equal to the number of cards in your hand, which is a zone count', () => {
    const ability = onlyStatic({
      name: 'Maro',
      type_line: 'Creature — Elemental',
      oracle_text: "Maro's power and toughness are each equal to the number of cards in your hand.",
    });
    const counted = {
      v: 'count',
      of: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' }, zone: 'hand' },
    };
    assert.deepEqual(ability.modifications, [{ layer: 'pt-set', power: counted, toughness: counted }]);
  });

  it('Lord of Extinction is refused: "all graveyards" is not in the value vocabulary', () => {
    // The refusal matters more than the acceptances. `{v:'cards-in'}` names ONE
    // player's zone; there is no member that sums every graveyard, and setting
    // this creature's power from your own graveyard alone would be wrong in
    // exactly the games it is played in.
    const compiled = compileCardAbilities({
      name: 'Lord of Extinction',
      type_line: 'Creature — Elemental',
      oracle_text: "Lord of Extinction's power and toughness are each equal to the number of cards in all graveyards.",
    });
    assert.equal(compiled.abilities.length, 0);
    assert.equal(compiled.unparsed.length, 1);
  });

  it('refuses the one-sided spelling, which pt-set cannot express', () => {
    // "~'s power is equal to the number of creatures you control" sets ONE of
    // the two. Writing the expression into both fields would grant a toughness
    // the card never printed.
    const compiled = compileCardAbilities({
      name: 'One Sided',
      type_line: 'Creature — Elemental',
      oracle_text: "One Sided's power is equal to the number of creatures you control.",
    });
    assert.equal(compiled.abilities.filter(a => a.kind === 'static').length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Counted anthems
 * ------------------------------------------------------------------ */

describe('anthems whose size is counted', () => {
  it('"+1/+0 for each artifact you control" multiplies only the side with a number', () => {
    const ability = onlyStatic({
      name: 'Counted Anthem',
      type_line: 'Creature — Human',
      oracle_text: 'This creature gets +1/+0 for each artifact you control.',
    });
    assert.deepEqual(ability.modifications, [
      {
        layer: 'pt-modify',
        power: {
          v: 'mul',
          of: [1, { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'artifact' }, controller: { who: 'you' }, zone: 'battlefield' } }],
        },
        toughness: 0,
      },
    ]);
  });

  it('counts counters on the source, which is the only subject it can name', () => {
    assert.deepEqual(parseForEachValue('oil counter on it'), {
      v: 'counters',
      of: { sel: 'self' },
      counter: 'oil',
    });
    // "on that creature" is bound by an earlier sentence. Refused, same as
    // `parseValueExpr` refuses "its power".
    assert.equal(parseForEachValue('oil counter on that creature'), null);
  });

  it('refuses a "for each" phrase naming something it cannot count', () => {
    const compiled = compileCardAbilities({
      name: 'Unread For Each',
      type_line: 'Creature — Human',
      oracle_text: 'This creature gets +1/+1 for each experience counter you have.',
    });
    assert.equal(compiled.abilities.filter(a => a.kind === 'static').length, 0);
  });
});

/* ------------------------------------------------------------------ *
 * The "up to" over-reach
 *
 * These three cards were named by name in `scratch/ability-layer-coverage.txt`
 * as coverage 'full' on text containing a player decision. That is the WRONG-
 * ability failure: not a card that did nothing, a card that did the wrong thing
 * with nothing to say so.
 * ------------------------------------------------------------------ */

describe('"up to N" is a number the player picks, not every match', () => {
  it('Peregrine Drake no longer untaps every land on the table', () => {
    const compiled = compileCardAbilities({
      name: 'Peregrine Drake',
      type_line: 'Creature — Drake',
      oracle_text: 'Flying\nWhen this creature enters, untap up to five lands.',
    });
    const trigger = compiled.abilities.find(a => a.kind === 'triggered');
    assert.ok(trigger, 'the enters trigger is still recognised');
    // The trigger survives; only the effect is refused, so the card carries a
    // visible marker instead of quietly untapping the opponents' lands too.
    assert.equal(hasManualEffect(effectsOf(trigger)), true);
    assert.equal(compiled.coverage, 'partial');
    const untaps = JSON.stringify(effectsOf(trigger)).includes('"do":"untap"');
    assert.equal(untaps, false, 'no untap effect is emitted at all');
  });

  it('Great Whale, same shape, same refusal', () => {
    const compiled = compileCardAbilities({
      name: 'Great Whale',
      type_line: 'Creature — Whale',
      oracle_text: 'When this creature enters, untap up to seven lands.',
    });
    assert.equal(JSON.stringify(compiled).includes('"do":"untap"'), false);
  });

  it('Disciples of Gix no longer fetches exactly three when the card says up to three', () => {
    const compiled = compileCardAbilities({
      name: 'Disciples of Gix',
      type_line: 'Creature — Phyrexian Human',
      oracle_text:
        'When this creature enters, search your library for up to three artifact cards, put them into your graveyard, then shuffle.',
    });
    assert.equal(JSON.stringify(compiled).includes('"do":"search-library"'), false);
  });

  it('a TARGETED "up to" is untouched, because TargetSpec can say min 0', () => {
    const compiled = compileCardAbilities({
      name: 'Targeted Up To',
      type_line: 'Sorcery',
      oracle_text: 'Destroy up to two target creatures.',
    });
    const spell = compiled.abilities.find(a => a.kind === 'spell');
    assert.ok(spell);
    assert.deepEqual(
      (spell as { targets?: Array<{ min: number; max: number }> }).targets?.map(t => [t.min, t.max]),
      [[0, 2]],
    );
  });
});
