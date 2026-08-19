import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { TopNavigation } from "@/components/navigation/TopNavigation";
import { PublicNavigation } from "@/components/navigation/PublicNavigation";
import { LeftNavigation } from "@/components/navigation/LeftNavigation";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RouteFallback, AppBootFallback } from "@/components/routing/RouteFallback";
import { RouteBoundary, clearChunkReloadGuard } from "@/components/routing/RouteBoundary";

/*
 * Every page is fetched when it is needed, not before.
 *
 * All 43 of them used to be imported at the top of this file, which left the
 * build no choice: one file, measured at 3.44 MB raw and 968 KB over the wire,
 * downloaded and parsed in full before a single pixel appeared. Someone
 * arriving at the homepage was paying for the play engine, the deck builder,
 * the admin console, the scanner and the PDF exporter before they had read a
 * word.
 *
 * The factories live in `load` rather than being written inline inside
 * `lazy()`, because `lazy` keeps the function it is handed to itself and the
 * prefetcher below needs to call the same ones again to warm a page ahead of a
 * click. Calling a factory twice costs nothing: the module registry hands back
 * the first result.
 */
const load = {
  // Public. A first-time visitor reaches exactly these, so they stay small.
  homepage: () => import("./pages/Homepage"),
  login: () => import("./pages/Login"),
  register: () => import("./pages/Register"),
  resetPassword: () => import("./pages/ResetPassword"),
  publicDeck: () => import("./pages/PublicDeck"),
  cardDetail: () => import("./pages/CardDetail"),
  notFound: () => import("./pages/NotFound"),

  // Signed in.
  dashboard: () => import("./pages/Dashboard"),
  collection: () => import("./pages/Collection"),
  collectionImport: () => import("./pages/CollectionImport"),
  collectionInsurance: () => import("./pages/CollectionInsurance"),
  storageQuickAdd: () => import("./pages/StorageQuickAdd"),
  marketplace: () => import("./pages/Marketplace"),
  sellCard: () => import("./pages/SellCard"),
  listingEdit: () => import("./pages/ListingEdit"),
  listingMessages: () => import("./pages/ListingMessages"),
  scan: () => import("./pages/Scan"),
  cameraScan: () => import("./pages/CameraScan"),
  decks: () => import("./pages/Decks"),
  newDeck: () => import("./pages/NewDeck"),
  precons: () => import("./pages/Precons"),
  deckBuilder: () => import("./pages/DeckBuilder"),
  deckCommander: () => import("./pages/DeckCommander"),
  deckInterface: () => import("./pages/DeckInterface"),
  deckAnalysis: () => import("./pages/DeckAnalysis"),
  deckExport: () => import("./pages/DeckExport"),
  deckShare: () => import("./pages/DeckShare"),
  deckMissingCards: () => import("./pages/DeckMissingCards"),
  aiBuilder: () => import("./pages/AIBuilder"),
  tutor: () => import("./pages/Tutor"),
  templates: () => import("./pages/Templates"),
  cards: () => import("./pages/Cards"),
  wishlist: () => import("./pages/Wishlist"),
  shoppingList: () => import("./pages/Buylist"),
  proxyList: () => import("./pages/ProxyList"),
  play: () => import("./pages/Play"),
  lifeCounter: () => import("./pages/LifeCounter"),
  simulate: () => import("./pages/Simulate"),
  tournament: () => import("./pages/Tournament"),
  tournamentNew: () => import("./pages/TournamentNew"),
  settings: () => import("./pages/Settings"),
  admin: () => import("./pages/Admin"),
  adminUserDetail: () => import("./pages/AdminUserDetail"),
};

const Homepage = lazy(load.homepage);
const Login = lazy(load.login);
const Register = lazy(load.register);
const ResetPassword = lazy(load.resetPassword);
const PublicDeck = lazy(load.publicDeck);
const CardDetailPage = lazy(load.cardDetail);
const NotFound = lazy(load.notFound);

const Dashboard = lazy(load.dashboard);
const Collection = lazy(load.collection);
const CollectionImport = lazy(load.collectionImport);
const CollectionInsurance = lazy(load.collectionInsurance);
const StorageQuickAdd = lazy(load.storageQuickAdd);
const Marketplace = lazy(load.marketplace);
const SellCard = lazy(load.sellCard);
const ListingEdit = lazy(load.listingEdit);
const ListingMessages = lazy(load.listingMessages);
const Scan = lazy(load.scan);
const CameraScan = lazy(load.cameraScan);
const Decks = lazy(load.decks);
const NewDeck = lazy(load.newDeck);
const Precons = lazy(load.precons);
const DeckBuilder = lazy(load.deckBuilder);
const DeckCommander = lazy(load.deckCommander);
const DeckInterface = lazy(load.deckInterface);
const DeckAnalysis = lazy(load.deckAnalysis);
const DeckExport = lazy(load.deckExport);
const DeckShare = lazy(load.deckShare);
const DeckMissingCards = lazy(load.deckMissingCards);
const AIBuilder = lazy(load.aiBuilder);
const Tutor = lazy(load.tutor);
const Templates = lazy(load.templates);
const Cards = lazy(load.cards);
const Wishlist = lazy(load.wishlist);
const ShoppingList = lazy(load.shoppingList);
const ProxyList = lazy(load.proxyList);
const Play = lazy(load.play);
const LifeCounter = lazy(load.lifeCounter);
const Simulate = lazy(load.simulate);
const Tournament = lazy(load.tournament);
const TournamentNew = lazy(load.tournamentNew);
const Settings = lazy(load.settings);
const Admin = lazy(load.admin);
const AdminUserDetail = lazy(load.adminUserDetail);

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

/**
 * Splitting the app means the first click on each nav entry waits for a
 * network round trip, which would trade one kind of lag for another. So once
 * the app is up and the browser has nothing else to do, the pages behind the
 * left rail are fetched quietly in the background.
 *
 * Only the handful people actually reach next. Fetching all 36 signed-in pages
 * would be the old single bundle again with extra steps. Play, the deck builder
 * and admin are deliberately absent: they are the heaviest pages and the least
 * likely next click.
 */
const PREFETCH_ON_IDLE: Array<() => Promise<unknown>> = [
  load.collection,
  load.decks,
  load.cards,
  load.wishlist,
];

function useIdlePrefetch(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    /* A metered or slow connection should not be spent on a guess. */
    const connection = (navigator as any)?.connection;
    if (connection?.saveData) return;
    if (typeof connection?.effectiveType === 'string' && /2g/.test(connection.effectiveType)) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const factory of PREFETCH_ON_IDLE) {
        factory().catch(() => { /* a warm-up is allowed to fail quietly */ });
      }
    };

    const idle = (window as any).requestIdleCallback;
    if (typeof idle === 'function') {
      const handle = idle(run, { timeout: 4000 });
      return () => {
        cancelled = true;
        (window as any).cancelIdleCallback?.(handle);
      };
    }
    const timer = window.setTimeout(run, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);
}

/**
 * One suspense boundary and one error boundary wrap the whole route table
 * rather than every route wrapping itself.
 *
 * Per-route boundaries would remount on each navigation and lose the reset:
 * keying the error boundary on the pathname is what lets someone who hit a
 * broken page navigate away and have the app recover, instead of being stuck
 * on the message until they reload.
 */
function RouteHost({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <RouteBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </RouteBoundary>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppBootFallback />;
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

  useIdlePrefetch(Boolean(user));

  /* A route that rendered is proof this tab is not running against a dead build. */
  useEffect(() => {
    if (!loading) clearChunkReloadGuard();
  }, [loading]);

  if (loading) {
    return <AppBootFallback />;
  }

  if (!user) {
    return (
      <RouteHost>
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
      </RouteHost>
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
            now sit flush against the nav; bottom padding is kept.

            No overflow-x-hidden either. It forces overflow-y to compute as
            `auto`, which makes this a scroll container, and every
            `position: sticky` descendant then anchors to THIS element instead of
            the viewport. Measured on the new-deck page: its sticky action bar sat
            at y=1555 in a 900px viewport, 655px below the fold, so the Create
            button appeared not to exist. The outer wrapper still carries
            overflow-x-hidden as the page-level guard against horizontal scroll. */}
        <main id="main-content" className="flex-1 min-h-[calc(100vh-4rem)] w-full max-w-full md:ml-[var(--nav-rail-w)] pb-1 md:pb-4 transition-[margin] duration-200">
          <ScrollToTop />
          <RouteHost>
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
            <Route path="/tutor" element={<ProtectedRoute><Tutor /></ProtectedRoute>} />
            {/* MTG Brain became Tutor. Links to /brain are out there in saved
                bookmarks and in anything already shared, and back/forward has to
                keep working, so the old path redirects rather than 404s. */}
            <Route path="/brain" element={<Navigate to="/tutor" replace />} />
            <Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
            <Route path="/cards" element={<ProtectedRoute><Cards /></ProtectedRoute>} />
            <Route path="/cards/:id" element={<ProtectedRoute><CardDetailPage /></ProtectedRoute>} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            {/* The shopping list and the proxy list are the same feature with
                two endings: one buys, one prints. Both are destinations, so both
                get a real URL and a nav entry. */}
            <Route path="/shopping" element={<ProtectedRoute><ShoppingList /></ProtectedRoute>} />
            <Route path="/proxies" element={<ProtectedRoute><ProxyList /></ProtectedRoute>} />
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
          </RouteHost>
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