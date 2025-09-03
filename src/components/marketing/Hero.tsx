import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-background via-background to-spacecraft/20">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-cosmic opacity-30" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_100%)]" />
      
      {/* Floating MTG Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-8 h-8 text-spacecraft/30 animate-float">⚪</div>
        <div className="absolute top-40 right-20 w-6 h-6 text-station/30 animate-float" style={{ animationDelay: '1s' }}>🔵</div>
        <div className="absolute bottom-40 left-20 w-6 h-6 text-void/30 animate-float" style={{ animationDelay: '2s' }}>⚫</div>
        <div className="absolute bottom-20 right-10 w-8 h-8 text-planet/30 animate-float" style={{ animationDelay: '3s' }}>🔴</div>
        <div className="absolute top-60 left-1/2 w-6 h-6 text-warp/30 animate-float" style={{ animationDelay: '4s' }}>🟢</div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Logo/Brand */}
          <div className="flex items-center justify-center mb-8">
            <div className="relative">
              <Sparkles className="h-16 w-16 text-spacecraft animate-glow" />
              <div className="absolute inset-0 h-16 w-16 text-spacecraft animate-pulse opacity-50" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-spacecraft via-station to-warp bg-clip-text text-transparent animate-fade-in">
              Master Your Magic
            </h1>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground">
              The Gathering Decks with AI
            </h2>
          </div>

          {/* Subtext */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            DeckMatrix helps you build, analyze, and dominate with AI-powered insights. 
            The ultimate companion for every Planeswalker.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link to="/register">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-8 py-4 text-lg bg-gradient-to-r from-spacecraft to-station hover:from-station hover:to-warp transition-all duration-300 shadow-lg hover:shadow-spacecraft/25 cosmic-glow"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto px-8 py-4 text-lg border-spacecraft/30 hover:border-spacecraft hover:bg-spacecraft/10 transition-all duration-300"
            >
              <Play className="h-5 w-5 mr-2" />
              View Demo
            </Button>
          </div>

          {/* Social Proof */}
          <div className="pt-12 text-sm text-muted-foreground">
            <p className="flex items-center justify-center gap-2 flex-wrap">
              <span>Powered by Scryfall API</span>
              <span className="text-spacecraft">•</span>
              <span>Trusted by Magic players worldwide</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}