import test from 'node:test';
import assert from 'node:assert/strict';
import { facesForTemplates, faceTagsFor, type FaceCard } from './archetypeFaces.ts';
import type { ArchetypeTemplate } from '../types.ts';

/**
 * These assertions are about the RULES, not about which card is currently
 * ranked 40th on EDHREC. A test that pins "Blood Artist is the face of
 * Aristocrats" would fail the day a set is printed, and the point of computing
 * the faces rather than hand-writing them is exactly that they move.
 */

const template = (over: Partial<ArchetypeTemplate> & { id: string }): ArchetypeTemplate =>
  ({
    formats: ['commander'],
    colors: [],
    weights: { synergy: {}, roles: {} },
    quotas: { counts: {} },
    ...over,
  }) as unknown as ArchetypeTemplate;

const card = (
  name: string,
  tags: string[],
  rank: number | null,
  identity: string[] = []
): FaceCard => ({ id: name, name, tags, edhrec_rank: rank, color_identity: identity });

test('the tag list resolves the two keys the tagger does not write', () => {
  const tags = faceTagsFor([
    template({ id: 't', weights: { synergy: { anthem: 2, graveyard: 3, tokens: 1 }, roles: {} } }),
  ]);
  assert.ok(tags.includes('mass-pump'), 'anthem maps to the canonical tag');
  assert.ok(tags.includes('graveyard-recursion'), 'graveyard maps to the canonical tag');
  assert.ok(tags.includes('tokens'), 'a key that IS a tag passes through');
  assert.ok(!tags.includes('anthem'));
});

test('a card carrying more of the weighted tags outranks a more played one', () => {
  const t = template({
    id: 'aristocrats',
    weights: { synergy: { aristocrats: 4, 'sac-outlet': 4, tokens: 3 }, roles: {} },
  });
  const pool = [
    card('Popular Token Maker', ['tokens'], 10),
    card('Real Aristocrat', ['aristocrats', 'sac-outlet'], 900),
  ];
  const faces = facesForTemplates([t], pool, 2);
  assert.equal(faces.aristocrats[0].name, 'Real Aristocrat');
});

test('a template never shows a card outside its colours', () => {
  const t = template({
    id: 'burn',
    colors: ['R'],
    weights: { synergy: { spellslinger: 3 }, roles: {} },
  });
  const pool = [
    card('Blue Spellslinger', ['spellslinger'], 5, ['U']),
    card('Red Spellslinger', ['spellslinger'], 4000, ['R']),
    card('Colourless Spellslinger', ['spellslinger'], 6000, []),
  ];
  const faces = facesForTemplates([t], pool, 3);
  assert.deepEqual(
    faces.burn.map(c => c.name),
    ['Red Spellslinger', 'Colourless Spellslinger']
  );
});

test('a template with no colours declared accepts any identity', () => {
  const t = template({ id: 'any', colors: [], weights: { synergy: { ramp: 2 }, roles: {} } });
  const pool = [card('Five Colour Ramp', ['ramp'], 3, ['W', 'U', 'B', 'R', 'G'])];
  assert.equal(facesForTemplates([t], pool, 3).any.length, 1);
});

test('nothing matching gives NO cards rather than the most popular ones', () => {
  const t = template({ id: 'storm', weights: { synergy: { storm: 5 }, roles: {} } });
  const pool = [card('Sol Ring', ['ramp', 'fast-mana'], 1), card('Arcane Signet', ['ramp'], 2)];
  assert.deepEqual(facesForTemplates([t], pool, 3).storm, []);
});

test('an unranked card sorts behind a ranked one at the same score', () => {
  const t = template({ id: 't', weights: { synergy: { tokens: 2 }, roles: {} } });
  const pool = [card('Unranked', ['tokens'], null), card('Ranked', ['tokens'], 9000)];
  assert.equal(facesForTemplates([t], pool, 1).t[0].name, 'Ranked');
});

test('a card with no tags is never a face', () => {
  const t = template({ id: 't', weights: { synergy: { tokens: 2 }, roles: {} } });
  assert.deepEqual(facesForTemplates([t], [card('Vanilla', [], 1)], 3).t, []);
});

test('two archetypes that want the same tag do not draw the same cards', () => {
  const burn = template({
    id: 'burn',
    colors: ['R'],
    weights: { synergy: { spellslinger: 3, prowess: 2 }, roles: {} },
  });
  const slinger = template({
    id: 'slinger',
    colors: ['R'],
    weights: { synergy: { spellslinger: 3 }, roles: {} },
  });
  const pool = [
    card('Guttersnipe', ['spellslinger'], 1, ['R']),
    card('Firebrand Archer', ['spellslinger'], 2, ['R']),
    card('Coruscation Mage', ['spellslinger'], 3, ['R']),
    card('Fourth Slinger', ['spellslinger'], 4, ['R']),
  ];
  const faces = facesForTemplates([burn, slinger], pool, 2);
  const overlap = faces.burn.filter(c => faces.slinger.some(o => o.id === c.id));
  assert.deepEqual(overlap, [], 'no card appears on both tiles');
  assert.equal(faces.slinger.length, 2, 'the second tile is still full');
});

test('a repeat is preferred to a gap when the pool runs out', () => {
  const a = template({ id: 'a', weights: { synergy: { storm: 3 }, roles: {} } });
  const b = template({ id: 'b', weights: { synergy: { storm: 3 }, roles: {} } });
  const pool = [card('Only Storm Card', ['storm'], 1)];
  const faces = facesForTemplates([a, b], pool, 1);
  assert.equal(faces.a.length, 1);
  assert.equal(faces.b.length, 1, 'the second tile repeats rather than showing nothing');
  assert.equal(faces.b[0].name, 'Only Storm Card');
});
