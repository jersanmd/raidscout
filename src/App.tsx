import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/pages/LandingPage";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { PublicMemberProfile } from "@/components/PublicMemberProfile";
import { ViewerRoute } from "@/components/ViewerRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/contexts/ToastContext";
import { NoServerView } from "@/components/NoServerView";
import { FullScreenLoader } from "@/components/FullScreenLoader";
import { useMaintenance } from "@/hooks/useMaintenance";
import { MaintenancePage } from "@/pages/MaintenancePage";

// ── Route-level code splitting ──────────────────────────────
const BossListView = lazy(() => import("@/pages/BossListView").then(m => ({ default: m.BossListView })));
const WeeklyScheduleView = lazy(() => import("@/pages/WeeklyScheduleView").then(m => ({ default: m.WeeklyScheduleView })));
const HistoryView = lazy(() => import("@/pages/HistoryView").then(m => ({ default: m.HistoryView })));
const MembersView = lazy(() => import("@/pages/MembersView").then(m => ({ default: m.MembersView })));
const MembersSummaryView = lazy(() => import("@/pages/MembersView").then(m => ({ default: m.MembersSummaryView })));
const AnalyticsView = lazy(() => import("@/pages/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const LeaderboardView = lazy(() => import("@/pages/LeaderboardView").then(m => ({ default: m.LeaderboardView })));
const ServerSettingsView = lazy(() => import("@/pages/ServerSettingsView").then(m => ({ default: m.ServerSettingsView as ComponentType })));
const BillingView = lazy(() => import("@/pages/BillingView").then(m => ({ default: m.BillingView })));
const AdminPanelView = lazy(() => import("@/pages/AdminPanelView").then(m => ({ default: m.AdminPanelView })));
const MemberProfileView = lazy(() => import("@/pages/MemberProfileView").then(m => ({ default: m.MemberProfileView })));
const InventoryView = lazy(() => import("@/pages/InventoryView").then(m => ({ default: m.InventoryView })));
const TermsOfServiceView = lazy(() => import("@/pages/TermsOfService").then(m => ({ default: m.TermsOfServiceView })));
const PrivacyPolicyView = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicyView })));
const RefundPolicyView = lazy(() => import("@/pages/RefundPolicy").then(m => ({ default: m.RefundPolicyView })));
const ChangelogView = lazy(() => import("@/pages/ChangelogView").then(m => ({ default: m.ChangelogView })));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then(m => ({ default: m.ForgotPasswordPage })));
const ChangePasswordPage = lazy(() => import("@/pages/ChangePasswordPage").then(m => ({ default: m.ChangePasswordPage })));
const JoinServerView = lazy(() => import("@/pages/JoinServerView").then(m => ({ default: m.JoinServerView })));
const DkpView = lazy(() => import("@/pages/DkpView").then(m => ({ default: m.DkpView })));

/** Loading fallback shown while route chunks load */
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-red-500 rounded-full animate-spin" />
    </div>
  );
}

import { isSupabaseConfigured } from "@/lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // data is fresh for 30s — no refetch on remount
      refetchOnWindowFocus: false,  // prevent API storms on tab switch
      retry: 1,                     // single retry, not 3
    },
  },
});

function AppContent() {
  const { user, loading, isViewer, userRole } = useAuth();
  const { isMaintenance, loading: maintLoading } = useMaintenance();
  const isAdmin = userRole === "admin";

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-900/30 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-white">Configuration Required</h1>
          <p className="text-slate-400 text-sm max-w-md">
            Supabase is not configured. Set <code className="text-amber-400 bg-slate-800 px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
            <code className="text-amber-400 bg-slate-800 px-1 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code> in your environment.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <FullScreenLoader message="Loading..." />;
  }

  // Password recovery flow — show reset form regardless of auth state
  const isRecovery = window.location.hash.includes("type=recovery");
  if (isRecovery) {
    return <ResetPasswordForm />;
  }

  // Maintenance mode gate — admins bypass, everyone else sees maintenance screen
  if (maintLoading) {
    return <FullScreenLoader message="Checking status..." />;
  }
  const isPreview = new URLSearchParams(window.location.search).get("preview") === "true";
  if (isMaintenance && !isAdmin && !isPreview) {
    return <MaintenancePage />;
  }

  return (
    <ServerProvider>
      <Routes>
        {/* Public pages — accessible without login */}
        <Route path="/terms" element={<Suspense fallback={<PageLoader />}><TermsOfServiceView /></Suspense>} />
        <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicyView /></Suspense>} />
        <Route path="/refund" element={<Suspense fallback={<PageLoader />}><RefundPolicyView /></Suspense>} />
        <Route path="/changelog" element={<Suspense fallback={<PageLoader />}><ChangelogView /></Suspense>} />
        <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPasswordPage /></Suspense>} />
        <Route path="/change-password" element={<Suspense fallback={<PageLoader />}><ChangePasswordPage /></Suspense>} />

        {/* Viewer key auto-login route */}
        <Route path="/view/:viewerKey" element={<ViewerRoute />} />

        {/* Public member profile — masked slug link (shared in Discord) */}
        <Route path="/m/:slug" element={<Suspense fallback={<PageLoader />}><PublicMemberProfile /></Suspense>} />
        {/* Public member profile — direct ID access (redirects to landing if not authed) */}
        <Route path="/members/:memberId" element={<Suspense fallback={<PageLoader />}><MemberProfileView /></Suspense>} />

        {/* Authenticated routes */}
        <Route path="*" element={!user && !isViewer ? <LandingPage /> : <AppRoutes />} />
      </Routes>
    </ServerProvider>
  );
}

function AppRoutes() {
  const { servers, currentServer, loading: serverLoading } = useServer();
  const { userRole, roleLoading } = useAuth();
  const isAdmin = userRole === "admin";
  const hasServer = servers.length > 0 && !!currentServer;
  const ready = !serverLoading && !roleLoading;

  // Track whether we've ever seen a server — prevents NoServerView flash
  // on the very first render after login when data hasn't settled yet.
  const hasEverHadServer = useRef(false);
  if (hasServer) hasEverHadServer.current = true;

  // After ready, give the server list a moment to stabilize before showing NoServerView
  const [showNoServer, setShowNoServer] = useState(false);
  useEffect(() => {
    if (ready && !hasServer && !hasEverHadServer.current) {
      const t = setTimeout(() => setShowNoServer(true), 2000);
      return () => clearTimeout(t);
    }
    if (hasServer) setShowNoServer(false);
  }, [ready, hasServer]);

  // Dynamically set the page title to the current server name
  useEffect(() => {
    document.title = currentServer?.name || "RaidScout";
  }, [currentServer]);

  // Use a single stable <Routes> tree to prevent Layout remounting
  return (
    <Routes>
      {/* Admin panel — always accessible to admins, no server required */}
      <Route path="/admin" element={
        userRole === null ? (
          <PageLoader />
        ) : isAdmin ? (
          <Suspense fallback={<PageLoader />}><AdminPanelView /></Suspense>
        ) : (
          <Navigate to="/" replace />
        )
      } />

      {/* Member Summary — cross-server view for staff on 2+ servers */}
      <Route path="/members-summary" element={
        <Suspense fallback={<PageLoader />}><MembersSummaryView /></Suspense>
      } />

      <Route
        path="/"
        element={
          !ready ? (
            <FullScreenLoader message="Preparing your servers..." />
          ) : !hasServer && !showNoServer ? (
            <FullScreenLoader message="Preparing your servers..." />
          ) : !hasServer && isAdmin && !localStorage.getItem("lordnine-current-server-id") ? (
            <Navigate to="/admin" replace />
          ) : !hasServer ? (
            <div className="min-h-screen bg-[#09090b]">
              <div className="max-w-[90rem] mx-auto px-4 h-14 flex items-center">
                <span className="font-bold text-[#fafafa]">RaidScout</span>
              </div>
              <NoServerView />
            </div>
          ) : (
            <Layout />
          )
        }
      >
        <Route path="/" element={<Suspense fallback={<PageLoader />}><BossListView /></Suspense>} />
        <Route path="/schedule" element={<Suspense fallback={<PageLoader />}><WeeklyScheduleView /></Suspense>} />
        <Route path="/history" element={<Suspense fallback={<PageLoader />}><HistoryView /></Suspense>} />
        <Route path="/leaderboard" element={<Suspense fallback={<PageLoader />}><LeaderboardView /></Suspense>} />
        <Route path="/members" element={<Suspense fallback={<PageLoader />}><MembersView /></Suspense>} />
        <Route path="/inventory" element={<Suspense fallback={<PageLoader />}><InventoryView /></Suspense>} />
        <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsView /></Suspense>} />
        <Route path="/server-settings" element={<Suspense fallback={<PageLoader />}><ServerSettingsView /></Suspense>} />
        <Route path="/billing" element={<Suspense fallback={<PageLoader />}><BillingView /></Suspense>} />
        <Route path="/join" element={<Suspense fallback={<PageLoader />}><JoinServerView /></Suspense>} />
        <Route path="/dkp" element={<Suspense fallback={<PageLoader />}><DkpView /></Suspense>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
