import { Brain, Camera, DollarSign, Heart, Layers, Package, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { Button } from '@/components/ui/button';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { calculateBadgeProgress, getEarnedBadges, getInProgressBadges } from '@/lib/badges';
import { useDashboardSummary, useRecentDecks } from '@/features/dashboard/hooks';
import { asUSD } from '@/features/dashboard/value';

import { BadgesSection } from '@/components/dashboard/BadgeDisplay';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { RecentDecks } from '@/components/dashboard/RecentDecks';
import { Reveal } from '@/components/dashboard/Reveal';
import { StatTile, StatTileSkeleton } from '@/components/dashboard/StatTile';

const QUICK_ACTIONS = [
  { label: 'Search cards', to: '/cards', icon: Search },
  { label: 'Scan cards', to: '/scan', icon: Camera },
  { label: 'Import to collection', to: '/collection?tab=add-cards', icon: Package },
  { label: 'MTG Brain', to: '/brain', icon: Brain },
];

const countFormat = (value: number) => Math.round(value).toLocaleString();

const Dashboard = () => {
  useSessionTimeout();

  const { data: summary, loading: summaryLoading, error: summaryError } = useDashboardSummary();
  const { decks, loading: decksLoading, error: decksError, toggleFavorite } = useRecentDecks(6);

  const collection = summary?.collection;
  const wishlist = summary?.wishlist;
  const deckStats = summary?.decks;

  const badgeProgress = calculateBadgeProgress({
    decksCount: deckStats?.count ?? 0,
    uniqueCards: collection?.uniqueCards ?? 0,
    collectionValue: collection?.totalValueUSD ?? 0,
    totalCards: collection?.totalCards ?? 0,
  });

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
      <div className="space-y-4 md:space-y-6">
        {summaryError && (
          <p role="alert" className="rounded-lg bg-destructive/15 px-4 py-3 text-sm text-destructive">
            {summaryError}
          </p>
        )}

        {/* Overview — every tile navigates to the page it summarises. */}
        <section aria-label="Overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {summaryLoading ? (
            <>
              <StatTileSkeleton />
              <StatTileSkeleton />
              <StatTileSkeleton />
              <StatTileSkeleton />
            </>
          ) : (
            <>
              <Reveal index={0}>
                <StatTile
                  label="Collection value"
                  value={collection?.totalValueUSD ?? 0}
                  format={asUSD}
                  hint={`${(collection?.uniqueCards ?? 0).toLocaleString()} unique cards`}
                  icon={DollarSign}
                  to="/collection"
                />
              </Reveal>
              <Reveal index={1}>
                <StatTile
                  label="Cards owned"
                  value={collection?.totalCards ?? 0}
                  format={countFormat}
                  hint="Including foils"
                  icon={Package}
                  to="/collection"
                />
              </Reveal>
              <Reveal index={2}>
                <StatTile
                  label="Decks"
                  value={deckStats?.count ?? 0}
                  format={countFormat}
                  hint={`${(deckStats?.favoritesCount ?? 0).toLocaleString()} starred`}
                  icon={Layers}
                  to="/decks"
                />
              </Reveal>
              <Reveal index={3}>
                <StatTile
                  label="Wishlist"
                  value={wishlist?.valueUSD ?? 0}
                  format={asUSD}
                  hint={`${(wishlist?.totalItems ?? 0).toLocaleString()} cards wanted`}
                  icon={Heart}
                  to="/wishlist"
                />
              </Reveal>
            </>
          )}
        </section>

        <Reveal as="nav" index={4} aria-label="Quick actions" className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ label, to, icon: Icon }) => (
            /* `secondary`, not `outline` — outline draws a hairline border. */
            <Button key={to} variant="secondary" size="sm" asChild>
              <Link to={to}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </Reveal>

        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <Reveal index={5} className="lg:col-span-2">
            <RecentDecks
              decks={decks}
              loading={decksLoading}
              error={decksError}
              onToggleFavorite={toggleFavorite}
            />
          </Reveal>
          <Reveal index={6}>
            <RecentActivity />
          </Reveal>
        </div>

        <Reveal index={7}>
          <BadgesSection
            earnedBadges={getEarnedBadges(badgeProgress)}
            inProgressBadges={getInProgressBadges(badgeProgress)}
          />
        </Reveal>
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
