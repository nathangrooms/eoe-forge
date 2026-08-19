/**
 * Give a write a deadline, so a wedged server cannot look like a dead button.
 *
 * ## Why this exists
 *
 * Adding a card to a container is three round trips: resolve the name, add it
 * to the collection, file it into the box. None of them has a timeout, because
 * `supabase-js` is `fetch` underneath and `fetch` waits forever by default.
 *
 * That was measured, not imagined. During a verification run the project's API
 * gateway stopped answering while the database itself stayed up: every request
 * with a key hung instead of failing. Pressing a card in the add search then
 * did *nothing at all* - no card, no error, no toast - and because the panel
 * sets a `processing` flag before the first await and clears it in `finally`,
 * the flag never cleared, so every later press was ignored too. One unlucky
 * click and the whole panel was silently dead until a reload.
 *
 * A person cannot tell that apart from a broken button, and "it did not add
 * properly" is the exact complaint this whole area exists to answer. So a write
 * either finishes, fails, or gives up out loud.
 *
 * ## Why 20 seconds
 *
 * Long enough that a slow but working request still lands: the add path is
 * three sequential calls and a cold Scryfall resolve is a few seconds on its
 * own. Short enough that a person has not yet decided the app is broken and
 * started clicking other things.
 */
export const WRITE_TIMEOUT_MS = 20000;

/** What the user is told when the server never answered. */
export const TIMED_OUT_MESSAGE = 'The server did not answer. Check your connection and try again.';

/**
 * Resolve with `work`, or reject once `ms` has passed.
 *
 * The underlying request is NOT cancelled, because these are writes: a request
 * that is merely slow may still be committed on the server, and pretending
 * otherwise would be worse than saying nothing. What this guarantees is only
 * that the caller gets an answer and can put its interface back in a state
 * where the next press does something.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number = WRITE_TIMEOUT_MS,
  message: string = TIMED_OUT_MESSAGE
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
