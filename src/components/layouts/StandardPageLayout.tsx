import { ReactNode } from 'react';
import { StandardSectionHeader } from '@/components/ui/standardized-components';

interface StandardPageLayoutProps {
  title: string;
  description: string;
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <StandardSectionHeader
          title={title}
          description={description}
          action={action}
        />
        
        <div className={`mt-8 ${className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}