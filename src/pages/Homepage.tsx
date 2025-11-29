import { NewHero } from '@/components/marketing/NewHero';
import { Features } from '@/components/marketing/Features';
import { FeatureShowcase } from '@/components/marketing/FeatureShowcase';
import { ProductShowcase } from '@/components/marketing/ProductShowcase';
import { AITechnologySection } from '@/components/marketing/AITechnologySection';
import { LiveStats } from '@/components/marketing/LiveStats';
import { Pricing } from '@/components/marketing/Pricing';
import { Testimonials } from '@/components/marketing/Testimonials';
import { FinalCTA } from '@/components/marketing/FinalCTA';
import { Footer } from '@/components/marketing/Footer';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <NewHero />
      <div id="features">
        <Features />
      </div>
      <ProductShowcase />
      <AITechnologySection />
      <FeatureShowcase />
      <LiveStats />
      <div id="pricing">
        <Pricing />
      </div>
      <Testimonials />
      <FinalCTA />
      <Footer />
    </div>
  );
}