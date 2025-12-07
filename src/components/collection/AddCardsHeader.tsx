import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Search,
  Zap,
  Package,
  Crown,
  Box,
  Camera,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface AddCardsHeaderProps {
  addToCollection: boolean;
  addToDeck: boolean;
  addToBox: boolean;
  selectedDeckName?: string;
  selectedBoxName?: string;
}

export function AddCardsHeader({
  addToCollection,
  addToDeck,
  addToBox,
  selectedDeckName,
  selectedBoxName,
}: AddCardsHeaderProps) {
  const activeTargets = [
    addToCollection && 'Collection',
    addToDeck && selectedDeckName,
    addToBox && selectedBoxName,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Scanner Promo Banner */}
      <Card className="relative overflow-hidden border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shrink-0">
                <Camera className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Card Scanner</h3>
                  <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-600 border-amber-500/30">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Fast
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Quickly add cards by scanning them with your camera
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 shrink-0">
              <Link to="/scan">
                <Camera className="h-4 w-4" />
                Open Scanner
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/10 via-purple-500/5 to-blue-500/10 border border-blue-500/20 p-4 sm:p-6">
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -translate-y-24 translate-x-24" />
        
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shrink-0">
              <Search className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Add Cards</h2>
              <p className="text-sm text-muted-foreground">Search and add cards manually</p>
            </div>
          </div>
          
          {activeTargets.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Adding to:</span>
              {addToCollection && (
                <Badge variant="secondary" className="gap-1.5">
                  <Package className="h-3 w-3" />
                  Collection
                </Badge>
              )}
              {addToDeck && selectedDeckName && (
                <Badge variant="secondary" className="gap-1.5 bg-purple-500/20 text-purple-400 border-purple-500/30">
                  <Crown className="h-3 w-3" />
                  {selectedDeckName}
                </Badge>
              )}
              {addToBox && selectedBoxName && (
                <Badge variant="secondary" className="gap-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                  <Box className="h-3 w-3" />
                  {selectedBoxName}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/50 border border-border/50 text-xs">
            <Zap className="h-3 w-3 text-amber-500" />
            Instant Add
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/50 border border-border/50 text-xs">
            <Search className="h-3 w-3 text-blue-500" />
            Smart Search
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/50 border border-border/50 text-xs">
            <Package className="h-3 w-3 text-green-500" />
            Multi-Destination
          </div>
        </div>
      </div>
    </div>
  );
}
