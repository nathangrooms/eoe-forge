import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import deckBuilderMockup from '@/assets/deck-builder-mockup.jpg';
import collectionManagerMockup from '@/assets/collection-manager-mockup.jpg';
import aiAnalysisMockup from '@/assets/ai-analysis-mockup.jpg';

export function Screenshots() {
  return (
    <section className="py-24 px-4 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-8">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              See the Power
            </span>
            <br />
            <span className="text-foreground">in Action</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Experience the future of Magic: The Gathering deck building with our intelligent interface.
          </p>
        </div>

        {/* Screenshots Grid */}
        <div className="space-y-24">
          {/* Deck Builder */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10">
                🎯 Smart Deck Builder
              </Badge>
              <h3 className="text-4xl font-bold">
                Build Perfect Decks
                <span className="text-primary"> in Minutes</span>
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our AI analyzes thousands of card combinations, synergies, and meta strategies 
                to suggest optimal builds tailored to your playstyle and format preferences.
              </p>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Smart card suggestions based on synergy
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Automated mana curve optimization
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  Format legality checking
                </li>
              </ul>
            </div>
            
            <Card className="relative group overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 hover:border-primary/40 transition-all duration-500">
              <div className="aspect-video overflow-hidden rounded-lg">
                <img 
                  src={deckBuilderMockup} 
                  alt="Deck Builder Interface" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/20 to-accent/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
          </div>

          {/* Collection Manager */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <Card className="relative group overflow-hidden bg-gradient-to-br from-accent/10 to-type-enchantments/10 border-accent/20 hover:border-accent/40 transition-all duration-500 lg:order-1">
              <div className="aspect-video overflow-hidden rounded-lg">
                <img 
                  src={collectionManagerMockup} 
                  alt="Collection Manager Interface" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent/20 to-type-enchantments/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
            
            <div className="space-y-6 lg:order-2">
              <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10">
                📊 Collection Analytics
              </Badge>
              <h3 className="text-4xl font-bold">
                Track Every Card's
                <span className="text-accent"> True Value</span>
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Monitor your collection's worth in real-time, identify missing cards for decks, 
                and make informed trading decisions with comprehensive market data.
              </p>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  Real-time price tracking
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  Portfolio performance analytics
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  Smart acquisition recommendations
                </li>
              </ul>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Badge variant="outline" className="text-type-enchantments border-type-enchantments/30 bg-type-enchantments/10">
                🧠 AI Analysis Engine
              </Badge>
              <h3 className="text-4xl font-bold">
                Understand Your Deck's
                <span className="text-type-enchantments"> True Power</span>
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Get transparent power level scoring, detailed synergy analysis, and actionable 
                suggestions to take your deck to the next competitive level.
              </p>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-type-enchantments" />
                  1-10 power level transparency
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-type-enchantments" />
                  Synergy strength calculations
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-type-enchantments" />
                  Weakness identification
                </li>
              </ul>
            </div>
            
            <Card className="relative group overflow-hidden bg-gradient-to-br from-type-enchantments/10 to-primary/10 border-type-enchantments/20 hover:border-type-enchantments/40 transition-all duration-500">
              <div className="aspect-video overflow-hidden rounded-lg">
                <img 
                  src={aiAnalysisMockup} 
                  alt="AI Analysis Interface" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-type-enchantments/20 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}