import { useState, useEffect } from "react";
import { supabase, createServer, fetchGames } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Key, Server, ArrowRight, LogOut, Gamepad2 } from "lucide-react";

export function NoServerView() {
  const { refreshServers } = useServer();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [serverName, setServerName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [seed, setSeed] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(true);

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
  }, []);

  const handleCreate = async () => {
    const serverTrimmed = serverName.trim();
    const guildTrimmed = guildName.trim();
    if (!serverTrimmed || !guildTrimmed || !selectedGame) return;
    setLoading(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from("servers")
        .select("id")
        .eq("name", serverTrimmed)
        .maybeSingle();
      if (existing) {
        setError("A server with this name already exists.");
        setLoading(false);
        return;
      }
      const gameId = selectedGame.id === "custom" ? null : selectedGame.id;
      const isSeeded = selectedGame.id !== "custom" && seed;
      await createServer(serverTrimmed, gameId as any, isSeeded, guildTrimmed);
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
      const { data, error: rpcErr } = await supabase.rpc("join_server_by_invite", { invite: inviteCode.trim() });
      if (rpcErr) throw rpcErr;
      if ((data as any)?.error) { setError((data as any).error); setLoading(false); return; }
      await refreshServers();
    } catch (err: any) {
      setError(err?.message ?? "Failed to join server");
      setLoading(false);
    }
  };

  if (loading) {
    const isSeeded = selectedGame && selectedGame.id !== "custom" && seed;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
            <div className="absolute inset-0 rounded-full border-4 border-t-emerald-400 border-r-emerald-400/30 border-b-emerald-400/10 border-l-emerald-400/60 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Creating your server</h2>
            <p className="text-sm text-slate-400 mt-1">
              {isSeeded ? `Seeding from ${selectedGame?.name ?? "templates"}...` : "Setting up empty server..."}
            </p>
            <p className="text-xs text-slate-600 mt-2">This may take a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md w-full">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-pink-400">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Pick a Game</h2>
            <p className="text-slate-400 text-sm mt-1">Select a game to start tracking bosses and activities.</p>
          </div>

          {/* Game list */}
          <div className="space-y-2">
            {gamesLoading ? (
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin mx-auto" />
            ) : (
              games.map(g => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGame(g); setMode("create"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white hover:border-emerald-500 hover:bg-slate-700/50 transition text-left"
                >
                  <Gamepad2 className="w-5 h-5 text-purple-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm">{g.name}</p>
                    <p className="text-xs text-slate-500">{g.supported_spawn_types?.length || 0} spawn types</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-500" />
                </button>
              ))
            )}
            <button
              onClick={() => { setSelectedGame({ id: "custom", name: "Custom (no seed)" }); setMode("create"); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition text-left"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Custom (no seed)</p>
                <p className="text-xs text-slate-500">Start with an empty server</p>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Join */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code..."
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition text-center"
            />
            <button
              onClick={handleJoin}
              disabled={loading || !inviteCode.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
            </button>
          </div>

          <button onClick={signOut} className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-red-400 transition">
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    const isCustom = selectedGame?.id === "custom";
    const hasSeeds = !isCustom;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-xl bg-emerald-900/30">
            <Server className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Create Server</h2>
          <p className="text-sm text-slate-400">
            {isCustom ? "Start with an empty server. Add bosses and activities later." : `Based on ${selectedGame?.name ?? "templates"}.`}
          </p>

          {hasSeeds && (
            <label className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 cursor-pointer hover:border-emerald-700/50 transition">
              <div className="text-left">
                <p className="text-sm text-white">Seed with {selectedGame?.name} templates</p>
                <p className="text-xs text-slate-500">Pre-load bosses and activities</p>
              </div>
              <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
            </label>
          )}

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

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm w-full">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-xl bg-blue-900/30">
          <Key className="w-6 h-6 text-blue-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Join as Moderator</h2>
        <p className="text-sm text-slate-400">Ask the server owner for their invite code.</p>
        <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Enter invite code..." autoFocus onKeyDown={(e) => e.key === "Enter" && handleJoin()} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition text-center" />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={handleJoin} disabled={loading || !inviteCode.trim()} className="w-full py-2.5 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          Join Server
        </button>
        <button onClick={() => { setMode("choose"); setError(null); }} className="text-xs text-slate-500 hover:text-slate-400">← Back</button>
      </div>
    </div>
  );
}
