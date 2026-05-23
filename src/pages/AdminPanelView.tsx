import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAllServers, fetchAllUsers, fetchAuditLog, fetchServerStats, supabase } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Shield, Server, Users, Eye, ChevronDown, ChevronUp, ClipboardList } from "lucide-react";

export function AdminPanelView() {
  const [tab, setTab] = useState<"servers" | "users" | "audit">("servers");
  const { setCurrentServer } = useServer();
  const { userRole } = useAuth();
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userServers, setUserServers] = useState<Record<string, { server_id: string; server_name: string; role: string }[]>>({});
  const [loadingServers, setLoadingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<Record<string, any>>({});
  const [auditServerFilter, setAuditServerFilter] = useState<string>("all");
  const navigate = useNavigate();

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
    enabled: userRole === "admin" && tab === "users",
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => fetchAuditLog(200),
    staleTime: 15_000,
    enabled: userRole === "admin" && tab === "audit",
  });

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
      <div className="flex bg-slate-800 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setTab("servers")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            tab === "servers" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Server className="w-4 h-4" />
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setTab("users")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            tab === "users" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          Users ({users.length})
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition ${
            tab === "audit" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Audit Log
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
            servers.map((s: any) => {
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
                        } catch { /* ignore */ }
                      }
                    }
                  }}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition text-left"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-white">{s.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{s.id?.substring(0, 12)}...</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-slate-400">Created {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-800 px-4 py-3 space-y-2">
                    {!stats ? (
                      <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
                            <p className="text-lg font-bold text-white">{stats.member_count ?? 0}</p>
                            <p className="text-[10px] text-slate-500">Members</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
                            <p className="text-lg font-bold text-white">{stats.boss_count ?? 0}</p>
                            <p className="text-[10px] text-slate-500">Bosses</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
                            <p className="text-lg font-bold text-white">{stats.death_count ?? 0}</p>
                            <p className="text-[10px] text-slate-500">Kills</p>
                          </div>
                          <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-center">
                            <p className={`text-lg font-bold ${stats.has_webhook ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {stats.has_webhook ? 'ON' : 'OFF'}
                            </p>
                            <p className="text-[10px] text-slate-500">Webhook</p>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCurrentServer({ id: s.id, name: s.name, owner_id: s.owner_id, invite_code: s.id?.substring(0, 8) ?? "", role: "owner" });
                              navigate("/");
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition"
                          >
                            <Eye className="w-3 h-3" />
                            View Server
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      )}

      {/* Users Tab */}
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
                                setCurrentServer({ id: s.server_id, name: s.server_name, owner_id: u.user_id, invite_code: s.server_id?.substring(0, 8) ?? "", role: s.role as "owner" | "moderator" });
                                navigate("/");
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-500 transition"
                            >
                              <Eye className="w-3 h-3" />
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
        // Extract unique server names from audit entries
        const serverNames = [...new Set(
          auditLog
            .map((e: any) => e.details?.server_name || e.details?.name)
            .filter(Boolean)
        )] as string[];

        const filteredLog = auditServerFilter === "all"
          ? auditLog
          : auditLog.filter((e: any) =>
              e.details?.server_name === auditServerFilter ||
              e.details?.name === auditServerFilter
            );

        return (
        <div className="space-y-3">
          {/* Server filter */}
          {serverNames.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter by server:</span>
              <select
                value={auditServerFilter}
                onChange={(e) => setAuditServerFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-slate-500"
              >
                <option value="all">All Servers</option>
                {serverNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <span className="text-[10px] text-slate-600">
                {filteredLog.length} event{filteredLog.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {auditLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
          ) : filteredLog.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-12">
              {auditServerFilter !== "all" ? `No audit events for "${auditServerFilter}".` : "No audit events yet."}
            </p>
          ) : (
            filteredLog.map((entry: any) => (
              <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 flex items-start gap-3">
                <div className={`shrink-0 w-2 h-2 mt-1.5 rounded-full ${
                  entry.action === 'set_role' ? 'bg-purple-400' :
                  entry.action === 'delete_role' ? 'bg-red-400' :
                  entry.action === 'transfer_ownership' ? 'bg-amber-400' :
                  entry.action === 'delete_server' ? 'bg-red-500' :
                  'bg-slate-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">
                      {entry.action === 'set_role' ? 'Role Changed' :
                       entry.action === 'delete_role' ? 'Role Removed' :
                       entry.action === 'transfer_ownership' ? 'Ownership Transferred' :
                       entry.action === 'delete_server' ? 'Server Deleted' :
                       entry.action}
                    </span>
                    {(entry.details?.server_name || entry.details?.name) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                        {entry.details.server_name || entry.details.name}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {entry.action === 'transfer_ownership' && entry.details?.old_owner
                      ? `${entry.details.old_owner?.substring(0,8)}... → ${entry.details.new_owner?.substring(0,8)}...`
                      : entry.action === 'set_role' && entry.details
                        ? `${entry.details.old_role ? entry.details.old_role + ' → ' : ''}${entry.details.role || entry.details.new_role}`
                        : entry.target_type
                          ? `${entry.target_type}: ${entry.target_id?.substring(0, 8)}...`
                          : ''}
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                    by {entry.actor_id?.substring(0, 8)}...
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        );
      })()}
    </div>
  );
}
