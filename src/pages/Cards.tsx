import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useCollectionStore } from '@/stores/collectionStore';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { getSetCode } from '@/lib/scryfall/card-utils';

export default function Cards() {
  const collection = useCollectionStore();
  const { user } = useAuth();

  const addToCollection = async (card: any) => {
    if (!user) {
      showError('Authentication Required', 'Please sign in to add cards to your collection');
      return;
    }

    try {
      collection.addCard({
        id: card.id || Math.random().toString(),
        name: card.name,
        setCode: getSetCode(card).toUpperCase() || 'UNK',
        collectorNumber: card.collector_number || '1',
        quantity: 1,
        foil: 0,
        condition: 'near_mint',
        language: 'en',
        tags: [],
        cmc: card.cmc || 0,
        type_line: card.type_line || '',
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        oracle_text: card.oracle_text || '',
        power: card.power,
        toughness: card.toughness,
        keywords: card.keywords || [],
        mechanics: card.mechanics || [],
        rarity: card.rarity || 'common',
        priceUsd: parseFloat(card.prices?.usd || '0'),
        priceFoilUsd: parseFloat(card.prices?.usd_foil || '0'),
        synergyScore: 0.5,
        synergyTags: [],
        archetype: []
      });

      const { data: existing } = await supabase
        .from('user_collections')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('user_collections')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_collections')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            set_code: getSetCode(card).toUpperCase() || 'UNK',
            quantity: 1,
            condition: 'near_mint'
          });
      }

      showSuccess('Added to Collection', `Added ${card.name} to your collection`);
    } catch (error) {
      console.error('Error adding to collection:', error);
      showError('Failed to add card', 'Please try again');
    }
  };

  const addToWishlist = async (card: any) => {
    if (!user) {
      showError('Authentication Required', 'Please sign in to add cards to your wishlist');
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
        const { error } = await supabase
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);

        if (error) throw error;
        showSuccess('Updated Wishlist', `Increased quantity of ${card.name}`);
      } else {
        const { error } = await supabase
          .from('wishlist')
          .insert({
            user_id: user.id,
            card_id: card.id,
            card_name: card.name,
            quantity: 1,
            priority: 'medium'
          });

        if (error) throw error;
        showSuccess('Added to Wishlist', `${card.name} added to your wishlist`);
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist', 'Please try again');
    }
  };

  return (
    <StandardPageLayout
      title="Card search"
      description="Live Scryfall search across every Magic: The Gathering card ever printed"
    >
      {/*
        `urlSync` hands the whole filter — query text, colours, rarity, sort,
        everything — to the query string, so a search on this page is a place:
        it survives a reload, works with the back button, and can be pasted to
        someone else. Embedded mounts of this component (deck builder, storage,
        wishlist) leave it off, because there the URL belongs to the host page.
      */}
      <EnhancedUniversalCardSearch
        onCardAdd={addToCollection}
        onCardWishlist={addToWishlist}
        placeholder="Search by name, or use Scryfall syntax — t:creature id:wu mv<=3"
        showFilters
        showAddButton
        showWishlistButton
        showViewModes
        showPresets
        urlSync
        sizeKey="card-search"
      />
    </StandardPageLayout>
  );
}
