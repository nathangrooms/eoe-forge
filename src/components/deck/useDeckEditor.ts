import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';
import {
  deleteDeckCard,
  deleteDeckCards,
  detailFromCard,
  optimisticRow,
  saveDeckRecord,
  setDeckCommander,
  upsertDeckCard,
  upsertDeckCards,
  type IncomingCard,
} from '@/lib/deck/deckMutations';
import { maxCopiesFor } from '@/components/deck-builder/deck-categories';
import type { DeckPower } from '@/lib/deck/power';

/**
 * The deck, and every way to change it.
 *
 * ## There is no edit mode
 *
 * A deck you own is a deck you can change. The product used to ask permission
 * first: `/deck/:id` read a deck and `/deck-builder?deck=` edited the same
 * deck, with two headers, two metric treatments and two sets of tabs between
 * them. This hook is what let the second one go — one page holds the deck and
 * the edits, so replace, add, remove, quantity and the commander are simply
 * there.
 *
 * ## One row type
 *
 * `DeckCardRow` is the shape, from `fetchDeckCards`, which joins the `cards`
 * table. The builder's store card was the weaker of the two: it had no
 * `is_sideboard` field, and a card added in that session carried no
 * `legalities`, `power`, `toughness` or `keywords`, so the legality panel and
 * the power engine saw a different card depending on how recently it had been
 * added. Every add here goes through `detailFromCard`, so a card added in this
 * session and the same card after a reload are the same object.
 *
 * ## One row per write
 *
 * Edits are optimistic and each one is a single request against the row it
 * changed. Nothing rewrites the deck. The deck's own record — `updated_at`, and
 * the power cache when there is a score — is a separate debounced write, so a
 * burst of edits costs one of those rather than one each.
 *
 * Measured with `scripts/deck-save-measure.mjs` against the built bundle:
 * removing one card cost **8 requests** on `/deck-builder`, including a POST
 * that re-upserted 98 unchanged rows.
 */

export interface DeckEditorRecord {
  id: string;
  /**
   * Who owns it.
   *
   * The one thing on this page that is genuinely guarded. `user_decks` is
   * owner-scoped by RLS, so in practice a deck you can load is a deck you own
   * and this is always you — but "the database would have refused the write
   * anyway" is not a reason to draw a control that cannot work. Everything
   * else is simply available.
   */
  user_id: string;
  name: string;
  format: string;
  colors: string[];
  description: string | null;
  public_enabled: boolean;
  public_slug: string | null;
  edh_analysis: Record<string, unknown> | null;
  edh_cards_hash: string | null;
}

export type DeckSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** How long a burst of edits is allowed to coalesce before the record write. */
const RECORD_SAVE_MS = 1200;

export function useDeckEditor(deckId: string | undefined) {
  const [deck, setDeck] = useState<DeckEditorRecord | null>(null);
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveState, setSaveState] = useState<DeckSaveState>('idle');

  const load = useCallback(async () => {
    if (!deckId) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase
        .from('user_decks')
        .select(
          'id, user_id, name, format, colors, description, public_enabled, public_slug, edh_analysis, edh_cards_hash'
        )
        .eq('id', deckId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setNotFound(true);
        return;
      }

      const record = data as Record<string, unknown>;
      setDeck({
        id: String(record.id),
        user_id: String(record.user_id ?? ''),
        name: (record.name as string) ?? 'Untitled deck',
        format: (record.format as string) ?? 'commander',
        colors: (record.colors as string[]) ?? [],
        description: (record.description as string) ?? null,
        public_enabled: Boolean(record.public_enabled),
        public_slug: (record.public_slug as string) ?? null,
        edh_analysis:
          record.edh_analysis && typeof record.edh_analysis === 'object'
            ? (record.edh_analysis as Record<string, unknown>)
            : null,
        edh_cards_hash: (record.edh_cards_hash as string) ?? null,
      });
      setRows(await fetchDeckCards(deckId));
    } catch (error) {
      console.error('Error loading deck:', error);
      showError('Failed to load deck');
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const commander = useMemo(() => rows.find(r => r.is_commander) ?? null, [rows]);

  /* ------------------------------------------------------------- writing */

  /**
   * Run a write, holding the rows it produced on screen while it goes, and put
   * the old ones back if it fails.
   *
   * Optimistic because the alternative is a decklist that lags a click, and
   * reverting because a decklist that shows a card the database does not hold
   * is worse than one that flickers.
   */
  const commit = useCallback(
    async (next: DeckCardRow[], write: () => Promise<void>, failure: string) => {
      const previous = rows;
      setRows(next);
      setSaveState('saving');
      try {
        await write();
        setSaveState('saved');
      } catch (error) {
        console.error(failure, error);
        setRows(previous);
        setSaveState('error');
        showError(failure, 'Nothing was changed.');
      }
    },
    [rows]
  );

  /**
   * The two rules the deck page has to enforce before a card goes in, refused
   * with a reason rather than reported two tabs away.
   */
  const refuse = useCallback(
    (card: IncomingCard, wanted: number): string | null => {
      if (!deck) return 'This deck is not loaded yet.';

      const format = (deck.format || 'commander').toLowerCase();
      const isCommanderFormat = format === 'commander' || format === 'edh';

      if (isCommanderFormat && commander?.card) {
        const identity = commander.card.color_identity ?? [];
        const cardIdentity = card.color_identity ?? card.colors ?? [];
        const offending = cardIdentity.filter(c => !identity.includes(c));
        if (offending.length > 0) {
          return `${card.name} is ${offending.join('')}, which ${commander.card.name} cannot support.`;
        }
      }

      const limit = maxCopiesFor(deck.format, {
        type_line: card.type_line,
        oracle_text: card.oracle_text,
      });
      if (wanted > limit) {
        return `${card.name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} in ${deck.format}.`;
      }

      return null;
    },
    [deck, commander]
  );

  const copyLimitFor = useCallback(
    (row: DeckCardRow) =>
      maxCopiesFor(deck?.format, {
        type_line: row.card?.type_line,
        oracle_text: row.card?.oracle_text,
      }),
    [deck?.format]
  );

  /** Put a card in the deck, or add a copy of one already in it. */
  const addCard = useCallback(
    async (card: IncomingCard, options: { quantity?: number; quiet?: boolean } = {}): Promise<boolean> => {
      if (!deckId || !deck) return false;
      const add = options.quantity ?? 1;
      const existing = rows.find(r => r.card_id === card.id && !r.is_sideboard);
      const wanted = (existing?.quantity ?? 0) + add;

      const problem = refuse(card, wanted);
      if (problem) {
        showError(existing ? 'Copy limit' : 'Cannot add that card', problem);
        return false;
      }

      const next = existing
        ? rows.map(r => (r.id === existing.id ? { ...r, quantity: wanted } : r))
        : [...rows, optimisticRow(card, { quantity: add })];

      await commit(
        next,
        async () => {
          const id = await upsertDeckCard(deckId, {
            card_id: card.id,
            card_name: card.name,
            quantity: wanted,
            is_commander: false,
            is_sideboard: false,
          });
          if (id && !existing) {
            setRows(current =>
              current.map(r => (r.id === `pending-${card.id}` ? { ...r, id } : r))
            );
          }
        },
        `Could not add ${card.name}`
      );

      if (!options.quiet) showSuccess('Card added', `${card.name} → ${deck.name}`);
      return true;
    },
    [deckId, deck, rows, refuse, commit]
  );

  /** Set the exact number of copies. Zero removes the card. */
  const setQuantity = useCallback(
    async (row: DeckCardRow, quantity: number) => {
      if (!deckId) return;
      const wanted = Math.max(0, Math.floor(quantity));

      if (wanted === 0) {
        await commit(
          rows.filter(r => r.id !== row.id),
          () => deleteDeckCard(deckId, row),
          `Could not remove ${row.card?.name ?? row.card_name}`
        );
        return;
      }

      const limit = copyLimitFor(row);
      if (wanted > limit) {
        showError(
          'Copy limit',
          `${row.card?.name ?? row.card_name} is capped at ${limit} cop${limit === 1 ? 'y' : 'ies'} in ${deck?.format}.`
        );
        return;
      }
      if (wanted === row.quantity) return;

      await commit(
        rows.map(r => (r.id === row.id ? { ...r, quantity: wanted } : r)),
        () =>
          upsertDeckCard(deckId, {
            card_id: row.card_id,
            card_name: row.card_name,
            quantity: wanted,
            is_commander: row.is_commander,
            is_sideboard: row.is_sideboard,
          }).then(() => undefined),
        `Could not update ${row.card?.name ?? row.card_name}`
      );
    },
    [deckId, rows, commit, copyLimitFor, deck?.format]
  );

  const removeOne = useCallback(
    (row: DeckCardRow) => setQuantity(row, row.quantity - 1),
    [setQuantity]
  );

  const deleteAll = useCallback(
    (row: DeckCardRow) => setQuantity(row, 0),
    [setQuantity]
  );

  /**
   * Swap one card for another.
   *
   * The replacement goes in before the original comes out, so a refusal leaves
   * the deck exactly as it was rather than deleting the card you were trying to
   * upgrade. That rule was learned the hard way in the optimiser's apply loop
   * and it is the same rule here.
   */
  const replaceCard = useCallback(
    async (row: DeckCardRow, card: IncomingCard): Promise<boolean> => {
      if (!deckId || !deck) return false;
      if (card.id === row.card_id) return false;

      /* Swapping into a card the deck already holds stacks the copies, so the
         copy limit is checked against the total rather than against one. */
      const already = rows.find(r => r.card_id === card.id && !r.is_sideboard);
      const problem = refuse(card, (already?.quantity ?? 0) + row.quantity);
      if (problem) {
        showError('Cannot swap that in', problem);
        return false;
      }

      const next = already
        ? rows
            .filter(r => r.id !== row.id)
            .map(r => (r.id === already.id ? { ...r, quantity: r.quantity + row.quantity } : r))
        : rows.map(r =>
            r.id === row.id
              ? {
                  ...r,
                  id: `pending-${card.id}`,
                  card_id: card.id,
                  card_name: card.name,
                  card: detailFromCard(card),
                }
              : r
          );

      await commit(
        next,
        async () => {
          const id = await upsertDeckCard(deckId, {
            card_id: card.id,
            card_name: card.name,
            quantity: (already?.quantity ?? 0) + row.quantity,
            is_commander: false,
            is_sideboard: row.is_sideboard,
          });
          await deleteDeckCard(deckId, row);
          if (id) {
            setRows(current =>
              current.map(r => (r.id === `pending-${card.id}` ? { ...r, id } : r))
            );
          }
        },
        `Could not replace ${row.card?.name ?? row.card_name}`
      );

      showSuccess('Card replaced', `${row.card?.name ?? row.card_name} → ${card.name}`);
      return true;
    },
    [deckId, deck, rows, refuse, commit]
  );

  /** Choose or change the commander. */
  const chooseCommander = useCallback(
    async (card: IncomingCard) => {
      if (!deckId) return;
      const previous = commander;
      const next = [
        ...rows.filter(r => !r.is_commander),
        optimisticRow(card, { isCommander: true }),
      ];
      await commit(
        next,
        () => setDeckCommander(deckId, previous, card),
        `Could not set ${card.name} as commander`
      );
      showSuccess('Commander set', card.name);
    },
    [deckId, commander, rows, commit]
  );

  /**
   * Add a parsed decklist.
   *
   * `replace` clears the ninety-nine first and keeps the commander, because
   * pasting a list over a deck is how you move a deck across from somewhere
   * else. The sideboard is left alone either way.
   */
  const importCards = useCallback(
    async (cards: IncomingCard[], mode: 'append' | 'replace') => {
      if (!deckId) return;

      const additions = new Map<string, { card: IncomingCard; quantity: number }>();
      for (const card of cards) {
        const existing = additions.get(card.id);
        const quantity = Math.max(1, Math.floor((card as { quantity?: number }).quantity ?? 1));
        if (existing) existing.quantity += quantity;
        else additions.set(card.id, { card, quantity });
      }

      const doomed =
        mode === 'replace' ? rows.filter(r => !r.is_commander && !r.is_sideboard) : [];
      /* Copied, not mutated. `next` would otherwise hold the same row objects
         `rows` does, so bumping a quantity here would edit the list `commit`
         is holding as the version to put back if the write fails. */
      const next = rows.filter(r => !doomed.includes(r)).map(r => ({ ...r }));
      for (const { card, quantity } of additions.values()) {
        const hit = next.find(r => r.card_id === card.id && !r.is_sideboard);
        // The commander's count is one and stays one, whatever the paste says.
        if (hit) hit.quantity = hit.is_commander ? hit.quantity : hit.quantity + quantity;
        else next.push(optimisticRow(card, { quantity }));
      }

      await commit(
        next,
        async () => {
          if (doomed.length > 0) await deleteDeckCards(doomed.map(r => r.id));
          /* The FINAL count per card, read off the list this import produced,
             not the count the paste asked for. Appending two copies of a card
             the deck already holds one of writes three, not two. */
          const wanted = new Set(additions.keys());
          await upsertDeckCards(
            deckId,
            next
              .filter(
                row =>
                  wanted.has(row.card_id) && !row.is_commander && !row.is_sideboard
              )
              .map(row => ({
                card_id: row.card_id,
                card_name: row.card_name,
                quantity: row.quantity,
                is_commander: false,
                is_sideboard: false,
              }))
          );
          // Ids are assigned by the database for a bulk upsert, so this is the
          // one edit that reads its rows back rather than guessing at them.
          setRows(await fetchDeckCards(deckId));
        },
        'Could not import that decklist'
      );

      showSuccess('Deck imported', `${additions.size} cards`);
    },
    [deckId, rows, commit]
  );

  /* -------------------------------------------------- the deck's own record */

  const rename = useCallback(
    async (name: string) => {
      if (!deckId || !deck || !name.trim()) return;
      const trimmed = name.trim();
      setDeck({ ...deck, name: trimmed });
      try {
        await saveDeckRecord(deckId, { name: trimmed });
        showSuccess('Deck renamed', trimmed);
      } catch (error) {
        console.error('Rename failed', error);
        setDeck(deck);
        showError('Could not rename this deck');
      }
    },
    [deckId, deck]
  );

  /**
   * The deck's own prose.
   *
   * The page has rendered this field under the commander for as long as it has
   * existed and nothing could write it, while the builder's autosave replaced
   * it with "commander deck with 99 cards" on every save. It is editable now,
   * and only this writes it.
   */
  const setDescription = useCallback(
    async (description: string) => {
      if (!deckId || !deck) return;
      const value = description.trim();
      if (value === (deck.description ?? '')) return;
      setDeck({ ...deck, description: value || null });
      try {
        await saveDeckRecord(deckId, { description: value });
      } catch (error) {
        console.error('Description save failed', error);
        setDeck(deck);
        showError('Could not save that description');
      }
    },
    [deckId, deck]
  );

  /**
   * The power cache and `updated_at`, debounced into one request.
   *
   * The view page fired `persistDeckPower` on every change of the computed
   * score with no delay, which was fine on a page that could not change the
   * deck and is not fine on one that can: typing in a quantity box moves the
   * score on every keystroke. And `persistDeckPower` reads `edh_analysis`
   * before it writes it, so each of those was two requests. This page already
   * holds that column, so it merges locally and writes once.
   */
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRecord = useCallback(
    (power: DeckPower | null) => {
      if (!deckId) return;
      if (recordTimer.current) clearTimeout(recordTimer.current);
      recordTimer.current = setTimeout(() => {
        void saveDeckRecord(deckId, {}, {
          power,
          edhAnalysis: deck?.edh_analysis ?? null,
        }).catch(error => console.warn('Could not cache the deck score:', error));
      }, RECORD_SAVE_MS);
    },
    [deckId, deck?.edh_analysis]
  );

  useEffect(
    () => () => {
      if (recordTimer.current) clearTimeout(recordTimer.current);
    },
    []
  );

  /** The scrape's cached read, kept here so the EDH tab can refresh it. */
  const setEdhAnalysis = useCallback(
    (analysis: Record<string, unknown> | null, hash?: string) => {
      setDeck(current =>
        current ? { ...current, edh_analysis: analysis, edh_cards_hash: hash ?? current.edh_cards_hash } : current
      );
    },
    []
  );

  return {
    deck,
    rows,
    commander,
    loading,
    notFound,
    saveState,
    reload: load,
    addCard,
    setQuantity,
    removeOne,
    deleteAll,
    replaceCard,
    chooseCommander,
    importCards,
    rename,
    setDescription,
    persistRecord,
    setEdhAnalysis,
    copyLimitFor,
  };
}

export type DeckEditor = ReturnType<typeof useDeckEditor>;
