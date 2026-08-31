/**
 * What the engine could NOT say about a card, reduced to something countable.
 *
 * A gap is only actionable if identical gaps on different cards collapse to the
 * same key. "Whenever Krenko attacks, create a Goblin" and "Whenever Talrand
 * attacks, create a Drake" are ONE piece of work, and a report that lists them
 * separately is a report nobody can plan against.
 *
 * ## Why this lives in the engine and not in a probe
 *
 * It was written three times in `scripts/probe/` before it was written once
 * here, and each copy got a different thing wrong. `scripts/probe/README.md`
 * records the same lesson about em-dash checkers: a tool nobody can find is a
 * tool somebody rewrites. Worse, the fill that stores these shapes and the
 * probe that ranks them MUST agree, or the work list on the admin screen
 * describes a different catalogue from the one on the terminal.
 *
 * ## The two kinds of gap, which are not the same and must not be merged
 *
 *   UNREAD   a clause the compiler could not parse at all. `result.unparsed`.
 *            Ranked by `scripts/probe/unparsed-shapes.mjs`. Fixing one means
 *            writing a rule.
 *
 *   MARKER   a clause the compiler DID parse, inside an ability that resolved,
 *            and then gave up on — a bare `{do:'manual'}`. Fixing one usually
 *            means extending the DSL, not writing a rule.
 *
 * The second is the larger and was, until this file, invisible: measured over
 * all 32,685 cards with rules text, 8,442 carry a marker and 6,217 of those
 * have NOTHING unparsed, so every work list in this repo reported them as
 * finished. Etali, Primal Storm has nothing unread and his entire effect is one
 * marker.
 */

import type { Ability, Effect } from './dsl.ts';

/**
 * A clause reduced to the shape a rule would be anchored on.
 *
 * NEVER returns an empty string. An earlier version of this in
 * `commander-read-audit` did, and "" came out as the single most common shape
 * in the report at 228 commanders, which is not a shape, it is the function
 * failing. Anything reducing to nothing is grouped by what it actually is so it
 * stays countable.
 */
export function clauseShape(raw: string): string {
  /*
   * AN ACTIVATED ABILITY IS SHAPED BY ITS EFFECT, NOT BY ITS COST.
   *
   * The first run of the census ranked "{mana}" as the biggest cluster at 1,129
   * cards, and it was this function failing: a cost like "{1}, {T}:" or
   * "{B}, Sacrifice this creature:" contains a comma, the shape split on
   * commas, so every multi-part cost collapsed to its first atom and a thousand
   * unrelated abilities landed in one bucket. A rule for these is anchored on
   * what the ability DOES, so that is what the shape has to be. The cost is
   * kept as a prefix so the two halves stay distinguishable rather than being
   * silently dropped.
   */
  const text = String(raw ?? '');
  const colon = text.indexOf(':');
  const head = colon > 0 ? text.slice(0, colon) : '';
  const isCost =
    colon > 0 &&
    (head.includes('{') || /^(sacrifice|discard|exile|pay|tap|remove|reveal)/i.test(head.trim()));
  const body = isCost ? text.slice(colon + 1) : text;
  const prefix = isCost ? 'ACTIVATED: ' : '';

  const norm = body
    /* Lowercase FIRST. The strip below keeps only [a-z0-9...], so an uppercase
       placeholder became "{ }" — which came out as the single most common shape
       in one run, 1,129 cards, and is not a shape. */
    .toLowerCase()
    .replace(/\{[^}]*\}/g, '{mana}')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\b/g, 'N')
    .replace(/[^a-z0-9{} ,.'\-/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = norm.split(/[,.]/)[0].split(' ').filter(Boolean).slice(0, 8).join(' ');
  if (words) return prefix + words;
  if (!norm) return '(symbols or reminder text only)';
  return `${prefix}(short) ${norm.slice(0, 40)}`;
}

/**
 * Every `manual` effect anywhere in an ability, however deeply nested.
 *
 * Markers hide inside `if`, `may`, `for-each`, `repeat` and `choose-mode`, and
 * a walk over the top level of `effects` alone would miss the ones that matter
 * most: a modal card's whole body sits inside `choose-mode`, and Ragavan's two
 * real effects are both markers while his unread list names only "Dash {1}{R}".
 */
function collectMarkers(node: unknown, out: Array<{ text: string; hint?: string }>, depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMarkers(item, out, depth + 1);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec.do === 'manual' && typeof rec.text === 'string') {
    out.push({ text: rec.text, hint: typeof rec.hint === 'string' ? rec.hint : undefined });
  }
  for (const key of Object.keys(rec)) {
    const v = rec[key];
    if (v && typeof v === 'object') collectMarkers(v, out, depth + 1);
  }
}

/** The rule that gave up, from the hint `effect-rules.ts` writes as "<id>: <why>". */
export function markerRule(hint: string | undefined): string {
  const h = String(hint ?? '').trim();
  if (!h) return '(no hint)';
  const colon = h.indexOf(':');
  return colon > 0 ? h.slice(0, colon).trim() : h.slice(0, 40);
}

export interface CardGaps {
  /** Shapes of clauses no rule could parse. Deduped, capped. */
  unread: string[];
  /** Shapes of clauses that parsed into an ability and then gave up. Deduped, capped. */
  markers: string[];
  /** The rules that gave up, so the work has a known home. Deduped, capped. */
  markerRules: string[];
}

/**
 * How many shapes to keep per card.
 *
 * These are STORED, on 33,032 rows, so an unbounded array is an unbounded
 * table. Eight is past the 99th percentile: the median card with any gap has
 * one, and a card with more than eight distinct gap shapes is one nobody is
 * going to fix from a list anyway.
 */
const MAX_PER_CARD = 8;

const dedupe = (xs: string[]): string[] => Array.from(new Set(xs)).slice(0, MAX_PER_CARD);

/** Both kinds of gap, from one already-compiled result. Costs no extra compile. */
export function gapsOf(
  abilities: readonly Ability[] | undefined,
  unparsed: ReadonlyArray<{ text: string }> | undefined
): CardGaps {
  const markers: Array<{ text: string; hint?: string }> = [];
  collectMarkers(abilities ?? [], markers);
  return {
    unread: dedupe((unparsed ?? []).map(u => clauseShape(u.text))),
    markers: dedupe(markers.map(m => clauseShape(m.text))),
    markerRules: dedupe(markers.map(m => markerRule(m.hint))),
  };
}

/** Kept so a caller holding raw effects rather than abilities can ask too. */
export function gapsOfEffects(effects: readonly Effect[] | undefined): CardGaps {
  return gapsOf(effects ? ([{ effects } as unknown as Ability]) : [], []);
}
