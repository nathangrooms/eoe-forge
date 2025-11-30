import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, Copy, ExternalLink, Eye } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface WishlistShareManagerProps {
  wishlistCards: any[];
}

export function WishlistShareManager({ wishlistCards }: WishlistShareManagerProps) {
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareData, setShareData] = useState({
    title: 'My Wishlist',
    description: ''
  });

  const generateShareLink = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError('Authentication Required', 'Please sign in to share your wishlist');
        return;
      }

      // Generate unique slug
      const slug = `wishlist-${user.id.slice(0, 8)}-${Date.now()}`;
      
      // Create share record
      const { data, error } = await supabase
        .from('wishlist_shares')
        .insert({
          user_id: user.id,
          share_slug: slug,
          title: shareData.title,
          description: shareData.description,
          is_public: true
        })
        .select()
        .single();

      if (error) throw error;

      const url = `${window.location.origin}/wishlist/${slug}`;
      setShareUrl(url);
      showSuccess('Share Link Created', 'Your wishlist share link has been generated');
    } catch (error) {
      console.error('Error creating share link:', error);
      showError('Error', 'Failed to create share link');
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showSuccess('Copied!', 'Share link copied to clipboard');
    } catch (error) {
      showError('Error', 'Failed to copy link');
    }
  };

  return (
    <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 className="h-4 w-4 mr-2" />
          Share Wishlist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Your Wishlist</DialogTitle>
          <DialogDescription>
            Create a shareable link to your wishlist ({wishlistCards.length} cards)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={shareData.title}
              onChange={(e) => setShareData({ ...shareData, title: e.target.value })}
              placeholder="My MTG Wishlist"
            />
          </div>

          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={shareData.description}
              onChange={(e) => setShareData({ ...shareData, description: e.target.value })}
              placeholder="Cards I'm looking to acquire..."
              rows={3}
            />
          </div>

          {!shareUrl ? (
            <Button onClick={generateShareLink} className="w-full">
              <Share2 className="h-4 w-4 mr-2" />
              Generate Share Link
            </Button>
          ) : (
            <div className="space-y-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="flex-1 text-sm"
                    />
                    <Button size="sm" onClick={copyToClipboard}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(shareUrl, '_blank')}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShareUrl('');
                    setShareData({ title: 'My Wishlist', description: '' });
                  }}
                >
                  Create New
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>✓ Anyone with this link can view your wishlist</p>
                <p>✓ Real-time updates as you modify your wishlist</p>
                <p>✓ Visitors can see card prices and availability</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
