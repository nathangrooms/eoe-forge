import { useState } from 'react';
import { UniversalLocalSearch } from '@/components/universal/UniversalLocalSearch';

interface CollectionItem {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  set_code: string;
  quantity: number;
  foil: number;
  condition: string;
  created_at: string;
  updated_at: string;
  price_usd?: number;
  card?: any;
}

interface CollectionCardDisplayProps {
  items: CollectionItem[];
  onCardClick: (item: CollectionItem) => void;
  onMarkForSale: (item: CollectionItem) => void;
  onAddToDeck: (item: CollectionItem) => void;
  viewMode?: 'grid' | 'list' | 'compact';
}

export function CollectionCardDisplay({
  items,
  onCardClick,
  onMarkForSale,
  onAddToDeck,
  viewMode = 'grid'
}: CollectionCardDisplayProps) {
  // Transform collection items to universal card format
  const transformedCards = items.map(item => ({
    id: item.card_id,
    name: item.card_name,
    set_code: item.set_code,
    quantity: item.quantity,
    foil: item.foil,
    condition: item.condition,
    collectionItemId: item.id,
    prices: { usd: item.price_usd?.toString() },
    image_uris: item.card?.image_uris,
    type_line: item.card?.type_line,
    rarity: item.card?.rarity,
    colors: item.card?.colors,
    cmc: item.card?.cmc,
  }));

  return (
    <UniversalLocalSearch
      cards={transformedCards}
      initialViewMode={viewMode}
      onCardClick={(card) => {
        const item = items.find(i => i.id === card.collectionItemId);
        if (item) onCardClick(item);
      }}
      onCardAdd={(card) => {
        const item = items.find(i => i.id === card.collectionItemId);
        if (item) onAddToDeck(item);
      }}
      showWishlistButton={false}
      emptyState={{
        title: 'No cards in collection',
        description: 'Start adding cards to your collection',
      }}
    />
  );
}