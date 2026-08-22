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

// Relative rather than the `@/` alias, for the reason `cardActions.ts` gives:
// `node --test` has no bundler to resolve an alias with, and this module has a
// suite of its own now that being attached moves a permanent between rows.
import { isCreature, isLand, type CardInstance } from '../../lib/game/index.ts';

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
  /* "Noncreature" is a rules term for a card's type line, not a name anybody
     who plays uses for a row on their mat. The short form drops the second
     word, it does not invent a different one. */
  shortLabel: 'Artifacts',
} as const;

export function rowForCard(card: CardInstance): BoardRowId {
  if (isLand(card)) return 'lands';
  if (isCreature(card)) return 'creatures';
  return 'support';
}

export type BoardRowMap = Record<BoardRowId, CardInstance[]>;

/**
 * An Equipment or Aura goes where the thing it is attached to went, and lands
 * immediately after it.
 *
 * In paper the sword sits tucked under the creature it equips, and that
 * physical arrangement IS the answer to "which creature is carrying it". Left
 * in the noncreature block on the right-hand side, an equipped sword is on the
 * far side of the mat from the creature it is pumping, and a player has to
 * remember which is which. Adjacency costs nothing and says it without a word.
 *
 * Nothing about the geometry changes: `SeatMat` sizes its rows from the box it
 * was given and never from how many permanents are in them, so a sword moving
 * from the block into the creature row cannot resize or shift anything. It
 * takes the place in the order it would have had, so the arrangement is stable
 * across renders.
 *
 * An attachment whose host is not in this list — an Aura on an opponent's
 * creature — stays where its own type line puts it, because there is nothing on
 * this mat to sit beside.
 */
export function splitIntoRows(cards: readonly CardInstance[]): BoardRowMap {
  const rows: BoardRowMap = { lands: [], support: [], creatures: [] };
  const here = new Set(cards.map(card => card.instanceId));

  const attachedToHost = new Map<string, CardInstance[]>();
  for (const card of cards) {
    if (!card.attachedTo || !here.has(card.attachedTo)) continue;
    const list = attachedToHost.get(card.attachedTo);
    if (list) list.push(card);
    else attachedToHost.set(card.attachedTo, [card]);
  }

  for (const card of cards) {
    // Drawn beside its host below, not in its own row.
    if (card.attachedTo && here.has(card.attachedTo)) continue;
    const row = rows[rowForCard(card)];
    row.push(card);
    for (const attachment of attachedToHost.get(card.instanceId) ?? []) row.push(attachment);
  }

  return rows;
}
