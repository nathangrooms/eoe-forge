/**
 * Is the dictionary complete for Magic? Answered against Wizards' own lists.
 *
 *   node --experimental-strip-types scripts/probe/dictionary-gap.mjs
 *   SHOW=80 ... list more of the missing
 *   REFRESH=1 ... refetch the catalogs from Scryfall
 *
 * The owner: *"the dictionary is 100000% complete for MTG, everything is
 * categorised and listed correctly"*.
 *
 * ## Why this is answerable at all
 *
 * Every previous version of this question was an opinion, because the
 * denominator was somebody's memory of what Magic contains. Scryfall publishes
 * the authoritative lists as machine-readable catalogs, and they are the same
 * lists Wizards maintains:
 *
 *     keyword-abilities   223     creature-types      350
 *     keyword-actions      79     planeswalker-types   99
 *     ability-words        69     artifact-types       20
 *     land-types           18     enchantment-types    13
 *     supertypes            7     spell-types           6
 *     battle-types          1
 *
 * 885 things Magic officially names. That is the denominator, it is not a
 * guess, and it GROWS ON ITS OWN when a set introduces a keyword, which is
 * exactly the automatic funnel this project keeps needing.
 *
 * ## What counts as "we read it"
 *
 * The engine emits a facet naming the thing, on at least one real card. Not
 * that a rule exists in a file; that the rule FIRES. A keyword with a rule
 * nobody's card matches is not read, and this asks the catalogue rather than
 * the source.
 *
 * Two honest caveats, stated because this number will be quoted:
 *
 *   - A keyword we emit `kw:` for is NAMED, not necessarily UNDERSTOOD. `kw:cycling`
 *     says the card cycles; it does not say the engine can pay the cost and draw
 *     the card. Naming is what deck building needs and it is a real rung on the
 *     ladder, but it is not the top one.
 *   - Some catalog entries appear on no card in our catalogue at all (Un-set and
 *     Alchemy vocabulary, mostly). Those are reported separately, because a
 *     keyword no card prints is not a gap in the engine.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import process from 'node:process';

const DIR = new URL('../../scratch/scryfall-catalogs/', import.meta.url);
const SHOW = Number(process.env.SHOW || 40);

const CATALOGS = [
  { kind: 'keyword-abilities', prefix: 'kw:', label: 'Keyword abilities' },
  { kind: 'keyword-actions', prefix: 'eff:', label: 'Keyword actions' },
  { kind: 'ability-words', prefix: 'kw:', label: 'Ability words' },
  { kind: 'creature-types', prefix: 'sub:', label: 'Creature types' },
  { kind: 'land-types', prefix: 'sub:', label: 'Land types' },
  { kind: 'artifact-types', prefix: 'sub:', label: 'Artifact types' },
  { kind: 'enchantment-types', prefix: 'sub:', label: 'Enchantment types' },
  { kind: 'spell-types', prefix: 'sub:', label: 'Spell types' },
  { kind: 'planeswalker-types', prefix: 'sub:', label: 'Planeswalker types' },
  { kind: 'supertypes', prefix: 'type:', label: 'Supertypes' },
  { kind: 'battle-types', prefix: 'sub:', label: 'Battle types' },
];

mkdirSync(DIR, { recursive: true });

async function catalog(kind) {
  const file = new URL(`${kind}.json`, DIR);
  if (!process.env.REFRESH && existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8')).data ?? [];
  }
  const res = await fetch(`https://api.scryfall.com/catalog/${kind}`, {
    headers: { 'User-Agent': 'DeckMatrix/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${kind}: ${res.status}`);
  const body = await res.json();
  writeFileSync(file, JSON.stringify(body));
  await new Promise(r => setTimeout(r, 120));
  return body.data ?? [];
}

const cards = JSON.parse(
  readFileSync(new URL('../../scratch/catalogue-cache.json', import.meta.url), 'utf8')
);
const beh = await import(new URL('../../src/lib/deck/recommend/behaviour.ts', import.meta.url).href);

process.stderr.write(`  reading ${cards.length} cards\n`);

/** Every facet the engine emits anywhere, and how many cards carry it. */
const emitted = new Map();
/** Lowercased oracle text and type lines, so "does any card print this" is answerable. */
const corpus = [];

for (const c of cards) {
  const text = `${c.oracle_text ?? ''} ${c.type_line ?? ''} ${(c.keywords ?? []).join(' ')}`.toLowerCase();
  corpus.push(text);
  if (!c.oracle_text && !c.type_line) continue;
  let r;
  try {
    r = beh.facetsForCard(c);
  } catch {
    continue;
  }
  for (const f of r.facets) emitted.set(f, (emitted.get(f) ?? 0) + 1);
}

/*
 * HOW A FACET IS SPELLED DEPENDS ON ITS PREFIX, and getting that wrong reported
 * 79 keywords as missing that the engine reads perfectly well.
 *
 * The first run of this hyphenated everything, so it looked for
 * `kw:first-strike` while the engine emits `kw:first strike` WITH A SPACE, and
 * duly reported First strike (794 cards) and Double strike (296) as gaps. Three
 * of the four instrument failures CLAUDE.md records made the product look worse
 * than it is; this was the fifth, caught only because 794 cards of first strike
 * being unread was too large to believe.
 *
 * `kw:`, `sub:` and `type:` keep the printed spacing, lowercased.
 * `eff:` is a DSL verb and those are hyphenated.
 */
const slugKeepSpaces = s =>
  /* Apostrophes are KEPT and normalised to ASCII, because the engine keeps
     them: it emits `kw:doctor's companion`, `sub:urza's`, `sub:c'tan` and
     `sub:shi'ar`. Stripping them here reported all four as unread. */
  String(s).toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();

const slug = s =>
  String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/*
 * A KEYWORD ACTION IS NOT SPELLED THE WAY OUR VERB IS, and pretending otherwise
 * would report the whole list as missing. These are the ones where Magic's word
 * and the DSL's verb genuinely differ; everything else is compared by slug.
 * A blank means the engine has no verb for it, which is the finding.
 */
const ACTION_ALIAS = {
  destroy: 'destroy', exile: 'exile', counter: 'counter', draw: 'draw',
  discard: 'discard', mill: 'mill', sacrifice: 'sacrifice', scry: 'scry',
  surveil: 'surveil', search: 'search-library', shuffle: 'shuffle',
  tap: 'tap', untap: 'untap', create: 'create-token', attach: 'attach',
  proliferate: 'proliferate', 'gain-control': 'gain-control',
  fight: 'fight', investigate: 'investigate', populate: 'populate',
  explore: 'explore', connive: 'connive', goad: 'goad', amass: 'amass',
  adapt: 'adapt', bolster: 'bolster', support: 'support', monstrosity: 'monstrosity',
  transform: 'transform', regenerate: 'regenerate', 'double': 'multiply',
  exchange: 'exchange', reveal: 'reveal', vote: 'vote', clash: 'clash',
  detain: 'detain', manifest: 'manifest', meld: 'meld', exert: 'exert',
  fateseal: 'fateseal', learn: 'learn', venture: 'venture', incubate: 'incubate',
  discover: 'discover', cloak: 'cloak', forage: 'forage', endure: 'endure',
  saddle: 'saddle', exhaust: 'exhaust', suspect: 'suspect', 'time-travel': 'time-travel',
  'collect-evidence': 'collect-evidence', 'manifest-dread': 'manifest-dread',
};

const report = [];

for (const { kind, prefix, label } of CATALOGS) {
  const values = await catalog(kind);
  const rows = values.map(v => {
    /*
     * ANY PREFIX COUNTS, because a word can arrive by more than one road and
     * asking about only one of them measures the probe rather than the engine.
     *
     * Army, Servo, Scion and Germ are CREATURE TYPES that appear almost only on
     * TOKENS, so the engine says `tok:servo` and never `sub:servo` — no card in
     * the catalogue has Servo on its type line. Same for Blood, Gold, Map, Junk
     * and Incubator among artifact types, and Role among enchantment types.
     * Checking `sub:` alone reported all of them as unread while the engine was
     * naming them perfectly well.
     *
     * Treasure and Food are listed by Scryfall as keyword ACTIONS ("create a
     * Treasure token") and the engine records them as `tok:treasure`. Same
     * word, same knowledge, different road.
     *
     * The question this file exists to answer is "does the engine have a word
     * for this thing", so the check is over every prefix that could carry it.
     */
    const bare = slugKeepSpaces(v);
    const hyphen = slug(v);
    const candidates =
      kind === 'keyword-actions'
        ? [`eff:${ACTION_ALIAS[hyphen] ?? hyphen}`, `eff:${bare}`, `tok:${bare}`, `trig:${hyphen}`, `kw:${bare}`]
        : [`${prefix}${bare}`, `tok:${bare}`, `kw:${bare}`, `type:${bare}`, `cares:sub:${bare}`];
    const facet = candidates.find(f => (emitted.get(f) ?? 0) > 0) ?? candidates[0];
    const cardsWithFacet = emitted.get(facet) ?? 0;
    /* Does ANY card print it at all? A keyword no card in our catalogue uses is
       not a gap in the engine, it is vocabulary Magic has and we do not stock. */
    const needle = String(v).toLowerCase().replace(/[’']/g, "'");
    const printed = cardsWithFacet > 0 ? cardsWithFacet : corpus.filter(t => t.includes(needle)).length;
    return { value: v, facet, cardsWithFacet, printed };
  });

  const onNoCard = rows.filter(r => r.printed === 0);
  const read = rows.filter(r => r.cardsWithFacet > 0);
  const missing = rows.filter(r => r.cardsWithFacet === 0 && r.printed > 0);
  report.push({ kind, label, total: rows.length, read: read.length, missing, onNoCard: onNoCard.length, rows });
}

const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-');

console.log(`\nDOES THE DICTIONARY COVER MAGIC?  Denominator: Scryfall's own catalogs.\n`);
console.log(
  `  ${'group'.padEnd(22)}${'in Magic'.padStart(9)}${'we read'.padStart(9)}${'missing'.padStart(9)}${'on no card'.padStart(11)}   share`
);
let T = 0, R = 0, M = 0, N = 0;
for (const g of report) {
  T += g.total; R += g.read; M += g.missing.length; N += g.onNoCard;
  console.log(
    `  ${g.label.padEnd(22)}${String(g.total).padStart(9)}${String(g.read).padStart(9)}` +
      `${String(g.missing.length).padStart(9)}${String(g.onNoCard).padStart(11)}   ${pct(g.read, g.total - g.onNoCard)}`
  );
}
console.log(
  `  ${'TOTAL'.padEnd(22)}${String(T).padStart(9)}${String(R).padStart(9)}${String(M).padStart(9)}${String(N).padStart(11)}   ${pct(R, T - N)}`
);
console.log(`\n  "share" excludes vocabulary no card in our catalogue prints.`);

for (const g of report) {
  if (g.missing.length === 0) continue;
  console.log(`\n${g.label.toUpperCase()} WE DO NOT READ, most printed first:\n`);
  for (const r of g.missing.sort((a, b) => b.printed - a.printed).slice(0, SHOW)) {
    console.log(`  ${String(r.printed).padStart(5)} cards   ${String(r.value).padEnd(28)} would be ${r.facet}`);
  }
  if (g.missing.length > SHOW) console.log(`  ... and ${g.missing.length - SHOW} more`);
}

writeFileSync(
  new URL('../../scratch/dictionary-gap.json', import.meta.url),
  JSON.stringify(
    { measuredAt: 'see git', totals: { T, R, M, N }, groups: report.map(g => ({ ...g, rows: undefined })) },
    null,
    1
  )
);
console.log(`\nwrote scratch/dictionary-gap.json`);
