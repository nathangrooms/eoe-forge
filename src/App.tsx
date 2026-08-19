import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { PublicNavigation } from "@/components/navigation/PublicNavigation";
import { LeftNavigation } from "@/components/navigation/LeftNavigation";
import { ScrollToTop } from "@/components/ScrollToTop";
import Collection from "./pages/Collection";
import CollectionImport from "./pages/CollectionImport";
import CollectionInsurance from "./pages/CollectionInsurance";
import StorageQuickAdd from "./pages/StorageQuickAdd";
import SellCard from "./pages/SellCard";
import Homepage from "./pages/Homepage";
import Dashboard from "./pages/Dashboard";
import Scan from "./pages/Scan";
import DeckBuilder from "./pages/DeckBuilder";
import Decks from "./pages/Decks";
import NewDeck from "./pages/NewDeck";
import Templates from "./pages/Templates";
import Cards from "./pages/Cards";
import CardDetailPage from "./pages/CardDetail";

import Login from "./pages/Login";
import Register from "./pages/Register";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Settings from "./pages/Settings";
import Wishlist from "./pages/Wishlist";
import DeckInterface from "./pages/DeckInterface";
import DeckAnalysis from "./pages/DeckAnalysis";
import DeckExport from "./pages/DeckExport";
import DeckShare from "./pages/DeckShare";
import DeckMissingCards from "./pages/DeckMissingCards";
import DeckCommander from "./pages/DeckCommander";
import AIBuilder from "./pages/AIBuilder";
import Brain from "./pages/Brain";
import Marketplace from "./pages/Marketplace";
import PublicDeck from "./pages/PublicDeck";
import Simulate from "./pages/Simulate";
import Play from "./pages/Play";
import Tournament from "./pages/Tournament";
import TournamentNew from "./pages/TournamentNew";
import CameraScan from "./pages/CameraScan";
import ListingEdit from "./pages/ListingEdit";
import ListingMessages from "./pages/ListingMessages";
import AdminUserDetail from "./pages/AdminUserDetail";
import ResetPassword from "./pages/ResetPassword";
import Precons from "./pages/Precons";
import LifeCounter from "./pages/LifeCounter";

const queryClient = new QueryClient();

/*
 * There is no longer a list of routes that render outside the shell.
 *
 * `/life` used to be one: opening it replaced the whole application with a
 * black screen, so *setting up* a game — choosing a pod size, typing names —
 * happened with no top bar, no rail and no way back other than one small
 * chevron. Owner: "life counter UI is terrible on desktop and goes full screen
 * and is confusing - should be within our normal frame/nav etc until you press
 * start."
 *
 * Immersion is now the running game's business, not the router's: `/life` is an
 * ordinary page in the shell, and `LifeCounter` raises its own board over the
 * chrome once Start is pressed. See `src/pages/LifeCounter.tsx`.
 */

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


/**
 * Header for public content pages.
 *
 * A visitor following a shared deck or card link is signed out, so the app
 * shell never renders. Without this they get the page and nothing else: no
 * wordmark, no way back, and no prompt to sign up.
 */
function PublicContentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      <main id="main-content">{children}</main>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

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
        {/* Shared content a signed-out visitor can land on directly. These get
            the public header: without it there is no wordmark, no back control
            and no route to signing up — a dead end at the end of a shared link. */}
        <Route path="/p/:slug" element={<PublicContentShell><PublicDeck /></PublicContentShell>} />
        <Route
          path="/cards/:id"
          element={<PublicContentShell><CardDetailPage /></PublicContentShell>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
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
        
        {/* Main Content Area - Offset by left nav width on desktop.

            No TOP padding, deliberately. It used to carry py-4, which let 16px
            of the darker page background show between the fixed nav and the
            page's own panel. That read as a thin black line under the nav on
            every page, which the owner reported on the collection page. Pages
            now sit flush against the nav; bottom padding is kept. */}
        <main id="main-content" className="flex-1 min-h-[calc(100vh-4rem)] w-full max-w-full md:ml-[var(--nav-rail-w)] overflow-x-hidden pb-1 md:pb-4 transition-[margin] duration-200">
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/landing" element={<Navigate to="/" replace />} />
            <Route path="/homepage" element={<Navigate to="/" replace />} />
            <Route path="/collection" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/collection/import" element={<ProtectedRoute><CollectionImport /></ProtectedRoute>} />
            <Route path="/collection/insurance" element={<ProtectedRoute><CollectionInsurance /></ProtectedRoute>} />
            {/* Storage is a tab of the Collection page, but a container is a
                destination: it gets its own URL so Back closes it. */}
            <Route path="/collection/storage" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/collection/storage/:containerId" element={<ProtectedRoute><Collection /></ProtectedRoute>} />
            <Route path="/collection/storage/:containerId/add" element={<ProtectedRoute><StorageQuickAdd /></ProtectedRoute>} />
            <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
            <Route path="/marketplace/list/:collectionItemId" element={<ProtectedRoute><SellCard /></ProtectedRoute>} />
            <Route path="/marketplace/listing/:id/edit" element={<ProtectedRoute><ListingEdit /></ProtectedRoute>} />
            <Route path="/marketplace/messages/:listingId" element={<ProtectedRoute><ListingMessages /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
            {/* The scanner was a full-screen dialog pretending to be a page. */}
            <Route path="/scan/camera" element={<ProtectedRoute><CameraScan /></ProtectedRoute>} />
            <Route path="/decks" element={<ProtectedRoute><Decks /></ProtectedRoute>} />
            <Route path="/decks/new" element={<ProtectedRoute><NewDeck /></ProtectedRoute>} />
            <Route path="/precons" element={<ProtectedRoute><Precons /></ProtectedRoute>} />
            <Route path="/deck-builder" element={<ProtectedRoute><DeckBuilder /></ProtectedRoute>} />
            {/* The commander picker was a dialog over the builder; it is a destination now. */}
            <Route path="/deck-builder/commander" element={<ProtectedRoute><DeckCommander /></ProtectedRoute>} />
            <Route path="/deck/:id" element={<ProtectedRoute><DeckInterface /></ProtectedRoute>} />
            {/* Deck sub-destinations that used to be dialogs and drawers over /decks. */}
            <Route path="/deck/:id/analysis" element={<ProtectedRoute><DeckAnalysis /></ProtectedRoute>} />
            <Route path="/deck/:id/export" element={<ProtectedRoute><DeckExport /></ProtectedRoute>} />
            <Route path="/deck/:id/share" element={<ProtectedRoute><DeckShare /></ProtectedRoute>} />
            <Route path="/deck/:id/missing" element={<ProtectedRoute><DeckMissingCards /></ProtectedRoute>} />
            {/* /builder was a static mockup (hardcoded zeroes, dead buttons) and the
                third deck-builder surface. Redirected to the one that works. */}
            <Route path="/builder" element={<Navigate to="/deck-builder" replace />} />
            <Route path="/smart-builder" element={<ProtectedRoute><AIBuilder /></ProtectedRoute>} />
            <Route path="/brain" element={<ProtectedRoute><Brain /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
            <Route path="/cards/:id" element={<ProtectedRoute><CardDetailPage /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            <Route path="/play" element={<ProtectedRoute><Play /></ProtectedRoute>} />
            {/* Setup renders here, in the frame. The running board covers it. */}
            <Route path="/life" element={<ProtectedRoute><LifeCounter /></ProtectedRoute>} />
            <Route path="/simulate" element={<ProtectedRoute><Simulate /></ProtectedRoute>} />
            <Route path="/tournament" element={<ProtectedRoute><Tournament /></ProtectedRoute>} />
            <Route path="/tournament/new" element={<ProtectedRoute><TournamentNew /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/admin/users/:userId" element={<ProtectedRoute><AdminUserDetail /></ProtectedRoute>} />
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