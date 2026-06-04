import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ServerProvider, useServer } from "@/contexts/ServerContext";
import { Layout } from "@/components/Layout";
import { LandingPage } from "@/pages/LandingPage";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { ViewerRoute } from "@/components/ViewerRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/contexts/ToastContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { NoServerView } from "@/components/NoServerView";
import { useMaintenance } from "@/hooks/useMaintenance";
import { MaintenancePage } from "@/pages/MaintenancePage";

// ── Route-level code splitting ──────────────────────────────
const BossListView = lazy(() => import("@/pages/BossListView").then(m => ({ default: m.BossListView })));
const WeeklyScheduleView = lazy(() => import("@/pages/WeeklyScheduleView").then(m => ({ default: m.WeeklyScheduleView })));
const HistoryView = lazy(() => import("@/pages/HistoryView").then(m => ({ default: m.HistoryView })));
const MembersView = lazy(() => import("@/pages/MembersView").then(m => ({ default: m.MembersView })));
const AnalyticsView = lazy(() => import("@/pages/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const LeaderboardView = lazy(() => import("@/pages/LeaderboardView").then(m => ({ default: m.LeaderboardView })));
const ServerSettingsView = lazy(() => import("@/pages/ServerSettingsView").then(m => ({ default: m.ServerSettingsView })));
const AdminPanelView = lazy(() => import("@/pages/AdminPanelView").then(m => ({ default: m.AdminPanelView })));
const TermsOfServiceView = lazy(() => import("@/pages/TermsOfService").then(m => ({ default: m.TermsOfServiceView })));
const PrivacyPolicyView = lazy(() => import("@/pages/PrivacyPolicy").then(m => ({ default: m.PrivacyPolicyView })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));

/** Loading fallback shown while route chunks load */
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-slate-600 border-t-red-500 rounded-full animate-spin" />
    </div>
  );
}

import { isSupabaseConfigured } from "@/lib/supabase";

const queryClient = new QueryClient();

function AppContent() {
  const { user, loading, isViewer, userRole } = useAuth();
  const { isMaintenance, loading: maintLoading } = useMaintenance();
  const isAdmin = userRole === "admin";

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Password recovery flow — show reset form regardless of auth state
  const isRecovery = window.location.hash.includes("type=recovery");
  if (isRecovery) {
    return <ResetPasswordForm />;
  }

  // Maintenance mode gate — admins bypass, everyone else sees maintenance screen
  // Block during loading to prevent flash of normal app
  if (maintLoading) {
    return <PageLoader />;
  }
  if (isMaintenance && !isAdmin) {
    return <MaintenancePage />;
  }

  return (
    <ServerProvider>
      <Routes>
        {/* Public pages — accessible without login */}
        <Route path="/terms" element={<Suspense fallback={<PageLoader />}><TermsOfServiceView /></Suspense>} />
        <Route path="/privacy" element={<Suspense fallback={<PageLoader />}><PrivacyPolicyView /></Suspense>} />

        {/* Viewer key auto-login route */}
        <Route path="/view/:viewerKey" element={<ViewerRoute />} />

        {/* Authenticated routes */}
        <Route path="*" element={!user && !isViewer ? <LandingPage /> : <AppRoutes />} />
      </Routes>
    </ServerProvider>
  );
}

function AppRoutes() {
  const { servers, currentServer, loading: serverLoading } = useServer();
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const hasServer = servers.length > 0;
  const ready = !serverLoading;

  // Dynamically set the page title to the current server name
  useEffect(() => {
    document.title = currentServer?.name || "RaidScout";
  }, [currentServer]);

  // Use a single stable <Routes> tree to prevent Layout remounting
  return (
    <Routes>
      <Route
        element={
          ready && !hasServer ? (
            <div className="min-h-screen bg-slate-950">
              <div className="max-w-[90rem] mx-auto px-4 h-14 flex items-center">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">RaidScout</span>
                  {isAdmin && (
                    <a href="/admin" className="text-xs text-purple-400 hover:text-purple-300 transition">Admin Panel →</a>
                  )}
                </div>
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
        <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsView /></Suspense>} />
        <Route path="/server-settings" element={<Suspense fallback={<PageLoader />}><ServerSettingsView /></Suspense>} />
        <Route path="/admin" element={
          userRole === null ? (
            <PageLoader />
          ) : isAdmin ? (
            <Suspense fallback={<PageLoader />}><AdminPanelView /></Suspense>
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
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
              <ThemeProvider>
                <AppContent />
              </ThemeProvider>
            </ToastProvider>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
