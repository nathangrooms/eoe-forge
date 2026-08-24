#!/usr/bin/env node
/**
 * WHERE THE COMPILER AND THE PORT BOTH SPEAK, AND SAY DIFFERENT THINGS.
 *
 * `CLAUDE.md`'s standing position is that the printed card wins and the
 * disagreement gets RECORDED rather than silently resolved. Until now nothing
 * recorded it. The precedence rule picks one source per card and the loser's
 * answer is discarded inside `compileWithTrace`, so a card where the two
 * sources describe different behaviour looked exactly like a card where they
 * agree. This script is the missing instrument.
 *
 * ## What it compares
 *
 * Every card in the paper pool where BOTH sources produce at least one ability:
 * the oracle-text compiler's own reading (taken with the second source off, so
 * it is never the port's answer wearing the compiler's name) and the ported
 * XMage record from `lowered.generated.ts`. It does not matter which one the
 * precedence rule picked; the comparison is of the two answers, not of the
 * decision.
 *
 * ## What a difference is, and what it is not
 *
 * Two records are not compared as text. `Ability.text` on a ported record is
 * the whole front face by construction, so a text diff would report every
 * multi-ability card as different and mean nothing. The comparison is over
 * SEVEN structural facts, each chosen because a disagreement in it changes what
 * a player sees:
 *
 *   D-KIND     the multiset of ability kinds
 *   D-KEYWORD  the set of keywords
 *   D-TRIGGER  the set of trigger event kinds
 *   D-VERB     the set of effect verbs, `Effect.do`, at any depth
 *   D-TIMING   whether an activation carries a timing restriction
 *   D-COND     whether an ability carries a condition or intervening if
 *   D-BOOST    the multiset of power/toughness deltas on static modifications
 *
 * Each difference is recorded with a DIRECTION: `port-only` when the port
 * carries something the compiler does not, `compiler-only` for the reverse.
 * Direction is the whole point. A port-only clause is the port claiming more
 * than the printed text was read to say, which is the failure mode the project
 * law calls worse than a refusal; a compiler-only clause is the port dropping
 * something the printed card has, which is the failure mode of PORT-PRIMARY
 * section 5's D2, D4 and D5.
 *
 * Neither direction is a verdict on its own. The two sources model the same
 * card in different vocabularies and some differences are vocabulary. That is
 * why every row carries the card name and the exact tokens on both sides, so a
 * hand check can start from the census instead of from a list of names.
 *
 * ## Attribution and licence
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied: they carry Wizards of the Coast rules text, so card wording comes
 * from Scryfall. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run:
 *   node --experimental-strip-types scripts/xmage/port-disagreement-census.mjs
 *
 * Writes scratch/port-disagreement-census.json holding every disagreeing card, its
 * difference kinds and the tokens on each side.
 */

import { createReadStream, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';
import { effectsOf } from '../../src/lib/cards/abilities/dsl.ts';
import { XMAGE_LOWERED } from '../../src/lib/cards/xmage/lowered.generated.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const VERDICTS = join(ROOT, 'scratch', 'verify-card-verdicts.json');
const OUT = join(ROOT, 'scratch', 'port-disagreement-census.json');

if (process.env.DM_XMAGE_OFF !== '1') {
  console.error('Run with DM_XMAGE_OFF=1. The compiler side of this comparison must be');
  console.error('the compiler\'s OWN answer, and with the second source live it is not:');
  console.error('compileWithTrace returns the port\'s abilities on every swapped card, so');
  console.error('1,881 cards would be compared against themselves and report zero.');
  process.exit(1);
}

const verdicts = existsSync(VERDICTS)
  ? new Map(JSON.parse(readFileSync(VERDICTS, 'utf8')).cards.map((r) => [r.o, r]))
  : new Map();

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

/* ------------------------------------------------------------------ *
 * The seven facts, read off an ability list
 * ------------------------------------------------------------------ */

/** Every `Effect.do` in the tree, including inside control-flow effects. */
function verbsIn(effects, out = []) {
  for (const e of effects ?? []) {
    if (!e || typeof e !== 'object') continue;
    out.push(e.do);
    if (e.do === 'if') { verbsIn(e.then, out); verbsIn(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') verbsIn(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes ?? []) verbsIn(m.effects, out);
    else if (e.do === 'additional') verbsIn(e.effects, out);
  }
  return out;
}

/**
 * The power and toughness deltas every `pt-modify` layer applies, as tokens.
 *
 * `ValueExpr` is a whole little language, so the token is its JSON. That is
 * exact rather than pretty: two boosts are the same token only if they are the
 * same expression, which is the right bar for a census whose job is to notice
 * that Wayward Angel carried +3/+3 four times where the card prints it once.
 */
function boostsIn(abilities) {
  const out = [];
  for (const a of abilities) {
    if (a.kind !== 'static') continue;
    for (const m of a.modifications ?? []) {
      if (!m || typeof m !== 'object') continue;
      if (m.layer === 'pt-modify' || m.layer === 'pt-set') {
        out.push(`${m.layer} ${JSON.stringify(m.power ?? null)}/${JSON.stringify(m.toughness ?? null)}`);
      }
    }
  }
  return out;
}

function factsOf(abilities) {
  const kinds = [];
  const keywords = new Set();
  const triggers = new Set();
  const verbs = new Set();
  let timings = 0;
  let conditions = 0;

  for (const a of abilities) {
    kinds.push(a.kind);
    if (a.kind === 'keyword') keywords.add(String(a.keyword ?? '?').toLowerCase());
    // A trigger's event is `{on: ...}`. Only the event NAME is compared: the
    // selector inside it is a second vocabulary and comparing those would
    // report a difference on every card, which is a diff nobody can act on.
    if ((a.kind === 'triggered' || a.kind === 'replacement') && a.event) triggers.add(String(a.event.on));
    for (const v of verbsIn(effectsOf(a))) verbs.add(v);
    if (a.kind === 'activated' && a.timing) timings++;
    if (a.condition || a.interveningIf) conditions++;
    // A granted keyword is the same claim as a printed one as far as a player
    // is concerned, so `{layer:'ability', grant:[...]}` joins the keyword set.
    if (a.kind === 'static') {
      for (const m of a.modifications ?? []) {
        if (m && m.layer === 'ability') for (const g of m.grant ?? []) keywords.add(String(g).toLowerCase());
      }
    }
  }

  kinds.sort();
  return {
    kinds,
    keywords: [...keywords].sort(),
    triggers: [...triggers].sort(),
    verbs: [...verbs].sort(),
    timings,
    conditions,
    boosts: boostsIn(abilities).sort(),
  };
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const only = (a, b) => a.filter((x) => !b.includes(x));

/* ------------------------------------------------------------------ */

let pool = 0;
let bothSpeak = 0;
let identical = 0;
let disagree = 0;
let compilerRefusalOnly = 0;
let substantive = 0;
const byKind = new Map();
const byDirection = new Map();
const examples = new Map();
const tokenCounts = new Map();
const rowsOut = [];
/** Split by whether the shipped rule actually PICKED the port for this card. */
const disagreeBySource = new Map();

for await (const card of rows(SRC)) {
  if (NOT_A_CARD.has(card.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(card.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool++;

  const stored = XMAGE_LOWERED[card.oracle_id];
  if (!stored || !stored.length) continue;

  const trace = compileWithTrace(card);
  const mine = trace.result;
  if (mine.source !== 'compiler') {
    throw new Error(`DM_XMAGE_OFF=1 did not take effect: ${card.name} came back as ${mine.source}`);
  }
  if (!mine.abilities.length) continue;

  bothSpeak++;

  const c = factsOf(mine.abilities);
  const x = factsOf(stored);

  const diffs = [];
  const detail = {};

  if (!sameList(c.kinds, x.kinds)) {
    diffs.push('D-KIND');
    detail['D-KIND'] = { compiler: c.kinds.join(','), port: x.kinds.join(',') };
  }
  for (const [tag, key] of [['D-KEYWORD', 'keywords'], ['D-TRIGGER', 'triggers'], ['D-VERB', 'verbs']]) {
    const po = only(x[key], c[key]);
    const co = only(c[key], x[key]);
    if (!po.length && !co.length) continue;
    diffs.push(tag);
    detail[tag] = { portOnly: po, compilerOnly: co };
    for (const t of po) bump(tokenCounts, `${tag} port-only ${t}`);
    for (const t of co) bump(tokenCounts, `${tag} compiler-only ${t}`);
    bump(byDirection, `${tag} ${po.length && co.length ? 'both ways' : po.length ? 'port claims more' : 'port claims less'}`);
  }
  if (c.timings !== x.timings) {
    diffs.push('D-TIMING');
    detail['D-TIMING'] = { compiler: c.timings, port: x.timings };
    bump(byDirection, `D-TIMING ${x.timings > c.timings ? 'port claims more' : 'port claims less'}`);
  }
  if (c.conditions !== x.conditions) {
    diffs.push('D-COND');
    detail['D-COND'] = { compiler: c.conditions, port: x.conditions };
    bump(byDirection, `D-COND ${x.conditions > c.conditions ? 'port claims more' : 'port claims less'}`);
  }
  if (!sameList(c.boosts, x.boosts)) {
    diffs.push('D-BOOST');
    detail['D-BOOST'] = { compiler: c.boosts.join(','), port: x.boosts.join(',') };
  }

  if (!diffs.length) { identical++; continue; }
  disagree++;

  /*
   * NOT EVERY DIFFERENCE IS A DISAGREEMENT, and this is the one exception worth
   * carving out by name.
   *
   * `{do:'manual'}` is the compiler's word for "a human has to do this". A card
   * where the compiler's only extra verb is `manual` is not a card where the two
   * sources describe different behaviour; it is a card where one source declined
   * to describe the behaviour at all. Counting those as disagreements would
   * inflate the rate with the compiler's own refusals, and it is the single
   * largest token in the table: 856 cards carry compiler-only `manual`.
   *
   * So the census reports two numbers. The gross rate is every structural
   * difference. `substantive` is the gross rate minus the cards whose ONLY
   * difference is a compiler refusal, and it is the one an accuracy phase should
   * work from.
   */
  const verbDetail = detail['D-VERB'];
  const onlyDifferenceIsARefusal =
    diffs.length === 1 &&
    diffs[0] === 'D-VERB' &&
    verbDetail &&
    verbDetail.portOnly.length === 0 &&
    verbDetail.compilerOnly.length > 0 &&
    verbDetail.compilerOnly.every((v) => v === 'manual');
  if (onlyDifferenceIsARefusal) compilerRefusalOnly++;
  else substantive++;

  for (const d of diffs) {
    bump(byKind, d);
    const ex = examples.get(d) ?? [];
    if (ex.length < 10) { ex.push(card.name); examples.set(d, ex); }
  }
  const v = verdicts.get(card.oracle_id);
  bump(disagreeBySource, v ? `${v.s} spoke, verdict ${v.v}` : 'no verdict row');

  rowsOut.push({
    o: card.oracle_id,
    n: card.name,
    diffs,
    detail,
    shippedSource: v?.s ?? null,
    shippedVerdict: v?.v ?? null,
    onlyACompilerRefusal: onlyDifferenceIsARefusal,
  });
}

const L = (n, label) => console.log(String(n).padStart(7), label);

console.log('paper pool', pool);
console.log('');
L(bothSpeak, 'cards where the compiler AND the port both produce at least one ability');
L(identical, `identical on all seven facts   ${pct(identical, bothSpeak)}%`);
L(disagree, `THEY DIFFER, gross             ${pct(disagree, bothSpeak)}%`);
L(compilerRefusalOnly, `  of which the only difference is a {do:'manual'} the compiler emitted`);
L(substantive, `SUBSTANTIVE DISAGREEMENTS      ${pct(substantive, bothSpeak)}% of the cards both speak for`);
console.log('');
console.log('BY DIFFERENCE KIND (a card can carry several)');
for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  L(n, `${k}  ${pct(n, bothSpeak)}% of the cards both speak for`);
}
console.log('');
console.log('BY DIRECTION');
for (const [k, n] of [...byDirection.entries()].sort((a, b) => b[1] - a[1])) L(n, k);
console.log('');
console.log('WHICH SOURCE THE SHIPPED RULE PICKED ON A DISAGREEING CARD');
for (const [k, n] of [...disagreeBySource.entries()].sort((a, b) => b[1] - a[1])) L(n, k);
console.log('');
console.log('TOP INDIVIDUAL TOKENS IN DISPUTE');
for (const [k, n] of [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) L(n, k);
console.log('');
for (const [k, ex] of examples) console.log(`  ${k}: ${ex.join(', ')}`);

writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  pool,
  bothSpeak,
  identical,
  disagree,
  compilerRefusalOnly,
  substantive,
  byKind: Object.fromEntries(byKind),
  byDirection: Object.fromEntries(byDirection),
  disagreeBySource: Object.fromEntries(disagreeBySource),
  tokenCounts: Object.fromEntries([...tokenCounts.entries()].sort((a, b) => b[1] - a[1])),
  cards: rowsOut,
}));
console.log('');
console.log('wrote', OUT, `(${rowsOut.length} disagreeing cards)`);
