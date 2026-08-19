/**
 * Image primitives for the local card-recognition pipeline.
 *
 * Everything here is pure: it takes plain pixel buffers and returns plain pixel
 * buffers. No canvas, no DOM, no camera. That is deliberate — the exact same
 * functions run in the browser (fed by `ctx.getImageData`) and in the Node
 * index builder (fed by `sharp(...).raw()`), so an index entry and a live query
 * are guaranteed to be produced by identical arithmetic.
 *
 * The grayscale and area-resize routines reproduce OpenCV's integer behaviour
 * (`COLOR_RGB2GRAY`, `INTER_AREA`) rather than the "obvious" float versions.
 * That is not gold-plating: the reference measurements this pipeline is
 * calibrated against were produced with OpenCV, and `verify-hash-parity.mjs`
 * asserts the two agree bit-for-bit on real card images.
 */

/** Single-channel 8-bit image. */
export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Interleaved 8-bit RGBA image — the shape `ImageData` already has. */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** A normalised sub-rectangle, each component in [0, 1]. */
export interface NormRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// OpenCV's Q14 fixed-point luma weights (modules/imgproc/src/color_rgb.simd.hpp).
// Using these rather than 0.299/0.587/0.114 in floating point is what makes the
// output bit-identical to cv2.cvtColor.
const R2Y = 4899;
const G2Y = 9617;
const B2Y = 1868;
const YUV_SHIFT = 14;
const YUV_HALF = 1 << (YUV_SHIFT - 1);

/** RGBA -> 8-bit grayscale, matching `cv2.cvtColor(..., COLOR_RGB2GRAY)`. */
export function rgbaToGray(img: RgbaImage): GrayImage {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (data[p] * R2Y + data[p + 1] * G2Y + data[p + 2] * B2Y + YUV_HALF) >> YUV_SHIFT;
  }
  return { data: out, width, height };
}

/** Interleaved 3-channel RGB -> 8-bit grayscale. Same weights as above. */
export function rgbToGray(data: Uint8Array, width: number, height: number): GrayImage {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 3) {
    out[i] = (data[p] * R2Y + data[p + 1] * G2Y + data[p + 2] * B2Y + YUV_HALF) >> YUV_SHIFT;
  }
  return { data: out, width, height };
}

/**
 * Area-average resize, matching `cv2.resize(..., interpolation=INTER_AREA)`.
 *
 * Each destination pixel is the mean of the source pixels its footprint covers,
 * with fractional weights on the partially-covered edge pixels. This is the
 * correct filter for heavy downscaling (we go from a whole card to 32x32) and
 * it is what makes the hash stable against sensor noise: every output pixel is
 * an average over hundreds of input pixels.
 *
 * OpenCV rounds the accumulated float with `saturate_cast<uchar>`, which is
 * round-half-away-from-zero on non-negative values.
 */
export function resizeAreaGray(src: GrayImage, dstW: number, dstH: number): GrayImage {
  if (dstW <= 0 || dstH <= 0) throw new Error(`resizeAreaGray: bad target ${dstW}x${dstH}`);
  if (dstW === src.width && dstH === src.height) {
    return { data: src.data.slice(), width: dstW, height: dstH };
  }
  const scaleX = src.width / dstW;
  const scaleY = src.height / dstH;
  const out = new Uint8Array(dstW * dstH);

  for (let dy = 0; dy < dstH; dy++) {
    const fy0 = dy * scaleY;
    const fy1 = Math.min((dy + 1) * scaleY, src.height);
    const sy0 = Math.floor(fy0);
    const sy1 = Math.min(Math.ceil(fy1), src.height);

    for (let dx = 0; dx < dstW; dx++) {
      const fx0 = dx * scaleX;
      const fx1 = Math.min((dx + 1) * scaleX, src.width);
      const sx0 = Math.floor(fx0);
      const sx1 = Math.min(Math.ceil(fx1), src.width);

      let acc = 0;
      let wsum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        // vertical overlap of source row `sy` with the destination footprint
        const wy = Math.min(sy + 1, fy1) - Math.max(sy, fy0);
        if (wy <= 0) continue;
        const row = sy * src.width;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(sx + 1, fx1) - Math.max(sx, fx0);
          if (wx <= 0) continue;
          const w = wx * wy;
          acc += src.data[row + sx] * w;
          wsum += w;
        }
      }
      const v = wsum > 0 ? acc / wsum : 0;
      out[dy * dstW + dx] = v < 0 ? 0 : v > 255 ? 255 : Math.floor(v + 0.5);
    }
  }
  return { data: out, width: dstW, height: dstH };
}

/**
 * Crop a normalised rectangle out of a grayscale image.
 *
 * Bounds are floored to integers the same way the reference implementation
 * indexes a NumPy array, so the pixel set is identical.
 */
export function cropGray(src: GrayImage, rect: NormRect): GrayImage {
  const x0 = clampInt(Math.floor(rect.x0 * src.width), 0, src.width - 1);
  const y0 = clampInt(Math.floor(rect.y0 * src.height), 0, src.height - 1);
  const x1 = clampInt(Math.floor(rect.x1 * src.width), x0 + 1, src.width);
  const y1 = clampInt(Math.floor(rect.y1 * src.height), y0 + 1, src.height);
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const srcRow = (y0 + y) * src.width + x0;
    out.set(src.data.subarray(srcRow, srcRow + w), y * w);
  }
  return { data: out, width: w, height: h };
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Variance of the Laplacian — the standard focus measure.
 *
 * Used only for live UI feedback ("too blurry"), never to accept or reject a
 * match; the Hamming distance does that. The absolute value is scale- and
 * exposure-dependent, so the threshold it feeds is calibrated on rectified
 * cards at a fixed size, not on raw frames.
 */
export function laplacianVariance(img: GrayImage): number {
  const { data, width, height } = img;
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v =
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Mean luma, for the "too dark" hint in the camera UI. */
export function meanLuma(img: GrayImage): number {
  let sum = 0;
  for (let i = 0; i < img.data.length; i++) sum += img.data[i];
  return sum / img.data.length;
}
