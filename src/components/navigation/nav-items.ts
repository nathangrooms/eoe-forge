import type { ComponentType } from 'react';
import {
  Home,
  Library,
  ScanLine,
  Heart,
  Layers,
  Plus,
  Sparkles,
  Boxes,
  Swords,
  Gamepad2,
  HeartPulse,
  Trophy,
  Search,
  ShoppingCart,
  Printer,
  Store,
  BookOpenCheck,
  Shield,
} from 'lucide-react';

/**
 * The single source of truth for app-shell navigation.
 *
 * The desktop rail, the mobile sheet and the breadcrumb strip all read this
 * array. Previously the rail and the sheet each carried their own copy, which
 * had already drifted (the sheet listed /deck-builder, the rail did not, and
 * both listed two different items literally titled "Deck Builder").
 */

export interface NavItem {
  /** Label shown in the rail, the sheet and the breadcrumb. */
  title: string;
  /**
   * Where the item goes. Every item is a plain link — "New Deck" used to open a
   * dialog instead, which meant it had no URL and could not be middle-clicked;
   * it is now the `/decks/new` route.
   */
  href: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Extra path prefixes that should light this item up. `/deck/:id` is a child
   * of Decks, and `/dashboard` is an alias of `/`, but neither shares a prefix
   * with its parent route.
   */
  matches?: string[];
  /** Shown in the collapsed-rail tooltip and under the label in the sheet. */
  description: string;
}

export interface NavGroup {
  id: string;
  /** Rendered as the group heading; also the sr-only heading when collapsed. */
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

/** Sits above the groups — it is the root, not a category. */
export const NAV_HOME: NavItem = {
  title: 'Home',
  href: '/',
  icon: Home,
  matches: ['/dashboard'],
  description: 'Your decks and collection at a glance',
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'collection',
    label: 'Collection',
    items: [
      {
        title: 'My Collection',
        href: '/collection',
        icon: Library,
        description: 'Everything you own, by set and by card',
      },
      {
        title: 'Scan Cards',
        href: '/scan',
        icon: ScanLine,
        description: 'Add cards to your collection with the camera',
      },
      {
        title: 'Wishlist',
        href: '/wishlist',
        icon: Heart,
        description: 'Cards you are still hunting for',
      },
      {
        title: 'Shopping List',
        href: '/shopping',
        icon: ShoppingCart,
        description: 'What to buy, what you bought and what is on the way',
      },
      {
        // The owner asked for proxies to stop being buried in the deck page:
        // "Maybe Proxies should be its own feature in left nav". The deck
        // builder's own generator stays exactly where it is, as they asked.
        title: 'Proxies',
        href: '/proxies',
        icon: Printer,
        description: 'Cards to print out and play with',
      },
      {
        /* Card Search and Marketplace sit with the collection rather than under
           Discover. Owner: "Card search and marketplace should move into my
           collection part of left menu". Both are how you find a card to OWN,
           which is the same errand as the four above them; Discover was a
           category built around the app's structure rather than the reader's. */
        title: 'Card Search',
        href: '/cards',
        icon: Search,
        description: 'Search every printing with Scryfall syntax',
      },
      {
        title: 'Marketplace',
        href: '/marketplace',
        icon: Store,
        description: 'Prices and listings',
      },
    ],
  },
  {
    id: 'decks',
    label: 'Decks',
    items: [
      {
        title: 'My Decks',
        href: '/decks',
        icon: Layers,
        // `/deck-builder` is a child of Decks in every way except its path, and
        // nothing else claims it now that "New Deck" owns `/decks/new`.
        matches: ['/deck', '/deck-builder'],
        description: 'Every deck you have built',
      },
      /* No "New Deck" entry. Owner: "No need for new deck left menu, it works
         from my deck page." The decks page carries the button, the top bar
         carries one too, and /decks/new is still a real route so every existing
         link keeps working. */
      {
        title: 'Deck Generator',
        href: '/smart-builder',
        icon: Sparkles,
        description: 'Generate a starting list from a prompt',
      },
      {
        title: 'Precons',
        href: '/precons',
        icon: Boxes,
        description: 'Browse official precon decklists',
      },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    items: [
      {
        title: 'Play a Game',
        href: '/play',
        icon: Gamepad2,
        description: 'Goldfish or take on bots at a real table',
      },
      {
        title: 'Life Counter',
        href: '/life',
        icon: HeartPulse,
        description: 'Full-screen life totals for the table',
      },
      {
        title: 'Playtest',
        href: '/simulate',
        icon: Swords,
        description: 'Goldfish an opening hand against your list',
      },
      {
        title: 'Tournaments',
        href: '/tournament',
        icon: Trophy,
        description: 'Events and results',
      },
    ],
  },
  {
    id: 'discover',
    label: 'Discover',
    items: [
      {
        title: 'Tutor',
        href: '/tutor',
        icon: BookOpenCheck,
        description: 'Ask about your deck, a card or the rules',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    adminOnly: true,
    items: [
      {
        title: 'Admin',
        href: '/admin',
        icon: Shield,
        description: 'Card sync, users and system health',
      },
    ],
  },
];

/** Every nav item, home first, in rail order. */
export const ALL_NAV_ITEMS: NavItem[] = [
  NAV_HOME,
  ...NAV_GROUPS.flatMap(group => group.items),
];

/**
 * `/deck/abc` belongs to `/deck`, but `/deck-builder` does not — so prefix
 * matching has to stop at a path separator.
 */
export function pathMatches(pathname: string, target: string): boolean {
  if (target === '/') return pathname === '/';
  if (pathname === target) return true;
  return pathname.startsWith(target.endsWith('/') ? target : `${target}/`);
}

/** Length of the longest target of `item` that claims `pathname`, or -1. */
function matchDepth(pathname: string, item: NavItem): number {
  let best = -1;
  for (const target of [item.href, ...(item.matches ?? [])]) {
    if (pathMatches(pathname, target)) best = Math.max(best, target.length);
  }
  return best;
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const depth = matchDepth(pathname, item);
  if (depth < 0) return false;
  /* `/decks/new` is claimed by both "My Decks" (`/decks`) and "New Deck"
     (`/decks/new`). The more specific item owns the route, otherwise the rail
     lights up twice and neither highlight means anything. */
  return !ALL_NAV_ITEMS.some(
    other => other !== item && matchDepth(pathname, other) > depth,
  );
}

/** The nav item that owns the current route, if any. Used for breadcrumbs. */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find(item => isNavItemActive(pathname, item));
}

export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.filter(group => !group.adminOnly || isAdmin);
}
