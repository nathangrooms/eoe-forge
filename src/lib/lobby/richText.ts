/**
 * Turning what a stranger typed into something safe to draw.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * The discussion is the one place in this app where text one person wrote
 * arrives in another person's browser. Everywhere else the words on screen came
 * from Scryfall, from the database, or from the person reading them. Here they
 * came from somebody who has never met you.
 *
 * So the rule is absolute, and it is kept by shape rather than by care:
 * NOTHING IN THIS FILE PRODUCES HTML. It returns an array of small objects, and
 * `PostBody` renders them as React children, which React escapes. There is no
 * string of markup anywhere in the path, so there is nothing for
 * `dangerouslySetInnerHTML` to be tempted by and nothing to get wrong later.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS STRIPPED BEFORE ANYTHING ELSE HAPPENS
 * ---------------------------------------------------------------------------
 * Control characters, because a NUL in a name has no business reaching a DOM
 * node. And the bidirectional overrides, which are invisible and reorder the
 * text that follows them: they are how a line reading "look at deckmatrix.com"
 * is made to say something else on screen while the stored string stays
 * innocent. Tab and newline survive, because a person pressing Enter meant it.
 *
 * ---------------------------------------------------------------------------
 * LINKS, AND THE SCHEME ALLOWLIST
 * ---------------------------------------------------------------------------
 * Only http and https become links, and the check is made by parsing the
 * address rather than by matching the string, because `javascript:`, `data:`
 * and `vbscript:` all have ways of looking like something else to a regular
 * expression, and none of them have a way of looking like an http origin to
 * `new URL()`.
 *
 * A bare `moxfield.com/x` stays as plain text on purpose. Guessing that a word
 * with a dot in it is a website is how a scheme sneaks back in.
 *
 * A link to this site comes back as a PATH, so the page routes to it instead of
 * reloading the whole app, and so a link somebody pastes to a table behaves the
 * same as the button beside it.
 */

/** One piece of a post, ready to be drawn as a React child. */
export type PostToken =
  | { kind: 'text'; text: string }
  /** An outside link. `href` is always http or https. */
  | { kind: 'link'; href: string; label: string }
  /** A link back into this app. `path` always starts with a single slash. */
  | { kind: 'route'; path: string; label: string }
  /** A table, written as #ABC234 or pasted as a link to one. */
  | { kind: 'table'; code: string };

/** How much of a long link is shown before it is cut. */
const LINK_LABEL_MAX = 48;

/** The longest run of blank lines a post is allowed to draw. */
const MAX_BLANK_LINES = 2;

/*
 * The characters that never reach the page, written as escapes so that none of
 * them appear in this file either.
 *
 * u0000 to u0008, u000b, u000c, u000e to u001f and u007f to u009f are every
 * control character except tab and newline.
 *
 * u200b to u200f, u202a to u202e and u2066 to u2069 are the invisible marks and
 * the bidirectional overrides.
 *
 * ufeff is a byte order mark, which turns up whenever text is copied out of a
 * file rather than typed.
 */
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Everything a piece of somebody else's text goes through before it is looked
 * at.
 *
 * Used on names as well as bodies. `safe_display_name` in the database already
 * strips control characters from a name, but a name that arrived before that
 * function existed, or through some path that forgets, must not be the reason a
 * page misbehaves.
 */
export function stripInvisible(input: string): string {
  return (input ?? '').replace(INVISIBLE, '');
}

/** A name, made safe and made short. */
export function safeName(input: string | null | undefined): string {
  const clean = stripInvisible(input ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Player';
  return clean.length > 32 ? `${clean.slice(0, 32)}...` : clean;
}

/**
 * A title, made safe.
 *
 * NOT `safeName`, which cuts at 32 characters because a name sits inline beside
 * a timestamp. A title is allowed 120 by the database and gets a line of its
 * own, so cutting it here would hide words somebody deliberately wrote. The
 * list truncates with CSS instead, which is reversible and which the browser
 * does at the width actually available.
 */
export function safeTitle(input: string | null | undefined): string {
  const clean = stripInvisible(input ?? '').replace(/\s+/g, ' ').trim();
  return clean || 'Untitled';
}

/** Collapse a wall of empty lines without touching deliberate spacing. */
function tidyBlankLines(input: string): string {
  return input.replace(/\n{3,}/g, '\n'.repeat(MAX_BLANK_LINES + 1));
}

/** The origin, if it is one, so a bad value cannot make everything internal. */
function safeOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** What a link reads as. The scheme is noise once it has been checked. */
function labelFor(url: URL): string {
  const tail = `${url.pathname}${url.search}`.replace(/\/$/, '');
  return `${url.host}${tail}`;
}

function shorten(text: string): string {
  return text.length > LINK_LABEL_MAX ? `${text.slice(0, LINK_LABEL_MAX)}...` : text;
}

/**
 * Is this a link worth drawing, and if so what does it point at?
 *
 * Returns null for everything that is not http or https, which is the whole
 * point: the answer comes from the parser, not from the shape of the string.
 */
function classify(raw: string, origin: string): PostToken | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const here = safeOrigin(origin);
  if (here && url.origin === here) {
    const table = url.pathname.match(/^\/play\/t\/([A-Za-z0-9]{4,12})\/?$/);
    if (table) return { kind: 'table', code: table[1].toUpperCase() };

    const path = `${url.pathname}${url.search}${url.hash}`;
    /* One leading slash and no more. `//evil.example` is a protocol relative
       address and the browser treats it as another site entirely. */
    if (path.startsWith('/') && !path.startsWith('//')) {
      return { kind: 'route', path, label: shorten(path) };
    }
  }

  return { kind: 'link', href: url.toString(), label: shorten(labelFor(url)) };
}

/** Trailing punctuation belongs to the sentence, not to the address. */
function trimTail(raw: string): { url: string; tail: string } {
  let url = raw;
  let tail = '';

  for (;;) {
    const last = url.at(-1);
    if (!last) break;

    if ('.,;:!?"\''.includes(last)) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    /* A closing bracket is part of the address only if it opened inside it. */
    if (last === ')' && !url.includes('(')) {
      tail = last + tail;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return { url, tail };
}

/* A run that could be an address, and a table written as #ABC234. */
const CANDIDATE = /(https?:\/\/[^\s<>]+)|(#[A-Za-z0-9]{4,12}\b)/g;

/**
 * Break a post into pieces.
 *
 * Pure, and takes the origin rather than reading `window`, so a test can reach
 * it and so a preview build cannot decide that production links are internal.
 */
export function tokenisePost(body: string, origin = ''): PostToken[] {
  const clean = tidyBlankLines(stripInvisible(body ?? ''));
  if (!clean) return [];

  const tokens: PostToken[] = [];
  let at = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const previous = tokens.at(-1);
    if (previous?.kind === 'text') previous.text += text;
    else tokens.push({ kind: 'text', text });
  };

  CANDIDATE.lastIndex = 0;
  for (;;) {
    const found = CANDIDATE.exec(clean);
    if (!found) break;

    pushText(clean.slice(at, found.index));
    at = found.index + found[0].length;

    if (found[2]) {
      tokens.push({ kind: 'table', code: found[2].slice(1).toUpperCase() });
      continue;
    }

    const { url, tail } = trimTail(found[1]);
    const token = classify(url, origin);
    /* Not a scheme we draw, so the words stay words. */
    if (token) tokens.push(token);
    else pushText(url);
    pushText(tail);
  }

  pushText(clean.slice(at));
  return tokens;
}
