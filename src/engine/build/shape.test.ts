/**
 * The commander decides the composition.
 *
 * These are unit tests over small hand-built pools, which is the right shape
 * for asserting a RULE. They are not evidence that the finished decks are good:
 * that is measured end to end through the real pipeline against a verbatim
 * `cards_unique` snapshot, and written up in `docs/design/DECK-SHAPE.md`.
 * `src/lib/game/reachability.test.ts` records why the distinction matters on
 * this project.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { deriveDeckShape, copiesToSeeOne, type ShapeCard } from './shape.ts';
import type { Color } from '../core/types.ts';
import { planForCommander } from '../knowledge/behaviour.ts';
import { YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED, roleTargetsFor } from '../advise/roles.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let counter = 0;
function card(over: Partial<ShapeCard> & { name: string; typeLine: string }): ShapeCard {
  counter += 1;
  return {
    id: `id-${counter}`,
    oracleId: `oracle-${counter}`,
    cmc: 2,
    colorIdentity: ['R'],
    tags: [],
    manaCost: '{1}{R}',
    usd: 1,
    legalities: { commander: 'legal' },
    edhrecRank: 1000 + counter,
    facets: null,
    ...over,
  } as ShapeCard;
}

/** A Goblin lord: a creature whose record counts and makes Goblins. */
const KRENKO: ShapeCard = card({
  name: 'Goblin Boss',
  typeLine: 'Legendary Creature — Goblin Warrior',
  cmc: 4,
  manaCost: '{2}{R}{R}',
  facets: ['type:creature', 'eff:create-token', 'tok:goblin', 'cares:sub:goblin', 'rec:full'],
});

/** A spellslinger: a creature whose record triggers on instants and sorceries. */
const TALRAND: ShapeCard = card({
  name: 'Drake Summoner',
  typeLine: 'Legendary Creature — Merfolk Wizard',
  cmc: 3,
  colorIdentity: ['U'],
  manaCost: '{2}{U}',
  facets: ['type:creature', 'cares:type:instant', 'cares:type:sorcery', 'eff:create-token', 'rec:full'],
});

/** No record at all, and no tag that maps to one. This is the Muldrotha case. */
const NO_RECORD: ShapeCard = card({
  name: 'Silent Legend',
  typeLine: 'Legendary Creature — Elemental',
  cmc: 6,
  colorIdentity: ['B'],
  manaCost: '{4}{B}{B}',
  facets: null,
  tags: ['legendary'],
});

/** A pool with a tribe in it, plus enough lands and filler to build from. */
function poolFor(colour: Color): ShapeCard[] {
  const out: ShapeCard[] = [];
  for (let i = 0; i < 60; i++) {
    out.push(
      card({
        name: `Goblin ${i}`,
        typeLine: 'Creature — Goblin',
        cmc: 2,
        colorIdentity: [colour],
        manaCost: `{1}{${colour}}`,
        facets: ['type:creature', 'sub:goblin', 'rec:full'],
      })
    );
  }
  for (let i = 0; i < 60; i++) {
    out.push(
      card({
        name: `Bolt ${i}`,
        typeLine: 'Instant',
        cmc: 2,
        colorIdentity: [colour],
        manaCost: `{1}{${colour}}`,
        facets: ['type:instant', 'eff:damage', 'cares:type:instant', 'rec:full'],
      })
    );
  }
  /*
   * Cards that fill the FLOORS, half of them with a body.
   *
   * Without these the pool has nothing that serves ramp, draw or a win
   * condition, and the function half of the creature target is zero for every
   * commander. That is the right answer for a pool like that and the wrong
   * fixture for testing a rule about real ones.
   */
  for (let i = 0; i < 20; i++) {
    out.push(
      card({
        name: `Mana Dork ${i}`,
        typeLine: 'Creature — Elf Druid',
        cmc: 1,
        colorIdentity: [colour],
        manaCost: `{${colour}}`,
        facets: ['type:creature', 'eff:add-mana', 'rec:full'],
      })
    );
    out.push(
      card({
        name: `Signet ${i}`,
        typeLine: 'Artifact',
        cmc: 2,
        colorIdentity: [],
        manaCost: '{2}',
        oracleText: '{1}, {T}: Add {C}{C}.',
        facets: ['type:artifact', 'eff:add-mana', 'rec:full'],
      })
    );
    out.push(
      card({
        name: `Card Drawer ${i}`,
        typeLine: 'Creature — Bird',
        cmc: 3,
        colorIdentity: [colour],
        manaCost: `{2}{${colour}}`,
        facets: ['type:creature', 'eff:draw', 'rec:full'],
      })
    );
    out.push(
      card({
        name: `Cantrip ${i}`,
        typeLine: 'Sorcery',
        cmc: 2,
        colorIdentity: [colour],
        manaCost: `{1}{${colour}}`,
        facets: ['type:sorcery', 'eff:draw', 'rec:full'],
      })
    );
    out.push(
      card({
        name: `Counter ${i}`,
        typeLine: 'Instant',
        cmc: 2,
        colorIdentity: [colour],
        manaCost: `{1}{${colour}}`,
        facets: ['type:instant', 'eff:counter', 'rec:full'],
      })
    );
    out.push(
      card({
        name: `Finisher ${i}`,
        typeLine: 'Creature — Giant',
        cmc: 6,
        colorIdentity: [colour],
        manaCost: `{4}{${colour}}{${colour}}`,
        facets: ['type:creature', 'eff:extra-combat', 'rec:full'],
      })
    );
  }
  for (let i = 0; i < 40; i++) {
    out.push(
      card({
        name: `Basic-ish Land ${i}`,
        typeLine: 'Land',
        cmc: 0,
        manaCost: null,
        colorIdentity: [],
        oracleText: `{T}: Add {${colour}}.`,
        facets: ['type:land'],
      })
    );
  }
  return out;
}

function shapeFor(commander: ShapeCard, pool: ShapeCard[], style?: string | null) {
  return deriveDeckShape({
    slots: 99,
    commander,
    plan: planForCommander({
      name: commander.name,
      typeLine: commander.typeLine,
      facets: commander.facets ?? null,
      tags: commander.tags,
    }),
    identity: commander.colorIdentity,
    pool,
    style: style ?? null,
  });
}

/* ------------------------------------------------------------------ *
 * The composition comes off the commander
 * ------------------------------------------------------------------ */

describe('the commander decides the composition', () => {
  it('a tribal commander gets a deck of creatures and a spellslinger does not', () => {
    const goblins = shapeFor(KRENKO, poolFor('R'));
    const spells = shapeFor(TALRAND, poolFor('U'));

    // Same pool shape, same slot count, same floors. The only difference is
    // which cards each commander's own record says do its job.
    assert.ok(
      goblins.creatureTarget > spells.creatureTarget * 2,
      `${goblins.creatureTarget} creatures for the Goblin lord should far exceed ` +
        `${spells.creatureTarget} for the spellslinger`
    );
    assert.ok(goblins.evidence.creatureShare! > 0.5);
    assert.ok(spells.evidence.spellShare! > 0.5);
  });

  it('and it says so in words built from the record, not from a table', () => {
    const goblins = shapeFor(KRENKO, poolFor('R'));
    const line = goblins.because.find(b => b.includes('creatures'));
    assert.ok(line, 'the shape must explain its creature count');
    assert.match(line!, /do Goblin Boss's job/);
    assert.match(line!, /% of the work they do is done by creatures/);
  });

  it('every number carries a sentence saying what produced it', () => {
    const shape = shapeFor(KRENKO, poolFor('R'));
    for (const word of ['lands', 'creatures', 'ramp', 'draw', 'removal', 'interaction', 'wincon']) {
      assert.ok(
        shape.because.some(b => b.includes(word)),
        `nothing explains ${word}: ${shape.because.join(' | ')}`
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * The style tilts, it does not set
 * ------------------------------------------------------------------ */

describe('a style tilts the derived share and cannot replace it', () => {
  it('creature mode asks for more creatures than spell mode, for the same commander', () => {
    const pool = poolFor('U');
    const creatures = shapeFor(TALRAND, pool, 'creatures').creatureTarget;
    const balanced = shapeFor(TALRAND, pool, 'balanced').creatureTarget;
    const spells = shapeFor(TALRAND, pool, 'spells').creatureTarget;
    assert.ok(creatures > balanced, `${creatures} should exceed ${balanced}`);
    assert.ok(balanced > spells, `${balanced} should exceed ${spells}`);
  });

  it('but creature mode on a spellslinger still asks for fewer than a tribal commander', () => {
    // The owner's complaint was that creature mode produced no creatures, not
    // that it failed to turn every commander into a creature deck.
    const spellsligner = shapeFor(TALRAND, poolFor('U'), 'creatures').creatureTarget;
    const tribal = shapeFor(KRENKO, poolFor('R'), 'spells').creatureTarget;
    assert.ok(
      tribal > spellsligner,
      `a Goblin deck in spell mode (${tribal}) should still beat a spellslinger in ` +
        `creature mode (${spellsligner})`
    );
  });

  it('an unrecognised style builds a deck and reports the one it used', () => {
    const shape = shapeFor(KRENKO, poolFor('R'), 'goblins go wide');
    assert.equal(shape.evidence.styleUsed, 'balanced');
    assert.equal(shape.evidence.styleAsked, 'goblins go wide');
  });
});

/* ------------------------------------------------------------------ *
 * The fallback
 * ------------------------------------------------------------------ */

describe('a commander with no plan still gets a deck', () => {
  it('falls back to the colour identity and says so', () => {
    const shape = shapeFor(NO_RECORD, poolFor('B'));
    assert.equal(shape.evidence.source, 'colour-identity');
    assert.equal(shape.evidence.doers, 0);
    assert.equal(shape.evidence.creatureShare, null);
    assert.ok(
      shape.because.some(b => b.includes('has no plan to read')),
      shape.because.join(' | ')
    );
  });

  it('and the deck it asks for is a real deck, not an empty one', () => {
    const shape = shapeFor(NO_RECORD, poolFor('B'));
    assert.ok(shape.landTarget >= 29, `${shape.landTarget} lands`);
    assert.ok(shape.landTarget <= 49, `${shape.landTarget} lands`);
    assert.equal(shape.landTarget + shape.spellSlots, 99);
    assert.ok(shape.creatureTarget > 0, 'a deck with no creatures at all is not a fallback');
    assert.ok(shape.creatureTarget < shape.spellSlots);
    for (const role of ['ramp', 'draw', 'removal', 'interaction', 'wincon'] as const) {
      assert.ok(shape.roleFloors[role] > 0, `${role} floor is ${shape.roleFloors[role]}`);
    }
  });

  it('the fallback is not the deleted table wearing a disguise', () => {
    // If the fallback ever returns the old row, this test is the thing that
    // notices. Deriving and then quietly returning ramp 10 / draw 10 /
    // removal 8 / interaction 4 / wincon 3 would be the table surviving in the
    // 24% of cases nobody looks at.
    const shape = shapeFor(NO_RECORD, poolFor('B'));
    const old = YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED;
    const same =
      shape.roleFloors.draw === old.draw &&
      shape.roleFloors.removal === old.removal &&
      shape.roleFloors.interaction === old.interaction &&
      shape.roleFloors.wincon === old.wincon;
    assert.equal(same, false);
  });
});

/* ------------------------------------------------------------------ *
 * The floors
 * ------------------------------------------------------------------ */

describe('the floors are derived from the deck size, not declared', () => {
  it('a copy count is how many it takes to have drawn one by that turn', () => {
    // Nine cards seen by turn three, at better than even odds, out of 99.
    assert.equal(copiesToSeeOne(99, 9, 0.5), 8);
    assert.equal(copiesToSeeOne(99, 16, 0.5), 4);
    // A smaller library needs fewer copies for the same confidence.
    assert.ok(copiesToSeeOne(60, 9, 0.5) < copiesToSeeOne(99, 9, 0.5));
  });

  it('wanting to be surer costs more copies', () => {
    assert.ok(copiesToSeeOne(99, 9, 0.75) > copiesToSeeOne(99, 9, 0.5));
  });

  it('nothing to draw from asks for nothing', () => {
    assert.equal(copiesToSeeOne(0, 9, 0.5), 0);
    assert.equal(copiesToSeeOne(99, 0, 0.5), 0);
  });

  it('the land count never drops below the third land drop', () => {
    // 29 of 99 is the point at which three lands in the first nine cards
    // becomes more likely than not.
    for (const commander of [KRENKO, TALRAND, NO_RECORD]) {
      const shape = shapeFor(commander, poolFor(commander.colorIdentity[0] ?? 'R'));
      assert.ok(shape.landTarget >= 29, `${commander.name} got ${shape.landTarget} lands`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Overrides
 * ------------------------------------------------------------------ */

describe('an explicit caller number wins, and the shape says what it overruled', () => {
  it('a land target from the caller replaces the solve', () => {
    const base = {
      slots: 99,
      commander: KRENKO,
      plan: planForCommander({
        name: KRENKO.name,
        typeLine: KRENKO.typeLine,
        facets: KRENKO.facets ?? null,
        tags: KRENKO.tags,
      }),
      identity: KRENKO.colorIdentity,
      pool: poolFor('R'),
    };
    const derived = deriveDeckShape(base);
    const forced = deriveDeckShape({ ...base, landTarget: 33 });
    assert.equal(forced.landTarget, 33);
    assert.equal(forced.spellSlots, 66);
    assert.ok(
      forced.because.some(b => b.includes('the caller asked for that many')),
      forced.because.join(' | ')
    );
    // The derivation is still reported, so the override is visible as one.
    assert.ok(forced.because.some(b => b.includes(String(derived.landTarget))));
  });

  it('a role target from the caller replaces that floor and nothing else', () => {
    const pool = poolFor('R');
    const derived = shapeFor(KRENKO, pool);
    const forced = deriveDeckShape({
      slots: 99,
      commander: KRENKO,
      plan: planForCommander({
        name: KRENKO.name,
        typeLine: KRENKO.typeLine,
        facets: KRENKO.facets ?? null,
        tags: KRENKO.tags,
      }),
      identity: KRENKO.colorIdentity,
      pool,
      roleTargets: { ramp: 14 },
    });
    assert.equal(forced.roleFloors.ramp, 14);
    assert.equal(forced.roleFloors.draw, derived.roleFloors.draw);
  });
});

/* ------------------------------------------------------------------ *
 * What the yardstick is now allowed to be
 * ------------------------------------------------------------------ */

describe('the old table survives only as a yardstick for a deck already built', () => {
  it('it asks for no creatures, because there was never a universal number', () => {
    assert.equal(YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED.creature, 0);
    assert.equal(roleTargetsFor('commander').creature, 0);
  });

  it('and the generator does not build to it', () => {
    // A shape that matched the yardstick row for row would mean the derivation
    // is not deriving.
    const shape = shapeFor(KRENKO, poolFor('R'));
    const old = YARDSTICK_WHEN_NO_SHAPE_WAS_DERIVED;
    assert.notEqual(shape.roleFloors.draw, old.draw);
    assert.notEqual(shape.roleFloors.removal, old.removal);
  });
});
