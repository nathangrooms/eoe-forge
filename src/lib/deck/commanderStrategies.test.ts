/**
 * The strategies offered for a commander, tested on the complaint that caused
 * them and on the ways the rule can go wrong.
 *
 *   node --test --experimental-strip-types src/lib/deck/commanderStrategies.test.ts
 *
 * Every oracle text below is the REAL text of the REAL card. Writing it from
 * memory is how a test like this passes while the product stays broken: the
 * reading goes through the ability compiler and the tagger, and both are built
 * out of patterns over the printed words.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { strategiesFor, STRATEGY_SLOTS } from './commanderStrategies.ts';

const commander = (name: string, type_line: string, oracle_text: string) => ({
  name,
  type_line,
  oracle_text,
});

const SYR_VONDAM = commander(
  'Syr Vondam, Sunstar Exemplar',
  'Legendary Creature — Human Knight',
  'Vigilance, menace\n' +
    'Whenever another creature you control dies or is put into exile, put a +1/+1 counter on Syr Vondam and you gain 1 life.\n' +
    'When Syr Vondam dies or is put into exile while its power is 4 or greater, destroy up to one target nonland permanent.'
);

const BRAGO = commander(
  'Brago, King Eternal',
  'Legendary Creature — Spirit',
  'Flying\nWhenever Brago, King Eternal deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner’s control.'
);

const KRENKO = commander(
  'Krenko, Mob Boss',
  'Legendary Creature — Goblin Warrior',
  '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.'
);

const TALRAND = commander(
  'Talrand, Sky Summoner',
  'Legendary Creature — Merfolk Wizard',
  'Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.'
);

const labels = (c: Parameters<typeof strategiesFor>[0]) =>
  strategiesFor(c).map(o => o.label.toLowerCase());

test('the complaint: a commander paid when its creatures are exiled is offered Blink', () => {
  /*
   * The owner, 31 Aug 2026: "syr vondom benefits from cards being exhiled, but
   * strategy doesnt show a blink option". The intent rule for "creature you
   * control dies" matched first and stopped, so the second half of his own
   * trigger was never read and the offer was a pure aristocrats deck.
   */
  const offered = labels(SYR_VONDAM);
  assert.ok(offered.includes('blink'), `blink should be offered: got ${offered.join(', ')}`);
  assert.ok(offered.includes('aristocrats'), 'and the half that WAS read is still right');
});

test('the archetypal blink commander is offered Blink loudest', () => {
  const [first] = strategiesFor(BRAGO).filter(o => o.label.toLowerCase() === 'blink');
  assert.ok(first, 'Brago is the blink commander in the format');
  assert.ok(first.score >= 1, 'his own tag names it, which outranks any single facet');
});

test('a token maker is NOT offered Blink, which is the trap this nearly fell into', () => {
  /*
   * `trig:enters` is one of the commonest facets in the catalogue and the first
   * version of the blink signal included it, so Krenko and Talrand — neither of
   * whom flickers anything — were both offered a blink deck. What makes a blink
   * deck is the card LEAVING and coming back.
   */
  assert.ok(!labels(KRENKO).includes('blink'));
  assert.ok(!labels(TALRAND).includes('blink'));
});

test('each commander is read as itself', () => {
  assert.ok(labels(KRENKO).includes('tokens'));
  assert.ok(labels(TALRAND).includes('spellslinger'));
});

test('a commander whose card says nothing readable still gets a full list', () => {
  const isamaru = commander('Isamaru, Hound of Konda', 'Legendary Creature — Dog', '');
  const offered = strategiesFor(isamaru);
  assert.equal(offered.length, STRATEGY_SLOTS, 'never a short panel');
  assert.ok(
    offered.some(o => o.score === 0),
    'and the ones nobody asked for say so, at a score of zero'
  );
});

test('nothing at all still answers, rather than throwing', () => {
  assert.equal(strategiesFor(null).length, STRATEGY_SLOTS);
  assert.equal(strategiesFor(undefined).length, STRATEGY_SLOTS);
  assert.equal(strategiesFor({}).length, STRATEGY_SLOTS);
});

test('the list is stable, so the same commander never reshuffles between visits', () => {
  const once = strategiesFor(SYR_VONDAM).map(o => o.value);
  const twice = strategiesFor(SYR_VONDAM).map(o => o.value);
  assert.deepEqual(once, twice);
});

test('no shell is offered twice, and every offer resolves to a real shell', () => {
  for (const c of [SYR_VONDAM, BRAGO, KRENKO, TALRAND]) {
    const offers = strategiesFor(c);
    assert.equal(new Set(offers.map(o => o.value)).size, offers.length, `${c.name} repeats a shell`);
    for (const o of offers) {
      assert.ok(o.label && o.description && o.synergy, `${c.name}: ${o.value} is missing its copy`);
      assert.ok(o.powerLevel >= 1 && o.powerLevel <= 10, `${c.name}: ${o.value} has no sane power`);
    }
  }
});

test('the sentence is the engine explaining itself, not a template', () => {
  const blink = strategiesFor(SYR_VONDAM).find(o => o.value === 'blink');
  assert.ok(blink);
  assert.match(
    blink!.synergy,
    /exiled/i,
    'the reason shown to a player has to be the reason the engine actually had'
  );
});
