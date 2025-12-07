import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wand2, 
  BarChart3, 
  Package, 
  DollarSign, 
  Search, 
  Target, 
  Zap, 
  Star,
  ArrowRight,
  Crown,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  {
    icon: Wand2,
    title: 'Smart Deck Builder',
    description: 'Build competitive decks instantly with intelligent algorithms that understand synergies, mana curves, and win conditions.',
    color: 'primary',
    link: '/deck-builder',
    badge: 'Smart',
    stats: '50,000+ optimized builds'
  },
  {
    icon: Package,
    title: 'Collection Manager', 
    description: 'Track, value, and organize your entire collection with real-time pricing and analytics.',
    color: 'accent',
    link: '/collection',
    badge: 'Real-time',
    stats: 'Live market data'
  },
  {
    icon: BarChart3,
    title: 'Power Analysis',
    description: 'Get transparent power level scoring from 1-10 with detailed competitive analysis.',
    color: 'type-enchantments',
    link: '/deck-builder?tab=analysis',
    badge: 'Transparent',
    stats: 'Data-driven insights'
  },
  {
    icon: Search,
    title: 'Universal Search',
    description: 'Find any Magic card instantly with advanced filters and intelligent suggestions.',
    color: 'type-instants',
    link: '/cards',
    badge: 'Lightning Fast',
    stats: '500,000+ searchable cards'
  },
  {
    icon: Target,
    title: 'Format Validation',
    description: 'Ensure deck legality across 60+ Magic formats with automatic rule checking.',
    color: 'type-commander',
    link: '/deck-builder',
    badge: '60+ Formats',
    stats: 'Always tournament legal'
  },
  {
    icon: DollarSign,
    title: 'Trading Hub',
    description: 'Buy, sell, and trade cards with integrated market pricing and secure transactions.',
    color: 'yellow-500',
    link: '/marketplace',
    badge: 'Secure',
    stats: 'Protected transactions'
  }
];

export function Features() {
  return (
    <section className="py-24 px-4 relative">
      {/* Enhanced background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      <div className="absolute inset-0 bg-gradient-starfield opacity-20" />
      
      <div className="container mx-auto relative z-10">
        {/* Enhanced Header */}
        <div className="text-center mb-20">
          <div className="flex items-center justify-center mb-6">
            <Crown className="h-8 w-8 text-primary mr-3" />
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 px-4 py-2">
              <Sparkles className="h-4 w-4 mr-2" />
              Complete Platform
            </Badge>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-8">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Master Every Aspect
            </span>
            <br />
            <span className="text-foreground">of Magic: The Gathering</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            From casual commander pods to competitive tournaments, DeckMatrix provides every tool 
            you need to build, analyze, and dominate with confidence.
          </p>
        </div>

        {/* Enhanced Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="group relative overflow-hidden bg-card/60 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all duration-500 hover:transform hover:scale-105 hover:shadow-glow-elegant"
            >
              {/* Enhanced glow effect */}
              <div className={`absolute inset-0 rounded-lg bg-gradient-to-br from-${feature.color}/20 via-${feature.color}/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              <CardHeader className="relative z-10 pb-4 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-2xl bg-${feature.color}/10 group-hover:bg-${feature.color}/20 transition-all duration-300 relative shadow-glow-subtle`}>
                    <feature.icon className={`h-8 w-8 text-${feature.color} group-hover:scale-110 transition-transform duration-300`} />
                    <div className={`absolute inset-0 rounded-2xl bg-${feature.color}/30 blur-sm opacity-0 group-hover:opacity-50 transition-opacity duration-500`} />
                  </div>
                  <Badge variant="outline" className={`text-${feature.color} border-${feature.color}/30 bg-${feature.color}/10 text-xs`}>
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors duration-300">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="relative z-10 px-6 pb-6">
                <CardDescription className="text-sm leading-relaxed text-muted-foreground group-hover:text-foreground/80 transition-colors duration-300 mb-4">
                  {feature.description}
                </CardDescription>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {feature.stats}
                  </div>
                  <Link to={feature.link}>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className={`text-${feature.color} hover:bg-${feature.color}/10 group/btn`}
                    >
                      <span className="group-hover/btn:mr-1 transition-all duration-200">Try it</span>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover/btn:opacity-100 -ml-1 group-hover/btn:ml-1 transition-all duration-200" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to action */}
        <div className="text-center mt-16">
          <Link to="/register">
            <Button size="lg" className="bg-gradient-primary hover:shadow-glow-elegant hover:scale-105 transition-all duration-300">
              <Star className="h-5 w-5 mr-2" />
              Start Building Today
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}