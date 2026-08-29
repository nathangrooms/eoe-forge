/**
 * Optimisation: what does this card do BETTER than that one.
 *
 * Behaviour here is derived from XMage (MIT, Copyright (c) 2010
 * betasteward@gmail.com). Forge is GPL-3.0 and was not read.
 *
 * ## The two rules this file exists to enforce
 *
 * **Only compare within a class.** Wrath of God and Damnation are the same
 * card at a different colour. Wrath of God and Cyclonic Rift both clear a
 * board and are not remotely the same decision. A comparison that produces a
 * number for every pair of cards produces a number for that pair too, and that
 * number is noise dressed as advice. So comparison starts by asking whether the
 * two cards are even in the same conversation, and answers "no" often.
 *
 * **An axis that does not know says so.** Every axis returns a union, and
 * `unknown` carries the reason. A comparison engine that treats an unresolved
 * magnitude as zero will rank Dockside Extortionist below a Llanowar Elves, and
 * it will do it silently, which is worse than refusing.
 */

import type { CardRecord, FaceRecord } from './record.ts';
import { abilitiesOf, effectRootsOf, targetRootsOf } from './record.ts';
import { type Role, type Scale, type Symmetry, assignRoles, classifyFilter, symmetryOf } from './roles.ts';
import { arg } from './record.ts';

/* ------------------------------------------------------------------ *
 * Cost, and what a card needs
 * ------------------------------------------------------------------ */

/**
 * What it costs to cast a face, split into the two things that matter
 * separately.
 *
 * `manaValue` is what it costs. `pips` is what it DEMANDS of a mana base, and
 * they are different questions: `{2}{W}{W}` and `{3}{W}` are both four, and
 * only one of them is awkward in a three-colour deck. Wrath of God against
 * Damnation is exactly that comparison and nothing else, so an optimiser
 * without `pips` cannot tell those two apart at all.
 */
export interface CastCost {
  /** Null when the face has no printed cost, such as the back of a transforming card. */
  mana: string | null;
  manaValue: number | null;
  /** Coloured symbols by colour, hybrid counted for both halves. */
  pips: Record<string, number>;
  /** True when the cost contains `{X}`, which makes `manaValue` a floor and not a price. */
  hasX: boolean;
  /** Generic portion, so `{2}{W}{W}` and `{W}{W}{W}{W}` are distinguishable. */
  generic: number;
}

const COLOUR_SYMBOLS = new Set(['W', 'U', 'B', 'R', 'G', 'C']);

/**
 * Reads a Scryfall-style mana string. Mana symbols are notation, not rules
 * text, so copying them is safe; nothing else from an XMage string literal is
 * copied anywhere in this codebase.
 */
export function parseCost(mana: string | null): CastCost {
  const empty: CastCost = { mana, manaValue: mana === null ? null : 0, pips: {}, hasX: false, generic: 0 };
  if (!mana) return empty;
  const symbols = mana.match(/\{[^}]+\}/g) ?? [];
  const cost: CastCost = { mana, manaValue: 0, pips: {}, hasX: false, generic: 0 };
  for (const raw of symbols) {
    const body = raw.slice(1, -1);
    if (body === 'X' || body === 'Y' || body === 'Z') {
      cost.hasX = true;
      continue;
    }
    const asNumber = Number(body);
    if (Number.isFinite(asNumber)) {
      cost.generic += asNumber;
      cost.manaValue = (cost.manaValue ?? 0) + asNumber;
      continue;
    }
    // Hybrid and Phyrexian: `{W/U}`, `{2/W}`, `{W/P}`. Each counts one toward
    // mana value and one pip toward every colour it can be paid with, because
    // that is what it does to a mana base.
    const parts = body.split('/');
    cost.manaValue = (cost.manaValue ?? 0) + 1;
    let sawColour = false;
    for (const part of parts) {
      if (COLOUR_SYMBOLS.has(part)) {
        cost.pips[part] = (cost.pips[part] ?? 0) + 1;
        sawColour = true;
      }
    }
    if (!sawColour) cost.generic += 1;
  }
  return cost;
}

/** The face a player casts from hand. For a transforming card that is the front. */
export function castableFaces(record: CardRecord): FaceRecord[] {
  switch (record.layout) {
    case 'transform':
    case 'flip':
    case 'meld':
      return record.faces.filter((f) => f.kind === 'main' || f.kind === 'left');
    default:
      return record.faces.filter((f) => f.mana !== null);
  }
}

/* ------------------------------------------------------------------ *
 * Comparison classes
 * ------------------------------------------------------------------ */

/**
 * The conversation two cards are in, if any.
 *
 * A class is a role plus what the role is pointed at, because "removal" is not
 * a conversation and "sweeps creatures" is. The string form is deliberately
 * stable and greppable so it can be an index key.
 */
export interface ComparisonClass {
  role: Role;
  object: string;
  key: string;
}

export function comparisonClasses(record: CardRecord): ComparisonClass[] {
  const out: ComparisonClass[] = [];
  for (const ability of abilitiesOf(record)) {
    for (const invocation of effectRootsOf(ability)) {
      // The object set may be on the effect or on the target. Cyclonic Rift's
      // is on the target, and a comparison class of `bounce:any` instead of
      // `bounce:nonland-permanent` would put it in the wrong conversation.
      const filter =
        arg(invocation, 'filter')?.value ??
        targetRootsOf(ability)
          .map((t) => arg(t, 'filter')?.value)
          .find((v) => v?.k === 'objects');
      const objects = filter?.k === 'objects' ? classifyFilter(filter.filter) : [];
      const object = objects[0] ?? 'any';
      for (const assignment of assignRoles(invocation)) {
        const key = `${assignment.role}:${object}`;
        if (!out.some((c) => c.key === key)) out.push({ role: assignment.role, object, key });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Axes
 * ------------------------------------------------------------------ */

/**
 * One axis reading. `known: false` always carries `why`, and no caller may read
 * `v` without checking `known` first.
 *
 * Written as one interface with optional members rather than a discriminated
 * union because `tsconfig.app.json` sets `strict: false`, and without
 * `strictNullChecks` the compiler does not narrow the union on the discriminant.
 * A union that does not narrow is a union that has to be cast around, and casts
 * are where the check gets skipped.
 */
/**
 * A measured axis, or a stated reason it could not be measured.
 *
 * This was `{ known: boolean; v?: T; why?: string }`, three independent
 * optionals describing two states that cannot overlap: a known value always has
 * a `v` and never a `why`, and an unknown one is the other way round. The
 * constructors below have always honoured that. The TYPE did not say so, so
 * every reader had to re-derive it, and `lowerIsBetter` handing `a.why` to a
 * field declared `why: string` was `string | undefined` as far as the compiler
 * knew. `tsconfig.app.json` let it through and Deno's stricter default did not,
 * which is how a deploy check found a bug the app build never would.
 *
 * As a union the invariant is checkable rather than remembered: narrow on
 * `known` and the other two fields resolve on their own.
 */
export type AxisValue<T> =
  | { known: true; v: T; why?: undefined }
  | { known: false; v?: undefined; why: string };

const unknown = <T,>(why: string): AxisValue<T> => ({ known: false, why });
const known = <T,>(v: T): AxisValue<T> => ({ known: true, v });

/**
 * When a card can act. This is a real axis and not a tiebreak: at instant speed
 * a board wipe is also a combat trick and a counterspell substitute, and any
 * ranking that ignores it puts Settle the Wreckage and Wrath of God in the same
 * slot.
 */
export type Speed = 'static' | 'instant' | 'sorcery' | 'activated' | 'triggered';

export interface Axes {
  manaValue: AxisValue<number>;
  pipCount: AxisValue<number>;
  colours: AxisValue<string[]>;
  speed: AxisValue<Speed>;
  symmetry: AxisValue<Symmetry>;
  scale: AxisValue<Scale>;
  /**
   * Does it need a target. A targeted effect is answered by hexproof, ward and
   * protection; a mass effect is not. This is the axis that separates two cards
   * with the same role and the same cost more often than any other.
   */
  targeted: AxisValue<boolean>;
  /** Does it check a condition before it does anything. CR 603.4 and friends. */
  conditional: AxisValue<boolean>;
  /** Legality that changes advice. A banned card must never head a recommendation. */
  commanderLegal: AxisValue<boolean>;
}

export function axesOf(record: CardRecord, cls: ComparisonClass): Axes {
  const face = castableFaces(record)[0];
  const cost = parseCost(face?.mana ?? null);

  let speed: AxisValue<Speed> = unknown('no ability produced this class');
  let symmetry: AxisValue<Symmetry> = unknown('no resolved object set');
  let scale: AxisValue<Scale> = unknown('no rule assigned this role');
  let targeted: AxisValue<boolean> = unknown('no ability produced this class');
  let conditional: AxisValue<boolean> = unknown('no ability produced this class');

  for (const ability of abilitiesOf(record)) {
    const targets = targetRootsOf(ability);
    for (const invocation of effectRootsOf(ability)) {
      const assignments = assignRoles(invocation).filter((a) => a.role === cls.role);
      if (assignments.length === 0) continue;

      speed = known(speedOf(record, ability.kind));
      targeted = known(targets.length > 0);
      conditional = known(ability.interveningIf !== undefined);
      scale = known(assignments[0].scale);

      const filter =
        arg(invocation, 'filter')?.value ??
        targets.map((t) => arg(t, 'filter')?.value).find((v) => v?.k === 'objects');
      const s = symmetryOf(filter);
      symmetry = s === 'unknown' ? unknown('object set did not resolve') : known(s);
    }
  }

  const pipTotal = Object.values(cost.pips).reduce((a, b) => a + b, 0);

  return {
    manaValue:
      cost.manaValue === null
        ? unknown('face has no printed cost')
        : cost.hasX
          ? unknown('cost contains {X}; mana value is a floor, not a price')
          : known(cost.manaValue),
    pipCount: face ? known(pipTotal) : unknown('no castable face'),
    colours: face ? known(Object.keys(cost.pips).sort()) : unknown('no castable face'),
    speed,
    symmetry,
    scale,
    targeted,
    conditional,
    commanderLegal: known(record.commanderLegal),
  };
}

function speedOf(record: CardRecord, kind: string): Speed {
  if (kind === 'triggered') return 'triggered';
  if (kind === 'activated' || kind === 'mana') return 'activated';
  if (kind === 'static' || kind === 'replacement' || kind === 'keyword') return 'static';
  const face = castableFaces(record)[0];
  const types = (face?.types ?? []).map((t) => t.toLowerCase());
  if (types.includes('instant')) return 'instant';
  if (types.includes('sorcery')) return 'sorcery';
  return 'static';
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

export type Verdict = 'a' | 'b' | 'tie' | 'unknown';

export interface AxisVerdict {
  axis: keyof Axes;
  verdict: Verdict;
  why: string;
}

export interface Comparison {
  /** Absent means the two cards are not in the same conversation. Say so and stop. */
  cls: ComparisonClass | null;
  axes: AxisVerdict[];
}

/**
 * Compare two cards on the class they share.
 *
 * There is deliberately no overall score. An overall score is a weighting, a
 * weighting is a format opinion, and a format opinion does not belong in the
 * card record. The caller weights the axes it cares about; this returns the
 * axes.
 */
export function compareCards(a: CardRecord, b: CardRecord): Comparison {
  const aClasses = comparisonClasses(a);
  const bKeys = new Set(comparisonClasses(b).map((c) => c.key));
  const shared = aClasses.find((c) => bKeys.has(c.key)) ?? null;
  if (!shared) return { cls: null, axes: [] };

  const axesA = axesOf(a, shared);
  const axesB = axesOf(b, shared);
  const out: AxisVerdict[] = [];

  out.push(lowerIsBetter('manaValue', axesA.manaValue, axesB.manaValue, 'cheaper'));
  out.push(lowerIsBetter('pipCount', axesA.pipCount, axesB.pipCount, 'easier to cast'));
  out.push(preferring('symmetry', axesA.symmetry, axesB.symmetry, 'one-sided', 'does not hit your own board'));
  out.push(preferring('speed', axesA.speed, axesB.speed, 'instant', 'can be held up'));
  out.push(preferring('targeted', axesA.targeted, axesB.targeted, false, 'cannot be answered by hexproof or ward'));
  out.push(preferring('conditional', axesA.conditional, axesB.conditional, false, 'has no condition to fail'));
  out.push(preferring('commanderLegal', axesA.commanderLegal, axesB.commanderLegal, true, 'is legal in Commander'));
  out.push(compareScale(axesA.scale, axesB.scale));
  return { cls: shared, axes: out };
}

function lowerIsBetter(
  axis: keyof Axes,
  a: AxisValue<number>,
  b: AxisValue<number>,
  why: string,
): AxisVerdict {
  if (!a.known) return { axis, verdict: 'unknown', why: a.why };
  if (!b.known) return { axis, verdict: 'unknown', why: b.why };
  if (a.v === b.v) return { axis, verdict: 'tie', why: `both ${a.v}` };
  return { axis, verdict: a.v < b.v ? 'a' : 'b', why: `${Math.min(a.v, b.v)} is ${why}` };
}

function preferring<T>(
  axis: keyof Axes,
  a: AxisValue<T>,
  b: AxisValue<T>,
  preferred: T,
  why: string,
): AxisVerdict {
  if (!a.known) return { axis, verdict: 'unknown', why: a.why };
  if (!b.known) return { axis, verdict: 'unknown', why: b.why };
  if (a.v === b.v) return { axis, verdict: 'tie', why: `both ${String(a.v)}` };
  if (a.v === preferred) return { axis, verdict: 'a', why };
  if (b.v === preferred) return { axis, verdict: 'b', why };
  return { axis, verdict: 'tie', why: 'neither is the preferred value' };
}

/**
 * Scale is the one axis where `unknown` is the common answer rather than the
 * rare one, so it gets its own comparison. `all` beats any fixed number for a
 * mass effect and loses to nothing; `computed` is genuinely incomparable
 * against a fixed number without a board, and saying so is the correct answer.
 */
function compareScale(a: AxisValue<Scale>, b: AxisValue<Scale>): AxisVerdict {
  const axis: keyof Axes = 'scale';
  if (!a.known) return { axis, verdict: 'unknown', why: a.why };
  if (!b.known) return { axis, verdict: 'unknown', why: b.why };
  const sa = a.v;
  const sb = b.v;
  if (sa.s === 'unknown') return { axis, verdict: 'unknown', why: sa.reason };
  if (sb.s === 'unknown') return { axis, verdict: 'unknown', why: sb.reason };
  if (sa.s === 'all' && sb.s === 'all') return { axis, verdict: 'tie', why: 'both affect everything selected' };
  if (sa.s === 'all') return { axis, verdict: 'a', why: 'affects everything selected' };
  if (sb.s === 'all') return { axis, verdict: 'b', why: 'affects everything selected' };
  if (sa.s === 'computed' || sb.s === 'computed') {
    return { axis, verdict: 'unknown', why: 'a computed amount cannot be ranked without a board' };
  }
  if (sa.n === sb.n) return { axis, verdict: 'tie', why: `both ${sa.n}` };
  return { axis, verdict: sa.n > sb.n ? 'a' : 'b', why: `${Math.max(sa.n, sb.n)} is more` };
}
