import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recordWrite, type StoredScoreShape } from './recordWrite';
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
import { scryfallAPI } from '@/lib/api/scryfall';
import { planReplacements } from './replacementPlan';
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
  /** What kind of deck this is, as the Analysis tab last measured it. */
  archetype: string | null;
  /**
   * How many times the public link has been opened.
   *
   * A column since the table was created and, per the census, read by nothing
   * in `src/`: the Share page could not tell you whether anybody had looked.
   * It rides along on the record this page already loads, so reading it costs
   * nothing, and the Record tab is where "what do I know about this deck"
   * belongs.
   */
  share_view_count: number | null;
}

export type DeckSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** How long a burst of edits is allowed to coalesce before the record write. */
const RECORD_SAVE_MS = 1200;

/**
 * The gap Scryfall asks for between requests.
 *
 * Going faster does not fail loudly. A rate-limited reply carries no
 * access-control header, so the browser reports it as CORS and the card is
 * simply never added, which reads as an apply that silently skipped things.
 */
const SCRYFALL_GAP_MS = 120;

/**
 * One line of an incoming edit: take this card out, put that card in.
 *
 * Both halves are names, because that is what the optimiser deals in. An empty
 * `add` means take the card out and put nothing in, and an empty `remove` means
 * put the card in and take nothing out. `addCard` is the resolved card when the
 * caller already holds one, which spares a lookup for a card that has already
 * been fetched to draw its art.
 */
export interface DeckReplacement {
  remove: string;
  add: string;
  addCard?: unknown;
}

/**
 * What could not be done, said once, in the words of the thing that refused.
 *
 * Refusals and failed lookups are different facts and get different sentences.
 * A card outside the commander's colours was understood and turned down; a card
 * the catalogue could not find was never understood at all. Reporting them
 * together as "some cards failed" is how a colour identity mistake gets read as
 * a network problem.
 */
function report(refused: string[], unresolved: string[]) {
  if (refused.length > 0) {
    showError(
      refused.length === 1 ? 'One card could not go in' : `${refused.length} cards could not go in`,
      refused.slice(0, 2).join(' ')
    );
  }
  if (unresolved.length > 0) {
    showError(
      unresolved.length === 1
        ? 'One card could not be found'
        : `${unresolved.length} cards could not be found`,
      `${unresolved.slice(0, 3).join(', ')}${unresolved.length > 3 ? ' and others' : ''} stayed as they were.`
    );
  }
}

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
          'id, user_id, name, format, colors, description, public_enabled, public_slug, edh_analysis, edh_cards_hash, archetype, share_view_count'
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
        archetype: (record.archetype as string) ?? null,
        share_view_count: (record.share_view_count as number) ?? null,
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
    async (
      next: DeckCardRow[],
      write: () => Promise<void>,
      failure: string,
      /**
       * `silent` leaves the reporting to the caller, for a caller with
       * something more exact to say than "nothing was changed". It still
       * reverts and still sets the error state; it withholds only the toast, so
       * one failure cannot be announced twice in two different wordings.
       */
      options: { silent?: boolean } = {}
    ): Promise<boolean> => {
      const previous = rows;
      setRows(next);
      setSaveState('saving');
      try {
        await write();
        setSaveState('saved');
        return true;
      } catch (error) {
        console.error(failure, error);
        setRows(previous);
        setSaveState('error');
        if (!options.silent) showError(failure, 'Nothing was changed.');
        return false;
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

  /**
   * A whole set of replacements, applied as ONE change to the deck.
   *
   * ## The bug this exists to remove, measured
   *
   * The optimiser hands over a list. The deck page used to walk it and call
   * `replaceCard` once per row, awaiting each one. Every call in that loop is
   * the SAME function instance, closed over the SAME `rows`, because React has
   * not re-rendered while the loop is running — so each iteration computed its
   * next list from the deck as it was BEFORE the first swap and handed that to
   * `setRows`. The last row to write won, and the eight before it were painted
   * over.
   *
   * Measured on the built bundle with `scripts/optimiser-apply-measure.mjs`,
   * nine swaps applied in one press:
   *
   * ```
   * WRITTEN   9 of 9 landed        every swap really was in deck_cards
   * ON SCREEN 1 of 9 landed        the decklist showed eight of the old cards
   * requests  28
   * ```
   *
   * That is the owner's "apply 9 swaps does nothing": the deck was rewritten
   * and the page went on drawing the deck they already had. The auto pass had
   * it worse, because its receipt is a diff of the decklist it can see — it
   * applied nine changes and then reported **16 cards did not move**, and
   * offered an undo that would have reversed one of them and left the other
   * eight in place for good.
   *
   * ## So: resolve everything, work out the whole list, write once
   *
   * One snapshot, advanced locally across the whole batch, then two writes and
   * a read. Same measurement after: 4 requests instead of 28, and the decklist
   * is not this function's arithmetic — it is `fetchDeckCards`, so what is on
   * screen when it finishes IS what the database holds.
   *
   * Three rules are kept exactly, because each one was learned by losing cards:
   *
   *   - **`add: ''` is the removal sentinel.** Asking Scryfall for the empty
   *     string produced fifteen HTTP 400s and spent the budget for the real
   *     lookups.
   *   - **Nothing comes out before its replacement is in hand.** Every lookup
   *     happens first, the upsert goes before the delete, and a row whose
   *     incoming card could not be resolved is skipped whole, leaving the card
   *     it would have replaced alone.
   *   - **Scryfall wants 50-100ms between requests**, and a rate-limited reply
   *     carries no access-control header, so the browser reports CORS and the
   *     card is silently never added. The gap stays, and it is now only paid
   *     for cards the caller could not already supply.
   */
  const applyReplacements = useCallback(
    async (list: DeckReplacement[]): Promise<void> => {
      if (!deckId || !deck || list.length === 0) return;

      /* ---- 1. every incoming card in hand, before anything is taken out --- */

      const resolved: Array<{ remove: string; card: IncomingCard | null }> = [];
      const unresolved: string[] = [];
      let lookups = 0;

      for (const item of list) {
        const wanted = (item.add ?? '').trim();
        if (!wanted) {
          resolved.push({ remove: item.remove ?? '', card: null });
          continue;
        }

        /* The caller may already hold the card. The optimiser fetched it to
           draw the art, so asking for it again is a request that buys nothing
           and one more chance to be rate-limited on a card we have. */
        const held = item.addCard as IncomingCard | undefined;
        if (held && typeof held.id === 'string' && typeof held.name === 'string') {
          resolved.push({ remove: item.remove ?? '', card: held });
          continue;
        }

        if (lookups > 0) await new Promise(resolve => setTimeout(resolve, SCRYFALL_GAP_MS));
        lookups += 1;
        try {
          const card = (await scryfallAPI.getCardByName(wanted)) as IncomingCard | null;
          if (card?.id) resolved.push({ remove: item.remove ?? '', card });
          else unresolved.push(wanted);
        } catch (error) {
          console.error(`Could not look up ${wanted}`, error);
          unresolved.push(wanted);
        }
      }

      /* ---- 2. the whole change, worked out against one moving snapshot ---- */

      const { next, doomedIds, upserts, refused } = planReplacements(rows, resolved, {
        refuse,
        newRow: (card, quantity) => optimisticRow(card, { quantity }),
      });

      if (doomedIds.length === 0 && upserts.length === 0) {
        report(refused, unresolved);
        // Nothing could be done at all, so the caller must not report success.
        if (refused.length > 0 || unresolved.length > 0) {
          throw new Error('No replacement in that list could be applied.');
        }
        return;
      }

      const ok = await commit(
        next,
        async () => {
          // In before out, so a refused write leaves the deck as it was.
          if (upserts.length > 0) await upsertDeckCards(deckId, upserts);
          if (doomedIds.length > 0) await deleteDeckCards(doomedIds);
          /* Read back rather than trusting the arithmetic above. A bulk upsert
             does not hand back ids, and more to the point this whole function
             exists because a decklist and a database disagreed — so the
             decklist ends up BEING the database rather than a second opinion
             about it. It is the same reason `importCards` reads back. */
          setRows(await fetchDeckCards(deckId));
        },
        'Could not apply those changes',
        { silent: true }
      );

      if (!ok) throw new Error('The deck could not be written.');
      report(refused, unresolved);
    },
    [deckId, deck, rows, refuse, commit]
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

      /*
       * A READ IS NOT AN EDIT. DO NOT TOUCH `updated_at` FOR ONE.
       *
       * This fired on every visit to the deck page, because the score is
       * computed on mount and this effect runs when it arrives. `saveDeckRecord`
       * stamps `updated_at` unless told otherwise, so simply LOOKING at a deck
       * rewrote its row and pushed it to the top of "Last updated" on /decks.
       * Observed as a deck's date jumping from Jan 31 to Aug 29 between two
       * reads, which makes the column useless: it stops meaning "when I last
       * changed this" and starts meaning "when I last opened it".
       *
       * The decision is `recordWrite`, which is a pure function so it can be
       * tested; see `recordWrite.test.ts`.
       */
      const plan = recordWrite(
        (deck?.edh_analysis as { deckmatrix?: StoredScoreShape } | null)?.deckmatrix ?? null,
        power
      );
      if (plan === 'skip') return;

      if (recordTimer.current) clearTimeout(recordTimer.current);
      recordTimer.current = setTimeout(() => {
        void saveDeckRecord(deckId, {}, {
          power,
          edhAnalysis: deck?.edh_analysis ?? null,
          touch: plan === 'edit',
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

  /**
   * The detected archetype, written once when it changes.
   *
   * `user_decks.archetype` is a column nothing has ever written, so the
   * Analysis tab re-derived a ranked archetype on every visit and discarded it.
   * Guarded on equality because `ArchetypeDetection` reports its answer on
   * every mount, and an unguarded write here would be one request per visit to
   * a tab for a value that had not moved.
   *
   * Not routed through `persistRecord`'s debounce: this fires at most once per
   * decklist change, from a tab a reader has to open, and coalescing it with
   * the power cache would make a rare write wait on a frequent one.
   */
  const setArchetype = useCallback(
    async (archetype: string | null) => {
      if (!deckId || !deck) return;
      if ((deck.archetype ?? null) === archetype) return;
      setDeck({ ...deck, archetype });
      try {
        /* `touch: false`. Reading the Analysis tab is not editing the deck, and
           `updated_at` is what orders My Decks by "recently edited". A deck
           should not jump to the top of the list because somebody looked at
           it. */
        await saveDeckRecord(deckId, { archetype }, { touch: false });
      } catch (error) {
        console.error('Archetype save failed', error);
        setDeck(deck);
      }
    },
    [deckId, deck]
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
    applyReplacements,
    chooseCommander,
    importCards,
    rename,
    setDescription,
    setArchetype,
    persistRecord,
    setEdhAnalysis,
    copyLimitFor,
  };
}

export type DeckEditor = ReturnType<typeof useDeckEditor>;
