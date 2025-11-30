import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ListingTemplate {
  id: string;
  name: string;
  condition: string;
  note: string;
  pricing_multiplier: number;
}

export const ListingTemplates = () => {
  const [templates, setTemplates] = useState<ListingTemplate[]>([
    {
      id: '1',
      name: 'Near Mint - Quick Sale',
      condition: 'NM',
      note: 'Card is in near mint condition. Ships within 24 hours!',
      pricing_multiplier: 0.95
    },
    {
      id: '2',
      name: 'Lightly Played - Standard',
      condition: 'LP',
      note: 'Lightly played condition with minor wear. Fast shipping!',
      pricing_multiplier: 0.85
    }
  ]);

  const [newTemplate, setNewTemplate] = useState({
    name: '',
    condition: 'NM',
    note: '',
    pricing_multiplier: 1.0
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCreateTemplate = () => {
    if (!newTemplate.name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    const template: ListingTemplate = {
      id: Date.now().toString(),
      ...newTemplate
    };

    setTemplates([...templates, template]);
    setNewTemplate({
      name: '',
      condition: 'NM',
      note: '',
      pricing_multiplier: 1.0
    });
    setIsDialogOpen(false);
    toast.success('Template created successfully');
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
    toast.success('Template deleted');
  };

  const handleApplyTemplate = (template: ListingTemplate) => {
    toast.success(`Applied template: ${template.name}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Listing Templates
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Listing Template</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Template Name</Label>
                  <Input
                    id="template-name"
                    placeholder="e.g., Near Mint - Quick Sale"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="condition">Default Condition</Label>
                  <Input
                    id="condition"
                    placeholder="NM, LP, MP, HP"
                    value={newTemplate.condition}
                    onChange={(e) => setNewTemplate({ ...newTemplate, condition: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="note">Default Note</Label>
                  <Textarea
                    id="note"
                    placeholder="Add default note for listings..."
                    value={newTemplate.note}
                    onChange={(e) => setNewTemplate({ ...newTemplate, note: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="multiplier">Price Multiplier</Label>
                  <Input
                    id="multiplier"
                    type="number"
                    step="0.05"
                    min="0"
                    max="2"
                    value={newTemplate.pricing_multiplier}
                    onChange={(e) => setNewTemplate({ ...newTemplate, pricing_multiplier: parseFloat(e.target.value) || 1.0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    1.0 = market price, 0.95 = 5% below, 1.1 = 10% above
                  </p>
                </div>

                <Button onClick={handleCreateTemplate} className="w-full">
                  Create Template
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between p-4 bg-muted rounded-lg"
            >
              <div className="flex-1">
                <div className="font-semibold">{template.name}</div>
                <div className="text-sm text-muted-foreground">
                  {template.condition} • {(template.pricing_multiplier * 100).toFixed(0)}% of market price
                </div>
                {template.note && (
                  <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                    {template.note}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApplyTemplate(template)}
                >
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteTemplate(template.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No templates yet. Create one to speed up your listings!
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
