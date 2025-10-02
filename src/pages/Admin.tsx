import React from 'react';
import { AdminPanel } from '@/components/AdminPanel';
import { EnhancedAdminPanel } from '@/components/EnhancedAdminPanel';
import SyncDashboard from '@/components/SyncDashboard';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Admin = () => {
  return (
    <div className="container mx-auto py-6 px-4">
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai">AI Control</TabsTrigger>
          <TabsTrigger value="sync">Card Sync</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AISystemAdmin />
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