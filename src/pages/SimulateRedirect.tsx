/**
 * `/simulate` now lives at `/play`.
 *
 * Owner: *"playtest can probably merge with the play page as a main option"*.
 * Playtest was never a different product. It was the same rules engine, the
 * same mat, the same hand and the same log, differing only in who was providing
 * the actions, which is the exact thing the one table law says belongs in the
 * transport rather than in a second page. Merging it deleted a duplicate.
 *
 * The route is kept as a redirect rather than removed. Two deck tiles have been
 * sending people to `/simulate?deck=<id>` for a long time, that link is in
 * bookmarks and in anything already shared, and a dead route is a worse outcome
 * than a redirect nobody notices. The deck id is carried across, so an old link
 * still opens on the deck it named, at step two rather than at the top.
 *
 * `replace` so Back leaves the app rather than bouncing between the old address
 * and the new one.
 */

import { Navigate, useSearchParams } from 'react-router-dom';

export function SimulateRedirect() {
  const [params] = useSearchParams();
  const deck = params.get('deck');

  const next = new URLSearchParams();
  next.set('mode', 'playtest');
  if (deck) next.set('deck', deck);

  return <Navigate to={`/play?${next.toString()}`} replace />;
}

export default SimulateRedirect;
