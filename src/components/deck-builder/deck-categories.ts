import { Users, Mountain, Sparkles, Scroll, Shield, Gem, Swords, Crown, Boxes, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { categorizeCard as classify } from '@/lib/deck/cardCategories';

/**
 * The deck builder's icons, labels and type colours.
 *
 * ## This file no longer decides what a card is
 *
 * It used to. Its header said "one classifier for the whole deck builder" and
 * `@/lib/deck/cardCategories` says "the single canonical card categoriser for
 * the deck surfaces", and both were live on `/deck/:id` at the same time:
 * `DeckInterface`'s type counts came through here while `DeckCardGrid`,
 * `DeckCardTable`, `deckAnalyticsCards` and `curve.ts` went through that one.
 * Two files, each documented as the last word, one page.
 *
 * They also disagreed. Same first four tests — commander, land, battle,
 * planeswalker, creature — and then:
 *
 *     cardCategories.ts   … artifact, enchantment, instant, sorcery
 *     this file           … instant, sorcery, artifact, enchantment
 *
 * No printed card has a front face that is both an artifact-or-enchantment and
 * an instant-or-sorcery, so nothing on screen was wrong today — which is
 * exactly the moment to fix it, rather than the day a set prints the card that
 * settles it. `categorizeCard` here calls the canonical one now, so there is
 * one cascade and one answer.
 *
 * What is still this file's own job: the icon, the singular and plural label
 * and the `--type-*` classes for each bucket, plus the copy-limit rules below.
 * None of that is duplicated anywhere and seven modules import it.
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

/**
 * One cascade, in `@/lib/deck/cardCategories`. This is the object-shaped door
 * onto it, because the builder's callers hold a card and the canonical one
 * takes a type line.
 *
 * `sideboard` is the one bucket the canonical categoriser has and this
 * vocabulary does not, and it is only ever returned when the caller asks for
 * it. This door never asks, so it cannot come back.
 */
export function categorizeCard(card: ClassifiableCard): CardCategory {
  if (card?.category === 'commanders') return 'commanders';
  return classify(card?.type_line, {
    isCommander: Boolean(card?.is_commander),
  }) as CardCategory;
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
