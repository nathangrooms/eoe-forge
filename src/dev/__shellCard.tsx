/* gitignored harness */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../index.css';
import { AuthProvider } from '../components/AuthProvider';
import { TooltipProvider } from '../components/ui/tooltip';
import CardDetail from '../pages/CardDetail';
const client = new QueryClient({ defaultOptions:{ queries:{ retry:false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><TooltipProvider><AuthProvider>
    <div className="min-h-screen bg-background overflow-x-hidden max-w-full">
      <div className="flex pt-16">
        <div className="hidden md:block fixed left-0 top-16 bottom-0 z-40" style={{width:'var(--nav-rail-w)'}} />
        <main id="main-content" className="flex-1 min-h-[calc(100vh-4rem)] w-full max-w-full md:ml-[var(--nav-rail-w)] pb-4">
          <MemoryRouter initialEntries={['/cards/56001a36-126b-4c08-af98-a6cc4d84210e']}>
            <Routes><Route path="/cards/:id" element={<CardDetail />} /></Routes>
          </MemoryRouter>
        </main>
      </div>
    </div>
  </AuthProvider></TooltipProvider></QueryClientProvider>
);
