import type { DeckCardRow } from '@/lib/deck/deckCards';

/**
 * Decklist serialisation for every export surface.
 *
 * The Decks page previously wired its "Export" menu item to `console.log`, so
 * the control produced nothing at all. One serialiser now backs the export
 * dialog, the deck detail page and the public deck page.
 */

export type DeckExportFormat = 'text' | 'arena' | 'mtgo' | 'csv';

export const DECK_EXPORT_FORMATS: Array<{
  value: DeckExportFormat;
  label: string;
  extension: string;
}> = [
  { value: 'text', label: 'Plain text (Moxfield / Archidekt)', extension: 'txt' },
  { value: 'arena', label: 'MTG Arena', extension: 'txt' },
  { value: 'mtgo', label: 'Magic Online', extension: 'txt' },
  { value: 'csv', label: 'CSV (spreadsheet)', extension: 'csv' },
];

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeDeck(
  rows: DeckCardRow[],
  format: DeckExportFormat,
  deckName: string
): string {
  const commanders = rows.filter(r => r.is_commander);
  const mainboard = rows.filter(r => !r.is_commander && !r.is_sideboard);
  const sideboard = rows.filter(r => r.is_sideboard);

  if (format === 'csv') {
    const header = 'Quantity,Name,Mana Cost,Mana Value,Type,Rarity,Set,Price USD,Section';
    const line = (r: DeckCardRow, section: string) =>
      [
        r.quantity,
        csvEscape(r.card?.name || r.card_name),
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

  const lines: string[] = [];
  const qty = (r: DeckCardRow) =>
    format === 'text' ? `${r.quantity}x ${r.card_name}` : `${r.quantity} ${r.card_name}`;

  if (format === 'arena') lines.push('Deck');
  if (format === 'mtgo') lines.push(`// ${deckName}`);

  if (commanders.length > 0) {
    if (format === 'text') lines.push('Commander');
    commanders.forEach(r => lines.push(format === 'arena' ? `${qty(r)} (Commander)` : qty(r)));
    lines.push('');
  }

  if (format === 'text') lines.push('Deck');
  mainboard.forEach(r => lines.push(qty(r)));

  if (sideboard.length > 0) {
    lines.push('');
    lines.push('Sideboard');
    sideboard.forEach(r => lines.push(qty(r)));
  }

  return lines.join('\n');
}
