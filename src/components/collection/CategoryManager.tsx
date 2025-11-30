import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FolderOpen, Plus, Tag, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CardCategory {
  category: string;
  count: number;
}

interface CategoryManagerProps {
  onCategorySelect?: (category: string | null) => void;
  selectedCategory?: string | null;
}

export function CategoryManager({ onCategorySelect, selectedCategory }: CategoryManagerProps) {
  const [categories, setCategories] = useState<CardCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [cardToAssign, setCardToAssign] = useState<string | null>(null);
  const [assignCategory, setAssignCategory] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get categories from user_collections
      const { data: collectionData, error: collectionError } = await supabase
        .from('user_collections')
        .select('card_id')
        .eq('user_id', user.id);

      if (collectionError) throw collectionError;

      // Get categories from wishlist
      const { data: wishlistData, error: wishlistError } = await supabase
        .from('wishlist')
        .select('category')
        .eq('user_id', user.id);

      if (wishlistError) throw wishlistError;

      // Count categories
      const categoryCounts = new Map<string, number>();
      wishlistData?.forEach(item => {
        const cat = item.category || 'general';
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      });

      const categoriesArray: CardCategory[] = Array.from(categoryCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      setCategories(categoriesArray);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = () => {
    if (!newCategory.trim()) {
      toast.error('Please enter a category name');
      return;
    }

    // Add to categories list
    const exists = categories.find(c => c.category.toLowerCase() === newCategory.toLowerCase());
    if (exists) {
      toast.error('Category already exists');
      return;
    }

    toast.success(`Category "${newCategory}" created`);
    setNewCategory('');
    setShowAddDialog(false);
    loadCategories();
  };

  const handleAssignCategory = async (cardId: string, category: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Update wishlist category
      const { error } = await supabase
        .from('wishlist')
        .update({ category })
        .eq('card_id', cardId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Category assigned');
      loadCategories();
    } catch (error) {
      console.error('Error assigning category:', error);
      toast.error('Failed to assign category');
    }
  };

  const predefinedCategories = [
    'Deck Building',
    'Investment',
    'Collection',
    'Trade',
    'Upgrade',
    'Commander',
    'Staples',
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Card Categories
            </CardTitle>
            <CardDescription>
              Organize your cards by category
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Category</DialogTitle>
                <DialogDescription>
                  Choose from predefined categories or create a custom one
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Predefined Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {predefinedCategories.map(cat => (
                      <Badge
                        key={cat}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => {
                          setNewCategory(cat);
                          handleCreateCategory();
                        }}
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="category" className="text-sm font-medium">
                    Or create custom category
                  </label>
                  <Input
                    id="category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Enter category name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateCategory}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No categories yet</p>
            <p className="text-sm">Create your first category to organize your cards</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              variant={selectedCategory === null ? 'default' : 'ghost'}
              className="w-full justify-start"
              onClick={() => onCategorySelect?.(null)}
            >
              <Tag className="h-4 w-4 mr-2" />
              All Cards
              <Badge variant="secondary" className="ml-auto">
                {categories.reduce((sum, cat) => sum + cat.count, 0)}
              </Badge>
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.category}
                variant={selectedCategory === cat.category ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => onCategorySelect?.(cat.category)}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                {cat.category}
                <Badge variant="secondary" className="ml-auto">
                  {cat.count}
                </Badge>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
