/**
 * The upload guard, asserted rather than assumed.
 *
 * The reason this file exists: a mat is drawn behind everything else on the
 * board and downloaded by every player at the table, so "it seemed to work
 * with my photo" is not evidence that the cap holds. The two cases that would
 * really hurt are an upscale (a small picture blown up and stored soft and
 * large) and a panorama whose short edge rounds to zero, and neither shows up
 * in casual use.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAT_MAX_EDGE,
  MAT_MAX_SOURCE_BYTES,
  planMatSize,
  rejectSourceFile,
  rejectSourcePixels,
  formatBytes,
} from './matResize.ts';

test('a picture already within the cap is left exactly as it is', () => {
  assert.deepEqual(planMatSize(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(planMatSize(800, 600), { width: 800, height: 600 });
});

test('a small picture is never blown up', () => {
  // The old card-art mats were a 626px crop stretched across 1912px. Whatever
  // else changes, that must not happen again.
  assert.deepEqual(planMatSize(626, 457), { width: 626, height: 457 });
});

test('a big picture comes down to 1920 on its longest edge, keeping its shape', () => {
  const landscape = planMatSize(4032, 3024);
  assert.equal(landscape.width, MAT_MAX_EDGE);
  assert.equal(landscape.height, 1440);
  assert.ok(Math.abs(landscape.width / landscape.height - 4032 / 3024) < 0.001);

  const portrait = planMatSize(3024, 4032);
  assert.equal(portrait.height, MAT_MAX_EDGE);
  assert.equal(portrait.width, 1440);
});

test('a 12 megapixel photo lands at about 2 megapixels', () => {
  const out = planMatSize(4000, 3000);
  assert.equal(out.width * out.height, 1920 * 1440);
  assert.ok(out.width * out.height < 12_000_000 / 4);
});

test('an extreme panorama keeps at least one pixel of height', () => {
  const out = planMatSize(30000, 10);
  assert.equal(out.width, MAT_MAX_EDGE);
  assert.ok(out.height >= 1);
});

test('a sizeless image is refused rather than made into an empty canvas', () => {
  assert.throws(() => planMatSize(0, 500));
  assert.throws(() => planMatSize(500, Number.NaN));
});

test('only real image types get through, and the message says which', () => {
  assert.equal(rejectSourceFile({ type: 'image/png', size: 1000 }), null);
  assert.equal(rejectSourceFile({ type: 'image/jpeg', size: 1000 }), null);
  assert.equal(rejectSourceFile({ type: 'image/webp', size: 1000 }), null);
  assert.match(rejectSourceFile({ type: 'image/gif', size: 1000 }) ?? '', /PNG, JPG or WebP/);
  assert.match(rejectSourceFile({ type: 'application/pdf', size: 10 }) ?? '', /PNG, JPG or WebP/);
  // A renamed file arrives with an empty type, and an empty type is not an image.
  assert.match(rejectSourceFile({ type: '', size: 10 }) ?? '', /PNG, JPG or WebP/);
});

test('an oversized file is refused before it is opened, with both numbers in the message', () => {
  const message = rejectSourceFile({ type: 'image/jpeg', size: MAT_MAX_SOURCE_BYTES + 1 }) ?? '';
  assert.match(message, /12\.0 MB/);
  assert.equal(rejectSourceFile({ type: 'image/jpeg', size: MAT_MAX_SOURCE_BYTES }), null);
});

test('an empty file is refused', () => {
  assert.match(rejectSourceFile({ type: 'image/png', size: 0 }) ?? '', /empty/);
});

test('a small file holding a huge image is refused on pixels, not on bytes', () => {
  // The case bytes alone cannot catch: a 100 megapixel PNG of flat colour
  // compresses to almost nothing and still costs 400 MB to decode.
  assert.equal(rejectSourceFile({ type: 'image/png', size: 200_000 }), null);
  assert.match(rejectSourcePixels({ width: 12000, height: 9000 }) ?? '', /too many pixels/);
  assert.equal(rejectSourcePixels({ width: 4032, height: 3024 }), null);
});

test('sizes are printed the way a person reads them', () => {
  assert.equal(formatBytes(400), '400 bytes');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
