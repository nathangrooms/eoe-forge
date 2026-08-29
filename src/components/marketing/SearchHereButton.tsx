import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/**
 * A call to action that leads somewhere a signed-out visitor can go.
 *
 * Three buttons on the homepage said "Try a search", "Browse every card" and
 * "Search the Commander pool", and all three went to `/cards`, which is behind
 * an account. So the page's most direct invitations were the three things a
 * first-time visitor could not do, and every one of them landed on a sign-in
 * wall a few seconds after being told "you already know how to search here".
 *
 * The homepage now carries a real search box that runs without an account, so
 * that is where these lead. It scrolls to it and puts the cursor in it, which
 * is the whole action the button is promising.
 *
 * If the box is not on the page for any reason, it falls back to the route
 * rather than doing nothing, and `/cards` at least explains itself.
 */
export function SearchHereButton({ children }: { children: React.ReactNode }) {
  const focusSearch = (event: React.MouseEvent) => {
    const box = document.getElementById('home-search') as HTMLInputElement | null;
    if (!box) return; // let the link navigate
    event.preventDefault();
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    /* After the scroll, or the browser fights the focus and jumps. */
    window.setTimeout(() => {
      box.focus();
      box.select();
    }, 450);
  };

  return (
    <Button asChild size="lg" variant="outline">
      <Link to="/cards" onClick={focusSearch}>
        {children}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}
