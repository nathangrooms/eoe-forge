/**
 * 64-bit perceptual hashes, and Hamming distance over them.
 *
 * A hash is carried as two 32-bit halves rather than a BigInt. That is a
 * measured decision, not a stylistic one: over the real 50,269-entry index a
 * `BigUint64Array` scan took 61.2 ms against 0.40 ms for two `Uint32Array`s —
 * 155x slower, because every BigInt operation allocates. Reproduce with
 * `node --experimental-strip-types scripts/vision/bench-match.mjs <index.bin>`.
 */

import { resizeAreaGray, type GrayImage } from './image.ts';

/** A 64-bit hash as two unsigned 32-bit halves. */
export interface Hash64 {
  hi: number;
  lo: number;
}

/**
 * Orthonormal 2D DCT-II, matching `cv2.dct` on a square float matrix.
 *
 * Normalisation matters here even though pHash only compares coefficients
 * against their own median: the 8x8 block we keep straddles the DC row and
 * column, whose basis vectors carry a different scale factor (sqrt(1/N)) from
 * every other coefficient (sqrt(2/N)). Get that wrong and the bits along the
 * first row and column flip.
 *
 * Separable, O(n^3), with the cosine basis built once per size. At n=32 that is
 * ~65k multiplies — far below the cost of decoding the frame.
 */
const dctBasisCache = new Map<number, Float64Array>();

function dctBasis(n: number): Float64Array {
  const cached = dctBasisCache.get(n);
  if (cached) return cached;
  // basis[j * n + k] = alpha(j) * cos(pi * (2k + 1) * j / (2n))
  const basis = new Float64Array(n * n);
  const c0 = Math.sqrt(1 / n);
  const ck = Math.sqrt(2 / n);
  for (let j = 0; j < n; j++) {
    const alpha = j === 0 ? c0 : ck;
    for (let k = 0; k < n; k++) {
      basis[j * n + k] = alpha * Math.cos((Math.PI * (2 * k + 1) * j) / (2 * n));
    }
  }
  dctBasisCache.set(n, basis);
  return basis;
}

/** 2D DCT-II of an n x n matrix, returned row-major. */
export function dct2(input: Float64Array, n: number): Float64Array {
  const basis = dctBasis(n);
  const tmp = new Float64Array(n * n);
  // rows: tmp = X * C^T
  for (let r = 0; r < n; r++) {
    const rowOff = r * n;
    for (let j = 0; j < n; j++) {
      const bOff = j * n;
      let s = 0;
      for (let k = 0; k < n; k++) s += input[rowOff + k] * basis[bOff + k];
      tmp[rowOff + j] = s;
    }
  }
  // columns: out = C * tmp
  const out = new Float64Array(n * n);
  for (let c = 0; c < n; c++) {
    for (let j = 0; j < n; j++) {
      const bOff = j * n;
      let s = 0;
      for (let k = 0; k < n; k++) s += tmp[k * n + c] * basis[bOff + k];
      out[j * n + c] = s;
    }
  }
  return out;
}

/** Median of a numeric array. Matches NumPy: even lengths average the two middles. */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Below this magnitude a DCT coefficient is treated as exactly zero.
 *
 * This is not cosmetic. In a flat or near-flat region the true coefficient is
 * 0, but summing 1024 cosine products in floating point leaves a residue around
 * 1e-13 whose *sign is arbitrary*. Thresholding against the median then decides
 * those bits from numerical noise rather than from the image — so the same card
 * could hash differently depending on nothing at all.
 *
 * Two consequences make this worth fixing rather than tolerating:
 *
 *   * The index is built in Node and queried in browsers. `Math.cos` is not
 *     required to be correctly rounded, so V8, JavaScriptCore and SpiderMonkey
 *     may differ by an ULP — enough to flip the sign of a residue, and with it
 *     a hash bit, on every flat region of every card.
 *   * OpenCV computes in float32, where these residues flush to exactly 0.
 *     Snapping is what makes our float64 result agree with the reference the
 *     accuracy numbers were measured against.
 *
 * Input is 0..255 over a 32x32 block, so genuine coefficients of interest are
 * comfortably above 1e-2. 1e-6 sits far below any real signal and far above any
 * accumulation error.
 */
const DCT_ZERO_EPSILON = 1e-6;

/**
 * pHash: DCT of a 32x32 reduction, keep the top-left 8x8 low-frequency block,
 * threshold each coefficient against the median of the block excluding DC.
 *
 * Excluding the DC term is what makes the hash invariant to overall brightness:
 * DC is total luminance, so a dim photo and a bright one differ enormously in
 * that one coefficient and barely at all in the rest.
 */
export function pHash(gray: GrayImage): Hash64 {
  const small = resizeAreaGray(gray, 32, 32);
  const f = new Float64Array(32 * 32);
  for (let i = 0; i < f.length; i++) f[i] = small.data[i];
  const d = dct2(f, 32);

  const low: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = d[y * 32 + x];
      low.push(Math.abs(v) < DCT_ZERO_EPSILON ? 0 : v);
    }
  }
  const med = median(low.slice(1)); // skip DC: it is total brightness, not structure
  const bits: boolean[] = low.map((v) => v > med);
  return packBits(bits);
}

/**
 * dHash: horizontal gradient of a 9x8 reduction.
 *
 * Carried alongside pHash as an independent second opinion. It responds to
 * different image structure (local edges rather than global frequency), so the
 * two rarely fail on the same image — which is what makes the agreement between
 * them a usable confidence signal.
 */
export function dHash(gray: GrayImage): Hash64 {
  const small = resizeAreaGray(gray, 9, 8);
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(small.data[y * 9 + x + 1] > small.data[y * 9 + x]);
    }
  }
  return packBits(bits);
}

/**
 * Pack 64 booleans MSB-first into two 32-bit halves.
 *
 * The bit order matches the reference implementation's left-shift accumulation,
 * so a hash computed here and one computed there are the same integer.
 */
export function packBits(bits: boolean[]): Hash64 {
  if (bits.length !== 64) throw new Error(`packBits expects 64 bits, got ${bits.length}`);
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 32; i++) hi = ((hi << 1) | (bits[i] ? 1 : 0)) >>> 0;
  for (let i = 32; i < 64; i++) lo = ((lo << 1) | (bits[i] ? 1 : 0)) >>> 0;
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

/** Hamming weight of a 32-bit word, branch-free. */
export function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24) & 0xff;
}

/** Hamming distance between two 64-bit hashes, 0..64. */
export function hamming64(a: Hash64, b: Hash64): number {
  return popcount32((a.hi ^ b.hi) >>> 0) + popcount32((a.lo ^ b.lo) >>> 0);
}

/** Lowercase 16-char hex, MSB first. Used for storage and for test fixtures. */
export function hashToHex(h: Hash64): string {
  return (h.hi >>> 0).toString(16).padStart(8, '0') + (h.lo >>> 0).toString(16).padStart(8, '0');
}

/** Inverse of {@link hashToHex}. */
export function hexToHash(hex: string): Hash64 {
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) throw new Error(`bad hash hex: ${hex}`);
  return {
    hi: parseInt(hex.slice(0, 8), 16) >>> 0,
    lo: parseInt(hex.slice(8, 16), 16) >>> 0,
  };
}
