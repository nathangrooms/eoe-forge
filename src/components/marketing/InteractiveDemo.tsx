import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, BarChart3, TrendingUp, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const demoCards = [
  { name: 'Sol Ring', type: 'Artifact', mana: '{1}', power: 95 },
  { name: 'Rhystic Study', type: 'Enchantment', mana: '{2}{U}', power: 92 },
  { name: 'Cyclonic Rift', type: 'Instant', mana: '{1}{U}', power: 89 },
  { name: 'Smothering Tithe', type: 'Enchantment', mana: '{3}{W}', power: 87 }
];

const deckStats = {
  powerLevel: 7.5,
  avgCMC: 3.2,
  cardDraw: 12,
  removal: 8,
  ramp: 14,
  synergy: 89
};

export function InteractiveDemo() {
  const [activeTab, setActiveTab] = useState('builder');
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  return (
    <section className="py-24 relative overflow-hidden bg-gradient-to-b from-background to-card/30">
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
            Live Demo
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            See It In Action
          </h2>
          <p className="text-xl text-muted-foreground">
            Experience the power of AI-driven deck building and analysis
          </p>
        </motion.div>

        {/* Interactive Demo */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-6xl mx-auto"
        >
          <Card className="p-6 md:p-8 bg-card/80 backdrop-blur-sm border-2 border-primary/20 shadow-2xl">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-8">
                <TabsTrigger value="builder" className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="hidden sm:inline">AI Builder</span>
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Analysis</span>
                </TabsTrigger>
                <TabsTrigger value="pricing" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Pricing</span>
                </TabsTrigger>
              </TabsList>

              <AnimatePresence mode="wait">
                <TabsContent value="builder" className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold">AI Deck Suggestions</h3>
                      <Badge className="bg-gradient-primary">Live</Badge>
                    </div>
                    
                    <div className="grid gap-3">
                      {demoCards.map((card, index) => (
                        <motion.div
                          key={card.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, x: 4 }}
                          onClick={() => setSelectedCard(index)}
                          className={`
                            p-4 rounded-lg border-2 cursor-pointer transition-all
                            ${selectedCard === index 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border bg-card/50 hover:border-primary/50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-white">
                                {card.mana}
                              </div>
                              <div>
                                <h4 className="font-bold">{card.name}</h4>
                                <p className="text-sm text-muted-foreground">{card.type}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-primary">{card.power}</div>
                              <p className="text-xs text-muted-foreground">Power Score</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    
                    <Button className="w-full mt-4" size="lg">
                      <Brain className="mr-2 h-5 w-5" />
                      Generate Full Deck
                    </Button>
                  </motion.div>
                </TabsContent>

                <TabsContent value="analysis" className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold">Deck Analysis</h3>
                      <Badge variant="secondary">Commander</Badge>
                    </div>

                    {/* Power Level */}
                    <div className="p-6 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Power Level</span>
                        <span className="text-3xl font-bold">{deckStats.powerLevel}/10</span>
                      </div>
                      <div className="w-full bg-background/50 rounded-full h-3 overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${deckStats.powerLevel * 10}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[
                        { label: 'Avg CMC', value: deckStats.avgCMC },
                        { label: 'Card Draw', value: deckStats.cardDraw },
                        { label: 'Removal', value: deckStats.removal },
                        { label: 'Ramp', value: deckStats.ramp },
                        { label: 'Synergy', value: `${deckStats.synergy}%` },
                        { label: 'Total Cards', value: 100 }
                      ].map((stat, index) => (
                        <motion.div
                          key={stat.label}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-4 rounded-lg bg-card border border-border text-center"
                        >
                          <div className="text-2xl font-bold text-primary mb-1">{stat.value}</div>
                          <div className="text-sm text-muted-foreground">{stat.label}</div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </TabsContent>

                <TabsContent value="pricing" className="mt-0">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-2xl font-bold">Live Market Prices</h3>
                      <Badge className="bg-accent">TCGPlayer</Badge>
                    </div>

                    <div className="p-6 rounded-lg bg-gradient-to-br from-accent/20 to-primary/20 border border-accent/30 mb-6">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total Deck Value</p>
                          <div className="text-4xl font-bold">$247.50</div>
                        </div>
                        <div className="flex items-center gap-2 text-green-500">
                          <TrendingUp className="h-5 w-5" />
                          <span className="font-bold">+12.5%</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {demoCards.map((card, index) => (
                        <motion.div
                          key={card.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-4 rounded-lg border border-border bg-card/50 flex items-center justify-between"
                        >
                          <span className="font-medium">{card.name}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground text-sm">Market</span>
                            <span className="font-bold text-lg">${(Math.random() * 50 + 10).toFixed(2)}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </TabsContent>
              </AnimatePresence>
            </Tabs>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}