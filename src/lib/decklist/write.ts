/**
 * Writing a card list out, in the shapes this product already reads.
 *
 * ONE DIALECT, BOTH DIRECTIONS
 * ----------------------------
 * `parse.ts` is the reader and it is deliberately generous, because a player
 * pastes whatever their deck already looks like. This is the writer, and it has
 * the opposite job: emit the one shape that every reader here and elsewhere
 * agrees on. The two are held together by `write.test.ts`, which writes a list,
 * reads it back with `parseDeckList`, and requires the same cards, quantities
 * and printings to come out. A format that cannot survive that trip is a format
 * this product cannot import from itself, which is how a second dialect starts.
 *
 * The four formats are the four `DeckImportExport.tsx` already offers, with the
 * same ids, so nothing here invents a fifth name for an existing thing.
 *
 * THE PRINTING IS THE POINT
 * -------------------------
 * A proxy sheet exists to print a particular picture. A player who spent time
 * choosing borderless Atraxa and then exported `1 Atraxa, Praetors' Voice` has
 * exported a different thing from the one on their screen. So every line names
 * the set and the collector number by default, in the `(2XM) 190` shape that
 * Arena, Moxfield and Archidekt all write and `parse.ts` reads. Turning that
 * off is offered too, for anything that only understands a name.
 *
 * THE ONE CARD THAT CANNOT CARRY ITS PRINTING
 * -------------------------------------------
 * `Hazmat Suit (Used)` has a set-shaped parenthetical in its own name, so
 * `1 Hazmat Suit (Used) (UST) 57` gives a reader two things that look like a
 * printing and no way to tell which is which. Rather than emit a line that
 * reads back as a card that does not exist, the printing is left off and the
 * name goes out alone, which `parse.ts` already resolves correctly through its
 * `alternate` reading. Measured against the live catalogue on 20 Aug 2026: of
 * 97,140 printings, exactly ONE name matches that shape, and it has exactly one
 * printing, so today nothing at all is lost by leaving it off.
 *
 * No React, no network, no Supabase, so `node --test` runs it directly.
 */

import type { DeckSection } from './parse.ts';

export type DeckListFormat = 'text' | 'arena' | 'modo' | 'csv';

/** One line of the list, as much of it as we know. */
export interface WriteCard {
  name: string;
  quantity: number;
  /** Scryfall set code, e.g. `2xm`. Written in capitals. */
  setCode?: string | null;
  /** Full set name, e.g. `Double Masters`. Only the spreadsheet uses it. */
  setName?: string | null;
  collectorNumber?: string | null;
  finish?: 'nonfoil' | 'foil' | 'etched' | null;
  /** Defaults to the main deck, which is every row of a proxy list. */
  section?: DeckSection;
}

export interface WriteOptions {
  /**
   * Name the exact printing on every line. On by default, because on a proxy
   * list the printing IS what the player chose. Off gives plain card names.
   */
  printing?: boolean;
}

export interface DeckListFormatSpec {
  id: DeckListFormat;
  /** What a player calls it. */
  name: string;
  /** One line saying what to do with the text. */
  instructions: string;
  /** `.txt` or `.csv`, for the saved file. */
  extension: 'txt' | 'csv';
  /** Whether naming the printing is a choice for this format. */
  canNamePrinting: boolean;
}

export const DECKLIST_FORMATS: DeckListFormatSpec[] = [
  {
    id: 'text',
    name: 'Text',
    instructions: 'The plain list Moxfield, Archidekt and this app all read.',
    extension: 'txt',
    canNamePrinting: true,
  },
  {
    id: 'arena',
    name: 'MTG Arena',
    instructions: 'Paste into Arena, Import deck.',
    extension: 'txt',
    canNamePrinting: true,
  },
  {
    id: 'modo',
    name: 'MTGO',
    instructions: 'Quantity and card name only. Nothing else goes with it.',
    extension: 'txt',
    canNamePrinting: false,
  },
  {
    id: 'csv',
    name: 'Spreadsheet',
    instructions: 'One column each. Open it in Excel, Numbers or Sheets.',
    extension: 'csv',
    canNamePrinting: false,
  },
];

/* ------------------------------------------------------------------ *
 * One line
 * ------------------------------------------------------------------ */

/**
 * A parenthetical in the card's OWN name that a reader would mistake for a set
 * code. See the note at the top: one card in the catalogue, and this is why the
 * printing comes off that line instead of a parser being made cleverer.
 */
const SET_SHAPED = /\([A-Za-z0-9_]{2,5}\)/;

function copies(quantity: number): number {
  const n = Math.floor(Number(quantity));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/**
 * ` (2XM) 190`, or nothing.
 *
 * Capitals because every published example of this line writes the code that
 * way, and `parse.ts` lowercases what it reads, so the case carries no meaning
 * on the way back in.
 */
function printingSuffix(card: WriteCard): string {
  const set = clean(card.setCode);
  if (!set) return '';
  if (SET_SHAPED.test(card.name)) return '';
  const number = clean(card.collectorNumber);
  return number ? ` (${set.toUpperCase()}) ${number}` : ` (${set.toUpperCase()})`;
}

/** Moxfield's foil marker, which `parse.ts` reads back as the finish. */
function finishSuffix(card: WriteCard): string {
  if (card.finish === 'foil') return ' *F*';
  if (card.finish === 'etched') return ' *E*';
  return '';
}

interface LineStyle {
  /** `4x Sol Ring` rather than `4 Sol Ring`. */
  x: boolean;
  /** This format can name a printing at all. */
  printing: boolean;
  /** This format can mark a foil at all. */
  finish: boolean;
}

/**
 * The quantity is ALWAYS written, even for a single copy.
 *
 * Eight names in the catalogue end in a space and digits (`Pain 101`, `Black
 * Waltz No. 3`, `Avalanche of Sector 7`, `Behemoth of Vault 0`, `Michelangelo,
 * Weirdness to 11`, `Overseer of Vault 76`, `Pip-Boy 3000`, `Spider-Man 2099`),
 * counted 20 Aug 2026 with
 * `select count(distinct name) from cards where name ~ '\s\d+$'`. This comment
 * said six, which was never the answer that query gave. Without
 * a leading quantity, `Pain 101` reads as 101 copies of Pain, and `parse.ts`
 * says so itself: it keeps both readings and lets a lookup settle it. Writing
 * the quantity settles it here instead, for free, and no reader has to guess.
 */
function cardLine(card: WriteCard, style: LineStyle, options: WriteOptions): string {
  const quantity = copies(card.quantity);
  const head = style.x ? `${quantity}x` : `${quantity}`;
  const printing = style.printing && options.printing !== false ? printingSuffix(card) : '';
  const finish = style.finish ? finishSuffix(card) : '';
  return `${head} ${clean(card.name)}${printing}${finish}`;
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

interface Grouped {
  commander: WriteCard[];
  main: WriteCard[];
  sideboard: WriteCard[];
}

/**
 * Three groups, because three is what every target reads.
 *
 * A maybeboard or a companion is written into the main list rather than under a
 * heading half these formats would drop on the floor. A proxy list has no
 * sections at all, so all of this is a straight pass through for it.
 */
function group(cards: WriteCard[]): Grouped {
  const usable = cards.filter(card => clean(card.name));
  return {
    commander: usable.filter(card => card.section === 'commander'),
    sideboard: usable.filter(card => card.section === 'sideboard'),
    main: usable.filter(card => card.section !== 'commander' && card.section !== 'sideboard'),
  };
}

/* ------------------------------------------------------------------ *
 * The spreadsheet
 * ------------------------------------------------------------------ */

const CSV_HEADER = ['Quantity', 'Name', 'Set', 'Set code', 'Collector number', 'Finish'];

/** A field carrying a comma, a quote or a line break has to be quoted. */
function csvField(value: string | number | null | undefined): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A spreadsheet, and only a spreadsheet.
 *
 * Nothing reads this back, here or anywhere else, so it is the one format that
 * does not have to survive `parse.ts`. That buys it real columns: the set code
 * AND the set's name, the collector number, and the finish, each in its own
 * cell where a sort or a filter can reach it.
 */
function writeCsv(cards: WriteCard[]): string {
  const { commander, main, sideboard } = group(cards);
  const rows = [...commander, ...main, ...sideboard].map(card =>
    [
      copies(card.quantity),
      clean(card.name),
      clean(card.setName),
      clean(card.setCode).toUpperCase(),
      clean(card.collectorNumber),
      card.finish === 'foil' ? 'Foil' : card.finish === 'etched' ? 'Etched' : 'Normal',
    ]
      .map(csvField)
      .join(',')
  );
  return [CSV_HEADER.join(','), ...rows].join('\n');
}

/* ------------------------------------------------------------------ *
 * The whole list
 * ------------------------------------------------------------------ */

export function writeDeckList(
  cards: WriteCard[],
  format: DeckListFormat,
  options: WriteOptions = {}
): string {
  if (format === 'csv') return writeCsv(cards);

  const { commander, main, sideboard } = group(cards);
  const out: string[] = [];

  if (format === 'arena') {
    /* Arena's own heading, which `parse.ts` reads as the main deck. The
       commander sits inside it carrying `(Commander)`, which is the shape
       `DeckImportExport` already emits rather than a second one invented here. */
    const style: LineStyle = { x: false, printing: true, finish: false };
    out.push('Deck');
    for (const card of commander) out.push(`${cardLine(card, style, options)} (Commander)`);
    for (const card of main) out.push(cardLine(card, style, options));
    if (sideboard.length > 0) {
      out.push('', 'Sideboard');
      for (const card of sideboard) out.push(cardLine(card, style, options));
    }
    return out.join('\n');
  }

  if (format === 'modo') {
    /* Quantity and name. There is nowhere in this shape to put a printing, so
       `canNamePrinting` is false for it and the option is never offered. */
    const style: LineStyle = { x: false, printing: false, finish: false };
    for (const card of commander) out.push(`${cardLine(card, style, options)} (Commander)`);
    for (const card of main) out.push(cardLine(card, style, options));
    if (sideboard.length > 0) {
      out.push('');
      for (const card of sideboard) out.push(`SB: ${cardLine(card, style, options)}`);
    }
    return out.join('\n');
  }

  const style: LineStyle = { x: true, printing: true, finish: true };
  for (const card of commander) out.push(`${cardLine(card, style, options)} (Commander)`);
  if (commander.length > 0 && main.length > 0) out.push('');
  for (const card of main) out.push(cardLine(card, style, options));
  if (sideboard.length > 0) {
    out.push('', 'Sideboard:');
    for (const card of sideboard) out.push(cardLine(card, style, options));
  }
  return out.join('\n');
}

/** How many lines carry a card, which is what a reader counts on screen. */
export function countWrittenCards(cards: WriteCard[]): number {
  return cards.filter(card => clean(card.name)).length;
}

/** Copies, not lines. Four Lightning Bolts are four cards. */
export function countWrittenCopies(cards: WriteCard[]): number {
  return cards.reduce((sum, card) => (clean(card.name) ? sum + copies(card.quantity) : sum), 0);
}

/**
 * Rows the catalogue has nothing for, so the page can say so out loud.
 *
 * These are real: a list row whose `card_id` was never in the catalogue has no
 * set code to write. Production held one such proxy row on 20 Aug 2026, a Sol
 * Ring whose id is the literal text `sol-ring` from an old import.
 *
 * It asks about the set code and NOT about `printingSuffix`, which is the
 * question that was being asked and is a different one. `printingSuffix` also
 * comes back empty for `Hazmat Suit (Used)`, whose printing is left off on
 * purpose because its own name looks like a set code. We hold that card, we
 * know exactly which printing it is, and counting it here made the panel tell
 * the reader "1 card is not in our card list" about a card that is. Observed on
 * the page on 20 Aug 2026 with that card on a list.
 */
export function countWithoutPrinting(cards: WriteCard[]): number {
  return cards.filter(card => clean(card.name) && !clean(card.setCode)).length;
}

/** Dated, so two exports on different days do not overwrite each other. */
export function deckListFileName(
  format: DeckListFormat,
  prefix = 'deckmatrix-list',
  today = new Date()
): string {
  const spec = DECKLIST_FORMATS.find(f => f.id === format);
  const date = today.toISOString().slice(0, 10);
  return `${prefix}-${format}-${date}.${spec?.extension ?? 'txt'}`;
}
