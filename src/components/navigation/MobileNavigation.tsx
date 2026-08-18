import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { LogOut, Menu, Moon, Settings, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '@/components/AuthProvider';
import { AccountIdentity } from './AccountMenu';
import { NewDeckDialog } from './NewDeckDialog';
import {
  NAV_HOME,
  isNavItemActive,
  pathMatches,
  visibleGroups,
  type NavItem,
} from './nav-items';

export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, user, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close on navigation — including back/forward, which a per-link onClick misses.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const isDark = mounted ? resolvedTheme === 'dark' : true;

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    navigate('/login');
  };

  const renderItem = (item: NavItem) => {
    const active = isNavItemActive(location.pathname, item);

    const className = cn(
      'flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
      active
        ? 'bg-accent font-medium text-accent-foreground'
        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    );

    const body = (
      <>
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.title}</span>
      </>
    );

    return (
      <li key={item.href}>
        {item.action === 'new-deck' ? (
          // Close the sheet first — the deck dialog is the surface that matters
          // now, and leaving the sheet open would stack two overlays.
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setNewDeckOpen(true);
            }}
            className={className}
          >
            {body}
          </button>
        ) : (
          <Link to={item.href} aria-current={active ? 'page' : undefined} className={className}>
            {body}
          </Link>
        )}
      </li>
    );
  };

  return (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation menu</span>
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="flex w-[17rem] flex-col border-none bg-card p-0">
          <SheetTitle className="px-4 pb-3 pt-4 text-sm font-semibold tracking-tight text-foreground">
            DeckMatrix
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between your collection, decks and card search.
          </SheetDescription>

          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
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

          <div className="space-y-1 bg-muted/30 p-3">
            {user && <AccountIdentity className="px-3 pb-2 pt-1" />}

            <Link
              to="/settings"
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
        </SheetContent>
      </Sheet>

      <NewDeckDialog open={newDeckOpen} onOpenChange={setNewDeckOpen} />
    </div>
  );
}
