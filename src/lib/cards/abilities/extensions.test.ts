/**
 * The four cheap DSL extensions — E9 computed values, E6 watchers, E4 cost
 * modification, E8 conditional mana.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/extensions.test.ts
 *
 * ## What this file is allowed to claim
 *
 * These extensions raise what the DSL can **represent**. Not one of them
 * automates anything by itself, and several tests below exist specifically to
 * pin the shortfall: Rhystic Study now compiles to a complete, exact
 * `{do:'unless-pays'}` and the engine still cannot offer an opponent that
 * choice, so the ability bridge refuses to own the card. Both facts are
 * asserted, in the same file, on purpose.
 *
 * ## The four cards the spike named
 *
 * Doubling Season, Rhystic Study, Smothering Tithe and Dockside Extortionist
 * were all classified PARTIAL. Each has a test here that asserts what it now
 * expresses AND what it still does not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  Ability,
  ActivatedAbility,
  CardAbilities,
  Effect,
  ReplacementAbility,
  SpellAbility,
  StaticAbility,
  TriggeredAbility,
} from './dsl.ts';
import { assertSerialisable, isWatchableFilter, watchQueriesIn } from './dsl.ts';
import { compileCardAbilities, compileWithTrace, assertClausesAccounted } from './compiler.ts';
import type { AbilityCard } from './normalize.ts';
import {
  parseForEachValue,
  parseManaSpendRestriction,
  parseValueExpr,
  parseWatchValue,
} from './grammar.ts';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function card(name: string, typeLine: string, oracleText: string): AbilityCard {
  return {
    id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    oracle_id: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    name,
    type_line: typeLine,
    oracle_text: oracleText,
  };
}

/** Compile, and prove no text was silently dropped while doing it. */
function compile(name: string, typeLine: string, oracleText: string): CardAbilities {
  const trace = compileWithTrace(card(name, typeLine, oracleText));
  assertClausesAccounted(trace);
  assertSerialisable(trace.result);
  return trace.result;
}

function only<T extends Ability>(record: CardAbilities, kind: Ability['kind']): T {
  const matching = record.abilities.filter(ability => ability.kind === kind);
  assert.equal(matching.length, 1, `expected exactly one ${kind} ability on ${record.name}`);
  return matching[0] as T;
}

/* ================================================================== *
 * E9 — computed values
 * ================================================================== */

test('E9: the type space and the evaluator were already finished — the gap was the front end', () => {
  // This is the finding that reframes E9, pinned so it cannot quietly regress
  // into "we need to build a value subsystem". `ValueExpr` and `evalValue` have
  // always existed. What did not exist was any rule that CONSTRUCTED a
  // non-numeric one: the phrase below used to compile to a `{do:'manual'}` note
  // while the machinery to express it sat unused two files away.
  const value = parseValueExpr('the number of creatures you control');
  assert.deepEqual(value, {
    v: 'count',
    of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' },
  });
});

test('E9: "artifacts and enchantments" is a union, not an intersection', () => {
  // "The number of artifacts and enchantments your opponents control" counts
  // permanents that are EITHER. Read as an intersection it would count only
  // artifact enchantments, which is almost always zero — Dockside Extortionist
  // making no Treasures rather than five.
  const value = parseValueExpr('the number of artifacts and enchantments your opponents control');
  assert.deepEqual(value, {
    v: 'count',
    of: {
      sel: 'all',
      where: { is: 'or', of: [{ is: 'type', value: 'artifact' }, { is: 'type', value: 'enchantment' }] },
      controller: { who: 'each-opponent' },
      zone: 'battlefield',
    },
  });
});

test('E9: splitting heads on "and" cannot swallow a sentence', () => {
  // The guard that makes the union above safe: every head must still parse as a
  // type. "Draw a card" does not, so the whole phrase is refused rather than
  // becoming a filter that matches something.
  assert.equal(parseValueExpr('the number of creatures and draw a card'), null);
});

test('E9: "where X is …" binds X for the phrase and nothing outside it', () => {
  const record = compile(
    'Bound X',
    'Sorcery',
    'Draw X cards, where X is the number of creatures you control.',
  );
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.deepEqual(spell.effects, [
    {
      do: 'draw',
      who: { who: 'you' },
      count: {
        v: 'count',
        of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' },
      },
    },
  ]);
});

test('E9: an unbound X stays {v:"x"} — the announced X, which is a different number', () => {
  // Conflating the two is the bug this guard exists for: "create X Treasures"
  // with no binding must mean the X the caster announced, not a board count.
  const record = compile('Loose X', 'Sorcery', 'Draw X cards.');
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.deepEqual(spell.effects, [{ do: 'draw', who: { who: 'you' }, count: { v: 'x' } }]);
});

test('E9: "for each" scales the one quantity it can see', () => {
  const record = compile('Scaler', 'Sorcery', 'You gain 2 life for each creature you control.');
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.deepEqual(spell.effects, [
    {
      do: 'gain-life',
      who: { who: 'you' },
      amount: {
        v: 'mul',
        of: [
          2,
          { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' } },
        ],
      },
    },
  ]);
});

test('E9: a base of 1 is not wrapped in a pointless multiplication', () => {
  const record = compile('Simple Scaler', 'Sorcery', 'You gain 1 life for each opponent.');
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.deepEqual(spell.effects, [
    { do: 'gain-life', who: { who: 'you' }, amount: { v: 'count-players', of: { who: 'each-opponent' } } },
  ]);
});

test('E9: "for each" never scales more than the one clause it is attached to', () => {
  // The scaler itself refuses a left half that compiled to two effects — it has
  // no way to say which of them repeats. What happens next is the pre-existing
  // connective splitter, which splits on " and " and attaches the modifier to
  // the NEAREST clause. That is the standard reading of both English and Magic
  // templating, and the assertion is here so the scope is pinned rather than
  // assumed: the life gain stays at its literal 1, and only the draw scales.
  const record = compile(
    'Nearest Clause',
    'Sorcery',
    'You gain 1 life and draw a card for each creature you control.',
  );
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  const creatures = {
    v: 'count',
    of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' },
  };
  assert.deepEqual(spell.effects, [
    { do: 'gain-life', who: { who: 'you' }, amount: 1 },
    { do: 'draw', who: { who: 'you' }, count: creatures },
  ]);
});

test('E9: "for each" over an effect with no quantity is refused', () => {
  assert.equal(parseForEachValue('gizmo you control'), null, 'an unread noun refuses');
  const record = compile('No Quantity', 'Sorcery', 'Destroy all creatures for each artifact you control.');
  const spell = record.abilities.find(ability => ability.kind === 'spell') as
    | (Ability & { effects: Effect[] })
    | undefined;
  const effects = spell?.effects ?? [];
  assert.ok(
    effects.length === 0 || effects.some(effect => effect.do === 'manual'),
    'destroy has no number to scale, so the phrase must not compile',
  );
});

test('E9: Dockside Extortionist — the spike called this PARTIAL; it is now exact', () => {
  const record = compile(
    'Dockside Extortionist',
    'Creature — Goblin Pirate',
    'When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.',
  );

  assert.equal(record.coverage, 'full');
  const trigger = only<TriggeredAbility>(record, 'triggered');
  assert.deepEqual(trigger.event, { on: 'enters', who: { sel: 'self' } });
  assert.deepEqual(trigger.effects, [
    {
      do: 'create-token',
      who: { who: 'you' },
      token: { name: 'Treasure', typeLine: 'Token Artifact — Treasure' },
      count: {
        v: 'count',
        of: {
          sel: 'all',
          where: { is: 'or', of: [{ is: 'type', value: 'artifact' }, { is: 'type', value: 'enchantment' }] },
          controller: { who: 'each-opponent' },
          zone: 'battlefield',
        },
      },
    },
  ]);
  assert.equal(trigger.confidence, 'exact');
});

/* ================================================================== *
 * E6 — watchers
 * ================================================================== */

test('E6: a watcher is a QUERY, and the query is pure JSON', () => {
  const value = parseWatchValue('creatures that died this turn');
  assert.deepEqual(value, {
    v: 'watch',
    query: {
      event: { saw: 'died', what: { is: 'type', value: 'creature' } },
      window: 'this-turn',
      measure: 'events',
    },
  });
  // The whole point: it survives serialisation, so it can live in a jsonb
  // column and be replayed identically on a second client.
  assertSerialisable(value);
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
  assert.deepEqual(structuredClone(value), value);
});

test('E6: cards drawn is measured as an AMOUNT, not as a count of draw events', () => {
  // One DRAW action of three cards is three cards. Counting events would make
  // "for each card you've drawn this turn" answer 1 after a Divination.
  assert.deepEqual(parseWatchValue('cards youve drawn this turn'), {
    v: 'watch',
    query: { event: { saw: 'drew', by: { who: 'you' } }, window: 'this-turn', measure: 'amount' },
  });
});

test('E6: only filters a past snapshot can answer are allowed into a query', () => {
  // A snapshot records what does not move. Power, keywords and tapped state all
  // change after the event, so a remembered value would be a fabrication.
  assert.equal(isWatchableFilter({ is: 'type', value: 'creature' }), true);
  assert.equal(isWatchableFilter({ is: 'token' }), true);
  assert.equal(isWatchableFilter({ is: 'mana-value', cmp: 'lte', value: 3 }), true);
  assert.equal(isWatchableFilter({ is: 'tapped' }), false);
  assert.equal(isWatchableFilter({ is: 'keyword', value: 'flying' }), false);
  assert.equal(isWatchableFilter({ is: 'power', cmp: 'gte', value: 4 }), false);
  assert.equal(
    isWatchableFilter({ is: 'mana-value', cmp: 'lte', value: { v: 'x' } }),
    false,
    'a computed bound needs a live context the snapshot does not have',
  );
  // And the grammar honours it: "tapped creatures that died this turn" is
  // refused rather than compiled into a query that would under-count.
  assert.equal(parseWatchValue('tapped creatures that died this turn'), null);
});

test('E6: a history phrase compiles end to end, and the card carries the query', () => {
  const record = compile(
    'Graveyard Tally',
    'Sorcery',
    'You gain 1 life for each creature that died this turn.',
  );
  assert.equal(record.coverage, 'full');
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  const queries = watchQueriesIn(spell.effects);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0], {
    event: { saw: 'died', what: { is: 'type', value: 'creature' } },
    window: 'this-turn',
    measure: 'events',
  });
});

test('E6: HONEST SHORTFALL — representable does not mean the engine answers it', () => {
  // The card above is `coverage: 'full'`. That is a statement about the DSL and
  // nothing else. No caller folds an action log, so the value evaluates to 0,
  // and 0 is a WRONG answer rather than a small one. This assertion is the
  // reason a reader of the coverage number cannot mistake it for automation.
  const record = compile(
    'Graveyard Tally',
    'Sorcery',
    'You gain 1 life for each creature that died this turn.',
  );
  assert.equal(record.coverage, 'full', 'representable');
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.ok(watchQueriesIn(spell.effects).length > 0, 'and dependent on history nothing supplies');
});

test('E6: the flat tail is refused rather than approximated', () => {
  // 56 distinct spellings of "for each … this turn" across 135 rows. Seven
  // templates are worth a rule; the rest come back null and land in `manual`,
  // where they are counted. Guessing at them is how a wrong number ships.
  assert.equal(parseWatchValue('permanents sacrificed this turn'), null);
  assert.equal(parseWatchValue('opponents who lost life this turn'), null);
  assert.equal(parseWatchValue('cards youve cycled or discarded this turn'), null);
  assert.equal(parseWatchValue('creatures you control'), null, 'no "this turn" is not a history phrase');
});

/* ================================================================== *
 * E4 — cost modification
 * ================================================================== */

test('E4: "you cast" discounts only the controller', () => {
  const record = compile('Foundry Inspector', 'Artifact Creature — Construct', 'Artifact spells you cast cost {1} less to cast.');
  const stat = only<StaticAbility>(record, 'static');
  assert.deepEqual(stat.modifications, [
    {
      layer: 'cost-modify',
      applies: { sel: 'all', where: { is: 'type', value: 'artifact' }, zone: 'stack' },
      delta: -1,
      genericOnly: true,
      forWhom: { who: 'you' },
    },
  ]);
});

test('E4: a tax with no "you cast" applies to the controller too', () => {
  // The old rule hardcoded `forWhom: you` on every cost clause, which turned
  // Sphere of Resistance into a one-sided tax the caster silently never paid.
  const record = compile('Sphere of Resistance', 'Artifact', 'Spells cost {1} more to cast.');
  const stat = only<StaticAbility>(record, 'static');
  assert.deepEqual(stat.modifications[0], {
    layer: 'cost-modify',
    applies: { sel: 'all', where: { is: 'any' }, zone: 'stack' },
    delta: 1,
    genericOnly: true,
    forWhom: { who: 'each-player' },
  });
});

test('E4: "spells your opponents cast" taxes only them', () => {
  const record = compile('One Sided', 'Artifact', 'Spells your opponents cast cost {2} more to cast.');
  const stat = only<StaticAbility>(record, 'static');
  assert.deepEqual((stat.modifications[0] as { forWhom: unknown }).forWhom, { who: 'each-opponent' });
});

test('E4 x E9: "for each" makes the delta a computed value', () => {
  const record = compile(
    'Cheap Thing',
    'Artifact',
    'This spell costs {1} less to cast for each artifact you control.',
  );
  const stat = only<StaticAbility>(record, 'static');
  assert.deepEqual(stat.modifications[0], {
    layer: 'cost-modify',
    applies: { sel: 'self' },
    delta: {
      v: 'mul',
      of: [
        -1,
        { v: 'count', of: { sel: 'all', where: { is: 'type', value: 'artifact' }, controller: { who: 'you' }, zone: 'battlefield' } },
      ],
    },
    genericOnly: true,
    forWhom: { who: 'you' },
  });
});

test('E4: an unreadable "for each" refuses the whole cost clause', () => {
  // A cost modifier read half-right is a spell cast for the wrong price, and
  // there is no marker that makes a wrong price safe.
  const record = compile(
    'Unreadable',
    'Artifact',
    'This spell costs {1} less to cast for each gizmo you control.',
  );
  assert.equal(record.abilities.filter(ability => ability.kind === 'static').length, 0);
  assert.notEqual(record.coverage, 'full');
});

test('E4: Rhystic Study — the spike called this PARTIAL; the clause is now exact', () => {
  const record = compile(
    'Rhystic Study',
    'Enchantment',
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
  );

  assert.equal(record.coverage, 'full');
  const trigger = only<TriggeredAbility>(record, 'triggered');
  assert.deepEqual(trigger.effects, [
    {
      do: 'unless-pays',
      // "That player" — the one opponent whose cast fired this, not all of them.
      who: { who: 'trigger-player' },
      cost: [{ pay: 'mana', cost: '{1}' }],
      effects: [
        {
          do: 'may',
          who: { who: 'you' },
          text: 'you may draw a card',
          effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }],
        },
      ],
    },
  ]);
});

test('E4: HONEST SHORTFALL — Rhystic Study is exact and still not automated', () => {
  // The polarity, the payer and the cost are all recorded correctly, and the
  // engine still cannot offer an opponent a choice from inside a pure effect
  // interpreter. `trigger-bridge.ts` asserts the matching half: the ability
  // engine refuses to own the card, so the old detector keeps asking for it by
  // hand rather than the new one resolving it wrongly.
  const record = compile(
    'Rhystic Study',
    'Enchantment',
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
  );
  const trigger = only<TriggeredAbility>(record, 'triggered');
  assert.equal(trigger.effects[0].do, 'unless-pays');
});

test('E4: Smothering Tithe — the other spelling of the same rule', () => {
  const record = compile(
    'Smothering Tithe',
    'Enchantment',
    "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
  );

  assert.equal(record.coverage, 'full');
  const trigger = only<TriggeredAbility>(record, 'triggered');
  assert.deepEqual(trigger.event, { on: 'draws-card', whose: { who: 'each-opponent' } });
  assert.deepEqual(trigger.effects, [
    {
      do: 'unless-pays',
      who: { who: 'trigger-player' },
      cost: [{ pay: 'mana', cost: '{2}' }],
      effects: [
        {
          do: 'create-token',
          who: { who: 'you' },
          token: { name: 'Treasure', typeLine: 'Token Artifact — Treasure' },
          count: 1,
        },
      ],
    },
  ]);
});

test('E4: unless-pays is not an inverted "may" — the polarity is asserted', () => {
  // `may` asks the controller and acts on YES. `unless-pays` asks somebody else
  // and acts on NO. Swapping them resolves Smothering Tithe backwards: a
  // Treasure for every opponent who DID pay.
  const record = compile(
    'Smothering Tithe',
    'Enchantment',
    "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
  );
  const trigger = only<TriggeredAbility>(record, 'triggered');
  const outer = trigger.effects[0] as Extract<Effect, { do: 'unless-pays' }>;
  assert.equal(outer.do, 'unless-pays');
  assert.notDeepEqual(outer.who, { who: 'you' }, 'the payer is never the controller');
});

/* ------------------------------------------------------------------ *
 * E4, widened: the payer is named by the record, not by the rule.
 *
 * "Unless its controller pays" was on the named-manual list for a year while
 * `{do:'unless-pays'}` sat one rule above it, because the payer is the
 * controller of the TARGET and the target does not exist until the inner
 * phrase has registered it. Oracle text below is verbatim from `cards_unique`.
 * ------------------------------------------------------------------ */

test('E4: Mana Leak — "its controller" is the controller of the target, and nobody else', () => {
  const record = compile('Mana Leak', 'Instant', 'Counter target spell unless its controller pays {3}.');
  assert.equal(record.coverage, 'full');
  const spell = only<SpellAbility>(record, 'spell');
  assert.deepEqual(spell.effects, [
    {
      do: 'unless-pays',
      who: { who: 'controller-of', of: { sel: 'target', ref: 0 } },
      cost: [{ pay: 'mana', cost: '{3}' }],
      effects: [{ do: 'counter', what: { sel: 'target', ref: 0 } }],
    },
  ]);
  assert.equal(spell.targets?.length, 1, 'one target, announced once, shared by the tax and the counter');
  assert.equal(spell.targets?.[0].zone, 'stack');
});

test('E4: Force Spike and Spell Pierce — the filter rides on the target, the tax on the wrapper', () => {
  const spike = compile('Force Spike', 'Instant', 'Counter target spell unless its controller pays {1}.');
  assert.equal(spike.coverage, 'full');
  assert.deepEqual(only<SpellAbility>(spike, 'spell').effects[0].do, 'unless-pays');

  const pierce = compile('Spell Pierce', 'Instant', 'Counter target noncreature spell unless its controller pays {2}.');
  assert.equal(pierce.coverage, 'full');
  const spell = only<SpellAbility>(pierce, 'spell');
  assert.deepEqual(spell.targets?.[0].filter, {
    is: 'and',
    of: [{ is: 'any' }, { is: 'not', of: { is: 'type', value: 'creature' } }],
  });
  const outer = spell.effects[0] as Extract<Effect, { do: 'unless-pays' }>;
  assert.deepEqual(outer.cost, [{ pay: 'mana', cost: '{2}' }]);
});

test('E4: Syncopate — an UNBOUND {X} is the announced X and stays a mana string', () => {
  // The X in "pays {X}" is the X in Syncopate's own mana cost. No where-clause
  // binds it, so it is the number the caster announced, exactly as printed.
  // The second sentence is a replacement the compiler does not read, so the
  // card is partial and the counter still stands.
  const record = compile(
    'Syncopate',
    'Instant',
    "Counter target spell unless its controller pays {X}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
  );
  assert.equal(record.coverage, 'partial');
  const spell = only<SpellAbility>(record, 'spell');
  const outer = spell.effects[0] as Extract<Effect, { do: 'unless-pays' }>;
  assert.equal(outer.do, 'unless-pays');
  assert.deepEqual(outer.cost, [{ pay: 'mana', cost: '{X}' }]);
});

test('E4: Esper Sentinel — a BOUND {X} is a computed generic cost, and "their first" is a condition', () => {
  const record = compile(
    'Esper Sentinel',
    'Artifact Creature — Human Soldier',
    "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
  );
  assert.equal(record.coverage, 'full');
  const trigger = only<TriggeredAbility>(record, 'triggered');

  const noncreature = { is: 'and', of: [{ is: 'any' }, { is: 'not', of: { is: 'type', value: 'creature' } }] };
  // The event is the same cast event Mystic Remora carries. The ordinal is
  // not folded into it.
  assert.deepEqual(trigger.event, {
    on: 'cast',
    what: { sel: 'all', where: noncreature, zone: 'stack' },
    by: { who: 'each-opponent' },
  });
  // "Their first ... each turn": at the moment this is checked, that player
  // has cast exactly one noncreature spell this turn, the one that fired it.
  assert.deepEqual(trigger.condition, {
    if: 'value',
    a: {
      v: 'watch',
      query: {
        event: { saw: 'spell-cast', what: noncreature, by: { who: 'trigger-player' } },
        window: 'this-turn',
        measure: 'events',
      },
    },
    cmp: 'eq',
    b: 1,
  });
  assert.deepEqual(trigger.effects, [
    {
      do: 'unless-pays',
      who: { who: 'trigger-player' },
      // NOT `{pay:'mana', cost:'{X}'}`: that X would be the payer's own
      // announcement, and this one is read off the Sentinel.
      cost: [{ pay: 'generic-mana', amount: { v: 'power', of: { sel: 'self' } } }],
      effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }],
    },
  ]);
});

test('E4: Mausoleum Wanderer — the computed X reaches an activated ability too', () => {
  const record = compile(
    'Mausoleum Wanderer',
    'Creature — Spirit',
    "Flying\nWhenever another Spirit you control enters, this creature gets +1/+1 until end of turn.\nSacrifice this creature: Counter target instant or sorcery spell unless its controller pays {X}, where X is this creature's power.",
  );
  assert.equal(record.coverage, 'full');
  const activated = only<ActivatedAbility>(record, 'activated');
  const outer = activated.effects[0] as Extract<Effect, { do: 'unless-pays' }>;
  assert.equal(outer.do, 'unless-pays');
  assert.deepEqual(outer.who, { who: 'controller-of', of: { sel: 'target', ref: 0 } });
  assert.deepEqual(outer.cost, [{ pay: 'generic-mana', amount: { v: 'power', of: { sel: 'self' } } }]);
});

test('E4: "~s power" is the source, and "its power" is still nobody', () => {
  assert.deepEqual(parseValueExpr('~s power'), { v: 'power', of: { sel: 'self' } });
  assert.deepEqual(parseValueExpr('~s toughness'), { v: 'toughness', of: { sel: 'self' } });
  // Bound by a sentence this function cannot see. Guessing the source here is
  // how "deals damage equal to its power" hits with the wrong number.
  assert.equal(parseValueExpr('its power'), null);
});

test('E4: a tax the cost grammar cannot spell is REFUSED, not rounded', () => {
  // "{2} plus an additional {1} for each Faerie you control" is not a mana
  // string, and reading it as {2} would let every opponent buy out of Spell
  // Stutter for two. The whole spell stays unread rather than half-priced.
  const stutter = compile(
    'Spell Stutter',
    'Instant',
    'Counter target spell unless its controller pays {2} plus an additional {1} for each Faerie you control.',
  );
  assert.equal(stutter.abilities.filter(ability => ability.kind === 'spell').length, 0);
  assert.equal(stutter.coverage, 'manual');

  // "Mana equal to the greatest power among creatures you control" likewise.
  // The first sentence reads; the tax does not, and lands as a marker.
  const mutation = compile(
    'Repulsive Mutation',
    'Instant',
    'Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control.',
  );
  assert.equal(mutation.coverage, 'partial');
  const spell = only<SpellAbility>(mutation, 'spell');
  assert.ok(spell.effects.every(effect => effect.do !== 'unless-pays'), 'no tax was invented');
  assert.ok(spell.effects.some(effect => effect.do === 'manual'), 'and the clause is marked, not dropped');
});

test('E4: Lotho — the ordinal counts spells, "second" is two, and "a player" is that player', () => {
  const record = compile(
    'Lotho, Corrupt Shirriff',
    'Legendary Creature — Halfling Advisor',
    'Whenever a player casts their second spell each turn, you lose 1 life and create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
  );
  assert.equal(record.coverage, 'full');
  const trigger = only<TriggeredAbility>(record, 'triggered');
  assert.deepEqual(trigger.event.on, 'cast');
  assert.deepEqual(trigger.condition, {
    if: 'value',
    a: { v: 'watch', query: { event: { saw: 'spell-cast', by: { who: 'trigger-player' } }, window: 'this-turn', measure: 'events' } },
    cmp: 'eq',
    b: 2,
  });
});

test('E4: Trouble in Pairs — a compound trigger with an ordinal inside it is still refused whole', () => {
  // Three events joined by "or", one of them ordinal. Reading the cast half
  // alone would fire on second spells and never on the attack or the draw,
  // which is a different card. Nothing is produced.
  const record = compile(
    'Trouble in Pairs',
    'Enchantment',
    'If an opponent would begin an extra turn, that player skips that turn instead.\nWhenever an opponent attacks you with two or more creatures, draws their second card each turn, or casts their second spell each turn, you draw a card.',
  );
  assert.equal(record.abilities.filter(ability => ability.kind === 'triggered').length, 0);
});

/* ================================================================== *
 * E8 — conditional mana
 * ================================================================== */

test('E8: a spend restriction rides on the mana that carries it', () => {
  const record = compile(
    'Ancient Ziggurat',
    'Land',
    '{T}: Add one mana of any color. Spend this mana only to cast a creature spell.',
  );
  assert.equal(record.coverage, 'full');
  const ability = only<ActivatedAbility>(record, 'activated');
  const modal = ability.effects[0] as Extract<Effect, { do: 'choose-mode' }>;
  assert.equal(modal.do, 'choose-mode');
  assert.equal(modal.modes.length, 5, 'five colours, which is what "any color" means');
  for (const mode of modal.modes) {
    const mana = mode.effects[0] as Extract<Effect, { do: 'add-mana' }>;
    assert.deepEqual(mana.restriction, {
      spendOn: 'cast',
      what: { is: 'type', value: 'creature' },
      text: 'spend this mana only to cast a creature spell',
    });
  }
});

test('E8: a restriction the grammar cannot read refuses the whole clause', () => {
  // Cavern of Souls says "only to cast a creature spell of the chosen type".
  // The chosen type is a hidden choice we do not model, and mana restricted to
  // it must NOT become mana restricted to creatures — that would let it pay for
  // a creature the card never allowed.
  assert.equal(parseManaSpendRestriction('Spend this mana only to cast a creature spell of the chosen type'), null);
  assert.equal(parseManaSpendRestriction('Spend this mana only on costs that contain {X}'), null);

  const record = compile(
    'Cavern of Souls',
    'Land',
    '{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type.',
  );
  const ability = only<ActivatedAbility>(record, 'activated');
  assert.ok(
    ability.effects.some(effect => effect.do === 'manual'),
    'the refused restriction becomes a visible note, never a dropped one',
  );
});

test('E8: a restriction is never dropped while the mana is kept', () => {
  // The failure mode this guards: peel the restriction off, fail to reattach
  // it, and ship unrestricted mana that the card said was restricted. The
  // compiler recompiles the ORIGINAL text when nothing claimed the restriction.
  const record = compile(
    'Two Uses',
    'Land',
    '{T}: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.',
  );
  const ability = only<ActivatedAbility>(record, 'activated');
  const mana = ability.effects[0] as Extract<Effect, { do: 'add-mana' }>;
  assert.equal(mana.do, 'add-mana');
  assert.deepEqual(mana.restriction, {
    spendOn: 'cast-or-activate',
    what: { is: 'type', value: 'artifact' },
    text: 'spend this mana only to cast artifact spells or activate abilities of artifacts',
  });
});

test('E8: the two halves of a "cast or activate" restriction must agree', () => {
  // Creature mana that could activate artifact abilities would be a different
  // card. Disagreeing noun phrases refuse rather than picking one.
  assert.equal(
    parseManaSpendRestriction('Spend this mana only to cast creature spells or activate abilities of artifacts'),
    null,
  );
});

test('E8 x E9: "Add {G} for each creature you control" is a computed mana count', () => {
  const record = compile("Gaea's Cradle", 'Legendary Land', '{T}: Add {G} for each creature you control.');
  assert.equal(record.coverage, 'full');
  const ability = only<ActivatedAbility>(record, 'activated');
  assert.equal(ability.isManaAbility, true, 'still a mana ability — it does not use the stack');
  assert.deepEqual(ability.effects, [
    {
      do: 'add-mana',
      who: { who: 'you' },
      mana: '{G}',
      count: {
        v: 'count',
        of: { sel: 'all', where: { is: 'type', value: 'creature' }, controller: { who: 'you' }, zone: 'battlefield' },
      },
    },
  ]);
});

/* ================================================================== *
 * Doubling Season — a replacement the DSL could always express
 * ================================================================== */

test('Doubling Season — the spike called this PARTIAL; it compiled to nothing at all', () => {
  // Its coverage was 'manual': both paragraphs landed in `unparsed` as
  // 'unrecognised'. `{do:'multiply'}` and both events had been in the DSL since
  // it was written — the front end had no rule that produced them. Two regexes,
  // and a card the compiler read none of becomes a card it reads entirely.
  const record = compile(
    'Doubling Season',
    'Enchantment',
    'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\n' +
      'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
  );

  assert.equal(record.coverage, 'full');
  assert.deepEqual(record.unparsed, []);

  const replacements = record.abilities.filter(
    (ability): ability is ReplacementAbility => ability.kind === 'replacement',
  );
  assert.equal(replacements.length, 2);

  assert.deepEqual(replacements[0].event, { on: 'token-created', whose: { who: 'you' } });
  assert.deepEqual(replacements[0].result, { do: 'multiply', factor: 2 });

  assert.deepEqual(replacements[1].event, {
    on: 'counter-placed',
    target: { sel: 'all', where: { is: 'any' }, controller: { who: 'you' }, zone: 'battlefield' },
  });
  assert.deepEqual(replacements[1].result, { do: 'multiply', factor: 2 });

  // `counter` is deliberately ABSENT, meaning any kind. Naming '+1/+1' would
  // double +1/+1 counters and quietly not double loyalty — half the card.
  assert.equal('counter' in replacements[1].event, false);
});

test('Doubling Season: HONEST SHORTFALL — no triggers, so nothing runs it', () => {
  // Fully representable, entirely unautomated. The card has no triggered
  // ability, so `abilityEngineOwns` never claims it, and `replacement.ts` is
  // handed no list built from compiled abilities. It is a correct record of
  // what the card does, waiting for a consumer.
  const record = compile(
    'Doubling Season',
    'Enchantment',
    'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\n' +
      'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
  );
  assert.equal(record.abilities.every(ability => ability.kind === 'replacement'), true);
});

/* ================================================================== *
 * Invariants the extensions must not break
 * ================================================================== */

test('every new construct survives structuredClone and JSON round-tripping', () => {
  const cards: CardAbilities[] = [
    compile('Dockside Extortionist', 'Creature — Goblin Pirate', 'When this creature enters, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.'),
    compile('Rhystic Study', 'Enchantment', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.'),
    compile('Smothering Tithe', 'Enchantment', "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token."),
    compile('Doubling Season', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.'),
    compile('Ancient Ziggurat', 'Land', '{T}: Add one mana of any color. Spend this mana only to cast a creature spell.'),
    compile("Gaea's Cradle", 'Legendary Land', '{T}: Add {G} for each creature you control.'),
    compile('Graveyard Tally', 'Sorcery', 'You gain 1 life for each creature that died this turn.'),
    compile('Sphere of Resistance', 'Artifact', 'Spells cost {1} more to cast.'),
  ];

  for (const record of cards) {
    assertSerialisable(record);
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record, `${record.name} through JSON`);
    assert.deepEqual(structuredClone(record), record, `${record.name} through structuredClone`);
  }
});

test('no silent drops: the clause-accounting proof still holds on every new shape', () => {
  // `compile` runs `assertClausesAccounted` on every card above, so this test
  // is really about the shapes that PARTIALLY parse — where a new rule is most
  // likely to consume text without recording that it did.
  for (const [name, typeLine, text] of [
    /* This fixture used to end "Scry 2." and it stopped being half read on
       2026-08-30, when scry got the rule its DSL member had been waiting for.
       The card now genuinely IS fully covered, so the fixture was wrong rather
       than the assertion, and the unreadable half is a clause that is still
       unreadable. Proliferate needs a player-directed choice across any number
       of permanents and the vocabulary has no member for it. */
    ['Half Read', 'Sorcery', 'You gain 1 life for each creature you control. Proliferate.'],
    ['Restriction Only', 'Land', '{T}: Add {C}. Spend this mana only on costs that contain {X}.'],
    ['Bad Binding', 'Sorcery', 'Draw X cards, where X is the number of gizmos you control.'],
  ] as const) {
    const trace = compileWithTrace(card(name, typeLine, text));
    assertClausesAccounted(trace);
    assert.notEqual(trace.result.coverage, 'full', `${name} must not claim full coverage`);
  }
});

/* ================================================================== *
 * False positives the extensions surfaced, and now refuse
 *
 * Both of these were PRE-EXISTING defects that E9 made more common: binding
 * "where X is …" let phrases through that used to fail their anchor, and the
 * rules on the other side of that anchor had been quietly rounding a computed
 * quantity down to a literal. Precision over recall means they cost coverage,
 * and they did — 22 cards left `coverage: 'full'` when these landed.
 * ================================================================== */

test('an X/X token is refused, because TokenSpec has no place to put a computed power', () => {
  // `TokenSpec.power` is a printed STRING. Emitting "x" there puts the literal
  // letter where a number belongs: `powerOf` reads it as 0, state-based actions
  // bin the token immediately, and the card looks like it resolved.
  const record = compile(
    'Slime Molding',
    'Sorcery',
    'Create an X/X green Ooze creature token.',
  );
  assert.equal(record.coverage, 'manual');
  assert.deepEqual(record.abilities, []);

  // And it stays refused when E9 CAN read the X — being able to read half a
  // sentence is not permission to compile it.
  const bound = compile(
    'Gelatinous Genesis',
    'Sorcery',
    'Create X X/X green Ooze creature tokens, where X is the number of lands you control.',
  );
  assert.notEqual(bound.coverage, 'full');
});

test('a computed number of TARGETS is refused, not rounded down to one', () => {
  // `TargetSpec.min`/`max` are numbers. "Destroy X target artifacts" used to
  // compile to a single target — a card that destroyed one artifact and
  // reported success.
  const record = compile('By Force', 'Sorcery', 'Destroy X target artifacts.');
  assert.equal(record.coverage, 'manual');
  assert.deepEqual(record.abilities, []);
});

test('a LITERAL number of targets is still read, and read faithfully', () => {
  // The fix above must not have thrown away the ordinary case with the broken
  // one: "up to two target creature cards" is three numbers, and all three are
  // now right where the old rule hardcoded max:1.
  const record = compile(
    'Twofold Return',
    'Sorcery',
    'Return up to two target creature cards from your graveyard to your hand.',
  );
  const spell = only<Ability & { effects: Effect[]; targets?: Array<Record<string, unknown>> }>(record, 'spell');
  assert.equal(spell.targets?.length, 1);
  assert.equal(spell.targets?.[0].min, 0, '"up to" means zero is legal');
  assert.equal(spell.targets?.[0].max, 2);
  assert.equal(spell.targets?.[0].distinct, true);
});

/* ================================================================== *
 * E9 — a pump sized by the pumped creature's own power
 *
 * "gets +X/+X until end of turn, where X is that creature's power". The
 * generic ", where X is …" binding cannot reach it because `parseValueExpr`
 * refuses "its power" on principle — a subject bound by an earlier sentence is
 * a guess. In THIS shape the phrase that binds X is the phrase that names the
 * creature, so the pump's own selector is the value's subject and nothing is
 * guessed. Oracle text below is Scryfall's, verbatim.
 * ================================================================== */

test('pump-by-own-stat: Xenagos doubles the creature he points at, and X is that target', () => {
  const record = compile(
    'Xenagos, God of Revels',
    'Legendary Enchantment Creature — God',
    "Indestructible\nAs long as your devotion to red and green is less than seven, Xenagos isn't a creature.\nAt the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power.",
  );
  const trigger = only<TriggeredAbility>(record, 'triggered');
  const target = { sel: 'target', ref: 0 } as const;
  assert.deepEqual(trigger.effects, [
    {
      do: 'pump',
      what: target,
      power: { v: 'power', of: target },
      toughness: { v: 'power', of: target },
      grant: ['haste'],
      duration: 'end-of-turn',
    },
  ]);
  assert.equal(trigger.targets?.length, 1);
  // The devotion clause is a different shape and is still refused. Only the
  // ability this rule is for is claimed, and the card says so.
  assert.equal(record.coverage, 'partial');
  assert.equal(record.unparsed?.length, 1);
});

test('pump-by-own-stat: "its power" on a target is the target; "+X/+0" leaves toughness alone', () => {
  const record = compile(
    'Berserk',
    'Instant',
    "Cast this spell only before the combat damage step.\nTarget creature gains trample and gets +X/+0 until end of turn, where X is its power. At the beginning of the next end step, destroy that creature if it attacked this turn.",
  );
  const spell = only<Ability & { effects: Effect[] }>(record, 'spell');
  assert.deepEqual(spell.effects[0], {
    do: 'pump',
    what: { sel: 'target', ref: 0 },
    power: { v: 'power', of: { sel: 'target', ref: 0 } },
    toughness: 0,
    grant: ['trample'],
    duration: 'end-of-turn',
  });
  // The delayed destroy is not this rule's to claim.
  assert.ok(spell.effects.some(e => e.do === 'manual'), JSON.stringify(spell.effects));
});

test('pump-by-own-stat: "its power" on the source is the source, and "that creature\'s" on a target is the target', () => {
  const colossus = compile(
    'Chameleon Colossus',
    'Creature — Shapeshifter',
    'Changeling (This card is every creature type.)\nProtection from black\n{2}{G}{G}: This creature gets +X/+X until end of turn, where X is its power.',
  );
  const activated = only<ActivatedAbility>(colossus, 'activated');
  assert.deepEqual(activated.effects, [
    {
      do: 'pump',
      what: { sel: 'self' },
      power: { v: 'power', of: { sel: 'self' } },
      toughness: { v: 'power', of: { sel: 'self' } },
      duration: 'end-of-turn',
    },
  ]);
  assert.equal(colossus.coverage, 'full');

  const mentor = compile(
    'Nantuko Mentor',
    'Creature — Insect Druid',
    "{2}{G}, {T}: Target creature gets +X/+X until end of turn, where X is that creature's power.",
  );
  const tap = only<ActivatedAbility>(mentor, 'activated');
  assert.deepEqual((tap.effects[0] as Extract<Effect, { do: 'pump' }>).power, { v: 'power', of: { sel: 'target', ref: 0 } });
  assert.equal(mentor.coverage, 'full');
});

test('pump-by-own-stat: "this creature\'s power" is the source whatever the subject, and toughness is read as toughness', () => {
  // Wild Beastmaster pumps EVERY other creature by HIS power. The subject is
  // plural, which would be refused for "its", but the value names the source.
  const beastmaster = compile(
    'Wild Beastmaster',
    'Creature — Human Shaman',
    "Whenever this creature attacks, each other creature you control gets +X/+X until end of turn, where X is this creature's power.",
  );
  const trigger = only<TriggeredAbility>(beastmaster, 'triggered');
  const pump = trigger.effects[0] as Extract<Effect, { do: 'pump' }>;
  assert.equal(pump.what.sel, 'all');
  assert.deepEqual(pump.power, { v: 'power', of: { sel: 'self' } });
  assert.equal(beastmaster.coverage, 'full');

  const armadillo = compile(
    'Armored Armadillo',
    'Creature — Armadillo',
    'Ward {1} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\n{3}{W}: This creature gets +X/+0 until end of turn, where X is its toughness.',
  );
  const activated = only<ActivatedAbility>(armadillo, 'activated');
  assert.deepEqual(activated.effects, [
    {
      do: 'pump',
      what: { sel: 'self' },
      power: { v: 'toughness', of: { sel: 'self' } },
      toughness: 0,
      duration: 'end-of-turn',
    },
  ]);
});

test('pump-by-own-stat: a power bound by an EARLIER sentence is still refused', () => {
  // Dina's X is the power of the creature her cost ate, which this phrase does
  // not name. Reading it as Dina's own power would be a wrong ability wearing
  // the clothes of a right one, so the ability stays unparsed.
  const dina = compile(
    'Dina, Soul Steeper',
    'Legendary Creature — Dryad Druid',
    "Whenever you gain life, each opponent loses 1 life.\n{1}, Sacrifice another creature: Dina gets +X/+0 until end of turn, where X is the sacrificed creature's power.",
  );
  assert.equal(dina.abilities.filter(a => a.kind === 'activated').length, 0);
  assert.equal(dina.coverage, 'partial');

  // Sigardian Zealot's subject is "each of them", a set the player chose a
  // sentence earlier. No selector can name it, so no pump is built.
  const zealot = compile(
    'Sigardian Zealot',
    'Creature — Human Soldier',
    "At the beginning of combat on your turn, choose any number of creatures with different powers. Each of them gets +X/+X and gains vigilance until end of turn, where X is this creature's power.",
  );
  const trigger = only<TriggeredAbility>(zealot, 'triggered');
  assert.ok(trigger.effects.every(e => e.do === 'manual'), JSON.stringify(trigger.effects));
});
