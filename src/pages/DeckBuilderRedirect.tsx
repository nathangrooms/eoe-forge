import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * `/deck-builder` now lives at `/deck/:id`.
 *
 * There was one deck and two pages for it: `/deck/:id` read it and
 * `/deck-builder?deck=x` edited it, with two headers, two metric treatments and
 * two sets of tabs between them. The owner: *"we want both systems to be
 * consistent with each other, rather than being two entirely different ones."*
 * They are one page now, and `/deck/:id` is the canonical address, because it
 * names the deck rather than the tool and it is the shape the owner asked to
 * keep.
 *
 * The route stays as a redirect rather than being removed. `/deck-builder?deck=`
 * is what the deck tile's Edit button, the dashboard's "decks to finish", the
 * collection's recommendations, the activity feed, the templates page, the
 * precons page and every "create a deck" flow have been sending people to for a
 * long time; it is in bookmarks and in anything already shared. A dead route is
 * a worse outcome than a redirect nobody notices, and this project has that
 * rule written down. The deck id is carried across, so an old link still opens
 * the deck it named.
 *
 * With no `deck` parameter there is no deck to open, which is exactly what the
 * builder did with a bare `/deck-builder`: it sent you to the deck list.
 *
 * `replace` so Back leaves the app rather than bouncing between the old address
 * and the new one.
 */
export default function DeckBuilderRedirect() {
  const [params] = useSearchParams();
  const deckId = params.get('deck');

  if (!deckId) return <Navigate to="/decks" replace />;

  /* Anything else on the query string travels with it — `?tab=` and `?view=`
     mean the same thing on the merged page as they did on the old one. */
  const rest = new URLSearchParams(params);
  rest.delete('deck');
  const suffix = rest.toString();

  return <Navigate to={`/deck/${deckId}${suffix ? `?${suffix}` : ''}`} replace />;
}
