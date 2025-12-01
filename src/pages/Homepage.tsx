import { EnhancedHero } from '@/components/marketing/EnhancedHero';
import { ConsolidatedFeatures } from '@/components/marketing/ConsolidatedFeatures';
import { InteractiveDemo } from '@/components/marketing/InteractiveDemo';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FixedLiveStats } from '@/components/marketing/FixedLiveStats';
import { UseCaseShowcase } from '@/components/marketing/UseCaseShowcase';
import { EnhancedTestimonials } from '@/components/marketing/EnhancedTestimonials';
import { FAQSection } from '@/components/marketing/FAQSection';
import { Pricing } from '@/components/marketing/Pricing';
import { FinalCTA } from '@/components/marketing/FinalCTA';
import { Footer } from '@/components/marketing/Footer';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <EnhancedHero />
      <div id="features">
        <ConsolidatedFeatures />
      </div>
      <InteractiveDemo />
      <ComparisonTable />
      <UseCaseShowcase />
      <EnhancedTestimonials />
      <FixedLiveStats />
      <FAQSection />
      <div id="pricing">
        <Pricing />
      </div>
      <FinalCTA />
      <Footer />
    </div>
  );
}