/**
 * What every route is called, and which ones need an account.
 *
 * ## Two problems this exists to fix
 *
 * **A dead link, a mistyped url and a locked page were the same screen.**
 * The signed-out route table ended in `<Route path="*" element={<LoginRedirect/>} />`,
 * so `/this-route-does-not-exist`, `/play` and `/decks` produced byte-identical
 * screenshots: 1,142,566 bytes each. The sign-in copy is good and worth keeping
 * for a page that really is behind an account. Telling somebody to create an
 * account for a page that will never exist is not. So the gated paths are
 * listed, they get the sign-in card, and anything else gets a real not-found.
 *
 * **Every route returned the same document title.** A screen reader announces
 * the title on navigation and it read "DeckMatrix - MTG Deck Builder &
 * Collection Manager" on all of them, so following a link announced nothing
 * about where you had arrived.
 *
 * ## The drift risk, and the ratchet
 *
 * `GATED_ROUTES` is a second copy of the signed-in route table's paths, and a
 * second copy rots. `routeMeta.test.ts` parses `App.tsx` and fails if the two
 * disagree, so adding a route to the app without adding it here is a red test
 * rather than a page that 404s for signed-out visitors.
 */

/**
 * Paths a signed-out visitor may reach. Matched before `GATED_ROUTES`, so
 * nothing here may also appear there.
 */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/auth',
  '/reset-password',
  '/forgot-password',
  '/terms',
  '/privacy',
  '/p/:slug',
  '/cards/:id',
  '/play/t/:code',
  '/play/online',
] as const;

/**
 * Paths that exist but need an account. A signed-out visitor gets the sign-in
 * card carrying where they were headed.
 */
export const GATED_ROUTES = [
  '/dashboard',
  '/landing',
  '/homepage',
  '/collection',
  '/collection/import',
  '/collection/insurance',
  '/collection/storage',
  '/collection/storage/:containerId',
  '/collection/storage/:containerId/add',
  '/marketplace',
  '/marketplace/list/:collectionItemId',
  '/marketplace/listing/:id/edit',
  '/marketplace/messages/:listingId',
  '/scan',
  '/scan/camera',
  '/decks',
  '/decks/new',
  '/precons',
  '/deck-builder',
  '/deck-builder/commander',
  '/deck/:id',
  '/deck/:id/commander',
  '/deck/:id/optimise',
  '/deck/:id/export',
  '/deck/:id/share',
  '/deck/:id/proxies',
  '/deck/:id/testhand',
  '/deck/:id/analysis',
  '/deck/:id/missing',
  '/builder',
  '/smart-builder',
  '/tutor',
  '/brain',
  '/templates',
  '/cards',
  '/wishlist',
  '/shopping',
  '/proxies',
  '/play',
  '/play/mats',
  '/life',
  '/simulate',
  '/tournament',
  '/tournament/new',
  '/settings',
  '/admin',
  '/admin/users/:userId',
] as const;

/**
 * Route pattern to the name of the page, most specific first. The whole title
 * is `<name> · DeckMatrix`, except the homepage which keeps the long form
 * because it is the one a search engine indexes.
 */
const TITLES: Array<[pattern: string, name: string]> = [
  ['/', 'DeckMatrix - MTG Deck Builder & Collection Manager'],
  ['/login', 'Sign in'],
  ['/register', 'Create an account'],
  ['/reset-password', 'Reset your password'],
  ['/forgot-password', 'Reset your password'],
  ['/terms', 'Terms of use'],
  ['/privacy', 'Privacy'],
  ['/dashboard', 'Your dashboard'],
  ['/collection/import', 'Import cards'],
  ['/collection/insurance', 'Insurance report'],
  ['/collection/storage/:containerId/add', 'Add cards to storage'],
  ['/collection/storage/:containerId', 'Storage'],
  ['/collection/storage', 'Storage'],
  ['/collection', 'Your collection'],
  ['/marketplace/list/:collectionItemId', 'List a card for sale'],
  ['/marketplace/listing/:id/edit', 'Edit your listing'],
  ['/marketplace/messages/:listingId', 'Listing messages'],
  ['/marketplace', 'Marketplace'],
  ['/scan/camera', 'Scan a card'],
  ['/scan', 'Scan'],
  ['/decks/new', 'New deck'],
  ['/decks', 'Your decks'],
  ['/precons', 'Precons'],
  ['/deck-builder/commander', 'Choose a commander'],
  ['/deck-builder', 'New deck'],
  ['/deck/:id/commander', 'Choose a commander'],
  ['/deck/:id/optimise', 'Improve this deck'],
  ['/deck/:id/export', 'Export this deck'],
  ['/deck/:id/share', 'Share this deck'],
  ['/deck/:id/proxies', 'Proxy sheet'],
  ['/deck/:id/testhand', 'Test hand'],
  ['/deck/:id', 'Deck'],
  ['/smart-builder', 'Deck generator'],
  ['/tutor', 'Tutor'],
  ['/templates', 'Templates'],
  ['/cards/:id', 'Card'],
  ['/cards', 'Search cards'],
  ['/wishlist', 'Wishlist'],
  ['/shopping', 'Shopping list'],
  ['/proxies', 'Proxy list'],
  ['/play/online', 'Play online'],
  ['/play/t/:code', 'Table'],
  ['/play/mats', 'Playmats'],
  ['/play', 'Play a game'],
  ['/life', 'Life counter'],
  ['/tournament/new', 'New tournament'],
  ['/tournament', 'Tournaments'],
  ['/settings', 'Settings'],
  ['/admin/users/:userId', 'User'],
  ['/admin', 'Admin'],
  ['/p/:slug', 'Shared deck'],
];

/** Does a concrete path match a route pattern with `:param` segments? */
export function matchesPattern(pathname: string, pattern: string): boolean {
  const a = pathname.replace(/\/+$/, '').split('/');
  const b = pattern.replace(/\/+$/, '').split('/');
  if (a.length !== b.length) return false;
  return b.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}

/**
 * The page name for a path, or null when nothing claims it. Null is how a
 * not-found page is told to name itself.
 */
export function pageNameFor(pathname: string): string | null {
  for (const [pattern, name] of TITLES) {
    if (matchesPattern(pathname, pattern)) return name;
  }
  return null;
}

/** The whole `document.title` for a path. */
export function titleFor(pathname: string): string {
  const name = pageNameFor(pathname);
  if (!name) return 'Page not found · DeckMatrix';
  if (pathname === '/') return name;
  return `${name} · DeckMatrix`;
}
