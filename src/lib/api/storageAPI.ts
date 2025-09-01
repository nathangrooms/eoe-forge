import { supabase } from "@/integrations/supabase/client";
import { 
  StorageContainer, 
  StorageSlot, 
  StorageItem, 
  StorageOverview, 
  StorageAssignRequest, 
  StorageUnassignRequest,
  StorageItemWithCard,
  StorageType
} from "@/types/storage";

export class StorageAPI {
  static async getOverview(): Promise<StorageOverview> {
    const { data: containers, error: containersError } = await supabase
      .from('storage_containers')
      .select(`
        *,
        storage_items(qty, card_id, foil)
      `)
      .order('created_at', { ascending: true }) as { data: any[] | null, error: any };

    if (containersError) throw containersError;

    // Get collection totals for unassigned calculation
    const { data: collectionItems, error: collectionError } = await supabase
      .from('user_collections')
      .select('card_id, quantity, foil, price_usd');

    if (collectionError) throw collectionError;

    // Calculate assigned quantities by card
    const assignedQuantities = new Map<string, { normal: number; foil: number }>();
    
    containers?.forEach(container => {
      container.storage_items?.forEach((item: any) => {
        const key = item.card_id;
        const current = assignedQuantities.get(key) || { normal: 0, foil: 0 };
        if (item.foil) {
          current.foil += item.qty;
        } else {
          current.normal += item.qty;
        }
        assignedQuantities.set(key, current);
      });
    });

    // Calculate unassigned totals
    let unassignedCount = 0;
    let unassignedValue = 0;
    const unassignedCards = new Set<string>();

    collectionItems?.forEach(item => {
      const assigned = assignedQuantities.get(item.card_id) || { normal: 0, foil: 0 };
      const unassignedNormal = Math.max(0, item.quantity - assigned.normal);
      const unassignedFoil = Math.max(0, item.foil - assigned.foil);
      
      if (unassignedNormal > 0 || unassignedFoil > 0) {
        unassignedCards.add(item.card_id);
        unassignedCount += unassignedNormal + unassignedFoil;
        unassignedValue += (item.price_usd || 0) * (unassignedNormal + unassignedFoil);
      }
    });

    // Transform containers with calculated totals
    const enrichedContainers = containers?.map(container => {
      let itemCount = 0;
      let valueUSD = 0;
      const uniqueCards = new Set<string>();

      container.storage_items?.forEach((item: any) => {
        itemCount += item.qty;
        uniqueCards.add(item.card_id);
        // Note: We'd need to join with cards table for accurate pricing
        // For now, estimating based on collection data
        const collectionItem = collectionItems?.find(c => c.card_id === item.card_id);
        if (collectionItem?.price_usd) {
          valueUSD += collectionItem.price_usd * item.qty;
        }
      });

      return {
        id: container.id,
        user_id: container.user_id,
        name: container.name,
        type: container.type as StorageType,
        color: container.color,
        icon: container.icon,
        is_default: container.is_default,
        deck_id: container.deck_id,
        created_at: container.created_at,
        updated_at: container.updated_at,
        itemCount,
        valueUSD,
        uniqueCards: uniqueCards.size
      };
    }) || [];

    return {
      containers: enrichedContainers,
      unassigned: {
        count: unassignedCount,
        valueUSD: unassignedValue,
        uniqueCards: unassignedCards.size
      }
    };
  }

  static async createContainer(data: {
    name: string;
    type: string;
    color?: string;
    icon?: string;
    deck_id?: string;
  }): Promise<StorageContainer> {
    const { data: container, error } = await supabase
      .from('storage_containers')
      .insert({
        ...data,
        user_id: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single() as { data: any, error: any };

    if (error) throw error;
    return {
      ...container,
      type: container.type as StorageType
    };
  }

  static async updateContainer(id: string, updates: {
    name?: string;
    color?: string;
    icon?: string;
    deck_id?: string;
  }): Promise<StorageContainer> {
    const { data: container, error } = await supabase
      .from('storage_containers')
      .update(updates)
      .eq('id', id)
      .select()
      .single() as { data: any, error: any };

    if (error) throw error;
    return {
      ...container,
      type: container.type as StorageType
    };
  }

  static async deleteContainer(id: string): Promise<void> {
    // Check if container has items
    const { data: items, error: itemsError } = await supabase
      .from('storage_items')
      .select('id')
      .eq('container_id', id)
      .limit(1);

    if (itemsError) throw itemsError;
    if (items && items.length > 0) {
      throw new Error('Cannot delete container with items. Please remove all items first.');
    }

    const { error } = await supabase
      .from('storage_containers')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async createSlot(data: {
    container_id: string;
    name: string;
    position?: number;
  }): Promise<StorageSlot> {
    const { data: slot, error } = await supabase
      .from('storage_slots')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return slot;
  }

  static async getContainerItems(containerId: string): Promise<StorageItemWithCard[]> {
    const { data: items, error } = await supabase
      .from('storage_items')
      .select(`
        *,
        card:cards(id, name, image_uris, prices, set_code, rarity, type_line, cmc, colors),
        slot:storage_slots(name)
      `)
      .eq('container_id', containerId)
      .order('created_at') as { data: any[] | null, error: any };

    if (error) throw error;
    return items?.map(item => ({
      ...item,
      card: item.card ? {
        ...item.card,
        image_uris: item.card.image_uris as any,
        prices: item.card.prices as any
      } : undefined
    })) || [];
  }

  static async assignCard(request: StorageAssignRequest): Promise<StorageItem> {
    // Check available quantity in collection
    const { data: collection, error: collectionError } = await supabase
      .from('user_collections')
      .select('quantity, foil')
      .eq('card_id', request.card_id)
      .single();

    if (collectionError) throw collectionError;
    if (!collection) throw new Error('Card not found in collection');

    // Check already assigned quantity
    const { data: assigned, error: assignedError } = await supabase
      .from('storage_items')
      .select('qty')
      .eq('card_id', request.card_id)
      .eq('foil', request.foil);

    if (assignedError) throw assignedError;

    const totalAssigned = assigned?.reduce((sum, item) => sum + item.qty, 0) || 0;
    const available = request.foil ? collection.foil : collection.quantity;
    
    if (totalAssigned + request.qty > available) {
      throw new Error(`Cannot assign ${request.qty} cards. Only ${available - totalAssigned} available.`);
    }

    // Check if item already exists in this container
    const { data: existing, error: existingError } = await supabase
      .from('storage_items')
      .select('*')
      .eq('container_id', request.container_id)
      .eq('card_id', request.card_id)
      .eq('foil', request.foil)
      .eq('slot_id', request.slot_id || null)
      .single();

    if (existingError && existingError.code !== 'PGRST116') throw existingError;

    if (existing) {
      // Update existing item
      const { data: updated, error } = await supabase
        .from('storage_items')
        .update({ qty: existing.qty + request.qty })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    } else {
      // Create new item
      const { data: newItem, error } = await supabase
        .from('storage_items')
        .insert(request)
        .select()
        .single();

      if (error) throw error;
      return newItem;
    }
  }

  static async unassignCard(request: StorageUnassignRequest): Promise<void> {
    const { data: item, error: fetchError } = await supabase
      .from('storage_items')
      .select('qty')
      .eq('id', request.item_id)
      .single();

    if (fetchError) throw fetchError;
    if (!item) throw new Error('Storage item not found');

    if (request.qty >= item.qty) {
      // Remove item entirely
      const { error } = await supabase
        .from('storage_items')
        .delete()
        .eq('id', request.item_id);

      if (error) throw error;
    } else {
      // Reduce quantity
      const { error } = await supabase
        .from('storage_items')
        .update({ qty: item.qty - request.qty })
        .eq('id', request.item_id);

      if (error) throw error;
    }
  }

  static async getContainerSlots(containerId: string): Promise<StorageSlot[]> {
    const { data: slots, error } = await supabase
      .from('storage_slots')
      .select('*')
      .eq('container_id', containerId)
      .order('position');

    if (error) throw error;
    return slots || [];
  }
}