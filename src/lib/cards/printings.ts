/**
 * Reading printings out of the database, and naming them in plain words.
 *
 * `cardQuery.ts` decides WHICH source you are allowed to read (one row per
 * card, or every printing). This file is the small amount of work that only
 * makes sense once you have chosen "every printing": how many there are, what
 * they cost, and how to write one down so a player recognises the copy in their
 * sleeve.
 *
 * The arithmetic that turns this into a collection total lives in
 * `src/lib/pricing/printings.ts` and is pure. This half is the IO.
 */

import { supabase } from '@/integrations/supabase/client';
import { cardPrintings } from './cardQuery';
import type { PrintingSpread } from '@/lib/pricing/printings';

/**
 * The database view holding one row per card with the count of printings and
 * the price range across them. A view rather than a materialized view on
 * purpose: `cards` is written every night by the sync, and a stale range would
 * be a worse answer than a slightly slower one.
 */
const SPREAD_RELATION = 'card_printing_spread';

/** PostgREST caps a URL, and `in.(…)` with 4,000 uuids will not fit in one. */
const SPREAD_CHUNK = 150;

interface SpreadRow {
  oracle_id: string;
  printings: number;
  usd_min: string | number | null;
  usd_max: string | number | null;
  usd_foil_min: string | number | null;
  usd_foil_max: string | number | null;
  eur_min: string | number | null;
  eur_max: string | number | null;
  eur_foil_min: string | number | null;
  eur_foil_max: string | number | null;
}

function num(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function toSpread(row: SpreadRow): PrintingSpread {
  return {
    oracleId: row.oracle_id,
    printings: Number(row.printings) || 1,
    usdMin: num(row.usd_min),
    usdMax: num(row.usd_max),
    usdFoilMin: num(row.usd_foil_min),
    usdFoilMax: num(row.usd_foil_max),
    eurMin: num(row.eur_min),
    eurMax: num(row.eur_max),
    eurFoilMin: num(row.eur_foil_min),
    eurFoilMax: num(row.eur_foil_max),
  };
}

/**
 * How many printings each of these cards has, and what they cost.
 *
 * An id missing from the returned map means we could not find out, and callers
 * must treat that as "unknown", never as "one printing". `valueOwned` already
 * does.
 */
export async function fetchPrintingSpreads(
  oracleIds: Iterable<string | null | undefined>
): Promise<Map<string, PrintingSpread>> {
  const ids = [...new Set([...oracleIds].filter((id): id is string => !!id))];
  const out = new Map<string, PrintingSpread>();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += SPREAD_CHUNK) {
    const chunk = ids.slice(i, i + SPREAD_CHUNK);
    const { data, error } = await supabase
      .from(SPREAD_RELATION as 'cards')
      .select('*')
      .in('oracle_id', chunk);

    if (error) {
      // Partial knowledge beats none: whatever chunks did answer are still
      // true, and the missing ones stay unknown rather than becoming wrong.
      console.error('Could not read printing spread:', error.message);
      continue;
    }

    for (const row of (data ?? []) as unknown as SpreadRow[]) {
      out.set(row.oracle_id, toSpread(row));
    }
  }

  return out;
}

/**
 * The columns any printing picker needs. Kept short so the payload stays small.
 *
 * `faces` earns its place despite being null for all but 854 rows: a picked
 * printing is handed straight back to the caller and used, and for a transform
 * card the back of it exists only there. Without it, choosing different art for
 * a Delver of Secrets on a proxy sheet would quietly stop printing its back.
 */
export const PRINTING_COLUMNS =
  'id, oracle_id, name, set_code, set_name, collector_number, released_at, rarity, ' +
  'image_uris, faces, prices, finishes, artist, illustration_id, border_color, frame_effects, ' +
  'full_art, promo, variation, layout, type_line, mana_cost, cmc, colors, color_identity, ' +
  'legalities, is_legendary';

/**
 * Every printing of one card, newest first.
 *
 * Reads the local catalogue, which now holds them all. The card page used to
 * ask Scryfall directly because our table held roughly one printing per card
 * and would have shown a variants row of one. That is no longer true, and going
 * to our own table means the ids are ids this product can actually store on a
 * collection row.
 */
export async function fetchPrintings(oracleId: string): Promise<any[]> {
  const { data, error } = await cardPrintings()
    .select(PRINTING_COLUMNS)
    .eq('oracle_id', oracleId)
    .order('released_at', { ascending: false })
    .order('collector_number', { ascending: true })
    .limit(400);

  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

/**
 * What makes this printing different from the others, in the words printed on
 * the card or visible on it.
 *
 * Returns an empty list for an ordinary printing, so a caller can render it
 * unconditionally and get nothing rather than the word "normal" on every row.
 */
export function printingTraits(printing: any): string[] {
  const traits: string[] = [];
  if (printing?.full_art) traits.push('Full art');
  if (printing?.border_color === 'borderless') traits.push('Borderless');
  const effects: string[] = Array.isArray(printing?.frame_effects) ? printing.frame_effects : [];
  if (effects.includes('extendedart')) traits.push('Extended art');
  if (effects.includes('showcase')) traits.push('Showcase');
  if (effects.includes('etched')) traits.push('Etched');
  if (effects.includes('inverted')) traits.push('Inverted');
  if (printing?.promo) traits.push('Promo');
  if (printing?.variation && traits.length === 0) traits.push('Variant');
  return traits;
}

/**
 * One line naming a printing: the set it came in and its number in that set.
 *
 * Collector number is not decoration. Within one set the showcase, borderless
 * and extended art versions of a card share a name and a set code and differ
 * only by number and picture, and they do not cost the same.
 */
export function describePrinting(printing: any): string {
  if (!printing) return '';
  const set = printing.set_name || String(printing.set_code ?? printing.set ?? '').toUpperCase();
  const number = printing.collector_number ? ` #${printing.collector_number}` : '';
  const traits = printingTraits(printing);
  return `${set}${number}${traits.length ? `, ${traits.join(', ').toLowerCase()}` : ''}`;
}

/**
 * The sentence stating what happens if the player does not choose.
 *
 * Written once so every surface says the same thing. The rule it describes is
 * the deck optimiser's, which `cards_unique` and `comparePrintings()` also use:
 * the cheapest printing we hold a price for.
 */
export const DEFAULT_PRINTING_NOTE =
  'We use the cheapest printing unless you pick a different one.';
