/**
 * What the deck page suggests has to come from the deck.
 *
 * The Analysis tab prints these under the heading "Derived from the mechanics
 * above rather than guessed". On a four colour proliferate deck holding six
 * artifacts and none of affinity, metalcraft or improvise, it printed:
 *
 *   Strengthen Artifacts strategy · cards with affinity · cards with metalcraft
 *   Remove inconsistent one-offs · first strike · heal
 *
 * Two faults. The archetype was decided by card types and average mana value,
 * which describe almost every Commander deck, so a deck sharing NONE of an
 * archetype's key mechanics could still be labelled with it. And the `cards`
 * list, which the panel prints where a reader expects card names, held keyword
 * names instead, so it told somebody to remove "first strike".
 *
 * The deck page needs an account, so this runs the analyser directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SynergyEngine } from './synergy.ts';

function card(name: string, type_line: string, oracle_text = '', cmc = 3) {
  return {
    id: name,
    name,
    type_line,
    oracle_text,
    mana_cost: '{2}{G}',
    cmc,
    colors: ['G'],
    color_identity: ['G'],
    keywords: [],
    legalities: { commander: 'legal' },
    rarity: 'common',
    quantity: 1,
  } as never;
}

/** A counters deck. Six artifacts, and nothing artifact-synergy about them. */
function counterDeck() {
  const deck = [
    card('Atraxa, Praetors Voice', 'Legendary Creature — Angel Horror',
      'At the beginning of your end step, proliferate.', 4),
  ];
  for (let i = 0; i < 6; i++) {
    deck.push(card(`Mana Rock ${i}`, 'Artifact', '{T}: Add one mana of any colour.', 2));
  }
  for (let i = 0; i < 20; i++) {
    deck.push(
      card(`Counter Payoff ${i}`, 'Creature — Elf',
        'Put a +1/+1 counter on target creature. Proliferate.', 3)
    );
  }
  return deck;
}

describe('what it suggests comes from the deck', () => {
  it('does not call a counters deck an Artifacts deck', () => {
    const analysis = SynergyEngine.analyze(counterDeck(), 'commander');
    const artifacts = analysis.archetypeMatches.find(m => m.name === 'Artifacts');
    assert.equal(
      artifacts,
      undefined,
      'a deck with none of affinity, metalcraft or improvise was matched to Artifacts ' +
        'on card types and mana value alone'
    );
  });

  it('an archetype it does match shares at least one of its key mechanics', () => {
    const analysis = SynergyEngine.analyze(counterDeck(), 'commander');
    for (const match of analysis.archetypeMatches) {
      assert.ok(
        match.keyCards.length > 0,
        `matched "${match.name}" with no key mechanic present at all, which is the ` +
          `exact shape that produced the Artifacts advice`
      );
    }
  });

  it('never presents a mechanic name where a card name belongs', () => {
    const analysis = SynergyEngine.analyze(counterDeck(), 'commander');
    /* These are keyword and mechanic names. If one appears on its own in a
       `cards` list, the panel prints it as though it were a card. */
    const bareMechanics = new Set([
      'affinity', 'metalcraft', 'improvise', 'first strike', 'heal', 'flying',
      'proliferate', 'artifact', 'ramp',
    ]);
    for (const suggestion of analysis.improvementSuggestions) {
      for (const entry of suggestion.cards) {
        assert.equal(
          bareMechanics.has(entry.toLowerCase().trim()),
          false,
          `"${entry}" is a mechanic, and it is printed where a reader expects a card`
        );
      }
    }
  });

  it('but a deck that IS an artifact deck still matches', () => {
    /* The guard must not make the tab go blank. A deck with real artifact
       synergy, not just artifacts in it, still reads as one. */
    const deck = [card('Commander', 'Legendary Creature — Artificer', 'Affinity for artifacts.', 4)];
    for (let i = 0; i < 12; i++) {
      deck.push(card(`Affinity Thing ${i}`, 'Artifact Creature — Construct', 'Affinity for artifacts.', 4));
    }
    for (let i = 0; i < 8; i++) {
      deck.push(card(`Metal ${i}`, 'Artifact', 'Metalcraft — As long as you control three or more artifacts…', 2));
    }
    const analysis = SynergyEngine.analyze(deck, 'commander');
    assert.ok(
      analysis.archetypeMatches.some(m => m.name === 'Artifacts'),
      'a deck full of affinity and metalcraft is no longer recognised as an artifact deck'
    );
  });

  it('every suggestion says something a reader can act on', () => {
    const analysis = SynergyEngine.analyze(counterDeck(), 'commander');
    for (const suggestion of analysis.improvementSuggestions) {
      assert.ok(suggestion.reason.trim().length > 10, `thin reason: "${suggestion.reason}"`);
      /* No em-dashes in anything a player reads. */
      assert.equal(
        /\u2014/.test(suggestion.reason + suggestion.cards.join(' ')),
        false,
        `em-dash in user-facing copy: ${suggestion.reason}`
      );
    }
  });
});
