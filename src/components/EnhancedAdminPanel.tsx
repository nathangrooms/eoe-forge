import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Trash2, Edit, Shield, ShieldCheck, MoreHorizontal, Eye, Star, StarOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ColumnDef } from '@tanstack/react-table';

interface User {
  id: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  email?: string;
}

interface Deck {
  id: string;
  name: string;
  format: string;
  colors: string[];
  power_level: number;
  is_public: boolean;
  created_at: string;
  user_id: string;
  profiles?: { username: string };
}

interface MTGCard {
  id: string;
  name: string;
  set_code: string;
  type_line: string;
  cmc: number;
  colors: string[];
  rarity: string;
  tags: string[];
  is_legendary: boolean;
  legalities: Record<string, string>;
  updated_at: string;
}

function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as User[];
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string, isAdmin: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: isAdmin })
        .eq('id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: "User role updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update user role",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const userColumns: ColumnDef<User>[] = [
    {
      accessorKey: 'username',
      header: 'Username',
      cell: ({ row }) => row.getValue('username') || 'No username',
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString(),
    },
    {
      accessorKey: 'is_admin',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.getValue('is_admin') ? 'default' : 'secondary'}>
          {row.getValue('is_admin') ? 'Admin' : 'User'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              {row.original.is_admin ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {row.original.is_admin ? 'Remove Admin Role' : 'Grant Admin Role'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {row.original.is_admin 
                  ? 'This will remove admin privileges from this user.'
                  : 'This will grant admin privileges to this user.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => toggleAdminMutation.mutate({
                  userId: row.original.id,
                  isAdmin: !row.original.is_admin
                })}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];

  if (isLoading) return <div>Loading users...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">User Management</h3>
        <Badge variant="outline">{users?.length || 0} users</Badge>
      </div>
      <DataTable columns={userColumns} data={users || []} />
    </div>
  );
}

function DeckManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

    const { data: decks, isLoading } = useQuery({
    queryKey: ['admin-decks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_decks')
        .select(`
          id,
          name,
          format,
          colors,
          power_level,
          is_public,
          created_at,
          user_id
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(deck => ({
        ...deck,
        profiles: { username: 'User' } // Simplified for now
      })) as Deck[];
    },
  });

  const togglePublicMutation = useMutation({
    mutationFn: async ({ deckId, isPublic }: { deckId: string, isPublic: boolean }) => {
      const { error } = await supabase
        .from('user_decks')
        .update({ is_public: isPublic })
        .eq('id', deckId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-decks'] });
      toast({ title: "Deck visibility updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update deck",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: async (deckId: string) => {
      const { error } = await supabase
        .from('user_decks')
        .delete()
        .eq('id', deckId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-decks'] });
      toast({ title: "Deck deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete deck",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deckColumns: ColumnDef<Deck>[] = [
    {
      accessorKey: 'name',
      header: 'Deck Name',
    },
    {
      accessorKey: 'format',
      header: 'Format',
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue('format')}</Badge>
      ),
    },
    {
      accessorKey: 'power_level',
      header: 'Power',
      cell: ({ row }) => (
        <Badge>{row.getValue('power_level')}/10</Badge>
      ),
    },
    {
      accessorKey: 'profiles',
      header: 'Owner',
      cell: ({ row }) => {
        const profile = row.getValue('profiles') as { username: string } | null;
        return profile?.username || 'Unknown';
      },
    },
    {
      accessorKey: 'is_public',
      header: 'Visibility',
      cell: ({ row }) => (
        <Badge variant={row.getValue('is_public') ? 'default' : 'secondary'}>
          {row.getValue('is_public') ? 'Public' : 'Private'}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString(),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => togglePublicMutation.mutate({
              deckId: row.original.id,
              isPublic: !row.original.is_public
            })}
          >
            {row.original.is_public ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Deck</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{row.original.name}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteDeckMutation.mutate(row.original.id)}
                  className="bg-destructive text-destructive-foreground"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  if (isLoading) return <div>Loading decks...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Deck Management</h3>
        <Badge variant="outline">{decks?.length || 0} decks</Badge>
      </div>
      <DataTable columns={deckColumns} data={decks || []} />
    </div>
  );
}

function CardManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCard, setSelectedCard] = React.useState<MTGCard | null>(null);
  const [editTags, setEditTags] = React.useState<string>('');

  const { data: cards, isLoading } = useQuery({
    queryKey: ['admin-cards', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('cards')
        .select('*')
        .order('name');

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      query = query.limit(50); // Limit for performance

      const { data, error } = await query;
      if (error) throw error;
      return data as MTGCard[];
    },
  });

  const updateCardTagsMutation = useMutation({
    mutationFn: async ({ oracleId, tags }: { oracleId: string, tags: string[] }) => {
      const { error } = await supabase
        .from('tag_overrides')
        .upsert({
          oracle_id: oracleId,
          tags,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cards'] });
      toast({ title: "Card tags updated successfully" });
      setSelectedCard(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update card tags",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cardColumns: ColumnDef<MTGCard>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'set_code',
      header: 'Set',
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue('set_code')}</Badge>
      ),
    },
    {
      accessorKey: 'type_line',
      header: 'Type',
    },
    {
      accessorKey: 'cmc',
      header: 'CMC',
    },
    {
      accessorKey: 'rarity',
      header: 'Rarity',
      cell: ({ row }) => {
        const rarity = row.getValue('rarity') as string;
        const variant = rarity === 'mythic' ? 'default' : 
                      rarity === 'rare' ? 'secondary' : 'outline';
        return <Badge variant={variant}>{rarity}</Badge>;
      },
    },
    {
      accessorKey: 'tags',
      header: 'Tags',
      cell: ({ row }) => {
        const tags = row.getValue('tags') as string[];
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCard(row.original);
                setEditTags(row.original.tags.join(', '));
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Card Tags</DialogTitle>
              <DialogDescription>
                Update tags for {selectedCard?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Textarea
                  id="tags"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="ramp, removal, draw, etc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  if (selectedCard) {
                    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
                    updateCardTagsMutation.mutate({
                      oracleId: selectedCard.id, // Using card id as oracle_id for now
                      tags
                    });
                  }
                }}
              >
                Update Tags
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  ];

  if (isLoading) return <div>Loading cards...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Card Management</h3>
        <Badge variant="outline">{cards?.length || 0} cards shown</Badge>
      </div>
      
      <div className="flex space-x-2">
        <Input
          placeholder="Search cards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <DataTable columns={cardColumns} data={cards || []} />
    </div>
  );
}

export function EnhancedAdminPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Enhanced Admin Panel</h1>
        <p className="text-muted-foreground">
          Comprehensive platform management tools
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="decks">Decks</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Use the existing AdminPanel component for overview */}
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Overview dashboard will be integrated from the existing AdminPanel component
            </p>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <UserManagement />
        </TabsContent>

        <TabsContent value="decks">
          <DeckManagement />
        </TabsContent>

        <TabsContent value="cards">
          <CardManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}