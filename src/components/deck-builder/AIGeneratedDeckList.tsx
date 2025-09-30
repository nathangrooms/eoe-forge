import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  LayoutGrid, 
  List, 
  ChevronDown, 
  ChevronRight,
  Crown,
  Swords,
  Shield,
  Scroll,
  Gem,
  Sparkles,
  Mountain,
  Users,
  Skull,
  Save,
  RotateCcw,
  TrendingUp,
  DollarSign,
  Hash
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type ViewMode = 'list' | 'visual';
type Category = 'creatures' | 'lands' | 'instants' | 'sorceries' | 'enchantments' | 'artifacts' | 'planeswalkers' | 'battles';

const CATEGORY_ICONS = {
  creatures: Users,
  lands: Mountain,
  instants: Sparkles,
  sorceries: Scroll,
  enchantments: Gem,
  artifacts: Shield,
  planeswalkers: Swords,
  battles: Skull
};

const CATEGORY_LABELS = {
  creatures: 'Creatures',
  lands: 'Lands',
  instants: 'Instants',
  sorceries: 'Sorceries',
  enchantments: 'Enchantments',
  artifacts: 'Artifacts',
  planeswalkers: 'Planeswalkers',
  battles: 'Battles'
};

const TYPE_COLORS = ['#0088fe', '#00c49f', '#ffbb28', '#ff8042', '#8884d8', '#82ca9d', '#ffc658'];

interface AIGeneratedDeckListProps {
  deckName: string;
  cards: any[];
  commander?: any;
  power?: number;
  totalValue?: number;
  analysis?: any;
  changelog?: any[];
  onSaveDeck: () => void;
  onApplyToDeckBuilder?: () => void;
  onStartOver: () => void;
}

export function AIGeneratedDeckList({ 
  deckName, 
  cards, 
  commander, 
  power, 
  totalValue, 
  analysis,
  changelog,
  onSaveDeck,
  onApplyToDeckBuilder,
  onStartOver 
}: AIGeneratedDeckListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(new Set());

  const toggleCategory = (category: Category) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  // Group cards by category
  const groupedCards = cards.reduce((acc, card) => {
    let category: Category = 'creatures';
    const typeLine = card.type_line?.toLowerCase() || '';
    
    if (typeLine.includes('land')) {
      category = 'lands';
    } else if (typeLine.includes('creature')) {
      category = 'creatures';
    } else if (typeLine.includes('instant')) {
      category = 'instants';
    } else if (typeLine.includes('sorcery')) {
      category = 'sorceries';
    } else if (typeLine.includes('enchantment')) {
      category = 'enchantments';
    } else if (typeLine.includes('artifact')) {
      category = 'artifacts';
    } else if (typeLine.includes('planeswalker')) {
      category = 'planeswalkers';
    } else if (typeLine.includes('battle')) {
      category = 'battles';
    }
    
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(card);
    return acc;
  }, {} as Record<string, any[]>);

  // Calculate deck analysis
  const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
  const nonLands = cards.filter(card => !card.type_line?.toLowerCase().includes('land'));
  const lands = cards.filter(card => card.type_line?.toLowerCase().includes('land'));
  const avgCmc = nonLands.length > 0 
    ? nonLands.reduce((sum, card) => sum + (card.cmc || 0), 0) / nonLands.length 
    : 0;

  // Mana curve data
  const manaCurve = Array.from({ length: 8 }, (_, i) => ({
    cmc: i === 7 ? '7+' : i.toString(),
    count: nonLands.filter(card => {
      const cmc = card.cmc || 0;
      return i === 7 ? cmc >= 7 : cmc === i;
    }).length
  }));

  // Type distribution
  const typeCounts: Record<string, number> = {};
  cards.forEach(card => {
    const type = card.type_line?.toLowerCase() || '';
    let primaryType = 'Other';
    
    if (type.includes('creature')) primaryType = 'Creature';
    else if (type.includes('instant')) primaryType = 'Instant';
    else if (type.includes('sorcery')) primaryType = 'Sorcery';
    else if (type.includes('artifact')) primaryType = 'Artifact';
    else if (type.includes('enchantment')) primaryType = 'Enchantment';
    else if (type.includes('planeswalker')) primaryType = 'Planeswalker';
    else if (type.includes('land')) primaryType = 'Land';
    
    typeCounts[primaryType] = (typeCounts[primaryType] || 0) + 1;
  });

  const typeDistribution = Object.entries(typeCounts).map(([type, count]) => ({
    type,
    count,
    percentage: (count / cards.length) * 100
  }));

  const CategoryCard = ({ category, cards: categoryCards }: { category: Category, cards: any[] }) => {
    const Icon = CATEGORY_ICONS[category] || Users;
    const isExpanded = expandedCategories.has(category);
    const totalCards = categoryCards.reduce((sum, card) => sum + (card.quantity || 1), 0);

    const getCategoryColor = (category: Category) => {
      const colors = {
        creatures: 'border-l-green-500 bg-green-500/10',
        lands: 'border-l-orange-500 bg-orange-500/10', 
        instants: 'border-l-blue-500 bg-blue-500/10',
        sorceries: 'border-l-red-500 bg-red-500/10',
        enchantments: 'border-l-purple-500 bg-purple-500/10',
        artifacts: 'border-l-gray-500 bg-gray-500/10',
        planeswalkers: 'border-l-pink-500 bg-pink-500/10',
        battles: 'border-l-orange-600 bg-orange-600/10'
      };
      return colors[category] || 'border-l-gray-500 bg-gray-500/10';
    };

    return (
      <Card className={`mb-4 border-l-4 ${getCategoryColor(category)}`}>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleCategory(category)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{CATEGORY_LABELS[category]}</CardTitle>
              <Badge variant="secondary">{totalCards}</Badge>
            </div>
          </div>
        </CardHeader>
        
        {isExpanded && (
          <CardContent className="pt-0">
            {viewMode === 'list' ? (
              <div className="space-y-2">
                {categoryCards.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="flex items-center justify-between p-3 bg-muted/30 rounded hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center gap-2 min-w-[60px]">
                        <Badge variant="outline" className="font-mono">
                          {card.quantity || 1}x
                        </Badge>
                      </div>
                      
                      <div className="flex-1">
                        <div className="font-medium">{card.name}</div>
                        <div className="text-sm text-muted-foreground">{card.type_line}</div>
                        {card.reason && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {typeof card.reason === 'string' ? card.reason : 
                             typeof card.reason === 'object' ? card.reason?.reason || 'Added to deck' :
                             'Added to deck'}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {card.cmc !== undefined && (
                          <Badge variant="outline" className="font-mono text-xs">
                            CMC {card.cmc}
                          </Badge>
                        )}
                        {card.prices?.usd && (
                          <Badge variant="outline" className="font-mono text-xs">
                            ${parseFloat(card.prices.usd).toFixed(2)}
                          </Badge>
                        )}
                        {card.colors?.length > 0 && (
                          <div className="flex gap-1">
                            {card.colors.map((color: string) => (
                              <div 
                                key={color}
                                className={`w-3 h-3 rounded-full border ${getColorClass(color)}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {categoryCards.map((card, index) => (
                  <div key={`${card.id}-${index}`} className="relative group">
                    <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                      {card.image_uris?.normal ? (
                        <img 
                          src={card.image_uris.normal} 
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Icon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-background/90 text-foreground border">
                          {card.quantity || 1}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-center">
                      <div className="font-medium text-sm line-clamp-1">{card.name}</div>
                      <div className="text-xs text-muted-foreground">CMC {card.cmc || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Deck Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            {deckName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-primary" />
                <div className="text-2xl font-bold">{Math.round(power || 0)}/10</div>
              </div>
              <div className="text-sm text-muted-foreground">Power Score</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600" />
                <div className="text-2xl font-bold text-green-600">${(totalValue || 0).toFixed(2)}</div>
              </div>
              <div className="text-sm text-muted-foreground">Est. Price</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Hash className="h-4 w-4 text-blue-600" />
                <div className="text-2xl font-bold">{totalCards}</div>
              </div>
              <div className="text-sm text-muted-foreground">Total Cards</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Mountain className="h-4 w-4 text-orange-600" />
                <div className="text-2xl font-bold">{avgCmc.toFixed(1)}</div>
              </div>
              <div className="text-sm text-muted-foreground">Avg CMC</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="cards" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="changelog">Build Log</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="space-y-4">
          {/* View Mode Selector */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Deck List</h2>
              <p className="text-sm text-muted-foreground">{totalCards} cards total</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
              <Button
                variant={viewMode === 'visual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('visual')}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Visual
              </Button>
            </div>
          </div>

          {/* Commander Section */}
          {commander && (
            <Card className="mb-4 border-l-4 border-l-yellow-500 bg-yellow-500/10">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-yellow-600" />
                  <CardTitle className="text-lg">Commander</CardTitle>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">1</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  {commander.image_uris?.normal ? (
                    <img 
                      src={commander.image_uris.normal} 
                      alt={commander.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                      <Crown className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium">{commander.name}</div>
                    <div className="text-sm text-muted-foreground">CMC {commander.cmc || 0}</div>
                    <div className="text-sm text-muted-foreground">{commander.type_line}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Categories */}
          {Object.entries(groupedCards).map(([category, categoryCards]) => (
            <CategoryCard
              key={category}
              category={category as Category}
              cards={categoryCards as any[]}
            />
          ))}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {/* Mana Curve */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mana Curve</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={manaCurve}>
                    <XAxis dataKey="cmc" />
                    <YAxis />
                    <Bar dataKey="count" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Average CMC: {avgCmc.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          {/* Card Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Card Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeDistribution}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ type, percentage }) => `${type} ${percentage.toFixed(0)}%`}
                    >
                      {typeDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Deck Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deck Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Non-lands:</span>
                    <span>{nonLands.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lands:</span>
                    <span>{lands.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Creatures:</span>
                    <span>{cards.filter(c => c.type_line?.toLowerCase().includes('creature')).length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Instants:</span>
                    <span>{cards.filter(c => c.type_line?.toLowerCase().includes('instant')).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sorceries:</span>
                    <span>{cards.filter(c => c.type_line?.toLowerCase().includes('sorcery')).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Others:</span>
                    <span>{cards.filter(c => !['creature', 'instant', 'sorcery', 'land'].some(t => c.type_line?.toLowerCase().includes(t))).length}</span>
                  </div>
                </div>
              </div>

              {analysis && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-3">
              {analysis && analysis.strengths && Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
                      <div>
                        <h4 className="font-medium text-green-600 mb-2">Strengths</h4>
                        <ul className="text-sm space-y-1">
                          {(analysis.strengths as string[]).map((strength: string, index: number) => (
                            <li key={index} className="text-muted-foreground">• {strength}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {analysis && analysis.weaknesses && Array.isArray(analysis.weaknesses) && analysis.weaknesses.length > 0 && (
                      <div>
                        <h4 className="font-medium text-orange-600 mb-2">Areas for Improvement</h4>
                        <ul className="text-sm space-y-1">
                          {analysis.weaknesses.map((weakness: string, index: number) => (
                            <li key={index} className="text-muted-foreground">• {weakness}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis && analysis.suggestions && Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
                      <div>
                        <h4 className="font-medium text-blue-600 mb-2">Suggestions</h4>
                        <ul className="text-sm space-y-1">
                          {analysis.suggestions.map((suggestion: string, index: number) => (
                            <li key={index} className="text-muted-foreground">• {suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changelog" className="space-y-2">
          {changelog && changelog.length > 0 ? (
            changelog.map((change: any, index: number) => (
              <div key={index} className="p-3 bg-muted/30 rounded text-sm">
                {typeof change === 'string' ? change : 
                 typeof change === 'object' && change ? (
                   <div className="flex items-center justify-between">
                     <span>
                       <Badge variant={change.action === 'add' ? 'default' : 'secondary'} className="mr-2">
                         {change.action || 'Action'}
                       </Badge>
                       {change.card || 'Card'} - {change.reason || 'No reason'}
                     </span>
                     <Badge variant="outline" className="text-xs">
                       {change.stage || 'Stage'}
                     </Badge>
                   </div>
                 ) : String(change)}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No build log available
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button onClick={onSaveDeck} className="flex-1">
          <Save className="h-4 w-4 mr-2" />
          Save to My Decks
        </Button>
        {onApplyToDeckBuilder && (
          <Button variant="outline" onClick={onApplyToDeckBuilder} className="flex-1">
            <Swords className="h-4 w-4 mr-2" />
            Open in Deck Builder
          </Button>
        )}
        <Button variant="outline" onClick={onStartOver}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Build Another Deck
        </Button>
      </div>
    </div>
  );
}

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    W: 'bg-yellow-100 border-yellow-300',
    U: 'bg-blue-100 border-blue-300',
    B: 'bg-gray-100 border-gray-300',
    R: 'bg-red-100 border-red-300',
    G: 'bg-green-100 border-green-300'
  };
  return colorMap[color] || 'bg-gray-200 border-gray-300';
}