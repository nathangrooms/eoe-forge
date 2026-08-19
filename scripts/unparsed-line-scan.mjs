/**
 * WHICH UNPARSED LINE, if the grammar learned to read it, finishes a card.
 *
 * `ability-phrase-scan.mjs` (tranche 2) ranks the `{do:'manual'}` MARKER — the
 * sentence the compiler read up to and gave up inside. That is only half the
 * remaining work. The other half is the paragraph the compiler refused whole,
 * which never becomes an ability at all and so has no marker to rank. On the
 * current pool that half is the larger one: 17,380 cards are SILENT because of
 * an unparsed line against 6,998 because of a marker.
 *
 * So this script is the marker scan's twin, over `result.unparsed`.
 *
 * ## The honest half, and why it is harder here
 *
 * The marker scan can ask `runnableIfTaught(ability)` because the ability
 * exists: the trigger head parsed, its event is known, only the verb is
 * missing. An unparsed paragraph has no ability, so there is nothing to ask.
 * Guessing "it would run" would be exactly the "the engine supports it" claim
 * this project has been burned by twice.
 *
 * `likelyHome` therefore reads the LINE and says where it would land, using the
 * same shapes `compiler.ts` uses to route a paragraph, and it is deliberately
 * pessimistic:
 *
 *   activated   the line has a `cost:` head. `activatedAbilitiesOf` has no call
 *               site, so teaching it finishes nothing. Counted as unreachable.
 *   spell       the card is an instant or sorcery and the line is not a trigger
 *               or a static. Nothing runs a compiled spell on resolution.
 *   triggered   the line starts with when/whenever/at. Reachable ONLY if the
 *               engine derives the event, which is asked of the real
 *               `DERIVED_EVENTS` list rather than assumed.
 *   static      everything else on a permanent. `scanStatics` reads every
 *               static with no whole-card gate, so this is the reachable case.
 *
 * A line counted as reachable can still land on a `pump` or a `search-library`,
 * which `to-actions.ts` only NAMES. That cannot be known before the grammar
 * exists, so it is not claimed here; the marker scan's `engine-defers` column
 * is the place that check lives.
 *
 * ## What is counted
 *
 *   sole        this line is the card's ONLY blocker of any kind, and its
 *               likely home is reachable. Teaching it finishes the card.
 *   soleDead    only blocker, home unreachable. Teaching it finishes nothing.
 *   withKin     every blocker on the card is an unparsed line, this one
 *               included. Cheap-looking, gated behind a sibling.
 *
 * No Supabase, no network, no model. Reads the cached bulk file on disk.
 *
 * Usage:  node --experimental-strip-types scripts/unparsed-line-scan.mjs
 */

import { createReadStream, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'unparsed-line-scan.json');

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * Same verdict switch as ability-layer-coverage.mjs. Copied, not imported,
 * because that file is a script with top-level side effects.
 * ------------------------------------------------------------------ */

function decisionReason(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may') return 'may';
    if (e.do === 'choose-mode') return 'choose-mode';
    if (e.do === 'unless-pays') return 'unless-pays';
    if (e.do === 'if') { const r = decisionReason(e.then) ?? decisionReason(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionReason(e.effects); if (r) return r; }
  }
  return null;
}

/* T3. Kept identical to ability-layer-coverage.mjs's correction: a static is
 * only as live as the modifications on it. `hasRestriction` (statics.ts) is
 * called from combat.ts for 'cant-attack' and 'cant-block' and nothing else,
 * and `costAdjustmentFor` has no call site outside its own tests. */
const READ_RESTRICTIONS = new Set(['cant-attack', 'cant-block']);

function staticDeadModification(ability) {
  for (const modification of ability.modifications ?? []) {
    if (modification.layer === 'cost-modify') return 'static cost modification: no call site';
    if (modification.layer === 'restriction' && !READ_RESTRICTIONS.has(modification.rule?.rule)) {
      return `static restriction "${modification.rule?.rule}": no reader`;
    }
  }
  return null;
}

function abilityStatus(ability, ownsTriggers) {
  const decision = decisionReason(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered': {
      if (ability.optional) return 'decision';
      if (decision) return 'decision';
      return ownsTriggers ? 'run' : 'dead';
    }
    case 'static':
      if (decision) return 'decision';
      return staticDeadModification(ability) ? 'dead' : 'run';
    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      if (selfEnters && r.do === 'enters-tapped') return 'run';
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return 'run';
      return 'dead';
    }
    case 'keyword':
      return keywordSupport(ability.keyword ?? '') === 'engine' ? 'run' : 'dead';
    default:
      return 'dead';
  }
}

/* ------------------------------------------------------------------ *
 * Where would an unparsed line land, and would anything run it
 * ------------------------------------------------------------------ */

/**
 * Trigger events `triggers.ts` actually derives, read off `unrunnableReason`'s
 * own list by probing it. Hard-coding the list here would let it drift; asking
 * the real predicate cannot.
 */
const DERIVED_EVENTS = new Set();
{
  const self = { sel: 'self' };
  const you = { who: 'you' };
  const shapes = {
    enters: { on: 'enters', who: self },
    dies: { on: 'dies', who: self },
    attacks: { on: 'attacks', who: self },
    blocks: { on: 'blocks', who: self },
    'deals-damage': { on: 'deals-damage', source: self },
    cast: { on: 'cast', what: self },
    'draws-card': { on: 'draws-card', whose: you },
    upkeep: { on: 'step', step: 'upkeep', whose: you },
    'end-step': { on: 'step', step: 'end', whose: you },
    leaves: { on: 'leaves', who: self },
    'becomes-blocked': { on: 'becomes-blocked', who: self },
    'dealt-damage': { on: 'dealt-damage', who: self },
    tapped: { on: 'tapped', who: self },
    sacrificed: { on: 'sacrificed', who: self },
  };
  for (const [name, event] of Object.entries(shapes)) {
    const probe = { kind: 'triggered', text: '', event, effects: [{ do: 'draw', who: { who: 'you' }, count: 1 }] };
    if (unrunnableReason(probe) === null) DERIVED_EVENTS.add(name);
  }
}

const TRIGGER_HEAD = /^(when|whenever|at the beginning|at end of)\b/;
const COST_HEAD = /^([^:"]{1,60}):\s/;

/** Which event word does this trigger line name? Coarse on purpose. */
function eventOfLine(text) {
  if (/\benters\b/.test(text)) return 'enters';
  if (/\bdies\b/.test(text)) return 'dies';
  if (/\battacks\b/.test(text)) return 'attacks';
  if (/\bblocks\b/.test(text)) return 'blocks';
  if (/\bdeals (combat )?damage\b/.test(text)) return 'deals-damage';
  if (/\byou cast\b|\bcasts?\b/.test(text)) return 'cast';
  if (/\bbeginning of your upkeep\b/.test(text)) return 'upkeep';
  if (/\bbeginning of your end step\b/.test(text)) return 'end-step';
  if (/\byou draw a card\b/.test(text)) return 'draws-card';
  if (/\bleaves the battlefield\b/.test(text)) return 'leaves';
  if (/\bbecomes blocked\b/.test(text)) return 'becomes-blocked';
  return 'other';
}

/**
 * Pessimistic router. Returns `{ home, ok, why }`.
 * `ok` means: if the grammar read this line, a live consumer would run it.
 */
function likelyHome(text, card) {
  const types = String(card.type_line ?? '').toLowerCase();
  const isSpell = /\b(instant|sorcery)\b/.test(types) && !/\b(creature|artifact|enchantment|land|planeswalker|battle)\b/.test(types);

  if (COST_HEAD.test(text) && !TRIGGER_HEAD.test(text)) {
    return { home: 'activated', ok: false, why: 'activated: activatedAbilitiesOf has no call site' };
  }
  if (TRIGGER_HEAD.test(text)) {
    const on = eventOfLine(text);
    if (on === 'other') return { home: 'triggered', ok: false, why: 'trigger: this script cannot name the event' };
    if (!DERIVED_EVENTS.has(on)) return { home: 'triggered', ok: false, why: `trigger: the engine derives no event for "${on}"` };
    return { home: 'triggered', ok: true, why: `trigger on derived event "${on}"` };
  }
  if (/^(as |if )/.test(text) && /\benters\b/.test(text)) {
    return { home: 'replacement', ok: false, why: 'replacement: intrinsic.ts derives only two results' };
  }
  if (isSpell) {
    return { home: 'spell', ok: false, why: 'spell: nothing runs a compiled spell on resolution' };
  }
  return { home: 'static', ok: true, why: 'static: scanStatics reads every one' };
}

/* ------------------------------------------------------------------ *
 * Families — a set of line shapes ONE piece of grammar work would read.
 * Strict, same rule as the marker scan: a card counts for a family only when
 * EVERY remaining unparsed line on it matches that family.
 * ------------------------------------------------------------------ */

const FAMILIES = [
  ['blocking-restriction',
    /^(~|enchanted creature|equipped creature) cant (be )?block(ed)?\b.*$|^(~|enchanted creature|equipped creature) can block only\b.*$|^(~|enchanted creature|equipped creature) cant attack or block\.?$/],
  ['attack-restriction',
    /^(~|enchanted creature|equipped creature) cant attack\b.*$|^(~|enchanted creature|equipped creature) attacks each (combat|turn) if able\.?$/],
  ['aura-control',
    /^you control enchanted (creature|permanent|artifact|land)\.?$/],
  ['enters-tapped-unless',
    /^~ enters tapped unless\b.*$/],
  ['no-max-hand-size',
    /^you have no maximum hand size\.?$/],
  ['extra-land',
    /^you may play an additional land on each of your turns\.?$/],
  ['cant-be-countered',
    /^(~|this spell|~ and creature spells you cast) cant be countered\.?$/],
  ['deck-construction',
    /^(~ can be your commander|choose a background|doctors companion|~ can be your commander\.)$/],
  ['regenerate',
    /^\{[^}]*\}(, \{t\})?: regenerate ~\.?$/],
  ['additional-cost',
    /^as an additional cost to cast ~, .+$/],
];

function familyOf(text) {
  for (const [name, re] of FAMILIES) if (re.test(text)) return name;
  return null;
}

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`);
  process.exit(1);
}

const all = [];
for await (const card of rows(SRC)) all.push(card);

const pool = [];
for (const card of all) {
  if (EXCLUDED_LAYOUTS.has(card.layout)) continue;
  if (EXCLUDED_SET_TYPES.has(card.set_type)) continue;
  if (EXCLUDED_LAYOUTS_NON_GAME.has(card.layout)) continue;
  if (card.digital) continue;
  if (!(card.games ?? []).includes('paper')) continue;
  pool.push(card);
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const sole = new Map();          // line -> cards it alone would finish
const soleDead = new Map();      // line -> cards it alone blocks, home unreachable
const deadWhy = new Map();
const withKin = new Map();       // line -> cards whose every blocker is unparsed
const appears = new Map();       // line -> cards carrying it at all
const example = new Map();
const homeOf = new Map();

const familyFinishes = new Map();
const familyExample = new Map();

let poolWithText = 0;
let unparsedOnlyCards = 0;
let backFaceOnly = 0;

for (const card of pool) {
  let trace;
  try {
    trace = compileWithTrace(card);
  } catch {
    continue;
  }
  const { result, normalized } = trace;
  const abilities = result.abilities ?? [];
  const unparsed = result.unparsed ?? [];
  if (abilities.length === 0 && unparsed.length === 0) continue;
  poolWithText++;

  /*
   * The report prints the compiler's OWN normalised paragraph, `para.norm`, not
   * a second normalisation of the raw text. Same strings as
   * ability-layer-coverage.mjs prints, so the two reports can be read side by
   * side without a translation step.
   */
  const paraBySpan = new Map(normalized.paragraphs.map(p => [`${p.span[0]}:${p.span[1]}`, p]));

  const triggered = abilities.filter(a => a.kind === 'triggered');
  const ownsTriggers =
    result.coverage === 'full' &&
    triggered.length > 0 &&
    triggered.every(a => unrunnableReason(a) === null);

  // Non-unparsed blockers. A manual marker, a dead ability or a decision all
  // sink the card, so an unparsed line beside one of them finishes nothing.
  let otherBlockers = 0;
  for (const ability of abilities) {
    if (hasManualEffect(effectsOf(ability))) { otherBlockers++; continue; }
    const st = abilityStatus(ability, ownsTriggers);
    if (st === 'dead' || st === 'decision') otherBlockers++;
  }

  /*
   * Front face only. A back face is unparsed BY DESIGN — the compiler refuses
   * it with reason `multi-face` — so ranking a back-face line would rank work
   * that is not being asked for. The cards whose ONLY blocker is a back face
   * are counted apart, because no grammar in this folder finishes them.
   */
  const seen = new Set();
  const lines = [];
  let backOnly = 0;
  for (const u of unparsed) {
    const para = paraBySpan.get(`${u.span[0]}:${u.span[1]}`);
    if (!para) continue;
    if (para.face > 0) { backOnly++; continue; }
    const norm = String(para.norm ?? '').trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    lines.push(norm);
  }
  for (const l of lines) {
    bump(appears, l);
    if (!example.has(l)) example.set(l, card.name);
    if (!homeOf.has(l)) homeOf.set(l, likelyHome(l, card).home);
  }

  if (otherBlockers > 0) continue;
  if (lines.length === 0) { if (backOnly > 0) backFaceOnly++; continue; }
  if (backOnly > 0) continue;   // a back face still sinks the card
  unparsedOnlyCards++;

  const homes = lines.map(l => likelyHome(l, card));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = homes[i];
    if (lines.length === 1) {
      if (h.ok) bump(sole, l);
      else { bump(soleDead, l); deadWhy.set(l, h.why); }
    }
    if (h.ok) bump(withKin, l);
  }

  if (homes.every(h => h.ok)) {
    const fams = lines.map(familyOf);
    if (fams.every(f => f !== null)) {
      const distinct = [...new Set(fams)];
      if (distinct.length === 1) {
        bump(familyFinishes, distinct[0]);
        if (!familyExample.has(distinct[0])) familyExample.set(distinct[0], card.name);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const line = (s = '') => console.log(s);
const soleTotal = [...sole.values()].reduce((a, b) => a + b, 0);
const deadTotal = [...soleDead.values()].reduce((a, b) => a + b, 0);

line('=========================================================');
line(' UNPARSED-LINE SCAN — which refused paragraph finishes a card');
line('=========================================================');
line();
line(`pool                        ${pool.length}`);
line(`cards with compiled text    ${poolWithText}`);
line(`cards blocked ONLY by unparsed FRONT-face lines   ${unparsedOnlyCards}`);
line(`  of those, one line, home reachable:  ${soleTotal}`);
line(`  of those, one line, home unreachable:${deadTotal}`);
line(`cards whose only blocker is a BACK face (unparsed by design): ${backFaceOnly}`);
line();
line(`derived trigger events (probed against unrunnableReason): ${[...DERIVED_EVENTS].sort().join(', ') || '(none)'}`);
line();
line('-- CANDIDATE FAMILIES: cards each would finish ON ITS OWN --');
line('  finish  family');
for (const [k, v] of topOf(familyFinishes, 40)) {
  line(`  ${String(v).padStart(6)}  ${k}   e.g. ${familyExample.get(k)}`);
}
line();
line('-- top 80 lines: SOLE blocker, home a live consumer would run --');
line('  finish  appears  home        line');
for (const [k, v] of topOf(sole, 80)) {
  line(`  ${String(v).padStart(6)}  ${String(appears.get(k) ?? 0).padStart(7)}  ${String(homeOf.get(k) ?? '').padEnd(10)}  ${k.slice(0, 92)}`);
}
line();
line('-- top 30 lines: SOLE blocker, but nothing would run it --');
line('  wasted  reason / line');
for (const [k, v] of topOf(soleDead, 30)) {
  line(`  ${String(v).padStart(6)}  ${(deadWhy.get(k) ?? '').slice(0, 46).padEnd(46)} ${k.slice(0, 62)}`);
}
line();
line('-- top 60 lines: card is unparsed-only, line has a reachable home --');
line('  cards  line');
for (const [k, v] of topOf(withKin, 60)) {
  line(`  ${String(v).padStart(5)}  ${k.slice(0, 104)}`);
}

writeFileSync(OUT, JSON.stringify({
  pool: pool.length,
  poolWithText,
  unparsedOnlyCards,
  soleTotal,
  deadTotal,
  derivedEvents: [...DERIVED_EVENTS].sort(),
  families: [...familyFinishes.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ family: k, finishes: v, example: familyExample.get(k) })),
  sole: [...sole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 600)
    .map(([k, v]) => ({ line: k, finishes: v, appears: appears.get(k) ?? 0, home: homeOf.get(k), example: example.get(k) })),
  soleDead: [...soleDead.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300)
    .map(([k, v]) => ({ line: k, wasted: v, why: deadWhy.get(k) })),
  withKin: [...withKin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 600)
    .map(([k, v]) => ({ line: k, cards: v, example: example.get(k) })),
}, null, 2));
line();
line(`written: ${OUT}`);
