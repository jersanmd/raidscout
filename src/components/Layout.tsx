import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { CreateServerModal } from "@/components/CreateServerModal";
import { DiscordWebhookBanner } from "@/components/DiscordWebhookBanner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSpawnAlerts } from "@/hooks/useSpawnAlerts";
import { Skull, List, Calendar, LogOut, Clock, Trophy, Users, BarChart3, Server, Settings, Plus, Shield, ExternalLink, Eye, Bell, Volume2 } from "lucide-react";

function playAlertSound() {
  try {
    const vol = parseFloat(localStorage.getItem("raidscout-alert-volume") || "0.5");
    const ctx = new AudioContext();
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      const t = ctx.currentTime + i * 1.2;
      gain.gain.setValueAtTime(0.3 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.linearRampToValueAtTime(1200, t + 0.8);
      osc.start(t);
      osc.stop(t + 0.8);
    }
  } catch {}
}

export function Layout() {
  const { user, signOut, userRole, isViewer, viewerServerName } = useAuth();
  const { servers, currentServer, setCurrentServer } = useServer();
  const [showCreate, setShowCreate] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [spawnToast, setSpawnToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = userRole === "admin";
  const hasServer = !!currentServer;

  // Auto-redirect admin to admin panel if they land on data pages without a server
  useEffect(() => {
    if (isAdmin && !hasServer && location.pathname !== "/admin") {
      navigate("/admin", { replace: true });
    }
  }, [isAdmin, hasServer, location.pathname, navigate]);

  // Admin without a server: show admin panel button, hide data nav + create
  const showDataNav = !isAdmin || hasServer;

  // Spawn alerts — listen for boss spawns from other clients
  useSpawnAlerts((bossName) => {
    setSpawnToast(`⚡ ${bossName} spawning in ≤ 5 min!`);
    playAlertSound();
    setTimeout(() => setSpawnToast(null), 8000);
  });

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur border-b border-slate-800">
        <div className="max-w-[90rem] mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 shrink-0">
            {/* Logo */}
            <img
              src="/logo.png"
              alt="RaidScout"
              className="w-8 h-8 rounded-lg object-contain"
              onError={(e) => {
                // Fallback to skull icon if logo not found
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = "flex";
              }}
            />
            <div className="hidden w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 items-center justify-center">
              <Skull className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white hidden sm:block">RaidScout</span>
            {isViewer && viewerServerName && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {viewerServerName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none touch-pan-x -mr-2 pr-2">
            {/* Nav tabs — hidden for admin without a selected server */}
            {showDataNav && (
            <nav className="flex bg-slate-800 rounded-lg p-0.5 shrink-0">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Bosses</span>
              </NavLink>
              <NavLink
                to="/schedule"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Schedule</span>
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </NavLink>
              <NavLink
                to="/leaderboard"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden sm:inline">Ranks</span>
              </NavLink>
              {!isViewer && (
              <NavLink
                to="/members"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Members</span>
              </NavLink>
              )}
              <NavLink
                to="/analytics"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Analytics</span>
              </NavLink>
            </nav>
            )}

            {/* Admin without server: prompt to go to admin panel */}
            {isAdmin && !hasServer && (
              <button
                onClick={() => navigate("/admin")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition"
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Panel
              </button>
            )}

            {/* Server selector */}
            <div className="flex items-center gap-1">
              {isViewer ? (
                <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 py-1">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-slate-300">Read-only</span>
                </div>
              ) : currentServer ? (
                <>
                  <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg px-2 py-1">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs text-slate-300 max-w-[100px] truncate">{currentServer.name}</span>
                  </div>
                  <button
                    onClick={() => navigate("/server-settings")}
                    className="text-slate-500 hover:text-slate-300 p-1 transition"
                    title="Server Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : !isAdmin ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition"
                >
                  <Plus className="w-3 h-3" />
                  Create Server
                </button>
              ) : null}
              {/* Admin: always show admin panel link */}
              {isAdmin && (
                <button
                  onClick={() => navigate("/admin")}
                  className="text-purple-400 hover:text-purple-300 p-1 transition"
                  title="Admin Panel"
                >
                  <Shield className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* User info + sign out */}
            <span className="text-slate-400 text-xs hidden md:block mr-1">
              {user?.email?.split("@")[0]}
            </span>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex items-center gap-1 text-slate-400 hover:text-white text-sm transition p-1.5 rounded-md hover:bg-slate-800"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Discord webhook warning — only visible to server owner when unconfigured */}
      <DiscordWebhookBanner />

      {/* Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50">
        <div className="max-w-[90rem] mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <img src="/logo.png" alt="" className="w-4 h-4 rounded opacity-50" />
            <span>RaidScout — Track LordNine boss respawn timers, schedule hunts, and monitor member performance across your guild. <span className="text-emerald-500">100% Free.</span></span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
            <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-indigo-400 transition" title="Join our Discord community">
              <ExternalLink className="w-3 h-3" />
              Discord Community
            </a>
            <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-400 transition" title="Follow us on Facebook">
              <ExternalLink className="w-3 h-3" />
              Facebook Page
            </a>
            <span className="text-slate-800">|</span>
            <Link to="/terms" className="hover:text-slate-400 transition">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-slate-400 transition">Privacy Policy</Link>
            <span className="text-slate-800">|</span>
            <span>v1.0.0</span>
            <span>© 2026 RaidScout. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* Create Server Modal */}
      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}

      {/* Logout Confirm */}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        variant="warning"
        onConfirm={signOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Spawn Alert Toast */}
      {spawnToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-900/90 border border-emerald-700 rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2 animate-bounce">
          <Bell className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-white font-medium">{spawnToast}</span>
        </div>
      )}
    </div>
  );
}
