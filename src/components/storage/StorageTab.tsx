import { useState } from 'react';
import { StorageManagement } from './StorageManagement';
import { StorageContainerView } from './StorageContainerView';
import { StorageContainer } from '@/types/storage';

export function StorageTab() {
  const [selectedContainer, setSelectedContainer] = useState<StorageContainer | null>(null);

  if (selectedContainer) {
    return (
      <div className="h-full">
        <StorageContainerView 
          container={selectedContainer}
          onBack={() => setSelectedContainer(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full">
      <StorageManagement
        onContainerSelect={(container) => setSelectedContainer(container)}
        selectedContainerId={undefined}
      />
    </div>
  );
}
