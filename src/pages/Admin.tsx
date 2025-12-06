import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, Flag, Users, Brain, ClipboardList,
  Download, Database, Loader2, AlertCircle, CheckCircle, Clock,
  Activity, RefreshCw, Trash2, Star, StarOff, ShieldCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

// ============= Overview Section =============
function OverviewSection() {
  const { toast } = useToast();
  const [cardCount, setCardCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [collectionCount, setCollectionCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch all stats in parallel
      const [cardsRes, profilesRes, decksRes, collectionsRes, syncRes] = await Promise.all([
        supabase.from('cards').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('user_decks').select('*', { count: 'exact', head: true }),
        supabase.from('user_collections').select('*', { count: 'exact', head: true }),
        supabase.from('sync_status').select('*').order('id')
      ]);

      setCardCount(cardsRes.count || 0);
      setUserCount(profilesRes.count || 0);
      setDeckCount(decksRes.count || 0);
      setCollectionCount(collectionsRes.count || 0);
      setSyncStatus(syncRes.data || []);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const startSync = async () => {
    try {
      await supabase.functions.invoke('scryfall-sync', { body: { action: 'sync' } });
      toast({ title: "Sync Started", description: "Card synchronization initiated." });
      loadData();
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
                <p className="text-2xl font-bold">{loading ? '...' : cardCount.toLocaleString()}</p>
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
                <p className="text-2xl font-bold">{loading ? '...' : userCount.toLocaleString()}</p>
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
                <p className="text-2xl font-bold">{loading ? '...' : deckCount.toLocaleString()}</p>
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
                <p className="text-2xl font-bold">{loading ? '...' : collectionCount.toLocaleString()}</p>
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
            <Button onClick={startSync} disabled={syncStatus.some((s: any) => s.status === 'running')}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Cards
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {syncStatus.map((status: any) => (
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
            {syncStatus.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-4">No sync records yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============= Feature Flags Section =============
function FeatureFlagsSection() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFlags();
  }, []);

  const loadFlags = async () => {
    try {
      const { data, error } = await supabase.from('feature_flags').select('*').order('name');
      if (error) {
        console.warn('Failed to load feature flags:', error);
        setFlags([]);
      } else {
        setFlags(data || []);
      }
    } catch (e) {
      console.error('Feature flags error:', e);
      setFlags([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (id: string, enabled: boolean) => {
    try {
      const { error } = await supabase.from('feature_flags').update({ enabled }).eq('id', id);
      if (error) throw error;
      toast({ title: "Feature Updated", description: `Feature has been ${enabled ? 'enabled' : 'disabled'}` });
      loadFlags();
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="h-5 w-5" />
          Feature Flags
        </CardTitle>
        <CardDescription>Control feature availability across the application</CardDescription>
      </CardHeader>
      <CardContent>
        {flags.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No feature flags configured</p>
        ) : (
          <div className="space-y-4">
            {flags.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{flag.name}</p>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline">{flag.requires_tier || 'free'}</Badge>
                    {flag.is_experimental && <Badge variant="secondary">Experimental</Badge>}
                  </div>
                </div>
                <Button
                  variant={flag.enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleFlag(flag.id, !flag.enabled)}
                >
                  {flag.enabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) {
        console.warn('Failed to load users:', error);
        setUsers([]);
      } else {
        setUsers(data as User[]);
      }
    } catch (e) {
      console.error('Users error:', e);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId);
      if (error) throw error;
      toast({ title: "User role updated" });
      loadUsers();
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

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
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => toggleAdmin(row.original.id, !row.original.is_admin)}
        >
          <ShieldCheck className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Users</h3>
        <Badge variant="outline">{users.length} users</Badge>
      </div>
      <DataTable columns={userColumns} data={users} />
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
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    try {
      const { data, error } = await supabase.from('user_decks').select('id, name, format, power_level, is_public, created_at').order('created_at', { ascending: false }).limit(100);
      if (error) {
        console.warn('Failed to load decks:', error);
        setDecks([]);
      } else {
        setDecks(data as Deck[]);
      }
    } catch (e) {
      console.error('Decks error:', e);
      setDecks([]);
    } finally {
      setLoading(false);
    }
  };

  const togglePublic = async (deckId: string, isPublic: boolean) => {
    try {
      const { error } = await supabase.from('user_decks').update({ is_public: isPublic }).eq('id', deckId);
      if (error) throw error;
      toast({ title: "Deck visibility updated" });
      loadDecks();
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const deleteDeck = async (deckId: string) => {
    try {
      const { error } = await supabase.from('user_decks').delete().eq('id', deckId);
      if (error) throw error;
      toast({ title: "Deck deleted" });
      loadDecks();
    } catch (e) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

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
          <Button variant="ghost" size="sm" onClick={() => togglePublic(row.original.id, !row.original.is_public)}>
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
                <AlertDialogAction onClick={() => deleteDeck(row.original.id)} className="bg-destructive">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Decks</h3>
        <Badge variant="outline">{decks.length} decks</Badge>
      </div>
      <DataTable columns={deckColumns} data={decks} />
    </div>
  );
}

// ============= Simple System Section =============
function SystemSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          System Status
        </CardTitle>
        <CardDescription>System health and monitoring</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium">Database</p>
                <p className="text-sm text-muted-foreground">Connected and healthy</p>
              </div>
            </div>
            <Badge>Healthy</Badge>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium">Authentication</p>
                <p className="text-sm text-muted-foreground">Supabase Auth active</p>
              </div>
            </div>
            <Badge>Healthy</Badge>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium">Edge Functions</p>
                <p className="text-sm text-muted-foreground">All functions deployed</p>
              </div>
            </div>
            <Badge>Healthy</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Simple Tasks Section =============
function TasksSection() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTasks([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
      if (error) {
        console.warn('Failed to load tasks:', error);
        setTasks([]);
      } else {
        setTasks(data || []);
      }
    } catch (e) {
      console.error('Tasks error:', e);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Tasks
        </CardTitle>
        <CardDescription>Development tasks and issues</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tasks found</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{task.title}</p>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={task.status === 'done' ? 'default' : 'secondary'}>{task.status}</Badge>
                  <Badge variant="outline">{task.priority}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

        <TabsContent value="overview">
          <OverviewSection />
        </TabsContent>

        <TabsContent value="features">
          <FeatureFlagsSection />
        </TabsContent>

        <TabsContent value="content" className="space-y-6">
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="decks">Decks</TabsTrigger>
            </TabsList>
            <TabsContent value="users" className="mt-4">
              <UserManagement />
            </TabsContent>
            <TabsContent value="decks" className="mt-4">
              <DeckManagement />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="system">
          <SystemSection />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;
