import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { supabase, submitClaimRequest, getMyClaims, type ClaimRequest } from "@/lib/supabase";
import { Search, Shield, Clock, CheckCircle, XCircle, Loader2, Users, AlertTriangle } from "lucide-react";

export function JoinServerView() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [myClaims, setMyClaims] = useState<ClaimRequest[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null); // server_id being submitted
  const [requestedName, setRequestedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  // Load user's existing claims
  useEffect(() => {
    if (!user) return;
    getMyClaims()
      .then(setMyClaims)
      .catch(() => setMyClaims([]))
      .finally(() => setClaimsLoading(false));
  }, [user]);

  // Search for servers
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const { data, error: searchErr } = await supabase
        .from("servers")
        .select("id, name, game_id")
        .ilike("name", `%${searchQuery.trim()}%`)
        .limit(10);
      if (searchErr) throw searchErr;
      setSearchResults(data ?? []);
    } catch (err: any) {
      setError(err?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // Submit a claim request
  const handleSubmitClaim = async (serverId: string) => {
    if (!requestedName.trim()) {
      setError("Please enter your in-game character name.");
      return;
    }
    setSubmitting(serverId);
    setError(null);
    try {
      await submitClaimRequest(serverId, requestedName.trim());
      setSuccess(`Claim submitted for "${requestedName.trim()}". Waiting for approval.`);
      setRequestedName("");
      // Refresh claims
      const claims = await getMyClaims();
      setMyClaims(claims);
    } catch (err: any) {
      setError(err?.message || "Failed to submit claim.");
    } finally {
      setSubmitting(null);
    }
  };

  if (isViewer) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-[#fafafa] mb-2">Join a Server</h2>
        <p className="text-sm text-[#71717a]">Viewer mode cannot join servers. Sign in to claim your profile.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-[#fafafa] mb-2">Join a Server</h2>
        <p className="text-sm text-[#71717a] mb-4">Sign in to claim your profile and join a server.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h2 className="text-xl font-bold text-[#fafafa]">Join a Server</h2>
        <p className="text-sm text-[#71717a] mt-1">Claim your in-game profile to access boss timers, DKP, and more.</p>
      </div>

      {/* Success / Error */}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {success}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Unlink notice */}
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

      {/* Search */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <Search className="w-4 h-4 text-[#52525b]" />
          Find your server
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search server name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] placeholder:text-[#52525b]"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 rounded-lg bg-[#27272a] text-sm text-[#fafafa] hover:bg-[#3f3f46] disabled:opacity-40 transition"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map(srv => {
              const existingClaim = myClaims.find(c => c.server_id === srv.id);
              const isPending = existingClaim?.status === "pending";
              const isAccepted = existingClaim?.status === "accepted";
              const isDeclined = existingClaim?.status === "declined";

              return (
                <div key={srv.id} className="flex items-center justify-between p-3 rounded-lg bg-[#18181b] border border-[#27272a]">
                  <div>
                    <p className="text-sm text-[#fafafa] font-medium">{srv.name}</p>
                    {isPending && <p className="text-[10px] text-amber-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending approval</p>}
                    {isAccepted && <p className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Accepted — you now have access!</p>}
                    {isDeclined && <p className="text-[10px] text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Declined{existingClaim?.decline_reason ? `: ${existingClaim.decline_reason}` : ""}</p>}
                  </div>
                  {!isPending && !isAccepted && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Your in-game name"
                        value={requestedName}
                        onChange={e => setRequestedName(e.target.value)}
                        className="bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1 text-xs text-[#fafafa] outline-none focus:border-[#52525b] w-36 placeholder:text-[#52525b]"
                      />
                      <button
                        onClick={() => handleSubmitClaim(srv.id)}
                        disabled={submitting === srv.id || !requestedName.trim()}
                        className="px-3 py-1 rounded text-xs font-medium bg-[#27272a] text-[#fafafa] hover:bg-[#3f3f46] disabled:opacity-40 transition"
                      >
                        {submitting === srv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Claim"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {searchResults.length === 0 && !searching && searchQuery && (
          <p className="text-xs text-[#52525b] text-center py-2">No servers found. Try a different name.</p>
        )}
      </div>

      {/* My Claims */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#52525b]" />
          My Claims
        </h3>
        {claimsLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
        ) : myClaims.length === 0 ? (
          <p className="text-xs text-[#71717a] text-center py-4">No claims yet. Search for a server above to get started.</p>
        ) : (
          <div className="space-y-2">
            {myClaims.map(claim => (
              <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg bg-[#18181b] border border-[#27272a]">
                <div>
                  <p className="text-sm text-[#fafafa]">{claim.server_name}</p>
                  <p className="text-xs text-[#71717a]">as "{claim.requested_name}"</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  claim.status === "pending" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                  claim.status === "accepted" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                  "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {claim.status === "pending" ? "Pending" : claim.status === "accepted" ? "Accepted" : "Declined"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
