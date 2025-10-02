import { useState } from 'react';
import { StorageManagement } from './StorageManagement';
import { StorageContainerView } from './StorageContainerView';
import { StorageContainer } from '@/types/storage';

export function StorageTab() {
  const [selectedContainer, setSelectedContainer] = useState<StorageContainer | null>(null);

  const handleContainerSelect = (container: StorageContainer) => {
    setSelectedContainer(container);
  };

  const handleBackToStorage = () => {
    setSelectedContainer(null);
  };

  if (selectedContainer) {
    return (
      <StorageContainerView 
        container={selectedContainer}
        onBack={handleBackToStorage}
      />
    );
  }

  return (
    <StorageManagement
      onContainerSelect={handleContainerSelect}
      selectedContainerId={selectedContainer?.id}
    />
  );
}
