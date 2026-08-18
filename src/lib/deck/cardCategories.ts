/**
 * The single canonical card categoriser for the deck surfaces.
 *
 * Previously every deck view re-implemented its own cascade of `type_line`
 * substring tests. They disagreed with each other, they double-counted cards
 * that matched two filters ("Legendary Artifact Enchantment"), and they had no
 * fallback bucket — so Battles, Kindred cards and anything with a missing type
 * line silently vanished from the list while the header still claimed the full
 * card count.
 *
 * `categorizeCard` returns exactly one bucket per card, by ordered precedence,
 * and always returns something.
 */

export type DeckCategory =
  | 'commanders'
  | 'lands'
  | 'battles'
  | 'planeswalkers'
  | 'creatures'
  | 'artifacts'
  | 'enchantments'
  | 'instants'
  | 'sorceries'
  | 'other'
  | 'sideboard';

/** Display order for deck sections — the order MTG players expect to read. */
export const CATEGORY_ORDER: DeckCategory[] = [
  'commanders',
  'creatures',
  'instants',
  'sorceries',
  'artifacts',
  'enchantments',
  'planeswalkers',
  'battles',
  'lands',
  'other',
  'sideboard',
];

/** Human labels. Section headings must never print the internal key. */
export const CATEGORY_LABEL: Record<DeckCategory, string> = {
  commanders: 'Commander',
  creatures: 'Creatures',
  instants: 'Instants',
  sorceries: 'Sorceries',
  artifacts: 'Artifacts',
  enchantments: 'Enchantments',
  planeswalkers: 'Planeswalkers',
  battles: 'Battles',
  lands: 'Lands',
  other: 'Other',
  sideboard: 'Sideboard',
};

/** Tailwind text colour built on the registered `--type-*` tokens. */
export const CATEGORY_TEXT_CLASS: Record<DeckCategory, string> = {
  commanders: 'text-type-commander',
  creatures: 'text-type-creatures',
  instants: 'text-type-instants',
  sorceries: 'text-type-sorceries',
  artifacts: 'text-type-artifacts',
  enchantments: 'text-type-enchantments',
  planeswalkers: 'text-type-planeswalkers',
  battles: 'text-type-battles',
  lands: 'text-type-lands',
  other: 'text-muted-foreground',
  sideboard: 'text-muted-foreground',
};

/** Tailwind background for composition bars. */
export const CATEGORY_BG_CLASS: Record<DeckCategory, string> = {
  commanders: 'bg-type-commander',
  creatures: 'bg-type-creatures',
  instants: 'bg-type-instants',
  sorceries: 'bg-type-sorceries',
  artifacts: 'bg-type-artifacts',
  enchantments: 'bg-type-enchantments',
  planeswalkers: 'bg-type-planeswalkers',
  battles: 'bg-type-battles',
  lands: 'bg-type-lands',
  other: 'bg-muted-foreground',
  sideboard: 'bg-muted-foreground',
};

export interface CategorizeOptions {
  isCommander?: boolean;
  isSideboard?: boolean;
}

/**
 * Resolve a card to exactly one bucket.
 *
 * Precedence matters: a "Legendary Artifact Creature" is a creature, an
 * "Artifact Land" is a land, and anything that fails every test lands in
 * `other` rather than disappearing.
 */
export function categorizeCard(
  typeLine: string | null | undefined,
  options: CategorizeOptions = {}
): DeckCategory {
  if (options.isSideboard) return 'sideboard';
  if (options.isCommander) return 'commanders';

  const t = (typeLine || '').toLowerCase();
  if (!t) return 'other';

  if (t.includes('land')) return 'lands';
  if (t.includes('battle')) return 'battles';
  if (t.includes('planeswalker')) return 'planeswalkers';
  if (t.includes('creature')) return 'creatures';
  if (t.includes('artifact')) return 'artifacts';
  if (t.includes('enchantment')) return 'enchantments';
  if (t.includes('instant')) return 'instants';
  if (t.includes('sorcery')) return 'sorceries';
  return 'other';
}

/**
 * Group an arbitrary card collection into canonical buckets.
 * Every input row lands in exactly one bucket, so grouped quantities always
 * sum back to the deck total.
 */
export function groupByCategory<T>(
  items: T[],
  read: (item: T) => { typeLine?: string | null; isCommander?: boolean; isSideboard?: boolean }
): Array<{ category: DeckCategory; label: string; items: T[] }> {
  const buckets = new Map<DeckCategory, T[]>();

  for (const item of items) {
    const meta = read(item);
    const category = categorizeCard(meta.typeLine, {
      isCommander: meta.isCommander,
      isSideboard: meta.isSideboard,
    });
    const list = buckets.get(category);
    if (list) list.push(item);
    else buckets.set(category, [item]);
  }

  return CATEGORY_ORDER.filter(c => (buckets.get(c)?.length ?? 0) > 0).map(category => ({
    category,
    label: CATEGORY_LABEL[category],
    items: buckets.get(category) as T[],
  }));
}
