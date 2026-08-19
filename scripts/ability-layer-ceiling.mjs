/**
 * WHAT A PERFECT ABILITY LAYER WOULD BE WORTH.
 *
 * Every earlier script in this folder measures what the compiler reads TODAY.
 * This one answers a different question, and it is the one that decides whether
 * a fourth tranche of grammar is worth writing:
 *
 *   Suppose the grammar in `src/lib/cards/abilities/**` were PERFECT. Every
 *   unparsed paragraph parses, every `{do:'manual'}` marker becomes the right
 *   typed effect, nothing is refused. How many cards would a player then see
 *   working, and how many would still do nothing?
 *
 * The answer is an upper bound and is labelled one everywhere it is printed.
 * It assumes away all remaining grammar work at once, which is not a plan; it
 * exists to size the prize, and the prize turns out to be much smaller than the
 * amount of grammar left, because the card verdict is all-or-nothing and the
 * things that sink a card are mostly not in this folder.
 *
 * ## Method
 *
 * A card is AUTOMATED only when EVERY paragraph on it reaches a live consumer.
 * So the ceiling is computed by walking a card's paragraphs and asking, for
 * each, "who owns the fix" — this folder, or a named file somewhere else:
 *
 *   1. Paragraphs that already compiled are asked the real question, with the
 *      real predicates: `unrunnableReason` from `trigger-bridge.ts`,
 *      `keywordSupport` from `keywords.ts`, and the corrected static verdict
 *      (see the T3 CORRECTION block in `ability-layer-coverage.mjs`).
 *
 *   2. Paragraphs that did NOT compile — unparsed lines and lines that compiled
 *      to a manual marker — are GRANTED. The grammar is assumed to read them
 *      perfectly. What is then asked is where the resulting ability would live,
 *      which is decided by the shape of the line and not by the grammar:
 *
 *        a `cost:` head    -> activated. `activatedAbilitiesOf` has no call
 *                             site, so a perfect parse of it changes nothing.
 *        an instant/sorcery-> spell. `stack.ts` resolves a spell without ever
 *          body               reading a compiled ability.
 *        when/whenever/at  -> triggered, and reachable only if the engine
 *                             derives the event. `DERIVED_EVENTS` below is
 *                             probed out of `unrunnableReason` rather than
 *                             copied, so it cannot drift from it.
 *        a keyword line    -> `keywords.ts` decides, not the compiler.
 *        anything else on  -> static. `scanStatics` has no whole-card gate, so
 *          a permanent        this is the reachable case.
 *
 * Every blocker is attributed to ONE owner, and the owners are named files, so
 * the output is a work order rather than an opinion.
 *
 * ## What this bound is still optimistic about
 *
 * Stated plainly, because the number is useless if the reader has to guess:
 *
 *   - `to-actions.ts` NAMES seven effect verbs instead of executing them
 *     (`pump`, `gain-control`, `search-library`, `return-from`, and the three
 *     decisions). A perfectly parsed line that lands on one of those is counted
 *     reachable here and would still be a log entry on the board. The marker
 *     scan's `engine-defers` column is where that is measured; it cannot be
 *     measured for a line that has no ability yet.
 *   - A trigger on a derived event can still be refused by `unrunnableReason`
 *     for a reason the line does not show — announced targets, most often.
 *     Those are counted reachable here.
 *   - The `static` bucket is the default, so it catches every line on a
 *     permanent that is not a trigger or a cost head, and it counts all of them
 *     reachable. In truth a good share of them would compile to a restriction
 *     `combat.ts` never asks about or to a cost modification nothing calls —
 *     the two the T3 correction just moved into `dead`. "Welkin Tern can block
 *     only creatures with flying" is in this bucket and would not work.
 *
 * Both push the ceiling UP, so the true ceiling is lower than this prints, and
 * the conclusion the number supports only gets stronger.
 *
 * No Supabase, no network, no model. Reads the cached bulk file on disk.
 *
 * Usage:  node --experimental-strip-types scripts/ability-layer-ceiling.mjs
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
const OUT = join(ROOT, 'scratch', 'ability-layer-ceiling.json');

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) yield JSON.parse(line);
  }
}

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));
const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/* ------------------------------------------------------------------ *
 * The owners. One string per file that would have to change.
 * ------------------------------------------------------------------ */

const OWNER = {
  GRAMMAR: 'src/lib/cards/abilities/** (this folder: grammar)',
  ACTIVATED: 'src/lib/game/** — activatedAbilitiesOf has no call site',
  SPELL: 'src/lib/game/stack.ts — nothing runs a compiled spell on resolution',
  KEYWORDS: 'src/lib/game/keywords.ts — advisory keyword, applied by hand',
  EVENTS: 'src/lib/game/triggers.ts — deriveTriggerEvents emits no such event',
  TRIGGER_BRIDGE: 'src/lib/game/abilities/trigger-bridge.ts — unrunnableReason refuses it',
  INTRINSIC: 'src/lib/game/intrinsic.ts — derives only two replacement results',
  STATICS: 'src/lib/game/abilities/statics.ts — collected, never read',
  MANA: 'src/lib/game/mana.ts — approximates sources instead',
  BACK_FACE: 'src/lib/cards/abilities/normalize.ts — back faces are a declared gap',
  DECISION: '(not a blocker) needs a player choice — a prompt, not automation',
};

/* Restriction rules `combat.ts` actually asks about. Same list, same reason, as
 * the T3 CORRECTION in ability-layer-coverage.mjs. */
const READ_RESTRICTIONS = new Set(['cant-attack', 'cant-block']);

function staticDeadModification(ability) {
  for (const modification of ability.modifications ?? []) {
    if (modification.layer === 'cost-modify') {
      return 'static cost modification: costAdjustmentFor has no call site';
    }
    if (modification.layer === 'restriction' && !READ_RESTRICTIONS.has(modification.rule?.rule)) {
      return `static restriction "${modification.rule?.rule}": no reader outside its own tests`;
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

/* ------------------------------------------------------------------ *
 * Trigger events the engine derives, probed out of the real predicate.
 * ------------------------------------------------------------------ */

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

/**
 * Which derived event a trigger LINE names, or `null` when the shape is one the
 * engine cannot observe. Deliberately strict on the two that look derivable and
 * are not:
 *
 *   "whenever ANOTHER creature enters"     — `gameEventKindFor` requires the
 *   "whenever you cast a spell that ..."     event's subject to be the source,
 *                                            and `sourcesFor` cannot deliver
 *                                            any other subject.
 *
 * Reading those as `enters` and `cast` would inflate the ceiling by counting
 * work the engine has no hook for.
 */
function derivedEventOfLine(text) {
  const selfSubject = /^(when|whenever) ~ /.test(text) || /^(when|whenever) this /.test(text);
  if (/^at the beginning of your upkeep/.test(text)) return 'upkeep';
  if (/^at the beginning of your end step/.test(text)) return 'end-step';
  if (/^whenever you draw a card/.test(text)) return 'draws-card';
  if (!selfSubject) return null;
  if (/\benters\b/.test(text)) return 'enters';
  if (/\bdies\b/.test(text)) return 'dies';
  if (/\battacks\b/.test(text)) return 'attacks';
  if (/\bblocks\b/.test(text)) return 'blocks';
  if (/\bdeals (combat )?damage\b/.test(text)) return 'deals-damage';
  if (/^(when|whenever) you cast ~/.test(text)) return 'cast';
  return null;
}

const TRIGGER_HEAD = /^(when|whenever|at the beginning|at end of)\b/;
const COST_HEAD = /^([^:"]{1,60}):\s/;

/**
 * Where a line the grammar has NOT read would land, and who owns the fix.
 * `ok` means: a perfect parse of this line reaches a live consumer.
 */
function homeOfUnreadLine(norm, isSpellCard) {
  if (COST_HEAD.test(norm) && !TRIGGER_HEAD.test(norm)) {
    return { ok: false, owner: OWNER.ACTIVATED, home: 'activated' };
  }
  if (TRIGGER_HEAD.test(norm)) {
    const on = derivedEventOfLine(norm);
    if (!on) return { ok: false, owner: OWNER.EVENTS, home: 'triggered' };
    if (!DERIVED_EVENTS.has(on)) return { ok: false, owner: OWNER.EVENTS, home: 'triggered' };
    return { ok: true, owner: OWNER.GRAMMAR, home: 'triggered' };
  }
  if (/^(as|if) ~ enters/.test(norm) || /^if .* would .* instead/.test(norm)) {
    return { ok: false, owner: OWNER.INTRINSIC, home: 'replacement' };
  }
  if (isSpellCard) return { ok: false, owner: OWNER.SPELL, home: 'spell' };
  return { ok: true, owner: OWNER.GRAMMAR, home: 'static' };
}

/** Where an ability that DID compile lands, and who owns the fix if it is dead. */
function homeOfCompiled(ability, ownsTriggers) {
  const decision = decisionReason(effectsOf(ability));
  switch (ability.kind) {
    case 'triggered': {
      /* ADVERSARIAL REVIEW. Ownership first. A trigger the bridge refuses is
       * blocked by the bridge, not by the missing prompt, and naming the prompt
       * as its owner sent the fix to the wrong place. Same change as
       * ability-layer-coverage.mjs. */
      if (!ownsTriggers) {
        const why = unrunnableReason(ability) ?? '';
        const owner = /event/.test(why) ? OWNER.EVENTS : OWNER.TRIGGER_BRIDGE;
        return { ok: false, decision: false, owner, home: 'triggered' };
      }
      if (ability.optional || decision) return { ok: true, decision: true, owner: OWNER.DECISION, home: 'triggered' };
      return { ok: true, decision: false, owner: OWNER.GRAMMAR, home: 'triggered' };
    }
    case 'static': {
      if (decision) return { ok: true, decision: true, owner: OWNER.DECISION, home: 'static' };
      const dead = staticDeadModification(ability);
      if (dead) return { ok: false, decision: false, owner: OWNER.STATICS, home: 'static' };
      return { ok: true, decision: false, owner: OWNER.GRAMMAR, home: 'static' };
    }
    case 'replacement': {
      const r = ability.result ?? {};
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      const live =
        (selfEnters && r.do === 'enters-tapped') ||
        (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0);
      return live
        ? { ok: true, decision: false, owner: OWNER.GRAMMAR, home: 'replacement' }
        : { ok: false, decision: false, owner: OWNER.INTRINSIC, home: 'replacement' };
    }
    case 'keyword':
      return keywordSupport(ability.keyword ?? '') === 'engine'
        ? { ok: true, decision: false, owner: OWNER.GRAMMAR, home: 'keyword' }
        : { ok: false, decision: false, owner: OWNER.KEYWORDS, home: 'keyword' };
    case 'activated':
      return { ok: false, decision: false, owner: OWNER.ACTIVATED, home: 'activated' };
    case 'spell':
      return { ok: false, decision: false, owner: OWNER.SPELL, home: 'spell' };
    case 'mana':
      return { ok: false, decision: false, owner: OWNER.MANA, home: 'mana' };
    default:
      return { ok: false, decision: false, owner: OWNER.ACTIVATED, home: String(ability.kind) };
  }
}

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. The bulk file is cached; this script never downloads.`);
  process.exit(1);
}

const pool = [];
for await (const card of rows(SRC)) {
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

const ceiling = new Map();       // CEILING-AUTOMATED | CEILING-PROMPTED | CEILING-SILENT | NO-TEXT
const blockedBy = new Map();     // owner -> cards it alone would still sink
const soleOwner = new Map();     // owner -> cards where it is the ONLY owner blocking
const grammarWorth = new Map();  // how much grammar is left on the cards grammar can still finish
const stillSilentSamples = [];
const grammarWinSamples = [];

let cardsWithText = 0;
let grammarOnlyCards = 0;     // cards where GRAMMAR is the one and only remaining owner
let grammarLinesLeft = 0;     // unread paragraphs on those cards
let alreadyDone = 0;          // cards with nothing unread and nothing dead: working today

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
  if (abilities.length === 0 && unparsed.length === 0) { bump(ceiling, 'NO-TEXT'); continue; }
  cardsWithText++;

  const isSpellCard = /\b(instant|sorcery)\b/.test(normalized.typeLine)
    && !/\b(creature|artifact|enchantment|land|planeswalker|battle)\b/.test(normalized.typeLine);

  const triggered = abilities.filter(a => a.kind === 'triggered');
  /*
   * The GRANT, applied to `abilityEngineOwns`'s three conditions.
   *
   * Condition 1 is `coverage === 'full'`, which is exactly what a perfect
   * grammar delivers, so it is dropped. Conditions 2 and 3 — at least one
   * trigger, and every trigger passing `unrunnableReason` — are asked of the
   * real abilities, unchanged. That is the difference between "assume the
   * grammar is perfect" and "assume everything is fine": a trigger on an event
   * `deriveTriggerEvents` never emits stays unrunnable however well its verb is
   * read, and it is `triggers.ts` that owns the fix, not this folder.
   */
  const ownsTriggers =
    triggered.length > 0 &&
    triggered.every(a => unrunnableReason(a) === null);

  /** Every owner that would still have to change for this card to work. */
  const owners = new Set();
  let anyDecision = false;
  let unreadOnThisCard = 0;

  // 1. Paragraphs the grammar has not read. GRANTED, then routed by shape.
  const paraBySpan = new Map(normalized.paragraphs.map(p => [`${p.span[0]}:${p.span[1]}`, p]));
  for (const u of unparsed) {
    const para = paraBySpan.get(`${u.span[0]}:${u.span[1]}`);
    if (para && para.face > 0) { owners.add(OWNER.BACK_FACE); continue; }
    unreadOnThisCard++;
    const home = homeOfUnreadLine(String(para?.norm ?? ''), isSpellCard);
    if (!home.ok) owners.add(home.owner);
  }

  // 2. Abilities that compiled but kept a manual marker. Same grant: assume the
  //    marker becomes the right effect, then ask where the ability lives.
  //    Asked of the REAL ability, which is stricter than asking of the line.
  for (const ability of abilities) {
    if (hasManualEffect(effectsOf(ability))) unreadOnThisCard++;
    const home = homeOfCompiled(ability, ownsTriggers);
    if (home.decision) { anyDecision = true; continue; }
    if (!home.ok) owners.add(home.owner);
  }

  const hard = [...owners].filter(o => o !== OWNER.GRAMMAR);
  const verdict = hard.length > 0
    ? 'CEILING-SILENT'
    : anyDecision ? 'CEILING-PROMPTED' : 'CEILING-AUTOMATED';
  bump(ceiling, verdict);

  for (const o of hard) bump(blockedBy, o);
  if (hard.length === 1) bump(soleOwner, hard[0]);

  if (hard.length === 0) {
    if (unreadOnThisCard === 0) alreadyDone++;
    else {
      grammarOnlyCards++;
      grammarLinesLeft += unreadOnThisCard;
      bump(grammarWorth, String(unreadOnThisCard));
      if (grammarWinSamples.length < 25) {
        grammarWinSamples.push(`${card.name} :: ${(card.oracle_text ?? '').replace(/\n/g, ' | ').slice(0, 110)}`);
      }
    }
  } else if (stillSilentSamples.length < 12) {
    stillSilentSamples.push(`${card.name} :: ${hard[0]}`);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const line = (s = '') => console.log(s);
const total = pool.length;
const ceilAuto = ceiling.get('CEILING-AUTOMATED') ?? 0;
const ceilPrompt = ceiling.get('CEILING-PROMPTED') ?? 0;
const ceilSilent = ceiling.get('CEILING-SILENT') ?? 0;

line('=========================================================');
line(' ABILITY-LAYER CEILING — an UPPER BOUND, not a forecast');
line('=========================================================');
line();
line('  Assumes every remaining line in src/lib/cards/abilities/** parses');
line('  PERFECTLY, then asks what a player would see. See the file header for');
line('  the two ways this bound is still optimistic.');
line();
line(`pool                        ${total}`);
line(`cards with text             ${cardsWithText}`);
line(`derived trigger events      ${[...DERIVED_EVENTS].sort().join(', ')}`);
line();
line('-- IF THE GRAMMAR WERE PERFECT --');
line(`  CEILING-AUTOMATED   ${String(ceilAuto).padStart(6)}  ${pct(ceilAuto, total)}%`);
line(`  CEILING-PROMPTED    ${String(ceilPrompt).padStart(6)}  ${pct(ceilPrompt, total)}%   (needs a choice; no prompt exists yet)`);
line(`  CEILING-SILENT      ${String(ceilSilent).padStart(6)}  ${pct(ceilSilent, total)}%   an engine file owns the fix`);
line(`  NO-TEXT             ${String(ceiling.get('NO-TEXT') ?? 0).padStart(6)}`);
line();
line(`  of the ceiling-reachable cards, working TODAY:            ${alreadyDone}`);
line(`  and waiting on grammar alone:                             ${grammarOnlyCards}`);
line(`  unread paragraphs left on those ${grammarOnlyCards} cards:  ${grammarLinesLeft}`);
line();
line('-- WHO OWNS THE FIX, for every card the grammar cannot finish --');
line('  (a card is counted once per owner, so this sums above the card count)');
line('  cards   owner');
for (const [owner, n] of topOf(blockedBy, 20)) {
  line(`  ${String(n).padStart(6)}  ${owner}`);
}
line();
line('-- THE ONLY THING IN THE WAY: cards one owner alone would finish --');
line('  cards   owner');
for (const [owner, n] of topOf(soleOwner, 20)) {
  line(`  ${String(n).padStart(6)}  ${owner}`);
}
line();
line('-- how much grammar is left per card, on the cards grammar can finish --');
line('  cards   unread paragraphs on the card');
for (const [n, cards] of [...grammarWorth.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  line(`  ${String(cards).padStart(6)}  ${n}`);
}
line();
line('-- samples: cards waiting on GRAMMAR ONLY --');
for (const s of grammarWinSamples) line(`   ${s}`);
line();
line('-- samples: cards an engine file owns --');
for (const s of stillSilentSamples) line(`   ${s}`);

writeFileSync(OUT, JSON.stringify({
  pool: total,
  cardsWithText,
  derivedEvents: [...DERIVED_EVENTS].sort(),
  ceiling: Object.fromEntries(ceiling),
  alreadyDone,
  grammarOnlyCards,
  grammarLinesLeft,
  blockedBy: Object.fromEntries(blockedBy),
  soleOwner: Object.fromEntries(soleOwner),
  grammarWorth: Object.fromEntries(grammarWorth),
}, null, 2));
line();
line(`written: ${OUT}`);
