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
        { label: 'Deck builder', to: '/decks' },
        { label: 'Collection', to: '/collection' },
        { label: 'Card search', to: '/cards' },
        { label: 'Precons', to: '/precons' },
        { label: 'Wishlist', to: '/wishlist' },
        /* Last, for the same reason it moved down the page itself. */
        { label: 'Storage', to: '/collection/storage' },
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
    <footer className="bg-background py-10 sm:py-14">
      <SectionInner>
        {/* Two columns on a phone, not one. Four groups of links stacked is
            ~700px of footer at 390px; paired, it is half that and the link rows
            are still full-width tap targets. */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="font-semibold">DeckMatrix</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              A deck builder and collection manager for Magic: The Gathering.
            </p>
          </div>

          {groups.map(g => (
            <div key={g.heading}>
              <p className="text-sm font-medium">{g.heading}</p>
              {/* space-y-1 plus py-1 on the link, rather than space-y-2 on
                  the row: the gap becomes part of the target instead of dead
                  space between two 19px ones. */}
              <ul className="mt-3 space-y-1 sm:space-y-2">
                {g.links.map(l => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="block py-3 text-sm text-muted-foreground transition-colors hover:text-foreground sm:py-0"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-9 sm:mt-12">
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

      {/* The homepage had no <main> at all, so the skip link in the nav had
          nothing to skip to and a screen reader had no landmark to jump to on
          the one page every visitor lands on first. */}
      <main id="main-content">
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
      {/*
        WHERE "FEATURES" IN THE HEADER LANDS.

        `PublicNavigation` has linked to `#features` since it was written and
        NOTHING ON THE PAGE HAS CARRIED THAT ID. The only `id="features"` in the
        repo is on `HomeFeatures`, a component this page has not rendered for a
        long time. Measured on the built bundle: `document.getElementById(
        'features')` is null, so one of the two links in the marketing header
        did nothing at all when clicked, on every anonymous visit. `#faq`
        resolves; this one did not.

        It is anchored here rather than on the hero because this is where the
        tour of what the product does actually starts. `scroll-mt` clears the
        fixed header, or the heading lands underneath it.
      */}
      <div id="features" className="scroll-mt-20" />
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

      {/* --------------------------------------------- getting cards in fast
          The camera, straight after the collection, because a collection page
          is worth nothing until putting cards into it is cheap.

          Storage used to sit here, ahead of the scanner and ahead of every
          other product on the page, on the argument that it is the thing
          Moxfield and Archidekt do not do. The owner has ruled on that
          directly: "Storage should not be second, its not a main feature." It
          is now down in the depth block with the rest of the detail. The
          argument was not wrong about it being unusual; it was wrong about
          unusual meaning first. */}
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
      {/* Storage, in the depth block where the owner put it. It still earns a
          section: knowing which box a card is in is real and nothing else on
          this list does it. It just is not the second thing anyone is told. */}
      <HomeStorage />

      {/* ---------------------------------------------------------- the close
          Freshness, then no lock-in, then the objections, then the ask. */}
      <HomeNewSets />
      <HomePortability />
      <FAQSection />
      <HomeCTA />
      </main>
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
