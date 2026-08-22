/**
 * The sign-in return path, tested against real open-redirect payloads.
 *
 * ## Why the payloads are built by concatenation instead of written out
 *
 * Because writing them out is how you test the wrong thing. In a JavaScript
 * string an unrecognised escape simply drops its backslash, so `'/\evil.com'`
 * is not "slash backslash" at all, it is the perfectly ordinary path
 * `/evil.com`. A first draft of this file did exactly that and passed a row it
 * was not testing. `BS` and `TAB` below are unambiguous.
 *
 * ## Which of these actually reach another origin
 *
 * Established by resolving each one with the real URL parser rather than by
 * reasoning about it. The URL standard treats a backslash as a forward slash
 * for http and https, so `/` followed by ONE backslash resolves to
 * `https://evil.com/`, and a guard reading raw characters sees a single leading
 * slash and allows it. Tabs and newlines are stripped before parsing, so they
 * hide inside a `//` just as well.
 *
 * A LONE leading backslash is the interesting non-attack: it resolves to
 * `https://<our origin>/evil.com`, an ordinary same-origin path, so it is
 * correct to keep it. It is asserted below so nobody later "fixes" it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { returnPathFrom } from './returnPath.ts';

const DASH = '/dashboard';
const BS = String.fromCharCode(92); // a real backslash
const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);

test('an invite path survives, which is the reason this exists', () => {
  assert.equal(returnPathFrom('/play/t/ABC123'), '/play/t/ABC123');
  assert.equal(returnPathFrom('/decks?sort=name'), '/decks?sort=name');
  assert.equal(returnPathFrom('/cards#top'), '/cards#top');
});

test('nothing sends you to another origin', () => {
  const attacks: Array<[string, string]> = [
    ['//evil.com', 'protocol relative'],
    [`/${BS}evil.com`, 'slash then one backslash, resolves to evil.com'],
    [`${BS}${BS}evil.com`, 'two backslashes'],
    [`/${TAB}/evil.com`, 'tab hiding inside a double slash'],
    [`/${NL}/evil.com`, 'newline hiding inside a double slash'],
    ['//evil.com/play/t/ABC', 'a plausible looking invite on another origin'],
    ['https://evil.com', 'absolute'],
    ['http://evil.com', 'absolute, insecure'],
    ['HTTPS://EVIL.COM', 'absolute, shouting'],
    ['javascript:alert(1)', 'script url'],
    ['data:text/html,<script>alert(1)</script>', 'data url'],
  ];

  for (const [payload, why] of attacks) {
    assert.equal(returnPathFrom(payload), DASH, `${why}: ${JSON.stringify(payload)}`);
  }
});

test('a lone leading backslash is a same-site path, not an attack', () => {
  // Resolves to https://<our origin>/evil.com. Odd, harmless, and deliberately
  // not blocked, because blocking it would mean guessing at strings again
  // rather than asking the parser where they point.
  assert.equal(returnPathFrom(`${BS}evil.com`), '/evil.com');
});

test('an absolute url on our OWN origin is kept, as a path', () => {
  assert.equal(returnPathFrom('https://deckmatrix.com/play/t/ABC'), '/play/t/ABC');
});

test('nothing, empty and rubbish all fall back', () => {
  assert.equal(returnPathFrom(null), DASH);
  assert.equal(returnPathFrom(undefined), DASH);
  assert.equal(returnPathFrom(''), DASH);
});
