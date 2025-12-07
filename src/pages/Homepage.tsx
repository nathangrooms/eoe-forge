import { useEffect, useState } from 'react';
import { RedesignedHero } from '@/components/marketing/RedesignedHero';
import { TwoColumnFeatures } from '@/components/marketing/TwoColumnFeatures';
import { InteractiveDemo } from '@/components/marketing/InteractiveDemo';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { UseCaseShowcase } from '@/components/marketing/UseCaseShowcase';
import { EnhancedTestimonials } from '@/components/marketing/EnhancedTestimonials';
import { FixedLiveStats } from '@/components/marketing/FixedLiveStats';
import { FAQSection } from '@/components/marketing/FAQSection';
import { ModernPricing } from '@/components/marketing/ModernPricing';
import { ModernCTA } from '@/components/marketing/ModernCTA';
import { ModernFooter } from '@/components/marketing/ModernFooter';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';
import { TestingBanner } from '@/components/marketing/TestingBanner';
import { supabase } from '@/integrations/supabase/client';

export default function Homepage() {
  const [showTestingBanner, setShowTestingBanner] = useState<boolean | null>(null);

  useEffect(() => {
    const checkFeatureFlag = async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('key', 'show_testing_banner')
        .maybeSingle();
      
      setShowTestingBanner(data?.enabled ?? false);
    };
    
    checkFeatureFlag();
  }, []);

  // Show nothing while loading
  if (showTestingBanner === null) {
    return null;
  }

  // Show testing banner if flag is enabled
  if (showTestingBanner) {
    return <TestingBanner />;
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <RedesignedHero />
      <div id="features">
        <TwoColumnFeatures />
      </div>
      <InteractiveDemo />
      <ComparisonTable />
      <UseCaseShowcase />
      <EnhancedTestimonials />
      <FixedLiveStats />
      <FAQSection />
      <ModernPricing />
      <ModernCTA />
      <ModernFooter />
    </div>
  );
}
