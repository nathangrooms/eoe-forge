import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Zap, TrendingUp, Target, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const useCases = [
  {
    icon: Zap,
    title: 'Competitive Players',
    description: 'Optimize every card choice',
    stats: ['95% Win Rate Improvement', 'Turn 3-4 Consistency', '1000+ Combos Detected'],
    example: 'Built a tier-1 cEDH deck that won 3 tournaments',
    color: 'from-primary to-accent'
  },
  {
    icon: Users,
    title: 'Casual Playgroups',
    description: 'Balance decks to power level',
    stats: ['Perfect Power Matching', 'Fair & Fun Games', '100+ Group Decks'],
    example: 'Matched 6 friends to power level 6-7 for amazing games',
    color: 'from-mana-blue to-mana-green'
  },
  {
    icon: TrendingUp,
    title: 'Collectors & Investors',
    description: 'Track value and optimize sells',
    stats: ['$250K+ Collections', 'Real-time Alerts', '15% ROI Average'],
    example: 'Tracked $50K collection, sold at peak for 20% profit',
    color: 'from-accent to-mana-red'
  },
  {
    icon: Target,
    title: 'Budget Brewers',
    description: 'Build powerful decks for less',
    stats: ['$50 Budget Builds', 'Competitive Results', 'Smart Alternatives'],
    example: 'Built a $45 deck that beats $500+ decks regularly',
    color: 'from-mana-green to-mana-white'
  }
];

export function UseCaseShowcase() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/30 via-background to-card/30" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4">
            <Target className="h-3 w-3 mr-2" />
            Real Success Stories
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Built for Every Playstyle
          </h2>
          <p className="text-xl text-muted-foreground">
            From casual kitchen table to competitive tournaments
          </p>
        </motion.div>

        {/* Use Cases Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            
            return (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
              >
                <Card className="p-8 h-full hover:shadow-glow-elegant transition-all duration-500 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 group relative overflow-hidden">
                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${useCase.color} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
                  
                  {/* Content */}
                  <div className="relative z-10">
                    {/* Icon */}
                    <div className={`inline-flex p-4 rounded-xl bg-gradient-to-br ${useCase.color} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>

                    {/* Title & Description */}
                    <h3 className="text-2xl font-bold mb-2">{useCase.title}</h3>
                    <p className="text-muted-foreground mb-6">{useCase.description}</p>

                    {/* Stats */}
                    <div className="space-y-2 mb-6">
                      {useCase.stats.map((stat, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="font-medium">{stat}</span>
                        </div>
                      ))}
                    </div>

                    {/* Example */}
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-6">
                      <p className="text-sm italic text-muted-foreground">
                        "{useCase.example}"
                      </p>
                    </div>

                    {/* CTA */}
                    <Link to="/register">
                      <Button variant="outline" className="w-full group/btn">
                        Start Building
                        <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p className="text-xl text-muted-foreground mb-6">
            Join thousands of players improving their game
          </p>
          <Link to="/register">
            <Button size="lg" className="px-8 py-6 text-lg">
              Create Your Free Account
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}