/**
 * Does the engine actually READ commanders, or only the ones we happen to test?
 *
 * The owner, 31 Aug 2026, after finding that Syr Vondam's "or is put into
 * exile" was never read: *"if the engine didnt read that, then I am concerned
 * it doesnt ready any of the commanders properly"*.
 *
 * That is the right worry and it cannot be answered by trying three more
 * commanders by hand. This walks EVERY commander-legal legend in the catalogue
 * and reports, for each one, where its plan came from:
 *
 *   compiled   the ability compiler produced facets and PLAN_RULES read them.
 *              The strong case: a parsed record, not English.
 *   intent     the record was silent or thin, so the 113 English intent rules
 *              spoke. Weaker, and honest about being weaker.
 *   floor      nothing was readable and the last-resort reading fired.
 *   silent     no wants at all. The engine has nothing to say about this card.
 *
 * It also reports COVERAGE OF THE CARD'S OWN TEXT: how many of the commander's
 * rules-text lines produced no want from any source. That is the Syr Vondam
 * measurement generalised, and it is the number that matters, because a plan
 * can look healthy while half the card was skipped.
 *
 *   node scripts/commander-read-audit.mjs            all of them
 *   node scripts/commander-read-audit.mjs 400        the 400 most played
 *   SHOW=1 node scripts/commander-read-audit.mjs 60  and name the silent ones
 *
 * Reads the live catalogue with the anon key, which is client-visible by
 * design. It writes nothing.
 */
import { readFileSync } from 'node:fs';

const KEY = readFileSync(new URL('../scratch/anon.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://udnaflcohfyljrsgqggy.supabase.co/rest/v1';
const LIMIT = Number(process.argv[2] || 0);
const SHOW = process.env.SHOW === '1';

const { planForCommander } = await import(new URL('../src/engine/knowledge/behaviour.ts', import.meta.url).href);
const { facetsForCard } = await import(new URL('../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

/*
 * `type_line=like.Legendary%` and NOT `ilike.*Legendary Creature*`.
 *
 * A leading wildcard cannot use a btree index, and CLAUDE.md records that same
 * query timing out at 57014 partway through, which is how an earlier pass
 * measured 500 commanders and called it all of them. Anchored at the start it
 * is an index range scan. Backgrounds and Vehicles that can be commanders are
 * caught by the type check in JS below rather than by a second query.
 */
async function fetchAll() {
  const rows = [];
  let after = '';
  for (;;) {
    const url =
      `${BASE}/cards_unique?select=id,name,type_line,oracle_text,keywords,mana_cost,cmc,faces,tags,edhrec_rank` +
      `&type_line=like.Legendary*&order=id.asc&limit=200` +
      (after ? `&id=gt.${after}` : '');
    const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    if (!page.length) break;
    rows.push(...page);
    after = page[page.length - 1].id;
    process.stderr.write(`\r  fetched ${rows.length}`);
  }
  process.stderr.write('\n');
  return rows;
}

/** A card that can sit in the command zone, near enough for this measurement. */
const isCommander = card => {
  const t = (card.type_line || '').toLowerCase();
  return t.startsWith('legendary') && (t.includes('creature') || t.includes('background'));
};

/**
 * The lines of rules text that are a real ability.
 *
 * Reminder text in brackets, flavour words and bare keyword lines are dropped:
 * a keyword line IS read by the engine, through `kw:` facets, so counting it as
 * unread would understate coverage.
 */
const abilityLines = card => {
  const text = [card.oracle_text || '', ...(card.faces || []).map(f => f?.oracle_text || '')]
    .filter(Boolean)
    .join('\n');
  return text
    .split('\n')
    .map(l => l.replace(/\([^)]*\)/g, '').trim())
    .filter(l => l.length > 12);
};

const rows = (await fetchAll()).filter(isCommander);
const ranked = rows.slice().sort((a, b) => (a.edhrec_rank ?? 1e9) - (b.edhrec_rank ?? 1e9));
const cards = LIMIT ? ranked.slice(0, LIMIT) : ranked;

/*
 * THE WEAK MEASUREMENT AND THE STRONG ONE, both reported, because the weak one
 * is what made this look healthy for months.
 *
 * Weak: does the commander get a plan with wants? Syr Vondam scored eleven
 * wants while half his trigger went unread, so a plan existing proves nothing.
 *
 * Strong: did the COMPILER consume every clause of the card. `coverage` is the
 * compiler's own verdict and it is the only thing here that is not an
 * inference. `rec:full` means every paragraph was consumed; it does NOT mean
 * the reading was correct, and the two must never be quoted as one number.
 *
 * And the strongest available: for each ability line, does that line ON ITS OWN
 * produce a facet the type line did not already give. A line that produces
 * nothing was not read, whatever the whole-card verdict said. That is the Syr
 * Vondam defect stated as a number.
 */
const coverageCount = new Map();
const sourceCount = new Map();
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

let planless = 0;
let wantTotal = 0;
let lineTotal = 0;
let lineUnread = 0;
const worst = [];
const unreadShapes = new Map();

/** The facets a card's TYPE LINE alone gives, so a clause is credited only for what it adds. */
const typeOnlyFacets = card =>
  new Set(facetsForCard({ name: card.name, type_line: card.type_line, oracle_text: '' }).facets);

for (const card of cards) {
  const whole = facetsForCard({
    name: card.name,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    keywords: card.keywords,
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    faces: card.faces,
  });
  bump(coverageCount, whole.coverage);
  bump(sourceCount, whole.source);

  const plan = planForCommander({
    name: card.name,
    typeLine: card.type_line,
    facets: whole.facets,
    tags: card.tags,
    oracleText: card.oracle_text,
    faces: card.faces,
  });
  wantTotal += plan.wants.length;
  if (!plan.wants.length) planless++;

  const base = typeOnlyFacets(card);
  const lines = abilityLines(card);
  let unread = 0;
  for (const line of lines) {
    const only = facetsForCard({
      name: card.name,
      type_line: card.type_line,
      oracle_text: line,
      keywords: card.keywords,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
    }).facets;
    const added = only.filter(f => !base.has(f) && !f.startsWith('rec:'));
    if (!added.length) {
      unread++;
      bump(unreadShapes, shapeOf(line));
    }
  }
  lineTotal += lines.length;
  lineUnread += unread;
  if (lines.length && unread) worst.push({ card, unread, lines: lines.length });
}

/**
 * A clause reduced to its shape, so unread clauses can be COUNTED BY KIND
 * rather than listed one by one.
 *
 * Card names, numbers and mana symbols are what make two instances of the same
 * unread pattern look like two different problems. Stripping them is what turns
 * a list of 900 clauses into a ranked work list, which is the whole point:
 * the next compiler rule should be the one that unlocks the most commanders.
 */
function shapeOf(line) {
  return line
    .toLowerCase()
    .replace(/\{[^}]*\}/g, 'M')
    .replace(/[0-9]+/g, 'N')
    .replace(/[^a-z ,.N]/g, '')
    .split(/[,.]/)[0]
    .split(' ')
    .slice(0, 7)
    .join(' ')
    .trim();
}

const pct = (n, d = cards.length) => `${((n / d) * 100).toFixed(1)}%`;

console.log(`\ncommanders measured: ${cards.length}${LIMIT ? ` (top ${LIMIT} by play rate)` : ''}`);

console.log('\nTHE WEAK NUMBER, which is the one that looked fine:');
console.log(`  a plan with wants      ${cards.length - planless}  ${pct(cards.length - planless)}`);
console.log(`  mean wants per plan    ${(wantTotal / cards.length).toFixed(1)}`);

console.log('\nDID THE COMPILER CONSUME THE WHOLE CARD (its own verdict):');
for (const [k, v] of [...coverageCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(k).padEnd(14)} ${String(v).padStart(5)}  ${pct(v)}`);
}
console.log('  who spoke:');
for (const [k, v] of [...sourceCount].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(k).padEnd(12)} ${String(v).padStart(5)}  ${pct(v)}`);
}

console.log('\nTHE STRONG NUMBER, per ability line:');
console.log(`  ability lines          ${lineTotal}`);
console.log(`  lines that produced NOTHING  ${lineUnread}  ${pct(lineUnread, lineTotal)}`);
console.log(
  `  commanders with at least one unread line  ${worst.length}  ${pct(worst.length)}`
);

console.log('\nUNREAD CLAUSE SHAPES, most commanders first:');
for (const [shape, n] of [...unreadShapes].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  if (n < 3) continue;
  console.log(`  ${String(n).padStart(4)}  ${shape}`);
}

if (SHOW) {
  console.log('\nMOST UNREAD COMMANDERS, by how much of the card was skipped:');
  worst.sort((a, b) => b.unread / b.lines - a.unread / a.lines || (a.card.edhrec_rank ?? 1e9) - (b.card.edhrec_rank ?? 1e9));
  for (const w of worst.slice(0, 25)) {
    console.log(`  ${w.unread}/${w.lines}  rank ${w.card.edhrec_rank ?? '-'}  ${w.card.name}`);
    for (const line of abilityLines(w.card)) console.log(`         ${line.slice(0, 110)}`);
  }
}
