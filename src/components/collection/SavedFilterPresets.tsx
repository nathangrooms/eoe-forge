import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { showSuccess, showError } from '@/components/ui/toast-helpers';
import { Filter, Plus, Trash2, Star, StarOff } from 'lucide-react';

interface FilterPreset {
  id: string;
  name: string;
  filters: {
    colors?: string[];
    types?: string[];
    rarity?: string[];
    sets?: string[];
    minValue?: number;
    maxValue?: number;
    searchText?: string;
  };
  isFavorite: boolean;
  createdAt: string;
}

interface SavedFilterPresetsProps {
  onApplyPreset: (filters: FilterPreset['filters']) => void;
  currentFilters?: FilterPreset['filters'];
}

export function SavedFilterPresets({ onApplyPreset, currentFilters }: SavedFilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = () => {
    try {
      const saved = localStorage.getItem('collection_filter_presets');
      if (saved) {
        setPresets(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  };

  const savePresets = (newPresets: FilterPreset[]) => {
    try {
      localStorage.setItem('collection_filter_presets', JSON.stringify(newPresets));
      setPresets(newPresets);
    } catch (error) {
      showError('Failed to save presets', 'Storage error');
    }
  };

  const handleSaveCurrentFilters = () => {
    if (!presetName.trim()) {
      showError('Please enter a name', 'Name is required');
      return;
    }

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: currentFilters || {},
      isFavorite: false,
      createdAt: new Date().toISOString(),
    };

    const updated = [...presets, newPreset];
    savePresets(updated);
    showSuccess('Preset saved', `Filter preset "${presetName}" saved successfully`);
    setPresetName('');
    setDialogOpen(false);
  };

  const handleDeletePreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset && confirm(`Delete preset "${preset.name}"?`)) {
      const updated = presets.filter(p => p.id !== id);
      savePresets(updated);
      showSuccess('Preset deleted', 'Filter preset removed');
    }
  };

  const handleToggleFavorite = (id: string) => {
    const updated = presets.map(p =>
      p.id === id ? { ...p, isFavorite: !p.isFavorite } : p
    );
    savePresets(updated);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset.filters);
    showSuccess('Filters applied', `Applied preset "${preset.name}"`);
  };

  const sortedPresets = [...presets].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getFilterSummary = (filters: FilterPreset['filters']) => {
    const parts: string[] = [];
    if (filters.colors && filters.colors.length > 0) {
      parts.push(`${filters.colors.length} colors`);
    }
    if (filters.types && filters.types.length > 0) {
      parts.push(`${filters.types.length} types`);
    }
    if (filters.rarity && filters.rarity.length > 0) {
      parts.push(`${filters.rarity.length} rarities`);
    }
    if (filters.minValue || filters.maxValue) {
      parts.push('price range');
    }
    if (filters.searchText) {
      parts.push('text search');
    }
    return parts.length > 0 ? parts.join(', ') : 'No filters';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              Saved Filter Presets
            </CardTitle>
            <CardDescription>Save and quickly apply your favorite filter combinations</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Save Current
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Filter Preset</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Preset Name</Label>
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="e.g., High Value Rares, Red Creatures"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveCurrentFilters();
                      }
                    }}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <div className="font-medium mb-1">Current filters:</div>
                  <div>{getFilterSummary(currentFilters || {})}</div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveCurrentFilters}>
                  Save Preset
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {sortedPresets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No saved presets yet. Apply some filters and save them as a preset!
          </div>
        ) : (
          <div className="space-y-2">
            {sortedPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{preset.name}</h4>
                    {preset.isFavorite && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {getFilterSummary(preset.filters)}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleFavorite(preset.id)}
                    title={preset.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {preset.isFavorite ? (
                      <StarOff className="h-4 w-4" />
                    ) : (
                      <Star className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleApplyPreset(preset)}
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
