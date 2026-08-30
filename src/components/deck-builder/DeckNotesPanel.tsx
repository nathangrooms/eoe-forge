import React, { useState, useEffect } from 'react';
import { FIELD } from '@/components/listing';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { MessageSquare, Send, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DeckNotesPanelProps {
  deckId: string;
}

interface Note {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: {
    username: string;
    avatar_url: string | null;
  };
}

export function DeckNotesPanel({ deckId }: DeckNotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [deckId]);

  /*
   * `as never` on the relation name, and a cast on the way out.
   *
   * `src/integrations/supabase/types.ts` is generated and does not know this
   * table yet, so the client's overloads reject the name outright. It is the
   * pattern `src/lib/lobby/forum.ts` already uses for `forum_topics` and
   * `DeckRecordPanel` for `deck_matches`, both of which are equally real
   * tables. The shape is asserted once, here, rather than trusted everywhere.
   */
  const loadNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deck_notes' as never)
        .select('id, user_id, content, created_at')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false });

      /* Thrown, not swallowed. This used to `console.error` and leave the list
         empty, which on a deck that HAS notes is indistinguishable from a deck
         that has none — the same shape as the empty decklist the Tutor prompt
         used to assert was the whole deck. */
      if (error) throw error;
      setNotes((data ?? []) as unknown as Note[]);
    } catch (error) {
      console.error('Failed to load notes:', error);
      showError('Could not load your notes', 'They are saved; this screen could not read them.');
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) {
      showError('Empty note', 'Please enter some content');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Not authenticated', 'Please sign in to add notes');
        return;
      }

      /* `.select().single()` so the row that comes back is the one the database
         actually stored, with its real id and timestamp. Pushing a locally
         built object into the list would show a note that might not exist. */
      const { data, error } = await supabase
        .from('deck_notes' as never)
        .insert({ deck_id: deckId, user_id: user.id, content: newNote.trim() } as never)
        .select('id, user_id, content, created_at')
        .single();

      if (error) throw error;

      setNotes(current => [data as unknown as Note, ...current]);
      setNewNote('');
      showSuccess('Note added', 'Saved to this deck');
    } catch (error) {
      console.error('Failed to add note:', error);
      showError('Could not save that note', 'Nothing was written. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    /* The row goes first and the list follows, rather than the other way
       round. Dropping it from state and then failing the delete leaves a note
       on the deck that the screen says is gone. */
    try {
      const { error } = await supabase.from('deck_notes' as never).delete().eq('id', noteId);
      if (error) throw error;
      setNotes(current => current.filter(n => n.id !== noteId));
      showSuccess('Note deleted', 'Note removed successfully');
    } catch (error) {
      console.error('Failed to delete note:', error);
      showError('Could not delete that note', 'It is still on the deck.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Notes
          <Badge variant="secondary">{notes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Note Form */}
        <div className="space-y-2">
          <Textarea
            placeholder="A note about this deck"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className={cn(FIELD, 'resize-none')}
          />
          <div className="flex justify-end">
            <Button
              onClick={addNote}
              disabled={submitting || !newNote.trim()}
              size="sm"
            >
              <Send className="mr-2 h-4 w-4" />
              Add note
            </Button>
          </div>
        </div>

        {/* THE LIST FLOWS, AND THERE IS NO EMPTY STATE.

            It was a `ScrollArea` pinned to `h-[400px]`, which reserved four
            hundred pixels whether there were fifty notes or none, and put a
            scrollbar inside a page that already scrolls. With one note that is
            a small window inside a big one; with none it was four hundred
            pixels of a speech-bubble icon saying "No notes yet — anything you
            want to remember about this deck", directly under a box whose own
            placeholder reads "A note about this deck".

            Every deck starts with no notes, so that was the common case, not
            the edge one. Nothing is drawn now until there is something to draw:
            the composer above IS the empty state, and the heading beside it
            already carries the count. */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="">
                <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? null : (
          <div className="space-y-3">
            {notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted/30 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium">
                          {note.author?.username.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {note.author?.username || 'Unknown User'}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteNote(note.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
