/**
 * Em-dashes in text a player reads.
 *
 * Copy rule, project-wide: "No em-dashes in user-facing copy. Rewrite the
 * sentence rather than swapping the dash for a semicolon or brackets. A
 * sentence that needed an em-dash usually wanted to be two sentences." Code
 * comments are exempt, so they are stripped before looking, or the real hits
 * drown in this repo's very long explanatory comments.
 *
 * This cannot be a grep. `grep` does not read \u escapes, and a naive sweep of
 * whole files reports about 1,700 hits of which roughly ten are real.
 *
 * FIVE THINGS ARE NOT VIOLATIONS AND ARE SKIPPED:
 *
 *   A MAGIC TYPE LINE. "Creature — Bear" is how Wizards prints it and how
 *   Scryfall stores it. It is card data, not our copy, and flagging it would
 *   mean rewriting the game's own notation. Template holes are blanked before
 *   the check, so a type line built at runtime is recognised too, which is
 *   what this comment always claimed and did not do.
 *
 *   A RANGE OR A SCORE. "2–5 lands", "$2 – $10", "wins 2–0", "W–L–D". That is
 *   an EN dash doing the job en dashes exist for, between numbers.
 *
 *   A BARE DASH. A literal that is nothing but a dash is the standard
 *   placeholder for a cell with no value, which is what a table should show
 *   instead of a zero.
 *
 *   A REGEX CHARACTER CLASS WRITTEN AS A STRING. `new RegExp` takes a string,
 *   so '[—–−-]' is regex syntax and not a sentence. Narrow on purpose: the
 *   whole literal must be one bracketed set with no letters, digits or spaces
 *   in it.
 *
 *   TEST SUPPORT. Alongside `*.test.ts` and a `fixtures/` directory, a file
 *   named `*.fixtures.*` or `*.testlib.*`. Both of the two that exist hold
 *   real card records: `port.fixtures.generated.ts` is Scryfall oracle text
 *   with ability words in it ("Threshold — ..."), which is Wizards' wording
 *   and must never be rewritten, and `harness.testlib.ts` says in its own
 *   header that it is test fixtures kept out of a `.test.ts` name so
 *   `node --test` will not run it.
 *
 * WHY THIS READS THE SOURCE THE WAY IT DOES. Finding string literals with one
 * regex, `/(['"`])(...)\1/`, is wrong in a way that hides real violations. A
 * quote inside a REGEX literal, and this repo has plenty of `/[’'`]/g`, opens
 * a string that never existed and swallows source until the next quote. One
 * such phantom ran 2,745 characters, ate a trailing `//` comment and a table
 * of Magic type lines, and reported them as copy; another hid a genuine
 * violation inside itself. So `readLiterals` walks the file and steps over
 * regex literals, which are never copy. A `/` starts one only where a value
 * cannot: after `( , = : [` and friends, or after `return` and its kin. Get
 * that wrong and the worst case is today's behaviour, a mis-paired quote.
 *
 * A NOTE ON EDITING THIS FILE. It was first written through a shell heredoc and
 * then patched through two more, and a pass ate a backslash: `\b` in the
 * type-line pattern became U+0008 BACKSPACE, so the exemption asked for a
 * backspace character, matched nothing, and cheerfully reported "skipped 0
 * Magic type lines" while printing forty of them. That is the fifth time in one
 * session a backslash escape has been destroyed by passing code through a
 * string transformation. Edit this file DIRECTLY. Nothing below uses `\b`, so
 * there is one fewer escape to lose.
 *
 *   node scripts/probe/em-dash-sweep.mjs
 *   node scripts/probe/em-dash-sweep.mjs src/components/play
 *
 * Exits non-zero when anything is found, so it can gate a commit.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? 'src';

const EM = '—';
const EN = '–';
const DASH = new RegExp('[' + EM + EN + ']');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

/* Block comments out first, blanked rather than deleted so line numbers and
   the shape of a JSX block survive. `//` comments are left to the walk below,
   which knows whether it is inside a string and so cannot mistake the slashes
   in an "https://" for one. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/* A `/` here opens a regex rather than dividing. Everything listed is a place
   where a VALUE has to come next, so a division sign would be a syntax error. */
const REGEX_MAY_FOLLOW = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', '',
]);
const REGEX_KEYWORDS = /(?:^|[^A-Za-z0-9_$])(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/;

/**
 * Walk a file once and report what every stretch of it is.
 *
 * Returns the string literals, and the character ranges taken up by literals,
 * regexes and `//` comments. What is left over is code and JSX TEXT, and JSX
 * text is copy: `<p>Could not load rulings — {err}</p>` is a sentence a player
 * reads and no string literal contains it.
 *
 * Deliberately not a full tokeniser. A quote inside a `${...}` hole of a
 * template literal still closes it early, which costs a slightly odd excerpt
 * and never a missed dash, because the dash is then reported by the leftover
 * pass instead.
 */
const readSource = (src) => {
  const out = [];
  const covered = [];
  const n = src.length;
  let i = 0;
  let prev = '';
  while (i < n) {
    const c = src[i];

    // Checked before the regex branch, or `//` reads as an empty regex and the
    // rest of the comment is scanned as if it were code.
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      covered.push([i, j]);
      i = j;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let text = '';
      let closed = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') { text += d + (src[j + 1] ?? ''); j += 2; continue; }
        if (d === c) { closed = true; break; }
        // A quoted string cannot hold a raw newline. Running past one means
        // this quote was punctuation inside something else.
        if (c !== '`' && d === '\n') break;
        text += d;
        j += 1;
      }
      if (closed) {
        out.push({ text, index: i });
        covered.push([i, j]);
        i = j + 1;
        prev = c;
        continue;
      }
      prev = c;
      i += 1;
      continue;
    }

    if (c === '/') {
      const lead = src.slice(0, i).replace(/\s+$/, '');
      if (REGEX_MAY_FOLLOW.has(prev) || REGEX_KEYWORDS.test(lead)) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break;
          if (inClass) { if (d === ']') inClass = false; }
          else if (d === '[') inClass = true;
          else if (d === '/') { closed = true; break; }
          j += 1;
        }
        if (closed) { covered.push([i, j]); i = j + 1; prev = '/'; continue; }
      }
    }

    if (!/\s/.test(c)) prev = c;
    i += 1;
  }
  return { literals: out, covered };
};

/**
 * The JSX text node a loose dash sits in.
 *
 * From the `>` that closed the last tag to the `<` that opens the next, so
 * `<span aria-hidden>—</span>` is read as `—` and recognised as a placeholder
 * rather than as a sentence full of class names. A line with no tag on it, the
 * middle of a wrapped paragraph, falls back to the line.
 */
const textNodeAround = (src, at) => {
  const start = Math.max(src.lastIndexOf('>', at), src.lastIndexOf('\n', at)) + 1;
  const tag = src.indexOf('<', at);
  const nl = src.indexOf('\n', at);
  const ends = [tag, nl, src.length].filter((x) => x >= 0);
  return src.slice(start, Math.min(...ends)).trim();
};

const CARD_TYPES = new Set([
  'Artifact', 'Creature', 'Enchantment', 'Instant', 'Sorcery', 'Land',
  'Planeswalker', 'Battle', 'Tribal', 'Kindred', 'Dungeon', 'Plane',
  'Scheme', 'Vanguard', 'Conspiracy', 'Phenomenon', 'Emblem', 'Token',
  'Legendary', 'Basic', 'Snow', 'World', 'Ongoing', 'Host', 'Elite',
]);

/** "Legendary Creature — Angel Horror", including one built from a template. */
const isTypeLine = (text) => {
  const before = text.split(EM)[0];
  if (before === text) return false;
  /* `Token ${types.join(' ')} — ${subtypes.join(' ')}` is a type line too. Drop
     the holes; what is left still has to be nothing but card types, and the
     empty-word guard below keeps `${name} — one copy.` out of here. */
  const words = before.replace(/\$\{[^{}]*\}/g, ' ').trim().split(/\s+/).filter(Boolean);
  /*
   * A type line whose left side is ENTIRELY a hole.
   *
   * `effects.ts` builds a token's line as `${typeParts.join(' ')} — ${name}`,
   * so dropping the holes leaves no words at all and the guard below rejected
   * it. The empty-word guard is right — it is what keeps `${name} — one copy.`
   * out — so the narrow signal is what the hole is NAMED: an expression about
   * types is a type line, `card.name` is not.
   */
  if (!words.length) return /\btypes?\b|typeParts|typeLine|type_line/i.test(before);
  if (words.length > 4) return false;
  return words.every((w) => CARD_TYPES.has(w));
};

/** A range or a score: numbers, currency or a hole on both sides. */
const isNumericRange = (text) => {
  /*
   * AN EM-DASH BETWEEN TWO HOLES IS PROSE, not a range.
   *
   * This exemption blanked every `${…}` to `0` and then accepted anything with
   * a digit on both sides of a dash, which made `${card.name} — ${detail}` look
   * exactly like `${wins}–${losses}`. It swallowed a real breach for as long as
   * it has existed: the insurance report, the one document that leaves this
   * product, read "1. Sol Ring — EOE #2 · 3 copies · NM — $64.77 total for 3"
   * and this sweep reported "0 across 0 files".
   *
   * The character is the tell, and it holds across the whole codebase. Every
   * genuine range here uses an EN-dash — `{wins}–{losses}`, `{fmt(min)}–{fmt(max)}`,
   * `2–0` — because that is the correct character for a span. Every prose use
   * is an EM-dash. An em-dash between two scores would be the wrong character
   * anyway, so flagging it is not a false positive either.
   */
  const emBetweenHoles = new RegExp('\\$?\\{[^{}]*\\}\\s*[' + EM + ']\\s*\\$?\\{');
  if (emBetweenHoles.test(text)) return false;

  /* `${x}` in a template and `{x}` in JSX both stand for a number here:
     `{row.wins}–{row.losses}` is a score, written the way JSX writes one. */
  const filled = text.replace(/\$?\{[^{}]*\}/g, '0');
  const between = new RegExp('[0-9.$)]\\s*[' + EM + EN + ']\\s*[0-9.$(]');
  if (between.test(filled)) return true;
  return new RegExp('^[WLD0-9' + EM + EN + ' ]+$').test(text.trim());
};

const isPlaceholder = (text) =>
  new RegExp('^[\\s' + EM + EN + ']*$').test(text);

/** '[—–−-]' handed to `new RegExp`. One bracketed set, no letters or spaces. */
const isCharClass = (text) => /^\[[^A-Za-z0-9\s\]]+\]$/.test(text.trim());

const isTest = (f) =>
  /\.test\.[tj]sx?$/.test(f) ||
  /\.(fixtures|testlib)\./.test(f) ||
  /[\\/](__tests__|fixtures)[\\/]/.test(f);

/**
 * Files with no player copy in them at all, skipped whole.
 *
 * `tagger.ts` is a table of `{ tag, when, also, note }` rules. `tag` is a
 * machine name and `note` is a code comment kept as a string, because
 * `scripts/generate-tagger-sql.ts` prints it into the generated SQL as a `--`
 * line. Nothing on this list renders anywhere a player can see.
 *
 * The cost is real and is the reason the list is one entry long: copy added to
 * a file named here will not be checked. Fix a string rather than adding to
 * this list, unless the file genuinely has no reader.
 */
const NOT_PLAYER_COPY = new Set(['src/engine/knowledge/tagger.ts']);
const isNotPlayerCopy = (f) => NOT_PLAYER_COPY.has(f.replace(/\\/g, '/'));

const hits = [];
const skipped = {
  typeLine: 0, range: 0, placeholder: 0, charClass: 0, testFiles: 0, notCopyFiles: 0,
};

/** True when this excerpt is one of the things the header says is fine. */
const excused = (text) => {
  if (isPlaceholder(text)) { skipped.placeholder++; return true; }
  if (isCharClass(text)) { skipped.charClass++; return true; }
  if (isTypeLine(text.trim())) { skipped.typeLine++; return true; }
  if (isNumericRange(text)) { skipped.range++; return true; }
  return false;
};

for (const file of walk(ROOT)) {
  if (isTest(file)) { skipped.testFiles++; continue; }
  if (isNotPlayerCopy(file)) { skipped.notCopyFiles++; continue; }
  const body = stripComments(fs.readFileSync(file, 'utf8'));
  const { literals, covered } = readSource(body);

  for (const m of literals) {
    const text = m.text;
    if (!DASH.test(text)) continue;
    if (excused(text)) continue;
    hits.push({ file, text });
  }

  /* Anything left. In a `.tsx` that is JSX text, which is copy and which no
     string literal holds; elsewhere it is punctuation in code, and code has no
     dashes in it that are not one of the excused shapes. */
  const inside = (at) => covered.some(([a, b]) => at > a && at < b);
  for (let at = 0; at < body.length; at += 1) {
    if (body[at] !== EM && body[at] !== EN) continue;
    if (inside(at)) continue;
    const text = textNodeAround(body, at);
    if (excused(text)) continue;
    hits.push({ file, text });
  }
}

const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);

for (const h of hits) {
  console.log(h.file.replace(/\\/g, '/'));
  console.log('    ' + h.text.replace(/\s+/g, ' ').slice(0, 110));
}
console.log('');
console.log(`em-dashes in player copy: ${hits.length} across ${byFile.size} files`);
console.log(
  `skipped: ${skipped.typeLine} type lines, ${skipped.range} ranges and scores, ` +
  `${skipped.placeholder} bare-dash placeholders, ${skipped.charClass} regex character ` +
  `classes, ${skipped.testFiles} test files, ${skipped.notCopyFiles} files that hold ` +
  `no player copy (${[...NOT_PLAYER_COPY].join(', ')})`
);
process.exit(hits.length ? 1 : 0);
