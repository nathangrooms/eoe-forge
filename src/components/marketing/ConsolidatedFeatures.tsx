import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Brain, TrendingUp, Zap, Target, Users, BarChart3, Shield, Crown,
  FileText, Boxes, Heart, Image, Database, Bell, Share2, Trophy,
  Scan, Lock, MessageSquare, Calendar, GitCompare, Star, Sparkles
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
}

const heroFeatures: Feature[] = [
  {
    title: 'Smart Deck Builder',
    description: 'Advanced tools create optimized decks based on strategy, meta, and budget. Smart real-time suggestions.',
    icon: Brain,
    gradient: 'from-purple-500 to-pink-500'
  },
  {
    title: 'Live Card Prices',
    description: 'Real-time TCGPlayer pricing with market trends, alerts, and collection value tracking.',
    icon: TrendingUp,
    gradient: 'from-green-500 to-emerald-500'
  },
  {
    title: 'Power Level Analysis',
    description: 'EDH power calculator with detailed breakdowns and consistency metrics.',
    icon: Zap,
    gradient: 'from-yellow-500 to-orange-500'
  },
  {
    title: 'Synergy Detection',
    description: 'Discover powerful card interactions and combos automatically across your deck.',
    icon: Target,
    gradient: 'from-blue-500 to-cyan-500'
  }
];

const allFeatures: Feature[] = [
  {
    title: 'Collection Manager',
    description: 'Organize unlimited cards with categories, photos, and condition tracking.',
    icon: Database,
    gradient: 'from-blue-500 to-indigo-500'
  },
  {
    title: 'Storage Management',
    description: 'Physical organization with binders, boxes, and slot-level tracking.',
    icon: Boxes,
    gradient: 'from-green-500 to-teal-500'
  },
  {
    title: 'Marketplace',
    description: 'Buy, sell, and trade cards with built-in messaging and secure transactions.',
    icon: Users,
    gradient: 'from-red-500 to-pink-500'
  },
  {
    title: 'Advanced Analytics',
    description: 'Mana curve optimization, draw probability, and win condition analysis.',
    icon: BarChart3,
    gradient: 'from-purple-500 to-blue-500'
  },
  {
    title: 'Tournament Tracking',
    description: 'Match history, win rates, and performance analytics by deck.',
    icon: Trophy,
    gradient: 'from-yellow-500 to-amber-500'
  },
  {
    title: 'Wishlist System',
    description: 'Track cards you need with price alerts and purchase planning.',
    icon: Heart,
    gradient: 'from-pink-500 to-rose-500'
  },
  {
    title: 'Card Scanner',
    description: 'Mobile-optimized card scanning with OCR and bulk import.',
    icon: Scan,
    gradient: 'from-slate-500 to-gray-500'
  },
  {
    title: 'Deck Sharing',
    description: 'Public deck URLs, embed codes, and social sharing with analytics.',
    icon: Share2,
    gradient: 'from-cyan-500 to-blue-500'
  },
  {
    title: 'Version Control',
    description: 'Track every deck change with full version history and rollback.',
    icon: GitCompare,
    gradient: 'from-green-500 to-lime-500'
  },
  {
    title: 'Price Alerts',
    description: 'Custom notifications for price drops, spikes, and market opportunities.',
    icon: Bell,
    gradient: 'from-amber-500 to-orange-500'
  },
  {
    title: 'Deck Templates',
    description: 'Pre-built archetypes for every format with AI customization.',
    icon: FileText,
    gradient: 'from-teal-500 to-emerald-500'
  },
  {
    title: 'Commander Tools',
    description: 'Color identity checking, partner validation, and companion tracking.',
    icon: Crown,
    gradient: 'from-purple-500 to-violet-500'
  },
  {
    title: 'Card Simulation',
    description: 'Test hands, goldfish games, and probability calculators.',
    icon: Target,
    gradient: 'from-indigo-500 to-purple-500'
  },
  {
    title: 'Format Checker',
    description: 'Automatic legality validation for all major formats.',
    icon: Shield,
    gradient: 'from-gray-500 to-zinc-500'
  },
  {
    title: 'Social Features',
    description: 'Follow builders, share collections, and join the community.',
    icon: MessageSquare,
    gradient: 'from-blue-500 to-sky-500'
  },
  {
    title: 'Events Calendar',
    description: 'Track tournaments, releases, and local game store events.',
    icon: Calendar,
    gradient: 'from-orange-500 to-red-500'
  },
  {
    title: 'Favorites System',
    description: 'Star your favorite decks, cards, and builds for quick access.',
    icon: Star,
    gradient: 'from-yellow-500 to-amber-500'
  },
  {
    title: 'Security & Privacy',
    description: 'Bank-level encryption, 2FA, and complete data control.',
    icon: Lock,
    gradient: 'from-slate-600 to-gray-600'
  },
  {
    title: 'High-Res Imagery',
    description: 'High-res card images with multiple printings and art variations.',
    icon: Image,
    gradient: 'from-violet-500 to-purple-500'
  },
  {
    title: 'Export Options',
    description: 'Export to Arena, MTGO, PDF, CSV, and all major platforms.',
    icon: FileText,
    gradient: 'from-emerald-500 to-green-500'
  }
];

export function ConsolidatedFeatures() {
  return (
    <section className="py-12 sm:py-20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_hsl(var(--primary)/0.1),transparent_50%)]" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4 text-foreground border-primary/30">
            <Sparkles className="h-3 w-3 mr-2" />
            Complete Platform
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-foreground px-4">
            Everything You Need to Excel
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-4">
            Professional-grade tools from casual to competitive play
          </p>
        </motion.div>

        {/* Hero Features - Large cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto mb-8 sm:mb-12">
          {heroFeatures.map((feature, index) => {
            const Icon = feature.icon;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="group relative overflow-hidden h-full p-4 sm:p-6 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-glow-subtle hover:-translate-y-1">
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  
                  {/* Content */}
                  <div className="relative z-10 space-y-3 sm:space-y-4">
                    <div className={`inline-flex p-2.5 sm:p-3 rounded-lg bg-gradient-to-br ${feature.gradient} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    
                    <h3 className="font-bold text-base sm:text-lg text-foreground">
                      {feature.title}
                    </h3>
                    
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* All Features - Compact grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 max-w-7xl mx-auto">
          {allFeatures.map((feature, index) => {
            const Icon = feature.icon;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.02 }}
              >
                <Card className="group relative overflow-hidden h-full p-3 sm:p-4 bg-card/60 backdrop-blur-sm border-border/40 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                  
                  {/* Content */}
                  <div className="relative z-10 space-y-2">
                    <div className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${feature.gradient} group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    
                    <h3 className="font-semibold text-sm text-foreground">
                      {feature.title}
                    </h3>
                    
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                      {feature.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div 
          className="text-center mt-12 sm:mt-16 px-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <Link to="/register">
            <Button size="lg" className="px-6 sm:px-8 py-5 sm:py-6 text-base sm:text-lg w-full sm:w-auto group">
              Start Building Free
              <Sparkles className="ml-2 h-4 w-4 sm:h-5 sm:w-5 group-hover:rotate-12 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
