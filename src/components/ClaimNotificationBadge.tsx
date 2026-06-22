import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { getPendingClaims, reviewClaimRequest, markClaimRead, getMyClaims, type PendingClaim, type ClaimRequest } from "@/lib/supabase";
import { Bell, Check, X, Loader2 } from "lucide-react";

/**
 * Top bar claim notification badge.
 * Shows pending claim count for owners/moderators.
 * Dropdown lets them accept/decline claims inline.
 */
export function ClaimNotificationBadge() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null); // request id being acted on

  // Fetch pending claims for the current server
  const { data: pendingClaims = [], isLoading } = useQuery({
    queryKey: ["pending_claims", serverId],
    queryFn: () => getPendingClaims(serverId!),
    enabled: !!serverId && !!user && !isViewer,
    refetchInterval: 30_000, // poll every 30s
    staleTime: 10_000,
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-claim-badge]")) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAccept = useCallback(async (requestId: string) => {
    setActing(requestId);
    try {
      await reviewClaimRequest(requestId, "accept");
      queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] });
    } catch (err) {
      console.error("Failed to accept claim:", err);
    } finally {
      setActing(null);
    }
  }, [serverId, queryClient]);

  const handleDecline = useCallback(async (requestId: string) => {
    if (!declineReason.trim()) return;
    setActing(requestId);
    try {
      await reviewClaimRequest(requestId, "decline", declineReason.trim());
      setDeclineReason("");
      setDecliningId(null);
      queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] });
    } catch (err) {
      console.error("Failed to decline claim:", err);
    } finally {
      setActing(null);
    }
  }, [serverId, queryClient, declineReason]);

  // Also fetch the user's own claim notifications (for the green check indicator)
  const { data: myClaims = [] } = useQuery({
    queryKey: ["my_claims"],
    queryFn: getMyClaims,
    enabled: !!user && !isViewer,
    staleTime: 60_000,
  });

  const unreadResolved = myClaims.filter(c => (c.status === "accepted" || c.status === "declined") && !c.is_read);

  // Hide if no server, no user, or viewer
  if (!serverId || !user || isViewer) return null;

  const count = pendingClaims.length;
  const hasUnread = unreadResolved.length > 0;

  return (
    <div className="relative" data-claim-badge>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center gap-1 px-2 py-1.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition"
        title="Claim requests"
      >
        <Bell className="w-4 h-4" />
        {(count > 0 || hasUnread) && (
          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
            count > 0 ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
          }`}>
            {count > 0 ? count : "✓"}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-[#0d0d11] border border-[#1e1e2a] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#1e1e2a]">
            <span className="text-xs font-semibold text-[#fafafa]">Claim Requests</span>
            <span className="text-[10px] text-[#52525b] ml-1">{count} pending</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 text-[#52525b] animate-spin" />
            </div>
          ) : count === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-[#71717a]">No pending claims</p>
              {hasUnread && (
                <p className="text-[10px] text-emerald-400 mt-1">You have resolved claims to review</p>
              )}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {pendingClaims.map(claim => (
                <div key={claim.id} className="px-3 py-2.5 border-b border-[#1e1e2a]/50 last:border-b-0 hover:bg-[#18181b] transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-[#fafafa] font-medium truncate">{claim.requested_name}</p>
                      <p className="text-[10px] text-[#71717a] truncate">{claim.user_email}</p>
                      <p className="text-[10px] text-[#52525b]">
                        {new Date(claim.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleAccept(claim.id)}
                        disabled={acting === claim.id}
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-40"
                        title="Accept"
                      >
                        {acting === claim.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      {decliningId === claim.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder="Reason..."
                            value={declineReason}
                            onChange={e => setDeclineReason(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleDecline(claim.id)}
                            className="w-20 bg-[#18181b] border border-[#27272a] rounded px-1.5 py-0.5 text-[10px] text-[#fafafa] outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleDecline(claim.id)}
                            disabled={!declineReason.trim() || acting === claim.id}
                            className="p-0.5 rounded text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                            title="Confirm decline"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDecliningId(claim.id); setDeclineReason(""); }}
                          disabled={acting === claim.id}
                          className="p-1 rounded text-red-400 hover:bg-red-500/10 transition disabled:opacity-40"
                          title="Decline"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
