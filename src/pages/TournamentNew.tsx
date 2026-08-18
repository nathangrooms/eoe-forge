import { EventSetup } from '@/components/tournament/EventSetup';

/**
 * /tournament/new — creating an event.
 *
 * A destination with its own URL and a visible way back, not an overlay: this
 * is a form with a roster in it, and it was already too tall for a dialog. The
 * page itself is a shell; `EventSetup` owns the whole flow so the roster there
 * is the same component the running event uses.
 */
export default function TournamentNew() {
  return <EventSetup />;
}
