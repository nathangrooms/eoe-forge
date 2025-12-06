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
}

export function DeckProxyGenerator({ deckCards, deckName }: DeckProxyGeneratorProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState('a4');
  const [quality, setQuality] = useState('high');
  const [showOnlyOwned, setShowOnlyOwned] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Initialize selected cards when deck cards change
  useEffect(() => {
    setSelectedCards(new Set(deckCards.map(c => c.id)));
  }, [deckCards]);

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
    setSelectedCards(new Set(deckCards.map(c => c.id)));
  };

  const clearAll = () => {
    setSelectedCards(new Set());
  };

  const getCardImage = (card: any) => {
    // Use the image_uris from the card data, with fallback patterns
    if (card.image_uris?.normal) return card.image_uris.normal;
    if (card.image_uris?.large) return card.image_uris.large;
    if (card.image) return card.image;
    
    // Fallback for Scryfall - use their redirect service
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image`;
  };

  // Convert image URL to base64 using a canvas approach (CORS-safe)
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
      
      // Add cache busting and use Scryfall's CORS-friendly format
      img.src = url.includes('scryfall') ? url : url;
    });
  };

  const generateProxies = async () => {
    if (selectedCards.size === 0) {
      showError('No cards selected', 'Please select at least one card to generate proxies');
      return;
    }

    setGenerating(true);
    setProgress(0);
    
    try {
      const selectedCardsList = deckCards.filter(c => selectedCards.has(c.id));
      
      // Expand cards by quantity
      const expandedCards: any[] = [];
      selectedCardsList.forEach(card => {
        const qty = card.quantity || 1;
        for (let i = 0; i < qty; i++) {
          expandedCards.push(card);
        }
      });

      // Create PDF with card images
      const { jsPDF } = await import('jspdf');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: paperSize === 'letter' ? 'letter' : 'a4'
      });

      const pageWidth = paperSize === 'letter' ? 8.5 : 8.27;
      const pageHeight = paperSize === 'letter' ? 11 : 11.69;
      
      // Card dimensions (standard MTG card size in inches)
      const cardWidth = 2.5;
      const cardHeight = 3.5;
      
      // Calculate grid - 3 columns, 3 rows
      const cols = 3;
      const rows = 3;
      const marginX = (pageWidth - (cols * cardWidth)) / 2;
      const marginY = (pageHeight - (rows * cardHeight)) / 2;

      let cardIndex = 0;
      const totalExpanded = expandedCards.length;
      
      // Pre-load all unique images first to avoid duplicate fetches
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
        setProgress(Math.round((i / uniqueCardArray.length) * 50));
        
        const base64 = await loadImageAsBase64(imageUrl, card.name);
        imageCache.set(card.name, base64);
      }

      // Now generate PDF pages
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
            console.error(`Failed to add image for ${card.name}:`, imgError);
            drawPlaceholder(doc, x, y, cardWidth, cardHeight, card.name);
          }
        } else {
          drawPlaceholder(doc, x, y, cardWidth, cardHeight, card.name);
        }

        cardIndex++;
        setProgress(50 + Math.round((cardIndex / totalExpanded) * 50));
      }

      // Save PDF
      const fileName = `${deckName.replace(/[^a-z0-9]/gi, '_')}_proxies.pdf`;
      doc.save(fileName);
      
      showSuccess(
        'Proxies Generated!',
        `Downloaded PDF with ${expandedCards.length} cards (${Math.ceil(expandedCards.length / 9)} pages)`
      );
    } catch (error) {
      console.error('Generation failed:', error);
      showError('Generation failed', String(error instanceof Error ? error.message : 'Failed to generate proxy cards PDF'));
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
    const selectedCardsList = deckCards.filter(c => selectedCards.has(c.id));
    const textList = selectedCardsList.map(c => `${c.quantity || 1}x ${c.name}`).join('\n');
    
    const blob = new Blob([textList], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName}-proxies.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess('Exported', 'Card list exported as text file');
  };

  const cardsPerPage = 9;
  const totalCards = deckCards
    .filter(c => selectedCards.has(c.id))
    .reduce((sum, c) => sum + (c.quantity || 1), 0);
  const totalPages = Math.ceil(totalCards / cardsPerPage);
  const totalUniqueSelected = selectedCards.size;
  const totalUniqueCards = deckCards.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Proxy Generator
          </CardTitle>
          <CardDescription>Generate printable proxy cards for playtesting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Download Button - TOP */}
          <div className="flex gap-2">
            <Button 
              onClick={generateProxies} 
              disabled={selectedCards.size === 0 || generating}
              className="flex-1"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating... {progress}%
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF ({totalCards} cards, {totalPages} pages)
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={exportText}
              disabled={selectedCards.size === 0}
            >
              <FileText className="mr-2 h-4 w-4" />
              Export List
            </Button>
          </div>

          {/* Generation Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Paper Size</Label>
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 (210mm x 297mm)</SelectItem>
                  <SelectItem value="letter">Letter (8.5" x 11")</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Image Quality</Label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (Fast)</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="high">High Quality</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="block mb-3">Options</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-all"
                  checked={!showOnlyOwned}
                  onCheckedChange={(checked) => setShowOnlyOwned(!checked)}
                />
                <label htmlFor="show-all" className="text-sm cursor-pointer">
                  Show all cards
                </label>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Selected</div>
              <div className="text-2xl font-bold">{totalUniqueSelected}/{totalUniqueCards}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Total Cards</div>
              <div className="text-2xl font-bold">{totalCards}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Pages</div>
              <div className="text-2xl font-bold">{totalPages}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Per Page</div>
              <div className="text-2xl font-bold">{cardsPerPage}</div>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All ({totalUniqueCards})
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear All
            </Button>
            {totalUniqueSelected === totalUniqueCards && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                All Selected
              </Badge>
            )}
          </div>

          {/* Card List */}
          <ScrollArea className="h-[350px] border rounded-lg">
            <div className="p-3 space-y-2">
              {deckCards.map((card, index) => (
                <div
                  key={`${card.id}-${index}`}
                  className={`flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedCards.has(card.id) ? 'bg-primary/10 border border-primary/50' : 'border border-transparent'
                  }`}
                  onClick={() => toggleCard(card.id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      checked={selectedCards.has(card.id)}
                      onCheckedChange={() => toggleCard(card.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <img 
                      src={getCardImage(card)}
                      alt={card.name}
                      className="w-10 h-14 rounded object-cover"
                      onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{card.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{card.type_line}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{card.quantity || 1}x</Badge>
                    {card.rarity && (
                      <Badge 
                        variant="outline" 
                        className={
                          card.rarity === 'mythic' ? 'text-orange-500 border-orange-500/30' :
                          card.rarity === 'rare' ? 'text-yellow-500 border-yellow-500/30' :
                          card.rarity === 'uncommon' ? 'text-gray-400' :
                          'text-gray-600'
                        }
                      >
                        {card.rarity.charAt(0).toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
            <strong>Note:</strong> Proxy cards are for playtesting purposes only. 
            Official tournament play requires authentic cards. Generated proxies will be 
            formatted at 2.5" x 3.5" (standard Magic card size) with 9 cards per page.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
