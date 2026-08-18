import { Navigate } from 'react-router-dom';

/**
 * `/builder` was a static mockup: every card-stack count was a hardcoded `0`,
 * the CMC buckets, colour sources and role balance were literals, and none of
 * the Export / Playtest / Share / History buttons had a handler. It also
 * rendered a three-column shell inside a block container, so the intended
 * layout never composed.
 *
 * The real builder is `/deck-builder?deck=<id>`, which needs a deck to open,
 * so this route now sends people to the deck list to pick or create one.
 */
export default function Builder() {
  return <Navigate to="/decks" replace />;
}
