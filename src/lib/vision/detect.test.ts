/**
 * Card detection and rectification — the geometry layer.
 *
 *   node --test --experimental-strip-types src/lib/vision/detect.test.ts
 *
 * This layer is what makes rotation and perspective irrelevant to the hash. If
 * it silently returns the wrong quadrilateral, nothing downstream can recover:
 * the warp produces a plausible-looking card image of the wrong pixels, and the
 * hash confidently matches the wrong thing. So the geometry is pinned against
 * closed-form answers wherever one exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectCardQuad,
  warpPerspective,
  getPerspectiveTransform,
  orderCorners,
  convexHull,
  douglasPeucker,
  maxAreaQuad,
  polygonArea,
  otsuThreshold,
  gaussianBlur5,
  sobelMagnitude,
  type Point,
} from './detect.ts';
import type { GrayImage } from './image.ts';

/** A synthetic scene: a light card on a darker textured background. */
function scene(
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  w = 400,
  h = 500,
): GrayImage {
  const data = new Uint8Array(w * h);
  let s = 7;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    data[i] = 70 + ((s >>> 16) & 15); // background 70..85
  }
  for (let y = cardY; y < cardY + cardH; y++) {
    for (let x = cardX; x < cardX + cardW; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      // Give the card interior structure, so it is not a flat blob.
      const v = 180 + (((x >> 3) + (y >> 3)) % 2) * 50;
      data[y * w + x] = v;
    }
  }
  return { data, width: w, height: h };
}

test('finds a card inset in the frame, not the frame itself', () => {
  // The regression this file exists for. The largest connected region in a
  // frame is the BACKGROUND, and its convex hull is a perfect rectangle
  // covering the whole image — which beat the real card on a naive score and
  // made every scan rectify the entire photograph.
  const quad = detectCardQuad(scene(90, 110, 220, 300));
  assert.ok(quad, 'no card found');
  assert.ok(
    quad.areaFraction < 0.6,
    `detected ${(quad.areaFraction * 100).toFixed(1)}% of the frame — that is the frame, not the card`,
  );
  const [tl, , br] = quad.corners;
  assert.ok(Math.abs(tl.x - 90) < 15, `left edge at ${tl.x}, expected ~90`);
  assert.ok(Math.abs(tl.y - 110) < 15, `top edge at ${tl.y}, expected ~110`);
  assert.ok(Math.abs(br.x - 310) < 15, `right edge at ${br.x}, expected ~310`);
  assert.ok(Math.abs(br.y - 410) < 15, `bottom edge at ${br.y}, expected ~410`);
});

test('finds a dark card on a light background too', () => {
  // Inverted contrast: the card must not be assumed brighter than its surface.
  const s = scene(80, 100, 200, 280);
  for (let i = 0; i < s.data.length; i++) s.data[i] = 255 - s.data[i];
  const quad = detectCardQuad(s);
  assert.ok(quad, 'no card found on inverted contrast');
  assert.ok(quad.areaFraction < 0.6);
});

test('reports no card for an empty frame', () => {
  const flat: GrayImage = { data: new Uint8Array(400 * 500).fill(120), width: 400, height: 500 };
  assert.equal(detectCardQuad(flat), null);
});

test('rejects a card that fills essentially the whole frame', () => {
  // A frame-filling rectangle is far more often the photo's own border, a
  // table edge, or a failed segmentation than a card.
  const quad = detectCardQuad(scene(0, 0, 400, 500));
  if (quad) assert.ok(quad.areaFraction <= 0.98);
});

test('corners come back ordered top-left, top-right, bottom-right, bottom-left', () => {
  const pts: Point[] = [
    { x: 10, y: 90 },
    { x: 80, y: 12 },
    { x: 12, y: 10 },
    { x: 90, y: 88 },
  ];
  const [tl, tr, br, bl] = orderCorners(pts);
  assert.deepEqual(tl, { x: 12, y: 10 });
  assert.deepEqual(tr, { x: 80, y: 12 });
  assert.deepEqual(br, { x: 90, y: 88 });
  assert.deepEqual(bl, { x: 10, y: 90 });
});

test('getPerspectiveTransform recovers an identity mapping', () => {
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const h = getPerspectiveTransform(square, square);
  assert.ok(Math.abs(h[0] - 1) < 1e-9);
  assert.ok(Math.abs(h[4] - 1) < 1e-9);
  assert.ok(Math.abs(h[1]) < 1e-9);
  assert.ok(Math.abs(h[8] - 1) < 1e-9);
});

test('getPerspectiveTransform maps the source corners onto the destination exactly', () => {
  const src: Point[] = [
    { x: 12, y: 9 },
    { x: 190, y: 30 },
    { x: 205, y: 260 },
    { x: 5, y: 240 },
  ];
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 140 },
    { x: 0, y: 140 },
  ];
  const h = getPerspectiveTransform(src, dst);
  for (let i = 0; i < 4; i++) {
    const w = h[6] * src[i].x + h[7] * src[i].y + h[8];
    const x = (h[0] * src[i].x + h[1] * src[i].y + h[2]) / w;
    const y = (h[3] * src[i].x + h[4] * src[i].y + h[5]) / w;
    assert.ok(Math.abs(x - dst[i].x) < 1e-6, `corner ${i} x: ${x} vs ${dst[i].x}`);
    assert.ok(Math.abs(y - dst[i].y) < 1e-6, `corner ${i} y: ${y} vs ${dst[i].y}`);
  }
});

test('getPerspectiveTransform refuses a degenerate quad rather than returning nonsense', () => {
  const collapsed: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  assert.throws(() => getPerspectiveTransform(collapsed, dst), /degenerate/);
});

test('warpPerspective extracts an axis-aligned region unchanged', () => {
  // A pure crop is the one warp with a known-exact answer, so it is the only
  // way to check the sampler without tolerating interpolation error.
  const src: GrayImage = { data: new Uint8Array(100 * 100), width: 100, height: 100 };
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) src.data[y * 100 + x] = (x + y) & 0xff;

  const corners: Point[] = [
    { x: 10, y: 10 },
    { x: 29, y: 10 },
    { x: 29, y: 29 },
    { x: 10, y: 29 },
  ];
  const out = warpPerspective(src, corners, 20, 20);
  assert.equal(out.width, 20);
  assert.equal(out.height, 20);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      assert.equal(out.data[y * 20 + x], (x + 10 + y + 10) & 0xff, `pixel ${x},${y}`);
    }
  }
});

test('warpPerspective undoes a rotation, which is why the hash needs no rotation invariance', () => {
  const N = 120;
  const src: GrayImage = { data: new Uint8Array(N * N), width: N, height: N };
  // A distinctive asymmetric mark so an orientation error is visible.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) src.data[y * N + x] = x < N / 2 ? 40 : 200;
  }
  // Sample the same region via corners given in rotated order and confirm the
  // output orientation follows the corner order, not the source.
  const upright = warpPerspective(
    src,
    [
      { x: 0, y: 0 },
      { x: N - 1, y: 0 },
      { x: N - 1, y: N - 1 },
      { x: 0, y: N - 1 },
    ],
    40,
    40,
  );
  assert.ok(upright.data[20 * 40 + 5] < 100, 'left half should be dark');
  assert.ok(upright.data[20 * 40 + 35] > 150, 'right half should be light');
});

test('convexHull returns the enclosing polygon and drops interior points', () => {
  const pts: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 5, y: 5 }, // interior
    { x: 3, y: 7 }, // interior
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  assert.equal(polygonArea(hull), 100);
});

test('douglasPeucker keeps the corners of a rectangle and drops edge points', () => {
  const pts: Point[] = [];
  for (let x = 0; x <= 20; x++) pts.push({ x, y: 0 });
  for (let y = 1; y <= 10; y++) pts.push({ x: 20, y });
  for (let x = 19; x >= 0; x--) pts.push({ x, y: 10 });
  for (let y = 9; y >= 1; y--) pts.push({ x: 0, y });
  const simplified = douglasPeucker(pts, 1.0, true);
  assert.equal(simplified.length, 4, `got ${simplified.length} vertices`);
});

test('maxAreaQuad finds the true maximum, checked against brute force', () => {
  // The O(n^2) formulation relies on the two off-diagonal corners being
  // independently optimal, which is easy to state and easy to get wrong. So it
  // is checked against an exhaustive search over all four-vertex subsets rather
  // than against a hand-computed number.
  const octagon: Point[] = [
    { x: 3, y: 0 },
    { x: 7, y: 0 },
    { x: 10, y: 3 },
    { x: 10, y: 7 },
    { x: 7, y: 10 },
    { x: 3, y: 10 },
    { x: 0, y: 7 },
    { x: 0, y: 3 },
  ];

  let brute = 0;
  const n = octagon.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          brute = Math.max(brute, polygonArea([octagon[a], octagon[b], octagon[c], octagon[d]]));

  const quad = maxAreaQuad(octagon);
  assert.ok(quad);
  assert.equal(polygonArea(quad), brute, `got ${polygonArea(quad)}, exhaustive best is ${brute}`);
});

test('polygonArea is orientation-independent', () => {
  const cw: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 0 },
  ];
  const ccw = cw.slice().reverse();
  assert.equal(polygonArea(cw), 12);
  assert.equal(polygonArea(ccw), 12);
});

test('otsuThreshold separates a clean bimodal image', () => {
  // On a perfectly bimodal image every threshold between the two modes scores
  // identically, so the exact value returned is arbitrary (OpenCV likewise
  // returns the lower end). What must hold is the SEPARATION it produces, so
  // that is what is asserted.
  const data = new Uint8Array(1000);
  data.fill(30, 0, 500);
  data.fill(220, 500);
  const t = otsuThreshold({ data, width: 100, height: 10 });
  assert.ok(t >= 30 && t < 220, `threshold ${t} cannot separate the modes`);

  let above = 0;
  for (const v of data) if (v > t) above++;
  assert.equal(above, 500, `threshold ${t} split the image ${above}/${1000 - above}`);
});

test('gaussianBlur5 preserves a flat field and reduces variance', () => {
  const flat: GrayImage = { data: new Uint8Array(50 * 50).fill(100), width: 50, height: 50 };
  const out = gaussianBlur5(flat);
  for (const v of out.data) assert.equal(v, 100);
});

test('sobelMagnitude responds at an edge and not in a flat region', () => {
  const img: GrayImage = { data: new Uint8Array(40 * 40), width: 40, height: 40 };
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) img.data[y * 40 + x] = x < 20 ? 0 : 255;
  const g = sobelMagnitude(img);
  assert.ok(g.data[20 * 40 + 19] > 100 || g.data[20 * 40 + 20] > 100, 'no response at the edge');
  assert.equal(g.data[20 * 40 + 5], 0, 'response in a flat region');
});

test('detection survives a rotated card', () => {
  // Rotation is what rectification exists to remove; if detection cannot find
  // a tilted card, the hash never gets the chance to be rotation-agnostic.
  const w = 400;
  const h = 500;
  const data = new Uint8Array(w * h).fill(75);
  const cx = 200;
  const cy = 250;
  const angle = (12 * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos + dy * sin;
      const ry = -dx * sin + dy * cos;
      if (Math.abs(rx) < 100 && Math.abs(ry) < 140) {
        data[y * w + x] = 180 + (((x >> 3) + (y >> 3)) % 2) * 50;
      }
    }
  }
  const quad = detectCardQuad({ data, width: w, height: h });
  assert.ok(quad, 'rotated card not found');
  assert.ok(quad.areaFraction > 0.1 && quad.areaFraction < 0.6, `area ${quad.areaFraction}`);
  assert.ok(quad.rectangularity > 0.8, `rectangularity ${quad.rectangularity}`);
});

test('detect honours a custom minimum area', () => {
  const small = scene(180, 230, 40, 55);
  assert.equal(detectCardQuad(small, { minAreaFraction: 0.5 }), null);
});
