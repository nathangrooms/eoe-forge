import { BookOpenCheck, Camera, Package, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { calculateBadgeProgress, getEarnedBadges, getInProgressBadges } from '@/lib/badges';
import { useDashboardSummary, useRecentDecks } from '@/features/dashboard/hooks';

import { BadgesSection } from '@/components/dashboard/BadgeDisplay';
import { CollectionValue } from '@/components/dashboard/CollectionValue';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { GetStarted } from '@/components/dashboard/GetStarted';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { RecentDecks } from '@/components/dashboard/RecentDecks';
import { Reveal } from '@/components/dashboard/Reveal';
import { WantedNext } from '@/components/dashboard/WantedNext';

/**
 * The dashboard.
 *
 * It answers four questions, in the order a player asks them when they open the
 * app, and every section is there because it answers one of them:
 *
 *   what changed        -> recent decks, and recent activity under it
 *   what is unfinished  -> said on the deck tile itself, and filterable
 *   what is it worth    -> the collection panel, with the cards behind the total
 *   what do I do next   -> wanted next, and the quick actions
 *
 * The first row is one rail of five equal tiles across the full width, paging
 * through the rest. It was three tiles beside a second rail showing the SAME
 * decks, which is the note in `RecentDecks`.
 *
 * Every number on this page is read from a row in the database. The dashboard
 * has shipped fabricated data before: `SearchHistory.tsx` seeded "Sol Ring, 50
 * results" into every account forever, and nothing in the codebase ever wrote
 * the key it read. There is no seeded data in any file this page touches, and
 * where something is unknown it says so rather than printing zero.
 */

const QUICK_ACTIONS = [
  { label: 'Search cards', to: '/cards', icon: Search },
  { label: 'Scan cards', to: '/scan', icon: Camera },
  { label: 'Import to collection', to: '/collection/import', icon: Package },
  { label: 'Tutor', to: '/tutor', icon: BookOpenCheck },
];

const Dashboard = () => {
  useSessionTimeout();

  const { data: summary, loading: summaryLoading, error: summaryError } = useDashboardSummary();
  const { decks, loading: decksLoading, error: decksError, toggleFavorite } = useRecentDecks();

  const collection = summary?.collection;
  const deckStats = summary?.decks;

  const badgeProgress = calculateBadgeProgress({
    decksCount: deckStats?.count ?? 0,
    uniqueCards: collection?.uniqueCards ?? 0,
    collectionValue: collection?.totalValueUSD ?? 0,
    totalCards: collection?.totalCards ?? 0,
  });

  /*
   * An account with nothing in it. Twelve of the thirteen real accounts look
   * like this, so it is the more common of the two screens, not the edge case.
   * Held until the queries have actually run, because a page that flashes "you
   * have nothing" while loading is worse than one that shows a skeleton.
   */
  const loaded = !summaryLoading && !decksLoading;
  const brandNew =
    loaded &&
    (collection?.uniqueCards ?? 0) === 0 &&
    (summary?.wishlist.totalItems ?? 0) === 0 &&
    decks.every(deck => deck.cardCount === 0);

  const displayName = summary?.displayName;

  return (
    <StandardPageLayout
      title={displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
      action={
        <Button asChild>
          {/* `/deck-builder` with no `?deck=` bounces to the deck list, so this
              promised a new deck and delivered the list. `/decks/new` is the
              real create route. */}
          <Link to="/decks/new">
            <Plus className="h-4 w-4" />
            New deck
          </Link>
        </Button>
      }
    >
      {/* Sections settle in reading order. `Reveal` no-ops entirely under
          prefers-reduced-motion, so nothing depends on an animation to appear. */}
      <div className="space-y-6 md:space-y-8">
        {summaryError && (
          <p role="alert" className="rounded-lg bg-destructive/15 px-4 py-3 text-sm text-destructive">
            {summaryError}
          </p>
        )}

        {brandNew ? (
          /*
           * An empty account gets one path, not four empty boxes each offering
           * their own version of "build a deck". The rails come back the moment
           * there is a deck with cards in it, which is the moment they have
           * something true to show.
           */
          <Reveal index={0}>
            <GetStarted />
          </Reveal>
        ) : (
          <>
            {/* DECKS TOGETHER AT THE TOP. Owner: "its recent decks then recent
                activity, I think recent activity and decks to finish should
                swap - would make more sense."

                It does: what you were last working on, and what still needs
                finishing, are the same question asked twice, and a reader
                arriving at this page is usually here to answer it. Activity is
                a record of what already happened, which is worth seeing and
                worth seeing second.

                ONE RAIL, NOT TWO. "Decks to finish" was fed from this same
                `decks` array and filtered to the ones with something wrong, so
                it could only ever show a subset of what sat beside it. On the
                dashboard it showed the identical two decks, smaller, and took
                two of the row's five columns to do it. What is unfinished is
                now printed on the deck's own tile and offered as a filter.
                `RecentDecks` explains the whole reasoning. */}
            <Reveal index={0}>
              <RecentDecks
                decks={decks}
                deckCount={deckStats?.count ?? decks.length}
                loading={decksLoading}
                error={decksError}
                onToggleFavorite={toggleFavorite}
              />
            </Reveal>

            <Reveal index={1}>
              <CollectionValue summary={summary} loading={summaryLoading} />
            </Reveal>

            {/* Two rows, not two columns. Owner: "Recent activity and wishlist -
                should be 2 separate rows." They answer different questions and
                neither is a sidebar to the other: one is what you did, the other
                is what you still want. Sharing a row made the narrower of them
                read as a footnote to the wider one. */}
            <Reveal index={2}>
              <RecentActivity />
            </Reveal>

            <Reveal index={3}>
              <WantedNext summary={summary} loading={summaryLoading} />
            </Reveal>
          </>
        )}

        <Reveal as="nav" index={3} aria-label="Quick actions" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ label, to, icon: Icon }) => (
            /* `secondary`, not `outline` — outline draws a hairline border. */
            <Button key={to} variant="secondary" asChild>
              <Link to={to}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </Reveal>

        {/* Milestones are goals, and a goal is worth showing once there is
            something to measure against it. On an account with nothing they are
            four bars reading 0/3, 0/50, 0/100, 0/100, which is the wall of
            zeroes this page is meant to stop showing. */}
        {!brandNew && (
          <Reveal index={4}>
            <BadgesSection
              earnedBadges={getEarnedBadges(badgeProgress)}
              inProgressBadges={getInProgressBadges(badgeProgress)}
            />
          </Reveal>
        )}
      </div>
    </StandardPageLayout>
  );
};

const DashboardWithErrorBoundary = () => (
  <DashboardErrorBoundary>
    <Dashboard />
  </DashboardErrorBoundary>
);

export default DashboardWithErrorBoundary;
