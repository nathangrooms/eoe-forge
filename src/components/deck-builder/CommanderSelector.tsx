import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, Search, X, Loader2 } from 'lucide-react';
import { useDeckStore } from '@/stores/deckStore';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { ManaCost, ColorIdentity } from '@/components/ui/mana-cost';

interface CommanderSelectorProps {
  currentCommander?: any;
  /** Called after a commander is committed, so the host dialog can close. */
  onSelect?: (card: any) => void;
}

interface ScryfallCard {
  id: string;
  name: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  color_identity?: string[];
  colors?: string[];
  image_uris?: { small?: string; normal?: string; large?: string };
  prices?: { usd?: string };
  keywords?: string[];
  edhrec_rank?: number;
}

export function CommanderSelector({ currentCommander, onSelect }: CommanderSelectorProps) {
  const { setCommander } = useDeckStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [topCommanders, setTopCommanders] = useState<ScryfallCard[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState(false);

  // Most-played commanders, ordered by Scryfall's edhrec_rank. This replaces a
  // hardcoded list whose "popularity" percentages were invented.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          'https://api.scryfall.com/cards/search?q=' +
            encodeURIComponent('is:commander legal:commander') +
            '&order=edhrec&unique=cards'
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setTopCommanders((data.data || []).slice(0, 8));
      } catch {
        if (!cancelled) setTopError(true);
      } finally {
        if (!cancelled) setTopLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchCommanders = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      // `is:commander` covers legendary creatures, Backgrounds, and the
      // planeswalkers that say "can be your commander" — the previous
      // `t:legendary t:creature` query missed all of those.
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
          `is:commander legal:commander ${query}`
        )}&order=edhrec&unique=cards`
      );

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.data || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching commanders:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchCommanders(searchQuery);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleCommanderSelect = async (card: ScryfallCard) => {
    const commanderCard = {
      id: card.id,
      name: card.name,
      cmc: card.cmc || 0,
      type_line: card.type_line || '',
      colors: card.color_identity || card.colors || [],
      color_identity: card.color_identity || card.colors || [],
      mana_cost: card.mana_cost,
      quantity: 1,
      category: 'commanders' as const,
      mechanics: card.keywords || [],
      image_uris: card.image_uris,
      prices: card.prices,
    };

    setCommander(commanderCard as any);

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const urlParams = new URLSearchParams(window.location.search);
        const deckId = urlParams.get('deck');

        if (deckId) {
          await supabase.from('deck_cards').delete().eq('deck_id', deckId).eq('is_commander', true);

          const { error } = await supabase.from('deck_cards').insert({
            deck_id: deckId,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            is_commander: true,
            is_sideboard: false,
          });

          if (error) {
            showError('Commander not saved', error.message);
            return;
          }
        }
      }
    } catch (error) {
      showError('Commander not saved', error instanceof Error ? error.message : 'Unknown error');
      return;
    }

    setSearchQuery('');
    setSearchResults([]);
    showSuccess('Commander set', `${card.name} now leads this deck`);
    onSelect?.(commanderCard);
  };

  const renderResult = (card: ScryfallCard, rank?: number) => (
    <button
      key={card.id}
      onClick={() => handleCommanderSelect(card)}
      className="group flex gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-foreground/40 hover:bg-accent"
    >
      {card.image_uris?.small ? (
        <img
          src={card.image_uris.small}
          alt={card.name}
          loading="lazy"
          className="h-auto w-16 shrink-0 rounded border border-border"
          onError={e => {
            e.currentTarget.src = '/placeholder.svg';
            e.currentTarget.onerror = null;
          }}
        />
      ) : (
        <div className="h-[88px] w-16 shrink-0 rounded border border-border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-medium">{card.name}</h4>
          {rank !== undefined && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">#{rank}</span>
          )}
        </div>
        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{card.type_line}</p>
        <div className="flex items-center gap-2">
          <ManaCost cost={card.mana_cost} size="xs" />
          <ColorIdentity colors={card.color_identity} size="xs" />
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Current commander */}
      {currentCommander && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {currentCommander.image_uris?.normal && (
                <img
                  src={currentCommander.image_uris.normal}
                  alt={currentCommander.name}
                  className="h-auto w-24 rounded-md border border-border"
                  onError={e => {
                    e.currentTarget.src = '/placeholder.svg';
                    e.currentTarget.onerror = null;
                  }}
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Crown className="h-3.5 w-3.5 text-type-commander" />
                  Current commander
                </div>
                <h3 className="text-lg font-semibold">{currentCommander.name}</h3>
                <p className="text-sm text-muted-foreground">{currentCommander.type_line}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ManaCost cost={currentCommander.mana_cost} size="sm" />
                  <Badge variant="secondary">MV {currentCommander.cmc ?? 0}</Badge>
                  <ColorIdentity
                    colors={currentCommander.color_identity || currentCommander.colors}
                    size="sm"
                  />
                  {currentCommander.prices?.usd && (
                    <span className="text-sm tabular-nums text-muted-foreground">
                      ${currentCommander.prices.usd}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCommander(undefined as any)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Remove commander"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search commanders, backgrounds and partners…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </div>
      )}

      {!loading && searchQuery && searchResults.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No commanders match "{searchQuery}".</p>
        </div>
      )}

      {!loading && searchResults.length > 0 && (
        <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
          {searchResults.slice(0, 24).map(card => renderResult(card))}
        </div>
      )}

      {/* Most played — real EDHREC ordering from Scryfall, not invented percentages */}
      {!searchQuery && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Most played commanders
              <span className="ml-2 font-normal text-muted-foreground">by EDHREC rank</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : topError || topCommanders.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Could not reach Scryfall. Search by name above instead.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {topCommanders.map((c, i) => renderResult(c, i + 1))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
