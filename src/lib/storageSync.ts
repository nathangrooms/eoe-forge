import { supabase } from '@/integrations/supabase/client';

/**
 * Sync storage assignments with collection updates
 * Ensures storage items reflect current collection state
 */
export class StorageSync {
  /**
   * Validate and sync storage items after collection changes
   * Removes assignments that exceed collection quantities
   */
  static async syncAfterCollectionChange(userId: string, cardId: string): Promise<void> {
    try {
      // Get current collection quantity
      const { data: collection, error: collectionError } = await supabase
        .from('user_collections')
        .select('quantity, foil')
        .eq('user_id', userId)
        .eq('card_id', cardId)
        .single();

      if (collectionError) {
        // Card removed from collection - remove all storage assignments
        await this.removeAllAssignments(cardId);
        return;
      }

      if (!collection) {
        await this.removeAllAssignments(cardId);
        return;
      }

      // Get all storage assignments for this card
      const { data: assignments, error: assignmentsError } = await supabase
        .from('storage_items')
        .select('id, qty, foil, container_id')
        .eq('card_id', cardId);

      if (assignmentsError) throw assignmentsError;

      if (!assignments || assignments.length === 0) return;

      // Calculate total assigned by foil status
      const assignedNormal = assignments.filter(a => !a.foil).reduce((sum, a) => sum + a.qty, 0);
      const assignedFoil = assignments.filter(a => a.foil).reduce((sum, a) => sum + a.qty, 0);

      // Check if we're over-assigned
      const excessNormal = Math.max(0, assignedNormal - collection.quantity);
      const excessFoil = Math.max(0, assignedFoil - collection.foil);

      // Remove excess assignments (oldest first)
      if (excessNormal > 0) {
        await this.removeExcessAssignments(cardId, false, excessNormal);
      }
      if (excessFoil > 0) {
        await this.removeExcessAssignments(cardId, true, excessFoil);
      }
    } catch (error) {
      console.error('Error syncing storage with collection:', error);
      throw error;
    }
  }

  /**
   * Remove all assignments for a card
   */
  private static async removeAllAssignments(cardId: string): Promise<void> {
    const { error } = await supabase
      .from('storage_items')
      .delete()
      .eq('card_id', cardId);

    if (error) throw error;
  }

  /**
   * Remove excess assignments for a card (oldest first)
   */
  private static async removeExcessAssignments(
    cardId: string, 
    foil: boolean, 
    excessQty: number
  ): Promise<void> {
    const { data: items, error: fetchError } = await supabase
      .from('storage_items')
      .select('id, qty')
      .eq('card_id', cardId)
      .eq('foil', foil)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    if (!items) return;

    let remaining = excessQty;
    
    for (const item of items) {
      if (remaining <= 0) break;

      if (item.qty <= remaining) {
        // Remove entire item
        await supabase
          .from('storage_items')
          .delete()
          .eq('id', item.id);
        remaining -= item.qty;
      } else {
        // Reduce quantity
        await supabase
          .from('storage_items')
          .update({ qty: item.qty - remaining })
          .eq('id', item.id);
        remaining = 0;
      }
    }
  }

  /**
   * Get available quantity for assignment
   * Returns how many cards can still be assigned to storage
   */
  static async getAvailableQuantity(
    userId: string,
    cardId: string,
    foil: boolean
  ): Promise<number> {
    // Get collection quantity
    const { data: collection, error: collectionError } = await supabase
      .from('user_collections')
      .select('quantity, foil')
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .single();

    if (collectionError || !collection) return 0;

    // Get assigned quantity
    const { data: assignments, error: assignmentsError } = await supabase
      .from('storage_items')
      .select('qty')
      .eq('card_id', cardId)
      .eq('foil', foil);

    if (assignmentsError) throw assignmentsError;

    const totalAssigned = assignments?.reduce((sum, a) => sum + a.qty, 0) || 0;
    const available = foil ? collection.foil : collection.quantity;

    return Math.max(0, available - totalAssigned);
  }
}
