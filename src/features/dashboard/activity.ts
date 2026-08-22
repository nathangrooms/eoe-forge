import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/**
 * The recent-activity feed, rebuilt around the card that was actually touched.
 *
 * The old widget read `getRecentActivity()`, which flattens every row into a
 * sentence — "Added 1 card" — and throws away the one fact that makes the row
 * worth looking at: *which* card. Every reference needed to recover that is
 * already stored, it was simply never followed:
 *
 * - `activity_log.entity_id` is the printing id when `entity = 'card'`, and the
 *   deck id when `entity = 'deck'` (whose commander lives in `deck_cards`).
 * - `user_collections.card_id` is a foreign key to `cards`.
 *
 * So the feed is assembled from two sources rather than one. `activity_log` is
 * sparse — only the scan drawers write `card_added` — while `user_collections`
 * records every card the user has ever taken in, with a timestamp. Merging them
 * means the widget still has something to show for a user who has never opened
 * a scanner, and the two are de-duplicated where they describe the same event.
 *
 * Artwork itself is resolved by the consuming component through
 * `useCardLookup`, so a card that appears twice in the feed is fetched once.
 */

export type ActivityKind = 'card' | 'deck' | 'generic';

export interface ActivityEntry {
  id: string;
  /** activity_log type, or the synthetic 'collection_added' / 'collection_updated'. */
  type: string;
  kind: ActivityKind;
  at: string;
  /** The card or deck name — never a sentence. */
  title: string;
  /** What happened to it, e.g. "Scanned into collection". */
  detail: string;
  /** Copies involved. Summed when a run of repeats is collapsed into one row. */
  quantity: number | null;
  /** How many source events this row stands for. 1 unless a run was collapsed. */
  occurrences: number;
  /** Card whose art represents this row: the card itself, or a deck's commander. */
  artCardId: string | null;
  artCardName: string | null;
  href: string | null;
}

interface ActivityLogRow {
  id: string;
  type: string;
  entity: string;
  entity_id: string;
  meta: Record<string, unknown> | null;
  created_at: string | null;
}

interface CollectionRow {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number | null;
  foil: number | null;
  created_at: string;
  updated_at: string;
}

const DECK_DETAIL: Record<string, string> = {
  deck_created: 'Deck created',
  deck_updated: 'Deck updated',
  deck_deleted: 'Deck deleted',
  deck_favorited: 'Deck starred',
  deck_opened: 'Deck opened',
  ai_build_run: 'Built with AI',
};

const CARD_DETAIL: Record<string, string> = {
  card_added: 'Added to collection',
  collection_import: 'Imported to collection',
  wishlist_added: 'Added to wishlist',
  listing_created: 'Listed for sale',
  sale_completed: 'Sale completed',
  scan_completed: 'Scanned',
};

const SCAN_SOURCES = new Set(['scan', 'camera_scan', 'simple_scan', 'camera']);

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function int(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) ? Math.round(n) : null;
}

/** Where a row takes you when clicked. Never a dead link. */
function hrefFor(type: string, kind: ActivityKind, entityId: string, name: string | null) {
  if (kind === 'deck') return `/deck/${entityId}`;
  if (kind === 'card') {
    if (type === 'wishlist_added') return '/wishlist';
    if (type === 'listing_created' || type === 'sale_completed') return '/marketplace';
    if (type === 'card_added' || type === 'collection_import') return '/collection';
    return name ? `/cards?q=${encodeURIComponent(name)}` : '/cards';
  }
  if (type === 'collection_import' || type === 'scan_completed') return '/collection';
  return null;
}

function fromLog(row: ActivityLogRow): ActivityEntry | null {
  const at = row.created_at;
  if (!at) return null;

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const name = str(meta.name);
  const source = str(meta.source);
  const quantity = int(meta.quantity) ?? int(meta.count);

  const kind: ActivityKind =
    row.entity === 'card' ? 'card' : row.entity === 'deck' ? 'deck' : 'generic';

  if (kind === 'card') {
    const scanned = source ? SCAN_SOURCES.has(source) : false;
    return {
      id: `log:${row.id}`,
      type: row.type,
      kind,
      at,
      title: name ?? 'Card',
      detail:
        row.type === 'card_added' && scanned
          ? 'Scanned into collection'
          : CARD_DETAIL[row.type] ?? 'Collection updated',
      quantity: quantity && quantity > 0 ? quantity : 1,
      occurrences: 1,
      artCardId: row.entity_id || null,
      artCardName: name,
      href: hrefFor(row.type, kind, row.entity_id, name),
    };
  }

  if (kind === 'deck') {
    const format = str(meta.format);
    const base = DECK_DETAIL[row.type] ?? 'Deck updated';
    return {
      id: `log:${row.id}`,
      type: row.type,
      kind,
      at,
      title: name ?? 'Untitled deck',
      detail: format ? `${base} · ${format}` : base,
      quantity: null,
      occurrences: 1,
      // Filled in below from deck_cards — a deck's face is its commander.
      artCardId: null,
      artCardName: null,
      href: hrefFor(row.type, kind, row.entity_id, name),
    };
  }

  const count = int(meta.count);
  const title =
    row.type === 'collection_import'
      ? `Imported ${(count ?? 0).toLocaleString()} cards`
      : row.type === 'scan_completed'
        ? `Scanned ${(count ?? 0).toLocaleString()} cards`
        : (name ?? 'Activity');

  return {
    id: `log:${row.id}`,
    type: row.type,
    kind,
    at,
    title,
    detail: str(meta.description) ?? (source ? `From ${source.replace(/_/g, ' ')}` : ''),
    quantity: null,
    occurrences: 1,
    artCardId: null,
    artCardName: null,
    href: hrefFor(row.type, kind, row.entity_id, name),
  };
}

function fromCollection(row: CollectionRow): ActivityEntry | null {
  const at = row.updated_at || row.created_at;
  if (!at) return null;

  // A row whose `updated_at` still equals `created_at` has only ever been added;
  // anything later means copies were added or removed afterwards.
  const isNew = !row.created_at || row.created_at === row.updated_at;
  const copies = (row.quantity ?? 0) + (row.foil ?? 0);

  return {
    id: `col:${row.id}`,
    type: isNew ? 'collection_added' : 'collection_updated',
    kind: 'card',
    at,
    title: row.card_name,
    detail: isNew ? 'Added to collection' : 'Collection updated',
    quantity: copies > 0 ? copies : 1,
    occurrences: 1,
    artCardId: row.card_id,
    artCardName: row.card_name,
    href: '/collection',
  };
}

/** Two records of the same card within this window are one event, logged twice. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Consecutive repeats further apart than this stay separate rows. */
const RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Collapse consecutive repeats of the same subject into one row.
 *
 * A scanning session is the normal case here, not an edge case: adding four
 * copies of a card writes four rows, and the feed then says the same sentence
 * four times and shows nothing else. Adjacent identical events become a single
 * row whose count is the total copies involved, which is both shorter and more
 * informative than the run it replaces.
 *
 * Bounded by a day so a staple bought every few months does not silently merge
 * into one row stamped with today's date.
 */
function collapseRuns(entries: ActivityEntry[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];

  for (const entry of entries) {
    const previous = out[out.length - 1];

    /*
     * Two rows about the SAME CARD, next to each other, are one thing that
     * happened, whatever the two writers called it.
     *
     * The types deliberately do not have to match. A scan writes both a
     * `card_added` log row and a `user_collections` row, and when those land
     * further apart than the ten-minute de-duplication window above, the feed
     * showed the same card twice: once as "Scanned into collection" and once as
     * "Collection updated". With only two activity tiles in the first row now,
     * that spent the entire section on one card.
     *
     * Decks still require a matching type, because "Deck created" followed by
     * "Deck updated" really are two events worth reading.
     */
    const subject = (item: ActivityEntry) => item.artCardId ?? item.artCardName;
    const sameCard =
      previous &&
      previous.kind === 'card' &&
      entry.kind === 'card' &&
      Boolean(subject(previous)) &&
      subject(previous) === subject(entry);

    const sameSubject =
      previous &&
      previous.kind === entry.kind &&
      (sameCard || (previous.type === entry.type && previous.title === entry.title)) &&
      subject(previous) === subject(entry) &&
      new Date(previous.at).getTime() - new Date(entry.at).getTime() < RUN_WINDOW_MS;

    if (sameSubject) {
      previous.occurrences += 1;
      if (previous.quantity !== null) {
        /*
         * A run of identical events is a run of separate additions, so those
         * add up. Two DIFFERENT records of one event are not: a scan of four
         * copies writes a log row saying 4 and a collection row saying 4, and
         * summing them would report eight copies of a card the user has four
         * of. Whichever record counted more is the answer.
         */
        previous.quantity =
          previous.type === entry.type
            ? previous.quantity + (entry.quantity ?? 1)
            : Math.max(previous.quantity, entry.quantity ?? 1);
      }
      continue;
    }

    out.push({ ...entry });
  }

  return out;
}

export function useActivityFeed(limit = 8) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      const [{ data: logRows, error: logError }, { data: collectionRows }] = await Promise.all([
        supabase
          .from('activity_log')
          .select('id, type, entity, entity_id, meta, created_at')
          .eq('user_id', user.id)
          // Over-fetched because runs of repeats collapse away below.
          .order('created_at', { ascending: false })
          .limit(limit * 6),
        supabase
          .from('user_collections')
          .select('id, card_id, card_name, quantity, foil, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(limit * 3),
      ]);

      if (logError) throw logError;

      const logEntries = ((logRows ?? []) as unknown as ActivityLogRow[])
        .map(fromLog)
        .filter((entry): entry is ActivityEntry => entry !== null);

      /* A deck row is represented by its commander's art, so the commander ids
         for every deck in the feed are fetched in a single follow-up query. */
      const deckIds = Array.from(
        new Set(
          ((logRows ?? []) as unknown as ActivityLogRow[])
            .filter(row => row.entity === 'deck' && row.entity_id)
            .map(row => row.entity_id)
        )
      );

      if (deckIds.length > 0) {
        const { data: commanderRows } = await supabase
          .from('deck_cards')
          .select('deck_id, card_id, card_name')
          .in('deck_id', deckIds)
          .eq('is_commander', true);

        const commanderByDeck = new Map<string, { id: string; name: string }>();
        for (const row of commanderRows ?? []) {
          if (!commanderByDeck.has(row.deck_id)) {
            commanderByDeck.set(row.deck_id, { id: row.card_id, name: row.card_name });
          }
        }

        const logById = new Map(
          ((logRows ?? []) as unknown as ActivityLogRow[]).map(row => [`log:${row.id}`, row])
        );
        for (const entry of logEntries) {
          if (entry.kind !== 'deck') continue;
          const commander = commanderByDeck.get(logById.get(entry.id)?.entity_id ?? '');
          if (commander) {
            entry.artCardId = commander.id;
            entry.artCardName = commander.name;
          }
        }
      }

      /* De-duplicate: a scan writes both a `card_added` log row and a
         `user_collections` row, and showing the same card twice, seconds apart,
         is exactly the kind of noise that makes a feed unreadable. */
      const loggedCards = logEntries
        .filter(entry => entry.kind === 'card' && entry.artCardId)
        .map(entry => ({ cardId: entry.artCardId as string, at: new Date(entry.at).getTime() }));

      const collectionEntries = ((collectionRows ?? []) as unknown as CollectionRow[])
        .map(fromCollection)
        .filter((entry): entry is ActivityEntry => entry !== null)
        .filter(entry => {
          const at = new Date(entry.at).getTime();
          return !loggedCards.some(
            logged =>
              logged.cardId === entry.artCardId &&
              Math.abs(logged.at - at) < DUPLICATE_WINDOW_MS
          );
        });

      const merged = [...logEntries, ...collectionEntries].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      );

      // Collapse before slicing, so a run of repeats does not eat the whole feed.
      setEntries(collapseRuns(merged).slice(0, limit));
    } catch (err) {
      console.error('Error building activity feed:', err);
      setError('Could not load your recent activity.');
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  return { entries, loading, error, refetch: fetchFeed };
}
