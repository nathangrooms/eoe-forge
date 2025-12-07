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
    <section className="py-12 sm:py-20 relative overflow-hidden bg-gradient-to-b from-background to-card/20">
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
            Live Demo
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-foreground px-4">
            See It In Action
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-foreground/70 px-4">
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
          <Card className="p-4 sm:p-6 md:p-8 bg-card/80 backdrop-blur-sm border-2 border-primary/20 shadow-2xl">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-6 sm:mb-8">
                <TabsTrigger value="builder" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                  <Brain className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Builder</span>
                  <span className="xs:hidden">Build</span>
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                  <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Analysis</span>
                  <span className="xs:hidden">Stats</span>
                </TabsTrigger>
                <TabsTrigger value="pricing" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Pricing</span>
                  <span className="xs:hidden">Price</span>
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
                    <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mb-4 sm:mb-6">
                      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Smart Deck Suggestions</h3>
                      <Badge className="bg-gradient-primary w-fit">Live</Badge>
                    </div>
                    
                    <div className="grid gap-2 sm:gap-3">
                      {demoCards.map((card, index) => (
                        <motion.div
                          key={card.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{ scale: 1.02, x: 4 }}
                          onClick={() => setSelectedCard(index)}
                          className={`
                            p-3 sm:p-4 rounded-lg border-2 cursor-pointer transition-all
                            ${selectedCard === index 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border bg-card/50 hover:border-primary/50'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-primary flex items-center justify-center font-bold text-white text-xs sm:text-sm flex-shrink-0">
                                {card.mana}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-sm sm:text-base text-foreground truncate">{card.name}</h4>
                                <p className="text-xs sm:text-sm text-foreground/60">{card.type}</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xl sm:text-2xl font-bold text-primary">{card.power}</div>
                              <p className="text-[10px] sm:text-xs text-foreground/60 whitespace-nowrap">Power Score</p>
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
                    className="space-y-4 sm:space-y-6"
                  >
                    <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mb-4 sm:mb-6">
                      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Deck Analysis</h3>
                      <Badge variant="secondary" className="w-fit">Commander</Badge>
                    </div>

                    {/* Power Level */}
                    <div className="p-4 sm:p-6 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs sm:text-sm font-medium text-foreground">Overall Power Level</span>
                        <span className="text-2xl sm:text-3xl font-bold text-foreground">{deckStats.powerLevel}/10</span>
                      </div>
                      <div className="w-full bg-muted/50 rounded-full h-2 sm:h-3 overflow-hidden">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${deckStats.powerLevel * 10}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                        />
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
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
                          className="p-3 sm:p-4 rounded-lg bg-card/80 border border-border text-center"
                        >
                          <div className="text-xl sm:text-2xl font-bold text-purple-500 mb-1">{stat.value}</div>
                          <div className="text-xs sm:text-sm text-muted-foreground">{stat.label}</div>
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
                    <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 mb-4 sm:mb-6">
                      <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Live Market Prices</h3>
                      <Badge className="bg-green-500/20 text-green-500 border-green-500/30 w-fit">TCGPlayer</Badge>
                    </div>

                    <div className="p-4 sm:p-6 rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 mb-4 sm:mb-6">
                      <div className="flex flex-col xs:flex-row xs:items-end xs:justify-between gap-3">
                        <div>
                          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Deck Value</p>
                          <div className="text-3xl sm:text-4xl font-bold text-foreground">$247.50</div>
                        </div>
                        <div className="flex items-center gap-2 text-green-500">
                          <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="font-bold text-sm sm:text-base">+12.5%</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                      {demoCards.map((card, index) => (
                        <motion.div
                          key={card.name}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="p-3 sm:p-4 rounded-lg border border-border bg-card/50 flex items-center justify-between gap-3"
                        >
                          <span className="font-medium text-sm sm:text-base text-foreground truncate">{card.name}</span>
                          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                            <span className="text-muted-foreground text-xs sm:text-sm hidden xs:inline">Market</span>
                            <span className="font-bold text-base sm:text-lg text-foreground">${(Math.random() * 50 + 10).toFixed(2)}</span>
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