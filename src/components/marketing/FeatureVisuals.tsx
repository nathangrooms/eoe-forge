import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Package, BarChart3, Wand2 } from 'lucide-react';
import deckBuilderMockup from '@/assets/deck-builder-mockup.jpg';
import collectionMockup from '@/assets/collection-manager-mockup.jpg';
import aiAnalysisMockup from '@/assets/ai-analysis-mockup.jpg';

const features = [
  {
    icon: Wand2,
    title: 'AI Deck Builder',
    description: 'Let AI guide you through building competitive decks with smart card suggestions based on your strategy and commander.',
    image: deckBuilderMockup,
    badge: 'Smart Suggestions',
    stats: '10x Faster Deck Building'
  },
  {
    icon: Package,
    title: 'Collection Manager',
    description: 'Track every card you own with automatic pricing, organize by sets, and see your collection value in real-time.',
    image: collectionMockup,
    badge: 'Real-Time Pricing',
    stats: 'Track Unlimited Cards'
  },
  {
    icon: Brain,
    title: 'AI Super Brain',
    description: 'Get instant expert advice on card choices, synergies, and strategy from our advanced AI assistant powered by Gemini.',
    image: aiAnalysisMockup,
    badge: 'Powered by Gemini',
    stats: 'Expert-Level Analysis'
  },
  {
    icon: BarChart3,
    title: 'Power Level Analysis',
    description: 'Know exactly how strong your deck is with transparent 1-10 power scoring and detailed competitive breakdowns.',
    image: deckBuilderMockup,
    badge: 'Data-Driven',
    stats: 'Accurate Power Ratings'
  }
];

export function FeatureVisuals() {
  return (
    <section className="py-24 px-4 bg-muted/30">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-20 space-y-4">
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            Platform Features
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-foreground">
            Everything You Need to Master MTG
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Professional tools designed for players at every level, from casual Commander to competitive tournaments
          </p>
        </div>

        {/* Features Grid */}
        <div className="space-y-32">
          {features.map((feature, index) => (
            <div 
              key={index}
              className={`grid md:grid-cols-2 gap-12 items-center ${
                index % 2 === 1 ? 'md:grid-flow-dense' : ''
              }`}
            >
              {/* Text Content */}
              <div className={`space-y-6 ${index % 2 === 1 ? 'md:col-start-2' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-xs">
                    {feature.badge}
                  </Badge>
                </div>
                
                <h3 className="text-3xl font-bold text-foreground">
                  {feature.title}
                </h3>
                
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
                
                <div className="pt-2">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {feature.stats}
                  </div>
                </div>
              </div>

              {/* Feature Image */}
              <div className={index % 2 === 1 ? 'md:col-start-1 md:row-start-1' : ''}>
                <Card className="overflow-hidden border-border/50 shadow-xl">
                  <CardContent className="p-0">
                    <img 
                      src={feature.image}
                      alt={feature.title}
                      className="w-full h-auto"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
