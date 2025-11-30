import React from 'react';
import { AdminPanel } from '@/components/AdminPanel';
import { EnhancedAdminPanel } from '@/components/EnhancedAdminPanel';
import SyncDashboard from '@/components/SyncDashboard';
import { AISystemAdmin } from '@/components/admin/AISystemAdmin';
import { TaskManagement } from '@/components/admin/TaskManagement';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CheckCircle, Trash2 } from 'lucide-react';
import { markTasksComplete } from '@/utils/completeTasksHelper';
import { cleanupDuplicateTasks } from '@/utils/cleanupDuplicateTasks';
import { showSuccess, showError } from '@/components/ui/toast-helpers';

const Admin = () => {
  const [isCleaningUp, setIsCleaningUp] = React.useState(false);
  
  const handleMarkComplete = async () => {
    await markTasksComplete();
    showSuccess('Tasks Updated', 'Completed tasks have been marked as done');
    window.location.reload();
  };

  const handleCleanupDuplicates = async () => {
    if (!confirm('This will remove all duplicate tasks. Continue?')) {
      return;
    }
    
    setIsCleaningUp(true);
    try {
      const result = await cleanupDuplicateTasks();
      if (result.success) {
        showSuccess('Cleanup Complete', result.message);
        window.location.reload();
      } else {
        showError('Cleanup Failed', result.message);
      }
    } catch (error: any) {
      showError('Cleanup Error', error.message);
    } finally {
      setIsCleaningUp(false);
    }
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
            <div className="flex gap-2 justify-end">
              <Button 
                onClick={handleCleanupDuplicates} 
                variant="destructive"
                disabled={isCleaningUp}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isCleaningUp ? 'Cleaning...' : 'Remove Duplicates'}
              </Button>
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