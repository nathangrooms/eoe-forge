/**
 * `GATED_ROUTES` is a second copy of the signed-in route table, and a second
 * copy rots. This reads `App.tsx` and fails when the two disagree, so a route
 * added to the app without being added here is a red test rather than a page
 * that tells a signed-out visitor it does not exist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GATED_ROUTES, PUBLIC_ROUTES, matchesPattern, pageNameFor, titleFor } from './routeMeta.ts';

const APP = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');

/** Every `path="…"` inside the signed-in `<Routes>` block. */
function signedInPaths(): string[] {
  const start = APP.indexOf('<ScrollToTop />');
  assert.ok(start > 0, 'could not find the signed-in route block in App.tsx');
  const block = APP.slice(start);
  const found = [...block.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
  assert.ok(found.length > 40, `expected the signed-in table to be large, saw ${found.length}`);
  return found.filter(p => p !== '*');
}

test('every signed-in route is either public or listed as gated', () => {
  const known = new Set<string>([...PUBLIC_ROUTES, ...GATED_ROUTES]);
  const missing = signedInPaths().filter(p => !known.has(p));
  assert.deepEqual(
    missing,
    [],
    `these routes exist in App.tsx but are in neither PUBLIC_ROUTES nor GATED_ROUTES, so a ` +
      `signed-out visitor following one would be told it does not exist: ${missing.join(', ')}`
  );
});

test('nothing is both public and gated', () => {
  const pub = new Set<string>(PUBLIC_ROUTES);
  const both = GATED_ROUTES.filter(p => pub.has(p));
  assert.deepEqual(both, [], `duplicate <Route path> would be ambiguous: ${both.join(', ')}`);
});

test('no gated route was invented — each one exists in App.tsx', () => {
  const real = new Set(signedInPaths());
  const ghosts = GATED_ROUTES.filter(p => !real.has(p));
  assert.deepEqual(ghosts, [], `listed as gated but no such route: ${ghosts.join(', ')}`);
});

test('patterns match on segment count and honour :params', () => {
  assert.equal(matchesPattern('/deck/abc', '/deck/:id'), true);
  assert.equal(matchesPattern('/deck/abc/export', '/deck/:id'), false);
  assert.equal(matchesPattern('/deck', '/deck/:id'), false);
  assert.equal(matchesPattern('/collection/import', '/collection/:x'), true);
});

test('the more specific pattern wins', () => {
  assert.equal(pageNameFor('/deck/abc/export'), 'Export this deck');
  assert.equal(pageNameFor('/deck/abc'), 'Deck');
  assert.equal(pageNameFor('/collection/import'), 'Import cards');
  assert.equal(pageNameFor('/collection'), 'Your collection');
});

test('an unknown path has no name and titles itself not found', () => {
  assert.equal(pageNameFor('/nope'), null);
  assert.equal(titleFor('/nope'), 'Page not found · DeckMatrix');
});

test('the homepage keeps the long title and every other page is suffixed', () => {
  assert.equal(titleFor('/'), 'DeckMatrix - MTG Deck Builder & Collection Manager');
  assert.equal(titleFor('/login'), 'Sign in · DeckMatrix');
});

test('titles are distinct enough to tell two pages apart when announced', () => {
  const seen = new Map<string, string>();
  for (const p of ['/', '/login', '/register', '/terms', '/privacy', '/decks', '/collection']) {
    const t = titleFor(p);
    assert.equal(seen.has(t), false, `${p} and ${seen.get(t)} announce the same title: ${t}`);
    seen.set(t, p);
  }
});
