/**
 * The precedence rule, and the two bars that stop a swapped card being wrong.
 *
 * Every test here is built from a REAL card and asserts that card's Scryfall
 * oracle text before it asserts anything about behaviour, the same discipline
 * `port.test.ts` uses and for the same reason: it pins the quote in the test to
 * the printed card, so a quoted line cannot drift away from the behaviour it is
 * there to justify.
 *
 * Oracle text is Scryfall's. Behaviour is XMage's (MIT, Copyright (c) 2010
 * betasteward@gmail.com). Forge is GPL-3.0 and was not read.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compileWithTrace, assertClausesAccounted } from '../abilities/compiler.ts';
import { hasXmageRecord, xmageLoweredCardCount } from './lowered.ts';
import { XMAGE_LOWERED } from './lowered.generated.ts';
import type { AbilityCard } from '../abilities/index.ts';

/** A catalogue row, with only the fields the compiler reads. */
function card(fields: Partial<AbilityCard> & { name: string; oracle_id: string }): AbilityCard {
  return {
    id: fields.oracle_id,
    oracle_id: fields.oracle_id,
    name: fields.name,
    type_line: fields.type_line ?? null,
    oracle_text: fields.oracle_text ?? null,
    keywords: fields.keywords ?? null,
    mana_cost: fields.mana_cost ?? null,
    cmc: fields.cmc ?? null,
    power: fields.power ?? null,
    toughness: fields.toughness ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * The rule itself
 * ------------------------------------------------------------------ */

test('the compiler wins on a card it fully understands, even though a record exists', () => {
  // Scryfall, Lightning Bolt: "Lightning Bolt deals 3 damage to any target."
  const bolt = card({
    name: 'Lightning Bolt',
    oracle_id: '4457ed35-7c10-48c8-9776-456485fdf070',
    type_line: 'Instant',
    oracle_text: 'Lightning Bolt deals 3 damage to any target.',
  });

  // The premise: there IS a record for this card, so the test is about
  // precedence and not about an empty table.
  assert.equal(hasXmageRecord(bolt.oracle_id!), true);

  const { result } = compileWithTrace(bolt);
  assert.equal(result.coverage, 'full');
  assert.equal(result.source, 'compiler', 'a card the compiler finished must never be swapped');
});

test('a card the compiler cannot finish is swapped whole', () => {
  // Scryfall, Spidery Grasp: "Untap target creature. It gets +2/+4 and gains
  // reach until end of turn."
  const grasp = card({
    name: 'Spidery Grasp',
    oracle_id: '021ce403-cbfa-4d69-a6e9-473d58bd477a',
    type_line: 'Instant',
    oracle_text:
      'Untap target creature. It gets +2/+4 and gains reach until end of turn. (It can block creatures with flying.)',
  });

  const { result } = compileWithTrace(grasp);
  assert.equal(result.source, 'xmage');
  assert.equal(result.unparsed.length, 0);
  assert.equal(result.abilities.length, 1);

  const spell = result.abilities[0];
  assert.equal(spell.kind, 'spell');
  // The whole card, not a fragment: untap, then the boost, then the grant.
  assert.deepEqual(
    (spell as { effects: Array<{ do: string }> }).effects.map((e) => e.do),
    ['untap', 'pump', 'pump'],
  );
  // A targeted spell must ANNOUNCE its target, which is the seam the whole
  // engine is currently blocked on. The spec has to be there for the day a
  // surface asks for it.
  assert.equal((spell as { targets?: unknown[] }).targets?.length, 1);
});

test('a swapped ability carries the printed text, so the game log can name it', () => {
  // Scryfall, Disposal Mummy: "When this creature enters, exile target card
  // from an opponent's graveyard."
  const text = "When this creature enters, exile target card from an opponent's graveyard.";
  const mummy = card({
    name: 'Disposal Mummy',
    oracle_id: '002a9cea-8cf7-48ba-83eb-e1c87a7024e5',
    type_line: 'Creature — Zombie Jackal',
    oracle_text: text,
  });

  const { result } = compileWithTrace(mummy);
  assert.equal(result.source, 'xmage');
  // XMage's own display strings are never copied; this came from Scryfall.
  for (const ability of result.abilities) assert.equal(ability.text, text);
});

test('a swapped card still accounts for every character of its oracle text', () => {
  // The assertion the whole compiler design leans on. A swap replaces the
  // ability list AND the consumed spans, so if it got the spans wrong this
  // throws. Running it here is what stops the swap from being a hole in the
  // no-silent-drop proof.
  const wrath = card({
    name: 'Wrath of God',
    oracle_id: '34515b16-c9a4-4f98-8c77-416a7a523407',
    type_line: 'Sorcery',
    oracle_text: "Destroy all creatures. They can't be regenerated.",
  });

  const trace = compileWithTrace(wrath);
  assert.equal(trace.result.source, 'xmage');
  assert.doesNotThrow(() => assertClausesAccounted(trace));
});

/* ------------------------------------------------------------------ *
 * The refusals. A port with no refusal tests has not shown it can say no.
 * ------------------------------------------------------------------ */

test('a card whose additional cast cost the record cannot carry is refused', () => {
  /*
   * Scryfall, Raze: "As an additional cost to cast this spell, sacrifice a
   * land. / Destroy target land."
   *
   * The record holds `xmage:SacrificeTargetCost` on the spell ability.
   * `SpellAbility` in `dsl.ts` has no cost list, so lowering this produced a
   * spell that destroyed a land for free. It RAN and it was wrong, which is the
   * failure this whole port refuses by construction.
   */
  const raze = card({
    name: 'Raze',
    oracle_id: '02fde433-955d-49df-bd72-270b6feac9e7',
    type_line: 'Sorcery',
    oracle_text: 'As an additional cost to cast this spell, sacrifice a land.\nDestroy target land.',
  });

  assert.equal(hasXmageRecord(raze.oracle_id!), false, 'must not be in the shipped table at all');
  const { result } = compileWithTrace(raze);
  assert.equal(result.source, 'compiler');
  assert.notEqual(result.coverage, 'full', 'the card stays honestly incomplete rather than running wrong');
});

test('a card whose modes read a target nothing announces is refused', () => {
  /*
   * Scryfall, Dawnbringer Cleric: "When this creature enters, choose one — /
   * • Cure Wounds — You gain 2 life. / • Dispel Magic — Destroy target
   * enchantment. / • Gentle Repose — Exile target card from a graveyard."
   *
   * A modal ability keeps its targets on each MODE. The lowering read the
   * ability's own empty target list, and every mode still came out holding
   * `{sel:'target', ref:0}` — an effect reading a target the ability never
   * announced.
   */
  const cleric = card({
    name: 'Dawnbringer Cleric',
    oracle_id: '0146f430-da82-48d3-a576-c2b05101797f',
    type_line: 'Creature — Human Cleric',
    oracle_text:
      'When this creature enters, choose one —\n• Cure Wounds — You gain 2 life.\n• Dispel Magic — Destroy target enchantment.\n• Gentle Repose — Exile target card from a graveyard.',
  });

  assert.equal(hasXmageRecord(cleric.oracle_id!), false);
  assert.equal(compileWithTrace(cleric).result.source, 'compiler');
});

test('no swapped ability anywhere in the shipped table reads a target it does not announce', () => {
  // The structural version of the test above, over the whole table rather than
  // one card, because the named card is evidence and the sweep is the promise.
  const table = XMAGE_LOWERED as unknown as Record<string, Array<Record<string, unknown>>>;

  const offenders: string[] = [];
  for (const [oracleId, abilities] of Object.entries(table)) {
    for (const ability of abilities) {
      const announced = new Set(
        ((ability.targets ?? []) as Array<{ ref: number }>).map((t) => t.ref),
      );
      const walk = (node: unknown): boolean => {
        if (Array.isArray(node)) return node.some(walk);
        if (!node || typeof node !== 'object') return false;
        const rec = node as Record<string, unknown>;
        if (rec.sel === 'target' && typeof rec.ref === 'number' && !announced.has(rec.ref)) return true;
        return Object.values(rec).some(walk);
      };
      if (walk(ability.effects)) offenders.push(`${oracleId} ${String(ability.id)}`);
    }
  }

  assert.deepEqual(offenders, []);
});

/* ------------------------------------------------------------------ *
 * The thing PORT-LOG.md said was zero
 * ------------------------------------------------------------------ */

test('the shipped table is not empty, which is the whole point of the wiring', () => {
  // `docs/engine/PORT-LOG.md` section 3 recorded "the number of cards the
  // shipped app plays from these records today is 0", because nothing outside
  // `src/lib/cards/xmage/` imported the module. This asserts the sign of that
  // number, not its value — a value here would be a second coverage figure
  // living somewhere `verify-ability-coverage.mjs` cannot correct it.
  assert.ok(xmageLoweredCardCount() > 0);
});

/* ------------------------------------------------------------------ *
 * The two clauses a swapped ability used to drop on the floor
 *
 * Both were found by an adversarial re-check on 23 Aug 2026, and both are the
 * same shape: the lowering read a clause, could not carry it, and emitted the
 * ability anyway. That is the failure PORT-LOG.md section 7 names as worse
 * than a refusal, because the card runs and is wrong.
 * ------------------------------------------------------------------ */

test('no shipped ability carries an intervening if the engine cannot see', () => {
  /*
   * `dslConditionHolds` in `src/lib/game/abilities/trigger-bridge.ts` gates on
   * `ability.condition` and returns TRUE when it is absent. The lowering used
   * to set `interveningIf: true` instead, a boolean nothing in `src/lib/game`
   * reads, so "at the beginning of your upkeep, IF YOU HAVE EXACTLY 1 LIFE,
   * you win the game" shipped as "at the beginning of your upkeep, you win the
   * game" — the condition was gone with no marker the engine could act on.
   *
   * The bar is therefore: an ability may carry a condition the engine reads, or
   * no condition at all, but never a note that one was dropped.
   */
  const table = XMAGE_LOWERED as unknown as Record<string, Array<Record<string, unknown>>>;
  const offenders: string[] = [];
  for (const [oracleId, abilities] of Object.entries(table)) {
    for (const ability of abilities) {
      if (ability.interveningIf) offenders.push(`${oracleId} ${String(ability.id)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('a swapped activated ability charges the mana the card prints', () => {
  /*
   * Notorious Assassin, Scryfall oracle text, quoted before anything is
   * asserted about it:
   *
   *   "{2}{B}, {T}, Discard a card: Destroy target nonblack creature. It can't
   *    be regenerated."
   *
   * XMage registers {T} and the discard with `addCost`, which the extraction
   * collects into `AbilityRecord.costs`, but passes the {2}{B} as a
   * CONSTRUCTOR ARGUMENT to `SimpleActivatedAbility`. Reading only the list
   * lowered this to tap-plus-discard, and an activated ability short of its
   * mana is one a player may use for less than the card says.
   */
  const assassin = card({
    oracle_id: '455138dd-4f76-4b40-9715-f1b1d61f8f23',
    name: 'Notorious Assassin',
    type_line: 'Creature — Human Spellshaper Assassin',
    oracle_text: "{2}{B}, {T}, Discard a card: Destroy target nonblack creature. It can't be regenerated.",
    mana_cost: '{3}{B}',
    power: '2',
    toughness: '2',
  });
  assert.ok(hasXmageRecord(assassin.oracle_id), 'the record this test is about must be in the shipped table');

  const abilities = compileWithTrace(assassin).result.abilities;
  const activated = abilities.filter((a) => a.kind === 'activated');
  assert.equal(activated.length, 1);

  const costs = (activated[0] as { costs?: Array<{ pay: string; cost?: string }> }).costs ?? [];
  const mana = costs.find((c) => c.pay === 'mana');
  assert.ok(mana, `the printed {2}{B} must be charged; costs were ${JSON.stringify(costs)}`);
  assert.equal(mana?.cost, '{2}{B}');
  assert.ok(costs.some((c) => c.pay === 'tap'), 'the {T} must survive the fix');
  assert.ok(costs.some((c) => c.pay === 'discard'), 'the discard must survive the fix');
});
