import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MOTION_DURATION, MOTION_EASE_CSS, MOTION_PRESS_SCALE, MOTION_RISE_PX } from './tokens.ts';

/**
 * The motion vocabulary is written twice — as `--motion-*` custom properties in
 * `src/index.css` for everything a stylesheet does, and as numbers here for
 * everything `element.animate()` does. Two copies of a value is how a
 * vocabulary quietly stops being one, so these tests are the thing that keeps
 * them honest.
 *
 * The last test is the important one: it is the project's "transform and
 * opacity only" rule, enforced rather than remembered.
 */

// Newlines normalised: the repo is edited on Windows and git may hand this file
// back with CRLF, which would quietly break every anchored pattern below.
const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** The MOTION section only. Everything before it predates the vocabulary. */
const motionSection = css.slice(css.indexOf('   MOTION\n'));

function declaredOnRoot(name: string): string {
  // The first declaration is the light/default one; the reduced-motion block
  // below it deliberately declares the same names again.
  const match = motionSection.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  assert.ok(match, `${name} is not declared in the MOTION section of index.css`);
  return match![1].trim();
}

test('every duration token has the same value in CSS and in TypeScript', () => {
  const pairs: Array<[string, number]> = [
    ['--motion-press', MOTION_DURATION.press],
    ['--motion-enter', MOTION_DURATION.enter],
    ['--motion-exit', MOTION_DURATION.exit],
    ['--motion-panel', MOTION_DURATION.panel],
    ['--motion-emphasis', MOTION_DURATION.emphasis],
  ];

  for (const [name, expected] of pairs) {
    assert.equal(declaredOnRoot(name), `${expected}ms`, `${name} has drifted from tokens.ts`);
  }
});

test('every easing token has the same curve in CSS and in TypeScript', () => {
  const pairs: Array<[string, string]> = [
    ['--motion-ease-out', MOTION_EASE_CSS.out],
    ['--motion-ease-in', MOTION_EASE_CSS.in],
    ['--motion-ease-standard', MOTION_EASE_CSS.standard],
  ];

  for (const [name, expected] of pairs) {
    assert.equal(declaredOnRoot(name), expected, `${name} has drifted from tokens.ts`);
  }
});

test('the travel and press-scale tokens agree', () => {
  assert.equal(declaredOnRoot('--motion-rise'), `${MOTION_RISE_PX}px`);
  assert.equal(declaredOnRoot('--motion-press-scale'), String(MOTION_PRESS_SCALE));
});

test('reduced motion flattens every duration, so no caller has to remember to', () => {
  const start = motionSection.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(start > -1, 'the MOTION section declares no reduced-motion block');
  const block = motionSection.slice(start, motionSection.indexOf('}\n  }', start));

  for (const name of [
    '--motion-press',
    '--motion-enter',
    '--motion-exit',
    '--motion-panel',
    '--motion-emphasis',
  ]) {
    assert.match(
      block,
      new RegExp(`${name}:\\s*1ms;`),
      `${name} is not flattened under prefers-reduced-motion`
    );
  }
  assert.match(block, /--motion-rise:\s*0px;/);
  assert.match(block, /--motion-press-scale:\s*1;/);
});

test('every motion keyframe animates transform and opacity and nothing else', () => {
  /*
   * The one rule the owner's two complaints — "better animations" and "weird
   * layout shifting" — collapse into. Anything animating width, height, top,
   * left, margin or padding is layout shift with a duration attached, so it is
   * a test failure rather than a code-review note.
   */
  const allowed = new Set(['transform', 'opacity', 'offset']);

  let checked = 0;
  for (const block of motionSection.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n {2}\}/g)) {
    const [, name, body] = block;
    checked += 1;
    // Keyframe bodies sit inside `@layer components`, so a declaration is six
    // spaces in; four is the `from`/`to`/percentage selector itself.
    for (const declaration of body.matchAll(/\n {6}([a-z-]+)\s*:/g)) {
      assert.ok(
        allowed.has(declaration[1]),
        `@keyframes ${name} animates "${declaration[1]}" — only transform and opacity are allowed`
      );
    }
  }

  assert.ok(checked >= 8, `expected the MOTION section to define keyframes, found ${checked}`);
});
