import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { 
  Card, 
  CollectionCard, 
  CollectionSnapshot, 
  CollectionFilters,
  ImportResult,
  CardSearchResult,
  ApiResponse 
} from '@/types/collection';

type DbCard = Database['public']['Tables']['cards']['Row'];
type DbCollectionCard = Database['public']['Tables']['user_collections']['Row'];

export class CollectionAPI {
  // Get user's complete collection with joined card data
  static async getCollection(): Promise<ApiResponse<CollectionSnapshot>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      const { data: collectionCards, error } = await supabase
        .from('user_collections')
        .select(`
          *,
          cards!inner(*)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        return { error: error.message };
      }

      // Transform the database results to our types
      const items: CollectionCard[] = (collectionCards || []).map(item => ({
        id: item.id,
        user_id: item.user_id,
        card_id: item.card_id,
        card_name: item.card_name,
        set_code: item.set_code,
        quantity: item.quantity,
        foil: item.foil,
        condition: item.condition as CollectionCard['condition'],
        price_usd: item.price_usd || undefined,
        created_at: item.created_at,
        updated_at: item.updated_at,
        card: transformDbCard((item as any).cards)
      }));
      
      // Calculate totals
      const totals = {
        unique: items.filter(item => (item.quantity + item.foil) > 0).length,
        count: items.reduce((sum, item) => sum + item.quantity + item.foil, 0),
        valueUSD: items.reduce((sum, item) => {
          if (!item.card?.prices) return sum;
          const prices = item.card.prices as any;
          if (!prices.usd) return sum;
          const price = parseFloat(prices.usd);
          return sum + (item.quantity * price) + (item.foil * price);
        }, 0),
        avgCmc: 0 // Calculate in UI utility
      };

      return {
        data: {
          id: user.id,
          user_id: user.id,
          items,
          totals
        }
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Add a card to collection
  static async addCard(cardId: string, quantity: number = 1, foil: number = 0): Promise<ApiResponse<CollectionCard>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      // Try to find card by ID first, then by name if it's a Scryfall format
      let { data: card, error: cardError } = await supabase
        .from('cards')
        .select('*')
        .eq('id', cardId)
        .maybeSingle();

      // If not found and cardId looks like a Scryfall UUID, try by name match
      if (!card && cardId.match(/^[0-9a-f-]{36}$/i)) {
        // For now, return a more helpful error since we need to match by name
        return { error: `Please add cards by searching for their name. Direct Scryfall ID lookup not yet supported.` };
      }

      if (cardError) {
        console.error('Card lookup error:', cardError);
        return { error: `Database error: ${cardError.message}` };
      }

      if (!card) {
        console.error('Card not found for ID:', cardId);
        return { error: `Card not found with ID: ${cardId}` };
      }

      // Check if already in collection (use the found card's ID)
      const { data: existing } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const cardPrices = card.prices as any;
        const { data: updated, error: updateError } = await supabase
          .from('user_collections')
          .update({
            quantity: existing.quantity + quantity,
            foil: existing.foil + foil,
            price_usd: parseFloat(cardPrices?.usd || '0')
          })
          .eq('id', existing.id)
          .select('*')
          .single();

        if (updateError) {
          return { error: updateError.message };
        }

        return { data: { 
          ...updated, 
          card: transformDbCard(card),
          condition: updated.condition as CollectionCard['condition']
        } as CollectionCard };
      } else {
        // Insert new
        const cardPrices = card.prices as any;
        const { data: inserted, error: insertError } = await supabase
          .from('user_collections')
          .insert({
            user_id: user.id,
            card_id: card.id,  // Use the found card's ID, not the input cardId
            card_name: card.name,
            set_code: card.set_code,
            quantity,
            foil,
            condition: 'near_mint',
            price_usd: parseFloat(cardPrices?.usd || '0')
          })
          .select('*')
          .single();

        if (insertError) {
          return { error: insertError.message };
        }

        return { data: { 
          ...inserted, 
          card: transformDbCard(card),
          condition: inserted.condition as CollectionCard['condition']
        } as CollectionCard };
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Add a card to collection by name (for Scryfall integration)
  static async addCardByName(cardName: string, setCode?: string, quantity: number = 1, foil: number = 0): Promise<ApiResponse<CollectionCard>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      // Search for card by name
      let cardQuery = supabase
        .from('cards')
        .select('*')
        .ilike('name', cardName);

      if (setCode) {
        cardQuery = cardQuery.eq('set_code', setCode);
      }

      const { data: cards, error: cardError } = await cardQuery.limit(1);

      if (cardError) {
        console.error('Card lookup error:', cardError);
        return { error: `Database error: ${cardError.message}` };
      }

      if (!cards || cards.length === 0) {
        // Card not found in local database - inform user about sync issue
        console.error('Card not found in local database:', cardName);
        return { 
          error: `"${cardName}" is not currently in our database. The card database may need to be updated. Please try searching for a different card or contact support.` 
        };
      }

      const card = cards[0];

      // Use the existing addCard method with the found card's ID
      return this.addCard(card.id, quantity, foil);

    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Set exact quantities for a card
  static async setCardQuantity(cardId: string, quantity: number, foil: number = 0): Promise<ApiResponse<CollectionCard>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      if (quantity < 0 || foil < 0) {
        return { error: 'Quantities cannot be negative' };
      }

      const { data: updated, error } = await supabase
        .from('user_collections')
        .update({ quantity, foil })
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .select(`
          *,
          cards!inner(*)
        `)
        .single();

      if (error) {
        return { error: error.message };
      }

      return { 
        data: {
          ...updated,
          card: transformDbCard((updated as any).cards),
          condition: updated.condition as CollectionCard['condition']
        } as CollectionCard 
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Remove card from collection
  static async removeCard(cardId: string, quantity: number = 1): Promise<ApiResponse<void>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      const { data: existing } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .eq('card_id', cardId)
        .single();

      if (!existing) {
        return { error: 'Card not in collection' };
      }

      const newQuantity = Math.max(0, existing.quantity - quantity);
      
      if (newQuantity === 0 && existing.foil === 0) {
        // Remove completely
        const { error } = await supabase
          .from('user_collections')
          .delete()
          .eq('id', existing.id);

        if (error) {
          return { error: error.message };
        }
      } else {
        // Update quantity
        const { error } = await supabase
          .from('user_collections')
          .update({ quantity: newQuantity })
          .eq('id', existing.id);

        if (error) {
          return { error: error.message };
        }
      }

      return { data: undefined };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Search cards in database
  static async searchCards(
    query: string = '', 
    filters: CollectionFilters = {},
    page: number = 1,
    pageSize: number = 60
  ): Promise<ApiResponse<CardSearchResult>> {
    try {
      let dbQuery = supabase
        .from('cards')
        .select('*', { count: 'exact' });

      // Apply search query
      if (query.trim()) {
        dbQuery = dbQuery.ilike('name', `%${query.trim()}%`);
      }

      // Apply filters
      if (filters.sets?.length) {
        dbQuery = dbQuery.in('set_code', filters.sets);
      }

      if (filters.colors?.length) {
        dbQuery = dbQuery.overlaps('colors', filters.colors);
      }

      if (filters.types?.length) {
        const typeQueries = filters.types.map(type => `type_line.ilike.%${type}%`);
        dbQuery = dbQuery.or(typeQueries.join(','));
      }

      if (filters.rarity) {
        dbQuery = dbQuery.eq('rarity', filters.rarity);
      }

      if (filters.cmcMin !== undefined) {
        dbQuery = dbQuery.gte('cmc', filters.cmcMin);
      }

      if (filters.cmcMax !== undefined) {
        dbQuery = dbQuery.lte('cmc', filters.cmcMax);
      }

      if (filters.format) {
        dbQuery = dbQuery.contains('legalities', { [filters.format]: 'legal' });
      }

      // Apply pagination
      const offset = (page - 1) * pageSize;
      dbQuery = dbQuery.range(offset, offset + pageSize - 1);

      const { data: cards, error, count } = await dbQuery;

      if (error) {
        return { error: error.message };
      }

      return {
        data: {
          cards: (cards || []).map(transformDbCard),
          has_more: (count || 0) > page * pageSize,
          total_cards: count || 0
        }
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Import collection from text
  static async importCollection(
    text: string, 
    format: 'decklist' | 'csv' = 'decklist'
  ): Promise<ApiResponse<ImportResult>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      const lines = text.trim().split('\n').filter(line => line.trim());
      const result: ImportResult = {
        total: lines.length,
        added: 0,
        updated: 0,
        errors: [],
        warnings: []
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) continue;

        try {
          const parseResult = this.parseImportLine(line, format);
          if (!parseResult) {
            result.errors.push(`Line ${i + 1}: Could not parse line`);
            continue;
          }

          const { cardName, quantity, foil, setCode } = parseResult;

          // Search for card
          let cardQuery = supabase
            .from('cards')
            .select('*')
            .ilike('name', cardName);

          if (setCode) {
            cardQuery = cardQuery.eq('set_code', setCode);
          }

          const { data: cards } = await cardQuery.limit(1);
          
          if (!cards || cards.length === 0) {
            result.errors.push(`Line ${i + 1}: Card "${cardName}" not found`);
            continue;
          }

          const card = cards[0];
          const addResult = await this.addCard(card.id, quantity, foil);
          
          if (addResult.error) {
            result.errors.push(`Line ${i + 1}: ${addResult.error}`);
          } else {
            result.added++;
          }

        } catch (error) {
          result.errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { data: result };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Parse import line based on format
  private static parseImportLine(line: string, format: 'decklist' | 'csv'): {
    cardName: string;
    quantity: number;
    foil: number;
    setCode?: string;
  } | null {
    if (format === 'decklist') {
      const match = line.match(/^(\d+)x?\s+(.+)$/);
      if (match) {
        return {
          cardName: match[2].trim(),
          quantity: parseInt(match[1]),
          foil: 0
        };
      }
    } else if (format === 'csv') {
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      if (parts.length >= 2) {
        return {
          cardName: parts[0],
          quantity: parseInt(parts[1]) || 1,
          foil: parts[3]?.toLowerCase() === 'foil' ? 1 : 0,
          setCode: parts[2] || undefined
        };
      }
    }
    return null;
  }
}

// Transform database card to our Card type
function transformDbCard(dbCard: DbCard): Card {
  return {
    id: dbCard.id,
    oracle_id: dbCard.oracle_id,
    name: dbCard.name,
    set_code: dbCard.set_code,
    collector_number: dbCard.collector_number || undefined,
    colors: dbCard.colors || [],
    color_identity: dbCard.color_identity || [],
    cmc: Number(dbCard.cmc) || 0,
    type_line: dbCard.type_line || '',
    oracle_text: dbCard.oracle_text || undefined,
    keywords: dbCard.keywords || [],
    legalities: (dbCard.legalities || {}) as Record<string, "legal"|"not_legal"|"restricted"|"banned">,
    image_uris: (dbCard.image_uris || {}) as Card['image_uris'],
    is_legendary: dbCard.is_legendary || false,
    prices: (dbCard.prices || {}) as Card['prices'],
    rarity: (dbCard.rarity || 'common') as Card['rarity'],
    updated_at: dbCard.updated_at || undefined
  };
}