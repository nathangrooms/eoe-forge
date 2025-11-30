import { supabase } from '@/integrations/supabase/client';
import { scryfallAPI } from './scryfall';
import { auditLogger } from '@/lib/audit/auditLogger';

export interface BulkImportOptions {
  format: 'arena' | 'csv' | 'txt';
  updateQuantities?: boolean;
  defaultCondition?: string;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export class CollectionAPI {
  /**
   * Import cards in bulk from various formats
   */
  static async bulkImport(
    cardList: string,
    options: BulkImportOptions = { format: 'arena' }
  ): Promise<ImportResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    const result: ImportResult = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Parse the card list based on format
    const parsedCards = this.parseCardList(cardList, options.format);

    for (const { quantity, name, set } of parsedCards) {
      try {
        // Search for the card
        const searchQuery = set ? `!"${name}" set:${set}` : `!"${name}"`;
        const searchResult = await scryfallAPI.searchCards(searchQuery, 1);
        
        if (!searchResult.cards || searchResult.cards.length === 0) {
          result.failed++;
          result.errors.push(`Card not found: ${name}`);
          continue;
        }

        const card = searchResult.cards[0];

        // Check if card exists in collection
        const { data: existing } = await supabase
          .from('user_collections')
          .select('id, quantity')
          .eq('user_id', user.id)
          .eq('card_id', card.id)
          .maybeSingle();

        if (existing) {
          // Update quantity
          if (options.updateQuantities) {
            await supabase
              .from('user_collections')
              .update({ 
                quantity: existing.quantity + quantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);
          }
        } else {
          // Insert new card
          await supabase
            .from('user_collections')
            .insert({
              user_id: user.id,
              card_id: card.id,
              card_name: card.name,
              set_code: card.set,
              quantity: quantity,
              foil: 0,
              condition: options.defaultCondition || 'near_mint',
              price_usd: parseFloat(card.prices?.usd || '0')
            });
        }

        result.success++;
      } catch (error) {
        result.failed++;
        result.errors.push(`Failed to import ${name}: ${error}`);
        console.error(`Error importing card ${name}:`, error);
      }
    }

    // Log bulk import operation
    if (result.success > 0) {
      await auditLogger.logBulkImport(result.success, options.format);
    }

    return result;
  }

  /**
   * Parse card list from various formats
   */
  private static parseCardList(
    text: string,
    format: 'arena' | 'csv' | 'txt'
  ): Array<{ quantity: number; name: string; set?: string }> {
    const lines = text.split('\n').filter(line => line.trim());
    const cards: Array<{ quantity: number; name: string; set?: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase().startsWith('deck') || trimmed.toLowerCase().startsWith('sideboard')) {
        continue;
      }

      let quantity = 1;
      let cardName = trimmed;
      let setCode = undefined;

      if (format === 'arena' || format === 'txt') {
        // Format: "4 Lightning Bolt" or "1x Lightning Bolt"
        const match = trimmed.match(/^(\d+)x?\s+(.+?)(\s+\(([A-Z0-9]+)\))?$/i);
        if (match) {
          quantity = parseInt(match[1]);
          cardName = match[2].trim();
          setCode = match[4];
        }
      } else if (format === 'csv') {
        // Format: "Card Name,Quantity,Set"
        const parts = trimmed.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          cardName = parts[0];
          quantity = parseInt(parts[1]) || 1;
          setCode = parts[2];
        }
      }

      if (cardName) {
        cards.push({ quantity, name: cardName, set: setCode });
      }
    }

    return cards;
  }

  /**
   * Export collection in various formats
   */
  static async exportCollection(
    format: 'csv' | 'txt' | 'arena'
  ): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { data: collection, error } = await supabase
      .from('user_collections')
      .select('*')
      .eq('user_id', user.id)
      .order('card_name');

    if (error) throw error;
    if (!collection) return '';

    let output = '';

    if (format === 'csv') {
      output = 'Card Name,Set,Quantity,Foil,Condition,Price\n';
      collection.forEach(item => {
        output += `${item.card_name},${item.set_code},${item.quantity},${item.foil},${item.condition},${item.price_usd || 0}\n`;
      });
    } else if (format === 'arena' || format === 'txt') {
      collection.forEach(item => {
        const suffix = format === 'arena' ? '' : 'x';
        output += `${item.quantity}${suffix} ${item.card_name}\n`;
      });
    }

    return output;
  }
}
