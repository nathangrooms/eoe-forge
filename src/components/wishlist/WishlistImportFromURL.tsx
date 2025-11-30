import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Loader2, ExternalLink, Upload, CheckCircle } from 'lucide-react';

interface WishlistImportFromURLProps {
  onImportComplete: () => void;
}

export function WishlistImportFromURL({ onImportComplete }: WishlistImportFromURLProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importedCards, setImportedCards] = useState<string[]>([]);

  const detectPlatform = (url: string): string | null => {
    if (url.includes('moxfield.com')) return 'moxfield';
    if (url.includes('archidekt.com')) return 'archidekt';
    if (url.includes('edhrec.com')) return 'edhrec';
    if (url.includes('tappedout.net')) return 'tappedout';
    return null;
  };

  const parseMoxfieldURL = (url: string): string => {
    // Extract deck ID from Moxfield URL
    const match = url.match(/moxfield\.com\/(?:decks|wishlists?)\/([^/]+)/);
    return match ? match[1] : '';
  };

  const parseArchidektURL = (url: string): string => {
    // Extract deck ID from Archidekt URL
    const match = url.match(/archidekt\.com\/decks\/(\d+)/);
    return match ? match[1] : '';
  };

  const handleImport = async () => {
    if (!url.trim()) {
      showError('Invalid URL', 'Please enter a valid URL');
      return;
    }

    setLoading(true);
    setImportedCards([]);

    try {
      const platform = detectPlatform(url);
      
      if (!platform) {
        showError('Unsupported Platform', 'Only Moxfield, Archidekt, EDHRec, and TappedOut URLs are supported');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError('Authentication Error', 'Please log in to import wishlist');
        return;
      }

      let deckId = '';
      if (platform === 'moxfield') {
        deckId = parseMoxfieldURL(url);
      } else if (platform === 'archidekt') {
        deckId = parseArchidektURL(url);
      }

      if (!deckId && (platform === 'moxfield' || platform === 'archidekt')) {
        showError('Invalid URL', `Could not extract deck ID from ${platform} URL`);
        return;
      }

      // Fetch deck data from the platform
      let deckData: any = null;
      
      if (platform === 'moxfield') {
        const response = await fetch(`https://api2.moxfield.com/v2/decks/all/${deckId}`);
        if (!response.ok) throw new Error('Failed to fetch Moxfield deck');
        deckData = await response.json();
      } else if (platform === 'archidekt') {
        const response = await fetch(`https://archidekt.com/api/decks/${deckId}/`);
        if (!response.ok) throw new Error('Failed to fetch Archidekt deck');
        deckData = await response.json();
      } else {
        showError('Coming Soon', `${platform} import is not yet implemented`);
        return;
      }

      // Extract card names
      let cardNames: string[] = [];
      
      if (platform === 'moxfield' && deckData.boards) {
        // Moxfield structure: boards.mainboard or boards.wishlist
        Object.values(deckData.boards).forEach((board: any) => {
          if (board && board.cards) {
            Object.values(board.cards).forEach((card: any) => {
              if (card.card && card.card.name) {
                for (let i = 0; i < (card.quantity || 1); i++) {
                  cardNames.push(card.card.name);
                }
              }
            });
          }
        });
      } else if (platform === 'archidekt' && deckData.cards) {
        // Archidekt structure: cards array
        deckData.cards.forEach((card: any) => {
          if (card.card && card.card.oracleCard && card.card.oracleCard.name) {
            for (let i = 0; i < (card.quantity || 1); i++) {
              cardNames.push(card.card.oracleCard.name);
            }
          }
        });
      }

      if (cardNames.length === 0) {
        showError('No Cards Found', 'No cards could be extracted from the provided URL');
        return;
      }

      // Search for cards in database and add to wishlist
      let addedCount = 0;
      const addedCardNames: string[] = [];

      for (const cardName of cardNames) {
        try {
          // Search for card in database
          const { data: cardData, error: searchError } = await supabase
            .from('cards')
            .select('id, name')
            .ilike('name', cardName)
            .limit(1)
            .single();

          if (searchError || !cardData) {
            console.warn(`Card not found: ${cardName}`);
            continue;
          }

          // Check if already in wishlist
          const { data: existing } = await supabase
            .from('wishlist')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('card_id', cardData.id)
            .single();

          if (existing) {
            continue; // Skip if already in wishlist
          }

          // Add to wishlist
          const { error: insertError } = await supabase
            .from('wishlist')
            .insert({
              user_id: session.user.id,
              card_id: cardData.id,
              card_name: cardData.name,
              priority: 'medium',
              quantity: 1
            });

          if (!insertError) {
            addedCount++;
            addedCardNames.push(cardData.name);
          }
        } catch (error) {
          console.error(`Error adding card ${cardName}:`, error);
        }
      }

      setImportedCards(addedCardNames);
      
      if (addedCount > 0) {
        showSuccess('Import Complete', `Successfully imported ${addedCount} cards to your wishlist`);
        onImportComplete();
      } else {
        showError('No Cards Added', 'All cards were either already in your wishlist or not found in the database');
      }

    } catch (error: any) {
      console.error('Import error:', error);
      showError('Import Failed', error.message || 'Failed to import wishlist');
    } finally {
      setLoading(false);
    }
  };

  const supportedPlatforms = [
    { name: 'Moxfield', url: 'moxfield.com', status: 'active' },
    { name: 'Archidekt', url: 'archidekt.com', status: 'active' },
    { name: 'EDHRec', url: 'edhrec.com', status: 'coming' },
    { name: 'TappedOut', url: 'tappedout.net', status: 'coming' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import from URL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="import-url">Deck or Wishlist URL</Label>
          <div className="flex gap-2">
            <Input
              id="import-url"
              type="url"
              placeholder="https://moxfield.com/decks/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <Button 
              onClick={handleImport} 
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Import
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Supported Platforms:</p>
          <div className="flex flex-wrap gap-2">
            {supportedPlatforms.map((platform) => (
              <Badge 
                key={platform.name}
                variant={platform.status === 'active' ? 'default' : 'outline'}
              >
                {platform.name}
                {platform.status === 'active' && (
                  <CheckCircle className="h-3 w-3 ml-1" />
                )}
              </Badge>
            ))}
          </div>
        </div>

        {importedCards.length > 0 && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">
              Imported {importedCards.length} cards:
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {importedCards.map((name, idx) => (
                <p key={idx} className="text-xs text-muted-foreground">
                  • {name}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
