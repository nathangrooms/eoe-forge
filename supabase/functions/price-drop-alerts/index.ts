import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WishlistItem {
  id: string;
  user_id: string;
  card_id: string;
  card_name: string;
  target_price_usd: number;
  alert_enabled: boolean;
  last_notified_at: string | null;
}

/**
 * Price Drop Alert System
 * Checks wishlist items for price drops and sends email notifications
 * 
 * Should be called via cron job (e.g., daily)
 */
Deno.serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all wishlist items with alerts enabled and target prices set
    const { data: wishlistItems, error: wishlistError } = await supabase
      .from('wishlist')
      .select('*')
      .eq('alert_enabled', true)
      .not('target_price_usd', 'is', null);

    if (wishlistError) {
      throw wishlistError;
    }

    // Also get price alerts from dedicated price_alerts table
    const { data: priceAlerts, error: alertsError } = await supabase
      .from('price_alerts')
      .select('*')
      .eq('is_active', true);

    if (alertsError) {
      throw alertsError;
    }

    const allAlerts = [...(wishlistItems || []), ...(priceAlerts || [])];

    if (allAlerts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No alerts enabled', checked: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get unique card IDs from both sources
    const cardIds = [...new Set(allAlerts.map(item => item.card_id))];

    // Fetch current prices for all cards
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id, name, prices')
      .in('id', cardIds);

    if (cardsError) {
      throw cardsError;
    }

    // Build price map
    const priceMap = new Map<string, number>();
    cards?.forEach(card => {
      try {
        const prices = typeof card.prices === 'string' ? JSON.parse(card.prices) : card.prices;
        if (prices?.usd) {
          priceMap.set(card.id, parseFloat(prices.usd));
        }
      } catch (e) {
        console.error(`Failed to parse prices for card ${card.id}:`, e);
      }
    });

    // Check for price drops and send notifications
    const notifications: Array<{
      userId: string;
      cardName: string;
      targetPrice: number;
      currentPrice: number;
      itemId: string;
    }> = [];

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const item of allAlerts) {
      const currentPrice = priceMap.get(item.card_id);
      
      // Skip if no current price available
      if (!currentPrice) continue;

      // Skip if already notified in last 24 hours
      const lastNotified = item.last_notified_at || item.last_triggered_at;
      if (lastNotified) {
        const lastNotifiedDate = new Date(lastNotified);
        if (lastNotifiedDate > oneDayAgo) continue;
      }

      // Check if price meets alert condition
      const targetPrice = item.target_price_usd || item.target_price;
      const alertType = item.alert_type || 'below';
      let shouldAlert = false;

      if (alertType === 'below' && currentPrice <= targetPrice) {
        shouldAlert = true;
      } else if (alertType === 'above' && currentPrice >= targetPrice) {
        shouldAlert = true;
      } else if (!alertType && currentPrice <= targetPrice) {
        // Default to below for wishlist items
        shouldAlert = true;
      }

      if (shouldAlert) {
        notifications.push({
          userId: item.user_id,
          cardName: item.card_name,
          targetPrice,
          currentPrice,
          itemId: item.id
        });

        // Update last_notified_at or last_triggered_at
        if ('last_notified_at' in item) {
          await supabase
            .from('wishlist')
            .update({ last_notified_at: now.toISOString() })
            .eq('id', item.id);
        } else {
          await supabase
            .from('price_alerts')
            .update({ last_triggered_at: now.toISOString() })
            .eq('id', item.id);
          
          // Create system notification
          await supabase
            .from('system_notifications')
            .insert({
              user_id: item.user_id,
              type: 'price_alert',
              title: `Price Alert: ${item.card_name}`,
              message: `${item.card_name} is now $${currentPrice.toFixed(2)}! Your target was $${targetPrice.toFixed(2)}.`,
              action_url: `/cards?search=${encodeURIComponent(item.card_name)}`,
              is_read: false,
            });
        }
      }
    }

    // Group notifications by user
    const userNotifications = new Map<string, typeof notifications>();
    notifications.forEach(notif => {
      if (!userNotifications.has(notif.userId)) {
        userNotifications.set(notif.userId, []);
      }
      userNotifications.get(notif.userId)!.push(notif);
    });

    // Send email notifications (placeholder - would integrate with email service)
    const sentEmails: string[] = [];
    for (const [userId, userNotifs] of userNotifications) {
      // Get user email
      const { data: { user } } = await supabase.auth.admin.getUserById(userId);
      
      if (!user?.email) continue;

      // TODO: Integrate with email service (SendGrid, Resend, etc.)
      console.log(`Would send email to ${user.email}:`, userNotifs);
      
      // For now, just log to activity
      await supabase
        .from('activity_log')
        .insert({
          user_id: userId,
          type: 'price_alert',
          entity: 'wishlist',
          entity_id: userId,
          meta: {
            cards: userNotifs.map(n => ({
              name: n.cardName,
              target: n.targetPrice,
              current: n.currentPrice
            }))
          }
        });

      sentEmails.push(user.email);
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: allAlerts.length,
        alerts: notifications.length,
        emails_sent: sentEmails.length,
        recipients: sentEmails
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Price drop alert error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});
