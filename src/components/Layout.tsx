import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { useServer } from "@/contexts/ServerContext";
import { CreateServerModal } from "@/components/CreateServerModal";
import { DiscordWebhookBanner } from "@/components/DiscordWebhookBanner";
import { NoMembersBanner } from "@/components/NoMembersBanner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSpawnAlerts } from "@/hooks/useSpawnAlerts";
import { Skull, List, Calendar, LogOut, Clock, Trophy, Users, BarChart3, Server, Settings, Plus, Shield, ExternalLink, Eye, Bell, Volume2, ChevronDown, Globe, Loader2, Package } from "lucide-react";
import { version } from "../../package.json";
import { useUserTimezone, detectTimezone, formatInTimezone } from "@/hooks/useUserTimezone";
import { TIMEZONES } from "@/lib/timezones";

let _audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

function playAlertSound() {
  try {
    if (localStorage.getItem("raidscout-alert-muted") === "true") return;
    const vol = parseFloat(localStorage.getItem("raidscout-alert-volume") || "0.5");
    const ctx = getAudioContext();
    const notes = [587, 784]; // D5, G5 — gentle two-note chime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25 * vol, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.frequency.setValueAtTime(freq, t);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {}
}

export function Layout() {
  const { user, signOut, userRole, isViewer, viewerServerName } = useAuth();
  const { servers, currentServer, setCurrentServer, loading: serverLoading } = useServer();
  const { timezone, setTimezone } = useUserTimezone(currentServer?.timezone);
  const [showCreate, setShowCreate] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [spawnToast, setSpawnToast] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = userRole === "admin";
  const hasServer = !!currentServer;

  // Admin viewing a server: auto-join server_members to get owner RLS
  const { joining: adminJoining } = useAdminViewAs(isAdmin ? currentServer?.id ?? null : null);

  // Auto-redirect admin to admin panel if they land on data pages without a server
  useEffect(() => {
    // Don't redirect while servers are still loading
    if (serverLoading) return;
    const hasPersistedServer = !!localStorage.getItem("lordnine-current-server-id");
    if (isAdmin && !hasServer && !hasPersistedServer && location.pathname !== "/admin") {
      navigate("/admin", { replace: true });
    }
  }, [isAdmin, hasServer, location.pathname, navigate]);

  // Set page title based on route
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Bosses / Activities — RaidScout",
      "/schedule": "Weekly Schedule — RaidScout",
      "/leaderboard": "Leaderboard — RaidScout",
      "/history": "Kill History — RaidScout",
      "/members": "Members — RaidScout",
      "/analytics": "Analytics — RaidScout",
      "/server-settings": "Server Settings — RaidScout",
      "/admin": "Admin Panel — RaidScout",
    };
    document.title = titles[location.pathname] ?? "RaidScout";
  }, [location.pathname]);

  // Admin without a server: show admin panel button, hide data nav + create
  const showDataNav = !isAdmin || hasServer;

  // Spawn alerts — listen for boss spawns from other clients
  useSpawnAlerts((bossName) => {
    // If the message already has a custom prefix (⚠️), use it as-is
    if (bossName.startsWith("⚠️")) {
      setSpawnToast(bossName);
    } else {
      setSpawnToast(`⚡ ${bossName} spawning in ≤ 5 min!`);
    }
    playAlertSound();
    setTimeout(() => setSpawnToast(null), 8000);
  });

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col" onClick={() => showUserMenu && setShowUserMenu(false)}>
      {/* Admin joining server overlay */}
      {adminJoining && (
        <div className="fixed inset-0 z-[100] bg-[#09090b]/80 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin mx-auto" />
            <p className="text-sm text-[#a1a1aa]">Joining server as owner…</p>
          </div>
        </div>
      )}
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-[#27272a] overflow-visible">
        <div className="max-w-[90rem] mx-auto px-4 min-h-14 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 shrink-0">
            {/* Logo */}
            <img
              src="/logo.png"
              alt="RaidScout"
              className="w-8 h-8 rounded-lg object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) (fallback as HTMLElement).style.display = "flex";
              }}
            />
            <div className="hidden w-8 h-8 rounded-lg bg-[#18181b] items-center justify-center">
              <Skull className="w-4 h-4 text-[#a1a1aa]" />
            </div>
            <span className="font-semibold text-[#fafafa] tracking-tight text-sm">RaidScout</span>
            {isViewer && viewerServerName && (
              <span className="text-xs text-[#a1a1aa] flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {viewerServerName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none touch-pan-x -mr-2 pr-2 min-w-0">
            {/* Nav tabs — hidden for admin without a selected server */}
            {showDataNav && (
            <nav className="hidden md:flex bg-[#18181b] rounded-lg p-0.5 shrink-0">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Bosses / Activities</span>
              </NavLink>
              <NavLink
                to="/schedule"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Schedule</span>
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
              </NavLink>
              <NavLink
                to="/leaderboard"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
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
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Members</span>
              </NavLink>
              )}
              {!isViewer && (
              <NavLink
                to="/inventory"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <Package className="w-4 h-4" />
                <span className="hidden sm:inline">Inventory</span>
              </NavLink>
              )}
              <NavLink
                to="/analytics"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-[#27272a] text-[#fafafa]"
                      : "text-[#71717a] hover:text-[#a1a1aa]"
                  }`
                }
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Analytics</span>
              </NavLink>
            </nav>
            )}

            {/* Server selector */}
            <div className="flex items-center gap-1">
              {isViewer ? (
                <div className="flex items-center gap-1 bg-[#18181b] rounded-lg px-2 py-1">
                  <Eye className="w-3.5 h-3.5 text-[#a1a1aa]" />
                  <span className="text-xs text-[#a1a1aa]">Read-only</span>
                </div>
              ) : currentServer ? (
                <>
                  <div className="flex items-center gap-1 bg-[#18181b] rounded-lg px-2 py-1">
                    <Server className="w-3.5 h-3.5 text-[#a1a1aa]" />
                    <span className="text-xs text-[#d4d4d8] max-w-[100px] truncate">{currentServer.name}</span>
                  </div>

                </>
              ) : !isAdmin ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
                >
                  <Plus className="w-3 h-3" />
                  Create Server
                </button>
              ) : null}
            </div>

            {/* User menu dropdown */}
            <div className="relative">
              <button
                ref={menuBtnRef}
                onClick={() => {
                  if (!showUserMenu && menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  }
                  setShowUserMenu(!showUserMenu);
                }}
                className="flex items-center gap-1 text-[#fafafa]/50 hover:text-[#d4d4d8] text-sm transition p-1.5 rounded-md hover:bg-[#18181b]" title="Menu"
              >
                <span className="text-xs hidden md:block">{user?.email?.split("@")[0]}</span>
                <ChevronDown className={`w-3 h-3 transition ${showUserMenu ? "rotate-180" : ""}`} />
              </button>
              {showUserMenu && createPortal(
                <>
                  <div className="fixed inset-0 z-[9998] bg-black/30 sm:bg-transparent" onClick={() => setShowUserMenu(false)} />
                  <div className="fixed inset-x-4 top-[30%] sm:inset-x-auto sm:translate-y-0 max-w-sm mx-auto sm:mx-0 w-full sm:w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl z-[9999] overflow-hidden backdrop-blur-xl" style={menuPos ? { top: menuPos.top, right: menuPos.right } : {}}>
                    <div className="px-4 py-3 border-b border-[#27272a]">
                      <div className="text-sm font-semibold text-[#fafafa]">{user?.email?.split("@")[0]}</div>
                      <div className="text-xs text-[#71717a]">{user?.email}</div>
                    </div>
                    <div className="py-1">
                      <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-[#71717a]">
                        <Globe className="w-3.5 h-3.5" />
                        <select
                          defaultValue={timezone}
                          onChange={e => setTimezone(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-transparent text-[#a1a1aa] text-xs focus:outline-none cursor-pointer"
                        >
                          {TIMEZONES.map(tz => (
                            <option key={tz.value} value={tz.value} className="bg-[#11161e]">{tz.label}</option>
                          ))}
                        </select>
                      </div>
                      {isAdmin && (
                        <NavLink to="/admin" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition">
                          <Shield className="w-4 h-4" /> Admin Panel
                        </NavLink>
                      )}
                      {hasServer && !isViewer && (
                        <NavLink to="/server-settings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition">
                          <Settings className="w-4 h-4" /> Server Settings
                        </NavLink>
                      )}
                      <button onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition border-t border-white/[0.06]">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Discord webhook warning — only visible to server owner when unconfigured */}
      <DiscordWebhookBanner />

      {/* No members warning — only visible to server owner when no members exist */}
      <NoMembersBanner />

      {/* Content */}
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-xl border-t border-[#27272a] safe-area-bottom">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <List className="w-5 h-5" />
            <span className="text-[10px] font-medium">Bosses</span>
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <Calendar className="w-5 h-5" />
            <span className="text-[10px] font-medium">Schedule</span>
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-medium">History</span>
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] font-medium">Ranks</span>
          </NavLink>
          {!isViewer && (
          <NavLink
            to="/members"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">Members</span>
          </NavLink>
          )}
          {!isViewer && (
          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">Items</span>
          </NavLink>
          )}
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 min-w-[64px] rounded-lg transition-colors ${
                isActive ? "text-[#fafafa]" : "text-[#52525b]"
              }`
            }
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">Stats</span>
          </NavLink>
        </div>
      </nav>

      {/* Footer */}
      <footer className="border-t border-[#27272a] bg-[#09090b] pb-16 md:pb-0">
        <div className="max-w-[90rem] mx-auto px-4 py-5 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#71717a]">
            <img src="/logo.png" alt="" className="w-4 h-4 rounded opacity-40" />
            <span>RaidScout — Track boss respawn timers across any game, schedule hunts, and monitor member performance across your guild. </span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">Resources</span>
            <div className="flex items-center gap-3 text-xs text-[#a1a1aa] flex-wrap mt-1">
              <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#5865f2] transition" title="Join our Discord community">
                <ExternalLink className="w-3 h-3" />
                Discord
              </a>
              <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#1877f2] transition" title="Follow us on Facebook">
                <ExternalLink className="w-3 h-3" />
                Facebook
              </a>
              <Link to="/terms" className="hover:text-[#d4d4d8] transition">Terms</Link>
              <Link to="/privacy" className="hover:text-[#d4d4d8] transition">Privacy</Link>
              <Link to="/changelog" className="hover:text-[#d4d4d8] transition">Changelog</Link>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#fafafa]/20">
            <span>v{version}</span>
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2 animate-bounce">
          <Bell className="w-4 h-4 text-[#a1a1aa]" />
          <span className="text-sm text-[#fafafa] font-medium">{spawnToast}</span>
        </div>
      )}
    </div>
  );
}
