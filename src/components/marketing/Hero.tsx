import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Crown, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Enhanced cosmic background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-30" />
        <div className="absolute inset-0 bg-gradient-starfield opacity-50" />
      </div>
      
      {/* Floating MTG Mana Symbols with better colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-12 h-12 rounded-full bg-mana-white/30 flex items-center justify-center animate-float shadow-glow-subtle">
          <span className="text-2xl filter drop-shadow-lg">⚪</span>
        </div>
        <div className="absolute top-40 right-20 w-10 h-10 rounded-full bg-mana-blue/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '1s' }}>
          <span className="text-xl filter drop-shadow-lg">🔵</span>
        </div>
        <div className="absolute bottom-40 left-20 w-10 h-10 rounded-full bg-mana-black/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '2s' }}>
          <span className="text-xl filter drop-shadow-lg">⚫</span>
        </div>
        <div className="absolute bottom-20 right-10 w-12 h-12 rounded-full bg-mana-red/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '3s' }}>
          <span className="text-2xl filter drop-shadow-lg">🔴</span>
        </div>
        <div className="absolute top-60 left-1/2 w-10 h-10 rounded-full bg-mana-green/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '4s' }}>
          <span className="text-xl filter drop-shadow-lg">🟢</span>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* DeckMatrix Brand Logo */}
          <div className="flex items-center justify-center mb-8">
            <div className="relative group">
              <div className="absolute -inset-2 bg-gradient-primary blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative w-24 h-24 rounded-2xl bg-card/80 backdrop-blur-sm flex items-center justify-center border border-primary/40 shadow-glow-elegant">
                <Crown className="h-14 w-14 text-primary animate-glow" />
              </div>
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 text-xs font-bold text-primary/80 whitespace-nowrap">
                DECKMATRIX
              </div>
            </div>
          </div>

          {/* Main Headline */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-fade-in">
                DeckMatrix
              </span>
            </h1>
            <h2 className="text-xl md:text-3xl lg:text-4xl font-semibold text-foreground">
              Master Your Magic: The Gathering Universe
            </h2>
          </div>

          {/* Enhanced Subtext */}
          <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Build tournament-ready decks with AI guidance, manage your entire collection, 
            track real-time card values, and dominate every format with data-driven insights.
          </p>

          {/* Enhanced CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <Link to="/register">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-12 py-6 text-lg font-semibold bg-gradient-primary hover:shadow-glow-elegant hover:scale-105 transition-all duration-500 shadow-elegant"
              >
                <Zap className="h-6 w-6 mr-3" />
                Start Free Trial
                <ArrowRight className="h-6 w-6 ml-3" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto px-12 py-6 text-lg font-semibold border-primary/40 hover:border-primary hover:bg-primary/10 hover:shadow-glow-subtle transition-all duration-300"
            >
              <Play className="h-6 w-6 mr-3" />
              Watch Demo
            </Button>
          </div>

          {/* Enhanced Social Proof */}
          <div className="pt-16 space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground text-sm">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-glow-subtle" />
                Powered by Scryfall API
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-glow-subtle" />
                50,000+ Decks Built
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-type-commander animate-pulse shadow-glow-subtle" />
                Trusted by Planeswalkers
              </span>
            </div>
            <div className="text-xs text-muted-foreground/80">
              Join the most advanced MTG deck building platform
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/50 to-transparent" />
    </section>
  );
}