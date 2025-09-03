import { Hero } from '@/components/marketing/Hero';
import { Features } from '@/components/marketing/Features';
import { Screenshots } from '@/components/marketing/Screenshots';
import { Pricing } from '@/components/marketing/Pricing';
import { Testimonials } from '@/components/marketing/Testimonials';
import { Footer } from '@/components/marketing/Footer';
import { PublicNavigation } from '@/components/navigation/PublicNavigation';

export default function Homepage() {
  return (
    <div className="min-h-screen">
      <PublicNavigation />
      <Hero />
      <div id="features">
        <Features />
      </div>
      <Screenshots />
      <div id="pricing">
        <Pricing />
      </div>
      <Testimonials />
      <Footer />
    </div>
  );
}