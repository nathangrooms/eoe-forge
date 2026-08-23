import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { CommanderSelector } from '@/components/deck-builder/CommanderSelector';
import { useDeckStore } from '@/stores/deckStore';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { fetchDeckCards, type DeckCardRow } from '@/lib/deck/deckCards';
import { setDeckCommander, type IncomingCard } from '@/lib/deck/deckMutations';

/**
 * `/deck/:id/commander` — choosing a commander, as a destination.
 *
 * `CommanderDialog` was a 38-line shell whose only job was to put
 * `CommanderSelector` behind a `max-w-4xl max-h-[90vh]` overlay. As a page the
 * search results get the whole width, the browser back button closes it, and
 * nothing dims the deck underneath.
 *
 * ## Why it moved off `/deck-builder/commander`
 *
 * It used to commit to the deck *store* and nothing else, which worked because
 * the only surface that could reach it was the builder, which held that store
 * and wrote it out on its next autosave. The builder is gone. So this route
 * names the deck it is choosing for, writes the commander to `deck_cards`
 * itself, and returns to where it came from.
 *
 * The old address still resolves here without an `:id`, and in that case the
 * selector's own write to the store is the whole job — that is how the deck
 * generator reaches it, and the generator's deck has never been saved. Two
 * callers, one picker, and neither has to know about the other.
 */
export default function DeckCommander() {
  const navigate = useNavigate();
  const { id } = useParams();

  const storeCommander = useDeckStore(state => state.commander);
  const [rows, setRows] = useState<DeckCardRow[]>([]);
  const [saving, setSaving] = useState(false);
  /*
   * This page used to swallow a failed read into `console.error` and carry on,
   * which left a picker sitting over a deck it had not managed to open: pick a
   * commander there and the write goes to a deck whose current commander is
   * unknown, so the old one is never removed. Its four sibling routes all had a
   * state for this and this one did not.
   *
   * `loading` starts false when there is no `:id`, because then there is
   * nothing to wait for — see the note above about the generator.
   */
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchDeckCards(id)
      .then(result => {
        if (!cancelled) setRows(result);
      })
      .catch(error => {
        console.error('Could not read the deck:', error);
        if (!cancelled) setLoadError('Could not read this deck, so its commander cannot be changed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const current = rows.find(row => row.is_commander) ?? null;

  /* `from` carries the exact surface that sent us here, so the labelled back
     control returns there rather than to a guessed default. Shared with export,
     share, proxies and the test hand, which all have the same problem: the deck
     page's open tab is in its query string, and rebuilding the address from the
     id alone throws it away. */
  const from = useDeckReturn(id);

  const commit = async (card: IncomingCard) => {
    if (!id) {
      navigate(from, { replace: true });
      return;
    }

    setSaving(true);
    try {
      await setDeckCommander(id, current, card);
      showSuccess('Commander set', card.name);
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Could not set the commander:', error);
      showError('Could not set that commander', 'The deck was not changed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DeckSubpageLayout
      title="Choose your commander"
      description="Pick the legendary creature that leads this deck."
      backTo={from}
      backLabel="Back to deck"
      loading={loading}
      error={loadError}
    >
      <div className="rounded-lg bg-card p-4 shadow-lg shadow-black/20 md:p-5" aria-busy={saving}>
        <CommanderSelector
          currentCommander={
            current
              ? {
                  ...(current.card ?? {}),
                  id: current.card_id,
                  name: current.card?.name ?? current.card_name,
                }
              : storeCommander
          }
          onSelect={card => void commit(card as IncomingCard)}
        />
      </div>
    </DeckSubpageLayout>
  );
}
