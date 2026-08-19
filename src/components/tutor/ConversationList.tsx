/**
 * Past chats, in a right-hand slide-over.
 *
 * A route would lose the conversation you are in the middle of, and a centred
 * dialog is out. This is the approved shape for an action taken without leaving
 * the page: the thread stays behind it and comes straight back.
 */

import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Crown, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { TutorConversation } from './conversations';

interface ConversationListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: TutorConversation[];
  activeId: string | null;
  loading: boolean;
  onOpenConversation: (conversation: TutorConversation) => void;
  onNewChat: () => void;
  onDelete: (conversation: TutorConversation) => void;
}

function whenLabel(iso: string): string {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}

export function ConversationList({
  open,
  onOpenChange,
  conversations,
  activeId,
  loading,
  onOpenConversation,
  onNewChat,
  onDelete,
}: ConversationListProps) {
  /* Deleting a chat confirms in place. No second dialog on top of a panel. */
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-0 bg-card p-0 shadow-2xl shadow-black/50 sm:max-w-md"
      >
        <div className="px-5 pb-4 pt-6 pr-12">
          <SheetTitle className="text-lg font-semibold">Your chats</SheetTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Every conversation is saved. Pick one up where you left it.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full"
            onClick={() => {
              onNewChat();
              onOpenChange(false);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Start a new chat
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-3 pb-6">
          {loading ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">Loading your chats...</p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              Nothing saved yet. Ask a question and it will appear here.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map(conversation => (
                <li key={conversation.id}>
                  <div
                    className={cn(
                      'group flex items-start gap-2 rounded-lg px-3 py-2.5 transition-colors',
                      conversation.id === activeId ? 'bg-accent' : 'hover:bg-muted/50'
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        onOpenConversation(conversation);
                        onOpenChange(false);
                      }}
                    >
                      <span className="line-clamp-2 text-sm font-medium">{conversation.title}</span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {conversation.deck_name ? (
                          <>
                            <Crown className="h-3 w-3 shrink-0 text-type-commander" />
                            <span className="truncate">{conversation.deck_name}</span>
                          </>
                        ) : conversation.card_name ? (
                          <>
                            <Sparkles className="h-3 w-3 shrink-0" />
                            <span className="truncate">{conversation.card_name}</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-3 w-3 shrink-0" />
                            <span>General questions</span>
                          </>
                        )}
                        <span className="shrink-0">- {whenLabel(conversation.updated_at)}</span>
                      </span>
                    </button>

                    {confirming === conversation.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => {
                            onDelete(conversation);
                            setConfirming(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => setConfirming(conversation.id)}
                        aria-label={`Delete ${conversation.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
