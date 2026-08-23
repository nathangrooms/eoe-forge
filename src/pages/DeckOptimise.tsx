import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DeckSubpageLayout, useDeckReturn } from '@/components/deck/DeckSubpageLayout';
import { useDeckEditor } from '@/components/deck/useDeckEditor';
import {
  analyticsCommanderOf,
  mainboardOf,
  toAnalyticsCards,
} from '@/components/deck/deckAnalyticsCards';
import { AIOptimizerPanel } from '@/components/deck-builder/AIOptimizerPanel';
import { EmptyState } from '@/components/listing';
import { useAuth } from '@/components/AuthProvider';
import { useIsFeatureEnabled } from '@/hooks/useFeatureAccess';
import { computeDeckPower, entriesFromDeckRows, type DeckPower } from '@/lib/deck/power';
import { formatLabel } from '@/lib/deck/formats';
import { computeDeckStats } from '@/lib/deck/deckCards';
import { scryfallAPI } from '@/lib/api/scryfall';
import { showError } from '@/components/ui/toast-helpers';
import type { EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import { Sparkles } from 'lucide-react';

/**
 * `/deck/:id/optimise` — the optimiser as a place, not a tab.
 *
 * ## Why it moved
 *
 * The owner has asked about the optimiser more than any other deck feature and
 * said it feels hidden away. Measured on the built bundle before this change,
 * on a 1600 x 1000 viewport:
 *
 *   - **Nothing in the product linked to it.** Not one link, anywhere. A
 *     `grep` for `tab=optimiser` across `src/` returned two comments and no
 *     hrefs. The only way in was to open a deck, scroll past the commander
 *     block, and pick the third of nine tabs.
 *   - **That tab strip starts at y=904 in a 1000px viewport**, so the door sat
 *     in the last 96 pixels of the fold, under everything else.
 *   - Above it, the deck's own controls were Favourite, Share, Export and a
 *     menu. **Export has a header button and a route of its own. The thing
 *     that rewrites your deck had neither.**
 *
 * ## Why a route rather than a bigger tab
 *
 * The design law says a destination gets a route with a real URL and a visible
 * way back, and an in-context action gets a panel. This is a destination on
 * every test: it calls an edge function, takes about twenty-five seconds to
 * produce a pass, and then draws five numbered steps, five sub-tabs of its own,
 * a confirmation flow and a receipt with an undo. Measured, the swaps step
 * alone is a 7,938px page.
 *
 * The merge that built the one deck page already drew this line and drew it
 * here: printing proxies and drawing an opening hand became routes rather than
 * tabs. Both are smaller jobs than this one.
 *
 * And there is a cost a tab was quietly charging. A pass does not survive the
 * tab strip — every one of the other eight tabs unmounts the panel and throws
 * the pass away, so eight controls directly above a twenty-five-second result
 * silently destroy it. On a route, leaving is a deliberate navigation with a
 * labelled way back.
 *
 * ## What is deliberately NOT done
 *
 * The pass is not cached across a visit. Re-showing a pass computed against a
 * deck that has since changed would put suggestions on screen that no longer
 * describe the deck, which is the one thing this project does not do. Running
 * it again is honest; remembering it is not.
 */
export default function DeckOptimise() {
  const { id } = useParams();
  const { user } = useAuth();
  /* The deck, on the tab it was open on, when that is where this came from. */
  const backTo = useDeckReturn(id);

  const editor = useDeckEditor(id);
  const { deck, rows, loading, notFound, saveState, persistRecord, applyReplacements } = editor;

  const { isEnabled: optimiserEnabled, isLoading: flagLoading } =
    useIsFeatureEnabled('ai_deck_optimizer');

  const canEdit = Boolean(deck && user && deck.user_id === user.id);

  const analyticsDeck = useMemo(() => toAnalyticsCards(rows), [rows]);
  const commander = useMemo(() => analyticsCommanderOf(analyticsDeck), [analyticsDeck]);
  const mainboard = useMemo(() => mainboardOf(analyticsDeck), [analyticsDeck]);

  const stats = useMemo(() => computeDeckStats(rows), [rows]);
  const power = useMemo<DeckPower | null>(
    () => computeDeckPower(entriesFromDeckRows(rows), { format: deck?.format ?? 'commander' }),
    [rows, deck?.format]
  );

  /* The same debounced record write the deck page makes. A pass changes the
     decklist, so the cached score has to move with it, and it is one write for
     the whole burst rather than one per swap. */
  useEffect(() => {
    if (power && deck?.id) persistRecord(power);
  }, [power, deck?.id, persistRecord]);

  const hasCards = rows.length > 0;

  return (
    <DeckSubpageLayout
      title={deck ? `Optimise “${deck.name}”` : 'Optimise deck'}
      description="Run a pass, see what is worth changing, and apply what you agree with."
      backTo={backTo}
      backLabel="Back to deck"
      loading={loading}
      error={loading ? null : notFound ? 'This deck could not be found.' : null}
      /* Only figures this page already holds. `computeDeckStats` runs over the
         rows the editor read, so none of these costs a request. */
      metrics={[
        {
          id: 'cards',
          label: 'Cards',
          value: deck ? String(stats.totalCards) : null,
          raw: stats.totalCards,
        },
        { id: 'format', label: 'Format', value: deck ? formatLabel(deck.format) : null },
        {
          /* Null rather than a number when the score is stale. A power score
             the engine will not stand behind is not a figure. */
          id: 'power',
          label: 'Power',
          value: power && !power.stale ? power.score.toFixed(1) : null,
          suffix: '/10',
          raw: power && !power.stale ? power.score : undefined,
        },
      ]}
    >
      {deck && !hasCards && (
        <EmptyState
          title="Add cards before optimising"
          description="A pass reads the decklist. There is nothing to read yet."
          icon={Sparkles}
        />
      )}

      {/* Hidden rather than disabled, the same way the tab strip used to treat
          it. An account without the flag is not shown a door it cannot open. */}
      {deck && hasCards && !flagLoading && !optimiserEnabled && (
        <EmptyState
          title="The optimiser is not switched on for this account"
          description="Everything else about this deck still works."
          icon={Sparkles}
        />
      )}

      {deck && hasCards && optimiserEnabled && (
        <AIOptimizerPanel
          deckId={deck.id}
          deckCards={mainboard as never}
          deckName={deck.name}
          format={deck.format}
          commander={commander as never}
          power={power}
          edhAnalysis={(deck.edh_analysis as unknown as EdhAnalysisData) ?? null}
          /* THE VISIBLE SAVE, and no button beside it.

             The panel is long enough that by the time a pass has been applied
             the page header is well off screen, so the state is drawn where the
             work happened. `onSaveDeck` is not passed on purpose: every apply
             writes its own rows and reports the result, so there is no pending
             timer for a button to flush, and a control whose only possible
             outcome is "already saved" teaches people to distrust the report
             next to it. */
          saveState={canEdit ? saveState : undefined}
          /* ONE HANDLER, AND IT TAKES THE WHOLE LIST.

             This used to be ninety lines written inline on the deck page, which
             walked the list calling a single-card edit per row. Every call in
             that loop closed over the same decklist, so nine swaps landed in
             the database and one landed on screen. It is `applyReplacements`
             now — one snapshot, two writes and a read back — so what is drawn
             when it finishes is what the database holds. */
          onApplyReplacements={applyReplacements}
          /* One card at a time stays one write. These are the Ideas and Cut
             tabs, where a press is a single card, and routing them through the
             batch would spend three requests where one does. */
          onAddCard={async cardName => {
            try {
              const card = await scryfallAPI.getCardByName(cardName);
              await editor.addCard(card as never, { quiet: true });
            } catch (error) {
              console.error(`Failed to add ${cardName}:`, error);
              showError(`Could not add ${cardName}`);
            }
          }}
          onRemoveCard={async cardName => {
            const row = rows.find(
              r => (r.card?.name || r.card_name) === cardName && !r.is_commander
            );
            if (row) await editor.deleteAll(row);
          }}
        />
      )}
    </DeckSubpageLayout>
  );
}
