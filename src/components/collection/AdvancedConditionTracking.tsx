import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, FileText, Star, AlertCircle, Upload, X } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { supabase } from '@/integrations/supabase/client';

interface ConditionDetail {
  condition: string;
  notes: string;
  images: string[];
  gradeAdjustment: number; // Percentage adjustment to value
  lastUpdated: Date;
}

interface AdvancedConditionTrackingProps {
  cardId: string;
  cardName: string;
  basePrice: number;
  currentCondition?: string;
  onConditionUpdate: (condition: string, adjustedPrice: number) => void;
}

const CONDITION_GRADES = {
  mint: { label: 'Mint (M)', adjustment: 1.3, description: 'Perfect condition, looks like it just came from the pack' },
  near_mint: { label: 'Near Mint (NM)', adjustment: 1.0, description: 'Minimal wear, might have very slight whitening on edges' },
  lightly_played: { label: 'Lightly Played (LP)', adjustment: 0.85, description: 'Light scratches or edge wear visible' },
  moderately_played: { label: 'Moderately Played (MP)', adjustment: 0.70, description: 'Noticeable wear, small creases possible' },
  heavily_played: { label: 'Heavily Played (HP)', adjustment: 0.50, description: 'Significant wear, creases, scratches' },
  damaged: { label: 'Damaged (DMG)', adjustment: 0.30, description: 'Major creases, tears, or other damage' },
};

export function AdvancedConditionTracking({
  cardId,
  cardName,
  basePrice,
  currentCondition = 'near_mint',
  onConditionUpdate
}: AdvancedConditionTrackingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [condition, setCondition] = useState(currentCondition);
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const file = files[0];
      
      // Convert to base64 for preview (in production, upload to storage)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImages(prev => [...prev, base64String]);
        showSuccess('Image Added', 'Condition image added successfully');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      showError('Upload Failed', 'Failed to upload condition image');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const gradeInfo = CONDITION_GRADES[condition as keyof typeof CONDITION_GRADES];
      const adjustedPrice = basePrice * gradeInfo.adjustment;

      // In production, save to database
      // For now, just update parent component
      onConditionUpdate(condition, adjustedPrice);

      showSuccess('Condition Updated', `Card condition set to ${gradeInfo.label}`);
      setIsOpen(false);
    } catch (error) {
      console.error('Error saving condition:', error);
      showError('Save Failed', 'Failed to update card condition');
    }
  };

  const selectedGrade = CONDITION_GRADES[condition as keyof typeof CONDITION_GRADES];
  const adjustedPrice = basePrice * selectedGrade.adjustment;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Star className="h-4 w-4 mr-2" />
          Condition Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Card Condition Tracking</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Card Info */}
          <div className="p-4 rounded-lg border bg-muted/50">
            <h4 className="font-medium mb-2">{cardName}</h4>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Base Price:</span>
              <span className="font-semibold">${basePrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Adjusted Price:</span>
              <span className="font-semibold text-primary">${adjustedPrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Price Impact:</span>
              <Badge variant={selectedGrade.adjustment >= 1 ? 'default' : 'secondary'}>
                {selectedGrade.adjustment >= 1 ? '+' : ''}{((selectedGrade.adjustment - 1) * 100).toFixed(0)}%
              </Badge>
            </div>
          </div>

          {/* Condition Selection */}
          <div>
            <Label htmlFor="condition">Condition Grade</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONDITION_GRADES).map(([key, grade]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{grade.label}</span>
                      <span className="text-xs text-muted-foreground">{grade.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Condition Notes */}
          <div>
            <Label htmlFor="notes">Condition Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe specific flaws or features: edge wear, centering, surface scratches, etc."
              rows={4}
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label>Condition Photos</Label>
            <div className="mt-2 space-y-3">
              {/* Upload Button */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={uploading}
                >
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                  </label>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Take photos of edges, surface, and any damage
                </span>
              </div>

              {/* Image Preview Grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Condition ${index + 1}`}
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grading Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Condition Grading Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <div>
                <strong>Edges:</strong> Check for whitening, chipping, or fraying
              </div>
              <div>
                <strong>Corners:</strong> Look for bending, wear, or rounding
              </div>
              <div>
                <strong>Surface:</strong> Check for scratches, scuffs, or print defects
              </div>
              <div>
                <strong>Centering:</strong> Check if image is centered on card
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1">
              <Star className="h-4 w-4 mr-2" />
              Save Condition
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
