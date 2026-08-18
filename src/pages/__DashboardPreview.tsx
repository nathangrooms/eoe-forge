/* TEMPORARY — visual harness for the dashboard rework. Deleted before finishing. */
import { useEffect, useState } from 'react';
import { DollarSign, Heart, Layers, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { StatTile, StatTileSkeleton } from '@/components/dashboard/StatTile';
import { RecentDecks } from '@/components/dashboard/RecentDecks';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { BadgesSection } from '@/components/dashboard/BadgeDisplay';
import { Reveal } from '@/components/dashboard/Reveal';
import type { DeckSummary } from '@/features/dashboard/hooks';
import type { ActivityEntry } from '@/features/dashboard/activity';
import { asUSD } from '@/features/dashboard/value';
import { calculateBadgeProgress, getEarnedBadges, getInProgressBadges } from '@/lib/badges';

const NAMES = [
  'Atraxa, Praetors\' Voice',
  'Krenko, Mob Boss',
  'Yuriko, the Tiger\'s Shadow',
  'Omnath, Locus of Creation',
  'Edgar Markov',
  'Kenrith, the Returned King',
];

export default function DashboardPreview() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('cards').select('id,name').in('name', NAMES);
      const rows = (data ?? []) as { id: string; name: string }[];
      const seen = new Map<string, string>();
      for (const r of rows) if (!seen.has(r.name)) seen.set(r.name, r.id);
      const picked = Array.from(seen.entries());

      setDecks(
        picked.map(([name, id], i) => ({
          id: `deck-${i}`,
          name: ['Superfriends', 'Goblin Storm', 'Ninja Tribal', 'Landfall', 'Vampires', 'Group Hug'][i] ?? `Deck ${i}`,
          format: 'commander',
          colors: [['W', 'U', 'B', 'G'], ['R'], ['U', 'B'], ['W', 'U', 'R', 'G'], ['W', 'B', 'R'], ['W', 'U', 'B', 'R', 'G']][i] ?? ['U'],
          powerLevel: [7.5, 6, 8.5, 5, 9.5, 3][i] ?? 0,
          updatedAt: new Date(Date.now() - i * 3600_000).toISOString(),
          cardCount: 100,
          commanderName: name,
          commanderCardId: id,
          isFavorite: i % 3 === 0,
        }))
      );

      setEntries(
        picked.map(([name, id], i) => ({
          id: `act-${i}`,
          type: i % 2 === 0 ? 'card_added' : 'deck_opened',
          kind: (i % 2 === 0 ? 'card' : 'deck') as ActivityEntry['kind'],
          at: new Date(Date.now() - i * 900_000).toISOString(),
          title: i % 2 === 0 ? name : `Deck ${i}`,
          detail: i % 2 === 0 ? 'Scanned into collection' : 'Deck opened · commander',
          quantity: i === 0 ? 4 : null,
          artCardId: i % 2 === 0 ? id : null,
          artCardName: name,
          href: '/collection',
        }))
      );
      setLoading(false);
    })();
  }, []);

  const badgeProgress = calculateBadgeProgress({
    decksCount: 6,
    uniqueCards: 1420,
    collectionValue: 3821.5,
    totalCards: 2610,
  });

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Welcome back, Nathan</h1>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <StatTileSkeleton />
              <StatTileSkeleton />
              <StatTileSkeleton />
              <StatTileSkeleton />
            </>
          ) : (
            <>
              <Reveal index={0}>
                <StatTile label="Collection value" value={3821.5} format={asUSD} hint="1,420 unique cards" icon={DollarSign} to="/collection" />
              </Reveal>
              <Reveal index={1}>
                <StatTile label="Cards owned" value={2610} hint="Including foils" icon={Package} to="/collection" />
              </Reveal>
              <Reveal index={2}>
                <StatTile label="Decks" value={6} hint="2 starred" icon={Layers} to="/decks" />
              </Reveal>
              <Reveal index={3}>
                <StatTile label="Wishlist" value={214.99} format={asUSD} hint="18 cards wanted" icon={Heart} to="/wishlist" />
              </Reveal>
            </>
          )}
        </section>

        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <Reveal index={5} className="lg:col-span-2">
            <RecentDecks decks={decks} loading={loading} onToggleFavorite={async () => true} />
          </Reveal>
          <Reveal index={6}>
            <RecentActivity previewEntries={loading ? undefined : entries} />
          </Reveal>
        </div>

        <Reveal index={7}>
          <BadgesSection
            earnedBadges={getEarnedBadges(badgeProgress)}
            inProgressBadges={getInProgressBadges(badgeProgress)}
          />
        </Reveal>
      </div>
    </div>
  );
}
