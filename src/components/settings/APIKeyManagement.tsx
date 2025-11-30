import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Key, Plus, Trash2, Eye, EyeOff, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface APIKey {
  id: string;
  service_name: string;
  description: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

const SUPPORTED_SERVICES = [
  { value: 'scryfall', label: 'Scryfall API', description: 'Enhanced MTG card data' },
  { value: 'tcgplayer', label: 'TCGPlayer', description: 'Card pricing and marketplace' },
  { value: 'cardkingdom', label: 'Card Kingdom', description: 'Card availability and pricing' },
  { value: 'edhrec', label: 'EDHREC', description: 'Commander deck recommendations' },
  { value: 'moxfield', label: 'Moxfield', description: 'Deck import/export' },
  { value: 'archidekt', label: 'Archidekt', description: 'Deck import/export' },
];

export function APIKeyManagement() {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<APIKey | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  
  // Form state
  const [serviceName, setServiceName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadAPIKeys();
  }, []);

  const loadAPIKeys = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('api_keys')
        .select('id, service_name, description, is_active, last_used_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    if (!serviceName || !apiKey) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('You must be logged in');
        return;
      }

      // Simple encryption (in production, use proper encryption)
      const encrypted = btoa(apiKey);

      const { error } = await supabase
        .from('api_keys')
        .insert({
          user_id: user.id,
          service_name: serviceName,
          api_key_encrypted: encrypted,
          description: description || null,
          is_active: true,
        });

      if (error) throw error;

      toast.success('API key added successfully');
      setShowAddDialog(false);
      resetForm();
      loadAPIKeys();
    } catch (error: any) {
      console.error('Error adding API key:', error);
      if (error.code === '23505') {
        toast.error('An API key for this service already exists');
      } else {
        toast.error('Failed to add API key');
      }
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;

      toast.success('API key deleted');
      loadAPIKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const handleToggleActive = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !currentStatus })
        .eq('id', keyId);

      if (error) throw error;

      toast.success(`API key ${!currentStatus ? 'activated' : 'deactivated'}`);
      loadAPIKeys();
    } catch (error) {
      console.error('Error toggling API key:', error);
      toast.error('Failed to update API key');
    }
  };

  const resetForm = () => {
    setServiceName('');
    setApiKey('');
    setDescription('');
    setEditingKey(null);
  };

  const getServiceLabel = (serviceName: string) => {
    const service = SUPPORTED_SERVICES.find(s => s.value === serviceName);
    return service?.label || serviceName;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Key Management
            </CardTitle>
            <CardDescription>
              Manage your third-party service API keys securely
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="h-4 w-4 mr-2" />
                Add API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add API Key</DialogTitle>
                <DialogDescription>
                  Add a new API key for a third-party service
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="service">Service *</Label>
                  <Select value={serviceName} onValueChange={setServiceName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_SERVICES.map(service => (
                        <SelectItem key={service.value} value={service.value}>
                          <div>
                            <div className="font-medium">{service.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {service.description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key *</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional notes about this key"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddKey}>Add Key</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No API keys configured</p>
            <p className="text-sm">Add your first API key to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <Card key={key.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{getServiceLabel(key.service_name)}</h4>
                        <Badge variant={key.is_active ? 'default' : 'secondary'}>
                          {key.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {key.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {key.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Added {format(new Date(key.created_at), 'MMM d, yyyy')}
                        </span>
                        {key.last_used_at && (
                          <span>
                            Last used {format(new Date(key.last_used_at), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(key.id, key.is_active)}
                      >
                        {key.is_active ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this API key? This action cannot be
                              undone and may affect integrations using this key.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteKey(key.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
