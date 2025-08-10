import { useState } from 'react';
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

  // Parse different deck list formats
  const parseDeckList = (text: string): ParseResult => {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const cards: ParseResult['cards'] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    let currentCategory = 'main';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;
      
      // Category headers
      if (line.toLowerCase().includes('sideboard') || line.toLowerCase().includes('side board')) {
        currentCategory = 'sideboard';
        continue;
      }
      
      if (line.toLowerCase().includes('commander') || line.toLowerCase().includes('command zone')) {
        currentCategory = 'commander';
        continue;
      }
      
      // Parse card lines - support multiple formats:
      // "4 Lightning Bolt"
      // "4x Lightning Bolt"
      // "Lightning Bolt x4"
      // "1 Lightning Bolt (M21) 163"
      const patterns = [
        /^(\d+)x?\s+(.+?)(?:\s+\([^)]+\))?(?:\s+\d+)?$/i,  // "4 Name" or "4x Name"
        /^(.+?)\s+x?(\d+)$/i,  // "Name x4"
        /^(.+)$/i  // Just card name (assume 1)
      ];
      
      let matched = false;
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          let quantity: number;
          let name: string;
          
          if (pattern === patterns[1]) {
            // "Name x4" format
            name = match[1].trim();
            quantity = parseInt(match[2]);
          } else if (pattern === patterns[2]) {
            // Just name, assume quantity 1
            name = match[1].trim();
            quantity = 1;
          } else {
            // "4 Name" format
            quantity = parseInt(match[1]);
            name = match[2].trim();
          }
          
          if (isNaN(quantity) || quantity < 1) {
            errors.push(`Line ${i + 1}: Invalid quantity "${match[1]}"`);
            continue;
          }
          
          if (!name) {
            errors.push(`Line ${i + 1}: Missing card name`);
            continue;
          }
          
          // Clean up card name (remove set info, collector numbers)
          name = name.replace(/\s*\([^)]+\)\s*\d*$/, '').trim();
          
          cards.push({
            name,
            quantity,
            category: currentCategory
          });
          
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        errors.push(`Line ${i + 1}: Could not parse "${line}"`);
      }
    }
    
    // Validation warnings
    const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
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
      warnings
    };
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
      // Simulate async parsing (in real app, might validate against card database)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const result = parseDeckList(importText);
      setParseResult(result);
      
      if (result.success && result.cards.length > 0) {
        // Convert parsed cards to deck format
        const deckCards = result.cards.map(card => ({
          id: `import-${card.name.replace(/\s+/g, '-').toLowerCase()}`,
          name: card.name,
          quantity: card.quantity,
          cmc: 0, // Would lookup from database
          type_line: '', // Would lookup from database
          colors: [], // Would lookup from database
          category: card.category || 'main',
          mechanics: []
        }));
        
        onImportDeck(deckCards);
        
        toast({
          title: "Import Successful",
          description: `Imported ${result.cards.length} unique cards`,
        });
        
        setImportText('');
        setParseResult(null);
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

    const grouped = currentDeck.reduce((acc, card) => {
      const category = card.category || 'main';
      if (!acc[category]) acc[category] = [];
      acc[category].push(card);
      return acc;
    }, {} as Record<string, any[]>);

    let output = '';

    switch (exportFormat) {
      case 'text':
        // Standard text format
        Object.entries(grouped).forEach(([category, cards]) => {
          if (category !== 'main') {
            output += `\n// ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;
          }
          (cards as any[]).forEach(card => {
            output += `${card.quantity} ${card.name}\n`;
          });
        });
        break;

      case 'csv':
        // CSV format
        output = 'Quantity,Name,Category,CMC,Colors\n';
        currentDeck.forEach(card => {
          output += `${card.quantity},"${card.name}","${card.category || 'main'}",${card.cmc},"${card.colors.join('')}"\n`;
        });
        break;

      case 'arena':
        // MTG Arena format
        const mainCards = grouped.main || [];
        const sideboardCards = grouped.sideboard || [];
        
        output = 'Deck\n';
        mainCards.forEach(card => {
          output += `${card.quantity} ${card.name}\n`;
        });
        
        if (sideboardCards.length > 0) {
          output += '\nSideboard\n';
          (sideboardCards as any[]).forEach(card => {
            output += `${card.quantity} ${card.name}\n`;
          });
        }
        break;

      case 'modo':
        // MTGO format (similar to text but with specific formatting)
        Object.entries(grouped).forEach(([category, cards]) => {
          (cards as any[]).forEach(card => {
            output += `${card.quantity} ${card.name}\n`;
          });
        });
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
            placeholder="Paste your deck list here... Supports multiple formats:&#10;4 Lightning Bolt&#10;1x Counterspell&#10;Brainstorm x3&#10;2 Force of Will (EMA) 49"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          
          {parseResult && (
            <Alert className={parseResult.success ? 'border-green-500' : 'border-red-500'}>
              {parseResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  {parseResult.success && (
                    <div className="text-green-600">
                      Successfully parsed {parseResult.cards.length} unique cards
                    </div>
                  )}
                  {parseResult.errors.length > 0 && (
                    <div>
                      <div className="font-medium text-red-600 mb-1">Errors:</div>
                      <ul className="text-sm space-y-1">
                        {parseResult.errors.slice(0, 5).map((error, index) => (
                          <li key={index} className="text-red-600">• {error}</li>
                        ))}
                        {parseResult.errors.length > 5 && (
                          <li className="text-red-600">• +{parseResult.errors.length - 5} more errors...</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {parseResult.warnings.length > 0 && (
                    <div>
                      <div className="font-medium text-yellow-600 mb-1">Warnings:</div>
                      <ul className="text-sm space-y-1">
                        {parseResult.warnings.map((warning, index) => (
                          <li key={index} className="text-yellow-600">• {warning}</li>
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
              <SelectTrigger className="w-40">
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
            className="font-mono text-sm"
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