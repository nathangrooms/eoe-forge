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
    <Card className={cn("group hover:shadow-lg transition-all duration-300 overflow-hidden", className)}>
      <CardContent className="p-6">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <Badge className={cn("font-medium", formatColors[deckSummary.format as keyof typeof formatColors] || formatColors.custom)}>
                {deckSummary.format.toUpperCase()}
              </Badge>
              <Badge className={powerBandColors[deckSummary.power.band]}>
                {deckSummary.power.band.toUpperCase()}
              </Badge>
              <div className="flex gap-1">
                {getColorIndicator(deckSummary.colors)}
              </div>
            </div>
            
            <h3 className="font-bold text-xl mb-1 group-hover:text-primary transition-colors truncate">
              {deckSummary.name}
            </h3>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Updated {new Date(deckSummary.updatedAt).toLocaleDateString()}</span>
              </div>
              {!deckSummary.legality.ok && (
                <div className="flex items-center gap-1 text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{deckSummary.legality.issues.length} issues</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFavoriteToggle}
              disabled={favoriteLoading}
              className="text-yellow-500 hover:text-yellow-600"
            >
              {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
            </Button>
            {onEdit && (
              <Button variant="default" size="sm" onClick={onEdit}>
                <Edit className="h-4 w-4 mr-1" />
                Builder
              </Button>
            )}
            <div className="flex gap-1">
              {onDuplicate && (
                <Button variant="outline" size="sm" onClick={onDuplicate}>
                  <Copy className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Power Analysis */}
          <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onAnalysis}>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Power</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{deckSummary.power.score}/10</span>
              <Badge className={powerBandColors[deckSummary.power.band]} variant="outline">
                {deckSummary.power.band}
              </Badge>
            </div>
          </Card>

          {/* Collection Fit */}
          <Card className="p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onMissingCards}>
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Collection</span>
            </div>
            <div className="space-y-1">
              <div className="text-sm">Owned {deckSummary.economy.ownedPct}%</div>
              {deckSummary.economy.missing > 0 && (
                <div className="text-xs text-red-400">Missing {deckSummary.economy.missing}</div>
              )}
            </div>
          </Card>

          {/* Cost */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Value</span>
            </div>
            <div className="text-lg font-bold">${deckSummary.economy.priceUSD.toFixed(0)}</div>
          </Card>
        </div>

        {/* Visual Quick-Read Row */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Mana Curve */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs font-medium">Curve</span>
            </div>
            <div className="flex items-end gap-1 h-8">
              {curveData.map(({ cmc, count }) => (
                <div key={cmc} className="flex-1 flex flex-col items-center">
                  <div 
                    className="bg-primary w-full rounded-t"
                    style={{ height: `${(count / maxCurveCount) * 100}%` }}
                  />
                  <span className="text-xs text-muted-foreground mt-1">{cmc === '0-1' ? '≤1' : cmc === '10+' ? '10+' : cmc}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Type Distribution */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Types</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              {typeData.slice(0, 4).map((type) => (
                <div key={type.type} className="flex justify-between">
                  <span className="truncate">{type.type.slice(0, 4)}</span>
                  <span className="font-medium">{type.count}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Mana Sources */}
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-4 w-4" />
              <span className="text-xs font-medium">Mana</span>
            </div>
            <div className="space-y-1">
              <div className="flex gap-1">
                {Object.entries(deckSummary.mana.sources)
                  .filter(([_, count]) => Number(count) > 0)
                  .slice(0, 5)
                  .map(([color, count]) => (
                    <div key={color} className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        color === 'W' ? 'bg-yellow-200' :
                        color === 'U' ? 'bg-blue-200' :
                        color === 'B' ? 'bg-gray-600' :
                        color === 'R' ? 'bg-red-200' :
                        color === 'G' ? 'bg-green-200' : 'bg-gray-200'
                      }`} />
                      <span className="text-xs font-medium">{count}</span>
                    </div>
                  ))}
              </div>
              <div className="text-xs text-muted-foreground">
                T1: {deckSummary.mana.untappedPctByTurn.t1}%
              </div>
            </div>
          </Card>
        </div>

        {/* Footer Chips */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Legality */}
            <Badge 
              variant={deckSummary.legality.ok ? "default" : "destructive"}
              className="text-xs cursor-pointer"
              onClick={onAnalysis}
            >
              {deckSummary.legality.ok ? 'Legal' : `Issues (${deckSummary.legality.issues.length})`}
            </Badge>

            {/* Tags */}
            {deckSummary.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}

            {/* Deckbox indicator - would check if linked storage exists */}
            <Badge variant="outline" className="text-xs cursor-pointer" onClick={onDeckbox}>
              <Box className="h-3 w-3 mr-1" />
              Deckbox
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {onExport && (
              <Button variant="ghost" size="sm" onClick={onExport}>
                <Download className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}