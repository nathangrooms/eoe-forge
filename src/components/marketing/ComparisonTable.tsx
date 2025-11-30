import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, Sparkles, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const competitors = [
  { name: 'DeckMatrix', isUs: true },
  { name: 'Archidekt', isUs: false },
  { name: 'Moxfield', isUs: false },
  { name: 'TappedOut', isUs: false }
];

const features = [
  { name: 'AI Deck Builder', values: [true, false, false, false] },
  { name: 'Real-time Pricing', values: [true, true, true, false] },
  { name: 'Power Level Analysis', values: [true, false, false, true] },
  { name: 'Synergy Detection', values: [true, false, true, false] },
  { name: 'Collection Tracking', values: [true, true, true, true] },
  { name: 'Storage Management', values: [true, false, false, false] },
  { name: 'Marketplace', values: [true, false, false, true] },
  { name: 'Mobile Optimized', values: [true, false, true, false] },
  { name: 'Advanced Analytics', values: [true, false, false, false] },
  { name: 'Deck Simulation', values: [true, false, false, false] }
];

export function ComparisonTable() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-card/30 to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div 
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Badge variant="outline" className="mb-4">
            <Crown className="h-3 w-3 mr-2" />
            Why Choose Us
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            The Most Complete Platform
          </h2>
          <p className="text-xl text-muted-foreground">
            See how we stack up against the competition
          </p>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-6xl mx-auto"
        >
          <div className="overflow-x-auto">
            <Card className="p-0 overflow-hidden border-2 border-primary/20">
              <div className="min-w-[800px]">
                {/* Header Row */}
                <div className="grid grid-cols-5 gap-4 p-6 bg-card/50 border-b border-border">
                  <div className="font-bold text-lg">Features</div>
                  {competitors.map((comp, index) => (
                    <div key={comp.name} className="text-center">
                      {comp.isUs ? (
                        <div className="space-y-2">
                          <Badge className="bg-gradient-primary">
                            <Sparkles className="h-3 w-3 mr-1" />
                            DeckMatrix
                          </Badge>
                          <div className="text-xs text-muted-foreground">That's Us!</div>
                        </div>
                      ) : (
                        <div className="font-medium">{comp.name}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Feature Rows */}
                {features.map((feature, rowIndex) => (
                  <motion.div
                    key={feature.name}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: rowIndex * 0.05 }}
                    className={`
                      grid grid-cols-5 gap-4 p-6 border-b border-border last:border-b-0
                      ${rowIndex % 2 === 0 ? 'bg-card/20' : 'bg-transparent'}
                    `}
                  >
                    <div className="font-medium">{feature.name}</div>
                    {feature.values.map((hasFeature, colIndex) => (
                      <div key={colIndex} className="flex justify-center">
                        {hasFeature ? (
                          <div className={`
                            rounded-full p-1.5
                            ${colIndex === 0 
                              ? 'bg-primary/20 text-primary' 
                              : 'bg-muted text-muted-foreground'
                            }
                          `}>
                            <Check className="h-5 w-5" />
                          </div>
                        ) : (
                          <div className="rounded-full p-1.5 bg-muted/50 text-muted-foreground/50">
                            <X className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                    ))}
                  </motion.div>
                ))}
              </div>
            </Card>
          </div>

          {/* CTA */}
          <motion.div 
            className="text-center mt-12"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Link to="/register">
              <Button size="lg" className="px-8 py-6 text-lg">
                <Sparkles className="mr-2 h-5 w-5" />
                Get Started Free
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground mt-4">
              No credit card required • 5 minutes to set up • Cancel anytime
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}