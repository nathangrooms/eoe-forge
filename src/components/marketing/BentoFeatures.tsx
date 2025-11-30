import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, TrendingUp, Zap, Target, Users, Sparkles, BarChart3, Shield, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const features = [
  {
    title: 'AI Deck Builder',
    description: 'Let our advanced AI create optimized decks based on your strategy, budget, and playstyle. Smart card suggestions in real-time.',
    icon: Brain,
    color: 'from-primary to-primary/50',
    size: 'large',
    image: '/lovable-uploads/099c667b-3e64-4ac4-94a8-18b5bf6a8ecb.png'
  },
  {
    title: 'Live Card Prices',
    description: 'Real-time pricing from TCGPlayer and market trends. Track your collection value and get instant alerts.',
    icon: TrendingUp,
    color: 'from-accent to-accent/50',
    size: 'medium'
  },
  {
    title: 'Power Level Analysis',
    description: 'EDH power scoring with detailed breakdowns. Know exactly where your deck stands.',
    icon: Zap,
    color: 'from-type-commander to-type-commander/50',
    size: 'medium'
  },
  {
    title: 'Smart Synergy Detection',
    description: 'Discover powerful card interactions and combos automatically.',
    icon: Target,
    color: 'from-primary to-accent',
    size: 'small'
  },
  {
    title: 'Collection Manager',
    description: 'Organize thousands of cards with categories, storage tracking, and condition notes.',
    icon: BarChart3,
    color: 'from-mana-blue to-mana-green',
    size: 'small'
  },
  {
    title: 'Marketplace',
    description: 'Buy, sell, and trade cards directly with the community. Safe and secure.',
    icon: Users,
    color: 'from-mana-red to-mana-black',
    size: 'small'
  },
  {
    title: 'Tournament Ready',
    description: 'Export decks in any format, track match performance, and refine your strategy.',
    icon: Crown,
    color: 'from-accent to-primary',
    size: 'medium'
  },
  {
    title: 'Secure & Private',
    description: 'Your data is encrypted and protected. Complete privacy control.',
    icon: Shield,
    color: 'from-foreground to-muted-foreground',
    size: 'small'
  }
];

export function BentoFeatures() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4">
            <Sparkles className="h-3 w-3 mr-2" />
            Everything You Need
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            Built for Planeswalkers
          </h2>
          <p className="text-xl text-muted-foreground">
            Professional-grade tools that adapt to your playstyle, from casual to competitive.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isLarge = feature.size === 'large';
            const isMedium = feature.size === 'medium';
            
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className={`
                  ${isLarge ? 'md:col-span-2 md:row-span-2' : ''}
                  ${isMedium ? 'md:col-span-2' : ''}
                `}
              >
                <Card className={`
                  group relative overflow-hidden h-full p-6 
                  bg-card/50 backdrop-blur-sm border-border/50
                  hover:border-primary/50 transition-all duration-500
                  hover:shadow-glow-subtle hover:-translate-y-1
                  ${isLarge ? 'md:p-8' : ''}
                `}>
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  
                  {/* Content */}
                  <div className="relative z-10 h-full flex flex-col">
                    <div className={`flex items-start justify-between mb-4 ${isLarge ? 'mb-6' : ''}`}>
                      <div className={`
                        rounded-xl bg-gradient-to-br ${feature.color} p-3
                        group-hover:scale-110 transition-transform duration-300
                        ${isLarge ? 'p-4' : ''}
                      `}>
                        <Icon className={`text-white ${isLarge ? 'h-8 w-8' : 'h-6 w-6'}`} />
                      </div>
                      {isLarge && (
                        <Badge variant="secondary" className="ml-2">Popular</Badge>
                      )}
                    </div>
                    
                    <h3 className={`font-bold mb-3 ${isLarge ? 'text-3xl' : 'text-xl'}`}>
                      {feature.title}
                    </h3>
                    
                    <p className={`text-muted-foreground flex-1 ${isLarge ? 'text-lg mb-6' : 'text-sm'}`}>
                      {feature.description}
                    </p>

                    {/* Large card image */}
                    {isLarge && feature.image && (
                      <div className="mt-auto">
                        <img 
                          src={feature.image} 
                          alt={feature.title}
                          className="rounded-lg w-full h-48 object-cover border border-border/50"
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div 
          className="text-center mt-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <Link to="/register">
            <Button size="lg" className="px-8 py-6 text-lg">
              Explore All Features
              <Sparkles className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}