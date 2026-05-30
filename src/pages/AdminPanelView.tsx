import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAllServers, fetchAllUsers, fetchAuditLog, fetchServerStats, fetchDatabaseStats, fetchPlanUsage, fetchCronStatus, supabase } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Shield, Server, Users, Eye, ChevronDown, ChevronUp, ClipboardList, HardDrive, BarChart3, Crosshair, Skull, Activity, Radio, Clock } from "lucide-react";

export function AdminPanelView() {
  const [tab, setTab] = useState<"servers" | "users" | "audit" | "database" | "plan" | "cron">("servers");
  const { setCurrentServer } = useServer();
  const { userRole } = useAuth();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userServers, setUserServers] = useState<Record<string, { server_id: string; server_name: string; role: string }[]>>({});
  const [loadingServers, setLoadingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<Record<string, any>>({});
  const [auditServerFilter, setAuditServerFilter] = useState<string>("all");
  const [auditTimeRange, setAuditTimeRange] = useState<string>("1d");
  const [auditCustomSince, setAuditCustomSince] = useState("");
  const [auditCustomUntil, setAuditCustomUntil] = useState("");
  const navigate = useNavigate();

  // Redirect non-admin users
  useEffect(() => {
    if (userRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [userRole, navigate]);

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
  useEffect(() => {
    if (tab === "audit" && auditServerFilter === "all" && servers.length > 0) {
      setAuditServerFilter(servers[0].id);
    }
  }, [tab, servers, auditServerFilter]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-400">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Admin Panel</h2>
          <p className="text-sm text-slate-400">Oversee all servers and users</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800 rounded-lg p-0.5 gap-0.5 overflow-x-auto">
        <button
          onClick={() => setTab("servers")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "servers" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setTab("users")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "users" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Owners ({users.length})
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "audit" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Audit Log
        </button>
        <button
          onClick={() => setTab("database")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "database" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          Database
        </button>
        <button
          onClick={() => setTab("plan")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "plan" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Usage
        </button>
        <button
          onClick={() => setTab("cron")}
          className={`flex flex-1 items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
            tab === "cron" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Test Cron
        </button>
      </div>

      {/* Servers Tab */}
      {tab === "servers" && (
        <div className="space-y-2">
          {srvLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : servers.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">No servers yet.</p>
          ) : (
            (() => {
              const testServers = servers.filter((s: any) => s.name.toLowerCase().includes('test'));
              const regularServers = servers.filter((s: any) => !s.name.toLowerCase().includes('test'));

              const renderServer = (s: any) => {
              const isExpanded = expandedServer === s.id;
              const stats = serverStats[s.id];
              return (
              <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                  className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-slate-800/50 transition text-left"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <h4 className="text-sm font-semibold text-white truncate">{s.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{s.id?.substring(0, 12)}...</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-300">
                      <Users className="w-3.5 h-3.5" />
                      {s.raid_member_count ?? 0}
                    </span>
                    <div className="hidden sm:block text-right">
                      <p className="text-[10px] text-slate-400">Created {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-800 px-4 py-3 space-y-2">
                    {!stats ? (
                      <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                    ) : (stats as any).error ? (
                      <p className="text-xs text-red-400">Failed to load stats</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-lg px-3 py-2.5 text-center">
                            <Users className="w-3.5 h-3.5 text-violet-400 mx-auto mb-0.5" />
                            <p className="text-lg font-bold text-violet-300">{stats.total_raid_members ?? 0}</p>
                            <p className="text-[10px] text-violet-400/60">Players</p>
                          </div>
                          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 rounded-lg px-3 py-2.5 text-center">
                            <Shield className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
                            <p className="text-lg font-bold text-blue-300">{stats.member_count ?? 0}</p>
                            <p className="text-[10px] text-blue-400/60">Mods</p>
                          </div>
                          <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5 text-center">
                            <Crosshair className="w-3.5 h-3.5 text-amber-400 mx-auto mb-0.5" />
                            <p className="text-lg font-bold text-amber-300">{stats.boss_count ?? 0}</p>
                            <p className="text-[10px] text-amber-400/60">Bosses</p>
                          </div>
                          <div className="bg-gradient-to-br from-rose-500/10 to-red-500/5 border border-rose-500/20 rounded-lg px-3 py-2.5 text-center">
                            <Skull className="w-3.5 h-3.5 text-rose-400 mx-auto mb-0.5" />
                            <p className="text-lg font-bold text-rose-300">{stats.death_count ?? 0}</p>
                            <p className="text-[10px] text-rose-400/60">Kills</p>
                          </div>
                          <div className={`bg-gradient-to-br rounded-lg border px-3 py-2.5 text-center ${
                            stats.has_webhook
                              ? 'from-emerald-500/10 to-green-500/5 border-emerald-500/30'
                              : 'from-slate-500/10 to-slate-500/5 border-slate-500/20'
                          }`}>
                            <Radio className={`w-3.5 h-3.5 mx-auto mb-0.5 ${stats.has_webhook ? 'text-emerald-400' : 'text-slate-500'}`} />
                            <p className={`text-lg font-bold ${stats.has_webhook ? 'text-emerald-300' : 'text-slate-500'}`}>
                              {stats.has_webhook ? 'ON' : 'OFF'}
                            </p>
                            <p className={`text-[10px] ${stats.has_webhook ? 'text-emerald-400/60' : 'text-slate-600'}`}>Bot Alerts</p>
                          </div>
                        </div>
                        {stats.guild_members && stats.guild_members.length > 0 && (() => {
                          const guildColors = [
                            'bg-amber-500/15 text-amber-300 border-amber-500/20',
                            'bg-violet-500/15 text-violet-300 border-violet-500/20',
                            'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
                            'bg-rose-500/15 text-rose-300 border-rose-500/20',
                            'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
                            'bg-orange-500/15 text-orange-300 border-orange-500/20',
                            'bg-pink-500/15 text-pink-300 border-pink-500/20',
                            'bg-lime-500/15 text-lime-300 border-lime-500/20',
                            'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
                            'bg-teal-500/15 text-teal-300 border-teal-500/20',
                          ];
                          return (
                          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg px-3 py-2.5">
                            <div className="flex items-center gap-1 mb-2">
                              <Users className="w-3 h-3 text-violet-400" />
                              <p className="text-[11px] font-medium text-slate-300">
                                Players by Guild
                                <span className="text-slate-500 ml-1">({stats.total_raid_members ?? 0} total)</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {stats.guild_members.map((g: any, i: number) => {
                                const isNoGuild = g.guild === 'No Guild';
                                const colorClass = isNoGuild
                                  ? 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                                  : guildColors[i % guildColors.length];
                                return (
                                <span
                                  key={g.guild}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${colorClass}`}
                                >
                                  <span className="truncate max-w-[120px]">{g.guild}</span>
                                  <span className={`tabular-nums font-bold ${isNoGuild ? 'text-slate-500' : ''}`}>{g.count}</span>
                                </span>
                                );
                              })}
                            </div>
                          </div>
                          );
                        })()}
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentServer({ id: s.id, name: s.name, owner_id: s.owner_id, invite_code: s.id?.substring(0, 8) ?? "", created_at: s.created_at, role: "owner" });
                              navigate("/");
                            }}
                            className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 transition shadow-sm shadow-blue-900/20"
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
                  {regularServers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Servers ({regularServers.length})
                      </h4>
                      <div className="space-y-2">
                        {regularServers.map(renderServer)}
                      </div>
                    </div>
                  )}
                  {testServers.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
        <div className="space-y-2">
          {usrLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">No users registered.</p>
          ) : (
            users.map((u: any) => {
              const isExpanded = expandedUser === u.user_id;
              const servers = userServers[u.user_id] ?? [];
              return (
                <div key={u.user_id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                    className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition text-left"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-white">{u.email ?? "No email"}</h4>
                      <p className="text-[10px] text-slate-500 font-mono">{u.user_id?.substring(0, 12)}...</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        u.role === "admin" ? "bg-purple-900/50 text-purple-400" : "bg-slate-800 text-slate-400"
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[10px] text-slate-500">
                        Joined {new Date(u.created_at).toLocaleDateString()}
                      </p>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-800 px-4 py-3 space-y-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Servers</p>
                      {loadingServers ? (
                        <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                      ) : servers.length === 0 ? (
                        <p className="text-xs text-slate-500">No servers.</p>
                      ) : (
                        servers.map((s) => (
                          <div key={s.server_id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Server className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-sm text-white font-medium">{s.server_name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                s.role === "owner" ? "text-amber-400 bg-amber-900/30" : "text-slate-400 bg-slate-800"
                              }`}>
                                {s.role}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setCurrentServer({ id: s.server_id, name: s.server_name, owner_id: u.user_id, invite_code: s.server_id?.substring(0, 8) ?? "", created_at: (s as any).created_at, role: s.role as "owner" | "moderator" });
                                navigate("/");
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition"
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
            })
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === "audit" && (() => {
        // Build server ID → name map from already-loaded servers list
        const serverMap: Record<string, string> = {};
        for (const s of servers) {
          serverMap[s.id] = s.name;
        }

        const filteredLog = auditServerFilter === "all"
          ? auditLog
          : auditLog.filter((e: any) => e.server_id === auditServerFilter);

        return (
        <div className="space-y-3">
          {/* Server filter */}
          {servers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Server:</span>
              <select
                value={auditServerFilter}
                onChange={(e) => setAuditServerFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-slate-500"
              >
                <option value="all">All Servers</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-slate-600">
                {filteredLog.length} event{filteredLog.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Time range filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-slate-500 mr-1">Time:</span>
            {["1d", "3d", "5d", "7d", "1month", "all"].map(range => (
              <button
                key={range}
                onClick={() => setAuditTimeRange(range)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  auditTimeRange === range && auditTimeRange !== "custom"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                {range === "1month" ? "1M" : range === "all" ? "All" : range}
              </button>
            ))}
            <button
              onClick={() => setAuditTimeRange("custom")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                auditTimeRange === "custom"
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              Custom
            </button>
            {auditTimeRange === "custom" && (
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="date"
                  value={auditCustomSince}
                  onChange={(e) => setAuditCustomSince(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-slate-500"
                />
                <span className="text-[10px] text-slate-600">to</span>
                <input
                  type="date"
                  value={auditCustomUntil}
                  onChange={(e) => setAuditCustomUntil(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white outline-none focus:border-slate-500"
                />
              </div>
            )}
          </div>

          {auditLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : filteredLog.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">
              {auditServerFilter !== "all" ? `No audit events for "${serverMap[auditServerFilter] || auditServerFilter}".` : "No audit events yet."}
            </p>
          ) : (
            filteredLog.map((entry: any) => {
              const actionLabel: Record<string, string> = {
                set_role: 'Role Changed',
                delete_role: 'Role Removed',
                transfer_ownership: 'Ownership Transferred',
                delete_server: 'Server Deleted',
                record_death: 'Boss Killed',
                add_member: 'Member Added',
                update_settings: 'Settings Updated',
              };
              const actionColor: Record<string, string> = {
                set_role: 'bg-purple-400',
                delete_role: 'bg-red-400',
                transfer_ownership: 'bg-amber-400',
                delete_server: 'bg-red-500',
                record_death: 'bg-emerald-400',
                add_member: 'bg-blue-400',
                update_settings: 'bg-slate-400',
              };
              const serverName = entry.server_id ? serverMap[entry.server_id] || entry.details?.server_name || entry.details?.name : null;
              const isViewer = !!entry.viewer_key;

              return (
              <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-start gap-3">
                <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${actionColor[entry.action] || 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {actionLabel[entry.action] || entry.action}
                    </span>
                    {serverName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                        {serverName}
                      </span>
                    )}
                    {isViewer && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-400 font-medium">
                        Viewer
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {entry.action === 'record_death' && entry.details?.boss_name
                      ? entry.details.boss_name
                      : entry.action === 'add_member' && entry.details?.name
                        ? entry.details.name
                        : entry.action === 'update_settings'
                          ? Object.entries(entry.details || {}).map(([k, v]) => `${k}: ${v}`).join(', ')
                          : entry.action === 'transfer_ownership' && entry.details?.old_owner
                            ? `${entry.details.old_owner?.substring(0,8)}... → ${entry.details.new_owner?.substring(0,8)}...`
                            : entry.action === 'set_role' && entry.details
                              ? `${entry.details.old_role ? entry.details.old_role + ' → ' : ''}${entry.details.role || entry.details.new_role}`
                              : entry.target_type
                                ? `${entry.target_type}: ${entry.target_id?.substring(0, 8)}...`
                                : ''}
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                    by {isViewer ? entry.viewer_key?.substring(0, 8) + '...' : entry.actor_id?.substring(0, 8) + '...'}
                  </p>
                </div>
              </div>
              );
            })
          )}
        </div>
        );
      })()}

      {/* Database Tab */}
      {tab === "database" && (
        <div className="space-y-4">
          {dbLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : !dbStats ? (
            <p className="text-slate-500 text-sm text-center py-12">Failed to load database stats.</p>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">{dbStats.db_size || '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Total Size</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{dbStats.cache_hit_ratio ?? '—'}%</p>
                  <p className="text-[10px] text-slate-500 mt-1">Cache Hit Ratio</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{dbStats.active_connections ?? '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Active Connections</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-400">{dbStats.total_connections ?? '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Total Connections</p>
                </div>
              </div>

              {/* Table sizes */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Table Sizes</h4>
                <div className="space-y-1">
                  {(dbStats.table_stats || []).map((t: any) => (
                    <div key={t.table_name} className="bg-slate-900 border border-slate-800 rounded-lg px-3 sm:px-4 py-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-sm text-white font-medium truncate">{t.table_name}</span>
                        <span className="text-[10px] text-slate-500 shrink-0">~{t.row_estimate} rows</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/60 rounded-full"
                            style={{
                              width: `${Math.min(100, ((t.size_bytes || 0) / Math.max(1, ...(dbStats.table_stats || []).map((x: any) => x.size_bytes || 0))) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 w-14 text-right shrink-0">{t.size}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-slate-600 text-right">
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
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : !planUsage ? (
            <p className="text-slate-500 text-sm text-center py-12">Failed to load usage data.</p>
          ) : (
            <>
              {/* Resource cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Database Size</p>
                  <p className="text-xl font-bold text-white">{planUsage.db_size || '—'}</p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, ((planUsage.db_size_bytes || 0) / (8 * 1024 * 1024 * 1024)) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">Pro plan (8 GB)</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Auth Users</p>
                  <p className="text-xl font-bold text-white">{planUsage.auth_users ?? '—'}</p>
                  <p className="text-[10px] text-slate-600 mt-2">{planUsage.active_auth_users_30d ?? 0} active last 30d</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Connections</p>
                  <p className="text-xl font-bold text-white">{planUsage.total_connections}/{planUsage.max_connections}</p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden flex">
                    <div className="h-full bg-blue-500 rounded-l-full" style={{ width: `${((planUsage.active_connections || 0) / (planUsage.max_connections || 1)) * 100}%` }} />
                    <div className="h-full bg-slate-600 rounded-r-full" style={{ width: `${((planUsage.idle_connections || 0) / (planUsage.max_connections || 1)) * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                    <span className="text-blue-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Active: {planUsage.active_connections ?? 0}</span>
                    <span className="text-slate-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />Idle: {planUsage.idle_connections ?? 0}</span>
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Storage</p>
                  <p className="text-xl font-bold text-white">{planUsage.storage_size_pretty || '0 bytes'}</p>
                  <p className="text-[10px] text-slate-600 mt-2">{planUsage.storage_objects ?? 0} objects</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Rows</p>
                  <p className="text-xl font-bold text-white">{planUsage.total_rows?.toLocaleString() ?? '—'}</p>
                  <p className="text-[10px] text-slate-600 mt-2">{planUsage.table_count ?? 0} tables</p>
                </div>
              </div>

              {/* Free tier limits reference */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Plan Limits (Pro)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500">Database:</span> <span className="text-white">8 GB</span></div>
                  <div><span className="text-slate-500">Auth Users:</span> <span className="text-white">100K</span></div>
                  <div><span className="text-slate-500">Storage:</span> <span className="text-white">100 GB</span></div>
                  <div><span className="text-slate-500">Bandwidth:</span> <span className="text-white">250 GB</span></div>
                  <div className="mt-1"><span className="text-slate-500">Edge Functions:</span> <span className="text-white">2M/mo</span></div>
                  <div className="mt-1"><span className="text-slate-500">Realtime:</span> <span className="text-white">500 concurrent</span></div>
                  <div className="mt-1"><span className="text-slate-500">API Requests:</span> <span className="text-white">Unlimited</span></div>
                  <div className="mt-1"><span className="text-slate-500">Daily Backups:</span> <span className="text-white">7 days</span></div>
                </div>
              </div>

              <p className="text-[10px] text-slate-600 text-right">
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
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : !cronStatus ? (
            <p className="text-slate-500 text-sm text-center py-12">Failed to load cron status.</p>
          ) : (
            <>
              {/* Status cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`bg-slate-900 border rounded-xl p-4 text-center ${cronStatus.active ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                  <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${cronStatus.active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <p className={`text-lg font-bold ${cronStatus.active ? 'text-emerald-400' : 'text-red-400'}`}>
                    {cronStatus.active ? 'ACTIVE' : 'INACTIVE'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Cron Status</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <Clock className="w-4 h-4 text-blue-400 mx-auto mb-2" />
                  <p className="text-xs text-blue-300 font-mono">
                    {cronStatus.last_run ? cronStatus.last_run : 'Never'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Last Run (Manila)</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <Server className="w-4 h-4 text-purple-400 mx-auto mb-2" />
                  <p className="text-lg font-bold text-purple-300">{cronStatus.servers?.length ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Test Servers</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                  <Skull className="w-4 h-4 text-red-400 mx-auto mb-2" />
                  <p className="text-lg font-bold text-red-300">{cronStatus.total_kills?.toLocaleString() ?? 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Total Kills</p>
                </div>
              </div>

              {/* Per-server breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Kills per Test Server</h4>
                <div className="space-y-1">
                  {(cronStatus.servers || []).map((srv) => (
                    <div key={srv.name} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 flex items-center justify-between">
                      <span className="text-sm text-white">{srv.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 sm:w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                            style={{ width: `${Math.min(100, (srv.kills / Math.max(1, cronStatus.total_kills)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono text-slate-400 w-10 text-right">{srv.kills}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-slate-600">Auto-refreshes every 30s. Cron runs every 5 min.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
