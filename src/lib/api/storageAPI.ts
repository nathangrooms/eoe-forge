import { supabase } from "@/integrations/supabase/client";
import { canPriceOwnedCopies, ownedValueUSD } from "@/features/collection/value";
import {
  StorageContainer,
  StorageSlot,
  StorageItem,
  StorageOverview,
  StorageAssignRequest,
  StorageMoveRequest,
  StorageUnassignRequest,
  StorageItemWithCard,
  StoragePreviewCard,
  StorageType
} from "@/types/storage";

/**
 * Cards carried back per container for the physical rendering.
 *
 * Nine is a binder page; every other container form draws fewer and slices.
 * The join costs one column of jsonb per stored row on a query that already
 * reads every stored row, and it is the difference between a storage page that
 * shows your cards and one that shows three numbers about them.
 */
const PREVIEW_LIMIT = 9;

/** Unit price of one copy in the finish it is stored in. */
function unitPrice(prices: unknown, foil: boolean): number {
  return foil ? ownedValueUSD(prices, 0, 1) : ownedValueUSD(prices, 1, 0);
}

export class StorageAPI {
  static async getOverview(): Promise<StorageOverview> {
    const { data: containers, error: containersError } = await supabase
      .from('storage_containers')
      .select(`
        *,
        storage_items(qty, card_id, foil, cards(id, name, image_uris, prices))
      `)
      .order('created_at', { ascending: true }) as { data: any[] | null, error: any };

    if (containersError) throw containersError;

    /**
     * Collection rows for the unassigned calculation, priced from the live card
     * record.
     *
     * This selected `price_usd` — the denormalised snapshot on
     * `user_collections` that is null on most rows and stale on the rest, and
     * which `Collection.tsx` says outright "is never read for display". The
     * result was the Storage tab reporting the owner's 159 unassigned cards as
     * $237.01 directly underneath the same page's own header reading $345.90.
     * Same 51 rows, same screen, two answers. It now goes through
     * `ownedValueUSD`, the one accessor.
     */
    const { data: collectionItems, error: collectionError } = await supabase
      .from('user_collections')
      .select('card_id, quantity, foil, cards(prices)');

    if (collectionError) throw collectionError;

    const pricesByCard = new Map<string, unknown>(
      (collectionItems ?? []).map((item: any) => [item.card_id, item.cards?.prices])
    );

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
    let unassignedUnpriced = 0;
    const unassignedCards = new Set<string>();

    collectionItems?.forEach((item: any) => {
      const assigned = assignedQuantities.get(item.card_id) || { normal: 0, foil: 0 };
      const unassignedNormal = Math.max(0, item.quantity - assigned.normal);
      const unassignedFoil = Math.max(0, item.foil - assigned.foil);

      if (unassignedNormal > 0 || unassignedFoil > 0) {
        unassignedCards.add(item.card_id);
        unassignedCount += unassignedNormal + unassignedFoil;
        unassignedValue += ownedValueUSD(item.cards?.prices, unassignedNormal, unassignedFoil);
        // Copies the sum above added as nothing. Counted rather than inferred
        // from a zero, because a zero is also what a worthless card looks like.
        if (!canPriceOwnedCopies(item.cards?.prices, unassignedNormal, unassignedFoil)) {
          unassignedUnpriced += unassignedNormal + unassignedFoil;
        }
      }
    });

    // Transform containers with calculated totals
    const enrichedContainers = containers?.map(container => {
      let itemCount = 0;
      let valueUSD = 0;
      let unpricedCopies = 0;
      const uniqueCards = new Set<string>();
      const candidates: StoragePreviewCard[] = [];

      container.storage_items?.forEach((item: any) => {
        itemCount += item.qty;
        uniqueCards.add(item.card_id);
        // Priced off the card record the collection row points at, foil copies
        // at `usd_foil`. The previous version multiplied the stale
        // `price_usd` snapshot and did a linear `find` per stored item.
        const prices = pricesByCard.get(item.card_id);
        if (prices) {
          valueUSD += item.foil
            ? ownedValueUSD(prices, 0, item.qty)
            : ownedValueUSD(prices, item.qty, 0);
        }

        /*
         * Copies the line above contributed nothing for. Two ways that happens
         * and both count: the catalogue holds no price for the finish stored,
         * or the card is in a container but has fallen out of
         * `user_collections` so `pricesByCard` cannot reach it at all. Either
         * way the shelf tile's figure is short by those copies and has to say
         * so, which is what opening the container already does.
         */
        const priceable = prices
          ? item.foil
            ? canPriceOwnedCopies(prices, 0, item.qty)
            : canPriceOwnedCopies(prices, item.qty, 0)
          : false;
        if (!priceable) unpricedCopies += item.qty;

        // The card itself, for the pockets. `prices` here is the same `cards`
        // row the map above points at; the embedded copy also covers a card
        // that is in a container but has fallen out of `user_collections`,
        // which the map cannot price at all.
        const card = item.cards;
        if (card?.id) {
          candidates.push({
            id: card.id,
            name: card.name ?? 'Unknown card',
            image_uris: (card.image_uris as StoragePreviewCard['image_uris']) ?? undefined,
            qty: item.qty,
            foil: Boolean(item.foil),
            usd: unitPrice(prices ?? card.prices, item.foil),
          });
        }
      });

      /**
       * Most valuable first. A binder page showing the nine cards that came
       * back in insertion order tells you nothing; the nine you would actually
       * put in a binder tells you what this container *is*. Ties fall to the
       * larger stack, then alphabetically, so the order is stable across loads
       * rather than reshuffling on every fetch.
       */
      candidates.sort(
        (a, b) => b.usd - a.usd || b.qty - a.qty || a.name.localeCompare(b.name)
      );

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
        unpricedCopies,
        uniqueCards: uniqueCards.size,
        preview: candidates.slice(0, PREVIEW_LIMIT)
      };
    }) || [];

    return {
      containers: enrichedContainers,
      unassigned: {
        count: unassignedCount,
        valueUSD: unassignedValue,
        unpricedCopies: unassignedUnpriced,
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
        slot:storage_slots(id, name, position)
      `)
      // The slot embed asked for `name` alone, so nothing downstream could tell
      // WHICH page a card was on even if it had wanted to. It carries the id and
      // the position now, which is what the page selector filters on.
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
    // Check available quantity using StorageSync
    const { StorageSync } = await import('@/lib/storageSync');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const available = await StorageSync.getAvailableQuantity(
      user.id,
      request.card_id,
      request.foil
    );

    if (request.qty > available) {
      throw new Error(`Cannot assign ${request.qty} cards. Only ${available} available.`);
    }

    // Check if item already exists in this container
    let query = supabase
      .from('storage_items')
      .select('*')
      .eq('container_id', request.container_id)
      .eq('card_id', request.card_id)
      .eq('foil', request.foil)
      // A pocketed row is one specific card in one specific pocket and never
      // merges; only the loose stacks accumulate.
      .is('pocket', null);

    // Handle slot_id properly - null values need special handling
    if (request.slot_id) {
      query = query.eq('slot_id', request.slot_id);
    } else {
      query = query.is('slot_id', null);
    }

    const { data: existing, error: existingError } = await query.maybeSingle();

    if (existingError) throw existingError;

    if (existing && !request.pocket) {
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
        .insert({
          container_id: request.container_id,
          slot_id: request.slot_id ?? null,
          pocket: request.pocket ?? null,
          card_id: request.card_id,
          qty: request.qty,
          foil: request.foil,
        })
        .select()
        .single();

      if (error) throw error;
      return newItem;
    }
  }

  /**
   * Move copies from one storage row to another place. One action.
   *
   * The alternative that existed before this — unassign then assign — is two
   * unrelated writes with no transaction around them, so a failure between them
   * loses the card outright, and the re-add re-derives the printing instead of
   * carrying it. `storage_move_cards` does the whole thing inside one statement:
   * it carries `card_id` and `foil` across from the source row, merges into a
   * matching stack at the destination when there is one, and splits the stack
   * when only part of it is moving. Three copies here, move one, two stay.
   *
   * Returns the id of the row the cards landed in.
   */
  static async moveCards(request: StorageMoveRequest): Promise<string> {
    const { data, error } = await supabase.rpc('storage_move_cards', {
      p_item_id: request.item_id,
      p_qty: request.qty,
      p_to_container: request.to_container_id,
      p_to_slot: request.to_slot_id ?? null,
      p_to_pocket: request.to_pocket ?? null,
    });

    if (error) throw new Error(error.message);
    return data as string;
  }

  /**
   * Add a page, divider or shelf. The database numbers it from what is already
   * there, so two tabs cannot both create the same position.
   */
  static async addSlot(containerId: string, name: string): Promise<StorageSlot> {
    const { data, error } = await supabase.rpc('storage_add_slot', {
      p_container: containerId,
      p_name: name,
    });

    if (error) throw new Error(error.message);
    return data as unknown as StorageSlot;
  }

  static async renameSlot(slotId: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('storage_slots')
      .update({ name })
      .eq('id', slotId);

    if (error) throw error;
  }

  /**
   * Remove a page or divider. The cards behind it stay in the container and
   * become unfiled, which is what pulling a divider out of a real box does.
   */
  static async deleteSlot(slotId: string): Promise<void> {
    const { error: clearError } = await supabase
      .from('storage_items')
      .update({ slot_id: null, pocket: null })
      .eq('slot_id', slotId);

    if (clearError) throw clearError;

    const { error } = await supabase.from('storage_slots').delete().eq('id', slotId);
    if (error) throw error;
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

  /** Containers the signed-in user owns, newest last, for a destination picker. */
  static async listContainers(): Promise<StorageContainer[]> {
    const { data, error } = await supabase
      .from('storage_containers')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(row => ({ ...row, type: row.type as StorageType })) as StorageContainer[];
  }
}

/* -------------------------------------------------------------------------- *
 * Filing cards from somewhere else in the product
 * -------------------------------------------------------------------------- */

/** One card to file, at the printing and finish it actually is. */
export interface CardToFile {
  /** A real `cards.id`. The printing matters: storage records what you own. */
  card_id: string;
  qty: number;
  foil?: boolean;
}

export interface FiledCardsResult {
  /** Copies that reached the container. */
  filed: number;
  /** Cards that did not, with the reason as it should be shown to a person. */
  failed: { card_id: string; reason: string }[];
}

/**
 * File a batch of cards into a container. The one entry point for anywhere in
 * the product that ends with "and now it is in a box".
 *
 * Written for the shopping list's "arrived" step, and it is the call to use
 * rather than reaching for `StorageAPI.assignCard` in a loop:
 *
 *   const result = await fileCardsIntoContainer(containerId, [
 *     { card_id: '02e8e540-…', qty: 2 },
 *     { card_id: 'befb996b-…', qty: 1, foil: true },
 *   ]);
 *
 * Three things it guarantees that a hand-rolled loop does not:
 *
 * 1. **A card must already be in the collection.** Storage records WHERE a card
 *    you own is, so filing something you do not own would invent inventory. Add
 *    it to `user_collections` first, then call this. A card short of collection
 *    copies comes back in `failed` with the reason, and the rest still file.
 * 2. **One bad card does not lose the batch.** Every entry is attempted and the
 *    failures are reported; nothing is left half done and unreported.
 * 3. **`slotId` is optional and stays optional.** Callers that have no opinion
 *    about a page or a divider pass nothing, and the cards land in the
 *    container unfiled, which is a normal, visible place to be.
 *
 * To move cards that are ALREADY in storage, use `StorageAPI.moveCards`, which
 * is atomic and keeps the printing. Do not remove and re-add.
 */
export async function fileCardsIntoContainer(
  containerId: string,
  cards: CardToFile[],
  slotId?: string | null
): Promise<FiledCardsResult> {
  const result: FiledCardsResult = { filed: 0, failed: [] };

  for (const card of cards) {
    if (!card.card_id || !(card.qty > 0)) continue;
    try {
      await StorageAPI.assignCard({
        container_id: containerId,
        slot_id: slotId ?? null,
        card_id: card.card_id,
        qty: card.qty,
        foil: Boolean(card.foil),
      });
      result.filed += card.qty;
    } catch (error) {
      result.failed.push({
        card_id: card.card_id,
        reason: error instanceof Error ? error.message : 'Could not file this card',
      });
    }
  }

  return result;
}