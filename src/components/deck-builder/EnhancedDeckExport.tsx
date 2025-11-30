import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Download, FileText, FileJson, Share2, Copy } from 'lucide-react';

interface EnhancedDeckExportProps {
  deckName: string;
  deckCards: any[];
  commander?: any;
  format: string;
  description?: string;
}

export function EnhancedDeckExport({ deckName, deckCards, commander, format, description }: EnhancedDeckExportProps) {
  const [exportFormat, setExportFormat] = useState('moxfield');
  const [includeCommander, setIncludeCommander] = useState(true);
  const [includeSideboard, setIncludeSideboard] = useState(true);
  const [includePrices, setIncludePrices] = useState(false);
  const [groupByType, setGroupByType] = useState(true);

  const generateTextList = () => {
    let output = `// ${deckName}\n`;
    if (format) output += `// Format: ${format}\n`;
    if (description) output += `// ${description}\n`;
    output += `\n`;

    if (commander && includeCommander) {
      output += `Commander:\n1 ${commander.name}\n\n`;
    }

    const mainboard = deckCards.filter(c => !c.is_sideboard && !c.is_commander);

    if (groupByType) {
      const grouped = mainboard.reduce((acc, card) => {
        const type = card.type_line?.split('—')[0]?.trim() || 'Other';
        if (!acc[type]) acc[type] = [];
        acc[type].push(card);
        return acc;
      }, {} as Record<string, any[]>);

      Object.entries(grouped).forEach(([type, cards]) => {
        output += `${type}:\n`;
        (cards as any[]).forEach(card => {
          output += `${card.quantity || 1}x ${card.name}`;
          if (includePrices && card.prices?.usd) {
            output += ` ($${parseFloat(card.prices.usd).toFixed(2)})`;
          }
          output += `\n`;
        });
        output += `\n`;
      });
    } else {
      mainboard.forEach(card => {
        output += `${card.quantity || 1}x ${card.name}`;
        if (includePrices && card.prices?.usd) {
          output += ` ($${parseFloat(card.prices.usd).toFixed(2)})`;
        }
        output += `\n`;
      });
    }

    const sideboard = deckCards.filter(c => c.is_sideboard);
    if (sideboard.length > 0 && includeSideboard) {
      output += `\nSideboard:\n`;
      sideboard.forEach(card => {
        output += `${card.quantity || 1}x ${card.name}\n`;
      });
    }

    return output;
  };

  const generateMoxfieldFormat = () => {
    let output = '';
    
    if (commander && includeCommander) {
      output += `Commander\n1 ${commander.name}\n\n`;
    }

    const mainboard = deckCards.filter(c => !c.is_sideboard && !c.is_commander);
    output += `Deck\n`;
    mainboard.forEach(card => {
      output += `${card.quantity || 1} ${card.name}\n`;
    });

    const sideboard = deckCards.filter(c => c.is_sideboard);
    if (sideboard.length > 0 && includeSideboard) {
      output += `\nSideboard\n`;
      sideboard.forEach(card => {
        output += `${card.quantity || 1} ${card.name}\n`;
      });
    }

    return output;
  };

  const generateJSON = () => {
    return JSON.stringify({
      name: deckName,
      format: format,
      description: description,
      commander: commander ? { name: commander.name, id: commander.id } : null,
      mainboard: deckCards
        .filter(c => !c.is_sideboard && !c.is_commander)
        .map(c => ({
          name: c.name,
          quantity: c.quantity || 1,
          id: c.id,
          type: c.type_line,
          cmc: c.cmc,
          ...(includePrices && c.prices?.usd ? { price_usd: c.prices.usd } : {}),
        })),
      sideboard: includeSideboard
        ? deckCards.filter(c => c.is_sideboard).map(c => ({
            name: c.name,
            quantity: c.quantity || 1,
          }))
        : [],
    }, null, 2);
  };

  const handleExport = () => {
    let content: string;
    let filename: string;
    let mimeType: string;

    switch (exportFormat) {
      case 'moxfield':
        content = generateMoxfieldFormat();
        filename = `${deckName}-moxfield.txt`;
        mimeType = 'text/plain';
        break;
      case 'json':
        content = generateJSON();
        filename = `${deckName}.json`;
        mimeType = 'application/json';
        break;
      case 'text':
      default:
        content = generateTextList();
        filename = `${deckName}.txt`;
        mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showSuccess('Export complete', `Deck exported as ${filename}`);
  };

  const copyToClipboard = () => {
    const content = exportFormat === 'json' 
      ? generateJSON() 
      : exportFormat === 'moxfield' 
      ? generateMoxfieldFormat() 
      : generateTextList();

    navigator.clipboard.writeText(content);
    showSuccess('Copied to clipboard', 'Deck list copied');
  };

  const totalCards = deckCards.reduce((sum, c) => sum + (c.quantity || 1), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          Enhanced Export
        </CardTitle>
        <CardDescription>Export your deck in multiple formats</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export Format */}
        <div className="space-y-2">
          <Label>Export Format</Label>
          <Select value={exportFormat} onValueChange={setExportFormat}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span>Plain Text (Grouped)</span>
                </div>
              </SelectItem>
              <SelectItem value="moxfield">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  <span>Moxfield Format</span>
                </div>
              </SelectItem>
              <SelectItem value="json">
                <div className="flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  <span>JSON (Full Data)</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Export Options */}
        <div className="space-y-3">
          <Label>Export Options</Label>
          <div className="space-y-2">
            {commander && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-commander"
                  checked={includeCommander}
                  onCheckedChange={(checked) => setIncludeCommander(checked as boolean)}
                />
                <label htmlFor="include-commander" className="text-sm cursor-pointer">
                  Include commander
                </label>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-sideboard"
                checked={includeSideboard}
                onCheckedChange={(checked) => setIncludeSideboard(checked as boolean)}
              />
              <label htmlFor="include-sideboard" className="text-sm cursor-pointer">
                Include sideboard
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-prices"
                checked={includePrices}
                onCheckedChange={(checked) => setIncludePrices(checked as boolean)}
              />
              <label htmlFor="include-prices" className="text-sm cursor-pointer">
                Include prices
              </label>
            </div>
            {exportFormat === 'text' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="group-by-type"
                  checked={groupByType}
                  onCheckedChange={(checked) => setGroupByType(checked as boolean)}
                />
                <label htmlFor="group-by-type" className="text-sm cursor-pointer">
                  Group by card type
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
          <div className="text-center">
            <div className="text-2xl font-bold">{totalCards}</div>
            <div className="text-xs text-muted-foreground">Total Cards</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{deckCards.length}</div>
            <div className="text-xs text-muted-foreground">Unique Cards</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              ${deckCards.reduce((sum, c) => {
                const price = parseFloat(c.prices?.usd || '0');
                return sum + price * (c.quantity || 1);
              }, 0).toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground">Total Value</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handleExport} className="flex-1">
            <Download className="mr-2 h-4 w-4" />
            Export File
          </Button>
          <Button variant="outline" onClick={copyToClipboard}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
