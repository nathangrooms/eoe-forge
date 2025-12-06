import React from 'react';
import { AdminPanel } from '@/components/AdminPanel';
import { EnhancedAdminPanel } from '@/components/EnhancedAdminPanel';
import SyncDashboard from '@/components/SyncDashboard';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { FeatureFlagsManager } from '@/components/admin/FeatureFlagsManager';
import { SubscriptionManager } from '@/components/admin/SubscriptionManager';
import { SystemHealthDashboard } from '@/components/dashboard/SystemHealthDashboard';
import { ImplementationSummary } from '@/components/admin/ImplementationSummary';
import { RLSPolicyAudit } from '@/components/admin/RLSPolicyAudit';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  return (
    <div className="container mx-auto py-6 px-4">
      <Tabs defaultValue="features" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="features">Feature Flags</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="ai">AI Control</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="sync">Card Sync</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <FeatureFlagsManager />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SubscriptionManager />
        </TabsContent>

        <TabsContent value="ai">
          <AISystemAdmin />
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-6">
            <ImplementationSummary />
            <TaskManagement />
          </div>
        </TabsContent>

        <TabsContent value="health">
          <SystemHealthDashboard />
        </TabsContent>

        <TabsContent value="security">
          <RLSPolicyAudit />
        </TabsContent>

        <TabsContent value="sync">
          <SyncDashboard />
        </TabsContent>

        <TabsContent value="dashboard">
          <AdminPanel />
        </TabsContent>

        <TabsContent value="management">
          <EnhancedAdminPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;