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
      // Check for duplicate server name (may fail if user has no server memberships yet — that's ok)
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
      } catch {
        // RLS may block this query for new users — proceed anyway
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
        <div className="text-center space-y-5">
          <div className="relative mx-auto w-12 h-12">
            <div className="absolute inset-0 rounded-full border-3 border-[#27272a]" />
            <div className="absolute inset-0 rounded-full border-3 border-t-[#a1a1aa] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#fafafa]">Creating your server</h2>
            <p className="text-sm text-[#71717a] mt-1">
              {isSeeded ? `Seeding from ${selectedGame?.name ?? "templates"}...` : "Setting up empty server..."}
            </p>
            <p className="text-xs text-[#52525b] mt-2">This may take a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* ── Centered card ── */}
          <div className="rounded-xl border border-neutral-800/70 bg-[#121316] p-6 space-y-5">

            {/* ── Header ── */}
            <div className="text-center space-y-2">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest font-mono">
                RaidScout
              </span>
              <h2 className="text-[#fafafa] text-lg font-bold tracking-tight">
                Select a Game
              </h2>
              <p className="text-xs text-neutral-400 max-w-[240px] mx-auto leading-relaxed">
                Choose a game to start tracking bosses and activities.
              </p>
            </div>

            {/* ── Game options ── */}
            <div className="space-y-2">
              {gamesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-neutral-500 animate-spin" />
                </div>
              ) : (
                games.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGame(g); setMode("create"); }}
                    className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#18191d]/60 border border-neutral-800/60 hover:bg-[#1c1d22] transition-all duration-200 text-left"
                  >
                    {g.icon_url ? (
                      <img src={g.icon_url} alt={g.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <Gamepad2 className="w-4 h-4 text-neutral-500 shrink-0 group-hover:text-neutral-300 transition-colors duration-200" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors duration-200">
                        {g.name}
                      </p>
                      <p className="font-mono text-[10px] text-neutral-500">
                        {g.supported_spawn_types?.length || 0} spawn types preset
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-neutral-600 shrink-0 group-hover:text-neutral-400 group-hover:translate-x-0.5 transition-all duration-200" />
                  </button>
                ))
              )}
              <button
                onClick={() => { setSelectedGame({ id: "custom", name: "Custom (no seed)" }); setMode("create"); }}
                className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#18191d]/60 border border-neutral-800/60 hover:bg-[#1c1d22] transition-all duration-200 text-left"
              >
                <Plus className="w-4 h-4 text-neutral-500 shrink-0 group-hover:text-neutral-300 transition-colors duration-200" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors duration-200">
                    Custom (no seed)
                  </p>
                  <p className="font-mono text-[10px] text-neutral-500">
                    Start with an empty server
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-600 shrink-0 group-hover:text-neutral-400 group-hover:translate-x-0.5 transition-all duration-200" />
              </button>
            </div>

            {/* ── Separator ── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-800/40" />
              <span className="text-[10px] text-neutral-600 font-mono">or</span>
              <div className="flex-1 h-px bg-neutral-800/40" />
            </div>

            {/* ── Join form ── */}
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Invite code..."
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="flex-1 bg-[#0d0e11] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-700 transition-all duration-200 text-center font-mono"
              />
              <button
                onClick={handleJoin}
                disabled={loading || !inviteCode.trim()}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-neutral-200 text-neutral-950 hover:bg-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Join"}
              </button>
            </div>

            {/* ── Sign out ── */}
            <button
              onClick={signOut}
              className="flex items-center justify-center gap-1 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors duration-200 w-full"
            >
              <LogOut className="w-3 h-3" /> Sign Out
            </button>

          </div>
        </div>
      </div>
    );
  }

  if (mode === "create") {
    const isCustom = selectedGame?.id === "custom";
    const hasSeeds = !isCustom;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-[#27272a] bg-[#18181b] p-6 space-y-4">
            <div className="text-center space-y-2">
              <span className="text-xs font-semibold tracking-widest uppercase text-[#71717a]">RaidScout</span>
              <h2 className="text-lg font-bold text-[#fafafa]">Create Server</h2>
              <p className="text-sm text-[#71717a]">
                {isCustom ? "Start with an empty server." : `Based on ${selectedGame?.name ?? "templates"}.`}
              </p>
            </div>

            {hasSeeds && (
              <label className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#18181b] border border-[#27272a] cursor-pointer hover:border-[#3f3f46] transition">
                <div className="text-left">
                  <p className="text-sm text-[#fafafa]">Seed with {selectedGame?.name} templates</p>
                  <p className="text-xs text-[#71717a]">Pre-load bosses and activities</p>
                </div>
                <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="w-4 h-4 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50" />
              </label>
            )}

            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Server name..."
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
            <input
              type="text"
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
              placeholder="Default guild name (required)..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
            {error && <p className="text-xs text-[#f87171]">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !serverName.trim() || !guildName.trim()}
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              Create Server
            </button>
            <button onClick={() => { setMode("choose"); setError(null); }} className="w-full text-xs text-[#52525b] hover:text-[#a1a1aa] transition">
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-[#27272a] bg-[#18181b] p-6 space-y-4">
          <div className="text-center space-y-2">
            <span className="text-xs font-semibold tracking-widest uppercase text-[#71717a]">RaidScout</span>
            <h2 className="text-lg font-bold text-[#fafafa]">Join as Moderator</h2>
            <p className="text-sm text-[#71717a]">Ask the server owner for their invite code.</p>
          </div>
          <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Enter invite code..." autoFocus onKeyDown={(e) => e.key === "Enter" && handleJoin()} className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition text-center" />
          {error && <p className="text-xs text-[#f87171]">{error}</p>}
          <button onClick={handleJoin} disabled={loading || !inviteCode.trim()} className="w-full py-2.5 rounded-lg font-medium text-sm bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            Join Server
          </button>
          <button onClick={() => { setMode("choose"); setError(null); }} className="w-full text-xs text-[#52525b] hover:text-[#a1a1aa] transition">← Back</button>
        </div>
      </div>
    </div>
  );
}
