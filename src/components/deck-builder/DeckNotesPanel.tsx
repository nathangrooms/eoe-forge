import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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

  const loadNotes = async () => {
    setLoading(true);
    try {
      // This is a mock - in real implementation, you'd need to create a deck_notes table
      // For now, we'll use local storage as a demo
      const stored = localStorage.getItem(`deck_notes_${deckId}`);
      if (stored) {
        setNotes(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
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

      const note: Note = {
        id: Date.now().toString(),
        user_id: user.id,
        content: newNote.trim(),
        created_at: new Date().toISOString(),
        author: {
          username: user.email?.split('@')[0] || 'User',
          avatar_url: null,
        },
      };

      const updatedNotes = [note, ...notes];
      setNotes(updatedNotes);
      localStorage.setItem(`deck_notes_${deckId}`, JSON.stringify(updatedNotes));
      
      setNewNote('');
      showSuccess('Note added', 'Your note has been saved');
    } catch (error) {
      showError('Failed to add note', 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      const updatedNotes = notes.filter(n => n.id !== noteId);
      setNotes(updatedNotes);
      localStorage.setItem(`deck_notes_${deckId}`, JSON.stringify(updatedNotes));
      showSuccess('Note deleted', 'Note removed successfully');
    } catch (error) {
      showError('Failed to delete', 'Please try again');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Deck Notes & Comments
          <Badge variant="secondary">{notes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Note Form */}
        <div className="space-y-2">
          <Textarea
            placeholder="Add a note about this deck... (strategy tips, card combos, meta considerations, etc.)"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              onClick={addNote}
              disabled={submitting || !newNote.trim()}
              size="sm"
            >
              <Send className="mr-2 h-4 w-4" />
              Add Note
            </Button>
          </div>
        </div>

        {/* Notes List */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                  <div className="h-16 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">No notes yet</p>
              <p className="text-sm">Add your first note about this deck</p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {notes.map((note) => (
                <div key={note.id} className="p-3 rounded-lg border bg-card">
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
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
