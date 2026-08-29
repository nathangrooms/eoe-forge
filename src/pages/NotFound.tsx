import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { Home, LayoutGrid, Library, LogIn, MessagesSquare, Search, UserPlus } from 'lucide-react';

/**
 * A real not-found page, and the reason it needed to exist.
 *
 * The signed-out route table ended in a catch-all that sent EVERY unmatched
 * path to the sign-in card. Measured: `/this-route-does-not-exist`, `/play` and
 * `/decks` produced byte-identical screenshots, 1,142,566 bytes each. So a
 * stale link, a typo and a page that genuinely needs an account all said "That
 * page needs an account. Sign in and we will take you straight there." The
 * middle one of those is a lie, and it is the one a sceptical visitor is most
 * likely to hit, because a stale link is the classic sign of an abandoned site.
 *
 * The routes that really are behind an account are listed in
 * `GATED_ROUTES` now and still get that card, which is good copy and worth
 * keeping. Everything else lands here.
 *
 * What arriving here should give you is somewhere to go, and the somewheres
 * differ: a signed-out visitor cannot use "your decks", and a signed-in one
 * does not need "create an account".
 */
const NotFound = () => {
  const location = useLocation();
  const { user } = useAuth();

  const destinations = user
    ? [
        { to: '/dashboard', icon: Home, label: 'Your dashboard', note: 'Where you left off.' },
        { to: '/decks', icon: Library, label: 'Your decks', note: 'Everything you have built.' },
        { to: '/collection', icon: LayoutGrid, label: 'Your collection', note: 'What you own, box by box.' },
        { to: '/cards', icon: Search, label: 'Search cards', note: 'The whole paper card pool.' },
      ]
    : [
        { to: '/', icon: Home, label: 'Home', note: 'What DeckMatrix does.' },
        { to: '/play/online', icon: MessagesSquare, label: 'The open board', note: 'Readable without an account.' },
        { to: '/login', icon: LogIn, label: 'Sign in', note: 'Back to your decks.' },
        { to: '/register', icon: UserPlus, label: 'Create an account', note: 'Free while we are in early access.' },
      ];

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          There is no page at this address
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Nothing is broken and you do not need an account for this one. The address{' '}
          <span className="break-all font-mono text-sm text-foreground/90">
            {location.pathname}
          </span>{' '}
          just does not point at anything. If you followed a link from somewhere else, that link
          is out of date.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {destinations.map(({ to, icon: Icon, label, note }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                {label}
              </span>
              <span className="mt-1.5 block text-sm text-muted-foreground">{note}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
