import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { TournamentManager } from '@/components/tournament/TournamentManager';

/**
 * /tournament — the floor for every event this browser is running.
 *
 * Thin by design: the page is a title and a frame, and everything that makes an
 * event an event lives in `src/components/tournament`.
 */
export default function Tournament() {
  return (
    <StandardPageLayout
      title="Tournaments"
      description="Swiss and single-elimination events with real DCI tiebreakers, a round clock, and a deck registered to every seat"
    >
      <TournamentManager />
    </StandardPageLayout>
  );
}
