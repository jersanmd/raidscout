import { useState, useEffect } from "react";
import { supabase, createServer, fetchVisibleGames, submitClaimRequest, getMyClaims } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Key, Server, ArrowRight, LogOut, Gamepad2, Search, Shield, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import type { ClaimRequest } from "@/lib/supabase";

export function NoServerView() {
  const { refreshServers } = useServer();
  const { signOut, user } = useAuth();
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

  // Claim feature
  const [claimSearch, setClaimSearch] = useState("");
  const [claimResults, setClaimResults] = useState<any[]>([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [claimSearched, setClaimSearched] = useState(false);
  const [myClaims, setMyClaims] = useState<ClaimRequest[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [claimServer, setClaimServer] = useState<any>(null);
  const [claimName, setClaimName] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  // Check for recent unlink notifications
  const [unlinkNotice, setUnlinkNotice] = useState<{ member_name: string; created_at: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    try {
      const { data } = await supabase.from("notifications")
        .select("metadata, created_at")
        .eq("user_id", user.id)
        .eq("type", "member_unlinked")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.length) {
        const meta = data[0].metadata as any;
        setUnlinkNotice({ member_name: meta?.member_name ?? "a character", created_at: data[0].created_at });
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchVisibleGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
  }, []);

  // Load user's existing claims
  useEffect(() => {
    if (!user) return;
    getMyClaims()
      .then(setMyClaims)
      .catch(() => setMyClaims([]))
      .finally(() => setClaimsLoading(false));
  }, [user]);

  const handleClaimSearch = async () => {
    if (!claimSearch.trim()) return;
    setClaimSearching(true);
    setClaimSearched(false);
    try {
      const { data } = await supabase.from("servers").select("id, name").ilike("name", `%${claimSearch.trim()}%`).limit(8);
      setClaimResults(data || []);
      setClaimSearched(true);
    } catch { setClaimResults([]); setClaimSearched(true); } finally { setClaimSearching(false); }
  };

  const handleSubmitClaim = async () => {
    if (!claimServer || !claimName.trim()) return;
    setClaimSubmitting(true);
    setClaimError(null);
    setClaimSuccess(null);
    try {
      await submitClaimRequest(claimServer.id, claimName.trim());
      setClaimSuccess(`Claim submitted for "${claimName.trim()}" in ${claimServer.name}.`);
      setClaimServer(null);
      setClaimName("");
      getMyClaims().then(setMyClaims).catch(() => {});
    } catch (err: any) {
      setClaimError(err?.message || "Failed to submit claim");
    } finally { setClaimSubmitting(false); }
  };

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
            {guildName.trim() && (
              <p className="text-xs text-[#52525b] mt-1">
                Assigning all bosses to {guildName.trim()} (rotation mode)...
              </p>
            )}
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

            {/* ── Unlink notice ── */}
            {unlinkNotice && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Profile Unlinked
                </p>
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  <strong>{unlinkNotice.member_name}</strong> was unlinked from your account by a server moderator. You can submit a new claim below to regain access.
                </p>
              </div>
            )}

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

            {/* ── Join by invite ── */}
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

            {/* ── Separator ── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-800/40" />
              <span className="text-[10px] text-neutral-600 font-mono">or</span>
              <div className="flex-1 h-px bg-neutral-800/40" />
            </div>

            {/* ── Claim Profile ── */}
            <div className="space-y-3">
              <p className="text-[10px] text-neutral-500 text-center">Claim your existing profile</p>
              {claimSuccess && <p className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2"><CheckCircle className="w-3 h-3 inline mr-1" />{claimSuccess}</p>}
              {claimError && <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{claimError}</p>}

              {!claimServer ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input type="text" value={claimSearch} onChange={e => setClaimSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleClaimSearch()}
                      placeholder="Search your server..." className="flex-1 bg-[#0d0e11] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-700 transition" />
                    <button onClick={handleClaimSearch} disabled={claimSearching || !claimSearch.trim()}
                      className="px-3 py-2 rounded-lg text-xs bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition disabled:opacity-40"><Search className="w-3.5 h-3.5" /></button>
                  </div>
                  {claimSearching && <Loader2 className="w-4 h-4 text-neutral-500 animate-spin mx-auto" />}
                  {!claimSearching && claimSearched && claimResults.length === 0 && (
                    <p className="text-xs text-amber-400/80 text-center py-1">No servers found matching "{claimSearch.trim()}"</p>
                  )}
                  {claimResults.map(s => (
                    <button key={s.id} onClick={() => { setClaimServer(s); setClaimName(""); setClaimError(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18191d]/60 border border-neutral-800/60 hover:bg-[#1c1d22] transition text-left">
                      <Server className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="text-xs text-neutral-200">{s.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18191d] border border-neutral-700">
                    <Server className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="text-xs text-neutral-200">{claimServer.name}</span>
                    <button onClick={() => { setClaimServer(null); setClaimError(null); }} className="ml-auto text-neutral-500 hover:text-neutral-300"><XCircle className="w-3.5 h-3.5" /></button>
                  </div>
                  <input type="text" value={claimName} onChange={e => setClaimName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmitClaim()}
                    placeholder="Your in-game name..." className="w-full bg-[#0d0e11] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-700 transition" />
                  <button onClick={handleSubmitClaim} disabled={claimSubmitting || !claimName.trim()}
                    className="w-full py-2 rounded-lg text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40">
                    {claimSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Submit Claim"}
                  </button>
                </div>
              )}

              {/* Existing claims */}
              {!claimsLoading && myClaims.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-neutral-600">Your Claims</p>
                  {myClaims.map(c => (
                    <div key={c.id} className="px-3 py-1.5 rounded bg-[#18191d]/40 border border-neutral-800/40 text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-300 truncate flex-1">{c.server_name} · {c.requested_name}</span>
                        {c.status === "pending" && <span className="text-[10px] text-amber-400 flex items-center gap-0.5 shrink-0"><Clock className="w-3 h-3" />Pending</span>}
                        {c.status === "accepted" && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 shrink-0"><CheckCircle className="w-3 h-3" />Accepted</span>}
                        {c.status === "declined" && <span className="text-[10px] text-red-400 flex items-center gap-0.5 shrink-0"><XCircle className="w-3 h-3" />Declined</span>}
                      </div>
                      {c.status === "declined" && c.decline_reason && (
                        <p className="text-[10px] text-neutral-500">Reason: {c.decline_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
