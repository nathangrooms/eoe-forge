/**
 * Tests for the LLM acceptance pipeline.
 *
 *   node --test --experimental-strip-types src/lib/cards/abilities/llm-validation.test.ts
 *
 * The bias of this file is deliberate: most of it asserts that something was
 * REJECTED. A validation stage that only has passing tests is a stage nobody has
 * shown can fail, and a gate that cannot fail is decoration. Each rejection test
 * names the specific way a model gets a card wrong, because those are the shapes
 * that reach production if the gate is soft.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateAbilities, validateEffects, ACCEPTED_TAGS } from './validate.ts';
import { renderAbilities, renderEffect } from './render.ts';
import { roundTrip, checkVerbatim, semanticTokens } from './roundtrip.ts';
import { acceptModelResult, readNeeds } from './llm-accept.ts';
import { probeBehaviour } from '../../game/abilities/behaviour-probe.ts';
import { advancePatch, batched, batchedByBudget, completionPatch, failurePatch, resumeFrom } from './llm-run-state.ts';
import { DSL_GRAMMAR, SYSTEM_PROMPT } from './llm-prompt.ts';
import { oracleHash } from './normalize.ts';
import type { AbilityCard } from './normalize.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const BOLT: AbilityCard = {
  oracle_id: 'bolt',
  name: 'Lightning Bolt',
  type_line: 'Instant',
  mana_cost: '{R}',
  oracle_text: 'Lightning Bolt deals 3 damage to any target.',
};

const boltAnswer = () => ({
  oracle_id: 'bolt',
  abilities: [
    {
      kind: 'spell',
      text: 'Lightning Bolt deals 3 damage to any target.',
      targets: [{ ref: 0, what: 'any', min: 1, max: 1, prompt: 'Choose any target' }],
      effects: [{ do: 'damage', to: { sel: 'target', ref: 0 }, amount: 3 }],
    },
  ],
  unparsed: [],
  needs: [],
});

/* ------------------------------------------------------------------ *
 * Schema — the shapes a permissive validator would wave through
 * ------------------------------------------------------------------ */

test('an unknown field is an error, because a permissive validator drops its meaning silently', () => {
  const result = validateEffects([
    { do: 'draw', who: { who: 'you' }, count: 2, fromTheTop: true },
  ]);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path.endsWith('.fromTheTop') && /unknown field/.test(e.message)),
    `expected an unknown-field error, got ${JSON.stringify(result.errors)}`,
  );
});

test('a number written as a string is refused rather than coerced', () => {
  const result = validateEffects([{ do: 'draw', who: { who: 'you' }, count: '2' }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /numbers must be numbers/);
});

test('an invented effect verb names itself in the error, so the failure histogram is a build list', () => {
  const result = validateEffects([{ do: 'fight', what: { sel: 'self' } }]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /unknown effect "fight"/);
});

test('a discard may say "hand" for the whole hand, and no other word', () => {
  // The one literal a discard count accepts. "Discards their hand" is a
  // different amount for every player, which no expression can state.
  assert.equal(validateEffects([{ do: 'discard', who: { who: 'each-player' }, count: 'hand' }]).ok, true);
  const wrong = validateEffects([{ do: 'discard', who: { who: 'you' }, count: 'library' }]);
  assert.equal(wrong.ok, false);
  // A draw has no such literal: "draws their hand" is not a thing a card says.
  assert.equal(validateEffects([{ do: 'draw', who: { who: 'you' }, count: 'hand' }]).ok, false);
});

test("{do:'manual'} cannot enter from outside — it is the other compiler's marker", () => {
  const result = validateEffects([{ do: 'manual', text: 'do something by hand' }]);
  assert.equal(result.ok, false, 'a model must never be able to spell "a human resolves this"');
});

test('every error is collected, not just the first, so one call ranks what is missing', () => {
  const result = validateEffects([
    { do: 'fight', what: { sel: 'self' } },
    { do: 'draw', who: { who: 'you' }, count: '3' },
    { do: 'copy', what: { sel: 'self' } },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3, `expected at least three errors, got ${result.errors.length}`);
});

test('a target that can never be chosen is refused', () => {
  const result = validateAbilities([
    { kind: 'spell', text: 'x', targets: [{ ref: 0, what: 'any', min: 0, max: 0, prompt: 'p' }], effects: [] },
  ]);
  assert.equal(result.ok, false);
});

test('an X/X token spelled as a string power is refused — it arrives as 0/0 and dies on the spot', () => {
  const result = validateEffects([
    {
      do: 'create-token',
      who: { who: 'you' },
      count: 1,
      token: { name: 'Golem', typeLine: 'Creature — Golem', power: 'x', toughness: 'x' },
    },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /power\/toughness/);
});

test('a mana cost that is prose rather than symbols is refused', () => {
  const result = validateEffects([{ do: 'add-mana', who: { who: 'you' }, mana: 'two red mana' }]);
  assert.equal(result.ok, false);
});

/* ------------------------------------------------------------------ *
 * Round trip — the stage that catches well-formed lies
 * ------------------------------------------------------------------ */

test('a correct compilation round-trips clean', () => {
  const answer = boltAnswer();
  const outcome = acceptModelResult(BOLT, answer);
  assert.equal(outcome.stage, 'accepted', JSON.stringify(outcome.detail));
  assert.equal(outcome.coverage, 'full');
});

test('a wrong NUMBER is caught even though the JSON is perfect', () => {
  const answer = boltAnswer();
  answer.abilities[0].effects[0].amount = 4;
  const outcome = acceptModelResult(BOLT, answer);
  assert.equal(outcome.stage, 'roundtrip');
  assert.deepEqual(outcome.detail.roundTrip?.invented.numbers, ['4']);
  assert.deepEqual(outcome.detail.roundTrip?.dropped.numbers, ['3']);
});

test('a wrong VERB is caught: the DSL destroys, the card burns', () => {
  const answer = boltAnswer();
  // Cast because the fixture's inferred element type is the damage effect. The
  // point of the test is precisely that a DIFFERENT verb arrives here.
  (answer.abilities[0].effects as unknown[])[0] = { do: 'destroy', what: { sel: 'target', ref: 0 } };
  const outcome = acceptModelResult(BOLT, answer);
  assert.equal(outcome.stage, 'roundtrip');
  assert.ok(outcome.detail.roundTrip?.invented.words.includes('destroy'));
  assert.ok(outcome.detail.roundTrip?.dropped.words.includes('damage'));
});

test('a DROPPED clause is caught: half a card compiled is not a compiled card', () => {
  const card: AbilityCard = {
    oracle_id: 'two-clause',
    name: 'Test Card',
    type_line: 'Sorcery',
    oracle_text: 'Draw 2 cards. Test Card deals 3 damage to any target.',
  };
  const outcome = acceptModelResult(card, {
    abilities: [
      { kind: 'spell', text: 'Draw 2 cards.', effects: [{ do: 'draw', who: { who: 'you' }, count: 2 }] },
    ],
    unparsed: [],
    needs: [],
  });
  assert.equal(outcome.stage, 'verbatim', 'the missing sentence must be reported, not ignored');
  assert.ok((outcome.detail.verbatimUnaccounted ?? []).includes('damage'));
});

test('a PARAPHRASED quote is caught before the round trip can be fooled by it', () => {
  const answer = boltAnswer();
  answer.abilities[0].text = 'This card deals three damage to a target.';
  const outcome = acceptModelResult(BOLT, answer);
  assert.equal(outcome.stage, 'verbatim');
  assert.equal(outcome.detail.verbatimNotFound?.length, 1);
});

test('declaring a clause unparsed removes it from the comparison, so partial answers can pass', () => {
  const card: AbilityCard = {
    oracle_id: 'partial',
    name: 'Partial Card',
    type_line: 'Enchantment',
    oracle_text: 'Draw 2 cards.\nPartial Card gains the ability to fight in a way nothing models.',
  };
  const outcome = acceptModelResult(card, {
    abilities: [
      { kind: 'spell', text: 'Draw 2 cards.', effects: [{ do: 'draw', who: { who: 'you' }, count: 2 }] },
    ],
    unparsed: [
      { text: 'Partial Card gains the ability to fight in a way nothing models.', reason: 'unrecognised' },
    ],
    needs: [{ primitive: 'fightTargetCreature', why: 'no fight verb in the grammar' }],
  });
  assert.equal(outcome.stage, 'accepted', JSON.stringify(outcome.detail));
  assert.equal(outcome.coverage, 'partial', 'an unparsed clause can never be full coverage');
  assert.equal(outcome.card?.source, 'book-partial');
  assert.equal(outcome.needs[0].primitive, 'fightTargetCreature');
});

test('an unparsed clause carries a real span into the normalised text, never [0,0]', () => {
  const card: AbilityCard = {
    oracle_id: 'span',
    name: 'Span Card',
    type_line: 'Enchantment',
    oracle_text: 'Draw 2 cards.\nSomething entirely unmodelled happens.',
  };
  const outcome = acceptModelResult(card, {
    abilities: [{ kind: 'spell', text: 'Draw 2 cards.', effects: [{ do: 'draw', who: { who: 'you' }, count: 2 }] }],
    unparsed: [{ text: 'Something entirely unmodelled happens.', reason: 'unrecognised' }],
    needs: [],
  });
  assert.equal(outcome.stage, 'accepted');
  const span = outcome.unparsed[0].span;
  assert.ok(span[1] > span[0], 'a span must cover characters');
  assert.ok(span[0] > 0, 'the second paragraph does not start at zero');
});

/* ------------------------------------------------------------------ *
 * The confidence label
 * ------------------------------------------------------------------ */

test("model output is labelled 'approximate' even when every gate passed", () => {
  const outcome = acceptModelResult(BOLT, boltAnswer());
  assert.equal(outcome.card?.abilities[0].confidence, 'approximate');
});

test('a model-supplied id and confidence are overwritten, never trusted', () => {
  const answer = boltAnswer();
  (answer.abilities[0] as Record<string, unknown>).id = 'whatever';
  (answer.abilities[0] as Record<string, unknown>).confidence = 'exact';
  const outcome = acceptModelResult(BOLT, answer);
  assert.equal(outcome.card?.abilities[0].id, 'a0');
  assert.equal(outcome.card?.abilities[0].confidence, 'approximate');
});

/* ------------------------------------------------------------------ *
 * Behaviour — accepted is not the same as automated
 * ------------------------------------------------------------------ */

/*
 * THIS TEST USED TO ASSERT THE OPPOSITE, and it was right to until 23 Aug 2026.
 *
 * It read "a targeted spell is accepted but is NOT automatable, because nothing
 * binds the target", and that was a true sentence about the engine on the day
 * it was written: `behaviour-probe.ts` reported `deferred` for any ability that
 * announced a target, before running a single one of its effects.
 *
 * `chooseTargetsFor` owns target legality for all three ways a target is
 * announced now, and the probe binds through it and lets `bot.ts` aim. So a
 * Bolt is aimed and it burns something, and the old assertion had become a
 * claim about a refusal rather than about the engine. The bar is unchanged:
 * actions have to come out and nothing may be deferred. The test below this one
 * is the other half, and it is the one that matters — binding a target must not
 * become a way of passing.
 */
test('a targeted spell IS automatable, because the target is bound the way a bot binds it', () => {
  const outcome = acceptModelResult(BOLT, boltAnswer());
  assert.equal(outcome.accepted, true);
  assert.equal(outcome.automatable, true);
  assert.equal(outcome.detail.behaviour?.outcome, 'ran');
  // And it says who aimed it, so the row can be audited rather than trusted.
  assert.ok(
    (outcome.detail.behaviour?.answered ?? []).some(line => line.includes('chooseTargetsFor')),
    JSON.stringify(outcome.detail.behaviour)
  );
});

test('a bound target is not a way of passing: an ability that then does nothing is SILENT', () => {
  // A target IS found and bound here — the probe board has three creatures on
  // it and the bot aims at one. The ability still produces no action, because
  // every permanent on that board is already untapped, so the probe REJECTS it.
  // That is a harder verdict than the `deferred` the same ability would have
  // been let off with when any announced target failed the card outright.
  const verdict = probeBehaviour([
    {
      id: 'a0',
      kind: 'spell',
      text: 'Untap target creature.',
      confidence: 'approximate',
      targets: [{ ref: 0, what: 'creature', min: 1, max: 1, prompt: 'Choose target creature' }],
      effects: [{ do: 'untap', what: { sel: 'target', ref: 0 } }],
    },
  ] as never);
  assert.equal(verdict.outcome, 'silent');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.actions, 0);
  assert.ok(verdict.answered.some(line => line.includes('target(s) bound')), JSON.stringify(verdict));
});

/*
 * The two tests below are the guard on the failure this whole probe can only
 * have in one direction. Both abilities RUN and both produce a real action, and
 * both are refused anyway, because the only reason they ran is that the probe
 * answered a question nothing in the product offers. Delete either assertion and
 * 66 cards walk back into the passing total on no evidence.
 */
test('a "you may" the probe answered for is NOT a pass, however well the body ran', () => {
  const verdict = probeBehaviour([
    {
      id: 'a0',
      kind: 'triggered',
      text: 'When this creature enters, you may draw a card.',
      confidence: 'approximate',
      trigger: { on: 'enters', who: { sel: 'self' } },
      effects: [
        {
          do: 'may',
          who: { who: 'you' },
          text: 'draw a card',
          effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }],
        },
      ],
    },
  ] as never);
  // The body really ran. That is the point: the actions are evidence about the
  // effects, and they are still not evidence that anybody can be asked.
  assert.equal(verdict.actions, 1);
  assert.equal(verdict.outcome, 'deferred');
  assert.ok(
    verdict.answered.some(line => line.includes('"you may" was answered YES')),
    JSON.stringify(verdict)
  );
  assert.ok(
    verdict.deferred.some(line => line.includes('a question nobody else can')),
    JSON.stringify(verdict)
  );
});

test('a mode botChoice picked is NOT a pass while no surface draws a mode', () => {
  const verdict = probeBehaviour([
    {
      id: 'a0',
      kind: 'spell',
      text: 'Choose one: draw a card; or you gain 2 life.',
      confidence: 'approximate',
      effects: [
        {
          do: 'choose-mode',
          min: 1,
          max: 1,
          modes: [
            { text: 'Draw a card.', effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }] },
            { text: 'You gain 2 life.', effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 2 }] },
          ],
        },
      ],
    },
  ] as never);
  assert.equal(verdict.actions, 1);
  assert.equal(verdict.outcome, 'deferred');
  assert.ok(
    verdict.answered.some(line => line.includes('botChoice answered the mode')),
    JSON.stringify(verdict)
  );
  assert.ok(
    verdict.deferred.some(line => line.includes('no shipped surface draws')),
    JSON.stringify(verdict)
  );
});

test('a clause that is a translated XMage body producing nothing is NOT a pass', () => {
  /*
   * Depressurize, by hand: "Target creature gets -3/-0 until end of turn. Then
   * if that creature's power is 0 or less, destroy it." The pump is DSL, the
   * "then" half is a translated body. On a board of 2/2s the destroy is exactly
   * what should happen, and the body produces no action and gives no reason.
   *
   * The pump alone would carry the card to `ran` without this rule, which is
   * how 8 cards reached AUTOMATED on half of themselves.
   */
  const verdict = probeBehaviour([
    {
      id: 'a0',
      kind: 'spell',
      text: 'Target creature gets -3/-0 until end of turn. Then if that creature’s power is 0 or less, destroy it.',
      confidence: 'approximate',
      targets: [{ ref: 0, what: 'creature', min: 1, max: 1, prompt: 'creature' }],
      effects: [
        { do: 'pump', what: { sel: 'target', ref: 0 }, power: -3, toughness: 0, duration: 'end-of-turn' },
        { do: 'xmage-body', key: 'Depressurize::DepressurizeTargetEffect', card: 'Depressurize', effect: 'DepressurizeTargetEffect' },
      ],
    },
  ] as never);
  assert.equal(verdict.actions, 1, 'the pump still runs, and one action is the whole point');
  assert.equal(verdict.outcome, 'deferred');
  assert.ok(
    verdict.deferred.some(line => line.includes('translated XMage body produced no action')),
    JSON.stringify(verdict)
  );
});

test('an untargeted effect the engine really performs is automatable', () => {
  const card: AbilityCard = {
    oracle_id: 'gainer',
    name: 'Life Gainer',
    type_line: 'Sorcery',
    oracle_text: 'You gain 4 life.',
  };
  const outcome = acceptModelResult(card, {
    abilities: [{ kind: 'spell', text: 'You gain 4 life.', effects: [{ do: 'gain-life', who: { who: 'you' }, amount: 4 }] }],
    unparsed: [],
    needs: [],
  });
  assert.equal(outcome.stage, 'accepted', JSON.stringify(outcome.detail));
  assert.equal(outcome.automatable, true);
  assert.equal(outcome.detail.behaviour?.outcome, 'ran');
});

/* ------------------------------------------------------------------ *
 * needs
 * ------------------------------------------------------------------ */

test('a malformed needs entry is dropped, never allowed to sink a good compilation', () => {
  assert.deepEqual(
    readNeeds([
      { primitive: 'fightTargetCreature', why: 'no fight verb' },
      { primitive: 'has spaces and punctuation!', why: 'x' },
      { primitive: 'fightTargetCreature', why: 'duplicate' },
      'not an object',
    ]).map((n) => n.primitive),
    ['fightTargetCreature'],
  );
});

/* ------------------------------------------------------------------ *
 * The resume pointer — the bug that froze this project's card sync
 * ------------------------------------------------------------------ */

test('THE COMPLETION PATH CLEARS THE POINTER', () => {
  const patch = completionPatch('2026-08-19T00:00:00Z');
  assert.equal(patch.status, 'complete');
  assert.strictEqual(patch.cursor, null, 'a completed run that still carries a cursor is the sync-freezing bug');
});

test('a FAILED run keeps its pointer, which is what makes it resumable', () => {
  const patch = failurePatch('2026-08-19T00:00:00Z');
  assert.equal(patch.status, 'failed');
  assert.equal(patch.cursor, undefined, 'failure must not clear the cursor');
});

test('resume starts strictly after the pointed-at row, because that row is already saved', () => {
  const items = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
  assert.deepEqual(resumeFrom(items, (i) => i.k, 'b'), [{ k: 'c' }]);
  assert.deepEqual(resumeFrom(items, (i) => i.k, null), items);
});

test('a pointer naming a row that is not in the work list restarts rather than skips', () => {
  const items = [{ k: 'a' }, { k: 'b' }];
  assert.deepEqual(resumeFrom(items, (i) => i.k, 'gone'), items);
});

test('advancing requires the key of a row that was actually written', () => {
  assert.throws(() => advancePatch(''), /actually written/);
  assert.deepEqual(advancePatch('card-9'), { cursor: 'card-9' });
});

test('batching is exact and ordered', () => {
  assert.deepEqual(batched([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.throws(() => batched([1], 0), /positive integer/);
});

/*
 * The character budget. These four tests are the regression guard for the
 * failure that cost the first 500-card run 24 of its 64 cards: eight long cards
 * in one call overran the output ceiling and truncated the JSON, and all eight
 * were recorded as model failures when the mistake was ours.
 */

test('the character budget closes a batch before the card count does', () => {
  const long = [{ n: 500 }, { n: 500 }, { n: 500 }, { n: 500 }];
  // Eight cards would be allowed by count; 1200 chars allows only two.
  assert.deepEqual(
    batchedByBudget(long, 8, (c) => c.n, 1200),
    [[{ n: 500 }, { n: 500 }], [{ n: 500 }, { n: 500 }]],
  );
});

test('the card count still closes a batch when the cards are short', () => {
  const short = [{ n: 10 }, { n: 10 }, { n: 10 }, { n: 10 }, { n: 10 }];
  assert.deepEqual(
    batchedByBudget(short, 2, (c) => c.n, 100_000),
    [[{ n: 10 }, { n: 10 }], [{ n: 10 }, { n: 10 }], [{ n: 10 }]],
  );
});

test('a single card over the whole budget gets its own batch rather than vanishing', () => {
  const items = [{ n: 50 }, { n: 9_000 }, { n: 50 }];
  const out = batchedByBudget(items, 8, (c) => c.n, 1200);
  assert.deepEqual(out, [[{ n: 50 }], [{ n: 9_000 }], [{ n: 50 }]]);
  // Nothing may be dropped: a skipped card is a hole nobody notices.
  assert.equal(out.flat().length, items.length);
});

test('budgeted batching preserves order, so a resume still lands on a boundary', () => {
  const items = Array.from({ length: 37 }, (_v, i) => ({ id: i, n: 90 + (i % 7) * 40 }));
  const out = batchedByBudget(items, 8, (c) => c.n, 1200);
  assert.deepEqual(out.flat().map((c) => c.id), items.map((c) => c.id));
  for (const batch of out) {
    assert.ok(batch.length <= 8, 'no batch exceeds the card cap');
    const total = batch.reduce((s, c) => s + c.n, 0);
    assert.ok(total <= 1200 || batch.length === 1, 'no multi-card batch exceeds the character cap');
  }
});

/* ------------------------------------------------------------------ *
 * Prompt / grammar parity — the drift guard
 * ------------------------------------------------------------------ */

test('the prompt file is self-contained, so its text can be registered verbatim', () => {
  // The prompt is stored in `llm_prompt_versions` and read from there by the
  // edge function, keyed by label + a fingerprint of the text. That removes the
  // duplicated copy this test used to guard. What still has to hold is that the
  // module has no imports: a template literal built from an imported value would
  // make the registered text depend on something the fingerprint never saw.
  const source = readFileSync(join(here, 'llm-prompt.ts'), 'utf8');
  const imports = source.split(/\r?\n/).filter((line) => /^\s*import\b/.test(line));
  assert.deepEqual(imports, [], 'llm-prompt.ts must import nothing — its text is the record of what was asked');
});

test('the prompt fingerprint changes when the prompt changes', () => {
  // The key is `<label>.<hash>`, so a wording change with no label bump still
  // produces a distinct row and distinct provenance. Asserting the hash is
  // sensitive is asserting that provenance cannot silently go stale.
  assert.notEqual(oracleHash(SYSTEM_PROMPT), oracleHash(`${SYSTEM_PROMPT} `));
});

/**
 * The grammar writes shared shapes as alternations — `do:'gain-life'|'lose-life'`
 * — so a literal search for one member misses it. This expands every alternation
 * into its members before comparing, which is the only way the parity check
 * measures what it claims to.
 */
function grammarTags(grammar: string): Set<string> {
  const flat = grammar.replace(/\s*:\s*/g, ':');
  const tags = new Set<string>();
  for (const match of flat.matchAll(/(\w+):((?:'[^']+'\s*\|\s*)*'[^']+')/g)) {
    for (const one of match[2].matchAll(/'([^']+)'/g)) tags.add(`${match[1]}:'${one[1]}'`);
  }
  return tags;
}

test('every tag the validator accepts is described in the grammar the model is shown', () => {
  const shown = grammarTags(DSL_GRAMMAR);
  const missing: string[] = [];
  for (const [key, tags] of Object.entries(ACCEPTED_TAGS)) {
    for (const tag of tags) if (!shown.has(`${key}:'${tag}'`)) missing.push(`${key}:'${tag}'`);
  }
  assert.deepEqual(missing, [], 'these DSL members exist but the model is never told about them');
});

test('the grammar mentions no tag the validator would reject', () => {
  const shown = grammarTags(DSL_GRAMMAR);
  const invented: string[] = [];
  for (const [key, tags] of Object.entries(ACCEPTED_TAGS)) {
    const accepted = new Set(tags);
    for (const entry of shown) {
      if (!entry.startsWith(`${key}:'`)) continue;
      const tag = entry.slice(key.length + 2, -1);
      if (!accepted.has(tag)) invented.push(entry);
    }
  }
  assert.deepEqual(invented, [], 'the prompt promises the model members the validator does not accept');
});

test('the prompt forbids the manual marker in words, not only by omission', () => {
  assert.match(SYSTEM_PROMPT, /There is no "manual" anywhere in this grammar/);
});

/* ------------------------------------------------------------------ *
 * Renderer sanity — the instrument itself
 * ------------------------------------------------------------------ */

test('the renderer emits the duration, so the round trip can see it', () => {
  const text = renderEffect({
    do: 'pump', what: { sel: 'self' }, power: 2, toughness: 2, duration: 'end-of-turn',
  });
  assert.match(text, /until end of turn/);
});

test('the renderer spells tap as the symbol oracle text uses', () => {
  assert.equal(
    renderAbilities([
      { id: 'a0', text: '{T}: Add {G}.', confidence: 'exact', kind: 'mana', costs: [{ pay: 'tap' }],
        effects: [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}' }] },
    ]).includes('{T}'),
    true,
  );
});

test('semantic tokens exclude 0 and 1, and the exclusion is symmetric', () => {
  const a = semanticTokens('draw 1 card and gain 3 life');
  assert.deepEqual([...a.numbers], ['3']);
});

test('verbatim accounting notices text no span covered', () => {
  const verdict = checkVerbatim(['Draw a card.'], 'Draw a card. Destroy target creature.');
  assert.equal(verdict.ok, false);
  assert.ok(verdict.unaccounted.includes('destroy'));
  assert.ok(verdict.accountedFraction < 1);
});

test('round trip over an empty ability list against empty text is clean', () => {
  const verdict = roundTrip([], [], '', {});
  assert.equal(verdict.ok, true);
});
