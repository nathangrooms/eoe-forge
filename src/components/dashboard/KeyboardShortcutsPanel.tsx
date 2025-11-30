import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Keyboard, X } from 'lucide-react';
import { useState } from 'react';

export function KeyboardShortcutsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const shortcuts = [
    { key: 'Ctrl + K', action: 'Quick Search', category: 'Navigation' },
    { key: 'Ctrl + B', action: 'New Deck Builder', category: 'Decks' },
    { key: 'Ctrl + Shift + C', action: 'Open Collection', category: 'Collection' },
    { key: 'Ctrl + Shift + D', action: 'View Dashboard', category: 'Navigation' },
    { key: 'Ctrl + Shift + A', action: 'Open AI Brain', category: 'AI Features' },
    { key: '/', action: 'Focus Search', category: 'Search' },
    { key: 'Esc', action: 'Close Dialogs', category: 'General' },
  ];

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 gap-2 shadow-lg"
      >
        <Keyboard className="h-4 w-4" />
        Shortcuts
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 shadow-2xl z-50 animate-in slide-in-from-bottom-5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </CardTitle>
            <CardDescription>Navigate faster with these hotkeys</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-h-96 overflow-auto">
        {Object.entries(
          shortcuts.reduce((acc, shortcut) => {
            if (!acc[shortcut.category]) acc[shortcut.category] = [];
            acc[shortcut.category].push(shortcut);
            return acc;
          }, {} as Record<string, typeof shortcuts>)
        ).map(([category, items]) => (
          <div key={category}>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">{category}</h4>
            <div className="space-y-2">
              {items.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm">{shortcut.action}</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {shortcut.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
