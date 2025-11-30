import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { MessageSquare, ThumbsUp, Star, Users, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Comment {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  likes: number;
}

interface DeckSocialFeaturesProps {
  deckId: string;
  deckName: string;
  isPublic: boolean;
}

export function DeckSocialFeatures({ deckId, deckName, isPublic }: DeckSocialFeaturesProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [rating, setRating] = useState(0);
  const [userRating, setUserRating] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPublic) {
      loadSocialData();
    }
  }, [deckId, isPublic]);

  const loadSocialData = async () => {
    try {
      setLoading(true);
      
      // In a real app, these would be stored in database tables
      // For now, we'll use localStorage for demo
      const commentsKey = `deck_comments_${deckId}`;
      const ratingsKey = `deck_ratings_${deckId}`;
      
      const savedComments = localStorage.getItem(commentsKey);
      if (savedComments) {
        setComments(JSON.parse(savedComments));
      }

      const savedRatings = localStorage.getItem(ratingsKey);
      if (savedRatings) {
        const ratings = JSON.parse(savedRatings);
        const sum = ratings.reduce((acc: number, r: number) => acc + r, 0);
        setAvgRating(sum / ratings.length);
        setTotalRatings(ratings.length);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const userRatingKey = `deck_rating_${deckId}_${user.id}`;
        const savedUserRating = localStorage.getItem(userRatingKey);
        if (savedUserRating) {
          setUserRating(parseInt(savedUserRating));
        }
      }
    } catch (error) {
      console.error('Failed to load social data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      showError('Empty comment', 'Please write something');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Not authenticated', 'Please log in to comment');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      const comment: Comment = {
        id: Date.now().toString(),
        user_id: user.id,
        username: profile?.username || 'Anonymous',
        content: newComment,
        created_at: new Date().toISOString(),
        likes: 0,
      };

      const updated = [comment, ...comments];
      setComments(updated);
      
      const commentsKey = `deck_comments_${deckId}`;
      localStorage.setItem(commentsKey, JSON.stringify(updated));

      setNewComment('');
      showSuccess('Comment posted', 'Your comment has been added');
    } catch (error: any) {
      showError('Failed to post comment', error.message);
    }
  };

  const handleRating = async (value: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Not authenticated', 'Please log in to rate');
        return;
      }

      setUserRating(value);
      
      // Save user's rating
      const userRatingKey = `deck_rating_${deckId}_${user.id}`;
      localStorage.setItem(userRatingKey, value.toString());

      // Update aggregate ratings
      const ratingsKey = `deck_ratings_${deckId}`;
      const savedRatings = localStorage.getItem(ratingsKey);
      const ratings = savedRatings ? JSON.parse(savedRatings) : [];
      
      // Remove old rating if exists, add new one
      const filteredRatings = ratings.filter((r: any) => r.userId !== user.id);
      filteredRatings.push({ userId: user.id, rating: value });
      
      localStorage.setItem(ratingsKey, JSON.stringify(filteredRatings));
      
      const sum = filteredRatings.reduce((acc: number, r: any) => acc + r.rating, 0);
      setAvgRating(sum / filteredRatings.length);
      setTotalRatings(filteredRatings.length);

      showSuccess('Rating saved', `You rated this deck ${value}/5 stars`);
    } catch (error: any) {
      showError('Failed to save rating', error.message);
    }
  };

  if (!isPublic) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">This deck is private</p>
            <p className="text-sm">Make your deck public to enable social features</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rating Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Community Rating
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold flex items-center gap-2">
                {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="text-sm text-muted-foreground">
                {totalRatings} {totalRatings === 1 ? 'rating' : 'ratings'}
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleRating(star)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-6 w-6 ${
                      star <= userRating
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comments Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Comments ({comments.length})
          </CardTitle>
          <CardDescription>Share your thoughts about this deck</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Comment */}
          <div className="space-y-2">
            <Textarea
              placeholder="Share your thoughts, suggestions, or questions..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button onClick={handleSubmitComment} disabled={!newComment.trim()}>
                <Send className="mr-2 h-4 w-4" />
                Post Comment
              </Button>
            </div>
          </div>

          {/* Comments List */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading comments...</div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No comments yet. Be the first to share your thoughts!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{comment.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{comment.username}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <ThumbsUp className="h-3 w-3" />
                          {comment.likes > 0 && <span>{comment.likes}</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
