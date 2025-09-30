import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { getPublicDeck, trackShareEvent, type PublicDeckData } from "@/lib/api/shareAPI";
import { EnhancedDeckAnalysisPanel } from "@/components/deck-builder/EnhancedDeckAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Download, ExternalLink, DollarSign, ChevronDown, ChevronRight, Crown, Users, Mountain, Sparkles, Scroll, Gem, Shield, Swords, Skull } from "lucide-react";
import { toast } from "sonner";
import { exportDeckToText } from "@/lib/deckExport";
import { UniversalCardModal } from "@/components/enhanced/UniversalCardModal";

export default function PublicDeck() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicDeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Commander', 'Creatures', 'Instants & Sorceries']));

  useEffect(() => {
    if (!slug) return;

    const loadDeck = async () => {
      try {
        const result = await getPublicDeck(slug);
        setData(result);
        
        // Track view once per session
        if (result && !tracked) {
          await trackShareEvent(slug, 'view');
          setTracked(true);
        }
      } catch (err) {
        console.error('Failed to load public deck:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDeck();
  }, [slug, tracked]);

  const handleCopyList = async () => {
    if (!data) return;
    
    try {
      const text = exportDeckToText(data.deck.cards);
      await navigator.clipboard.writeText(text);
      toast.success("Decklist copied to clipboard");
      if (slug) await trackShareEvent(slug, 'copy');
    } catch (err) {
      toast.error("Failed to copy decklist");
    }
  };

  const handleExport = () => {
    if (!data) return;
    
    const text = exportDeckToText(data.deck.cards);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.deck.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Decklist exported");
  };

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowCardModal(true);
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading deck...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Deck Not Found</h1>
          <p className="text-muted-foreground mb-6">This deck is no longer publicly available.</p>
          <Button asChild>
            <a href="/">Go to Homepage</a>
          </Button>
        </div>
      </div>
    );
  }

  const { deck, viewCount } = data;
  const commander = deck.commander;
  const ogImage = commander?.image || 'https://cards.scryfall.io/normal/front/default.jpg';
  const pageTitle = `${deck.name} — DeckMatrix`;
  const pageDescription = `${deck.format} deck${commander ? ` featuring ${commander.name}` : ''} — Power Level ${deck.power.score}/10. View and export this deck.`;
  const pageUrl = `${window.location.origin}/p/${slug}`;
  
  // Calculate total deck value
  const totalValue = deck.cards.reduce((sum: number, card: any) => {
    const price = parseFloat(card.price_usd || '0');
    return sum + (price * card.quantity);
  }, 0);
  
  // Transform database cards for display
  const displayCards = deck.cards.map((card: any) => ({
    id: card.card_id,
    name: card.card_name,
    image_uris: { normal: card.image || `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.card_name)}&format=image` },
    mana_cost: card.mana_cost,
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || '',
    power: card.power,
    toughness: card.toughness,
    colors: card.colors || [],
    rarity: card.rarity || 'common',
    set_name: card.set_name || '',
    set: card.set || '',
    cmc: card.cmc || 0,
    prices: { usd: card.price_usd },
    quantity: card.quantity,
    is_commander: card.is_commander
  }));

  // Transform for analysis panel
  const transformedCards = deck.cards.map((card: any) => ({
    id: card.card_id,
    name: card.card_name,
    cmc: card.cmc || 0,
    type_line: card.type_line || '',
    colors: card.colors || [],
    mana_cost: card.mana_cost,
    quantity: card.quantity,
    category: (card.is_commander ? 'commanders' : 
              card.type_line?.toLowerCase().includes('creature') ? 'creatures' : 
              card.type_line?.toLowerCase().includes('land') ? 'lands' :
              card.type_line?.toLowerCase().includes('instant') ? 'instants' :
              card.type_line?.toLowerCase().includes('sorcery') ? 'sorceries' :
              card.type_line?.toLowerCase().includes('artifact') ? 'artifacts' :
              card.type_line?.toLowerCase().includes('enchantment') ? 'enchantments' :
              card.type_line?.toLowerCase().includes('planeswalker') ? 'planeswalkers' : 'other') as any,
    mechanics: card.keywords || []
  }));

  // Group cards by type for display with icons
  const CATEGORY_CONFIG: Record<string, { icon: any, color: string }> = {
    'Commander': { icon: Crown, color: 'border-l-yellow-500 bg-yellow-500/10' },
    'Creatures': { icon: Users, color: 'border-l-green-500 bg-green-500/10' },
    'Instants & Sorceries': { icon: Sparkles, color: 'border-l-blue-500 bg-blue-500/10' },
    'Artifacts': { icon: Shield, color: 'border-l-gray-500 bg-gray-500/10' },
    'Enchantments': { icon: Gem, color: 'border-l-purple-500 bg-purple-500/10' },
    'Planeswalkers': { icon: Swords, color: 'border-l-pink-500 bg-pink-500/10' },
    'Lands': { icon: Mountain, color: 'border-l-orange-500 bg-orange-500/10' },
  };

  const cardGroups = [
    { title: 'Commander', cards: displayCards.filter((c: any) => c.is_commander) },
    { title: 'Creatures', cards: displayCards.filter((c: any) => !c.is_commander && c.type_line?.includes('Creature')) },
    { 
      title: 'Instants & Sorceries', 
      cards: displayCards.filter((c: any) => 
        c.type_line?.includes('Instant') || c.type_line?.includes('Sorcery')
      ) 
    },
    { title: 'Artifacts', cards: displayCards.filter((c: any) => c.type_line?.includes('Artifact') && !c.type_line?.includes('Creature')) },
    { title: 'Enchantments', cards: displayCards.filter((c: any) => c.type_line?.includes('Enchantment') && !c.type_line?.includes('Creature')) },
    { title: 'Planeswalkers', cards: displayCards.filter((c: any) => c.type_line?.includes('Planeswalker')) },
    { title: 'Lands', cards: displayCards.filter((c: any) => c.type_line?.includes('Land')) },
  ].filter(group => group.cards.length > 0);

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        
        {/* OpenGraph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={ogImage} />
        
        <link rel="canonical" href={pageUrl} />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold">{deck.name}</h1>
                  <Badge variant="outline" className="gap-1">
                    <Eye className="h-3 w-3" />
                    Read-only
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="capitalize">{deck.format}</span>
                  <span>•</span>
                  <span>Power Level {deck.power.score}/10</span>
                  <span>•</span>
                  <span>{deck.counts.total} cards</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${totalValue.toFixed(2)}
                  </span>
                  <span>•</span>
                  <span>{viewCount} views</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyList}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy List
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button asChild size="sm">
                  <a href="/register">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Build Your Own
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Analysis Panel */}
            <div className="lg:col-span-1 space-y-4">
              <EnhancedDeckAnalysisPanel 
                deck={transformedCards} 
                format={deck.format}
              />
            </div>

            {/* Visual Deck Display */}
            <div className="lg:col-span-3 space-y-4">
              {cardGroups.map((group) => {
                const config = CATEGORY_CONFIG[group.title];
                const Icon = config?.icon || Users;
                const isExpanded = expandedCategories.has(group.title);
                const totalCards = group.cards.reduce((sum: number, c: any) => sum + c.quantity, 0);

                return (
                  <Card key={group.title} className={`border-l-4 ${config?.color || ''}`}>
                    <CardHeader 
                      className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCategory(group.title)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <Icon className="h-5 w-5 text-primary" />
                          <CardTitle className="text-lg">{group.title}</CardTitle>
                          <Badge variant="secondary">{totalCards}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {isExpanded && (
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {group.cards.map((card: any, index: number) => (
                            <div 
                              key={`${card.id}-${index}`} 
                              className="relative group cursor-pointer"
                              onClick={() => handleCardClick(card)}
                            >
                              <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-all duration-200 shadow-sm group-hover:shadow-lg">
                                {card.image_uris?.normal ? (
                                  <img 
                                    src={card.image_uris.normal} 
                                    alt={card.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-muted">
                                    <Icon className="h-8 w-8 text-muted-foreground" />
                                  </div>
                                )}
                                
                                {/* Quantity Badge */}
                                {card.quantity > 1 && (
                                  <div className="absolute top-2 left-2">
                                    <Badge className="bg-background/90 text-foreground border font-bold">
                                      {card.quantity}x
                                    </Badge>
                                  </div>
                                )}

                                {/* Price Badge */}
                                {card.prices?.usd && (
                                  <div className="absolute top-2 right-2">
                                    <Badge className="bg-background/90 text-foreground border text-xs">
                                      ${parseFloat(card.prices.usd).toFixed(2)}
                                    </Badge>
                                  </div>
                                )}

                                {/* View Details Overlay */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <div className="text-white text-sm font-medium flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    View Details
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-2 text-center">
                                <div className="font-medium text-sm line-clamp-1">{card.name}</div>
                                <div className="text-xs text-muted-foreground">CMC {card.cmc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card Details Modal */}
        {selectedCard && (
          <UniversalCardModal
            card={selectedCard}
            isOpen={showCardModal}
            onClose={() => {
              setShowCardModal(false);
              setSelectedCard(null);
            }}
          />
        )}
      </div>
    </>
  );
}
