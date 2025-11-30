import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

interface MessageNotificationBadgeProps {
  listingId?: string;
  className?: string;
}

export function MessageNotificationBadge({ listingId, className }: MessageNotificationBadgeProps) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    loadUnreadCount();

    // Subscribe to message changes
    const channel = supabase
      .channel('messages-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: listingId ? `listing_id=eq.${listingId}` : undefined
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, listingId]);

  const loadUnreadCount = async () => {
    if (!user) return;

    try {
      const query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false);

      if (listingId) {
        query.eq('listing_id', listingId);
      }

      const { count, error } = await query;

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  if (unreadCount === 0) return null;

  return (
    <Badge variant="destructive" className={className}>
      <MessageCircle className="h-3 w-3 mr-1" />
      {unreadCount}
    </Badge>
  );
}