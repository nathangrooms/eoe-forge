import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MetricRow } from '@/components/listing';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/components/ui/toast-helpers';
import { deckRecordStats, type MatchRow } from '@/lib/deck/deckRecord';
import { DeckPrimerGenerator } from '@/components/deck-builder/DeckPrimerGenerator';
import { EnhancedMatchTracker } from '@/components/deck-builder/EnhancedMatchTracker';
import { DeckNotesPanel } from '@/components/deck-builder/DeckNotesPanel';

/**
 * The Record tab: what a human knows about this deck.
 *
 * ## The query lives here
 *
 * `deck_matches` is read once, by this panel, and the roll-up is
 * `@/lib/deck/deckRecord`. The tab's metric row and the tracker under it are
 * two things that have to agree about one set of rows, so exactly one of them
 * reads and computes. Two panels on this tab each ran their own read once and
 * then printed win rates that drifted apart the moment you logged a game; the
 * previous pass folded them together and this is the last step of it.
 *
 * ## Two things the census found and neither was UI work
 *
 * **`user_decks.share_view_count` is a column and nothing in `src/` reads it.**
 * The Share page could not tell you whether anybody had looked. It comes down
 * with the deck record, so it costs nothing, and this is the tab where "what do
 * I know about this deck" belongs.
 *
 * **`DeckPrimerGenerator` had no strategy to print.** Its own comment said so:
 * `strategy` was not passed because nothing on the page held one.
 * `ArchetypeDetection` derived one on the Analysis tab and kept it to itself.
 * It is persisted to `user_decks.archetype` now, so the primer has it.
 *
 * ## What is still missing, said out loud rather than faked
 *
 * The primer is `localStorage` and is not on the public deck page. Moxfield's
 * primer is the main reason people read other people's decks, and this one is
 * private to its author on one browser. Fixing that means a column to keep it
 * in, which is a migration and not a UI decision, so it is named here and not
 * invented.
 */

export interface DeckRecordPanelProps {
  deckId: string;
  deckName: string;
  commanderName?: string;
  cardCount: number;
  /** From `user_decks.archetype`, written by the Analysis tab. */
  archetype?: string | null;
  /** From `user_decks.share_view_count`. */
  shareViews?: number | null;
  /** Whether the deck has a public link at all, for the share tile's caption. */
  shared?: boolean;
}

export function DeckRecordPanel({
  deckId,
  deckName,
  commanderName,
  cardCount,
  archetype,
  shareViews,
  shared,
}: DeckRecordPanelProps) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deck_matches')
        .select('id, result, opponent_commander, opponent_deck_name, played_at, notes')
        .eq('deck_id', deckId)
        /* Newest first, which is what makes "the last ten games" the first ten
           rows. `deckRecordStats` relies on it and says so. */
        .order('played_at', { ascending: false });
      if (error) throw error;
      setMatches((data ?? []) as MatchRow[]);
    } catch (error) {
      showError(
        'Could not load this deck’s matches',
        error instanceof Error ? error.message : 'Please try again.'
      );
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => deckRecordStats(matches), [matches]);

  /* The busiest month on the timeline sets the bar heights, so a deck playing
     twice a month and one playing thirty times both read as a shape rather
     than as a flat line or a wall. */
  const busiest = Math.max(1, ...stats.months.map(m => m.played));
  const anyPlayed = stats.months.some(m => m.played > 0);

  return (
    <div className="space-y-6">
      {/* Six figures, at the top, in the tile every other figure in the product
          uses. They were inside the tracker's own body, one ground in, so the
          tab opened on a form control rather than on its record. */}
      <MetricRow
        columns={6}
        metrics={[
          {
            id: 'matches',
            label: 'Matches',
            value: stats.total.toLocaleString(),
            raw: stats.total,
            subtext: stats.total === 0 ? 'none recorded yet' : 'recorded on this deck',
          },
          { id: 'wins', label: 'Wins', value: stats.wins.toLocaleString(), raw: stats.wins },
          {
            id: 'losses',
            label: 'Losses',
            value: stats.losses.toLocaleString(),
            raw: stats.losses,
            /* Draws have no tile of their own because most decks have none, and
               a row of six with a permanent 0 in it is a worse row. */
            subtext: stats.draws > 0 ? `${stats.draws} drawn` : undefined,
          },
          {
            id: 'rate',
            label: 'Win rate',
            /* A dash, not 0%. A deck with no matches has not won nothing, it
               has not played. */
            value: stats.winRate === null ? '—' : `${stats.winRate.toFixed(1)}%`,
            raw: stats.winRate ?? undefined,
            /* No meter here or on the form tile beside it. Matches, wins,
               losses and a view count have no denominator, and `MetricRow`
               reserves the bar's line for the whole row as soon as one tile
               asks for it — so four of these six would draw an empty track,
               which on a raised tile reads as a bar at a hundred per cent. */
            subtext: stats.total > 0 ? `${stats.wins} of ${stats.total}` : 'no matches yet',
          },
          {
            id: 'recent',
            label: 'Recent form',
            value: stats.recentWinRate === null ? '—' : `${stats.recentWinRate.toFixed(0)}%`,
            raw: stats.recentWinRate ?? undefined,
            subtext:
              stats.recentCount > 0
                ? `last ${stats.recentCount} game${stats.recentCount === 1 ? '' : 's'}`
                : 'no matches yet',
          },
          {
            id: 'shares',
            label: 'Shared views',
            value: shareViews === null || shareViews === undefined ? '—' : String(shareViews),
            raw: shareViews ?? undefined,
            /* `MetricTile` truncates its subtext to one line. Measured at 1280
               in a six-column row, a 151px tile, this one read "this deck has
               no public l…". Short enough to survive the width it is drawn at
               rather than the width it was written at. */
            subtext: shared
              ? shareViews
                ? 'opens of your link'
                : 'nobody has opened it'
              : 'no public link yet',
          },
        ]}
      />

      {/* THE TIMELINE.
          `deck_matches.played_at` has been on every row since the table was
          created and there was no timeline at all. Twelve months, every one of
          them including the empty ones, because the gap is the information: a
          deck you stopped playing in March looks like one. */}
      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div>
            <h3 className="text-lg font-semibold">When you played it</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The last twelve months. Bar height is games played; the shaded part is the ones
              you won. A month with no games has no win rate, which is not the same as losing
              them all.
            </p>
          </div>

          {anyPlayed ? (
            <div>
              <div className="flex h-24 items-end gap-1.5">
                {stats.months.map(month => (
                  <div key={month.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div
                      className="w-full overflow-hidden rounded-sm bg-muted"
                      style={{
                        height: `${Math.max((month.played / busiest) * 100, month.played > 0 ? 6 : 2)}%`,
                      }}
                      title={
                        month.played === 0
                          ? `${month.label}: nothing played`
                          : `${month.label}: ${month.played} played, ${month.wins} won`
                      }
                    >
                      <div
                        className="w-full bg-foreground/70"
                        style={{
                          height: `${month.played > 0 ? (month.wins / month.played) * 100 : 0}%`,
                          marginTop: `${month.played > 0 ? 100 - (month.wins / month.played) * 100 : 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1.5">
                {stats.months.map(month => (
                  <span
                    key={month.month}
                    className={cn(
                      'min-w-0 flex-1 truncate text-center text-[10px]',
                      month.played > 0 ? 'text-muted-foreground' : 'text-muted-foreground/50'
                    )}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              No games recorded in the last twelve months. Record one below and the shape of how
              often you play this deck builds up here.
            </p>
          )}
        </CardContent>
      </Card>

      {/* The primer is a control and a form and has no panel of its own, so on
          a tab of full-width cards it read as a button somebody had left
          behind. The surface comes from here; the name comes from the
          component, which carries it whether it is open or shut. */}
      <Card>
        <CardContent className="space-y-3 p-5 md:p-6">
          <DeckPrimerGenerator
            deckId={deckId}
            deckName={deckName}
            commander={commanderName}
            /* The strategy line, at last. `DeckPrimerGenerator`'s own comment
               said nothing on the page held one; the Analysis tab derives it
               and it is persisted to `user_decks.archetype` now. */
            strategy={archetype ?? undefined}
            cardCount={cardCount}
          />
        </CardContent>
      </Card>

      <EnhancedMatchTracker
        deckId={deckId}
        deckName={deckName}
        matches={matches}
        stats={stats}
        loading={loading}
        onRecorded={() => void load()}
      />

      <DeckNotesPanel deckId={deckId} />
    </div>
  );
}

export default DeckRecordPanel;
