import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Crown, Sparkles, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden px-4 py-20">
      {/* Clean gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/20" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="container mx-auto relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Crown className="h-7 w-7 text-primary" />
            </div>
            <span className="text-2xl font-bold text-foreground">DeckMatrix</span>
          </div>

          {/* Badge */}
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary px-4 py-1.5">
            <Sparkles className="h-3 w-3 mr-1.5" />
            AI-Powered MTG Platform
          </Badge>

          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold text-foreground leading-tight">
            Build Better Decks,
            <br />
            <span className="text-primary">Win More Games</span>
          </h1>

          {/* Subheading */}
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Professional deck building tools with AI assistance, real-time collection management, and competitive power analysis for Magic: The Gathering
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link to="/register">
              <Button size="lg" className="px-8 py-6 text-base font-semibold">
                Get Started Free
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            
            <Link to="/login">
              <Button variant="outline" size="lg" className="px-8 py-6 text-base font-semibold">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="pt-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>AI Deck Building</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>Collection Tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>Power Analysis</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
