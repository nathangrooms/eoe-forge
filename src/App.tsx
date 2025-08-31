import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { LeftNavigation } from "@/components/navigation/LeftNavigation";
import Collection from "./pages/Collection";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import DeckBuilder from "./pages/DeckBuilder";
import Decks from "./pages/Decks";
import Builder from "./pages/Builder";
import Templates from "./pages/Templates";
import Cards from "./pages/Cards";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Wishlist from "./pages/Wishlist";
import DeckInterface from "./pages/DeckInterface";
import AIBuilder from "./pages/AIBuilder";

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
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation - Always Visible */}
      <TopNavigation />
      
      {/* Main Layout with Left Nav + Content */}
      <div className="flex">
        {/* Left Navigation */}
        <LeftNavigation />
        
        {/* Main Content Area */}
        <main className="flex-1 min-h-[calc(100vh-4rem)]">
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/landing" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/collection" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/decks" element={<ProtectedRoute><Decks /></ProtectedRoute>} />
            <Route path="/deck-builder" element={<ProtectedRoute><DeckBuilder /></ProtectedRoute>} />
            <Route path="/deck/:id" element={<ProtectedRoute><DeckInterface /></ProtectedRoute>} />
            <Route path="/builder" element={<ProtectedRoute><Builder /></ProtectedRoute>} />
            <Route path="/ai-builder" element={<ProtectedRoute><AIBuilder /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
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