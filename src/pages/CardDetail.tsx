import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoryNav } from '@/components/navigation/HistoryNav';
import { CardDetail, CardDetailHeading } from '@/components/cards/CardDetail';
import { getTypeLine } from '@/lib/scryfall/card-utils';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { CollectionAPI } from '@/server/routes/collection';

/**
 * `/cards/:id` — the card as a place, not an overlay.
 *
 * Every list in the product can now hand a card a URL: the detail pane's
 * "Open full page" link, a shared deck link, a bookmark. The param is a
 * Scryfall id where the caller has one and a card name where it does not,
 * because half the rows in this app come from Supabase and half from search.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolved cards are shared across mounts — Back into a card should be instant. */
const cache = new Map<string, any>();

async function resolveCard(param: string, signal: AbortSignal): Promise<any> {
  const cached = cache.get(param);
  if (cached) return cached;

  const urls = UUID.test(param)
    ? [`https://api.scryfall.com/cards/${param}`]
    : [
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(param)}`,
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(param)}`,
      ];

  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetch(url, { signal });
    if (res.ok) {
      const card = await res.json();
      cache.set(param, card);
      return card;
    }
    lastStatus = res.status;
  }

  throw new Error(
    lastStatus === 404 ? 'No card matches this link.' : `Scryfall returned ${lastStatus}`
  );
}

export default function CardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [card, setCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    resolveCard(id, controller.signal)
      .then(setCard)
      .catch(err => {
        if (err?.name === 'AbortError') return;
        setCard(null);
        setError(err instanceof Error ? err.message : 'Could not load this card.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  /* Back to wherever the card was opened from, falling back to card search when
     the page was landed on directly from a shared link. */
  const goBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/cards');
  }, [navigate]);

  const addToCollection = useCallback(async () => {
    if (!card) return;
    if (!user) {
      showError('Sign in required', 'Sign in to add cards to your collection.');
      return;
    }
    const result = await CollectionAPI.addCardByName(card.name, card.set, 1);
    if (result.error) showError('Collection error', result.error);
    else showSuccess('Card added', `${card.name} added to your collection`);
  }, [card, user]);

  const addToWishlist = useCallback(async () => {
    if (!card) return;
    if (!user) {
      showError('Sign in required', 'Sign in to add cards to your wishlist.');
      return;
    }
    try {
      const { data: existing } = await supabase
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
        showSuccess('Updated', `Increased quantity of ${card.name}`);
      } else {
        await supabase.from('wishlist').insert({
          user_id: user.id,
          card_id: card.id,
          card_name: card.name,
          quantity: 1,
          priority: 'medium',
        });
        showSuccess('Added', `${card.name} added to your wishlist`);
      }
    } catch (err) {
      console.error('Error adding to wishlist:', err);
      showError('Wishlist error', 'Failed to add to wishlist');
    }
  }, [card, user]);

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-10 pt-2 md:px-6 md:pt-4">
      <div className="mb-4 flex items-center gap-2">
        <HistoryNav />
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {loading && (
        <div className="rounded-xl bg-card p-10 text-center text-sm text-muted-foreground shadow-lg shadow-black/20">
          Loading card…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-card p-10 text-center shadow-lg shadow-black/20">
          <h1 className="mb-2 text-lg font-semibold text-foreground">Card not found</h1>
          <p className="mb-5 text-sm text-muted-foreground">{error}</p>
          <Button variant="secondary" onClick={() => navigate('/cards')}>
            Search every card
          </Button>
        </div>
      )}

      {!loading && !error && card && (
        <>
          <div className="mb-5">
            <CardDetailHeading card={card} className="text-lg" />
            <p className="mt-1 text-sm text-muted-foreground">{getTypeLine(card)}</p>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
            <CardDetail
              card={card}
              layout="split"
              onAddToCollection={user ? addToCollection : undefined}
              onAddToWishlist={user ? addToWishlist : undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}
