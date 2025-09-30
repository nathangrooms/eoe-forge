import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { getPublicDeck, trackShareEvent, type PublicDeckData } from "@/lib/api/shareAPI";
import { EnhancedDeckAnalysisPanel } from "@/components/deck-builder/EnhancedDeckAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Download, ExternalLink, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { exportDeckToText } from "@/lib/deckExport";
import { UniversalCardDisplay } from "@/components/universal/UniversalCardDisplay";
import { UniversalCardModal } from "@/components/enhanced/UniversalCardModal";

export default function PublicDeck() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicDeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardModal, setShowCardModal] = useState(false);

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

  // Group cards by type for display
  const cardGroups = [
    { title: 'Commander', cards: displayCards.filter((c: any) => c.is_commander) },
    { title: 'Creatures', cards: displayCards.filter((c: any) => !c.is_commander && c.type_line?.includes('Creature')) },
    { title: 'Instants', cards: displayCards.filter((c: any) => c.type_line?.includes('Instant') && !c.type_line?.includes('Sorcery')) },
    { title: 'Sorceries', cards: displayCards.filter((c: any) => c.type_line?.includes('Sorcery')) },
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
            <div className="flex flex-col gap-4">
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold">{deck.name}</h1>
                    <Badge variant="outline" className="gap-1">
                      <Eye className="h-3 w-3" />
                      Read-only
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
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
                  {commander && (
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Commander:</span>{' '}
                      <span className="font-medium">{commander.name}</span>
                    </div>
                  )}
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
              
              {/* Stats row */}
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Creatures:</span>
                  <Badge variant="secondary">{deck.counts.creatures}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Spells:</span>
                  <Badge variant="secondary">{deck.counts.instants + deck.counts.sorceries}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Artifacts:</span>
                  <Badge variant="secondary">{deck.counts.artifacts}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Enchantments:</span>
                  <Badge variant="secondary">{deck.counts.enchantments}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Lands:</span>
                  <Badge variant="secondary">{deck.counts.lands}</Badge>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Analysis Panel */}
            <div className="lg:col-span-1">
              <EnhancedDeckAnalysisPanel 
                deck={transformedCards} 
                format={deck.format}
              />
            </div>

            {/* Visual Deck Display */}
            <div className="lg:col-span-3 space-y-6">
              {cardGroups.map((group) => (
                <Card key={group.title}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{group.title}</span>
                      <Badge variant="outline">
                        {group.cards.reduce((sum: number, c: any) => sum + c.quantity, 0)} cards
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UniversalCardDisplay
                      cards={group.cards}
                      viewMode="grid"
                      onCardClick={handleCardClick}
                      compact={false}
                    />
                  </CardContent>
                </Card>
              ))}
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
