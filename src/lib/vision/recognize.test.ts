/**
 * The recognition pipeline, end to end, over real card photographs.
 *
 *   node --test --experimental-strip-types src/lib/vision/recognize.test.ts
 *
 * Runs the shipped `recognizeCard` against committed fixtures: real catalogue
 * renders, real degraded captures of them, and an index containing their true
 * entries plus ~6,000 real distractor printings. The distractors are the point —
 * an index holding only the answers would make matching trivial and this suite
 * worthless as a regression signal.
 *
 * Headline accuracy is measured separately by `scripts/vision/evaluate.mjs`
 * against the full ~50k index and 1,680 captures. THIS file exists to pin
 * behaviour: the invariants that must hold whatever the accuracy happens to be,
 * and the specific cards an earlier evaluation got wrong.
 *
 * The invariant that matters most, and that every assertion here protects:
 *
 *   THE PIPELINE MUST NEVER SILENTLY COMMIT TO A PRINTING IT CANNOT JUSTIFY.
 *
 * Recording the wrong printing corrupts a collection's value with no visible
 * symptom. Deferring to the user costs two seconds. Those are not comparable
 * failures, and the tests are weighted accordingly.
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { CardHashIndex } from './hashIndex.ts';
import { recognizeCard, assessFrame, rectifyCard, hashRectifiedCard, THRESHOLDS } from './recognize.ts';
import type { PrintingIdentity } from './collectorNumber.ts';
import { rgbToGray, cropGray, type RgbaImage } from './image.ts';
import { pHash, dHash } from './hash.ts';
import { ART_WINDOW } from './artWindow.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, '__fixtures__');

interface Truth {
  id: string;
  name: string;
  oracle_id: string;
  set: string;
  cn: string;
  group: string;
  group_size: number;
  sibling_ids: string[];
}

let index: CardHashIndex;
let truth: Truth[];

before(() => {
  index = CardHashIndex.fromBytes(new Uint8Array(fs.readFileSync(path.join(FIX, 'index.bin'))));
  truth = JSON.parse(fs.readFileSync(path.join(FIX, 'truth.json'), 'utf8'));
});

async function loadFrame(file: string): Promise<RgbaImage> {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
}

const capturePath = (condition: string, id: string) =>
  path.join(FIX, 'captures', condition, `${id}.jpg`);

/** Printing metadata the engine asks for, served from the fixture truth file. */
const lookupPrintings = async (cardIds: string[]): Promise<PrintingIdentity[]> =>
  cardIds
    .map((id) => truth.find((t) => t.id === id))
    .filter((t): t is Truth => t != null)
    .map((t) => ({ cardId: t.id, setCode: t.set, collectorNumber: String(t.cn) }));

async function recognise(condition: string, t: Truth) {
  const frame = await loadFrame(capturePath(condition, t.id));
  return recognizeCard(frame, { index, lookupPrintings, maxCandidates: 5 });
}

/** Every printing of the same card, by oracle id, within the fixture set. */
const siblingsOf = (t: Truth) => truth.filter((x) => x.oracle_id === t.oracle_id);

// ---------------------------------------------------------------------------
// The core invariant
// ---------------------------------------------------------------------------

test('never commits to a printing that is not the right one', async () => {
  // The single most important assertion in the suite. A "resolved" status is a
  // promise that the answer can be justified; if it is ever wrong, the user has
  // silently bad data.
  const failures: string[] = [];
  for (const condition of ['clean', 'moderate']) {
    for (const t of truth) {
      const res = await recognise(condition, t);
      if (res.status === 'resolved' && res.resolvedCardId !== t.id) {
        failures.push(
          `${condition}/${t.name} (${t.set} ${t.cn}): resolved to ${res.resolvedCardId} ` +
            `via ${res.resolvedBy} at ${res.candidates[0]?.pDistance} bits`,
        );
      }
    }
  }
  assert.deepEqual(failures, [], `silent errors:\n${failures.join('\n')}`);
});

test('a resolved answer always names a card that is actually in the index', async () => {
  for (const t of truth) {
    const res = await recognise('clean', t);
    if (res.resolvedCardId) {
      assert.ok(
        index.distanceTo(res.resolvedCardId, { hi: 0, lo: 0 }, { hi: 0, lo: 0 }) !== null,
        `${t.name}: resolved to an id that is not in the index`,
      );
    }
  }
});

test('when it defers, the right printing is among the options it shows', async () => {
  // Deferring is only acceptable if the answer is on screen. A picker that does
  // not contain the user's card is worse than useless.
  const misses: string[] = [];
  for (const t of truth) {
    const res = await recognise('clean', t);
    if (res.status !== 'choose-printing') continue;
    if (!res.candidates.some((c) => c.cardId === t.id)) {
      misses.push(`${t.name} (${t.set} ${t.cn}): ${res.candidates.length} options, none correct`);
    }
  }
  assert.deepEqual(misses, [], `deferred without offering the right card:\n${misses.join('\n')}`);
});

test('candidates are always ranked nearest-first', async () => {
  for (const t of truth) {
    const res = await recognise('clean', t);
    for (let i = 1; i < res.candidates.length; i++) {
      assert.ok(
        res.candidates[i].distance >= res.candidates[i - 1].distance,
        `${t.name}: candidate ${i} is closer than ${i - 1}`,
      );
    }
  }
});

test('a confident result never carries an offer to call the vision model', async () => {
  // The model must stay off the happy path. If we resolved something, there is
  // nothing for it to add.
  for (const t of truth) {
    const res = await recognise('clean', t);
    if (res.status === 'resolved') {
      assert.equal(res.offerVisionFallback, false, `${t.name} offered a fallback despite resolving`);
    }
  }
});

test('the vision model is offered exactly when local recognition gave up', async () => {
  for (const condition of ['clean', 'moderate']) {
    for (const t of truth) {
      const res = await recognise(condition, t);
      const gaveUp = res.status === 'no-match' || res.status === 'uncertain';
      assert.equal(
        res.offerVisionFallback,
        gaveUp,
        `${condition}/${t.name}: status ${res.status} but offerVisionFallback=${res.offerVisionFallback}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Accuracy floors — deliberately below measured performance, so they catch
// regressions rather than fluctuation.
// ---------------------------------------------------------------------------

test('identifies the right CARD on a clean capture for every fixture', async () => {
  const wrong: string[] = [];
  for (const t of truth) {
    const res = await recognise('clean', t);
    const siblings = new Set(siblingsOf(t).map((s) => s.id));
    const top = res.candidates[0];
    // Right card means any printing of it; picking the wrong printing is a
    // separate concern measured below.
    if (!top || !(siblings.has(top.cardId) || top.cardId === t.id)) {
      wrong.push(`${t.name} (${t.set} ${t.cn}) -> ${top?.cardId ?? 'nothing'} @ ${top?.pDistance}`);
    }
  }
  assert.deepEqual(wrong, [], `wrong card on a clean capture:\n${wrong.join('\n')}`);
});

test('identifies the right card on a moderately degraded capture', async () => {
  let right = 0;
  for (const t of truth) {
    const res = await recognise('moderate', t);
    const siblings = new Set(siblingsOf(t).map((s) => s.id));
    const top = res.candidates[0];
    if (top && (siblings.has(top.cardId) || top.cardId === t.id)) right++;
  }
  // Measured 10/10 at the time of writing. The floor sits below that so normal
  // variation does not fail the build, but a real regression will.
  assert.ok(right >= 8, `only ${right}/${truth.length} correct on moderate captures`);
});

test('single-printing cards resolve outright, with no picker', async () => {
  const singles = truth.filter((t) => siblingsOf(t).length === 1);
  assert.ok(singles.length > 0, 'fixture set must contain single-printing cards');
  for (const t of singles) {
    const res = await recognise('clean', t);
    assert.equal(res.status, 'resolved', `${t.name} did not resolve outright`);
    assert.equal(res.resolvedCardId, t.id);
    assert.equal(res.resolvedBy, 'sole-printing');
    assert.equal(res.confidence !== 'low', true);
  }
});

// ---------------------------------------------------------------------------
// Pinned regressions — cards an earlier evaluation got wrong
// ---------------------------------------------------------------------------

/**
 * Thriving Bluff is the canonical print-variation case, and measuring it
 * corrected an assumption worth recording.
 *
 * We hold four printings (`clu`/`ecc`/`msc`/`tle`). They are NOT four copies of
 * one illustration, as a card-level summary would suggest — they are three
 * distinct illustrations. Measured art-pHash distances between the four:
 *
 *     8a6d17e6 vs c1932fa3    0 bits   <- genuinely the same art
 *     6c382c6a vs 82c96473   28 bits
 *     6c382c6a vs 8a6d17e6   30 bits
 *     82c96473 vs 8a6d17e6   28 bits
 *
 * So "this card has shared art" is the wrong granularity. Shared art is a
 * property of a PAIR OF PRINTINGS, not of a card, and the engine must decide
 * per printing: resolve where this printing's art is unique among its siblings,
 * defer only where it collides with one.
 *
 * This test therefore derives its expectation from the index rather than
 * asserting a fixed outcome, so it stays correct as the catalogue changes.
 */
test('shared art is deferred and unique art is resolved, decided per printing', async () => {
  for (const t of truth) {
    const siblingIds = new Set([t.id, ...t.sibling_ids]);
    const self = index.distanceTo(t.id, { hi: 0, lo: 0 }, { hi: 0, lo: 0 });
    if (!self) continue;

    // How close is this printing's art to its nearest sibling's?
    let nearestSibling = Infinity;
    for (let i = 0; i < index.size; i++) {
      const id = index.cardIdAt(i);
      if (id === t.id || !siblingIds.has(id)) continue;
      const row = index.rowAt(i);
      const mine = index.rowAt(indexOfCard(t.id));
      const dist = hammingOf(mine.artPHash, row.artPHash);
      nearestSibling = Math.min(nearestSibling, dist);
    }
    if (!Number.isFinite(nearestSibling)) continue;

    const res = await recognise('clean', t);
    const artIsShared = nearestSibling < THRESHOLDS.ambiguityMargin;

    if (artIsShared) {
      assert.notEqual(
        res.status,
        'resolved',
        `${t.name} (${t.set} ${t.cn}): art is ${nearestSibling} bits from a sibling — ` +
          `indistinguishable — yet a printing was committed to`,
      );
      if (res.status === 'choose-printing') {
        assert.ok(res.candidates.length > 1, 'a picker must offer more than one option');
        assert.ok(
          res.candidates.some((c) => c.cardId === t.id),
          `${t.set} ${t.cn}: the real printing was not among the options`,
        );
        assert.match(res.explanation, /share this artwork/i);
      }
    } else if (res.status === 'resolved') {
      assert.equal(
        res.resolvedCardId,
        t.id,
        `${t.name} (${t.set} ${t.cn}): art is unique (nearest sibling ${nearestSibling} bits) ` +
          `so the resolution must be exact`,
      );
    }
  }
});

function indexOfCard(cardId: string): number {
  for (let i = 0; i < index.size; i++) if (index.cardIdAt(i) === cardId) return i;
  throw new Error(`card ${cardId} not in fixture index`);
}

function hammingOf(a: { hi: number; lo: number }, b: { hi: number; lo: number }): number {
  const pc = (x: number) => {
    let v = x >>> 0;
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    v = (v + (v >>> 4)) & 0x0f0f0f0f;
    return (Math.imul(v, 0x01010101) >>> 24) & 0xff;
  };
  return pc(a.hi ^ b.hi) + pc(a.lo ^ b.lo);
}

/**
 * The defer path, forced.
 *
 * Whether any fixture card currently collides with a sibling depends on the
 * catalogue, which moves. This builds the collision explicitly — a second
 * printing of the photographed card carrying identical hashes — so the "two
 * printings are indistinguishable, ask the user" branch is always exercised.
 */
test('two printings with identical art always produce a picker, never a guess', async () => {
  const t = truth.find((x) => x.group === 'E_control')!;
  const real = index.rowAt(indexOfCard(t.id));
  const twin = {
    cardId: '00000000-0000-4000-8000-00000000dead',
    oracleGroup: real.oracleGroup,
    artPHash: real.artPHash,
    artDHash: real.artDHash,
  };
  const rows = [twin];
  for (let i = 0; i < index.size; i++) rows.push(index.rowAt(i));
  const withTwin = CardHashIndex.fromRows(rows);

  const frame = await loadFrame(capturePath('clean', t.id));
  const res = await recognizeCard(frame, { index: withTwin, lookupPrintings });

  assert.equal(
    res.status,
    'choose-printing',
    `identical art must defer, got "${res.status}" resolving ${res.resolvedCardId}`,
  );
  assert.equal(res.resolvedCardId, null);
  assert.ok(res.candidates.length >= 2);
  assert.ok(res.candidates.some((c) => c.cardId === t.id));
  assert.ok(res.candidates.some((c) => c.cardId === twin.cardId));
  assert.match(res.explanation, /share this artwork/i);
});

/**
 * Massacre Girl, Known Killer exists in the fixtures as two printings (ecc 79
 * and mkm 94). Whichever way the engine handles them, it must not mistake one
 * for a different CARD.
 */
test('Massacre Girl: both printings map to the same card', async () => {
  const girls = truth.filter((t) => t.name.startsWith('Massacre Girl'));
  assert.equal(girls.length, 2);
  const groups = new Set<number>();
  for (const t of girls) {
    const res = await recognise('clean', t);
    const top = res.candidates[0];
    assert.ok(top, `${t.set} ${t.cn}: nothing matched`);
    groups.add(top.oracleGroup);
  }
  assert.equal(groups.size, 1, 'two printings of one card resolved to different cards');
});

/**
 * Double-faced cards are photographed front-face-up, and that is the face the
 * index holds. This pins that the layout does not confuse the art window.
 */
test('double-faced cards match on their front face', async () => {
  const dfc = truth.filter((t) => t.name.includes('//'));
  assert.ok(dfc.length > 0);
  for (const t of dfc) {
    const res = await recognise('clean', t);
    const top = res.candidates[0];
    assert.ok(top, `${t.name}: nothing matched`);
    assert.equal(top.cardId, t.id, `${t.name}: matched the wrong printing`);
    assert.ok(top.pDistance <= THRESHOLDS.accept, `${t.name}: matched at ${top.pDistance} bits`);
  }
});

// ---------------------------------------------------------------------------
// Frame handling
// ---------------------------------------------------------------------------

test('a frame with no card in it reports no-card, not a guess', async () => {
  // Flat mid-grey: nothing to find. The engine must say so rather than
  // rectifying noise and matching whatever it lands on.
  const blank: RgbaImage = {
    data: new Uint8ClampedArray(400 * 300 * 4).fill(128),
    width: 400,
    height: 300,
  };
  const res = await recognizeCard(blank, { index, lookupPrintings });
  assert.equal(res.status, 'no-card');
  assert.deepEqual(res.candidates, []);
  assert.equal(res.resolvedCardId, null);
  assert.equal(res.offerVisionFallback, false, 'no card in frame is not a job for the model');
});

test('assessFrame finds and rates a real capture', async () => {
  const t = truth[0];
  const q = assessFrame(await loadFrame(capturePath('clean', t.id)));
  assert.notEqual(q.state, 'no-card');
  assert.ok(q.quad, 'a card should have been located');
  assert.ok(q.areaFraction > 0.05 && q.areaFraction < 0.95, `implausible area ${q.areaFraction}`);
  assert.ok(q.sharpness > 0);
});

test('assessFrame reports no-card on a blank frame', () => {
  const blank: RgbaImage = {
    data: new Uint8ClampedArray(400 * 300 * 4).fill(128),
    width: 400,
    height: 300,
  };
  assert.equal(assessFrame(blank).state, 'no-card');
});

test('a blurred capture is rated less sharp than a clean one', async () => {
  const t = truth[0];
  const clean = assessFrame(await loadFrame(capturePath('clean', t.id)));
  const moderate = assessFrame(await loadFrame(capturePath('moderate', t.id)));
  assert.ok(
    moderate.sharpness < clean.sharpness,
    `sharpness did not drop: clean ${clean.sharpness}, moderate ${moderate.sharpness}`,
  );
});

test('rectifying a capture reproduces the catalogue hash closely', async () => {
  // Ties the query path back to the index path: the hash of a photograph of a
  // card must land near the hash of that card's catalogue render, or nothing
  // downstream can work.
  const t = truth.find((x) => x.group === 'E_control')!;
  const rect = rectifyCard(await loadFrame(capturePath('clean', t.id)));
  assert.ok(rect, 'rectification failed on a clean capture');
  const { p, d } = hashRectifiedCard(rect.card);
  const stored = index.distanceTo(t.id, p, d);
  assert.ok(stored, 'truth card missing from the fixture index');
  assert.ok(
    stored.pDistance <= THRESHOLDS.accept,
    `photo hashed ${stored.pDistance} bits from the catalogue render`,
  );
});

test('recognition reports timings for each layer', async () => {
  const res = await recognise('clean', truth[0]);
  assert.ok(res.timings.totalMs > 0);
  assert.ok(res.timings.searchMs >= 0);
  // The hash search over the fixture index must be far below a video frame.
  assert.ok(res.timings.searchMs < 50, `search took ${res.timings.searchMs} ms`);
});

/**
 * The OCR layer only runs when the art genuinely cannot decide, so these tests
 * force that situation with a twin printing rather than relying on a fixture
 * card that happens to collide today.
 */
async function shareArtScenario() {
  const t = truth.find((x) => x.group === 'E_control')!;
  const real = index.rowAt(indexOfCard(t.id));
  const twinId = '00000000-0000-4000-8000-00000000beef';
  const rows = [
    { cardId: twinId, oracleGroup: real.oracleGroup, artPHash: real.artPHash, artDHash: real.artDHash },
  ];
  for (let i = 0; i < index.size; i++) rows.push(index.rowAt(i));

  const identities: PrintingIdentity[] = [
    { cardId: t.id, setCode: t.set, collectorNumber: String(t.cn) },
    // A deliberately different printing: another set, another number.
    { cardId: twinId, setCode: 'ZZZ', collectorNumber: '999' },
  ];
  return {
    truthCard: t,
    twinId,
    index: CardHashIndex.fromRows(rows),
    frame: await loadFrame(capturePath('clean', t.id)),
    lookup: async (ids: string[]) => identities.filter((i) => ids.includes(i.cardId)),
  };
}

test('OCR throwing degrades to the picker, not to an exception', async () => {
  // OCR failing is routine — a blurred bottom line, a worker that did not load.
  const s = await shareArtScenario();
  const res = await recognizeCard(s.frame, {
    index: s.index,
    lookupPrintings: s.lookup,
    ocr: async () => {
      throw new Error('tesseract exploded');
    },
  });
  assert.equal(res.status, 'choose-printing');
  assert.equal(res.resolvedCardId, null);
});

test('an OCR read that matches nothing leaves the decision with the user', async () => {
  const s = await shareArtScenario();
  const res = await recognizeCard(s.frame, {
    index: s.index,
    lookupPrintings: s.lookup,
    ocr: async () => '4242/9999 QQQ',
  });
  assert.notEqual(
    res.status,
    'resolved',
    'a collector number matching no known printing must not resolve one',
  );
});

test('a collector number that matches but a set code that does not is refused', async () => {
  // The fail-safe conjunction, exercised through the whole pipeline rather than
  // just the parser: the number is the twin's, the set code is the real card's,
  // so neither printing agrees on both and nothing may be committed.
  const s = await shareArtScenario();
  const res = await recognizeCard(s.frame, {
    index: s.index,
    lookupPrintings: s.lookup,
    ocr: async () => `999/300 C\n${s.truthCard.set.toUpperCase()} • EN`,
  });
  assert.notEqual(res.status, 'resolved');
});

test('a correct OCR read resolves a shared-art printing', async () => {
  const s = await shareArtScenario();
  const res = await recognizeCard(s.frame, {
    index: s.index,
    lookupPrintings: s.lookup,
    ocr: async () => `${s.truthCard.cn}/300 C\n${s.truthCard.set.toUpperCase()} • EN`,
  });
  assert.equal(res.status, 'resolved');
  assert.equal(res.resolvedBy, 'collector-number');
  assert.equal(res.resolvedCardId, s.truthCard.id);
  assert.equal(res.confidence, 'high');
});

test('the OCR layer is not reached when no printing is contested', async () => {
  // Cost control as much as correctness: OCR is ~1s, and running it on a scan
  // that the hash already settled would make the common case slow for nothing.
  const t = truth.find((x) => siblingsOf(x).length === 1)!;
  let ocrCalls = 0;
  const res = await recognizeCard(await loadFrame(capturePath('clean', t.id)), {
    index,
    lookupPrintings,
    ocr: async () => {
      ocrCalls++;
      return '';
    },
  });
  assert.equal(res.status, 'resolved');
  assert.equal(ocrCalls, 0, 'OCR ran despite there being nothing to disambiguate');
});

test('the committed index is bit-identical to re-hashing the fixture card images', async () => {
  // Pins the whole offline half of the pipeline in one assertion: the art
  // window, the greyscale reduction, the DCT and both hash constructions.
  //
  // The index is built once in Node from catalogue renders and queried forever
  // in a browser. If any of those steps drifts, nothing throws — every stored
  // hash simply stops describing the image it was computed from, distances
  // inflate, and accuracy quietly falls. So the fixture index is checked
  // against a fresh hash of the very images it was built from, through the
  // exact path `scripts/vision/build-hash-index.mjs` uses (raw decode ->
  // rgbToGray -> cropGray(ART_WINDOW) -> pHash/dHash, no rectification, because
  // catalogue renders are already flat and square-on).
  //
  // Deliberately demands ZERO bits of difference, not "close enough". These are
  // the same bytes through the same code; anything but exact equality is drift.
  let checked = 0;
  for (const t of truth) {
    const file = path.join(FIX, 'cards', `${t.id}.jpg`);
    if (!fs.existsSync(file)) continue;

    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const gray = rgbToGray(new Uint8Array(data), info.width, info.height);
    const art = cropGray(gray, ART_WINDOW);

    const hit = index.distanceTo(t.id, pHash(art), dHash(art));
    assert.ok(hit, `${t.name} (${t.set}) is missing from the fixture index`);
    assert.equal(hit.pDistance, 0, `art pHash drifted for ${t.name} (${t.set})`);
    assert.equal(hit.dDistance, 0, `art dHash drifted for ${t.name} (${t.set})`);
    checked++;
  }
  assert.ok(checked >= 10, `expected to check at least 10 cards, checked ${checked}`);
});
