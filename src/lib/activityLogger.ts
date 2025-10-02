import { supabase } from '@/integrations/supabase/client';

export type ActivityType =
  | 'deck_created'
  | 'deck_updated'
  | 'deck_deleted'
  | 'deck_favorited'
  | 'card_added'
  | 'collection_import'
  | 'wishlist_added'
  | 'listing_created'
  | 'sale_completed'
  | 'ai_build_run'
  | 'deck_opened'
  | 'scan_completed';

export interface ActivityMeta {
  name?: string;
  count?: number;
  format?: string;
  power?: number;
  target?: string;
  source?: string;
  description?: string;
  [key: string]: any;
}

/**
 * Logs user activity to the activity_log table
 */
export async function logActivity(
  type: ActivityType,
  entity: string,
  entityId: string,
  meta: ActivityMeta = {}
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('activity_log').insert({
      user_id: user.id,
      type,
      entity,
      entity_id: entityId,
      meta
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

/**
 * Gets recent activity for the current user
 */
export async function getRecentActivity(limit: number = 10) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data?.map(activity => ({
      id: activity.id,
      type: activity.type,
      title: getActivityTitle(activity),
      subtitle: getActivitySubtitle(activity),
      at: activity.created_at,
      icon: getActivityIcon(activity.type)
    })) || [];
  } catch (error) {
    console.error('Error fetching activity:', error);
    return [];
  }
}

function getActivityTitle(activity: any): string {
  switch (activity.type) {
    case 'deck_created':
      return `Created "${activity.meta?.name || 'New Deck'}"`;
    case 'deck_updated':
      return `Updated "${activity.meta?.name || 'Deck'}"`;
    case 'deck_favorited':
      return `Favorited "${activity.meta?.name || 'Deck'}"`;
    case 'deck_opened':
      return `Opened "${activity.meta?.name || 'Deck'}"`;
    case 'card_added':
      return `Added ${activity.meta?.count || 1} card${activity.meta?.count > 1 ? 's' : ''}`;
    case 'collection_import':
      return `Imported ${activity.meta?.count || 0} cards`;
    case 'wishlist_added':
      return `Added to wishlist`;
    case 'listing_created':
      return `Listed card for sale`;
    case 'sale_completed':
      return `Completed sale`;
    case 'ai_build_run':
      return `AI build completed`;
    case 'scan_completed':
      return `Scanned ${activity.meta?.count || 0} cards`;
    default:
      return 'Activity';
  }
}

function getActivitySubtitle(activity: any): string {
  switch (activity.type) {
    case 'deck_created':
    case 'deck_updated':
    case 'deck_opened':
      return `${activity.meta?.format || 'Unknown'} • Power ${activity.meta?.power || 'N/A'}`;
    case 'card_added':
      return `To ${activity.meta?.target || 'collection'}`;
    case 'collection_import':
      return `From ${activity.meta?.source || 'file'}`;
    case 'scan_completed':
      return `${activity.meta?.source || 'Camera'}`;
    default:
      return activity.meta?.description || '';
  }
}

function getActivityIcon(type: string): string {
  const icons: Record<string, string> = {
    deck_created: 'Plus',
    deck_updated: 'Edit',
    deck_deleted: 'Trash',
    deck_favorited: 'Heart',
    deck_opened: 'Eye',
    card_added: 'Plus',
    collection_import: 'Upload',
    wishlist_added: 'Star',
    listing_created: 'DollarSign',
    sale_completed: 'CheckCircle',
    ai_build_run: 'Sparkles',
    scan_completed: 'Camera'
  };
  return icons[type] || 'Activity';
}
