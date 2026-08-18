import { Users, Mountain, Sparkles, Scroll, Shield, Gem, Swords, Crown, Boxes, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * One classifier for the whole deck builder.
 *
 * There used to be four independent type-line switches (page header stats, the
 * card grid, the add-card handler and the store's loader) which disagreed with
 * each other: an artifact land counted as a Land in the header and as an
 * Artifact in the grid directly beneath it, and a freshly added Sol Ring moved
 * from "Other" to "Artifacts" on reload. Everything now imports this.
 *
 * Precedence is explicit and documented:
 *   Commander  — the card occupying the command zone
 *   Land       — beats Artifact (Seat of the Synod is a land you play as a land)
 *   Battle     — a permanent type of its own
 *   Planeswalker
 *   Creature   — beats Artifact/Enchantment (Solemn Simulacrum is a creature)
 *   Instant / Sorcery
 *   Artifact / Enchantment
 *   Other      — Kindred-only, schemes, and anything unrecognised
 */
export type CardCategory =
  | 'commanders'
  | 'creatures'
  | 'instants'
  | 'sorceries'
  | 'artifacts'
  | 'enchantments'
  | 'planeswalkers'
  | 'battles'
  | 'lands'
  | 'other';

export interface CategoryStyle {
  label: string;
  /** Singular form, for "1 Creature" style copy. */
  singular: string;
  icon: LucideIcon;
  /** Tailwind text colour bound to the --type-* design tokens. */
  color: string;
  /** Matching background, for bars and chips. */
  bg: string;
}

export const CATEGORY_CONFIG: Record<CardCategory, CategoryStyle> = {
  commanders: { label: 'Commander', singular: 'Commander', icon: Crown, color: 'text-type-commander', bg: 'bg-type-commander' },
  creatures: { label: 'Creatures', singular: 'Creature', icon: Users, color: 'text-type-creatures', bg: 'bg-type-creatures' },
  instants: { label: 'Instants', singular: 'Instant', icon: Sparkles, color: 'text-type-instants', bg: 'bg-type-instants' },
  sorceries: { label: 'Sorceries', singular: 'Sorcery', icon: Scroll, color: 'text-type-sorceries', bg: 'bg-type-sorceries' },
  artifacts: { label: 'Artifacts', singular: 'Artifact', icon: Shield, color: 'text-type-artifacts', bg: 'bg-type-artifacts' },
  enchantments: { label: 'Enchantments', singular: 'Enchantment', icon: Gem, color: 'text-type-enchantments', bg: 'bg-type-enchantments' },
  planeswalkers: { label: 'Planeswalkers', singular: 'Planeswalker', icon: Swords, color: 'text-type-planeswalkers', bg: 'bg-type-planeswalkers' },
  battles: { label: 'Battles', singular: 'Battle', icon: Flame, color: 'text-type-battles', bg: 'bg-type-battles' },
  lands: { label: 'Lands', singular: 'Land', icon: Mountain, color: 'text-type-lands', bg: 'bg-type-lands' },
  other: { label: 'Other', singular: 'Other', icon: Boxes, color: 'text-muted-foreground', bg: 'bg-muted-foreground' },
};

/** Display order for grouped views. */
export const CATEGORY_ORDER: CardCategory[] = [
  'commanders',
  'creatures',
  'planeswalkers',
  'instants',
  'sorceries',
  'artifacts',
  'enchantments',
  'battles',
  'lands',
  'other',
];

interface ClassifiableCard {
  type_line?: string | null;
  is_commander?: boolean;
  category?: string;
}

export function categorizeCard(card: ClassifiableCard): CardCategory {
  if (card?.is_commander || card?.category === 'commanders') return 'commanders';

  const t = (card?.type_line || '').toLowerCase();
  if (!t) return 'other';

  // Only the front face matters for grouping a double-faced card.
  const front = t.split('//')[0];

  if (front.includes('land')) return 'lands';
  if (front.includes('battle')) return 'battles';
  if (front.includes('planeswalker')) return 'planeswalkers';
  if (front.includes('creature')) return 'creatures';
  if (front.includes('instant')) return 'instants';
  if (front.includes('sorcery')) return 'sorceries';
  if (front.includes('artifact')) return 'artifacts';
  if (front.includes('enchantment')) return 'enchantments';
  return 'other';
}

export function isLand(card: ClassifiableCard): boolean {
  return categorizeCard(card) === 'lands';
}

/** Basic lands (and cards that say so) are exempt from copy limits. */
export function isUnlimitedCopies(card: { type_line?: string | null; oracle_text?: string | null }): boolean {
  const t = (card?.type_line || '').toLowerCase();
  if (t.includes('basic') && t.includes('land')) return true;
  const o = (card?.oracle_text || '').toLowerCase();
  return o.includes('a deck can have any number of cards named');
}

/**
 * Copies of a single card a format allows. Commander/Brawl are singleton;
 * constructed formats cap at 4. Basics are unlimited in both.
 */
export function maxCopiesFor(
  format: string | null | undefined,
  card: { type_line?: string | null; oracle_text?: string | null }
): number {
  if (isUnlimitedCopies(card)) return Number.POSITIVE_INFINITY;
  const f = (format || '').toLowerCase();
  if (f === 'commander' || f === 'edh' || f === 'brawl' || f === 'oathbreaker' || f === 'duel') return 1;
  return 4;
}
