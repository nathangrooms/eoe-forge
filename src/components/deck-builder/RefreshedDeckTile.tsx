import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Star, 
  StarOff, 
  Edit, 
  Trash2, 
  Copy, 
  BarChart3, 
  DollarSign, 
  TrendingUp,
  Crown,
  Target,
  Package,
  AlertTriangle,
  Box,
  Download,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeckSummary, DeckAPI } from '@/lib/api/deckAPI';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface RefreshedDeckTileProps {
  deckSummary: DeckSummary;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onAnalysis?: () => void;
  onMissingCards?: () => void;
  onExport?: () => void;
  onDeckbox?: () => void;
  onFavoriteChange?: () => void;
  className?: string;
}

export function RefreshedDeckTile({
  deckSummary,
  onEdit,
  onDelete,
  onDuplicate,
  onAnalysis,
  onMissingCards,
  onExport,
  onDeckbox,
  onFavoriteChange,
  className
}: RefreshedDeckTileProps) {
  const [isFavorite, setIsFavorite] = useState(deckSummary.favorite);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  const formatColors = {
    standard: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    commander: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    modern: 'bg-green-500/20 text-green-400 border-green-500/30',
    legacy: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  };

  const powerBandColors = {
    casual: 'bg-green-500/20 text-green-400',
    mid: 'bg-blue-500/20 text-blue-400',
    high: 'bg-orange-500/20 text-orange-400',
    cEDH: 'bg-red-500/20 text-red-400'
  };

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (favoriteLoading) return;
    
    setFavoriteLoading(true);
    try {
      // Check if this is a local deck
      const isLocalDeck = deckSummary.name.includes('(Local)');
      
      if (isLocalDeck) {
        // For local decks, use the store
        const { useDeckManagementStore } = await import('@/stores/deckManagementStore');
        const toggleFavorite = useDeckManagementStore.getState().toggleFavorite;
        toggleFavorite(deckSummary.id);
        setIsFavorite(!isFavorite);
      } else {
        // For database decks, use the API
        const result = await DeckAPI.toggleFavorite(deckSummary.id);
        setIsFavorite(result.favorited);
      }
      onFavoriteChange?.();
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const getColorIndicator = (colors: string[]) => {
    const colorMap: Record<string, string> = {
      W: 'bg-yellow-100 border-yellow-300',
      U: 'bg-blue-100 border-blue-300',
      B: 'bg-gray-800 border-gray-600',
      R: 'bg-red-100 border-red-300',
      G: 'bg-green-100 border-green-300'
    };
    
    return colors.slice(0, 5).map(color => (
      <div
        key={color}
        className={`w-4 h-4 rounded-full border-2 ${colorMap[color] || 'bg-gray-200 border-gray-300'}`}
      />
    ));
  };

  // Mini curve chart data
  const curveData = Object.entries(deckSummary.curve.bins).map(([cmc, count]) => ({
    cmc,
    count: Number(count)
  }));
  const maxCurveCount = Math.max(...curveData.map(d => d.count), 1);

  // Type distribution data
  const typeData = [
    { type: 'Creatures', count: deckSummary.counts.creatures, color: 'bg-green-500' },
    { type: 'Lands', count: deckSummary.counts.lands, color: 'bg-amber-500' },
    { type: 'Instants', count: deckSummary.counts.instants, color: 'bg-blue-500' },
    { type: 'Sorceries', count: deckSummary.counts.sorceries, color: 'bg-red-500' },
    { type: 'Artifacts', count: deckSummary.counts.artifacts, color: 'bg-gray-500' },
    { type: 'Enchantments', count: deckSummary.counts.enchantments, color: 'bg-purple-500' },
    { type: 'Planeswalkers', count: deckSummary.counts.planeswalkers, color: 'bg-pink-500' }
  ].filter(item => item.count > 0);

  return (
    <Card className={cn("group hover:shadow-xl transition-all duration-300 overflow-hidden border-2 hover:border-primary/30", className)}>
      <CardContent className="p-0">
        <div className="flex min-h-[280px]">
          {/* Left: Full Height Commander Section - Much Wider */}
          <div className="w-80 flex-shrink-0 relative p-4">
            {deckSummary.commander ? (
              <div className="absolute inset-4 rounded-xl bg-gradient-to-b from-muted via-muted/50 to-background overflow-hidden shadow-lg">
                <img 
                  src={deckSummary.commander.image} 
                  alt={deckSummary.commander.name}
                  className="w-full h-full object-cover rounded-xl"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
            ) : (
              <div className="absolute inset-4 rounded-xl bg-gradient-to-b from-muted to-muted/50 flex items-center justify-center shadow-lg border-2 border-dashed border-muted-foreground/20">
                <div className="text-center text-muted-foreground">
                  <Crown className="h-16 w-16 mx-auto mb-4" />
                  <div className="text-lg font-medium">No Commander</div>
                  <div className="text-sm mt-2">Set in Builder</div>
                </div>
              </div>
            )}

            {/* Format Badge - Top left corner with space from image */}
            <div className="absolute top-4 left-4">
              <Badge className={cn("text-sm font-bold shadow-xl border border-white/30", formatColors[deckSummary.format as keyof typeof formatColors] || formatColors.custom)}>
                {deckSummary.format.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Right: Comprehensive Stats Section */}
          <div className="flex-1 p-4 space-y-4">
            {/* Header with Name and Key Info */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={cn("text-xs font-bold", powerBandColors[deckSummary.power.band])}>
                    {deckSummary.power.score}/10
                  </Badge>
                  <div className="flex gap-1">
                    {getColorIndicator(deckSummary.colors)}
                  </div>
                </div>
                
                <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors truncate">
                  {deckSummary.name}
                </h3>
                
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    <span>{deckSummary.counts.total} total, {deckSummary.counts.unique} unique</span>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleFavoriteToggle}
                disabled={favoriteLoading}
                className="text-yellow-500 hover:text-yellow-600 h-8 w-8 p-0 shrink-0"
              >
                {favoriteLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isFavorite ? (
                  <Star className="h-4 w-4 fill-current" />
                ) : (
                  <StarOff className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Core Metrics Grid */}
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onAnalysis}>
                <Target className="h-3 w-3 text-primary mx-auto mb-1" />
                <div className="text-sm font-bold">{deckSummary.power.score}</div>
                <div className="text-xs text-muted-foreground">Power</div>
              </div>

              <div className="text-center p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onMissingCards}>
                <Package className="h-3 w-3 text-blue-500 mx-auto mb-1" />
                <div className="text-sm font-bold">{deckSummary.economy.ownedPct}%</div>
                <div className="text-xs text-muted-foreground">Owned</div>
              </div>

              <div className="text-center p-2 rounded-md bg-muted/30">
                <DollarSign className="h-3 w-3 text-green-500 mx-auto mb-1" />
                <div className="text-sm font-bold">${Math.round(deckSummary.economy.priceUSD)}</div>
                <div className="text-xs text-muted-foreground">Value</div>
              </div>

              <div className="text-center p-2 rounded-md bg-muted/30">
                <BarChart3 className="h-3 w-3 text-purple-500 mx-auto mb-1" />
                <div className="text-sm font-bold">{Math.round(curveData.reduce((sum, d) => sum + (parseInt(d.cmc.split('-')[0]) || 0) * d.count, 0) / Math.max(deckSummary.counts.total - deckSummary.counts.lands, 1) * 10) / 10}</div>
                <div className="text-xs text-muted-foreground">Avg CMC</div>
              </div>

              <div className="text-center p-2 rounded-md bg-muted/30">
                <TrendingUp className="h-3 w-3 text-orange-500 mx-auto mb-1" />
                <div className="text-sm font-bold">{Math.round((deckSummary.counts.lands / deckSummary.counts.total) * 100)}%</div>
                <div className="text-xs text-muted-foreground">Lands</div>
              </div>
            </div>

            {/* Detailed Card Type Breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">Card Types</div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>Creatures</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.creatures}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Lands</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.lands}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Instants</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.instants}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-red-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span>Sorceries</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.sorceries}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-gray-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                    <span>Artifacts</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.artifacts}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-purple-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>Enchant.</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.enchantments}</span>
                </div>
                
                <div className="flex items-center justify-between p-2 rounded bg-pink-500/10">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-pink-500" />
                    <span>Walkers</span>
                  </div>
                  <span className="font-bold">{deckSummary.counts.planeswalkers}</span>
                </div>

                {deckSummary.counts.battles > 0 && (
                  <div className="flex items-center justify-between p-2 rounded bg-cyan-500/10">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-cyan-500" />
                      <span>Battles</span>
                    </div>
                    <span className="font-bold">{deckSummary.counts.battles}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Analytics */}
            <div className="grid grid-cols-2 gap-3">
              {/* Enhanced Mana Curve */}
              <div className="p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium">Mana Curve</span>
                </div>
                <div className="flex items-end gap-1 h-8 mb-1">
                  {curveData.map(({ cmc, count }) => {
                    const height = maxCurveCount > 0 ? (count / maxCurveCount) * 70 : 0;
                    return (
                      <div key={cmc} className="flex-1 flex flex-col items-center relative group">
                        <div 
                          className="bg-gradient-to-t from-primary to-primary/60 w-full rounded-t min-h-[2px] transition-all group-hover:from-primary/80 group-hover:to-primary/40"
                          style={{ height: `${Math.max(height, count > 0 ? 8 : 0)}%` }}
                        />
                        <span className="text-xs text-muted-foreground mt-1">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0-1</span>
                  <span>2-3</span>
                  <span>4-5</span>
                  <span>6+</span>
                </div>
              </div>

              {/* Mana Base Analysis */}
              <div className="p-3 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium">Mana Base ({deckSummary.counts.lands})</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-center gap-1 mb-2">
                    {Object.entries(deckSummary.mana.sources)
                      .filter(([_, count]) => Number(count) > 0)
                      .slice(0, 5)
                      .map(([color, count]) => (
                        <div key={color} className="text-center">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            color === 'W' ? 'bg-yellow-200 border-yellow-400' :
                            color === 'U' ? 'bg-blue-200 border-blue-400' :
                            color === 'B' ? 'bg-gray-700 border-gray-500' :
                            color === 'R' ? 'bg-red-200 border-red-400' :
                            color === 'G' ? 'bg-green-200 border-green-400' : 'bg-gray-200 border-gray-400'
                          } mx-auto mb-1`} />
                          <span className="text-xs font-bold">{count}</span>
                        </div>
                      ))}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs">T1 Untapped</span>
                      <span className="text-xs font-bold">{Math.round(deckSummary.mana.untappedPctByTurn.t1)}%</span>
                    </div>
                    <Progress value={deckSummary.mana.untappedPctByTurn.t1} className="h-1" />
                  </div>
                </div>
              </div>
            </div>

            {/* Status and Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-muted">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge 
                  variant={deckSummary.legality.ok ? "default" : "destructive"}
                  className="text-xs cursor-pointer hover:opacity-80"
                  onClick={onAnalysis}
                >
                  {deckSummary.legality.ok ? '✓ Legal' : `⚠ ${deckSummary.legality.issues.length} Issues`}
                </Badge>

                {deckSummary.economy.missing > 0 && (
                  <Badge variant="outline" className="text-xs text-red-500 cursor-pointer hover:opacity-80" onClick={onMissingCards}>
                    Missing {deckSummary.economy.missing}
                  </Badge>
                )}

                <Badge className={cn("text-xs", powerBandColors[deckSummary.power.band])}>
                  {deckSummary.power.band.toUpperCase()}
                </Badge>

                {deckSummary.tags.slice(0, 1).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {onAnalysis && (
                  <Button variant="ghost" size="sm" onClick={onAnalysis} title="Analysis">
                    <BarChart3 className="h-3 w-3" />
                  </Button>
                )}
                {onExport && (
                  <Button variant="ghost" size="sm" onClick={onExport} title="Export">
                    <Download className="h-3 w-3" />
                  </Button>
                )}
                {onEdit && (
                  <Button variant="default" size="sm" onClick={onEdit}>
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
                <div className="flex gap-1">
                  {onDuplicate && (
                    <Button variant="outline" size="sm" onClick={onDuplicate} title="Duplicate">
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive" title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}