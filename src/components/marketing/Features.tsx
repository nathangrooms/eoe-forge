import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wand2, BarChart3, Package, DollarSign } from 'lucide-react';

const features = [
  {
    icon: Wand2,
    title: 'AI Deck Builder',
    description: 'Build competitive decks instantly with AI that understands synergies, mana curves, and win conditions.',
    color: 'primary'
  },
  {
    icon: Package,
    title: 'Collection Manager', 
    description: 'Track, value, and organize your entire collection with smart analytics and deck building integration.',
    color: 'accent'
  },
  {
    icon: BarChart3,
    title: 'Power Scoring',
    description: 'Know your deck\'s competitive strength from 1-10 with transparent, explainable analysis.',
    color: 'type-enchantments'
  },
  {
    icon: DollarSign,
    title: 'Trade & Sell',
    description: 'Mark cards for sale, track market values, and manage your trading inventory effortlessly.',
    color: 'type-commander'
  }
];

export function Features() {
  return (
    <section className="py-24 px-4 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-8">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Everything You Need
            </span>
            <br />
            <span className="text-foreground">to Dominate</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            From casual kitchen table to competitive tournaments, get the tools to build better decks faster than ever before.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-500 hover:transform hover:scale-105"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <CardHeader className="relative z-10 text-center pb-6 pt-8">
                <div className={`mx-auto mb-6 p-4 rounded-2xl bg-${feature.color}/10 group-hover:bg-${feature.color}/20 transition-all duration-300 relative`}>
                  <feature.icon className={`h-10 w-10 text-${feature.color} group-hover:scale-110 transition-transform duration-300`} />
                  <div className={`absolute inset-0 rounded-2xl bg-${feature.color}/20 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                </div>
                <CardTitle className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 text-center px-6 pb-8">
                <CardDescription className="text-base leading-relaxed text-muted-foreground group-hover:text-foreground/80 transition-colors duration-300">
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