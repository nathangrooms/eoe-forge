/**
 * The nav array, held to the two things every reader of it assumes.
 *
 * `ALL_NAV_ITEMS` was `[NAV_HOME, ...NAV_ROOT_ITEMS, ...]` and `NAV_ROOT_ITEMS`
 * already begins with `NAV_HOME`, so Home was in it twice. It did no damage,
 * because every consumer at the time used `.some()` or `.find()`. That is
 * exactly the kind of latent fault that surfaces the day somebody maps the
 * array to draw a menu, which its name invites, and then Home is drawn twice
 * for a reason nobody can see from the rendering code.
 *
 * The second assertion is the one that actually matters at runtime:
 * `isNavItemActive` decides which entry lights up by comparing match depths
 * across the whole array, so a duplicate entry makes an item lose to a copy of
 * itself and nothing highlights at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_NAV_ITEMS,
  NAV_GROUPS,
  NAV_ROOT_ITEMS,
  findActiveNavItem,
  isNavItemActive,
} from './nav-items.ts';

test('no nav item appears twice', () => {
  const hrefs = ALL_NAV_ITEMS.map(item => item.href);
  assert.deepEqual(
    hrefs.filter((href, i) => hrefs.indexOf(href) !== i),
    [],
    'duplicate hrefs in ALL_NAV_ITEMS',
  );

  const objects = new Set(ALL_NAV_ITEMS);
  assert.equal(objects.size, ALL_NAV_ITEMS.length, 'the same item object listed twice');
});

test('it holds every root item and every group item, and nothing else', () => {
  const expected = [...NAV_ROOT_ITEMS, ...NAV_GROUPS.flatMap(g => g.items)];
  assert.equal(ALL_NAV_ITEMS.length, expected.length);
  for (const item of expected) assert.ok(ALL_NAV_ITEMS.includes(item), `missing ${item.title}`);
});

test('exactly one item owns a route', () => {
  for (const path of ['/', '/dashboard', '/cards', '/tutor', '/collection', '/decks', '/deck/abc', '/play', '/proxies']) {
    const lit = ALL_NAV_ITEMS.filter(item => isNavItemActive(path, item));
    assert.equal(lit.length, 1, `${path} lit ${lit.length} items: ${lit.map(i => i.title).join(', ')}`);
  }
});

test('Home owns the root and the dashboard, and does so once', () => {
  assert.equal(findActiveNavItem('/')?.title, 'Home');
  assert.equal(findActiveNavItem('/dashboard')?.title, 'Home');
  assert.equal(ALL_NAV_ITEMS.filter(i => i.title === 'Home').length, 1);
});
