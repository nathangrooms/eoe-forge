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
      <div className="w-full px-3 md:px-6 py-4 md:py-8">
        <StandardSectionHeader
          title={title}
          description={description}
          action={action}
        />
        
        <div className={`mt-4 md:mt-8 ${className}`}>
          {children}
        </div>
      </div>
    </div>
  );
}