/**
 * Finding the card in a frame, and flattening it.
 *
 * This layer is what makes rotation and perspective irrelevant to everything
 * downstream. The hash is not rotation- or skew-invariant and does not need to
 * be: once the four corners are known, a perspective warp puts the card in a
 * canonical 488x680 frame, and a photo taken at 30 degrees off-axis produces
 * essentially the same hash as one taken square on.
 *
 * Implemented directly rather than via OpenCV.js because opencv.js is a ~9 MB
 * WASM download to use perhaps six of its functions, on a feature whose entire
 * selling point is that it is lighter than a network round trip.
 */

import { resizeAreaGray, type GrayImage } from './image.ts';
import { CANON_W, CANON_H } from './artWindow.ts';

export interface Point {
  x: number;
  y: number;
}

export interface DetectedQuad {
  /** Corners in the source frame's coordinates, ordered TL, TR, BR, BL. */
  corners: [Point, Point, Point, Point];
  /** Quad area as a fraction of the frame. */
  areaFraction: number;
  /**
   * How rectangular the quad is, 0..1. 1.0 is a perfect rectangle.
   * Used to reject the many four-sided blobs that are not cards.
   */
  rectangularity: number;
}

/** Tunables for detection, exposed so tests can pin them. */
export interface DetectOptions {
  /** Frames are downscaled to this width before detection. */
  workingWidth?: number;
  /** Reject quads covering less than this fraction of the frame. */
  minAreaFraction?: number;
  /** Reject quads covering more than this fraction (usually a frame-sized blob). */
  maxAreaFraction?: number;
  /** Reject quads less rectangular than this. */
  minRectangularity?: number;
}

const DEFAULTS: Required<DetectOptions> = {
  workingWidth: 360,
  minAreaFraction: 0.06,
  maxAreaFraction: 0.98,
  minRectangularity: 0.62,
};

/**
 * Locate the card quadrilateral in a grayscale frame.
 *
 * Runs several segmentations and scores every plausible quad from each, rather
 * than trusting one segmentation's largest blob. Two things forced that:
 *
 *  * A card can be lighter than its background, darker than it, or the same
 *    brightness with only the edge gradient between them. No single threshold
 *    handles all three.
 *  * The largest connected region in a frame is usually the BACKGROUND, not the
 *    card. Its convex hull is the frame itself — a flawless rectangle covering
 *    ~100% of the image, which beats the real card on any naive score. So
 *    frame-sized quads are rejected outright and several components per mask
 *    are considered, not just the biggest.
 */
export function detectCardQuad(frame: GrayImage, options: DetectOptions = {}): DetectedQuad | null {
  const opts = { ...DEFAULTS, ...options };
  const scale = frame.width > opts.workingWidth ? opts.workingWidth / frame.width : 1;
  const work =
    scale < 1
      ? resizeAreaGray(frame, Math.round(frame.width * scale), Math.round(frame.height * scale))
      : frame;

  const blurred = gaussianBlur5(work);
  const w = work.width;
  const h = work.height;
  const candidates: DetectedQuad[] = [];

  const consider = (mask: Uint8Array) => {
    for (const comp of topComponents(mask, w, h, 3)) {
      const quad = quadFromComponent(comp, w, h, opts);
      if (quad) candidates.push(quad);
    }
  };

  // Hypothesis 1 & 2: the card is separable by brightness, either way round.
  const otsu = otsuThreshold(blurred);
  consider(threshold(blurred, otsu, false));
  consider(threshold(blurred, otsu, true));

  // Hypothesis 3: the card's outline is the strongest closed edge structure.
  // Here the edge pixels themselves are the component, so the card border forms
  // a connected loop whose hull is the card.
  const grad = sobelMagnitude(blurred);
  const edges = dilate3(threshold(grad, otsuThreshold(grad), false), w, h);
  consider(edges);

  // Hypothesis 4: the card interior as a non-edge region.
  consider(invertMask(edges));

  if (candidates.length === 0) return null;

  // Prefer rectangular, then large. A near-perfect rectangle at 20% of frame is
  // a card held back from the lens; a ragged blob at 80% is a table edge.
  candidates.sort(
    (a, b) => b.rectangularity * 2 + b.areaFraction - (a.rectangularity * 2 + a.areaFraction),
  );
  const best = candidates[0];

  // Map corners back to the original frame's coordinate space.
  const inv = 1 / scale;
  return {
    ...best,
    corners: best.corners.map((p) => ({ x: p.x * inv, y: p.y * inv })) as [
      Point,
      Point,
      Point,
      Point,
    ],
  };
}

function quadFromComponent(
  comp: { pixels: number; boundary: Point[] },
  width: number,
  height: number,
  opts: Required<DetectOptions>,
): DetectedQuad | null {
  const hull = convexHull(comp.boundary);
  if (hull.length < 4) return null;
  const quad = simplifyToQuad(hull);
  if (!quad) return null;

  const ordered = orderCorners(quad);
  const quadArea = polygonArea(ordered);
  if (quadArea <= 0) return null;

  // The size test belongs on the QUAD, not on the component pixel count. A
  // ragged background component can cover 70% of the pixels while its convex
  // hull is the entire frame, and only the hull is what we would go on to warp.
  const frac = quadArea / (width * height);
  if (frac < opts.minAreaFraction || frac > opts.maxAreaFraction) return null;

  // A convex hull always contains its inscribed quad, so this ratio says how
  // much of the detected shape the four corners actually explain.
  const hullArea = polygonArea(hull);
  const rect = hullArea > 0 ? Math.min(1, quadArea / hullArea) : 0;
  if (rect < opts.minRectangularity) return null;

  return { corners: ordered, areaFraction: frac, rectangularity: rect };
}

function threshold(img: GrayImage, t: number, invert: boolean): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    const on = img.data[i] > t;
    out[i] = (invert ? !on : on) ? 1 : 0;
  }
  return out;
}

function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** Otsu's method: the threshold maximising between-class variance. */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

/** Separable 5x5 Gaussian, sigma ~1.1 (the classic 1 4 6 4 1 kernel). */
export function gaussianBlur5(img: GrayImage): GrayImage {
  const { width: w, height: h, data } = img;
  const k = [1, 4, 6, 4, 1];
  const norm = 16;
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += data[y * w + xx] * k[i + 2];
      }
      tmp[y * w + x] = s / norm;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += tmp[yy * w + x] * k[i + 2];
      }
      out[y * w + x] = Math.min(255, Math.max(0, Math.round(s / norm)));
    }
  }
  return { data: out, width: w, height: h };
}

/** Sobel gradient magnitude, scaled to 0..255. */
export function sobelMagnitude(img: GrayImage): GrayImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = data[i - w - 1];
      const t = data[i - w];
      const tr = data[i - w + 1];
      const l = data[i - 1];
      const r = data[i + 1];
      const bl = data[i + w - 1];
      const b = data[i + w];
      const br = data[i + w + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      out[i] = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy) / 4));
    }
  }
  return { data: out, width: w, height: h };
}

/** 3x3 binary dilation. */
export function dilate3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (mask[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

/**
 * The k largest 4-connected components of set pixels, with their boundaries.
 *
 * Returns several rather than just the biggest because the biggest is usually
 * the background. Uses an explicit stack rather than recursion: a component can
 * be 100k pixels even at working resolution, which would blow the JS call stack.
 */
function topComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  k: number,
): Array<{ pixels: number; boundary: Point[] }> {
  const labels = new Int32Array(mask.length).fill(-1);
  const sizes: number[] = [];
  let label = 0;
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] >= 0) continue;
    let count = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && labels[i - 1] < 0) { labels[i - 1] = label; stack.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && labels[i + 1] < 0) { labels[i + 1] = label; stack.push(i + 1); }
      if (y > 0 && mask[i - w] && labels[i - w] < 0) { labels[i - w] = label; stack.push(i - w); }
      if (y < h - 1 && mask[i + w] && labels[i + w] < 0) { labels[i + w] = label; stack.push(i + w); }
    }
    sizes.push(count);
    label++;
  }
  if (sizes.length === 0) return [];

  const wanted = sizes
    .map((size, id) => ({ size, id }))
    .sort((a, b) => b.size - a.size)
    .slice(0, k);
  const wantedIds = new Map(wanted.map((x, rank) => [x.id, rank]));

  const boundaries: Point[][] = wanted.map(() => []);
  // Boundary = component pixels with at least one neighbour outside the
  // component, or sitting on the frame edge. Feeding only these to the hull
  // keeps it cheap.
  for (let i = 0; i < labels.length; i++) {
    const rank = wantedIds.get(labels[i]);
    if (rank === undefined) continue;
    const lbl = labels[i];
    const x = i % w;
    const y = (i / w) | 0;
    if (
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      labels[i - 1] !== lbl || labels[i + 1] !== lbl ||
      labels[i - w] !== lbl || labels[i + w] !== lbl
    ) {
      boundaries[rank].push({ x, y });
    }
  }
  return wanted.map((x, rank) => ({ pixels: x.size, boundary: boundaries[rank] }));
}

/** Andrew's monotone chain convex hull, counter-clockwise. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Reduce a convex hull to its best four corners.
 *
 * Tries Douglas-Peucker with a binary search on epsilon first, which is what
 * `cv2.approxPolyDP` does and which tracks the true corners well on a clean
 * hull. Falls back to the maximum-area inscribed quadrilateral when no epsilon
 * yields exactly four vertices — that happens on hulls with a rounded corner,
 * where the vertex count jumps from five straight to three.
 */
export function simplifyToQuad(hull: Point[]): [Point, Point, Point, Point] | null {
  if (hull.length < 4) return null;
  if (hull.length === 4) return [hull[0], hull[1], hull[2], hull[3]];

  const perimeter = polygonPerimeter(hull);
  let lo = 0.001;
  let hi = 0.5;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2;
    const approx = douglasPeucker(hull, mid * perimeter, true);
    if (approx.length === 4) return [approx[0], approx[1], approx[2], approx[3]];
    if (approx.length > 4) lo = mid;
    else hi = mid;
  }
  return maxAreaQuad(hull);
}

/** Maximum-area quadrilateral inscribed in a convex polygon. O(n^2) over hull vertices. */
export function maxAreaQuad(hull: Point[]): [Point, Point, Point, Point] | null {
  const n = hull.length;
  if (n < 4) return null;
  let best: [Point, Point, Point, Point] | null = null;
  let bestArea = 0;
  // For each diagonal (i, k), the other two corners are independently the points
  // furthest from that diagonal on each side, so this is O(n^2) not O(n^4).
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      let bj = -1;
      let bjArea = 0;
      for (let j = i + 1; j < k; j++) {
        const a = Math.abs(triArea(hull[i], hull[j], hull[k]));
        if (a > bjArea) {
          bjArea = a;
          bj = j;
        }
      }
      let bl = -1;
      let blArea = 0;
      for (let l = k + 1; l < n + i; l++) {
        const a = Math.abs(triArea(hull[i], hull[l % n], hull[k]));
        if (a > blArea) {
          blArea = a;
          bl = l % n;
        }
      }
      if (bj < 0 || bl < 0) continue;
      const area = bjArea + blArea;
      if (area > bestArea) {
        bestArea = area;
        best = [hull[i], hull[bj], hull[k], hull[bl]];
      }
    }
  }
  return best;
}

function triArea(a: Point, b: Point, c: Point): number {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

/** Ramer-Douglas-Peucker polyline simplification. */
export function douglasPeucker(points: Point[], epsilon: number, closed: boolean): Point[] {
  if (points.length < 3) return points.slice();
  const pts = closed ? points.concat([points[0]]) : points;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistance(pts[i], pts[s], pts[e]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (idx > 0 && maxDist > epsilon) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  if (closed && out.length > 1) out.pop(); // drop the duplicated first point
  return out;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

export function polygonArea(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(s) / 2;
}

function polygonPerimeter(pts: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
  }
  return s;
}

/**
 * Put four corners in TL, TR, BR, BL order.
 *
 * Sum and difference of coordinates is the standard trick: the top-left corner
 * has the smallest x+y, the bottom-right the largest, the top-right the
 * smallest y-x and the bottom-left the largest.
 */
export function orderCorners(quad: readonly Point[]): [Point, Point, Point, Point] {
  let tl = quad[0];
  let br = quad[0];
  let tr = quad[0];
  let bl = quad[0];
  for (const p of quad) {
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x + p.y > br.x + br.y) br = p;
    if (p.y - p.x < tr.y - tr.x) tr = p;
    if (p.y - p.x > bl.y - bl.x) bl = p;
  }
  return [tl, tr, br, bl];
}

/**
 * Solve the 3x3 homography mapping four source points to four destination points.
 *
 * Straight Gaussian elimination on the 8x8 system; h22 is fixed at 1, which is
 * legitimate for any transform that does not send a finite point to infinity —
 * i.e. anything a camera pointed at a card can produce.
 */
export function getPerspectiveTransform(
  src: readonly Point[],
  dst: readonly Point[],
): Float64Array {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    a.push([src[i].x, src[i].y, 1, 0, 0, 0, -src[i].x * dst[i].x, -src[i].y * dst[i].x]);
    b.push(dst[i].x);
    a.push([0, 0, 0, src[i].x, src[i].y, 1, -src[i].x * dst[i].y, -src[i].y * dst[i].y]);
    b.push(dst[i].y);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('degenerate perspective transform');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) a[r][c] -= f * a[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = new Float64Array(9);
  for (let i = 0; i < n; i++) h[i] = b[i] / a[i][i];
  h[8] = 1;
  return h;
}

/**
 * Warp the quad in `frame` onto a canonical `outW` x `outH` grayscale image.
 *
 * Samples with bilinear interpolation from the inverse transform. Note this
 * upsamples when the card is small in frame, which cannot invent detail — the
 * blur check exists precisely because a card photographed from too far away
 * rectifies into a smooth, hash-unstable image.
 */
export function warpPerspective(
  frame: GrayImage,
  corners: readonly Point[],
  outW: number = CANON_W,
  outH: number = CANON_H,
): GrayImage {
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  // Solve destination -> source so each output pixel pulls its value.
  const h = getPerspectiveTransform(dst, corners);
  const out = new Uint8Array(outW * outH);
  const { data, width: fw, height: fh } = frame;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      if (w === 0) continue;
      const sx = (h[0] * x + h[1] * y + h[2]) / w;
      const sy = (h[3] * x + h[4] * y + h[5]) / w;
      if (sx < 0 || sy < 0 || sx > fw - 1 || sy > fh - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, fw - 1);
      const y1 = Math.min(y0 + 1, fh - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const v =
        data[y0 * fw + x0] * (1 - fx) * (1 - fy) +
        data[y0 * fw + x1] * fx * (1 - fy) +
        data[y1 * fw + x0] * (1 - fx) * fy +
        data[y1 * fw + x1] * fx * fy;
      out[y * outW + x] = Math.round(v);
    }
  }
  return { data: out, width: outW, height: outH };
}
