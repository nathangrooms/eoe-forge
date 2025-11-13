import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Crown, Zap, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Modern gradient background */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-spacecraft/10 via-background to-warp/10" />
        <div className="absolute inset-0 bg-starfield opacity-30" />
        {/* Animated glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-spacecraft/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-warp/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>
      
      {/* Simplified floating elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-16 h-16 rounded-2xl bg-spacecraft/20 backdrop-blur-sm border border-spacecraft/30 flex items-center justify-center animate-float shadow-glow-subtle">
          <Sparkles className="h-8 w-8 text-spacecraft" />
        </div>
        <div className="absolute top-40 right-20 w-12 h-12 rounded-xl bg-station/20 backdrop-blur-sm border border-station/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '1s' }}>
          <Crown className="h-6 w-6 text-station" />
        </div>
        <div className="absolute bottom-40 left-20 w-12 h-12 rounded-xl bg-warp/20 backdrop-blur-sm border border-warp/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '2s' }}>
          <Zap className="h-6 w-6 text-warp" />
        </div>
        <div className="absolute bottom-20 right-10 w-16 h-16 rounded-2xl bg-void/20 backdrop-blur-sm border border-void/30 flex items-center justify-center animate-float shadow-glow-subtle" style={{ animationDelay: '3s' }}>
          <TrendingUp className="h-8 w-8 text-void" />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Real DeckMatrix Logo */}
          <Link to="/" className="flex items-center justify-center mb-8 group">
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-r from-spacecraft via-station to-warp blur-2xl opacity-40 group-hover:opacity-60 transition-opacity" />
              <div className="relative flex items-center gap-4 p-4 rounded-2xl bg-card/60 backdrop-blur-xl border border-primary/20 shadow-glow-elegant">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-spacecraft to-warp flex items-center justify-center shadow-glow-subtle">
                  <Crown className="h-10 w-10 text-primary-foreground" />
                </div>
                <div>
                  <span className="text-3xl font-bold bg-gradient-to-r from-spacecraft via-station to-spacecraft bg-clip-text text-transparent">
                    DeckMatrix
                  </span>
                  <div className="text-xs text-muted-foreground font-medium tracking-wider">
                    MTG MASTERY PLATFORM
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Main Headline */}
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-spacecraft via-station to-warp bg-clip-text text-transparent">
                The Ultimate MTG Platform
              </span>
            </h1>
            <h2 className="text-xl md:text-2xl lg:text-3xl font-semibold text-foreground/90">
              Build Tournament-Ready Decks with AI Guidance
            </h2>
          </div>

          {/* Enhanced Subtext */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            AI-powered deck building • Real-time collection tracking • Competitive power analysis • 500,000+ searchable cards
          </p>

          {/* Enhanced CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link to="/register">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-10 py-6 text-base font-semibold bg-gradient-to-r from-spacecraft to-station hover:shadow-glow-elegant hover:scale-105 transition-all duration-300"
              >
                <Zap className="h-5 w-5 mr-2" />
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            
            <Link to="/login">
              <Button 
                variant="outline" 
                size="lg"
                className="w-full sm:w-auto px-10 py-6 text-base font-semibold border-spacecraft/40 hover:border-spacecraft hover:bg-spacecraft/10 hover:shadow-glow-subtle transition-all duration-300"
              >
                Sign In
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Enhanced Social Proof */}
          <div className="pt-12">
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
              <Badge variant="outline" className="border-spacecraft/30 bg-spacecraft/10 text-spacecraft px-4 py-2">
                <Sparkles className="h-4 w-4 mr-2" />
                AI-Powered Analysis
              </Badge>
              <Badge variant="outline" className="border-station/30 bg-station/10 text-station px-4 py-2">
                <TrendingUp className="h-4 w-4 mr-2" />
                50,000+ Decks Built
              </Badge>
              <Badge variant="outline" className="border-warp/30 bg-warp/10 text-warp px-4 py-2">
                <Crown className="h-4 w-4 mr-2" />
                500k+ Cards
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/50 to-transparent" />
    </section>
  );
}