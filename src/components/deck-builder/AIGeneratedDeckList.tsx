import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisualDeckView } from '@/components/deck-builder/VisualDeckView';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { 
  Crown,
  Save,
  RotateCcw,
  Download,
  ExternalLink,
  Copy,
  FolderOpen,
  TrendingUp,
  DollarSign,
  Hash,
  BarChart3,
  List,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { showSuccess } from '@/components/ui/toast-helpers';

const TYPE_COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#64748b', '#ec4899', '#14b8a6'];

interface AIGeneratedDeckListProps {
  deckName: string;
  cards: any[];
  commander?: any;
  power?: number;
  edhPowerLevel?: number | null;
  edhPowerUrl?: string | null;
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
  edhPowerLevel,
  edhPowerUrl,
  totalValue, 
  analysis,
  changelog,
  onSaveDeck,
  onApplyToDeckBuilder,
  onStartOver 
}: AIGeneratedDeckListProps) {
  const [activeTab, setActiveTab] = useState('cards');
  const [isListView, setIsListView] = useState(false);

  // Transform cards for VisualDeckView format
  const transformedCards = useMemo(() => {
    return cards.map(card => ({
      id: card.id || `card-${Math.random()}`,
      name: card.name,
      quantity: card.quantity || 1,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      mana_cost: card.mana_cost,
      image_uris: card.image_uris,
      prices: card.prices,
      oracle_text: card.oracle_text
    }));
  }, [cards]);

  // Calculate stats
  const totalCards = cards.reduce((sum, card) => sum + (card.quantity || 1), 0);
  const nonLands = cards.filter(card => !card.type_line?.toLowerCase().includes('land'));
  const lands = cards.filter(card => card.type_line?.toLowerCase().includes('land'));
  const avgCmc = nonLands.length > 0 
    ? nonLands.reduce((sum, card) => sum + (card.cmc || 0), 0) / nonLands.length 
    : 0;

  // Mana curve data
  const manaCurve = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      cmc: i === 7 ? '7+' : i.toString(),
      count: nonLands.filter(card => {
        const cmc = card.cmc || 0;
        return i === 7 ? cmc >= 7 : cmc === i;
      }).length
    }));
  }, [nonLands]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
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
      counts[primaryType] = (counts[primaryType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      type,
      count,
      percentage: cards.length > 0 ? (count / cards.length) * 100 : 0
    }));
  }, [cards]);

  // Generate decklist text
  const generateDecklistText = () => {
    let text = '';
    if (commander) {
      text += `1 ${commander.name} *CMDR*\n\n`;
    }
    
    const grouped = cards.reduce((acc, card) => {
      const type = card.type_line?.split('—')[0].trim() || 'Other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(card);
      return acc;
    }, {} as Record<string, any[]>);
    
    for (const [type, typeCards] of Object.entries(grouped)) {
      text += `// ${type}\n`;
      for (const card of typeCards as any[]) {
        text += `${card.quantity || 1} ${card.name}\n`;
      }
      text += '\n';
    }
    return text;
  };

  const copyDecklist = () => {
    navigator.clipboard.writeText(generateDecklistText());
    showSuccess('Decklist Copied', 'Decklist has been copied to clipboard');
  };

  const edhUrl = edhPowerUrl || (() => {
    let decklistParam = '';
    if (commander) decklistParam += `1x+${encodeURIComponent(commander.name)}~`;
    cards.forEach(card => {
      const qty = card.quantity || 1;
      decklistParam += `${qty}x+${encodeURIComponent(card.name)}~`;
    });
    if (decklistParam.endsWith('~')) decklistParam = decklistParam.slice(0, -1);
    return `https://edhpowerlevel.com/?d=${decklistParam}`;
  })();

  // Check if deck meets requirements
  const totalWithCommander = totalCards + (commander ? 1 : 0);
  const isValidCount = totalWithCommander === 100;

  return (
    <div className="space-y-6">
      {/* Action Bar - At Top */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
                <Crown className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h2 className="font-bold text-lg">{deckName}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{totalWithCommander} cards</span>
                  {isValidCount ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {totalWithCommander}/100
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={copyDecklist} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copy List
              </Button>
              {edhUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={edhUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    EDH Power
                  </a>
                </Button>
              )}
              <Button onClick={onApplyToDeckBuilder} variant="outline" size="sm">
                <FolderOpen className="h-4 w-4 mr-2" />
                Open in Deck Builder
              </Button>
              <Button onClick={onSaveDeck} size="sm" className="bg-gradient-to-r from-primary to-accent">
                <Save className="h-4 w-4 mr-2" />
                Save Deck
              </Button>
              <Button onClick={onStartOver} variant="ghost" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="py-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{Math.round(power || 0)}/10</div>
            <div className="text-xs text-muted-foreground">AI Power</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="py-4 text-center">
            <ExternalLink className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <div className="text-2xl font-bold text-blue-500">
              {edhPowerLevel != null ? `${edhPowerLevel.toFixed(1)}` : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground">EDH Power</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="py-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <div className="text-2xl font-bold text-green-500">${(totalValue || 0).toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">Est. Price</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="py-4 text-center">
            <Hash className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <div className="text-2xl font-bold">{avgCmc.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Avg CMC</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="py-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto mb-1 text-purple-500" />
            <div className="text-2xl font-bold">{lands.length}</div>
            <div className="text-xs text-muted-foreground">Lands</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cards" className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Cards
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analysis
          </TabsTrigger>
          <TabsTrigger value="log" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Build Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-6">
          {/* Use VisualDeckView - same as deck builder */}
          <VisualDeckView
            cards={transformedCards}
            commander={commander}
            format="commander"
          />
        </TabsContent>

        <TabsContent value="analysis" className="mt-6 space-y-6">
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
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Type Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeDistribution}
                        dataKey="count"
                        nameKey="type"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={({ type, percentage }) => `${type}: ${percentage.toFixed(0)}%`}
                        labelLine={false}
                      >
                        {typeDistribution.map((_, index) => (
                          <Cell key={index} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {typeDistribution.map((item, index) => (
                    <div key={item.type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: TYPE_COLORS[index % TYPE_COLORS.length] }}
                        />
                        <span className="text-sm">{item.type}</span>
                      </div>
                      <span className="text-sm font-medium">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Build Log</CardTitle>
            </CardHeader>
            <CardContent>
              {changelog && changelog.length > 0 ? (
                <div className="space-y-2">
                  {changelog.map((entry, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 text-sm">
                        {typeof entry === 'string' ? entry : JSON.stringify(entry)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No build log available</p>
              )}

              {/* AI Feedback if available */}
              {analysis?.aiFeedback && (
                <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    AI Analysis
                  </h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {analysis.aiFeedback}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getColorClass(color: string) {
  const colors: Record<string, string> = {
    'W': 'bg-amber-100 border-amber-300',
    'U': 'bg-blue-500 border-blue-600',
    'B': 'bg-gray-800 border-gray-900',
    'R': 'bg-red-500 border-red-600',
    'G': 'bg-green-500 border-green-600'
  };
  return colors[color] || 'bg-gray-300 border-gray-400';
}
