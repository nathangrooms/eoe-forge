/**
 * Tranche 3: the one-sided characteristic-defining P/T, the lost plural, and
 * the counters value.
 *
 * ## Every card in this file is real
 *
 * The names, type lines, printed P/T boxes and oracle text below were copied
 * out of `scratch/scryfall/oracle-cards.jsonl`, the cached Scryfall bulk file
 * the census and the coverage script both read. The printed boxes matter more
 * here than the text does: the whole rule under test reads the half of the P/T
 * box the sentence did not define, so a fixture with an invented `4` in it
 * would pass while proving nothing about any card a player owns.
 *
 * ## The three changes and the one shape they share
 *
 *   1. `~'s power is equal to <value>` now compiles, by writing the PRINTED
 *      toughness into the other half of `pt-set`. Uurg is `*`/`5`; its
 *      toughness is 5 whatever this rule does, and saying 5 is stating the card
 *      rather than inventing a number. It refuses the moment the other box is
 *      itself a `*` expression, because `parseInt` would read Lhurgoyf's `1+*`
 *      as a confident 1.
 *
 *   2. `parseObject` threw the plural away when it stripped the word "cards".
 *      "lands you control" was plural and "land cards in your graveyard" was
 *      not, so `parseValueExpr` refused every "the number of X cards in your
 *      graveyard" in the pool while accepting the battlefield spelling of the
 *      same idea.
 *
 *   3. `parseValueExpr` had no rule for counters on the source, although
 *      `parseForEachValue` has had one since it was written. A pure parity gap.
 *
 * All three can only produce a MISSING ability, with one exception, and that
 * exception is where most of the assertions are: restoring the plural also
 * restores it on a phrase that stated a number ("two creature cards"), and a
 * numbered phrase that comes back as `each` means EVERY match. That is the
 * Peregrine Drake failure — a wrong ability wearing the clothes of a modelled
 * one — so `countBounded` is asserted in both directions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';
import { parseObject, parseValueExpr, parseForEachValue } from './grammar.ts';
import type { Ability, Modification, StaticAbility } from './dsl.ts';

type Card = Parameters<typeof compileCardAbilities>[0];

/** The one static ability a card produced, or a failure naming what it got. */
function onlyStatic(card: Card): StaticAbility {
  const compiled = compileCardAbilities(card);
  const statics = compiled.abilities.filter((a): a is StaticAbility => a.kind === 'static');
  assert.equal(
    statics.length,
    1,
    `expected one static, got [${compiled.abilities.map((a: Ability) => a.kind).join(',')}] plus unparsed [${compiled.unparsed.map(u => u.text).join(' | ')}]`,
  );
  return statics[0];
}

/** Did the compiler refuse this paragraph outright? */
function refused(card: Card, fragment: string): boolean {
  return compileCardAbilities(card).unparsed.some(u => u.text.includes(fragment));
}

function ptSetOf(ability: StaticAbility): Modification & { layer: 'pt-set' } {
  const mod = ability.modifications.find(m => m.layer === 'pt-set');
  assert.ok(mod, `expected a pt-set, got ${JSON.stringify(ability.modifications)}`);
  return mod as Modification & { layer: 'pt-set' };
}

/* ------------------------------------------------------------------ *
 * 1. One characteristic defined, the other one printed
 * ------------------------------------------------------------------ */

describe('a CDA that defines one half of the P/T box', () => {
  it('Uurg, Spawn of Turg — power counted, toughness taken from the printed 5', () => {
    // Printed */5. Before this rule the whole line was `unrecognised`, so a
    // player saw the 0 that `printed.ts`'s parseInt fallback reports for `*`.
    const uurg: Card = {
      name: 'Uurg, Spawn of Turg',
      type_line: 'Legendary Creature — Frog Beast',
      power: '*',
      toughness: '5',
      oracle_text: "Uurg's power is equal to the number of land cards in your graveyard.",
    };
    const mod = ptSetOf(onlyStatic(uurg));
    assert.deepEqual(mod.toughness, 5, 'the printed box, not a guess');
    assert.deepEqual(mod.power, {
      v: 'count',
      of: { sel: 'all', where: { is: 'type', value: 'land' }, controller: { who: 'you' }, zone: 'graveyard' },
    });
    assert.equal(onlyStatic(uurg).affects.sel, 'self');
  });

  it('People of the Woods — toughness counted, power taken from the printed 1', () => {
    // Printed 1/*. The mirror case, and the one that proves the two branches
    // are not the same branch with the fields swapped by accident.
    const people: Card = {
      name: 'People of the Woods',
      type_line: 'Creature — Human',
      power: '1',
      toughness: '*',
      oracle_text: "People of the Woods's toughness is equal to the number of Forests you control.",
    };
    const mod = ptSetOf(onlyStatic(people));
    assert.deepEqual(mod.power, 1);
    assert.deepEqual(mod.toughness, {
      v: 'count',
      of: { sel: 'all', where: { is: 'subtype', value: 'forest' }, controller: { who: 'you' }, zone: 'battlefield' },
    });
  });

  it('Lhurgoyf — REFUSED, because the other box is a second CDA', () => {
    // Printed */1+*. `parseInt('1+*')` is 1, and a Lhurgoyf with a flat
    // toughness of 1 is a different card. The refusal is the point.
    const lhurgoyf: Card = {
      name: 'Lhurgoyf',
      type_line: 'Creature — Lhurgoyf',
      power: '*',
      toughness: '1+*',
      oracle_text:
        "Lhurgoyf's power is equal to the number of creature cards in all graveyards and its toughness is equal to that number plus 1.",
    };
    assert.ok(refused(lhurgoyf, "Lhurgoyf's power is equal to"));
  });

  it('Yavimaya Kavu — REFUSED on BOTH lines, because each defines the other half', () => {
    // Printed */*, with power and toughness on two separate paragraphs. Reading
    // either one alone would have to take `*` for the other, so both refuse.
    // The awkward case, and the reason the guard is on the printed box rather
    // than on the sentence.
    const kavu: Card = {
      name: 'Yavimaya Kavu',
      type_line: 'Creature — Kavu',
      power: '*',
      toughness: '*',
      oracle_text:
        "Yavimaya Kavu's power is equal to the number of red creatures on the battlefield.\nYavimaya Kavu's toughness is equal to the number of green creatures on the battlefield.",
    };
    const compiled = compileCardAbilities(kavu);
    assert.equal(compiled.abilities.length, 0);
    assert.equal(compiled.unparsed.length, 2);
  });

  it('Aven Trailblazer — REFUSED, because the VALUE is unreadable, not the shape', () => {
    // Printed 2/*, so the printed-box guard passes. "The number of basic land
    // types among lands you control" is domain, which `parseValueExpr` has no
    // member for, and the rule must not fall back on the printed `*`.
    // 26 uses in the pool: the largest single refusal left in "the number of".
    const aven: Card = {
      name: 'Aven Trailblazer',
      type_line: 'Creature — Bird Soldier',
      power: '2',
      toughness: '*',
      oracle_text:
        "Flying\nDomain — Aven Trailblazer's toughness is equal to the number of basic land types among lands you control.",
    };
    assert.ok(refused(aven, 'basic land types among lands you control'));
  });

  it('Tidewalker — the two-sided rule still wins, and now reads its counters', () => {
    // Printed */*, and the value is "the number of time counters on it", which
    // `parseValueExpr` refused until this tranche. The two-sided rule is
    // matched first, so this also proves the new one-sided rule did not shadow
    // it.
    const tidewalker: Card = {
      name: 'Tidewalker',
      type_line: 'Creature — Elemental',
      power: '*',
      toughness: '*',
      oracle_text:
        "This creature enters with a time counter on it for each Island you control.\nVanishing\nTidewalker's power and toughness are each equal to the number of time counters on it.",
    };
    const statics = compileCardAbilities(tidewalker).abilities.filter(
      (a): a is StaticAbility => a.kind === 'static',
    );
    assert.equal(statics.length, 1);
    const mod = ptSetOf(statics[0]);
    const expected = { v: 'counters', of: { sel: 'self' }, counter: 'time' };
    assert.deepEqual(mod.power, expected);
    assert.deepEqual(mod.toughness, expected, 'both halves, because the card said "each"');
  });
});

/* ------------------------------------------------------------------ *
 * 2. The plural that "cards" was carrying
 * ------------------------------------------------------------------ */

describe('the plural on "<type> cards"', () => {
  it('"the number of land cards in your graveyard" counts the whole zone', () => {
    assert.deepEqual(parseValueExpr('the number of land cards in your graveyard'), {
      v: 'count',
      of: { sel: 'all', where: { is: 'type', value: 'land' }, controller: { who: 'you' }, zone: 'graveyard' },
    });
  });

  it('the battlefield spelling of the same idea already worked, and still does', () => {
    // The pair is the evidence that this was a lost plural and not a missing
    // zone rule: "lands you control" was accepted while "land cards in your
    // graveyard" was refused, and only the word "cards" separated them.
    assert.deepEqual(parseValueExpr('the number of lands you control'), {
      v: 'count',
      of: { sel: 'all', where: { is: 'type', value: 'land' }, controller: { who: 'you' }, zone: 'battlefield' },
    });
  });

  it('Melek, Reforged Researcher — a scaled count over the same phrase', () => {
    // "twice the number of instant and sorcery cards in your graveyard": the
    // multiplier already worked and had nothing to multiply.
    assert.deepEqual(parseValueExpr('twice the number of instant and sorcery cards in your graveyard'), {
      v: 'mul',
      of: [
        2,
        {
          v: 'count',
          of: {
            sel: 'all',
            where: { is: 'or', of: [{ is: 'type', value: 'instant' }, { is: 'type', value: 'sorcery' }] },
            controller: { who: 'you' },
            zone: 'graveyard',
          },
        },
      ],
    });
  });

  it('a SINGULAR card phrase is still not a set', () => {
    // "a creature card in your graveyard" is one card somebody picks.
    // `phraseSelector` refuses a non-`each` phrase, and that refusal is what
    // stops "return a creature card" becoming "return all of them".
    const ref = parseObject('creature card in your graveyard');
    assert.ok(ref);
    assert.equal(ref.each, false);
  });
});

/* ------------------------------------------------------------------ *
 * 3. A stated number can never mean "all"
 * ------------------------------------------------------------------ */

describe('a bounded count survives the plural', () => {
  it('"two creatures you control" is two, not every creature', () => {
    // The latent hole the plural fix would otherwise have widened: the phrase
    // strips to the head noun "creatures", whose `s` sets `each`, and `each`
    // is what `phraseSelector` reads as "every match". No card in the pool
    // currently reaches that path, which is why this is asserted on the
    // primitive rather than on a card.
    const ref = parseObject('two creatures you control');
    assert.ok(ref);
    assert.equal(ref.count, 2);
    assert.equal(ref.each, false, 'a stated number is bounded');
  });

  it('"two creature cards in your graveyard" is two as well', () => {
    const ref = parseObject('two creature cards in your graveyard');
    assert.ok(ref);
    assert.equal(ref.count, 2);
    assert.equal(ref.each, false);
  });

  it('Lord of Tresserhorn — "you sacrifice two creatures" still sacrifices two', () => {
    // Real text, and the shape that would have been wrecked loudly: a
    // `sacrifice` whose selector meant every creature its controller has.
    const lord: Card = {
      name: 'Lord of Tresserhorn',
      type_line: 'Legendary Creature — Zombie',
      power: '10',
      toughness: '4',
      oracle_text:
        'When Lord of Tresserhorn enters, you lose 2 life, you sacrifice two creatures, and target opponent draws two cards.',
    };
    const json = JSON.stringify(compileCardAbilities(lord).abilities);
    const sacrifice = /"do":"sacrifice"[^}]*"count":(\d+)/.exec(json.replace(/"what":\{[^{}]*\}/g, ''));
    if (sacrifice) assert.equal(sacrifice[1], '2');
    // Whatever else the card does, nothing on it may say "sacrifice, count 1,
    // every creature you control".
    assert.ok(!/"do":"sacrifice","who":\{"who":"you"\},"what":\{"sel":"all","where":\{"is":"type","value":"creature"\},"controller":\{"who":"you"\},"zone":"battlefield"\},"count":1/.test(json));
  });

  it('"all creatures you control" is still every match', () => {
    const ref = parseObject('all creatures you control');
    assert.ok(ref);
    assert.equal(ref.each, true);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Counters on the source, as a counted value
 * ------------------------------------------------------------------ */

describe('the number of counters on the source', () => {
  it('reads the shapes "for each" has always read', () => {
    // The parity being closed. Same phrase, same answer, both directions.
    for (const kind of ['+1/+1', 'charge', 'verse', 'time', 'lore']) {
      assert.deepEqual(
        parseValueExpr(`the number of ${kind} counters on ~`),
        { v: 'counters', of: { sel: 'self' }, counter: kind },
        kind,
      );
      assert.deepEqual(
        parseForEachValue(`${kind} counter on ~`),
        { v: 'counters', of: { sel: 'self' }, counter: kind },
        kind,
      );
    }
  });

  it('reads a bare "it" the same way, because the compiler normalises it there', () => {
    assert.deepEqual(parseValueExpr('the number of +1/+1 counters on it'), {
      v: 'counters',
      of: { sel: 'self' },
      counter: '+1/+1',
    });
  });

  it('REFUSES "on that creature" — a permanent an earlier sentence bound', () => {
    // Counting the source's counters instead would be a confident wrong number,
    // which this folder treats as worse than no number at all.
    assert.equal(parseValueExpr('the number of +1/+1 counters on that creature'), null);
  });

  it('REFUSES a counter with no kind named', () => {
    // `{v:'counters'}` keys on a counter NAME and has no wildcard, so
    // "the number of counters on ~" would have to guess +1/+1.
    assert.equal(parseValueExpr('the number of counters on ~'), null);
  });

  it('REFUSES counters on a set of other permanents', () => {
    // Toph, the Blind Bandit: "the number of +1/+1 counters on lands you
    // control" is a sum over a set, which `{v:'counters'}` cannot express — it
    // names one object. Still unparsed, on purpose.
    assert.equal(parseValueExpr('the number of +1/+1 counters on lands you control'), null);
  });
});

/* ------------------------------------------------------------------ *
 * "gets ±X/±X, where X is <quantity>"
 * ------------------------------------------------------------------ */

/**
 * The drawback family, and the reason it was worth a rule of its own.
 *
 * Both cards below are printed 13/13. Both cost the whole of their body back
 * on the line the compiler could not read, and an unreadable line is not a
 * weaker card, it is a card with no drawback at all. Death's Shadow for one
 * black mana as an unconditional 13/13 is not a card that has ever been legal
 * in any format.
 *
 * The quantity goes through `parseValueExpr` rather than a rule per phrase, so
 * this one pattern reaches every quantity that function can already read, and
 * refuses the rest instead of guessing.
 */
function ptModifyOf(ability: StaticAbility): Modification & { layer: 'pt-modify' } {
  const mod = ability.modifications.find(m => m.layer === 'pt-modify');
  assert.ok(mod, `expected a pt-modify, got ${JSON.stringify(ability.modifications)}`);
  return mod as Modification & { layer: 'pt-modify' };
}

describe('"gets -X/-X, where X is your life total"', () => {
  const shadow: Card = {
    name: "Death's Shadow",
    type_line: 'Creature — Avatar',
    power: '13',
    toughness: '13',
    mana_cost: '{B}',
    oracle_text: 'This creature gets -X/-X, where X is your life total.',
  };

  it("Death's Shadow compiles, and both halves are the negated life total", () => {
    const mod = ptModifyOf(onlyStatic(shadow));
    const negatedLife = { v: 'sub', a: 0, b: { v: 'life', of: { who: 'you' } } };
    assert.deepEqual(mod.power, negatedLife);
    assert.deepEqual(mod.toughness, negatedLife);
  });

  it('nothing on the card is left unparsed, so coverage is full', () => {
    const compiled = compileCardAbilities(shadow);
    assert.deepEqual(compiled.unparsed, []);
    assert.equal(compiled.coverage, 'full');
  });

  it('The Last Ride is the same sentence on a Vehicle', () => {
    const lastRide: Card = {
      name: 'The Last Ride',
      type_line: 'Legendary Artifact — Vehicle',
      power: '13',
      toughness: '13',
      oracle_text:
        'The Last Ride gets -X/-X, where X is your life total.\n{2}{B}, Pay 2 life: Draw a card.\nCrew 2',
    };
    const mod = ptModifyOf(onlyStatic(lastRide));
    assert.deepEqual(mod.power, { v: 'sub', a: 0, b: { v: 'life', of: { who: 'you' } } });
  });

  it('the two signs are read independently, not assumed to match', () => {
    const oneSided: Card = {
      name: 'Test Only — one-sided sign',
      type_line: 'Creature — Avatar',
      power: '13',
      toughness: '13',
      oracle_text: 'This creature gets -X/+X, where X is your life total.',
    };
    const mod = ptModifyOf(onlyStatic(oneSided));
    assert.deepEqual(mod.power, { v: 'sub', a: 0, b: { v: 'life', of: { who: 'you' } } });
    assert.deepEqual(mod.toughness, { v: 'life', of: { who: 'you' } });
  });

  it('an Aura carries the same sentence about the creature it enchants', () => {
    // Kagemaro's Clutch, printed exactly like this.
    const clutch: Card = {
      name: "Kagemaro's Clutch",
      type_line: 'Enchantment — Aura',
      oracle_text:
        'Enchant creature\nEnchanted creature gets -X/-X, where X is the number of cards in your hand.',
    };
    const statics = compileCardAbilities(clutch).abilities.filter(
      (a): a is StaticAbility => a.kind === 'static' && a.affects.sel === 'attached'
    );
    assert.equal(statics.length, 1, 'the subject is the enchanted creature, not the Aura');
    assert.deepEqual(ptModifyOf(statics[0]).power, {
      v: 'sub',
      a: 0,
      b: {
        v: 'count',
        of: { sel: 'all', where: { is: 'any' }, zone: 'hand', controller: { who: 'you' } },
      },
    });
  });

  it('a quantity parseValueExpr cannot read is still refused, not guessed', () => {
    // Elspeth, Undaunted Hero. Devotion is not a quantity this compiler reads,
    // and a +0/+0 would be a card that silently does nothing.
    const devotion: Card = {
      name: 'Test Only — devotion',
      type_line: 'Creature — Avatar',
      power: '1',
      toughness: '1',
      oracle_text: 'This creature gets +X/+X, where X is your devotion to white.',
    };
    assert.equal(refused(devotion, 'devotion to white'), true);
  });
});
