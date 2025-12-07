import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Zap, Brain, TrendingUp, Shield, Users, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const features = [
  { icon: Brain, label: 'AI-Powered Deck Building', delay: 0.7 },
  { icon: TrendingUp, label: 'Price Tracking & Analytics', delay: 0.8 },
  { icon: Shield, label: 'Collection Management', delay: 0.9 },
  { icon: Zap, label: 'Real-time Optimization', delay: 1.0 },
];

export function TestingBanner() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <motion.div 
          className="absolute inset-0"
          animate={{
            background: [
              'radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 80%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 80%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 20%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.15) 0%, transparent 50%)',
            ]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
      </div>
      
      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-primary/30 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
        />
      ))}

      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/30 mb-10 backdrop-blur-sm"
        >
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
          </motion.div>
          <span className="text-sm font-semibold text-primary tracking-wide">Early Access Program</span>
        </motion.div>

        {/* Main Title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 80 }}
          className="mb-6"
        >
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold mb-2">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              Deck
            </span>
            <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
              Matrix
            </span>
          </h1>
        </motion.div>

        {/* Subtitle with glow effect */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 blur-2xl bg-primary/20 rounded-full" />
          <p className="relative text-2xl md:text-3xl lg:text-4xl font-medium text-foreground/90">
            Now Open for Testing
          </p>
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
        >
          Join our early access program and help shape the future of 
          <span className="text-foreground font-medium"> Magic: The Gathering </span>
          deck building. Your feedback drives our development.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: feature.delay, type: "spring" }}
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm"
            >
              <feature.icon className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground/80">{feature.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, type: "spring" }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
        >
          <Button 
            size="lg" 
            onClick={() => navigate('/register')}
            className="group relative overflow-hidden px-8 py-6 text-lg font-semibold"
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary-foreground/10 to-primary/0"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            />
            <span className="relative flex items-center gap-2">
              Join Early Access
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate('/login')}
            className="px-8 py-6 text-lg border-border/50 hover:bg-card/50"
          >
            Sign In
          </Button>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-16 flex flex-col items-center gap-4"
        >
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 + i * 0.1 }}
              >
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              </motion.div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-sm">Join testers shaping the future of deck building</span>
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-xs text-muted-foreground/60 mt-12"
        >
          Free during testing period • No credit card required
        </motion.p>
      </div>
    </div>
  );
}
