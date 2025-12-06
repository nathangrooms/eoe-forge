import { useState, useEffect } from 'react';
import { Plus, Package, Layers, Archive, Box, Folder, Sparkles, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { StorageAPI } from '@/lib/api/storageAPI';
import { DEFAULT_STORAGE_TEMPLATES, getTemplateById } from '@/lib/storageTemplates';
import { useToast } from '@/hooks/use-toast';

const CONTAINER_TYPES = [
  { id: 'box', name: 'Storage Box', icon: Box, color: '#6366F1', description: 'For bulk storage' },
  { id: 'binder', name: 'Binder', icon: Layers, color: '#10B981', description: 'For organized pages' },
  { id: 'deckbox', name: 'Deck Box', icon: Package, color: '#F59E0B', description: 'For single decks' },
  { id: 'shelf', name: 'Shelf/Display', icon: Folder, color: '#EC4899', description: 'For display cases' },
  { id: 'other', name: 'Other', icon: Archive, color: '#8B5CF6', description: 'Custom container' },
];

const COLOR_PRESETS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', 
  '#10B981', '#06B6D4', '#3B82F6', '#6B7280', '#1F2937'
];

interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId?: string;
  onSuccess: () => void;
}

export function CreateContainerDialog({ 
  open, 
  onOpenChange, 
  templateId,
  onSuccess 
}: CreateContainerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'box',
    color: '#8B5CF6',
    icon: 'Package'
  });
  const { toast } = useToast();

  const template = templateId ? getTemplateById(templateId) : null;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (template) {
        setFormData({
          name: template.name,
          type: template.type,
          color: template.color || '#8B5CF6',
          icon: template.icon || 'Package'
        });
      } else {
        setFormData({
          name: '',
          type: 'box',
          color: '#8B5CF6',
          icon: 'Package'
        });
      }
    }
  }, [open, template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      const container = await StorageAPI.createContainer({
        name: formData.name,
        type: formData.type,
        color: formData.color,
        icon: formData.icon
      });

      // If using a template, create slots
      if (template && template.slots && template.slots.length > 0) {
        await Promise.all(
          template.slots.map(slot =>
            StorageAPI.createSlot({
              container_id: container.id,
              name: slot.name,
              position: slot.position
            })
          )
        );
      }

      toast({
        title: "Success",
        description: `${container.name} created successfully`
      });

      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create container",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedType = CONTAINER_TYPES.find(t => t.id === formData.type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div 
              className="p-2.5 rounded-xl shadow-md"
              style={{ backgroundColor: formData.color }}
            >
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {template ? `Create ${template.name}` : 'Create Storage Container'}
              </DialogTitle>
              <DialogDescription>
                Organize your cards by physical location
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Container Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">Container Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Main Binder, EDH Decks Box"
              className="h-11"
              required
            />
          </div>

          {/* Container Type Selection */}
          {!template && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Container Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CONTAINER_TYPES.map((type) => {
                  const isSelected = formData.type === type.id;
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: type.id, color: type.color })}
                      className={cn(
                        "relative p-3 rounded-lg border text-left transition-all duration-200",
                        "hover:border-primary/50 hover:bg-accent/50",
                        isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary" 
                          : "border-border bg-card"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                        style={{ backgroundColor: `${type.color}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: type.color }} />
                      </div>
                      <div className="font-medium text-sm">{type.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{type.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Container Color</Label>
            <div className="flex items-center gap-3">
              {/* Color Presets */}
              <div className="flex gap-1.5 flex-wrap flex-1">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all duration-200 ring-offset-2 ring-offset-background",
                      formData.color === color && "ring-2 ring-primary scale-110"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {/* Custom Color Picker */}
              <div className="relative">
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-10 h-10 p-1 cursor-pointer rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Preview Card */}
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md"
                  style={{ backgroundColor: formData.color }}
                >
                  {selectedType && <selectedType.icon className="h-6 w-6" />}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{formData.name || 'Container Name'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {formData.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Preview</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template Info */}
          {template && template.slots && (
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Template includes pre-configured slots:</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {template.slots.slice(0, 3).map(s => s.name).join(', ')}
                  {template.slots.length > 3 && ` +${template.slots.length - 3} more`}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name.trim() || loading}
              className="flex-1 gap-2 bg-gradient-cosmic hover:opacity-90"
            >
              {loading ? (
                "Creating..."
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Container
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}