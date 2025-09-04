import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Wand2, 
  Package, 
  BarChart3, 
  DollarSign, 
  Target, 
  Crown,
  Search,
  TrendingUp,
  Star,
  ArrowRight,
  Sparkles,
  Zap
} from 'lucide-react';

// CSS Representations of actual app features
const DeckBuilderMockup = () => (
  <div className="bg-gradient-to-br from-card to-muted/50 rounded-xl p-6 h-[400px] relative overflow-hidden border border-primary/20">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-primary" />
        <span className="font-semibold">Atraxa, Praetors' Voice</span>
      </div>
      <Badge className="bg-type-commander/20 text-type-commander border-type-commander/30">Commander</Badge>
    </div>
    
    {/* Deck categories */}
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="space-y-2">
        <div className="text-sm font-medium text-type-creatures">Creatures (24)</div>
        <div className="space-y-1">
          {['Elesh Norn, Grand Cenobite', 'Sheoldred, Whispering One', 'Jin-Gitaxias, Progress Tyrant'].map((card, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-2 bg-muted/50 rounded">
              <div className="w-2 h-2 rounded-full bg-type-creatures" />
              <span className="truncate">{card}</span>
              <span className="text-muted-foreground ml-auto">1x</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="text-sm font-medium text-type-instants">Instants (12)</div>
        <div className="space-y-1">
          {['Counterspell', 'Path to Exile', 'Swords to Plowshares'].map((card, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-2 bg-muted/50 rounded">
              <div className="w-2 h-2 rounded-full bg-type-instants" />
              <span className="truncate">{card}</span>
              <span className="text-muted-foreground ml-auto">1x</span>
            </div>
          ))}
        </div>
      </div>
    </div>
    
    {/* Power level indicator */}
    <div className="absolute bottom-4 left-6 right-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Power Level</span>
        <span className="text-lg font-bold text-primary">7.2/10</span>
      </div>
      <Progress value={72} className="h-2" />
    </div>
    
    {/* Floating mana symbols */}
    <div className="absolute top-4 right-4 flex gap-1">
      <div className="w-6 h-6 rounded-full bg-mana-white/30 flex items-center justify-center text-xs">W</div>
      <div className="w-6 h-6 rounded-full bg-mana-blue/30 flex items-center justify-center text-xs">U</div>
      <div className="w-6 h-6 rounded-full bg-mana-black/30 flex items-center justify-center text-xs">B</div>
      <div className="w-6 h-6 rounded-full bg-mana-green/30 flex items-center justify-center text-xs">G</div>
    </div>
  </div>
);

const CollectionMockup = () => (
  <div className="bg-gradient-to-br from-card to-muted/50 rounded-xl p-6 h-[400px] relative overflow-hidden border border-accent/20">
    {/* Stats header */}
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="text-center">
        <div className="text-2xl font-bold text-primary">$2,847</div>
        <div className="text-xs text-muted-foreground">Total Value</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-accent">1,234</div>
        <div className="text-xs text-muted-foreground">Total Cards</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-type-commander">456</div>
        <div className="text-xs text-muted-foreground">Unique</div>
      </div>
    </div>
    
    {/* Collection grid */}
    <div className="grid grid-cols-4 gap-2 mb-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] bg-gradient-to-b from-amber-400/20 to-amber-600/20 rounded border border-amber-500/30 relative">
          <div className="absolute inset-1 bg-gradient-to-b from-card to-muted rounded-sm" />
          <div className="absolute bottom-1 left-1 right-1 text-[8px] text-center truncate">
            Card {i + 1}
          </div>
          {i < 3 && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-500" />
          )}
        </div>
      ))}
    </div>
    
    {/* Value chart */}
    <div className="absolute bottom-4 left-6 right-6">
      <div className="text-sm font-medium mb-2">Collection Value Trend</div>
      <div className="flex items-end gap-1 h-8">
        {[40, 60, 45, 70, 85, 75, 90, 95, 88, 100].map((height, i) => (
          <div key={i} className="flex-1 bg-gradient-to-t from-accent/60 to-accent/20 rounded-sm" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  </div>
);

const AnalysisMockup = () => (
  <div className="bg-gradient-to-br from-card to-muted/50 rounded-xl p-6 h-[400px] relative overflow-hidden border border-type-enchantments/20">
    {/* Analysis header */}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-type-enchantments" />
        <span className="font-semibold">Deck Analysis</span>
      </div>
      <Badge className="bg-type-enchantments/20 text-type-enchantments border-type-enchantments/30">AI Powered</Badge>
    </div>
    
    {/* Mana curve */}
    <div className="mb-6">
      <div className="text-sm font-medium mb-2">Mana Curve</div>
      <div className="flex items-end gap-2 h-16">
        {[2, 8, 12, 15, 10, 6, 3, 1].map((height, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div 
              className="w-full bg-gradient-to-t from-type-enchantments/60 to-type-enchantments/20 rounded-sm mb-1" 
              style={{ height: `${(height / 15) * 100}%` }} 
            />
            <div className="text-xs text-muted-foreground">{i}</div>
          </div>
        ))}
      </div>
    </div>
    
    {/* Synergy indicators */}
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">Synergy Score</span>
        <div className="flex items-center gap-2">
          <Progress value={87} className="w-20 h-2" />
          <span className="text-sm font-bold text-type-enchantments">87%</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm">Curve Efficiency</span>
        <div className="flex items-center gap-2">
          <Progress value={74} className="w-20 h-2" />
          <span className="text-sm font-bold text-primary">74%</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm">Win Consistency</span>
        <div className="flex items-center gap-2">
          <Progress value={91} className="w-20 h-2" />
          <span className="text-sm font-bold text-accent">91%</span>
        </div>
      </div>
    </div>
    
    {/* Floating AI indicator */}
    <div className="absolute top-4 right-4">
      <div className="w-8 h-8 rounded-full bg-type-enchantments/20 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-type-enchantments animate-pulse" />
      </div>
    </div>
  </div>
);

const TradingMockup = () => (
  <div className="bg-gradient-to-br from-card to-muted/50 rounded-xl p-6 h-[400px] relative overflow-hidden border border-yellow-500/20">
    {/* Trading header */}
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-yellow-500" />
        <span className="font-semibold">Marketplace</span>
      </div>
      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Live Prices</Badge>
    </div>
    
    {/* Featured listings */}
    <div className="space-y-3 mb-6">
      {[
        { name: 'Black Lotus', price: '$12,500', condition: 'NM', trend: 'up' },
        { name: 'Time Walk', price: '$3,200', condition: 'LP', trend: 'up' },
        { name: 'Ancestral Recall', price: '$2,800', condition: 'EX', trend: 'down' }
      ].map((item, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400/30 to-yellow-600/30 rounded border border-yellow-500/30" />
            <div>
              <div className="font-medium text-sm">{item.name}</div>
              <div className="text-xs text-muted-foreground">{item.condition}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-yellow-500">{item.price}</div>
            <div className={`text-xs flex items-center gap-1 ${item.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
              {item.trend === 'up' ? '↗' : '↘'} {item.trend === 'up' ? '+5.2%' : '-2.1%'}
            </div>
          </div>
        </div>
      ))}
    </div>
    
    {/* Market activity */}
    <div className="absolute bottom-4 left-6 right-6">
      <div className="text-sm font-medium mb-2">Market Activity</div>
      <div className="flex gap-2">
        <div className="flex-1 text-center p-2 bg-green-500/20 rounded text-xs">
          <div className="font-bold text-green-500">24</div>
          <div className="text-muted-foreground">Sold Today</div>
        </div>
        <div className="flex-1 text-center p-2 bg-blue-500/20 rounded text-xs">
          <div className="font-bold text-blue-500">156</div>
          <div className="text-muted-foreground">Active Listings</div>
        </div>
      </div>
    </div>
  </div>
);

export function FeatureShowcase() {
  const features = [
    {
      title: 'AI-Powered Deck Builder',
      description: 'Build optimized decks with intelligent card suggestions, synergy analysis, and format validation.',
      component: <DeckBuilderMockup />,
      icon: Wand2,
      color: 'primary',
      link: '/deck-builder',
      stats: ['60+ Formats', 'Smart Synergies', 'Power Tuning']
    },
    {
      title: 'Collection Management',
      description: 'Track your entire collection with real-time pricing, analytics, and portfolio performance.',
      component: <CollectionMockup />,
      icon: Package,
      color: 'accent',
      link: '/collection',
      stats: ['Real-time Values', 'Portfolio Analytics', 'Trend Tracking']
    },
    {
      title: 'Advanced Analytics',
      description: 'Deep deck analysis with mana curves, synergy scoring, and competitive insights.',
      component: <AnalysisMockup />,
      icon: BarChart3,
      color: 'type-enchantments',
      link: '/deck-builder?tab=analysis',
      stats: ['Power Scoring', 'Curve Analysis', 'Win Rate Prediction']
    },
    {
      title: 'Trading & Marketplace',
      description: 'Buy, sell, and trade cards with live market data and secure transactions.',
      component: <TradingMockup />,
      icon: DollarSign,
      color: 'yellow-500',
      link: '/marketplace',
      stats: ['Live Pricing', 'Secure Trading', 'Market Analytics']
    }
  ];

  return (
    <section className="py-24 px-4 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold mb-8">
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Powerful Features
            </span>
            <br />
            <span className="text-foreground">Built for Champions</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Every tool you need to dominate Magic: The Gathering, from casual commander to competitive tournaments.
          </p>
        </div>

        {/* Feature Showcase Grid */}
        <div className="space-y-32">
          {features.map((feature, index) => (
            <div key={index} className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? 'lg:grid-flow-dense' : ''}`}>
              <div className={`space-y-6 ${index % 2 === 1 ? 'lg:col-start-2' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl bg-${feature.color}/10 border border-${feature.color}/20`}>
                    <feature.icon className={`h-8 w-8 text-${feature.color}`} />
                  </div>
                  <Badge variant="outline" className={`text-${feature.color} border-${feature.color}/30 bg-${feature.color}/10`}>
                    <Zap className="h-3 w-3 mr-1" />
                    Live Feature
                  </Badge>
                </div>
                
                <h3 className="text-4xl font-bold">
                  {feature.title.split(' ').map((word, i) => (
                    <span key={i} className={i === feature.title.split(' ').length - 1 ? `text-${feature.color}` : 'text-foreground'}>
                      {word}{i < feature.title.split(' ').length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </h3>
                
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
                
                <div className="flex flex-wrap gap-3">
                  {feature.stats.map((stat, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg text-sm">
                      <div className={`w-2 h-2 rounded-full bg-${feature.color}`} />
                      {stat}
                    </div>
                  ))}
                </div>
                
                <div className="pt-4">
                  <Button 
                    size="lg" 
                    className={`bg-${feature.color}/10 hover:bg-${feature.color}/20 text-${feature.color} border border-${feature.color}/30 hover:border-${feature.color}/50 transition-all duration-300`}
                    variant="outline"
                  >
                    Explore Feature
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
              
              <div className={`${index % 2 === 1 ? 'lg:col-start-1 lg:row-start-1' : ''}`}>
                <div className="relative group">
                  <div className={`absolute -inset-4 bg-gradient-to-r from-${feature.color}/20 to-${feature.color}/10 blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500 rounded-2xl`} />
                  <div className="relative">
                    {feature.component}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}