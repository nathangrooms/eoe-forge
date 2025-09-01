import { useState } from 'react';
import { StorageOverview } from './StorageOverview';
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
    // Refresh the overview to show new container
    window.location.reload(); // Simple refresh for now
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
      <StorageOverview 
        onContainerSelect={handleContainerSelect}
        onCreateContainer={handleCreateContainer}
      />
      
      <CreateContainerDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        templateId={createTemplateId}
        onSuccess={handleContainerCreated}
      />
    </>
  );
}