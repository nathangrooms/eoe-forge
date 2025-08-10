import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Plus, Eye, Zap, Activity, Globe, Rocket, Cpu } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';

interface CardData {
  id: string;
  name: string;
  cmc: number;
  type_line: string;
  colors?: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    art_crop?: string;
  };
  mechanics?: string[];
  prices?: {
    usd?: string;
  };
}

interface CardPreviewProps {
  card: CardData;
  showAddButton?: boolean;
  variant?: 'grid' | 'list';
}

const getMechanicIcon = (mechanic: string) => {
  switch (mechanic.toLowerCase()) {
    case 'spacecraft': return Rocket;
    case 'station': return Cpu;
    case 'warp': return Zap;
    case 'void': return Activity;
    case 'planet': return Globe;
    default: return Zap;
  }
};

const getMechanicColor = (mechanic: string) => {
  switch (mechanic.toLowerCase()) {
    case 'spacecraft': return 'text-spacecraft';
    case 'station': return 'text-station';
    case 'warp': return 'text-warp';
    case 'void': return 'text-void';
    case 'planet': return 'text-planet';
    default: return 'text-primary';
  }
};

export const CardPreview = ({ card, showAddButton = true, variant = 'grid' }: CardPreviewProps) => {
  const [showModal, setShowModal] = useState(false);
  const deck = useDeckStore();

  const addCard = () => {
    deck.addCard({
      id: card.id,
      name: card.name,
      cmc: card.cmc,
      type_line: card.type_line,
      colors: card.colors || [],
      quantity: 1,
      category: card.type_line.toLowerCase().includes('creature') ? 'creatures' : 
               card.type_line.toLowerCase().includes('land') ? 'lands' :
               card.type_line.toLowerCase().includes('instant') ? 'instants' :
               card.type_line.toLowerCase().includes('sorcery') ? 'sorceries' :
               card.type_line.toLowerCase().includes('enchantment') ? 'enchantments' :
               card.type_line.toLowerCase().includes('artifact') ? 'artifacts' :
               card.type_line.toLowerCase().includes('planeswalker') ? 'planeswalkers' : 'other',
      mechanics: card.mechanics || []
    });
  };

  const CardImage = ({ className }: { className?: string }) => (
    <div className={`relative ${className || ''}`}>
      {card.image_uris?.normal ? (
        <img 
          src={card.image_uris.normal} 
          alt={card.name}
          className="w-full rounded-lg shadow-lg"
        />
      ) : (
        <div className="w-full aspect-[5/7] bg-muted rounded-lg flex items-center justify-center">
          <span className="text-muted-foreground">No Image</span>
        </div>
      )}
      
      {showAddButton && (
        <Button
          size="sm"
          className="absolute top-2 right-2 shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            addCard();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  const CardInfo = ({ detailed = false }: { detailed?: boolean }) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-lg leading-tight">{card.name}</h3>
        <span className="text-sm font-medium bg-muted px-2 py-1 rounded">
          {card.cmc}
        </span>
      </div>
      
      <p className="text-sm text-muted-foreground">{card.type_line}</p>
      
      {card.power && card.toughness && (
        <p className="text-sm font-medium">{card.power}/{card.toughness}</p>
      )}

      {card.mechanics && card.mechanics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.mechanics.map((mechanic) => {
            const Icon = getMechanicIcon(mechanic);
            const colorClass = getMechanicColor(mechanic);
            return (
              <Badge key={mechanic} variant="outline" className="text-xs">
                <Icon className={`h-3 w-3 mr-1 ${colorClass}`} />
                {mechanic}
              </Badge>
            );
          })}
        </div>
      )}

      {detailed && card.oracle_text && (
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm whitespace-pre-line">{card.oracle_text}</p>
        </div>
      )}

      {detailed && card.prices?.usd && (
        <div className="flex items-center justify-between text-sm">
          <span>Price:</span>
          <span className="font-medium">${card.prices.usd}</span>
        </div>
      )}
    </div>
  );

  if (variant === 'list') {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <Card className="hover:bg-muted/50 cursor-pointer transition-colors">
            <CardContent className="p-4">
              <div className="flex space-x-4">
                <div className="w-16 h-20 flex-shrink-0">
                  {card.image_uris?.small && (
                    <img 
                      src={card.image_uris.small} 
                      alt={card.name}
                      className="w-full h-full object-cover rounded"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <CardInfo />
                </div>
                <div className="flex flex-col space-y-2">
                  {showAddButton && (
                    <Button size="sm" onClick={addCard}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowModal(true)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </HoverCardTrigger>
        <HoverCardContent className="w-80" side="left">
          <CardImage />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <>
      <Card 
        className="group hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
        onClick={() => setShowModal(true)}
      >
        <CardContent className="p-3">
          <CardImage className="mb-3" />
          <CardInfo />
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{card.name}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <CardImage />
            </div>
            <div>
              <CardInfo detailed />
              {showAddButton && (
                <Button 
                  className="w-full mt-4" 
                  onClick={() => {
                    addCard();
                    setShowModal(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Deck
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};