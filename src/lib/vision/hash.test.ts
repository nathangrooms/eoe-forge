/**
 * The hash primitives, pinned against OpenCV.
 *
 *   node --test --experimental-strip-types src/lib/vision/hash.test.ts
 *
 * The index is built once in Node and queried forever in a browser, and the
 * accuracy thresholds in `recognize.ts` were calibrated against an OpenCV
 * implementation. If this arithmetic drifts, nothing throws — accuracy just
 * quietly degrades, and the calibration silently stops applying. So the
 * expected values below were produced by `cv2` and are pinned.
 *
 * The test images are generated procedurally from formulas duplicated exactly
 * on the Python side, so this cross-implementation check needs no binary
 * fixture committed to the repo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resizeAreaGray, cropGray, rgbaToGray, rgbToGray, type GrayImage } from './image.ts';
import { pHash, dHash, dct2, hamming64, hashToHex, hexToHash, packBits, popcount32 } from './hash.ts';

const H = 200;
const W = 140;

function make(fn: (x: number, y: number) => number): GrayImage {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = fn(x, y) & 0xff;
  return { data, width: W, height: H };
}

const patterns: Record<string, GrayImage> = {
  ramp_x: make((x) => Math.trunc((x / (W - 1)) * 255)),
  ramp_y: make((_x, y) => Math.trunc((y / (H - 1)) * 255)),
  checker16: make((x, y) => ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 255),
  radial: make((x, y) =>
    Math.trunc(((Math.sin(Math.hypot(x - W / 2, y - H / 2) / 7.0) + 1) / 2) * 255),
  ),
  lcg: (() => {
    // Same linear congruential generator as the Python reference. Math.imul,
    // not `*`: the product exceeds 2^53 and plain multiplication would lose
    // low bits, silently diverging from Python's exact integer arithmetic.
    const data = new Uint8Array(W * H);
    let s = 12345;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      data[i] = (s >>> 16) & 0xff;
    }
    return { data, width: W, height: H };
  })(),
};

/** Produced by OpenCV 5.0.0 / NumPy 2.4.4. See scripts/vision/parity-reference.py. */
const OPENCV_EXPECTED: Record<string, { phash: string; dhash: string; gray32_sum: number }> = {
  ramp_x: { phash: 'aa00000000000000', dhash: 'ffffffffffffffff', gray32_sum: 130080 },
  ramp_y: { phash: '8000000000000000', dhash: '0000000000000000', gray32_sum: 130048 },
  checker16: { phash: 'd555d55555555454', dhash: 'aaaa555555aaaa55', gray32_sum: 130108 },
  radial: { phash: 'a1d6d781a897859e', dhash: '8e71ceb2b28e718e', gray32_sum: 135982 },
  lcg: { phash: '8794ed38ceb06297', dhash: 'cf466dd4c4a94a43', gray32_sum: 130533 },
};

for (const [name, expected] of Object.entries(OPENCV_EXPECTED)) {
  test(`pHash of "${name}" matches OpenCV exactly`, () => {
    assert.equal(hashToHex(pHash(patterns[name])), expected.phash);
  });

  test(`dHash of "${name}" matches OpenCV exactly`, () => {
    assert.equal(hashToHex(dHash(patterns[name])), expected.dhash);
  });

  test(`INTER_AREA 32x32 reduction of "${name}" matches OpenCV`, () => {
    const g = resizeAreaGray(patterns[name], 32, 32);
    let sum = 0;
    for (const v of g.data) sum += v;
    // OpenCV rounds the accumulator half-to-even, we round half-away-from-zero,
    // so a single pixel of a 1024-pixel reduction may land one level apart.
    // Anything larger is a real algorithmic divergence.
    assert.ok(
      Math.abs(sum - expected.gray32_sum) <= 1,
      `sum ${sum} vs OpenCV ${expected.gray32_sum}`,
    );
  });
}

test('dct2 reproduces cv2.dct on a known matrix', () => {
  const input = new Float64Array(64);
  for (let i = 0; i < 64; i++) input[i] = i;
  const got = dct2(input, 8);
  // cv2.dct(np.arange(64, dtype=np.float32).reshape(8, 8))
  const expected: Record<number, number> = {
    0: 252.0, 1: -18.221642, 3: -1.904818, 5: -0.568239, 7: -0.143408,
    8: -145.773132, 24: -15.238544, 40: -4.545914, 56: -1.147262,
  };
  for (let i = 0; i < 64; i++) {
    const want = expected[i] ?? 0;
    assert.ok(
      Math.abs(got[i] - want) < 1e-4,
      `coefficient ${i}: got ${got[i]}, expected ${want}`,
    );
  }
});

test('a uniform image hashes to all-zero pHash bits below DC', () => {
  // Every AC coefficient is 0, so nothing exceeds the median of zeros; only the
  // DC term survives. This is the degenerate case a blank frame produces, and
  // it must not throw.
  const flat: GrayImage = { data: new Uint8Array(W * H).fill(128), width: W, height: H };
  const h = pHash(flat);
  assert.equal(hashToHex(h), '8000000000000000');
});

test('hamming64 counts differing bits', () => {
  assert.equal(hamming64({ hi: 0, lo: 0 }, { hi: 0, lo: 0 }), 0);
  assert.equal(hamming64({ hi: 0, lo: 0 }, { hi: 0xffffffff, lo: 0xffffffff }), 64);
  assert.equal(hamming64({ hi: 0, lo: 1 }, { hi: 0, lo: 0 }), 1);
  assert.equal(hamming64({ hi: 0x80000000, lo: 0 }, { hi: 0, lo: 0 }), 1);
});

test('popcount32 handles the sign bit', () => {
  // A naive implementation using >> instead of >>> gets 0xffffffff wrong.
  assert.equal(popcount32(0xffffffff), 32);
  assert.equal(popcount32(0x80000000), 1);
  assert.equal(popcount32(0), 0);
});

test('hex round-trips, including hashes with the top bit set', () => {
  for (const h of [
    { hi: 0, lo: 0 },
    { hi: 0xffffffff, lo: 0xffffffff },
    { hi: 0x8794ed38, lo: 0xceb06297 },
  ]) {
    assert.deepEqual(hexToHash(hashToHex(h)), h);
  }
});

test('hexToHash rejects malformed input rather than returning NaN', () => {
  assert.throws(() => hexToHash('nope'));
  assert.throws(() => hexToHash('abc'));
  assert.throws(() => hexToHash('8794ed38ceb0629'));
});

test('packBits is MSB-first across the hi/lo split', () => {
  const bits = new Array(64).fill(false);
  bits[0] = true;
  assert.equal(hashToHex(packBits(bits)), '8000000000000000');
  const bits2 = new Array(64).fill(false);
  bits2[32] = true;
  assert.equal(hashToHex(packBits(bits2)), '0000000080000000');
  assert.throws(() => packBits(new Array(63).fill(false)));
});

test('rgbaToGray and rgbToGray agree and use OpenCV luma weights', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const a = rgbaToGray({ data: rgba, width: 4, height: 1 });
  const b = rgbToGray(rgb, 4, 1);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
  // (255*4899 + 8192) >> 14 = 76 etc — the fixed-point form, not 0.299*255=76.2
  assert.deepEqual(Array.from(a.data), [76, 150, 29, 255]);
});

test('resizeAreaGray averages exactly on an integer downscale', () => {
  const src: GrayImage = { data: new Uint8Array([0, 10, 20, 30]), width: 2, height: 2 };
  const out = resizeAreaGray(src, 1, 1);
  assert.equal(out.data[0], 15); // mean of 0,10,20,30
});

test('resizeAreaGray is identity at the same size', () => {
  const out = resizeAreaGray(patterns.radial, W, H);
  assert.deepEqual(Array.from(out.data), Array.from(patterns.radial.data));
});

test('cropGray floors bounds the way the reference indexes an array', () => {
  const src: GrayImage = {
    data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    width: 4,
    height: 4,
  };
  const out = cropGray(src, { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 });
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.deepEqual(Array.from(out.data), [5, 6, 9, 10]);
});

test('cropGray never returns an empty image', () => {
  const src: GrayImage = { data: new Uint8Array(16), width: 4, height: 4 };
  const out = cropGray(src, { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5 });
  assert.ok(out.width >= 1 && out.height >= 1);
});

test('the hash is stable under mild JPEG-like perturbation', () => {
  // The property the whole system rests on: small pixel changes must not move
  // the hash far. A few levels of noise should cost a handful of bits at most.
  const base = patterns.radial;
  const noisy = new Uint8Array(base.data);
  let s = 999;
  for (let i = 0; i < noisy.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    noisy[i] = Math.max(0, Math.min(255, noisy[i] + (((s >>> 16) & 7) - 3)));
  }
  const d = hamming64(pHash(base), pHash({ data: noisy, width: W, height: H }));
  assert.ok(d <= 4, `noise moved the hash ${d} bits`);
});

test('different images hash far apart', () => {
  const d = hamming64(pHash(patterns.radial), pHash(patterns.lcg));
  assert.ok(d >= 12, `unrelated images only ${d} bits apart`);
});
