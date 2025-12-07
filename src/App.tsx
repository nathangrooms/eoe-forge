import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { LeftNavigation } from "@/components/navigation/LeftNavigation";
import { MobileNavigation } from "@/components/navigation/MobileNavigation";
import { ScrollToTop } from "@/components/ScrollToTop";
import Collection from "./pages/Collection";
import Index from "./pages/Index";
import Homepage from "./pages/Homepage";
import Dashboard from "./pages/Dashboard";
import Scan from "./pages/Scan";
import DeckBuilder from "./pages/DeckBuilder";
import Decks from "./pages/Decks";
import Builder from "./pages/Builder";
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
import Tournament from "./pages/Tournament";
import ResetPassword from "./pages/ResetPassword";
import Precons from "./pages/Precons";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation - Fixed at top */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <TopNavigation />
      </div>
      
      {/* Main Layout with Left Nav + Content */}
      <div className="flex pt-24 md:pt-16">
        {/* Left Navigation - Fixed on left, hidden on mobile */}
        <div className="hidden md:block fixed left-0 top-16 bottom-0 z-40">
          <LeftNavigation />
        </div>
        
        {/* Main Content Area - Offset by left nav width on desktop */}
        <main className="flex-1 min-h-[calc(100vh-6rem)] md:min-h-[calc(100vh-4rem)] w-full md:ml-64 overflow-x-hidden py-2 md:py-4">
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/landing" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/homepage" element={<Navigate to="/" replace />} />
            <Route path="/collection" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
            <Route path="/decks" element={<ProtectedRoute><Decks /></ProtectedRoute>} />
            <Route path="/precons" element={<ProtectedRoute><Precons /></ProtectedRoute>} />
            <Route path="/deck-builder" element={<ProtectedRoute><DeckBuilder /></ProtectedRoute>} />
            <Route path="/deck/:id" element={<ProtectedRoute><DeckInterface /></ProtectedRoute>} />
            <Route path="/builder" element={<ProtectedRoute><Builder /></ProtectedRoute>} />
            <Route path="/ai-builder" element={<ProtectedRoute><AIBuilder /></ProtectedRoute>} />
            <Route path="/brain" element={<ProtectedRoute><Brain /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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