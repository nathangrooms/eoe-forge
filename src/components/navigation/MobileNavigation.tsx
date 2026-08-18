import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { LogOut, Menu, Moon, Settings, Sun, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import { AccountIdentity } from './AccountMenu';
import {
  NAV_HOME,
  isNavItemActive,
  pathMatches,
  visibleGroups,
  type NavItem,
} from './nav-items';

/**
 * The mobile menu is an expanding panel, not a Sheet.
 *
 * It drops out from under the fixed 64px top bar, full width, on the page's own
 * surface: nothing dims, nothing is trapped, and the page behind it stays
 * readable and scrollable. Tapping an item navigates and collapses it.
 */
export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close on navigation — including back/forward, which a per-link onClick misses.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Escape closes, and a tap anywhere outside the panel or its trigger closes.
  // Without a blocking overlay these have to be handled explicitly — which is
  // the trade: the page underneath stays live, so the menu has to notice when
  // the user has moved on.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOpen]);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    navigate('/login');
  };

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(location.pathname, item);

    return (
      <li key={item.href}>
        <Link
          to={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            active
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.title}</span>
        </Link>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="md:hidden">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        aria-controls="mobile-nav-panel"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        <span className="sr-only">
          {isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        </span>
      </Button>

      {isOpen && (
        <div
          id="mobile-nav-panel"
          className="fixed inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto bg-card pb-3 shadow-xl shadow-black/40 duration-200 animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none"
        >
          {/* Collapse on tap even when the item is the current route, where the
              pathname effect would not fire. */}
          <nav aria-label="Main" className="px-3 py-3" onClick={() => setIsOpen(false)}>
            <ul className="space-y-0.5">{renderItem(NAV_HOME)}</ul>

            {visibleGroups(isAdmin).map(group => (
              <section key={group.id} className="mt-5">
                <h2 className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
                <ul className="space-y-0.5">{group.items.map(renderItem)}</ul>
              </section>
            ))}
          </nav>

          <div className="mx-3 space-y-1 rounded-lg bg-muted/30 p-3">
            {user && <AccountIdentity className="px-3 pb-2 pt-1" />}

            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathMatches(location.pathname, '/settings')
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>

            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
              {isDark ? 'Light theme' : 'Dark theme'}
            </button>

            {user && (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
