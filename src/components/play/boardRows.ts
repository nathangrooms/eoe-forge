/**
 * Where a permanent lies on a seat's mat.
 *
 * Owner: *"Lands, creatures, enchantments, graveyard, exile, artifacts etc
 * should all have different locations too on map — seems like its all just one
 * row."*
 *
 * A real table has geography, and players read a board by WHERE something is
 * before they read what it is. Three bands, drawn top to bottom exactly as they
 * lie in front of a player:
 *
 *   lands       furthest back — the mana row you count first
 *   support     artifacts, enchantments, planeswalkers, battles
 *   creatures   nearest the middle of the table, because they attack across it
 *
 * The classification is deliberately coarse and typeLine-driven, matching the
 * predicates the rules engine already uses, so a card can only ever land in one
 * band. Order of the checks matters: Dryad Arbor is a creature *land* and
 * belongs in the mana row, and an artifact creature belongs with the creatures.
 */

import { isCreature, isLand, type CardInstance } from '@/lib/game';

export type BoardRowId = 'lands' | 'support' | 'creatures';

export interface BoardRowDef {
  id: BoardRowId;
  /** Stays visible at low contrast even when the row is empty. */
  label: string;
}

/** Back of the seat's area first, so this array renders top to bottom. */
export const BOARD_ROWS: readonly BoardRowDef[] = [
  { id: 'lands', label: 'Lands' },
  { id: 'support', label: 'Artifacts · Enchantments · Planeswalkers' },
  { id: 'creatures', label: 'Creatures' },
] as const;

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
