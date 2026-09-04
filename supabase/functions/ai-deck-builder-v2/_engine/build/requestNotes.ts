/**
 * What the player typed into "Anything else?", read by the engine.
 *
 * ## Why this exists
 *
 * The generator page has a text box reading *"e.g. more counterspells, nothing
 * over 4 mana, keep Cyclonic Rift out"*. Measured 4 Sep 2026, `customPrompt`
 * was declared on the request type and **read by nothing**: its only consumer
 * had been the language model's prompt, the model was removed on 3 Sep, and the
 * comment left behind claimed both it and `powerLevel` were "engine inputs now"
 * when only `powerLevel` was. So the box did nothing at all, which is the exact
 * thing the owner asked about: *"there are a few additional options, do they
 * actually do anything or are there filters we are missing?"*
 *
 * No model reads this. The owner: *"we dont use AI for any of the app, all the
 * engine so the options shouldnt call llms it should use engine always."*
 *
 * ## What it deliberately does NOT do
 *
 * It does not try to understand the sentence. It reads two shapes that cannot
 * be mistaken for anything else and REPORTS EVERYTHING ELSE AS UNREAD, so the
 * player is told what was acted on rather than left to assume all of it was.
 * A parser that silently half-understands "more counterspells" is worse than
 * one that says it did not understand: the deck comes back without them either
 * way, and only one of those is honest about it.
 *
 * A name is excluded ONLY when it matches a real card, and the caller supplies
 * the names it holds. "no counterspells" therefore reads as UNREAD rather than
 * banning `Counterspell`, because the plural does not match and a category is
 * not a card. Plurals are deliberately not stripped for that reason.
 */

/** One thing the player asked for, and whether the engine could act on it. */
export interface RequestNotes {
  /** Card names to keep out, exactly as the catalogue spells them. */
  readonly excludeNames: readonly string[];
  /** A mana value ceiling for nonland spells, when one was given. */
  readonly maxManaValue: number | null;
  /** Phrases the reader did not understand, in the player's own words. */
  readonly unread: readonly string[];
}

const EMPTY: RequestNotes = Object.freeze({
  excludeNames: Object.freeze([]) as readonly string[],
  maxManaValue: null,
  unread: Object.freeze([]) as readonly string[],
});

/**
 * Lower-cased, punctuation folded, so "Cyclonic Rift." matches the card.
 *
 * The apostrophe is DELETED rather than folded to a space, so that a player
 * typing "gaeas cradle" reaches `Gaea's Cradle`. Spacing it made the two
 * spellings disagree, which is the same trap `normalize.ts` records: it strips
 * apostrophes, and a rule written against the printed spelling missed every
 * card whose name has one.
 */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/*
 * "no X", "without X", "keep X out", "don't include X", "leave X out".
 *
 * Each captures the SUBJECT and nothing else, and the subject is then required
 * to be a real card name. The alternatives are written separately rather than
 * as one clever pattern because each has a different shape around the subject
 * and a combined one was getting "out" into the capture.
 */
const EXCLUDE_PATTERNS: readonly RegExp[] = [
  /\b(?:keep|leave)\s+(.+?)\s+out\b/,
  /\b(?:without|excluding|except)\s+(.+)$/,
  /\b(?:do\s*n[o']?t|don t|no)\s+(?:include|play|add|use)\s+(.+)$/,
  /\bno\s+(.+)$/,
];

/* "nothing over 4 mana", "no cards above 4", "max 4 mana", "4 mana or less". */
const CEILING_PATTERNS: readonly RegExp[] = [
  /\b(?:nothing|no\s+cards?|none)\s+(?:over|above|costing\s+more\s+than|more\s+than)\s+(\d+)\b/,
  /\bmax(?:imum)?\s+(?:mana\s+value\s+|mv\s+|cmc\s+)?(\d+)\b/,
  /\b(\d+)\s+mana\s+or\s+(?:less|fewer|under)\b/,
];

/**
 * Read the box.
 *
 * `knownNames` is the catalogue's own spelling of every card the build could
 * legally use. It is the authority on what a card is called, so a name that is
 * not in it is reported unread rather than banned — the same rule Tutor uses
 * when it resolves names out of prose, for the same reason: the alternative is
 * acting on a card that does not exist.
 */
export function readRequestNotes(
  text: string | null | undefined,
  knownNames: Iterable<string>
): RequestNotes {
  const raw = (text ?? '').trim();
  if (!raw) return EMPTY;

  const byFolded = new Map<string, string>();
  for (const name of knownNames) {
    const key = fold(name);
    if (key && !byFolded.has(key)) byFolded.set(key, name);
  }

  const excludeNames: string[] = [];
  const unread: string[] = [];
  let maxManaValue: number | null = null;

  /* One clause per line, comma or semicolon. A player writes a list, and
     reading the whole box as one sentence made the first "no" swallow the
     rest of it. */
  for (const clause of raw.split(/[\n,;]+/)) {
    const phrase = clause.trim();
    if (!phrase) continue;
    const folded = fold(phrase);
    if (!folded) continue;

    let handled = false;

    for (const pattern of CEILING_PATTERNS) {
      const m = folded.match(pattern);
      if (!m) continue;
      const n = Number(m[1]);
      /* A ceiling below one would ask for a deck of nothing, and anything
         past the most expensive card in Magic is not a limit. Out of range
         reads as unread rather than being clamped to something the player
         did not say. */
      if (Number.isFinite(n) && n >= 1 && n <= 20) {
        maxManaValue = maxManaValue === null ? n : Math.min(maxManaValue, n);
        handled = true;
      }
      break;
    }
    if (handled) continue;

    for (const pattern of EXCLUDE_PATTERNS) {
      const m = folded.match(pattern);
      if (!m) continue;
      const subject = m[1].trim();
      const hit = byFolded.get(subject);
      if (hit) {
        if (!excludeNames.includes(hit)) excludeNames.push(hit);
        handled = true;
      }
      /* Break either way. A phrase that matched "no ..." and named something
         that is not a card is not going to match a different exclusion
         pattern into a card; trying the rest only risks a worse capture. */
      break;
    }

    if (!handled) unread.push(phrase);
  }

  return {
    excludeNames,
    maxManaValue,
    unread,
  };
}

/**
 * The sentence the player reads back, or null when there is nothing to say.
 *
 * Written here rather than in the pipeline so the wording is one thing. It
 * follows the project's copy rules: no jargon, no em-dashes, and it never
 * claims to have understood something it did not.
 */
export function describeRequestNotes(notes: RequestNotes): string | null {
  const said: string[] = [];
  if (notes.excludeNames.length > 0) {
    said.push(`kept ${notes.excludeNames.join(', ')} out because you asked`);
  }
  if (notes.maxManaValue !== null) {
    said.push(`left out spells costing more than ${notes.maxManaValue}`);
  }
  if (notes.unread.length > 0) {
    said.push(
      `could not act on "${notes.unread.join('", "')}", so nothing was changed for that`
    );
  }
  return said.length > 0 ? `You asked for something extra: ${said.join('; ')}.` : null;
}
