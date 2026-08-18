// TEMPORARY verification harness — deleted before this task finishes.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/components/AuthProvider';
import { LeftNavigation } from '@/components/navigation/LeftNavigation';
import { TopNavigation } from '@/components/navigation/TopNavigation';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ThemeProvider attribute="class" defaultTheme="dark">
      <AuthProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <TopNavigation />
            <div className="flex">
              <div className="h-[calc(100vh-4rem)]">
                <LeftNavigation />
              </div>
              <main className="flex-1 p-8">
                <p className="text-sm text-muted-foreground">nav harness</p>
              </main>
            </div>
          </div>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>,
);
