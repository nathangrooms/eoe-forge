import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ScanLine, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileNavigation } from './MobileNavigation';
import { AccountMenu } from './AccountMenu';
import logo from '@/assets/deckmatrix-logo.png';

/**
 * The header is placed by `App.tsx` in a `fixed` wrapper that offsets content by
 * exactly 4rem (`pt-16`, rail `top-16`, `min-h-[calc(100vh-4rem)]`). It must
 * therefore be 64px tall at every breakpoint — it used to be `h-16 md:h-20`,
 * which overlapped the first 16px of every desktop page.
 */
export function TopNavigation() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses the header search. Nothing else in the app binds it
  // outside a focused input, so there is no collision with the card-search page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // App.tsx owns <main> and gives it no id, so stamp one on for the skip link.
  useEffect(() => {
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'main-content';
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/cards?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="h-16 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="flex h-full w-full items-center gap-3 px-3 md:px-5">
        {/* Left: mobile menu, brand */}
        <div className="flex shrink-0 items-center gap-1.5">
          <MobileNavigation />
          <Link
            to="/"
            className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="DeckMatrix home"
          >
            <img src={logo} alt="DeckMatrix" className="h-7 w-auto md:h-8" />
          </Link>
        </div>

        {/* Centre: card search */}
        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="Search cards"
          className="mx-auto hidden w-full max-w-xl items-center md:flex"
        >
          <div className="relative w-full">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search cards"
              aria-label="Search cards"
              className="h-9 pl-9 pr-14"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
              ⌘K
            </kbd>
          </div>
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>

        {/* Right: primary actions + account */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 md:hidden"
            onClick={() => navigate('/cards')}
            aria-label="Search cards"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 md:hidden"
            onClick={() => navigate('/scan')}
            aria-label="Scan cards"
          >
            <ScanLine className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="hidden h-9 lg:inline-flex"
            onClick={() => navigate('/collection?tab=add-cards')}
          >
            <Upload className="h-4 w-4" />
            Add cards
          </Button>

          <Button
            size="sm"
            className="hidden h-9 md:inline-flex"
            onClick={() => navigate('/deck-builder')}
          >
            <Plus className="h-4 w-4" />
            New deck
          </Button>

          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
