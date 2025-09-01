import { useState } from 'react';
import { StorageContainerView } from './StorageContainerView';
import { CreateContainerDialog } from './CreateContainerDialog';
import { StorageContainer } from '@/types/storage';

export function StorageTab() {
  const [selectedContainer, setSelectedContainer] = useState<StorageContainer | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState<string | undefined>();

  const handleContainerSelect = (container: StorageContainer) => {
    setSelectedContainer(container);
  };

  const handleCreateContainer = (templateId?: string) => {
    setCreateTemplateId(templateId);
    setShowCreateDialog(true);
  };

  const handleBackToOverview = () => {
    setSelectedContainer(null);
  };

  const handleContainerCreated = () => {
    setShowCreateDialog(false);
    setCreateTemplateId(undefined);
    window.location.reload();
  };

  if (selectedContainer) {
    return (
      <StorageContainerView 
        container={selectedContainer}
        onBack={handleBackToOverview}
      />
    );
  }

  return (
    <>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Storage Overview</h2>
        <p className="text-muted-foreground mb-6">Manage your storage containers</p>
      </div>
      
      <CreateContainerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        templateId={createTemplateId}
        onSuccess={handleContainerCreated}
      />
    </>
  );
}