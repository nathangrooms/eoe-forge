import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CTASection() {
  return (
    <section className="py-24 px-4">
      <div className="container mx-auto">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-12 md:p-16 text-center">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
            
            {/* Content */}
            <div className="relative z-10 space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mb-4">
                <Sparkles className="h-4 w-4" />
                Start Building Today
              </div>
              
              <h2 className="text-4xl md:text-5xl font-bold text-foreground">
                Ready to Level Up Your Game?
              </h2>
              
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Join thousands of players using DeckMatrix to build better decks and dominate their local meta
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <Link to="/register">
                  <Button size="lg" className="px-8 py-6 text-base font-semibold">
                    Create Free Account
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                
                <p className="text-sm text-muted-foreground">
                  No credit card required
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
