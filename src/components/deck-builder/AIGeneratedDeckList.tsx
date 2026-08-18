import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisualDeckView } from '@/components/deck-builder/VisualDeckView';
import { DeckQuickStats } from '@/components/deck-builder/DeckQuickStats';
import { EdhAnalysisPanel, EdhAnalysisData } from '@/components/deck-builder/EdhAnalysisPanel';
import { DeckValidationPanel } from '@/components/deck-builder/DeckValidationPanel';
import { DeckCompatibilityChecker } from '@/components/deck-builder/DeckCompatibilityChecker';
import { PowerLevelConsistency } from '@/components/deck-builder/PowerLevelConsistency';
import { ArchetypeDetection } from '@/components/deck-builder/ArchetypeDetection';
import { DeckBudgetTracker } from '@/components/deck-builder/DeckBudgetTracker';
import { EnhancedDeckAnalysisPanel } from '@/components/deck-builder/EnhancedDeckAnalysis';
import { 
  Crown,
  Save,
  RotateCcw,
  ExternalLink,
  Copy,
  List,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Eye
} from 'lucide-react';
import { showSuccess } from '@/components/ui/toast-helpers';
import { categorizeCard, type CardCategory } from '@/components/deck-builder/deck-categories';

interface AIGeneratedDeckListProps {
  deckName: string;
  cards: any[];
  commander?: any;
  power?: number;
  edhPowerLevel?: number | null;
  edhPowerUrl?: string | null;
  totalValue?: number;
  analysis?: any;
  edhAnalysisData?: EdhAnalysisData | null;
  changelog?: any[];
  onSaveDeck: () => void;
  onStartOver: () => void;
  onRefreshEdhAnalysis?: () => void;
  isLoadingEdhAnalysis?: boolean;
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
  edhAnalysisData,
  changelog,
  onSaveDeck,
  onStartOver,
  onRefreshEdhAnalysis,
  isLoadingEdhAnalysis = false
}: AIGeneratedDeckListProps) {
  const [activeTab, setActiveTab] = useState('cards');

  // Transform cards for VisualDeckView format
  const transformedCards = useMemo(() => {
    return cards.map(card => ({
      id: card.id || `card-${Math.random()}`,
      name: card.name,
      quantity: card.quantity || 1,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      mana_cost: card.mana_cost,
      image_uris: card.image_uris,
      prices: card.prices,
      oracle_text: card.oracle_text
    }));
  }, [cards]);

  // Stats use the shared classifier and count copies, not distinct entries.
  const stats = useMemo(() => {
    const typeCounts: Partial<Record<CardCategory, number>> = {};
    let totalCards = 0;
    let cmcSum = 0;
    let nonLandCopies = 0;

    for (const card of cards) {
      const qty = card.quantity || 1;
      totalCards += qty;
      const category = categorizeCard(card);
      typeCounts[category] = (typeCounts[category] ?? 0) + qty;
      if (category !== 'lands') {
        cmcSum += (card.cmc || 0) * qty;
        nonLandCopies += qty;
      }
    }

    const value = totalValue || cards.reduce((sum, card) => {
      const price = parseFloat(card.prices?.usd || '0');
      return sum + (price * (card.quantity || 1));
    }, 0);

    return {
      totalCards,
      typeCounts,
      avgCmc: nonLandCopies > 0 ? cmcSum / nonLandCopies : 0,
      totalValue: value
    };
  }, [cards, totalValue]);


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
  const totalWithCommander = stats.totalCards + (commander ? 1 : 0);
  const isValidCount = totalWithCommander === 100;

  // Get commander colors for display
  const commanderColors = commander?.color_identity || commander?.colors || [];

  return (
    <div className="space-y-6">
      {/* Action Bar - At Top */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {commander && commander.image_uris?.art_crop && (
                <img 
                  src={commander.image_uris.art_crop}
                  alt={commander.name}
                  className="w-12 h-12 rounded-lg object-cover border border-border"
                />
              )}
              <div>
                <h2 className="font-bold text-lg">{deckName}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{totalWithCommander} cards</span>
                  {isValidCount ? (
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {totalWithCommander}/100
                    </Badge>
                  )}
                  {commander && (
                    <Badge variant="outline">
                      <Crown className="h-3 w-3 mr-1 text-type-commander" />
                      {commander.name.split(',')[0]}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onSaveDeck} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save Deck
              </Button>
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
              <Button onClick={onStartOver} variant="ghost" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DeckQuickStats - Matches Deck Builder Page */}
      <DeckQuickStats
        totalCards={stats.totalCards}
        typeCounts={stats.typeCounts}
        avgCmc={stats.avgCmc}
        totalValue={stats.totalValue}
        edhPowerLevel={edhPowerLevel}
        edhMetrics={analysis?.edhMetrics || null}
        edhPowerUrl={edhUrl}
        format="commander"
        commanderName={commander?.name}
        colors={commanderColors}
        ownedPct={null}
        missingCards={null}
      />

      {/* Tabs for content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cards" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Cards
            <Badge variant="secondary" className="ml-1 text-xs">
              {stats.totalCards}
            </Badge>
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
          {/* EDH Power Level Analysis Panel - Same as DeckBuilder */}
          <EdhAnalysisPanel 
            data={edhAnalysisData || null}
            isLoading={isLoadingEdhAnalysis}
            needsRefresh={!edhAnalysisData}
            onRefresh={onRefreshEdhAnalysis || (() => {})}
          />

          {/* Deck Compatibility Checker */}
          {commander && (
            <DeckCompatibilityChecker 
              cards={transformedCards as any}
              commander={commander}
              format="commander"
              onRemoveCard={() => {}}
            />
          )}

          {/* Deck Validation Panel */}
          <DeckValidationPanel 
            cards={transformedCards as any}
            format="commander"
            commander={commander}
          />

          {/*
            CommanderPowerDisplay was fed sub-scores derived as
            powerLevel * 0.9 / 1.1 / 0.8 / 1.2 — invented numbers labelled
            speed, interaction, resilience and combo potential. Removed; the
            real per-axis figures come from EdhAnalysisPanel above.
          */}

          {/* Power Level Consistency */}
          <PowerLevelConsistency 
            deckCards={transformedCards as any}
            commander={commander}
            format="commander"
          />

          {/* Archetype Detection */}
          <ArchetypeDetection 
            deckCards={transformedCards as any}
            commander={commander}
            format="commander"
          />

          {/* Budget Tracker */}
          <DeckBudgetTracker 
            deckCards={transformedCards as any}
            targetBudget={totalValue || 200}
          />

          {/* Enhanced Deck Analysis */}
          <EnhancedDeckAnalysisPanel 
            deck={transformedCards as any}
            format="commander"
            commander={commander}
            deckName={deckName}
          />

          {/* Strategy Summary */}
          {analysis?.strategy && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Crown className="h-5 w-5 text-type-commander" />
                  Deck Strategy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{analysis.strategy}</p>
              </CardContent>
            </Card>
          )}
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

              {/* Builder Feedback if available */}
              {analysis?.aiFeedback && (
                <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Crown className="h-4 w-4 text-primary" />
                    Analysis
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
