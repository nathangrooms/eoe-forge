import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { FIELD } from '@/components/listing';
import { Wordmark } from '@/components/Wordmark';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ScanLine, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileNavigation } from './MobileNavigation';
import { AccountMenu } from './AccountMenu';
import { HistoryNav } from './HistoryNav';
/* Deliberately the file, not `@/components/shopping`.
 *
 * That barrel re-exports the whole feature, including `ShoppingListPage` and
 * `ProxyListPage`, and this header renders on every signed-in screen. Going
 * through the barrel put the entire shopping and proxy-printing feature into
 * the shell's own chunk, which every visitor downloads before anything renders:
 * the proxy print geometry, the proxy sheet, the card-size slider and the Radix
 * select and slider they pull with them. All of it for one cart badge. */
import { CartNavButton } from '@/components/shopping/CartNavButton';
import { WishlistNavButton } from '@/components/shopping/WishlistNavButton';

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
    <header className="h-16 w-full bg-card/95 shadow-lg shadow-black/20 backdrop-blur supports-[backdrop-filter]:bg-card/80">
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
            <Wordmark size="md" />
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
              /* The one hairline that was on every page in the product.
                 Measured on the built bundle: every screen in the deck and
                 discovery pass reported exactly one visible border and it was
                 this field, because `Input` ships `border border-input` and
                 this mount never opted out. It wears the shared field skin now,
                 the same as the search box on every listing it leads to. */
              className={cn(FIELD, 'h-9 pl-9 pr-14')}
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline-block">
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

          {/* SCAN IS THE ONLY ACTION UP HERE NOW.

              It was a phone-only icon beside "Add cards" and "New deck", which
              between them made the bar a third place to start a deck and a
              second place to add cards. Owner: "remove scan cards from the left
              menu, add it to top menu - remove add cards and new deck from top
              menu."

              Scanning earns the spot because it is the one thing you do with a
              pile of cards in your hand and no page in mind. Adding cards lives
              on the collection, and starting a deck lives on the decks page,
              which is where both were already reachable. */}
          {/* ORDER: back and forward, shopping, scan, profile. Owner: "Maybe it
              should be left/right - shopping - scan - profile."

              It reads outward from the page you are on. The arrows are about
              where you have BEEN, so they sit closest to the content. Then the
              two standing errands, the list you are filling and the camera you
              fill it with. Then you, at the far edge, which is where an account
              menu belongs in every product anyone has used. */}
          <HistoryNav className="mr-0.5" />

          <WishlistNavButton />

          <CartNavButton />

          <Button
            variant="secondary"
            size="sm"
            className="h-9 gap-2 px-2.5 sm:px-3"
            onClick={() => navigate('/scan')}
            aria-label="Scan cards"
            title="Scan cards with your camera"
          >
            <ScanLine className="h-4 w-4" />
            <span className="hidden sm:inline">Scan</span>
          </Button>

          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
