/**
 * Unit tests for the tag signal model.
 *
 *   node --test --experimental-strip-types src/engine/knowledge/tag-signal.test.ts
 *
 * The tag arrays below are copied verbatim from our own `cards` rows, so a test
 * that passes here describes what the card detail page will actually do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAG_RULES, ALL_TAGS } from './tagger.ts';
import {
  ALIAS_TAGS,
  LOW_INFORMATION_TAGS,
  TAGGED_CARD_TOTAL,
  TAG_CARD_COUNT,
  isSignalTag,
  sharedTagScore,
  sharedTags,
  signalTags,
  tagBaseline,
  tagEnrichment,
  tagWeight,
} from './tag-signal.ts';

/* ---- Alias derivation ------------------------------------------------ */

test('every alias in TAG_RULES is recognised as an alias', () => {
  const canonical = new Set(TAG_RULES.map(r => r.tag));
  for (const rule of TAG_RULES) {
    for (const alias of rule.also ?? []) {
      if (canonical.has(alias)) continue;
      assert.ok(ALIAS_TAGS.has(alias), `${alias} should be an alias of ${rule.tag}`);
    }
  }
});

test('lands-matter survives as canonical even though landfall aliases it', () => {
  // `landfall` lists `lands-matter` in `also`, and `lands-matter` is also a
  // rule of its own. Treating it as a mere alias would silence a real theme.
  assert.equal(ALIAS_TAGS.has('lands-matter'), false);
  assert.equal(isSignalTag('lands-matter'), true);
});

test('the sacrifice aliases collapse to one idea', () => {
  // Ashnod's Altar, verbatim from our table.
  const altar = ['artifact', 'ramp', 'sac-outlet', 'sacrifice', 'sacrifice-outlet'];
  assert.deepEqual(signalTags(altar).sort(), ['ramp', 'sacrifice-outlet']);
});

test('sac_outlet has left the vocabulary entirely', () => {
  assert.equal(ALL_TAGS.includes('sac_outlet'), false);
  assert.ok(ALL_TAGS.includes('sac-outlet'));
  assert.ok(ALL_TAGS.includes('sacrifice-outlet'));
});

/* ---- What counts as signal ------------------------------------------ */

test('type tags, etb and evasion are not signal', () => {
  for (const tag of ['creature', 'instant', 'artifact', 'land', 'etb', 'evasion']) {
    assert.equal(isSignalTag(tag), false, `${tag} should not be a signal tag`);
  }
});

test('Sol Ring reduces to its three mana roles, rarest first', () => {
  assert.deepEqual(signalTags(['artifact', 'fast-mana', 'mana-rock', 'ramp']), [
    'fast-mana',
    'mana-rock',
    'ramp',
  ]);
});

test('Craterhoof Behemoth loses etb and the wincon alias', () => {
  // `mass-pump` (702 cards) is rarer than `finisher` (750), so it leads.
  assert.deepEqual(signalTags(['creature', 'etb', 'finisher', 'mass-pump', 'wincon']), [
    'mass-pump',
    'finisher',
  ]);
});

test('signalTags tolerates null, empty and duplicate input', () => {
  assert.deepEqual(signalTags(null), []);
  assert.deepEqual(signalTags(undefined), []);
  assert.deepEqual(signalTags([]), []);
  assert.deepEqual(signalTags(['storm', 'storm']), ['storm']);
});

/* ---- Weighting ------------------------------------------------------- */

test('a rare tag outweighs a common one', () => {
  assert.ok(tagWeight('storm') > tagWeight('ramp'));
  assert.ok(tagWeight('ramp') > tagWeight('etb'));
  assert.ok(tagWeight('etb') > tagWeight('creature'));
});

test('one shared storm beats any single common tag by a wide margin', () => {
  const signal = ['storm', 'ramp', 'counters', 'lifegain'];
  const stormy = sharedTagScore(signal, ['storm']);
  for (const common of ['ramp', 'counters', 'lifegain']) {
    const bland = sharedTagScore(signal, [common]);
    assert.ok(
      stormy > bland * 2,
      `storm ${stormy.toFixed(2)} should more than double ${common} ${bland.toFixed(2)}`
    );
  }
});

test('the score is additive, and three common tags can outrank one rare one', () => {
  // Recorded deliberately. Summed inverse document frequency is additive, so a
  // card matching counters + lifegain + ramp (11.60) outscores one matching
  // only storm (9.74). That is tolerable because `CardWorksWellWith` queries
  // the *rarest* tags first, so a card sharing only common tags rarely reaches
  // the candidate set at all — verified against Aetherflux Reservoir, whose
  // whole first row is Tendrils of Agony, Grapeshot, Flusterstorm and
  // Dragonstorm. If that stops holding, weight super-linearly rather than
  // quietly widening the probe set.
  const signal = ['storm', 'counters', 'lifegain', 'ramp'];
  assert.ok(
    sharedTagScore(signal, ['counters', 'lifegain', 'ramp']) >
      sharedTagScore(signal, ['storm'])
  );
});

test('an unmeasured tag gets the median weight, not an extreme one', () => {
  const w = tagWeight('a-tag-that-does-not-exist');
  assert.ok(w > tagWeight('creature'), 'must not be silenced');
  assert.ok(w < tagWeight('storm'), 'must not dominate');
});

test('sharedTagScore is zero when nothing overlaps', () => {
  assert.equal(sharedTagScore(['storm'], ['lifegain']), 0);
  assert.equal(sharedTagScore(['storm'], null), 0);
  assert.equal(sharedTagScore([], ['storm']), 0);
});

test('sharedTags reports the overlap rarest first', () => {
  assert.deepEqual(
    sharedTags(signalTags(['fast-mana', 'mana-rock', 'ramp']), ['ramp', 'fast-mana', 'creature']),
    ['fast-mana', 'ramp']
  );
});

/* ---- Deck density ---------------------------------------------------- */

test('baselines are shares of the measured catalogue', () => {
  assert.equal(tagBaseline('creature'), TAG_CARD_COUNT.creature / TAGGED_CARD_TOTAL);
  assert.equal(tagBaseline('nonsense'), 0);
});

test('eight counters cards in a 100-card deck is barely above baseline', () => {
  // 8.45% of the catalogue carries `counters`, so eight in a hundred is what a
  // random pile gives you. The old detector fired on exactly this.
  const e = tagEnrichment(8, 100, ['counters']);
  assert.ok(e < 1.1, `expected roughly baseline, got ${e.toFixed(2)}`);
});

test('eight storm cards in a 100-card deck is unmistakable', () => {
  assert.ok(tagEnrichment(8, 100, ['storm']) > 50);
});

test('tagEnrichment is safe on empty decks and unknown tags', () => {
  assert.equal(tagEnrichment(5, 0, ['storm']), 0);
  assert.equal(tagEnrichment(0, 100, ['storm']), 0);
  assert.equal(tagEnrichment(5, 100, ['nonsense']), 0);
});

/* ---- Measurement coverage ------------------------------------------- */

test('every canonical rule tag has a measured card count', () => {
  const missing = TAG_RULES.map(r => r.tag).filter(tag => !(tag in TAG_CARD_COUNT));
  assert.deepEqual(
    missing,
    [],
    `re-run the corpus measurement in tag-signal.ts for: ${missing.join(', ')}`
  );
});

test('every alias is measured too, so legacy readers get a real baseline', () => {
  // ArchetypeDetection counts `tokens` and `removal-spot`; the templates quota
  // on `sac-outlet` and `wincon`. An unmeasured name yields a zero baseline,
  // and a detector divided by a zero baseline never fires.
  const unmeasured = Array.from(ALIAS_TAGS).filter(tag => !(tag in TAG_CARD_COUNT));
  assert.deepEqual(unmeasured, [], `unmeasured aliases: ${unmeasured.join(', ')}`);
  for (const tag of ALIAS_TAGS) {
    assert.ok(tagBaseline(tag) > 0, `${tag} must have a non-zero baseline`);
  }
});

test('an alias weighs the same as the idea it renames', () => {
  assert.equal(tagWeight('sac-outlet'), tagWeight('sacrifice-outlet'));
  assert.equal(tagWeight('tokens'), tagWeight('token-maker'));
  assert.equal(tagWeight('wincon'), tagWeight('finisher'));
});

test('the low-information set is what the measurements say it is', () => {
  for (const tag of LOW_INFORMATION_TAGS) {
    const share = tagBaseline(tag);
    assert.ok(share > 0.1, `${tag} is only ${(share * 100).toFixed(1)}% — is it still noise?`);
  }
});
