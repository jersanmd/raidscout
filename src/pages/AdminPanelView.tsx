import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAllServers, fetchAllUsers, fetchAuditLog, fetchServerStats, fetchDatabaseStats, fetchPlanUsage, fetchCronStatus, restoreServer, supabase } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Shield, Server, Users, Eye, ChevronDown, ChevronUp, ClipboardList, HardDrive, BarChart3, Crosshair, Skull, Activity, Radio, Clock, Trash2, RefreshCw, LogOut, Gamepad2, Globe, ExternalLink } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminGamesTab } from "@/components/AdminGamesTab";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { TIMEZONES } from "@/lib/timezones";
import { version } from "../../package.json";

export function AdminPanelView() {
  const [tab, setTab] = useState<"servers" | "users" | "audit" | "games" | "infra" | "database" | "plan" | "cron" | "deleted">("infra");
  const { setCurrentServer } = useServer();
  const { userRole, user, signOut } = useAuth();
  const { timezone, setTimezone } = useUserTimezone();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userServers, setUserServers] = useState<Record<string, { server_id: string; server_name: string; role: string }[]>>({});
  const [loadingServers, setLoadingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<Record<string, any>>({});
  const [auditServerFilter, setAuditServerFilter] = useState<string>("all");
  const [auditTimeRange, setAuditTimeRange] = useState<string>("1d");
  const [auditCustomSince, setAuditCustomSince] = useState("");
  const [auditCustomUntil, setAuditCustomUntil] = useState("");
  const [serverFilter, setServerFilter] = useState<"all" | "bot">("all");
  const navigate = useNavigate();
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
    staleTime: 10_000,
    enabled: userRole === "admin",
  });

  const { data: users = [], isLoading: usrLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAllUsers,
    staleTime: 10_000,
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
    enabled: userRole === "admin" && tab === "plan",
  });

  const { data: cronStatus, isLoading: cronLoading } = useQuery({
    queryKey: ["admin", "cron"],
    queryFn: fetchCronStatus,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: userRole === "admin" && tab === "cron",
  });

  const BOT_URL = "https://raidscout-bot.fly.dev";
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

  const { data: deletedServers = [], isLoading: deletedLoading, refetch: refetchDeleted } = useQuery({
    queryKey: ["admin", "deleted"],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("id, name, owner_id, deleted_at, created_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
      return data || [];
    },
    staleTime: 15_000,
    enabled: userRole === "admin" && tab === "deleted",
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ["admin", "audit", auditTimeRange, auditCustomSince, auditCustomUntil],
    queryFn: () => {
      let since: string | null = null;
      let until: string | null = null;
      
      if (auditTimeRange === "custom") {
        since = auditCustomSince ? new Date(auditCustomSince).toISOString() : null;
        until = auditCustomUntil ? new Date(auditCustomUntil).toISOString() : null;
      } else if (auditTimeRange !== "all") {
        const days: Record<string, number> = { "1d": 1, "3d": 3, "5d": 5, "7d": 7, "1month": 30 };
        const d = days[auditTimeRange] || 7;
        since = new Date(Date.now() - d * 86400_000).toISOString();
      }
      
      // Default to first server if "all" is selected
      const serverId = auditServerFilter !== "all" ? auditServerFilter : null;
      return fetchAuditLog(500, serverId, since, until);
    },
    staleTime: 15_000,
    enabled: userRole === "admin" && tab === "audit",
  });

  // Auto-select first server when opening audit tab

  // Load stats for all servers when bot filter is active
  useEffect(() => {
    if (serverFilter !== "bot" || tab !== "servers") return;
    const nonTestServers = servers.filter((s: any) => !s.name.toLowerCase().includes('test'));
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
  useEffect(() => {
    if (tab === "audit" && auditServerFilter === "all" && servers.length > 0) {
      setAuditServerFilter(servers[0].id);
    }
  }, [tab, servers, auditServerFilter]);

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Top bar */}
      <div className="w-full border-b border-[#27272a] bg-[#09090b]/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center">
          {/* Left: Logo + Admin badge */}
          <div className="flex items-center gap-3 flex-1">
            <span className="font-bold text-[#fafafa]">RaidScout</span>
            <span className="text-xs bg-[#18181b] text-[#a1a1aa] px-2 py-0.5 rounded">Admin</span>
          </div>

          {/* Center: Timezone */}
          <div className="flex items-center gap-1.5 text-xs text-[#71717a] shrink-0">
            <Globe className="w-3.5 h-3.5" />
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[#d4d4d8] text-xs focus:outline-none focus:ring-1 focus:ring-[#52525b]"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value} className="bg-[#18181b]">{tz.label}</option>
              ))}
            </select>
          </div>

          {/* Right: User menu */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center gap-1 text-[#a1a1aa] hover:text-[#fafafa] text-sm transition p-1.5 rounded-md hover:bg-[#18181b]" title="Menu">
                <span className="text-xs hidden md:block">{user?.email?.split("@")[0]}</span>
                <ChevronDown className={`w-3 h-3 transition ${showUserMenu ? "rotate-180" : ""}`} />
              </button>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#27272a]">
                      <div className="text-sm font-semibold text-[#fafafa]">{user?.email?.split("@")[0]}</div>
                      <div className="text-xs text-[#71717a]">{user?.email}</div>
                    </div>
                    <div className="py-1">
                      <button onClick={() => { setShowUserMenu(false); setShowLogoutConfirm(true); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-[#d4d4d8] hover:bg-[#27272a] transition">
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

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 flex-1">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
          <Shield className="w-5 h-5 text-[#fafafa]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#fafafa]">Admin Panel</h2>
          <p className="text-sm text-[#a1a1aa]">Oversee all servers and users</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#18181b] rounded-lg p-0.5 gap-0.5 overflow-x-auto">
        <button
          onClick={() => setTab("infra")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "infra" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          Infra
        </button>
        <button
          onClick={() => setTab("games")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "games" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          Games
        </button>
        <button
          onClick={() => setTab("servers")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "servers" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setTab("users")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "users" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Owners ({users.length})
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "audit" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Audit
        </button>
        <button
          onClick={() => setTab("database")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "database" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          Database
        </button>
        <button
          onClick={() => setTab("plan")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "plan" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Usage
        </button>
        <button
          onClick={() => setTab("cron")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "cron" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Test Cron
        </button>
        <button
          onClick={() => setTab("deleted")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "deleted" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Deleted
        </button>
      </div>

      {/* Servers Tab */}
      {tab === "servers" && (
        <div className="space-y-2">
          {srvLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : servers.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No servers yet.</p>
          ) : (
            (() => {
              const testServers = servers.filter((s: any) => s.name.toLowerCase().includes('test'));
              let regularServers = servers.filter((s: any) => !s.name.toLowerCase().includes('test'));
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
              return (
              <div key={s.id} className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
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
                  className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-[#18181b]/50 transition text-left"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <h4 className="text-sm font-semibold text-[#fafafa] truncate">{s.name}</h4>
                    <p className="text-[10px] text-[#71717a] font-mono">{s.id?.substring(0, 12)}...</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#18181b] text-[11px] text-[#d4d4d8]">
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
                  <div className="border-t border-[#27272a] px-4 py-3 space-y-3">
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

                        {/* Guild Tags — monochrome text, 40% opacity for zero-count */}
                        {stats.guild_members && stats.guild_members.length > 0 && (
                          <div className="border-t border-[#27272a] pt-3">
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
                                      ? 'border-[#27272a] text-[#52525b] opacity-40'
                                      : 'border-[#3f3f46] text-[#d4d4d8] bg-[#18181b]'
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

                        {/* View Server — clean outline button */}
                        <div className="flex items-center justify-end pt-1 border-t border-[#27272a]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentServer({ id: s.id, name: s.name, owner_id: s.owner_id, invite_code: s.id?.substring(0, 8) ?? "", created_at: s.created_at, role: "owner" });
                              navigate("/");
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#3f3f46] text-[#d4d4d8] hover:bg-[#18181b] hover:border-[#52525b] transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Server
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

      {/* Server Owners Tab */}
      {tab === "users" && (
        <div>
          {usrLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No users registered.</p>
          ) : (
            <div className="border border-[#27272a] rounded-xl overflow-hidden">
              {/* Table Header — hidden on mobile */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-[#27272a] bg-[#18181b]/50 text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">
                <div className="col-span-4">Email</div>
                <div className="col-span-3">User ID</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Joined</div>
                <div className="col-span-1"></div>
              </div>
              {/* User Rows */}
              {users.map((u: any) => {
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
                    className="w-full grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-[#18181b]/30 transition text-left border-b border-[#27272a]/50 last:border-b-0"
                  >
                    <div className="col-span-4 min-w-0">
                      <span className="text-sm text-[#fafafa] font-medium truncate block">{u.email ?? "No email"}</span>
                    </div>
                    <div className="col-span-3 min-w-0">
                      <code className="text-[10px] text-[#52525b] font-mono truncate block">{u.user_id?.substring(0, 12)}...</code>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-[#71717a]">{u.role}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-[#71717a]">{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="col-span-1 text-right">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#71717a] ml-auto" /> : <ChevronDown className="w-4 h-4 text-[#71717a] ml-auto" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[#27272a] px-4 py-3 space-y-2 bg-[#09090b]/50">
                      <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Servers</p>
                      {loadingServers ? (
                        <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
                      ) : servers.length === 0 ? (
                        <p className="text-xs text-[#71717a]">No servers.</p>
                      ) : (
                        servers.map((s) => (
                          <div key={s.server_id} className="flex items-center justify-between bg-[#18181b] rounded-lg px-3 py-2">
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
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-[#18181b] border border-[#27272a] text-[#fafafa] hover:bg-[#27272a] transition"
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
      )}

      {/* Audit Log Tab */}
      {tab === "audit" && (() => {
        const serverMap: Record<string, string> = {};
        for (const s of servers) {
          serverMap[s.id] = s.name;
        }

        const filteredLog = auditServerFilter === "all"
          ? auditLog
          : auditLog.filter((e: any) => e.server_id === auditServerFilter);

        const actionLabel: Record<string, string> = {
          set_role: 'Role Changed', delete_role: 'Role Removed',
          transfer_ownership: 'Ownership Transferred', delete_server: 'Server Deleted',
          record_death: 'Boss Killed', add_member: 'Member Added',
          update_settings: 'Settings Updated',
        };
        const actionDot: Record<string, string> = {
          set_role: 'bg-amber-400', delete_role: 'bg-red-400',
          transfer_ownership: 'bg-violet-400', delete_server: 'bg-red-500',
          record_death: 'bg-rose-400', add_member: 'bg-emerald-400',
          update_settings: 'bg-[#71717a]',
        };
        const actionText: Record<string, string> = {
          set_role: 'text-amber-300', delete_role: 'text-red-300',
          transfer_ownership: 'text-violet-300', delete_server: 'text-red-400',
          record_death: 'text-rose-300', add_member: 'text-emerald-300',
          update_settings: 'text-[#a1a1aa]',
        };

        return (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {servers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#71717a]">Server</span>
                <select value={auditServerFilter} onChange={(e) => setAuditServerFilter(e.target.value)}
                  className="bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]">
                  <option value="all">All Servers</option>
                  {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] text-[#71717a] mr-1">Time</span>
              {["1d","3d","5d","7d","1month","all"].map(range => (
                <button key={range} onClick={() => setAuditTimeRange(range)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                    auditTimeRange === range && auditTimeRange !== "custom"
                      ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]"
                  }`}>
                  {range === "1month" ? "1M" : range === "all" ? "All" : range}
                </button>
              ))}
              <button onClick={() => setAuditTimeRange("custom")}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  auditTimeRange === "custom" ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]"
                }`}>Custom</button>
              {auditTimeRange === "custom" && (
                <div className="flex items-center gap-1 ml-1">
                  <input type="date" value={auditCustomSince} onChange={(e) => setAuditCustomSince(e.target.value)}
                    className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-[#fafafa] outline-none focus:border-[#52525b]" />
                  <span className="text-[10px] text-[#52525b]">—</span>
                  <input type="date" value={auditCustomUntil} onChange={(e) => setAuditCustomUntil(e.target.value)}
                    className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-[#fafafa] outline-none focus:border-[#52525b]" />
                </div>
              )}
            </div>
            <span className="text-[10px] text-[#52525b] ml-auto">{filteredLog.length} event{filteredLog.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Log Stream */}
          {auditLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : filteredLog.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">
              {auditServerFilter !== "all" ? `No events for "${serverMap[auditServerFilter] || auditServerFilter}".` : "No audit events yet."}
            </p>
          ) : (
            <div className="border border-[#27272a] rounded-xl overflow-hidden">
              {/* Header */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 border-b border-[#27272a] bg-[#18181b]/50 text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">
                <div className="col-span-3">Event</div>
                <div className="col-span-2">Server</div>
                <div className="col-span-3">Details</div>
                <div className="col-span-3">Timestamp</div>
                <div className="col-span-1"></div>
              </div>
              {/* Rows */}
              {filteredLog.map((entry: any) => {
                const serverName = entry.server_id ? serverMap[entry.server_id] || entry.details?.server_name || entry.details?.name : null;
                const isViewer = !!entry.viewer_key;
                const dot = actionDot[entry.action] || 'bg-[#52525b]';
                const txt = actionText[entry.action] || 'text-[#a1a1aa]';
                const detailText = entry.action === 'record_death' && entry.details?.boss_name
                  ? entry.details.boss_name
                  : entry.action === 'add_member' && entry.details?.name
                    ? entry.details.name
                    : entry.action === 'transfer_ownership' && entry.details?.old_owner
                      ? `${entry.details.old_owner?.substring(0,8)}… → ${entry.details.new_owner?.substring(0,8)}…`
                      : entry.action === 'set_role' && entry.details
                        ? `${entry.details.old_role ? entry.details.old_role + ' → ' : ''}${entry.details.role || entry.details.new_role}`
                        : entry.action === 'update_settings'
                          ? Object.entries(entry.details || {}).map(([k,v]) => `${k}: ${v}`).join(', ')
                          : '—';
                const actor = isViewer
                  ? `viewer ${entry.viewer_key?.substring(0,8)}…`
                  : entry.actor_id?.substring(0,8) + '…';

                return (
                <div key={entry.id} className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center border-b border-[#27272a]/50 last:border-b-0 hover:bg-[#18181b]/20 transition group">
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className={`text-xs font-medium truncate ${txt}`}>{actionLabel[entry.action] || entry.action}</span>
                  </div>
                  <div className="col-span-2 min-w-0">
                    {serverName ? <span className="text-[11px] text-[#a1a1aa] truncate block">{serverName}</span> : <span className="text-[#52525b]">—</span>}
                  </div>
                  <div className="col-span-3 min-w-0">
                    <span className="text-[11px] text-[#d4d4d8] truncate block">{detailText}</span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <span className="text-[10px] text-[#71717a] font-mono tabular-nums">{new Date(entry.created_at).toLocaleString()}</span>
                    <span className="text-[10px] text-[#52525b] font-mono ml-2 opacity-0 group-hover:opacity-100 transition hidden sm:inline">by {actor}</span>
                  </div>
                  <div className="col-span-1 text-right">
                    {isViewer && <span className="text-[9px] text-[#71717a]">viewer</span>}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* Database Tab */}
      {tab === "database" && (
        <div className="space-y-4">
          {dbLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : !dbStats ? (
            <p className="text-[#71717a] text-sm text-center py-12">Failed to load database stats.</p>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#fafafa]">{dbStats.db_size || '—'}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Total Size</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#a1a1aa]">{dbStats.cache_hit_ratio ?? '—'}%</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Cache Hit Ratio</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#a1a1aa]">{dbStats.active_connections ?? '—'}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Active Connections</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#a1a1aa]">{dbStats.total_connections ?? '—'}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Total Connections</p>
                </div>
              </div>

              {/* Table sizes */}
              <div>
                <h4 className="text-sm font-semibold text-[#fafafa] mb-2">Table Sizes</h4>
                <div className="space-y-1">
                  {(dbStats.table_stats || []).map((t: any) => (
                    <div key={t.table_name} className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 sm:px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm text-[#fafafa] font-medium truncate">{t.table_name}</span>
                        <span className="text-[10px] text-[#71717a] shrink-0">~{t.row_estimate} rows</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#18181b] rounded-full overflow-hidden">
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

      {/* Plan Usage Tab */}
      {tab === "plan" && (
        <div className="space-y-4">
          {planLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : !planUsage ? (
            <p className="text-[#71717a] text-sm text-center py-12">Failed to load usage data.</p>
          ) : (
            <>
              {/* Resource cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                  <p className="text-xs text-[#71717a] mb-1">Database Size</p>
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage.db_size || '—'}</p>
                  <div className="w-full h-1.5 bg-[#18181b] rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-[#a1a1aa] rounded-full" style={{ width: `${Math.min(100, ((planUsage.db_size_bytes || 0) / (8 * 1024 * 1024 * 1024)) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-[#52525b] mt-1">Pro plan (8 GB)</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                  <p className="text-xs text-[#71717a] mb-1">Auth Users</p>
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage.auth_users ?? '—'}</p>
                  <p className="text-[10px] text-[#52525b] mt-2">{planUsage.active_auth_users_30d ?? 0} active last 30d</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                  <p className="text-xs text-[#71717a] mb-1">Connections</p>
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage.total_connections}/{planUsage.max_connections}</p>
                  <div className="w-full h-1.5 bg-[#18181b] rounded-full mt-2 overflow-hidden flex">
                    <div className="h-full bg-blue-500 rounded-l-full" style={{ width: `${((planUsage.active_connections || 0) / (planUsage.max_connections || 1)) * 100}%` }} />
                    <div className="h-full bg-[#3f3f46] rounded-r-full" style={{ width: `${((planUsage.idle_connections || 0) / (planUsage.max_connections || 1)) * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                    <span className="text-[#a1a1aa] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Active: {planUsage.active_connections ?? 0}</span>
                    <span className="text-[#71717a] flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3f3f46] inline-block" />Idle: {planUsage.idle_connections ?? 0}</span>
                  </div>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                  <p className="text-xs text-[#71717a] mb-1">Storage</p>
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage.storage_size_pretty || '0 bytes'}</p>
                  <p className="text-[10px] text-[#52525b] mt-2">{planUsage.storage_objects ?? 0} objects</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                  <p className="text-xs text-[#71717a] mb-1">Total Rows</p>
                  <p className="text-xl font-bold text-[#fafafa]">{planUsage.total_rows?.toLocaleString() ?? '—'}</p>
                  <p className="text-[10px] text-[#52525b] mt-2">{planUsage.table_count ?? 0} tables</p>
                </div>
              </div>

              {/* Free tier limits reference */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                <h4 className="text-sm font-semibold text-[#fafafa] mb-2">Plan Limits (Pro)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-[#71717a]">Database:</span> <span className="text-[#fafafa]">8 GB</span></div>
                  <div><span className="text-[#71717a]">Auth Users:</span> <span className="text-[#fafafa]">100K</span></div>
                  <div><span className="text-[#71717a]">Storage:</span> <span className="text-[#fafafa]">100 GB</span></div>
                  <div><span className="text-[#71717a]">Bandwidth:</span> <span className="text-[#fafafa]">250 GB</span></div>
                  <div className="mt-1"><span className="text-[#71717a]">Edge Functions:</span> <span className="text-[#fafafa]">2M/mo</span></div>
                  <div className="mt-1"><span className="text-[#71717a]">Realtime:</span> <span className="text-[#fafafa]">500 concurrent</span></div>
                  <div className="mt-1"><span className="text-[#71717a]">API Requests:</span> <span className="text-[#fafafa]">Unlimited</span></div>
                  <div className="mt-1"><span className="text-[#71717a]">Daily Backups:</span> <span className="text-[#fafafa]">7 days</span></div>
                </div>
              </div>

              <p className="text-[10px] text-[#52525b] text-right">
                Snapshot at {new Date(planUsage.timestamp).toLocaleString()}
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
                <div className={`bg-[#18181b] border rounded-xl p-4 text-center ${cronStatus.active ? 'border-[#27272a]' : 'border-[#27272a]'}`}>
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${cronStatus.active ? 'bg-[#a1a1aa]' : 'bg-[#71717a]'}`} />
                  <p className={`text-lg font-bold ${cronStatus.active ? 'text-[#a1a1aa]' : 'text-[#f87171]'}`}>
                    {cronStatus.active ? 'ACTIVE' : 'INACTIVE'}
                  </p>
                  <p className="text-[10px] text-[#71717a] mt-1">Cron Status</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <Clock className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-xs text-[#d4d4d8] font-mono">
                    {cronStatus.last_run ? cronStatus.last_run : 'Never'}
                  </p>
                  <p className="text-[10px] text-[#71717a] mt-1">Last Run (Manila)</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <Server className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-lg font-bold text-[#d4d4d8]">{cronStatus.servers?.length ?? 0}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Test Servers</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
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
                    <div key={srv.name} className="bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-[#fafafa]">{srv.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 sm:w-32 h-2 bg-[#18181b] rounded-full overflow-hidden">
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
      {tab === "deleted" && (
        <div className="space-y-2">
          {deletedLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : deletedServers.length === 0 ? (
            <p className="text-[#71717a] text-sm text-center py-12">No deleted servers.</p>
          ) : (
            deletedServers.map((s: any) => (
              <div key={s.id} className="bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#fafafa] font-medium">{s.name}</p>
                  <p className="text-xs text-[#71717a]">Deleted {new Date(s.deleted_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await restoreServer(s.id);
                      refetchDeleted();
                    } catch (err: any) {
                      console.error("Restore failed:", err);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Infra Tab */}
      {tab === "infra" && (
        <div className="space-y-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`bg-[#18181b] border rounded-xl p-4 text-center ${botStatus.discord_connected ? 'border-emerald-500/30' : 'border-[#27272a]'}`}>
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${botStatus.discord_connected ? 'bg-emerald-400 animate-pulse' : 'bg-[#71717a]'}`} />
                  <p className={`text-lg font-bold ${botStatus.discord_connected ? 'text-emerald-300' : 'text-[#f87171]'}`}>
                    {botStatus.discord_connected ? 'ONLINE' : 'OFFLINE'}
                  </p>
                  <p className="text-[10px] text-[#71717a] mt-1">Discord Gateway</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <Clock className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-xs text-[#d4d4d8] font-mono">{botStatus.uptime_display}</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Uptime</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <HardDrive className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-lg font-bold text-[#d4d4d8]">{botStatus.memory_mb} / 512 MB</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Memory</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-center">
                  <Radio className="w-4 h-4 text-[#a1a1aa] mx-auto mb-2" />
                  <p className="text-xs text-[#d4d4d8] font-mono">{botStatus.region} · 2 vCPU</p>
                  <p className="text-[10px] text-[#71717a] mt-1">Machine</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3 text-center">
                  <p className="text-xs text-[#d4d4d8] font-mono">{botStatus.node_version}</p>
                  <p className="text-[10px] text-[#71717a] mt-0.5">Node.js</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3 text-center">
                  <p className="text-xs text-[#d4d4d8] font-mono">fly.io</p>
                  <p className="text-[10px] text-[#71717a] mt-0.5">Platform</p>
                </div>
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3 text-center">
                  <p className="text-xs text-[#d4d4d8] font-mono">sin</p>
                  <p className="text-[10px] text-[#71717a] mt-0.5">Region</p>
                </div>
              </div>
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
                <h5 className="text-xs font-semibold text-[#d4d4d8] mb-3">Spawn Cron</h5>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-[#d4d4d8] font-mono">{botStatus.spawn_cron?.last_tick_seconds_ago ?? "—"}s</p>
                    <p className="text-[10px] text-[#71717a]">Last Tick</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#d4d4d8]">{botStatus.spawn_cron?.servers_checked}</p>
                    <p className="text-[10px] text-[#71717a]">Servers</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#d4d4d8]">{botStatus.spawn_cron?.bosses_checked}</p>
                    <p className="text-[10px] text-[#71717a]">Bosses</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#52525b]">Auto-refreshes every 15s.</p>
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a]">
                  <h5 className="text-xs font-semibold text-[#d4d4d8]">Recent Logs</h5>
                  <button onClick={() => refetchLogs()} className="p-1 rounded text-[#a1a1aa] hover:text-[#fafafa] transition" title="Refresh logs">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto font-mono text-[10px] leading-relaxed">
                  {logsLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-[#71717a] animate-spin" /></div>
                  ) : !botLogs?.logs?.length ? (
                    <p className="text-[#52525b] px-4 py-6 text-center">No logs yet.</p>
                  ) : (
                    botLogs.logs.map((l: any, i: number) => (
                      <div key={i} className={`px-4 py-0.5 border-b border-[#27272a]/50 flex gap-2 ${
                        l.level === "error" ? "bg-[#18181b]" : l.level === "warn" ? "bg-[#18181b]" : ""
                      }`}>
                        <span className="text-[#52525b] shrink-0 w-[85px]">{l.ts?.slice(11, 19)}</span>
                        <span className={`shrink-0 w-8 text-right ${
                          l.level === "error" ? "text-[#f87171]" : l.level === "warn" ? "text-[#a1a1aa]" : "text-[#71717a]"
                        }`}>{l.level}</span>
                        <span className={`truncate ${
                          l.level === "error" ? "text-[#fca5a5]" : l.level === "warn" ? "text-[#d4d4d8]" : "text-[#a1a1aa]"
                        }`}>{l.msg}</span>
                      </div>
                    ))
                  )}
                </div>
                {botLogs?.logs?.length > 0 && (
                  <div className="px-4 py-1.5 border-t border-[#27272a] text-[10px] text-[#52525b]">
                    Showing {botLogs.logs.length} of {botLogs.total} buffered logs
                  </div>
                )}
              </div>

              {/* Maintenance Mode */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-[#fafafa]">Maintenance Mode</h4>
                    <p className="text-xs text-[#71717a]">Block all non-admin users. Set an end time so users know when to return.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!maintenance) {
                        if (!maintEndDate || !maintEndTime) return;
                        const endISO = new Date(`${maintEndDate}T${maintEndTime}:00`).toISOString();
                        await supabase.from("app_settings").upsert({ key: "maintenance_end", value: endISO }, { onConflict: "key" });
                        await supabase.from("app_settings").upsert({ key: "maintenance_mode", value: "true" }, { onConflict: "key" });
                      } else {
                        await supabase.from("app_settings").upsert({ key: "maintenance_mode", value: "false" }, { onConflict: "key" });
                      }
                      setMaintenance(!maintenance);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      maintenance
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
                    }`}
                  >
                    {maintenance ? "Turn OFF" : "Turn ON"}
                  </button>
                </div>
                {!maintenance && (
                  <div className="flex gap-2">
                    <input type="date" value={maintEndDate} onChange={e => setMaintEndDate(e.target.value)}
                      className="px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#fafafa]" />
                    <input type="time" value={maintEndTime} onChange={e => setMaintEndTime(e.target.value)}
                      className="px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#fafafa]" />
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

      {/* Footer */}
      <footer className="border-t border-[#27272a]/50 bg-gradient-to-b from-[#09090b] to-[#09090b] mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-5 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#71717a]">
            <img src="/logo.png" alt="" className="w-4 h-4 rounded opacity-40" />
            <span>RaidScout — Track boss respawn timers across any game, schedule hunts, and monitor member performance across your guild. </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#52525b] flex-wrap">
            <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#a1a1aa] transition" title="Join our Discord community">
              <ExternalLink className="w-3 h-3" />
              Discord Community
            </a>
            <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#a1a1aa] transition" title="Follow us on Facebook">
              <ExternalLink className="w-3 h-3" />
              Facebook Page
            </a>
            <span className="text-[#3f3f46]">|</span>
            <Link to="/terms" className="hover:text-[#a1a1aa] transition">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-[#a1a1aa] transition">Privacy Policy</Link>
            <span className="text-[#3f3f46]">|</span>
            <span>v{version}</span>
            <span>© 2026 RaidScout. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {/* Logout Confirm */}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        onConfirm={signOut}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
