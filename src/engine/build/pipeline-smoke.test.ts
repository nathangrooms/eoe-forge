/**
 * The edge function's own entry point runs, end to end, against a fake catalogue.
 *
 * ## Why this exists
 *
 * On 3 Sep 2026 the language-model planner was removed from
 * `ai-deck-builder-v2` and one reference to its `plan` variable survived, in
 * the response object. The suite passed - 3,337 tests, none failing - the
 * function was DEPLOYED, and it answered every request with
 * `ReferenceError: plan is not defined`. It was caught by running a real build
 * afterwards.
 *
 * The hole is structural rather than careless. Every test under `src/engine`
 * exercises the ENGINE, which is pure and takes a pool of cards; `build()` is
 * the edge function's entry point and lives in `supabase/functions`, so
 * nothing in `src/**\/*.test.ts` had ever called it. That is the same shape
 * as the reachability gap `src/lib/game/reachability.test.ts` was written for:
 * green tests that prove the rules and never prove a player can reach them.
 *
 * ## What it is and is not
 *
 * NOT a deck-quality test. Every instrument for that is in `scripts/probe/`
 * and runs against the real catalogue, because deck quality is a claim about
 * 33,000 real cards. This asserts the far weaker and completely uncovered
 * thing: that `build()` returns rather than throws, and that the fields the
 * client destructures are present. A fake catalogue of a dozen cards cannot
 * say anything about which cards get chosen, and it does not try.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { build } from '../../../supabase/functions/ai-deck-builder-v2/pipeline.ts';

/** Just enough of a card for the pool. Prices and art are absent on purpose. */
function card(name: string, typeLine: string, cmc: number, colors: string[] = []) {
  return {
    id: `id-${name}`,
    oracle_id: `oracle-${name}`,
    name,
    type_line: typeLine,
    oracle_text: '',
    mana_cost: cmc ? `{${cmc}}` : '',
    cmc,
    color_identity: colors,
    colors,
    keywords: [],
    tags: [],
    facets: [],
    legalities: { commander: 'legal' },
    legal_in_format: 'legal',
    prices: { usd: '1.00' },
    edhrec_rank: 500,
  };
}

const COMMANDER = {
  ...card('Test Commander', 'Legendary Creature — Human Wizard', 3, ['U']),
  oracle_text: 'Whenever you cast an instant spell, draw a card.',
};

/* Enough distinct spells that the builder can fill 99 slots, and enough
   Islands that the mana base has something to take. The pool is deliberately
   dull: this test is about the pipeline running, not about what it picks. */
const SPELLS = Array.from({ length: 140 }, (_, i) =>
  card(`Spell ${i}`, i % 3 === 0 ? 'Creature — Human' : 'Instant', (i % 5) + 1, ['U'])
);
const LANDS = Array.from({ length: 40 }, (_, i) => card(`Land ${i}`, 'Land', 0, []));
const ISLAND = card('Island', 'Basic Land — Island', 0, []);

const CATALOG = {
  poolFor: async () => SPELLS,
  landPoolFor: async () => LANDS,
  basicLands: async () => [ISLAND],
  cardsByName: async (names: readonly string[]) => {
    const all = [COMMANDER, ISLAND, ...SPELLS, ...LANDS];
    const want = new Set(names);
    return all.filter(c => want.has(c.name));
  },
  poolFacetsByName: async () => new Map<string, string[]>(),
  ownedQuantities: async () => new Map<string, number>(),
  ownedCollection: async () => new Map<string, number>(),
  /* The combo read added the same day. An empty list is the normal case for a
     colour identity with nothing buildable, and the builder must not care. */
  combosFor: async () => [],
};

describe('the edge function builds a deck end to end', () => {
  it('returns a deck rather than throwing, and carries the fields the client reads', async () => {
    const outcome = await build({
      catalog: CATALOG as never,
      request: { commander: { name: 'Test Commander' }, powerLevel: 8, includeLands: true },
      startedAt: Date.now(),
    });

    assert.equal(outcome.kind, 'ok', JSON.stringify(outcome).slice(0, 400));
    if (outcome.kind !== 'ok') return;

    const body = outcome.body as {
      result: { deck: unknown[]; commander: unknown; totals: { deckCards: number }; changeLog: unknown[] };
      plan: unknown;
    };
    assert.ok(Array.isArray(body.result.deck), 'result.deck');
    assert.ok(body.result.commander, 'result.commander');
    assert.ok(Array.isArray(body.result.changeLog), 'result.changeLog');
    assert.equal(body.result.totals.deckCards, 99);
    /* `plan` is null now and the key must still be there: the client reads it,
       and a missing key and a null are different things to a consumer. */
    assert.equal(body.plan, null);
  });

  /*
   * THE MANA-BASE TOGGLE IS NOT ASSERTED HERE, deliberately.
   *
   * `includeLands: false` now reaches the engine and stops the basics pass
   * padding to 99, which was the bug: the toggle built a mana base whatever
   * the player chose. What it cannot do is prove the deck comes back with
   * zero lands, because that needs a pool that can supply 99 real spells and
   * this fixture is a dozen shapes the ranker mostly declines. Checking it
   * against the real catalogue belongs in `scripts/probe/`, where every other
   * claim about which cards get chosen already lives.
   */
});
