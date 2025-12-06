import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, Flag, Users, Brain, ClipboardList,
  Download, Database, Loader2, AlertCircle, CheckCircle, Clock,
  Shield, Activity, RefreshCw
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Admin Components
import { FeatureFlagsManager } from '@/components/admin/FeatureFlagsManager';
import { SubscriptionManager } from '@/components/admin/SubscriptionManager';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { ImplementationSummary } from '@/components/admin/ImplementationSummary';
import { RLSPolicyAudit } from '@/components/admin/RLSPolicyAudit';
import { SystemHealthDashboard } from '@/components/dashboard/SystemHealthDashboard';
import SyncDashboard from '@/components/SyncDashboard';

// Content Management Components (from EnhancedAdminPanel)
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Star, StarOff, ShieldCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// ============= Overview Section =============
function OverviewSection() {
  const { toast } = useToast();

  const { data: cardStats } = useQuery({
    queryKey: ['admin-card-stats'],
    queryFn: async () => {
      try {
        const { count, error } = await supabase.from('cards').select('*', { count: 'exact', head: true });
        if (error) {
          console.warn('Could not fetch card stats:', error);
          return { totalCards: 0 };
        }
        return { totalCards: count || 0 };
      } catch (e) {
        console.warn('Card stats error:', e);
        return { totalCards: 0 };
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const { data: userStats } = useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: async () => {
      try {
        const [profiles, decks, collections] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('user_decks').select('*', { count: 'exact', head: true }),
          supabase.from('user_collections').select('*', { count: 'exact', head: true })
        ]);
        return { 
          totalUsers: profiles.count || 0,
          totalDecks: decks.count || 0,
          totalCollectionItems: collections.count || 0
        };
      } catch (e) {
        console.warn('User stats error:', e);
        return { totalUsers: 0, totalDecks: 0, totalCollectionItems: 0 };
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const { data: syncStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['admin-sync-status'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('sync_status').select('*').order('id');
        if (error) {
          console.warn('Could not fetch sync status:', error);
          return [];
        }
        return data || [];
      } catch (e) {
        console.warn('Sync status error:', e);
        return [];
      }
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const startSync = async () => {
    try {
      await supabase.functions.invoke('scryfall-sync', { body: { action: 'sync' } });
      toast({ title: "Sync Started", description: "Card synchronization initiated." });
      refetchStatus();
    } catch (error: any) {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'running': return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Use default values instead of showing a loading spinner
  const displayCardStats = cardStats || { totalCards: 0 };
  const displayUserStats = userStats || { totalUsers: 0, totalDecks: 0, totalCollectionItems: 0 };
  const displaySyncStatus = syncStatus || [];

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cards</p>
                <p className="text-2xl font-bold">{displayCardStats.totalCards.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Users</p>
                <p className="text-2xl font-bold">{displayUserStats.totalUsers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Decks</p>
                <p className="text-2xl font-bold">{displayUserStats.totalDecks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Activity className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Collection Items</p>
                <p className="text-2xl font-bold">{displayUserStats.totalCollectionItems.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Data Synchronization
            </CardTitle>
            <Button onClick={startSync} disabled={displaySyncStatus.some((s: any) => s.status === 'running')}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Cards
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {displaySyncStatus.map((status: any) => (
              <div key={status.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(status.status)}
                  <div>
                    <p className="font-medium capitalize">{status.id.replace('_', ' ')}</p>
                    {status.last_sync && (
                      <p className="text-xs text-muted-foreground">
                        Last: {new Date(status.last_sync).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {status.status === 'running' && status.total_records > 0 && (
                    <div className="w-32">
                      <Progress value={(status.records_processed / status.total_records) * 100} />
                    </div>
                  )}
                  <Badge variant={status.status === 'completed' ? 'default' : status.status === 'failed' ? 'destructive' : 'secondary'}>
                    {status.status}
                  </Badge>
                </div>
              </div>
            ))}
            {displaySyncStatus.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No sync records yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= User Management =============
interface User {
  id: string;
  username: string | null;
  is_admin: boolean;
  created_at: string;
}

function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (error) {
          console.warn('Failed to fetch users:', error);
          return [] as User[];
        }
        return data as User[];
      } catch (e) {
        console.warn('User fetch error:', e);
        return [] as User[];
      }
    },
    retry: 1,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: "User role updated" });
    },
  });

  const userColumns: ColumnDef<User>[] = [
    { accessorKey: 'username', header: 'Username', cell: ({ row }) => row.getValue('username') || 'No username' },
    { accessorKey: 'created_at', header: 'Joined', cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString() },
    {
      accessorKey: 'is_admin',
      header: 'Role',
      cell: ({ row }) => <Badge variant={row.getValue('is_admin') ? 'default' : 'secondary'}>{row.getValue('is_admin') ? 'Admin' : 'User'}</Badge>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm"><ShieldCheck className="h-4 w-4" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{row.original.is_admin ? 'Remove Admin' : 'Make Admin'}</AlertDialogTitle>
              <AlertDialogDescription>
                {row.original.is_admin ? 'Remove admin privileges from this user?' : 'Grant admin privileges to this user?'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => toggleAdminMutation.mutate({ userId: row.original.id, isAdmin: !row.original.is_admin })}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ];

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Users</h3>
        <Badge variant="outline">{users?.length || 0} users</Badge>
      </div>
      <DataTable columns={userColumns} data={users || []} />
    </div>
  );
}

// ============= Deck Management =============
interface Deck {
  id: string;
  name: string;
  format: string;
  power_level: number;
  is_public: boolean;
  created_at: string;
}

function DeckManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: decks, isLoading } = useQuery({
    queryKey: ['admin-decks'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('user_decks').select('id, name, format, power_level, is_public, created_at').order('created_at', { ascending: false }).limit(100);
        if (error) {
          console.warn('Failed to fetch decks:', error);
          return [] as Deck[];
        }
        return data as Deck[];
      } catch (e) {
        console.warn('Deck fetch error:', e);
        return [] as Deck[];
      }
    },
    retry: 1,
  });

  const togglePublicMutation = useMutation({
    mutationFn: async ({ deckId, isPublic }: { deckId: string; isPublic: boolean }) => {
      const { error } = await supabase.from('user_decks').update({ is_public: isPublic }).eq('id', deckId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-decks'] });
      toast({ title: "Deck visibility updated" });
    },
  });

  const deleteDeckMutation = useMutation({
    mutationFn: async (deckId: string) => {
      const { error } = await supabase.from('user_decks').delete().eq('id', deckId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-decks'] });
      toast({ title: "Deck deleted" });
    },
  });

  const deckColumns: ColumnDef<Deck>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'format', header: 'Format', cell: ({ row }) => <Badge variant="outline">{row.getValue('format')}</Badge> },
    { accessorKey: 'power_level', header: 'Power', cell: ({ row }) => <Badge>{row.getValue('power_level')}/10</Badge> },
    { accessorKey: 'is_public', header: 'Public', cell: ({ row }) => <Badge variant={row.getValue('is_public') ? 'default' : 'secondary'}>{row.getValue('is_public') ? 'Yes' : 'No'}</Badge> },
    { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => new Date(row.getValue('created_at')).toLocaleDateString() },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => togglePublicMutation.mutate({ deckId: row.original.id, isPublic: !row.original.is_public })}>
            {row.original.is_public ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Deck</AlertDialogTitle>
                <AlertDialogDescription>Delete "{row.original.name}"? This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteDeckMutation.mutate(row.original.id)} className="bg-destructive">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Decks</h3>
        <Badge variant="outline">{decks?.length || 0} decks</Badge>
      </div>
      <DataTable columns={deckColumns} data={decks || []} />
    </div>
  );
}

// ============= Main Admin Page =============
const Admin = () => {
  return (
    <div className="w-full py-6 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage platform settings, features, and content</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4 hidden sm:block" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Flag className="h-4 w-4 hidden sm:block" />
            Features
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <Users className="h-4 w-4 hidden sm:block" />
            Content
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Brain className="h-4 w-4 hidden sm:block" />
            System
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ClipboardList className="h-4 w-4 hidden sm:block" />
            Tasks
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <OverviewSection />
        </TabsContent>

        {/* Features & Subscriptions Tab */}
        <TabsContent value="features" className="space-y-6">
          <Tabs defaultValue="flags">
            <TabsList>
              <TabsTrigger value="flags">Feature Flags</TabsTrigger>
              <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            </TabsList>
            <TabsContent value="flags" className="mt-4">
              <FeatureFlagsManager />
            </TabsContent>
            <TabsContent value="subscriptions" className="mt-4">
              <SubscriptionManager />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Content Management Tab */}
        <TabsContent value="content" className="space-y-6">
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="decks">Decks</TabsTrigger>
              <TabsTrigger value="sync">Card Sync</TabsTrigger>
            </TabsList>
            <TabsContent value="users" className="mt-4">
              <UserManagement />
            </TabsContent>
            <TabsContent value="decks" className="mt-4">
              <DeckManagement />
            </TabsContent>
            <TabsContent value="sync" className="mt-4">
              <SyncDashboard />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          <Tabs defaultValue="ai">
            <TabsList>
              <TabsTrigger value="ai">AI Control</TabsTrigger>
              <TabsTrigger value="health">System Health</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="mt-4">
              <AISystemAdmin />
            </TabsContent>
            <TabsContent value="health" className="mt-4">
              <SystemHealthDashboard />
            </TabsContent>
            <TabsContent value="security" className="mt-4">
              <RLSPolicyAudit />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-6">
          <ImplementationSummary />
          <TaskManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;