/**
 * Turning parsed lines into real cards, in one request.
 *
 * THE HARD RULE
 * -------------
 * A 99 card list is one query. Two outages and a disk IO warning on this
 * project came from per-card loops, and the deck importer still runs one at a
 * time against Scryfall with a sleep between calls. Everything here goes
 * through `resolve_card_names`, a single database function that takes the whole
 * list and hands back a row per line, including the lines that matched nothing.
 * Committing the result is one statement too, `card_list_add_many`.
 *
 * WHAT COMES BACK, AND WHY IT IS MORE THAN A YES OR NO
 * ---------------------------------------------------
 * A proxy sheet is a decision about art. So a match carries the printing that
 * was chosen and how many others exist, and the reader can swap it before
 * anything is saved. A miss carries the nearest real card names, so a typo can
 * be corrected rather than quietly losing a card off the list.
 */

import { supabase } from '@/integrations/supabase/client';
import { addManyToList } from '@/lib/shopping/api.ts';
import { mergeParsedLines, parseDeckList, type ParsedCardLine } from './parse.ts';

/** How the line was matched. `near` and `none` both need the reader to look. */
export type MatchStatus = 'printing' | 'exact' | 'face' | 'near' | 'none';

export interface Suggestion {
  id: string;
  name: string;
  score: number;
}

export interface ResolvedEntry {
  /** Stable across re-renders and edits, so React keys and swaps behave. */
  key: string;
  line: ParsedCardLine;
  /** The text the catalogue was actually asked for. */
  query: string;
  status: MatchStatus;
  /** The printing that will be printed. Null when nothing matched. */
  card: any | null;
  quantity: number;
  /** How many printings of this card exist, so the reader knows there is a choice. */
  printings: number;
  suggestions: Suggestion[];
}

/** A match the reader does not need to check. */
export function isSettled(entry: ResolvedEntry): boolean {
  return entry.status === 'printing' || entry.status === 'exact' || entry.status === 'face';
}

/**
 * Where one request stops being reasonable.
 *
 * Measured against the live database on 20 Aug 2026: 99 names that all match
 * take 120 ms, and 99 names that all have to fall through to the near-match
 * search take 871 ms, against the 8 second statement timeout the web role
 * carries. 600 leaves room for a cube list and still lands well inside that.
 * Over it, the reader is told rather than having lines quietly ignored.
 */
export const MAX_LINES = 600;

interface RpcRow {
  idx: number;
  query: string;
  status: MatchStatus;
  card: any | null;
  printings: number;
  suggestions: Suggestion[] | null;
}

/**
 * Resolve a pasted list.
 *
 * Lines with two honest readings (see `alternate` in `parse.ts`) send both in
 * the same batch and the better answer wins, so `Pain 101` stays a card and
 * `Lightning Bolt 4` becomes four Lightning Bolts without either being guessed.
 */
export async function resolveParsedLines(cards: ParsedCardLine[]): Promise<ResolvedEntry[]> {
  if (cards.length === 0) return [];

  const requests: { name: string; set?: string; cn?: string }[] = [];
  const primaryAt: number[] = [];
  const alternateAt: (number | null)[] = [];

  cards.forEach(card => {
    primaryAt.push(requests.length);
    requests.push({ name: card.name, set: card.setCode, cn: card.collectorNumber });
    if (card.alternate) {
      alternateAt.push(requests.length);
      requests.push({ name: card.alternate.name });
    } else {
      alternateAt.push(null);
    }
  });

  const { data, error } = await supabase.rpc('resolve_card_names' as any, {
    p_lines: requests as any,
  });
  if (error) throw error;

  const rows = new Map<number, RpcRow>();
  for (const row of (data ?? []) as unknown as RpcRow[]) rows.set(row.idx, row);

  return cards.map((card, i) => {
    const primary = rows.get(primaryAt[i]);
    const altIndex = alternateAt[i];
    const alternate = altIndex === null ? undefined : rows.get(altIndex);

    /* The reading that actually found a card wins. The full line is tried
       first, because a card whose name ends in a number is a card. */
    const useAlternate =
      Boolean(alternate) &&
      !settled(primary?.status) &&
      settled(alternate?.status);

    const chosen = useAlternate ? alternate! : primary;
    const quantity = useAlternate ? card.alternate!.quantity : card.quantity;

    return {
      key: `${card.line}-${card.name}-${card.setCode ?? ''}-${card.collectorNumber ?? ''}`,
      line: card,
      query: chosen?.query ?? card.name,
      status: chosen?.status ?? 'none',
      card: chosen?.card ?? null,
      quantity,
      printings: chosen?.printings ?? 0,
      suggestions: chosen?.suggestions ?? [],
    };
  });
}

function settled(status: MatchStatus | undefined): boolean {
  return status === 'printing' || status === 'exact' || status === 'face';
}

/**
 * Paste in, entries out. The whole journey, one query.
 *
 * A line the parser could not read is looked up anyway, as itself. It costs
 * nothing extra because it rides in the same batch, it sometimes works, and it
 * means the review screen has ONE list of problems rather than two: the reader
 * does not care whether it was the reading or the looking up that failed.
 */
export async function resolvePastedList(text: string) {
  const parsed = parseDeckList(text);
  const merged = mergeParsedLines(parsed.cards);

  const asWritten: ParsedCardLine[] = parsed.unreadable.map(row => ({
    line: row.line,
    raw: row.raw,
    name: row.raw,
    quantity: 1,
    section: 'main' as const,
  }));

  const all = [...merged, ...asWritten];
  const overLimit = Math.max(0, all.length - MAX_LINES);
  const entries = await resolveParsedLines(all.slice(0, MAX_LINES));
  return { parsed, entries, overLimit };
}

/* ------------------------------------------------------------------ *
 * Committing
 * ------------------------------------------------------------------ */

export interface CommitInput {
  kind: 'shopping' | 'proxy';
  entries: ResolvedEntry[];
}

/**
 * Put the whole reviewed list on a list, in one statement.
 *
 * Only entries that found a card go, and that is the point of showing the
 * review first: nothing is committed until the reader has seen what was found
 * and what was not.
 */
export async function commitResolvedList({ kind, entries }: CommitInput): Promise<number> {
  return addManyToList({
    kind,
    source: 'manual',
    items: entries
      .filter(entry => entry.card?.id)
      .map(entry => ({
        card_id: entry.card.id,
        card_name: entry.card.name,
        oracle_id: entry.card.oracle_id ?? null,
        quantity: entry.quantity,
        finish: entry.line.finish ?? 'nonfoil',
      })),
  });
}
