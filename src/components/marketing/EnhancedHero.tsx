import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Sparkles, Zap, TrendingUp, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export function EnhancedHero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden py-12 sm:py-20">
      {/* Layered animated backgrounds */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-30 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute inset-0 bg-gradient-starfield opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
      </div>
      
      {/* Floating animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl"
          animate={{ 
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/15 rounded-full blur-3xl"
          animate={{ 
            x: [0, -80, 0],
            y: [0, 80, 0],
            scale: [1, 1.3, 1]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6 text-center">
        <motion.div 
          className="max-w-5xl mx-auto space-y-6 sm:space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-primary/10 border border-primary/20 text-xs sm:text-sm font-medium"
          >
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            <span className="text-foreground">AI-Powered MTG Platform</span>
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </motion.div>

          {/* Headline */}
          <div className="space-y-4 sm:space-y-6">
            <motion.h1 
              className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold leading-tight px-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Master Magic:
              </span>
              <br />
              <span className="text-foreground">
                The Gathering
              </span>
            </motion.h1>
            
            <motion.p 
              className="text-base sm:text-xl md:text-2xl lg:text-3xl font-medium text-foreground/70 max-w-4xl mx-auto px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Build Perfect Decks • Track Your Collection • Dominate Every Format
            </motion.p>
          </div>

          {/* Value Props */}
          <motion.div 
            className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {[
              { icon: Zap, text: 'AI Deck Builder' },
              { icon: TrendingUp, text: 'Live Card Prices' },
              { icon: Sparkles, text: 'Power Analysis' }
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-card/80 backdrop-blur-sm border border-border">
                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="font-medium text-foreground">{item.text}</span>
                </div>
              );
            })}
          </motion.div>

          {/* CTAs */}
          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 pt-4 sm:pt-8 px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Link to="/register" className="w-full sm:w-auto">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-8 sm:px-12 py-5 sm:py-7 text-base sm:text-xl font-bold bg-gradient-primary hover:shadow-glow-elegant hover:scale-105 transition-all duration-500 shadow-elegant group"
              >
                <Zap className="h-5 w-5 mr-2 group-hover:rotate-12 transition-transform" />
                Start Building Free
                <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto px-8 sm:px-12 py-5 sm:py-7 text-base sm:text-xl font-bold border-2 border-primary/40 hover:border-primary hover:bg-primary/10 transition-all duration-300 group"
            >
              <Play className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
              Watch Demo
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div 
            className="pt-8 sm:pt-16 space-y-4 sm:space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-foreground/70 px-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-glow-subtle" />
                <span className="text-xs sm:text-sm font-medium">50,000+ Decks</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-glow-subtle" />
                <span className="text-xs sm:text-sm font-medium">1M+ Cards</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-type-commander animate-pulse shadow-glow-subtle" />
                <span className="text-xs sm:text-sm font-medium">Trusted by Pros</span>
              </div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="hidden sm:block absolute bottom-4 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-6 w-6 text-primary/50" />
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background via-background/80 to-transparent" />
    </section>
  );
}