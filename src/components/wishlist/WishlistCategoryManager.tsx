import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Folder, Tag } from 'lucide-react';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface WishlistCategoryManagerProps {
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}

export function WishlistCategoryManager({ selectedCategory, onCategoryChange }: WishlistCategoryManagerProps) {
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('wishlist')
        .select('category')
        .eq('user_id', user.id);

      if (error) throw error;

      // Count cards per category
      const categoryCounts = (data || []).reduce((acc, item) => {
        const cat = item.category || 'general';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const categoryList = Object.entries(categoryCounts).map(([name, count]) => ({
        name,
        count
      })).sort((a, b) => a.name.localeCompare(b.name));

      setCategories(categoryList);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const defaultCategories = [
    { value: 'general', label: 'General' },
    { value: 'commander', label: 'Commander' },
    { value: 'modern', label: 'Modern' },
    { value: 'standard', label: 'Standard' },
    { value: 'vintage', label: 'Vintage' },
    { value: 'legacy', label: 'Legacy' },
    { value: 'budget', label: 'Budget Upgrades' },
    { value: 'expensive', label: 'Expensive/Reserved List' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          Wishlist Categories
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {defaultCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!loading && categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Your Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Badge
                    key={cat.name}
                    variant={selectedCategory === cat.name ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() => onCategoryChange?.(cat.name)}
                  >
                    {cat.name} ({cat.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export async function updateCardCategory(cardId: string, category: string) {
  try {
    const { error } = await supabase
      .from('wishlist')
      .update({ category })
      .eq('id', cardId);

    if (error) throw error;
    showSuccess('Category Updated', 'Card category has been changed');
  } catch (error) {
    console.error('Error updating category:', error);
    showError('Error', 'Failed to update category');
  }
}
