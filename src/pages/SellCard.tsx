import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HistoryNav } from '@/components/navigation/HistoryNav';
import { SellCardForm } from '@/components/collection/SellCardForm';
import { useCollectionStore } from '@/features/collection/store';
import { priceUSD } from '@/features/collection/value';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/components/ui/toast-helpers';
import type { ListingFormData } from '@/types/listing';

/**
 * `/marketplace/list/:collectionItemId`.
 *
 * Listing a card for sale used to be a dialog launched from the collection
 * grid. Money is attached to it, so it is a page: it can be linked, reviewed,
 * and backed out of with the browser's own Back.
 */
export default function SellCard() {
  const { collectionItemId } = useParams<{ collectionItemId: string }>();
  const navigate = useNavigate();
  const { snapshot, loading, load } = useCollectionStore();

  useEffect(() => {
    if (!snapshot) load();
    // Loaded once; the collection page owns later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = useMemo(
    () => snapshot?.items.find(i => i.id === collectionItemId) ?? null,
    [snapshot, collectionItemId]
  );

  const handleSubmit = async (data: ListingFormData) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        showError('Authentication error', 'Please sign in to create a listing');
        return;
      }

      const { error } = await supabase
        .from('listings')
        .insert({ ...data, user_id: sessionData.session.user.id });

      if (error) throw error;

      showSuccess(
        data.status === 'draft' ? 'Draft saved' : 'Listing created',
        `${item?.card_name ?? 'Card'} ${data.status === 'draft' ? 'saved as a draft' : 'listed for sale'}`
      );
      navigate('/collection', { replace: true });
    } catch (err) {
      console.error('Error creating listing:', err);
      showError('Error', 'Failed to create listing');
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 pb-24 pt-2 md:px-6 md:pt-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-3 flex items-center gap-2">
          <HistoryNav />
          <Link
            to="/collection"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Collection
          </Link>
        </div>

        <header className="mb-4 flex items-center gap-3 md:mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
            <Tag className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              List card for sale
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set a price and condition, then publish or keep it as a draft
            </p>
          </div>
        </header>

        <div className="rounded-xl bg-card p-4 shadow-lg shadow-black/20 md:p-6">
          {loading || !snapshot ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !item ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Card not found</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  That collection entry no longer exists, or the link is out of date.
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/collection')} className="gap-2">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to collection
              </Button>
            </div>
          ) : (
            <SellCardForm
              card={item}
              ownedQuantity={item.quantity || 0}
              ownedFoil={item.foil || 0}
              defaultPrice={item.card ? priceUSD(item.card, false) : 0}
              onSubmit={handleSubmit}
              onCancel={() => navigate('/collection')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
