import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface DeckProxyGeneratorProps {
  deckCards: any[];
  deckName: string;
}

export function DeckProxyGenerator({ deckCards, deckName }: DeckProxyGeneratorProps) {
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const [paperSize, setPaperSize] = useState('letter');
  const [quality, setQuality] = useState('high');
  const [includeText, setIncludeText] = useState(true);
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

  const generateProxies = async () => {
    if (selectedCards.size === 0) {
      showError('No cards selected', 'Please select at least one card to generate proxies');
      return;
    }

    setGenerating(true);
    try {
      // Simulate proxy generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      showSuccess(
        'Proxies generated',
        `Generated ${selectedCards.size} proxy cards. Download starting...`
      );
      
      // In a real implementation, this would generate a PDF or print-ready file
      console.log('Generating proxies for:', Array.from(selectedCards));
    } catch (error) {
      showError('Generation failed', 'Failed to generate proxy cards');
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

  const cardsPerPage = paperSize === 'letter' ? 9 : 8;
  const totalPages = Math.ceil(selectedCards.size / cardsPerPage);

  return (
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
                <SelectItem value="custom">Custom Size</SelectItem>
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
              <Checkbox
                id="include-text"
                checked={includeText}
                onCheckedChange={(checked) => setIncludeText(checked as boolean)}
              />
              <label htmlFor="include-text" className="text-sm cursor-pointer">
                Include oracle text
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
            <div className="text-2xl font-bold">{deckCards.length}</div>
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
            <ImageIcon className="mr-2 h-4 w-4" />
            {generating ? 'Generating...' : `Generate PDF (${selectedCards.size} cards)`}
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
          formatted at 2.5" x 3.5" (standard Magic card size) with {cardsPerPage} cards per page.
        </div>
      </CardContent>
    </Card>
  );
}
