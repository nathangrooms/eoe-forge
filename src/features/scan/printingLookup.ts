/**
 * Card metadata for the handful of printings a scan is deciding between.
 *
 * The hash index carries only ids and hashes, so once recognition names a few
 * candidates, their names, sets, collector numbers, art and prices are fetched
 * here. That is a single query for at most six rows — it happens after the
 * match, never during it, so it costs nothing on the recognition path.
 */

import type { PrintingIdentity } from '@/lib/vision';
import { db, type ScanCardRow } from './visionDb';

/** Everything the UI needs to draw a candidate the user can actually judge. */
export interface PrintingDetail extends PrintingIdentity {
  cardId: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  releasedAt: string | null;
  rarity: string | null;
  priceUsd: number | null;
  /** Shape `CardImage` expects, so candidates render through the one card component. */
  imageUris: Record<string, string>;
}

const SELECT =
  'id,oracle_id,name,set_code,set_name,collector_number,released_at,rarity,prices,image_uris';

/**
 * The identity subset the recognition engine needs to match an OCR'd collector
 * number against. Deliberately narrow: the engine has no business knowing about
 * prices or art.
 */
export async function lookupPrintingIdentities(cardIds: string[]): Promise<PrintingIdentity[]> {
  const rows = await fetchPrintings(cardIds);
  return rows.map((r) => ({
    cardId: r.cardId,
    setCode: r.setCode,
    collectorNumber: r.collectorNumber,
  }));
}

/** Full detail for rendering a candidate list. */
export async function fetchPrintings(cardIds: string[]): Promise<PrintingDetail[]> {
  const ids = [...new Set(cardIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await db.from('cards').select(SELECT).in('id', ids);
  if (error) throw error;

  const byId = new Map<string, PrintingDetail>();
  for (const r of (data ?? []) as ScanCardRow[]) {
    const prices = r.prices ?? {};
    const usd = prices.usd ? Number.parseFloat(prices.usd) : null;
    byId.set(r.id, {
      cardId: r.id,
      oracleId: r.oracle_id,
      name: r.name,
      setCode: r.set_code,
      setName: r.set_name ?? r.set_code,
      collectorNumber: String(r.collector_number ?? ''),
      releasedAt: r.released_at ?? null,
      rarity: r.rarity ?? null,
      priceUsd: usd != null && Number.isFinite(usd) ? usd : null,
      imageUris: r.image_uris ?? {},
    });
  }

  // Preserve the ranking the recogniser produced — the caller ordered these by
  // confidence and re-sorting them by whatever Postgres returned would throw
  // that away.
  return ids.map((id) => byId.get(id)).filter((x): x is PrintingDetail => x != null);
}
