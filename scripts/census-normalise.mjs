/**
 * Verbatim extract of the pool filter and the clause normaliser from
 * `scripts/clause-census.mjs`, lines 87-510, so a second script can produce the
 * SAME patterns as the census without re-running it and without a hand-typed
 * copy that drifts.
 *
 * The body below is byte-identical to that line range. Nothing was edited. The
 * only additions are this header and the export list at the bottom. Fidelity is
 * proved at run time by `scripts/ability-layer-coverage.mjs`, which recomputes
 * the census totals from these functions and fails loudly if they do not match
 * the numbers in `scratch/clause-census.json`.
 */

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

export {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  facesOf,
  creatureTypeSet,
  nameSet,
  dropReminders,
  normaliseClause,
  keywordAtoms,
  sentences,
  splitSentenceIntoClauses,
  clausesOf,
  selfNamesFor,
  ABILITY_WORD_PREFIX,
};
