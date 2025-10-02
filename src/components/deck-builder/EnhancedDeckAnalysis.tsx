// Enhanced Deck Analysis Panel with Advanced Magic Mechanics
// Integrates mana curve, land base, synergy, and format validation

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  TrendingUp, 
  Zap, 
  Target, 
  Brain, 
  MapPin, 
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Sparkles
} from 'lucide-react';
import { ManaCurveAnalyzer } from '@/lib/magic/mana-curve';
import { LandBaseCalculator } from '@/lib/magic/land-base';
import { SynergyEngine } from '@/lib/magic/synergy';
import { FormatValidator, ALL_FORMATS } from '@/lib/magic/formats';
import { Card as DeckCard } from '@/stores/deckStore';
import { AIAnalysisPanel } from './AIAnalysisPanel';
import { AIVisualDisplay, type VisualData } from '@/components/shared/AIVisualDisplay';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';
import { CardRecommendationDisplay, type CardData } from '@/components/shared/CardRecommendationDisplay';
import { toast } from 'sonner';

interface EnhancedDeckAnalysisPanelProps {
  deck: DeckCard[];
  format: string;
  commander?: DeckCard;
  deckId?: string;
  deckName?: string;
}

const COLORS = {
  primary: '#8884d8',
  secondary: '#82ca9d', 
  accent: '#ffc658',
  warning: '#ff7c7c',
  success: '#87d068',
  muted: '#d084d0'
};

export function EnhancedDeckAnalysisPanel({ deck, format, commander, deckId, deckName }: EnhancedDeckAnalysisPanelProps) {
  const [aiAnalysisFocus, setAiAnalysisFocus] = useState<string | null>(null);
  const [inlineAI, setInlineAI] = useState<{ text: string; cards: CardData[]; visualData?: VisualData }>({ text: '', cards: [] });
  const [inlineLoading, setInlineLoading] = useState(false);

  const analysis = useMemo(() => {
    // Convert deck format for analysis libraries
    const analysisCards = deck.map(card => ({
      ...card,
      oracle_id: card.id,
      set_code: card.set || 'UNK',
      is_legendary: card.type_line?.toLowerCase().includes('legendary') || false,
      colors: card.colors || [],
      color_identity: card.color_identity || [],
      keywords: card.keywords || [],
      legalities: { [format]: 'legal' as const },
      rarity: 'common' as const,
      quantity: card.quantity || 1
    }));

    const formatObj = ALL_FORMATS[format];
    if (!formatObj) {
      console.warn(`Unknown format: ${format}`);
    }

    return {
      manaCurve: ManaCurveAnalyzer.analyze(analysisCards, format),
      landBase: LandBaseCalculator.calculate(analysisCards, format, 'optimal'),
      synergy: SynergyEngine.analyze(analysisCards, format),
      formatValidation: formatObj ? FormatValidator.validateDeck(formatObj, analysisCards.map(c => ({
        name: c.name,
        quantity: c.quantity || 1,
        isBasicLand: c.type_line?.toLowerCase().includes('basic land') || false
      }))) : { isValid: false, errors: ['Unknown format'], warnings: [] }
    };
  }, [deck, format]);

const optimizations = useMemo(() => {
    return ManaCurveAnalyzer.generateOptimizationSuggestions(analysis.manaCurve);
  }, [analysis.manaCurve]);

  useEffect(() => {
    if (!aiAnalysisFocus || !deckId || !deckName) return;
    setInlineLoading(true);
    setInlineAI({ text: '', cards: [] });
    const promptMap: Record<string, string> = {
      curve: "Analyze my deck's mana curve. Show a bar chart of CMC distribution if relevant. Call out curve issues and concrete card swaps. Finish with: Referenced Cards: ...",
      lands: "Analyze my deck's mana base and color sources. Use a pie chart for color distribution if helpful. Recommend specific lands and counts. Finish with: Referenced Cards: ...",
      synergy: "Analyze synergies and combos in my deck. Use a table to compare synergy pieces if relevant. Identify missing pieces. Finish with: Referenced Cards: ...",
      validation: "Check format legality issues. Use a table to organize illegal cards and their replacements. Finish with: Referenced Cards: ...",
      suggestions: "Provide top 5 targeted improvements. Use a table comparing current vs upgrade cards (Card, Current, Upgrade, Cost, Benefit). Finish with: Referenced Cards: ...",
    };
    const message = promptMap[aiAnalysisFocus] || 'Provide analysis.';
    
    // Include actual deck cards for AI analysis
    const deckCards = deck.map(card => ({
      name: card.name,
      mana_cost: card.mana_cost,
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors,
      quantity: card.quantity || 1
    }));
    
    // Provide curve bins and mana sources to enable auto-generated visuals server-side
    const curveBins = analysis.manaCurve.curve.reduce((acc: Record<string, number>, p) => {
      const key = p.cmc === 99 ? '10+' : String(p.cmc);
      acc[key] = (acc[key] || 0) + (p.count || 0);
      return acc;
    }, {} as Record<string, number>);
    const manaSources = {
      W: analysis.landBase?.statistics?.totalSources?.W || 0,
      U: analysis.landBase?.statistics?.totalSources?.U || 0,
      B: analysis.landBase?.statistics?.totalSources?.B || 0,
      R: analysis.landBase?.statistics?.totalSources?.R || 0,
      G: analysis.landBase?.statistics?.totalSources?.G || 0,
      C: analysis.landBase?.statistics?.totalSources?.C || 0,
    };
    
    supabase.functions.invoke('mtg-brain', {
      body: {
        message,
        deckContext: { 
          id: deckId, 
          name: deckName, 
          format, 
          commander: commander ? { name: commander.name, type_line: commander.type_line, colors: commander.colors } : undefined,
          cards: deckCards,
          counts: { total: deck.length + (commander ? 1 : 0) },
          curve: curveBins,
          mana: { sources: manaSources }
        },
        responseStyle: 'concise'
      }
    }).then(({ data, error }) => {
      if (error || data?.error) {
        toast.error(error?.message || data?.error || 'AI analysis failed');
        return;
      }
      setInlineAI({ 
        text: data.message || '', 
        cards: data.cards || [],
        visualData: data.visualData || undefined
      });
    }).finally(() => setInlineLoading(false));
  }, [aiAnalysisFocus, deckId, deckName, format, deck.length, commander]);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-sm text-muted-foreground">Mana Curve</div>
                <div className="text-lg font-bold">
                  {analysis.manaCurve.optimality.score.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Avg CMC: {analysis.manaCurve.averageCMC.toFixed(1)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-sm text-muted-foreground">Land Base</div>
                <div className="text-lg font-bold">{analysis.landBase.totalLands}</div>
                <div className="text-xs text-muted-foreground">
                  {analysis.landBase.colorRequirements.length} colors
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-sm text-muted-foreground">Synergy Score</div>
                <div className="text-lg font-bold">{analysis.synergy.totalSynergyScore}</div>
                <div className="text-xs text-muted-foreground">
                  {analysis.synergy.archetypeMatches[0]?.name || 'Unknown'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-sm text-muted-foreground">Format Legal</div>
                <div className="text-lg font-bold">
                  {analysis.formatValidation.isValid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {analysis.formatValidation.errors.length} issues
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="curve" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="curve">Mana Curve</TabsTrigger>
          <TabsTrigger value="lands">Land Base</TabsTrigger>
          <TabsTrigger value="synergy">Synergy</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="ai" className="bg-gradient-cosmic text-white border-spacecraft data-[state=active]:bg-gradient-cosmic">
            <span className="flex items-center gap-1">
              <Brain className="h-4 w-4" />
              AI Analysis
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Mana Curve Tab */}
        <TabsContent value="curve" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Mana Curve Analysis
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiAnalysisFocus('curve')}
                >
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysisFocus === 'curve' && (
                <div className="mb-4 p-3 border rounded bg-muted/30">
                  {inlineLoading ? (
                    <div className="text-sm text-muted-foreground">AI analyzing...</div>
                  ) : inlineAI.text ? (
                    <div className="space-y-3">
                      <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                            <span className="text-xs font-bold text-white">DM</span>
                          </div>
                          <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                        </div>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{inlineAI.text}</ReactMarkdown>
                        </div>
                      </div>
                       {inlineAI.cards?.length > 0 && (
                        <CardRecommendationDisplay cards={inlineAI.cards} compact />
                      )}
                      {inlineAI.visualData && (
                        <AIVisualDisplay data={inlineAI.visualData} compact />
                      )}
                    </div>
                  ) : null}
                </div>
              )}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mana Curve Chart */}
                <div>
                  <h4 className="font-medium mb-3">Current vs Ideal Curve</h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.manaCurve.curve}>
                        <XAxis dataKey="cmc" />
                        <YAxis />
                        <Bar dataKey="percentage" fill={COLORS.primary} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Distribution Breakdown */}
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-3">Game Phase Distribution</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Early Game (0-2 CMC)</span>
                          <span>{analysis.manaCurve.distribution.earlyGame.toFixed(1)}%</span>
                        </div>
                        <Progress value={analysis.manaCurve.distribution.earlyGame} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Mid Game (3-5 CMC)</span>
                          <span>{analysis.manaCurve.distribution.midGame.toFixed(1)}%</span>
                        </div>
                        <Progress value={analysis.manaCurve.distribution.midGame} />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Late Game (6+ CMC)</span>
                          <span>{analysis.manaCurve.distribution.lateGame.toFixed(1)}%</span>
                        </div>
                        <Progress value={analysis.manaCurve.distribution.lateGame} />
                      </div>
                    </div>
                  </div>

                  {/* Curve Issues */}
                  {analysis.manaCurve.optimality.issues.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1 text-orange-500" />
                        Issues
                      </h4>
                      <div className="space-y-1">
                        {analysis.manaCurve.optimality.issues.slice(0, 3).map((issue, index) => (
                          <div key={index} className="text-sm text-muted-foreground flex items-start">
                            <div className="w-1 h-1 bg-orange-500 rounded-full mt-2 mr-2 flex-shrink-0" />
                            {issue}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Land Base Tab */}
        <TabsContent value="lands" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Mana Base Analysis
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiAnalysisFocus('lands')}
                >
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysisFocus === 'lands' && (
                <div className="mb-4 p-3 border rounded bg-muted/30">
                  {inlineLoading ? (
                    <div className="text-sm text-muted-foreground">AI analyzing...</div>
                  ) : inlineAI.text ? (
                    <div className="space-y-3">
                      <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                            <span className="text-xs font-bold text-white">DM</span>
                          </div>
                          <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                        </div>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{inlineAI.text}</ReactMarkdown>
                        </div>
                      </div>
                      {inlineAI.cards?.length > 0 && (
                        <CardRecommendationDisplay cards={inlineAI.cards} compact />
                      )}
                      {inlineAI.visualData && (
                        <AIVisualDisplay data={inlineAI.visualData} compact />
                      )}
                    </div>
                  ) : null}
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Color Requirements */}
                <div>
                  <h4 className="font-medium mb-3">Color Requirements</h4>
                  <div className="space-y-3">
                    {analysis.landBase.colorRequirements.map((req, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ 
                              backgroundColor: 
                                req.color === 'W' ? '#FFFBD5' :
                                req.color === 'U' ? '#0E68AB' :
                                req.color === 'B' ? '#150B00' :
                                req.color === 'R' ? '#D3202A' :
                                req.color === 'G' ? '#00733E' : '#d4af37'
                            }}
                          />
                          <span className="font-medium">{req.color}</span>
                          <Badge variant="outline">
                            {req.intensity === 1 ? 'Splash' : 
                             req.intensity === 2 ? 'Secondary' : 'Primary'}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {req.sources} sources needed
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Land Recommendations */}
                <div>
                  <h4 className="font-medium mb-3">Recommended Lands</h4>
                  <div className="space-y-2">
                    {analysis.landBase.recommendations.slice(0, 5).map((rec, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <div className="font-medium text-sm">{rec.name}</div>
                          <div className="text-xs text-muted-foreground">{rec.reason}</div>
                        </div>
                        <Badge variant={rec.entersTapped ? "secondary" : "default"}>
                          {rec.quantity}x
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color Consistency */}
              <Separator className="my-6" />
              <div>
                <h4 className="font-medium mb-3">Color Consistency</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {Object.entries(analysis.landBase.statistics.colorConsistency).map(([color, percentage]) => (
                    <div key={color} className="text-center">
                      <div className="text-2xl font-bold">{percentage.toFixed(0)}%</div>
                      <div className="text-sm text-muted-foreground">{color}</div>
                      <Progress value={percentage} className="mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Synergy Tab */}
        <TabsContent value="synergy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Brain className="h-5 w-5 mr-2" />
                  Synergy Analysis
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiAnalysisFocus('synergy')}
                >
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysisFocus === 'synergy' && (
                <div className="mb-4 p-3 border rounded bg-muted/30">
                  {inlineLoading ? (
                    <div className="text-sm text-muted-foreground">AI analyzing...</div>
                  ) : inlineAI.text ? (
                    <div className="space-y-3">
                      <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                            <span className="text-xs font-bold text-white">DM</span>
                          </div>
                          <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                        </div>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{inlineAI.text}</ReactMarkdown>
                        </div>
                      </div>
                      {inlineAI.cards?.length > 0 && (
                        <CardRecommendationDisplay cards={inlineAI.cards} compact />
                      )}
                      {inlineAI.visualData && (
                        <AIVisualDisplay data={inlineAI.visualData} compact />
                      )}
                    </div>
                  ) : null}
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Archetype Matches */}
                <div>
                  <h4 className="font-medium mb-3">Archetype Matches</h4>
                  <div className="space-y-3">
                    {analysis.synergy.archetypeMatches.slice(0, 4).map((match, index) => (
                      <div key={index} className="p-3 border rounded">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{match.name}</div>
                          <Badge variant={match.confidence > 70 ? "default" : "secondary"}>
                            {match.confidence.toFixed(0)}%
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {match.description}
                        </div>
                        <Progress value={match.confidence} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mechanic Clusters */}
                <div>
                  <h4 className="font-medium mb-3">Mechanic Clusters</h4>
                  <div className="space-y-2">
                    {analysis.synergy.mechanicClusters.slice(0, 5).map((cluster, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <div className="font-medium text-sm capitalize">{cluster.mechanic}</div>
                          <div className="text-xs text-muted-foreground">
                            {cluster.cards.length} cards ({cluster.coverage.toFixed(1)}%)
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{cluster.potential.toFixed(0)}%</div>
                          <div className="text-xs text-muted-foreground">potential</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top Synergies */}
              <Separator className="my-6" />
              <div>
                <h4 className="font-medium mb-3">Strongest Synergies</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.synergy.strongestSynergies.slice(0, 6).map((synergy, index) => (
                    <div key={index} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {synergy.synergyType}
                        </Badge>
                        <div className="text-sm font-medium">
                          {synergy.strength}/10
                        </div>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">{synergy.cardA}</span>
                        <span className="text-muted-foreground"> + </span>
                        <span className="font-medium">{synergy.cardB}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {synergy.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Format Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Format Validation
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiAnalysisFocus('validation')}
                >
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysisFocus === 'validation' && (
                <div className="mb-4 p-3 border rounded bg-muted/30">
                  {inlineLoading ? (
                    <div className="text-sm text-muted-foreground">AI analyzing...</div>
                  ) : inlineAI.text ? (
                    <div className="space-y-3">
                      <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                            <span className="text-xs font-bold text-white">DM</span>
                          </div>
                          <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                        </div>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{inlineAI.text}</ReactMarkdown>
                        </div>
                      </div>
                      {inlineAI.cards?.length > 0 && (
                        <CardRecommendationDisplay cards={inlineAI.cards} compact />
                      )}
                      {inlineAI.visualData && (
                        <AIVisualDisplay data={inlineAI.visualData} compact />
                      )}
                    </div>
                  ) : null}
                </div>
              )}
              <div className="space-y-4">
                {/* Overall Status */}
                <div className="flex items-center space-x-2 p-4 border rounded">
                  {analysis.formatValidation.isValid ? (
                    <>
                      <CheckCircle className="h-6 w-6 text-green-500" />
                      <div>
                        <div className="font-medium text-green-700">Format Legal</div>
                        <div className="text-sm text-muted-foreground">
                          Your deck is legal for {format} format
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                      <div>
                        <div className="font-medium text-red-700">Format Issues Found</div>
                        <div className="text-sm text-muted-foreground">
                          {analysis.formatValidation.errors.length} errors need to be fixed
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Errors */}
                {analysis.formatValidation.errors.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center text-red-700">
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Errors
                    </h4>
                    <div className="space-y-2">
                      {analysis.formatValidation.errors.map((error, index) => (
                        <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                          <div className="text-sm text-red-800">{error}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {analysis.formatValidation.warnings.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center text-orange-700">
                      <Info className="h-4 w-4 mr-1" />
                      Warnings
                    </h4>
                    <div className="space-y-2">
                      {analysis.formatValidation.warnings.map((warning, index) => (
                        <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded">
                          <div className="text-sm text-orange-800">{warning}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Lightbulb className="h-5 w-5 mr-2" />
                  Improvement Suggestions
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAiAnalysisFocus('suggestions')}
                >
                  <Sparkles className="h-4 w-4" />
                  AI Analysis
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysisFocus === 'suggestions' && (
                <div className="mb-4 p-3 border rounded bg-muted/30">
                  {inlineLoading ? (
                    <div className="text-sm text-muted-foreground">AI analyzing...</div>
                  ) : inlineAI.text ? (
                    <div className="space-y-3">
                      <div className="border-l-4 border-spacecraft/50 pl-4 bg-spacecraft/5 rounded-r-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded bg-gradient-cosmic flex items-center justify-center">
                            <span className="text-xs font-bold text-white">DM</span>
                          </div>
                          <span className="text-xs font-bold text-spacecraft">DECKMATRIX ANALYSIS</span>
                        </div>
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{inlineAI.text}</ReactMarkdown>
                        </div>
                      </div>
                      {inlineAI.cards?.length > 0 && (
                        <CardRecommendationDisplay cards={inlineAI.cards} compact />
                      )}
                      {inlineAI.visualData && (
                        <AIVisualDisplay data={inlineAI.visualData} compact />
                      )}
                    </div>
                  ) : null}
                </div>
              )}
              <div className="space-y-6">
                {/* Mana Curve Optimization */}
                {optimizations.swapSuggestions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Mana Curve Optimization</h4>
                    <div className="space-y-2">
                      {optimizations.swapSuggestions.slice(0, 3).map((suggestion, index) => (
                        <div key={index} className="p-3 border rounded">
                          <div className="text-sm font-medium mb-1">{suggestion.reason}</div>
                          <div className="text-sm text-muted-foreground">
                            Remove {suggestion.remove.count} cards at {suggestion.remove.cmc} CMC, 
                            add {suggestion.add.count} cards at {suggestion.add.cmc} CMC
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Synergy Improvements */}
                {analysis.synergy.improvementSuggestions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Synergy Improvements</h4>
                    <div className="space-y-2">
                      {analysis.synergy.improvementSuggestions.slice(0, 3).map((suggestion, index) => (
                        <div key={index} className="p-3 border rounded">
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant={
                              suggestion.type === 'add' ? 'default' :
                              suggestion.type === 'remove' ? 'destructive' : 'secondary'
                            }>
                              {suggestion.type}
                            </Badge>
                            <div className="text-sm font-medium">Priority: {suggestion.priority}/10</div>
                          </div>
                          <div className="text-sm font-medium mb-1">{suggestion.reason}</div>
                          <div className="text-xs text-muted-foreground">
                            Cards: {suggestion.cards.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Land Base Improvements */}
                {analysis.landBase.improvements.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Land Base Improvements</h4>
                    <div className="space-y-2">
                      {analysis.landBase.improvements.slice(0, 3).map((improvement, index) => (
                        <div key={index} className="p-3 border rounded">
                          <div className="text-sm">{improvement}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="ai" className="h-[600px]">
          {deckId && deckName ? (
            <AIAnalysisPanel
              deckId={deckId}
              deckName={deckName}
              deckFormat={format}
              deckSummary={{
                power: { score: 0 },
                counts: { total: deck.length + (commander ? 1 : 0) },
                commander: commander ? { 
                  name: commander.name, 
                  type_line: commander.type_line, 
                  colors: commander.colors 
                } : undefined,
                cards: deck.map(card => ({
                  card_name: card.name,
                  quantity: card.quantity || 1,
                  is_commander: commander?.name === card.name,
                  card_data: {
                    mana_cost: card.mana_cost,
                    cmc: card.cmc,
                    type_line: card.type_line,
                    colors: card.colors
                  }
                }))
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">AI Analysis Unavailable</h3>
                <p className="text-sm text-muted-foreground">
                  Save your deck first to access AI-powered analysis
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}