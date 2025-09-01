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

  const handleFavoriteToggle = async () => {
    setFavoriteLoading(true);
    try {
      const result = await DeckAPI.toggleFavorite(deckSummary.id);
      setIsFavorite(result.favorited);
      showSuccess('Favorite Updated', result.message);
      onFavoriteChange?.();
    } catch (error) {
      showError('Error', 'Failed to update favorite status');
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
    <Card className={cn("group hover:shadow-lg transition-all duration-300 overflow-hidden border-2 hover:border-primary/20", className)}>
      <CardContent className="p-0">
        {/* Header with Commander Image */}
        <div className="relative bg-gradient-to-r from-background to-muted p-4 border-b">
          <div className="flex items-start gap-4">
            {/* Commander Image */}
            {deckSummary.commander && (
              <div className="flex-shrink-0">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-muted-foreground/20 bg-muted">
                  {deckSummary.commander.image ? (
                    <img 
                      src={deckSummary.commander.image} 
                      alt={deckSummary.commander.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Crown className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute top-0 right-0 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                    <Crown className="h-2 w-2 text-white" />
                  </div>
                </div>
              </div>
            )}

            {/* Deck Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn("font-medium text-xs", formatColors[deckSummary.format as keyof typeof formatColors] || formatColors.custom)}>
                  {deckSummary.format.toUpperCase()}
                </Badge>
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

              {deckSummary.commander && (
                <p className="text-sm text-muted-foreground mb-2 truncate">
                  Commander: {deckSummary.commander.name}
                </p>
              )}
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  <span>{deckSummary.counts.total} cards</span>
                </div>
                {!deckSummary.legality.ok && (
                  <div className="flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{deckSummary.legality.issues.length} issues</span>
                  </div>
                )}
              </div>
            </div>

            {/* Favorite Button */}
            <div className="flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleFavoriteToggle}
                disabled={favoriteLoading}
                className="text-yellow-500 hover:text-yellow-600 h-8 w-8 p-0"
              >
                {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="p-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {/* Power Analysis */}
            <div className="text-center p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors" onClick={onAnalysis}>
              <Target className="h-4 w-4 text-primary mx-auto mb-1" />
              <div className="text-lg font-bold">{deckSummary.power.score}</div>
              <div className="text-xs text-muted-foreground">Power</div>
            </div>

            {/* Collection Fit */}
            <div className="text-center p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors" onClick={onMissingCards}>
              <Package className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <div className="text-lg font-bold">{deckSummary.economy.ownedPct}%</div>
              <div className="text-xs text-muted-foreground">Owned</div>
            </div>

            {/* Cost */}
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <DollarSign className="h-4 w-4 text-green-500 mx-auto mb-1" />
              <div className="text-lg font-bold">${Math.round(deckSummary.economy.priceUSD)}</div>
              <div className="text-xs text-muted-foreground">Value</div>
            </div>

            {/* Unique Cards */}
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <Box className="h-4 w-4 text-purple-500 mx-auto mb-1" />
              <div className="text-lg font-bold">{deckSummary.counts.unique}</div>
              <div className="text-xs text-muted-foreground">Unique</div>
            </div>
          </div>

          {/* Visual Analytics Row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Enhanced Mana Curve */}
            <Card className="p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">Mana Curve</span>
              </div>
              <div className="flex items-end gap-1 h-10 mb-1">
                {curveData.map(({ cmc, count }) => {
                  const height = maxCurveCount > 0 ? (count / maxCurveCount) * 80 : 0;
                  return (
                    <div key={cmc} className="flex-1 flex flex-col items-center">
                      <div 
                        className="bg-gradient-to-t from-primary to-primary/60 w-full rounded-t min-h-[2px]"
                        style={{ height: `${Math.max(height, count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>≤1</span>
                <span>4</span>
                <span>7+</span>
              </div>
            </Card>

            {/* Enhanced Type Distribution */}
            <Card className="p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">Composition</span>
              </div>
              <div className="space-y-1">
                {typeData.slice(0, 3).map((type) => (
                  <div key={type.type} className="flex justify-between items-center">
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${type.color}`} />
                      <span className="text-xs">{type.type.slice(0, 4)}</span>
                    </div>
                    <span className="text-xs font-medium">{type.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Enhanced Mana Sources */}
            <Card className="p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">Mana Base</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-center gap-1">
                  {Object.entries(deckSummary.mana.sources)
                    .filter(([_, count]) => Number(count) > 0)
                    .slice(0, 5)
                    .map(([color, count]) => (
                      <div key={color} className="text-center">
                        <div className={`w-4 h-4 rounded-full border ${
                          color === 'W' ? 'bg-yellow-200 border-yellow-400' :
                          color === 'U' ? 'bg-blue-200 border-blue-400' :
                          color === 'B' ? 'bg-gray-700 border-gray-500' :
                          color === 'R' ? 'bg-red-200 border-red-400' :
                          color === 'G' ? 'bg-green-200 border-green-400' : 'bg-gray-200 border-gray-400'
                        } mx-auto mb-1`} />
                        <span className="text-xs font-medium">{count}</span>
                      </div>
                    ))}
                </div>
                <div className="text-center">
                  <Progress value={deckSummary.mana.untappedPctByTurn.t1} className="h-1 mb-1" />
                  <span className="text-xs text-muted-foreground">T1: {Math.round(deckSummary.mana.untappedPctByTurn.t1)}% untapped</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Enhanced Status Badges */}
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

              {/* Power Band Indicator */}
              <Badge className={cn("text-xs", powerBandColors[deckSummary.power.band])}>
                {deckSummary.power.band.toUpperCase()}
              </Badge>

              {/* Tags */}
              {deckSummary.tags.slice(0, 1).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            {/* Action Buttons */}
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
      </CardContent>
    </Card>
  );
}