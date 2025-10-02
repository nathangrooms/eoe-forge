import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { EnhancedUniversalCardSearch } from '@/components/universal/EnhancedUniversalCardSearch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCollectionStore } from '@/stores/collectionStore';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { AIFeaturedCard } from '@/components/cards/AIFeaturedCard';

export default function Cards() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const collection = useCollectionStore();
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState('simple');

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
      // Check if card already exists in wishlist
      const { data: existing } = await (supabase as any)
        .from('wishlist')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        // Update quantity if already exists
        const { error } = await (supabase as any)
          .from('wishlist')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);

        if (error) throw error;
        showSuccess('Updated Wishlist', `Increased quantity of ${card.name}`);
      } else {
        // Add new item
        const { error } = await (supabase as any)
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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Card Database</h1>
            <p className="text-muted-foreground">Search through every Magic: The Gathering card ever printed with universal MTG search</p>
          </div>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={setCurrentTab} className="h-full flex flex-col">
        {/* Tabs */}
        <div className="border-b px-6">
          <TabsList className="flex w-full justify-start bg-transparent p-0 h-12 gap-6">
            <TabsTrigger 
              value="simple" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Simple Search
            </TabsTrigger>
            <TabsTrigger 
              value="advanced"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 text-sm whitespace-nowrap"
            >
              Advanced Search
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Simple Search Tab */}
          <TabsContent value="simple" className="h-full overflow-auto px-6 py-4 m-0">
            <div className="space-y-6">
              {/* AI Featured Card */}
              <AIFeaturedCard />
              
              {/* Search Component */}
              <EnhancedUniversalCardSearch
                onCardAdd={addToCollection}
                onCardSelect={(card) => console.log('Selected:', card)}
                onCardWishlist={addToWishlist}
                placeholder="Search Magic: The Gathering cards..."
                showFilters={false}
                showAddButton={true}
                showWishlistButton={true}
                showViewModes={true}
                initialQuery={initialQuery}
              />
            </div>
          </TabsContent>

          {/* Advanced Search Tab */}
          <TabsContent value="advanced" className="h-full overflow-auto px-6 py-4 m-0">
            <EnhancedUniversalCardSearch
              onCardAdd={addToCollection}
              onCardSelect={(card) => console.log('Selected:', card)}
              onCardWishlist={addToWishlist}
              placeholder="Search with advanced filters and syntaxes..."
              showFilters={true}
              showAddButton={true}
              showWishlistButton={true}
              showViewModes={true}
              initialQuery={initialQuery}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}