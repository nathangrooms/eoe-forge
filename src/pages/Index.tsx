import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Rocket, Sparkles, Target, Zap, Activity, Globe, Cpu, ArrowRight, Package } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-24 px-4">
        <div className="absolute inset-0 bg-starfield opacity-30" />
        <div className="container mx-auto text-center relative z-10">
          <div className="flex items-center justify-center mb-6">
            <Rocket className="h-12 w-12 text-primary animate-pulse mr-4" />
            <h1 className="text-5xl font-bold bg-cosmic bg-clip-text text-transparent">
              Edge of Eternities
            </h1>
          </div>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Build, analyze, and perfect your Magic: The Gathering decks with AI-powered optimization
            for the cosmic mechanics of Spacecraft, Stations, Warp, Void, and Planets.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link to="/deck-builder">
              <Button size="lg" className="cosmic-glow animate-glow">
                <Sparkles className="h-5 w-5 mr-2" />
                Start Building
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Link to="/collection">
              <Button variant="outline" size="lg">
                <Package className="h-5 w-5 mr-2" />
                Manage Collection
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Master the <span className="bg-cosmic bg-clip-text text-transparent">Edge of Eternities</span>
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Rocket className="h-6 w-6 mr-3 text-spacecraft" />
                  Spacecraft & Stations
                </CardTitle>
                <CardDescription>
                  Master the art of crewing powerful vehicles and maintaining optimal station density
                  for maximum battlefield control.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-6 w-6 mr-3 text-warp" />
                  Warp Mechanics
                </CardTitle>
                <CardDescription>
                  Harness instant-speed battlefield manipulation with precise timing and
                  enter-the-battlefield synergies.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-6 w-6 mr-3 text-void" />
                  Void Interactions
                </CardTitle>
                <CardDescription>
                  Exploit leaves-the-battlefield triggers and sacrifice outlets for powerful
                  value engines and combo potential.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-6 w-6 mr-3 text-planet" />
                  Planet Lands
                </CardTitle>
                <CardDescription>
                  Build perfect manabases with intelligent planet land suggestions and
                  color requirement analysis.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cpu className="h-6 w-6 mr-3 text-primary" />
                  AI Power Tuning
                </CardTitle>
                <CardDescription>
                  Transparent power level control from casual battlecruiser to competitive
                  cEDH with explainable suggestions.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="cosmic-glow hover:animate-float transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-6 w-6 mr-3 text-accent" />
                  Smart Analysis
                </CardTitle>
                <CardDescription>
                  Comprehensive deck analysis with mana curve, role distribution, and
                  EOE-specific mechanic tracking.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <Card className="group hover:shadow-xl transition-all duration-300 cosmic-glow">
              <CardHeader className="text-center pb-4">
                <Package className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
                <CardTitle className="text-2xl mb-2">Collection Manager</CardTitle>
                <p className="text-muted-foreground">
                  Track your entire MTG collection with advanced analytics and synergy detection
                </p>
              </CardHeader>
              <CardContent className="text-center">
                <Link to="/collection">
                  <Button size="lg" className="w-full group-hover:scale-105 transition-transform">
                    <Package className="h-5 w-5 mr-2" />
                    Manage Collection
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 cosmic-glow">
              <CardHeader className="text-center pb-4">
                <Rocket className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
                <CardTitle className="text-2xl mb-2">AI Deck Builder</CardTitle>
                <p className="text-muted-foreground">
                  Build optimized decks with intelligent synergy analysis and power level tuning
                </p>
              </CardHeader>
              <CardContent className="text-center">
                <Link to="/deck-builder">
                  <Button size="lg" className="w-full group-hover:scale-105 transition-transform">
                    <Rocket className="h-5 w-5 mr-2" />
                    Build Decks
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Mechanics Overview */}
          <div className="bg-card/50 backdrop-blur-sm rounded-lg p-8 border border-border">
            <h3 className="text-2xl font-bold mb-6 text-center">EOE Mechanics at a Glance</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { icon: Rocket, name: 'Spacecraft', color: 'spacecraft', description: 'Crewed vehicles with station synergies' },
                { icon: Cpu, name: 'Station', color: 'station', description: 'Crew power enablers and triggers' },
                { icon: Zap, name: 'Warp', color: 'warp', description: 'Instant battlefield manipulation' },
                { icon: Activity, name: 'Void', color: 'void', description: 'Leaves-battlefield value engines' },
                { icon: Globe, name: 'Planet', color: 'planet', description: 'Special land types with abilities' }
              ].map((mechanic, index) => (
                <div key={index} className="text-center p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                  <mechanic.icon className={`h-8 w-8 mx-auto mb-2 text-${mechanic.color}`} />
                  <Badge variant="outline" className={`text-${mechanic.color} border-${mechanic.color}/30 mb-2`}>
                    {mechanic.name}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{mechanic.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
