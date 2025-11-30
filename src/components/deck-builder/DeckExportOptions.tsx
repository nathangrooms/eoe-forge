import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface DeckExportOptionsProps {
  deckName: string;
  cards: Array<{ card_name: string; quantity: number; is_commander?: boolean; is_sideboard?: boolean }>;
  onExport?: (format: string) => void;
}

type ExportFormat = 'arena' | 'mtgo' | 'cockatrice' | 'text' | 'json' | 'csv';

export const DeckExportOptions = ({ deckName, cards, onExport }: DeckExportOptionsProps) => {
  const [format, setFormat] = useState<ExportFormat>('text');
  const [includeCommander, setIncludeCommander] = useState(true);
  const [includeSideboard, setIncludeSideboard] = useState(true);
  const [groupByType, setGroupByType] = useState(false);

  const exportDeck = (copyToClipboard: boolean = false) => {
    let output = '';

    const mainDeck = cards.filter(c => !c.is_sideboard && !c.is_commander);
    const commander = cards.find(c => c.is_commander);
    const sideboard = cards.filter(c => c.is_sideboard);

    switch (format) {
      case 'arena':
        output = generateArenaFormat(mainDeck, commander, sideboard);
        break;
      case 'mtgo':
        output = generateMTGOFormat(mainDeck, commander, sideboard);
        break;
      case 'cockatrice':
        output = generateCockatriceFormat(mainDeck, commander, sideboard);
        break;
      case 'text':
        output = generateTextFormat(mainDeck, commander, sideboard);
        break;
      case 'json':
        output = generateJSONFormat(mainDeck, commander, sideboard);
        break;
      case 'csv':
        output = generateCSVFormat(mainDeck, commander, sideboard);
        break;
    }

    if (copyToClipboard) {
      navigator.clipboard.writeText(output);
      toast.success('Deck copied to clipboard');
    } else {
      downloadFile(output, `${deckName}.${format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'txt'}`);
      toast.success('Deck exported successfully');
    }

    onExport?.(format);
  };

  const generateArenaFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    let output = '';
    
    if (commander && includeCommander) {
      output += `Commander\n${commander.quantity} ${commander.card_name}\n\n`;
    }
    
    output += 'Deck\n';
    main.forEach(card => {
      output += `${card.quantity} ${card.card_name}\n`;
    });
    
    if (sideboard && includeSideboard && sideboard.length > 0) {
      output += '\nSideboard\n';
      sideboard.forEach(card => {
        output += `${card.quantity} ${card.card_name}\n`;
      });
    }
    
    return output;
  };

  const generateMTGOFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    let output = '';
    
    main.forEach(card => {
      output += `${card.quantity} ${card.card_name}\n`;
    });
    
    if (sideboard && includeSideboard && sideboard.length > 0) {
      output += '\n';
      sideboard.forEach(card => {
        output += `${card.quantity} ${card.card_name}\n`;
      });
    }
    
    return output;
  };

  const generateCockatriceFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    let output = '<?xml version="1.0" encoding="UTF-8"?>\n';
    output += '<cockatrice_deck version="1">\n';
    output += `  <deckname>${deckName}</deckname>\n`;
    output += '  <zone name="main">\n';
    
    main.forEach(card => {
      output += `    <card number="${card.quantity}" name="${card.card_name}"/>\n`;
    });
    
    output += '  </zone>\n';
    
    if (commander && includeCommander) {
      output += '  <zone name="side">\n';
      output += `    <card number="${commander.quantity}" name="${commander.card_name}"/>\n`;
      output += '  </zone>\n';
    }
    
    output += '</cockatrice_deck>';
    
    return output;
  };

  const generateTextFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    let output = `${deckName}\n${'='.repeat(deckName.length)}\n\n`;
    
    if (commander && includeCommander) {
      output += `Commander:\n${commander.quantity}x ${commander.card_name}\n\n`;
    }
    
    output += `Main Deck (${main.reduce((sum, c) => sum + c.quantity, 0)} cards):\n`;
    main.forEach(card => {
      output += `${card.quantity}x ${card.card_name}\n`;
    });
    
    if (sideboard && includeSideboard && sideboard.length > 0) {
      output += `\nSideboard (${sideboard.reduce((sum, c) => sum + c.quantity, 0)} cards):\n`;
      sideboard.forEach(card => {
        output += `${card.quantity}x ${card.card_name}\n`;
      });
    }
    
    return output;
  };

  const generateJSONFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    const data = {
      name: deckName,
      commander: commander ? { name: commander.card_name, quantity: commander.quantity } : null,
      mainboard: main.map(c => ({ name: c.card_name, quantity: c.quantity })),
      sideboard: includeSideboard ? sideboard.map(c => ({ name: c.card_name, quantity: c.quantity })) : []
    };
    
    return JSON.stringify(data, null, 2);
  };

  const generateCSVFormat = (main: any[], commander?: any, sideboard?: any[]) => {
    let output = 'Quantity,Name,Type\n';
    
    if (commander && includeCommander) {
      output += `${commander.quantity},${commander.card_name},Commander\n`;
    }
    
    main.forEach(card => {
      output += `${card.quantity},${card.card_name},Main\n`;
    });
    
    if (sideboard && includeSideboard) {
      sideboard.forEach(card => {
        output += `${card.quantity},${card.card_name},Sideboard\n`;
      });
    }
    
    return output;
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Deck</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="arena" id="arena" />
                <Label htmlFor="arena" className="font-normal">MTG Arena</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="mtgo" id="mtgo" />
                <Label htmlFor="mtgo" className="font-normal">MTGO</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cockatrice" id="cockatrice" />
                <Label htmlFor="cockatrice" className="font-normal">Cockatrice (.cod)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" />
                <Label htmlFor="text" className="font-normal">Plain Text</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="font-normal">JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="font-normal">CSV</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="space-y-3">
            <Label>Options</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="commander"
                checked={includeCommander}
                onCheckedChange={(checked) => setIncludeCommander(checked as boolean)}
              />
              <Label htmlFor="commander" className="font-normal">Include Commander</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sideboard"
                checked={includeSideboard}
                onCheckedChange={(checked) => setIncludeSideboard(checked as boolean)}
              />
              <Label htmlFor="sideboard" className="font-normal">Include Sideboard</Label>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={() => exportDeck(false)} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => exportDeck(true)} variant="outline" className="flex-1">
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
