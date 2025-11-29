import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';

export function FinalCTA() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Dramatic background */}
      <div className="absolute inset-0 bg-gradient-cosmic opacity-20" />
      <div className="absolute inset-0 bg-gradient-starfield opacity-30" />
      
      {/* Animated glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[120px] animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/30 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }} />

      <div className="container mx-auto relative z-10">
        <div className="max-w-5xl mx-auto">
          {/* Main CTA Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card/80 via-card/60 to-card/80 backdrop-blur-xl border-2 border-primary/30 shadow-glow-elegant p-12 md:p-16 lg:p-20">
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-primary opacity-0 hover:opacity-10 transition-opacity duration-700" />
            
            {/* Floating elements */}
            <div className="absolute top-8 right-8 opacity-20">
              <Crown className="h-24 w-24 text-primary animate-float" />
            </div>
            <div className="absolute bottom-8 left-8 opacity-20">
              <Sparkles className="h-20 w-20 text-accent animate-float" style={{ animationDelay: '1s' }} />
            </div>

            <div className="relative z-10 text-center space-y-10">
              {/* Badge */}
              <div className="flex justify-center">
                <div className="px-6 py-3 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm">
                  <span className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    Ready to Dominate?
                  </span>
                </div>
              </div>

              {/* Headline */}
              <div className="space-y-6">
                <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
                  <span className="bg-gradient-primary bg-clip-text text-transparent">
                    Build Your Legacy
                  </span>
                </h2>
                <p className="text-xl md:text-2xl lg:text-3xl text-foreground/90 font-semibold">
                  Join thousands of players leveling up their decks
                </p>
              </div>

              {/* Description */}
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Start building championship-caliber decks today with AI-powered insights, 
                real-time card tracking, and professional-grade analytics.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                <Link to="/register">
                  <Button 
                    size="lg" 
                    className="group w-full sm:w-auto px-12 py-7 text-xl font-bold bg-gradient-primary hover:shadow-glow-elegant hover:scale-110 transition-all duration-500 shadow-elegant"
                  >
                    <Sparkles className="h-6 w-6 mr-3 group-hover:rotate-180 transition-transform duration-500" />
                    Start Free Trial
                    <ArrowRight className="h-6 w-6 ml-3 group-hover:translate-x-2 transition-transform" />
                  </Button>
                </Link>
                
                <Link to="/login">
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="w-full sm:w-auto px-12 py-7 text-xl font-bold border-2 border-primary/40 hover:border-primary hover:bg-primary/10 transition-all duration-300"
                  >
                    Log In
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="pt-12 space-y-4">
                <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    14-day free trial
                  </span>
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    No credit card required
                  </span>
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-type-commander animate-pulse" />
                    Cancel anytime
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom floating mana symbols */}
          <div className="flex items-center justify-center gap-4 mt-12 opacity-60">
            <div className="w-10 h-10 rounded-full bg-mana-white/20 backdrop-blur-sm flex items-center justify-center border border-mana-white/30 animate-float">
              <span className="text-lg">⚪</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-mana-blue/20 backdrop-blur-sm flex items-center justify-center border border-mana-blue/30 animate-float" style={{ animationDelay: '0.5s' }}>
              <span className="text-lg">🔵</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-mana-black/20 backdrop-blur-sm flex items-center justify-center border border-mana-black/30 animate-float" style={{ animationDelay: '1s' }}>
              <span className="text-lg">⚫</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-mana-red/20 backdrop-blur-sm flex items-center justify-center border border-mana-red/30 animate-float" style={{ animationDelay: '1.5s' }}>
              <span className="text-lg">🔴</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-mana-green/20 backdrop-blur-sm flex items-center justify-center border border-mana-green/30 animate-float" style={{ animationDelay: '2s' }}>
              <span className="text-lg">🟢</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
