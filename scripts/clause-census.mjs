/**
 * scripts/clause-census.mjs — the clause census.
 *
 * Answers one question with a measurement instead of an opinion: oracle text is
 * a templated formal language, so how many distinct CLAUSE PATTERNS does the
 * whole card pool actually contain, and how fast does implementing the top N of
 * them finish off whole cards?
 *
 * Runs entirely on a local file. No database, no network, no model. Reads the
 * Scryfall bulk "oracle cards" export (one row per oracle_id) from
 *   scratch/scryfall/oracle-cards.jsonl
 * and writes
 *   scratch/clause-census.json
 *
 *   node scripts/clause-census.mjs
 *   node scripts/clause-census.mjs --examples "create a"     # show matching patterns
 *
 * ------------------------------------------------------------------
 * WHAT A CLAUSE IS HERE
 *
 * A clause is one of two things:
 *   - one KEYWORD ATOM off a keyword line. "Flying, vigilance" is two clauses,
 *     "Flying" is one, and the "Flying" in both is the same clause. This is why
 *     arrangement does not create fake variety.
 *   - one SENTENCE of a rules paragraph, split on sentence-final punctuation but
 *     never inside quotation marks, because "gains 'Whenever this creature deals
 *     combat damage, draw a card.' until end of turn" is one sentence.
 *
 * Sentence granularity is a deliberate choice and it has a cost worth stating:
 * "When this creature enters, create a token. It gains haste." becomes two
 * clauses, and the second one loses the fact that it sits inside a trigger. The
 * census measures TEMPLATE REUSE, not executable structure. Do not read a
 * pattern count as an implementation count.
 *
 * ------------------------------------------------------------------
 * TWO NORMALISERS, BOTH REPORTED
 *
 * Every collapse is a claim that two texts are the same work. Some of those
 * claims are safe and some are generous, so the census runs twice and reports
 * both, which brackets the truth instead of picking the flattering end.
 *
 *   strict — reminder text dropped, own name to `~`, self-reference phrases to
 *            `~`, mana runs to one placeholder, whitespace tidied. Nothing else.
 *            Two clauses collapse only if they are the same words.
 *
 *   full   — strict, plus numbers (digits and number words) to `~N`, creature
 *            types to `~TYPE`, colours to `~COLOR`, ability-word prefixes to
 *            `~AW`, modal bullets dropped, referenced card names to `~CARD`.
 *            This is the honest reading of "same template, different parameter":
 *            a Soldier token and an Elf token are one code path with an argument.
 *
 * The full normaliser deliberately does NOT touch predefined token names
 * (Treasure, Clue, Food, Blood, Map), because those are not one code path with
 * an argument. Treasure taps for mana and Clue draws a card. They are only ever
 * folded together as CREATURE types, which no predefined token is.
 *
 * ------------------------------------------------------------------
 * THE CURVE, AND THE TWO BARS
 *
 * Two coverage numbers come out of the same top-N set and they are wildly
 * different. Both are printed, always, and never merged.
 *
 *   clause coverage — share of all clause OCCURRENCES whose pattern is in the
 *                     top N. Flattering. A card counted here can still be dead.
 *   card coverage   — share of CARDS where EVERY clause is in the top N. This is
 *                     the one that means a card works. One unknown clause on a
 *                     card fails the whole card, which is exactly how the engine
 *                     behaves.
 *
 * Textless cards (vanilla creatures, basic lands) pass the card bar for free, so
 * they are counted and reported separately and the card curve is given both with
 * and without them.
 */

import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'clause-census.json');

const CURVE_POINTS = [100, 250, 500, 1000, 2000, 5000];
const TOP_PATTERNS_IN_JSON = 5000;

/* ------------------------------------------------------------------ *
 * Pool selection
 *
 * The pool is "cards the engine could ever be asked to play". Everything cut
 * below is cut for a reason that is printed in the report, so the reader can
 * disagree with a specific line rather than with a black box.
 * ------------------------------------------------------------------ */

/** Not cards. Tokens, emblems, art cards and the like carry no castable text. */
const EXCLUDED_LAYOUTS = new Set([
  'art_series',
  'token',
  'double_faced_token',
  'emblem',
  'front_card',
]);

/** Not part of a normal game of Magic. */
const EXCLUDED_LAYOUTS_NON_GAME = new Set(['vanguard', 'scheme', 'planar']);

/** Art cards, oversized memorabilia and token sheets. */
const EXCLUDED_SET_TYPES = new Set(['memorabilia', 'token']);

/* ------------------------------------------------------------------ *
 * Reading the file
 * ------------------------------------------------------------------ */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

/** Every oracle_text on the card, front and back, plus the names to blank out. */
function facesOf(card) {
  if (Array.isArray(card.card_faces) && card.card_faces.length) {
    return card.card_faces.map((f) => ({
      text: f.oracle_text ?? '',
      name: f.name ?? card.name,
    }));
  }
  return [{ text: card.oracle_text ?? '', name: card.name }];
}

/* ------------------------------------------------------------------ *
 * Vocabularies, all derived from the file itself so nothing is hand-maintained
 * ------------------------------------------------------------------ */

function pluralsOf(word) {
  const out = [word];
  if (/[^aeiou]f$/.test(word)) out.push(word.slice(0, -1) + 'ves');
  else if (/fe$/.test(word)) out.push(word.slice(0, -2) + 'ves');
  else if (/(s|x|z|ch|sh)$/.test(word)) out.push(word + 'es');
  else if (/[^aeiou]y$/.test(word)) out.push(word.slice(0, -1) + 'ies');
  else out.push(word + 's');
  return out;
}

/**
 * Creature subtypes only. Taken off the type lines of cards that are creatures,
 * which is what keeps Treasure, Clue, Aura, Equipment and Vehicle out: none of
 * them is ever a creature subtype, and folding them together would be a lie.
 */
function creatureTypeSet(cards) {
  const types = new Set();
  for (const card of cards) {
    for (const part of String(card.type_line ?? '').split(' // ')) {
      const [front, back] = part.split('—');
      if (!back || !/\bCreature\b/.test(front)) continue;
      for (const word of back.trim().split(/\s+/)) {
        if (/^[A-Z][A-Za-z'-]*$/.test(word)) types.add(word);
      }
    }
  }
  const withPlurals = new Set();
  for (const t of types) for (const form of pluralsOf(t)) withPlurals.add(form);
  return withPlurals;
}

/** Every card name in the pool, for resolving "named <card>" references. */
function nameSet(cards) {
  const names = new Set();
  for (const card of cards) {
    names.add(card.name);
    for (const face of card.card_faces ?? []) if (face.name) names.add(face.name);
  }
  return names;
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reminder text. Nested parentheses exist, so this runs to a fixed point. */
function dropReminders(text) {
  let out = text;
  for (let i = 0; i < 6; i++) {
    const next = out.replace(/\([^()]*\)/g, ' ');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Self-reference. Current templating writes "this creature" where 1994 wrote the
 * card's name, and both must land on the same token or every modern reprint
 * forks its own pattern. The list is closed on purpose: "this turn", "this way"
 * and "this game" are not self-references.
 */
const SELF_REFERENCE =
  /\bthis (creature|permanent|card|spell|land|artifact|enchantment|planeswalker|equipment|aura|vehicle|token|battle|saga|creature spell)\b/gi;

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const COLOUR_WORDS = /\b(white|blue|black|red|green|colorless|monocolored|multicolored)\b/g;

/** Symbols that are not mana and must never be swallowed by a mana run. */
const NON_MANA_SYMBOL = { T: '~TAP', Q: '~UNTAP', E: '~ENERGY', PW: '~PW', CHAOS: '~CHAOS', TK: '~TICKET' };

/**
 * Mana costs collapse to a single placeholder. {3}{G}{G} and {1}{U} are the same
 * clause with a different price, and the engine pays both through one code path.
 */
function collapseSymbols(text) {
  const symbols = /(?:\{[^}]{1,12}\})+/g;
  return text.replace(symbols, (run) => {
    const parts = [...run.matchAll(/\{([^}]{1,12})\}/g)].map((m) => m[1].toUpperCase());
    const out = [];
    let manaRun = false;
    for (const p of parts) {
      if (NON_MANA_SYMBOL[p]) {
        out.push(NON_MANA_SYMBOL[p]);
        manaRun = false;
      } else if (!manaRun) {
        out.push('~MANA');
        manaRun = true;
      }
    }
    return out.join(' ');
  });
}

/** Longest known card name that starts at `from`, or null. */
function nameAt(text, from, names) {
  const window = text.slice(from, from + 70);
  for (let end = window.length; end >= 3; end--) {
    if (names.has(window.slice(0, end))) return window.slice(0, end);
  }
  return null;
}

/** "a card named Fblthp, the Lost" -> "a card named ~CARD", by exact lookup. */
function namedPass(text, names) {
  let out = '';
  let i = 0;
  const trigger = /\b(named |Partner with )/g;
  let m;
  while ((m = trigger.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const hit = nameAt(text, start, names);
    if (!hit) continue;
    out += text.slice(i, start) + '~CARD';
    i = start + hit.length;
    trigger.lastIndex = i;
  }
  return out + text.slice(i);
}

/**
 * Ability words. CR 207.2c says they have no rules meaning, so "Landfall — " and
 * "Delirium — " in front of otherwise identical triggers are noise. The dash
 * must be a spaced em dash with text after it, which is what separates an
 * ability word from a keyword cost like "Cumulative upkeep—{1}".
 */
const ABILITY_WORD_PREFIX = /^[A-Z][A-Za-z',\- ]{0,30}? — (?=\S)/;

function normaliseClause(raw, ctx, level) {
  let s = raw;

  // Card's own name, longest form first, before anything is lowercased.
  for (const n of ctx.selfNames) s = s.split(n).join('~');
  s = s.replace(SELF_REFERENCE, '~');

  if (level === 'full') {
    s = namedPass(s, ctx.names);
    // Creature types, capitalised, before the lowercasing that would hide them.
    s = s.replace(/\b[A-Z][A-Za-z'-]*\b/g, (w) => (ctx.types.has(w) ? '~TYPE' : w));
  }

  s = collapseSymbols(s);

  if (level === 'full') {
    s = s.replace(COLOUR_WORDS, '~COLOR');
    s = s.replace(/\b\d+\b/g, '~N');
    s = s.replace(/\b[a-z]+\b/g, (w) => (NUMBER_WORDS[w] !== undefined ? '~N' : w));
  }

  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  /*
   * Edge punctuation is not part of the work. Splitting a sentence at ", then"
   * leaves the first half without its full stop, and without this the very same
   * effect counts as two patterns depending on where it sat in the sentence.
   * Found by reading the singleton tail, which was full of exactly that.
   */
  s = s.replace(/^[—–•\-:,\s]+/, '').replace(/[.!?,;:\s]+$/, '').trim();
  // A repeated ~type ~type or ~n ~n run is one parameter list, not two.
  s = s.replace(/(~type )(?:~type )+/g, '$1');
  return s;
}

/* ------------------------------------------------------------------ *
 * Splitting a card into clauses
 * ------------------------------------------------------------------ */

/**
 * A keyword line, split into one clause per keyword. Decided from the card's own
 * Scryfall `keywords` array rather than a hand list, so it cannot drift.
 * Guarded so a sentence that merely opens with an action word ("Investigate.
 * Then draw a card.") is not mistaken for a keyword line.
 */
function keywordAtoms(line, keywords) {
  if (!keywords.length) return null;
  const parts = line.split(/,\s+/);
  const atoms = [];
  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) return null;
    const hit = keywords.find((k) => {
      const lower = part.toLowerCase();
      const kw = k.toLowerCase();
      if (!lower.startsWith(kw)) return false;
      const rest = part.slice(k.length);
      return rest === '' || /^[ —–\-.:{]/.test(rest);
    });
    if (!hit) return null;
    if (part.split(/\s+/).length > 8) return null;
    if (/\.\s+\S/.test(part)) return null;
    atoms.push(part.replace(/\.$/, ''));
  }
  return atoms;
}

/** Sentence split that refuses to cut inside quoted granted abilities. */
function sentences(line) {
  const out = [];
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === '“') inQuote = true;
    else if (ch === '”') inQuote = false;
    const isEnd = ch === '.' || ch === '!' || ch === '?';
    if (!isEnd || inQuote) continue;
    const next = line[i + 1];
    if (next !== undefined && next !== ' ') continue;
    out.push(line.slice(start, i + 1).trim());
    start = i + 1;
  }
  const tail = line.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Granularity: sentence, or the grammatical clause inside it
 *
 * A sentence is the wrong unit and the first run proved it. "Whenever this
 * creature deals combat damage to a player" appears in front of at least 40
 * different effects, and at sentence granularity that is 40 unrelated patterns.
 * The trigger is one piece of work and each effect is another, so the sentence
 * count is a cross product of two much smaller sets.
 *
 * Clause granularity cuts the sentence at its joints:
 *   TRIGGER   "Whenever ... ," / "When ... ," / "At the beginning of ... ,"
 *   COST      everything before the ":" of an activated ability
 *   CONDITION a leading "If ... ," or "As long as ... ,"
 *   EFFECT    what is left, split again on ", then" and ";"
 *
 * Each kind is tagged, so a trigger pattern can never be counted as satisfying
 * an effect pattern that happens to read the same.
 * ------------------------------------------------------------------ */

const TRIGGER_HEAD = /^(whenever|when|at the beginning of|at end of|after) /i;
const CONDITION_HEAD = /^(if|as long as|while|unless|for as long as) /i;
const CONJUNCTION_AFTER_COMMA = /^(or|and|nor|then)\b/i;

/** First comma that ends a clause: depth zero, not inside a quote, not a list. */
function clauseComma(text) {
  let paren = 0;
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === '“' || ch === '”') quote = !quote;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
    if (ch !== ',' || quote || paren > 0) continue;
    if (text[i + 1] !== ' ') continue;
    if (CONJUNCTION_AFTER_COMMA.test(text.slice(i + 2))) continue;
    return i;
  }
  return -1;
}

/** Colon that separates an activation cost from its effect. */
function costColon(text) {
  let quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === '“' || ch === '”') quote = !quote;
    if (ch === ':' && !quote && text[i + 1] === ' ') return i;
  }
  return -1;
}

function splitSentenceIntoClauses(sentence) {
  const out = [];
  let rest = sentence.trim();

  // Planeswalker loyalty is an activation cost like any other, and without this
  // the whole ability lands in the effect bucket carrying its "+1:" with it.
  const loyalty = rest.match(/^([+−\-]?\d+|0):\s/);
  if (loyalty) {
    out.push(['cost', loyalty[1].replace(/\d+/, 'N')]);
    rest = rest.slice(loyalty[0].length).trim();
  }

  const colon = costColon(rest);
  if (colon > -1 && /[{]|sacrifice|discard|pay|tap|exile|remove|return/i.test(rest.slice(0, colon))) {
    out.push(['cost', rest.slice(0, colon).trim()]);
    rest = rest.slice(colon + 1).trim();
  }

  for (let guard = 0; guard < 4; guard++) {
    const head = TRIGGER_HEAD.test(rest) ? 'trigger' : CONDITION_HEAD.test(rest) ? 'condition' : null;
    if (!head) break;
    const comma = clauseComma(rest);
    if (comma < 0) break;
    out.push([head, rest.slice(0, comma).trim()]);
    rest = rest.slice(comma + 1).trim();
  }

  for (const piece of rest.split(/,\s+then\s+|;\s+/)) {
    const p = piece.trim();
    if (p) out.push(['effect', p]);
  }
  return out;
}

function clausesOf(card, ctx, level, granularity) {
  const keywords = Array.isArray(card.keywords) ? card.keywords : [];
  const out = [];
  for (const face of facesOf(card)) {
    const faceCtx = { ...ctx, selfNames: selfNamesFor(card, face.name) };
    const text = dropReminders(face.text);
    for (const lineRaw of text.split('\n')) {
      const line = lineRaw.trim();
      if (!line) continue;
      const atoms = keywordAtoms(line, keywords);
      if (atoms) {
        for (const atom of atoms) {
          const norm = normaliseClause(atom, faceCtx, level);
          if (norm) out.push(`kw| ${norm}`);
        }
        continue;
      }

      // A modal bullet is a mode, never a free-standing effect, so it carries
      // its own tag. The "Choose one —" line above it is a separate clause and
      // must also be covered before the card counts as covered.
      let body = line;
      let baseKind = 'effect';
      if (/^\s*•/.test(body)) {
        body = body.replace(/^\s*•\s*/, '');
        baseKind = 'mode';
      }

      // Ability words carry no rules meaning (CR 207.2c) but they are still text
      // on the card, so they become their own clause rather than vanishing.
      const aw = body.match(ABILITY_WORD_PREFIX);
      if (aw) {
        out.push(`aw| ${aw[0].replace(/\s*—\s*$/, '').trim().toLowerCase()}`);
        body = body.slice(aw[0].length);
      }

      for (const sentence of sentences(body)) {
        if (granularity === 'sentence') {
          const norm = normaliseClause(sentence, faceCtx, level);
          if (norm) out.push(`${baseKind === 'mode' ? 'mode' : 's'}| ${norm}`);
          continue;
        }
        for (const [kind, piece] of splitSentenceIntoClauses(sentence)) {
          const norm = normaliseClause(piece, faceCtx, level);
          if (norm) out.push(`${kind === 'effect' ? baseKind : kind}| ${norm}`);
        }
      }
    }
  }
  return out;
}

/** Full name, face name, and the pre-comma short name legends are called by. */
function selfNamesFor(card, faceName) {
  const names = new Set();
  for (const n of [card.name, faceName]) {
    if (!n) continue;
    names.add(n);
    for (const part of n.split(' // ')) {
      names.add(part);
      const short = part.split(',')[0].trim();
      if (short.length >= 4 && short !== part) names.add(short);
    }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

/* ------------------------------------------------------------------ *
 * The census
 * ------------------------------------------------------------------ */

function census(cards, ctx, level, granularity) {
  const cardClauses = [];
  const patternCards = new Map(); // pattern -> distinct card count
  const patternUses = new Map(); // pattern -> total occurrences
  let totalClauses = 0;
  let textless = 0;

  for (const card of cards) {
    const list = clausesOf(card, ctx, level, granularity);
    cardClauses.push(list);
    totalClauses += list.length;
    if (!list.length) textless++;
    const distinct = new Set(list);
    for (const p of distinct) patternCards.set(p, (patternCards.get(p) ?? 0) + 1);
    for (const p of list) patternUses.set(p, (patternUses.get(p) ?? 0) + 1);
  }

  const ranked = [...patternCards.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([pattern, cards_]) => ({ pattern, cards: cards_, uses: patternUses.get(pattern) }));

  /*
   * The curve is exact, not sampled. Rank every pattern once, then a card's
   * "cost to finish" is simply the WORST rank among its clauses: implement the
   * top N and that card works if and only if N reaches its worst clause. So one
   * histogram gives the whole curve at every N at once, and the second-worst
   * rank gives the near miss, the cards that fail on a single clause.
   */
  const rankOf = new Map();
  ranked.forEach((r, i) => rankOf.set(r.pattern, i + 1));

  const P = ranked.length;
  const cardsDoneAt = new Int32Array(P + 2); // worst-rank histogram
  const cardsDoneAtWithText = new Int32Array(P + 2);
  const nearMissAt = new Int32Array(P + 2); // second-worst rank histogram
  const clausesAt = new Int32Array(P + 2);
  let withText = 0;

  for (const list of cardClauses) {
    if (list.length) withText++;
    let worst = 0;
    let second = 0;
    const seen = new Set();
    for (const p of list) {
      const r = rankOf.get(p);
      clausesAt[r]++;
      if (seen.has(p)) continue;
      seen.add(p);
      if (r > worst) { second = worst; worst = r; }
      else if (r > second) second = r;
    }
    cardsDoneAt[worst]++;
    if (list.length) cardsDoneAtWithText[worst]++;
    if (worst > 0) nearMissAt[second]++;
  }

  // Cumulative sums: value at N is "how many are covered by the top N".
  const cum = (arr) => {
    const out = new Float64Array(P + 2);
    let run = 0;
    for (let i = 0; i <= P + 1; i++) { run += arr[i]; out[i] = run; }
    return out;
  };
  const cardsBy = cum(cardsDoneAt);
  const cardsTextBy = cum(cardsDoneAtWithText);
  const clausesBy = cum(clausesAt);
  const nearMissBy = cum(nearMissAt);

  const at = (n) => {
    const i = Math.min(n, P);
    const done = cardsBy[i];
    return {
      n: i,
      requested: n,
      clauseCoveragePct: round(100 * clausesBy[i] / totalClauses),
      cardCoverageAllClausesPct: round(100 * done / cards.length),
      cardCoverageAllClausesExclTextlessPct: round(100 * cardsTextBy[i] / withText),
      cardsFullyCovered: done,
      cardsFullyCoveredExclTextless: cardsTextBy[i],
      // Cards that would be finished by adding ONE more pattern each.
      cardsMissingExactlyOnePattern: nearMissBy[i] - done,
    };
  };

  const curve = CURVE_POINTS.map(at);

  // How many patterns must exist before card coverage reaches a threshold.
  const thresholds = {};
  for (const pct of [25, 50, 75, 90, 95, 99, 100]) {
    const need = (pct / 100) * cards.length;
    let n = null;
    for (let i = 0; i <= P; i++) if (cardsBy[i] >= need - 1e-9) { n = i; break; }
    thresholds[`${pct}pct`] = n;
  }

  const singletons = ranked.filter((r) => r.cards === 1).length;
  const uses1 = ranked.filter((r) => r.uses === 1).length;

  const clauseCounts = cardClauses.map((l) => l.length).sort((a, b) => a - b);

  const byKind = new Map();
  for (const r of ranked) {
    const kind = r.pattern.split('|')[0];
    const e = byKind.get(kind) ?? { patterns: 0, uses: 0 };
    e.patterns++;
    e.uses += r.uses;
    byKind.set(kind, e);
  }

  return {
    level,
    granularity,
    totalCards: cards.length,
    textlessCards: textless,
    cardsWithText: cards.length - textless,
    totalClauses,
    distinctPatterns: ranked.length,
    patternsOnExactlyOneCard: singletons,
    patternsOnExactlyOneCardPct: round(100 * singletons / ranked.length),
    patternsUsedExactlyOnce: uses1,
    medianClausesPerCard: clauseCounts[Math.floor(clauseCounts.length / 2)],
    meanClausesPerCard: round(totalClauses / cards.length),
    maxClausesOnACard: clauseCounts[clauseCounts.length - 1],
    byClauseKind: Object.fromEntries(
      [...byKind.entries()].sort((a, b) => b[1].uses - a[1].uses),
    ),
    curve,
    patternsNeededForCardCoverage: thresholds,
    topPatterns: ranked.slice(0, TOP_PATTERNS_IN_JSON),
    singletonSample: ranked.filter((r) => r.cards === 1).filter((_, i) => i % 400 === 0).slice(0, 60).map((r) => r.pattern),
    _ranked: ranked,
  };
}

const round = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const all = [];
for await (const card of rows(SRC)) all.push(card);

const excluded = { layoutNotACard: 0, layoutNonGame: 0, setTypeExtra: 0, digitalOnly: 0, notPaper: 0 };
const pool = [];
for (const card of all) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) { excluded.layoutNotACard++; continue; }
  if (EXCLUDED_SET_TYPES.has(card.set_type)) { excluded.setTypeExtra++; continue; }
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) { excluded.layoutNonGame++; continue; }
  if (card.digital) { excluded.digitalOnly++; continue; }
  if (!(card.games ?? []).includes('paper')) { excluded.notPaper++; continue; }
  pool.push(card);
}

const funnyCount = pool.filter((c) => c.set_type === 'funny').length;

const ctx = { types: creatureTypeSet(pool), names: nameSet(pool), selfNames: [] };

/*
 * QA on the instrument itself. Every one of these is a way the normaliser can
 * quietly inflate the pattern count, and an inflated pattern count is exactly
 * the kind of number this project has been burned by before. They are counted
 * and printed rather than assumed to be zero.
 */
function qa(cards, ctx) {
  let clauses = 0;
  let leakedOwnName = 0;
  let leakedParen = 0;
  let leakedBrace = 0;
  const braceExamples = new Set();
  for (const card of cards) {
    const selfNames = selfNamesFor(card, card.name);
    for (const c of clausesOf(card, ctx, 'full', 'clause')) {
      clauses++;
      const body = c.slice(c.indexOf('| ') + 2);
      if (selfNames.some((n) => n.length > 3 && body.includes(n.toLowerCase()))) leakedOwnName++;
      if (body.includes('(')) leakedParen++;
      if (body.includes('{')) {
        leakedBrace++;
        if (braceExamples.size < 8) braceExamples.add(body.slice(0, 60));
      }
    }
  }
  return {
    clausesChecked: clauses,
    clausesStillContainingOwnName: leakedOwnName,
    clausesStillContainingReminderParen: leakedParen,
    clausesStillContainingRawSymbol: leakedBrace,
    rawSymbolExamples: [...braceExamples],
  };
}

/*
 * The PROMPTED bucket, sized by text marker only. This is NOT a claim that a
 * prompt exists, and it is NOT a claim these cards work. It is the count of
 * cards whose text contains a decision a human has to make, which is the set
 * that can never be automated and must not be counted as failure.
 */
const DECISION_MARKER = /\byou may\b|\bchoose\b|\bup to\b|\bmay pay\b|\bof your choice\b|\bif you do\b|\byou could\b|\bmay have\b|\bdivided as you choose\b/i;

function decisionCensus(cards) {
  let withDecision = 0;
  let withText = 0;
  for (const card of cards) {
    const text = facesOf(card).map((f) => dropReminders(f.text)).join('\n').trim();
    if (!text) continue;
    withText++;
    if (DECISION_MARKER.test(text)) withDecision++;
  }
  return {
    cardsWithText: withText,
    cardsWithAPlayerDecisionMarker: withDecision,
    pctOfCardsWithText: round(100 * withDecision / withText),
    markers: DECISION_MARKER.source,
    caveat: 'text marker only. says nothing about whether a prompt exists in the app.',
  };
}

const runs = {
  sentenceFull: census(pool, ctx, 'full', 'sentence'),
  sentenceStrict: census(pool, ctx, 'strict', 'sentence'),
  clauseFull: census(pool, ctx, 'full', 'clause'),
  clauseStrict: census(pool, ctx, 'strict', 'clause'),
  // Un-sets are joke cards that no engine will ever run. Kept as a separate run
  // so the reader can see exactly how much of the tail they account for, rather
  // than being quietly dropped to make the curve look better.
  clauseFullNoFunny: census(pool.filter((c) => c.set_type !== 'funny'), ctx, 'full', 'clause'),
};

/* --- optional pattern lookup, for eyeballing what a pattern really is --- */
const exIdx = process.argv.indexOf('--examples');
if (exIdx > -1) {
  const needle = (process.argv[exIdx + 1] ?? '').toLowerCase();
  for (const r of runs.clauseFull._ranked.filter((r) => r.pattern.includes(needle)).slice(0, 40)) {
    console.log(String(r.cards).padStart(6), r.pattern);
  }
  process.exit(0);
}

const report = {
  generatedAt: new Date().toISOString(),
  script: 'scripts/clause-census.mjs',
  source: {
    file: 'scratch/scryfall/oracle-cards.jsonl',
    bulkType: 'oracle_cards',
    downloadedFrom: 'https://data.scryfall.io/oracle-cards/oracle-cards-20260819090153.jsonl.gz',
    scryfallUpdatedAt: '2026-08-19T09:01:53.432+00:00',
    bytes: statSync(SRC).size,
    rowsInFile: all.length,
  },
  pool: {
    cards: pool.length,
    excluded,
    excludedTotal: all.length - pool.length,
    note: 'one row per oracle_id, paper, non-digital, real playable cards only',
    funnySetCardsIncluded: funnyCount,
    creatureTypesDerived: ctx.types.size,
  },
  qa: qa(pool, ctx),
  playerDecisions: decisionCensus(pool),
  runs,
};
for (const r of Object.values(runs)) delete r._ranked;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));

/* ------------------------------------------------------------------ *
 * Print
 * ------------------------------------------------------------------ */

const line = (s = '') => console.log(s);

line();
line(`SOURCE  scratch/scryfall/oracle-cards.jsonl  (Scryfall bulk "oracle_cards")`);
line(`        rows in file .................. ${all.length}`);
line(`        excluded from pool ........... ${all.length - pool.length}`);
line(`          not a card (token/emblem/art) ${excluded.layoutNotACard + excluded.setTypeExtra}`);
line(`          not a normal game (plane/scheme/vanguard) ${excluded.layoutNonGame}`);
line(`          digital only ................ ${excluded.digitalOnly}`);
line(`          no paper printing ........... ${excluded.notPaper}`);
line(`        POOL ......................... ${pool.length} unique cards`);
line(`        of which Un-set / funny ...... ${funnyCount}`);
line(`        creature types derived ....... ${ctx.types.size}`);
line();
line('QA ON THE NORMALISER (clause granularity, full)');
line(`        clauses checked .............. ${report.qa.clausesChecked}`);
line(`        still contain own card name .. ${report.qa.clausesStillContainingOwnName}`);
line(`        still contain reminder paren . ${report.qa.clausesStillContainingReminderParen}`);
line(`        still contain a raw {symbol} . ${report.qa.clausesStillContainingRawSymbol}`);
line();
line('PLAYER DECISIONS (text marker only, not a claim that a prompt exists)');
line(`        cards with text .............. ${report.playerDecisions.cardsWithText}`);
line(`        cards asking a human to choose ${report.playerDecisions.cardsWithAPlayerDecisionMarker} (${report.playerDecisions.pctOfCardsWithText}%)`);

for (const [key, r] of Object.entries(runs)) {
  line();
  line(`=== ${key}  (${r.granularity} granularity / ${r.level} normaliser / ${r.totalCards} cards) ===`);
  line(`  total clauses ................ ${r.totalClauses}`);
  line(`  distinct patterns ............ ${r.distinctPatterns}`);
  line(`  patterns on exactly one card . ${r.patternsOnExactlyOneCard} (${r.patternsOnExactlyOneCardPct}% of patterns)`);
  line(`  cards with no text at all .... ${r.textlessCards}`);
  line(`  clauses per card ............. mean ${r.meanClausesPerCard}, median ${r.medianClausesPerCard}, max ${r.maxClausesOnACard}`);
  line();
  line(`     top N   clause cov   CARD cov (all clauses)   excl. textless   one clause short`);
  for (const c of r.curve) {
    line(
      `  ${String(c.requested).padStart(8)}   ${String(c.clauseCoveragePct + '%').padStart(9)}   ${String(c.cardCoverageAllClausesPct + '%').padStart(21)}   ${String(c.cardCoverageAllClausesExclTextlessPct + '%').padStart(14)}   ${String(c.cardsMissingExactlyOnePattern).padStart(16)}`,
    );
  }
  line();
  line(`  patterns needed to reach card coverage of:`);
  for (const [k, v] of Object.entries(r.patternsNeededForCardCoverage)) {
    line(`    ${k.replace('pct', '%').padStart(5)} ... ${v === null ? 'never' : v}`);
  }
}

line();
line('TOP 40 PATTERNS BY CARD COUNT (clause granularity, full normaliser)');
for (const r of runs.clauseFull.topPatterns.slice(0, 40)) {
  line(`  ${String(r.cards).padStart(6)}  ${r.pattern.slice(0, 100)}`);
}

line();
line(`written: scratch/clause-census.json`);
