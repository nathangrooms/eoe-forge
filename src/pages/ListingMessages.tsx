import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_profile?: {
    username: string | null;
  };
}

/**
 * /marketplace/messages/:listingId — the conversation about one listing.
 *
 * This was an 85vh Drawer over the marketplace grid, which put the composer in
 * a fight with the mobile keyboard. A thread is a place you come back to, so it
 * gets a URL and a back control.
 */
export default function ListingMessages() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [cardName, setCardName] = useState('');
  const [sellerId, setSellerId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!user || !listingId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      /*
       * ONE QUERY FOR THE SENDERS, not one per message.
       *
       * This asked `profiles` for the sender of every single message. A thread
       * has exactly two participants, so a sixty message thread was sixty two
       * requests to fetch two rows. Worse than a page load: `loadMessages` is
       * the realtime handler as well as the loader, so every new message re-ran
       * the whole lot, for both people, for as long as the tab stayed open.
       *
       * Collect the sender ids, ask once, read a Map while mapping. Two rows,
       * one request, whatever the thread length.
       */
      const rows = data || [];
      const senderIds = [...new Set(rows.map(m => m.sender_id).filter(Boolean))];
      const senders = new Map<string, { username: string | null }>();

      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', senderIds);

        for (const profile of profiles || []) {
          senders.set(profile.id, { username: profile.username });
        }
      }

      setMessages(
        rows.map(msg => ({
          ...msg,
          sender_profile: senders.get(msg.sender_id) || { username: null },
        }))
      );

      const unreadMessages = (data || []).filter(
        m => m.receiver_id === user.id && !m.is_read
      );

      if (unreadMessages.length > 0) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadMessages.map(m => m.id));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      showError('Failed to Load', 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [user, listingId]);

  // Listing context — the card being discussed and who owns the listing.
  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;

    supabase
      .from('listings')
      .select('user_id, card_id, cards(name)')
      .eq('id', listingId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const listing = data as any;
        setSellerId(listing.user_id);
        setCardName(listing.cards?.name || listing.card_id || '');
      });

    return () => { cancelled = true; };
  }, [listingId]);

  useEffect(() => {
    if (!user || !listingId) return;

    loadMessages();

    const channel = supabase
      .channel(`messages:${listingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `listing_id=eq.${listingId}`
        },
        () => { loadMessages(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, listingId, loadMessages]);

  const sendMessage = async () => {
    if (!user || !listingId || !newMessage.trim()) return;

    // When the signed-in user owns the listing they are replying to a buyer,
    // so the recipient is whoever else is in the thread.
    const counterparty =
      sellerId && sellerId !== user.id
        ? sellerId
        : messages.find(m => m.sender_id !== user.id)?.sender_id ?? sellerId;

    if (!counterparty) {
      showError('No recipient', 'There is nobody to reply to on this listing yet');
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase
        .from('messages')
        .insert({
          listing_id: listingId,
          sender_id: user.id,
          receiver_id: counterparty,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage('');
      showSuccess('Message sent', 'Your message has been delivered');
    } catch (error) {
      console.error('Error sending message:', error);
      showError('Failed to Send', 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const backControl = (
    <Button variant="ghost" onClick={() => navigate('/marketplace')} className="gap-2">
      <ArrowLeft className="h-4 w-4" />
      Marketplace
    </Button>
  );

  if (!user) {
    return (
      <StandardPageLayout title="Messages" action={backControl}>
        <div className="max-w-xl rounded-lg bg-card p-6 shadow-sm">
          <h2 className="mb-2 text-base font-semibold">Sign in to message the seller</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Conversations are tied to your account so replies reach you.
          </p>
          <Button asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    <StandardPageLayout
      title="Messages"
      description={cardName ? `Regarding: ${cardName}` : undefined}
      action={backControl}
    >
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg bg-card p-4 shadow-sm">
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="rounded-lg bg-muted/30 py-10 text-center">
                <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isSender = msg.sender_id === user.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isSender ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>
                        {isSender ? 'You' : (msg.sender_profile?.username?.charAt(0).toUpperCase() || 'S')}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex max-w-[75%] flex-col gap-1 ${isSender ? 'items-end' : 'items-start'}`}>
                      <div className={`rounded-lg px-4 py-2 ${
                        isSender ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.message}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                        </span>
                        {isSender && (
                          <Badge variant="secondary" className="text-xs">
                            {msg.is_read ? 'Read' : 'Sent'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message... (Shift+Enter for new line)"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-h-[120px] min-h-[60px] flex-1"
            disabled={sending}
          />
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            size="icon"
            className="h-[60px] w-[60px]"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </StandardPageLayout>
  );
}
