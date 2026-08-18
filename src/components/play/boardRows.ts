/**
 * Where a permanent lies on a seat's mat.
 *
 * Owner, round 2: *"not sure i like the layout of items. - lands should always
 * be bottom, creatures top - 2 main rows, enchanements/artifacts etc should
 * have its own square right side or something. Doesn't follow normal playmat
 * setups at all."*
 *
 * That supersedes the earlier three-band stack. A real playmat has two main
 * rows and a side block, and it reads from the viewer's own perspective:
 *
 *   ┌──────────────────────────────────────┬───────────────┐
 *   │  CREATURES        (top — they swing) │  ARTIFACTS    │
 *   ├──────────────────────────────────────┤  ENCHANTMENTS │
 *   │  LANDS            (bottom — mana)    │  PLANESWALKERS│
 *   └──────────────────────────────────────┴───────────────┘
 *
 * So `BOARD_ROWS` is now exactly the two full-width rows, top to bottom, and
 * the non-creature permanents are a *block* (`SUPPORT_BLOCK`) rather than a
 * third band — which is also why the two rows that are left are half again as
 * tall as they were, and the cards on them half again as big.
 *
 * The classification is deliberately coarse and typeLine-driven, matching the
 * predicates the rules engine already uses, so a card can only ever land in one
 * place. Order of the checks matters: Dryad Arbor is a creature *land* and
 * belongs in the mana row, and an artifact creature belongs with the creatures.
 */

import { isCreature, isLand, type CardInstance } from '@/lib/game';

export type BoardRowId = 'lands' | 'support' | 'creatures';

export interface BoardRowDef {
  id: BoardRowId;
  /** Stays visible at low contrast even when the row is empty. */
  label: string;
  /** Used where the full label would be truncated to an ellipsis. */
  shortLabel?: string;
}

/**
 * The two main rows, drawn top to bottom exactly as the owner described them.
 *
 * Creatures on top because they attack across the table and are the row every
 * other player has to read; lands on the bottom because that is where a hand
 * rests and where you count mana from.
 */
export const BOARD_ROWS: readonly BoardRowDef[] = [
  { id: 'creatures', label: 'Creatures' },
  { id: 'lands', label: 'Lands' },
] as const;

/** The block on the right edge of the mat. Not a row — it tiles and wraps. */
export const SUPPORT_BLOCK: BoardRowDef & { shortLabel: string } = {
  id: 'support',
  label: 'Artifacts · Enchantments',
  shortLabel: 'Noncreature',
} as const;

export function rowForCard(card: CardInstance): BoardRowId {
  if (isLand(card)) return 'lands';
  if (isCreature(card)) return 'creatures';
  return 'support';
}

export type BoardRowMap = Record<BoardRowId, CardInstance[]>;

export function splitIntoRows(cards: readonly CardInstance[]): BoardRowMap {
  const rows: BoardRowMap = { lands: [], support: [], creatures: [] };
  for (const card of cards) rows[rowForCard(card)].push(card);
  return rows;
}
