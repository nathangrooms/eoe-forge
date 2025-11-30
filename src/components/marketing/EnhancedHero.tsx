import { Button } from '@/components/ui/button';
import { ArrowRight, Play, Sparkles, Zap, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export function EnhancedHero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Layered animated backgrounds */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-cosmic opacity-40 animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute inset-0 bg-gradient-starfield opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
      </div>
      
      {/* Floating animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/30 rounded-full blur-3xl"
          animate={{ 
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl"
          animate={{ 
            x: [0, -80, 0],
            y: [0, 80, 0],
            scale: [1, 1.3, 1]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Floating MTG Mana Symbols with enhanced animations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[
          { emoji: '⚪', color: 'mana-white', top: '20%', left: '10%', delay: 0 },
          { emoji: '🔵', color: 'mana-blue', top: '40%', right: '15%', delay: 1 },
          { emoji: '⚫', color: 'mana-black', bottom: '30%', left: '15%', delay: 2 },
          { emoji: '🔴', color: 'mana-red', bottom: '20%', right: '10%', delay: 3 },
          { emoji: '🟢', color: 'mana-green', top: '60%', left: '50%', delay: 4 },
        ].map((mana, i) => (
          <motion.div
            key={i}
            className={`absolute w-12 h-12 rounded-full bg-${mana.color}/30 flex items-center justify-center shadow-glow-subtle`}
            style={{ top: mana.top, left: mana.left, right: mana.right, bottom: mana.bottom }}
            animate={{
              y: [0, -20, 0],
              rotate: [0, 360],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              delay: mana.delay,
              ease: "easeInOut"
            }}
          >
            <span className="text-2xl filter drop-shadow-lg">{mana.emoji}</span>
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div 
          className="max-w-6xl mx-auto space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI-Powered MTG Platform</span>
            <Sparkles className="h-4 w-4 text-primary" />
          </motion.div>

          {/* Headline */}
          <div className="space-y-6">
            <motion.h1 
              className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-glow">
                Master Magic:
              </span>
              <br />
              <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                The Gathering
              </span>
            </motion.h1>
            
            <motion.h2 
              className="text-xl md:text-3xl lg:text-4xl font-semibold text-muted-foreground max-w-4xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Build Perfect Decks • Track Your Collection • Dominate Every Format
            </motion.h2>
          </div>

          {/* Value Props */}
          <motion.div 
            className="flex flex-wrap items-center justify-center gap-6 text-sm md:text-base"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {[
              { icon: Zap, text: 'AI Deck Builder' },
              { icon: TrendingUp, text: 'Live Card Prices' },
              { icon: Sparkles, text: 'Power Level Analysis' }
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/50 backdrop-blur-sm border border-border/50">
                <item.icon className="h-5 w-5 text-primary" />
                <span className="font-medium">{item.text}</span>
              </div>
            ))}
          </motion.div>

          {/* Enhanced CTAs */}
          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Link to="/register">
              <Button 
                size="lg" 
                className="w-full sm:w-auto px-12 py-7 text-xl font-bold bg-gradient-primary hover:shadow-glow-elegant hover:scale-105 transition-all duration-500 shadow-elegant group"
              >
                <Zap className="h-6 w-6 mr-3 group-hover:rotate-12 transition-transform" />
                Start Building Free
                <ArrowRight className="h-6 w-6 ml-3 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto px-12 py-7 text-xl font-bold border-2 border-primary/40 hover:border-primary hover:bg-primary/10 hover:shadow-glow-subtle transition-all duration-300 group"
            >
              <Play className="h-6 w-6 mr-3 group-hover:scale-110 transition-transform" />
              Watch Demo
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div 
            className="pt-16 space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-glow-subtle" />
                <span className="text-sm font-medium">50,000+ Decks Built</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-glow-subtle" />
                <span className="text-sm font-medium">1M+ Cards Tracked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-type-commander animate-pulse shadow-glow-subtle" />
                <span className="text-sm font-medium">Trusted by Pros</span>
              </div>
            </div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-6 h-10 rounded-full border-2 border-primary/50 flex items-start justify-center p-2">
              <motion.div 
                className="w-1.5 h-1.5 rounded-full bg-primary"
                animate={{ y: [0, 12, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Enhanced bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/80 to-transparent" />
    </section>
  );
}