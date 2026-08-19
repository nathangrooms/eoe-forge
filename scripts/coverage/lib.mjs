/**
 * scripts/coverage/lib.mjs — shared machinery for the XMage planning extractor.
 *
 * This is a PLANNING INSTRUMENT. Nothing here produces card behaviour, populates
 * a table, or feeds the runtime. Its only output is a ranked list of engine
 * primitives to write, with a measured card count attached to each line.
 *
 * ## Two numbers this file is careful never to conflate
 *   REPRESENTABLE — what our ability DSL can express. A property of `dsl.ts`.
 *   AUTOMATED     — what the engine actually runs, end to end, for a real card.
 * Everything computed here is an input to REPRESENTABLE and to *planning* the
 * road to AUTOMATED. No function in this file may be quoted as an automation
 * figure. See `docs/overhaul/PRIMITIVE-BUILD-ORDER.md` §0.
 *
 * ## Precision over recall
 * Every classifier below is package-keyed, not name-keyed. The spike's v1/v2
 * detectors keyed on hand-written class-name lists and produced false CLEAN
 * verdicts (Oketra's Monument, Yarok, Vesuva, Teferi's Protection, Aetherworks
 * Marvel). Package paths eliminate that whole error class: two classes can share
 * a simple name, they cannot share a fully-qualified one. Where a name-keyed
 * rule survives it is because there is no package that isolates the concept, and
 * each such rule is commented with why.
 *
 * ## Licence
 * XMage is MIT (`Copyright (c) 2010 betasteward@gmail.com`). We read its source
 * out of a clone OUTSIDE this repo and vendor nothing. We take STRUCTURE only —
 * never the `//` comment lines, which are Wizards of the Coast's oracle text and
 * are not XMage's to license. Our rules text comes from our own `cards.oracle_text`.
 * Forge is GPL-3.0 and is never read, cloned or referenced.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, basename } from 'node:path';

/* ------------------------------------------------------------------ *
 * 0. Where XMage lives. Never inside this repo.
 * ------------------------------------------------------------------ */

/** The commit the published numbers were measured at. Recorded, never assumed. */
export const PINNED_COMMIT = '07ecb7cf263df8dbc05b39b61bad9e9d2c63d18d';

export function xmageRoot() {
  const root =
    process.env.XMAGE_ROOT ??
    'C:/Users/natha/AppData/Local/Temp/claude/xmage-spike/mage';
  if (!existsSync(join(root, 'Mage.Sets/src/mage/cards'))) {
    throw new Error(
      `XMAGE_ROOT does not look like a magefree/mage clone: ${root}\n` +
        `Clone it OUTSIDE this repo (it must never be vendored) and set XMAGE_ROOT:\n` +
        `  git clone --filter=blob:none https://github.com/magefree/mage <somewhere-outside-the-repo>\n` +
        `  git -C <that> checkout ${PINNED_COMMIT}`,
    );
  }
  return root;
}

/** Actual HEAD of the clone. Every artefact records this; it is never inferred. */
export function xmageCommit(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

export const CARDS_DIR = 'Mage.Sets/src/mage/cards';
export const SETS_DIR = 'Mage.Sets/src/mage/sets';
export const ENGINE_DIR = 'Mage/src/main/java';

export function walkJava(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.java')) out.push(p);
    }
  }
  return out.sort();
}

/* ------------------------------------------------------------------ *
 * 1. Java surface parsing — deliberately shallow.
 *
 * We do not parse Java. We read imports, the card class's own declaration, and
 * any OTHER type declared in the file. That is enough to answer both questions
 * we ask ("is this pure composition?" and "which engine symbols does it name?")
 * and a real parser would be a maintenance liability for no gain.
 * ------------------------------------------------------------------ */

const RE_IMPORT = /^import\s+(?:static\s+)?((?:mage|java|javax)\.[\w.]+);/gm;
const RE_SELF = /public\s+(?:final\s+)?class\s+(\w+)\s+extends\s+(\w+)/;
const RE_DECL =
  /^[ \t]*(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*(class|enum|interface)\s+(\w+)\s*(?:<[^>]*>)?\s*(?:extends|implements)\s+([\w.<>, ]+)/gm;

/**
 * Strip block and line comments before analysis.
 *
 * This is not cosmetic. XMage's `//` lines carry Wizards of the Coast's oracle
 * text, which we have no licence to. Removing them first means no rule below can
 * accidentally key on that text, and no extracted artefact can contain it.
 */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');
}

export function parseJava(path, root) {
  const raw = readFileSync(path, 'utf8');
  const src = stripComments(raw);

  const imports = [];
  for (const m of src.matchAll(RE_IMPORT)) imports.push(m[1]);

  const selfM = RE_SELF.exec(src);
  const self = selfM ? selfM[1] : basename(path, '.java');
  const selfBase = selfM ? selfM[2] : null;

  /** Type declarations that are NOT the card class itself == hand-written Java. */
  const bespoke = [];
  for (const m of src.matchAll(RE_DECL)) {
    if (m[2] === self) continue;
    bespoke.push({
      kind: m[1],
      name: m[2],
      base: m[3].split('<')[0].split(',')[0].trim(),
    });
  }

  return {
    path: relative(root, path).replace(/\\/g, '/'),
    cls: self,
    selfBase,
    loc: raw.split('\n').length,
    imports,
    bespoke,
    src,
  };
}

/* ------------------------------------------------------------------ *
 * 2. The free set — symbols that are NOT primitives to implement.
 *
 * Fully-qualified, not bare names. The spike's version was a bare-name set,
 * which is the same defect it condemned in the gap detector: `mage.filter.Filter`
 * and a hypothetical `mage.game.Filter` would have collided silently.
 *
 * A symbol earns a place here only if our DSL already carries the concept as
 * DATA, so no code has to be written for it. Each line says which DSL construct
 * absorbs it. Anything not on this list counts as work.
 * ------------------------------------------------------------------ */

export const FREE_SYMBOLS = new Set([
  // Card frame — `CardAbilities` + the `cards` row already hold all of this.
  'mage.cards.CardImpl',
  'mage.cards.Card',
  'mage.cards.CardSetInfo',
  'mage.cards.Cards',
  'mage.cards.CardsImpl',
  'mage.MageInt', // power/toughness literal
  'mage.MageObject',
  'mage.MageObjectReference',
  'mage.ObjectColor', // dsl.ts ManaColor
  'mage.Mana', // dsl.ts `add-mana` mana string

  // Enumerations. These are dsl.ts string-literal unions, not behaviour.
  'mage.constants.CardType',
  'mage.constants.SubType',
  'mage.constants.SuperType',
  'mage.constants.Rarity',
  'mage.constants.Zone', // dsl.ts Zone
  'mage.constants.Duration', // dsl.ts Duration
  'mage.constants.Outcome', // AI hint only, no rules meaning
  'mage.constants.TargetController', // dsl.ts PlayerSelector
  'mage.constants.ComparisonType', // dsl.ts Cmp
  'mage.constants.SetTargetPointer',
  'mage.constants.AttachmentType',
  'mage.constants.ColoredManaSymbol',

  // Runtime handles every effect takes. Our effects take a state object instead.
  'mage.game.Game',
  'mage.game.permanent.Permanent',
  'mage.players.Player',
  'mage.abilities.Ability',
  'mage.abilities.effects.Effect',
  'mage.game.events.GameEvent',

  // Counters — dsl.ts carries the counter as a string.
  'mage.counters.Counter',
  'mage.counters.CounterType',

  // Filter/target plumbing our Selector tree subsumes structurally.
  'mage.filter.Filter',
  'mage.filter.FilterPermanent',
  'mage.filter.predicate.Predicates',
  'mage.target.Target',
  'mage.target.targetpointer.FixedTarget',

  // Pure utility / UI. `Hint` and `ValueHint` render a reminder in XMage's UI
  // and have no rules effect at all.
  'mage.util.CardUtil',
  'mage.abilities.hint.Hint',
  'mage.abilities.hint.ValueHint',
  'mage.abilities.hint.common.CardsInControllerGraveyardHint',
]);

/** `java.*` / `javax.*` are never primitives. */
export const isEngineSymbol = (fqn) => fqn.startsWith('mage.');

/**
 * The engine primitives a card file names. FQNs, deduped, free set removed.
 * Computed from imports only: XMage cards import everything they use, and a
 * same-package reference would be another card class, not a primitive.
 */
export function primitivesOf(parsed) {
  const out = new Set();
  for (const imp of parsed.imports) {
    if (!isEngineSymbol(imp)) continue;
    if (FREE_SYMBOLS.has(imp)) continue;
    out.add(imp);
  }
  return out;
}

/** Coarse family, for reading the ranked table. Package-keyed. */
export function familyOf(fqn) {
  if (fqn.startsWith('mage.abilities.effects.common.continuous')) return 'continuous';
  if (fqn.startsWith('mage.abilities.effects.common.replacement')) return 'replacement';
  if (fqn.startsWith('mage.abilities.effects.common.ruleModifying')) return 'rule-modifying';
  if (fqn.startsWith('mage.abilities.effects.common.cost')) return 'cost-modification';
  if (fqn.startsWith('mage.abilities.effects.common.asthought')) return 'as-though';
  if (fqn.startsWith('mage.abilities.effects')) return 'effect';
  if (fqn.startsWith('mage.abilities.keyword')) return 'keyword';
  if (fqn.startsWith('mage.abilities.common')) return 'ability-shape';
  if (fqn.startsWith('mage.abilities.triggers')) return 'ability-shape';
  if (fqn.startsWith('mage.abilities.costs')) return 'cost';
  if (fqn.startsWith('mage.abilities.condition')) return 'condition';
  if (fqn.startsWith('mage.abilities.dynamicvalue')) return 'computed-value';
  if (fqn.startsWith('mage.abilities.mana')) return 'mana';
  if (fqn.startsWith('mage.abilities.decorator')) return 'condition';
  if (fqn.startsWith('mage.abilities')) return 'ability-shape';
  if (fqn.startsWith('mage.filter')) return 'filter';
  if (fqn.startsWith('mage.target')) return 'target';
  if (fqn.startsWith('mage.watchers')) return 'watcher';
  if (fqn.startsWith('mage.game.permanent.token')) return 'token';
  if (fqn.startsWith('mage.game')) return 'game-state';
  if (fqn.startsWith('mage.players')) return 'game-state';
  if (fqn.startsWith('mage.choices')) return 'choice';
  if (fqn.startsWith('mage.constants')) return 'enum';
  if (fqn.startsWith('mage.counters')) return 'counter';
  return 'other';
}

/* ------------------------------------------------------------------ *
 * 3. DSL capability gaps.
 *
 * ⚠ CORRECTION TO THE SPIKE. The spike ran against `C:\Users\natha\DeckMatrix`,
 * an empty scaffold with no `src/`, so it measured against a WRITTEN SPEC of the
 * DSL reconstructed from a decision document. The real DSL exists, at
 * `src/lib/cards/abilities/dsl.ts`, and its type space is materially wider than
 * that spec: `ValueExpr` (E9), `Modification.layer` (E2/E4), `ReplacementAbility`
 * (E1) and `Restriction` (E3) are all present as types today.
 *
 * That does NOT make those cards automated, and this file must not imply it. A
 * type existing in `dsl.ts` means the shape is REPRESENTABLE; the compiler still
 * has to emit it and the engine still has to run it. The gap tags below are
 * therefore recorded per card as INFORMATION — "this card needs capability X" —
 * and the ranked build order is driven by PRIMITIVES, which is the number that
 * survives the correction unchanged.
 * ------------------------------------------------------------------ */

export const CAPABILITIES = {
  E1: 'Replacement effects (intercept an event, modify or cancel it)',
  E2: 'Layer system (characteristic-setting continuous effects, CR 613)',
  E3: "Rule-modifying / restriction effects (\"players can't…\")",
  E4: 'Cost modification (spells cost more or less)',
  E5: "'As though' permission (play from graveyard/exile, ignore timing)",
  E6: 'Watchers (within-turn / game history)',
  E7: "Mid-resolution player interaction ('unless that player pays')",
  E8: 'Conditional mana',
  E9: 'Open computed-value expressions (arbitrary board arithmetic)',
  E10: 'The stack (counter / respond to / target a spell)',
  E11: 'Copy effects',
  E12: 'Alternative / free casting, playing from other zones',
  E13: 'Phasing; abilities functioning from outside the battlefield',
};

/** Which capability a `dsl.ts` type ALREADY covers as a type space (not as behaviour). */
export const CAPABILITY_IN_DSL_TYPES = {
  E1: 'ReplacementAbility / ReplaceableEvent / ReplacementResult',
  E2: 'Modification { layer: type|color|ability|pt-set|pt-modify|pt-switch|control }',
  E3: 'Restriction',
  E4: "Modification { layer: 'cost-modify' }",
  E9: 'ValueExpr',
  E10: "Zone 'stack' + Effect { do: 'counter' }",
  E5: null,
  E6: null, // only `Condition { if: 'first-time-this-turn' }`, not general history
  E7: null,
  E8: null, // `add-mana` takes a plain mana string
  E11: null,
  E12: null,
  E13: null,
};

/**
 * Package prefix → capability. The primary, high-precision rule.
 * Order matters: first match on the longest prefix wins.
 */
const CAP_BY_PACKAGE = [
  ['mage.abilities.effects.common.replacement', 'E1'],
  ['mage.abilities.effects.common.enterAttribute', 'E1'],
  ['mage.abilities.effects.common.ruleModifying', 'E3'],
  ['mage.abilities.effects.common.cost', 'E4'],
  ['mage.abilities.effects.common.asthought', 'E5'],
  ['mage.watchers', 'E6'],
  ['mage.abilities.mana.conditional', 'E8'],
  ['mage.abilities.mana.builder', 'E8'],
];

/**
 * Superclass → capability. Applies to BESPOKE declarations inside a card file:
 * `class FooEffect extends ReplacementEffectImpl` is unambiguous evidence.
 * Bare names are safe here because these are Java `extends` targets in files
 * that import the base class; a collision would not compile.
 */
const CAP_BY_BASE = {
  ReplacementEffectImpl: 'E1',
  PreventionEffectImpl: 'E1',
  RedirectionEffect: 'E1',
  ContinuousEffectImpl: 'E2',
  RestrictionEffect: 'E3',
  ContinuousRuleModifyingEffectImpl: 'E3',
  CostModificationEffectImpl: 'E4',
  CostAdjuster: 'E4',
  AsThoughEffectImpl: 'E5',
  Watcher: 'E6',
  ConditionalMana: 'E8',
  ConditionalManaBuilder: 'E8',
  ManaCondition: 'E8',
  DynamicValue: 'E9',
  CopyApplier: 'E11',
  AlternativeCostSourceAbility: 'E12',
};

/**
 * `effects.common.continuous` is mixed: `Boost*` and `GainAbility*` are P/T and
 * keyword grants our `pt-modify` / `ability` modifications already express.
 * Everything else in that package sets a characteristic and needs real layers.
 */
const CONTINUOUS_ALREADY_EXPRESSIBLE = /^(Boost|GainAbility)/;

/**
 * Residual name-keyed rules. Each one exists because NO package isolates the
 * concept — the classes are scattered through `effects.common`. They are the
 * least precise part of this file and are listed together so that is visible.
 */
const CAP_BY_NAME_EXACT = {
  CounterTargetEffect: 'E10',
  CounterUnlessPaysEffect: 'E10',
  CounterTargetWithReplacementEffect: 'E10',
  TargetSpell: 'E10',
  TargetStackObject: 'E10',
  StackObject: 'E10',
  OverloadAbility: 'E10',
  DoIfCostPaid: 'E7',
  SacrificeSourceUnlessPaysEffect: 'E7',
  DoUnlessAnyPlayerPaysEffect: 'E7',
  PhasingAbility: 'E13',
};

const CAP_BY_NAME_SUBSTR = [
  [/^Copy|AsCopyEffect$|BecomesCopy/, 'E11'],
  [/CostReduction|CostIncreas|SpellsCostModification/, 'E4'],
  [/PlayFromNotOwnHandZone|CastFrom|PlayTheTopCard|WithoutPayingManaCost/, 'E12'],
  [/PhaseOut/, 'E13'],
];

/** Source-body regexes: evidence in hand-written Java that no import reveals. */
const CAP_BY_SOURCE = [
  [/\bLayer\.|\bSubLayer\./, 'E2'],
  [/\.chooseUse\(|\bcost\.pay\(/, 'E7'],
  [/getWatcher\(/, 'E6'],
  [/PhaseOut|phaseOut/, 'E13'],
  [/Zone\.COMMAND/, 'E13'],
];

/**
 * Capabilities a card needs beyond the base DSL. Empty set == CLEAN.
 *
 * CLEAN is an UPPER BOUND. The spike hand-audited 83 CLEAN verdicts and found at
 * least 4 false positives (~5% optimistic bias); this detector is the same v3
 * logic, so carry the same bias forward. Never quote a CLEAN figure without it.
 */
export function capabilitiesNeeded(parsed) {
  const hits = new Set();

  for (const d of parsed.bespoke) {
    const cap = CAP_BY_BASE[d.base.split('.').pop()];
    if (cap) hits.add(cap);
  }

  for (const imp of parsed.imports) {
    if (!isEngineSymbol(imp)) continue;
    const cls = imp.split('.').pop();
    const pkg = imp.slice(0, imp.length - cls.length - 1);

    for (const [prefix, cap] of CAP_BY_PACKAGE) {
      if (pkg === prefix || pkg.startsWith(prefix + '.')) hits.add(cap);
    }
    if (pkg === 'mage.abilities.effects.common.continuous') {
      if (!CONTINUOUS_ALREADY_EXPRESSIBLE.test(cls)) hits.add('E2');
    }

    const byBase = CAP_BY_BASE[cls];
    // Only the capabilities where importing the base class is itself proof.
    if (byBase && ['E1', 'E4', 'E11', 'E12'].includes(byBase)) hits.add(byBase);

    const exact = CAP_BY_NAME_EXACT[cls];
    if (exact) hits.add(exact);
    for (const [rx, cap] of CAP_BY_NAME_SUBSTR) if (rx.test(cls)) hits.add(cap);
  }

  for (const [rx, cap] of CAP_BY_SOURCE) if (rx.test(parsed.src)) hits.add(cap);

  return [...hits].sort();
}

/* ------------------------------------------------------------------ *
 * 4. Identity join — the two fixes the spike verified.
 * ------------------------------------------------------------------ */

/**
 * NFD-fold-and-strip. XMage writes ASCII names (`Barad-dur`); Scryfall writes
 * `Barad-dûr`. Verified in the spike: rescued 6 of 1,219 sampled names, and only
 * 93 of 33,037 oracle_ids have non-ASCII names at all.
 */
export function foldName(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Match candidates for one of our names, most-specific first.
 * The second entry is the DFC fix: our `A // B` against XMage's front face `A`.
 * Verified in the spike: rescued 26 of 1,219.
 */
export function joinKeys(name) {
  const keys = [foldName(name)];
  if (name.includes('//')) keys.push(foldName(name.split('//')[0]));
  return keys;
}

/**
 * Printings that are not paper Commander cards and must be excluded BEFORE any
 * join rate is quoted, or the rate reads artificially low. The spike classified
 * all 38 catalogue misses and 22 fell in here.
 */
export const EXCLUDED_SET_CODES = new Set([
  'unf', 'unh', 'ust', 'ugl', 'und', 'sunf', // silver-border / Un-sets
]);
export const isAlchemyRebalance = (name) => /^A-/.test(name);

/* ------------------------------------------------------------------ *
 * 5. Small helpers
 * ------------------------------------------------------------------ */

export function loadEnv(repoRoot) {
  const env = {};
  const raw = readFileSync(join(repoRoot, '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export const pct = (a, b) => (b === 0 ? '0.0' : ((100 * a) / b).toFixed(1));

export function counter() {
  const m = new Map();
  return {
    bump: (k, n = 1) => m.set(k, (m.get(k) ?? 0) + n),
    map: m,
    top: (n = 25) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n),
  };
}

export { statSync };
