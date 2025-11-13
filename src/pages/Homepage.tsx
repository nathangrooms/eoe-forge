import { Hero } from '@/components/marketing/Hero';
import { FeatureVisuals } from '@/components/marketing/FeatureVisuals';
import { CTASection } from '@/components/marketing/CTASection';
import { Pricing } from '@/components/marketing/Pricing';
import { Testimonials } from '@/components/marketing/Testimonials';
import { Footer } from '@/components/marketing/Footer';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <Hero />
      <FeatureVisuals />
      <CTASection />
      <div id="pricing">
        <Pricing />
      </div>
      <Testimonials />
      <Footer />
    </div>
  );
}
