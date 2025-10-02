import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { UniversalCardModal } from '@/components/enhanced/UniversalCardModal';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { 
  Crown, 
  Share2, 
  Heart, 
  Download, 
  Copy,
  Play,
  BarChart3,
  FileText,
  Eye,
  Settings,
  Star,
  Edit
} from 'lucide-react';

interface DeckCard {
  id: string;
  card_id: string;
  card_name: string;
  quantity: number;
  is_commander: boolean;
  is_sideboard: boolean;
  card?: {
    name: string;
    type_line: string;
    cmc: number;
    colors: string[];
    image_uris: any;
    prices: any;
    oracle_text: string;
    power?: string;
    toughness?: string;
  };
}

interface DeckData {
  id: string;
  name: string;
  format: string;
  colors: string[];
  power_level: number;
  description?: string;
  is_public: boolean;
  created_at: string;
  cards: DeckCard[];
}

export default function DeckInterface() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deck, setDeck] = useState<DeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (id) {
      loadDeck();
    }
  }, [id]);

  const loadDeck = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);
      
      const { data: deckData, error: deckError } = await supabase
        .from('user_decks')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (deckError) throw deckError;
      if (!deckData) {
        showError('Deck not found');
        navigate('/decks');
        return;
      }

      const { data: cardsData, error: cardsError } = await supabase
        .from('deck_cards')
        .select(`
          id,
          card_id,
          card_name,
          quantity,
          is_commander,
          is_sideboard
        `)
        .eq('deck_id', id);

      if (cardsError) throw cardsError;

      setDeck({
        ...deckData,
        cards: cardsData || []
      });

      // Check if deck is favorited
      const { data: favoriteData } = await supabase
        .from('favorite_decks')
        .select('*')
        .eq('user_id', user.id)
        .eq('deck_id', id)
        .maybeSingle();

      setIsFavorited(!!favoriteData);

    } catch (error) {
      console.error('Error loading deck:', error);
      showError('Failed to load deck');
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!user || !deck) return;

    try {
      if (isFavorited) {
        await supabase
          .from('favorite_decks')
          .delete()
          .eq('user_id', user.id)
          .eq('deck_id', deck.id);
        
        setIsFavorited(false);
        showSuccess('Removed from favorites');
      } else {
        await supabase
          .from('favorite_decks')
          .insert({
            user_id: user.id,
            deck_id: deck.id
          });
        
        setIsFavorited(true);
        showSuccess('Added to favorites');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError('Failed to update favorites');
    }
  };

  const exportDeck = (format: 'arena' | 'modo' | 'text') => {
    if (!deck) return;

    let exportText = '';
    const commander = deck.cards.find(c => c.is_commander);
    const mainboard = deck.cards.filter(c => !c.is_sideboard && !c.is_commander);
    const sideboard = deck.cards.filter(c => c.is_sideboard);

    if (format === 'arena') {
      exportText = 'Deck\n';
      if (commander) {
        exportText += `1 ${commander.card_name} (Commander)\n`;
      }
      exportText += mainboard.map(c => `${c.quantity} ${c.card_name}`).join('\n');
      if (sideboard.length > 0) {
        exportText += `\n\nSideboard\n${sideboard.map(c => `${c.quantity} ${c.card_name}`).join('\n')}`;
      }
    } else {
      if (commander) {
        exportText += `1x ${commander.card_name} (Commander)\n\n`;
      }
      exportText += mainboard.map(c => `${c.quantity}x ${c.card_name}`).join('\n');
      if (sideboard.length > 0) {
        exportText += `\n\nSideboard:\n${sideboard.map(c => `${c.quantity}x ${c.card_name}`).join('\n')}`;
      }
    }

    navigator.clipboard.writeText(exportText);
    showSuccess('Deck copied to clipboard');
  };

  const getDeckStats = () => {
    if (!deck) return { totalCards: 0, avgCmc: 0, totalValue: 0 };

    const totalCards = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
    const totalCmc = deck.cards.reduce((sum, card) => sum + (card.card?.cmc || 0) * card.quantity, 0);
    const avgCmc = totalCards > 0 ? totalCmc / totalCards : 0;
    const totalValue = deck.cards.reduce((sum, card) => {
      const price = parseFloat(card.card?.prices?.usd || '0');
      return sum + (price * card.quantity);
    }, 0);

    return { totalCards, avgCmc, totalValue };
  };

  const getCardsByType = () => {
    if (!deck) return {};

    const commanders = deck.cards.filter(c => c.is_commander);
    const creatures = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      c.card?.type_line?.includes('Creature')
    );
    const spells = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      (c.card?.type_line?.includes('Instant') || c.card?.type_line?.includes('Sorcery'))
    );
    const artifacts = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      c.card?.type_line?.includes('Artifact') &&
      !c.card?.type_line?.includes('Land')
    );
    const enchantments = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      c.card?.type_line?.includes('Enchantment') &&
      !c.card?.type_line?.includes('Land')
    );
    const planeswalkers = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      c.card?.type_line?.includes('Planeswalker')
    );
    const lands = deck.cards.filter(c => 
      !c.is_commander && 
      !c.is_sideboard && 
      c.card?.type_line?.includes('Land')
    );
    const sideboard = deck.cards.filter(c => c.is_sideboard);

    return {
      commanders,
      creatures,
      spells,
      artifacts,
      enchantments,
      planeswalkers,
      lands,
      sideboard
    };
  };

  const renderCardSection = (title: string, cards: DeckCard[], icon?: React.ReactNode) => {
    if (cards.length === 0) return null;

    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-lg">
            {icon}
            <span className="ml-2">{title}</span>
            <Badge variant="outline" className="ml-2">
              {cards.reduce((sum, card) => sum + card.quantity, 0)} cards
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cards.map((deckCard) => (
              <div 
                key={deckCard.id}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => {
                  setSelectedCard(deckCard.card);
                  setShowCardModal(true);
                }}
              >
                <div className="w-12 h-16 bg-muted rounded flex-shrink-0 overflow-hidden">
                  {deckCard.card?.image_uris?.small && (
                    <img 
                      src={deckCard.card.image_uris.small}
                      alt={deckCard.card_name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{deckCard.card_name}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {deckCard.card?.type_line}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono">x{deckCard.quantity}</span>
                    {deckCard.card?.cmc !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        {deckCard.card.cmc}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <StandardPageLayout
        title="Loading Deck..."
        description="Please wait while we load your deck"
      >
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </StandardPageLayout>
    );
  }

  if (!deck) {
    return (
      <StandardPageLayout
        title="Deck Not Found"
        description="The requested deck could not be found"
      >
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">This deck might have been deleted or you don't have permission to view it.</p>
            <Button onClick={() => navigate('/decks')}>
              Back to Decks
            </Button>
          </CardContent>
        </Card>
      </StandardPageLayout>
    );
  }

  const stats = getDeckStats();
  const cardsByType = getCardsByType();

  return (
    <StandardPageLayout
      title={deck.name}
      description={`${deck.format.charAt(0).toUpperCase() + deck.format.slice(1)} deck • ${stats.totalCards} cards`}
      action={
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFavorite}
          >
            <Heart className={`h-4 w-4 mr-2 ${isFavorited ? 'fill-current text-red-500' : ''}`} />
            {isFavorited ? 'Favorited' : 'Favorite'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportDeck('text')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          
          <Button
            size="sm"
            onClick={() => navigate(`/deck-builder/${deck.id}`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit Deck
          </Button>
        </div>
      }
    >
      {/* Hero Section */}
      {cardsByType.commanders && cardsByType.commanders.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div 
            className="h-48 bg-gradient-to-r from-primary/20 to-secondary/20 flex items-end"
            style={{
              backgroundImage: cardsByType.commanders[0].card?.image_uris?.art_crop 
                ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.8)), url(${cardsByType.commanders[0].card.image_uris.art_crop})`
                : undefined,
              backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="p-6 text-foreground">
            <div className="flex items-center mb-2">
              <Crown className="h-6 w-6 text-yellow-400 mr-2" />
              <h1 className="text-2xl font-bold">{cardsByType.commanders[0].card_name}</h1>
            </div>
            <p className="text-foreground/80">{cardsByType.commanders[0].card?.type_line}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Deck Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalCards}</div>
              <div className="text-sm text-muted-foreground">Total Cards</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.avgCmc.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">Avg. CMC</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">${stats.totalValue.toFixed(0)}</div>
              <div className="text-sm text-muted-foreground">Est. Value</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{deck.power_level}/10</div>
              <div className="text-sm text-muted-foreground">Power Level</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visual">
            <Eye className="h-4 w-4 mr-2" />
            Visual
          </TabsTrigger>
          <TabsTrigger value="list">
            <FileText className="h-4 w-4 mr-2" />
            List
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="space-y-6">
          {/* Card Sections */}
          {renderCardSection('Commander', cardsByType.commanders, <Crown className="h-5 w-5 text-yellow-500" />)}
          {renderCardSection('Creatures', cardsByType.creatures)}
          {renderCardSection('Instants & Sorceries', cardsByType.spells)}
          {renderCardSection('Artifacts', cardsByType.artifacts)}
          {renderCardSection('Enchantments', cardsByType.enchantments)}
          {renderCardSection('Planeswalkers', cardsByType.planeswalkers)}
          {renderCardSection('Lands', cardsByType.lands)}
          {renderCardSection('Sideboard', cardsByType.sideboard)}
        </TabsContent>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {Object.entries(cardsByType).map(([type, cards]) => 
                  cards.length > 0 && (
                    <div key={type}>
                      <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground mb-2">
                        {type} ({cards.reduce((sum, card) => sum + card.quantity, 0)})
                      </h3>
                      {cards.map((card) => (
                        <div key={card.id} className="flex justify-between items-center py-1">
                          <span>{card.quantity}x {card.card_name}</span>
                          <span className="text-sm text-muted-foreground">
                            {card.card?.prices?.usd ? `$${card.card.prices.usd}` : ''}
                          </span>
                        </div>
                      ))}
                      <Separator className="my-3" />
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Deck Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Advanced deck analysis features coming soon. This will include mana curve analysis, 
                color distribution, synergy detection, and power level breakdown.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Card Modal */}
      <UniversalCardModal
        card={selectedCard}
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
      />
    </StandardPageLayout>
  );
}