import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeCTA } from '@/components/marketing/HomeSections';
import { HomeShowcase } from '@/components/marketing/HomeShowcase';
import { HomeNewSets } from '@/components/marketing/HomeNewSets';
import { HomeCatalogue } from '@/components/marketing/HomeStats';
import { HomeFormatPicker } from '@/components/marketing/HomeFormatPicker';
import { HomeStorage } from '@/components/marketing/HomeStorage';
import { HomeAppVisual } from '@/components/marketing/HomeAppVisual';
import {
  HomeSearch, HomePortability, HomePower, HomeScanner, HomeBrain,
} from '@/components/marketing/HomeFeatureSections';
import { HomePrecons } from '@/components/marketing/HomePrecons';
import { HomeMarketplace } from '@/components/marketing/HomeMarketplace';
import { HomePlayTable } from '@/components/marketing/HomePlayTable';
import { HomeLifeCounter } from '@/components/marketing/HomeLifeCounter';
import { HomeTournaments } from '@/components/marketing/HomeTournaments';
import { FAQSection } from '@/components/marketing/FAQSection';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';
import { TestingBanner } from '@/components/marketing/TestingBanner';
import { SectionInner } from '@/components/marketing/Section';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public homepage.
 *
 * Removed in this rewrite — all of it unverifiable or fabricated:
 *   EnhancedTestimonials  six invented people + a fake "4.9/5 from 2,500+ reviews"
 *   FixedLiveStats        hardcoded constants animated and labelled "Live"
 *   ComparisonTable       false capability claims about Moxfield/Archidekt/TappedOut
 *   InteractiveDemo       Math.random() dollar values badged as live TCGPlayer prices
 *   UseCaseShowcase       invented metrics such as "95% Win Rate Improvement"
 *   ModernPricing         plan names that did not match the subscription_limits table
 *   ModernFooter          14 of 16 links, including Privacy and Terms, pointed at /
 *
 * The only quantitative claim that survives is the card count, read live from
 * the table it describes.
 */

function HomeFooter() {
  const groups = [
    {
      heading: 'Build',
      links: [
        { label: 'Deck builder', to: '/deck-builder' },
        { label: 'Collection', to: '/collection' },
        { label: 'Storage', to: '/collection/storage' },
        { label: 'Card search', to: '/cards' },
        { label: 'Precons', to: '/precons' },
        { label: 'Wishlist', to: '/wishlist' },
      ],
    },
    /* These five ship today and were absent from the site map entirely — the
       homepage sold a card catalogue rather than the platform. */
    {
      heading: 'Play',
      links: [
        { label: 'Marketplace', to: '/marketplace' },
        { label: 'Tournaments', to: '/tournament' },
        { label: 'Life counter', to: '/life' },
        { label: 'Play a game', to: '/play' },
        { label: 'Scan a card', to: '/scan' },
      ],
    },
    {
      heading: 'Account',
      links: [
        { label: 'Sign in', to: '/login' },
        { label: 'Create account', to: '/register' },
        { label: 'Reset password', to: '/reset-password' },
      ],
    },
  ];

  return (
    // Borderless (design law 2). The tinted closing section above is the step
    // that separates the footer; a hairline here would be the third one on the
    // page and the owner has asked for none.
    <footer className="bg-background py-14">
      <SectionInner>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">DeckMatrix</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              A deck builder and collection manager for Magic: The Gathering.
            </p>
          </div>

          {groups.map(g => (
            <div key={g.heading}>
              <p className="text-sm font-medium">{g.heading}</p>
              <ul className="mt-3 space-y-2">
                {g.links.map(l => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Card data from{' '}
            <a
              href="https://scryfall.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Scryfall
            </a>
            . DeckMatrix is unofficial Fan Content permitted under the Wizards of the Coast Fan Content
            Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of
            Wizards of the Coast. ©Wizards of the Coast LLC.
          </p>
        </div>
      </SectionInner>
    </footer>
  );
}

export default function Homepage() {
  const [showTestingBanner, setShowTestingBanner] = useState<boolean | null>(null);
  const [cardCount, setCardCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', 'show_testing_banner')
        .maybeSingle();
      setShowTestingBanner(data?.enabled ?? false);
    })();
  }, []);

  /* Read the real row count so the one number on the page can never go stale. */
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true });
      if (typeof count === 'number') setCardCount(count);
    })();
  }, []);

  if (showTestingBanner === null) return null;
  if (showTestingBanner) return <TestingBanner />;

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />

      {/* ---------------------------------------------------------------- hook
          One promise, the real card count, and seven cards a Commander player
          recognises on sight. */}
      <HomeHero cardCount={cardCount} />

      {/* ------------------------------------------- proof the product is real
          Cards → scale → find one → build with it. Four beats, in the order a
          sceptical visitor asks the questions: does it have real cards, how
          many, can I search them the way I already know how, and what do I get
          when I do. Every figure in this run is a live count. */}
      <HomeShowcase />
      <HomeCatalogue />
      <HomeSearch />
      <HomeAppVisual />

      {/* ------------------------------------------------- the differentiator
          Everything above this line, Moxfield and Archidekt also do. This is
          the part they do not, so it lands early — roughly a quarter of the way
          down — rather than being buried in a feature list. Scanner follows it
          because "know which box it is in" is worthless until getting cards in
          is cheap, and the camera is the answer to that. */}
      <HomeStorage />
      <HomeScanner />

      {/* ------------------------------------------------------- the breadth
          Four products a deck site is not expected to have at all: a playable
          game, a life counter for the table, price history, and a tournament
          organiser. Ordered table-first, because playing a game in the browser
          is the least expected of the four. */}
      <HomePlayTable />
      <HomeLifeCounter />
      <HomeMarketplace />
      <HomeTournaments />

      {/* --------------------------------------------------------- the depth
          Having shown the range, show that it is not a mile wide and an inch
          deep: 184 real precon products, an assistant that reads your actual
          decklist, a published power score, and per-format legality read from
          the card rather than a hand-kept list. */}
      <HomePrecons />
      <HomeBrain />
      <HomePower />
      <HomeFormatPicker />

      {/* ---------------------------------------------------------- the close
          Freshness, then no lock-in, then the objections, then the ask. */}
      <HomeNewSets />
      <HomePortability />
      <FAQSection />
      <HomeCTA />
      <HomeFooter />
    </div>
  );
}

/*
 * Two sections were dropped from the page in this pass rather than reordered:
 *
 *   HomeCollection ("Your collection, not just your decklists") — a four-bullet
 *     list beside /hero-768.webp, which is the hero's own background image
 *     reused as decoration, cropped to 16:10. So the page opened and closed on
 *     the same picture. Three of its four bullets are now whole sections
 *     (storage, price history, the builder reading your collection); the fourth,
 *     the wishlist, is a footer link. It is still exported from HomeSections.tsx.
 *
 *   HomeColors ("Colour identity, counted properly") — five live counts drawn as
 *     five bars: 7,759 / 7,602 / 7,661 / 7,746 / 7,504. The numbers are real and
 *     the point is true, but WUBRG is evenly distributed by design, so the chart
 *     rendered as five bars of visibly identical length across 1,600px. A bar
 *     chart whose bars are all the same length is an admission that there was
 *     nothing to show. Still exported from HomeStats.tsx.
 */
