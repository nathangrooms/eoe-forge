import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Brain, 
  Wand2,
  Package, 
  BarChart3, 
  Search,
  Target,
  Layers,
  Globe,
  Zap,
  ArrowRight,
  CheckCircle,
  Crown,
  Eye,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const features = [
    {
      icon: Brain,
      title: 'DeckMatrix AI Super Brain',
      description: 'Advanced AI assistant with deep MTG knowledge for comprehensive deck analysis, strategic insights, and expert recommendations.',
      badge: 'AI-Powered',
      highlight: true
    },
    {
      icon: Wand2,
      title: 'AI Deck Builder',
      description: 'Generate optimized decks using intelligent algorithms that analyze synergies, mana curves, and power levels for any format.',
      badge: 'Smart Build'
    },
    {
      icon: Package,
      title: 'Collection Manager',
      description: 'Track your entire collection with value tracking, analytics, and intelligent deck building from owned cards.',
      badge: 'Organize'
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Comprehensive deck analysis with mana curves, color distribution, synergy detection, and power level assessment.',
      badge: 'Insights'
    },
    {
      icon: Search,
      title: 'Universal Card Search',
      description: 'Search through every Magic card with advanced filters for sets, formats, mechanics, colors, and rarity.',
      badge: 'Complete'
    },
    {
      icon: Target,
      title: 'Power Level Control',
      description: 'Transparent power scoring from casual to competitive with explainable suggestions and automatic tuning.',
      badge: 'Balanced'
    }
  ];

  const formats = [
    { name: 'Standard', icon: Sparkles, description: 'Current rotation' },
    { name: 'Commander', icon: Crown, description: '100-card singleton' },
    { name: 'Modern', icon: Zap, description: 'Non-rotating' },
    { name: 'Legacy', icon: TrendingUp, description: 'Eternal format' },
    { name: 'Vintage', icon: Globe, description: 'Most powerful' }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-spacecraft/5 via-celestial/5 to-cosmic/5 pointer-events-none" />
        <div className="container mx-auto text-center relative z-10 max-w-5xl">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-cosmic bg-clip-text text-transparent">
            DeckMatrix
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            The ultimate Magic: The Gathering deck builder powered by advanced AI. 
            Build, analyze, and perfect your decks with intelligent optimization and comprehensive analytics.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="bg-gradient-cosmic hover:opacity-90">
                <Sparkles className="h-5 w-5 mr-2" />
                Get Started Free
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Link to="/cards">
              <Button variant="outline" size="lg">
                <Search className="h-5 w-5 mr-2" />
                Browse Cards
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* AI Feature Highlight */}
      <section className="py-12 px-4 bg-gradient-to-r from-spacecraft/5 via-celestial/5 to-cosmic/5">
        <div className="container mx-auto max-w-6xl">
          <Card className="border-spacecraft/30 shadow-lg">
            <CardContent className="p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow flex-shrink-0">
                  <Brain className="h-10 w-10 text-white" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-3xl font-bold mb-3 flex items-center justify-center md:justify-start gap-3">
                    DeckMatrix AI Super Brain
                    <Badge variant="secondary" className="bg-spacecraft/20 text-spacecraft">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Powered by Gemini
                    </Badge>
                  </h2>
                  <p className="text-muted-foreground mb-4">
                    Get expert deck analysis, strategic insights, and personalized recommendations from our advanced AI. 
                    Ask questions, optimize your builds, and discover new strategies with comprehensive MTG knowledge at your fingertips.
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-2">
                    <CheckCircle className="h-4 w-4 text-spacecraft" />
                    <span className="text-sm">Real-time deck analysis</span>
                    <CheckCircle className="h-4 w-4 text-spacecraft ml-3" />
                    <span className="text-sm">Strategic guidance</span>
                    <CheckCircle className="h-4 w-4 text-spacecraft ml-3" />
                    <span className="text-sm">Card recommendations</span>
                  </div>
                </div>
                <Link to="/auth">
                  <Button size="lg" className="bg-gradient-cosmic hover:opacity-90">
                    <Brain className="h-5 w-5 mr-2" />
                    Try AI Brain
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Everything You Need to Build Better Decks</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Professional-grade tools for deck building, collection management, and competitive play
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className={`hover:shadow-lg transition-all duration-300 ${
                  feature.highlight ? 'border-spacecraft/30 bg-gradient-to-br from-spacecraft/5 to-celestial/5' : ''
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`p-3 rounded-lg ${
                      feature.highlight 
                        ? 'bg-gradient-cosmic shadow-cosmic-glow' 
                        : 'bg-muted'
                    }`}>
                      <feature.icon className={`h-6 w-6 ${
                        feature.highlight ? 'text-white' : 'text-foreground'
                      }`} />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {feature.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Formats Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">All Major Formats Supported</h2>
            <p className="text-muted-foreground">
              Build decks for any format with format-specific validation and optimization
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {formats.map((format, index) => (
              <Card 
                key={index} 
                className="text-center hover:shadow-md transition-all cursor-pointer group"
              >
                <CardContent className="p-6">
                  <format.icon className="h-8 w-8 mx-auto mb-3 text-muted-foreground group-hover:text-spacecraft transition-colors" />
                  <Badge variant="outline" className="mb-2">
                    {format.name}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{format.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-cosmic flex items-center justify-center shadow-cosmic-glow mx-auto mb-6">
            <Wand2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-4xl font-bold mb-4">Ready to Build Better Decks?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Join thousands of players using DeckMatrix to create competitive decks
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="bg-gradient-cosmic hover:opacity-90">
                <Sparkles className="h-5 w-5 mr-2" />
                Start Building Free
              </Button>
            </Link>
            <Link to="/cards">
              <Button variant="outline" size="lg">
                <Eye className="h-5 w-5 mr-2" />
                Explore Features
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
