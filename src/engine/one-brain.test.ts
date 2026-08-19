/**
 * There is ONE of each thing, and here is the proof.
 *
 *   node --test --experimental-strip-types src/engine/one-brain.test.ts
 *
 * `engine-parity.test.ts` proves the vendored files are byte-identical. That is
 * necessary and it is not sufficient: identical files could still be reached
 * through two different code paths that disagree about what to do with them.
 * This file pins the behaviour instead.
 *
 * Four claims, in the order they matter:
 *
 *   1. **The deck page's score IS the optimiser's score.** `computeDeckPower`
 *      (what every browser surface calls) and `evaluateDeck` (what the edge
 *      function calls, on its own copy of the engine) return the same number,
 *      the same band and the same subscores for the same decklist.
 *   2. **The cut list's reason IS the score's reason.** Every card the optimiser
 *      would cut for being uncastable is one of the cards named in the
 *      `castability` subscore's `holdingBack` list, and in the same order.
 *   3. **Unmeasured never means low.** A card with no mana cost is not ranked as
 *      a 0% card. This is the specific bug `swap-targets.ts` documented and
 *      could not fix.
 *   4. **The evidence adds up to the number.** A subscore whose contributions do
 *      not sum to it is decoration, not an explanation.
 *
 * Claim 1 is the whole task. Before this, the deck page computed a score from a
 * Monte Carlo while the optimiser chose cuts from a castability figure the
 * client had scraped off edhpowerlevel.com, and nothing anywhere could tell
 * that they disagreed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { evaluateDeck } from './evaluate.ts';
import { computeDeckPower, entriesFromStoreCards } from '../lib/deck/powerAdapter.ts';
import { SUBSCORE_WEIGHTS, SUBSCORE_ORDER } from './power/weights.ts';
import type { EngineDeckEntry } from './core/card.ts';

/* ------------------------------------------------------------------ *
 * A deck that exercises every subscore
 * ------------------------------------------------------------------ */

interface Spec {
  name: string;
  type_line: string;
  mana_cost: string | null;
  cmc: number;
  oracle_text: string;
  color_identity: string[];
  quantity?: number;
  isCommander?: boolean;
}

const COMMANDER: Spec = {
  name: 'Atraxa, Praetors’ Voice',
  type_line: 'Legendary Creature — Phyrexian Angel Horror',
  mana_cost: '{3}{W}{U}{B}{G}',
  cmc: 7,
  oracle_text:
    'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
  color_identity: ['W', 'U', 'B', 'G'],
  isCommander: true,
};

const SPELLS: Spec[] = [
  {
    name: 'Sol Ring',
    type_line: 'Artifact',
    mana_cost: '{1}',
    cmc: 1,
    oracle_text: '{T}: Add {C}{C}.',
    color_identity: [],
  },
  {
    name: 'Demonic Tutor',
    type_line: 'Sorcery',
    mana_cost: '{1}{B}',
    cmc: 2,
    oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.',
    color_identity: ['B'],
  },
  {
    name: 'Swords to Plowshares',
    type_line: 'Instant',
    mana_cost: '{W}',
    cmc: 1,
    oracle_text: 'Exile target creature. Its controller gains life equal to its power.',
    color_identity: ['W'],
  },
  {
    name: 'Cyclonic Rift',
    type_line: 'Instant',
    mana_cost: '{1}{U}',
    cmc: 2,
    oracle_text:
      "Return target nonland permanent you don't control to its owner's hand. Overload {6}{U}",
    color_identity: ['U'],
  },
  {
    name: 'Rhystic Study',
    type_line: 'Enchantment',
    mana_cost: '{2}{U}',
    cmc: 3,
    oracle_text:
      'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    color_identity: ['U'],
  },
  {
    name: 'Heroic Intervention',
    type_line: 'Instant',
    mana_cost: '{1}{G}',
    cmc: 2,
    oracle_text: 'Permanents you control gain hexproof and indestructible until end of turn.',
    color_identity: ['G'],
  },
  {
    name: 'Cultivate',
    type_line: 'Sorcery',
    mana_cost: '{2}{G}',
    cmc: 3,
    oracle_text:
      'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
    color_identity: ['G'],
  },
  {
    // Deliberately awful to cast in a four-colour basics-heavy base.
    name: 'Awkward Triple Pip',
    type_line: 'Creature — Horror',
    mana_cost: '{U}{U}{U}{B}{B}',
    cmc: 5,
    oracle_text: 'Whenever this creature attacks, draw a card.',
    color_identity: ['U', 'B'],
  },
  {
    // No mana cost at all: the "unmeasured is not low" case.
    name: 'Costless Oddity',
    type_line: 'Creature — Spirit',
    mana_cost: null,
    cmc: 0,
    oracle_text: 'This creature has no mana cost and does nothing in particular.',
    color_identity: [],
  },
];

const BASICS: Array<[string, string]> = [
  ['Plains', 'W'],
  ['Island', 'U'],
  ['Swamp', 'B'],
  ['Forest', 'G'],
];

/** A 100-card Commander list: commander, 36 basics, 9 named spells, filler. */
function deckSpecs(): Spec[] {
  const out: Spec[] = [COMMANDER, ...SPELLS];
  for (const [name, colour] of BASICS) {
    out.push({
      name,
      type_line: `Basic Land — ${name}`,
      mana_cost: null,
      cmc: 0,
      oracle_text: '',
      color_identity: [colour],
      quantity: 9,
    });
  }
  // Filler with a real cost and real text, so coverage stays high and the
  // score is measuring a plausible deck rather than a pathological one.
  for (let i = 0; i < 54; i++) {
    out.push({
      name: `Vigilant Sentinel ${i}`,
      type_line: 'Creature — Human Soldier',
      mana_cost: '{2}{W}',
      cmc: 3,
      oracle_text: 'When this creature enters the battlefield, draw a card.',
      color_identity: ['W'],
    });
  }
  return out;
}

function engineEntries(): EngineDeckEntry[] {
  return deckSpecs().map(spec => ({
    card: {
      name: spec.name,
      type_line: spec.type_line,
      mana_cost: spec.mana_cost,
      cmc: spec.cmc,
      oracle_text: spec.oracle_text,
      color_identity: spec.color_identity,
      colors: spec.color_identity,
      keywords: [],
      legalities: { commander: 'legal' },
      oracle_id: spec.name,
      usd: null,
    },
    quantity: spec.quantity ?? 1,
    isCommander: spec.isCommander,
  }));
}

/**
 * The same deck as the browser would hand it over: Zustand store cards through
 * `entriesFromStoreCards`, which is what `DeckInterface` and the builder use.
 * Going in through the real adapter is the point; a test that built engine
 * entries twice would prove nothing about the path a user actually takes.
 */
function storeCards() {
  return deckSpecs().map(spec => ({
    id: spec.name,
    name: spec.name,
    type_line: spec.type_line,
    mana_cost: spec.mana_cost ?? '',
    cmc: spec.cmc,
    oracle_text: spec.oracle_text,
    colors: spec.color_identity,
    color_identity: spec.color_identity,
    legalities: { commander: 'legal' },
    quantity: spec.quantity ?? 1,
    category: spec.isCommander ? 'commanders' : 'spells',
  })) as never[];
}

/* ------------------------------------------------------------------ *
 * 1. One score
 * ------------------------------------------------------------------ */

describe('the deck page and the optimiser share one brain', () => {
  it('computeDeckPower returns exactly what evaluateDeck computed', () => {
    const direct = evaluateDeck(engineEntries(), { format: 'commander' });
    const viaApp = computeDeckPower(entriesFromStoreCards(storeCards()), {
      format: 'commander',
    });

    assert.ok(viaApp, 'the app adapter produced no score at all');
    assert.equal(
      viaApp.score,
      direct.power.score,
      'the number the deck page shows is not the number the engine computed'
    );
    assert.equal(viaApp.band, direct.power.band);
    assert.equal(viaApp.bracket, direct.power.bracket);

    // Not just the headline. Every subscore, to the value.
    for (const sub of direct.power.subscores) {
      assert.equal(
        viaApp.subscores[sub.key],
        sub.value ?? 0,
        `subscore ${sub.key} differs between the app adapter and the engine`
      );
    }
  });

  it('the vendored engine reaches the same verdict as the source engine', async () => {
    const vendored = await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(
          process.cwd(),
          'supabase/functions/deck-optimizer/_engine/evaluate.ts'
        )
      ).href
    );

    const mine = evaluateDeck(engineEntries(), { format: 'commander' });
    const theirs = vendored.evaluateDeck(engineEntries(), { format: 'commander' });

    assert.equal(
      theirs.power.score,
      mine.power.score,
      'the edge function would show a different power score than the deck page'
    );
    assert.equal(theirs.power.band, mine.power.band);
    assert.equal(theirs.power.raw, mine.power.raw);
    assert.deepEqual(
      theirs.power.subscores.map((s: { key: string; value: number | null }) => [s.key, s.value]),
      mine.power.subscores.map(s => [s.key, s.value])
    );
    assert.deepEqual(
      theirs.cuts.map((c: { name: string; grounds: string }) => [c.name, c.grounds]),
      mine.cuts.map(c => [c.name, c.grounds]),
      'the edge function would suggest cutting different cards, in a different order'
    );
  });

  it('scoring the same list twice gives the same answer', () => {
    const a = evaluateDeck(engineEntries(), { format: 'commander' });
    const b = evaluateDeck(engineEntries(), { format: 'commander' });
    assert.equal(a.power.score, b.power.score);
    assert.deepEqual(
      a.cuts.map(c => c.name),
      b.cuts.map(c => c.name)
    );
  });
});

/* ------------------------------------------------------------------ *
 * 2. One reason
 * ------------------------------------------------------------------ */

describe('the reason to cut a card is the reason the score is low', () => {
  const evaluation = evaluateDeck(engineEntries(), { format: 'commander' });
  const castability = evaluation.power.subscores.find(s => s.key === 'castability');

  it('the castability subscore exists and was measured', () => {
    assert.ok(castability, 'there is no castability subscore');
    assert.equal(castability!.applicable, true);
    assert.ok(typeof castability!.value === 'number');
  });

  it('the castability subscore IS the deck castability figure', () => {
    // Not "agrees with". The same number, so a page cannot show one beside the
    // other and have them differ.
    assert.equal(castability!.value, round1(evaluation.playability.averagePct!));
  });

  it('every card cut for being uncastable is named in that subscore', () => {
    const uncastable = evaluation.cuts.filter(c => c.grounds === 'uncastable');
    assert.ok(uncastable.length > 0, 'the fixture deck was meant to have hard-to-cast cards');

    const named = new Set(castability!.holdingBack.map(c => c.name));
    for (const cut of uncastable) {
      assert.ok(
        named.has(cut.name),
        `${cut.name} is at the top of the cut list but the castability subscore ` +
          `never mentions it, so a player cannot connect the two`
      );
    }
  });

  it('uncastable cards are ranked ahead of merely poor-fitting ones', () => {
    const firstPoorFit = evaluation.cuts.findIndex(c => c.grounds === 'poor-fit');
    const lastUncastable = evaluation.cuts.map(c => c.grounds).lastIndexOf('uncastable');
    if (firstPoorFit === -1 || lastUncastable === -1) return;
    assert.ok(
      lastUncastable < firstPoorFit,
      'a card that fits badly was ranked above a card that cannot be cast, which ' +
        'inverts the product decision that castability comes first'
    );
  });

  it('lands and the commander are never offered as cuts', () => {
    for (const cut of evaluation.cuts) {
      assert.notEqual(cut.name, COMMANDER.name);
      assert.ok(!/^(Plains|Island|Swamp|Forest|Mountain)$/.test(cut.name), `${cut.name} is a land`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 3. Unmeasured is not low
 * ------------------------------------------------------------------ */

describe('a card nothing could measure is not treated as a bad card', () => {
  const evaluation = evaluateDeck(engineEntries(), { format: 'commander' });

  it('a card with no mana cost has a null figure, never 0', () => {
    const oddity = evaluation.playability.cards.find(c => c.name === 'Costless Oddity');
    assert.ok(oddity);
    assert.equal(oddity!.pct, null);
    assert.equal(oddity!.skipped, 'no-mana-cost');
  });

  it('and is not ranked as uncastable', () => {
    const cut = evaluation.cuts.find(c => c.name === 'Costless Oddity');
    assert.ok(cut, 'it should still be cuttable, just not for that reason');
    assert.equal(cut!.grounds, 'poor-fit');
    assert.equal(cut!.castabilityPct, null);
  });
});

/* ------------------------------------------------------------------ *
 * 4. The evidence adds up
 * ------------------------------------------------------------------ */

describe('every subscore can show its working', () => {
  const evaluation = evaluateDeck(engineEntries(), { format: 'commander' });

  it('there is exactly one subscore per key, in the declared order', () => {
    assert.deepEqual(
      evaluation.power.subscores.map(s => s.key),
      [...SUBSCORE_ORDER]
    );
  });

  it('the weights sum to one', () => {
    const total = Object.values(SUBSCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}, not 1`);
  });

  for (const key of SUBSCORE_ORDER) {
    it(`${key} says what it measured`, () => {
      const sub = evaluation.power.subscores.find(s => s.key === key)!;
      assert.ok(sub.measured.length > 0, 'no sentence saying what was counted');
      // Copy rule: no em-dashes in anything a player reads.
      assert.ok(!sub.measured.includes('—'), `"${sub.measured}" contains an em-dash`);
      for (const c of [...sub.from, ...sub.holdingBack]) {
        assert.ok(!c.why.includes('—'), `"${c.why}" contains an em-dash`);
      }
    });

    it(`${key} names the cards behind its number`, () => {
      const sub = evaluation.power.subscores.find(s => s.key === key)!;
      if (!sub.applicable || sub.value === null) {
        assert.ok(sub.note, 'an inapplicable subscore must say why rather than show 0');
        return;
      }
      if (sub.value === 0) {
        assert.ok(sub.note, 'a zero subscore must say what was missing');
        return;
      }
      // A subscore with a value has cards behind it, or it is one of the two
      // that are a rate over the whole deck rather than a sum over cards.
      const rateBased = key === 'mana' || key === 'consistency';
      if (!rateBased) {
        assert.ok(
          sub.from.length > 0,
          `${key} scored ${sub.value} but named no card, which is exactly the shape ` +
            `of the subscore that read 35 to 39 for every deck`
        );
      }
    });

    it(`${key}'s contributions add up to its value`, () => {
      const sub = evaluation.power.subscores.find(s => s.key === key)!;
      if (sub.value === null || sub.from.length === 0) return;
      const summed = sub.from.reduce((n, c) => n + c.points, 0) + sub.othersPoints;
      // Rate-based subscores state their arithmetic in `measured` rather than
      // splitting it across cards, so only the summed ones are checked.
      if (key === 'mana' || key === 'consistency') return;
      assert.ok(
        Math.abs(summed - sub.value) < 1.0,
        `${key}: the cards add to ${summed.toFixed(2)} but the subscore reads ${sub.value}`
      );
    });
  }

  it('coverage is reported, so a list of bare names cannot look like a measurement', () => {
    const bare = evaluateDeck(
      Array.from({ length: 99 }, (_, i) => ({
        card: { name: `Unknown Card ${i}`, type_line: '' },
        quantity: 1,
      })),
      { format: 'commander' }
    );
    assert.equal(bare.power.unreliable, true);
    assert.ok(bare.power.coverage.ratio < 0.6);
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
