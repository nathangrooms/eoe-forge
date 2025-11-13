import { Hero } from '@/components/marketing/Hero';
import { Features } from '@/components/marketing/Features';
import { FeatureShowcase } from '@/components/marketing/FeatureShowcase';
import { Pricing } from '@/components/marketing/Pricing';
import { Testimonials } from '@/components/marketing/Testimonials';
import { Footer } from '@/components/marketing/Footer';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <Hero />
      <div id="features">
        <Features />
      </div>
      <FeatureShowcase />
      <div id="pricing">
        <Pricing />
      </div>
      <Testimonials />
      <Footer />
    </div>
  );
}