import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { 
  Brain, TrendingUp, Zap, Target, Users, BarChart3, Shield, Crown,
  FileText, Boxes, Heart, Image, Database, Bell, Share2, Trophy,
  Scan, Lock, MessageSquare, Calendar, GitCompare, Star
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const features: Feature[] = [
  {
    title: 'AI Deck Builder',
    description: 'Build tournament-ready decks instantly with AI that understands meta, synergy, and strategy.',
    icon: Brain,
    color: 'from-primary to-primary/50'
  },
  {
    title: 'Real-Time Pricing',
    description: 'Live TCGPlayer integration with price history, trends, and instant alerts.',
    icon: TrendingUp,
    color: 'from-accent to-accent/50'
  },
  {
    title: 'Power Level Scoring',
    description: 'EDH power calculator with detailed breakdowns and consistency analysis.',
    icon: Zap,
    color: 'from-type-commander to-type-commander/50'
  },
  {
    title: 'Synergy Detection',
    description: 'Automatic combo discovery and interaction analysis across your entire deck.',
    icon: Target,
    color: 'from-primary to-accent'
  },
  {
    title: 'Collection Tracking',
    description: 'Organize unlimited cards with categories, photos, and condition tracking.',
    icon: Database,
    color: 'from-mana-blue to-mana-green'
  },
  {
    title: 'Storage Management',
    description: 'Physical organization with binders, boxes, and slot-level tracking.',
    icon: Boxes,
    color: 'from-mana-green to-mana-white'
  },
  {
    title: 'Marketplace',
    description: 'Buy, sell, and trade cards with built-in messaging and secure transactions.',
    icon: Users,
    color: 'from-mana-red to-mana-black'
  },
  {
    title: 'Deck Analysis',
    description: 'Mana curve optimization, draw probability, and win condition analysis.',
    icon: BarChart3,
    color: 'from-primary to-mana-blue'
  },
  {
    title: 'Tournament Tracking',
    description: 'Match history, win rates, and performance analytics by deck.',
    icon: Trophy,
    color: 'from-accent to-primary'
  },
  {
    title: 'Wishlist System',
    description: 'Track cards you need with price alerts and purchase planning.',
    icon: Heart,
    color: 'from-mana-red to-accent'
  },
  {
    title: 'Card Scanner',
    description: 'Mobile-optimized card scanning with OCR and bulk import.',
    icon: Scan,
    color: 'from-foreground/80 to-foreground/50'
  },
  {
    title: 'Deck Sharing',
    description: 'Public deck URLs, embed codes, and social sharing with analytics.',
    icon: Share2,
    color: 'from-mana-blue to-primary'
  },
  {
    title: 'Version Control',
    description: 'Track every deck change with full version history and rollback.',
    icon: GitCompare,
    color: 'from-primary to-mana-green'
  },
  {
    title: 'Price Alerts',
    description: 'Custom notifications for price drops, spikes, and market opportunities.',
    icon: Bell,
    color: 'from-accent to-mana-red'
  },
  {
    title: 'Deck Templates',
    description: 'Pre-built archetypes for every format with AI customization.',
    icon: FileText,
    color: 'from-mana-green to-mana-blue'
  },
  {
    title: 'Commander Tools',
    description: 'Color identity checking, partner validation, and companion tracking.',
    icon: Crown,
    color: 'from-type-commander to-primary'
  },
  {
    title: 'Card Simulation',
    description: 'Test hands, goldfish games, and probability calculators.',
    icon: Target,
    color: 'from-primary to-accent'
  },
  {
    title: 'Format Checker',
    description: 'Automatic legality validation for all major formats.',
    icon: Shield,
    color: 'from-foreground/70 to-foreground/40'
  },
  {
    title: 'Social Features',
    description: 'Follow builders, share collections, and join the community.',
    icon: MessageSquare,
    color: 'from-mana-blue to-accent'
  },
  {
    title: 'Events Calendar',
    description: 'Track tournaments, releases, and local game store events.',
    icon: Calendar,
    color: 'from-accent to-primary'
  },
  {
    title: 'Favorites System',
    description: 'Star your favorite decks, cards, and builds for quick access.',
    icon: Star,
    color: 'from-primary to-mana-white'
  },
  {
    title: 'Security & Privacy',
    description: 'Bank-level encryption, 2FA, and complete data control.',
    icon: Lock,
    color: 'from-foreground/60 to-foreground/30'
  },
  {
    title: 'Card Imagery',
    description: 'High-res card images with multiple printings and art variations.',
    icon: Image,
    color: 'from-mana-white to-mana-black'
  },
  {
    title: 'Export Options',
    description: 'Export to Arena, MTGO, PDF, CSV, and all major platforms.',
    icon: FileText,
    color: 'from-mana-green to-primary'
  }
];

export function ComprehensiveFeatures() {
  return (
    <section className="py-12 sm:py-20 relative overflow-hidden" id="all-features">
      <div className="absolute inset-0 bg-gradient-to-b from-card/20 via-background to-card/20" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4 text-foreground border-primary/30">
            <Zap className="h-3 w-3 mr-2" />
            Complete Platform
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-foreground px-4">
            Every Tool You'll Ever Need
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-foreground/70 px-4">
            From building to trading, we've got you covered with 24+ powerful features
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="group relative overflow-hidden h-full p-4 sm:p-6 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-glow-subtle hover:-translate-y-1">
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  
                  {/* Content */}
                  <div className="relative z-10 space-y-3">
                    <div className={`inline-flex p-2.5 sm:p-3 rounded-lg bg-gradient-to-br ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    
                    <h3 className="font-bold text-base sm:text-lg text-foreground">
                      {feature.title}
                    </h3>
                    
                    <p className="text-xs sm:text-sm text-foreground/70 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}