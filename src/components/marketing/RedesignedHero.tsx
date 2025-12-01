import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import deckBuilderMockup from '@/assets/deck-builder-mockup.jpg';
import collectionMockup from '@/assets/collection-manager-mockup.jpg';
import aiAnalysisMockup from '@/assets/ai-analysis-mockup.jpg';

export function RedesignedHero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-purple-950/20 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="h-full w-full" style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10 py-20 sm:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-7xl mx-auto">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            {/* Badge */}
            <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-foreground">
              <Sparkles className="h-3 w-3 mr-2 text-purple-400" />
              AI-Powered MTG Platform
            </Badge>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-tight">
                <span className="text-foreground">Build</span>{' '}
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  Championship
                </span>
                <br />
                <span className="text-foreground">Decks with AI</span>
              </h1>
              
              <p className="text-lg sm:text-xl text-muted-foreground max-w-xl">
                The complete Magic: The Gathering platform. Build perfect decks, track your collection, and dominate every format.
              </p>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 text-sm">
              {[
                { value: '50K+', label: 'Decks Built' },
                { value: '1.2M+', label: 'Cards Tracked' },
                { value: '95%', label: 'Win Rate Boost' }
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                  <div>
                    <div className="font-bold text-foreground">{stat.value}</div>
                    <div className="text-muted-foreground text-xs">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/register" className="flex-1 sm:flex-initial">
                <Button size="lg" className="w-full sm:w-auto px-8 py-6 text-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 group">
                  Start Building Free
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              
              <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 py-6 text-lg border-2 group">
                <Play className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
                Watch Demo
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center gap-6 text-xs text-muted-foreground pt-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Free Forever Plan
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                No Credit Card
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                14-Day Trial
              </div>
            </div>
          </motion.div>

          {/* Right Column - Visuals */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            {/* Main Screenshot */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl overflow-hidden border-2 border-border/50 shadow-2xl">
                <img 
                  src={deckBuilderMockup}
                  alt="AI Deck Builder"
                  className="w-full h-auto"
                />
              </div>
            </div>

            {/* Floating Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="absolute -bottom-4 -left-4 w-48 rounded-xl overflow-hidden border-2 border-border/50 shadow-xl hidden lg:block"
            >
              <img 
                src={collectionMockup}
                alt="Collection Manager"
                className="w-full h-auto"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="absolute -top-4 -right-4 w-48 rounded-xl overflow-hidden border-2 border-border/50 shadow-xl hidden lg:block"
            >
              <img 
                src={aiAnalysisMockup}
                alt="AI Analysis"
                className="w-full h-auto"
              />
            </motion.div>

            {/* Floating Stats Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-6 shadow-2xl hidden xl:block"
            >
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  7.5/10
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">Power Level</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
