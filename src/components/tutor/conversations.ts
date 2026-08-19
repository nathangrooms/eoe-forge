/**
 * Chats that survive a reload.
 *
 * Tutor used to keep the whole conversation in `useState` and send
 * `messages.slice(-6)` with the question. Two things followed from that. Closing
 * the tab threw the conversation away, and nothing older than the last six turns
 * was ever sent. Owner: "do chats continue?"
 *
 * They are rows now. `tutor_conversations` holds the thread, `tutor_messages`
 * holds the turns, both scoped to `auth.uid()` by row level security, and `anon`
 * holds no grant on either table at all.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { CardData } from '@/components/shared/CardRecommendationDisplay';
import type { VisualData } from '@/components/shared/AIVisualDisplay';

export interface TutorConversation {
  id: string;
  title: string;
  deck_id: string | null;
  deck_name: string | null;
  card_id: string | null;
  card_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cards?: CardData[];
  visualData?: VisualData;
}

/** Newest first, so the list reads as "what was I last talking about". */
export async function listConversations(limit = 40): Promise<TutorConversation[]> {
  const { data, error } = await supabase
    .from('tutor_conversations')
    .select('id, title, deck_id, deck_name, card_id, card_name, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TutorConversation[];
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from('tutor_messages')
    .select('id, role, content, cards, visual_data, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(row => ({
    id: row.id,
    type: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    timestamp: new Date(row.created_at),
    /* `cards` and `visual_data` are jsonb, so the generated type is `Json`. The
       shape is written by this same module and by the edge function, so it is
       asserted here rather than re-validated on every read. */
    cards: (row.cards as unknown as CardData[]) ?? undefined,
    visualData: (row.visual_data as unknown as VisualData) ?? undefined,
  }));
}

/**
 * The title is the first thing the user said, trimmed to something that fits a
 * list. Naming a chat is a chore nobody does, and "New chat" x12 is not a list.
 */
export function titleFrom(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  if (clean.length <= 60) return clean || 'New chat';
  return clean.slice(0, 57).trimEnd() + '...';
}

export async function createConversation(input: {
  title: string;
  deckId?: string | null;
  deckName?: string | null;
  cardId?: string | null;
  cardName?: string | null;
}): Promise<TutorConversation> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('tutor_conversations')
    .insert({
      user_id: userId,
      title: input.title,
      deck_id: input.deckId ?? null,
      deck_name: input.deckName ?? null,
      card_id: input.cardId ?? null,
      card_name: input.cardName ?? null,
    })
    .select('id, title, deck_id, deck_name, card_id, card_name, created_at, updated_at')
    .single();
  if (error) throw error;
  return data as TutorConversation;
}

export async function appendMessage(
  conversationId: string,
  message: { type: 'user' | 'assistant'; content: string; cards?: CardData[]; visualData?: VisualData }
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  const { error } = await supabase.from('tutor_messages').insert({
    conversation_id: conversationId,
    user_id: userId,
    role: message.type,
    content: message.content,
    cards: (message.cards ?? []) as unknown as Json,
    visual_data: (message.visualData ?? null) as unknown as Json,
  });
  if (error) throw error;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.from('tutor_conversations').delete().eq('id', conversationId);
  if (error) throw error;
}
