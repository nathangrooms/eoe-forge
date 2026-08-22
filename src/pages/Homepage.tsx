import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeCTA, HomeCollection } from '@/components/marketing/HomeSections';
import { HomeNewSets } from '@/components/marketing/HomeNewSets';
import { HomeStorage } from '@/components/marketing/HomeStorage';
import { HomeProxies } from '@/components/marketing/HomeProxies';
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
        /* Both ship, both have their own nav entry, and neither was in the
           site map. `/proxies` now has a section of its own; `/shopping` is
           the same primitive with a different ending and this link is the
           only mention it gets. */
        { label: 'Proxies', to: '/proxies' },
        { label: 'Shopping list', to: '/shopping' },
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

      {/* ---------------------------------------------------------------- hook
          One promise, the price, the real card count, and cards a Commander
          player recognises on sight. */}
      <HomeHero cardCount={cardCount} />

      {/* --------------------------------------------- the reason to switch
​
          THE ORDER CHANGED HERE ON 22 AUG 2026, AND THIS IS THE WHOLE POINT
          OF IT.
​
          The page used to open with a card marquee, a catalogue count, a
          Scryfall search and a deck page — four screens of things Moxfield and
          Archidekt also do, before a visitor who already uses one of them saw a
          single reason to move. The comment that used to sit halfway down this
          file admitted it in as many words and then put storage fifth anyway.
​
          So storage is second. "Know which box it is in" is the one heading on
          this page a competitor cannot copy, and it is now where the visitor is
          still deciding whether to keep reading. The collection screenshot
          follows because it is what a mapped collection looks like, and the
          scanner follows that because the obvious objection to both is "that is
          hours of typing". */}
      <HomeStorage />
      <HomeCollection />
      <HomeScanner />

      {/* ------------------------------------------------ what you do with it
          The cards are in. Build against them, print the ones you have not
          bought yet, and bring the decks you already have somewhere else.
​
          Import and export moves up from position eighteen. It answers the last
          objection anybody has before signing up — can I get my decks in, and
          back out — and answering it at the foot of the page is answering it
          after the reader has gone. */}
      <HomeAppVisual />
      <HomeProxies />
      <HomePortability />

      {/* --------------------------------------------------------- the depth
          Not a mile wide and an inch deep: Scryfall syntax against the whole
          pool, 184 real precon products, a published power score and a Tutor
          that reads your actual list. */}
      <HomeSearch />
      <HomePrecons />
      <HomePower />
      <HomeTutor />

      {/* ------------------------------------------------------- the breadth
          Four products a deck site is not expected to have at all: a playable
          game, a life counter for the table, a tournament organiser and price
          history. Ordered table-first, because playing a game in the browser is
          the least expected of the four. Marketplace is last of them because it
          is the one still waiting on its data. */}
      <HomePlayTable />
      <HomeLifeCounter />
      <HomeTournaments />
      <HomeMarketplace />

      {/* ---------------------------------------------------------- the close
          Freshness, then the objections, then the ask. */}
      <HomeNewSets />
      <FAQSection />
      <HomeCTA />
      <HomeFooter />
    </div>
  );
}

/*
 * THREE SECTIONS LEFT THE PAGE ON 22 AUG 2026. Their files have since been
 * deleted — HomeShowcase.tsx, HomeStats.tsx and HomeFormatPicker.tsx are gone
 * from src/components/marketing/ and nothing imported them. This note stays
 * because the reasons are the argument, not the files.
 *
 *   HomeShowcase ("Real cards. Real costs. Real prices.") — a marquee, a
 *     four-row catalogue table and a mana curve. The heading was a rhetorical
 *     triple denying a doubt no visitor had, the table was captioned "a real row
 *     out of the card table", which is database vocabulary, and the curve was
 *     drawn over TWELVE EXPENSIVE UNRELATED CARDS. An EDH player reads a curve
 *     over a non-deck as a bug. The hero's own fan is already a wall of
 *     recognisable art, one screen higher up.
 *
 *   HomeCatalogue (in HomeStats.tsx) — three tiles: cards, legendary creatures,
 *     mythic rares. The card count moved to the hero's meta line, where a
 *     visitor is still reading. "Every one of them a legal commander" under the
 *     legendary count was not true — banned legends, Un-set legends and the
 *     non-creature faces of double-faced cards all fail it — and that is exactly
 *     the shape of overstatement this page has had to correct before. The mythic
 *     count nobody has ever chosen a collection manager on.
 *
 *   HomeFormatPicker ("What can you build in Commander?") — six tabs over six
 *     whole cards. Well built, and the fourth wall of cards on the page, arguing
 *     a point nobody disputes: that format legality works. Its lead was entirely
 *     about our implementation ("not from a list someone updates by hand"), and
 *     no player has ever wondered how a site stores legality. The FAQ answers
 *     the question at the point somebody actually asks it.
 *
 * Still dropped, from an earlier pass:
 *
 *   HomeColors ("Colour identity, counted properly") — five live counts drawn as
 *     five bars: 7,759 / 7,602 / 7,661 / 7,746 / 7,504. The numbers are real and
 *     the point is true, but WUBRG is evenly distributed by design, so the chart
 *     rendered as five bars of visibly identical length across 1,600px. A bar
 *     chart whose bars are all the same length is an admission that there was
 *     nothing to show.
 */
