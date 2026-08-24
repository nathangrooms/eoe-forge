#!/usr/bin/env node
/**
 * How far do the hand check's defects reach?
 *
 * A hand check of 30 cards says a defect EXISTS. It does not say how many cards
 * carry it, and "we found a bug in a sample of 30" is not a number anybody can
 * plan against. So each defect the hand check named is turned into a predicate
 * that can be asked of every card the port speaks for, and of every card the
 * port holds a record for, and both counts are printed.
 *
 * Each predicate is written to be CONSERVATIVE: it fires only on a shape the
 * hand check actually confirmed, so these are floors and not estimates. Where a
 * predicate needs the printed card it reads Scryfall, never XMage.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored here. XMage display strings are never
 * copied. Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-primary-defect-census.mjs
 */

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../../src/lib/cards/abilities/compiler.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'port-primary-defect-census.json');

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
{
  const rl = createInterface({ input: createReadStream(SRC), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    if (NOT_A_CARD.has(c.layout)) continue;
    if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
    if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
    if (c.digital) continue;
    if (!(c.games ?? []).includes('paper')) continue;
    pool.push(c);
  }
}

const textOf = (c) =>
  String(c.oracle_text ?? (c.card_faces ?? []).map((f) => f.oracle_text ?? '').join('\n') ?? '');

/* ---------- the predicates, one per defect the hand check confirmed ---------- */

/** D1. Two or more IDENTICAL pt-modify entries on one static. Vigilant Sentry, Wayward Angel. */
function duplicatePtModify(abilities) {
  let worst = 0;
  for (const a of abilities) {
    if (a.kind !== 'static') continue;
    const counts = new Map();
    for (const m of a.modifications ?? []) {
      if (m.layer !== 'pt-modify') continue;
      const key = JSON.stringify([m.power, m.toughness]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const n of counts.values()) worst = Math.max(worst, n);
  }
  return worst;
}

/** D2. The card says "Activate only ..." and no activated ability carries a timing. */
function timingDropped(card, abilities) {
  if (!/\bActivate\b[^.]{0,60}\bonly\b/i.test(textOf(card))) return false;
  const activated = abilities.filter((a) => a.kind === 'activated');
  if (activated.length === 0) return false;
  return activated.every((a) => a.timing === undefined && a.activeZones === undefined ? true : a.timing === undefined);
}

/** D3. A cost is paid FROM the graveyard and the ability declares no active zone. */
function graveyardWithoutZone(abilities) {
  return abilities.some(
    (a) =>
      a.kind === 'activated' &&
      (a.costs ?? []).some((c) => c.from === 'graveyard') &&
      a.activeZones === undefined
  );
}

/** D4. An intervening-if on a trigger, dropped: the card says "if" and no condition survived. */
function interveningIfDropped(card, abilities) {
  const text = textOf(card);
  if (!/^(At the beginning of|When|Whenever)[^.]*, if /im.test(text)) return false;
  const triggered = abilities.filter((a) => a.kind === 'triggered');
  if (triggered.length === 0) return false;
  return triggered.every((a) => a.condition === undefined);
}

/** D5. A cost reduction with a printed condition and no condition on the static. */
function costConditionDropped(card, abilities) {
  const text = textOf(card);
  if (!/costs? \{[^}]+\} less to cast if\b/i.test(text)) return false;
  const statics = abilities.filter(
    (a) => a.kind === 'static' && (a.modifications ?? []).some((m) => m.layer === 'cost-modify')
  );
  if (statics.length === 0) return false;
  return statics.every((a) => a.condition === undefined);
}

const D = {
  'D1 two or more identical pt-modify entries on one static': duplicatePtModify,
  'D2 the card says "Activate only" and no timing survived': timingDropped,
  'D3 a cost paid from the graveyard with no active zone declared': graveyardWithoutZone,
  'D4 a printed intervening-if that no condition survived': interveningIfDropped,
  'D5 a conditional cost reduction that became unconditional': costConditionDropped,
};

const counts = { xmage: {}, compiler: {} };
for (const k of Object.keys(D)) { counts.xmage[k] = 0; counts.compiler[k] = 0; }
const examples = {};
for (const k of Object.keys(D)) examples[k] = [];

let xmageCards = 0;
let compilerCards = 0;
let worstMultiplier = { name: null, times: 0 };

for (const card of pool) {
  const r = compileWithTrace(card).result;
  const bucket = r.source === 'xmage' ? 'xmage' : 'compiler';
  if (bucket === 'xmage') xmageCards++; else compilerCards++;

  const dup = duplicatePtModify(r.abilities);
  if (dup > 1) {
    counts[bucket]['D1 two or more identical pt-modify entries on one static']++;
    if (bucket === 'xmage') {
      if (examples['D1 two or more identical pt-modify entries on one static'].length < 12) {
        examples['D1 two or more identical pt-modify entries on one static'].push(`${card.name} (x${dup})`);
      }
      if (dup > worstMultiplier.times) worstMultiplier = { name: card.name, times: dup };
    }
  }

  for (const [label, fn] of Object.entries(D)) {
    if (label.startsWith('D1')) continue;
    const hit = fn.length === 2 ? fn(card, r.abilities) : fn(r.abilities);
    if (!hit) continue;
    counts[bucket][label]++;
    if (bucket === 'xmage' && examples[label].length < 12) examples[label].push(card.name);
  }
}

const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
console.log('cards the port speaks for:', xmageCards, '   cards the compiler speaks for:', compilerCards);
console.log('');
console.log('defect'.padEnd(60), 'port'.padStart(6), 'share'.padStart(7), 'compiler'.padStart(9));
for (const label of Object.keys(D)) {
  console.log(
    label.padEnd(60),
    String(counts.xmage[label]).padStart(6),
    (pct(counts.xmage[label], xmageCards) + '%').padStart(7),
    String(counts.compiler[label]).padStart(9)
  );
}
console.log('');
console.log('worst D1 multiplier on a card the port speaks for:', worstMultiplier.name, 'x' + worstMultiplier.times);
console.log('');
for (const [label, names] of Object.entries(examples)) {
  if (!names.length) continue;
  console.log(label);
  console.log('   ', names.join(', '));
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), xmageCards, compilerCards, counts, examples, worstMultiplier }, null, 1));
console.log('');
console.log('wrote', OUT);
