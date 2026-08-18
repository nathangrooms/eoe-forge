import type { ComponentType } from 'react';
import {
  Home,
  Library,
  ScanLine,
  Heart,
  Layers,
  Hammer,
  Sparkles,
  Boxes,
  Swords,
  Trophy,
  Search,
  Store,
  Brain,
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
        matches: ['/deck'],
        description: 'Every deck you have built',
      },
      {
        title: 'Deck Builder',
        href: '/deck-builder',
        icon: Hammer,
        description: 'Build a deck card by card',
      },
      {
        title: 'AI Deck Builder',
        href: '/smart-builder',
        icon: Sparkles,
        description: 'Generate a starting list from a prompt',
      },
      {
        title: 'Preconstructed',
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
      {
        title: 'MTG Brain',
        href: '/brain',
        icon: Brain,
        description: 'Ask rules and deckbuilding questions',
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

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.matches ?? [])].some(target =>
    pathMatches(pathname, target),
  );
}

/** The nav item that owns the current route, if any. Used for breadcrumbs. */
export function findActiveNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find(item => isNavItemActive(pathname, item));
}

export function visibleGroups(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS.filter(group => !group.adminOnly || isAdmin);
}
