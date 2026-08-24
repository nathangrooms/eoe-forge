#!/usr/bin/env node
/**
 * ABILITY CLASSES THAT WRITE A RESTRICTION INTO THEIR OWN CONSTRUCTOR BODY,
 * where the record cannot see it and the port therefore drops it.
 *
 * This is the shape behind three separate defects already found by hand:
 *
 *   ExhaustAbility   sets `maxActivationsPerGame = 1` and a sorcery timing, so
 *                    Liliana the Repentant's exhaust ability was offered every
 *                    turn and at instant speed.
 *   ForecastAbility  sets Zone.HAND, `maxActivationsPerTurn = 1`, an upkeep
 *                    condition AND a reveal cost, so Steeling Stance's forecast
 *                    became "{W}: target creature gets +1/+1", any time, as
 *                    often as you like.
 *   PowerUpAbility   the same, already refused by name.
 *
 * The record holds a class NAME and its constructor ARGUMENTS. A field the Java
 * constructor sets from a literal is invisible to it, so the only way to know
 * is to read the class. This reads every ability class XMage has, reports the
 * ones that set a restriction in the body, and says for each whether the port
 * already reads it, refuses it, or drops it in silence.
 *
 * The XMage clone is read IN PLACE and nothing is copied out of it: only class
 * names and the names of the fields they assign appear below, never a line of
 * XMage's source and never one of its display strings. XMage is MIT licensed,
 * Copyright (c) 2010 betasteward@gmail.com, https://github.com/magefree/mage.
 * Forge is GPL-3.0 and was not fetched, read or referenced.
 *
 * Run: node --experimental-strip-types scripts/xmage/port-refute-class-restriction-census.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRecords } from './build-records.mjs';
import { lowerCard } from '../../src/lib/cards/xmage/index.ts';
import {
  ABILITY_RULES,
  ABILITY_COSTS,
  CASTING_ABILITY_CLASSES,
  REFUSED_ABILITY_CLASSES,
} from '../../src/lib/cards/xmage/lower.ts';
import { abilitiesOf } from '../../src/lib/cards/xmage/record.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CLONE = process.env.DM_XMAGE ?? 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';

const SHIPPED = (() => {
  const at = path.join(REPO, 'src', 'lib', 'cards', 'xmage', 'lowered.generated.ts');
  if (!existsSync(at)) return null;
  const src = readFileSync(at, 'utf8');
  const start = src.indexOf('= {"');
  const end = src.indexOf('} as unknown as Readonly<Record<string, readonly Ability[]>>;');
  if (start < 0 || end < 0) return null;
  return new Set(Object.keys(JSON.parse(src.slice(start + 2, end + 1))));
})();

/*
 * Fields an XMage ability constructor can set FROM A LITERAL that change what a
 * player may do. A field set from a constructor PARAMETER is not here: the
 * record holds parameters, so the port can read those and does.
 *
 * `addCost` and `condition` are matched only where the argument is a `new`
 * expression or a static instance, which is the literal form. `Zone` is not a
 * restriction on its own — every keyword ability in XMage lives in `Zone.ALL` —
 * so it is not in this list at all; the zone argument is already read by
 * `lowerStatic` and `lowerResolving` through `activeZones`.
 */
const RESTRICTION = [
  ['maxActivationsPerTurn', /\bmaxActivationsPerTurn\s*=\s*\d/],
  ['maxActivationsPerGame', /\bmaxActivationsPerGame\s*=\s*\d/],
  ['timing', /\btiming\s*=\s*TimingRule\.\w/],
  ['condition', /\b(this\.)?condition\s*=\s*(new\s+\w|[A-Z]\w*\.(getInstance|instance|get\w+)\b)/],
  ['addCost', /\b(this\.)?addCost\s*\(\s*new\s+\w/],
  ['setMayActivate', /\bsetMayActivate\s*\(\s*TargetController\./],
];

function javaFiles(dir) {
  const out = [];
  const walk = (at) => {
    let entries;
    try {
      entries = readdirSync(at);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(at, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(full);
      else if (name.endsWith('.java')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/* Only the shared ability classes, which is where `mage.abilities` lives. */
const roots = [
  path.join(CLONE, 'Mage', 'src', 'main', 'java', 'mage', 'abilities'),
];
const files = roots.flatMap(javaFiles);
if (files.length === 0) {
  console.error(`No ability sources under ${roots.join(', ')}. Set DM_XMAGE to the clone.`);
  process.exit(1);
}

const setsRestriction = new Map(); // simple class name -> [field names]
for (const file of files) {
  const simple = path.basename(file, '.java');
  const src = readFileSync(file, 'utf8');
  const hits = [];
  for (const [name, re] of RESTRICTION) if (re.test(src)) hits.push(name);
  if (hits.length) setsRestriction.set(simple, hits);
}

const { records } = await loadRecords();
const usage = new Map(); // class -> {cards:Set, lowered:Set, shipped:Set}
for (const record of records) {
  const lowered = lowerCard(record);
  const whole = lowered.blocked.length === 0 && lowered.abilities.length > 0;
  const shipped = !!record.oracleId && !!SHIPPED?.has(record.oracleId);
  const seen = new Set();
  for (const ability of abilitiesOf(record)) {
    const simple = ability.via.prim.replace(/^xmage:/, '');
    if (!setsRestriction.has(simple)) continue;
    if (seen.has(simple)) continue;
    seen.add(simple);
    if (!usage.has(simple)) usage.set(simple, { cards: new Set(), lowered: new Set(), shipped: new Set() });
    const row = usage.get(simple);
    row.cards.add(record.name);
    if (whole) row.lowered.add(record.name);
    if (shipped) row.shipped.add(record.oracleId);
  }
}

const handled = (simple) => {
  const prim = `xmage:${simple}`;
  if (prim in REFUSED_ABILITY_CLASSES) return 'refused by name';
  if (CASTING_ABILITY_CLASSES.has(prim)) return 'refused as a casting ability';
  if (prim in ABILITY_RULES) return 'has its own ABILITY_RULES entry';
  if (prim in ABILITY_COSTS) return 'has its own ABILITY_COSTS entry';
  if (simple === 'ExhaustAbility') return 'read: limit and timing';
  if (simple === 'ActivateOncePerGameActivatedAbility') return 'read: limit';
  if (simple === 'LimitedTimesPerTurnActivatedAbility') return 'read: limit';
  if (simple === 'LimitedTimesPerTurnActivatedManaAbility') return 'read: limit';
  if (simple === 'ActivateAsSorceryActivatedAbility') return 'read: timing';
  return null;
};

const rows = [...usage.entries()]
  .map(([simple, row]) => ({ simple, row, why: handled(simple), fields: setsRestriction.get(simple) }))
  .sort((a, b) => b.row.shipped.size - a.row.shipped.size || b.row.cards.size - a.row.cards.size);

console.log(`ability sources read ${files.length}, of them ${setsRestriction.size} set a restriction in the constructor`);
console.log(`shipped rows ${SHIPPED?.size ?? 'UNKNOWN'}`);
console.log('');
console.log('DROPPED IN SILENCE — the class writes a restriction and the port reads none of it:');
console.log('');
console.log('| shipped | whole card lowers | card files | class | what the constructor sets |');
console.log('|---:|---:|---:|---|---|');
let droppedShipped = new Set();
for (const r of rows) {
  if (r.why) continue;
  if (r.row.cards.size === 0) continue;
  console.log(`| ${r.row.shipped.size} | ${r.row.lowered.size} | ${r.row.cards.size} | ${r.simple} | ${r.fields.join(', ')} |`);
  for (const o of r.row.shipped) droppedShipped.add(o);
}
console.log('');
console.log(`DISTINCT SHIPPED CARDS whose ability class writes a restriction nothing here reads: ${droppedShipped.size}`);
console.log('');
console.log('ALREADY ANSWERED:');
for (const r of rows) {
  if (!r.why || r.row.cards.size === 0) continue;
  console.log(`  ${r.simple.padEnd(46)} ${r.why} (${r.row.cards.size} card files)`);
}
