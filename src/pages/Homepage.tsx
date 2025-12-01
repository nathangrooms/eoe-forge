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

export default function Homepage() {
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