import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Package,
  Plus,
  Minus,
  Edit,
  Trash2,
  Search,
  Filter,
  Grid3X3,
  List,
  Star,
  TrendingUp,
  Eye,
  Download,
  Heart
} from 'lucide-react';
import { useCollectionStore } from '@/features/collection/store';
import { formatPrice } from '@/features/collection/value';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

interface CollectionInventoryProps {
  viewMode: 'grid' | 'table' | 'binder';
  onViewModeChange: (mode: 'grid' | 'table' | 'binder') => void;
}

export function CollectionInventory({ viewMode, onViewModeChange }: CollectionInventoryProps) {
  const {
    snapshot,
    loading,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    selectedCards,
    toggleCardSelection,
    clearSelection,
    updateCard,
    removeCard,
    getFilteredCards
  } = useCollectionStore();

  const [sortBy, setSortBy] = useState<'name' | 'value' | 'quantity' | 'set' | 'cmc'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<{ regular: number; foil: number }>({ regular: 0, foil: 0 });

  const filteredCards = getFilteredCards();

  // Sort cards
  const sortedCards = [...filteredCards].sort((a, b) => {
    let valueA: any, valueB: any;
    
    switch (sortBy) {
      case 'name':
        valueA = a.card_name.toLowerCase();
        valueB = b.card_name.toLowerCase();
        break;
      case 'value':
        valueA = (a.quantity + a.foil) * (parseFloat(a.card?.prices?.usd || '0'));
        valueB = (b.quantity + b.foil) * (parseFloat(b.card?.prices?.usd || '0'));
        break;
      case 'quantity':
        valueA = a.quantity + a.foil;
        valueB = b.quantity + b.foil;
        break;
      case 'set':
        valueA = a.set_code;
        valueB = b.set_code;
        break;
      case 'cmc':
        valueA = a.card?.cmc || 0;
        valueB = b.card?.cmc || 0;
        break;
      default:
        valueA = a.card_name.toLowerCase();
        valueB = b.card_name.toLowerCase();
    }

    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleQuantityUpdate = async (cardId: string, quantity: number, foil: number) => {
    try {
      const success = await updateCard(cardId, quantity, foil);
      if (success) {
        showSuccess('Card Updated', 'Quantity updated successfully');
        setEditingCard(null);
      }
    } catch (error) {
      showError('Update Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    try {
      const success = await removeCard(cardId, 1);
      if (success) {
        showSuccess('Card Removed', 'Card removed from collection');
      }
    } catch (error) {
      showError('Remove Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const startEditing = (cardId: string, currentQuantity: number, currentFoil: number) => {
    setEditingCard(cardId);
    setEditQuantity({ regular: currentQuantity, foil: currentFoil });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters({ [key]: value === 'all' ? undefined : value });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="w-16 h-20 bg-muted rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!snapshot || snapshot.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">Your collection is empty</h3>
          <p className="text-muted-foreground">
            Start building your collection by adding cards from the search tab
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Collection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Package className="h-5 w-5 mr-2" />
              Collection Inventory ({snapshot.totals.unique} unique, {snapshot.totals.count} total)
            </div>
            <div className="flex items-center space-x-2">
              {/* View Mode Toggle */}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onViewModeChange('grid')}
                  className="rounded-r-none"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onViewModeChange('table')}
                  className="rounded-none"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'binder' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onViewModeChange('binder')}
                  className="rounded-l-none"
                >
                  <Package className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search your collection..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={filters.sets?.[0] || 'all'} onValueChange={(value) => handleFilterChange('sets', value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sets</SelectItem>
                    <SelectItem value="LEA">LEA</SelectItem>
                    <SelectItem value="FUT">FUT</SelectItem>
                    <SelectItem value="ALL">ALL</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.colors?.[0] || 'all'} onValueChange={(value) => handleFilterChange('colors', value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Colors</SelectItem>
                    <SelectItem value="W">White</SelectItem>
                    <SelectItem value="U">Blue</SelectItem>
                    <SelectItem value="B">Black</SelectItem>
                    <SelectItem value="R">Red</SelectItem>
                    <SelectItem value="G">Green</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="value">Value</SelectItem>
                    <SelectItem value="quantity">Quantity</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                    <SelectItem value="cmc">CMC</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </Button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedCards.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">
                  {selectedCards.length} cards selected
                </span>
                <div className="flex space-x-2">
                  <Button size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export Selected
                  </Button>
                  <Button size="sm" variant="outline">
                    <Heart className="h-4 w-4 mr-2" />
                    Add to Wishlist
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={clearSelection}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Collection Display */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
          {sortedCards.map((item) => (
            <Card 
              key={item.card_id} 
              className={`group hover:shadow-lg transition-all duration-200 cursor-pointer ${
                selectedCards.includes(item.card_id) ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => toggleCardSelection(item.card_id)}
            >
              <div className="aspect-[5/7] bg-muted relative overflow-hidden">
                {item.card?.image_uris?.normal ? (
                  <img 
                    src={item.card.image_uris.normal}
                    alt={item.card.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-center p-2 text-muted-foreground">
                    {item.card_name}
                  </div>
                )}

                {/* Quantity badge */}
                <Badge className="absolute top-2 right-2">
                  {item.quantity + item.foil}x
                  {item.foil > 0 && <Star className="h-3 w-3 ml-1" />}
                </Badge>

                {/* Value badge */}
                {item.card?.prices?.usd && (
                  <Badge variant="secondary" className="absolute bottom-2 right-2">
                    ${formatPrice((item.quantity + item.foil) * parseFloat(item.card.prices.usd))}
                  </Badge>
                )}

                {/* Edit overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center space-x-1">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditing(item.card_id, item.quantity, item.foil);
                    }}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCard(item.card_id);
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              
              <CardContent className="p-2">
                <div className="text-xs font-medium truncate">{item.card_name}</div>
                <div className="text-xs text-muted-foreground">{item.set_code.toUpperCase()}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="p-4 font-medium">Card</th>
                    <th className="p-4 font-medium">Set</th>
                    <th className="p-4 font-medium">Qty</th>
                    <th className="p-4 font-medium">Foil</th>
                    <th className="p-4 font-medium">Price</th>
                    <th className="p-4 font-medium">Value</th>
                    <th className="p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCards.map((item) => (
                    <tr 
                      key={item.card_id} 
                      className={`border-b hover:bg-muted/50 ${
                        selectedCards.includes(item.card_id) ? 'bg-muted' : ''
                      }`}
                    >
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-16 bg-muted rounded flex-shrink-0">
                            {item.card?.image_uris?.normal && (
                              <img 
                                src={item.card.image_uris.normal}
                                alt={item.card.name}
                                className="w-full h-full object-cover rounded"
                                loading="lazy"
                              />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{item.card_name}</div>
                            <div className="text-sm text-muted-foreground">{item.card?.type_line}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{item.set_code.toUpperCase()}</Badge>
                      </td>
                      <td className="p-4">
                        {editingCard === item.card_id ? (
                          <Input
                            type="number"
                            value={editQuantity.regular}
                            onChange={(e) => setEditQuantity(prev => ({ ...prev, regular: parseInt(e.target.value) || 0 }))}
                            className="w-16"
                            min="0"
                          />
                        ) : (
                          <span className="font-medium">{item.quantity}</span>
                        )}
                      </td>
                      <td className="p-4">
                        {editingCard === item.card_id ? (
                          <Input
                            type="number"
                            value={editQuantity.foil}
                            onChange={(e) => setEditQuantity(prev => ({ ...prev, foil: parseInt(e.target.value) || 0 }))}
                            className="w-16"
                            min="0"
                          />
                        ) : (
                          <div className="flex items-center">
                            <span className="font-medium">{item.foil}</span>
                            {item.foil > 0 && <Star className="h-3 w-3 ml-1 text-yellow-500" />}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {item.card?.prices?.usd ? `$${formatPrice(parseFloat(item.card.prices.usd))}` : 'N/A'}
                      </td>
                      <td className="p-4 font-medium text-green-600">
                        {item.card?.prices?.usd 
                          ? `$${formatPrice((item.quantity + item.foil) * parseFloat(item.card.prices.usd))}`
                          : 'N/A'
                        }
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {editingCard === item.card_id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleQuantityUpdate(item.card_id, editQuantity.regular, editQuantity.foil)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingCard(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditing(item.card_id, item.quantity, item.foil)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRemoveCard(item.card_id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'binder' && (
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2">
          {sortedCards.map((item) => (
            <div 
              key={item.card_id}
              className={`aspect-[5/7] relative cursor-pointer group ${
                selectedCards.includes(item.card_id) ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => toggleCardSelection(item.card_id)}
            >
              {item.card?.image_uris?.normal ? (
                <img 
                  src={item.card.image_uris.normal}
                  alt={item.card.name}
                  className="w-full h-full object-cover rounded group-hover:scale-105 transition-transform duration-200"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-muted rounded flex items-center justify-center text-xs text-center p-1">
                  {item.card_name}
                </div>
              )}
              
              <Badge className="absolute top-1 right-1 text-xs">
                {item.quantity + item.foil}
                {item.foil > 0 && <Star className="h-2 w-2 ml-0.5" />}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {filteredCards.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Filter className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No cards match your filters</h3>
            <p className="text-muted-foreground">
              Try adjusting your search criteria or clearing filters
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}