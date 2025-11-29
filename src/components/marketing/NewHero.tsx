import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Crown, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NewHero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Enhanced cosmic background with animated layers */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-40" />
        <div className="absolute inset-0 bg-gradient-starfield opacity-60" />
        {/* Animated nebula effect */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] animate-float" style={{ animationDelay: '2s' }} />
        </div>
      </div>
      
      {/* Floating MTG Mana Symbols with enhanced animations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-16 h-16 rounded-full bg-mana-white/20 backdrop-blur-sm flex items-center justify-center animate-float shadow-glow-subtle border border-mana-white/30">
          <span className="text-3xl filter drop-shadow-lg">⚪</span>
        </div>
        <div className="absolute top-40 right-20 w-14 h-14 rounded-full bg-mana-blue/20 backdrop-blur-sm flex items-center justify-center animate-float shadow-glow-subtle border border-mana-blue/30" style={{ animationDelay: '1s' }}>
          <span className="text-2xl filter drop-shadow-lg">🔵</span>
        </div>
        <div className="absolute bottom-40 left-20 w-14 h-14 rounded-full bg-mana-black/20 backdrop-blur-sm flex items-center justify-center animate-float shadow-glow-subtle border border-mana-black/30" style={{ animationDelay: '2s' }}>
          <span className="text-2xl filter drop-shadow-lg">⚫</span>
        </div>
        <div className="absolute bottom-20 right-10 w-16 h-16 rounded-full bg-mana-red/20 backdrop-blur-sm flex items-center justify-center animate-float shadow-glow-subtle border border-mana-red/30" style={{ animationDelay: '3s' }}>
          <span className="text-3xl filter drop-shadow-lg">🔴</span>
        </div>
        <div className="absolute top-60 left-1/2 w-14 h-14 rounded-full bg-mana-green/20 backdrop-blur-sm flex items-center justify-center animate-float shadow-glow-subtle border border-mana-green/30" style={{ animationDelay: '4s' }}>
          <span className="text-2xl filter drop-shadow-lg">🟢</span>
        </div>
        {/* Additional floating particles */}
        <div className="absolute top-1/3 right-1/3 w-3 h-3 rounded-full bg-primary animate-float" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-1/3 left-1/3 w-2 h-2 rounded-full bg-accent animate-float" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-2/3 right-1/4 w-3 h-3 rounded-full bg-type-commander animate-float" style={{ animationDelay: '2.5s' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-6xl mx-auto space-y-10">
          {/* DeckMatrix 3D Brand Logo with enhanced effects */}
          <div className="flex items-center justify-center mb-12 animate-fade-in">
            <div className="relative group">
              {/* Outer glow rings */}
              <div className="absolute -inset-8 bg-gradient-primary blur-3xl opacity-40 group-hover:opacity-60 transition-opacity duration-700 animate-glow"></div>
              <div className="absolute -inset-4 bg-gradient-primary blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500"></div>
              
              {/* Logo container with 3D effect */}
              <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-br from-card via-card/80 to-muted backdrop-blur-xl flex items-center justify-center border-2 border-primary/40 shadow-glow-elegant hover:scale-110 transition-transform duration-500">
                <Crown className="h-20 w-20 text-primary animate-glow drop-shadow-[0_0_15px_rgba(162,89,255,0.6)]" />
              </div>
              
              {/* Brand name below logo */}
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm font-bold tracking-[0.3em] text-primary/90 whitespace-nowrap animate-pulse">
                DECKMATRIX
              </div>
            </div>
          </div>

          {/* Main Headline with enhanced typography */}
          <div className="space-y-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h1 className="text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-[fade-in_1s_ease-out]">
                Master Your Magic
              </span>
            </h1>
            <h2 className="text-2xl md:text-3xl lg:text-5xl font-semibold text-foreground/90">
              The Gathering Universe
            </h2>
          </div>

          {/* Enhanced Subtext with better spacing */}
          <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-5xl mx-auto leading-relaxed animate-fade-in" style={{ animationDelay: '0.4s' }}>
            AI-guided deck building, live collection tracking, and real-time card intelligence.
            <br />
            <span className="text-primary/80 font-semibold">Built for champions. Designed to dominate.</span>
          </p>

          {/* Enhanced CTAs with better animations */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-12 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <Link to="/register">
              <Button 
                size="lg" 
                className="group w-full sm:w-auto px-14 py-7 text-xl font-bold bg-gradient-primary hover:shadow-glow-elegant hover:scale-110 transition-all duration-500 shadow-elegant relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <Zap className="h-7 w-7 mr-3 group-hover:rotate-12 transition-transform" />
                Start Free Trial
                <ArrowRight className="h-7 w-7 ml-3 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="group w-full sm:w-auto px-14 py-7 text-xl font-bold border-2 border-primary/40 hover:border-primary hover:bg-primary/10 hover:shadow-glow-subtle transition-all duration-300"
            >
              <Play className="h-7 w-7 mr-3 group-hover:scale-125 transition-transform" />
              Watch Demo
            </Button>
          </div>

          {/* Enhanced Social Proof with animated indicators */}
          <div className="pt-20 space-y-8 animate-fade-in" style={{ animationDelay: '0.8s' }}>
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 text-muted-foreground text-sm md:text-base">
              <span className="flex items-center gap-3 group hover:text-foreground transition-colors">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-glow-subtle" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-75" />
                </div>
                <span className="font-medium">Powered by Scryfall API</span>
              </span>
              <span className="flex items-center gap-3 group hover:text-foreground transition-colors">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-accent animate-pulse shadow-glow-subtle" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-accent animate-ping opacity-75" style={{ animationDelay: '0.5s' }} />
                </div>
                <span className="font-medium">50,000+ Decks Built</span>
              </span>
              <span className="flex items-center gap-3 group hover:text-foreground transition-colors">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-type-commander animate-pulse shadow-glow-subtle" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-type-commander animate-ping opacity-75" style={{ animationDelay: '1s' }} />
                </div>
                <span className="font-medium">Trusted by Planeswalkers</span>
              </span>
            </div>
            <div className="text-sm text-muted-foreground/80 flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Join the most advanced MTG deck building platform</span>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 animate-bounce">
            <div className="flex flex-col items-center gap-2 text-primary/60">
              <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
              <ArrowRight className="h-4 w-4 rotate-90" />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
    </section>
  );
}
