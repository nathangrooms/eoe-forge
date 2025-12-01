import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { 
  Brain, TrendingUp, Zap, Target, Users, BarChart3, Shield, Crown,
  FileText, Boxes, Heart, Image, Database, Bell, Share2, Trophy,
  Scan, Lock, MessageSquare, Calendar, GitCompare, Star, Sparkles,
  Palette, Filter, History, Gamepad2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  gradient: string;
}

const leftFeatures: Feature[] = [
  {
    title: 'AI Deck Builder',
    description: 'Advanced AI creates optimized decks based on your strategy and meta',
    icon: Brain,
    gradient: 'from-purple-500 to-pink-500'
  },
  {
    title: 'Power Level Analysis',
    description: 'EDH power calculator with detailed breakdowns and metrics',
    icon: Zap,
    gradient: 'from-yellow-500 to-orange-500'
  },
  {
    title: 'Collection Manager',
    description: 'Organize unlimited cards with categories and tracking',
    icon: Database,
    gradient: 'from-blue-500 to-indigo-500'
  },
  {
    title: 'Storage Management',
    description: 'Physical organization with binders and slot-level tracking',
    icon: Boxes,
    gradient: 'from-green-500 to-teal-500'
  },
  {
    title: 'Advanced Analytics',
    description: 'Mana curve optimization and win condition analysis',
    icon: BarChart3,
    gradient: 'from-purple-500 to-blue-500'
  },
  {
    title: 'Wishlist System',
    description: 'Track cards you need with price alerts and planning',
    icon: Heart,
    gradient: 'from-pink-500 to-rose-500'
  },
  {
    title: 'Deck Sharing',
    description: 'Public URLs, embed codes, and social sharing',
    icon: Share2,
    gradient: 'from-cyan-500 to-blue-500'
  },
  {
    title: 'Price Alerts',
    description: 'Custom notifications for market opportunities',
    icon: Bell,
    gradient: 'from-amber-500 to-orange-500'
  },
  {
    title: 'Commander Tools',
    description: 'Color identity and partner validation',
    icon: Crown,
    gradient: 'from-purple-500 to-violet-500'
  },
  {
    title: 'Format Checker',
    description: 'Automatic legality validation for all formats',
    icon: Shield,
    gradient: 'from-gray-500 to-zinc-500'
  },
  {
    title: 'Events Calendar',
    description: 'Track tournaments and local game store events',
    icon: Calendar,
    gradient: 'from-orange-500 to-red-500'
  },
  {
    title: 'Security & Privacy',
    description: 'Bank-level encryption and complete data control',
    icon: Lock,
    gradient: 'from-slate-600 to-gray-600'
  }
];

const rightFeatures: Feature[] = [
  {
    title: 'Live Card Prices',
    description: 'Real-time TCGPlayer pricing with market trends and alerts',
    icon: TrendingUp,
    gradient: 'from-green-500 to-emerald-500'
  },
  {
    title: 'Synergy Detection',
    description: 'Discover powerful card interactions automatically',
    icon: Target,
    gradient: 'from-blue-500 to-cyan-500'
  },
  {
    title: 'Marketplace',
    description: 'Buy, sell, and trade with secure transactions',
    icon: Users,
    gradient: 'from-red-500 to-pink-500'
  },
  {
    title: 'Tournament Tracking',
    description: 'Match history and performance analytics by deck',
    icon: Trophy,
    gradient: 'from-yellow-500 to-amber-500'
  },
  {
    title: 'Card Scanner',
    description: 'Mobile-optimized OCR scanning with bulk import',
    icon: Scan,
    gradient: 'from-slate-500 to-gray-500'
  },
  {
    title: 'Version Control',
    description: 'Full version history and rollback capabilities',
    icon: GitCompare,
    gradient: 'from-green-500 to-lime-500'
  },
  {
    title: 'Deck Templates',
    description: 'Pre-built archetypes for every format with AI',
    icon: FileText,
    gradient: 'from-teal-500 to-emerald-500'
  },
  {
    title: 'Card Simulation',
    description: 'Test hands and probability calculators',
    icon: Gamepad2,
    gradient: 'from-indigo-500 to-purple-500'
  },
  {
    title: 'Social Features',
    description: 'Follow builders and join the community',
    icon: MessageSquare,
    gradient: 'from-blue-500 to-sky-500'
  },
  {
    title: 'Favorites System',
    description: 'Star favorite decks and builds for quick access',
    icon: Star,
    gradient: 'from-yellow-500 to-amber-500'
  },
  {
    title: 'High-Res Imagery',
    description: 'Multiple printings and art variations',
    icon: Image,
    gradient: 'from-violet-500 to-purple-500'
  },
  {
    title: 'Export Options',
    description: 'Export to Arena, MTGO, PDF, and all major platforms',
    icon: FileText,
    gradient: 'from-emerald-500 to-green-500'
  }
];

export function TwoColumnFeatures() {
  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4 border-purple-500/30 bg-purple-500/10 text-foreground">
            <Sparkles className="h-3 w-3 mr-2" />
            Complete Platform
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-foreground">
            Everything You Need to Excel
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground">
            Professional-grade tools from casual to competitive play
          </p>
        </motion.div>

        {/* Two Column Grid */}
        <div className="grid lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* Left Column */}
          <div className="space-y-4">
            {leftFeatures.map((feature, index) => {
              const Icon = feature.icon;
              
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="group relative overflow-hidden p-4 bg-card/60 backdrop-blur-sm border-border/50 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                    
                    <div className="relative z-10 flex items-start gap-4">
                      <div className={`flex-shrink-0 p-2.5 rounded-lg bg-gradient-to-br ${feature.gradient} group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-foreground mb-1">
                          {feature.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {rightFeatures.map((feature, index) => {
              const Icon = feature.icon;
              
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="group relative overflow-hidden p-4 bg-card/60 backdrop-blur-sm border-border/50 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                    
                    <div className="relative z-10 flex items-start gap-4">
                      <div className={`flex-shrink-0 p-2.5 rounded-lg bg-gradient-to-br ${feature.gradient} group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-foreground mb-1">
                          {feature.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground leading-snug">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
