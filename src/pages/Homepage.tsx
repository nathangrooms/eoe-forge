import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeCTA, HomeCollection } from '@/components/marketing/HomeSections';
import { HomeShowcase } from '@/components/marketing/HomeShowcase';
import { HomeNewSets } from '@/components/marketing/HomeNewSets';
import { HomeCatalogue } from '@/components/marketing/HomeStats';
import { HomeFormatPicker } from '@/components/marketing/HomeFormatPicker';
import { HomeStorage } from '@/components/marketing/HomeStorage';
import { HomeAppVisual } from '@/components/marketing/HomeAppVisual';
import {
  HomeSearch, HomePortability, HomePower, HomeScanner, HomeTutor,
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
import { counts } from '@/lib/homepage/snapshot';

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

/**
 * How long the homepage will wait for the testing-banner flag before it gives
 * up and draws itself. Long enough that a healthy database always wins the
 * race and nobody ever sees the site flash before the holding page; short
 * enough that an unhealthy one costs a moment rather than the whole visit.
 */
const FLAG_WAIT_MS = 1200;

export default function Homepage() {
  const [showTestingBanner, setShowTestingBanner] = useState<boolean | null>(null);

  /*
   * The card count comes out of the nightly snapshot, not the database.
   *
   * It used to be `count(*)` over `cards`, run on every visit. Measured with
   * EXPLAIN ANALYZE on 2026-08-19 that count takes 7,586 ms, and the `anon`
   * role a logged-out visitor holds carries `statement_timeout=3s`. It could
   * not succeed. PostgREST answers a failed count with null, the tile read the
   * null as zero, and the homepage told people there were no cards.
   *
   * See src/lib/homepage/snapshot.ts for what the file holds and why the number
   * is rounded before it is shown.
   */
  const cardCount = counts.cards();

  /*
   * THE ONE QUERY THAT STAYS LIVE, and it stays live on purpose.
   *
   * Everything else the homepage reads is now a nightly file. This is not,
   * because it is not content: it is the switch that decides whether visitors
   * see the site or a holding page. A kill switch that only takes effect at the
   * next nightly build is not a kill switch. It is one row read by primary key
   * against a table with thirteen rows in it, it is capped at a moment's wait
   * below, and it fails towards showing the site.
   *
   * The banner flag decides whether a visitor sees the site or a holding page,
   * so it has to be known before anything is drawn. That made the database the
   * thing standing between a visitor and their first pixel: until this query
   * came back, `Homepage` returned null and deckmatrix.com was a blank white
   * page. Measured with the database unreachable, it stayed blank forever, and
   * on a normal visit it stayed blank for a full round trip after all the code
   * had already arrived.
   *
   * So the wait is capped. If the flag has not arrived in `FLAG_WAIT_MS` the
   * page draws itself, and the answer is still applied when it turns up. It
   * fails towards the site rather than towards the holding page on purpose: a
   * slow database briefly showing the real homepage is a much smaller problem
   * than a slow database showing nothing at all.
   */
  useEffect(() => {
    let settled = false;
    const apply = (value: boolean) => {
      if (settled) return;
      settled = true;
      setShowTestingBanner(value);
    };

    const timer = window.setTimeout(() => apply(false), FLAG_WAIT_MS);

    (async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', 'show_testing_banner')
        .maybeSingle();
      window.clearTimeout(timer);
      apply(data?.enabled ?? false);
    })();

    return () => window.clearTimeout(timer);
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

      {/* ------------------------------------------------------ the collection
          Back on the page after being dropped on 2026-08-19. It was dropped
          because its picture was the hero's own background reused as
          decoration; it is here because the picture is now a photograph of the
          real `/collection` screen, and the hero promises a collection that the
          page then never showed. It sits after the builder because "build with
          what you own" is the sentence it answers. */}
      <HomeCollection />

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
      <HomeTutor />
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
 * One section is still dropped from the page rather than reordered. (The other,
 * HomeCollection, is back — see the comment beside it above: it was dropped for
 * its picture, and its picture is now a photograph of the real screen.)
 *
 *   HomeColors ("Colour identity, counted properly") — five live counts drawn as
 *     five bars: 7,759 / 7,602 / 7,661 / 7,746 / 7,504. The numbers are real and
 *     the point is true, but WUBRG is evenly distributed by design, so the chart
 *     rendered as five bars of visibly identical length across 1,600px. A bar
 *     chart whose bars are all the same length is an admission that there was
 *     nothing to show. Still exported from HomeStats.tsx.
 */
