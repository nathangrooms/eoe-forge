/**
 * A permission to play or cast out of the graveyard.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/play-from-graveyard.test.ts
 *
 * Muldrotha, the Gravetide was the compiler's named example of a card it could
 * not read: `planForCommander`'s own doc comment records her as the one
 * commander in four that fell back to the English reader. "You may play lands
 * from your graveyard" is said word for word by seven of the 2,000 most played
 * cards, and every one of them produced no ability record while
 * `eff:play-from-graveyard` sat in the engine's vocabulary fed by nothing.
 *
 * Oracle text below is copied from our own `cards_unique` rows. The refusal
 * tests are the load-bearing half: each names a real card whose sentence is
 * one word away from the shape and means something else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileCardAbilities } from './compiler.ts';
import type { CardFilter, Restriction, StaticAbility } from './dsl.ts';
import { assertSerialisable } from './dsl.ts';
import { parseManaValueBound, parseObject } from './grammar.ts';
import { renderModification } from './render.ts';
import { validateAbilities } from './validate.ts';

type PlayFrom = Extract<Restriction, { rule: 'may-play-from' }>;

const compile = (name: string, type_line: string, oracle_text: string) =>
  compileCardAbilities({ oracle_id: name, name, type_line, oracle_text } as never);

/** Every `may-play-from` rule on the card, with the static that carries it. */
function permissions(card: ReturnType<typeof compile>): Array<{ ability: StaticAbility; rule: PlayFrom }> {
  const out: Array<{ ability: StaticAbility; rule: PlayFrom }> = [];
  for (const ability of card.abilities) {
    if (ability.kind !== 'static') continue;
    for (const mod of ability.modifications) {
      if (mod.layer === 'restriction' && mod.rule.rule === 'may-play-from') {
        out.push({ ability, rule: mod.rule });
      }
    }
  }
  return out;
}

/** The type words a filter names, flattened, so a test can say "no land". */
function typesNamed(filter: CardFilter): string[] {
  switch (filter.is) {
    case 'type': return [filter.value];
    case 'and':
    case 'or': return filter.of.flatMap(typesNamed);
    case 'not': return typesNamed(filter.of);
    default: return [];
  }
}

const MULDROTHA = compile(
  'Muldrotha, the Gravetide',
  'Legendary Creature — Elemental Avatar',
  'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent types, choose one as you play it.)',
);

test('Muldrotha: one permission over every permanent type, one of each per turn, on your turn', () => {
  assert.equal(MULDROTHA.coverage, 'full', JSON.stringify(MULDROTHA.unparsed));
  const [only, ...rest] = permissions(MULDROTHA);
  assert.ok(only, JSON.stringify(MULDROTHA.abilities));
  assert.equal(rest.length, 0);

  assert.equal(only.rule.from, 'graveyard');
  assert.equal(only.rule.limit, 'once-per-type-per-turn');
  assert.deepEqual(only.rule.who, { who: 'you' });
  assert.equal(only.rule.what.sel, 'all');
  if (only.rule.what.sel !== 'all') return;
  assert.equal(only.rule.what.zone, 'graveyard');
  assert.deepEqual(only.rule.what.controller, { who: 'you' });

  // A land is one of the permanent types she names, so it is in the one
  // selector rather than a second half.
  const types = typesNamed(only.rule.what.where).sort();
  assert.deepEqual(types, ['artifact', 'battle', 'creature', 'enchantment', 'land', 'planeswalker']);

  // "During each of your turns" came off as the condition, not as unread text.
  assert.deepEqual(only.ability.condition, { if: 'your-turn' });

  assertSerialisable(MULDROTHA.abilities);
  const validated = validateAbilities(MULDROTHA.abilities);
  assert.ok(validated.ok, JSON.stringify(validated.errors));
});

test('Crucible of Worlds: lands, unlimited, unconditional', () => {
  const card = compile('Crucible of Worlds', 'Artifact', 'You may play lands from your graveyard.');
  assert.equal(card.coverage, 'full');
  const [only] = permissions(card);
  assert.ok(only);
  assert.deepEqual(only.rule.what.sel === 'all' && only.rule.what.where, { is: 'type', value: 'land' });
  assert.equal(only.rule.limit, undefined);
  assert.equal(only.ability.condition, undefined);
  const validated = validateAbilities(card.abilities);
  assert.ok(validated.ok, JSON.stringify(validated.errors));
});

test('Titania, Nature\'s Force: "Forests" is a land subtype, not a refusal', () => {
  const card = compile(
    'Titania, Nature\'s Force',
    'Legendary Creature — Elemental',
    'You may play Forests from your graveyard.\nWhenever a Forest you control enters, create a 5/3 green Elemental creature token.\nWhenever an Elemental you control dies, you may mill three cards.',
  );
  const [only] = permissions(card);
  assert.ok(only, JSON.stringify(card.abilities));
  assert.deepEqual(only.rule.what.sel === 'all' && only.rule.what.where, { is: 'subtype', value: 'forest' });
});

test('Karador: "once during each of your turns" is a limit AND a condition', () => {
  const card = compile(
    'Karador, Ghost Chieftain',
    'Legendary Creature — Centaur Spirit',
    'This spell costs {1} less to cast for each creature card in your graveyard.\nOnce during each of your turns, you may cast a creature spell from your graveyard.',
  );
  assert.equal(card.coverage, 'full', JSON.stringify(card.unparsed));
  const [only] = permissions(card);
  assert.ok(only);
  assert.equal(only.rule.limit, 'once-per-turn');
  assert.deepEqual(only.ability.condition, { if: 'your-turn' });
  assert.deepEqual(only.rule.what.sel === 'all' && only.rule.what.where, { is: 'type', value: 'creature' });

  // The renderer says the limit and the zone, so the round-trip check sees
  // both words the card printed.
  const said = renderModification(only.ability.modifications[0]);
  assert.match(said, /once during each of your turns/);
  assert.match(said, /graveyard/);
});

test('Lurrus: "a permanent spell" excludes lands, and the mana value bound is read', () => {
  const card = compile(
    'Lurrus of the Dream-Den',
    'Legendary Creature — Cat Nightmare',
    'Lifelink\nOnce during each of your turns, you may cast a permanent spell with mana value 2 or less from your graveyard.',
  );
  const [only] = permissions(card);
  assert.ok(only, JSON.stringify(card.abilities));
  assert.equal(only.rule.what.sel, 'all');
  if (only.rule.what.sel !== 'all') return;
  const where = only.rule.what.where;
  // A land is a permanent and is never a spell (CR 305.1).
  assert.ok(!typesNamed(where).includes('land'), JSON.stringify(where));
  assert.ok(typesNamed(where).includes('creature'), JSON.stringify(where));
  assert.equal(where.is, 'and');
  if (where.is !== 'and') return;
  assert.ok(
    where.of.some(f => f.is === 'mana-value' && f.cmp === 'lte' && f.value === 2),
    JSON.stringify(where),
  );
});

test('Rivaz of the Claw: an adjective and a type in front of "spell"', () => {
  const card = compile(
    'Rivaz of the Claw',
    'Legendary Creature — Lizard Warlock',
    'Once during each of your turns, you may cast a Dragon creature spell from your graveyard.',
  );
  const [only] = permissions(card);
  assert.ok(only, JSON.stringify(card.abilities));
  assert.deepEqual(only.rule.what.sel === 'all' && only.rule.what.where, {
    is: 'and',
    of: [{ is: 'subtype', value: 'dragon' }, { is: 'type', value: 'creature' }],
  });
});

/* ------------------------------------------------------------------ *
 * Refusals. Each of these is one word from the shape and means something else.
 * ------------------------------------------------------------------ */

test('Gravecrawler casting ITSELF is an alternative cost, not a permission', () => {
  const card = compile(
    'Gravecrawler',
    'Creature — Zombie',
    'This creature can\'t block.\nYou may cast this card from your graveyard as long as you control a Zombie.',
  );
  assert.equal(permissions(card).length, 0, JSON.stringify(card.abilities));
  assert.ok(card.unparsed.some(u => /cast this card from your graveyard/i.test(u.text)), JSON.stringify(card.unparsed));
});

test('Kess: the second sentence is half the card, so the paragraph is refused whole', () => {
  const card = compile(
    'Kess, Dissident Mage',
    'Legendary Creature — Human Wizard',
    'Flying\nOnce during each of your turns, you may cast an instant or sorcery spell from your graveyard. If a spell cast this way would be put into your graveyard, exile it instead.',
  );
  assert.equal(permissions(card).length, 0, JSON.stringify(card.abilities));
  assert.equal(card.coverage, 'partial');
});

test('Exploration Broodship: an added cost on the permission is refused', () => {
  const card = compile(
    'Exploration Broodship',
    'Artifact — Spacecraft',
    'Once during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs.',
  );
  assert.equal(permissions(card).length, 0, JSON.stringify(card.abilities));
});

test('Serra Paragon: two permissions and a granted ability in one sentence are refused', () => {
  const card = compile(
    'Serra Paragon',
    'Creature — Angel',
    'Flying\nOnce during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."',
  );
  assert.equal(permissions(card).length, 0, JSON.stringify(card.abilities));
});

/* ------------------------------------------------------------------ *
 * The mana value bound is a grammar change, so it is pinned on its own.
 * ------------------------------------------------------------------ */

test('parseObject reads "with mana value N or less" as a bound, and refuses a bound on a sum', () => {
  const ref = parseObject('creature card with mana value 3 or less');
  assert.ok(ref, 'refused');
  assert.deepEqual(ref.filter, {
    is: 'and',
    of: [{ is: 'type', value: 'creature' }, { is: 'mana-value', cmp: 'lte', value: 3 }],
  });
  assert.equal(ref.isCard, true);

  assert.deepEqual(parseManaValueBound('mana value 4 or greater'), { is: 'mana-value', cmp: 'gte', value: 4 });
  assert.deepEqual(parseManaValueBound('mana value x or less'), { is: 'mana-value', cmp: 'lte', value: { v: 'x' } });

  // "Total mana value 6 or less" (Invoke Calamity) bounds a SUM over several
  // cards, which no filter on one card can say.
  assert.equal(parseObject('instant card with total mana value 6 or less'), null);
  // A comparison against a computed value stays refused rather than rounded.
  assert.equal(parseManaValueBound('mana value less than or equal to the power of ~'), null);
});
