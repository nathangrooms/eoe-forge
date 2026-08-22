/**
 * DeckMatrix - which single blocker is holding back the most CARDS.
 *
 * ## Why this exists, when `verify-ability-coverage.mjs` already prints a list
 *
 * That script's "DEAD, by reason" table counts ABILITY HITS. A card is SILENT
 * when ANY of its abilities is dead, so a table of ability hits cannot answer
 * the only question a tranche needs answered: if I fix exactly one thing, how
 * many CARDS stop being silent. The top line of that table was 3,690 hits for
 * activated abilities, but a card whose activated ability is dead AND whose
 * oracle text is half unparsed does not move when the activated verdict moves.
 *
 * This script answers the card question, and it answers it ORDER-INDEPENDENTLY.
 * There is no greedy walk and no "and then". For each card it records the SET of
 * distinct blocker labels standing between that card and a verdict. Then:
 *
 *   SOLE      cards whose blocker set is exactly {B}. Fixing B alone flips
 *             every one of them and nothing else has to happen first. This is
 *             the number a tranche can promise.
 *   INVOLVED  cards whose blocker set merely CONTAINS B. Always larger, always
 *             an overstatement if quoted as a gain, printed so the gap between
 *             the two is visible rather than hidden.
 *
 * A group of labels is scored the same way: cards whose whole blocker set fits
 * inside the group. That is what "do all of these together" is worth, and it is
 * not the sum of the individual SOLE counts.
 *
 * ## What it deliberately does NOT claim
 *
 * SOLE is a CEILING for the label, not a promise of AUTOMATED. A card that
 * clears its last blocker still has to survive the behaviour probe in the
 * coverage script, and a card whose blocker was a player decision lands in
 * PROMPTABLE rather than AUTOMATED. Both are printed separately below. The one
 * number that means "a player sees this work" is still AUTOMATED out of
 * `verify-ability-coverage.mjs`, and nothing here replaces it.
 *
 * The grading is a deliberate copy of `verify-ability-coverage.mjs`'s strict
 * rule rather than an import, because that file computes verdicts inline in one
 * pass and has no exported hook. The copy is checked: this script prints its own
 * AUTOMATED and PROMPTABLE totals, and they must match that script's pre-probe
 * figures. If they drift, the copy went stale and the drift is visible on every
 * run instead of being discovered later.
 *
 * Local file only. No Supabase, no network, no model.
 */

import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileWithTrace } from '../src/lib/cards/abilities/compiler.ts';
import { hasManualEffect, effectsOf } from '../src/lib/cards/abilities/dsl.ts';
import { unrunnableReason, unrunnableReasons } from '../src/lib/game/abilities/trigger-bridge.ts';
import { keywordSupport } from '../src/lib/game/keywords.ts';
import { probeEffects } from '../src/lib/game/abilities/behaviour-probe.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scratch', 'scryfall', 'oracle-cards.jsonl');
const OUT = join(ROOT, 'scratch', 'blocker-marginal.json');

const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (n, d) => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

/* ------------------------------------------------------------------ *
 * Pool, identical filter to verify-ability-coverage.mjs
 * ------------------------------------------------------------------ */

async function* rows(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}. Cached bulk file only; this script never downloads.`);
  process.exit(1);
}

const NOT_A_CARD = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card']);
const NOT_A_NORMAL_GAME = new Set(['planar', 'scheme', 'vanguard']);
const NOT_A_GAME_PRODUCT = new Set(['token', 'memorabilia']);

const pool = [];
for await (const c of rows(SRC)) {
  if (NOT_A_CARD.has(c.layout)) continue;
  if (NOT_A_GAME_PRODUCT.has(c.set_type)) continue;
  if (NOT_A_NORMAL_GAME.has(c.layout)) continue;
  if (c.digital) continue;
  if (!(c.games ?? []).includes('paper')) continue;
  pool.push(c);
}

/* ------------------------------------------------------------------ *
 * The same measured verb list, run rather than written down
 * ------------------------------------------------------------------ */

const VERB_PROBES = {
  pump: [{ do: 'pump', what: { sel: 'self' }, power: 1, toughness: 1, duration: 'end-of-turn' }],
  'gain-control': [
    { do: 'gain-control', what: { sel: 'all', where: { is: 'type', value: 'creature' }, zone: 'battlefield' }, who: { who: 'you' }, duration: 'end-of-turn' },
  ],
  'search-library': [
    { do: 'search-library', who: { who: 'you' }, what: { sel: 'all', where: { is: 'type', value: 'creature' } }, count: 1, to: 'hand', thenShuffle: true },
  ],
  'return-from': [
    { do: 'return-from', zone: 'graveyard', who: { who: 'you' }, what: { sel: 'all', where: { is: 'type', value: 'creature' } }, count: 1, to: 'hand' },
  ],
  'add-mana': [{ do: 'add-mana', who: { who: 'you' }, mana: '{G}' }],
  counter: [{ do: 'counter', what: { sel: 'target', ref: 0 } }],
  damage: [{ do: 'damage', to: { sel: 'all', where: { is: 'type', value: 'creature' }, zone: 'battlefield' }, amount: 1 }],
};

const NEVER_RESOLVED = new Set();
for (const [verb, effects] of Object.entries(VERB_PROBES)) {
  if (probeEffects(effects).actions === 0) NEVER_RESOLVED.add(verb);
}

function neverResolvedVerb(effects) {
  for (const e of effects ?? []) {
    if (NEVER_RESOLVED.has(e.do)) return e.do;
    if (e.do === 'if') { const r = neverResolvedVerb(e.then) ?? neverResolvedVerb(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat' || e.do === 'may' || e.do === 'unless-pays') {
      const r = neverResolvedVerb(e.effects); if (r) return r;
    }
    if (e.do === 'choose-mode') for (const m of e.modes) { const r = neverResolvedVerb(m.effects); if (r) return r; }
  }
  return null;
}

function decisionIn(effects) {
  for (const e of effects ?? []) {
    if (e.do === 'may' || e.do === 'choose-mode' || e.do === 'unless-pays') return e.do;
    if (e.do === 'if') { const r = decisionIn(e.then) ?? decisionIn(e.else); if (r) return r; }
    if (e.do === 'for-each' || e.do === 'repeat') { const r = decisionIn(e.effects); if (r) return r; }
  }
  return null;
}

const RESTRICTIONS_COMBAT_READS = new Set(['cant-attack', 'cant-block']);

function deadGrant(modification) {
  for (const granted of modification.grant ?? []) {
    const k = String(granted).toLowerCase();
    if (keywordSupport(k) !== 'engine') return k;
  }
  return null;
}

/**
 * EVERY blocker on one ability. Empty when it runs.
 *
 * Plural, and that is the whole point of this script over the coverage script's
 * dead-reason table. `unrunnableReason` returns the FIRST reason a trigger
 * cannot run, which is correct for ownership and wrong for planning: Soul's
 * Attendant reads "the engine derives no event for enters" and, once that is
 * fixed, reads "you may" and is still silent. Ranking work by first reasons
 * therefore promises cards that a tranche cannot deliver. `unrunnableReasons`
 * returns all of them and this function keeps all of them.
 *
 * Labels are deliberately COARSER than the coverage script's `why` strings: a
 * tranche fixes "the engine derives no event for another permanent entering",
 * not one card's sentence. Where a family shares a fix it shares a label, and
 * the label names the fix rather than the symptom.
 */
function blockersFor(ability, ownsTriggers, scryfallKeywords) {
  if (hasManualEffect(effectsOf(ability))) return [{ kind: 'manual', label: '{do:manual} marker' }];

  const out = [];

  /*
   * NOT an early return, and this is the same mistake as the singular
   * `unrunnableReason` one level down. Timber Gorge reads "{T}: Add {R} or
   * {G}." Its first blocker is the unresolved `add-mana` verb, so an early
   * return here promises that a mana pool makes the card AUTOMATED. It does
   * not: behind the verb is a `choose-mode`, and the card lands in PROMPTABLE.
   * Both are recorded, so a tranche is sized on what it can actually deliver
   * and in which of the two buckets.
   */
  const verb = neverResolvedVerb(effectsOf(ability));
  if (verb) out.push({ kind: 'dead', label: `verb "${verb}" named and never resolved` });

  const decision = decisionIn(effectsOf(ability));

  switch (ability.kind) {
    case 'triggered': {
      const reasons = unrunnableReasons(ability);
      for (const reason of reasons) {
        // An optional trigger is a DECISION, not a dead end: what it is waiting
        // for is somebody to be asked, and that is PROMPTED rather than
        // AUTOMATED. Grading it dead would put it in a queue for engine work it
        // does not need.
        const kind = reason.startsWith('optional') ? 'decision' : 'dead';
        out.push({ kind, label: `trigger not owned: ${reason}` });
      }
      if (reasons.length === 0 && !ownsTriggers) {
        // Runnable in itself. The card is disowned by a SIBLING ability, which
        // is a different blocker and is recorded against that sibling too.
        out.push({ kind: 'dead', label: 'trigger not owned: another clause on the card disqualified it' });
      }
      /*
       * A `{do:'may'}` in the EFFECTS is a separate thing from `optional` on the
       * ability, and forgetting that under-counts the decision work badly.
       * Solemn Simulacrum's "When this creature dies, you may draw a card"
       * compiles with no `optional` flag at all; the choice is a `may` effect
       * inside. `unrunnableReasons` says nothing about it, the card IS owned,
       * and `to-actions.ts` still defers on resolution. So it is a decision, and
       * it is asked here rather than assumed away.
       */
      if (decision) out.push({ kind: 'decision', label: `trigger contains ${decision}` });
      return out;
    }

    case 'static': {
      if (decision) out.push({ kind: 'decision', label: `static contains ${decision}` });
      for (const m of ability.modifications ?? []) {
        if (m.layer === 'cost-modify') out.push({ kind: 'dead', label: 'cost-modify: costAdjustmentFor has no caller' });
        if (m.layer === 'restriction') {
          const rule = m.rule?.rule;
          if (!RESTRICTIONS_COMBAT_READS.has(rule)) out.push({ kind: 'dead', label: `restriction "${rule}": collected, never read` });
        }
        if (m.layer === 'ability') {
          const bad = deadGrant(m);
          if (bad) out.push({ kind: 'dead', label: `grants "${bad}", which combat.ts never asks about` });
        }
      }
      return out;
    }

    case 'replacement': {
      const selfEnters = ability.event?.on === 'enters' && ability.selfReplacement;
      const r = ability.result ?? {};
      if (selfEnters && r.do === 'enters-tapped') return out;
      if (selfEnters && r.do === 'enters-with-counters' && typeof r.count === 'number' && r.count > 0) return out;
      out.push({ kind: 'dead', label: `replacement "${r.do ?? 'none'}": intrinsic.ts derives no such result` });
      return out;
    }

    case 'keyword': {
      const kw = String(ability.keyword ?? '');
      if (keywordSupport(kw) !== 'engine') out.push({ kind: 'dead', label: `advisory keyword "${kw.toLowerCase()}"` });
      else if (!scryfallKeywords.has(kw.toLowerCase())) {
        out.push({ kind: 'dead', label: `engine keyword "${kw.toLowerCase()}" absent from card.keywords` });
      }
      return out;
    }

    case 'activated':
      if ((ability.targets ?? []).length > 0) out.push({ kind: 'decision', label: 'activated: target asked by AbilityPanel' });
      else if (decision) out.push({ kind: 'decision', label: `activated contains ${decision}` });
      return out;

    case 'spell': {
      if ((ability.targets ?? []).length > 0) {
        out.push({ kind: 'dead', label: 'spell: no surface announces a target for a spell' });
      } else if (decision) out.push({ kind: 'decision', label: `spell contains ${decision}` });
      return out;
    }

    case 'mana':
      out.push({ kind: 'dead', label: 'mana: mana.ts counts untapped sources instead' });
      return out;
    default:
      out.push({ kind: 'dead', label: `unknown kind ${ability.kind}` });
      return out;
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const soleFlip = new Map();      // label -> cards whose ONLY blocker is this label
const soleToAutomated = new Map();
const soleToPromptable = new Map();
const involved = new Map();      // label -> cards whose blocker set contains this label
const samples = new Map();
const cards = [];               // { name, blockers: string[], anyDecision }

let automated = 0;
let promptable = 0;
let silent = 0;
let noText = 0;

for (const card of pool) {
  const trace = compileWithTrace(card);
  const result = trace.result;
  const paragraphs = trace.normalized.paragraphs;
  if (paragraphs.length === 0) { noText++; continue; }

  const scryfallKeywords = new Set((card.keywords ?? []).map(k => String(k).toLowerCase()));
  const triggered = result.abilities.filter(a => a.kind === 'triggered');
  const owns = result.coverage === 'full' && triggered.length > 0 && triggered.every(a => unrunnableReason(a) === null);

  const labels = new Set();
  let anyDecisionOnly = true;   // true while every blocker so far is a decision
  /*
   * Separate from the flag above, and the pair is what makes a group honest.
   * Timber Gorge is blocked by BOTH the unresolved `add-mana` verb and a
   * `choose-mode`. `anyDecisionOnly` is false for it, so scoring a group by
   * that flag alone would count it as a future AUTOMATED card. It is not:
   * doing the engine work AND asking the mode leaves a card whose resolution
   * still waits on a person, which is PROMPTED. One decision blocker anywhere
   * in the set is enough to decide that, so it is tracked on its own.
   */
  let hasDecisionBlocker = false;

  if (result.unparsed.length) { labels.add('unparsed text'); anyDecisionOnly = false; }

  for (const ability of result.abilities) {
    for (const b of blockersFor(ability, owns, scryfallKeywords)) {
      labels.add(b.label);
      if (b.kind !== 'decision') anyDecisionOnly = false;
      else hasDecisionBlocker = true;
    }
  }

  // The strict paragraph bar, same as the coverage script.
  const unparsedSpans = new Set(result.unparsed.map(u => `${u.span[0]}:${u.span[1]}`));
  const consumed = new Set(trace.consumedSpans.map(([a, b]) => `${a}:${b}`));
  const abilityLines = new Set();
  for (const a of result.abilities) {
    for (const line of String(a.text ?? '').split('\n')) {
      const k = line.trim();
      if (k) abilityLines.add(k);
    }
  }
  for (const para of paragraphs) {
    const key = `${para.span[0]}:${para.span[1]}`;
    if (unparsedSpans.has(key)) continue;
    if (!consumed.has(key)) { labels.add('paragraph neither consumed nor unparsed'); anyDecisionOnly = false; continue; }
    if (!abilityLines.has(para.raw.trim())) { labels.add('consumed paragraph produced no ability'); anyDecisionOnly = false; }
  }

  if (result.abilities.length === 0 && labels.size === 0) { labels.add('text on the card, no ability came out'); anyDecisionOnly = false; }

  const blockers = [...labels];
  cards.push({ name: card.name, blockers, anyDecisionOnly, hasDecisionBlocker });

  if (blockers.length === 0) automated++;
  else if (anyDecisionOnly) promptable++;
  else silent++;

  for (const label of blockers) bump(involved, label);

  if (blockers.length === 1) {
    const label = blockers[0];
    bump(soleFlip, label);
    // What would this card become once that one blocker is gone? If every OTHER
    // blocker is gone by definition, the answer is AUTOMATED unless the blocker
    // itself was a decision, which cannot be "fixed" into automation.
    if (cardsIsDecisionLabel(label)) bump(soleToPromptable, label);
    else bump(soleToAutomated, label);
    if (!samples.has(label)) samples.set(label, []);
    const list = samples.get(label);
    if (list.length < 6) list.push(card.name);
  }
}

function cardsIsDecisionLabel(label) {
  return /^trigger not owned: optional/.test(label)
    || /contains (may|choose-mode|unless-pays)$/.test(label)
    || /^activated: target asked by AbilityPanel$/.test(label);
}

/* ------------------------------------------------------------------ *
 * Groups: what a whole tranche is worth, which is not the sum
 * ------------------------------------------------------------------ */

const GROUPS = {
  'mana pool alone (add-mana verb + mana abilities)': l =>
    l === 'verb "add-mana" named and never resolved' || l === 'mana: mana.ts counts untapped sources instead',
  'THIS TRANCHE: mana pool + the mode choice asked': l =>
    l === 'verb "add-mana" named and never resolved'
    || l === 'mana: mana.ts counts untapped sources instead'
    || /contains choose-mode$/.test(l),
  'the mode choice ("Add {R} or {G}") asked rather than deferred': l => /contains choose-mode$/.test(l),
  // The tranche actually being built. Strictly narrower than the two lines
  // under it, which also count events `deriveTriggerEvents` never emits at all.
  // Here the event IS derived and the only thing refusing the card is that a
  // permanent may watch nothing but itself.
  'TRANCHE 3: a permanent may watch an event that happened to something else': l =>
    /is derived, but only the permanent itself may watch it$/.test(l),
  'TRANCHE 3 plus every trigger decision asked': l =>
    /is derived, but only the permanent itself may watch it$/.test(l)
    || /^trigger not owned: optional/.test(l)
    || /^trigger contains (may|choose-mode|unless-pays)$/.test(l),
  'triggers watching another permanent (any event)': l =>
    /^trigger not owned: the engine derives no event for/.test(l)
    || /is derived, but only the permanent itself may watch it$/.test(l),
  'triggers watching another permanent, ONLY the events already derived': l =>
    /is derived, but only the permanent itself may watch it$/.test(l),
  'THIS TRANCHE: derived events + every trigger decision asked': l =>
    /is derived, but only the permanent itself may watch it$/.test(l)
    || /^trigger not owned: optional/.test(l)
    || /^trigger contains (may|choose-mode|unless-pays)$/.test(l),
  'trigger decisions asked rather than refused (optional flag or {do:may})': l =>
    /^trigger not owned: optional/.test(l) || /^trigger contains (may|choose-mode|unless-pays)$/.test(l),
  'every trigger-not-owned reason': l => /^trigger not owned:/.test(l),
  'the counter verb': l => l === 'verb "counter" named and never resolved',
  'spell targets announced by a surface': l => l === 'spell: no surface announces a target for a spell',
  'advisory keywords (any)': l => /^advisory keyword/.test(l),
  'cost-modify wired to a caller': l => l === 'cost-modify: costAdjustmentFor has no caller',
  'replacement results intrinsic.ts does not derive': l => /^replacement "/.test(l),
  'restrictions collected and never read': l => /^restriction "/.test(l),
  'granted keywords combat.ts ignores': l => /^grants "/.test(l),
};

const groupSole = new Map();
for (const [name, match] of Object.entries(GROUPS)) {
  let n = 0;
  let toAutomated = 0;
  let toPrompted = 0;
  for (const c of cards) {
    if (c.blockers.length === 0) continue;
    if (!c.blockers.every(match)) continue;
    n++;
    // ONE decision blocker anywhere in the set sends the card to PROMPTED. The
    // engine half of the work still has to be done for it, and doing it still
    // leaves a person to ask, so it never lands in AUTOMATED.
    if (c.hasDecisionBlocker) toPrompted++;
    else toAutomated++;
  }
  groupSole.set(name, { n, toAutomated, toPrompted });
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const N = pool.length;
const L = [];
const say = s => { L.push(s); console.log(s); };

say('='.repeat(78));
say('WHICH SINGLE BLOCKER IS HOLDING BACK THE MOST CARDS');
say('='.repeat(78));
say('');
say(`POOL ${N} cards. Same filter as verify-ability-coverage.mjs.`);
say(`verbs measured as named-only this run: ${[...NEVER_RESOLVED].join(', ') || '(none)'}`);
say('');
say('--- SANITY: this script regrading the same pool ---');
say('(AUTOMATED must match verify-ability-coverage.mjs PRE-PROBE, or the copied rule went stale)');
say(`  AUTOMATED  ${String(automated).padStart(6)}   PROMPTABLE ${String(promptable).padStart(5)}   SILENT ${String(silent).padStart(6)}   NO-TEXT ${noText}`);
say('  PROMPTABLE here is the WIDE bucket: every card whose only blockers are decisions.');
say('  That script now splits it into PROMPTED (the decision is offered and honoured)');
say('  and PROMPTABLE (it is not), so the two PROMPTABLE numbers are not comparable.');
say('');
say('--- SOLE: fixing this ONE label flips this many CARDS, nothing else needed ---');
const ranked = [...soleFlip.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [label, n] of ranked) {
  const auto = soleToAutomated.get(label) ?? 0;
  const prompt = soleToPromptable.get(label) ?? 0;
  say(`  ${String(n).padStart(5)}  (${String(auto).padStart(5)} -> AUTOMATED, ${String(prompt).padStart(4)} -> PROMPTABLE)  ${label}`);
  say(`         e.g. ${(samples.get(label) ?? []).join(', ')}`);
}
say('');
say('--- INVOLVED: cards whose blocker set merely CONTAINS this label ---');
say('(always larger than SOLE. Quoting this as a gain is the overstatement.)');
for (const [label, n] of [...involved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  say(`  ${String(n).padStart(6)}  sole ${String(soleFlip.get(label) ?? 0).padStart(5)}   ${label}`);
}
say('');
say('--- GROUPS: cards whose WHOLE blocker set fits inside one piece of work ---');
say('(AUTOMATED = nothing left to ask. PROMPTED = the engine work is done and a person is asked.)');
for (const [name, v] of [...groupSole.entries()].sort((a, b) => b[1].n - a[1].n)) {
  say(
    `  ${String(v.n).padStart(5)}  (${String(v.toAutomated).padStart(5)} AUTOMATED, ` +
      `${String(v.toPrompted).padStart(4)} PROMPTED)  ${name}`
  );
}
say('');

writeFileSync(
  OUT,
  JSON.stringify(
    {
      pool: N,
      regrade: { automated, promptable, silent, noText },
      neverResolvedVerbs: [...NEVER_RESOLVED],
      sole: Object.fromEntries(soleFlip),
      soleToAutomated: Object.fromEntries(soleToAutomated),
      soleToPromptable: Object.fromEntries(soleToPromptable),
      involved: Object.fromEntries(involved),
      groups: Object.fromEntries(groupSole),
      samples: Object.fromEntries([...samples].map(([k, v]) => [k, v])),
    },
    null,
    2
  ),
  'utf8'
);
say(`wrote ${OUT}`);
