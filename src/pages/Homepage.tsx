import { Hero } from '@/components/marketing/Hero';
import { Features } from '@/components/marketing/Features';
import { FeatureShowcase } from '@/components/marketing/FeatureShowcase';
import { LiveCardsShowcase } from '@/components/marketing/LiveCardsShowcase';
import { AIBrainDemo } from '@/components/marketing/AIBrainDemo';
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
      <LiveCardsShowcase />
      <AIBrainDemo />
      <FeatureShowcase />
      <div id="pricing">
        <Pricing />
      </div>
      <Testimonials />
      <Footer />
    </div>
  );
}