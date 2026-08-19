/**
 * The app shell's main column must reserve room for the nav rail.
 *
 *   node --test --experimental-strip-types src/appShell.test.ts
 *
 * This guards one specific regression that has now happened three times, and it
 * is a class-string assertion rather than a real layout test for a reason worth
 * knowing.
 *
 * The nav rail is `position: fixed`, so `<main>` is the only in-flow item in its
 * flex row. It carries `md:ml-[var(--nav-rail-w)]` to clear the rail. If it also
 * gets a full-width class, that width resolves to 100% of the container and the
 * 16rem margin is then added OUTSIDE it, so main runs from 256px to 1524px in a
 * 1268px viewport and the rightmost 256px of every page is cut off.
 *
 * Two things conspired to keep that invisible. The wrapper carries
 * `overflow-x-hidden`, so the browser clipped the excess and
 * `document.scrollWidth` kept reporting a clean 1268: any check written against
 * the document passed, including one that was used to tell the owner the page
 * was fine. And `flex: 1 1 0%` looks like it should handle this on its own,
 * which was tested directly: with the width class removed entirely, main still
 * computed to the full 1268px, because the grow step did not discount the
 * margin. Only an explicit width fixes it.
 *
 * scripts/measure-overflow.mjs cannot cover this, because headless Chrome has no
 * session and never renders the rail at all. Hence a string assertion, which is
 * blunt but actually runs on every commit.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync('src/App.tsx', 'utf8');

/** The shell's main column: the one that clears the fixed rail. */
function shellMainClasses(): string {
  const match = APP.match(/<main[^>]*id="main-content"[^>]*className="([^"]+)"/);
  assert.ok(match, 'could not find the shell <main id="main-content"> with a className in src/App.tsx');
  return match[1];
}

test('the main column subtracts the rail from its width, not just its margin', () => {
  const cls = shellMainClasses();

  assert.match(
    cls,
    /md:ml-\[var\(--nav-rail-w\)\]/,
    'the main column no longer clears the fixed nav rail',
  );

  assert.match(
    cls,
    /md:w-\[calc\(100%-var\(--nav-rail-w\)\)\]/,
    'The main column clears the rail with a margin but does not subtract the rail ' +
      'from its width, so every page runs past the right edge on desktop and the ' +
      "wrapper's overflow-x-hidden silently clips it. Add " +
      'md:w-[calc(100%-var(--nav-rail-w))].',
  );
});

test('no full-width class fights the calculated width', () => {
  const cls = shellMainClasses();
  const offenders = cls.split(/\s+/).filter(c => c === 'w-full' || c === 'md:w-full' || c === 'md:w-auto');

  assert.deepEqual(
    offenders,
    [],
    `${offenders.join(', ')} on the shell main column overrides the calculated ` +
      `width and reintroduces the 256px clip on desktop. Mobile does not need it: ` +
      `a block-level main already fills its container when the md: margin is absent.`,
  );
});
