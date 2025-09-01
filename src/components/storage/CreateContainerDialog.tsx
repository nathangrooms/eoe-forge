import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StorageAPI } from '@/lib/api/storageAPI';
import { DEFAULT_STORAGE_TEMPLATES, getTemplateById } from '@/lib/storageTemplates';
import { useToast } from '@/hooks/use-toast';

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
  useState(() => {
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
  });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {template ? `Create ${template.name}` : 'Create Storage Container'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Container Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter container name"
              required
            />
          </div>

          {!template && (
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="binder">Binder</SelectItem>
                  <SelectItem value="deckbox">Deckbox</SelectItem>
                  <SelectItem value="shelf">Shelf</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-16 h-10"
              />
              <Input
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="#8B5CF6"
                className="flex-1"
              />
            </div>
          </div>

          {template && template.slots && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-1">Template includes:</p>
              <p className="text-sm text-muted-foreground">
                {template.slots.length} slots: {template.slots.slice(0, 3).map(s => s.name).join(', ')}
                {template.slots.length > 3 && '...'}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-4">
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
              className="flex-1"
            >
              {loading ? (
                "Creating..."
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
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