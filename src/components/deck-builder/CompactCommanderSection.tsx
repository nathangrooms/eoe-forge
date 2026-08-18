import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Crown, Edit, X } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { CommanderSelector } from './CommanderSelector';

interface CompactCommanderSectionProps {
  currentCommander?: any;
}

export function CompactCommanderSection({ currentCommander }: CompactCommanderSectionProps) {
  const [showCommanderDialog, setShowCommanderDialog] = useState(false);
  const { setCommander } = useDeckStore();

  const removeCommander = () => {
    setCommander(undefined as any);
  };

  if (!currentCommander) {
    return (
      <Card className="border-dashed border-2 border-primary/30 bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Crown className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold">No Commander Selected</h3>
                <p className="text-sm text-muted-foreground">Choose a legendary creature to lead your deck</p>
              </div>
            </div>
            <Dialog open={showCommanderDialog} onOpenChange={setShowCommanderDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  <Crown className="h-4 w-4 mr-2" />
                  Select Commander
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary" />
                    Choose Your Commander
                  </DialogTitle>
                </DialogHeader>
                <CommanderSelector 
                  currentCommander={currentCommander}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30 border-primary/30">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4">
          {/* Top row: Image + Info + Actions */}
          <div className="flex items-start gap-4">
            {/* Commander Image */}
            <div className="relative flex-shrink-0">
              {currentCommander.image_uris?.normal ? (
                <img 
                  src={currentCommander.image_uris.normal} 
                  alt={currentCommander.name}
                  className="w-16 h-auto rounded border-2 border-primary/30"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                    e.currentTarget.onerror = null;
                  }}
                />
              ) : (
                <div className="w-16 h-20 bg-muted rounded border-2 border-primary/30 flex items-center justify-center">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
              )}
              <div className="absolute -top-2 -right-2 bg-primary rounded-full p-1">
                <Crown className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>

            {/* Commander Info */}
            <div className="flex-1 min-w-0">
              <Badge variant="outline" className="text-xs text-primary mb-1">COMMANDER</Badge>
              <h3 className="font-bold text-base md:text-lg truncate">{currentCommander.name}</h3>
              <p className="text-xs md:text-sm text-muted-foreground mb-2 truncate">{currentCommander.type_line}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {currentCommander.mana_cost && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {currentCommander.mana_cost}
                  </Badge>
                )}
                {(currentCommander.power && currentCommander.toughness) && (
                  <Badge variant="secondary" className="text-xs">
                    {currentCommander.power}/{currentCommander.toughness}
                  </Badge>
                )}
                {currentCommander.colors?.length > 0 && (
                  <div className="flex gap-1">
                    {currentCommander.colors.map((color: string) => (
                      <div 
                        key={color}
                        className={`w-3 h-3 rounded-full border ${getColorClass(color)}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <Dialog open={showCommanderDialog} onOpenChange={setShowCommanderDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4 md:mr-1" />
                    <span className="hidden md:inline">Change</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5 text-primary" />
                      Choose Your Commander
                    </DialogTitle>
                  </DialogHeader>
                  <CommanderSelector 
                    currentCommander={currentCommander}
                  />
                </DialogContent>
              </Dialog>
              
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={removeCommander}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
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