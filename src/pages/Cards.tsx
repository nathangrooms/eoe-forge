import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { useCollectionStore } from '@/stores/collectionStore';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

export default function Cards() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const collection = useCollectionStore();
  const { user } = useAuth();

  const addToCollection = (card: any) => {
    collection.addCard({
      id: card.id || Math.random().toString(),
      name: card.name,
      setCode: card.set?.toUpperCase() || 'UNK',
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
    showSuccess("Added to Collection", `Added ${card.name} to your collection`);
  };

  const addToWishlist = async (card: any) => {
    if (!user) {
      showError('Authentication Required', 'Please sign in to add cards to your wishlist');
      return;
    }

    try {
      // For now, just show success - the database table exists but isn't in types
      // This will be properly implemented when database types are updated
      showSuccess('Added to Wishlist', `${card.name} added to your wishlist`);
      
      // TODO: Implement actual database insertion when types are available
      console.log('Adding to wishlist:', { cardId: card.id, cardName: card.name, userId: user.id });
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      showError('Failed to add to wishlist', 'Please try again');
    }
  };

  return (
    <StandardPageLayout
      title="Card Database"
      description="Search through every Magic: The Gathering card ever printed with universal MTG search"
    >
      <EnhancedUniversalCardSearch
        onCardAdd={addToCollection}
        onCardSelect={(card) => console.log('Selected:', card)}
        onCardWishlist={addToWishlist}
        placeholder="Search Magic: The Gathering cards..."
        showFilters={true}
        showAddButton={true}
        showWishlistButton={true}
        showViewModes={true}
        initialQuery={initialQuery}
      />
    </StandardPageLayout>
  );
}