import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllServers, fetchAllUsers, fetchAuditLog, fetchServerStats, fetchDatabaseStats, fetchPlanUsage, fetchCronStatus, restoreServer, addServerModerator, supabase, writeAuditEntry, AuditAction, AUDIT_ACTION_GROUPS } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Loader2, Shield, Server, Users, Eye, ChevronDown, ChevronUp, ClipboardList, HardDrive, BarChart3, Crosshair, Skull, Activity, Radio, Clock, Trash2, RefreshCw, LogOut, Gamepad2, Globe, Search, AlertTriangle, Crown, ScrollText, CheckCircle, XCircle, UserPlus, DollarSign, Check, Minus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminGamesTab } from "@/components/AdminGamesTab";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { TIMEZONES } from "@/lib/timezones";

function SentinelAdminAudit({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loading) cbRef.current(); },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading]);
  return (
    <div ref={ref} className="flex justify-center py-3">
      {loading && <Loader2 className="w-4 h-4 text-[#a1a1aa] animate-spin" />}
    </div>
  );
}

export function AdminPanelView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as "servers" | "users" | "audit" | "games" | "infra" | "database" | "cron" | "deleted" | "payments" | null;
  const [tab, setTabState] = useState<"servers" | "users" | "audit" | "games" | "infra" | "database" | "cron" | "deleted" | "payments">(
    tabParam || "infra"
  );

  const setTab = (t: "servers" | "users" | "audit" | "games" | "infra" | "database" | "cron" | "deleted" | "payments") => {
    setTabState(t);
    const params = new URLSearchParams(searchParams);
    params.set("tab", t);
    setSearchParams(params, { replace: true });
  };

  const { setCurrentServer, currentServer } = useServer();
  const { userRole, user, signOut } = useAuth();
  const { toast } = useToast();
  const { timezone, setTimezone } = useUserTimezone(currentServer?.timezone);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userServers, setUserServers] = useState<Record<string, { server_id: string; server_name: string; role: string }[]>>({});
  const [liveUptime, setLiveUptime] = useState("");
  const [loadingServers, setLoadingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [forceSpawning, setForceSpawning] = useState<string | null>(null);
  const [forceSpawnConfirm, setForceSpawnConfirm] = useState<{ serverId: string; serverName: string } | null>(null);
  const [extendConfirm, setExtendConfirm] = useState<{ serverId: string; serverName: string } | null>(null);
  const [extending, setExtending] = useState(false);
  const [subOverrides, setSubOverrides] = useState<Record<string, string>>({});
  const expandedRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const [forceSpawnInput, setForceSpawnInput] = useState("");
  const [serverStats, setServerStats] = useState<Record<string, any>>({});
  const [auditServerFilter, setAuditServerFilter] = useState<string>("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  
  // Audit action filters (same pattern as activity log in ServerSettingsView)
  const allAuditActions = useMemo(() =>
    AUDIT_ACTION_GROUPS.flatMap(g => g.actions) as string[],
  []);
  const [auditActionFilters, setAuditActionFilters] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("rs_admin_audit_filters");
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        return new Set(arr.filter(a => allAuditActions.includes(a)));
      }
    } catch {}
    return new Set(allAuditActions);
  });
  const [auditFilterMode, setAuditFilterMode] = useState<"simple" | "advanced">(() => {
    return (localStorage.getItem("rs_admin_audit_filter_mode") as "simple" | "advanced") || "simple";
  });
  const [auditFiltersExpanded, setAuditFiltersExpanded] = useState(() => {
    return localStorage.getItem("rs_admin_audit_filters_expanded") !== "false";
  });
  const [auditFilterVersion, setAuditFilterVersion] = useState(0);

  const saveAuditFilters = (filters: Set<string>) => {
    try { localStorage.setItem("rs_admin_audit_filters", JSON.stringify([...filters])); } catch {}
    setAuditActionFilters(() => new Set(filters));
    setAuditFilterVersion(v => v + 1);
  };

  const toggleAuditAction = (action: string) => {
    setAuditActionFilters(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
      try { localStorage.setItem("rs_admin_audit_filters", JSON.stringify([...next])); } catch {}
      return next;
    });
    setAuditFilterVersion(v => v + 1);
  };

  const clearAuditFilters = () => {
    try { localStorage.setItem("rs_admin_audit_filters", "[]"); } catch {}
    setAuditActionFilters(new Set());
    setAuditFilterVersion(v => v + 1);
  };

  const checkAllAudit = () => {
    saveAuditFilters(new Set(allAuditActions));
  };

  const [auditCursor, setAuditCursor] = useState<number | null>(null);
  const [auditLogAccum, setAuditLogAccum] = useState<any[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [serverFilter, setServerFilter] = useState<"all" | "bot">("all");
  const [serverSearch, setServerSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "owner" | "moderator" | "member">("all");
  const [deletedSearch, setDeletedSearch] = useState("");
  const [restoreConfirm, setRestoreConfirm] = useState<{ id: string; name: string } | null>(null);
  const [modEmailByServer, setModEmailByServer] = useState<Record<string, string>>({});
  const [addingModForServer, setAddingModForServer] = useState<Record<string, boolean>>({});

  const handleForceSpawn = async () => {
    if (!forceSpawnConfirm) return;
    const { serverId, serverName } = forceSpawnConfirm;
    setForceSpawnConfirm(null);
    setForceSpawnInput("");
    setForceSpawning(serverId);
    try {
      const { data, error } = await supabase.rpc("admin_forcespawn_all", { p_server_id: serverId });
      if (error) throw error;
      writeAuditEntry({ action: AuditAction.FORCE_SPAWN, server_id: serverId, details: { server_name: serverName, boss_count: data } });
      toast("success", `Force-spawned ${data} bosses in "${serverName}".`);
    } catch (err: any) {
      toast("error", err?.message || "Force spawn failed.");
    } finally {
      setForceSpawning(null);
    }
  };
  const [restoreInput, setRestoreInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();
  const logScrollRef = useRef<HTMLDivElement>(null);
  const [maintenance, setMaintenance] = useState(false);
  const now = new Date();
  const [maintEndDate, setMaintEndDate] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
  const [maintEndTime, setMaintEndTime] = useState(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);

  // Redirect non-admin users
  useEffect(() => {
    if (userRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [userRole, navigate]);

  useEffect(() => {
    supabase.from("app_settings").select("value")
      .eq("key", "maintenance_mode").maybeSingle()
      .then(({ data }) => setMaintenance((data as any)?.value === "true"));
  }, []);

  // Always call hooks at the top level
  const { data: servers = [], isLoading: srvLoading } = useQuery({
    queryKey: ["admin", "servers"],
    queryFn: fetchAllServers,
    staleTime: 30_000,
    enabled: userRole === "admin",
  });

  const { data: users = [], isLoading: usrLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAllUsers,
    staleTime: 10_000,
    enabled: userRole === "admin",
  });

  // Fetch server owners and moderators for user role filtering (uses SECURITY DEFINER RPC to bypass RLS)
  const { data: serverRoles = { owners: new Set<string>(), moderators: new Set<string>() } } = useQuery({
    queryKey: ["admin", "server-roles"],
    queryFn: async () => {
      const owners = new Set<string>();
      const moderators = new Set<string>();

      const { data, error } = await supabase.rpc("get_all_admin_roles");
      if (error) { console.error("[admin] get_all_admin_roles error:", error.message); }
      if (data) {
        for (const r of data as any[]) {
          if (r.role === "owner") owners.add(r.user_id);
          else if (r.role === "moderator") moderators.add(r.user_id);
        }
      }

      console.log("[admin] server roles:", { owners: owners.size, moderators: moderators.size });
      return { owners, moderators };
    },
    staleTime: 30_000,
    enabled: userRole === "admin",
  });

  // Payments — cross-server purchase history
  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["admin", "payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    enabled: userRole === "admin",
  });

  const { data: dbStats, isLoading: dbLoading } = useQuery({
    queryKey: ["admin", "database"],
    queryFn: fetchDatabaseStats,
    staleTime: 30_000,
    enabled: userRole === "admin" && tab === "database",
  });

  const { data: planUsage, isLoading: planLoading } = useQuery({
    queryKey: ["admin", "plan"],
    queryFn: fetchPlanUsage,
    staleTime: 30_000,
    enabled: userRole === "admin" && tab === "database",
  });

  const { data: cronStatus, isLoading: cronLoading } = useQuery({
    queryKey: ["admin", "cron"],
    queryFn: fetchCronStatus,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: userRole === "admin" && tab === "cron",
  });

  const isLocalOrStaging = import.meta.env.DEV || (typeof window !== "undefined" && (window.location.hostname.includes("staging") || window.location.hostname.endsWith(".vercel.app")));
  const FLY_REGIONS: Record<string, string> = {
    ams: "🇳🇱 Netherlands", arn: "🇸🇪 Sweden", atl: "🇺🇸 Atlanta", bog: "🇨🇴 Colombia",
    bos: "🇺🇸 Boston", cdg: "🇫🇷 France", den: "🇺🇸 Denver", dfw: "🇺🇸 Dallas",
    ewr: "🇺🇸 New Jersey", fra: "🇩🇪 Germany", gru: "🇧🇷 Brazil", hkg: "🇭🇰 Hong Kong",
    iad: "🇺🇸 Virginia", jnb: "🇿🇦 South Africa", lax: "🇺🇸 Los Angeles",
    lhr: "🇬🇧 London", maa: "🇮🇳 Chennai", mad: "🇪🇸 Madrid", mia: "🇺🇸 Miami",
    nrt: "🇯🇵 Tokyo", ord: "🇺🇸 Chicago", otp: "🇷🇴 Romania", sea: "🇺🇸 Seattle",
    sin: "🇸🇬 Singapore", syd: "🇦🇺 Sydney", waw: "🇵🇱 Poland", yul: "🇨🇦 Montreal",
    yyz: "🇨🇦 Toronto",
  };
  const BOT_URL = isLocalOrStaging ? "https://raidscout-staging.fly.dev" : "https://raidscout-bot.fly.dev";
  const { data: botStatus, isLoading: botLoading, refetch: refetchBot } = useQuery({
    queryKey: ["admin", "bot"],
    queryFn: async () => {
      const res = await fetch(`${BOT_URL}/status`);
      if (!res.ok) throw new Error("Bot unreachable");
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: userRole === "admin" && tab === "infra",
  });

  // Live uptime counter
  const uptimeBaseRef = useRef(0);
  const uptimeFetchedRef = useRef(0);
  useEffect(() => {
    if (!botStatus?.uptime_display) return;
    const h = parseInt(((botStatus.uptime_display as string).match(/(\d+)h/) || [])[1] || "0");
    const m = parseInt(((botStatus.uptime_display as string).match(/(\d+)m/) || [])[1] || "0");
    const s = parseInt(((botStatus.uptime_display as string).match(/(\d+)s/) || [])[1] || "0");
    uptimeBaseRef.current = h * 3600 + m * 60 + s;
    uptimeFetchedRef.current = Date.now();
  }, [botStatus?.uptime_display]);

  useEffect(() => {
    if (tab !== "infra") return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - uptimeFetchedRef.current) / 1000);
      const total = uptimeBaseRef.current + elapsed;
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      setLiveUptime(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tab, botStatus?.uptime_display]);

  const { data: botLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["admin", "bot", "logs"],
    queryFn: async () => {
      const res = await fetch(`${BOT_URL}/logs?limit=100`);
      if (!res.ok) throw new Error("Logs unreachable");
      return res.json();
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
    enabled: userRole === "admin" && tab === "infra",
  });

  // Auto-scroll terminal to top (latest logs first) when new logs arrive
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = 0;
    }
  }, [botLogs]);

  const { data: deletedServers = [], isLoading: deletedLoading, refetch: refetchDeleted } = useQuery({
    queryKey: ["admin", "deleted"],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("id, name, owner_id, deleted_at, created_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      return data || [];
    },
    staleTime: 15_000,
    enabled: userRole === "admin" && tab === "deleted",
  });

  const { data: auditLogRaw = [], isLoading: auditLoading } = useQuery({
    queryKey: ["admin", "audit", auditServerFilter, String(auditFilterVersion)],
    queryFn: async () => {
      const serverId = auditServerFilter !== "all" ? auditServerFilter : null;
      const result = await fetchAuditLog(50, serverId, null, null);
      return result;
    },
    staleTime: 15_000,
    enabled: userRole === "admin" && tab === "audit",
  });

  // Reset accumulator and cursor when filters change
  useEffect(() => {
    setAuditCursor(null);
    setAuditLogAccum([]);
    setAuditHasMore(false);
  }, [auditServerFilter, auditFilterVersion]);

  // Client-side filter audit log by selected actions + search
  const auditLog = useMemo(() => {
    const source = auditCursor ? auditLogAccum : auditLogRaw;
    let filtered = auditActionFilters.size === 0 || auditActionFilters.size === allAuditActions.length
      ? source
      : source.filter((e: any) => auditActionFilters.has(e.action));
    if (auditSearchQuery) {
      const q = auditSearchQuery.toLowerCase();
      filtered = filtered.filter((e: any) => {
        const fl = (action: string): string => action?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? action ?? "";
        if (fl(e.action).toLowerCase().includes(q)) return true;
        const actor = e.actor_email || e.details?.discord_user || "";
        if (actor.toLowerCase().includes(q)) return true;
        if (e.details?.server_name && String(e.details.server_name).toLowerCase().includes(q)) return true;
        const d = e.details || {};
        for (const v of Object.values(d)) {
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    return filtered;
  }, [auditLogRaw, auditLogAccum, auditCursor, auditActionFilters, allAuditActions, auditSearchQuery]);

  // Set hasMore when raw data arrives (no cursor = fresh fetch)
  useEffect(() => {
    if (auditLogRaw.length > 0 && !auditCursor) {
      setAuditHasMore(auditLogRaw.length >= 50);
    }
  }, [auditLogRaw, auditCursor]);

  const handleLoadMoreAudit = async () => {
    if (auditLoadingMore || !auditHasMore) return;
    const source = auditCursor ? auditLogAccum : auditLogRaw;
    const lastEntry = source[source.length - 1];
    if (!lastEntry?.id) return;
    const newCursor = lastEntry.id;
    setAuditLoadingMore(true);
    try {
      const serverId = auditServerFilter !== "all" ? auditServerFilter : null;
      const more = await fetchAuditLog(50, serverId, newCursor, null);
      setAuditHasMore(more.length >= 50);
      setAuditCursor(newCursor);
      setAuditLogAccum(prev => [...prev, ...more]);
    } catch { /* ignore */ }
    finally { setAuditLoadingMore(false); }
  };

  // Load stats for all servers when bot filter is active
  useEffect(() => {
    if (serverFilter !== "bot" || tab !== "servers") return;
    const nonTestServers = servers.filter((s: any) => !s.name.toLowerCase().includes('test') && !s.deleted_at);
    nonTestServers.forEach((s: any) => {
      if (!serverStats[s.id]) {
        fetchServerStats(s.id).then(stats => {
          setServerStats(prev => ({ ...prev, [s.id]: stats }));
        }).catch(() => {
          setServerStats(prev => ({ ...prev, [s.id]: { error: true } }));
        });
      }
    });
  }, [serverFilter, tab, servers]);

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Top bar */}
      <div className="w-full border-b border-[#1e1e2a] bg-[#0d0d11]/80 backdrop-blur-xl">
        <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-4 h-14 flex items-center">
          {/* Left: Logo + Admin badge */}
          <div className="flex items-center gap-3 flex-1">
            <span className="font-bold text-[#fafafa]">RaidScout</span>
            <span className="text-xs bg-[#1e1e2a] text-[#a1a1aa] px-2 py-0.5 rounded">Admin</span>
          </div>

          {/* Center: Timezone */}
          <div className="flex items-center gap-1.5 text-xs text-[#52525b] shrink-0">
            <Globe className="w-3.5 h-3.5" />
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="bg-[#0d0d11] border border-[#1e1e2a] rounded px-2 py-1 text-[#d4d4d8] text-xs focus:outline-none focus:ring-1 focus:ring-violet-500/30"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value} className="bg-[#0d0d11]">{tz.label}</option>
              ))}
            </select>
          </div>

          {/* Right: User menu */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-1 text-[#a1a1aa] hover:text-[#fafafa] text-sm transition p-1.5 rounded-md hover:bg-[#1e1e2a]" title="Menu">
                <span className="text-xs hidden md:block">{user?.email?.split("@")[0]}</span>
                <ChevronDown className={`w-3 h-3 transition ${showUserMenu ? "rotate-180" : ""}`} />
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-[#0d0d11] border border-[#1e1e2a] rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1e1e2a]">
                      <div className="text-sm font-semibold text-[#fafafa]">{user?.email?.split("@")[0]}</div>
                      <div className="text-xs text-[#52525b]">{user?.email}</div>
                    </div>
                    <div className="py-1">
                      <button onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-[#d4d4d8] hover:bg-[#1e1e2a] transition">
                        <LogOut className="w-4 h-4" /> Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 flex-1 overflow-x-hidden min-w-0 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#0d0d11] border border-[#1e1e2a]">
          <Shield className="w-5 h-5 text-[#fafafa]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#fafafa]">Admin Panel</h2>
          <p className="text-sm text-[#52525b]">Oversee all servers and users</p>
        </div>
      </div>

      {/* Layout: Sidebar + Content */}
      <div className="flex gap-4 items-start">
        {/* Sidebar — vertical tab list */}
        <div className="hidden md:flex flex-col w-44 shrink-0 bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-1 gap-0.5 sticky top-4">
          {([
            { id: "infra", icon: Radio, label: "Infra" },
            { id: "games", icon: Gamepad2, label: "Games" },
            { id: "servers", icon: Server, label: `Servers (${servers.length})` },
            { id: "users", icon: Users, label: `Users (${users.length})` },
            { id: "audit", icon: ScrollText, label: "Audit" },
            { id: "database", icon: HardDrive, label: "Database" },
            { id: "cron", icon: Clock, label: "Test Cron" },
            { id: "deleted", icon: Trash2, label: "Deleted" },
            { id: "payments", icon: DollarSign, label: "Payments" },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition text-left ${tab === id ? "bg-[#1e1e2a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[#1e1e2a]/50"}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">

      {/* Servers Tab */}
      {tab === "servers" && (
        <div className="space-y-2">
          {srvLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : servers.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No servers yet.</p>
          ) : (
            (() => {
              const testServers = servers.filter((s: any) => s.name.toLowerCase().includes('test') && !s.deleted_at);
              let regularServers = servers.filter((s: any) => !s.name.toLowerCase().includes('test') && !s.deleted_at);
              // Apply search filter
              if (serverSearch) {
                regularServers = regularServers.filter((s: any) => s.name.toLowerCase().includes(serverSearch.toLowerCase()));
              }
              // Apply bot alerts filter — only show servers with known webhook status ON
              if (serverFilter === "bot") {
                regularServers = regularServers.filter((s: any) => {
                  const stats = serverStats[s.id];
                  return stats && !(stats as any).error && (stats as any).has_webhook;
                });
              }

              const renderServer = (s: any) => {
              const isExpanded = expandedServer === s.id;
              const stats = serverStats[s.id];
              // Compute subscription status — shared between header badge and expanded detail
              const now = new Date();
              const effectiveSubEnd = subOverrides[s.id] ?? s.subscription_ends_at;
              const subEnd = effectiveSubEnd ? new Date(effectiveSubEnd) : null;
              const subDays = subEnd ? Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
              const trialEnd = s.trial_ends_at ? new Date(s.trial_ends_at) : null;
              const trialDays = trialEnd ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
              const isActive = subDays > 0;
              const isTrialing = !isActive && trialDays > 0;
              const isExpired = !isActive && !isTrialing;
              const subBadge = isActive
                ? { cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", label: `${subDays}d` }
                : isTrialing
                ? { cls: "bg-amber-500/10 text-amber-300 border-amber-500/20", label: `Trial ${trialDays}d` }
                : { cls: "bg-red-500/10 text-red-300 border-red-500/20", label: "Expired" };
              return (
              <div key={s.id} ref={expandedServer === s.id ? expandedRef : undefined} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
                <button
                  onClick={async () => {
                    if (isExpanded) {
                      setExpandedServer(null);
                    } else {
                      setExpandedServer(s.id);
                      if (!serverStats[s.id]) {
                        try {
                          const stats = await fetchServerStats(s.id);
                          setServerStats(prev => ({ ...prev, [s.id]: stats }));
                        } catch { setServerStats(prev => ({ ...prev, [s.id]: { error: true } })); }
                      }
                    }
                  }}
                  className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-[#0d0d11]/50 transition text-left"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[#fafafa] truncate">{s.name}</h4>
                      {!isExpanded && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${subBadge.cls} shrink-0`}>
                          {subBadge.label}
                        </span>
                      )}
                      {s.game_name && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#a1a1aa] bg-[#27272a] shrink-0">
                          {s.game_icon_url ? (
                            <img src={s.game_icon_url} alt="" className="w-3 h-3 rounded object-cover" />
                          ) : (
                            <Gamepad2 className="w-3 h-3" />
                          )}
                          {s.game_name}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#71717a] font-mono">{s.id?.substring(0, 12)}...</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0d0d11] text-[11px] text-[#d4d4d8]">
                      <Users className="w-3.5 h-3.5" />
                      {s.raid_member_count ?? 0}
                    </span>
                    <div className="hidden sm:block text-right">
                      <p className="text-[10px] text-[#a1a1aa]">Created {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#a1a1aa]" /> : <ChevronDown className="w-4 h-4 text-[#a1a1aa]" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-[#1e1e2a] px-4 py-3 space-y-3">
                    {!stats ? (
                      <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
                    ) : (stats as any).error ? (
                      <p className="text-xs text-[#f87171]">Failed to load stats</p>
                    ) : (
                      <>
                        {/* Telemetry Deck — pure typography, no colored boxes */}
                        <div className="grid grid-cols-5 gap-4">
                          <div className="text-center">
                            <p className="text-lg font-bold text-[#fafafa] tabular-nums">{stats.total_raid_members ?? 0}</p>
                            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Players</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-[#fafafa] tabular-nums">{stats.member_count ?? 0}</p>
                            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Mods</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-[#fafafa] tabular-nums">{stats.boss_count ?? 0}</p>
                            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Bosses</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-[#fafafa] tabular-nums">{stats.death_count ?? 0}</p>
                            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Kills</p>
                          </div>
                          <div className="text-center">
                            <p className={`text-lg font-bold tabular-nums ${stats.has_webhook ? 'text-emerald-300' : 'text-[#71717a]'}`}>
                              {stats.has_webhook ? 'ON' : 'OFF'}
                            </p>
                            <p className={`text-[10px] uppercase tracking-wider ${stats.has_webhook ? 'text-emerald-400/60' : 'text-[#52525b]'}`}>Bot Alerts</p>
                          </div>
                        </div>

                        {/* Subscription Status */}
                        <div key={`sub-${s.id}-${effectiveSubEnd ?? 'none'}`} className="border-t border-[#1e1e2a] pt-3">
                          <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-2">Subscription</p>
                          <div className="flex items-center gap-4">
                            {isActive ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                  ● Active — {subDays}d remaining
                                </span>
                                <span className="text-[10px] text-[#52525b]">Until {subEnd!.toLocaleDateString()}</span>
                              </>
                            ) : isTrialing ? (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  ● Trial — {trialDays}d remaining
                                </span>
                                <span className="text-[10px] text-[#52525b]">Until {trialEnd!.toLocaleDateString()}</span>
                              </>
                            ) : (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-red-500/10 text-red-300 border border-red-500/20">
                                  ● Expired
                                </span>
                                {subEnd && <span className="text-[10px] text-[#52525b]">Ended {subEnd.toLocaleDateString()}</span>}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Guild Tags — monochrome text, 40% opacity for zero-count */}
                        {stats.guild_members && stats.guild_members.length > 0 && (
                          <div className="border-t border-[#1e1e2a] pt-3">
                            <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-2">
                              Players by Guild <span className="text-[#52525b]">({stats.total_raid_members ?? 0} total)</span>
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {stats.guild_members.map((g: any) => {
                                const isEmpty = g.count === 0;
                                return (
                                <span key={g.guild}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border transition ${
                                    isEmpty
                                      ? 'border-[#1e1e2a] text-[#52525b] opacity-40'
                                      : 'border-[#3f3f46] text-[#d4d4d8] bg-[#0d0d11]'
                                  }`}
                                >
                                  <span className="truncate max-w-[140px]">{g.guild}</span>
                                  <span className="tabular-nums font-semibold">{g.count}</span>
                                </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* View Server + Extend Sub + Force Spawn All buttons */}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#1e1e2a]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setForceSpawnConfirm({ serverId: s.id, serverName: s.name });
                              setForceSpawnInput("");
                            }}
                            disabled={forceSpawning === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 transition disabled:opacity-50"
                          >
                            {forceSpawning === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Force Spawn All
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExtendConfirm({ serverId: s.id, serverName: s.name });
                            }}
                            disabled={extending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition disabled:opacity-50"
                          >
                            {extending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                            Extend +30d
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentServer({
                                id: s.id,
                                name: s.name,
                                owner_id: s.owner_id,
                                invite_code: s.invite_code || (s.id?.substring(0, 8) ?? ""),
                                created_at: s.created_at,
                                timezone: s.timezone || 'Asia/Manila',
                                role: "owner" as const,
                              });
                              queueMicrotask(() => navigate("/"));
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#3f3f46] text-[#d4d4d8] hover:bg-[#0d0d11] hover:border-[#52525b] transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Server
                          </button>
                        </div>

                        {/* Add Moderator — inline */}
                        <div className="flex items-center gap-2 pt-2 border-t border-[#1e1e2a]">
                          <span className="text-[10px] text-[#71717a] uppercase tracking-wider shrink-0">Add Mod:</span>
                          <input
                            type="email"
                            value={modEmailByServer[s.id] ?? ""}
                            onChange={(e) => setModEmailByServer(prev => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="user@email.com"
                            onKeyDown={async (e) => {
                              if (e.key !== "Enter") return;
                              const email = (modEmailByServer[s.id] ?? "").trim();
                              if (!email) return;
                              setAddingModForServer(prev => ({ ...prev, [s.id]: true }));
                              try {
                                await addServerModerator(s.id, email);
                                setModEmailByServer(prev => ({ ...prev, [s.id]: "" }));
                                toast("success", `Moderator added to ${s.name}`);
                              } catch (err: any) {
                                toast("error", err?.message ?? "Failed to add moderator");
                              } finally {
                                setAddingModForServer(prev => ({ ...prev, [s.id]: false }));
                              }
                            }}
                            className="flex-1 bg-[#09090b] border border-[#1e1e2a] rounded-lg px-2.5 py-1.5 text-[11px] text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
                          />
                          <button
                            onClick={async () => {
                              const email = (modEmailByServer[s.id] ?? "").trim();
                              if (!email) return;
                              setAddingModForServer(prev => ({ ...prev, [s.id]: true }));
                              try {
                                await addServerModerator(s.id, email);
                                setModEmailByServer(prev => ({ ...prev, [s.id]: "" }));
                                toast("success", `Moderator added to ${s.name}`);
                              } catch (err: any) {
                                toast("error", err?.message ?? "Failed to add moderator");
                              } finally {
                                setAddingModForServer(prev => ({ ...prev, [s.id]: false }));
                              }
                            }}
                            disabled={(addingModForServer[s.id] ?? false) || !(modEmailByServer[s.id] ?? "").trim()}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50 shrink-0"
                          >
                            {addingModForServer[s.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                            Add
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              );
              };

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">
                      Servers ({regularServers.length})
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
                        <input
                          type="text"
                          placeholder="Search servers…"
                          value={serverSearch}
                          onChange={e => setServerSearch(e.target.value)}
                          className="w-36 pl-7 pr-2 py-1 text-[10px] bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                        />
                      </div>
                      <span className="text-[10px] text-[#71717a]">Filter:</span>
                      <button onClick={() => setServerFilter("all")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${serverFilter === "all" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa]"}`}>
                        All
                      </button>
                      <button onClick={() => setServerFilter("bot")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition flex items-center gap-1 ${serverFilter === "bot" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa]"}`}>
                        <Radio className="w-3 h-3" /> Bot Alerts
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const byGame = new Map<string, any[]>();
                      for (const s of regularServers) {
                        const key = (s as any).game_name || "Custom";
                        if (!byGame.has(key)) byGame.set(key, []);
                        byGame.get(key)!.push(s);
                      }
                      const sorted = [...byGame.entries()].sort(([a], [b]) => a === "Custom" ? 1 : b === "Custom" ? -1 : a.localeCompare(b));
                      return sorted.map(([game, svrs]) => (
                        <div key={game}>
                          <h5 className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <Gamepad2 className="w-3 h-3" /> {game} ({svrs.length})
                          </h5>
                          <div className="space-y-1.5 ml-2">
                            {svrs.map(renderServer)}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  {testServers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Test Servers ({testServers.length})
                      </h4>
                      <div className="space-y-2">
                        {testServers.map(renderServer)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Users Tab */}
      {tab === "users" && (() => {
        const { owners, moderators } = serverRoles;
        const filteredUsers = users.filter((u: any) => {
          // Search filter
          if (userSearch && !(u.email || "").toLowerCase().includes(userSearch.toLowerCase()) && !(u.user_id || "").toLowerCase().includes(userSearch.toLowerCase())) return false;
          // Role filter
          if (userRoleFilter === "owner" && !owners.has(u.user_id)) return false;
          if (userRoleFilter === "moderator" && !moderators.has(u.user_id)) return false;
          if (userRoleFilter === "member" && (owners.has(u.user_id) || moderators.has(u.user_id))) return false;
          return true;
        });
        return (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">
              Users ({filteredUsers.length}{userSearch || userRoleFilter !== "all" ? ` / ${users.length}` : ""})
            </h4>
            <div className="flex items-center gap-2">
              <select
                value={userRoleFilter}
                onChange={e => setUserRoleFilter(e.target.value as any)}
                className="w-32 pl-2 pr-2 py-1.5 text-xs bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] focus:outline-none focus:border-[#52525b]"
              >
                <option value="all">All Roles</option>
                <option value="owner">Server Owners</option>
                <option value="moderator">Moderators</option>
                <option value="member">Members Only</option>
              </select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
                <input
                  type="text"
                  placeholder="Search by email…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-40 pl-7 pr-2 py-1.5 text-xs bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                />
              </div>
            </div>
          </div>
          {usrLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No users registered.</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No users match "{userSearch}".</p>
          ) : (
            <div className="border border-[#1e1e2a] rounded-xl overflow-hidden">
              {/* Table Header — hidden on mobile */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-[#1e1e2a] bg-[#0d0d11]/50 text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">
                <div className="col-span-3">Email</div>
                <div className="col-span-2">User ID</div>
                <div className="col-span-2">Verified</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Joined</div>
                <div className="col-span-1"></div>
              </div>
              {/* User Rows */}
              {filteredUsers.map((u: any) => {
                const isExpanded = expandedUser === u.user_id;
                const servers = userServers[u.user_id] ?? [];
                return (
                <div key={u.user_id}>
                  <button
                    onClick={async () => {
                      if (isExpanded) {
                        setExpandedUser(null);
                      } else {
                        setExpandedUser(u.user_id);
                        if (!userServers[u.user_id]) {
                          setLoadingServers(true);
                          const { data } = await supabase.rpc("get_user_servers", { user_id_input: u.user_id });
                          setUserServers(prev => ({ ...prev, [u.user_id]: (data as any[]) ?? [] }));
                          setLoadingServers(false);
                        }
                      }
                    }}
                    className="w-full grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-[#0d0d11]/30 transition text-left border-b border-[#1e1e2a]/50 last:border-b-0"
                  >
                    <div className="col-span-3 min-w-0">
                      <span className="text-sm text-[#fafafa] font-medium truncate block">{u.email ?? "No email"}</span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <code className="text-[10px] text-[#52525b] font-mono truncate block">{u.user_id?.substring(0, 12)}...</code>
                    </div>
                    <div className="col-span-2">
                      {(() => {
                        const confirmedAt = u.email_confirmed_at;
                        const createdAt = u.created_at;
                        if (confirmedAt && createdAt && Math.abs(new Date(confirmedAt).getTime() - new Date(createdAt).getTime()) > 10_000) {
                          return <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Verified</span>;
                        }
                        return <span className="text-[10px] text-[#71717a] flex items-center gap-1"><XCircle className="w-3 h-3" /> Unverified</span>;
                      })()}
                    </div>
                    <div className="col-span-2">
                      {(() => {
                        if (u.role === "admin") return <span className="text-[10px] text-amber-400 font-medium">Admin</span>;
                        if (owners.has(u.user_id)) return <span className="text-[10px] text-emerald-400 font-medium">Owner</span>;
                        if (moderators.has(u.user_id)) return <span className="text-[10px] text-sky-400 font-medium">Mod</span>;
                        return <span className="text-[10px] text-[#71717a]">Member</span>;
                      })()}
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-[#71717a]">{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="col-span-1 text-right">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#71717a] ml-auto" /> : <ChevronDown className="w-4 h-4 text-[#71717a] ml-auto" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[#1e1e2a] px-4 py-3 space-y-2 bg-[#09090b]/50">
                      <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Servers</p>
                      {loadingServers ? (
                        <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
                      ) : servers.length === 0 ? (
                        <p className="text-xs text-[#71717a]">No servers.</p>
                      ) : (
                        [...servers].sort((a, b) => ((a as any).game_name || "ZZZ").localeCompare((b as any).game_name || "ZZZ")).map((s) => (
                          <div key={s.server_id} className="flex items-center justify-between bg-[#0d0d11] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Server className="w-3.5 h-3.5 text-[#71717a]" />
                              <span className="text-sm text-[#fafafa] font-medium">{s.server_name}</span>
                              <span className="text-[10px] text-[#71717a]">{s.role}</span>
                            </div>
                            <button
                              onClick={() => {
                                setCurrentServer({ id: s.server_id, name: s.server_name, owner_id: u.user_id, invite_code: s.server_id?.substring(0, 8) ?? "", created_at: (s as any).created_at, role: s.role as "owner" | "moderator" });
                                navigate("/");
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[#0d0d11] border border-[#1e1e2a] text-[#fafafa] hover:bg-[#27272a] transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* Audit Log Tab */}
      {tab === "audit" && (() => {
        const serverMap: Record<string, string> = {};
        for (const s of servers) {
          serverMap[s.id] = s.name;
        }

        // Dynamic action display helpers
        const formatActionLabel = (action: string): string => {
          return (action ?? "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase());
        };
        const actionColor = (action: string): { dot: string; text: string } => {
          if (action.includes("delete") || action.includes("remove")) return { dot: "bg-red-400", text: "text-red-300" };
          if (action.includes("create") || action.includes("add")) return { dot: "bg-emerald-400", text: "text-emerald-300" };
          if (action.includes("transfer") || action.includes("ownership")) return { dot: "bg-violet-400", text: "text-violet-300" };
          if (action.includes("kill") || action.includes("death")) return { dot: "bg-rose-400", text: "text-rose-300" };
          if (action.includes("force") || action.includes("maintenance")) return { dot: "bg-amber-400", text: "text-amber-300" };
          if (action.includes("update") || action.includes("edit") || action.includes("setting")) return { dot: "bg-[#71717a]", text: "text-[#a1a1aa]" };
          if (action.includes("finalize")) return { dot: "bg-sky-400", text: "text-sky-300" };
          if (action.includes("extend") || action.includes("subscription")) return { dot: "bg-cyan-400", text: "text-cyan-300" };
          return { dot: "bg-[#52525b]", text: "text-[#a1a1aa]" };
        };

        const formatDetails = (entry: any): string => {
          const d = entry.details || {};
          const fmtTime = (iso: string) => {
            try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
            catch { return iso; }
          };
          switch (entry.action) {
            case "boss_kill": return `${d.boss_name || "?"} — ${d.attendees ?? 0} attendees${d.guild ? ` (${d.guild})` : ""}`;
            case "attendance_copy": return `Copied ${d.copied ?? 0} from ${d.from_boss || "?"}${d.from_time ? ` (${d.from_time})` : ""} → ${d.to_boss || "?"}${d.to_time ? ` (${d.to_time})` : ""}${d.skipped ? ` (${d.skipped} skipped)` : ""}`;
            case "attendance_add": return `${d.member_name || "?"} attended ${d.boss_name || "?"}${d.death_time ? ` (${fmtTime(d.death_time)})` : ""}`;
            case "attendance_remove": return `${d.member_name || "?"} removed from ${d.boss_name || "?"}${d.death_time ? ` (${fmtTime(d.death_time)})` : ""}`;
            case "member_cp_add": case "member_cp_update": return `${d.player_name || "?"}: ${d.old_cp != null ? Number(d.old_cp).toLocaleString() : "—"} → ${d.new_cp != null ? Number(d.new_cp).toLocaleString() : "?"}${d.date ? ` · ${new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`;
            case "member_cp_delete": return `Deleted CP update for ${d.player_name || "?"}`;
            case "member_cp_reminder": return `CP update reminder sent to Discord`;
            case "member_add": return d.member_name || "—";
            case "member_remove": return d.member_name || "Member removed";
            case "member_note_add": return d.note_preview || "—";
            case "member_note_delete": return "Deleted note";
            case "moderator_add": return d.target_email || "Moderator added";
            case "moderator_remove": return d.target_email || "Moderator removed";
            case "ownership_transfer": return "Owner changed";
            case "boss_toggle": return `${d.boss_name || "?"} ${d.enabled ? "enabled" : "disabled"}`;
            case "boss_create": case "boss_update": return `${d.boss_name || d.name || "—"}${d.spawn_type ? ` · ${d.spawn_type}` : ""}${d.respawn_hours ? ` · ${d.respawn_hours}h` : ""}${d.points != null ? ` · ${d.points}pts` : ""}${d.changes ? ` · ${d.changes}` : ""}`;
            case "boss_delete": return d.boss_name || d.name || "—";
            case "boss_time_edit": return `${d.boss_name || d.activity_name || "?"}: ${d.old_time && d.new_time ? `${d.old_time} → ${d.new_time}` : d.new_time ? `changed to ${d.new_time}` : "time changed"}${d.direction ? ` (${d.direction > 0 ? "+" : ""}${d.direction})` : ""}`;
            case "boss_rotation_advance": return `${d.boss_name || "?"}: rotation advanced${d.target_guild ? ` to ${d.target_guild}` : ""}${d.mode ? ` (${d.mode})` : ""}`;
            case "boss_guilds_set": return `Boss guilds updated${d.boss_name ? ` for "${d.boss_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
            case "death_guild_set": return `${d.boss_name || "?"}: guild changed from ${d.old_guild || "?"} to ${d.new_guild || "?"}`;
            case "death_guild_clear": return `${d.boss_name || "?"}: display guild cleared`;
            case "death_time_edit": return `${d.boss_name || "?"}: death time edited${d.new_time ? ` (${fmtTime(d.new_time)})` : ""}`;
            case "party_leaders_set": return `Party leaders set for ${d.boss_name || "?"}: ${d.leaders || "—"}`;
            case "boss_spawn_set": return `${d.boss_name || "?"}: spawn set to ${d.spawn_date || "?"}`;
            case "activity_toggle": return `${d.activity_name || "?"} ${d.enabled ? "enabled" : "disabled"}`;
            case "activity_create": case "activity_update": return `${d.activity_name || d.name || "—"}${d.schedule_type ? ` · ${d.schedule_type}` : ""}${d.points != null ? ` · ${d.points}pts` : ""}${d.party_size ? ` · ${d.party_size}p` : ""}${d.changes ? ` · ${d.changes}` : ""}`;
            case "activity_delete": return d.activity_name || d.name || "—";
            case "activity_time_edit": return `Activity time edited${d.activity_name ? ` for "${d.activity_name}"` : ""}`;
            case "activity_finalize": case "activity_end_record": return `${d.activity_name || "?"} completed${d.attendees ? ` (${d.attendees} attendees)` : ""}${d.attendee_names ? `: ${d.attendee_names}` : ""}${d.end_time ? ` at ${d.end_time}` : ""}`;
            case "activity_guilds_set": return `Activity guilds updated${d.activity_name ? ` for "${d.activity_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
            case "activity_rotation_advance": return `Activity rotation advanced${d.activity_name ? ` for "${d.activity_name}"` : ""}`;
            case "boss_guild_points_edit": return `${d.boss_name || "?"} · ${d.guild_name || "?"}: points → ${d.points ?? "—"}`;
            case "boss_guild_salary_edit": return `${d.boss_name || "?"} · ${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"}`;
            case "boss_guild_salary_batch": return `${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"} for ${d.boss_count ?? 0} bosses`;
            case "boss_assist_toggle": return `${d.boss_name || "?"}: ${d.assistant_guild || "?"} ${d.added ? "added as" : "removed from"} assist${d.owner_guild ? ` (owner: ${d.owner_guild})` : ""}`;
            case "activity_guild_points_edit": return `${d.activity_name || "?"} · ${d.guild_name || "?"}: points → ${d.points ?? "—"}`;
            case "activity_guild_salary_edit": return `${d.activity_name || "?"} · ${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"}`;
            case "activity_assist_toggle": return `${d.activity_name || "?"}: ${d.assistant_guild || "?"} ${d.added ? "added as" : "removed from"} assist${d.owner_guild ? ` (owner: ${d.owner_guild})` : ""}`;
            case "guild_create": return `Guild "${d.guild_name || "?"}" created`;
            case "guild_update": return `Guild "${d.old_name || "?"}" → "${d.guild_name || "?"}"`;
            case "guild_delete": return `Guild "${d.guild_name || "?"}" deleted`;
            case "gear_equip": return d.changes ? `${d.member_name || "?"} · ${(d.changes as string[]).join(" · ")}` : `${d.member_name || "?"} equipped ${d.item_name || "?"}${d.enhancement ? ` (+${d.enhancement})` : ""}`;
            case "gear_unequip": return `${d.member_name || "?"} unequipped ${d.item_name || "?"}`;
            case "party_assign": return `${d.party_name || "?"}${d.guild_name ? ` (${d.guild_name})` : ""} assigned to ${d.boss_name || d.activity_name || "?"}`;
            case "party_unlink": return `${d.party_name || "?"}${d.guild_name ? ` (${d.guild_name})` : ""} unlinked from ${d.boss_name || "?"}`;
            case "party_create": return `${d.party_name || d.name || "—"}${d.guild_name ? ` · ${d.guild_name}` : ""}${d.member_count ? ` · ${d.member_count} members` : ""}${d.boss_name && d.boss_name !== "—" ? ` · ${d.boss_name}` : ""}`;
            case "party_delete": return d.party_name || "Party deleted";
            case "item_create": return `${d.item_name || d.name || "?"}${d.rarity ? ` · ${d.rarity}` : ""}${d.category ? ` · ${d.category}` : ""}${d.game ? ` · ${d.game}` : ""}${d.description ? ` · ${d.description}` : ""}${d.has_image !== undefined ? (d.has_image ? " · with image" : " · no image") : ""}`;
            case "item_update": case "item_delete": return d.item_name || d.name || "—";
            case "item_distribute": return `${d.item_name || "?"} → ${d.player_name || "?"}${d.quantity ? ` x${d.quantity}` : ""}${d.reason ? ` · ${d.reason}` : ""}`;
            case "force_spawn": return `${d.boss_name || d.activity_name || `${d.boss_count ?? 0} bosses`} in "${d.server_name || "?"}"`;
            case "subscription_extend": return `+${d.days ?? 30} days for "${d.server_name || "?"}"`;
            case "dkp_config_update": return `DKP settings: ${d.enabled !== undefined ? (d.enabled ? "enabled" : "disabled") : ""}${d.dkp_multiplier != null ? ` · ${d.dkp_multiplier}x` : ""}${d.bid_duration_minutes != null ? ` · ${d.bid_duration_minutes}min` : ""}`;
            case "dkp_adjust": return `${d.member_name || "?"}: ${d.amount != null ? (d.amount > 0 ? "+" : "") + d.amount + " DKP" : "?"}`;
            case "maintenance_on": return d.ends_at ? `Until ${new Date(d.ends_at).toLocaleString()}` : "—";
            case "maintenance_off": return "Turned off";
            case "discord_link_add": return `Linked Discord ${d.discord_guild_id || "?"}${d.label ? ` ("${d.label}")` : ""}`;
            case "discord_link_remove": return `Unlinked Discord ${d.discord_guild_id || "?"}`;
            case "discord_link_edit": return `Edited Discord link ${d.discord_guild_id || "?"}`;
            case "discord_channels_set": return `Channels: alert ${d.alert || "—"}, cmd ${d.command || "—"}, progress ${d.progress || "—"}`;
            case "discord_channel_clear": return `Cleared ${d.field || "?"} channel`;
            case "discord_threads_set": return `Threads configured: ${d.guild_count ?? 0} guilds`;
            case "discord_aliases_set": return `${d.count ?? 0} aliases updated`;
            case "discord_ping_set": return `Ping set to "${d.ping || "(default)"}"`;
            case "leaderboard_finalize": return `${d.period || "?"}: ${d.rankings ?? 0} players`;
            case "leaderboard_reset": return `${d.unfinalized ? "Undo finalization" : "Finalized"}${d.guild ? ` (${d.guild})` : ""} · ${d.from ? new Date(d.from).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} → ${d.to ? new Date(d.to).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"}`;
            case "leaderboard_adjust_points": return `${d.member_name ? d.member_name + ": " : ""}${d.points != null ? (d.points > 0 ? "+" : "") + d.points + " pts" : "?"}${d.reason ? ` — ${d.reason}` : ""}`;
            case "leaderboard_reset_guild": return `Guild reset: ${d.deleted_attendance ?? 0} att, ${d.deleted_adjustments ?? 0} adj`;
            case "settings_update": {
              const entries = Object.entries(d).filter(([k]) => k !== "discord_user");
              return entries.map(([k,v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") || "Settings updated";
            }
            case "viewer_edit_toggle": return `Viewer can edit spawns: ${d.enabled ? "ON" : "OFF"}`;
            case "viewer_mark_died_toggle": return `Viewer can mark died: ${d.enabled ? "ON" : "OFF"}`;
            case "server_create": case "server_delete": case "server_restore": return d.server_name || "—";
            case "game_create": case "game_update": case "game_delete": return d.game_name || "—";
            default: return Object.entries(d).filter(([k]) => k !== "discord_user").slice(0, 2).map(([k,v]) => `${k}: ${v}`).join(", ") || "—";
          }
        };

        return (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-2.5 py-1.5 flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
              <input
                type="text"
                placeholder="Search events..."
                value={auditSearchQuery}
                onChange={e => setAuditSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-[#fafafa] outline-none flex-1 placeholder:text-[#52525b]"
              />
              {auditSearchQuery && (
                <button onClick={() => setAuditSearchQuery("")} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
              )}
            </div>
            {servers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#71717a]">Server</span>
                <select value={auditServerFilter} onChange={(e) => setAuditServerFilter(e.target.value)}
                  className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]">
                  <option value="all">All Servers</option>
                  {[...servers].sort((a: any, b: any) => ((a as any).game_name || "ZZZ").localeCompare((b as any).game_name || "ZZZ") || a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <span className="text-xs text-[#52525b] shrink-0">{auditLog.length} event{auditLog.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Action filter — collapsible checkboxes (same pattern as activity log) */}
          <div className="text-[10px]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                {auditFiltersExpanded && (
                  <label className="flex items-center gap-2 px-2 py-1 rounded border border-[#1e1e2a] cursor-pointer hover:border-[#3f3f46] transition">
                    <span className="text-[11px] text-[#a1a1aa]">Simple</span>
                    <div className="relative">
                      <input type="checkbox" checked={auditFilterMode === "advanced"} onChange={() => { const next = auditFilterMode === "simple" ? "advanced" : "simple"; setAuditFilterMode(next); localStorage.setItem("rs_admin_audit_filter_mode", next); }} className="sr-only peer" />
                      <div className="w-7 h-3.5 bg-[#27272a] rounded-full peer-checked:bg-violet-500/50 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-2.5 after:h-2.5 after:bg-[#a1a1aa] after:rounded-full after:transition peer-checked:after:translate-x-3.5 peer-checked:after:bg-violet-300" />
                    </div>
                    <span className="text-[11px] text-[#a1a1aa]">Advanced</span>
                  </label>
                )}
                {auditActionFilters.size < allAuditActions.length ? (
                  <button onClick={checkAllAudit} className="px-2 py-1 rounded border border-violet-500/30 text-[11px] text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition">
                    Check All ({allAuditActions.length - auditActionFilters.size})
                  </button>
                ) : (
                  <button onClick={clearAuditFilters} className="px-2 py-1 rounded border border-[#3f3f46] text-[11px] text-[#71717a] hover:text-[#fafafa] hover:border-[#52525b] transition">
                    Clear Filters
                  </button>
                )}
              </div>
              <button onClick={() => setAuditFiltersExpanded(prev => { const next = !prev; localStorage.setItem("rs_admin_audit_filters_expanded", String(next)); return next; })}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e1e2a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] transition">
                <Eye className="w-3 h-3" />
                <span className="text-xs font-medium">{auditFiltersExpanded ? "Hide Filters" : "Show Filters"}</span>
                <ChevronDown className={`w-3 h-3 transition ${auditFiltersExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>
            {auditFiltersExpanded && (
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                {AUDIT_ACTION_GROUPS.map(g => {
                  const allChecked = g.actions.every(a => auditActionFilters.has(a));
                  const someChecked = g.actions.some(a => auditActionFilters.has(a));
                  return (
                  <div key={g.label} className="flex items-center gap-1.5 flex-wrap">
                    {auditFilterMode === "simple" ? (
                      <button onClick={() => {
                        const next = new Set(auditActionFilters);
                        if (allChecked) { g.actions.forEach(a => next.delete(a)); }
                        else { g.actions.forEach(a => next.add(a)); }
                        saveAuditFilters(next);
                      }}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition font-medium ${allChecked ? "border-violet-500/50 text-violet-300 bg-violet-500/10" : someChecked ? "border-violet-500/30 text-violet-400/70 bg-violet-500/5" : "border-[#1e1e2a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"}`}>
                        <span className={`shrink-0 w-3 h-3 rounded border flex items-center justify-center ${allChecked ? "bg-violet-500 border-violet-500" : someChecked ? "border-violet-500/50" : "border-[#3f3f46]"}`}>
                          {allChecked ? <Check className="w-2 h-2 text-white" /> : someChecked ? <Minus className="w-2 h-2 text-violet-400" /> : null}
                        </span>
                        <span className="whitespace-nowrap text-[11px]">{g.label}</span>
                      </button>
                    ) : (
                      <>
                        <span className="text-[#52525b] font-semibold shrink-0">{g.label}</span>
                        {g.actions.map(a => (
                          <button key={a} onClick={() => toggleAuditAction(a)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition ${auditActionFilters.has(a) ? "border-violet-500/50 text-violet-300 bg-violet-500/10" : "border-[#1e1e2a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"}`}>
                            <span className={`shrink-0 w-3 h-3 rounded border flex items-center justify-center ${auditActionFilters.has(a) ? "bg-violet-500 border-violet-500" : "border-[#3f3f46]"}`}>
                              {auditActionFilters.has(a) && <Check className="w-2 h-2 text-white" />}
                            </span>
                            <span className="whitespace-nowrap">{(() => { const actionFormat = a?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()); return actionFormat ?? a ?? ""; })()}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Log Stream */}
          {auditLoading && auditLog.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : auditLog.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">
              {auditServerFilter !== "all" ? `No events for "${serverMap[auditServerFilter] || auditServerFilter}".` : "No audit events yet."}
            </p>
          ) : (
            <div className="border border-[#1e1e2a] rounded-xl overflow-hidden">
              {/* Desktop header */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 border-b border-[#1e1e2a] bg-[#0d0d11]/50 text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">
                <div className="col-span-3">Event</div>
                <div className="col-span-2">Server</div>
                <div className="col-span-3">Details</div>
                <div className="col-span-2">Actor</div>
                <div className="col-span-2">Timestamp</div>
              </div>
              {/* Rows */}
              {auditLog.map((entry: any) => {
                const serverName = entry.server_id ? serverMap[entry.server_id] || entry.details?.server_name : null;
                const isViewer = !!entry.viewer_key;
                const { dot, text: txt } = actionColor(entry.action);
                const detailText = formatDetails(entry);
                const actor = isViewer
                  ? `Viewer`
                  : entry.actor_email || entry.details?.discord_user || "—";

                return (
                <div key={entry.id} className="border-b border-[#1e1e2a]/50 last:border-b-0 hover:bg-[#0d0d11]/20 transition">
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 items-start">
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                      <span className={`text-xs font-medium truncate ${txt}`}>{formatActionLabel(entry.action)}</span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      {serverName ? <span className="text-[11px] text-[#a1a1aa] truncate block">{serverName}</span> : <span className="text-[#52525b]">—</span>}
                    </div>
                    <div className="col-span-4 min-w-0">
                      <span className="text-[11px] text-[#d4d4d8] whitespace-normal break-words leading-relaxed">{detailText}</span>
                    </div>
                    <div className="col-span-1 min-w-0">
                      <span className="text-[10px] text-[#71717a] truncate block">{actor}</span>
                      {isViewer && <span className="text-[9px] text-[#52525b] ml-1">viewer</span>}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <span className="text-[10px] text-[#71717a] font-mono tabular-nums">{new Date(entry.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  {/* Mobile card */}
                  <div className="sm:hidden px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                      <span className={`text-xs font-medium ${txt}`}>{formatActionLabel(entry.action)}</span>
                      {isViewer && <span className="text-[9px] text-[#52525b] ml-auto">viewer</span>}
                    </div>
                    <div className="text-[11px] text-[#d4d4d8]">{detailText}</div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#a1a1aa]">{serverName || "—"}</span>
                      <span className="text-[#71717a] font-mono">{new Date(entry.created_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="text-[10px] text-[#52525b]">{actor}</div>
                  </div>
                </div>
                );
              })}
              {/* Load More — auto-fetch sentinel */}
              {auditHasMore && (
                <SentinelAdminAudit onVisible={handleLoadMoreAudit} loading={auditLoadingMore} />
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* Database Tab */}
      {tab === "database" && (
        <div className="space-y-4">
          {dbLoading || planLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : !dbStats ? (
            <p className="text-[#71717a] text-sm text-center py-12">Failed to load database stats.</p>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#fafafa]">{planUsage?.db_size || dbStats.db_size || '—'}</p>
                  <div className="w-full h-1.5 bg-[#0d0d11] rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-[#a1a1aa] rounded-full" style={{ width: `${Math.min(100, ((planUsage?.db_size_bytes || 0) / (8 * 1024 * 1024 * 1024)) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-[#71717a] mt-1">DB Size (8 GB limit)</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#a1a1aa]">{dbStats.cache_hit_ratio ?? '—'}%</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Cache Hit Ratio</p>
                  <p className="text-[10px] text-[#52525b] mt-2">{planUsage?.total_rows?.toLocaleString() ?? '—'} rows · {planUsage?.table_count ?? dbStats.table_stats?.length ?? 0} tables</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#fafafa]">{planUsage?.active_connections ?? dbStats.active_connections ?? '—'}<span className="text-sm text-[#71717a]">/{planUsage?.max_connections ?? dbStats.total_connections ?? '—'}</span></p>
                  <div className="w-full h-1.5 bg-[#0d0d11] rounded-full mt-2 overflow-hidden flex">
                    <div className="h-full bg-blue-500 rounded-l-full" style={{ width: `${((planUsage?.active_connections || dbStats.active_connections || 0) / (planUsage?.max_connections || dbStats.total_connections || 1)) * 100}%` }} />
                    <div className="h-full bg-[#3f3f46] rounded-r-full" style={{ width: `${((planUsage?.idle_connections || 0) / (planUsage?.max_connections || dbStats.total_connections || 1)) * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px]">
                    <span className="text-[#a1a1aa] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Active: {planUsage?.active_connections ?? dbStats.active_connections ?? 0}</span>
                    {planUsage?.idle_connections != null && <span className="text-[#71717a] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3f3f46] inline-block" />Idle: {planUsage.idle_connections}</span>}
                  </div>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage?.auth_users ?? '—'}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Auth Users</p>
                  <p className="text-[10px] text-[#52525b] mt-2">{planUsage?.active_auth_users_30d ?? 0} active 30d</p>
                </div>
              </div>

              {/* Storage + Row count row */}
              {planUsage && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4">
                    <p className="text-xs text-[#71717a] mb-1">Storage</p>
                    <p className="text-xl font-bold text-[#fafafa]">{planUsage.storage_size_pretty || '0 bytes'}</p>
                    <p className="text-[10px] text-[#52525b] mt-2">{planUsage.storage_objects ?? 0} objects</p>
                  </div>
                  <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-[#71717a] mb-1">Plan Limits (Pro)</h4>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <span className="text-[#71717a]">Database:</span><span className="text-[#fafafa] text-right">8 GB</span>
                      <span className="text-[#71717a]">Users:</span><span className="text-[#fafafa] text-right">100K</span>
                      <span className="text-[#71717a]">Storage:</span><span className="text-[#fafafa] text-right">100 GB</span>
                      <span className="text-[#71717a]">Bandwidth:</span><span className="text-[#fafafa] text-right">250 GB</span>
                      <span className="text-[#71717a]">Functions:</span><span className="text-[#fafafa] text-right">2M/mo</span>
                      <span className="text-[#71717a]">Realtime:</span><span className="text-[#fafafa] text-right">500</span>
                      <span className="text-[#71717a]">API:</span><span className="text-[#fafafa] text-right">Unlimited</span>
                      <span className="text-[#71717a]">Backups:</span><span className="text-[#fafafa] text-right">7 days</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Table sizes */}
              <div>
                <h4 className="text-sm font-semibold text-[#fafafa] mb-2">Table Sizes</h4>
                <div className="space-y-1">
                  {(dbStats.table_stats || []).map((t: any) => (
                    <div key={t.table_name} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-3 sm:px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm text-[#fafafa] font-medium truncate">{t.table_name}</span>
                        <span className="text-[10px] text-[#71717a] shrink-0">~{t.row_estimate} rows</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#0d0d11] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#a1a1aa]/60 rounded-full"
                            style={{
                              width: `${Math.min(100, ((t.size_bytes || 0) / Math.max(1, ...(dbStats.table_stats || []).map((x: any) => x.size_bytes || 0))) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-[#71717a] w-14 text-right shrink-0">{t.size}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-[#52525b] text-right">
                Snapshot at {new Date(dbStats.timestamp).toLocaleString()}
              </p>
            </>
          )}
        </div>
      )}

      {/* Test Cron Tab */}
      {tab === "cron" && (
        <div className="space-y-4">
          {cronLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : !cronStatus ? (
            <p className="text-[#71717a] text-sm text-center py-12">Failed to load cron status.</p>
          ) : (
            <>
              {/* Status cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`bg-[#0d0d11] border rounded-xl p-4 text-center ${cronStatus.active ? 'border-green-500/30' : 'border-[#1e1e2a]'}`}>
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${cronStatus.active ? 'bg-green-500' : 'bg-[#71717a]'}`} />
                  <p className={`text-lg font-bold ${cronStatus.active ? 'text-green-400' : 'text-[#f87171]'}`}>
                    {cronStatus.active ? 'ACTIVE' : 'INACTIVE'}
                  </p>
                  <p className="text-[10px] text-[#71717a] mt-1">Cron Status</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <Clock className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-xs text-[#d4d4d8] font-mono">
                    {cronStatus.last_run ? cronStatus.last_run : 'Never'}
                  </p>
                  <p className="text-[10px] text-[#71717a] mt-1">Last Run (Manila)</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <Server className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-lg font-bold text-[#d4d4d8]">{cronStatus.servers?.length ?? 0}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Test Servers</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
                  <Skull className="w-4 h-4 text-[#f87171] mx-auto mb-2" />
                  <p className="text-lg font-bold text-[#fca5a5]">{cronStatus.total_kills?.toLocaleString() ?? 0}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Total Kills</p>
                </div>
              </div>

              {/* Per-server breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-[#fafafa] mb-2">Kills per Test Server</h4>
                <div className="space-y-1">
                  {(cronStatus.servers || []).map((srv) => (
                    <div key={srv.name} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-4 py-2.5 flex items-center justify-between"
                      title={cronStatus.last_run ? `Last run: ${cronStatus.last_run}` : "No run data"}>
                      <span className="text-sm text-[#fafafa]">{srv.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 sm:w-32 h-2 bg-[#0d0d11] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                            style={{ width: `${Math.min(100, (srv.kills / Math.max(1, cronStatus.total_kills)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono text-[#a1a1aa] w-10 text-right">{srv.kills}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-[#52525b]">Auto-refreshes every 30s. Cron runs every 5 min.</p>
            </>
          )}
        </div>
      )}

      {/* Deleted Servers Tab */}
      {tab === "deleted" && (() => {
        const filteredDeleted = deletedServers.filter((s: any) =>
          !deletedSearch || s.name.toLowerCase().includes(deletedSearch.toLowerCase())
        );
        return (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">
              Deleted ({filteredDeleted.length}{deletedSearch ? ` / ${deletedServers.length}` : ""})
            </h4>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
              <input
                type="text"
                placeholder="Search deleted…"
                value={deletedSearch}
                onChange={e => setDeletedSearch(e.target.value)}
                className="w-40 pl-7 pr-2 py-1 text-[10px] bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
          </div>
          {deletedLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : deletedServers.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No deleted servers.</p>
          ) : filteredDeleted.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No deleted servers match "{deletedSearch}".</p>
          ) : (
            filteredDeleted.map((s: any) => (
              <div key={s.id} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-4 py-3">
                <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#fafafa] font-medium">{s.name}</p>
                  <p className="text-xs text-[#71717a]">Deleted {new Date(s.deleted_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => { setRestoreConfirm({ id: s.id, name: s.name }); setRestoreInput(""); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Restore
                </button>
                </div>
                {restoreConfirm?.id === s.id && (
                  <div className="mt-3 pt-3 border-t border-[#1e1e2a] space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs font-medium">Type <code className="px-1 py-0.5 bg-[#27272a] rounded text-[#fafafa] text-[11px]">{s.name}</code> to confirm restore</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Type "${s.name}" to confirm`}
                        value={restoreInput}
                        onChange={e => setRestoreInput(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && restoreInput === s.name && !restoring) {
                            setRestoring(true);
                            try { await restoreServer(s.id); refetchDeleted(); setRestoreConfirm(null); }
                            catch (err: any) { console.error("Restore failed:", err); }
                            finally { setRestoring(false); }
                          }
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          if (restoreInput !== s.name || restoring) return;
                          setRestoring(true);
                          try { await restoreServer(s.id); refetchDeleted(); setRestoreConfirm(null); }
                          catch (err: any) { console.error("Restore failed:", err); }
                          finally { setRestoring(false); }
                        }}
                        disabled={restoreInput !== s.name || restoring}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Restore"}
                      </button>
                      <button onClick={() => setRestoreConfirm(null)} className="px-2 py-1.5 rounded text-xs text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        );
      })()}

      {/* Payments Tab */}
      {tab === "payments" && (() => {
        const completedRevenue = payments.filter((p: any) => p.status === "completed").reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const refundedAmount = payments.filter((p: any) => p.status === "refunded").reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const completedCount = payments.filter((p: any) => p.status === "completed").length;
        const refundedCount = payments.filter((p: any) => p.status === "refunded").length;
        return (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Revenue</p>
              <p className="text-lg font-semibold text-emerald-400 mt-0.5">${completedRevenue.toFixed(2)}</p>
              {refundedAmount > 0 && <p className="text-[10px] text-red-400">-${refundedAmount.toFixed(2)} refunded</p>}
            </div>
            <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Transactions</p>
              <p className="text-lg font-semibold text-[#fafafa] mt-0.5">{payments.length}</p>
              <p className="text-[10px] text-[#52525b]">{completedCount} completed{refundedCount > 0 ? `, ${refundedCount} refunded` : ""}</p>
            </div>
            <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Net Revenue</p>
              <p className="text-lg font-semibold text-[#fafafa] mt-0.5">${(completedRevenue - refundedAmount).toFixed(2)}</p>
            </div>
            <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-3">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Avg / Payment</p>
              <p className="text-lg font-semibold text-[#fafafa] mt-0.5">${completedCount > 0 ? (completedRevenue / completedCount).toFixed(2) : "0.00"}</p>
            </div>
          </div>

          {/* Payments table — all transactions */}
          <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg overflow-hidden">
            {paymentsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
            ) : payments.length === 0 ? (
              <p className="text-[#71717a] text-sm text-center py-12">No payments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1e2a] text-[#71717a]">
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Server</th>
                      <th className="text-left px-3 py-2 font-medium">Payer</th>
                      <th className="text-right px-3 py-2 font-medium">Amount</th>
                      <th className="text-right px-3 py-2 font-medium">Days</th>
                      <th className="text-right px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: any) => {
                      const serverName = servers.find((s: any) => s.id === p.server_id)?.name || p.server_id?.slice(0, 8) || "—";
                      return (
                        <tr key={p.id} className="border-b border-[#1e1e2a]/50 hover:bg-[#18181b]/50 transition">
                          <td className="px-3 py-2 text-[#a1a1aa] whitespace-nowrap">{new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                          <td className="px-3 py-2 text-[#fafafa] whitespace-nowrap">{serverName}</td>
                          <td className="px-3 py-2 text-[#a1a1aa] max-w-[120px] truncate">{p.payer_email || "—"}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap"><span className={p.status === "refunded" ? "text-red-400" : "text-[#fafafa]"}>${p.amount}</span></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap"><span className={p.status === "refunded" ? "text-red-400" : "text-[#a1a1aa]"}>+{p.days_added}d</span></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${p.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                              {p.status === "completed" ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Infra Tab */}
      {tab === "infra" && (
        <div className="space-y-3 sm:space-y-4">
          {/* Bot Logs Terminal */}
          <div className="bg-[#08080c] border border-[#1e1e2a] rounded-xl overflow-hidden shadow-inner">
            {/* Terminal header */}
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-[#0d0d11] border-b border-[#1e1e2a]">
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#ff5f57] shrink-0"></span>
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#febc2e] shrink-0"></span>
              <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#28c840] shrink-0"></span>
              <span className="text-[9px] sm:text-[10px] text-[#52525b] ml-1 sm:ml-2 font-mono truncate">bot-logs — raidscout-bot</span>
              <div className="flex-1" />
              <button onClick={() => refetchLogs()} className="p-0.5 rounded text-[#52525b] hover:text-[#a1a1aa] transition shrink-0" title="Refresh">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {/* Terminal body */}
            <div ref={logScrollRef} className="h-[36rem] sm:h-96 overflow-y-auto overflow-x-hidden font-mono text-[10px] sm:text-[11px] leading-relaxed p-1.5 sm:p-2">
              {logsLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-[#52525b] animate-spin" /></div>
              ) : !botLogs?.logs?.length ? (
                <p className="text-[#3f3f46] px-2 py-6 text-center select-none">No logs yet — waiting for bot events...</p>
              ) : (
                botLogs.logs.map((l: any, i: number) => (
                  <div key={i} className="flex gap-1.5 py-[1px] hover:bg-[#0d0d11]/50">
                    <span className="text-[#3f3f46] shrink-0 w-[52px] sm:w-[75px] select-none">{l.ts ? new Date(l.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: timezone }) : "--:--:--"}</span>
                    <span className={`shrink-0 w-8 sm:w-10 text-right select-none text-[10px] sm:text-[11px] ${
                      l.level === "error" ? "text-[#ff5f57]" : l.level === "warn" ? "text-[#febc2e]" : "text-[#52525b]"
                    }`}>{l.level}</span>
                    <span className={`whitespace-normal break-all sm:truncate text-[10px] sm:text-[11px] ${
                      l.level === "error" ? "text-[#ff5f57]" : l.level === "warn" ? "text-[#febc2e]" : "text-[#a1a1aa]"
                    }`}>{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bot Status Header */}
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#fafafa]">Bot Status</h4>
            <button onClick={() => refetchBot()} className="p-1 rounded text-[#a1a1aa] hover:text-[#fafafa] transition" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {botLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : !botStatus?.ok ? (
            <p className="text-[#71717a] text-sm text-center py-12">Bot unreachable.</p>
          ) : (
            <>
              {/* ── Spawn Cron Premium Card ── */}
              <SpawnCronCard data={botStatus.spawn_cron} connected={botStatus.discord_connected} timezone={timezone} />

              {/* Status Cards — 2-col on mobile, 4-col on desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                <div className={`bg-[#0d0d11] border rounded-xl p-2 sm:p-4 text-center ${botStatus.discord_connected ? 'border-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.08)]' : 'border-[#1e1e2a]'}`}>
                  <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full mx-auto mb-1 sm:mb-2 ${botStatus.discord_connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-[#52525b]'}`} />
                  <p className={`text-xs sm:text-lg font-bold ${botStatus.discord_connected ? 'text-emerald-300' : 'text-[#f87171]'}`}>
                    {botStatus.discord_connected ? 'ONLINE' : 'OFFLINE'}
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 sm:mt-1 uppercase tracking-wider">Discord</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-4 text-center">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#52525b] mx-auto mb-1 sm:mb-2" />
                  <p className="text-[10px] sm:text-xs text-[#d4d4d8] font-mono truncate">{liveUptime || botStatus.uptime_display}</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 sm:mt-1 uppercase tracking-wider">Uptime</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-4 text-center">
                  <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#52525b] mx-auto mb-1 sm:mb-2" />
                  <p className="text-xs sm:text-lg font-bold text-[#d4d4d8] truncate">{botStatus.memory_mb} / 1024 MB</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 sm:mt-1 uppercase tracking-wider">Memory</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-4 text-center">
                  <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#52525b] mx-auto mb-1 sm:mb-2" />
                  <p className="text-[10px] sm:text-xs text-[#d4d4d8] truncate">{botStatus.region ? (FLY_REGIONS[botStatus.region] || botStatus.region.toUpperCase()) : "—"} · 2 vCPU</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 sm:mt-1 uppercase tracking-wider">Machine</p>
                </div>
              </div>

              {/* Extra Info Cards — 3-col on all screens */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-[10px] sm:text-xs text-[#d4d4d8] font-mono truncate">{botStatus.node_version}</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 uppercase tracking-wider">Node.js</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-[10px] sm:text-xs text-[#d4d4d8] font-mono">fly.io</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 uppercase tracking-wider">Platform</p>
                </div>
                <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-[10px] sm:text-xs text-[#d4d4d8] font-mono">{botStatus.region}</p>
                  <p className="text-[9px] sm:text-[10px] text-[#52525b] mt-0.5 uppercase tracking-wider">Region</p>
                </div>
              </div>



              <p className="text-[10px] text-[#3f3f46]">Auto-refreshes every 15s.</p>

              {/* Maintenance Mode */}
              <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-3 sm:p-4 space-y-3">
                <div className="flex flex-col gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-[#fafafa]">Maintenance Mode</h4>
                    <p className="text-[10px] sm:text-xs text-[#71717a]">Block all non-admin users. Set an end time so users know when to return.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!maintenance) {
                        if (!maintEndDate || !maintEndTime) return;
                        const endISO = new Date(`${maintEndDate}T${maintEndTime}:00`).toISOString();
                        await supabase.from("app_settings").upsert({ key: "maintenance_end", value: endISO }, { onConflict: "key" });
                        await supabase.from("app_settings").upsert({ key: "maintenance_mode", value: "true" }, { onConflict: "key" });
                        writeAuditEntry({ action: AuditAction.MAINTENANCE_ON, server_id: "00000000-0000-0000-0000-000000000000", details: { ends_at: endISO } });
                      } else {
                        await supabase.from("app_settings").upsert({ key: "maintenance_mode", value: "false" }, { onConflict: "key" });
                        writeAuditEntry({ action: AuditAction.MAINTENANCE_OFF, server_id: "00000000-0000-0000-0000-000000000000" });
                      }
                      setMaintenance(!maintenance);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition self-start ${
                      maintenance
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
                    }`}
                  >
                    {maintenance ? "Turn OFF" : "Turn ON"}
                  </button>
                </div>
                {!maintenance && (
                  <div className="flex flex-col gap-2">
                    <input type="date" value={maintEndDate} onChange={e => setMaintEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#09090b] border border-[#1e1e2a] rounded text-xs text-[#fafafa]" />
                    <input type="time" value={maintEndTime} onChange={e => setMaintEndTime(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#09090b] border border-[#1e1e2a] rounded text-xs text-[#fafafa]" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Games Tab */}
      {tab === "games" && <AdminGamesTab />}
    </div>

      {/* Mobile: bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-xl border-t border-[#1e1e2a] safe-area-bottom">
        <div className="flex items-center justify-around gap-0.5 h-14 max-w-full mx-auto overflow-x-auto px-1">
          {([
            { id: "infra" as const, icon: Radio, label: "Infra" },
            { id: "games" as const, icon: Gamepad2, label: "Games" },
            { id: "servers" as const, icon: Server, label: "Servers" },
            { id: "users" as const, icon: Users, label: "Users" },
            { id: "audit" as const, icon: ClipboardList, label: "Audit" },
            { id: "database" as const, icon: HardDrive, label: "DB" },
            { id: "cron" as const, icon: Clock, label: "Cron" },
            { id: "deleted" as const, icon: Trash2, label: "Del" },
          ]).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 min-w-[44px] rounded-lg transition-colors shrink-0 ${tab === id ? "text-[#fafafa]" : "text-[#52525b]"}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </button>
          ))}
        </div>
      </nav>
      </div>{/* close flex sidebar+content */}
      </div>{/* close content wrapper */}

      {/* Footer — same as main Layout */}
      <footer className="block shrink-0 border-t border-[#1a1a1e] bg-[#09090b] mb-16 md:mb-0">
        <div className="px-4 py-2 flex items-center justify-between text-[11px] text-[#52525b]">
          <span>© {new Date().toLocaleDateString("en-US", { timeZone: timezone, year: "numeric" })} RaidScout. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <Link to="/terms" className="hover:text-[#a1a1aa] transition">Terms</Link>
            <Link to="/privacy" className="hover:text-[#a1a1aa] transition">Privacy</Link>
            <Link to="/refund" className="hover:text-[#a1a1aa] transition">Refunds</Link>
            <Link to="/changelog" className="hover:text-[#a1a1aa] transition">Changelog</Link>
          </div>
        </div>
      </footer>

      {/* Extend Subscription Confirm */}
      <ConfirmDialog
        open={!!extendConfirm}
        title="Extend Subscription"
        message={`Add 30 days to ${extendConfirm?.serverName || "this server"}'s subscription?`}
        confirmLabel="Extend +30d"
        onConfirm={async () => {
          if (!extendConfirm) return;
          setExtending(true);
          try {
            const { error } = await supabase.rpc("extend_server_subscription", { p_server_id: extendConfirm.serverId, p_days: 30 });
            if (error) throw error;
            writeAuditEntry({ action: AuditAction.SUBSCRIPTION_EXTEND, server_id: extendConfirm.serverId, details: { server_name: extendConfirm.serverName, days: 30 } });
            // Compute new date locally and set state override for instant UI update
            const now = new Date();
            const cached = (queryClient.getQueryData(["admin", "servers"]) as any[]) ?? [];
            const srv = cached.find((s: any) => s.id === extendConfirm.serverId);
            const currentEnd = srv?.subscription_ends_at ? new Date(srv.subscription_ends_at) : now;
            if (currentEnd < now) currentEnd.setTime(now.getTime());
            const newEnd = new Date(currentEnd.getTime() + 30 * 86400000).toISOString();
            const newEndDate = new Date(newEnd).toLocaleDateString();
            setSubOverrides(prev => ({ ...prev, [extendConfirm.serverId]: newEnd }));
            toast("success", `Extended ${extendConfirm.serverName} to ${newEndDate}`);
            // Background: refresh cache from server
            queryClient.fetchQuery({ queryKey: ["admin", "servers"], queryFn: fetchAllServers, staleTime: 0 });
          } catch (err: any) {
            toast("error", err?.message || "Failed to extend");
          } finally {
            setExtending(false);
            setExtendConfirm(null);
          }
        }}
        onCancel={() => setExtendConfirm(null)}
      />

      {/* Logout Confirm */}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        onConfirm={signOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {/* Force Spawn All Confirm */}
      {forceSpawnConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setForceSpawnConfirm(null)} />
          <div className="relative bg-[#0d0d11] border border-[#1e1e2a] rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#fafafa]">Force Spawn All</h3>
            <p className="text-xs text-[#a1a1aa]">
              This will force-spawn <strong>all fixed-timer bosses</strong> in{" "}
              <strong className="text-amber-400">{forceSpawnConfirm.serverName}</strong>.
              Type the server name to confirm.
            </p>
            <input
              type="text"
              value={forceSpawnInput}
              onChange={(e) => setForceSpawnInput(e.target.value)}
              placeholder={forceSpawnConfirm.serverName}
              autoFocus
              className="w-full px-3 py-2 bg-[#09090b] border border-[#1e1e2a] rounded-lg text-[#fafafa] text-sm placeholder-[#52525b] focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition"
              onKeyDown={(e) => {
                if (e.key === "Enter" && forceSpawnInput === forceSpawnConfirm.serverName) {
                  handleForceSpawn();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setForceSpawnConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#3f3f46] text-[#a1a1aa] hover:bg-[#27272a] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleForceSpawn}
                disabled={forceSpawnInput !== forceSpawnConfirm.serverName}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-[#fafafa] hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Force Spawn All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Spawn Cron Premium Card ─────────────────────────────────
function SpawnCronCard({ data, connected, timezone }: { data: any; connected: boolean; timezone: string }) {
  const [timeRange, setTimeRange] = useState("1h");
  const [tooltip, setTooltip] = useState<{ i: number; v: number; x: number; y: number } | null>(null);
  const inMemoryHistory: number[] = data?.tick_history_ms ?? [];

  // Persist peak timestamp across refetches so it doesn't flicker
  const peakRef = useRef<{ ms: number; time: string } | null>(null);

  // Fetch historical metrics from bot
  const BOT_URL = (import.meta as any).env?.DEV || (typeof window !== "undefined" && (window.location.hostname.includes("staging") || window.location.hostname.endsWith(".vercel.app"))) ? "https://raidscout-staging.fly.dev" : "https://raidscout-bot.fly.dev";
  const { data: histData } = useQuery({
    queryKey: ["tick-metrics", timeRange],
    queryFn: async () => {
      const res = await fetch(`${BOT_URL}/tick-metrics?range=${timeRange}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; metrics: { ts: number; duration_ms: number }[] }>;
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
    enabled: timeRange !== "live",
  });

  // Use historical data if available, else in-memory buffer
  const history: number[] = timeRange === "live" || !histData?.ok
    ? inMemoryHistory
    : (histData?.metrics?.map((m: any) => m.duration_ms) ?? inMemoryHistory);
  const durationMs = data?.last_tick_duration_ms ?? 0;
  const lastTickSec = data?.last_tick_seconds_ago;
  const servers = data?.servers_checked ?? 0;
  const bosses = data?.bosses_checked ?? 0;
  const hasData = history.length > 1;

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartW, setChartW] = useState(1200);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setChartW(entry.contentRect.width);
    });
    ro.observe(el);
    setChartW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const W = chartW || 350;
  const isNarrow = W < 640;
  const H = isNarrow ? Math.round(W * 2 / 3) : Math.round(W * 0.3);
  const LX = isNarrow ? 40 : 52, RX = isNarrow ? 20 : 36, TY = 16, BY = isNarrow ? 28 : 32;
  const fontSize = isNarrow ? 11 : 9;
  const fontSizeSm = isNarrow ? 9.5 : 7.5;
  const fontSizeLg = isNarrow ? 10 : 9.5;
  const lineW = isNarrow ? 2.5 : 1.8;
  const glowW = isNarrow ? 7 : 5;
  const hitW = isNarrow ? 44 : 36;
  const dotR = isNarrow ? 3 : 2;
  const dotHoverR = isNarrow ? 5 : 3.5;
  const lastDotR = isNarrow ? 5 : 3.5;
  const lastGlowR = isNarrow ? 8 : 6;
  const dataMin = hasData ? Math.min(...history) : 0;
  const dataMax = hasData ? Math.max(...history) : 5000;
  const padding = (dataMax - dataMin) * 0.1 || 100;
  const min = Math.max(0, dataMin - padding);
  const max = dataMax + padding;
  const rng = max - min || 1;
  const pw = W - LX - RX;
  const ph = H - TY - BY;
  const sx = hasData && history.length > 1 ? pw / (history.length - 1) : 0;

  const yPos = (v: number) => TY + ph - ((v - min) / rng) * ph;
  const xPos = (i: number) => LX + i * sx;

  const pts = hasData ? history.map((v, i) => `${xPos(i)},${yPos(v)}`).join(" ") : "";

  // Y ticks — limit to ~8 lines for readability
  const yTicks: number[] = [];
  let yStep = rng > 4000 ? 1000 : rng > 2000 ? 500 : rng > 1000 ? 250 : 200;
  // Scale up step if there would be too many grid lines
  while ((rng / yStep) > (isNarrow ? 5 : 8)) yStep *= 2;
  for (let v = Math.ceil(min / yStep) * yStep; v <= max; v += yStep) yTicks.push(v);
  if (yTicks.length < 2) yTicks.push(min, max);

  const avg = hasData ? history.reduce((a, b) => a + b, 0) / history.length : 0;
  const avgY = yPos(avg);
  const latest = history[history.length - 1] ?? 0;
  const prev = history.length > 1 ? history[history.length - 2] : latest;
  const trend = latest > prev ? "up" : latest < prev ? "down" : "flat";

  // Peak duration — persisted across refetches to avoid flicker
  const peakMs = hasData ? Math.max(...history) : 0;
  const peakTime = useMemo(() => {
    if (histData?.metrics) {
      let peakIdx = 0; let peakVal = 0;
      histData.metrics.forEach((m: any, i: number) => { if (m.duration_ms > peakVal) { peakVal = m.duration_ms; peakIdx = i; } });
      const peakTs = histData.metrics[peakIdx]?.ts;
      if (peakTs) {
        const time = new Date(peakTs).toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        peakRef.current = { ms: peakVal, time };
      }
    }
    return peakRef.current;
  }, [histData, timezone]);

  // Label every ~6th tick
  const labelStep = Math.max(1, Math.floor(history.length / (isNarrow ? 3 : 6)));

  return (
    <div className="relative rounded-xl bg-[#0d0d11] border border-[#1e1e2a]">
      {/* Ambient top glow bar */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

      {/* Header bar */}
      <div className="relative flex flex-wrap items-center justify-between px-4 sm:px-5 pt-3 pb-1 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-[#52525b]'}`} />
            <span className="text-[11px] font-semibold text-[#e4e4e7] tracking-wide">SPAWN CRON</span>
          </div>
          <span className="text-[10px] text-[#52525b] font-mono">{BOT_URL.includes("staging") ? "60 seconds" : "30 seconds"}</span>
          {/* Time range filter */}
          <select
            value={timeRange}
            onChange={e => setTimeRange(e.target.value)}
            className="bg-[#0d0d11] border border-[#1e1e2a] rounded px-1.5 py-0.5 text-[10px] text-[#a1a1aa] font-mono focus:outline-none focus:border-violet-500/30 cursor-pointer"
          >
            <option value="live">Live</option>
            <option value="1h">1 Hour</option>
            <option value="3h">3 Hours</option>
            <option value="6h">6 Hours</option>
            <option value="12h">12 Hours</option>
            <option value="1d">1 Day</option>
            <option value="3d">3 Days</option>
            <option value="5d">5 Days</option>
            <option value="7d">7 Days</option>
            <option value="14d">14 Days</option>
            <option value="30d">30 Days</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-1.5 bg-[#18181b] rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border border-[#27272a]">
            <span className="text-[9px] sm:text-[10px] text-[#71717a] font-mono uppercase tracking-wider">avg</span>
            <span className="text-xs sm:text-sm font-bold text-[#fafafa] font-mono">{(avg / 1000).toFixed(2)}<span className="text-[9px] sm:text-[10px] text-[#71717a] ml-0.5">s</span></span>
          </div>
          <div className={`flex items-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border ${trend === "up" ? "bg-emerald-500/10 border-emerald-500/20" : trend === "down" ? "bg-rose-500/10 border-rose-500/20" : "bg-[#18181b] border-[#27272a]"}`}>
            <span className={`text-[10px] sm:text-xs ${trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-[#71717a]"}`}>
              {trend === "up" ? "▲" : trend === "down" ? "▼" : "─"}
            </span>
            <span className={`text-xs sm:text-sm font-bold font-mono ${trend === "up" ? "text-emerald-300" : trend === "down" ? "text-rose-300" : "text-[#a1a1aa]"}`}>{(latest / 1000).toFixed(2)}<span className="text-[9px] sm:text-[10px] opacity-60 ml-0.5">s</span></span>
          </div>
          {peakTime && (
            <div className="flex items-center gap-1 bg-[#18181b] rounded-lg px-2 py-1 border border-[#27272a]">
              <span className="text-[9px] text-[#71717a] font-mono uppercase tracking-wider">peak</span>
              <span className="text-[11px] sm:text-xs font-bold text-amber-300 font-mono">{(peakTime.ms / 1000).toFixed(2)}<span className="text-[9px] text-[#71717a] ml-0.5">s</span></span>
              <span className="text-[8px] text-[#52525b] hidden sm:inline">{peakTime.time}</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} className="relative w-full max-w-[900px] aspect-[3/2] sm:aspect-[10/3] min-h-[350px] sm:min-h-[260px] mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <style>{`
            @keyframes drawIn { from { stroke-dashoffset: var(--d); } to { stroke-dashoffset: 0; } }
            @keyframes fadeUp { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pulseGlow { 0%,100% { opacity: 0.25; } 50% { opacity: 0.55; } }
            @keyframes pulseDot { 0%,100% { r: 3; opacity: 0.6; } 50% { r: 4.5; opacity: 1; } }
            .cline { stroke-dasharray: var(--d); stroke-dashoffset: var(--d); animation: drawIn 1.4s cubic-bezier(0.33,1,0.68,1) forwards; }
            .glow  { stroke-dasharray: var(--d); stroke-dashoffset: var(--d); animation: drawIn 1.4s cubic-bezier(0.33,1,0.68,1) forwards, pulseGlow 2.5s ease-in-out 1.4s infinite; }
            .area  { opacity: 0; animation: fadeUp 0.7s ease-out 0.5s forwards; }
            .ldot  { animation: pulseDot 2s ease-in-out infinite; }
          `}</style>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Y-axis title */}
          <text x={LX - 4} y={TY - 2} textAnchor="end" fill="#52525b" fontSize={fontSize} fontFamily="monospace" fontWeight="bold">sec</text>
          {/* Grid */}
          {yTicks.map(v => (
            <g key={`g-${v}`}>
              <line x1={LX} y1={yPos(v)} x2={W - RX} y2={yPos(v)} stroke="#1e1e2a" strokeWidth="0.5" />
              <text x={LX - 6} y={yPos(v) + 3.5} textAnchor="end" fill="#71717a" fontSize={fontSize} fontFamily="monospace">{(v / 1000).toFixed(1)}</text>
            </g>
          ))}
          {/* X-axis */}
          <line x1={LX} y1={TY + ph} x2={W - RX} y2={TY + ph} stroke="#1e1e2a" strokeWidth="0.5" />

          {/* Average line */}
          {hasData && (
            <line x1={LX} y1={avgY} x2={W - RX} y2={avgY} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="4,6" />
          )}

          {hasData && (
            <>
              {/* Area */}
              <polygon points={`${xPos(0)},${TY + ph} ${pts} ${xPos(history.length - 1)},${TY + ph}`} fill="url(#areaGrad)" className="area" />
              {/* Glow line */}
              <polyline points={pts} fill="none" stroke="#8b5cf6" strokeWidth={glowW} strokeLinecap="round" strokeLinejoin="round" opacity="0"
                filter="url(#glow)" className="glow" style={{ '--d': 99999 } as React.CSSProperties} />
              {/* Main line */}
              <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth={lineW} strokeLinecap="round" strokeLinejoin="round"
                className="cline" style={{ '--d': 99999 } as React.CSSProperties} />

              {/* Data points — always visible, hoverable, clickable */}
              {history.map((v, i) => {
                const isLast = i === history.length - 1;
                const x = xPos(i), y = yPos(v);
                const lbl = (v / 1000).toFixed(2);
                const isHovered = tooltip?.i === i;
                const onEnter = () => setTooltip({ i, v, x, y });
                const onLeave = () => setTooltip(t => t?.i === i ? null : t);
                const onClick = () => setTooltip(t => t?.i === i ? null : { i, v, x, y });

                return (
                  <g key={`p-${i}`}>
                    {/* Invisible hit area */}
                    <rect x={x - hitW / 2} y={y - hitW / 2} width={hitW} height={hitW} fill="transparent"
                      onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}
                      style={{ cursor: "pointer" }} />
                    {/* Hover ring */}
                    {isHovered && (
                      <circle cx={x} cy={y} r={isNarrow ? "10" : "8"} fill="none" stroke="#a78bfa" strokeWidth="1" opacity="0.5">
                        <animate attributeName="r" from={isNarrow ? "8" : "6"} to={isNarrow ? "12" : "10"} dur="0.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="0.8s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* Dot */}
                    {isLast ? (
                      <>
                        <circle cx={x} cy={y} r={lastGlowR} fill="#8b5cf6" opacity="0.25" className="ldot" />
                        <circle cx={x} cy={y} r={lastDotR} fill="#c4b5fd" stroke="#0d0d11" strokeWidth="1.5" />
                      </>
                    ) : (
                      <circle cx={x} cy={y} r={isHovered ? dotHoverR : dotR} fill={isHovered ? "#c4b5fd" : "#a78bfa"} stroke="#0d0d11" strokeWidth={isHovered ? "2" : "1"} />
                    )}
                    {/* Value label on hover */}
                    {isHovered && !isLast && (
                      <text x={x} y={y - 10} textAnchor="middle" fill="#fafafa" fontSize={fontSizeLg} fontFamily="monospace" fontWeight="bold">{lbl}s</text>
                    )}
                    {/* Always-visible label for Nth ticks */}
                    {!isHovered && (i % labelStep === 0 || isLast) && !isLast && (
                      <text x={x} y={y - 8} textAnchor="middle" fill="#71717a" fontSize={fontSizeSm} fontFamily="monospace">{lbl}</text>
                    )}
                  </g>
                );
              })}

              {/* X tick labels */}
              {history.map((_, i) => {
                if (i % labelStep !== 0 && i !== history.length - 1) return null;
                return (
                  <text key={`xl-${i}`} x={xPos(i)} y={TY + ph + 15} textAnchor="middle" fill="#71717a" fontSize={fontSizeLg} fontFamily="monospace">
                    {i + 1}
                  </text>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {!hasData && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="#3f3f46" fontSize="11" fontFamily="monospace">
              Collecting data...
            </text>
          )}
        </svg>
      </div>

      {/* Hover tooltip — edge-aware positioning */}
      {tooltip && (() => {
        const pctX = ((tooltip.x - LX) / pw) * 100;
        const pctY = ((tooltip.y - TY) / ph) * 100;
        const nearRight = pctX > 70;
        const nearLeft = pctX < 15;
        const xStyle = nearRight ? { right: `${100 - pctX}%` }
          : nearLeft ? { left: `${Math.max(0, pctX)}%` }
          : { left: `${pctX}%`, transform: "translate(-50%, -120%)" };
        const arrowStyle = nearRight ? { right: "12px" }
          : nearLeft ? { left: "12px" }
          : { left: "50%", transform: "translateX(-50%)" };
        const ts = histData?.metrics?.[tooltip.i]?.ts;
        const dateStr = ts ? new Date(ts).toLocaleString("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null;

        return (
          <div className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg bg-[#18181b] border border-[#3f3f46] shadow-xl"
            style={{ top: `${pctY}%`, ...xStyle }}>
            {dateStr && <div className="text-[9px] text-[#71717a] font-mono whitespace-nowrap mb-0.5">{dateStr}</div>}
            <div className="text-[10px] font-mono text-[#fafafa] whitespace-nowrap">
              Tick {tooltip.i + 1}: <span className="text-[#a78bfa] font-bold">{(tooltip.v / 1000).toFixed(2)}s</span>
            </div>
          </div>
        );
      })()}

      {/* Stats bar */}
      <div className="relative flex items-center justify-center gap-3 sm:gap-10 px-3 sm:px-4 pb-3 sm:pb-4 pt-1 border-t border-[#1e1e2a]">
        <div className="text-center">
          <p className="text-[10px] text-[#52525b] uppercase tracking-wider">Duration</p>
          <p className="text-sm font-bold text-[#fafafa] font-mono">
            {durationMs > 0 ? (durationMs / 1000).toFixed(2) : "—"}<span className="text-[10px] text-[#71717a] ml-0.5">s</span>
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-[#52525b] uppercase tracking-wider">Servers</p>
          <p className="text-sm font-bold text-[#fafafa] font-mono">{servers}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-[#52525b] uppercase tracking-wider">Bosses</p>
          <p className="text-sm font-bold text-[#fafafa] font-mono">{bosses}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-[#52525b] uppercase tracking-wider">Ticks</p>
          <p className="text-sm font-bold text-[#fafafa] font-mono">{history.length || "—"}</p>
        </div>
      </div>
    </div>
  );
}
