import { supabase } from '@/integrations/supabase/client';
import { deckPowerFromSummary, type DeckPower } from '@/lib/deck/power';
import { categorizeCard } from '@/lib/deck/cardCategories';
import { auditLogger } from '@/lib/audit/auditLogger';

export interface DeckSummary {
  id: string;
  name: string;
  format: string;
  colors: string[];
  identity: string[];
  commander?: {
    name: string;
    image: string;
  };
  counts: {
    total: number;
    unique: number;
    sideboard?: number;
    lands: number;
    creatures: number;
    instants: number;
    sorceries: number;
    artifacts: number;
    enchantments: number;
    planeswalkers: number;
    battles: number;
  };
  curve: {
    bins: Record<"0-1"|"2"|"3"|"4"|"5"|"6-7"|"8-9"|"10+", number>;
  };
  mana: {
    sources: Record<"W"|"U"|"B"|"R"|"G"|"C", number>;
    untappedPctByTurn: { t1: number; t2: number; t3: number };
  };
  legality: {
    ok: boolean;
    issues: string[];
  };
  /**
   * The canonical EDH power score, or `null` when this deck has never been
   * scored. Filled in by {@link deckPowerFromSummary} — the RPC's own
   * `power.score` (an edhpowerlevel.com scrape falling back to the legacy
   * integer column) is deliberately discarded, because it is a different
   * number on a different scale from the one every other surface shows.
   */
  power: DeckPower | null;
  economy: {
    priceUSD: number;
    ownedPct: number;
    missing: number;
  };
  tags: string[];
  updatedAt: string;
  favorite: boolean;
}

/**
 * Deck ids per `compute_deck_summaries` call.
 *
 * The function refuses more than 200, because walking a thousand decks inside
 * one statement is a different kind of outage from the one this replaces. Fifty
 * keeps a single call comfortably inside the 8 second statement timeout the web
 * role carries, and a library big enough to need a second call is rare enough
 * that a second call is fine.
 */
const SUMMARY_CHUNK = 50;

/**
 * Recount the type buckets from the decklist, the way the deck page does.
 *
 * `compute_deck_summary` counts types with overlapping `LIKE` tests over the
 * whole type line, and the app counts them with `categorizeCard`, which reads
 * the FRONT FACE and puts each card in exactly one bucket. They disagree, and
 * both numbers are on screen at once. Measured against the live decks on
 * 2026-08-29:
 *
 *   Atraxa       `/decks` tile "33 lands"   `/deck/:id` "32 Lands"
 *   Syr Vondam   44 lands / 8 enchantments  43 lands / 6 enchantments
 *   Ulamog       58 artifacts               57 artifacts
 *
 * The extra land is Agadeem's Awakening // Agadeem, the Undercrypt, a
 * `Sorcery // Land` you cast as a sorcery. The extra enchantments are
 * enchantment creatures, counted once as creatures and again as enchantments.
 * The extra artifact is an artifact land.
 *
 * So the RPC's `counts` is normalised here the same way its `power` is: one
 * rule, `src/lib/deck/cardCategories.ts`, and every surface reading a
 * `DeckSummary` gets it. `counts.total` and `counts.unique` are left alone —
 * those the function counts correctly.
 *
 * The SQL still holds the old cascade. Anything that reads the RPC without
 * coming through here still sees the old numbers.
 */
function countsFromDecklist(row: unknown, counts: DeckSummary['counts']): DeckSummary['counts'] {
  const cards = (row as { cards?: unknown })?.cards;
  if (!Array.isArray(cards) || cards.length === 0) return counts;

  const tally = {
    lands: 0,
    creatures: 0,
    instants: 0,
    sorceries: 0,
    artifacts: 0,
    enchantments: 0,
    planeswalkers: 0,
    battles: 0,
  };

  for (const entry of cards as Array<Record<string, unknown>>) {
    const quantity = Number(entry?.quantity ?? 1) || 0;
    const typeLine = (entry?.card_data as { type_line?: string } | undefined)?.type_line;
    const bucket = categorizeCard(typeLine);
    if (bucket in tally) tally[bucket as keyof typeof tally] += quantity;
  }

  return { ...counts, ...tally };
}

export class DeckAPI {
  /**
   * Every deck summary for the signed-in user.
   *
   * ## One request for the set, not one per deck
   *
   * This ran `compute_deck_summary` once per deck inside a `Promise.all`, and
   * each of those walks that deck's `deck_cards`. Measured in a browser against
   * a built bundle: 57 requests for 9 decks, 145 for 25. `Promise.all` was not
   * making it cheaper; it was making every one of those calls arrive at the
   * database together.
   *
   * `compute_deck_summaries` takes the list and returns the same payloads, by
   * calling the same one-deck function per id, so the two paths cannot drift
   * and the visibility gate inside it still decides every row. One request per
   * fifty decks.
   *
   * `usePlayDecks` names this function as the surviving example of the bad
   * shape in its header comment. It is not one any more.
   */
  static async getDeckSummaries(): Promise<DeckSummary[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get deck IDs only first
      const { data: decks, error } = await supabase
        .from('user_decks')
        .select('id')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!decks || decks.length === 0) return [];

      const ids = decks.map(({ id }) => id);
      const summaries: DeckSummary[] = [];

      for (let i = 0; i < ids.length; i += SUMMARY_CHUNK) {
        const slice = ids.slice(i, i + SUMMARY_CHUNK);
        const { data, error: rpcError } = await supabase.rpc(
          'compute_deck_summaries' as any,
          { p_deck_ids: slice } as any
        );

        if (rpcError) {
          console.error('Error loading summaries for decks:', slice, rpcError);
          throw rpcError;
        }

        /* The function returns the summaries in the order it was given the ids
           and drops the ones it will not show, which is exactly what the old
           `filter(Boolean)` did after the per-deck calls. */
        for (const row of (data ?? []) as unknown[]) {
          const summary = row as unknown as DeckSummary;
          summaries.push({
            ...summary,
            counts: countsFromDecklist(row, summary.counts),
            power: deckPowerFromSummary(row),
          });
        }
      }

      return summaries;
    } catch (error) {
      console.error('Error fetching deck summaries:', error);
      throw error;
    }
  }

  /**
   * Get detailed summary for a specific deck
   */
  static async getDeckSummary(deckId: string): Promise<DeckSummary | null> {
    try {
      const { data: summaryData, error } = await supabase
        .rpc('compute_deck_summary', { deck_id: deckId });

      if (error) {
        throw error;
      }

      if (!summaryData) return null;

      // One normalisation point. Every consumer of DeckSummary.power gets the
      // canonical shape, so no screen can render a second definition of power.
      const summary = summaryData as unknown as DeckSummary;
      return {
        ...summary,
        counts: countsFromDecklist(summaryData, summary.counts),
        power: deckPowerFromSummary(summaryData),
      };
    } catch (error) {
      console.error('Error fetching deck summary:', error);
      throw error;
    }
  }

  /**
   * Toggle favorite status for a deck
   */
  static async toggleFavorite(deckId: string): Promise<{ favorited: boolean; message: string }> {
    try {
      const { data: result, error } = await supabase
        .rpc('toggle_deck_favorite', { deck_id: deckId });

      if (error) {
        throw error;
      }

      const resultObj = result as any;
      if (resultObj.error) {
        throw new Error(resultObj.error);
      }

      return {
        favorited: resultObj.favorited,
        message: resultObj.message
      };
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  /**
   * Get user's favorite decks
   */
  static async getFavoriteDecks(): Promise<any[]> {
    try {
      const { data: favorites, error } = await supabase
        .rpc('get_favorite_decks');

      if (error) {
        throw error;
      }

      return (favorites as any[]) || [];
    } catch (error) {
      console.error('Error fetching favorite decks:', error);
      throw error;
    }
  }

  /**
   * Duplicate a deck
   */
  static async duplicateDeck(deckId: string): Promise<string> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Get original deck
      const { data: originalDeck, error: deckError } = await supabase
        .from('user_decks')
        .select('*')
        .eq('id', deckId)
        .single();

      if (deckError) {
        throw deckError;
      }

      // Create new deck
      const { data: newDeck, error: createError } = await supabase
        .from('user_decks')
        .insert({
          user_id: session.user.id,
          name: `${originalDeck.name} (Copy)`,
          format: originalDeck.format,
          colors: originalDeck.colors,
          power_level: originalDeck.power_level,
          // The copy has an identical decklist, so the score it inherits is
          // current by definition — carrying the analysis across avoids
          // showing a duplicate as unscored until someone opens it.
          edh_analysis: originalDeck.edh_analysis,
          edh_cards_hash: originalDeck.edh_cards_hash,
          description: originalDeck.description,
          is_public: false
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Log deck creation
      await auditLogger.logDeckCreate(newDeck.id, newDeck.name, newDeck.format);

      // Copy deck cards
      const { data: originalCards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', deckId);

      if (cardsError) {
        throw cardsError;
      }

      if (originalCards && originalCards.length > 0) {
        const newCards = originalCards.map(card => ({
          deck_id: newDeck.id,
          card_id: card.card_id,
          card_name: card.card_name,
          quantity: card.quantity,
          is_commander: card.is_commander,
          is_sideboard: card.is_sideboard
        }));

        const { error: insertError } = await supabase
          .from('deck_cards')
          .insert(newCards);

        if (insertError) {
          throw insertError;
        }
      }

      return newDeck.id;
    } catch (error) {
      console.error('Error duplicating deck:', error);
      throw error;
    }
  }

  /**
   * Export deck in various formats
   */
  static async exportDeck(deckId: string, format: 'arena' | 'txt' | 'mtgo'): Promise<Blob> {
    try {
      // Get deck cards
      const { data: deckCards, error } = await supabase
        .from('deck_cards')
        .select('card_name, quantity, is_commander, is_sideboard')
        .eq('deck_id', deckId);

      if (error) {
        throw error;
      }

      let exportText = '';
      const commander = deckCards?.find(card => card.is_commander);
      const mainboard = deckCards?.filter(card => !card.is_sideboard && !card.is_commander) || [];
      const sideboard = deckCards?.filter(card => card.is_sideboard) || [];

      switch (format) {
        case 'arena':
          // Arena format
          exportText = 'Deck\n';
          if (commander) {
            exportText += `1 ${commander.card_name} (Commander)\n`;
          }
          mainboard.forEach(card => {
            exportText += `${card.quantity} ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\nSideboard\n';
            sideboard.forEach(card => {
              exportText += `${card.quantity} ${card.card_name}\n`;
            });
          }
          break;

        case 'mtgo':
          // MTGO format (similar to arena but different header)
          if (commander) {
            exportText += `1 ${commander.card_name} (Commander)\n`;
          }
          mainboard.forEach(card => {
            exportText += `${card.quantity} ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\n';
            sideboard.forEach(card => {
              exportText += `SB: ${card.quantity} ${card.card_name}\n`;
            });
          }
          break;

        case 'txt':
        default:
          // Plain text format
          if (commander) {
            exportText += `1x ${commander.card_name} (Commander)\n\n`;
          }
          mainboard.forEach(card => {
            exportText += `${card.quantity}x ${card.card_name}\n`;
          });
          if (sideboard.length > 0) {
            exportText += '\nSideboard:\n';
            sideboard.forEach(card => {
              exportText += `${card.quantity}x ${card.card_name}\n`;
            });
          }
          break;
      }

      return new Blob([exportText], { type: 'text/plain' });
    } catch (error) {
      console.error('Error exporting deck:', error);
      throw error;
    }
  }

  /**
   * Get storage container linked to deck (if any)
   */
  static async getDeckStorage(deckId: string): Promise<any | null> {
    try {
      const { data: container, error } = await supabase
        .from('storage_containers')
        .select('*')
        .eq('deck_id', deckId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return container;
    } catch (error) {
      console.error('Error fetching deck storage:', error);
      throw error;
    }
  }
}