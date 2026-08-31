import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LayoutDashboard, Flag, Users, Brain, ClipboardList,
  Download, Loader2, AlertCircle, CreditCard, Rocket, Cpu
, Sparkles, Library } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { StandardPageLayout } from '@/components/layouts/StandardPageLayout';

import { AdminOverview } from '@/components/admin/AdminOverview';
import { FeatureFlagsManager } from '@/components/admin/FeatureFlagsManager';
import { SubscriptionManager } from '@/components/admin/SubscriptionManager';
import { UserManagement } from '@/components/admin/UserManagement';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { HomepageModeToggle } from '@/components/admin/HomepageModeToggle';
import SyncDashboard from '@/components/SyncDashboard';
import { DevConsole } from '@/components/admin/DevConsole';
import { ArtStudio } from '@/components/admin/ArtStudio';
import { EngineHealth } from '@/components/admin/EngineHealth';
import { EngineDictionary } from '@/components/admin/EngineDictionary';

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'features', label: 'Features', icon: Flag },
  { value: 'subscriptions', label: 'Subs', icon: CreditCard },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'tasks', label: 'Tasks', icon: ClipboardList },
  { value: 'engine', label: 'Engine', icon: Cpu },
  { value: 'dictionary', label: 'Words', icon: Library },
  { value: 'ai', label: 'AI', icon: Brain },
  { value: 'sync', label: 'Sync', icon: Download },
  { value: 'dev', label: 'Dev', icon: Rocket },
  { value: 'art', label: 'Art', icon: Sparkles },
] as const;

export default function Admin() {
  /* THE OPEN TAB LIVES IN THE URL, the same way the deck page carries its
     own. This was `useState`, which meant Back did not step out of a tab, a
     reload landed you on Overview whichever of the nine you were reading, and
     nothing could link to the Dev Console. Design law 4 says back and forward
     work universally, and `DeckInterface` records the identical fix with the
     identical reason: "The builder's tabs were React state, so a reload landed
     you back on Cards and there was no link to the optimiser."

     `overview` is the default, so it stays out of the query string and a bare
     /admin is still a clean address. */
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TABS.some(t => t.value === tabParam) ? (tabParam as string) : 'overview';

  const setActiveTab = useCallback(
    (next: string) => {
      setSearchParams(prev => {
        const params = new URLSearchParams(prev);
        if (next === 'overview') params.delete('tab');
        else params.set('tab', next);
        return params;
      });
    },
    [setSearchParams]
  );
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <StandardPageLayout title="Admin" description="Restricted area">
        <div className="mx-auto max-w-md rounded-xl bg-card p-6 text-center shadow-lg shadow-black/20">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">Access denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {!user
              ? 'Please log in to access the admin panel.'
              : "This account doesn't have permission to access the admin panel."}
          </p>
        </div>
      </StandardPageLayout>
    );
  }

  return (
    /* Admin went through a bare `container mx-auto py-6`, which gave it a 32px
       content gutter while all eleven StandardPageLayout routes use 24px — an
       8px disagreement with every neighbour, plus no HistoryNav and no
       breadcrumb. It goes through the same layout as everything else now. */
    <StandardPageLayout title="Admin" description="Platform data, users, features and sync">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-3 overflow-x-auto px-3 scrollbar-none sm:mx-0 sm:px-0">
          <TabsList className="inline-flex h-auto w-max sm:grid sm:w-full sm:grid-cols-9">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 whitespace-nowrap px-3 py-2.5"
              >
                <Icon className="h-4 w-4" />
                {/* The label was `hidden sm:inline`, so on a phone these eight
                    tabs were eight unlabelled icons — a clipboard and a rocket
                    you had to tap to identify. The strip already scrolls
                    horizontally, so there is room for the words. */}
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <AdminOverview onOpenSync={() => setActiveTab('sync')} />
          <HomepageModeToggle />
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeatureFlagsManager />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          <SubscriptionManager />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UserManagement />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TaskManagement />
        </TabsContent>

        <TabsContent value="engine" className="mt-4">
          <EngineHealth />
        </TabsContent>

        <TabsContent value="dictionary" className="mt-4">
          <EngineDictionary />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <AISystemAdmin />
        </TabsContent>

        {/* The full sync dashboard lives here and only here. It used to be
            rendered twice — once inside Overview and once under this tab — so
            "Manual Actions" and "Start Full Sync" appeared in two places. */}
        <TabsContent value="sync" className="mt-4">
          <SyncDashboard />
        </TabsContent>

        <TabsContent value="dev" className="mt-4">
          <DevConsole />
        </TabsContent>
        <TabsContent value="art" className="mt-4 space-y-4">
          <ArtStudio />
        </TabsContent>
      </Tabs>
    </StandardPageLayout>
  );
}
