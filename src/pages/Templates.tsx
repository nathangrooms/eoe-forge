import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { AITemplateRecommendations } from '@/components/templates/AITemplateRecommendations';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ManaSymbols } from '@/components/ui/mana-symbols';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Crown, 
  Zap, 
  Shield, 
  Users, 
  Target,
  Plus,
  Star,
  TrendingUp,
  Filter
} from 'lucide-react';

const templates = [
  {
    id: 1,
    name: "Azorius Control",
    description: "Classic control deck with counterspells and board wipes",
    format: "Standard",
    colors: ["W", "U"],
    power: 7.5,
    popularity: 89,
    winRate: 62,
    cardCount: 75,
    lastUpdated: "2 days ago",
    tags: ["Control", "Counterspells", "Midrange"],
    featured: true
  },
  {
    id: 2,
    name: "Gruul Aggro",
    description: "Fast red-green deck focusing on early pressure",
    format: "Standard",
    colors: ["R", "G"],
    power: 8.2,
    popularity: 76,
    winRate: 58,
    cardCount: 75,
    lastUpdated: "1 week ago",
    tags: ["Aggro", "Creatures", "Burn"],
    featured: false
  },
  {
    id: 3,
    name: "Mono-Black Devotion",
    description: "Powerful black deck with devotion synergies",
    format: "Pioneer",
    colors: ["B"],
    power: 8.7,
    popularity: 45,
    winRate: 65,
    cardCount: 75,
    lastUpdated: "3 days ago",
    tags: ["Devotion", "Midrange", "Value"],
    featured: true
  },
  {
    id: 4,
    name: "Simic Ramp",
    description: "Ramp into big threats with blue-green package",
    format: "Commander",
    colors: ["U", "G"],
    power: 6.8,
    popularity: 92,
    winRate: 55,
    cardCount: 100,
    lastUpdated: "5 days ago",
    tags: ["Ramp", "Big Mana", "Creatures"],
    featured: false
  },
  {
    id: 5,
    name: "Burn",
    description: "Direct damage deck aiming for quick wins",
    format: "Modern",
    colors: ["R"],
    power: 7.9,
    popularity: 85,
    winRate: 59,
    cardCount: 75,
    lastUpdated: "1 day ago",
    tags: ["Aggro", "Burn", "Fast"],
    featured: true
  },
  {
    id: 6,
    name: "Esper Midrange",
    description: "Three-color midrange with premium removal",
    format: "Standard",
    colors: ["W", "U", "B"],
    power: 8.1,
    popularity: 67,
    winRate: 61,
    cardCount: 75,
    lastUpdated: "4 days ago",
    tags: ["Midrange", "Removal", "Value"],
    featured: false
  }
];

export default function Templates() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [userDecks, setUserDecks] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadUserDecks();
    }
  }, [user]);

  const loadUserDecks = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_decks')
        .select('name, format, colors')
        .eq('user_id', user.id)
        .limit(10);

      if (!error && data) {
        setUserDecks(data);
      }
    } catch (error) {
      console.error('Error loading user decks:', error);
    }
  };

  const handleUseTemplate = (template: any) => {
    showSuccess("Template Selected", `Building deck from ${template.name} template`);
    // Implement template usage
  };
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <StandardSectionHeader
          title="Deck Templates"
          description="Start with proven archetypes and customize to your playstyle"
        />

        {/* AI Template Recommendations */}
        <div className="mb-6">
          <AITemplateRecommendations 
            selectedFormat={selectedFormat !== 'all' ? selectedFormat : undefined}
            userDecks={userDecks}
          />
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search templates by name, strategy, or cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 pl-10 pr-4 py-2 border border-input bg-background rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">All Formats</Button>
            <Button variant="outline" size="sm">Standard</Button>
            <Button variant="outline" size="sm">Modern</Button>
            <Button variant="outline" size="sm">Commander</Button>
            <Button variant="outline" size="sm">Pioneer</Button>
            <Button variant="outline" size="sm">Legacy</Button>
          </div>
        </div>

        {/* Featured Templates */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Star className="h-5 w-5 mr-2 text-yellow-500" />
            Featured Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.filter(t => t.featured).map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-all duration-200 border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </p>
                    </div>
                    <ManaSymbols colors={template.colors} size="sm" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-sm font-medium">{template.power}/10</div>
                      <div className="text-xs text-muted-foreground">Power</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{template.winRate}%</div>
                      <div className="text-xs text-muted-foreground">Win Rate</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{template.popularity}%</div>
                      <div className="text-xs text-muted-foreground">Popularity</div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Format and Cards */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{template.format}</span>
                    <span>{template.cardCount} cards</span>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-2">
                    <Button className="flex-1" onClick={() => handleUseTemplate(template)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Use Template
                    </Button>
                    <Button variant="outline" size="sm">
                      Preview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* All Templates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">All Templates</h2>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <span>Sort by:</span>
              <select className="border border-input bg-background rounded px-2 py-1">
                <option>Popularity</option>
                <option>Win Rate</option>
                <option>Power Level</option>
                <option>Recently Updated</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{template.name}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1">
                        {template.format}
                      </Badge>
                    </div>
                    <ManaSymbols colors={template.colors} size="sm" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1">
                      <Crown className="h-3 w-3" />
                      <span>{template.power}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>{template.winRate}%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-3 w-3" />
                      <span>{template.popularity}%</span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <Button size="sm" className="flex-1" onClick={() => handleUseTemplate(template)}>
                      Use
                    </Button>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}