import React from 'react';
import { AdminPanel } from '@/components/AdminPanel';
import { EnhancedAdminPanel } from '@/components/EnhancedAdminPanel';
import SyncDashboard from '@/components/SyncDashboard';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { markTasksComplete } from '@/utils/completeTasksHelper';
import { showSuccess } from '@/components/ui/toast-helpers';

const Admin = () => {
  const handleMarkComplete = async () => {
    await markTasksComplete();
    showSuccess('Tasks Updated', 'Completed tasks have been marked as done');
    window.location.reload();
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Tabs defaultValue="ai" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ai">AI Control</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="sync">Card Sync</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <AISystemAdmin />
        </TabsContent>

        <TabsContent value="tasks">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleMarkComplete} variant="outline">
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Recent Work Complete
              </Button>
            </div>
            <TaskManagement />
          </div>
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