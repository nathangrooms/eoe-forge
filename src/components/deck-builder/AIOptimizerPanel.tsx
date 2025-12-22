// Premium Deck Optimizer Panel - Complete integrated solution
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Brain, 
  Sparkles, 
  Target, 
  Loader2, 
  AlertCircle,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  Zap,
  RefreshCw,
  Plus,
  Library,
  Trash2,
  Mountain
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { scryfallAPI } from '@/lib/api/scryfall';
import { EdhAnalysisData } from './EdhAnalysisPanel';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { OptimizerProgress } from './optimizer/OptimizerProgress';
import { OptimizerOverview } from './optimizer/OptimizerOverview';
import { AdditionsSection, AdditionSuggestion } from './optimizer/AdditionsSection';
import { RemovalsSection, RemovalSuggestion } from './optimizer/RemovalsSection';
import { SwapsSection, SwapSuggestion } from './optimizer/SwapsSection';
import { LandRecommendationsSection, LandRecommendation } from './optimizer/LandRecommendationsSection';
import { PowerImpactBadge } from './optimizer/PowerImpactBadge';

interface AnalysisResult {
  issues: Array<{ card: string; reason: string; severity: 'high' | 'medium' | 'low'; category?: string }>;
  strengths: Array<{ text: string }>;
  strategy: Array<{ text: string }>;
  manabase: Array<{ text: string }>;
  summary: string;
  categories?: {
    synergy: number;
    consistency: number;
    power: number;
    interaction: number;
    manabase: number;
  };
  currentPowerLevel?: number;
  projectedPowerLevel?: number;
}

interface AIOptimizerPanelProps {
  deckId: string;
  deckName: string;
  deckCards: Array<{
    id: string;
    name: string;
    quantity?: number;
    type_line?: string;
    mana_cost?: string;
    cmc?: number;
    prices?: { usd?: string };
  }>;
  format?: string;
  commander?: { name: string };
  powerLevel?: number;
  edhAnalysis?: EdhAnalysisData | null;
  onApplyReplacements: (replacements: Array<{ remove: string; add: string }>) => void;
  onAddCard?: (cardName: string) => void;
  onRemoveCard?: (cardName: string) => void;
}

export function AIOptimizerPanel({
  deckId,
  deckName,
  deckCards = [],
  format,
  commander,
  powerLevel,
  edhAnalysis,
  onApplyReplacements,
  onAddCard,
  onRemoveCard
}: AIOptimizerPanelProps) {
  const [loading, setLoading] = useState(false);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [additionSuggestions, setAdditionSuggestions] = useState<AdditionSuggestion[]>([]);
  const [removalSuggestions, setRemovalSuggestions] = useState<RemovalSuggestion[]>([]);
  const [swapSuggestions, setSwapSuggestions] = useState<SwapSuggestion[]>([]);
  const [landRecommendations, setLandRecommendations] = useState<LandRecommendation[]>([]);
  const [landCount, setLandCount] = useState(0);
  const [idealLandCount, setIdealLandCount] = useState(37);
  const [error, setError] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingMoreSwaps, setIsLoadingMoreSwaps] = useState(false);
  const [showConfirmSwaps, setShowConfirmSwaps] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [useCollection, setUseCollection] = useState(false);

  // Calculate required cards based on format
  const isCommander = format?.toLowerCase() === 'commander' || format?.toLowerCase() === 'edh';
  const requiredCards = isCommander ? 100 : 60;
  
  // Calculate total card count including quantities and commander
  const cardQuantityTotal = deckCards.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalCardsWithCommander = isCommander && commander ? cardQuantityTotal + 1 : cardQuantityTotal;
  const missingCards = Math.max(0, requiredCards - totalCardsWithCommander);
  const excessCards = Math.max(0, totalCardsWithCommander - requiredCards);
  const isDeckComplete = totalCardsWithCommander === requiredCards;

  // Determine deck status for UI
  const deckStatus = missingCards > 0 ? 'incomplete' : excessCards > 0 ? 'overloaded' : 'complete';

  // Extract low playability cards from EDH analysis
  const lowPlayabilityCards = (edhAnalysis?.cardAnalysis || [])
    .filter(c => c.playability !== null && c.playability < 40 && !c.isCommander)
    .sort((a, b) => (a.playability || 0) - (b.playability || 0))
    .slice(0, 10);

  const hasEdhData = edhAnalysis && edhAnalysis.cardAnalysis?.length > 0;
  const hasResults = analysis || additionSuggestions.length > 0 || removalSuggestions.length > 0 || swapSuggestions.length > 0 || landRecommendations.length > 0;
  const hasLandIssues = Math.abs(landCount - idealLandCount) > 2;

  // Calculate projected power level change
  const projectedPowerChange = analysis?.projectedPowerLevel && analysis?.currentPowerLevel
    ? analysis.projectedPowerLevel - analysis.currentPowerLevel
    : null;

  const generateOptimizations = async (fromCollection = false) => {
    setLoading(true);
    setLoadingStep(0);
    setError('');
    setUseCollection(fromCollection);
    
    try {
      // If using collection, fetch user's collection first
      let collectionCards: string[] = [];
      if (fromCollection) {
        setLoadingCollection(true);
        setLoadingStep(0);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('user_collections')
            .select('card_name')
            .eq('user_id', user.id);
          collectionCards = (data || []).map(c => c.card_name);
        }
        setLoadingCollection(false);
      }

      setLoadingStep(1);
      console.log('Calling deck-optimizer with', deckCards.length, 'cards, status:', deckStatus);

      const { data, error: fnError } = await supabase.functions.invoke('deck-optimizer', {
        body: {
          deckContext: {
            id: deckId,
            name: deckName,
            format,
            commander,
            cards: deckCards.map(c => ({
              name: c.name,
              type_line: c.type_line,
              mana_cost: c.mana_cost,
              cmc: c.cmc,
              quantity: c.quantity || 1
            })),
            power: { score: powerLevel }
          },
          edhAnalysis: edhAnalysis ? {
            metrics: edhAnalysis.metrics,
            cardAnalysis: lowPlayabilityCards.map(c => ({
              name: c.name,
              playability: c.playability,
              isCommander: false
            })),
            tippingPoint: edhAnalysis.metrics?.tippingPoint,
            efficiency: edhAnalysis.metrics?.efficiency,
            impact: edhAnalysis.metrics?.impact
          } : null,
          useCollection: fromCollection,
          collectionCards: collectionCards.slice(0, 200)
        }
      });

      if (fnError) {
        console.error('Function error:', fnError);
        const errMsg = String(fnError?.message || fnError);
        if (/429|rate/i.test(errMsg)) throw new Error('RATE_LIMIT');
        if (/402|payment|credit/i.test(errMsg)) throw new Error('PAYMENT_REQUIRED');
        throw fnError;
      }

      if (data?.error) {
        console.error('Response error:', data.error, data.type);
        if (data.type === 'rate_limit' || /rate/i.test(data.error)) throw new Error('RATE_LIMIT');
        if (data.type === 'payment_required' || /credit|payment/i.test(data.error)) throw new Error('PAYMENT_REQUIRED');
        throw new Error(data.error);
      }

      setLoadingStep(2);

      if (data?.analysis) {
        const parsed = data.analysis;
        setAnalysis({
          summary: parsed.summary || '',
          issues: parsed.issues || [],
          strengths: parsed.strengths || [],
          strategy: parsed.strategy || [],
          manabase: parsed.manabase || [],
          categories: parsed.categories,
          currentPowerLevel: parsed.currentPowerLevel,
          projectedPowerLevel: parsed.projectedPowerLevel
        });

        // Fetch images for all suggestions in parallel
        const [additions, removals, swaps, lands] = await Promise.all([
          fetchAdditionImages(parsed.additions || [], collectionCards),
          fetchRemovalImages(parsed.removals || []),
          fetchSwapImages(parsed.replacements || [], collectionCards),
          fetchLandImages(parsed.landRecommendations || [])
        ]);

        setAdditionSuggestions(additions);
        setRemovalSuggestions(removals);
        setSwapSuggestions(swaps);
        setLandRecommendations(lands);
        
        // Set land counts from response
        if (parsed.landCount !== undefined) setLandCount(parsed.landCount);
        if (parsed.idealLandCount !== undefined) setIdealLandCount(parsed.idealLandCount);
        
        // Always default to overview tab after analysis
        setActiveTab('overview');
        
        toast.success('Analysis complete');
      } else {
        throw new Error('No analysis returned');
      }
    } catch (err: any) {
      console.error('Optimizer error:', err);
      const msg = String(err?.message || err);
      if (msg === 'RATE_LIMIT' || /429|rate/i.test(msg)) {
        setError('Rate limit exceeded. Please wait 30-60 seconds and try again.');
      } else if (msg === 'PAYMENT_REQUIRED' || /402|credit|payment/i.test(msg)) {
        setError('AI credits required. Please add credits in Settings → Workspace → Usage.');
      } else {
        setError('Failed to generate analysis. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingCollection(false);
    }
  };

  const fetchCardData = async (cardName: string): Promise<any> => {
    try {
      const card = await scryfallAPI.getCardByName(cardName);
      return {
        name: card.name,
        image_uri: card.image_uris?.normal || card.image_uris?.large,
        prices: card.prices,
        type_line: card.type_line
      };
    } catch (error) {
      console.error(`Failed to fetch card: ${cardName}`, error);
      return null;
    }
  };

  const fetchAdditionImages = async (additions: any[], collectionCards: string[]): Promise<AdditionSuggestion[]> => {
    const results: AdditionSuggestion[] = [];
    const batchSize = 5;
    
    for (let i = 0; i < additions.length; i += batchSize) {
      const batch = additions.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (add) => {
          try {
            const cardData = await fetchCardData(add.name);
            if (cardData) {
              return {
                name: add.name,
                image: cardData.image_uri || '/placeholder.svg',
                price: Number(cardData.prices?.usd) || 0,
                reason: add.reason || 'Recommended addition',
                type: add.type || cardData.type_line,
                priority: add.priority || 'medium',
                category: add.category || 'Other',
                inCollection: collectionCards.some(c => c.toLowerCase() === add.name.toLowerCase()),
                edhImpact: add.edhImpact || 0.2,
                selected: false
              };
            }
            return null;
          } catch (e) {
            return null;
          }
        })
      );
      results.push(...batchResults.filter(Boolean) as AdditionSuggestion[]);
    }
    return results;
  };

  const fetchRemovalImages = async (removals: any[]): Promise<RemovalSuggestion[]> => {
    const results: RemovalSuggestion[] = [];
    
    for (const removal of removals.slice(0, 15)) {
      try {
        const cardData = await fetchCardData(removal.name);
        const edhCardData = edhAnalysis?.cardAnalysis?.find(
          c => c.name.toLowerCase() === removal.name.toLowerCase()
        );
        if (cardData) {
          results.push({
            name: removal.name,
            image: cardData.image_uri || '/placeholder.svg',
            price: Number(cardData.prices?.usd) || 0,
            reason: removal.reason || 'Consider removing',
            type: cardData.type_line,
            priority: removal.priority || 'medium',
            playability: edhCardData?.playability ?? null,
            edhImpact: removal.edhImpact || 0,
            selected: false
          });
        }
      } catch (e) {
        console.error('Error fetching removal card:', e);
      }
    }
    return results;
  };

  const fetchSwapImages = async (replacements: any[], collectionCards: string[]): Promise<SwapSuggestion[]> => {
    const results: SwapSuggestion[] = [];
    
    // Process up to 15 swaps for more variety
    for (const rep of replacements.slice(0, 15)) {
      try {
        const [currentCardData, newCardData] = await Promise.all([
          fetchCardData(rep.remove),
          fetchCardData(rep.add)
        ]);

        if (currentCardData && newCardData) {
          const edhCardData = edhAnalysis?.cardAnalysis?.find(
            c => c.name.toLowerCase() === rep.remove.toLowerCase()
          );
          
          results.push({
            currentCard: {
              name: rep.remove,
              image: currentCardData.image_uri || '/placeholder.svg',
              price: Number(currentCardData.prices?.usd) || 0,
              reason: rep.removeReason || 'Underperforming',
              playability: edhCardData?.playability ?? null
            },
            newCard: {
              name: rep.add,
              image: newCardData.image_uri || '/placeholder.svg',
              price: Number(newCardData.prices?.usd) || 0,
              reason: rep.addBenefit || 'Better synergy',
              type: rep.addType || newCardData.type_line,
              inCollection: collectionCards.some(c => c.toLowerCase() === rep.add.toLowerCase()),
              synergy: rep.synergy || null
            },
            priority: rep.priority || 'medium',
            category: rep.category || null,
            edhImpact: rep.edhImpact || 0.1,
            selected: true
          });
        }
      } catch (e) {
        console.error('Error fetching swap cards:', e);
      }
    }
    return results;
  };

  const fetchLandImages = async (lands: any[]): Promise<LandRecommendation[]> => {
    const results: LandRecommendation[] = [];
    
    for (const land of lands.slice(0, 10)) {
      try {
        const cardData = await fetchCardData(land.name);
        results.push({
          type: land.type === 'add' ? 'add' : 'remove',
          name: land.name,
          image: cardData?.image_uri || undefined,
          reason: land.reason || 'Land adjustment',
          priority: land.priority || 'medium',
          category: land.category || 'Basic'
        });
      } catch (e) {
        // Still add without image
        results.push({
          type: land.type === 'add' ? 'add' : 'remove',
          name: land.name,
          reason: land.reason || 'Land adjustment',
          priority: land.priority || 'medium',
          category: land.category || 'Basic'
        });
      }
    }
    return results;
  };

  // Handler functions for child components
  const handleAddCard = (cardName: string) => {
    if (onAddCard) {
      onAddCard(cardName);
      setAdditionSuggestions(prev => prev.filter(c => c.name !== cardName));
      setLandRecommendations(prev => prev.filter(c => !(c.type === 'add' && c.name === cardName)));
      toast.success(`Added ${cardName}`);
    }
  };

  const handleAddMultipleCards = (cardNames: string[]) => {
    if (onAddCard) {
      setIsApplying(true);
      cardNames.forEach(name => onAddCard(name));
      setAdditionSuggestions(prev => prev.filter(c => !cardNames.includes(c.name)));
      setLandRecommendations(prev => prev.filter(c => !(c.type === 'add' && cardNames.includes(c.name))));
      toast.success(`Added ${cardNames.length} cards`);
      setIsApplying(false);
    }
  };

  const handleRemoveCard = (cardName: string) => {
    if (onRemoveCard) {
      onRemoveCard(cardName);
      setRemovalSuggestions(prev => prev.filter(c => c.name !== cardName));
      setLandRecommendations(prev => prev.filter(c => !(c.type === 'remove' && c.name === cardName)));
      toast.success(`Removed ${cardName}`);
    } else if (onApplyReplacements) {
      onRemoveCard(cardName);
      setRemovalSuggestions(prev => prev.filter(c => c.name !== cardName));
      toast.success(`Removed ${cardName}`);
    } else if (onApplyReplacements) {
      // Fallback: use replacement with empty add
      onApplyReplacements([{ remove: cardName, add: '' }]);
      setRemovalSuggestions(prev => prev.filter(c => c.name !== cardName));
      toast.success(`Removed ${cardName}`);
    }
  };

  const handleRemoveMultipleCards = (cardNames: string[]) => {
    setIsApplying(true);
    cardNames.forEach(name => handleRemoveCard(name));
    setIsApplying(false);
  };

  const toggleSwapSuggestion = (index: number) => {
    setSwapSuggestions(prev => prev.map((s, i) => 
      i === index ? { ...s, selected: !s.selected } : s
    ));
  };

  const applySingleSwap = async (index: number) => {
    const swap = swapSuggestions[index];
    setIsApplying(true);
    
    try {
      await onApplyReplacements([{
        remove: swap.currentCard.name,
        add: swap.newCard.name
      }]);
      
      toast.success(`Replaced ${swap.currentCard.name} with ${swap.newCard.name}`);
      setSwapSuggestions(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Error applying swap:', error);
      toast.error('Failed to apply swap');
    } finally {
      setIsApplying(false);
    }
  };

  const applySelectedSwaps = async () => {
    const selected = swapSuggestions.filter(s => s.selected);
    
    if (selected.length === 0) {
      toast.error('No swaps selected');
      return;
    }

    setIsApplying(true);
    
    try {
      const replacements = selected.map(s => ({
        remove: s.currentCard.name,
        add: s.newCard.name
      }));

      await onApplyReplacements(replacements);
      toast.success(`Applied ${selected.length} replacement${selected.length > 1 ? 's' : ''}`);
      setSwapSuggestions(prev => prev.filter(s => !s.selected));
    } catch (error) {
      console.error('Error applying swaps:', error);
      toast.error('Failed to apply swaps');
    } finally {
      setIsApplying(false);
      setShowConfirmSwaps(false);
    }
  };

  // Find more swaps - regenerate analysis focusing on different cards
  const findMoreSwaps = async () => {
    setIsLoadingMoreSwaps(true);
    try {
      // Get existing swap cards to exclude
      const existingSwapCards = swapSuggestions.flatMap(s => [
        s.currentCard.name.toLowerCase(),
        s.newCard.name.toLowerCase()
      ]);
      
      const { data, error: fnError } = await supabase.functions.invoke('deck-optimizer', {
        body: {
          deckContext: {
            id: deckId,
            name: deckName,
            format,
            commander,
            cards: deckCards.map(c => ({
              name: c.name,
              type_line: c.type_line,
              mana_cost: c.mana_cost,
              cmc: c.cmc,
              quantity: c.quantity || 1
            })),
            power: { score: powerLevel }
          },
          edhAnalysis: edhAnalysis ? {
            metrics: edhAnalysis.metrics,
            cardAnalysis: lowPlayabilityCards.map(c => ({
              name: c.name,
              playability: c.playability,
              isCommander: false
            }))
          } : null,
          useCollection,
          excludeSwaps: existingSwapCards
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data?.analysis?.replacements) {
        // Filter out already suggested swaps and fetch images
        const newReplacements = (data.analysis.replacements || [])
          .filter((r: any) => 
            !existingSwapCards.includes(r.remove?.toLowerCase()) &&
            !existingSwapCards.includes(r.add?.toLowerCase())
          );
        
        const collectionCards: string[] = [];
        const newSwaps = await fetchSwapImages(newReplacements, collectionCards);
        
        if (newSwaps.length > 0) {
          setSwapSuggestions(prev => [...prev, ...newSwaps]);
          toast.success(`Found ${newSwaps.length} more swap suggestions`);
        } else {
          toast.info('No additional swaps found');
        }
      }
    } catch (err) {
      console.error('Error finding more swaps:', err);
      toast.error('Failed to find more swaps');
    } finally {
      setIsLoadingMoreSwaps(false);
    }
  };

  // Get status-specific styling
  const statusConfig = {
    incomplete: {
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
      icon: Plus,
      label: `${missingCards} cards needed`
    },
    overloaded: {
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      borderColor: 'border-destructive/30',
      icon: Trash2,
      label: `${excessCards} cards over`
    },
    complete: {
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      icon: Zap,
      label: 'Deck Complete'
    }
  };

  const status = statusConfig[deckStatus];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header - Mobile optimized */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">Deck Optimizer</h3>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm flex-wrap">
                    <span className="text-muted-foreground">
                      {totalCardsWithCommander}/{requiredCards}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] sm:text-xs px-1 sm:px-1.5", status.color, status.bgColor, status.borderColor)}>
                      <status.icon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      <span className="hidden xs:inline">{status.label}</span>
                    </Badge>
                    {hasEdhData && (
                      <Badge variant="secondary" className="text-[10px] sm:text-xs px-1 bg-green-500/20 text-green-400 border-green-500/30 hidden xs:flex">
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        EDH
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Action buttons - side by side on desktop, appropriate sizing */}
            <div className="flex gap-2 sm:gap-3">
              <Button 
                variant="outline"
                onClick={() => generateOptimizations(true)}
                disabled={loading}
                className="h-10 px-4 text-sm"
              >
                {loadingCollection ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Library className="h-4 w-4 mr-2" />
                )}
                Collection
              </Button>
              <Button 
                onClick={() => generateOptimizations(false)}
                disabled={loading || deckCards.length === 0}
                className="h-10 px-6 text-sm"
              >
                {loading && !loadingCollection ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : hasResults ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Optimize
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low Playability Preview */}
      {hasEdhData && lowPlayabilityCards.length > 0 && !hasResults && !loading && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-orange-400">
                {lowPlayabilityCards.length} Low Playability Cards
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowPlayabilityCards.slice(0, 6).map((card, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30">
                  {card.name} 
                  <span className="ml-1 text-orange-400">({card.playability}%)</span>
                </Badge>
              ))}
              {lowPlayabilityCards.length > 6 && (
                <Badge variant="outline" className="text-xs">
                  +{lowPlayabilityCards.length - 6} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">{error}</p>
                {error.includes('Rate limit') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Too many requests. Please wait before trying again.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <OptimizerProgress currentStep={loadingStep} loadingCollection={loadingCollection} />
      )}

      {/* Empty State - just informational, buttons are in header */}
      {!hasResults && !loading && !error && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Brain className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">Ready to Optimize</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {deckCards.length === 0 
                ? 'Add cards to your deck to get optimization analysis.'
                : deckStatus === 'incomplete'
                ? `Your deck needs ${missingCards} more cards. Click Optimize above to get suggestions.`
                : deckStatus === 'overloaded'
                ? `Your deck has ${excessCards} too many cards. Click Optimize above for cut suggestions.`
                : 'Click Optimize above to get card swap suggestions.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results Tabs - Dynamic based on deck status */}
      {hasResults && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Mobile-optimized scrollable tabs */}
            <div className="overflow-x-auto -mx-2 px-2 pb-1">
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-4 gap-1 mb-3">
                <TabsTrigger value="overview" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                  <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Overview</span>
                </TabsTrigger>
                
                {deckStatus === 'incomplete' ? (
                  <TabsTrigger value="additions" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Add</span>
                    {additionSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {additionSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ) : deckStatus === 'overloaded' ? (
                  <TabsTrigger value="removals" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Cut</span>
                    {removalSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {removalSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ) : (
                  <TabsTrigger value="swaps" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Swaps</span>
                    {swapSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {swapSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}

                {/* Lands tab - always show if recommendations exist */}
                <TabsTrigger 
                  value="lands" 
                  className={cn(
                    "flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap",
                    hasLandIssues && "text-orange-400"
                  )}
                >
                  <Mountain className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Lands</span>
                  {landRecommendations.length > 0 && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "ml-0.5 h-4 px-1 text-[10px]",
                        hasLandIssues && "bg-orange-500/20 text-orange-400"
                      )}
                    >
                      {landRecommendations.length}
                    </Badge>
                  )}
                </TabsTrigger>

                {/* Secondary tab based on status */}
                {deckStatus === 'incomplete' ? (
                  <TabsTrigger value="swaps" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Swaps</span>
                    {swapSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {swapSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ) : deckStatus === 'overloaded' ? (
                  <TabsTrigger value="swaps" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Swaps</span>
                    {swapSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {swapSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ) : (
                  <TabsTrigger value="additions" className="flex items-center gap-1 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
                    <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Ideas</span>
                    {additionSuggestions.length > 0 && (
                      <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">
                        {additionSuggestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview">
              {analysis ? (
                <OptimizerOverview 
                  analysis={analysis}
                  replacementCount={swapSuggestions.length}
                  additionCount={additionSuggestions.length}
                />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No overview available.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Additions Tab */}
            <TabsContent value="additions">
              {additionSuggestions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-2">
                      {missingCards > 0 
                        ? 'Run the optimizer to get card recommendations.'
                        : 'Your deck is complete! Check out swaps for optimization ideas.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <AdditionsSection
                  suggestions={additionSuggestions}
                  missingCards={missingCards}
                  onAddCard={handleAddCard}
                  onAddMultiple={handleAddMultipleCards}
                  isAdding={isApplying}
                />
              )}
            </TabsContent>

            {/* Removals Tab */}
            <TabsContent value="removals">
              {removalSuggestions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                      <Trash2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-2">
                      {excessCards > 0 
                        ? 'Run the optimizer to get removal suggestions.'
                        : 'Your deck has the right number of cards!'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <RemovalsSection
                  suggestions={removalSuggestions}
                  excessCards={excessCards}
                  onRemoveCard={handleRemoveCard}
                  onRemoveMultiple={handleRemoveMultipleCards}
                  isRemoving={isApplying}
                />
              )}
            </TabsContent>

            {/* Swaps Tab */}
            <TabsContent value="swaps">
              {swapSuggestions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                      <ArrowRight className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground mb-2">
                      {isDeckComplete 
                        ? 'Run the optimizer to get card swap suggestions.'
                        : deckStatus === 'incomplete'
                        ? 'Complete your deck first to get swap suggestions.'
                        : 'Reduce your deck size first to get swap suggestions.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <SwapsSection
                  suggestions={swapSuggestions}
                  onToggle={toggleSwapSuggestion}
                  onApplySingle={applySingleSwap}
                  onApplySelected={() => setShowConfirmSwaps(true)}
                  onFindMoreSwaps={findMoreSwaps}
                  isApplying={isApplying}
                  isLoadingMore={isLoadingMoreSwaps}
                  useCollection={useCollection}
                />
              )}
            </TabsContent>

            {/* Lands Tab */}
            <TabsContent value="lands">
              <LandRecommendationsSection
                currentLandCount={landCount}
                idealLandCount={idealLandCount}
                recommendations={landRecommendations}
                onAddLand={handleAddCard}
                onRemoveLand={handleRemoveCard}
                isApplying={isApplying}
              />
            </TabsContent>
          </Tabs>
        </motion.div>
      )}

      {/* Confirm Swaps Dialog */}
      <AlertDialog open={showConfirmSwaps} onOpenChange={setShowConfirmSwaps}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Selected Swaps?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace {swapSuggestions.filter(s => s.selected).length} cards in your deck.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applySelectedSwaps}>
              Apply Swaps
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
