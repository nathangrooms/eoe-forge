import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  NAV_HOME,
  isNavItemActive,
  visibleGroups,
  type NavItem,
} from './nav-items';

const STORAGE_KEY = 'dm.nav.collapsed';

/**
 * The rail is rendered by `App.tsx` inside a fixed wrapper, and the page
 * `<main>` reserves its width with a hard-coded `md:ml-64`. `App.tsx` is owned
 * elsewhere, so collapsing the rail has to reclaim that margin from here or the
 * toggle would leave a 192px dead gutter — i.e. a control that renders but does
 * not work. This rule is scoped to the exact element App.tsx creates; if the
 * shell is later rebuilt to own the offset itself, the rule simply stops
 * matching and does nothing.
 */
const RAIL_WIDTH_BRIDGE = `
@media (min-width: 768px) {
  main.md\\:ml-64 { transition: margin-left 150ms ease; }
  html[data-nav-rail="collapsed"] main.md\\:ml-64 { margin-left: 4rem; }
}`;

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function LeftNavigation() {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  // Layout effect: the content offset is driven off this attribute, so setting
  // it after paint would flash a 256px gutter on a page loaded while collapsed.
  useLayoutEffect(() => {
    document.documentElement.dataset.navRail = collapsed ? 'collapsed' : 'expanded';
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable (private mode) — the rail still toggles this session */
    }
  }, [collapsed]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.navRail;
    },
    [],
  );

  const renderItem = useCallback(
    (item: NavItem) => {
      const active = isNavItemActive(location.pathname, item);

      const link = (
        <Link
          to={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors',
            collapsed ? 'w-9 justify-center px-0' : 'px-2.5',
            active
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {active && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground"
            />
          )}
          <item.icon className="h-4 w-4 shrink-0" />
          {collapsed ? (
            <span className="sr-only">{item.title}</span>
          ) : (
            <span className="truncate">{item.title}</span>
          )}
        </Link>
      );

      if (!collapsed) return link;

      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-56">
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
    [collapsed, location.pathname],
  );

  const groups = visibleGroups(isAdmin);

  return (
    <>
      <style>{RAIL_WIDTH_BRIDGE}</style>
      <div
        className={cn(
          'flex h-full flex-col border-r border-border bg-background transition-[width] duration-150',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <nav
          aria-label="Main"
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden py-3',
            collapsed ? 'px-3.5' : 'px-3',
          )}
        >
          <ul className="space-y-0.5">
            <li>{renderItem(NAV_HOME)}</li>
          </ul>

          {groups.map(group => (
            <section
              key={group.id}
              className={cn('mt-4 border-t border-border pt-4', collapsed && 'mt-3 pt-3')}
            >
              <h2
                className={cn(
                  'px-2.5 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                  collapsed && 'sr-only',
                )}
              >
                {group.label}
              </h2>
              <ul className="space-y-0.5">
                {group.items.map(item => (
                  <li key={item.href}>{renderItem(item)}</li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className={cn('border-t border-border py-2', collapsed ? 'px-3.5' : 'px-3')}>
          <button
            type="button"
            onClick={() => setCollapsed(value => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'w-9 justify-center px-0' : 'w-full px-2.5',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </div>
    </>
  );
}
