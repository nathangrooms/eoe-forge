/**
 * Getting the body out of a Realtime broadcast.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE
 * ---------------------------------------------------------------------------
 * It lived inside `channel.ts`, which opens a Supabase client at import time
 * and therefore cannot be loaded by a test. So the one line in the whole
 * discussion that decides whether a message is seen at all was the one line
 * with no test on it, and it was wrong for as long as it existed.
 *
 * Measured at a real table on 22 Aug 2026, with the frames read off the socket:
 * a message sent by `realtime.send()` in the database arrives at a broadcast
 * handler as
 *
 *     { type: 'broadcast', event: 'chat', payload: { kind: 'reply', post: {…} } }
 *
 * The reader was looking at `payload.payload`, one level too deep, so `body`
 * was undefined and EVERY event carrying a payload was dropped: a reply, a new
 * topic, a removal, a moderator's decision, on the board and at a table alike.
 * The seats went on updating, because a seat nudge is `{kind:'lobby'}` and the
 * listener ignores its body, which is exactly why the fault looked like "chat
 * is broken" rather than "the channel is misread". The page said "Updating as
 * it happens" the whole time.
 *
 * ---------------------------------------------------------------------------
 * BOTH SHAPES, NOT THE ONE THAT IS TRUE TODAY
 * ---------------------------------------------------------------------------
 * A broadcast sent from a browser (`channel.send({type:'broadcast', payload})`)
 * nests one level deeper than one sent from the database. Nothing in this app
 * speaks from a browser yet. Reading only the database shape would put the same
 * bug back the day something does, and the cost of accepting both is one
 * `typeof` check, so both are accepted and both are tested.
 */

/** The object a broadcast was carrying, or null if it was not carrying one. */
export function broadcastBody(message: unknown): Record<string, unknown> | null {
  const outer = (message as { payload?: unknown } | null | undefined)?.payload;
  if (!outer || typeof outer !== 'object' || Array.isArray(outer)) return null;

  /* A client-sent broadcast puts the author's object under `payload.payload`.
     A database-sent one is the object itself. Anything else that happens to
     carry a `payload` key of its own would have to be an object to be mistaken
     for the nested shape, and a post payload never has one. */
  const inner = (outer as { payload?: unknown }).payload;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }

  return outer as Record<string, unknown>;
}
