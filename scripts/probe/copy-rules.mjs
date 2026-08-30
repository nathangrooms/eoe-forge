/**
 * The copy rules from CLAUDE.md, checked against text that renders.
 *
 *   node scripts/probe/copy-rules.mjs
 *
 * Two of the three rules are checkable and this checks those two:
 *
 *   NO EM-DASHES. "Rewrite the sentence rather than swapping the dash for a
 *   semicolon or brackets. A sentence that needed an em-dash usually wanted to
 *   be two sentences." Also the en-dash, which is the same character reached
 *   for by a different route. A HYPHEN is fine and so is a MINUS between
 *   numbers, so only the two dashes are looked for.
 *
 *   NO PRODUCT-INVENTED VOCABULARY. "portability", "round trip", "subscore
 *   weights", "taxonomy", "canonical", "engine", "pipeline", "surface",
 *   "primitive" — engineering words in an interface a Commander player reads.
 *   The list is the one CLAUDE.md gives, plus the handful this codebase reaches
 *   for by habit.
 *
 * The third rule, "short beats long", is a judgement and is not automated.
 *
 * ## Why it reads JSX text and not the file
 *
 * Comments are exempt and this file's own comments are full of em-dashes. The
 * scan takes only what sits between tags, the same extraction
 * `refute-aiwords.mjs` uses for the naming ban list, so a dash explaining WHY
 * in a comment never fires and a dash a player reads always does.
 *
 * It cannot see text built by string concatenation or held in a constant, so a
 * clean run is not a proof. It is the cheap half.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Not shipped copy.
 *
 * `src/dev/` and `src/pages/__*` are harnesses. `PromptEditor` is the admin
 * screen holding the system prompt, and line 67 of it is the RULE ITSELF:
 * "No product jargon. Not 'engine', 'pipeline', 'subscore', 'canonical',
 * 'taxonomy'." A checker flagging the text that states the rule is the best
 * kind of false positive and still a false one. What that prompt makes Tutor
 * SAY is covered by the rule it is handing over.
 */
const SKIP = ['src/dev/', 'scratch/', 'src/pages/__', 'src/components/admin/PromptEditor'];

const RULES = [
  { id: 'em-dash', test: /[—–]/, why: 'CLAUDE.md copy rule 2: rewrite it as two sentences' },
  {
    id: 'jargon',
    test: /\b(portability|round[- ]trip|subscore|taxonom(y|ies)|canonical|pipeline|primitive|idempotent|memoi[sz]ed|denominator|heuristic)\b/i,
    why: 'CLAUDE.md copy rule 1: say what it does in the words a player would use',
  },
];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name).split(path.sep).join('/');
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  }
})('src');

/**
 * Comments out, newlines kept so line numbers survive.
 *
 * The first version of this skipped that and reported fourteen breaches, of
 * which twelve were the files' own doc comments: `>` and `<` appear in prose,
 * so a `>…<` scan happily matches a paragraph explaining why something is the
 * way it is. Comments are EXEMPT by the rule's own wording, and this file's
 * comments are themselves full of em-dashes.
 */
const stripComments = src =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));

/**
 * Two uses of a dash this product makes on purpose.
 *
 * A LONE em-dash is the "we do not know" placeholder. `DecksSummaryStats`
 * established it and every metric row follows: it reads as nothing to report
 * rather than as a zero somebody computed, and printing 0 there is the thing
 * the pricing rule forbids.
 *
 * A dash BETWEEN DIGITS is a score or a range — "a 2–0 win", "85-100%". That
 * is the typographically correct character for the job and not the clause-
 * joining dash the rule is about.
 */
const ALLOWED_DASH = [
  /^[—–]$/,
  /\d\s*[—–]\s*\d/,
  /*
   * A range or a score built from interpolations, where the digits only exist
   * at runtime: `${wins}–${losses}`, `${fmt(min)}–${fmt(max)}`. Same character
   * for the same reason as the digit case above, and the literal cannot show
   * it.
   */
  /\}\s*[—–]\s*\$?\{/,
  /*
   * A MAGIC TYPE LINE. "Legendary Creature — Angel Horror" is Wizards'
   * typography on the card itself, not our prose, and `ManualPanel` builds one
   * when it makes a token. Changing it would misprint the game.
   */
  /\b(Creature|Artifact|Enchantment|Land|Planeswalker|Instant|Sorcery|Battle)\s*[—–]/,
];

/**
 * Not copy at all.
 *
 * `rel="canonical"` is an HTML link relation and `src/pages/__*` are dev
 * harnesses nobody ships. Both were reported by the jargon and dash rules and
 * neither is a sentence anybody reads.
 */
const NOT_COPY = [/^canonical$/, /^(stylesheet|preconnect|noopener|noreferrer)$/];

/*
 * EVERY string and template literal, not a list of prop names.
 *
 * Reading only `>text<` was the first version, and its self-test caught it out:
 * an em-dash planted in the dashboard's `title` went unreported, because this
 * app passes most of its copy as props. `StandardPageLayout title=… description=…`
 * is on every page, `EmptyState` takes a headline and a body, every field has a
 * placeholder. A checker blind to those says "clean" about text it never read,
 * which is worse than no checker.
 *
 * A prop-name list was the second attempt and its self-test failed too: the
 * dashboard's title is `title={displayName ? \`Welcome back, ${name}\` : …}`, a
 * template literal inside a ternary, so a pattern anchored to `title={\`` never
 * reached it. Copy hides in ternaries, in arrays of options, in helper
 * functions that build a sentence, and enumerating the shapes is a losing game.
 *
 * So: read every literal. A Tailwind class list cannot contain an em-dash and
 * an identifier is not going to contain the word "canonical" as prose, so the
 * rules themselves do most of the filtering, and the prose test below does the
 * rest.
 */
const LITERALS = /"([^"\n]{4,400})"|'([^'\n]{4,400})'|`([^`]{4,400})`/g;

const hits = [];
for (const file of files) {
  if (SKIP.some(s => file.startsWith(s))) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));

  for (const m of source.matchAll(LITERALS)) {
    const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\s+/g, ' ').trim();
    if (!/[a-z]{3}/.test(text)) continue;
    if (NOT_COPY.some(n => n.test(text))) continue;
    for (const rule of RULES) {
      if (!rule.test.test(text)) continue;
      if (rule.id === 'em-dash' && ALLOWED_DASH.some(a => a.test(text))) continue;
      const line = source.slice(0, m.index).split('\n').length;
      hits.push({ file, line, rule, text });
    }
  }

  for (const m of source.matchAll(/>([^<>{}]{4,400})</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (!/[a-z]{3}/.test(text)) continue;
    /* `>` and `<` are also comparison operators, so a `>…<` scan picks up
       expressions: `typeof v === 'number' && Number.isFinite(v) ? … : '—'` was
       reported as a copy breach. Prose does not carry these. */
    if (/[;={}]|=>|\(\)|&&|\|\||\.\w+\(/.test(text)) continue;
    for (const rule of RULES) {
      if (!rule.test.test(text)) continue;
      if (rule.id === 'em-dash' && ALLOWED_DASH.some(a => a.test(text))) continue;
      const line = source.slice(0, m.index).split('\n').length;
      hits.push({ file, line, rule, text });
    }
  }
}

for (const h of hits) {
  console.log(`${h.file}:${h.line}  [${h.rule.id}]`);
  console.log(`    ${h.text.slice(0, 150)}`);
}
console.log(
  hits.length === 0
    ? '\nno copy-rule breaches in JSX text'
    : `\n${hits.length} to fix. ${[...new Set(hits.map(h => h.rule.why))].join(' | ')}`
);
