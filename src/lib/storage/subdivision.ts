/**
 * What a container is divided INTO, decided from what the object actually is.
 *
 * `storage_slots` has existed since the first storage migration and held six
 * real rows (six colour dividers in one bulk box) that nothing on screen ever
 * mentioned. The concept was designed, persisted, and never surfaced. This
 * module is the missing half: the vocabulary that turns a `storage_slots` row
 * into a thing a player recognises.
 *
 * The rule is that the subdivision has to match the real object, because that
 * is the only way a player already knows how it works:
 *
 * | Container | Divided into | Why |
 * |---|---|---|
 * | Binder | **Pages**, nine pockets each | A page is a fixed physical thing. It holds exactly nine cards and which pocket a card sits in is the whole reason to own a binder rather than a box. |
 * | Bulk box | **Dividers** | A bulk box is divided by pieces of card you write on and drop in. There is no fixed number and no fixed size. |
 * | Deck box | **Dividers** | Same object, smaller. The divider is what keeps the sideboard and the tokens away from the deck. |
 * | Shelf | **Shelves** | A shelf's divisions are its own levels. You do not add a level, but you can name the ones you have. |
 * | Anything else | **Sections** | We do not know what the object is, so the plainest word wins and the user names them. |
 *
 * Two rules run through all of it:
 *
 * 1. **Assigning is optional, at every level.** A card can sit in a container
 *    with no page, or on a page with no pocket. Both are normal, and both are
 *    drawn rather than hidden. Nobody is ever made to pick.
 * 2. **No invented fill numbers.** A percentage needs a capacity, and the only
 *    real capacity anywhere in storage is the nine pockets on a binder page. So
 *    a page may honestly say "4 of 9 pockets used"; a binder, a box and a shelf
 *    say how many cards are in them and nothing more. See {@link describeFill}.
 *
 * Pure functions in a `.ts` file so `node --test` can reach them. The React that
 * draws this lives in `src/components/storage/`.
 */

export type SubdivisionKind = 'page' | 'divider' | 'shelf' | 'section';

export interface Subdivision {
  kind: SubdivisionKind;
  /** One of them, lower case, as a player would say it. */
  noun: string;
  /** More than one of them. */
  nounPlural: string;
  /**
   * Cards one of them physically holds, when the object fixes that number.
   * Only a binder page does. Everything else is open-ended and this is null,
   * which is what stops a fill percentage being invented for it.
   */
  pockets: number | null;
  /** One line saying why this container divides this way. */
  why: string;
  /** The button that makes another one. */
  addLabel: string;
  /** Heading over the row of them. */
  groupLabel: string;
  /** Where cards with no slot live. Never hidden, never a dead end. */
  looseLabel: string;
}

const BINDER: Subdivision = {
  kind: 'page',
  noun: 'page',
  nounPlural: 'pages',
  pockets: 9,
  why: 'A binder page holds nine cards and you turn to it. Which pocket a card sits in is the point of a binder.',
  addLabel: 'Add a page',
  groupLabel: 'Pages',
  looseLabel: 'Not on a page',
};

const BULK: Subdivision = {
  kind: 'divider',
  noun: 'divider',
  nounPlural: 'dividers',
  pockets: null,
  why: 'A bulk box is split up by dividers you write on. Name them however you sort, and put as much behind each one as fits.',
  addLabel: 'Add a divider',
  groupLabel: 'Dividers',
  looseLabel: 'Behind no divider',
};

const DECK_BOX: Subdivision = {
  ...BULK,
  why: 'A deck box gets dividers for the parts you keep apart, like the sideboard or the tokens.',
};

const SHELF: Subdivision = {
  kind: 'shelf',
  noun: 'shelf',
  nounPlural: 'shelves',
  pockets: null,
  why: 'A shelf is divided by its own levels. Name each one so you know which row to reach for.',
  addLabel: 'Add a shelf',
  groupLabel: 'Shelves',
  looseLabel: 'Not on a shelf',
};

const OTHER: Subdivision = {
  kind: 'section',
  noun: 'section',
  nounPlural: 'sections',
  pockets: null,
  why: 'Split this container into named sections so you know which part of it to look in.',
  addLabel: 'Add a section',
  groupLabel: 'Sections',
  looseLabel: 'In no section',
};

/** How a container of this type divides up. Unknown types get the plain words. */
export function subdivisionFor(type: string | null | undefined): Subdivision {
  switch (type) {
    case 'binder':
      return BINDER;
    case 'box':
      return BULK;
    case 'deckbox':
    case 'deck-linked':
      return DECK_BOX;
    case 'shelf':
      return SHELF;
    default:
      return OTHER;
  }
}

/** A binder page is nine pockets. Nothing else in storage has a real capacity. */
export const BINDER_POCKETS = 9;

interface SlotLike {
  id: string;
  name: string;
  position: number;
}

/** Slots in the order the object holds them. Position first, then name. */
export function orderSlots<T extends SlotLike>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * What to call a slot on screen.
 *
 * A binder page is named by WHERE IT IS, not by a stored string: page three is
 * the third page, and pulling page two out of a real binder makes the old page
 * three into the new page two. So the index wins over the name for a binder.
 * A divider is named by what the user wrote on it, so the name wins there.
 */
export function slotLabel(sub: Subdivision, slot: SlotLike | null, index: number): string {
  if (!slot) return sub.looseLabel;
  if (sub.kind === 'page' || sub.kind === 'shelf') {
    const stored = slot.name.trim();
    const number = capitalise(`${sub.noun} ${index + 1}`);
    // A user who renamed a page keeps their name. A page still carrying the
    // name we generated for it has no name of its own, so its position names
    // it — and that has to hold for ANY generated number, not just the one it
    // happens to sit at now. Pulling page 1 out of a binder makes the page
    // stored as "Page 2" into the first page, and "Page 1: Page 2" is not a
    // thing to show anybody.
    if (!stored || isGeneratedName(sub.noun, stored)) return number;
    return `${number}: ${stored}`;
  }
  return slot.name.trim() || `${capitalise(sub.noun)} ${index + 1}`;
}

/** The name to give the next one that gets made. */
export function nextSlotName(sub: Subdivision, existingCount: number): string {
  return `${capitalise(sub.noun)} ${existingCount + 1}`;
}

/** Is this the name {@link nextSlotName} would have written, at any number? */
function isGeneratedName(noun: string, stored: string): boolean {
  return new RegExp(`^${noun}\\s*\\d+$`, 'i').test(stored);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

interface ItemLike {
  slot_id?: string | null;
  pocket?: number | null;
  qty: number;
}

/**
 * Cards counted per slot, with everything unfiled under `loose`.
 *
 * Counts COPIES, not rows: three copies of one card in a box is three cards in
 * that box, which is the number a person looking at the box would say.
 */
export function countBySlot<T extends ItemLike>(
  items: T[]
): { bySlot: Map<string, number>; loose: number } {
  const bySlot = new Map<string, number>();
  let loose = 0;
  for (const item of items) {
    const qty = Number.isFinite(item.qty) ? item.qty : 0;
    if (item.slot_id) bySlot.set(item.slot_id, (bySlot.get(item.slot_id) ?? 0) + qty);
    else loose += qty;
  }
  return { bySlot, loose };
}

/** Which pockets on a page are taken, and by which storage row. */
export function pocketMap<T extends ItemLike & { id: string }>(
  items: T[],
  slotId: string
): Map<number, T> {
  const map = new Map<number, T>();
  for (const item of items) {
    if (item.slot_id === slotId && item.pocket) map.set(item.pocket, item);
  }
  return map;
}

/** The lowest empty pocket on a page, or null when all nine are full. */
export function nextFreePocket(taken: Iterable<number>): number | null {
  const used = new Set(taken);
  for (let p = 1; p <= BINDER_POCKETS; p++) if (!used.has(p)) return p;
  return null;
}

/**
 * How full something is, said honestly.
 *
 * A binder page gets a fraction because nine is a real, physical number that
 * the object itself fixes. Everything else gets a count, because we do not know
 * how many cards a box holds and inventing a capacity to divide by is how a
 * screen ends up claiming "22% full" about a number nobody ever set.
 */
export function describeFill(sub: Subdivision, cards: number): string {
  if (sub.pockets != null) {
    return `${cards} of ${sub.pockets} ${sub.pockets === 1 ? 'pocket' : 'pockets'} used`;
  }
  return `${cards} ${cards === 1 ? 'card' : 'cards'}`;
}

/** "12 cards" / "1 card" / "empty", for a container as a whole. */
export function describeCount(cards: number, empty = 'Empty'): string {
  if (cards <= 0) return empty;
  return `${cards.toLocaleString()} ${cards === 1 ? 'card' : 'cards'}`;
}
