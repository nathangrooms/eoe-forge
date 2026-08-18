/**
 * Tests for the deck card-list view layer: the filter predicate, the facet
 * counts, and the sentences that explain a castability figure.
 *
 *   node --test --experimental-strip-types src/lib/deck/deckCardFilters.test.ts
 *
 * The runner is `node:test`, matching `src/lib/game/*.test.ts` and
 * `playability.test.ts` — there is still no test runner in `package.json`.
 *
 * The engine itself is already covered exhaustively by `playability.test.ts`.
 * What is checked here is everything the deck page puts *around* it, because
 * that is where a silent wrong answer would actually reach a player: a filter
 * that quietly drops lands, a facet count that says 1 beside a playset, or an
 * explanation that names the wrong colour.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPlayabilityEngine } from './playability.ts';
import type { DeckCardRow } from './deckCards.ts';
import {
  bandRange,
  describePlayability,
  hardestToCast,
  hardToCastCount,
  playabilityBand,
  PLAYABILITY_BANDS,
  rowsToPlayabilityInputs,
  rowToPlayabilityInput,
  liveSourcesFor,
} from './playabilityView.ts';
import {
  computeDeckCardFacets,
  EMPTY_DECK_CARD_FILTERS,
  filterDeckRows,
  isFilterActive,
  rowColours,
  rowManaValue,
  rowPriceFacet,
} from './deckCardFilters.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

let nextId = 0;

interface RowSpec {
  name: string;
  type_line: string;
  mana_cost?: string | null;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  rarity?: string;
  usd?: string | null;
  quantity?: number;
  commander?: boolean;
  sideboard?: boolean;
  oracle_text?: string;
}

function row(spec: RowSpec): DeckCardRow {
  nextId += 1;
  return {
    id: `row-${nextId}`,
    card_id: `card-${nextId}`,
    card_name: spec.name,
    quantity: spec.quantity ?? 1,
    is_commander: !!spec.commander,
    is_sideboard: !!spec.sideboard,
    card: {
      name: spec.name,
      type_line: spec.type_line,
      mana_cost: spec.mana_cost ?? null,
      cmc: spec.cmc ?? 0,
      colors: spec.colors ?? [],
      color_identity: spec.color_identity ?? spec.colors ?? [],
      image_uris: null,
      prices: { usd: spec.usd === undefined ? '1.00' : spec.usd },
      oracle_text: spec.oracle_text ?? null,
      power: null,
      toughness: null,
      rarity: spec.rarity ?? 'common',
      set_code: 'tst',
      legalities: null,
      is_legendary: false,
      keywords: [],
      tags: [],
    },
  };
}

/** An island-heavy deck with a deliberately thin blue count, plus red spells. */
function izzetRows(): DeckCardRow[] {
  const rows: DeckCardRow[] = [];
  for (let i = 0; i < 6; i++) {
    rows.push(row({ name: `Island ${i}`, type_line: 'Basic Land — Island', usd: null }));
  }
  for (let i = 0; i < 28; i++) {
    rows.push(row({ name: `Mountain ${i}`, type_line: 'Basic Land — Mountain', usd: null }));
  }
  rows.push(
    row({
      name: 'Counterspell',
      type_line: 'Instant',
      mana_cost: '{U}{U}',
      cmc: 2,
      colors: ['U'],
      rarity: 'uncommon',
      usd: '2.50',
    })
  );
  rows.push(
    row({
      name: 'Lightning Bolt',
      type_line: 'Instant',
      mana_cost: '{R}',
      cmc: 1,
      colors: ['R'],
      rarity: 'uncommon',
      usd: '4.00',
      quantity: 4,
    })
  );
  rows.push(
    row({
      name: 'Steam Augury',
      type_line: 'Sorcery',
      mana_cost: '{2}{U}{R}',
      cmc: 4,
      colors: ['U', 'R'],
      rarity: 'rare',
      usd: '0.25',
    })
  );
  rows.push(
    row({
      name: 'Wheel of Fate',
      type_line: 'Sorcery',
      mana_cost: null,
      cmc: 0,
      colors: ['R'],
      rarity: 'rare',
      usd: '30.00',
    })
  );
  return rows;
}

function engineFor(rows: DeckCardRow[]) {
  return createPlayabilityEngine(rowsToPlayabilityInputs(rows));
}

/* ------------------------------------------------------------------ *
 * Row -> engine input
 * ------------------------------------------------------------------ */

test('sideboard rows are kept out of the library the engine draws from', () => {
  const main = [
    row({ name: 'Island', type_line: 'Basic Land — Island' }),
    row({ name: 'Ponder', type_line: 'Sorcery', mana_cost: '{U}', cmc: 1, colors: ['U'] }),
  ];
  const withBoard = [
    ...main,
    row({ name: 'Negate', type_line: 'Instant', mana_cost: '{1}{U}', cmc: 2, sideboard: true }),
  ];

  assert.equal(rowsToPlayabilityInputs(main).length, 2);
  assert.equal(rowsToPlayabilityInputs(withBoard).length, 2);
  // A sideboard card is not in the deck you shuffle, so it must not change the
  // library size every source density is divided by.
  assert.equal(
    createPlayabilityEngine(rowsToPlayabilityInputs(withBoard)).profile.librarySize,
    createPlayabilityEngine(rowsToPlayabilityInputs(main)).profile.librarySize
  );
});

test('copies survive the mapping, so a playset counts four times', () => {
  const input = rowToPlayabilityInput(
    row({ name: 'Lightning Bolt', type_line: 'Instant', mana_cost: '{R}', quantity: 4 })
  );
  assert.equal(input.quantity, 4);
  assert.equal(input.name, 'Lightning Bolt');
});

test('the commander is flagged through to the engine', () => {
  const inputs = rowsToPlayabilityInputs([
    row({ name: 'Niv-Mizzet', type_line: 'Legendary Creature — Dragon', commander: true }),
    row({ name: 'Island', type_line: 'Basic Land — Island' }),
  ]);
  assert.equal(inputs.find(c => c.name === 'Niv-Mizzet')?.isCommander, true);
});

/* ------------------------------------------------------------------ *
 * Bands
 * ------------------------------------------------------------------ */

test('bands are inclusive at their floor and only the bottom two are a fault', () => {
  assert.equal(playabilityBand(100).id, 'reliable');
  assert.equal(playabilityBand(85).id, 'reliable');
  assert.equal(playabilityBand(84.9).id, 'fine');
  assert.equal(playabilityBand(70).id, 'fine');
  assert.equal(playabilityBand(69.9).id, 'awkward');
  assert.equal(playabilityBand(50).id, 'awkward');
  // 50 is the engine's own DEFAULT_THRESHOLD — below it the card is more often
  // stuck in hand than cast on curve, which is where the red starts.
  assert.equal(playabilityBand(49.9).id, 'hard');
  assert.equal(playabilityBand(25).id, 'hard');
  assert.equal(playabilityBand(24.9).id, 'unlikely');
  assert.equal(playabilityBand(0).id, 'unlikely');
});

/* ------------------------------------------------------------------ *
 * Explanation
 * ------------------------------------------------------------------ */

test('a land has no explanation at all, rather than a fabricated one', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const island = rows.find(r => r.card_name.startsWith('Island')) as DeckCardRow;
  const play = engine.card(rowToPlayabilityInput(island));

  assert.equal(play.pct, null);
  assert.equal(play.skipped, 'land');
  assert.equal(describePlayability(play, engine.profile), null);
});

test('the explanation names the colour that is actually short', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const counterspell = rows.find(r => r.card_name === 'Counterspell') as DeckCardRow;
  const play = engine.card(rowToPlayabilityInput(counterspell));
  const explanation = describePlayability(play, engine.profile);

  assert.ok(explanation);
  // Six Islands, all lands, all online by turn 2 — the sentence must quote the
  // real count and not the deck's total source count of 34.
  assert.equal(liveSourcesFor(engine.profile, ['U'], 2), 6);
  assert.match(explanation.summary, /only 6 blue sources/);
  assert.match(explanation.summary, /\{U\}\{U\}/);
  assert.match(explanation.summary, /turn 2/);
  assert.match(explanation.cost, /\{U\}\{U\}/);
  // And the overall line has to agree with the deck: 34 lands, 34 sources.
  assert.ok(explanation.reasons.some(r => r.includes('34 of 34 mana sources')));
});

test('the tightest requirement wins the one-line summary, not the first one', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const augury = rows.find(r => r.card_name === 'Steam Augury') as DeckCardRow;
  const explanation = describePlayability(
    engine.card(rowToPlayabilityInput(augury)),
    engine.profile
  );

  assert.ok(explanation);
  // {2}{U}{R}: 6 blue sources against 28 red, so blue is the constraint even
  // though red is listed alongside it.
  assert.match(explanation.summary, /blue/);
  assert.equal(/only \d+ red sources/.test(explanation.summary), false);
  // Both requirements still get a line of their own.
  assert.equal(explanation.reasons.length, 3);
});

test('a card with no mana cost says so instead of scoring zero', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const wheel = rows.find(r => r.card_name === 'Wheel of Fate') as DeckCardRow;
  const play = engine.card(rowToPlayabilityInput(wheel));

  assert.equal(play.pct, null);
  assert.equal(play.skipped, 'no-mana-cost');
  const explanation = describePlayability(play, engine.profile);
  assert.ok(explanation);
  assert.match(explanation.summary, /No mana cost/);
});

test('the generic portion of a cost is written back out', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const augury = rows.find(r => r.card_name === 'Steam Augury') as DeckCardRow;
  const explanation = describePlayability(
    engine.card(rowToPlayabilityInput(augury)),
    engine.profile
  );
  assert.ok(explanation);
  assert.match(explanation.cost, /\{2\}\{U\}\{R\}/);
  assert.match(explanation.cost, /4 mana by turn 4/);
});

/* ------------------------------------------------------------------ *
 * Facets
 * ------------------------------------------------------------------ */

test('facet counts are copy-weighted, not distinct-card counts', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const facets = computeDeckCardFacets(rows, r => engine.card(rowToPlayabilityInput(r)));

  const instants = facets.categories.find(c => c.value === 'instants');
  // One Counterspell plus four Lightning Bolts.
  assert.equal(instants?.count, 5);

  const lands = facets.categories.find(c => c.value === 'lands');
  assert.equal(lands?.count, 34);
});

test('no facet is offered that matches nothing', () => {
  const rows = izzetRows();
  const facets = computeDeckCardFacets(rows);

  for (const group of Object.values(facets)) {
    for (const option of group) {
      assert.ok(option.count > 0, `${option.value} was offered with a count of ${option.count}`);
    }
  }
  // This deck has no white cards and no planeswalkers, so neither is offered.
  assert.equal(
    facets.colours.some(c => c.value === 'W'),
    false
  );
  assert.equal(
    facets.categories.some(c => c.value === 'planeswalkers'),
    false
  );
});

test('a colourless card is filed under C rather than vanishing', () => {
  assert.deepEqual(rowColours(row({ name: 'Sol Ring', type_line: 'Artifact' })), ['C']);
  assert.deepEqual(
    rowColours(row({ name: 'Steam Augury', type_line: 'Sorcery', colors: ['U', 'R'] })),
    ['U', 'R']
  );
});

test('mana value bins round, and cap at seven-plus', () => {
  assert.equal(rowManaValue(row({ name: 'a', type_line: 'Instant', cmc: 0 })), '0');
  assert.equal(rowManaValue(row({ name: 'b', type_line: 'Instant', cmc: 6 })), '6');
  assert.equal(rowManaValue(row({ name: 'c', type_line: 'Instant', cmc: 7 })), '7+');
  assert.equal(rowManaValue(row({ name: 'd', type_line: 'Instant', cmc: 12 })), '7+');
});

test('a missing price is its own bucket, never $0', () => {
  assert.equal(rowPriceFacet(row({ name: 'a', type_line: 'Instant', usd: null })), 'unknown');
  assert.equal(rowPriceFacet(row({ name: 'b', type_line: 'Instant', usd: '0.10' })), 'lt1');
  assert.equal(rowPriceFacet(row({ name: 'c', type_line: 'Instant', usd: '4.99' })), 'lt5');
  assert.equal(rowPriceFacet(row({ name: 'd', type_line: 'Instant', usd: '19.99' })), 'lt20');
  assert.equal(rowPriceFacet(row({ name: 'e', type_line: 'Instant', usd: '20.00' })), 'gte20');
});

/* ------------------------------------------------------------------ *
 * The predicate
 * ------------------------------------------------------------------ */

test('no filter set means no row is dropped', () => {
  const rows = izzetRows();
  assert.equal(isFilterActive(EMPTY_DECK_CARD_FILTERS), false);
  assert.equal(filterDeckRows(rows, EMPTY_DECK_CARD_FILTERS).length, rows.length);
});

test('chips within a facet are OR-ed and across facets are AND-ed', () => {
  const rows = izzetRows();

  const instantsOrSorceries = filterDeckRows(rows, {
    ...EMPTY_DECK_CARD_FILTERS,
    categories: ['instants', 'sorceries'],
  });
  assert.deepEqual(
    instantsOrSorceries.map(r => r.card_name).sort(),
    ['Counterspell', 'Lightning Bolt', 'Steam Augury', 'Wheel of Fate'].sort()
  );

  const blueInstants = filterDeckRows(rows, {
    ...EMPTY_DECK_CARD_FILTERS,
    categories: ['instants'],
    colours: ['U'],
  });
  assert.deepEqual(
    blueInstants.map(r => r.card_name),
    ['Counterspell']
  );
});

test('search reads name, type and rules text', () => {
  const rows = [
    row({ name: 'Ponder', type_line: 'Sorcery', oracle_text: 'Look at the top three cards' }),
    row({ name: 'Brainstorm', type_line: 'Instant', oracle_text: 'Draw three cards' }),
  ];
  const byName = filterDeckRows(rows, { ...EMPTY_DECK_CARD_FILTERS, search: 'ponder' });
  assert.deepEqual(byName.map(r => r.card_name), ['Ponder']);

  const byType = filterDeckRows(rows, { ...EMPTY_DECK_CARD_FILTERS, search: 'instant' });
  assert.deepEqual(byType.map(r => r.card_name), ['Brainstorm']);

  const byText = filterDeckRows(rows, { ...EMPTY_DECK_CARD_FILTERS, search: 'three cards' });
  assert.equal(byText.length, 2);
});

test('filtering by playability excludes lands, because lands have no band', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const lookup = (r: DeckCardRow) => engine.card(rowToPlayabilityInput(r));

  const anyBand = filterDeckRows(
    rows,
    {
      ...EMPTY_DECK_CARD_FILTERS,
      playability: ['reliable', 'fine', 'awkward', 'hard', 'unlikely'],
    },
    lookup
  );

  assert.equal(
    anyBand.some(r => r.card_name.startsWith('Island') || r.card_name.startsWith('Mountain')),
    false
  );
  // Wheel of Fate has no mana cost, so it has no band either.
  assert.equal(anyBand.some(r => r.card_name === 'Wheel of Fate'), false);
  assert.deepEqual(
    anyBand.map(r => r.card_name).sort(),
    ['Counterspell', 'Lightning Bolt', 'Steam Augury'].sort()
  );
});

test('the hard bands catch the card the mana base actually fails', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const lookup = (r: DeckCardRow) => engine.card(rowToPlayabilityInput(r));

  const bolt = engine.card(rowToPlayabilityInput(
    rows.find(r => r.card_name === 'Lightning Bolt') as DeckCardRow
  ));
  const counter = engine.card(rowToPlayabilityInput(
    rows.find(r => r.card_name === 'Counterspell') as DeckCardRow
  ));

  assert.ok(bolt.pct !== null && counter.pct !== null);
  // 28 red sources for one red pip on turn 1 beats 6 blue for two blue on
  // turn 2 by a wide margin — that ordering is the whole point of the column.
  assert.ok((bolt.pct as number) > (counter.pct as number));

  const bad = filterDeckRows(
    rows,
    { ...EMPTY_DECK_CARD_FILTERS, playability: ['hard', 'unlikely'] },
    lookup
  );
  assert.ok(bad.some(r => r.card_name === 'Counterspell'));
  assert.equal(bad.some(r => r.card_name === 'Lightning Bolt'), false);
});

/* ------------------------------------------------------------------ *
 * Regressions from the adversarial review
 * ------------------------------------------------------------------ */

/** A row whose printing never synced: no `card` at all, only a name. */
function unsyncedRow(name: string, quantity = 1): DeckCardRow {
  nextId += 1;
  return {
    id: `row-${nextId}`,
    card_id: null,
    card_name: name,
    quantity,
    is_commander: false,
    is_sideboard: false,
    card: null,
  };
}

test('an unsynced printing is filed under no mana value and no colour, not MV 0 and Colourless', () => {
  assert.equal(rowManaValue(unsyncedRow('x')), null);
  assert.equal(rowColours(unsyncedRow('x')), null);

  // Stated as the property that matters rather than as fixture arithmetic:
  // adding a row nobody has data for must not move a single real count. It
  // used to land in "MV 0" beside the basics and in "Colourless" beside the
  // artifacts — both claims about a card with no card record behind it.
  const base = computeDeckCardFacets(izzetRows());
  const withUnsynced = computeDeckCardFacets([...izzetRows(), unsyncedRow('Some Unsynced Card')]);

  assert.deepEqual(withUnsynced.manaValues, base.manaValues);
  assert.deepEqual(withUnsynced.colours, base.colours);
});

test('filtering by a mana value or colour drops the unsynced row rather than smuggling it in', () => {
  const rows = [...izzetRows(), unsyncedRow('Some Unsynced Card')];

  const atZero = filterDeckRows(rows, { ...EMPTY_DECK_CARD_FILTERS, manaValues: ['0'] });
  assert.equal(atZero.some(r => r.card_name === 'Some Unsynced Card'), false);

  const colourless = filterDeckRows(rows, { ...EMPTY_DECK_CARD_FILTERS, colours: ['C'] });
  assert.equal(colourless.some(r => r.card_name === 'Some Unsynced Card'), false);
});

test('the legend prints closed band ranges, because "25%+" would describe Hard as covering Reliable', () => {
  const byId = Object.fromEntries(PLAYABILITY_BANDS.map(b => [b.id, b]));
  assert.equal(bandRange(byId.reliable), '85–100%');
  assert.equal(bandRange(byId.fine), '70–85%');
  assert.equal(bandRange(byId.awkward), '50–70%');
  assert.equal(bandRange(byId.hard), '25–50%');
  assert.equal(bandRange(byId.unlikely), '0–25%');
});

test('hardToCastCount reports the whole problem, not the truncated list', () => {
  const rows = izzetRows();
  const result = engineFor(rows).deck();

  // Everything is under 100%, so a low ceiling with a limit of 1 must still
  // report the true total — the panel header depends on that difference to
  // stop claiming it is showing every bad card.
  const ceiling = 101;
  const shown = hardestToCast(result, 1, ceiling);
  assert.equal(shown.length, 1);
  assert.ok(hardToCastCount(result, ceiling) > shown.length);
  assert.equal(
    hardToCastCount(result, ceiling),
    result.cards.filter(c => c.pct !== null && c.skipped === null).length
  );
});

test('an explanation says the library holds the sources, not that they are in play', () => {
  const rows = izzetRows();
  const engine = engineFor(rows);
  const counter = engine.card(rowToPlayabilityInput(
    rows.find(r => r.card_name === 'Counterspell') as DeckCardRow
  ));
  const explanation = describePlayability(counter, engine.profile);
  assert.ok(explanation);

  // "8 sources online by turn 2" read as a board state. Every sentence about a
  // count has to name the library it is counting.
  for (const reason of explanation.reasons) {
    assert.match(reason, /library/);
  }
});
