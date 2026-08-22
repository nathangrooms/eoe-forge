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
import { DecksToFinish } from '@/components/dashboard/DecksToFinish';
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
 *   what changed        -> recent decks and recent activity, the first row
 *   what is it worth    -> the collection panel, with the cards behind the total
 *   what is unfinished  -> decks to finish
 *   what do I do next   -> wanted next, and the quick actions
 *
 * The first row is the layout the owner specified: "recent decks should be first
 * 3 with scroll bar like on card page, also recent activity should show 2 only
 * (same size as recent decks) so 5 total in first row". Five equal tiles across
 * one five-column grid, three columns of decks and two of activity, each rail
 * paging independently through the rest. The tiles are the same size because
 * they are the same component sized off the same grid, not because two numbers
 * happen to agree.
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

/** Tiles per screenful in the first row, and the grid columns each rail spans. */
const DECKS_SPAN = 'lg:col-span-3';
const ACTIVITY_SPAN = 'lg:col-span-2';

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
                worth seeing second. */}
            <Reveal index={0} className="grid gap-4 lg:grid-cols-5">
              <RecentDecks
                className={DECKS_SPAN}
                decks={decks}
                deckCount={deckStats?.count ?? decks.length}
                loading={decksLoading}
                error={decksError}
                onToggleFavorite={toggleFavorite}
              />
              <DecksToFinish
                className={ACTIVITY_SPAN}
                decks={decks}
                loading={decksLoading}
                error={decksError}
              />
            </Reveal>

            <Reveal index={1}>
              <CollectionValue summary={summary} loading={summaryLoading} />
            </Reveal>

            {/* Same five-column split as the first row, so the page has one
                rhythm rather than a new layout per section. */}
            <Reveal index={2} className="grid gap-4 lg:grid-cols-5">
              <RecentActivity className={DECKS_SPAN} />
              <WantedNext className={ACTIVITY_SPAN} summary={summary} loading={summaryLoading} />
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
