import { ReactNode } from 'react';
import { StandardSectionHeader } from '@/components/ui/standardized-components';

interface StandardPageLayoutProps {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StandardPageLayout({
  title,
  description,
  action,
  children,
  className = ""
}: StandardPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="w-full max-w-full px-4 md:px-6 py-4 md:py-6">
        <StandardSectionHeader
          title={title}
          description={description}
          action={action}
        />
        
        <div className={`mt-4 md:mt-8 overflow-x-hidden ${className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}