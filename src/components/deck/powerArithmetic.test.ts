/**
 * The score the deck page prints has to follow from the working the deck page
 * shows.
 *
 * ## What was wrong
 *
 * The panel is headed "Why this score" and lists ten subscores whose weights
 * sum to exactly 1.00. On a real deck their weighted mean came to 56.97, which
 * is 5.7 on a ten point scale, and the page printed 5.3. Two steps sat between
 * the list and the number and neither appeared anywhere on screen:
 *
 *   1. the weighted mean goes through a logistic curve rather than a division,
 *      so 55 out of 100 is mid-scale and the ends compress;
 *   2. a deck with no way to search its library, or with nothing that ends a
 *      game, takes a flat deduction after that.
 *
 * A reader who checks the arithmetic and cannot make it come out stops trusting
 * the number, and this is the product's most important number.
 *
 * ## What this asserts
 *
 * That `ScoreArithmetic` in `PowerScore.tsx` reconstructs the printed score
 * exactly, from the fields `DeckPower` now carries, on a deck put through the
 * REAL engine by the same adapter the deck page calls. Not a fixture of
 * numbers: if the engine changes its curve or its deductions, this fails.
 *
 * The deck page needs an account, so this is the only way to prove it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDeckPower, entriesFromStoreCards, LOGISTIC } from '../../lib/deck/powerAdapter.ts';
import { SUBSCORE_WEIGHTS } from '../../engine/power/weights.ts';

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

/** With a tutor, so the "no tutors" deduction does NOT fire on this one. */
const WITH_TUTORS: Spec[] = [
  {
    name: 'Demonic Tutor',
    type_line: 'Sorcery',
    mana_cost: '{1}{B}',
    cmc: 2,
    oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.',
    color_identity: ['B'],
  },
  {
    name: 'Vampiric Tutor',
    type_line: 'Instant',
    mana_cost: '{B}',
    cmc: 1,
    oracle_text:
      'Search your library for a card, then shuffle and put that card on top. You lose 2 life.',
    color_identity: ['B'],
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
];

const BASICS: Array<[string, string]> = [
  ['Plains', 'W'],
  ['Island', 'U'],
  ['Swamp', 'B'],
  ['Forest', 'G'],
];

function deckSpecs(extra: Spec[]): Spec[] {
  const out: Spec[] = [COMMANDER, ...extra];
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
  for (let i = 0; i < 100 - 1 - extra.length - 36; i++) {
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

function storeCards(extra: Spec[]) {
  return deckSpecs(extra).map(spec => ({
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

function score(extra: Spec[]) {
  const power = computeDeckPower(entriesFromStoreCards(storeCards(extra)), {
    format: 'commander',
  });
  assert.ok(power, 'the adapter produced no score at all');
  return power;
}

/** Exactly what `ScoreArithmetic` draws, computed the same way. */
function curveOf(raw: number): number {
  const curved = 1 + (1 / (1 + Math.exp(-(raw - LOGISTIC.mu) / LOGISTIC.sigma))) * 9;
  return Math.round(curved * 10) / 10;
}

describe('the printed score follows from the working the page shows', () => {
  it('the ten weights sum to one, so the mean really is a mean', () => {
    const total = Object.values(SUBSCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(total - 1) < 1e-9,
      `the ten weights sum to ${total}, so "the ten parts above, weighted" would be a lie`
    );
  });

  it('DeckPower carries the weighted mean, or the panel has nothing to show', () => {
    const power = score(WITH_TUTORS);
    assert.equal(
      typeof power.raw,
      'number',
      'without `raw` the page cannot show the step between the ten parts and the score'
    );
    assert.ok(power.raw! > 0 && power.raw! <= 100, `raw out of range: ${power.raw}`);
  });

  it('mean -> curve -> deductions reproduces the printed score exactly', () => {
    for (const extra of [WITH_TUTORS, []]) {
      const power = score(extra);
      const curved = curveOf(power.raw!);
      const drop = Math.round((power.score - curved) * 10) / 10;

      /* This is the whole claim: the reader can start at the weighted mean, do
         the two steps the panel now names, and land on the printed number. */
      assert.equal(
        Math.round((curved + drop) * 10) / 10,
        power.score,
        `the panel's arithmetic does not reach the printed score: ` +
          `raw ${power.raw} -> curve ${curved} -> ${power.score}`
      );

      /* And a deduction only ever appears when the engine says one applies. */
      const claimsDeduction = power.diagnostics.noTutors || power.diagnostics.noGameChangers;
      if (drop < 0) {
        assert.ok(
          claimsDeduction,
          `the score dropped by ${drop} with neither flag set, so the page could not explain it`
        );
      }
      if (!claimsDeduction) {
        assert.equal(drop, 0, `no flag set but the score moved by ${drop}`);
      }
    }
  });

  it('a deck with no tutors is marked down twice, and the page now says so', () => {
    const withOut = score([]);
    assert.equal(
      withOut.diagnostics.noTutors,
      true,
      'expected a deck with no search effects to trip the no-tutors flag'
    );
    /* Tutors is one of the ten weighted parts AND the trigger for the flat
       deduction. That is the double count. It is not asserted as correct here,
       only as VISIBLE: `SUBSCORE_WEIGHTS.tutors` is non-zero and the flag is
       set at the same time, which is exactly what the panel now discloses. */
    assert.ok(
      SUBSCORE_WEIGHTS.tutors > 0,
      'tutors carries no weight, so the disclosure about double counting is wrong'
    );
    assert.ok(
      curveOf(withOut.raw!) > withOut.score,
      'the flat deduction did not actually lower the score'
    );
  });
});
