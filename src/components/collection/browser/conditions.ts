/**
 * Condition grades, and nothing else.
 *
 * Split out of `types.ts` so that code which only needs to name a condition
 * does not have to pull in the whole card-filter graph with it. `types.ts`
 * re-exports every name below, so nothing that already imported from there has
 * to change.
 *
 * This file deliberately imports NOTHING. That is what lets the collection
 * export be tested with `node --test`, which cannot resolve the `@/` alias.
 */

/**
 * Market condition grades (TCGplayer / CardMarket). The database still stores
 * the older seven-value vocabulary, so `normalizeCondition` maps both onto
 * these five.
 */
export const CONDITIONS = [
  { value: 'NM', label: 'Near Mint' },
  { value: 'LP', label: 'Lightly Played' },
  { value: 'MP', label: 'Moderately Played' },
  { value: 'HP', label: 'Heavily Played' },
  { value: 'DMG', label: 'Damaged' },
] as const;

export type ConditionGrade = (typeof CONDITIONS)[number]['value'];

const CONDITION_ALIASES: Record<string, ConditionGrade> = {
  mint: 'NM',
  near_mint: 'NM',
  nearmint: 'NM',
  nm: 'NM',
  excellent: 'LP',
  good: 'LP',
  light_played: 'LP',
  lightly_played: 'LP',
  lp: 'LP',
  played: 'MP',
  moderately_played: 'MP',
  mp: 'MP',
  heavily_played: 'HP',
  hp: 'HP',
  poor: 'DMG',
  damaged: 'DMG',
  dmg: 'DMG',
};

export function normalizeCondition(raw?: string | null): ConditionGrade {
  if (!raw) return 'NM';
  return CONDITION_ALIASES[String(raw).toLowerCase().trim()] ?? 'NM';
}

export function conditionLabel(raw?: string | null): string {
  const grade = normalizeCondition(raw);
  return CONDITIONS.find(c => c.value === grade)?.label ?? 'Near Mint';
}
