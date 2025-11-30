import { EnhancedHero } from '@/components/marketing/EnhancedHero';
import { BentoFeatures } from '@/components/marketing/BentoFeatures';
import { InteractiveDemo } from '@/components/marketing/InteractiveDemo';
import { ProductShowcase } from '@/components/marketing/ProductShowcase';
import { AITechnologySection } from '@/components/marketing/AITechnologySection';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { LiveStats } from '@/components/marketing/LiveStats';
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
      <BentoFeatures />
      <InteractiveDemo />
      <div id="features">
        <ProductShowcase />
      </div>
      <AITechnologySection />
      <ComparisonTable />
      <LiveStats />
      <UseCaseShowcase />
      <EnhancedTestimonials />
      <FAQSection />
      <div id="pricing">
        <Pricing />
      </div>
      <FinalCTA />
      <Footer />
    </div>
  );
}