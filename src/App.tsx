import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { LeftNavigation } from "@/components/navigation/LeftNavigation";
import { ScrollToTop } from "@/components/ScrollToTop";
import Collection from "./pages/Collection";
import Homepage from "./pages/Homepage";
import Dashboard from "./pages/Dashboard";
import DashboardPreviewTemp from "./pages/__DashboardPreview";
import Scan from "./pages/Scan";
import DeckBuilder from "./pages/DeckBuilder";
import Decks from "./pages/Decks";
import Templates from "./pages/Templates";
import Cards from "./pages/Cards";

import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Wishlist from "./pages/Wishlist";
import DeckInterface from "./pages/DeckInterface";
import AIBuilder from "./pages/AIBuilder";
import Brain from "./pages/Brain";
import Marketplace from "./pages/Marketplace";
import PublicDeck from "./pages/PublicDeck";
import Simulate from "./pages/Simulate";
import Play from "./pages/Play";
import Tournament from "./pages/Tournament";
import ResetPassword from "./pages/ResetPassword";
import Precons from "./pages/Precons";
import LifeCounter from "./pages/LifeCounter";

const queryClient = new QueryClient();

/**
 * Routes that own the whole screen. They render outside the shell — no top bar,
 * no rail, no page padding — because the device is lying flat on a table being
 * read from four sides, and app chrome in that situation is just something to
 * mis-tap.
 */
const IMMERSIVE_ROUTES = ["/life"];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 ring-2 ring-primary ring-offset-0 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 ring-2 ring-primary ring-offset-0 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ResetPassword />} />
        <Route path="/p/:slug" element={<PublicDeck />} />
        <Route path="/__dashboard-preview" element={<DashboardPreviewTemp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (IMMERSIVE_ROUTES.includes(location.pathname)) {
    return (
      <Routes>
        <Route path="/life" element={<ProtectedRoute><LifeCounter /></ProtectedRoute>} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden max-w-full">
      {/* Top Navigation - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <TopNavigation />
      </div>
      
      {/* Main Layout with Left Nav + Content */}
      <div className="flex pt-16 md:pt-16">
        {/* Left Navigation - Fixed on left, hidden on mobile */}
        <div className="hidden md:block fixed left-0 top-16 bottom-0 z-40">
          <LeftNavigation />
        </div>
        
        {/* Main Content Area - Offset by left nav width on desktop */}
        <main id="main-content" className="flex-1 min-h-[calc(100vh-4rem)] w-full max-w-full md:ml-[var(--nav-rail-w)] overflow-x-hidden py-1 md:py-4 transition-[margin] duration-200">
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/landing" element={<Navigate to="/" replace />} />
            <Route path="/homepage" element={<Navigate to="/" replace />} />
            <Route path="/collection" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
            <Route path="/decks" element={<ProtectedRoute><Decks /></ProtectedRoute>} />
            <Route path="/precons" element={<ProtectedRoute><Precons /></ProtectedRoute>} />
            <Route path="/deck-builder" element={<ProtectedRoute><DeckBuilder /></ProtectedRoute>} />
            <Route path="/deck/:id" element={<ProtectedRoute><DeckInterface /></ProtectedRoute>} />
            {/* /builder was a static mockup (hardcoded zeroes, dead buttons) and the
                third deck-builder surface. Redirected to the one that works. */}
            <Route path="/builder" element={<Navigate to="/deck-builder" replace />} />
            <Route path="/smart-builder" element={<ProtectedRoute><AIBuilder /></ProtectedRoute>} />
            <Route path="/brain" element={<ProtectedRoute><Brain /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            <Route path="/play" element={<ProtectedRoute><Play /></ProtectedRoute>} />
            <Route path="/simulate" element={<ProtectedRoute><Simulate /></ProtectedRoute>} />
            <Route path="/tournament" element={<ProtectedRoute><Tournament /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/p/:slug" element={<PublicDeck />} />
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/reset-password" element={<Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;