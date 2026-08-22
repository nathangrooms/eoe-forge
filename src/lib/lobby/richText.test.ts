/**
 * The sanitiser is the one part of the discussion that is hostile-input facing,
 * so it is the one part with tests that read like an attack list.
 *
 * The assertions are deliberately about the OUTPUT SHAPE and not about a
 * rendered string, because the guarantee being kept is that no string of markup
 * is ever produced. A test that compared HTML would be testing the wrong thing
 * and would quietly bless the day somebody introduced some.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { safeName, safeTitle, stripInvisible, tokenisePost, type PostToken } from './richText.ts';

const HERE = 'https://deckmatrix.com';

/** Everything a post renders as, joined, for the "did anything survive" checks. */
function words(tokens: PostToken[]): string {
  return tokens
    .map(token => {
      switch (token.kind) {
        case 'text':
          return token.text;
        case 'link':
        case 'route':
          return token.label;
        case 'table':
          return token.code;
      }
    })
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Schemes                                                                    */
/* -------------------------------------------------------------------------- */

test('a javascript: address never becomes a link', () => {
  const tokens = tokenisePost('click here javascript:alert(document.cookie)', HERE);
  assert.deepEqual(
    tokens.map(t => t.kind),
    ['text']
  );
});

test('a data: address never becomes a link', () => {
  const tokens = tokenisePost('data:text/html;base64,PHNjcmlwdD4=', HERE);
  assert.deepEqual(
    tokens.map(t => t.kind),
    ['text']
  );
});

test('a scheme hidden behind whitespace and case is still not a link', () => {
  for (const attempt of ['JaVaScRiPt:alert(1)', 'vbscript:msgbox(1)', 'file:///etc/passwd']) {
    const tokens = tokenisePost(attempt, HERE);
    assert.deepEqual(
      tokens.map(t => t.kind),
      ['text'],
      attempt
    );
  }
});

test('https is a link and keeps its address', () => {
  const tokens = tokenisePost('have a look at https://scryfall.com/card/xyz please', HERE);
  assert.deepEqual(tokens.map(t => t.kind), ['text', 'link', 'text']);
  const link = tokens[1];
  assert.equal(link.kind, 'link');
  if (link.kind !== 'link') return;
  assert.equal(link.href, 'https://scryfall.com/card/xyz');
  assert.equal(link.label, 'scryfall.com/card/xyz');
});

/* -------------------------------------------------------------------------- */
/* Markup                                                                     */
/* -------------------------------------------------------------------------- */

test('markup in a post stays words and never becomes a tag', () => {
  const body = '<script>alert(1)</script> <img src=x onerror=alert(1)>';
  const tokens = tokenisePost(body, HERE);
  assert.deepEqual(tokens.map(t => t.kind), ['text']);
  assert.equal(words(tokens), body);
});

test('every token is one of the four kinds, so nothing can carry markup', () => {
  const tokens = tokenisePost(
    'https://x.example <b>bold</b> #ABC234 https://deckmatrix.com/decks javascript:no',
    HERE
  );
  for (const token of tokens) {
    assert.ok(['text', 'link', 'route', 'table'].includes(token.kind), token.kind);
    assert.equal('html' in token, false);
  }
});

/* -------------------------------------------------------------------------- */
/* Invisible characters                                                       */
/* -------------------------------------------------------------------------- */

test('a bidirectional override is removed rather than rendered', () => {
  const trick = `look at deckmatrix.com\u202Emoc.live`;
  assert.equal(stripInvisible(trick).includes('\u202E'), false);
  assert.equal(stripInvisible(trick), 'look at deckmatrix.commoc.live');
});

test('zero width characters and control characters are removed', () => {
  const noisy = 'he\u200Bllo\u0000 the\uFEFFre';
  assert.equal(stripInvisible(noisy), 'hello there');
});

test('tab and newline survive, because a person pressing Enter meant it', () => {
  assert.equal(stripInvisible('one\ntwo\tthree'), 'one\ntwo\tthree');
});

test('a wall of blank lines is collapsed to three at most', () => {
  const tokens = tokenisePost('top\n\n\n\n\n\n\nbottom', HERE);
  assert.equal(words(tokens), 'top\n\n\nbottom');
});

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

test('a name with hidden characters in it comes back readable', () => {
  assert.equal(safeName('gr\u202Eumbo'), 'grumbo');
  assert.equal(safeName('  spaced   out  '), 'spaced out');
});

test('an empty or missing name is Player and never blank', () => {
  assert.equal(safeName(''), 'Player');
  assert.equal(safeName(null), 'Player');
  assert.equal(safeName('\u200B\u200B'), 'Player');
});

test('a very long name is cut rather than allowed to push the layout', () => {
  assert.equal(safeName('x'.repeat(80)).length, 35);
});

/* -------------------------------------------------------------------------- */
/* This site                                                                  */
/* -------------------------------------------------------------------------- */

test('a link to a table becomes a table, not an address', () => {
  const tokens = tokenisePost('come and sit down https://deckmatrix.com/play/t/abc234', HERE);
  assert.deepEqual(tokens.map(t => t.kind), ['text', 'table']);
  const table = tokens[1];
  if (table.kind !== 'table') return assert.fail('expected a table');
  assert.equal(table.code, 'ABC234');
});

test('a table written the short way is the same token', () => {
  const tokens = tokenisePost('room for one more at #abc234', HERE);
  assert.deepEqual(tokens.map(t => t.kind), ['text', 'table']);
  const table = tokens[1];
  if (table.kind !== 'table') return assert.fail('expected a table');
  assert.equal(table.code, 'ABC234');
});

test('a link to somewhere else on this site is a path, so the app routes to it', () => {
  const tokens = tokenisePost('https://deckmatrix.com/decks?sort=power', HERE);
  const route = tokens[0];
  if (route.kind !== 'route') return assert.fail('expected a route');
  assert.equal(route.path, '/decks?sort=power');
});

test('another site is never mistaken for this one', () => {
  const tokens = tokenisePost('https://deckmatrix.com.evil.example/play/t/abc234', HERE);
  const link = tokens[0];
  if (link.kind !== 'link') return assert.fail('expected an outside link');
  assert.equal(link.href.startsWith('https://deckmatrix.com.evil.example/'), true);
});

test('a nonsense origin makes everything external rather than everything internal', () => {
  const tokens = tokenisePost('https://deckmatrix.com/decks', 'javascript:void 0');
  assert.equal(tokens[0].kind, 'link');
});

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

test('a full stop after a link belongs to the sentence', () => {
  const tokens = tokenisePost('see https://scryfall.com/x.', HERE);
  assert.deepEqual(tokens.map(t => t.kind), ['text', 'link', 'text']);
  const link = tokens[1];
  if (link.kind !== 'link') return assert.fail('expected a link');
  assert.equal(link.href, 'https://scryfall.com/x');
  assert.equal(words(tokens).endsWith('.'), true);
});

test('a very long address is shortened for reading but not for following', () => {
  const long = `https://scryfall.com/${'a'.repeat(120)}`;
  const tokens = tokenisePost(long, HERE);
  const link = tokens[0];
  if (link.kind !== 'link') return assert.fail('expected a link');
  assert.equal(link.href, long);
  assert.ok(link.label.length <= 51, link.label);
});

test('an empty post produces nothing to draw', () => {
  assert.deepEqual(tokenisePost('', HERE), []);
  assert.deepEqual(tokenisePost('\u200B', HERE), []);
});

test('the words of an ordinary post survive untouched', () => {
  const body = 'anyone up for a four player game after 8? I have a Kess deck and a Sisay deck.';
  assert.equal(words(tokenisePost(body, HERE)), body);
});

/* -------------------------------------------------------------------------- */
/* Titles                                                                     */
/* -------------------------------------------------------------------------- */

test('a title is not cut the way a name is', () => {
  // `safeName` caps at 32 because a name sits inline. A title has its own line
  // and the database allows 120, so cutting it here would hide real words.
  const title = 'What is everyone building at the moment, and why is it always Kess';
  assert.equal(safeTitle(title), title);
  assert.equal(safeName(title).endsWith('...'), true);
});

test('a title with hidden characters in it comes back readable', () => {
  assert.equal(safeTitle('a\u202Etitle   with   gaps'), 'atitle with gaps');
});

test('a missing title reads as Untitled rather than as nothing', () => {
  assert.equal(safeTitle(null), 'Untitled');
  assert.equal(safeTitle('   '), 'Untitled');
});
