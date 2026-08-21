/**
 * The shareable link.
 *
 * The owner's stated route into an online game: "online should work by sending
 * a shareable link to other users". So the link is the primary object, not a
 * code somebody has to retype.
 *
 * It carries the CODE and not the table id. Three reasons, and the third is the
 * one that matters:
 *
 *   1. a code is six characters with no 0/O and no 1/I/L, so it survives being
 *      read out over a call, which a uuid does not;
 *   2. `peek_online_table(code)` already exists and takes a code, so somebody
 *      who is not seated yet can see what they are walking into;
 *   3. a table id is the thing every other RPC takes, and a link is a string
 *      people paste into public places. Keeping the id out of the URL means a
 *      shared link never becomes an argument to anything.
 *
 * Pure, and separated from the components so a test can reach it.
 */

/** The route a shared link points at. One place, so the router and the copy agree. */
export const TABLE_ROUTE = '/play/t';

export function tablePath(code: string): string {
  return `${TABLE_ROUTE}/${code.trim().toUpperCase()}`;
}

/**
 * The full link to hand somebody.
 *
 * `origin` is passed in rather than read off `window` so this runs in a test
 * and so a preview build cannot accidentally publish a localhost link.
 */
export function tableLink(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}${tablePath(code)}`;
}

/**
 * A code the way it is stored: upper case, trimmed, nothing else.
 *
 * `join_online_table` already applies `upper(trim())`, so this is about what
 * the person sees in the box matching what they are about to send, not about
 * the database needing it.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Pull a code out of whatever somebody pasted.
 *
 * People paste the whole link far more often than they type the code, and a
 * box that rejects the link it just gave them is the kind of small insult that
 * makes a feature feel unfinished.
 */
export function codeFromInput(input: string): string {
  const text = input.trim();
  if (!text) return '';

  const fromPath = text.match(/\/play\/t\/([A-Za-z0-9]{4,12})/);
  if (fromPath) return normaliseCode(fromPath[1]);

  const bare = text.match(/[A-Za-z0-9]{4,12}$/);
  return bare ? normaliseCode(bare[0]) : normaliseCode(text);
}
