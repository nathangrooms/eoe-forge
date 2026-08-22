import { CATEGORY_LABEL, categorizeCard } from '@/lib/deck/cardCategories';
import type { DeckCardRow } from '@/lib/deck/deckCards';

/**
 * Decklist serialisation for every export surface.
 *
 * The Decks page previously wired its "Export" menu item to `console.log`, so
 * the control produced nothing at all. One serialiser now backs the export
 * page, the deck page's text view and the public deck page.
 *
 * ## The merge
 *
 * There were three exporters. This one read the deck from the database, so it
 * was right whatever any store held, and it offered plain text, Arena, Magic
 * Online and CSV. `EnhancedDeckExport` hand rolled its own generators from a
 * store card and was the only one with **JSON**, **Moxfield** and the four
 * content switches. `DeckImportExport`'s export half was a straight duplicate
 * of the first four.
 *
 * So: six formats and four switches, all here, over one row type, and the two
 * hand-rolled copies are gone. Nothing was dropped to do it.
 *
 * The switches are honest about scope: `includePrices` writes a price only for
 * a card we hold one for, because 5,186 of 52,130 printings have no `usd` at
 * all and a `$0.00` beside a card is a claim that it is worthless.
 */

export type DeckExportFormat = 'text' | 'moxfield' | 'arena' | 'mtgo' | 'csv' | 'json';

export const DECK_EXPORT_FORMATS: Array<{
  value: DeckExportFormat;
  label: string;
  extension: string;
  mime: string;
}> = [
  { value: 'text', label: 'Plain text (Archidekt, TappedOut)', extension: 'txt', mime: 'text/plain' },
  { value: 'moxfield', label: 'Moxfield', extension: 'txt', mime: 'text/plain' },
  { value: 'arena', label: 'MTG Arena', extension: 'txt', mime: 'text/plain' },
  { value: 'mtgo', label: 'Magic Online', extension: 'txt', mime: 'text/plain' },
  { value: 'csv', label: 'CSV (spreadsheet)', extension: 'csv', mime: 'text/csv' },
  { value: 'json', label: 'JSON', extension: 'json', mime: 'application/json' },
];

/** The four content switches the second exporter carried, kept whole. */
export interface DeckExportOptions {
  includeCommander?: boolean;
  includeSideboard?: boolean;
  includePrices?: boolean;
  /** Cut the maindeck into `Creatures:` / `Lands:` sections. Text format only. */
  groupByType?: boolean;
  /** Written as a comment where the format has one. */
  format?: string;
  description?: string | null;
}

const DEFAULTS: Required<Pick<
  DeckExportOptions,
  'includeCommander' | 'includeSideboard' | 'includePrices' | 'groupByType'
>> = {
  includeCommander: true,
  includeSideboard: true,
  includePrices: false,
  groupByType: false,
};

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function nameOf(row: DeckCardRow): string {
  return row.card?.name || row.card_name;
}

/** The price of one copy, or null. Never 0 — see `DeckCardTable.priceOf`. */
function priceOf(row: DeckCardRow): number | null {
  const usd = parseFloat(row.card?.prices?.usd ?? '');
  return Number.isNaN(usd) ? null : usd;
}

export function serializeDeck(
  rows: DeckCardRow[],
  format: DeckExportFormat,
  deckName: string,
  options: DeckExportOptions = {}
): string {
  const opts = { ...DEFAULTS, ...options };

  const commanders = opts.includeCommander ? rows.filter(r => r.is_commander) : [];
  const mainboard = rows.filter(r => !r.is_commander && !r.is_sideboard);
  const sideboard = opts.includeSideboard ? rows.filter(r => r.is_sideboard) : [];

  if (format === 'csv') {
    const header = 'Quantity,Name,Mana Cost,Mana Value,Type,Rarity,Set,Price USD,Section';
    const line = (r: DeckCardRow, section: string) =>
      [
        r.quantity,
        csvEscape(nameOf(r)),
        csvEscape(r.card?.mana_cost || ''),
        r.card?.cmc ?? '',
        csvEscape(r.card?.type_line || ''),
        csvEscape(r.card?.rarity || ''),
        csvEscape((r.card?.set_code || '').toUpperCase()),
        r.card?.prices?.usd ?? '',
        section,
      ].join(',');

    return [
      header,
      ...commanders.map(r => line(r, 'Commander')),
      ...mainboard.map(r => line(r, 'Mainboard')),
      ...sideboard.map(r => line(r, 'Sideboard')),
    ].join('\n');
  }

  if (format === 'json') {
    const card = (r: DeckCardRow) => ({
      name: nameOf(r),
      quantity: r.quantity,
      id: r.card_id,
      type: r.card?.type_line ?? null,
      cmc: r.card?.cmc ?? null,
      ...(opts.includePrices && priceOf(r) !== null ? { price_usd: r.card?.prices?.usd } : {}),
    });

    return JSON.stringify(
      {
        name: deckName,
        format: opts.format ?? null,
        description: opts.description ?? null,
        commander: commanders.length > 0 ? card(commanders[0]) : null,
        mainboard: mainboard.map(card),
        sideboard: sideboard.map(card),
      },
      null,
      2
    );
  }

  const price = (r: DeckCardRow) => {
    if (!opts.includePrices) return '';
    const usd = priceOf(r);
    return usd === null ? '' : ` ($${usd.toFixed(2)})`;
  };

  const qty = (r: DeckCardRow) =>
    format === 'text'
      ? `${r.quantity}x ${nameOf(r)}${price(r)}`
      : `${r.quantity} ${nameOf(r)}${price(r)}`;

  const lines: string[] = [];

  if (format === 'text') {
    lines.push(`// ${deckName}`);
    if (opts.format) lines.push(`// Format: ${opts.format}`);
    if (opts.description) lines.push(`// ${opts.description}`);
    lines.push('');
  }
  if (format === 'arena') lines.push('Deck');
  if (format === 'mtgo') lines.push(`// ${deckName}`);

  if (commanders.length > 0) {
    if (format === 'text' || format === 'moxfield') lines.push('Commander');
    commanders.forEach(r => lines.push(format === 'arena' ? `${qty(r)} (Commander)` : qty(r)));
    lines.push('');
  }

  if (format === 'moxfield') lines.push('Deck');

  if (opts.groupByType && (format === 'text' || format === 'moxfield')) {
    /* Through the canonical categoriser, not `type_line.split('—')[0]`. That
       split produced a section per distinct supertype string, so
       "Legendary Creature" and "Creature" were two headings for creatures and
       an artifact land had a section of its own. */
    const buckets = new Map<string, DeckCardRow[]>();
    for (const row of mainboard) {
      const label = CATEGORY_LABEL[categorizeCard(row.card?.type_line)];
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)!.push(row);
    }
    for (const [label, group] of buckets) {
      lines.push(`${label}:`);
      group.forEach(r => lines.push(qty(r)));
      lines.push('');
    }
  } else {
    if (format === 'text') lines.push('Deck');
    mainboard.forEach(r => lines.push(qty(r)));
  }

  if (sideboard.length > 0) {
    lines.push('');
    lines.push('Sideboard');
    sideboard.forEach(r => lines.push(qty(r)));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
