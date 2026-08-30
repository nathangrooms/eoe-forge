/**
 * A score that can be argued with.
 *
 * DeckMatrix has already shipped a power readout that showed roughly the same
 * number for every deck, and nobody noticed for a long time, because a bare
 * decimal gives a player nothing to check it against. A subscore that cannot
 * name the cards it counted is indistinguishable from a subscore that counted
 * nothing.
 *
 * So every subscore here carries three things:
 *
 *   - `measured`, one plain sentence saying what was counted;
 *   - `from`, the cards that produced the number and how much each was worth;
 *   - `holdingBack`, the cards costing it points, where that is meaningful.
 *
 * The contributions are scaled so that they add up to the subscore. That is
 * the property that makes the evidence an explanation rather than a decoration:
 * if the list does not sum to the number, the list is not why the number is
 * what it is.
 *
 * `applicable` exists so that "not measurable for this deck" never has to be
 * expressed as zero. A deck with no commander has no commander synergy to
 * measure; scoring that as 0 out of 100 would be an invented failing. An
 * inapplicable subscore is left out of the weighted mean entirely.
 */

export type SubscoreKey =
  | 'castability'
  | 'speed'
  | 'interaction'
  | 'tutors'
  | 'resilience'
  | 'card_advantage'
  | 'mana'
  | 'consistency'
  | 'stax_pressure'
  | 'synergy';

export const SUBSCORE_KEYS: readonly SubscoreKey[] = [
  'castability',
  'speed',
  'interaction',
  'tutors',
  'resilience',
  'card_advantage',
  'mana',
  'consistency',
  'stax_pressure',
  'synergy',
];

/** One card's share of one subscore. */
export interface Contribution {
  /** The card, by name, so the player can go and look at it. */
  name: string;
  /** Copies of it in the deck. */
  quantity: number;
  /** Points of this subscore this card is responsible for. */
  points: number;
  /** Why, in the words a player would use at a table. */
  why: string;
}

export interface Subscore {
  key: SubscoreKey;
  /** 0 to 100. Null when the subscore does not apply to this deck. */
  value: number | null;
  /** Share of the final score. Declared policy, not a fitted value. */
  weight: number;
  applicable: boolean;
  /** One sentence: what was counted. */
  measured: string;
  /** Top contributors, largest first. Sums to `value` with `othersPoints`. */
  from: Contribution[];
  /** Contributors beyond the ones listed. */
  othersCount: number;
  othersPoints: number;
  /** Cards costing this subscore points, worst first. */
  holdingBack: Contribution[];
  /** Said out loud when there is nothing to list. */
  note: string | null;
}

/** How many contributors a subscore carries. The rest are summarised. */
export const EVIDENCE_LIMIT = 12;

/** How many drags a subscore carries. */
export const HOLDING_BACK_LIMIT = 8;

function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Turn raw per-card credits into a subscore whose evidence adds up to it.
 *
 * Raw credits are capped at 100 the way the old engine capped them, but the
 * contributions are then scaled by the same factor, so a deck whose fast mana
 * is worth 180 raw points reports ten cards summing to 100 rather than ten
 * cards summing to 180 beside a number that says 100.
 */
export function buildSubscore(input: {
  key: SubscoreKey;
  weight: number;
  measured: string;
  credits: Contribution[];
  /** Points removed by the drags, already subtracted from `credits` totals. */
  drags?: Contribution[];
  cap?: number;
  floor?: number;
  /** Overrides the summed value, for subscores that are an average or a rate. */
  value?: number;
  applicable?: boolean;
  note?: string | null;
}): Subscore {
  const applicable = input.applicable !== false;
  if (!applicable) {
    return {
      key: input.key,
      value: null,
      weight: input.weight,
      applicable: false,
      measured: input.measured,
      from: [],
      othersCount: 0,
      othersPoints: 0,
      holdingBack: [],
      note: input.note ?? null,
    };
  }

  const cap = input.cap ?? 100;
  const floor = input.floor ?? 0;
  const rawTotal = input.credits.reduce((sum, c) => sum + c.points, 0);
  const value = Math.max(floor, Math.min(cap, input.value ?? rawTotal));

  // Scale the evidence so it explains the number that is actually shown.
  const scale = rawTotal > 0 ? value / rawTotal : 0;
  const scaled = input.credits
    .map(c => ({ ...c, points: round(c.points * scale, 2) }))
    .filter(c => c.points !== 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const from = scaled.slice(0, EVIDENCE_LIMIT);
  const others = scaled.slice(EVIDENCE_LIMIT);

  const holdingBack = (input.drags ?? [])
    .map(c => ({ ...c, points: round(c.points, 2) }))
    .filter(c => c.points !== 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, HOLDING_BACK_LIMIT);

  return {
    key: input.key,
    value: round(value, 1),
    weight: input.weight,
    applicable: true,
    measured: input.measured,
    from,
    othersCount: others.length,
    othersPoints: round(
      others.reduce((sum, c) => sum + c.points, 0),
      2
    ),
    holdingBack,
    note: from.length === 0 ? (input.note ?? null) : null,
  };
}
