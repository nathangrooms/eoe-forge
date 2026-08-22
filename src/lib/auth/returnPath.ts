/**
 * Where a sign-in page is allowed to send you afterwards.
 *
 * An online table link goes to people who are not signed in yet, and landing
 * them on the dashboard throws the invitation away, because the table code was
 * only ever in that URL. So `/login?next=` exists and a caller may name where it
 * wanted to be.
 *
 * WHICH MAKES THIS AN OPEN REDIRECT IF IT IS WRONG. A sign-in page that will
 * forward to any URL it is handed is the classic phishing lever: the link
 * genuinely is your domain, the user genuinely does sign in, and the page then
 * hands them to somebody else's site with the trust already spent.
 *
 * ## Why this does not check the string itself
 *
 * The obvious guard is `startsWith('/') && !startsWith('//')`, and it is not
 * enough, because the browser does not read the string the way the check does.
 * The URL standard treats a BACKSLASH as a forward slash for http and https, so
 * `/\evil.com` is `//evil.com` by the time it is resolved, which is
 * protocol-relative and points at another origin. A check reading raw
 * characters sees a single leading slash and says yes.
 *
 * There are more of these than anybody wants to enumerate: a tab or newline
 * inside the scheme, a mixture of the two slashes, percent-encoding. Rather
 * than keep a list of tricks, this resolves the value the same way the browser
 * will and then asks the only question that matters, which is whether it came
 * out on our origin.
 */

/** A safe in-app path, or the dashboard. Never another origin. */
export function returnPathFrom(requested: string | null | undefined): string {
  const fallback = '/dashboard';
  if (!requested) return fallback;

  /* Anything the URL parser rejects outright is not a path we should follow.
     A base is required because a bare path has no origin of its own. */
  const base = typeof window === 'undefined' ? 'https://deckmatrix.com' : window.location.origin;
  let resolved: URL;
  try {
    resolved = new URL(requested, base);
  } catch {
    return fallback;
  }

  // The whole question. `//evil.com`, `/\evil.com` and `https://evil.com` all
  // resolve to a different origin and all end here.
  if (resolved.origin !== new URL(base).origin) return fallback;

  /* Return the path rather than the value we were given, so what the router
     receives is what was actually resolved and checked, not the original
     string with whatever oddity it carried. */
  return `${resolved.pathname}${resolved.search}${resolved.hash}` || fallback;
}
