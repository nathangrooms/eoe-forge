import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { getPublicDeck, trackShareEvent, type PublicDeckData } from "@/lib/api/shareAPI";
import { DeckAnalysisPanel } from "@/components/deck-builder/DeckAnalysisPanel";
import { ModernDeckList } from "@/components/deck-builder/ModernDeckList";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { exportDeckToText } from "@/lib/deckExport";

export default function PublicDeck() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicDeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracked, setTracked] = useState(false);

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
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold">{deck.name}</h1>
                  <Badge variant="outline" className="gap-1">
                    <Eye className="h-3 w-3" />
                    Read-only
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="capitalize">{deck.format}</span>
                  <span>•</span>
                  <span>Power Level {deck.power.score}/10</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Analysis Panel */}
            <div className="lg:col-span-1">
              <DeckAnalysisPanel deck={deck} format={deck.format} />
            </div>

            {/* Deck List */}
            <div className="lg:col-span-2">
              <ModernDeckList
                cards={deck.cards}
                onQuantityChange={() => {}}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
