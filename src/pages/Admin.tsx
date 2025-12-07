import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, Flag, Users, Brain, ClipboardList,
  Download, Database, Loader2, AlertCircle,
  Activity, CreditCard, Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';

// Import proper admin components
import { FeatureFlagsManager } from '@/components/admin/FeatureFlagsManager';
import { SubscriptionManager } from '@/components/admin/SubscriptionManager';
import { UserManagement } from '@/components/admin/UserManagement';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { HomepageModeToggle } from '@/components/admin/HomepageModeToggle';
import SyncDashboard from '@/components/SyncDashboard';

// ============= Overview Section =============
function OverviewSection() {
  const [cardCount, setCardCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [deckCount, setDeckCount] = useState(0);
  const [collectionCount, setCollectionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const cardsRes = await supabase.from('cards').select('*', { count: 'exact', head: true });
      const profilesRes = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const decksRes = await supabase.from('user_decks').select('*', { count: 'exact', head: true });
      const collectionsRes = await supabase.from('user_collections').select('*', { count: 'exact', head: true });

      setCardCount(cardsRes.count || 0);
      setUserCount(profilesRes.count || 0);
      setDeckCount(decksRes.count || 0);
      setCollectionCount(collectionsRes.count || 0);
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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

      <SyncDashboard />
    </div>
  );
}

// ============= Main Admin Page =============
export default function Admin() {
  const [activeTab, setActiveTab] = useState('overview');
  const { user, loading, isAdmin } = useAuth();

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in or not admin
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Access Denied</h2>
              <p className="text-muted-foreground">
                {!user ? 'Please log in to access the admin panel.' : "You don't have permission to access the admin panel."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage your application settings and data</p>
        </div>
        <Badge variant="default" className="flex items-center gap-1">
          <Settings className="h-3 w-3" />
          Admin Mode
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Subs</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Tasks</span>
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">AI</span>
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Sync</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="space-y-6">
            <HomepageModeToggle />
            <OverviewSection />
          </div>
        </TabsContent>

        <TabsContent value="features" className="mt-6">
          <FeatureFlagsManager />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6">
          <SubscriptionManager />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <TaskManagement />
        </TabsContent>

        <TabsContent value="ai" className="mt-6">
          <AISystemAdmin />
        </TabsContent>

        <TabsContent value="sync" className="mt-6">
          <SyncDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
