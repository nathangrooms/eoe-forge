/**
 * Unit tests for the continuous-effects layer system (CR 613).
 *
 *   node --test --experimental-strip-types src/lib/game/layers.test.ts
 *
 * The layer system is the part of Magic that produces *subtly* wrong numbers
 * rather than obviously wrong ones. A naive implementation adds counters to the
 * printed value, then applies an anthem, then applies "becomes a 0/1" last and
 * hands the player a 0/1 that should be a 2/3. Nobody at the table can explain
 * it and nobody can prove it, so these tests assert the wrong answers a naive
 * engine would give as explicitly as they assert the right one.
 *
 * The three classic traps, all present below:
 *
 *   1. anthem + counters + set-P/T — sublayer order 7b, 7c, 7d;
 *   2. Humility, which removes its own ability in layer 6 and must keep applying
 *      in layer 7 anyway (CR 613.6);
 *   3. Humility + Opalescence, where the answer flips entirely on which one has
 *      the later timestamp.
 *
 * Every scenario also gets a determinism assertion where it is cheap: the same
 * inputs in a different array order must produce byte-identical output, because
 * a networked client replaying an action log has no other guarantee to lean on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  abilityEffect,
  anthemEffect,
  baseObjectFromCard,
  colorEffect,
  combatPower,
  computeLayers,
  controlEffect,
  counterPT,
  layeredStatLine,
  orderEffectGroup,
  splitTypeLine,
  setBasePTEffect,
  switchPTEffect,
  typeEffect,
  SUBLAYER_ORDER,
  type BaseObject,
  type ContinuousEffect,
  type LayerResult,
} from './layers.ts';
import { powerOf, toughnessOf } from './combat.ts';
import type { CardInstance } from './types.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function obj(over: Partial<BaseObject> & { id: string }): BaseObject {
  return {
    name: over.id,
    controller: 'p1',
    owner: 'p1',
    cardTypes: ['creature'],
    subtypes: [],
    supertypes: [],
    colors: [],
    abilities: [],
    power: null,
    toughness: null,
    manaValue: 0,
    counters: {},
    ...over,
  };
}

function creature(id: string, power: number, toughness: number, over: Partial<BaseObject> = {}) {
  return obj({ id, cardTypes: ['creature'], power, toughness, ...over });
}

function enchantment(id: string, manaValue: number, over: Partial<BaseObject> = {}) {
  return obj({ id, cardTypes: ['enchantment'], manaValue, ...over });
}

function pt(result: LayerResult, id: string): string {
  const object = result.objects[id];
  return `${object.power}/${object.toughness}`;
}

/** Humility — "All creatures lose all abilities and have base power and toughness 1/1." */
function humility(timestamp: number): ContinuousEffect {
  return {
    id: 'humility',
    timestamp,
    sourceId: 'humility',
    fromAbility: 'humility',
    note: 'Humility',
    affects: { kind: 'match', cardTypes: ['creature'] },
    provides: ['removing-ability', 'set-pt'],
    parts: [
      { sublayer: '6a', modification: { kind: 'ability', removeAllAbilities: true } },
      { sublayer: '7b', modification: { kind: 'set-pt', power: 1, toughness: 1 } },
    ],
  };
}

/**
 * Opalescence — "Each other non-Aura enchantment is a creature in addition to
 * its other types and has base power and toughness each equal to its mana value."
 */
function opalescence(timestamp: number): ContinuousEffect {
  return {
    id: 'opalescence',
    timestamp,
    sourceId: 'opalescence',
    fromAbility: 'opalescence',
    note: 'Opalescence',
    affects: {
      kind: 'match',
      cardTypes: ['enchantment'],
      notSubtypes: ['aura'],
      excludeSelf: true,
    },
    provides: ['become-creature', 'set-pt'],
    parts: [
      { sublayer: '4a', modification: { kind: 'type', addCardTypes: ['creature'] } },
      {
        sublayer: '7b',
        modification: {
          kind: 'set-pt',
          power: { kind: 'manaValue', of: 'affected' },
          toughness: { kind: 'manaValue', of: 'affected' },
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * The pipeline itself
 * ------------------------------------------------------------------ */

test('sublayers run in CR 613 order', () => {
  assert.deepEqual(
    [...SUBLAYER_ORDER],
    ['1a', '1b', '2a', '3a', '4a', '5a', '6a', '7a', '7b', '7c', '7d', '7e']
  );
});

test('no effects leaves base characteristics alone', () => {
  const result = computeLayers({
    objects: [creature('bears', 2, 2, { name: 'Grizzly Bears', colors: ['G'], manaValue: 2 })],
    effects: [],
  });

  assert.equal(pt(result, 'bears'), '2/2');
  assert.equal(result.trace.length, 0);
  assert.equal(layeredStatLine(result.objects.bears), '2/2');
});

/* ------------------------------------------------------------------ *
 * Trap 1 — anthem + counters + set-P/T
 * ------------------------------------------------------------------ */

test('set-P/T then anthem then counters: 7b, 7c, 7d in that order', () => {
  const result = computeLayers({
    objects: [
      creature('bears', 2, 2, { name: 'Grizzly Bears', counters: { '+1/+1': 1 } }),
      enchantment('anthemSrc', 2, { name: 'Glorious Anthem', abilities: ['glorious anthem'] }),
    ],
    effects: [
      setBasePTEffect({
        id: 'becomes-0-1',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['bears'] },
        power: 0,
        toughness: 1,
      }),
      anthemEffect({
        id: 'anthem',
        timestamp: 2,
        sourceId: 'anthemSrc',
        fromAbility: 'glorious anthem',
        power: 1,
        toughness: 1,
      }),
    ],
  });

  // 7b sets base 0/1, 7c adds the anthem for 1/2, 7d adds the counter for 2/3.
  assert.equal(pt(result, 'bears'), '2/3');

  // The three wrong answers, named so a regression says which layer broke.
  assert.notEqual(pt(result, 'bears'), '0/1'); // set applied last
  assert.notEqual(pt(result, 'bears'), '4/4'); // set ignored entirely
  assert.notEqual(pt(result, 'bears'), '1/2'); // counters dropped
});

test('timestamp order decides between two set-P/T effects in 7b', () => {
  const objects = [creature('bears', 2, 2)];
  const early = setBasePTEffect({
    id: 'early',
    timestamp: 1,
    affects: { kind: 'ids', ids: ['bears'] },
    power: 1,
    toughness: 1,
  });
  const late = setBasePTEffect({
    id: 'late',
    timestamp: 2,
    affects: { kind: 'ids', ids: ['bears'] },
    power: 5,
    toughness: 5,
  });

  assert.equal(pt(computeLayers({ objects, effects: [early, late] }), 'bears'), '5/5');
  // Array order must not matter — only the timestamp does.
  assert.equal(pt(computeLayers({ objects, effects: [late, early] }), 'bears'), '5/5');
});

test('a later 7a characteristic-defining ability still applies before an earlier 7b', () => {
  const result = computeLayers({
    objects: [creature('goyf', null as unknown as number, null as unknown as number)],
    effects: [
      setBasePTEffect({
        id: 'set',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['goyf'] },
        power: 1,
        toughness: 1,
      }),
      setBasePTEffect({
        id: 'cda',
        timestamp: 99,
        sublayer: '7a',
        affects: { kind: 'ids', ids: ['goyf'] },
        power: 3,
        toughness: 4,
      }),
    ],
  });

  // Sublayer beats timestamp: 7a runs first even though it is 98 later.
  assert.equal(pt(result, 'goyf'), '1/1');
  assert.deepEqual(
    result.trace.map(step => step.sublayer),
    ['7a', '7b']
  );
});

test('counters apply after modifications, and switching applies after counters', () => {
  const result = computeLayers({
    objects: [
      creature('c', 2, 5, { counters: { '+1/+1': 1 } }),
      enchantment('src', 2, { abilities: ['pump'] }),
    ],
    effects: [
      anthemEffect({
        id: 'pump',
        timestamp: 1,
        sourceId: 'src',
        fromAbility: 'pump',
        power: 1,
        toughness: 0,
      }),
      switchPTEffect({ id: 'switch', timestamp: 2, affects: { kind: 'ids', ids: ['c'] } }),
    ],
  });

  // 7c -> 3/5, 7d -> 4/6, 7e -> 6/4.
  assert.equal(pt(result, 'c'), '6/4');
  assert.notEqual(pt(result, 'c'), '4/6');
  assert.equal(result.objects.c.ptSwitched, true);
});

test('a switch always lands after a pump, whatever the timestamps say', () => {
  const result = computeLayers({
    objects: [creature('c', 1, 2), enchantment('src', 2, { abilities: ['pump'] })],
    effects: [
      switchPTEffect({ id: 'switch', timestamp: 1, affects: { kind: 'ids', ids: ['c'] } }),
      anthemEffect({
        id: 'pump',
        timestamp: 2,
        sourceId: 'src',
        fromAbility: 'pump',
        power: 3,
        toughness: 0,
      }),
    ],
  });

  // 7c first (4/2), then 7e (2/4). Applying the switch first would give 5/1.
  assert.equal(pt(result, 'c'), '2/4');
  assert.notEqual(pt(result, 'c'), '5/1');
});

test('two switches cancel', () => {
  const result = computeLayers({
    objects: [creature('c', 1, 4)],
    effects: [
      switchPTEffect({ id: 's1', timestamp: 1, affects: { kind: 'ids', ids: ['c'] } }),
      switchPTEffect({ id: 's2', timestamp: 2, affects: { kind: 'ids', ids: ['c'] } }),
    ],
  });

  assert.equal(pt(result, 'c'), '1/4');
  assert.equal(result.objects.c.ptSwitched, false);
});

test('counters read every +N/+N counter name, not just the two famous ones', () => {
  assert.deepEqual(counterPT({ '+1/+1': 2, '-1/-1': 1, '+2/+2': 1, '-0/-1': 3, loyalty: 5 }), {
    power: 3,
    toughness: 0,
  });
  assert.deepEqual(counterPT(undefined), { power: 0, toughness: 0 });
  // Not a P/T counter, and must never be treated as one.
  assert.deepEqual(counterPT({ charge: 4, stun: 2 }), { power: 0, toughness: 0 });
});

test('counters do nothing to an object with no power or toughness', () => {
  const result = computeLayers({
    objects: [obj({ id: 'rock', cardTypes: ['artifact'], counters: { '+1/+1': 3 } })],
    effects: [],
  });

  assert.equal(result.objects.rock.power, null);
  assert.equal(result.objects.rock.toughness, null);
  assert.equal(layeredStatLine(result.objects.rock), null);
});

/* ------------------------------------------------------------------ *
 * Trap 2 — Humility
 * ------------------------------------------------------------------ */

test('Humility strips abilities and sets 1/1, and keeps applying after removing its own ability', () => {
  const result = computeLayers({
    objects: [
      enchantment('humility', 4, { name: 'Humility', abilities: ['humility'] }),
      creature('bears', 2, 2, { name: 'Grizzly Bears', abilities: ['flying'] }),
    ],
    effects: [humility(1)],
  });

  assert.equal(pt(result, 'bears'), '1/1');
  assert.deepEqual(result.objects.bears.abilities, []);

  // Humility itself is not a creature here, so it is untouched by its own effect.
  assert.equal(result.objects.humility.power, null);
  assert.deepEqual(result.objects.humility.abilities, ['humility']);
});

test('Humility does not switch off an anthem that is not a creature', () => {
  const result = computeLayers({
    objects: [
      enchantment('humility', 4, { abilities: ['humility'] }),
      enchantment('anthemSrc', 3, { abilities: ['glorious anthem'] }),
      creature('bears', 2, 2),
    ],
    effects: [
      humility(1),
      anthemEffect({
        id: 'anthem',
        timestamp: 2,
        sourceId: 'anthemSrc',
        fromAbility: 'glorious anthem',
        power: 1,
        toughness: 1,
      }),
    ],
  });

  // 7b sets 1/1, 7c adds the anthem: the enchantment kept its ability.
  assert.equal(pt(result, 'bears'), '2/2');
  assert.equal(
    result.skipped.some(entry => entry.effectId === 'anthem'),
    false
  );
});

/* ------------------------------------------------------------------ *
 * Trap 3 — Humility + Opalescence
 * ------------------------------------------------------------------ */

test('Humility earlier than Opalescence: Opalescence wins layer 7b, Humility is a 4/4', () => {
  const result = computeLayers({
    objects: [
      enchantment('humility', 4, { name: 'Humility', abilities: ['humility'] }),
      enchantment('opalescence', 4, { name: 'Opalescence', abilities: ['opalescence'] }),
      creature('bears', 2, 2, { name: 'Grizzly Bears' }),
    ],
    effects: [humility(1), opalescence(2)],
  });

  // Layer 4: Opalescence makes Humility a creature.
  assert.deepEqual(result.objects.humility.cardTypes, ['enchantment', 'creature']);
  // Layer 6: Humility, now a creature, strips every creature's abilities — its own included.
  assert.deepEqual(result.objects.humility.abilities, []);
  assert.deepEqual(result.objects.bears.abilities, []);
  // Layer 7b in timestamp order: Humility sets 1/1, then Opalescence sets mana value.
  assert.equal(pt(result, 'humility'), '4/4');
  assert.equal(pt(result, 'bears'), '1/1');

  // Opalescence excludes itself, so it is never a creature and never loses its ability.
  assert.deepEqual(result.objects.opalescence.cardTypes, ['enchantment']);
  assert.deepEqual(result.objects.opalescence.abilities, ['opalescence']);
  assert.equal(result.objects.opalescence.power, null);
});

test('Opalescence earlier than Humility: Humility wins layer 7b and everything is 1/1', () => {
  const result = computeLayers({
    objects: [
      enchantment('humility', 4, { abilities: ['humility'] }),
      enchantment('opalescence', 4, { abilities: ['opalescence'] }),
      creature('bears', 2, 2),
    ],
    effects: [opalescence(1), humility(2)],
  });

  assert.equal(pt(result, 'humility'), '1/1');
  assert.equal(pt(result, 'bears'), '1/1');
  assert.notEqual(pt(result, 'humility'), '4/4');
});

test('Humility switches off an anthem that Opalescence turned into a creature', () => {
  const result = computeLayers({
    objects: [
      enchantment('opalescence', 4, { abilities: ['opalescence'] }),
      enchantment('humility', 4, { abilities: ['humility'] }),
      enchantment('anthemSrc', 3, { name: 'Glorious Anthem', abilities: ['glorious anthem'] }),
      creature('bears', 2, 2),
    ],
    effects: [
      opalescence(1),
      humility(2),
      anthemEffect({
        id: 'anthem',
        timestamp: 3,
        sourceId: 'anthemSrc',
        fromAbility: 'glorious anthem',
        power: 1,
        toughness: 1,
      }),
    ],
  });

  // The anthem is a creature, so layer 6 took its ability; layer 7c never runs.
  assert.equal(pt(result, 'bears'), '1/1');
  assert.notEqual(pt(result, 'bears'), '2/2');
  assert.equal(pt(result, 'anthemSrc'), '1/1');

  // And it is reported, not silently dropped.
  assert.deepEqual(
    result.skipped.filter(entry => entry.effectId === 'anthem'),
    [{ effectId: 'anthem', sublayer: '7c', reason: 'ability-removed' }]
  );
});

/* ------------------------------------------------------------------ *
 * Layers 2, 4, 5, 6 and the selectors that read them
 * ------------------------------------------------------------------ */

test('control change in layer 2 is visible to a layer 7c anthem', () => {
  const objects = [
    creature('bears', 2, 2),
    enchantment('anthemSrc', 2, { abilities: ['glorious anthem'] }),
  ];
  const anthem = anthemEffect({
    id: 'anthem',
    timestamp: 2,
    sourceId: 'anthemSrc',
    fromAbility: 'glorious anthem',
    power: 1,
    toughness: 1,
  });

  const untouched = computeLayers({ objects, effects: [anthem] });
  assert.equal(pt(untouched, 'bears'), '3/3');

  const stolen = computeLayers({
    objects,
    effects: [
      controlEffect({
        id: 'threaten',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['bears'] },
        controller: 'p2',
      }),
      anthem,
    ],
  });

  assert.equal(stolen.objects.bears.controller, 'p2');
  // It is no longer a creature "you" control, so the anthem finds nothing.
  assert.equal(pt(stolen, 'bears'), '2/2');
  assert.deepEqual(
    stolen.skipped.filter(entry => entry.effectId === 'anthem'),
    [{ effectId: 'anthem', sublayer: '7c', reason: 'no-targets' }]
  );
});

test('a land turned into a creature in layer 4 is pumped by a layer 7c anthem', () => {
  const result = computeLayers({
    objects: [
      obj({ id: 'forest', name: 'Forest', cardTypes: ['land'], subtypes: ['forest'] }),
      enchantment('anthemSrc', 2, { abilities: ['glorious anthem'] }),
    ],
    effects: [
      {
        id: 'manland',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['forest'] },
        provides: ['become-creature'],
        parts: [
          { sublayer: '4a', modification: { kind: 'type', addCardTypes: ['creature'] } },
          { sublayer: '7b', modification: { kind: 'set-pt', power: 1, toughness: 1 } },
        ],
      },
      anthemEffect({
        id: 'anthem',
        timestamp: 2,
        sourceId: 'anthemSrc',
        fromAbility: 'glorious anthem',
        power: 1,
        toughness: 1,
      }),
    ],
  });

  assert.deepEqual(result.objects.forest.cardTypes, ['land', 'creature']);
  assert.equal(pt(result, 'forest'), '2/2');
});

test('colour and type changes compose, and a type change can strip subtypes', () => {
  const result = computeLayers({
    objects: [obj({ id: 'land', cardTypes: ['land'], subtypes: ['forest'], colors: [] })],
    effects: [
      typeEffect({
        id: 'moon',
        timestamp: 1,
        affects: { kind: 'match', cardTypes: ['land'] },
        setSubtypes: ['mountain'],
      }),
      colorEffect({
        id: 'blue',
        timestamp: 2,
        affects: { kind: 'match', cardTypes: ['land'] },
        setColors: ['U'],
      }),
    ],
  });

  assert.deepEqual(result.objects.land.subtypes, ['mountain']);
  assert.deepEqual(result.objects.land.colors, ['U']);
});

test('layer 3 text change rewrites a subtype word', () => {
  const result = computeLayers({
    objects: [obj({ id: 'land', cardTypes: ['land'], subtypes: ['mountain'] })],
    effects: [
      {
        id: 'mind-bend',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['land'] },
        parts: [
          {
            sublayer: '3a',
            modification: { kind: 'text-change', scope: 'subtype', from: 'Mountain', to: 'Island' },
          },
        ],
      },
    ],
  });

  assert.deepEqual(result.objects.land.subtypes, ['island']);
});

test('granting and removing abilities both work, in timestamp order', () => {
  const result = computeLayers({
    objects: [creature('c', 1, 1, { abilities: ['flying'] })],
    effects: [
      abilityEffect({
        id: 'strip',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['c'] },
        removeAll: true,
      }),
      abilityEffect({
        id: 'grant',
        timestamp: 2,
        affects: { kind: 'ids', ids: ['c'] },
        add: ['trample', 'lifelink'],
      }),
    ],
  });

  // The grant is later, so it survives the strip.
  assert.deepEqual(result.objects.c.abilities, ['trample', 'lifelink']);
});

test('a strip after a grant removes the granted ability too', () => {
  const result = computeLayers({
    objects: [creature('c', 1, 1, { abilities: ['flying'] })],
    effects: [
      abilityEffect({
        id: 'grant',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['c'] },
        add: ['trample'],
      }),
      abilityEffect({
        id: 'strip',
        timestamp: 2,
        affects: { kind: 'ids', ids: ['c'] },
        removeAll: true,
      }),
    ],
  });

  assert.deepEqual(result.objects.c.abilities, []);
});

/* ------------------------------------------------------------------ *
 * Layer 1 — copy and face-down
 * ------------------------------------------------------------------ */

test('a copy effect replaces copiable values but not counters or control', () => {
  const result = computeLayers({
    objects: [
      obj({
        id: 'clone',
        name: 'Clone',
        cardTypes: ['creature'],
        power: 0,
        toughness: 0,
        controller: 'p2',
        counters: { '+1/+1': 1 },
      }),
    ],
    effects: [
      {
        id: 'copy',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['clone'] },
        provides: ['copy'],
        parts: [
          {
            sublayer: '1a',
            modification: {
              kind: 'copy',
              values: {
                name: 'Grizzly Bears',
                cardTypes: ['creature'],
                subtypes: ['bear'],
                colors: ['G'],
                abilities: [],
                power: 2,
                toughness: 2,
                manaValue: 2,
              },
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.objects.clone.name, 'Grizzly Bears');
  assert.deepEqual(result.objects.clone.subtypes, ['bear']);
  // Counters are not copiable and still apply in 7d; control is not copiable either.
  assert.equal(pt(result, 'clone'), '3/3');
  assert.equal(result.objects.clone.controller, 'p2');
});

test('a face-down permanent is a 2/2 with no name and no abilities, counters on top', () => {
  const result = computeLayers({
    objects: [
      creature('fd', 5, 5, {
        name: 'Grizzly Bears',
        abilities: ['flying'],
        colors: ['G'],
        manaValue: 4,
        counters: { '+1/+1': 1 },
      }),
    ],
    effects: [
      {
        id: 'face-down',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['fd'] },
        parts: [{ sublayer: '1b', modification: { kind: 'face-down' } }],
      },
    ],
  });

  assert.equal(result.objects.fd.name, '');
  assert.deepEqual(result.objects.fd.abilities, []);
  assert.deepEqual(result.objects.fd.colors, []);
  assert.equal(result.objects.fd.manaValue, 0);
  assert.equal(pt(result, 'fd'), '3/3');
});

/* ------------------------------------------------------------------ *
 * CR 613.8 — dependency
 * ------------------------------------------------------------------ */

test('a declared dependency overrides timestamp order within a layer', () => {
  const objects = [creature('flyer', 2, 2, { abilities: ['flying'] })];

  const grantVigilance = abilityEffect({
    id: 'grant',
    timestamp: 2,
    affects: { kind: 'match', cardTypes: ['creature'], abilities: ['flying'] },
    add: ['vigilance'],
  });
  const removeFlying = abilityEffect({
    id: 'strip',
    timestamp: 5,
    affects: { kind: 'match', cardTypes: ['creature'] },
    remove: ['flying'],
  });

  // Timestamp order alone: the grant runs first and sticks.
  const naive = computeLayers({ objects, effects: [grantVigilance, removeFlying] });
  assert.deepEqual(naive.objects.flyer.abilities, ['vigilance']);

  // Declared dependency: the grant waits for the strip, then finds no flyers.
  const dependent = computeLayers({
    objects,
    effects: [{ ...grantVigilance, dependsOn: ['removing-ability'] }, removeFlying],
  });
  assert.deepEqual(dependent.objects.flyer.abilities, []);
});

test('an explicit dependsOnEffects edge orders one effect after another', () => {
  const ordered = orderEffectGroup([
    { id: 'a', timestamp: 1, affects: { kind: 'all' }, parts: [], dependsOnEffects: ['b'] },
    { id: 'b', timestamp: 9, affects: { kind: 'all' }, parts: [] },
  ]);

  assert.deepEqual(
    ordered.map(effect => effect.id),
    ['b', 'a']
  );
});

test('a dependency loop falls back to timestamp order (CR 613.8c)', () => {
  const ordered = orderEffectGroup([
    {
      id: 'second',
      timestamp: 2,
      affects: { kind: 'all' },
      parts: [],
      provides: ['k'],
      dependsOn: ['j'],
    },
    {
      id: 'first',
      timestamp: 1,
      affects: { kind: 'all' },
      parts: [],
      provides: ['j'],
      dependsOn: ['k'],
    },
  ]);

  assert.deepEqual(
    ordered.map(effect => effect.id),
    ['first', 'second']
  );
});

test('equal timestamps are broken by effect id, so two clients never disagree', () => {
  const ordered = orderEffectGroup([
    { id: 'zeta', timestamp: 4, affects: { kind: 'all' }, parts: [] },
    { id: 'alpha', timestamp: 4, affects: { kind: 'all' }, parts: [] },
  ]);

  assert.deepEqual(
    ordered.map(effect => effect.id),
    ['alpha', 'zeta']
  );
});

test('dependency is only considered within one sublayer', () => {
  // The layer-4 effect provides "become-creature"; the layer-7c anthem declares a
  // dependency on it. Different sublayers, so the declaration must be ignored —
  // and it is, because layer 4 has already run by the time 7c starts.
  const result = computeLayers({
    objects: [
      obj({ id: 'forest', cardTypes: ['land'] }),
      enchantment('src', 2, { abilities: ['pump'] }),
    ],
    effects: [
      anthemEffect({
        id: 'anthem',
        timestamp: 1,
        sourceId: 'src',
        fromAbility: 'pump',
        power: 1,
        toughness: 1,
        dependsOn: ['become-creature'],
      }),
      {
        id: 'manland',
        timestamp: 2,
        affects: { kind: 'ids', ids: ['forest'] },
        provides: ['become-creature'],
        parts: [
          { sublayer: '4a', modification: { kind: 'type', addCardTypes: ['creature'] } },
          { sublayer: '7b', modification: { kind: 'set-pt', power: 1, toughness: 1 } },
        ],
      },
    ],
  });

  assert.equal(pt(result, 'forest'), '2/2');
});

/* ------------------------------------------------------------------ *
 * Dynamic values
 * ------------------------------------------------------------------ */

test('a count-based anthem reads the board after earlier layers', () => {
  const result = computeLayers({
    objects: [
      creature('a', 1, 1, { subtypes: ['elf'] }),
      creature('b', 1, 1, { subtypes: ['goblin'] }),
      enchantment('lord', 2, { abilities: ['elf lord'] }),
    ],
    effects: [
      // Layer 4 first: everything you control is an Elf.
      typeEffect({
        id: 'conspiracy',
        timestamp: 1,
        affects: { kind: 'match', cardTypes: ['creature'], controller: 'you' },
        addSubtypes: ['elf'],
        sourceId: 'lord',
      }),
      anthemEffect({
        id: 'elf-lord',
        timestamp: 2,
        sourceId: 'lord',
        fromAbility: 'elf lord',
        affects: { kind: 'match', cardTypes: ['creature'], subtypes: ['elf'] },
        power: { kind: 'count', of: { kind: 'match', cardTypes: ['creature'], subtypes: ['elf'] } },
        toughness: 0,
      }),
    ],
  });

  // Both creatures are Elves by layer 7c, so both get +2/+0.
  assert.equal(pt(result, 'a'), '3/1');
  assert.equal(pt(result, 'b'), '3/1');
});

/* ------------------------------------------------------------------ *
 * Determinism and serialisability
 * ------------------------------------------------------------------ */

function scenario(effects: ContinuousEffect[]) {
  return computeLayers({
    objects: [
      enchantment('humility', 4, { abilities: ['humility'] }),
      enchantment('opalescence', 4, { abilities: ['opalescence'] }),
      enchantment('anthemSrc', 3, { abilities: ['glorious anthem'] }),
      creature('bears', 2, 2, { counters: { '+1/+1': 2 } }),
    ],
    effects,
  });
}

test('effect array order does not change the answer', () => {
  const effects = [
    humility(2),
    opalescence(1),
    anthemEffect({
      id: 'anthem',
      timestamp: 3,
      sourceId: 'anthemSrc',
      fromAbility: 'glorious anthem',
      power: 1,
      toughness: 1,
    }),
  ];

  const forward = scenario(effects);
  const reversed = scenario([...effects].reverse());

  assert.deepEqual(reversed.objects, forward.objects);
  assert.deepEqual(reversed.trace, forward.trace);
});

test('the same input twice gives byte-identical output, and the output is JSON', () => {
  const effects = [
    humility(2),
    opalescence(1),
    anthemEffect({
      id: 'anthem',
      timestamp: 3,
      sourceId: 'anthemSrc',
      fromAbility: 'glorious anthem',
      power: 1,
      toughness: 1,
    }),
  ];

  const a = scenario(effects);
  const b = scenario(effects);
  assert.equal(JSON.stringify(a.objects), JSON.stringify(b.objects));

  // Nothing here is a class instance, a Map, a Set or a function.
  assert.deepEqual(JSON.parse(JSON.stringify(a.objects)), a.objects);
});

test('computeLayers does not mutate its inputs', () => {
  const objects = [creature('bears', 2, 2, { counters: { '+1/+1': 1 } })];
  const before = JSON.stringify(objects);

  computeLayers({
    objects,
    effects: [
      setBasePTEffect({
        id: 'set',
        timestamp: 1,
        affects: { kind: 'ids', ids: ['bears'] },
        power: 7,
        toughness: 7,
      }),
    ],
  });

  assert.equal(JSON.stringify(objects), before);
});

/* ------------------------------------------------------------------ *
 * Honesty — what the engine declines is reported
 * ------------------------------------------------------------------ */

test('an effect whose source has gone is reported, never silently dropped', () => {
  const result = computeLayers({
    objects: [creature('bears', 2, 2)],
    effects: [
      anthemEffect({
        id: 'ghost',
        timestamp: 1,
        sourceId: 'not-on-the-battlefield',
        fromAbility: 'glorious anthem',
        power: 1,
        toughness: 1,
      }),
    ],
  });

  assert.equal(pt(result, 'bears'), '2/2');
  assert.deepEqual(result.skipped, [
    { effectId: 'ghost', sublayer: '7c', reason: 'source-missing' },
  ]);
});

test('an effect from a resolved spell keeps working with no source at all', () => {
  const result = computeLayers({
    objects: [creature('bears', 2, 2)],
    effects: [
      anthemEffect({
        id: 'giant-growth',
        timestamp: 1,
        controllerId: 'p1',
        affects: { kind: 'ids', ids: ['bears'] },
        power: 3,
        toughness: 3,
      }),
    ],
  });

  assert.equal(pt(result, 'bears'), '5/5');
  assert.deepEqual(result.skipped, []);
});

test('the trace names every application in order', () => {
  const result = computeLayers({
    objects: [
      enchantment('humility', 4, { abilities: ['humility'] }),
      creature('bears', 2, 2, { counters: { '+1/+1': 1 } }),
    ],
    effects: [humility(1)],
  });

  assert.deepEqual(
    result.trace.map(step => `${step.sublayer}:${step.effectId}`),
    ['6a:humility', '7b:humility', '7d:(counters)']
  );
});

/* ------------------------------------------------------------------ *
 * Bridging to CardInstance
 * ------------------------------------------------------------------ */

function cardInstance(over: Partial<CardInstance> & { instanceId: string }): CardInstance {
  return {
    cardId: over.instanceId,
    name: over.instanceId,
    ownerId: 'p1',
    controllerId: 'p1',
    zone: 'battlefield',
    tapped: false,
    faceDown: false,
    flipped: false,
    summoningSick: false,
    damage: 0,
    counters: {},
    isCommander: false,
    castCount: 0,
    isToken: false,
    removedFromGame: false,
    ...over,
  };
}

test('splitTypeLine splits supertypes, card types and subtypes', () => {
  assert.deepEqual(splitTypeLine('Legendary Creature — Human Wizard'), {
    cardTypes: ['creature'],
    supertypes: ['legendary'],
    subtypes: ['human', 'wizard'],
  });
  assert.deepEqual(splitTypeLine('Artifact Creature — Golem'), {
    cardTypes: ['artifact', 'creature'],
    supertypes: [],
    subtypes: ['golem'],
  });
  assert.deepEqual(splitTypeLine('Basic Land — Forest'), {
    cardTypes: ['land'],
    supertypes: ['basic'],
    subtypes: ['forest'],
  });
  assert.deepEqual(splitTypeLine('Enchantment'), {
    cardTypes: ['enchantment'],
    supertypes: [],
    subtypes: [],
  });
});

test('a plain card with counters matches combat.ts exactly', () => {
  const card = cardInstance({
    instanceId: 'bears',
    name: 'Grizzly Bears',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    counters: { '+1/+1': 2, '-1/-1': 1 },
    cmc: 2,
  });

  const result = computeLayers({ objects: [baseObjectFromCard(card)], effects: [] });

  assert.equal(combatPower(result.objects.bears), powerOf(card));
  assert.equal(result.objects.bears.toughness, toughnessOf(card));
  assert.equal(pt(result, 'bears'), '3/3');
});

test('a hand-set base P/T is the base value, so counters still stack on top', () => {
  const card = cardInstance({
    instanceId: 'c',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    powerOverride: 4,
    toughnessOverride: 4,
    counters: { '+1/+1': 1 },
  });

  const result = computeLayers({ objects: [baseObjectFromCard(card)], effects: [] });

  assert.equal(pt(result, 'c'), '5/5');
  assert.equal(combatPower(result.objects.c), powerOf(card));
});

test('hand-flagged keywords are real abilities to the layer system', () => {
  const card = cardInstance({
    instanceId: 'c',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    keywords: ['Flying'],
    grantedKeywords: ['trample'],
    suppressedKeywords: ['flying'],
  });

  const result = computeLayers({ objects: [baseObjectFromCard(card)], effects: [] });
  assert.deepEqual(result.objects.c.abilities, ['trample']);
});

test('an unreadable printed power is null, not a confident number', () => {
  const card = cardInstance({
    instanceId: 'goyf',
    typeLine: 'Creature — Lhurgoyf',
    power: '*',
    toughness: '1+*',
  });

  const result = computeLayers({ objects: [baseObjectFromCard(card)], effects: [] });

  // null means "we do not know", which is what the manual override is for.
  // `combat.ts` reads "1+*" as 1 through parseInt; this module deliberately does
  // not, because a confident wrong number is worse than an honest gap.
  assert.equal(result.objects.goyf.power, null);
  assert.equal(result.objects.goyf.toughness, null);
  assert.equal(layeredStatLine(result.objects.goyf), null);
  assert.equal(combatPower(result.objects.goyf), 0);
});

test('a characteristic-defining ability fills in an unreadable printed P/T', () => {
  const card = cardInstance({
    instanceId: 'goyf',
    typeLine: 'Creature — Lhurgoyf',
    power: '*',
    toughness: '1+*',
    counters: { '+1/+1': 1 },
  });

  const result = computeLayers({
    objects: [baseObjectFromCard(card)],
    effects: [
      setBasePTEffect({
        id: 'goyf-cda',
        timestamp: 1,
        sublayer: '7a',
        affects: { kind: 'self' },
        sourceId: 'goyf',
        power: 4,
        toughness: 5,
      }),
    ],
  });

  // 7a sets 4/5, then the counter applies in 7d.
  assert.equal(pt(result, 'goyf'), '5/6');
});
