import { Link } from 'react-router-dom';
import { Camera, Layers, Search, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The first screen for an account with nothing in it.
 *
 * Twelve of the thirteen real accounts in this database have no cards, no
 * wishlist and no activity, and most have either no deck or one empty one. What
 * every one of them saw was $0.00, 0, 0, $0.00, and four progress bars reading
 * 0/3, 0/50, 0/100, 0/100. That is a wall of zeroes presented as a report, and
 * it tells a new player nothing except that the product has nothing for them.
 *
 * A zero is only worth printing when it is an answer. "You own no cards" is not
 * a measurement, it is a starting position, so this says what to do instead.
 *
 * It replaces the value panel and the two lower rails, and nothing else. The
 * deck rails stay on the page underneath as soon as there is one deck, because
 * at that point there is something true to show.
 */

const STEPS: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
  action: string;
  to: string;
}> = [
  {
    icon: Camera,
    title: 'Point your camera at a card',
    body: 'The quickest way to get a shelf of cards into the app. It reads the card and adds it, one after another.',
    action: 'Scan cards',
    to: '/scan',
  },
  {
    icon: Search,
    title: 'Already have a list somewhere',
    body: 'Paste a decklist or a collection export and we will match every line against the card database.',
    action: 'Paste a list',
    to: '/collection/import',
  },
  {
    icon: Layers,
    title: 'Start with the deck instead',
    body: 'Pick a commander and build around it. You can add the cards you own to it later.',
    action: 'Build a deck',
    to: '/decks/new',
  },
];

export function GetStarted({ className }: { className?: string }) {
  return (
    <section
      aria-label="Getting started"
      className={cn('rounded-2xl bg-card p-5 shadow-lg shadow-black/20 md:p-6', className)}
    >
      <h2 className="text-xl font-semibold text-foreground md:text-2xl">
        Nothing here yet, and that is fine
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        This page fills up as you go. Once there are cards in your collection it shows what they are
        worth and how that moves, and once there are decks it shows which ones still need work. Any
        of these three gets you started.
      </p>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body, action, to }) => (
          <li key={to}>
            <Link
              to={to}
              className={cn(
                'group flex h-full flex-col rounded-xl bg-muted/30 p-4',
                'shadow-lg shadow-black/20 transition-colors duration-200',
                'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'motion-reduce:transition-none'
              )}
            >
              <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <span className="mt-3 text-base font-medium text-foreground">{title}</span>
              <span className="mt-1 flex-1 text-sm text-muted-foreground">{body}</span>
              <span className="mt-4 text-sm font-medium text-foreground">{action}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
