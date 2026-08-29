import { useState } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * These sections are rendered by the marketing homepage and NOWHERE ELSE.
 *
 * They used to be bare `#features` and `#faq`. On `/` that works. On the two
 * pages a shared link actually lands on, `/cards/:id` and `/play/online`, there
 * is no such section, so measured: clicking either moved scrollY from 0 to 0,
 * nothing happened, and `#features` was left behind in the address bar. Half
 * the menu did nothing on the pages most likely to be somebody's first.
 *
 * `/#features` is a route plus a hash, so the router navigates home and
 * `RouteAnnouncer` scrolls to the section once it is on screen. On the homepage
 * itself the pathname does not change, only the hash, which is the same
 * in-page jump as before.
 */
const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#faq', label: 'FAQ' },
];

export function PublicNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Marketing"
      className="sticky top-0 z-50 bg-background/95 shadow-lg shadow-black/20 backdrop-blur"
    >
      {/* The signed-in shell has had one of these for a while (TopNavigation).
          The PUBLIC shell had none, so the homepage was 55 tab stops with no way
          past the nav, on the one page a keyboard visitor is most likely to
          arrive at first. Same pattern, two files apart. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="DeckMatrix home"
          >
            <Wordmark size="md" />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {LINKS.map(link => (
              <Link
                key={link.href}
                to={pathname === '/' ? link.href.slice(1) : link.href}
                className="rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/register">Create account</Link>
            </Button>
          </div>

          <button
            type="button"
            className="rounded-md p-3 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            onClick={() => setIsMenuOpen(open => !open)}
            aria-expanded={isMenuOpen}
            aria-controls="public-nav-menu"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div
          id="public-nav-menu"
          className={cn('py-4 md:hidden', !isMenuOpen && 'hidden')}
        >
          <div className="flex flex-col gap-1">
            {LINKS.map(link => (
              <Link
                key={link.href}
                to={pathname === '/' ? link.href.slice(1) : link.href}
                className="flex min-h-[44px] items-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 space-y-2 pt-4">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                Log in
              </Link>
            </Button>
            <Button className="w-full" asChild>
              <Link to="/register" onClick={() => setIsMenuOpen(false)}>
                Create account
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
