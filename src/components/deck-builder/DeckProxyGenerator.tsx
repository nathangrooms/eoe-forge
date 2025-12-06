import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Download, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface DeckProxyGeneratorProps {
  deckCards: any[];
  deckName: string;
}

export function DeckProxyGenerator({ deckCards, deckName }: DeckProxyGeneratorProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set(deckCards.map(c => c.id)));
  const [paperSize, setPaperSize] = useState('letter');
  const [quality, setQuality] = useState('high');
  const [includeText, setIncludeText] = useState(true);
  const [showOnlyOwned, setShowOnlyOwned] = useState(false);
  const [generating, setGenerating] = useState(false);

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
    return card.image_uris?.normal || card.image_uris?.large || card.image ||
      `https://cards.scryfall.io/normal/front/${card.id.charAt(0)}/${card.id.charAt(1)}/${card.id}.jpg`;
  };

  const generateProxies = async () => {
    if (selectedCards.size === 0) {
      showError('No cards selected', 'Please select at least one card to generate proxies');
      return;
    }

    setGenerating(true);
    try {
      const selectedCardsList = deckCards.filter(c => selectedCards.has(c.id));
      
      // Create PDF with card images
      const { jsPDF } = await import('jspdf');
      
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: paperSize === 'letter' ? 'letter' : 'a4'
      });

      const pageWidth = paperSize === 'letter' ? 8.5 : 8.27;
      const pageHeight = paperSize === 'letter' ? 11 : 11.69;
      
      // Card dimensions (standard MTG card size)
      const cardWidth = 2.5;
      const cardHeight = 3.5;
      
      // Calculate grid
      const cols = 3;
      const rows = 3;
      const marginX = (pageWidth - (cols * cardWidth)) / 2;
      const marginY = (pageHeight - (rows * cardHeight)) / 2;

      let cardIndex = 0;
      let pageNum = 0;
      
      // Expand cards by quantity
      const expandedCards: any[] = [];
      selectedCardsList.forEach(card => {
        const qty = card.quantity || 1;
        for (let i = 0; i < qty; i++) {
          expandedCards.push(card);
        }
      });

      for (const card of expandedCards) {
        if (cardIndex > 0 && cardIndex % (cols * rows) === 0) {
          doc.addPage();
          pageNum++;
        }

        const posOnPage = cardIndex % (cols * rows);
        const col = posOnPage % cols;
        const row = Math.floor(posOnPage / cols);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        try {
          const imageUrl = getCardImage(card);
          
          // Fetch image and convert to base64
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });

          doc.addImage(base64, 'JPEG', x, y, cardWidth, cardHeight);
        } catch (imgError) {
          console.error(`Failed to load image for ${card.name}:`, imgError);
          // Draw placeholder rectangle
          doc.setDrawColor(100);
          doc.rect(x, y, cardWidth, cardHeight);
          doc.setFontSize(10);
          doc.text(card.name, x + 0.1, y + 0.3, { maxWidth: cardWidth - 0.2 });
        }

        cardIndex++;
      }

      // Save PDF
      doc.save(`${deckName.replace(/[^a-z0-9]/gi, '_')}_proxies.pdf`);
      
      showSuccess(
        'Proxies Generated',
        `Generated PDF with ${expandedCards.length} proxy cards (${Math.ceil(expandedCards.length / 9)} pages)`
      );
    } catch (error) {
      console.error('Generation failed:', error);
      showError('Generation failed', 'Failed to generate proxy cards PDF');
    } finally {
      setGenerating(false);
    }
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
          {/* Generation Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Paper Size</Label>
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="letter">Letter (8.5" x 11")</SelectItem>
                  <SelectItem value="a4">A4 (210mm x 297mm)</SelectItem>
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
                  Show all cards (not just owned)
                </label>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground">Selected</div>
              <div className="text-2xl font-bold">{selectedCards.size}</div>
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          </div>

          {/* Card List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-lg p-3">
            {deckCards.map((card) => (
              <div
                key={card.id}
                className={`flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors ${
                  selectedCards.has(card.id) ? 'bg-primary/10 border border-primary' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <Checkbox
                    checked={selectedCards.has(card.id)}
                    onCheckedChange={() => toggleCard(card.id)}
                  />
                  <img 
                    src={getCardImage(card)}
                    alt={card.name}
                    className="w-10 h-14 rounded object-cover"
                    onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{card.name}</div>
                    <div className="text-xs text-muted-foreground">{card.type_line}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{card.quantity || 1}x</Badge>
                  {card.rarity && (
                    <Badge 
                      variant="outline" 
                      className={
                        card.rarity === 'mythic' ? 'text-orange-500' :
                        card.rarity === 'rare' ? 'text-yellow-500' :
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

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={generateProxies} 
              disabled={selectedCards.size === 0 || generating}
              className="flex-1"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating PDF...
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
