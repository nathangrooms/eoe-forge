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
  /** Copies involved, when the event has a count worth showing. */
  quantity: number | null;
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
  if (kind === 'deck') return `/deck-builder?deck=${entityId}`;
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
      quantity: quantity && quantity > 1 ? quantity : null,
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
    quantity: copies > 1 ? copies : null,
    artCardId: row.card_id,
    artCardName: row.card_name,
    href: '/collection',
  };
}

/** Two records of the same card within this window are one event, logged twice. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

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
          .order('created_at', { ascending: false })
          .limit(limit * 3),
        supabase
          .from('user_collections')
          .select('id, card_id, card_name, quantity, foil, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(limit * 2),
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

      const merged = [...logEntries, ...collectionEntries]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);

      setEntries(merged);
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
