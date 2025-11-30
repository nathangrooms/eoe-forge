import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle } from 'lucide-react';
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

interface MessagingDrawerProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  sellerId: string;
  cardName: string;
}

export function MessagingDrawer({ open, onClose, listingId, sellerId, cardName }: MessagingDrawerProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadMessages();
      
      // Subscribe to new messages
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
          () => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open, listingId, user]);

  const loadMessages = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch sender profiles separately
      const messagesWithProfiles = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', msg.sender_id)
            .single();
          
          return {
            ...msg,
            sender_profile: profile || { username: null }
          };
        })
      );

      setMessages(messagesWithProfiles);

      // Mark messages as read if user is the receiver
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
  };

  const sendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    try {
      setSending(true);
      const { error } = await supabase
        .from('messages')
        .insert({
          listing_id: listingId,
          sender_id: user.id,
          receiver_id: sellerId,
          message: newMessage.trim()
        });

      if (error) throw error;

      setNewMessage('');
      showSuccess('Message Sent', 'Your message has been sent to the seller');
    } catch (error) {
      console.error('Error sending message:', error);
      showError('Failed to Send', 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!user) {
    return (
      <Drawer open={open} onOpenChange={onClose}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Sign In Required</DrawerTitle>
            <DrawerDescription>
              Please sign in to message the seller
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-6 text-center">
            <Button onClick={onClose}>Close</Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Message Seller
          </DrawerTitle>
          <DrawerDescription>
            Regarding: {cardName}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col flex-1 min-h-0 px-6 pb-6">
          {/* Messages Area */}
          <ScrollArea className="flex-1 pr-4 mb-4">
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isSender = msg.sender_id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${isSender ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback>
                          {isSender ? 'You' : (msg.sender_profile?.username?.charAt(0).toUpperCase() || 'S')}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`flex flex-col gap-1 max-w-[75%] ${isSender ? 'items-end' : 'items-start'}`}>
                        <div className={`rounded-lg px-4 py-2 ${
                          isSender 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                          </span>
                          {isSender && (
                            <Badge variant="outline" className="text-xs">
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
          </ScrollArea>

          {/* Message Input */}
          <div className="flex gap-2">
            <Textarea
              placeholder="Type your message... (Shift+Enter for new line)"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 min-h-[60px] max-h-[120px]"
              disabled={sending}
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              size="icon"
              className="h-[60px] w-[60px]"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}