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

/**
 * Directly under Home, above every group. Owner: "Card search should be below
 * the home page too."
 *
 * It earns the position for the same reason Home has it: searching the whole
 * catalogue is not one of the things you own, build or play with, so it does
 * not belong inside Collection, Decks or Play. It is a way into everything,
 * which is what the root of a nav is for.
 */
export const NAV_SEARCH: NavItem = {
  title: 'Card Search',
  href: '/cards',
  icon: Search,
  description: 'Search every printing with Scryfall syntax',
};

/**
 * Asking a question is not one of the things you own, build or play with
 * either, so Tutor joins Home and Card Search above the groups. All three are
 * ways INTO the product rather than places inside it.
 */
export const NAV_TUTOR: NavItem = {
  title: 'Tutor',
  href: '/tutor',
  icon: BookOpenCheck,
  description: 'Ask about your deck, a card or the rules',
};

/** The items that sit above the groups, in order. */
export const NAV_ROOT_ITEMS: NavItem[] = [NAV_HOME, NAV_SEARCH, NAV_TUTOR];

/*
 * TWO GROUPS, AND THE TEST FOR EACH IS ONE QUESTION.
 *
 * Owner: "Left menu needs a full restructure to make more sense ... idea is to
 * make left menu clean", then "or that might be a bad order im not sure".
 *
 * It had six headings for eleven entries, which is a heading for every two
 * things. The old ones named what an object WAS, so Collection and Decks were
 * separate because a card is not a deck, and "Discover" existed because three
 * items had nothing else in common.
 *
 * The question now is what you are DOING:
 *
 *   Library  things that are yours, or that you make for yourself
 *   Play     things you do at a table
 *
 * Everything that is a way IN rather than a place inside sits above the groups
 * with no heading at all: Home, Card Search, Tutor.
 *
 * And several entries left entirely, because a nav is not an index. New Deck,
 * Precons and Deck Generator are all reachable from the decks page, which is
 * where you already are when you want them. Wishlist and Shopping List are
 * counters in the top bar. Scan is a button there too. Playtest folds into Play
 * a Game when the modes merge, and comes out of here then rather than now,
 * because removing it before it has a home would strand it.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'library',
    label: 'Library',
    items: [
      {
        title: 'My Collection',
        href: '/collection',
        icon: Library,
        description: 'Every card you own, and where it is',
      },
      {
        title: 'My Decks',
        href: '/decks',
        icon: Layers,
        // `/deck-builder` is a child of Decks in every way except its path.
        matches: ['/deck', '/deck-builder', '/decks/new', '/smart-builder', '/precons'],
        description: 'Every deck you have built',
      },
      {
        title: 'Proxies',
        href: '/proxies',
        icon: Printer,
        description: 'Cards to print out and play with',
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
    id: 'play',
    label: 'Play',
    items: [
      {
        /* ONE entry, not two. `/play` and `/simulate` were two pages and two
           nav entries for one thing with a different seat arrangement; playtest
           is the fourth mode on this page now. `matches` keeps the rail lit on
           every step of the flow and on the online lobby, and on `/simulate`
           for the moment its redirect is in flight. */
        title: 'Play a Game',
        href: '/play',
        icon: Gamepad2,
        matches: ['/play', '/simulate'],
        description: 'Online, versus bots, goldfish or playtest',
      },
      {
        title: 'Life Counter',
        href: '/life',
        icon: Heart,
        description: 'Track life at a real table',
      },
      {
        title: 'Tournaments',
        href: '/tournament',
        icon: Trophy,
        description: 'Run a pod and keep the standings',
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
        description: 'Users, flags and the dev console',
      },
    ],
  },
];

/** Every nav item, home first, in rail order. */
export const ALL_NAV_ITEMS: NavItem[] = [
  NAV_HOME,
  ...NAV_ROOT_ITEMS,
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
