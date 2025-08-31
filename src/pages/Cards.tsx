import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StandardSectionHeader } from '@/components/ui/standardized-components';
import { UniversalCardSearch } from '@/components/universal/UniversalCardSearch';
import { useCollectionStore } from '@/stores/collectionStore';
import { showSuccess } from '@/components/ui/toast-helpers';

export default function Cards() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const collection = useCollectionStore();

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

  const addToWishlist = (card: any) => {
    showSuccess("Added to Wishlist", "Card added to your wishlist");
    // Implement wishlist functionality
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <StandardSectionHeader
          title="Card Database"
          description="Search through every Magic: The Gathering card ever printed with universal MTG search"
        />
        
        <div className="mt-6">
          <UniversalCardSearch
            onCardAdd={addToCollection}
            onCardSelect={(card) => console.log('Selected:', card)}
            placeholder="Search Magic: The Gathering cards..."
            showFilters={true}
            showAddButton={true}
            showWishlistButton={true}
            showViewModes={true}
            initialQuery={initialQuery}
          />
        </div>
      </div>
    </div>
  );
}