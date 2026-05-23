import { useState } from "react";
import { supabase, createServer, createGuild, fetchBosses, setBossGuilds } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Key, Server, ArrowRight, LogOut } from "lucide-react";

export function NoServerView() {
  const { refreshServers } = useServer();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [serverName, setServerName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const serverTrimmed = serverName.trim();
    const guildTrimmed = guildName.trim();
    if (!serverTrimmed || !guildTrimmed) return;
    setLoading(true);
    setError(null);
    try {
      const server = await createServer(serverTrimmed);
      const guild = await createGuild(guildTrimmed, server.id);
      // Assign all bosses to this guild
      const bosses = await fetchBosses(server.id);
      for (const boss of bosses) {
        try { await setBossGuilds(boss.id, [{ guild_id: guild.id, sort_order: 0 }], "rotation"); } catch {}
      }
      await refreshServers();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create server");
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("join_server_by_invite", {
        invite: inviteCode.trim(),
      });
      if (rpcErr) throw rpcErr;
      if ((data as any)?.error) {
        setError((data as any).error);
        setLoading(false);
        return;
      }
      await refreshServers();
    } catch (err: any) {
      setError(err?.message ?? "Failed to join server");
      setLoading(false);
    }
  };

  if (mode === "choose") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-sm">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-400">
            <Server className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Welcome!</h2>
            <p className="text-slate-400 text-sm mt-1">
              You don't have a server yet. Choose how to get started.
            </p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setMode("create")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 transition text-left"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-5 h-5" />
                <div>
                  <p className="font-semibold text-sm">Create a Server</p>
                  <p className="text-xs text-emerald-200">Start fresh with 39 bosses pre-loaded</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 transition text-left"
            >
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="font-semibold text-sm">Join as Moderator</p>
                  <p className="text-xs text-slate-400">Enter an invite code from a server owner</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <button
            onClick={signOut}
            className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-red-400 transition"
          >
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-xl bg-emerald-900/30">
            <Plus className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Create a Server</h2>
          <p className="text-sm text-slate-400">
            Your server will come with 39 bosses pre-loaded. A default guild is required.
          </p>
          <input
            type="text"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="Server name..."
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
          />
          <input
            type="text"
            value={guildName}
            onChange={(e) => setGuildName(e.target.value)}
            placeholder="Default guild name (required)..."
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={loading || !serverName.trim() || !guildName.trim()}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
            Create Server
          </button>
          <button onClick={() => { setMode("choose"); setError(null); }} className="text-xs text-slate-500 hover:text-slate-400">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // Join mode
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm w-full">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-xl bg-blue-900/30">
          <Key className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Join as Moderator</h2>
        <p className="text-sm text-slate-400">
          Ask the server owner for their invite code to join as a moderator.
        </p>
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Enter invite code..."
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition text-center"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={loading || !inviteCode.trim()}
          className="w-full py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Join Server
        </button>
        <button onClick={() => { setMode("choose"); setError(null); }} className="text-xs text-slate-500 hover:text-slate-400">
          ← Back
        </button>
      </div>
    </div>
  );
}
