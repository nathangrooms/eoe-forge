import { supabase } from '@/integrations/supabase/client';
import { uniqueCards, cardPrintings } from '@/lib/cards/cardQuery';
import { fetchPrintingSpreads } from '@/lib/cards/printings';
import { valueOwned } from '@/lib/pricing/printings';
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
        printing_chosen: (item as any).printing_chosen === true,
        created_at: item.created_at,
        updated_at: item.updated_at,
        card: transformDbCard((item as any).cards)
      }));

      /*
       * The total is a range with a stated middle now, not one number.
       *
       * A collection row points at a printing, and printings of one card differ
       * enormously in price. Every row written before 19 Aug 2026 took its
       * printing from a catalogue holding exactly one of them, so nobody chose
       * it. Summing those at their assigned printing's price produces a
       * confident figure that is not this owner's figure.
       *
       * `valueOwned` keeps the two apart: settled copies (the owner picked the
       * printing, or the card only ever had one) are added up, and the rest are
       * reported as the range their real printings span. Both halves come from
       * the database. Neither is invented.
       */
      const spreads = await fetchPrintingSpreads(items.map(i => i.card?.oracle_id));
      const value = valueOwned(
        items.map(item => ({
          prices: item.card?.prices,
          quantity: item.quantity,
          foil: item.foil,
          oracleId: item.card?.oracle_id,
          printingChosen: item.printing_chosen,
        })),
        spreads,
        'USD'
      );

      const totals = {
        unique: items.filter(item => (item.quantity + item.foil) > 0).length,
        count: items.reduce((sum, item) => sum + item.quantity + item.foil, 0),
        // The settled figure only. Callers needing the whole picture read
        // `value`, which carries the range and the unsettled row count.
        valueUSD: value.settled,
        avgCmc: 0 // Calculate in UI utility
      };

      return {
        data: {
          id: user.id,
          user_id: user.id,
          items,
          totals,
          value
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
      // A printing id, so read the printings. This is the one lookup here
      // where the caller already knows exactly which printing it means.
      let { data: card, error: cardError } = await cardPrintings()
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

      // A typed name resolves to ONE card, then to a printing.
      //
      // Without a set code the user has not chosen a printing, so read
      // cards_unique: it answers with the cheapest printing, deterministically,
      // instead of whichever of a card's forty rows the planner returned first.
      // With a set code they HAVE named a printing, so read the printings.
      let cardQuery = setCode
        ? cardPrintings().select('*').ilike('name', cardName).eq('set_code', setCode)
        : uniqueCards().select('*').ilike('name', cardName);

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
      // One row per card: this is a search, and its `count` is shown to the
      // user as "how many cards matched". Counting printings would report
      // roughly three times the real number of cards.
      let dbQuery = uniqueCards().select('*', { count: 'exact' });

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

          // Same rule as the single add: a set code names a printing, a bare
          // name names a card and gets the cheapest printing of it.
          let cardQuery = setCode
            ? cardPrintings().select('*').ilike('name', cardName).eq('set_code', setCode)
            : uniqueCards().select('*').ilike('name', cardName);

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

  // Bulk update quantities
  static async bulkUpdateQuantity(itemIds: string[], delta: number): Promise<ApiResponse<void>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      for (const itemId of itemIds) {
        const { data: existing } = await supabase
          .from('user_collections')
          .select('quantity')
          .eq('id', itemId)
          .eq('user_id', user.id)
          .single();

        if (existing) {
          const newQuantity = Math.max(0, existing.quantity + delta);
          await supabase
            .from('user_collections')
            .update({ quantity: newQuantity })
            .eq('id', itemId)
            .eq('user_id', user.id);
        }
      }

      return { data: undefined };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Bulk delete items
  static async bulkDelete(itemIds: string[]): Promise<ApiResponse<void>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { error: 'User not authenticated' };
      }

      const { error } = await supabase
        .from('user_collections')
        .delete()
        .in('id', itemIds)
        .eq('user_id', user.id);

      if (error) {
        return { error: error.message };
      }

      return { data: undefined };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
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
    mana_cost: dbCard.mana_cost || undefined,
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