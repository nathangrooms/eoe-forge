/**
 * scripts/xmage-ground-truth.mjs
 *
 * XMage as ground truth: card name -> the set of XMage ability / effect classes
 * that card is actually built from, ranked by how many cards use each class.
 *
 * This is a SECOND, INDEPENDENT ranking of what matters. The clause census
 * (scripts/clause-census.mjs) derives its ranking from oracle TEXT. This one
 * derives it from a WORKING ENGINE. Where they agree, confidence is high.
 * Where they disagree is the interesting part.
 *
 * WHAT THIS IS NOT
 *   Not an automation figure. Not a coverage claim about DeckMatrix. Nothing
 *   here executes, ships, or feeds the runtime. It is a measurement.
 *
 * LICENCE
 *   XMage (magefree/mage) is MIT, Copyright (c) 2010 betasteward@gmail.com.
 *   The script verifies that at run time from the checkout's own LICENSE.txt
 *   and refuses to run if it does not find it. No Java is vendored into this
 *   repo: the clone lives outside it and only structure is extracted.
 *   Comments are stripped before any analysis, because XMage's `//` lines carry
 *   Wizards of the Coast oracle text which is not XMage's to license.
 *   Forge is GPL-3.0 and is never read or referenced.
 *
 * RUN
 *   node scripts/xmage-ground-truth.mjs
 *   XMAGE_ROOT=<clone> node scripts/xmage-ground-truth.mjs
 *
 * WRITES
 *   scratch/xmage-ground-truth.json   full ranking + per-card mapping
 *   (scratch/ is gitignored)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

const REPO = 'C:/Users/natha/Desktop/Software/Deckmatrix';
const OUT_JSON = join(REPO, 'scratch/xmage-ground-truth.json');
const CENSUS_JSON = join(REPO, 'scratch/clause-census.json');
const ORACLE_GZ = join(REPO, 'scratch/scryfall/oracle-cards.jsonl.gz');

const PINNED_COMMIT = '07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d';
const ROOT = process.env.XMAGE_ROOT ?? 'C:/Users/natha/Software/xmage';

const CARDS_DIR = 'Mage.Sets/src/mage/cards';
const SETS_DIR = 'Mage.Sets/src/mage/sets';
const ENGINE_DIR = 'Mage/src/main/java';

const log = (...a) => console.log(...a);
const pct = (n, d) => (d ? +((n / d) * 100).toFixed(2) : 0);

/* ------------------------------------------------------------------ *
 * 0. Licence gate. Refuse to read the source unless it says MIT.
 * ------------------------------------------------------------------ */

function licenceGate() {
  const p = join(ROOT, 'LICENSE.txt');
  let text = null;
  if (existsSync(p)) text = readFileSync(p, 'utf8');
  else {
    // sparse checkout may not have materialised the root file; read the blob
    try {
      text = execFileSync('git', ['-C', ROOT, 'cat-file', '-p', 'HEAD:LICENSE.txt'], {
        encoding: 'utf8',
      });
    } catch {
      /* fall through */
    }
  }
  if (!text || !/MIT License/i.test(text) || !/betasteward/i.test(text)) {
    throw new Error(
      'Refusing to run: could not verify an MIT LICENSE.txt at the XMage checkout ' + ROOT,
    );
  }
  const head = text.split('\n').slice(0, 3).map((s) => s.trim()).filter(Boolean);
  return { verified: true, firstLines: head, path: 'LICENSE.txt' };
}

function headCommit() {
  try {
    return execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/* ------------------------------------------------------------------ *
 * 1. Shallow Java surface parsing. We do not parse Java.
 * ------------------------------------------------------------------ */

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');
}

function walkJava(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.java')) out.push(p);
    }
  }
  return out.sort();
}

const RE_IMPORT = /^import\s+(?:static\s+)?(mage\.[\w.]+);/gm;
const RE_PACKAGE = /^package\s+([\w.]+);/m;
const RE_EXTENDS = /\bclass\s+(\w+)(?:<[^>]*>)?\s+extends\s+([\w.]+)/;

/** imports, filtered to those whose simple name actually appears in the body */
function usedImports(src) {
  const body = src.replace(/^import\s+[^;]+;\s*$/gm, '');
  const used = [];
  let dropped = 0;
  for (const m of src.matchAll(RE_IMPORT)) {
    const fqn = m[1];
    const simple = fqn.slice(fqn.lastIndexOf('.') + 1);
    if (simple === '*') continue;
    if (new RegExp(`\\b${simple}\\b`).test(body)) used.push(fqn);
    else dropped++;
  }
  // fully-qualified inline references
  for (const m of body.matchAll(/\bmage(?:\.[a-z][\w]*)+\.[A-Z]\w*/g)) used.push(m[0]);
  return { used: [...new Set(used)], dropped };
}

/* ------------------------------------------------------------------ *
 * 2. Pass A — set files give card NAME -> card CLASS.
 * ------------------------------------------------------------------ */

const RE_SETCARD =
  /new\s+SetCardInfo\s*\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*(?:"[^"]*"|\d+)\s*,\s*Rarity\.\w+\s*,\s*([\w.]+)\.class/g;

function passA() {
  const files = walkJava(join(ROOT, SETS_DIR));
  const nameToClasses = new Map(); // card name -> Set<fqn>
  const classToNames = new Map(); // fqn -> Set<card name>
  let entries = 0;
  let unqualified = 0;
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(RE_SETCARD)) {
      entries++;
      const name = m[1].replace(/\\"/g, '"');
      let cls = m[2];
      if (!cls.startsWith('mage.cards.')) {
        unqualified++;
        continue;
      }
      if (!nameToClasses.has(name)) nameToClasses.set(name, new Set());
      nameToClasses.get(name).add(cls);
      if (!classToNames.has(cls)) classToNames.set(cls, new Set());
      classToNames.get(cls).add(name);
    }
  }
  return { setFiles: files.length, entries, unqualified, nameToClasses, classToNames };
}

/* ------------------------------------------------------------------ *
 * 3. Pass B — every card class -> the engine symbols it names.
 * ------------------------------------------------------------------ */

const RE_TYPE_DECL =
  /^[ \t]*(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*(?:class|enum|interface|record)\s+(\w+)/gm;

function bucketOf(fqn) {
  if (fqn.startsWith('mage.abilities.keyword.')) return 'keyword';
  if (
    (fqn.startsWith('mage.abilities.common.') || fqn.startsWith('mage.abilities.triggers.')) &&
    /TriggeredAbility$/.test(fqn)
  )
    return 'trigger';
  if (fqn.startsWith('mage.abilities.effects.')) return 'effect';
  if (fqn.startsWith('mage.abilities.costs.')) return 'cost';
  if (fqn.startsWith('mage.abilities.condition.')) return 'condition';
  if (fqn.startsWith('mage.abilities.mana.')) return 'mana';
  if (fqn.startsWith('mage.abilities.hint.')) return 'hint';
  if (fqn.startsWith('mage.abilities.decorator.')) return 'decorator';
  if (fqn.startsWith('mage.abilities.dynamicvalue.')) return 'dynamicvalue';
  if (fqn.startsWith('mage.abilities.token')) return 'token';
  if (fqn.startsWith('mage.abilities.')) return 'ability';
  if (fqn.startsWith('mage.target.')) return 'target';
  return null;
}

function passB() {
  const files = walkJava(join(ROOT, CARDS_DIR));
  const cards = new Map(); // fqn -> record
  let importsDropped = 0;

  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    const src = stripComments(raw);
    const pkg = (RE_PACKAGE.exec(src) || [])[1] || 'mage.cards';
    const simple = basename(f, '.java');
    const fqn = `${pkg}.${simple}`;

    const { used, dropped } = usedImports(src);
    importsDropped += dropped;

    const ext = RE_EXTENDS.exec(src);
    let superSimple = ext && ext[1] === simple ? ext[2] : null;
    let superFqn = null;
    if (superSimple) {
      if (superSimple.includes('.')) superFqn = superSimple;
      else {
        const hit = used.find((u) => u.endsWith('.' + superSimple));
        superFqn = hit ?? `${pkg}.${superSimple}`;
      }
    }

    // Hand-written Java in the card file: any type declared beyond the card class
    const decls = [...src.matchAll(RE_TYPE_DECL)].map((m) => m[1]);
    const extraTypes = decls.filter((d) => d !== simple).length;

    const prims = used.filter((u) => bucketOf(u) !== null);
    cards.set(fqn, {
      fqn,
      simple,
      superFqn,
      loc: src.split('\n').length,
      bespokeTypes: extraTypes,
      anonClass: /new\s+[A-Z]\w*\s*(?:<[^>]*>)?\s*\([^;{}]*\)\s*\{/.test(src),
      lambda: /->/.test(src),
      // the card's OWN Java asks the player something (bespoke prompt)
      ownChoiceCall: /\.(?:choose\w*|announceX\w*)\s*\(/.test(src),
      prims,
      modal: /\bgetModes\s*\(|\bnew\s+Mode\s*\(|\baddMode\s*\(/.test(src),
    });
  }
  return { cardFiles: files.length, cards, importsDropped };
}

/** union a card class's prims with those of card classes it extends */
function resolveInheritance(cards) {
  const memo = new Map();
  let chained = 0;
  const resolve = (fqn, seen = new Set()) => {
    if (memo.has(fqn)) return memo.get(fqn);
    const rec = cards.get(fqn);
    if (!rec) return [];
    if (seen.has(fqn)) return rec.prims;
    seen.add(fqn);
    let out = rec.prims;
    if (rec.superFqn && cards.has(rec.superFqn)) {
      chained++;
      out = [...new Set([...out, ...resolve(rec.superFqn, seen)])];
    }
    memo.set(fqn, out);
    return out;
  };
  for (const fqn of cards.keys()) resolve(fqn);
  return { memo, chained };
}

/* ------------------------------------------------------------------ *
 * 4. Pass C — engine index, and which classes need a player decision.
 *
 * The authoritative list of player-input entry points is taken from XMage's
 * own Player interface, not from a list I invented. A class needs a player
 * decision when its own body calls one of those methods.
 * ------------------------------------------------------------------ */

function playerChoiceMethods() {
  const p = join(ROOT, ENGINE_DIR, 'mage/players/Player.java');
  const src = stripComments(readFileSync(p, 'utf8'));
  const strong = new Set();
  const weak = new Set();
  for (const m of src.matchAll(/\b(\w+)\s*\(/g)) {
    const n = m[1];
    if (/^choose[A-Z]?/.test(n) || n === 'choose') strong.add(n);
    else if (/^announce[A-Z]/.test(n)) strong.add(n);
    else if (n === 'getAmount' || n === 'getMultiAmount' || /^getMultiAmount/.test(n)) weak.add(n);
  }
  return { strong: [...strong].sort(), weak: [...weak].sort() };
}

function passC(choiceMethods) {
  const files = walkJava(join(ROOT, ENGINE_DIR, 'mage'));
  const engine = new Map(); // fqn -> { superFqn, directStrong, directWeak }
  const strongRe = new RegExp(`\\.(?:${choiceMethods.strong.join('|')})\\s*\\(`);
  // getAmount also exists on GameEvent, where it means "how much life was gained",
  // not "ask the player". Require a player-shaped receiver so event.getAmount()
  // does not count as a prompt. Verified against GainLifeControllerTriggeredAbility.
  const weakRe = new RegExp(
    `\\b(?:player|controller|opponent|chooser|targetPlayer|\\w*Player)\\s*\\.\\s*` +
      `(?:${choiceMethods.weak.join('|')})\\s*\\(`,
  );

  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    const pkg = (RE_PACKAGE.exec(src) || [])[1] || '';
    const simple = basename(f, '.java');
    const fqn = pkg ? `${pkg}.${simple}` : simple;
    const { used } = usedImports(src);
    const ext = RE_EXTENDS.exec(src);
    let superFqn = null;
    if (ext && ext[1] === simple) {
      const s = ext[2];
      if (s.includes('.')) superFqn = s;
      else {
        const hit = used.find((u) => u.endsWith('.' + s));
        superFqn = hit ?? `${pkg}.${s}`;
      }
    }
    const declRe = new RegExp(
      `^[ \\t]*(?:public\\s+|private\\s+|protected\\s+|static\\s+|final\\s+|abstract\\s+)*` +
        `(class|interface|enum)\\s+${simple}\\b`,
      'm',
    );
    const declLine = declRe.exec(src);
    const kind = declLine
      ? declLine[1] === 'class'
        ? /\babstract\s+class\s/.test(declLine[0])
          ? 'abstract'
          : 'concrete'
        : declLine[1]
      : 'unknown';

    engine.set(fqn, {
      fqn,
      superFqn,
      kind,
      directStrong: strongRe.test(src),
      directWeak: weakRe.test(src),
      refs: used.filter((u) => bucketOf(u) !== null),
    });
  }

  // inherited: walk the extends chain only. No import-based tainting.
  const verdict = new Map();
  const walk = (fqn, seen = new Set()) => {
    if (verdict.has(fqn)) return verdict.get(fqn);
    const r = engine.get(fqn);
    if (!r || seen.has(fqn)) return { strong: false, weak: false, via: null };
    seen.add(fqn);
    let out = { strong: r.directStrong, weak: r.directWeak, via: r.directStrong || r.directWeak ? 'direct' : null };
    if (!out.strong && r.superFqn) {
      const up = walk(r.superFqn, seen);
      if (up.strong || up.weak) out = { strong: up.strong, weak: up.weak || out.weak, via: 'inherited' };
    }
    verdict.set(fqn, out);
    return out;
  };
  for (const fqn of engine.keys()) walk(fqn);
  return { engineFiles: files.length, engine, verdict };
}

/* ------------------------------------------------------------------ *
 * 5. Census pool, from the same local oracle file the census used.
 * ------------------------------------------------------------------ */

const foldName = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 /]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function readOracle() {
  if (!existsSync(ORACLE_GZ)) return null;
  const kept = new Set(); // survives the census pool filter
  const excludedDigital = new Set();
  const excludedLayout = new Set();
  const allNames = new Set();
  const textByName = new Map();
  const rl = createInterface({
    input: createReadStream(ORACLE_GZ).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const BAD_LAYOUT = new Set([
    'token', 'double_faced_token', 'emblem', 'art_series', 'memorabilia',
    'planar', 'scheme', 'vanguard',
  ]);
  const add = (set, name) => {
    set.add(foldName(name));
    if (name.includes(' // ')) for (const p of name.split(' // ')) set.add(foldName(p));
  };
  for await (const line of rl) {
    const t = line.trim().replace(/^,/, '').replace(/[,\]]$/, '');
    if (!t || t === '[' || t === ']') continue;
    let c;
    try {
      c = JSON.parse(t);
    } catch {
      continue;
    }
    if (!c || !c.name) continue;
    add(allNames, c.name);
    const text =
      c.oracle_text ??
      (c.card_faces ? c.card_faces.map((f) => f.oracle_text ?? '').join('\n') : '');
    if (!textByName.has(foldName(c.name))) textByName.set(foldName(c.name), text);
    if (BAD_LAYOUT.has(c.layout) || c.set_type === 'memorabilia' || c.set_type === 'token') {
      add(excludedLayout, c.name);
      continue;
    }
    if (c.digital) {
      add(excludedDigital, c.name);
      continue;
    }
    add(kept, c.name);
  }
  return { kept, excludedDigital, excludedLayout, allNames, textByName };
}

/* ------------------------------------------------------------------ *
 * 6. Main
 * ------------------------------------------------------------------ */

async function main() {
  const lic = licenceGate();
  const commit = headCommit();

  log('XMAGE GROUND TRUTH');
  log('==================');
  log('clone            ', ROOT);
  log('HEAD             ', commit, commit === PINNED_COMMIT ? '(pinned)' : '(NOT the pinned commit)');
  log('licence          ', lic.firstLines.join(' | '));
  log('');

  const oracle = await readOracle();
  if (!oracle) log('NOTE: local oracle file not found, cross-checks against it are skipped.');

  const A = passA();
  log(`pass A  set files ${A.setFiles}, SetCardInfo entries ${A.entries}, ` +
      `unqualified class refs skipped ${A.unqualified}`);
  log(`        distinct card names ${A.nameToClasses.size}, distinct card classes named ${A.classToNames.size}`);

  const B = passB();
  log(`pass B  card .java files ${B.cardFiles}, unused imports dropped ${B.importsDropped}`);
  const { memo: primsOf, chained } = resolveInheritance(B.cards);
  log(`        card classes extending another card class, prims unioned: ${chained}`);

  const cm = playerChoiceMethods();
  const C = passC(cm);
  log(`pass C  engine .java files ${C.engineFiles}`);
  log(`        Player choice methods taken from Player.java: ${cm.strong.length} strong, ${cm.weak.length} weak`);
  log(`        strong: ${cm.strong.join(', ')}`);
  log(`        weak:   ${cm.weak.join(', ')}`);
  log('');

  /* ---- join: card name -> class set ---- */
  const cardMap = new Map(); // card name -> { classes:[], prims:Set, modal:bool, bespoke:number }
  let namesWithNoFile = 0;
  for (const [name, classes] of A.nameToClasses) {
    const prims = new Set();
    let modal = false;
    let bespoke = 0;
    let anon = false;
    let lambda = false;
    let ownChoice = false;
    let found = 0;
    for (const cls of classes) {
      const rec = B.cards.get(cls);
      if (!rec) continue;
      found++;
      for (const p of primsOf.get(cls) ?? rec.prims) prims.add(p);
      if (rec.modal) modal = true;
      if (rec.anonClass) anon = true;
      if (rec.lambda) lambda = true;
      if (rec.ownChoiceCall) ownChoice = true;
      bespoke += rec.bespokeTypes;
    }
    if (!found) {
      namesWithNoFile++;
      continue;
    }
    cardMap.set(name, { classes: [...classes], prims: [...prims].sort(), modal, bespoke, anon, lambda, ownChoice });
  }
  const orphanClasses = [...B.cards.keys()].filter((c) => !A.classToNames.has(c)).length;
  log(`join    card names mapped to a real .java file: ${cardMap.size}`);
  log(`        card names whose class file was missing: ${namesWithNoFile}`);
  log(`        card .java files no set file ever names: ${orphanClasses}`);
  log('');

  /* ---- ranking ---- */
  const classCards = new Map(); // engine class -> Set<card name>
  for (const [name, rec] of cardMap) {
    for (const p of rec.prims) {
      if (!classCards.has(p)) classCards.set(p, new Set());
      classCards.get(p).add(name);
    }
  }
  const ranked = [...classCards.entries()]
    .map(([fqn, set]) => {
      const e = C.engine.get(fqn);
      const v = C.verdict.get(fqn) ?? { strong: false, weak: false, via: null };
      const direct = e ? (e.directStrong ? 'strong' : e.directWeak ? 'weak' : 'no') : 'unknown';
      return {
        fqn,
        simple: fqn.slice(fqn.lastIndexOf('.') + 1),
        bucket: bucketOf(fqn),
        kind: e ? e.kind : 'unknown',
        cards: set.size,
        // PRIMARY signal: this class's own body asks a player something.
        choice: direct,
        // Secondary, and deliberately not the headline: inheriting from
        // AbilityImpl taints nearly everything, so this is reported as a
        // ceiling, never as the PROMPTED figure.
        choiceInherited: v.strong || v.weak,
        inEngineIndex: !!e,
      };
    })
    .sort((a, b) => b.cards - a.cards || a.fqn.localeCompare(b.fqn));

  log(`RANKING distinct engine classes referenced by at least one card: ${ranked.length}`);
  const byBucket = {};
  for (const r of ranked) {
    const k = r.bucket ?? 'other';
    byBucket[k] ??= { classes: 0, cardUses: 0 };
    byBucket[k].classes++;
    byBucket[k].cardUses += r.cards;
  }
  log('        by bucket:');
  for (const [k, v] of Object.entries(byBucket).sort((a, b) => b[1].classes - a[1].classes)) {
    log(`          ${k.padEnd(14)} classes ${String(v.classes).padStart(6)}   card-uses ${v.cardUses}`);
  }
  const byKind = {};
  for (const r of ranked) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  log(`        by java kind: ${JSON.stringify(byKind)}`);
  log('        (interface and abstract classes are framework base types. A card naming one');
  log('         is a card that writes its own Java against that base, not one assembled from it.)');
  log('');
  log('TOP 60 CLASSES BY CARD COUNT');
  log('    rank  cards   choice  kind      class');
  ranked.slice(0, 60).forEach((r, i) => {
    log(
      `    ${String(i + 1).padStart(4)}  ${String(r.cards).padStart(5)}   ` +
        `${r.choice.padEnd(6)}  ${r.kind.padEnd(8)}  ${r.fqn}`,
    );
  });
  log('');
  log('TOP 40 CONCRETE CLASSES ONLY (framework base types removed)');
  log('    rank  cards   choice  class');
  ranked
    .filter((r) => r.kind === 'concrete' || r.kind === 'enum')
    .slice(0, 40)
    .forEach((r, i) => {
      log(`    ${String(i + 1).padStart(4)}  ${String(r.cards).padStart(5)}   ${r.choice.padEnd(6)}  ${r.fqn}`);
    });
  log('');

  /* ---- pure composition vs hand-written Java ---- */
  const frameworkTypes = new Set(
    ranked.filter((r) => r.kind === 'abstract' || r.kind === 'interface' || r.kind === 'unknown').map((r) => r.fqn),
  );
  for (const rec of cardMap.values()) {
    rec.namesFramework = rec.prims.some((p) => frameworkTypes.has(p));
    // Hand-written = the card file carries behaviour of its own, not just a
    // list of stock parts. Importing an interface to type a local variable is
    // NOT hand-written, so framework imports are reported but not used here.
    rec.handWritten = rec.bespoke > 0 || rec.anon || rec.lambda;
    rec.pure = !rec.handWritten;
  }
  const pureCards = [...cardMap.values()].filter((r) => r.pure);
  const v = [...cardMap.values()];
  log(`COMPOSITION`);
  log(`        cards declaring their own extra type (a hand-written effect class): ` +
      `${v.filter((r) => r.bespoke > 0).length}`);
  log(`        cards with an anonymous engine subclass: ${v.filter((r) => r.anon).length}`);
  log(`        cards with a lambda: ${v.filter((r) => r.lambda).length}`);
  log(`        cards with ANY hand-written Java: ${v.filter((r) => r.handWritten).length} ` +
      `(${pct(v.filter((r) => r.handWritten).length, cardMap.size)}%)`);
  log(`        PURE COMPOSITION cards, assembled only from stock classes: ${pureCards.length} of ` +
      `${cardMap.size} (${pct(pureCards.length, cardMap.size)}%)`);
  log(`        [reported, not used for the split] cards importing a framework base type: ` +
      `${v.filter((r) => r.namesFramework).length}`);
  const xtab = {
    handWrittenCards: v.filter((r) => r.handWritten).length,
    ownTypeDeclared: v.filter((r) => r.bespoke > 0).length,
    anonymousSubclass: v.filter((r) => r.anon).length,
    lambda: v.filter((r) => r.lambda).length,
    pure: pureCards.length,
  };
  log('');

  /* ---- curve: same metric as the census ---- */
  const totalCards = cardMap.size;
  const cardsWithNoPrims = [...cardMap.values()].filter((r) => r.prims.length === 0).length;

  function buildCurve(rows, label) {
    const out = [];
    const denom = rows.length;
    for (const n of [50, 100, 250, 500, 1000, 1500, ranked.length]) {
      const top = new Set(ranked.slice(0, n).map((r) => r.fqn));
      let full = 0;
      let oneShort = 0;
      let uses = 0;
      let totalUses = 0;
      for (const rec of rows) {
        let missSet = new Set();
        for (const p of rec.prims) {
          totalUses++;
          if (top.has(p)) uses++;
          else missSet.add(p);
        }
        if (missSet.size === 0) full++;
        else if (missSet.size === 1) oneShort++;
      }
      out.push({
        n: Math.min(n, ranked.length),
        classCoveragePct: pct(uses, totalUses),
        cardCoverageAllClassesPct: pct(full, denom),
        cardsFullyCovered: full,
        cardsMissingExactlyOneClass: oneShort,
      });
    }
    log(`CURVE   ${label} (${denom} cards)`);
    log('        topN   class-uses covered   CARDS with every class in topN   one class short');
    for (const c of out) {
      log(
        `        ${String(c.n).padStart(5)}   ${String(c.classCoveragePct + '%').padStart(17)}   ` +
          `${String(c.cardCoverageAllClassesPct + '% (' + c.cardsFullyCovered + ')').padStart(31)}   ` +
          `${String(c.cardsMissingExactlyOneClass).padStart(15)}`,
      );
    }
    log('');
    return out;
  }

  const curve = buildCurve([...cardMap.values()], `ALL XMage cards, ${cardsWithNoPrims} of which name no ability class`);
  const curvePure = buildCurve(pureCards, 'PURE COMPOSITION cards only, the honest subset');

  /* ---- how many classes to reach a card-coverage target ---- */
  const targets = [25, 50, 75, 90, 95, 100];
  const need = {};
  {
    // incremental: sort cards by their rarest class rank
    const rankOf = new Map(ranked.map((r, i) => [r.fqn, i + 1]));
    const worst = [...cardMap.values()].map((rec) =>
      rec.prims.length ? Math.max(...rec.prims.map((p) => rankOf.get(p))) : 0,
    );
    worst.sort((a, b) => a - b);
    for (const t of targets) {
      const idx = Math.ceil((t / 100) * totalCards) - 1;
      need[t] = worst[Math.min(idx, worst.length - 1)];
    }
  }
  log('CLASSES NEEDED FOR A CARD-COVERAGE TARGET');
  for (const t of targets) log(`        ${String(t).padStart(3)}% of cards  ->  ${need[t]} classes`);
  log('');

  /* ---- player choice ---- */
  const choiceClasses = ranked.filter((r) => r.choice === 'strong' || r.choice === 'weak');
  const strongClasses = ranked.filter((r) => r.choice === 'strong');
  const cardsNeedingChoice = new Set();
  const cardsWithTarget = new Set();
  const cardsModal = new Set();
  const cardsInheritedTaint = new Set();
  for (const [name, rec] of cardMap) {
    for (const p of rec.prims) {
      const e = C.engine.get(p);
      if (e && (e.directStrong || e.directWeak)) cardsNeedingChoice.add(name);
      const v = C.verdict.get(p);
      if (v && (v.strong || v.weak)) cardsInheritedTaint.add(name);
      if (p.startsWith('mage.target.')) cardsWithTarget.add(name);
    }
    if (rec.modal) cardsModal.add(name);
  }
  log('PROMPTED, measured from the engine');
  log('        Signal: the class body calls a method declared on XMage\'s own Player interface.');
  log('        Direct only. Inheritance is NOT propagated, because AbilityImpl handles targets');
  log('        and modes generically and taints almost every class through it.');
  log(`        engine classes cards use whose own body asks a player something: ` +
      `${choiceClasses.length} of ${ranked.length} (${pct(choiceClasses.length, ranked.length)}%)`);
  log(`          of those, strong signal (choose*/announce*): ${strongClasses.length}`);
  log(`        CARDS naming at least one such class: ${cardsNeedingChoice.size} of ${totalCards} ` +
      `(${pct(cardsNeedingChoice.size, totalCards)}%)`);
  log(`        CARDS naming a mage.target.* class (target selection at cast time): ${cardsWithTarget.size} ` +
      `(${pct(cardsWithTarget.size, totalCards)}%)`);
  log(`        CARDS with modes (choose one / choose two): ${cardsModal.size} (${pct(cardsModal.size, totalCards)}%)`);
  const union = new Set([...cardsNeedingChoice, ...cardsWithTarget, ...cardsModal]);
  log(`        UNION of all three: ${union.size} (${pct(union.size, totalCards)}%)`);
  log(`        [ceiling, do not quote as PROMPTED] cards tainted once inheritance propagates: ` +
      `${cardsInheritedTaint.size} (${pct(cardsInheritedTaint.size, totalCards)}%)`);
  log('');
  // Generic casting machinery. Paying a hybrid or X cost IS a decision, but it
  // is one the casting flow owns, not a card-specific prompt. Reported both ways.
  const CASTING_MACHINERY = new Set([
    'mage.abilities.costs.mana.ManaCostsImpl',
    'mage.abilities.TriggeredAbilityImpl',
  ]);
  const cardsChoiceExclCasting = new Set();
  for (const [name, rec] of cardMap) {
    for (const p of rec.prims) {
      if (CASTING_MACHINERY.has(p)) continue;
      const e = C.engine.get(p);
      if (e && (e.directStrong || e.directWeak)) cardsChoiceExclCasting.add(name);
    }
    if (rec.ownChoice) cardsChoiceExclCasting.add(name);
  }
  log(`        cards whose OWN java asks the player something (bespoke prompt): ` +
      `${[...cardMap.values()].filter((r) => r.ownChoice).length}`);
  log(`        CARDS needing a choice once generic casting machinery is excluded: ` +
      `${cardsChoiceExclCasting.size} (${pct(cardsChoiceExclCasting.size, totalCards)}%)`);
  log(`          excluded: ${[...CASTING_MACHINERY].join(', ')}`);
  log('');

  /* ---- PROMPTED: engine verdict vs the census text marker, on the same cards ---- */
  let promptedConfusion = null;
  if (existsSync(CENSUS_JSON) && oracle) {
    const markers = new RegExp(JSON.parse(readFileSync(CENSUS_JSON, 'utf8')).playerDecisions.markers, 'i');
    const t = { bothAgree: 0, engineOnly: 0, textOnly: 0, textOnlyButHasTarget: 0, neither: 0, noText: 0 };
    const engineOnlySample = [];
    const textOnlySample = [];
    for (const [name, rec] of cardMap) {
      const text = oracle.textByName.get(foldName(name));
      if (text === undefined) continue;
      if (!text) {
        t.noText++;
        continue;
      }
      const eng = cardsChoiceExclCasting.has(name) || rec.modal;
      const txt = markers.test(text);
      if (eng && txt) t.bothAgree++;
      else if (eng) {
        t.engineOnly++;
        if (engineOnlySample.length < 15) engineOnlySample.push(name);
      } else if (txt) {
        t.textOnly++;
        if (rec.prims.some((p) => p.startsWith('mage.target.'))) t.textOnlyButHasTarget++;
        if (textOnlySample.length < 15) textOnlySample.push(name);
      } else t.neither++;
    }
    promptedConfusion = { ...t, engineOnlySample, textOnlySample };
    const denom = t.bothAgree + t.engineOnly + t.textOnly + t.neither;
    log('PROMPTED CROSS-CHECK: the engine\'s verdict vs the census text marker, card by card');
    log(`        cards compared (both a class map and oracle text): ${denom}`);
    log(`        engine says choice AND text has a marker : ${t.bothAgree} (${pct(t.bothAgree, denom)}%)`);
    log(`        engine says choice, text has NO marker   : ${t.engineOnly} (${pct(t.engineOnly, denom)}%)  <- text parsing misses these`);
    log(`        text has a marker, engine says no choice : ${t.textOnly} (${pct(t.textOnly, denom)}%)`);
    log(`          of those, the card DOES name a target class (optional targets, "up to"): ` +
        `${t.textOnlyButHasTarget}`);
    log(`        neither                                  : ${t.neither} (${pct(t.neither, denom)}%)`);
    log(`        engine-only sample: ${engineOnlySample.slice(0, 10).join(' | ')}`);
    log(`        text-only sample:   ${textOnlySample.slice(0, 10).join(' | ')}`);
    log('');
  }

  log('        TOP 30 CHOICE-REQUIRING CLASSES BY CARD COUNT');
  choiceClasses.slice(0, 30).forEach((r, i) => {
    log(`        ${String(i + 1).padStart(3)}  ${String(r.cards).padStart(5)}  ${r.choice.padEnd(6)} ${r.fqn}`);
  });
  log('');

  const bespokeCards = [...cardMap.values()].filter((r) => r.bespoke > 0).length;

  /* ---- keyword agreement with the census ---- */
  let keywordAgreement = null;
  if (existsSync(CENSUS_JSON)) {
    const census = JSON.parse(readFileSync(CENSUS_JSON, 'utf8'));
    const run = census.runs.clauseFull;
    const kwPatterns = new Map();
    for (const p of run.topPatterns) {
      if (p.pattern.startsWith('kw|')) kwPatterns.set(p.pattern.slice(3).trim(), p.cards);
    }
    const rows = [];
    for (const r of ranked) {
      if (r.bucket !== 'keyword') continue;
      const words = r.simple
        .replace(/Ability$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase();
      // exact join first, then prefix: census keeps the keyword's argument in the
      // pattern ("equip ~mana", "enchant creature"), so an exact join under-counts.
      let censusCards = kwPatterns.get(words) ?? null;
      let joinKind = censusCards === null ? null : 'exact';
      if (censusCards === null) {
        let sum = 0;
        let hits = 0;
        for (const [pat, n] of kwPatterns) {
          if (pat === words || pat.startsWith(words + ' ')) {
            sum += n;
            hits++;
          }
        }
        if (hits) {
          censusCards = sum;
          joinKind = 'prefix';
        }
      }

      // Why the counts differ: is the keyword actually PRINTED on the cards that
      // name this class, or is the class being used to GRANT it to something else?
      let printedLine = 0;
      let mentioned = 0;
      let notInText = 0;
      if (oracle) {
        for (const [name, rec] of cardMap) {
          if (!rec.prims.includes(r.fqn)) continue;
          const text = (oracle.textByName.get(foldName(name)) ?? '').toLowerCase();
          if (!text) {
            notInText++;
            continue;
          }
          const onOwnLine = text
            .split('\n')
            .some((ln) =>
              ln
                .split(/,\s*/)
                .some((seg) => seg.trim().replace(/\s*\{.*$/, '').replace(/[.\s]+$/, '') === words),
            );
          if (onOwnLine) printedLine++;
          else if (new RegExp(`\\b${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) mentioned++;
          else notInText++;
        }
      }
      rows.push({
        class: r.simple,
        fqn: r.fqn,
        xmageCards: r.cards,
        censusKeyword: words,
        censusCards,
        joinKind,
        printedAsKeywordLine: printedLine,
        mentionedInTextOnly: mentioned,
        keywordNotInText: notInText,
      });
    }
    const matched = rows.filter((r) => r.censusCards !== null);
    keywordAgreement = {
      rows,
      matchedCount: matched.length,
      exactJoins: rows.filter((r) => r.joinKind === 'exact').length,
      prefixJoins: rows.filter((r) => r.joinKind === 'prefix').length,
      keywordClasses: rows.length,
      censusKeywordPatternsInTop5000: kwPatterns.size,
    };
    log('KEYWORD CROSS-CHECK (mechanical join: XMage FooBarAbility -> census "kw| foo bar…")');
    log(`        XMage keyword classes used by cards: ${rows.length}`);
    log(`        census keyword patterns inside its top 5000: ${kwPatterns.size}`);
    log(`        joined: ${matched.length} (${keywordAgreement.exactJoins} exact, ${keywordAgreement.prefixJoins} by prefix)`);
    log('        top 25 by XMage card count. "granted" = XMage names the class but the card');
    log('        does not print the keyword on its own line, so the census never sees a kw clause.');
    log('          class                        xmage  census    diff   printed  granted  absent');
    matched.slice(0, 25).forEach((r) => {
      const d = r.xmageCards - r.censusCards;
      log(
        `          ${r.class.padEnd(28)}${String(r.xmageCards).padStart(5)}   ${String(r.censusCards).padStart(5)}  ` +
          `${String((d > 0 ? '+' : '') + d).padStart(6)}   ${String(r.printedAsKeywordLine).padStart(7)}  ` +
          `${String(r.mentionedInTextOnly).padStart(7)}  ${String(r.keywordNotInText).padStart(6)}`,
      );
    });
    const unjoined = rows.filter((r) => r.censusCards === null).slice(0, 20);
    log(`        XMage keyword classes with NO census keyword pattern of that name (top 20 by cards):`);
    unjoined.forEach((r) =>
      log(`          ${r.class.padEnd(30)} ${String(r.xmageCards).padStart(5)} cards   ` +
          `printed ${r.printedAsKeywordLine}, granted ${r.mentionedInTextOnly}, absent ${r.keywordNotInText}`),
    );
    log('');
  }

  /* ---- pool join ---- */
  let poolJoin = null;
  if (oracle) {
    let inPool = 0;
    let lostToDigital = 0;
    let lostToLayout = 0;
    let absent = 0;
    const digitalSample = [];
    const absentSample = [];
    for (const name of cardMap.keys()) {
      const f = foldName(name);
      if (oracle.kept.has(f)) inPool++;
      else if (oracle.excludedDigital.has(f)) {
        lostToDigital++;
        if (digitalSample.length < 12) digitalSample.push(name);
      } else if (oracle.excludedLayout.has(f)) lostToLayout++;
      else {
        absent++;
        if (absentSample.length < 12) absentSample.push(name);
      }
    }
    poolJoin = {
      xmageCards: cardMap.size,
      censusPoolNames: oracle.kept.size,
      matchedCensusPool: inPool,
      droppedByCensusDigitalFilter: lostToDigital,
      droppedByCensusLayoutFilter: lostToLayout,
      absentFromOracleFile: absent,
      digitalFilterSample: digitalSample,
      absentSample,
    };
    log('POOL JOIN  XMage card names against the local Scryfall oracle file');
    log(`           in the census pool                                  ${inPool} (${pct(inPool, cardMap.size)}%)`);
    log(`           present but DROPPED by the census digital filter     ${lostToDigital}`);
    log(`           present but dropped by the census layout filter      ${lostToLayout}`);
    log(`           not in the oracle file at all                        ${absent}`);
    log(`           digital-filter casualties (real paper cards): ${digitalSample.slice(0, 8).join(' | ')}`);
    log(`           genuinely absent sample: ${absentSample.slice(0, 8).join(' | ')}`);
    log('');
  }

  /* ---- write ---- */
  const out = {
    generatedAt: new Date().toISOString(),
    script: 'scripts/xmage-ground-truth.mjs',
    source: {
      repo: 'https://github.com/magefree/mage',
      clone: ROOT,
      commit,
      pinnedCommit: PINNED_COMMIT,
      licence: 'MIT (verified at run time from LICENSE.txt in the checkout)',
      licenceFirstLines: lic.firstLines,
      note: 'Comments stripped before analysis. No oracle text extracted. No Java vendored.',
    },
    method: {
      cardNameSource: 'Mage.Sets/src/mage/sets/*.java  new SetCardInfo("Name", num, Rarity.X, mage.cards.x.Class.class)',
      symbolSource: 'imports of the card .java, filtered to those whose simple name appears in the body, plus inline fully-qualified refs',
      inheritance: 'a card class extending another card class unions the parent prims',
      choiceDetector: 'Player.java method names; a class needs a decision when its own body calls one, or its extends-chain ancestor does',
      choiceMethods: cm,
    },
    counts: {
      setFiles: A.setFiles,
      setCardInfoEntries: A.entries,
      cardJavaFiles: B.cardFiles,
      engineJavaFiles: C.engineFiles,
      distinctCardNames: A.nameToClasses.size,
      cardNamesMapped: cardMap.size,
      cardNamesWithNoFile: namesWithNoFile,
      cardFilesNoSetNames: orphanClasses,
      distinctEngineClassesUsed: ranked.length,
      cardsWithNoAbilityClass: cardsWithNoPrims,
      bespokeCards,
    },
    byBucket,
    byJavaKind: byKind,
    composition: {
      bespokeCards,
      cardsNamingFrameworkType: v.filter((r) => r.namesFramework).length,
      pureCompositionCards: pureCards.length,
      crossTab: xtab,
    },
    curve,
    curvePureComposition: curvePure,
    classesNeededForCardCoverage: need,
    prompted: {
      choiceClasses: choiceClasses.length,
      strongChoiceClasses: strongClasses.length,
      cardsNeedingChoice: cardsNeedingChoice.size,
      cardsWithTarget: cardsWithTarget.size,
      cardsModal: cardsModal.size,
      unionCards: union.size,
      pctUnion: pct(union.size, totalCards),
      inheritedTaintCeiling: cardsInheritedTaint.size,
      cardsNeedingChoiceExclCastingMachinery: cardsChoiceExclCasting.size,
    },
    keywordAgreement,
    promptedConfusion,
    poolJoin,
    ranking: ranked,
    cardToClasses: Object.fromEntries([...cardMap].map(([n, r]) => [n, r.prims])),
  };
  writeFileSync(OUT_JSON, JSON.stringify(out));
  log(`WROTE   ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
