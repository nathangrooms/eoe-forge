import { useState } from 'react';
import { FIELD } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import {
  Upload,
  Download,
  Copy,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { mergeParsedLines, parseDeckList as readList } from '@/lib/decklist';

interface DeckImportExportProps {
  currentDeck: any[];
  onImportDeck: (cards: any[]) => void;
}

interface ParseResult {
  success: boolean;
  cards: Array<{
    name: string;
    quantity: number;
    set?: string;
    category?: string;
  }>;
  errors: string[];
  warnings: string[];
}

export const DeckImportExport = ({ currentDeck, onImportDeck }: DeckImportExportProps) => {
  const [importText, setImportText] = useState('');
  const [exportFormat, setExportFormat] = useState<'text' | 'csv' | 'arena' | 'modo'>('text');
  const [isParsingDeck, setIsParsingDeck] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  /**
   * Reading the pasted list.
   *
   * This used to be a parser written inline in this component, which meant the
   * proxy list could not use it and would have grown a second one. It lives in
   * `@/lib/decklist` now, is covered by tests, and understands several formats
   * this one never did. It also fixes a bug that was losing cards here: the old
   * heading test was `line.includes('commander')`, so `4 Commander's Sphere`
   * was read as a section heading and silently thrown away.
   */
  const parseDeckList = (text: string): ParseResult => {
    const read = readList(text);
    const cards = mergeParsedLines(read.cards).map(card => ({
      name: card.name,
      quantity: card.quantity,
      set: card.setCode,
      category:
        card.section === 'commander'
          ? 'commander'
          : card.section === 'sideboard'
            ? 'sideboard'
            : 'main',
    }));

    const errors = read.unreadable.map(row => `Line ${row.line}: could not read "${row.raw}"`);
    const warnings: string[] = [];
    const totalCards = read.copies;
    if (totalCards < 40) {
      warnings.push(`Deck only has ${totalCards} cards (minimum 40 recommended)`);
    }
    if (totalCards > 100) {
      warnings.push(`Deck has ${totalCards} cards (maximum 100 for most formats)`);
    }

    return {
      success: errors.length === 0,
      cards,
      errors,
      warnings,
    };
  };

  // Function to fetch card data from Scryfall
  const fetchCardFromScryfall = async (cardName: string) => {
    try {
      const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
      if (!response.ok) {
        throw new Error(`Card not found: ${cardName}`);
      }
      const cardData = await response.json();
      
      // Determine category based on type_line
      let category = 'creatures'; // default
      
      const typeLine = cardData.type_line?.toLowerCase() || '';
      
      if (typeLine.includes('creature')) {
        category = 'creatures';
      } else if (typeLine.includes('land')) {
        category = 'lands';
      } else if (typeLine.includes('instant')) {
        category = 'instants';
      } else if (typeLine.includes('sorcery')) {
        category = 'sorceries';
      } else if (typeLine.includes('enchantment')) {
        category = 'enchantments';
      } else if (typeLine.includes('artifact')) {
        category = 'artifacts';
      } else if (typeLine.includes('planeswalker')) {
        category = 'planeswalkers';
      } else if (typeLine.includes('battle')) {
        category = 'battles';
      }
      
      return {
        id: cardData.id,
        name: cardData.name,
        cmc: cardData.cmc || 0,
        type_line: cardData.type_line,
        colors: cardData.colors || [],
        color_identity: cardData.color_identity || [],
        oracle_text: cardData.oracle_text || '',
        power: cardData.power,
        toughness: cardData.toughness,
        image_uris: cardData.image_uris,
        prices: cardData.prices,
        set: cardData.set,
        set_name: cardData.set_name,
        collector_number: cardData.collector_number,
        rarity: cardData.rarity,
        keywords: cardData.keywords || [],
        legalities: cardData.legalities,
        layout: cardData.layout,
        mana_cost: cardData.mana_cost,
        category,
        mechanics: cardData.keywords || []
      };
    } catch (error) {
      console.error(`Failed to fetch card: ${cardName}`, error);
      return null;
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      toast({
        title: "Error",
        description: "Please paste a deck list to import",
        variant: "destructive"
      });
      return;
    }

    setIsParsingDeck(true);
    
    try {
      const result = parseDeckList(importText);
      setParseResult(result);
      
      if (result.success && result.cards.length > 0) {
        const deckCards = [];
        const fetchErrors = [];
        
        // Fetch card data for each card
        for (const parsedCard of result.cards) {
          const cardData = await fetchCardFromScryfall(parsedCard.name);
          
          if (cardData) {
            // Override category if it was specified in import (commander section)
            let finalCategory = cardData.category;
            if (parsedCard.category === 'commander') {
              finalCategory = 'commanders';
            }
            
            deckCards.push({
              ...cardData,
              quantity: parsedCard.quantity,
              category: finalCategory,
              is_commander: parsedCard.category === 'commander'
            });
          } else {
            fetchErrors.push(`Could not find card: ${parsedCard.name}`);
          }
          
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (deckCards.length > 0) {
          onImportDeck(deckCards);
          
          let message = `Imported ${deckCards.length} cards successfully`;
          if (fetchErrors.length > 0) {
            message += `. ${fetchErrors.length} cards could not be found.`;
          }
          
          toast({
            title: "Import Successful",
            description: message,
          });
          
          setImportText('');
          setParseResult(null);
        } else {
          toast({
            title: "Import Failed",
            description: "No cards could be found in Scryfall database",
            variant: "destructive"
          });
        }
        
        // Show errors for cards that couldn't be found
        if (fetchErrors.length > 0) {
          console.log('Cards not found:', fetchErrors);
        }
      }
    } catch (error) {
      toast({
        title: "Import Failed",
        description: "Could not parse deck list",
        variant: "destructive"
      });
    } finally {
      setIsParsingDeck(false);
    }
  };

  const generateExport = () => {
    if (currentDeck.length === 0) {
      return 'No cards in deck to export.';
    }

    const commander = currentDeck.find(card => card.category === 'commanders' || card.is_commander);
    const mainCards = currentDeck.filter(card => 
      card.category !== 'commanders' && 
      card.category !== 'sideboard' && 
      !card.is_commander
    );
    const sideboardCards = currentDeck.filter(card => card.category === 'sideboard');

    let output = '';

    switch (exportFormat) {
      case 'text':
        // Standard text format with commander at top
        if (commander) {
          output += `1x ${commander.name} (Commander)\n\n`;
        }
        mainCards.forEach(card => {
          output += `${card.quantity}x ${card.name}\n`;
        });
        if (sideboardCards.length > 0) {
          output += '\nSideboard:\n';
          sideboardCards.forEach(card => {
            output += `${card.quantity}x ${card.name}\n`;
          });
        }
        break;

      case 'csv':
        // CSV format
        output = 'Quantity,Name,Category,CMC,Colors\n';
        if (commander) {
          output += `1,"${commander.name}","Commander",${commander.cmc || 0},"${(commander.colors || []).join('')}"\n`;
        }
        currentDeck.filter(card => !card.is_commander && card.category !== 'commanders').forEach(card => {
          output += `${card.quantity},"${card.name}","${card.category || 'main'}",${card.cmc || 0},"${(card.colors || []).join('')}"\n`;
        });
        break;

      case 'arena':
        // MTG Arena format
        output = 'Deck\n';
        if (commander) {
          output += `1 ${commander.name} (Commander)\n`;
        }
        mainCards.forEach(card => {
          output += `${card.quantity} ${card.name}\n`;
        });
        
        if (sideboardCards.length > 0) {
          output += '\nSideboard\n';
          sideboardCards.forEach(card => {
            output += `${card.quantity} ${card.name}\n`;
          });
        }
        break;

      case 'modo':
        // MTGO format
        if (commander) {
          output += `1 ${commander.name} (Commander)\n`;
        }
        mainCards.forEach(card => {
          output += `${card.quantity} ${card.name}\n`;
        });
        if (sideboardCards.length > 0) {
          output += '\n';
          sideboardCards.forEach(card => {
            output += `SB: ${card.quantity} ${card.name}\n`;
          });
        }
        break;
    }

    return output.trim();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to Clipboard",
        description: "Deck list copied successfully",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportedContent = generateExport();

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Import Deck List
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste your deck list here... Example format:&#10;&#10;Commander&#10;1 Kraum, Ludevic's Opus&#10;1 Tymna the Weaver&#10;&#10;Deck&#10;1 Lightning Bolt&#10;1 Counterspell&#10;1 Sol Ring"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            className={cn(FIELD, 'font-mono text-sm')}
          />
          
          {parseResult && (
            <Alert className={parseResult.success ? 'border-border' : 'border-destructive/40'}>
              {parseResult.success ? (
                <CheckCircle className="h-4 w-4 text-foreground" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  {parseResult.success && (
                    <div className="text-foreground">
                      Successfully parsed {parseResult.cards.length} unique cards
                    </div>
                  )}
                  {parseResult.errors.length > 0 && (
                    <div>
                      <div className="font-medium text-destructive mb-1">Errors:</div>
                      <ul className="text-sm space-y-1">
                        {parseResult.errors.slice(0, 5).map((error, index) => (
                          <li key={index} className="text-destructive">• {error}</li>
                        ))}
                        {parseResult.errors.length > 5 && (
                          <li className="text-destructive">• +{parseResult.errors.length - 5} more errors...</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {parseResult.warnings.length > 0 && (
                    <div>
                      <div className="font-medium text-foreground mb-1">Warnings:</div>
                      <ul className="text-sm space-y-1">
                        {parseResult.warnings.map((warning, index) => (
                          <li key={index} className="text-foreground">• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
          
          <Button 
            onClick={handleImport} 
            disabled={!importText.trim() || isParsingDeck}
            className="w-full"
          >
            {isParsingDeck ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Import Deck List
          </Button>
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Download className="h-5 w-5 mr-2" />
            Export Deck List
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
              <SelectTrigger className={cn(FIELD, 'w-40')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text Format</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="arena">MTG Arena</SelectItem>
                <SelectItem value="modo">MTGO</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">
              {currentDeck.length} cards
            </Badge>
          </div>

          <Textarea
            value={exportedContent}
            readOnly
            rows={12}
            className={cn(FIELD, 'font-mono text-sm')}
          />

          <div className="flex gap-2">
            <Button
              onClick={() => copyToClipboard(exportedContent)}
              variant="outline"
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
            <Button
              onClick={() => downloadFile(exportedContent, `deck-export.${exportFormat === 'csv' ? 'csv' : 'txt'}`)}
              variant="outline"
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>

          {/* Quick Export Links */}
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">Quick Export to:</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const moxfieldUrl = `https://www.moxfield.com/decks/new?import=${encodeURIComponent(exportedContent)}`;
                  window.open(moxfieldUrl, '_blank');
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Moxfield
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const archidektUrl = `https://archidekt.com/decks/new?import=${encodeURIComponent(exportedContent)}`;
                  window.open(archidektUrl, '_blank');
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Archidekt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const deckstatsUrl = `https://deckstats.net/decks/new?import=${encodeURIComponent(exportedContent)}`;
                  window.open(deckstatsUrl, '_blank');
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Deckstats
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};