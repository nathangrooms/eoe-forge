import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Printer, Download, FileText, Loader2, CheckCircle } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface DeckProxyGeneratorProps {
  deckCards: any[];
  deckName: string;
  commander?: any;
}

// Load jsPDF from CDN
const loadJsPDF = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).jspdf) {
      resolve((window as any).jspdf.jsPDF);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.async = true;
    script.onload = () => {
      if ((window as any).jspdf) {
        resolve((window as any).jspdf.jsPDF);
      } else {
        reject(new Error('jsPDF failed to initialize'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load jsPDF library'));
    document.head.appendChild(script);
  });
};

export function DeckProxyGenerator({ deckCards, deckName, commander }: DeckProxyGeneratorProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState('a4');
  const [quality, setQuality] = useState('high');
  const [showOnlyOwned, setShowOnlyOwned] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Combine commander with deck cards for full list
  const allCards = React.useMemo(() => {
    const cards = [...deckCards];
    if (commander && !cards.some(c => c.name === commander.name)) {
      cards.unshift({ ...commander, quantity: 1, isCommander: true });
    }
    return cards;
  }, [deckCards, commander]);

  // Initialize selected cards when deck cards change
  useEffect(() => {
    setSelectedCards(new Set(allCards.map(c => c.id || c.name)));
  }, [allCards]);

  const toggleCard = (cardId: string) => {
    const newSelected = new Set(selectedCards);
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      newSelected.add(cardId);
    }
    setSelectedCards(newSelected);
  };

  const selectAll = () => {
    setSelectedCards(new Set(allCards.map(c => c.id || c.name)));
  };

  const clearAll = () => {
    setSelectedCards(new Set());
  };

  const getCardImage = (card: any) => {
    if (card.image_uris?.normal) return card.image_uris.normal;
    if (card.image_uris?.large) return card.image_uris.large;
    if (card.image) return card.image;
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image`;
  };

  const getCardId = (card: any) => card.id || card.name;

  const loadImageAsBase64 = async (url: string, cardName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            resolve(dataUrl);
          } catch (e) {
            console.error(`Canvas export failed for ${cardName}:`, e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      
      img.onerror = () => {
        console.error(`Failed to load image for ${cardName}`);
        resolve(null);
      };
      
      img.src = url;
    });
  };

  const generateProxies = async () => {
    if (selectedCards.size === 0) {
      showError('No cards selected', 'Please select at least one card');
      return;
    }

    setGenerating(true);
    setProgress(5);
    
    try {
      const selectedCardsList = allCards.filter(c => selectedCards.has(getCardId(c)));
      
      // Expand cards by quantity
      const expandedCards: any[] = [];
      selectedCardsList.forEach(card => {
        const qty = card.quantity || 1;
        for (let i = 0; i < qty; i++) {
          expandedCards.push(card);
        }
      });

      setProgress(10);
      
      // Load jsPDF from CDN
      const jsPDF = await loadJsPDF();
      
      setProgress(15);
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: paperSize === 'letter' ? 'letter' : 'a4'
      });

      const pageWidth = paperSize === 'letter' ? 8.5 : 8.27;
      const pageHeight = paperSize === 'letter' ? 11 : 11.69;
      
      const cardWidth = 2.5;
      const cardHeight = 3.5;
      const cols = 3;
      const rows = 3;
      const marginX = (pageWidth - (cols * cardWidth)) / 2;
      const marginY = (pageHeight - (rows * cardHeight)) / 2;

      // Pre-load unique images
      const uniqueCards = new Map<string, any>();
      selectedCardsList.forEach(card => {
        if (!uniqueCards.has(card.name)) {
          uniqueCards.set(card.name, card);
        }
      });
      
      const imageCache = new Map<string, string | null>();
      const uniqueCardArray = Array.from(uniqueCards.values());
      
      for (let i = 0; i < uniqueCardArray.length; i++) {
        const card = uniqueCardArray[i];
        const imageUrl = getCardImage(card);
        setProgress(15 + Math.round((i / uniqueCardArray.length) * 40));
        const base64 = await loadImageAsBase64(imageUrl, card.name);
        imageCache.set(card.name, base64);
      }

      setProgress(55);

      let cardIndex = 0;
      for (const card of expandedCards) {
        if (cardIndex > 0 && cardIndex % (cols * rows) === 0) {
          doc.addPage();
        }

        const posOnPage = cardIndex % (cols * rows);
        const col = posOnPage % cols;
        const row = Math.floor(posOnPage / cols);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        const base64 = imageCache.get(card.name);
        
        if (base64) {
          try {
            doc.addImage(base64, 'JPEG', x, y, cardWidth, cardHeight);
          } catch (imgError) {
            drawPlaceholder(doc, x, y, cardWidth, cardHeight, card.name);
          }
        } else {
          drawPlaceholder(doc, x, y, cardWidth, cardHeight, card.name);
        }

        cardIndex++;
        setProgress(55 + Math.round((cardIndex / expandedCards.length) * 40));
      }

      setProgress(95);

      const fileName = `${deckName.replace(/[^a-z0-9]/gi, '_')}_proxies.pdf`;
      doc.save(fileName);
      
      setProgress(100);
      showSuccess('Proxies Generated!', `${expandedCards.length} cards, ${Math.ceil(expandedCards.length / 9)} pages`);
    } catch (error) {
      console.error('Generation failed:', error);
      showError('Generation failed', String(error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  const drawPlaceholder = (doc: any, x: number, y: number, width: number, height: number, name: string) => {
    doc.setDrawColor(100);
    doc.setFillColor(240, 240, 240);
    doc.rect(x, y, width, height, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(60);
    doc.text(name, x + 0.1, y + 0.3, { maxWidth: width - 0.2 });
  };

  const exportText = () => {
    const selectedCardsList = allCards.filter(c => selectedCards.has(getCardId(c)));
    const textList = selectedCardsList.map(c => `${c.quantity || 1}x ${c.name}`).join('\n');
    
    const blob = new Blob([textList], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName}-proxies.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess('Exported', 'Card list exported');
  };

  const cardsPerPage = 9;
  const totalCards = allCards
    .filter(c => selectedCards.has(getCardId(c)))
    .reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalPages = Math.ceil(totalCards / cardsPerPage);
  const totalUniqueSelected = selectedCards.size;
  const totalUniqueCards = allCards.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-primary" />
            Proxy Generator
          </CardTitle>
          <CardDescription className="text-xs">Generate printable proxy cards for playtesting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Settings Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Paper</Label>
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quality</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-end">
              <div className="flex items-center gap-2 text-xs">
                <Switch
                  id="show-all"
                  checked={!showOnlyOwned}
                  onCheckedChange={(checked) => setShowOnlyOwned(!checked)}
                  className="scale-75"
                />
                <label htmlFor="show-all" className="cursor-pointer">Show all cards</label>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-xs text-muted-foreground">Selected</div>
              <div className="font-bold">{totalUniqueSelected}/{totalUniqueCards}</div>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-xs text-muted-foreground">Cards</div>
              <div className="font-bold">{totalCards}</div>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-xs text-muted-foreground">Pages</div>
              <div className="font-bold">{totalPages}</div>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-xs text-muted-foreground">Per Page</div>
              <div className="font-bold">{cardsPerPage}</div>
            </div>
          </div>

          {/* Selection Controls + Download - Same Row */}
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear
            </Button>
            {totalUniqueSelected === totalUniqueCards && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                All
              </Badge>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={exportText}
              disabled={selectedCards.size === 0}
            >
              <FileText className="h-3 w-3 mr-1" />
              List
            </Button>
            <Button 
              onClick={generateProxies} 
              disabled={selectedCards.size === 0 || generating}
              size="sm"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {progress}%
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 mr-1" />
                  PDF ({totalCards})
                </>
              )}
            </Button>
          </div>

          {/* Card List */}
          <ScrollArea className="h-[300px] border rounded-lg">
            <div className="p-2 space-y-1">
              {allCards.map((card, index) => (
                <div
                  key={`${getCardId(card)}-${index}`}
                  className={`flex items-center justify-between p-1.5 rounded hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedCards.has(getCardId(card)) ? 'bg-primary/10 border border-primary/50' : 'border border-transparent'
                  }`}
                  onClick={() => toggleCard(getCardId(card))}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Checkbox
                      checked={selectedCards.has(getCardId(card))}
                      onCheckedChange={() => toggleCard(getCardId(card))}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                    <img 
                      src={getCardImage(card)}
                      alt={card.name}
                      className="w-8 h-11 rounded object-cover flex-shrink-0"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {card.name}
                        {card.isCommander && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">CMD</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs ml-2">{card.quantity || 1}x</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>

          <p className="text-[10px] text-muted-foreground">
            Proxies are for playtesting only. 2.5" x 3.5" card size, 9 per page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
