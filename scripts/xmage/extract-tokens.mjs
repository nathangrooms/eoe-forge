#!/usr/bin/env node
/**
 * Generate the token table from XMage's own token classes.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. The clone is read in
 * place and nothing from it is vendored into this repository. Forge is GPL-3.0
 * and was not fetched, read or referenced.
 *
 * ## Why this is generated and not typed out
 *
 * `CreateTokenEffect` blocks 2,164 cards and 629 distinct token classes stand
 * behind it. Hand transcribing 629 constructors would take a day and would be
 * wrong in a handful of places nobody could find afterwards, because a wrong
 * power on one token looks exactly like a right one. Parsing them is one script
 * whose failures are countable: every class it cannot read is reported by name
 * and left out of the table, so the gap is visible rather than silently filled
 * with a 1/1.
 *
 * ## What is read, and what is deliberately not
 *
 * Read: the token's NAME, its card types, its subtypes, its colour, its printed
 * power and toughness, and any keyword abilities its constructor adds. Those
 * are characteristics of the object, the same ones Scryfall prints.
 *
 * Not read: the DESCRIPTION string XMage passes as the second `super` argument
 * ("2/2 black Zombie creature token") and any reminder text. Those are Wizards
 * of the Coast wording, not XMage's to license, and the app takes its wording
 * from Scryfall. The type line this script emits is BUILT from the type and
 * subtype enums, never copied from the description.
 *
 * Run:
 *   node scripts/xmage/extract-tokens.mjs
 * Writes:
 *   src/lib/cards/xmage/tokens.generated.ts
 *   scripts/coverage/.data/xmage-token-table.json
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenize, JavaParser, findAllConstructors } from './lib/java-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const XMAGE_ROOT =
  process.env.XMAGE_ROOT || 'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
const TOKEN_DIR = path.join(XMAGE_ROOT, 'Mage/src/main/java/mage/game/permanent/token');

/**
 * Keyword ability classes a token constructor may add, mapped to the keyword
 * name `dsl.ts` uses. Only keywords whose whole meaning is the word itself: a
 * token that adds a triggered ability is recorded as having an ability this
 * table cannot name, and the token is emitted WITHOUT it plus a flag, rather
 * than emitted as if the ability were not there.
 */
const KEYWORD_ABILITY = {
  FlyingAbility: 'flying',
  TrampleAbility: 'trample',
  VigilanceAbility: 'vigilance',
  HasteAbility: 'haste',
  ReachAbility: 'reach',
  MenaceAbility: 'menace',
  FirstStrikeAbility: 'first strike',
  DoubleStrikeAbility: 'double strike',
  LifelinkAbility: 'lifelink',
  DeathtouchAbility: 'deathtouch',
  DefenderAbility: 'defender',
  IndestructibleAbility: 'indestructible',
  HexproofAbility: 'hexproof',
  ShroudAbility: 'shroud',
  ChangelingAbility: 'changeling',
  InfectAbility: 'infect',
  WitherAbility: 'wither',
  FearAbility: 'fear',
  ShadowAbility: 'shadow',
  IntimidateAbility: 'intimidate',
  HorsemanshipAbility: 'horsemanship',
  SkulkAbility: 'skulk',
  DevoidAbility: 'devoid',
  FlashAbility: 'flash',
};

const COLOR_SETTER = {
  setWhite: 'W',
  setBlue: 'U',
  setBlack: 'B',
  setRed: 'R',
  setGreen: 'G',
};

const titleCase = (s) =>
  String(s)
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/** `SubType.ELDRAZI_SPAWN` prints as `Eldrazi Spawn`. */
const enumMember = (node) => (node?.k === 'field' ? node.name : null);
const nameOf = (node) => (node?.k === 'name' ? node.id : null);

function bodyOf(src, cls) {
  const toks = tokenize(src);
  const ctors = findAllConstructors(toks, cls);
  // The no-argument constructor is the one every `new XToken()` runs, and it is
  // the only one whose result is the same for every card. A parameterised token
  // is handled by its own lowering, not by this table.
  for (const c of ctors) {
    const params = c.params.filter((t) => t.v !== '(' && t.v !== ')');
    if (params.length !== 0) continue;
    const inner = toks.slice(c.open + 1, c.close);
    const p = new JavaParser([...inner, { t: 'eof', v: '', line: 0 }]);
    return p.parseBlockStatements(false);
  }
  return null;
}

function superclassOf(src, cls) {
  const toks = tokenize(src);
  for (let i = 0; i < toks.length - 3; i++) {
    if (toks[i].v === 'class' && toks[i + 1].v === cls && toks[i + 2].v === 'extends') {
      return toks[i + 3].v;
    }
  }
  return null;
}

const files = readdirSync(TOKEN_DIR).filter((f) => f.endsWith('.java'));
const sources = new Map();
for (const f of files) sources.set(f.replace(/\.java$/, ''), readFileSync(path.join(TOKEN_DIR, f), 'utf8'));

const stats = {
  files: files.length,
  read: 0,
  noNoArgConstructor: 0,
  noName: 0,
  hasUnnameableAbility: 0,
  parseFailed: 0,
};
const table = {};
const unnameable = new Map();

/** Walk one constructor body, following `super(...)` into a parent token class. */
function collect(cls, into, depth = 0) {
  if (depth > 4) return;
  const src = sources.get(cls);
  if (!src) return;
  let stmts;
  try {
    stmts = bodyOf(src, cls);
  } catch {
    stats.parseFailed += 1;
    return;
  }
  if (!stmts) {
    if (depth === 0) stats.noNoArgConstructor += 1;
    return;
  }

  const parent = superclassOf(src, cls);
  // A token that extends another token inherits everything that parent's
  // no-argument constructor set. Reading only the child would drop the parent's
  // power and toughness, and a 0/0 token that should be a 2/2 is exactly the
  // silent wrongness this whole project exists to stop.
  if (parent && sources.has(parent)) collect(parent, into, depth + 1);

  for (const st of stmts) {
    if (st.k === 'expr' && st.e?.k === 'assign') {
      const target = nameOf(st.e.l) ?? (st.e.l?.k === 'field' ? st.e.l.name : null);
      const rhs = st.e.r;
      const n = rhs?.k === 'new' && rhs.type?.name === 'MageInt' ? rhs.args?.[0] : null;
      const lit = n?.k === 'lit' ? n.v : n?.k === 'unary' && n.arg?.k === 'lit' ? `${n.op}${n.arg.v}` : null;
      if (target === 'power' && lit !== null) into.power = String(lit);
      if (target === 'toughness' && lit !== null) into.toughness = String(lit);
      continue;
    }
    if (st.k !== 'expr' || st.e?.k !== 'call') continue;
    const call = st.e;

    // `super("Treasure Token", "Treasure token")`
    if (call.k === 'call' && call.name === undefined) continue;

    const recv = call.obj;
    const recvName = nameOf(recv) ?? (recv?.k === 'field' ? recv.name : null);

    if (recvName === 'cardType' && call.name === 'add') {
      const m = enumMember(call.args?.[0]);
      if (m) into.types.push(titleCase(m));
    } else if (recvName === 'subtype' && call.name === 'add') {
      const m = enumMember(call.args?.[0]);
      if (m) into.subtypes.push(titleCase(m));
    } else if (recvName === 'color' && COLOR_SETTER[call.name]) {
      const on = call.args?.[0];
      if (!on || (on.k === 'lit' && on.v === 'true')) into.colors.push(COLOR_SETTER[call.name]);
    } else if (call.name === 'addAbility' || call.name === 'addAbility') {
      const a = call.args?.[0];
      let abilityClass = null;
      if (a?.k === 'new') abilityClass = a.type?.name;
      else if (a?.k === 'call' && a.obj?.k === 'name') abilityClass = a.obj.id;
      else if (a?.k === 'field' && a.obj?.k === 'name') abilityClass = a.obj.id;
      if (abilityClass && KEYWORD_ABILITY[abilityClass]) into.keywords.push(KEYWORD_ABILITY[abilityClass]);
      else if (abilityClass) {
        into.unnameable.push(abilityClass);
        unnameable.set(abilityClass, (unnameable.get(abilityClass) ?? 0) + 1);
      } else into.unnameable.push('?');
    }
  }

  // `super("Treasure Token", ...)` is a ctorcall, not a call.
  for (const st of stmts) {
    if (st.k === 'expr' && st.e?.k === 'ctorcall' && st.e.which === 'super') {
      const first = st.e.args?.[0];
      if (first?.k === 'lit' && first.type === 'str' && !into.name) {
        into.name = first.v.replace(/^"|"$/g, '').replace(/\s+Token$/i, '');
      }
    }
  }
}

for (const cls of sources.keys()) {
  const into = { name: '', types: [], subtypes: [], colors: [], keywords: [], unnameable: [] };
  collect(cls, into);
  if (!into.name || into.types.length === 0) {
    if (into.name === '' ) stats.noName += 1;
    continue;
  }
  stats.read += 1;
  if (into.unnameable.length > 0) stats.hasUnnameableAbility += 1;

  const typeLine = [
    ...new Set(into.types),
  ].join(' ') + (into.subtypes.length ? ` \u2014 ${[...new Set(into.subtypes)].join(' ')}` : '');

  const spec = { name: into.name, typeLine };
  if (into.power !== undefined) spec.power = into.power;
  if (into.toughness !== undefined) spec.toughness = into.toughness;
  if (into.colors.length) spec.colorIdentity = [...new Set(into.colors)];
  if (into.keywords.length) spec.keywords = [...new Set(into.keywords)];
  table[cls] = { spec, otherAbilities: [...new Set(into.unnameable)] };
}

const generated = `/**
 * GENERATED by scripts/xmage/extract-tokens.mjs. Do not edit by hand.
 *
 * XMage token classes as \`dsl.ts\` \`TokenSpec\` values.
 *
 * Derived from XMage, which is MIT licensed, Copyright (c) 2010
 * betasteward@gmail.com, https://github.com/magefree/mage. XMage is read in
 * place and nothing from it is vendored; this file holds characteristics
 * (name, types, colour, power, toughness, keywords) parsed out of its token
 * constructors. Reminder text and XMage's own description strings are NOT
 * copied: those carry Wizards of the Coast wording. Forge is GPL-3.0 and was
 * not fetched, read or referenced.
 *
 * \`otherAbilities\` names any ability a token's constructor adds that is not a
 * plain keyword. It is populated rather than dropped so that a lowering can
 * REFUSE a token whose abilities it cannot express, instead of creating a
 * Treasure that has no sacrifice ability and looks like it worked.
 *
 * ${stats.read} of ${stats.files} token classes read.
 */

import type { TokenSpec } from '../abilities/dsl.ts';

export interface TokenEntry {
  spec: TokenSpec;
  /** Non-keyword abilities XMage's constructor adds. Non-empty means the spec is incomplete. */
  otherAbilities: string[];
}

export const XMAGE_TOKENS: Record<string, TokenEntry> = ${JSON.stringify(table, null, 1)};

export const XMAGE_TOKENS_STATS = ${JSON.stringify(stats, null, 1)};
`;

writeFileSync(path.join(REPO, 'src/lib/cards/xmage/tokens.generated.ts'), generated);
writeFileSync(
  path.join(REPO, 'scripts/coverage/.data/xmage-token-table.json'),
  JSON.stringify({ stats, unnameable: [...unnameable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60), table }, null, 1),
);

console.log(`token classes on disk        ${stats.files}`);
console.log(`read into the table          ${stats.read}`);
console.log(`no no-argument constructor   ${stats.noNoArgConstructor}`);
console.log(`constructor would not parse  ${stats.parseFailed}`);
console.log(`carry an ability not nameable as a keyword  ${stats.hasUnnameableAbility}`);
console.log('top abilities the table cannot name:');
for (const [k, v] of [...unnameable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
