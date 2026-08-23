import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

/** Scryfall accepts at most 75 identifiers per `/cards/collection` request. */
const SCRYFALL_COLLECTION_MAX = 75;

/** Collection rows per write. A body is roomier than a URL, but not endless. */
const WRITE_CHUNK = 200;

interface PriceSyncResult {
  updated: number;
  failed: number;
  totalValue: number;
  changedCards: Array<{
    name: string;
    oldPrice: number;
    newPrice: number;
  }>;
}

export function TCGPlayerPriceSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PriceSyncResult | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const syncPrices = async () => {
    try {
      setSyncing(true);
      setProgress(0);
      setResult(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        showError('Not Authenticated', 'Please sign in to sync prices');
        return;
      }

      /* Every column a row needs to be written back whole. The price write is
         an upsert on the primary key — one statement for many rows, each with
         its own new price — and a row sent to an upsert has to be a valid row
         on its own. */
      const { data: collectionData, error: collectionError } = await supabase
        .from('user_collections')
        .select('id, card_id, card_name, set_code, price_usd, quantity, foil, condition')
        .eq('user_id', session.user.id);

      if (collectionError) throw collectionError;
      if (!collectionData || collectionData.length === 0) {
        showError('Empty Collection', 'No cards found to sync');
        return;
      }

      setProgress(10);

      // Get unique card IDs
      const cardIds = [...new Set(collectionData.map(c => c.card_id))];
      const totalCards = cardIds.length;
      let processedCards = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const changedCards: PriceSyncResult['changedCards'] = [];
      let totalValue = 0;

      /*
       * SEVENTY FIVE CARDS PER REQUEST, not one request per card.
       *
       * This asked Scryfall for one card at a time with a 100ms sleep between
       * calls, then wrote one `user_collections` row at a time. A 5,000 card
       * collection was 5,000 Scryfall calls, over eight minutes of sleeping,
       * and 5,000 writes.
       *
       * Scryfall publishes `/cards/collection`, which takes 75 identifiers in
       * one POST, and `src/components/marketplace/useMarketplaceSeed.ts` in
       * this same codebase already calls it correctly. The pacing stays, but
       * between BATCHES: Scryfall asks for it, and a rate-limited reply comes
       * back as a CORS error rather than as a status code.
       */
      const prices = new Map<string, number>();

      for (let i = 0; i < cardIds.length; i += SCRYFALL_COLLECTION_MAX) {
        const slice = cardIds.slice(i, i + SCRYFALL_COLLECTION_MAX);
        try {
          const response = await fetch('https://api.scryfall.com/cards/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers: slice.map(id => ({ id })) }),
          });

          if (!response.ok) {
            failedCount += slice.length;
          } else {
            const payload = await response.json();
            for (const card of payload?.data ?? []) {
              const usd = card?.prices?.usd ? parseFloat(card.prices.usd) : null;
              if (usd !== null && Number.isFinite(usd)) prices.set(card.id, usd);
            }
          }
        } catch (error) {
          console.error('Error syncing a batch of cards:', error);
          failedCount += slice.length;
        }

        processedCards += slice.length;
        setProgress(10 + (processedCards / totalCards) * 80);

        // Rate limiting - Scryfall asks for 50-100ms between requests.
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      /* One write per 200 rows. Every row carries a different new price, so
         this is an upsert on the primary key: a PATCH cannot set a different
         value per row, which is why the old code needed one write each. */
      const rows = collectionData
        .filter(entry => prices.has(entry.card_id))
        .map(entry => ({ entry, newPrice: prices.get(entry.card_id) as number }));

      for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
        const slice = rows.slice(i, i + WRITE_CHUNK);
        const { error: updateError } = await supabase.from('user_collections').upsert(
          slice.map(({ entry, newPrice }) => ({
            id: entry.id,
            user_id: session.user.id,
            card_id: entry.card_id,
            card_name: entry.card_name,
            set_code: entry.set_code,
            quantity: entry.quantity,
            foil: entry.foil,
            condition: entry.condition,
            price_usd: newPrice,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'id' }
        );

        if (updateError) {
          failedCount += slice.length;
          continue;
        }

        for (const { entry, newPrice } of slice) {
          updatedCount++;
          totalValue += newPrice * entry.quantity;

          // Track significant price changes (>10% or >$5)
          const oldPrice = entry.price_usd || 0;
          const priceDiff = Math.abs(newPrice - oldPrice);
          const percentChange = oldPrice > 0 ? (priceDiff / oldPrice) * 100 : 0;

          if (percentChange > 10 || priceDiff > 5) {
            changedCards.push({ name: entry.card_name, oldPrice, newPrice });
          }
        }
      }

      setProgress(100);
      setLastSync(new Date());

      const syncResult: PriceSyncResult = {
        updated: updatedCount,
        failed: failedCount,
        totalValue,
        changedCards: changedCards.slice(0, 10) // Show top 10 changes
      };

      setResult(syncResult);
      showSuccess('Prices Synced', `Updated ${updatedCount} card prices`);
    } catch (error) {
      console.error('Error syncing prices:', error);
      showError('Sync Failed', 'Failed to sync prices');
    } finally {
      setSyncing(false);
      setProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              TCGPlayer Price Sync
            </CardTitle>
            <CardDescription>
              Update your collection prices from TCGPlayer via Scryfall
            </CardDescription>
          </div>
          <Button
            onClick={syncPrices}
            disabled={syncing}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Prices'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {syncing && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              Syncing prices... {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Last Sync Info */}
        {lastSync && (
          <div className="text-sm text-muted-foreground">
            Last synced: {lastSync.toLocaleString()}
          </div>
        )}

        {/* Sync Results */}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold tabular-nums">{result.updated}</p>
                <p className="text-xs text-muted-foreground">Updated</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold tabular-nums text-destructive">{result.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold tabular-nums">
                  ${result.totalValue.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Total Value</p>
              </div>
            </div>

            {/* Significant Price Changes */}
            {result.changedCards.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <h4 className="font-semibold text-sm">Significant Price Changes</h4>
                </div>
                <div className="space-y-2">
                  {result.changedCards.map((change, idx) => {
                    const priceChange = change.newPrice - change.oldPrice;
                    const percentChange = change.oldPrice > 0 
                      ? ((priceChange / change.oldPrice) * 100).toFixed(1)
                      : '0';
                    const isIncrease = priceChange > 0;

                    return (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                      >
                        <span className="truncate flex-1">{change.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            ${change.oldPrice.toFixed(2)}
                          </span>
                          <TrendingUp 
                            className={`h-4 w-4 text-muted-foreground ${isIncrease ? '' : 'rotate-180'}`}
                          />
                          <Badge variant={isIncrease ? 'default' : 'destructive'}>
                            {isIncrease ? '+' : ''}{percentChange}%
                          </Badge>
                          <span className="font-semibold">
                            ${change.newPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {result.changedCards.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Showing top 10 changes
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground pt-4">
          <p className="mb-1">
            <strong>Note:</strong> Prices are fetched from Scryfall which aggregates TCGPlayer data.
          </p>
          <p>
            Large collections may take several minutes to sync due to API rate limiting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}