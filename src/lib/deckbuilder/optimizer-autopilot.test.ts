/**
 * The auto optimise plan: the order, the three budgets, and the receipt.
 *
 *   node --test --experimental-strip-types src/lib/deckbuilder/optimizer-autopilot.test.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * One button that rewrites fifteen cards of somebody's deck is the highest
 * consequence control in the optimiser, and almost all of the risk is in the
 * counting rather than in the writing. Three cases in particular would each
 * hand a player a deck that will not save, and none of them is visible by
 * reading the component:
 *
 *   - Cutting on a deck that is already at 100. The Cut tab is populated for a
 *     legal sized deck on purpose, so "apply everything" has to know that a
 *     suggestion is not a permission.
 *   - Adding more cards than there are empty slots.
 *   - Adding lands into slots the split says belong to spells, or the reverse.
 *
 * The receipt half is tested separately because it is a measurement of the
 * decklist rather than a restatement of the plan, and the whole reason it
 * exists is the case where the two disagree.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  diffDecks,
  diffSummary,
  displayNames,
  missedByPlan,
  planAutoOptimise,
  planSummary,
  tallyDeck,
  type AutoPhaseKind,
  type AutoPlanInput,
} from './optimizer-autopilot.ts';

/** A plan input with nothing in it, so each test states only what it is about. */
function input(over: Partial<AutoPlanInput> = {}): AutoPlanInput {
  return {
    landSwaps: [],
    cardSwaps: [],
    cuts: [],
    landAdds: [],
    spellAdds: [],
    sizeBefore: 100,
    requiredSize: 100,
    landSlots: null,
    spellSlots: null,
    hasBasicFiller: false,
    ...over,
  };
}

const kinds = (plan: ReturnType<typeof planAutoOptimise>): AutoPhaseKind[] =>
  plan.phases.map(p => p.kind);

const phase = (plan: ReturnType<typeof planAutoOptimise>, kind: AutoPhaseKind) =>
  plan.phases.find(p => p.kind === kind);

const names = (plan: ReturnType<typeof planAutoOptimise>, kind: AutoPhaseKind) =>
  (phase(plan, kind)?.items ?? []).map(i => i.in ?? i.out);

describe('the order', () => {
  it('puts lands before spells and cuts before adds', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 96,
        landSwaps: [{ out: 'Rogue\'s Passage', in: 'Command Tower', priority: 'high' }],
        cardSwaps: [{ out: 'Wall of Wood', in: 'Sol Ring', priority: 'high' }],
        landAdds: [{ name: 'Exotic Orchard', priority: 'high' }],
        spellAdds: [{ name: 'Rhystic Study', priority: 'high' }],
        landSlots: 2,
        spellSlots: 2,
      })
    );

    assert.deepEqual(kinds(plan), ['landSwaps', 'cardSwaps', 'landAdds', 'spellAdds']);
  });

  it('runs cuts before either kind of addition', () => {
    // Contrived: a deck that is over its limit has no empty slots, so this can
    // only happen when the counts disagree. The order still has to be right,
    // because a cut that runs after an add needs a slot that is not there.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 102,
        cuts: [
          { name: 'Ornithopter', priority: 'high', isLand: false },
          { name: 'Wall of Wood', priority: 'high', isLand: false },
        ],
        cardSwaps: [{ out: 'Shivan Dragon', in: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.deepEqual(kinds(plan), ['cardSwaps', 'cuts']);
    assert.equal(plan.sizeAfter, 100);
  });
});

describe('the cut budget', () => {
  it('cuts nothing from a deck that is already the right size', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        cuts: [
          { name: 'Ornithopter', priority: 'high', isLand: false },
          { name: 'Wall of Wood', priority: 'medium', isLand: false },
        ],
      })
    );

    assert.equal(phase(plan, 'cuts'), undefined);
    assert.equal(plan.sizeAfter, 100);
    assert.match(plan.heldBack[0], /Nothing is cut/);
    assert.match(plan.heldBack[0], /already at 100 cards/);
  });

  it('cuts exactly the excess and no more', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 103,
        cuts: [
          { name: 'Ornithopter', priority: 'low', isLand: false },
          { name: 'Wall of Wood', priority: 'high', isLand: false },
          { name: 'Shivan Dragon', priority: 'medium', isLand: false },
          { name: 'Grey Ogre', priority: 'high', isLand: false },
        ],
      })
    );

    assert.equal(phase(plan, 'cuts')!.items.length, 3);
    assert.equal(plan.sizeAfter, 100);
    assert.match(plan.heldBack[0], /1 further cut suggestion stays on the Cut tab/);
  });

  it('cuts the worst first and leaves lands for last', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 102,
        cuts: [
          { name: 'Zhalfirin Void', priority: 'high', isLand: true },
          { name: 'Ornithopter', priority: 'high', isLand: false },
          { name: 'Wall of Wood', priority: 'low', isLand: false },
        ],
      })
    );

    // Same priority, so the land goes second; the low priority spell does not
    // make the budget at all.
    assert.deepEqual(names(plan, 'cuts'), ['Ornithopter', 'Zhalfirin Void']);
  });
});

describe('the add budgets', () => {
  it('never puts more cards in than there are empty slots', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 97,
        landSlots: null,
        spellSlots: null,
        spellAdds: [
          { name: 'Sol Ring', priority: 'high' },
          { name: 'Rhystic Study', priority: 'high' },
          { name: 'Cyclonic Rift', priority: 'high' },
          { name: 'Smothering Tithe', priority: 'high' },
          { name: 'Mystic Remora', priority: 'high' },
        ],
      })
    );

    assert.equal(phase(plan, 'spellAdds')!.items.length, 3);
    assert.equal(plan.sizeAfter, 100);
    assert.equal(plan.slotsLeft, 0);
  });

  it('honours the split the edge function counted', () => {
    // The real case from the land parity session: 12 short, 9 lands short.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 88,
        landSlots: 9,
        spellSlots: 3,
        landAdds: Array.from({ length: 12 }, (_, i) => ({
          name: `Land ${i}`,
          priority: 'high' as const,
        })),
        spellAdds: Array.from({ length: 8 }, (_, i) => ({
          name: `Spell ${i}`,
          priority: 'high' as const,
        })),
      })
    );

    assert.equal(phase(plan, 'landAdds')!.items.length, 9);
    assert.equal(phase(plan, 'spellAdds')!.items.length, 3);
    assert.equal(plan.sizeAfter, 100);
  });

  it('gives the spells what the lands did not use', () => {
    // 12 short, the split says 9 lands, but only 4 lands were recommended.
    // The other 5 land slots are basics, which this button never adds, so the
    // spells still get exactly the 3 the split gave them and 5 stay empty.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 88,
        landSlots: 9,
        spellSlots: 3,
        hasBasicFiller: true,
        landAdds: Array.from({ length: 4 }, (_, i) => ({
          name: `Land ${i}`,
          priority: 'high' as const,
        })),
        spellAdds: Array.from({ length: 8 }, (_, i) => ({
          name: `Spell ${i}`,
          priority: 'high' as const,
        })),
      })
    );

    assert.equal(phase(plan, 'landAdds')!.items.length, 4);
    assert.equal(phase(plan, 'spellAdds')!.items.length, 3);
    assert.equal(plan.sizeAfter, 95);
    assert.equal(plan.slotsLeft, 5);
    assert.ok(plan.heldBack.some(h => /5 slots are still empty after this/.test(h)));
    assert.ok(plan.heldBack.some(h => /Basic lands/.test(h)));
  });

  it('adds nothing to a deck with no empty slots', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        landAdds: [{ name: 'Command Tower', priority: 'high' }],
        spellAdds: [{ name: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.equal(phase(plan, 'landAdds'), undefined);
    assert.equal(phase(plan, 'spellAdds'), undefined);
    assert.equal(plan.sizeAfter, 100);
    assert.ok(plan.heldBack.some(h => /no empty slot for one/.test(h)));
    assert.ok(plan.heldBack.some(h => /Every empty slot this deck has is spoken for/.test(h)));
  });

  it('takes the highest priority additions first', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 98,
        spellAdds: [
          { name: 'Grey Ogre', priority: 'low' },
          { name: 'Sol Ring', priority: 'high' },
          { name: 'Rhystic Study', priority: 'medium' },
        ],
      })
    );

    assert.deepEqual(names(plan, 'spellAdds'), ['Sol Ring', 'Rhystic Study']);
  });
});

describe('one move per card', () => {
  it('does not cut a card a swap is already trading out', () => {
    // Real, not hypothetical. The edge function dedupes each section against
    // itself and not against the others: seenCut, seenRepCut and seenLandCut
    // are three separate sets. Applied one at a time this is harmless. Applied
    // as one list the deck page finds the card in both rows, because it looks
    // it up in a decklist captured before the list started, and takes two
    // copies out of a deck that has one.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 101,
        cardSwaps: [{ out: 'Wall of Wood', in: 'Sol Ring', priority: 'high' }],
        cuts: [{ name: 'Wall of Wood', priority: 'high', isLand: false }],
      })
    );

    assert.equal(phase(plan, 'cuts'), undefined);
    assert.equal(plan.cardsOut, 1);
    assert.ok(plan.heldBack.some(h => /already being moved by an earlier step/.test(h)));
  });

  it('does not cut a land a land trade is already taking out', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 101,
        landSwaps: [{ out: 'Zhalfirin Void', in: 'Command Tower', priority: 'high' }],
        cuts: [
          { name: 'Zhalfirin Void', priority: 'high', isLand: true },
          { name: 'Ornithopter', priority: 'low', isLand: false },
        ],
      })
    );

    assert.deepEqual(names(plan, 'cuts'), ['Ornithopter']);
    assert.equal(plan.sizeAfter, 100);
  });

  it('breaks a chain rather than removing a card that was never there', () => {
    // A for B, then B for C. The second trade would take out a card the first
    // one had only just put in, and the deck page cannot see that: it reads
    // the decklist as it was before the list started, finds no B, removes
    // nothing and adds C anyway. The deck ends one card up.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        cardSwaps: [
          { out: 'Grey Ogre', in: 'Sol Ring', priority: 'high' },
          { out: 'Sol Ring', in: 'Mana Crypt', priority: 'high' },
        ],
      })
    );

    assert.deepEqual(names(plan, 'cardSwaps'), ['Sol Ring']);
    assert.equal(plan.sizeAfter, 100);
  });

  it('does not add a card that is also being cut', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        cuts: [{ name: 'Sol Ring', priority: 'high', isLand: false }],
        spellAdds: [{ name: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.equal(plan.moves, 0);
  });

  it('does not add the same land twice from two lists', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 98,
        landAdds: [{ name: 'Command Tower', priority: 'high' }],
        spellAdds: [{ name: 'Command Tower', priority: 'high' }],
        landSlots: 1,
        spellSlots: 1,
      })
    );

    assert.deepEqual(names(plan, 'landAdds'), ['Command Tower']);
    assert.equal(phase(plan, 'spellAdds'), undefined);
    assert.equal(plan.sizeAfter, 99);
  });

  it('lets the earlier phase win, which means lands', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        landSwaps: [{ out: 'Ancient Tomb', in: 'Command Tower', priority: 'low' }],
        cardSwaps: [{ out: 'Ancient Tomb', in: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.deepEqual(names(plan, 'landSwaps'), ['Command Tower']);
    assert.equal(phase(plan, 'cardSwaps'), undefined);
  });
});

describe('the indexes point back at the right rows', () => {
  it('keeps the source position through the priority sort', () => {
    const spellAdds = [
      { name: 'Grey Ogre', priority: 'low' as const },
      { name: 'Sol Ring', priority: 'high' as const },
      { name: 'Rhystic Study', priority: 'medium' as const },
    ];
    const plan = planAutoOptimise(input({ sizeBefore: 97, spellAdds }));

    for (const item of phase(plan, 'spellAdds')!.items) {
      assert.equal(spellAdds[item.index].name, item.in);
    }
  });
});

describe('trades are size neutral', () => {
  it('leaves the deck exactly where it was', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        landSwaps: [
          { out: 'Rogue\'s Passage', in: 'Command Tower', priority: 'high' },
          { out: 'Zoetic Cavern', in: 'Exotic Orchard', priority: 'medium' },
        ],
        cardSwaps: [{ out: 'Wall of Wood', in: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.equal(plan.sizeAfter, 100);
    assert.equal(plan.cardsIn, 3);
    assert.equal(plan.cardsOut, 3);
    assert.equal(plan.moves, 3);
    assert.match(planSummary(plan), /3 cards traded\. Your deck stays at 100 cards\./);
  });
});

describe('an empty pass', () => {
  it('has no phases and says so', () => {
    const plan = planAutoOptimise(input());
    assert.equal(plan.moves, 0);
    assert.deepEqual(plan.phases, []);
    assert.equal(planSummary(plan), 'There is nothing to apply.');
  });
});

describe('the summary line', () => {
  it('counts trades, cuts and adds separately', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 99,
        landSwaps: [{ out: 'Zoetic Cavern', in: 'Command Tower', priority: 'high' }],
        spellAdds: [{ name: 'Sol Ring', priority: 'high' }],
      })
    );

    assert.equal(
      planSummary(plan),
      '1 card traded and 1 card added. Your deck goes from 99 to 100 cards.'
    );
  });
});

/* ------------------------------------------------------------------ *
 * The receipt
 * ------------------------------------------------------------------ */

describe('diffing the decklist', () => {
  it('reports what moved, by quantity', () => {
    const before = tallyDeck([
      { name: 'Forest', quantity: 8 },
      { name: 'Wall of Wood' },
      { name: 'Command Tower' },
    ]);
    const after = tallyDeck([
      { name: 'Forest', quantity: 6 },
      { name: 'Sol Ring' },
      { name: 'Command Tower' },
    ]);
    const diff = diffDecks(
      before,
      after,
      displayNames([{ name: 'Forest' }, { name: 'Wall of Wood' }, { name: 'Sol Ring' }])
    );

    assert.deepEqual(diff.gained, [{ name: 'Sol Ring', delta: 1 }]);
    assert.deepEqual(diff.lost, [
      { name: 'Forest', delta: -2 },
      { name: 'Wall of Wood', delta: -1 },
    ]);
    assert.equal(diff.added, 1);
    assert.equal(diff.removed, 3);
    assert.equal(diff.sizeBefore, 10);
    assert.equal(diff.sizeAfter, 8);
  });

  it('matches names case insensitively', () => {
    const diff = diffDecks(
      tallyDeck([{ name: 'Sol Ring' }]),
      tallyDeck([{ name: 'sol ring' }]),
      displayNames([{ name: 'Sol Ring' }])
    );
    assert.deepEqual(diff.gained, []);
    assert.deepEqual(diff.lost, []);
    assert.equal(diffSummary(diff), 'Nothing in the deck changed.');
  });

  it('says nothing changed when nothing did', () => {
    const same = tallyDeck([{ name: 'Sol Ring' }]);
    assert.equal(diffSummary(diffDecks(same, same, new Map())), 'Nothing in the deck changed.');
  });
});

describe('what the plan asked for and the deck did not do', () => {
  it('names an addition the deck refused', () => {
    // The real case: handleAddCardToDeck refuses a card outside the
    // commander's colour identity and returns false, and the panel is told
    // nothing. Without this, the receipt would report an add that never landed.
    const plan = planAutoOptimise(
      input({
        sizeBefore: 98,
        spellAdds: [
          { name: 'Sol Ring', priority: 'high' },
          { name: 'Lightning Bolt', priority: 'high' },
        ],
      })
    );

    const diff = diffDecks(
      tallyDeck([{ name: 'Island' }]),
      tallyDeck([{ name: 'Island' }, { name: 'Sol Ring' }]),
      displayNames([{ name: 'Sol Ring' }, { name: 'Lightning Bolt' }])
    );

    assert.deepEqual(missedByPlan(plan, diff), ['Lightning Bolt']);
  });

  it('names both halves of a trade that did not happen', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        cardSwaps: [{ out: 'Wall of Wood', in: 'Sol Ring', priority: 'high' }],
      })
    );
    const same = tallyDeck([{ name: 'Wall of Wood' }]);

    assert.deepEqual(missedByPlan(plan, diffDecks(same, same, new Map())), [
      'Sol Ring',
      'Wall of Wood',
    ]);
  });

  it('is empty when the deck did exactly what was asked', () => {
    const plan = planAutoOptimise(
      input({
        sizeBefore: 100,
        cardSwaps: [{ out: 'Wall of Wood', in: 'Sol Ring', priority: 'high' }],
      })
    );
    const diff = diffDecks(
      tallyDeck([{ name: 'Wall of Wood' }]),
      tallyDeck([{ name: 'Sol Ring' }]),
      displayNames([{ name: 'Wall of Wood' }, { name: 'Sol Ring' }])
    );

    assert.deepEqual(missedByPlan(plan, diff), []);
  });
});
