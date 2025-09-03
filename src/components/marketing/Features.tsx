import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Cpu, BarChart3, Package, DollarSign, Wand2, Globe } from 'lucide-react';

const features = [
  {
    icon: Wand2,
    title: 'AI Deck Builder',
    description: 'Build optimized decks instantly with AI that understands synergies, mana curves, and win conditions.'
  },
  {
    icon: Package,
    title: 'Collection Manager',
    description: 'Track, value, and organize your entire collection with smart analytics and deck building integration.'
  },
  {
    icon: BarChart3,
    title: 'Power Scoring',
    description: 'Know your deck\'s competitive strength from 1-10 with transparent, explainable analysis.'
  },
  {
    icon: DollarSign,
    title: 'Trade & Sell',
    description: 'Mark cards for sale, track market values, and manage your trading inventory effortlessly.'
  }
];

export function Features() {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-spacecraft/5 to-background">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-spacecraft to-station bg-clip-text text-transparent">
            Everything You Need to Dominate
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From casual kitchen table to competitive tournaments, DeckMatrix gives you the tools to build better decks faster.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="relative group hover:shadow-xl hover:shadow-spacecraft/10 transition-all duration-300 bg-card/50 backdrop-blur-sm border-border/50 hover:border-spacecraft/30"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-spacecraft/10 to-station/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <CardHeader className="relative z-10 text-center pb-4">
                <div className="mx-auto mb-4 p-3 rounded-full bg-spacecraft/10 group-hover:bg-spacecraft/20 transition-colors duration-300">
                  <feature.icon className="h-8 w-8 text-spacecraft group-hover:scale-110 transition-transform duration-300" />
                </div>
                <CardTitle className="text-xl font-bold">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 text-center">
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}