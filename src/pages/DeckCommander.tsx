import { useLocation, useNavigate } from 'react-router-dom';
import { DeckSubpageLayout } from '@/components/deck/DeckSubpageLayout';
import { CommanderSelector } from '@/components/deck-builder/CommanderSelector';
import { useDeckStore } from '@/stores/deckStore';

/**
 * `/deck-builder/commander` — choosing a commander, as a destination.
 *
 * `CommanderDialog` was a 38-line shell whose only job was to put
 * `CommanderSelector` behind a `max-w-4xl max-h-[90vh]` overlay. The selector
 * commits straight to the deck store, so the picker works just as well as a
 * page — and this way the search results get the whole width, the browser back
 * button closes it, and nothing dims the builder underneath.
 *
 * The builder passes `state.from` so the labelled back control returns to the
 * exact surface that sent us here (`/deck-builder?deck=…`, `/smart-builder`, …)
 * rather than a guessed default.
 */
export default function DeckCommander() {
  const navigate = useNavigate();
  const location = useLocation();

  const commander = useDeckStore(state => state.commander);
  const from =
    typeof (location.state as { from?: unknown } | null)?.from === 'string'
      ? ((location.state as { from: string }).from)
      : `/deck-builder${location.search}`;

  return (
    <DeckSubpageLayout
      title="Choose your commander"
      description="Pick the legendary creature that leads this deck."
      backTo={from}
      backLabel="Back to deck"
    >
      <div className="rounded-xl bg-card p-4 shadow-sm md:p-5">
        <CommanderSelector
          currentCommander={commander}
          onSelect={() => navigate(from, { replace: true })}
        />
      </div>
    </DeckSubpageLayout>
  );
}
