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
import { supabase } from '@/integrations/supabase/client';

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

  const getCardId = (card: any) => card.id || card.name;

  // Get card image for thumbnail preview
  const getCardImage = (card: any) => {
    if (card.image_uris?.small) return card.image_uris.small;
    if (card.image_uris?.normal) return card.image_uris.normal;
    if (card.image) return card.image;
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&format=image&version=small`;
  };

  // Parse mana cost string to individual symbols
  const parseManaSymbols = (manaCost: string): string[] => {
    if (!manaCost) return [];
    const matches = manaCost.match(/\{[^}]+\}/g);
    return matches || [];
  };

  // Draw a text-based proxy card with all card information
  const drawTextCard = (doc: any, x: number, y: number, width: number, height: number, card: any, isCommander: boolean = false) => {
    const padding = 0.08;
    const lineHeight = 0.14;
    
    // Card border
    doc.setDrawColor(0);
    doc.setLineWidth(0.02);
    doc.rect(x, y, width, height);
    
    // Inner border for aesthetics
    doc.setLineWidth(0.01);
    doc.rect(x + 0.04, y + 0.04, width - 0.08, height - 0.08);
    
    let currentY = y + padding + 0.12;
    
    // === TITLE BAR ===
    doc.setFillColor(230, 230, 230);
    doc.rect(x + padding, y + padding, width - (padding * 2), 0.25, 'F');
    
    // Card name (left aligned, bold)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    const cardName = card.name || 'Unknown';
    const maxNameWidth = width - 0.9; // Leave space for mana cost
    doc.text(cardName, x + padding + 0.04, currentY, { maxWidth: maxNameWidth });
    
    // Mana cost (right aligned)
    const manaCost = card.mana_cost || card.manaCost || '';
    if (manaCost) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      // Convert {W}{U}{B} to W U B for readability
      const manaText = manaCost.replace(/\{/g, '').replace(/\}/g, ' ').trim();
      const manaWidth = doc.getTextWidth(manaText);
      doc.text(manaText, x + width - padding - 0.04 - manaWidth, currentY);
    }
    
    currentY = y + padding + 0.32;
    
    // === TYPE LINE ===
    doc.setFillColor(220, 220, 220);
    doc.rect(x + padding, currentY - 0.08, width - (padding * 2), 0.2, 'F');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const typeLine = card.type_line || card.typeLine || 'Unknown Type';
    doc.text(typeLine, x + padding + 0.04, currentY + 0.04, { maxWidth: width - (padding * 2) - 0.08 });
    
    currentY += 0.2;
    
    // === ORACLE TEXT BOX ===
    const textBoxHeight = height - 1.1; // Leave room for P/T and bottom
    doc.setDrawColor(180);
    doc.setLineWidth(0.005);
    doc.rect(x + padding, currentY, width - (padding * 2), textBoxHeight);
    
    // Oracle text
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    const oracleText = card.oracle_text || card.oracleText || '';
    
    if (oracleText) {
      const textLines = doc.splitTextToSize(oracleText, width - (padding * 2) - 0.1);
      const maxLines = Math.floor(textBoxHeight / 0.11) - 1;
      const displayLines = textLines.slice(0, maxLines);
      
      let textY = currentY + 0.12;
      displayLines.forEach((line: string) => {
        doc.text(line, x + padding + 0.05, textY);
        textY += 0.11;
      });
    }
    
    currentY += textBoxHeight + 0.05;
    
    // === BOTTOM BAR ===
    doc.setFillColor(230, 230, 230);
    doc.rect(x + padding, currentY, width - (padding * 2), 0.22, 'F');
    
    // Set/Rarity info (left side)
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    const setCode = (card.set || card.set_code || '???').toUpperCase();
    const rarity = (card.rarity || 'C')[0].toUpperCase();
    doc.text(`${setCode} · ${rarity}`, x + padding + 0.04, currentY + 0.14);
    
    // Power/Toughness or Loyalty (right side)
    const power = card.power;
    const toughness = card.toughness;
    const loyalty = card.loyalty;
    
    if (power !== undefined && toughness !== undefined) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const ptText = `${power}/${toughness}`;
      const ptWidth = doc.getTextWidth(ptText);
      doc.text(ptText, x + width - padding - 0.04 - ptWidth, currentY + 0.16);
    } else if (loyalty) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const loyaltyText = `◆${loyalty}`;
      const loyaltyWidth = doc.getTextWidth(loyaltyText);
      doc.text(loyaltyText, x + width - padding - 0.04 - loyaltyWidth, currentY + 0.16);
    }
    
    // Commander badge
    if (isCommander) {
      doc.setFillColor(100, 50, 150);
      doc.rect(x + width - 0.45, y + 0.06, 0.4, 0.15, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255);
      doc.text('CMD', x + width - 0.38, y + 0.16);
      doc.setTextColor(0);
    }
    
    // CMC indicator in corner
    const cmc = card.cmc ?? card.convertedManaCost ?? '';
    if (cmc !== '' && cmc !== undefined) {
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`CMC: ${cmc}`, x + padding + 0.04, y + height - 0.06);
      doc.setTextColor(0);
    }
  };

  const generateProxies = async () => {
    if (selectedCards.size === 0) {
      showError('No cards selected', 'Please select at least one card');
      return;
    }

    setGenerating(true);
    setProgress(10);
    
    try {
      const selectedCardsList = allCards.filter(c => selectedCards.has(getCardId(c)));
      
      // Expand cards by quantity
      const expandedCards: { card: any; isCommander: boolean }[] = [];
      selectedCardsList.forEach(card => {
        const qty = card.quantity || 1;
        const isCmd = card.isCommander || false;
        for (let i = 0; i < qty; i++) {
          expandedCards.push({ card, isCommander: isCmd });
        }
      });

      setProgress(20);
      
      // Load jsPDF from CDN
      const jsPDF = await loadJsPDF();
      
      setProgress(30);
      
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

      setProgress(40);

      let cardIndex = 0;
      for (const { card, isCommander } of expandedCards) {
        if (cardIndex > 0 && cardIndex % (cols * rows) === 0) {
          doc.addPage();
        }

        const posOnPage = cardIndex % (cols * rows);
        const col = posOnPage % cols;
        const row = Math.floor(posOnPage / cols);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        drawTextCard(doc, x, y, cardWidth, cardHeight, card, isCommander);

        cardIndex++;
        setProgress(40 + Math.round((cardIndex / expandedCards.length) * 55));
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
