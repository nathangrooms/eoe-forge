/**
 * Turning collection rows into a file somebody opens somewhere else.
 *
 * ## Why this is a module and not three closures inside the component
 *
 * The output of this code LEAVES THE APP. Nothing on screen shows it, so a
 * defect here is invisible until it is in a spreadsheet or has been refused by
 * an importer. The collection page needs an account, so the only way to prove
 * these are right without one is to run them. `exportFormats.test.ts` does.
 *
 * ## What was wrong when they lived in the component
 *
 * 1. `item.price_usd?.toString() || '0'` wrote a literal `0` into the price
 *    column for a card we hold no price for. The smallest real price in the
 *    catalogue is 0.01, so a zero is always invented, and this one was invented
 *    into a file somebody then sums.
 * 2. `item.set_code` is a copy taken when the collection row was written, and
 *    it stores the string 'UNK' when the set was not known. 10 of one account's
 *    53 rows exported `UNK`. Moxfield cannot match a printing without the set,
 *    which is the only reason to export in Moxfield's format at all.
 * 3. `price_usd` is stale even when it is present: 35 of that account's 53 rows
 *    differ from the live price, worst drift $16.08.
 * 4. Today's market price was written into Moxfield's `Purchase Price` column,
 *    which means what you paid.
 *
 * The query that feeds these already selected `cards.set_code` and
 * `cards.prices`, and the Moxfield branch already read
 * `item.cards.collector_number`. The join was there and unused.
 */

/* Relative, and with extensions: this module is exercised by `node --test`,
   which does not resolve the `@/` alias. `conditions.ts` imports nothing, which
   is why the grades were split out of `browser/types.ts`. */
import { readAmount } from '../../lib/pricing/sources.ts';
import { conditionLabel } from './browser/conditions.ts';

/** The shape actually selected by the collection export query. */
export interface ExportRow {
  card_name?: string | null;
  quantity?: number | null;
  foil?: number | null;
  condition?: string | null;
  set_code?: string | null;
  updated_at?: string | null;
  cards?: {
    name?: string | null;
    set_code?: string | null;
    collector_number?: string | null;
    type_line?: string | null;
    mana_cost?: string | null;
    rarity?: string | null;
    prices?: Record<string, unknown> | null;
  } | null;
}

export interface ExportFields {
  quantity: boolean;
  foil: boolean;
  condition: boolean;
  price: boolean;
  setCode: boolean;
}

/**
 * Which set a printing is from.
 *
 * `cards` is the authority. The copy on the collection row is a fallback, and
 * 'UNK' is not a set code, it is a placeholder meaning nobody knew. There is no
 * set with that code in the catalogue.
 */
export function setCodeOf(item: ExportRow): string {
  const joined = item.cards?.set_code;
  if (joined) return String(joined);
  const stored = String(item.set_code || '').trim();
  if (!stored || stored.toLowerCase() === 'unk' || stored.toLowerCase() === 'unknown') return '';
  return stored;
}

/**
 * The live price for the copies owned, or null.
 *
 * Null, never 0. A holding that is only foils takes the foil price; anything
 * else takes the ordinary price and falls back to foil, which is what the rest
 * of the collection surfaces do.
 */
export function priceOf(item: ExportRow): number | null {
  const prices = item.cards?.prices ?? undefined;
  const usd = readAmount(prices?.usd);
  const foil = readAmount(prices?.usd_foil) ?? readAmount(prices?.usd_etched);
  if ((item.foil || 0) > 0 && (item.quantity || 0) === 0) return foil ?? usd;
  return usd ?? foil;
}

/** One CSV cell. Doubles any quote inside, which is what the format asks for. */
export function cell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Our own spreadsheet. Readable, and honest about a price we do not have. */
export function generateCSV(collection: ExportRow[], fields: ExportFields): string {
  const headers = ['Card Name'];
  if (fields.quantity) headers.push('Quantity');
  if (fields.foil) headers.push('Foil');
  if (fields.condition) headers.push('Condition');
  if (fields.setCode) headers.push('Set Code');
  if (fields.setCode) headers.push('Collector Number');
  if (fields.price) headers.push('Price (USD)');

  const rows = collection.map(item => {
    const row: Array<string | number | null> = [item.card_name ?? item.cards?.name ?? ''];
    if (fields.quantity) row.push(item.quantity ?? 0);
    if (fields.foil) row.push((item.foil ?? 0) > 0 ? 'Yes' : 'No');
    if (fields.condition) row.push(conditionLabel(item.condition ?? undefined));
    if (fields.setCode) row.push(setCodeOf(item).toUpperCase());
    if (fields.setCode) row.push(item.cards?.collector_number ?? '');
    if (fields.price) {
      /* Blank, not 0. A spreadsheet reads an empty cell as "no figure" and a
         zero as "this card is worthless". */
      const price = priceOf(item);
      row.push(price == null ? '' : price.toFixed(2));
    }
    return row.map(cell).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function generateJSON(collection: ExportRow[], fields: ExportFields): string {
  const out = collection.map(item => {
    const obj: Record<string, unknown> = { name: item.card_name ?? item.cards?.name ?? null };
    if (fields.quantity) obj.quantity = item.quantity ?? 0;
    if (fields.foil) obj.foil = item.foil ?? 0;
    if (fields.condition) obj.condition = item.condition ?? null;
    if (fields.setCode) obj.set_code = setCodeOf(item) || null;
    if (fields.setCode) obj.collector_number = item.cards?.collector_number ?? null;
    if (fields.price) obj.price_usd = priceOf(item);
    if (item.cards) {
      obj.card_details = {
        type_line: item.cards.type_line ?? null,
        mana_cost: item.cards.mana_cost ?? null,
        rarity: item.cards.rarity ?? null,
      };
    }
    return obj;
  });
  return JSON.stringify(out, null, 2);
}

export const MOXFIELD_HEADERS =
  'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price';

export function generateMoxfield(collection: ExportRow[]): string {
  const rows = collection.map(item => {
    /* The stored vocabulary is mint/near_mint/excellent/good/light_played/
       played/poor; an earlier map keyed on `lightly_played` and
       `moderately_played`, values the domain type can never produce, so every
       real row silently fell through to "Near Mint". */
    return [
      item.quantity ?? 0,
      0,
      cell(item.card_name ?? item.cards?.name ?? ''),
      setCodeOf(item).toUpperCase(),
      conditionLabel(item.condition ?? undefined),
      'English',
      (item.foil ?? 0) > 0 ? 'foil' : '',
      '',
      item.updated_at ? new Date(item.updated_at).toISOString() : '',
      item.cards?.collector_number ?? '',
      '',
      '',
      /* `Purchase Price` means WHAT YOU PAID. We do not know that, and writing
         today's market price into it tells the importer you bought every card
         at its current value. Left blank on purpose. */
      '',
    ].join(',');
  });

  return [MOXFIELD_HEADERS, ...rows].join('\n');
}
