// Land recommendations section - Mobile optimized
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mountain, 
  Plus, 
  Minus, 
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface LandRecommendation {
  type: 'add' | 'remove';
  name: string;
  image?: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  category?: string;
}

interface LandRecommendationsSectionProps {
  currentLandCount: number;
  idealLandCount: number;
  recommendations: LandRecommendation[];
  onAddLand: (name: string) => void;
  onRemoveLand: (name: string) => void;
  isApplying: boolean;
}

export function LandRecommendationsSection({
  currentLandCount,
  idealLandCount,
  recommendations,
  onAddLand,
  onRemoveLand,
  isApplying
}: LandRecommendationsSectionProps) {
  const landDiff = currentLandCount - idealLandCount;
  const needsMore = landDiff < -2;
  const needsLess = landDiff > 2;
  const isOptimal = Math.abs(landDiff) <= 2;

  const landsToAdd = recommendations.filter(r => r.type === 'add');
  const landsToRemove = recommendations.filter(r => r.type === 'remove');

  const statusConfig = isOptimal 
    ? { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: Check }
    : needsMore 
      ? { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Plus }
      : { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/30', icon: Minus };

  return (
    <div className="space-y-3">
      {/* Status header */}
      <Card className={cn("border", statusConfig.border, statusConfig.bg)}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-lg", statusConfig.bg)}>
                <Mountain className={cn("h-4 w-4", statusConfig.color)} />
              </div>
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  Mana Base
                  {!isOptimal && (
                    <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {currentLandCount}/{idealLandCount} lands
                  {needsMore && ` (need ${Math.abs(landDiff)} more)`}
                  {needsLess && ` (${landDiff} too many)`}
                </p>
              </div>
            </div>
            
            <Badge variant="outline" className={cn("text-xs", statusConfig.color, statusConfig.border)}>
              {isOptimal ? 'Optimal' : needsMore ? 'Low' : 'High'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <ScrollArea className="h-[400px]">
          <div className="space-y-3 pr-3">
            {/* Lands to add */}
            {landsToAdd.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-xs font-medium text-green-400">Add Lands</span>
                  <Badge variant="secondary" className="text-[10px]">{landsToAdd.length}</Badge>
                </div>
                
                <div className="space-y-2">
                  {landsToAdd.map((land, i) => (
                    <motion.div
                      key={`add-${land.name}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 p-2 rounded-lg border border-green-500/20 bg-green-500/5"
                    >
                      {land.image && (
                        <img 
                          src={land.image} 
                          alt={land.name}
                          className="w-10 h-14 rounded object-cover flex-shrink-0"
                          onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{land.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{land.reason}</p>
                        {land.category && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">{land.category}</Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onAddLand(land.name)}
                        disabled={isApplying}
                        className="h-8 px-3 text-xs bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
                      >
                        {isApplying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Lands to remove */}
            {landsToRemove.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs font-medium text-destructive">Remove Lands</span>
                  <Badge variant="secondary" className="text-[10px]">{landsToRemove.length}</Badge>
                </div>
                
                <div className="space-y-2">
                  {landsToRemove.map((land, i) => (
                    <motion.div
                      key={`remove-${land.name}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 p-2 rounded-lg border border-destructive/20 bg-destructive/5"
                    >
                      {land.image && (
                        <img 
                          src={land.image} 
                          alt={land.name}
                          className="w-10 h-14 rounded object-cover flex-shrink-0"
                          onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{land.name}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{land.reason}</p>
                        {land.category && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">{land.category}</Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onRemoveLand(land.name)}
                        disabled={isApplying}
                        className="h-8 px-3 text-xs flex-shrink-0"
                      >
                        {isApplying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Minus className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </>
                        )}
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {recommendations.length === 0 && isOptimal && (
        <div className="text-center py-4 text-muted-foreground">
          <Check className="h-8 w-8 mx-auto mb-2 text-green-400" />
          <p className="text-sm">Your mana base looks good!</p>
        </div>
      )}
    </div>
  );
}
