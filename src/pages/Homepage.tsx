import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeHero } from '@/components/marketing/HomeHero';
import { HomeCollection, HomeCTA } from '@/components/marketing/HomeSections';
import { HomeShowcase } from '@/components/marketing/HomeShowcase';
import { HomeNewSets } from '@/components/marketing/HomeNewSets';
import { HomeFormats, HomeColors, HomeCatalogue } from '@/components/marketing/HomeStats';
import { HomeAppVisual } from '@/components/marketing/HomeAppVisual';
import {
  HomeSearch, HomeStorage, HomePortability, HomePower, HomeScanner, HomeBrain, HomePrecons,
} from '@/components/marketing/HomeFeatureSections';
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
      heading: 'Product',
      links: [
        { label: 'Deck builder', to: '/deck-builder' },
        { label: 'Collection', to: '/collection' },
        { label: 'Card search', to: '/cards' },
        { label: 'Wishlist', to: '/wishlist' },
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
    <footer className="border-t bg-background py-12">
      <SectionInner>
        <div className="grid gap-10 sm:grid-cols-3">
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

        <div className="mt-10 border-t pt-6">
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
      <HomeHero cardCount={cardCount} />
      <HomeShowcase />
      <HomeCatalogue />
      <HomeAppVisual />
      <HomeStorage />
      <HomeSearch />
      <HomeNewSets />
      <HomePower />
      <HomeScanner />
      <HomeBrain />
      <HomeFormats />
      <HomePrecons />
      <HomePortability />
      <HomeColors />
      <HomeCollection />
      <FAQSection />
      <HomeCTA />
      <HomeFooter />
    </div>
  );
}
