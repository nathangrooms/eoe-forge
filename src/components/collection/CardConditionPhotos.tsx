import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Camera, Upload, Trash2, Image as ImageIcon } from 'lucide-react';

interface CardConditionPhotosProps {
  collectionItemId: string;
  cardName: string;
}

interface Photo {
  id: string;
  photo_url: string;
  notes: string | null;
  created_at: string;
}

export function CardConditionPhotos({ collectionItemId, cardName }: CardConditionPhotosProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [photoNotes, setPhotoNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [collectionItemId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('card_condition_photos')
        .select('*')
        .eq('collection_item_id', collectionItemId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Invalid file', 'Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showError('File too large', 'Please select an image under 5MB');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setDialogOpen(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // In a real implementation, upload to storage bucket
      // For now, we'll use a mock URL
      const mockUrl = `https://placeholder.com/${Date.now()}_${selectedFile.name}`;

      const { error } = await supabase
        .from('card_condition_photos')
        .insert({
          collection_item_id: collectionItemId,
          user_id: user.id,
          photo_url: mockUrl,
          notes: photoNotes.trim() || null,
        });

      if (error) throw error;

      showSuccess('Photo uploaded', 'Card condition photo saved successfully');
      setDialogOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setPhotoNotes('');
      loadPhotos();
    } catch (error: any) {
      showError('Upload failed', error.message);
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;

    try {
      const { error } = await supabase
        .from('card_condition_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      showSuccess('Photo deleted', 'Card condition photo removed');
      loadPhotos();
    } catch (error: any) {
      showError('Delete failed', error.message);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Condition Photos
              <Badge variant="secondary">{photos.length}</Badge>
            </CardTitle>
            <Button size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No condition photos yet</p>
              <p className="text-xs">Upload photos to document card condition</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={photo.photo_url}
                    alt={`${cardName} condition photo`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deletePhoto(photo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {photo.notes && (
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/80 text-white text-xs">
                      {photo.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Condition Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewUrl && (
              <div className="aspect-square rounded-lg overflow-hidden border">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Textarea
                placeholder="Add notes about this photo (e.g., surface scratches, edge wear)..."
                value={photoNotes}
                onChange={(e) => setPhotoNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
