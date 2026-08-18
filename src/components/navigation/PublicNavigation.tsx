import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logo from '@/assets/deckmatrix-logo.png';

/** Anchors resolve to sections rendered by the marketing homepage. */
const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
];

export function PublicNavigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav
      aria-label="Marketing"
      className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur"
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link
            to="/"
            className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="DeckMatrix home"
          >
            <img src={logo} alt="DeckMatrix" className="h-8 w-auto sm:h-9" />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
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
            className="rounded-md p-2 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
          className={cn('border-t border-border py-4 md:hidden', !isMenuOpen && 'hidden')}
        >
          <div className="flex flex-col gap-1">
            {LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-4">
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
