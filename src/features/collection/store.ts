import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Card, 
  CollectionCard, 
  CollectionSnapshot, 
  CollectionFilters,
  CollectionStats,
  ImportResult 
} from '@/types/collection';
import { CollectionAPI } from '@/server/routes/collection';
import { collectionTotals, getTopValueCards, getColorDistribution, getTypeDistribution } from '@/features/collection/value';

interface CollectionState {
  // Data
  snapshot: CollectionSnapshot | null;
  loading: boolean;
  error: string | null;
  
  // UI State
  filters: CollectionFilters;
  searchQuery: string;
  viewMode: 'grid' | 'table' | 'binder';
  selectedCards: string[]; // card IDs
  
  // Actions
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  
  // Search & Filter
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<CollectionFilters>) => void;
  clearFilters: () => void;
  
  // UI
  setViewMode: (mode: 'grid' | 'table' | 'binder') => void;
  toggleCardSelection: (cardId: string) => void;
  clearSelection: () => void;
  
  // Collection Management
  addCard: (cardId: string, quantity?: number, foil?: number) => Promise<boolean>;
  updateCard: (cardId: string, quantity: number, foil?: number) => Promise<boolean>;
  removeCard: (cardId: string, quantity?: number) => Promise<boolean>;
  
  // Bulk Operations
  importCards: (text: string, format?: 'decklist' | 'csv') => Promise<ImportResult>;
  
  // Analytics
  getStats: () => CollectionStats;
  getFilteredCards: () => CollectionCard[];
}

const defaultFilters: CollectionFilters = {
  search: '',
  sets: [],
  colors: [],
  types: [],
  rarity: undefined,
  cmcMin: undefined,
  cmcMax: undefined,
  format: undefined,
  owned: undefined,
  foilOnly: false,
  condition: []
};

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      // Initial state
      snapshot: null,
      loading: false,
      error: null,
      filters: defaultFilters,
      searchQuery: '',
      viewMode: 'grid',
      selectedCards: [],

      // Load collection from API
      load: async () => {
        set({ loading: true, error: null });
        
        try {
          const result = await CollectionAPI.getCollection();
          
          if (result.error) {
            set({ error: result.error, loading: false });
            return;
          }
          
          set({ 
            snapshot: result.data || null, 
            loading: false, 
            error: null 
          });
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Unknown error', 
            loading: false 
          });
        }
      },

      refresh: async () => {
        await get().load();
      },

      // Search & Filter
      setSearchQuery: (searchQuery) => {
        set({ searchQuery });
        set((state) => ({
          filters: { ...state.filters, search: searchQuery }
        }));
      },

      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters }
        }));
      },

      clearFilters: () => {
        set({ 
          filters: defaultFilters,
          searchQuery: ''
        });
      },

      // UI
      setViewMode: (viewMode) => set({ viewMode }),

      toggleCardSelection: (cardId) => {
        set((state) => ({
          selectedCards: state.selectedCards.includes(cardId)
            ? state.selectedCards.filter(id => id !== cardId)
            : [...state.selectedCards, cardId]
        }));
      },

      clearSelection: () => set({ selectedCards: [] }),

      // Collection Management
      addCard: async (cardId, quantity = 1, foil = 0) => {
        try {
          const result = await CollectionAPI.addCard(cardId, quantity, foil);
          
          if (result.error) {
            set({ error: result.error });
            return false;
          }

          // Refresh collection
          await get().refresh();
          return true;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Unknown error' });
          return false;
        }
      },

      updateCard: async (cardId, quantity, foil = 0) => {
        try {
          const result = await CollectionAPI.setCardQuantity(cardId, quantity, foil);
          
          if (result.error) {
            set({ error: result.error });
            return false;
          }

          // Refresh collection
          await get().refresh();
          return true;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Unknown error' });
          return false;
        }
      },

      removeCard: async (cardId, quantity = 1) => {
        try {
          const result = await CollectionAPI.removeCard(cardId, quantity);
          
          if (result.error) {
            set({ error: result.error });
            return false;
          }

          // Refresh collection
          await get().refresh();
          return true;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Unknown error' });
          return false;
        }
      },

      // Bulk Operations
      importCards: async (text, format = 'decklist') => {
        const result = await CollectionAPI.importCollection(text, format);
        
        if (result.data) {
          // Refresh collection after import
          await get().refresh();
          return result.data;
        }
        
        return {
          total: 0,
          added: 0,
          updated: 0,
          errors: [result.error || 'Import failed'],
          warnings: []
        };
      },

      // Analytics
      getStats: () => {
        const { snapshot } = get();
        if (!snapshot) {
          return {
            totalCards: 0,
            uniqueCards: 0,
            totalValue: 0,
            avgCmc: 0,
            colorDistribution: {},
            typeDistribution: {},
            rarityDistribution: {},
            setDistribution: {},
            topValueCards: [],
            recentlyAdded: []
          };
        }

        const items = snapshot.items;
        const totals = collectionTotals(items);
        const topCards = getTopValueCards(items, 10);
        
        // Additional stats
        const colorDistribution = getColorDistribution(items);
        const typeDistribution = getTypeDistribution(items);
        
        const rarityDistribution: Record<string, number> = {};
        const setDistribution: Record<string, number> = {};
        
        items.forEach(item => {
          if (!item.card) return;
          const qty = item.quantity + item.foil;
          
          // Rarity distribution
          const rarity = item.card.rarity;
          rarityDistribution[rarity] = (rarityDistribution[rarity] || 0) + qty;
          
          // Set distribution
          const setCode = item.card.set_code;
          setDistribution[setCode] = (setDistribution[setCode] || 0) + qty;
        });

        const recentlyAdded = items
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);

        return {
          totalCards: totals.count,
          uniqueCards: totals.unique,
          totalValue: totals.valueUSD,
          avgCmc: totals.avgCmc,
          colorDistribution,
          typeDistribution,
          rarityDistribution,
          setDistribution,
          topValueCards: topCards,
          recentlyAdded
        };
      },

      getFilteredCards: () => {
        const { snapshot, filters } = get();
        if (!snapshot) return [];

        let filtered = snapshot.items;

        // Search filter
        if (filters.search) {
          const query = filters.search.toLowerCase();
          filtered = filtered.filter(item => 
            item.card_name.toLowerCase().includes(query) ||
            item.card?.oracle_text?.toLowerCase().includes(query)
          );
        }

        // Set filter
        if (filters.sets?.length) {
          filtered = filtered.filter(item => 
            filters.sets!.includes(item.set_code)
          );
        }

        // Color filter
        if (filters.colors?.length) {
          filtered = filtered.filter(item => 
            item.card?.colors.some(color => filters.colors!.includes(color))
          );
        }

        // Type filter
        if (filters.types?.length) {
          filtered = filtered.filter(item => 
            filters.types!.some(type => 
              item.card?.type_line.toLowerCase().includes(type.toLowerCase())
            )
          );
        }

        // Rarity filter
        if (filters.rarity) {
          filtered = filtered.filter(item => 
            item.card?.rarity === filters.rarity
          );
        }

        // CMC filter
        if (filters.cmcMin !== undefined) {
          filtered = filtered.filter(item => 
            (item.card?.cmc || 0) >= filters.cmcMin!
          );
        }

        if (filters.cmcMax !== undefined) {
          filtered = filtered.filter(item => 
            (item.card?.cmc || 0) <= filters.cmcMax!
          );
        }

        // Owned filter (show only cards with quantity > 0)
        if (filters.owned) {
          filtered = filtered.filter(item => 
            (item.quantity + item.foil) > 0
          );
        }

        // Foil only filter
        if (filters.foilOnly) {
          filtered = filtered.filter(item => item.foil > 0);
        }

        // Condition filter
        if (filters.condition?.length) {
          filtered = filtered.filter(item => 
            filters.condition!.includes(item.condition)
          );
        }

        return filtered;
      }
    }),
    {
      name: 'mtg-collection-v2',
      partialize: (state) => ({
        viewMode: state.viewMode,
        filters: state.filters,
        searchQuery: state.searchQuery
      })
    }
  )
);