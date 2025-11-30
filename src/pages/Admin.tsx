import React from 'react';
import { AdminPanel } from '@/components/AdminPanel';
import { EnhancedAdminPanel } from '@/components/EnhancedAdminPanel';
import SyncDashboard from '@/components/SyncDashboard';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { FeatureFlags } from '@/components/admin/FeatureFlags';
import { SystemHealthDashboard } from '@/components/dashboard/SystemHealthDashboard';
import { ImplementationSummary } from '@/components/admin/ImplementationSummary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  return (
    <div className="container mx-auto py-6 px-4">
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai">AI Control</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="features">Feature Flags</TabsTrigger>
          <TabsTrigger value="health">System Health</TabsTrigger>
          <TabsTrigger value="sync">Card Sync</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AISystemAdmin />
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-6">
            <ImplementationSummary />
            <TaskManagement />
          </div>
        </TabsContent>

        <TabsContent value="features">
          <FeatureFlags />
        </TabsContent>

        <TabsContent value="health">
          <SystemHealthDashboard />
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