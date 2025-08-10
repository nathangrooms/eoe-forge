import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wand2, Sparkles, Target, Zap, Activity, Globe, Cpu, ArrowRight, Package, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative py-24 px-4">
        <div className="container mx-auto text-center relative z-10">
          <div className="flex items-center justify-center mb-6">
            <Wand2 className="h-12 w-12 text-primary animate-pulse mr-4" />
            <h1 className="text-5xl font-bold">
              MTG Deck Builder
            </h1>
          </div>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Build, analyze, and perfect your Magic: The Gathering decks with AI-powered optimization.
            Search every card ever printed and create competitive decks for any format.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Link to="/deck-builder">
              <Button size="lg" className="animate-pulse">
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
            Master Magic: The Gathering
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Wand2 className="h-6 w-6 mr-3 text-primary" />
                  AI Deck Builder
                </CardTitle>
                <CardDescription>
                  Generate optimized decks using advanced algorithms that analyze card synergies,
                  mana curves, and power levels for any format.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-6 w-6 mr-3 text-primary" />
                  Universal Card Search
                </CardTitle>
                <CardDescription>
                  Search through every Magic card ever printed with advanced filters
                  for sets, formats, mechanics, and more.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-6 w-6 mr-3 text-primary" />
                  Deck Analysis
                </CardTitle>
                <CardDescription>
                  Comprehensive deck analysis with mana curve, color distribution,
                  interaction density, and power level assessment.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Package className="h-6 w-6 mr-3 text-primary" />
                  Collection Management
                </CardTitle>
                <CardDescription>
                  Track your card collection with value tracking, completion statistics,
                  and intelligent deck building from owned cards.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-6 w-6 mr-3 text-primary" />
                  Power Level Control
                </CardTitle>
                <CardDescription>
                  Transparent power level control from casual to competitive
                  with explainable suggestions and automatic tuning.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Cpu className="h-6 w-6 mr-3 text-primary" />
                  Format Support
                </CardTitle>
                <CardDescription>
                  Support for all major MTG formats including Standard, Commander,
                  Modern, Legacy, and custom formats with legality checking.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <Card className="group hover:shadow-xl transition-all duration-300">
              <CardHeader className="text-center pb-4">
                <Package className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
                <CardTitle className="text-2xl mb-2">Collection Manager</CardTitle>
                <p className="text-muted-foreground">
                  Track your entire MTG collection with advanced analytics and deck building tools
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

            <Card className="group hover:shadow-xl transition-all duration-300">
              <CardHeader className="text-center pb-4">
                <Wand2 className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
                <CardTitle className="text-2xl mb-2">AI Deck Builder</CardTitle>
                <p className="text-muted-foreground">
                  Build optimized decks with intelligent synergy analysis and power level tuning
                </p>
              </CardHeader>
              <CardContent className="text-center">
                <Link to="/deck-builder">
                  <Button size="lg" className="w-full group-hover:scale-105 transition-transform">
                    <Wand2 className="h-5 w-5 mr-2" />
                    Build Decks
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Formats Overview */}
          <div className="bg-card/50 backdrop-blur-sm rounded-lg p-8 border border-border">
            <h3 className="text-2xl font-bold mb-6 text-center">Supported Formats</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { name: 'Standard', description: 'Current rotation cards', icon: Sparkles },
                { name: 'Commander', description: '100-card singleton format', icon: Target },
                { name: 'Modern', description: 'Non-rotating competitive', icon: Zap },
                { name: 'Legacy', description: 'Eternal format with history', icon: Activity },
                { name: 'Vintage', description: 'Most powerful cards legal', icon: Globe }
              ].map((format, index) => (
                <div key={index} className="text-center p-4 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                  <format.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                  <Badge variant="outline" className="mb-2">
                    {format.name}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{format.description}</p>
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
