/**
 * WHICH EFFECT PHRASE, if the compiler learned to read it, finishes a card.
 *
 * `ability-worklist.mjs` ranks whole LINES. That is the wrong unit for the
 * work that is actually left, because the trigger halves of those lines already
 * parse: `trigger| when ~ enters` is on 4,185 cards and 2,655 of them compile to
 * a `{do:'manual'}` marker, which means the compiler read "when this enters"
 * perfectly and could not read what comes after the comma. Ranking by line puts
 * the same unreadable verb under twenty different trigger heads and hides it.
 *
 * So this script ranks by the MARKER TEXT — the exact sentence
 * `compileEffectBody` gave up on and preserved as `{do:'manual', text}`.
 *
 * ## What counts as a blocker, kept identical to the other two scripts
 *
 *   unparsed  the compiler refused the whole paragraph
 *   manual    it compiled, but left at least one `{do:'manual'}` marker
 *   dead      it compiled and is understood, but no live consumer runs it
 *
 * A card is AUTOMATED only when it has none of the three. So the number worth
 * printing is not "how often does this phrase appear" but "on how many cards is
 * this phrase the LAST thing standing" — every other paragraph already runs.
 *
 * Two cohorts are reported for every phrase:
 *
 *   sole      this card's only blocker is this one phrase. Teaching it finishes
 *             the card outright, provided the ability it lands in is one a live
 *             consumer runs — which is checked, not assumed, by re-asking
 *             `abilityStatus` what kind of ability the marker sits inside.
 *   with-kin  this card's blockers are all manual markers and nothing else, so
 *             the card finishes once every marker on it is taught. Reported
 *             separately because a phrase can look cheap and be gated behind a
 *             second phrase on the same card.
 *
 * `runnableIfTaught` is the honest half. A marker inside an activated ability
 * finishes nothing, because `activatedAbilitiesOf` has no call site, and a
 * marker inside a trigger whose event the engine never derives finishes nothing
 * either. Both are counted and reported apart from the reachable ones, so a
 * ranking cannot quietly promote work that buys a player nothing.
 *
 * No Supabase, no network, no model. Reads the cached bulk file on disk.
 *
 * Usage:  node --experimental-strip-types scripts/ability-phrase-scan.mjs
 */

import { createReadStream, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace, assertClausesAccounted } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';

import {
  EXCLUDED_LAYOUTS,
  EXCLUDED_LAYOUTS_NON_GAME,
  EXCLUDED_SET_TYPES,
  creatureTypeSet,
  nameSet,
} from './census-normalise.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'ability-phrase-scan.json');

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * Same verdict switch as ability-layer-coverage.mjs.
 * Copied, not imported, because that file is a script with top-level
 * side effects. Any divergence between the two is a bug in this file.
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
    /* ADVERSARIAL REVIEW. Kept identical to ability-layer-coverage.mjs: a
     * layer-6 grant reaches `keywordsIn`, but `combat.ts` only asks about the
     * fifteen `ENGINE_KEYWORDS`, so granting "wither" or "persist" is a badge —
     * the same player-visible result as a printed advisory keyword, which this
     * file already grades dead. */
    if (modification.layer === 'ability') {
      for (const granted of modification.grant ?? []) {
        const word = String(granted).toLowerCase();
        if (keywordSupport(word) !== 'engine') return `static grants advisory "${word}"`;
      }
    }
  }
  return null;
}

function abilityStatus(ability, ownsTriggers) {
  const effects = effectsOf(ability);
  const decision = decisionReason(effects);
  /* ADVERSARIAL REVIEW. A verb to-actions.ts only names is not automation on
   * any board; the probe misses some because pump and gain-control check for an
   * empty selector before they defer. Same rule as ability-layer-coverage.mjs. */
  if (hasDeferredVerb(effects) && !decision) {
    return { status: 'dead', why: 'to-actions.ts names the effect and never resolves it' };
  }
  switch (ability.kind) {
    case 'triggered': {
      /* ADVERSARIAL REVIEW. Ownership first. A trigger the bridge refuses is
       * dead whether or not it also wants a choice; grading it `decision` put
       * 174 cards in a bucket described as one prompt short when the trigger
       * does not fire at all. Same change as ability-layer-coverage.mjs. */
      if (!ownsTriggers) {
        const reason = unrunnableReason(ability);
        return { status: 'dead', why: `trigger not owned: ${reason ?? 'another clause on the card disqualified it'}` };
      }
      if (ability.optional) return { status: 'decision', why: 'optional trigger ("you may")' };
      if (decision) return { status: 'decision', why: `trigger contains ${decision}` };
      return { status: 'run', why: 'triggers.ts runs it via ownedTriggersOf' };
    }
    case 'static': {
      if (decision) return { status: 'decision', why: `static contains ${decision}` };
      const deadStatic = staticDeadModification(ability);
      if (deadStatic) return { status: 'dead', why: deadStatic };
      return { status: 'run', why: 'statics.ts applies it via layeredState' };
    }
    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      if (selfEnters && r.do === 'enters-tapped') return { status: 'run', why: 'intrinsic enters-tapped' };
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) {
        return { status: 'run', why: 'intrinsic enters-with-counters' };
      }
      return { status: 'dead', why: 'replacement: intrinsic.ts derives neither' };
    }
    case 'keyword':
      return keywordSupport(ability.keyword ?? '') === 'engine'
        ? { status: 'run', why: 'ENGINE_KEYWORDS' }
        : { status: 'dead', why: `advisory keyword "${(ability.keyword ?? '').toLowerCase()}"` };
    case 'activated':
      return { status: 'dead', why: 'activated ability: no call site' };
    case 'spell':
      return { status: 'dead', why: 'spell ability: nothing runs it on resolution' };
    case 'mana':
      return { status: 'dead', why: 'mana ability: mana.ts approximates instead' };
    default:
      return { status: 'dead', why: `unknown ability kind ${ability.kind}` };
  }
}

/**
 * `Effect` members `to-actions.ts` NAMES instead of executing.
 *
 * Read off `src/lib/game/abilities/to-actions.ts`, one entry per `case` whose
 * only statement is a `scope.deferred.push`. This list is the correction to a
 * mistake this scan made on its first run and tranche 2 paid for: the ability
 * verdict switch asks what KIND of ability a marker sits in, and a triggered
 * ability on a derived event is called "run" whether its effects execute or
 * not. Teaching "it gets +2/+0 until end of turn" produced 53 cards the static
 * verdict called AUTOMATED and the behaviour probe downgraded on the spot,
 * because `pump` is a duration-limited continuous effect and `GameState` has no
 * list to put one in.
 *
 * So a family whose verb is on this list buys a compiler-ceiling number and no
 * player-visible change, and a plan that does not say so is the same
 * "the engine supports it" claim this project has already been burned by.
 */
const DEFERRED_EFFECT_VERBS = new Set([
  'pump',           // to-actions.ts case 'pump'          — no continuous-effect list
  'gain-control',   // to-actions.ts case 'gain-control'  — same
  'search-library', // to-actions.ts case 'search-library'— a hidden zone the player must pick from
  'return-from',    // to-actions.ts case 'return-from'   — same
  'add-mana',       // to-actions.ts case 'add-mana'      — mana.ts counts sources
  'counter',        // to-actions.ts case 'counter'       — there is no stack
  'choose-mode',    // to-actions.ts case 'choose-mode'   — a decision
  'may',            // to-actions.ts case 'may'           — a decision
  'unless-pays',    // to-actions.ts case 'unless-pays'   — an opponent's decision
  'do-if-cost-paid',// to-actions.ts case 'do-if-cost-paid' — the controller's own, with a price
  'scry',           // to-actions.ts case 'scry'           — which cards go to the bottom
  'surveil',        // to-actions.ts case 'surveil'        — which cards go to the graveyard
  'look-and-pick',  // to-actions.ts case 'look-and-pick'  — which cards are taken
]);
// `manual` is deliberately NOT on the list. Every ability in this cohort has one
// by definition — it is the thing being taught away — so counting it would mark
// every family "engine defers" and the column would say nothing.

/** Does this effect tree already contain a verb the engine only names? */
function hasDeferredVerb(effects) {
  for (const e of effects ?? []) {
    if (DEFERRED_EFFECT_VERBS.has(e.do)) return true;
    if ((e.do === 'if' || e.do === 'do-if-cost-paid') && (hasDeferredVerb(e.then) || hasDeferredVerb(e.else))) return true;
    if ((e.do === 'for-each' || e.do === 'repeat') && hasDeferredVerb(e.effects)) return true;
  }
  return false;
}

/**
 * Would this ability RUN if every `{do:'manual'}` inside it were taught?
 *
 * The manual marker is the only thing being removed, so everything else about
 * the ability is asked exactly as it stands: kind, event, targets, optionality.
 * A trigger on an event the engine never derives stays dead however well the
 * verb is read, and that is the point of asking.
 */
function runnableIfTaught(ability) {
  switch (ability.kind) {
    case 'static': {
      const deadStatic = staticDeadModification(ability);
      return deadStatic ? { ok: false, why: deadStatic } : { ok: true, why: 'static' };
    }
    case 'triggered': {
      const reason = unrunnableReason(ability);
      if (reason) return { ok: false, why: `trigger: ${reason}` };
      return { ok: true, why: 'trigger on a derived event' };
    }
    case 'replacement':
      return { ok: false, why: 'replacement: intrinsic.ts derives only two results' };
    case 'activated':
      return { ok: false, why: 'activated: no call site' };
    case 'spell':
      return { ok: false, why: 'spell: nothing runs it on resolution' };
    case 'mana':
      return { ok: false, why: 'mana: mana.ts approximates instead' };
    case 'keyword':
      return { ok: false, why: 'keyword carries no effect body' };
    default:
      return { ok: false, why: `unknown kind ${ability.kind}` };
  }
}

/* ------------------------------------------------------------------ *
 * Candidate families
 *
 * A family is a set of phrase shapes ONE piece of grammar work would read. It
 * is the right unit for planning and the wrong unit for bragging, so it is
 * measured the strict way: a card counts for a family only when EVERY marker
 * still blocking it matches that family, and the ability each marker sits in is
 * one a live consumer would run once the marker is gone.
 *
 * The regexes are written against the marker text, which is normalised oracle
 * text — lowercased, apostrophes stripped, the card's own name replaced by `~`.
 * ------------------------------------------------------------------ */

const FAMILIES = [
  ['it-as-object',
    /^(?:put (?:a|two|three|\d+) [+-]\d+\/[+-]\d+ counters? on it|remove a [+-]\d+\/[+-]\d+ counter from it|it gets? [+-]\d+\/[+-]\d+(?: and gains? [a-z, ]+)? until end of turn|it gains? [a-z, ]+ until end of turn|return it to its owners hand|destroy it|exile it|sacrifice it|tap it|untap it|put it on top of its owners library|put it into its owners graveyard)$/],
  ['if-you-do',
    /^if you (?:do|dont)(?:,| ).+$/],
  ['cda-single-characteristic',
    /^~s (?:power|toughness) is equal to .+$/],
  ['scry-surveil',
    /^(?:scry|surveil) \d+$/],
  ['named-mechanic',
    /^(?:it explores|it connives|it endures \d+|investigate|proliferate|learn|it assembles a contraption|you take the initiative|the ring tempts you|venture into the dungeon|open an attraction|support \d+|bolster \d+|amass [a-z]+ \d+|manifest dread|recruit|earthbend \d+)$/],
  ['library-peek',
    /^(?:look at the top .+|put the rest .+|reveal the top card of your library|you may look at the top card of your library)$/],
  ['bounce-a-permanent-you-control',
    /^return (?:a|an|another) (?:[a-z ]+ )?you control to its owners hand$/],
];

function familyOf(text) {
  for (const [name, re] of FAMILIES) if (re.test(text)) return name;
  return null;
}

/** Every `{do:'manual'}` marker text in a tree, in order. */
function manualTexts(effects, out = []) {
  for (const e of effects ?? []) {
    if (e.do === 'manual') out.push(String(e.text ?? ''));
    else if (e.do === 'if') { manualTexts(e.then, out); manualTexts(e.else, out); }
    else if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may') manualTexts(e.effects, out);
    else if (e.do === 'choose-mode') for (const m of e.modes) manualTexts(m.effects, out);
    else if (e.do === 'unless-pays') manualTexts(e.otherwise, out);
  }
  return out;
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

const ctx = { types: creatureTypeSet(pool), names: nameSet(pool), selfNames: [] };

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/** phrase -> cards where it is the ONLY blocker on the card. */
const sole = new Map();
/** phrase -> cards whose every blocker is a manual marker (this one included). */
const withKin = new Map();
/** phrase -> cards where it is the only blocker but the ability is unreachable. */
const soleUnreachable = new Map();
/** phrase -> the unreachable reason, for the report. */
const unreachableWhy = new Map();
/** phrase -> one example card name. */
const example = new Map();
/** phrase -> total cards carrying it at all. */
const appears = new Map();
/** family -> cards it would finish ALONE (every remaining blocker is in it). */
const familyFinishes = new Map();
/** family -> of those, how many would land as a PLAYER DECISION, not automation. */
const familyDecides = new Map();
/** family -> of those, how many carry a verb the engine only NAMES. */
const familyDeferred = new Map();
/** family -> one example card. */
const familyExample = new Map();
/** Cards finished by the union of every family below, for the composition test. */
let unionFinishes = 0;

let accountingFailures = 0;
let manualOnlyCards = 0;
let poolWithText = 0;

for (const card of pool) {
  let trace;
  try {
    trace = compileWithTrace(card, ctx);
  } catch {
    continue;
  }
  const { result } = trace;
  try {
    assertClausesAccounted(trace);
  } catch {
    accountingFailures++;
  }

  const abilities = result.abilities ?? [];
  if (abilities.length === 0 && (result.unparsed ?? []).length === 0) continue;
  poolWithText++;

  // Card-level ownership, computed the same way abilityEngineOwns computes it.
  const triggered = abilities.filter(a => a.kind === 'triggered');
  const ownsTriggers =
    result.coverage === 'full' &&
    triggered.length > 0 &&
    triggered.every(a => unrunnableReason(a) === null);

  // Blockers of every kind.
  const unparsedCount = (result.unparsed ?? []).length;
  let deadCount = 0;
  let decisionCount = 0;
  /** marker text -> the ability it sits inside (first one wins). */
  const markers = new Map();

  for (const ability of abilities) {
    const effects = effectsOf(ability);
    const texts = manualTexts(effects);
    if (texts.length > 0) {
      for (const t of texts) if (!markers.has(t)) markers.set(t, ability);
      continue; // a manual ability is counted as a manual blocker, not a dead one
    }
    const st = abilityStatus(ability, ownsTriggers);
    if (st.status === 'dead') deadCount++;
    else if (st.status === 'decision') decisionCount++;
  }

  for (const t of markers.keys()) bump(appears, t);

  const otherBlockers = unparsedCount + deadCount + decisionCount;
  if (otherBlockers > 0) continue;          // something else already sinks the card
  if (markers.size === 0) continue;         // nothing manual to teach

  manualOnlyCards++;

  for (const [text, ability] of markers) {
    if (!example.has(text)) example.set(text, card.name);
    const reach = runnableIfTaught(ability);
    if (markers.size === 1) {
      if (reach.ok) bump(sole, text);
      else { bump(soleUnreachable, text); unreachableWhy.set(text, reach.why); }
    }
    if (reach.ok) bump(withKin, text);
  }

  /* Families. Strict: every marker on the card must be in the same family AND
   * sit in an ability a live consumer would run once the marker is gone. One
   * marker outside the family and the card is not credited to it, because
   * teaching that family would leave the card exactly as SILENT as it is now. */
  const names = [...markers.keys()].map(familyOf);
  const reachable = [...markers.values()].every(a => runnableIfTaught(a).ok);
  if (reachable && names.every(n => n !== null)) {
    unionFinishes++;
    const distinct = [...new Set(names)];
    if (distinct.length === 1) {
      const fam = distinct[0];
      bump(familyFinishes, fam);
      if (!familyExample.has(fam)) familyExample.set(fam, card.name);
      // Would the finished card be AUTOMATED or PROMPTABLE? A `may` or a
      // `choose-mode` left anywhere in the tree makes it the player's call, and
      // this project counts that separately on purpose.
      const decides = [...markers.values()].some(
        a => a.optional === true || decisionReason(effectsOf(a)) !== null
      ) || fam === 'if-you-do';
      if (decides) bump(familyDecides, fam);
      // A card whose surviving verbs the engine only NAMES finishes on paper and
      // not on the board. Counted apart so a family cannot be sold on the first
      // number alone.
      if ([...markers.values()].some(a => hasDeferredVerb(effectsOf(a)))) bump(familyDeferred, fam);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const line = (s = '') => console.log(s);
const soleTotal = [...sole.values()].reduce((a, b) => a + b, 0);
const unreachTotal = [...soleUnreachable.values()].reduce((a, b) => a + b, 0);

line('=========================================================');
line(' EFFECT-PHRASE SCAN — which sentence finishes a card');
line('=========================================================');
line();
line(`pool                       ${pool.length}`);
line(`cards with compiled text   ${poolWithText}`);
line(`accounting failures        ${accountingFailures}`);
line(`cards blocked ONLY by manual markers   ${manualOnlyCards}`);
line(`  of those, exactly one marker, in a reachable ability: ${soleTotal}`);
line(`  of those, exactly one marker, ability unreachable:    ${unreachTotal}`);
line();
line('-- CANDIDATE FAMILIES: cards each would finish ON ITS OWN --');
line('  (strict: every remaining marker on the card is in that one family)');
line('  finish  DECISION  engine-defers  family');
for (const [k, v] of topOf(familyFinishes, 40)) {
  line(`  ${String(v).padStart(6)}  ${String(familyDecides.get(k) ?? 0).padStart(8)}  ${String(familyDeferred.get(k) ?? 0).padStart(13)}  ${k}   e.g. ${familyExample.get(k)}`);
}
line(`  cards every family above finishes between them (mixed families included): ${unionFinishes}`);
line();
line('-- top 80 phrases: SOLE blocker, ability a live consumer would run --');
line('  finish  appears  phrase');
for (const [k, v] of topOf(sole, 80)) {
  line(`  ${String(v).padStart(6)}  ${String(appears.get(k) ?? 0).padStart(7)}  ${k.slice(0, 96)}`);
}
line();
line('-- top 30 phrases: SOLE blocker, but the ability is DEAD anyway --');
line('  wasted  reason / phrase');
for (const [k, v] of topOf(soleUnreachable, 30)) {
  line(`  ${String(v).padStart(6)}  ${(unreachableWhy.get(k) ?? '').slice(0, 44).padEnd(44)} ${k.slice(0, 66)}`);
}
line();
line('-- top 60 phrases: card is manual-only, phrase sits in a runnable ability --');
line('  cards  phrase');
for (const [k, v] of topOf(withKin, 60)) {
  line(`  ${String(v).padStart(5)}  ${k.slice(0, 104)}`);
}

writeFileSync(OUT, JSON.stringify({
  pool: pool.length,
  poolWithText,
  manualOnlyCards,
  soleTotal,
  unreachTotal,
  families: [...familyFinishes.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>({family:k,finishes:v,decisions:familyDecides.get(k)??0,engineDefers:familyDeferred.get(k)??0,example:familyExample.get(k)})),
  unionFinishes,
  sole: [...sole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 600)
    .map(([k, v]) => ({ phrase: k, finishes: v, appears: appears.get(k) ?? 0, example: example.get(k) })),
  soleUnreachable: [...soleUnreachable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300)
    .map(([k, v]) => ({ phrase: k, wasted: v, why: unreachableWhy.get(k) })),
  withKin: [...withKin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 600)
    .map(([k, v]) => ({ phrase: k, cards: v, example: example.get(k) })),
}, null, 2));
line();
line(`written: ${OUT}`);
