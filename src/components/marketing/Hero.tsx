import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Cosmic Background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-20" />
        <div className="absolute inset-0 bg-gradient-starfield opacity-40" />
      </div>
      
      {/* Floating MTG Mana Symbols */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center animate-float">
          <span className="text-2xl">⚪</span>
        </div>
        <div className="absolute top-40 right-20 w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center animate-float" style={{ animationDelay: '1s' }}>
          <span className="text-xl">🔵</span>
        </div>
        <div className="absolute bottom-40 left-20 w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center animate-float" style={{ animationDelay: '2s' }}>
          <span className="text-xl">⚫</span>
        </div>
        <div className="absolute bottom-20 right-10 w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center animate-float" style={{ animationDelay: '3s' }}>
          <span className="text-2xl">🔴</span>
        </div>
        <div className="absolute top-60 left-1/2 w-10 h-10 rounded-full bg-type-lands/20 flex items-center justify-center animate-float" style={{ animationDelay: '4s' }}>
          <span className="text-xl">🟢</span>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Brand Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="relative">
              <div className="w-20 h-20 rounded-xl bg-primary/20 backdrop-blur-sm flex items-center justify-center border border-primary/30">
                <Wand2 className="h-12 w-12 text-primary cosmic-glow" />
              </div>
              <div className="absolute inset-0 rounded-xl bg-primary/10 animate-glow" />
            </div>
          </div>

          {/* Main Headline */}
          <div className="space-y-6">
            <h1 className="text-6xl md:text-8xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-fade-in">
                MTG Deck Builder
              </span>
            </h1>
            <h2 className="text-2xl md:text-4xl font-semibold text-foreground/90">
              Master Your Magic with AI-Powered Insights
            </h2>
          </div>

          {/* Subtext */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Build tournament-ready decks, track your collection value, and dominate the battlefield 
            with intelligent synergy analysis and power level optimization.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <Link to="/register">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-12 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-accent hover:from-accent hover:to-primary transition-all duration-500 cosmic-glow animate-glow"
              >
                <Wand2 className="h-6 w-6 mr-3" />
                Start Building Free
                <ArrowRight className="h-6 w-6 ml-3" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto px-12 py-6 text-lg font-semibold border-primary/40 hover:border-primary hover:bg-primary/10 transition-all duration-300"
            >
              <Play className="h-6 w-6 mr-3" />
              Watch Demo
            </Button>
          </div>

          {/* Social Proof */}
          <div className="pt-16 space-y-4">
            <div className="flex items-center justify-center gap-8 text-muted-foreground text-sm">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Powered by Scryfall API
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                50,000+ Decks Built
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Trusted by Planeswalkers
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}