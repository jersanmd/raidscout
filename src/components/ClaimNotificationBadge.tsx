import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import { getPendingClaims, reviewClaimRequest, markClaimRead, getMyClaims, isSupabaseConfigured, supabase, type PendingClaim, type ClaimRequest } from "@/lib/supabase";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import { UserCheck, Check, X, Loader2 } from "lucide-react";

/**
 * Top bar claim notification badge.
 * Shows pending claim count for owners/moderators.
 * Dropdown lets them accept/decline claims inline.
 */
export function ClaimNotificationBadge() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>("");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null); // request id being acted on
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Fetch pending claims for the current server
  const { data: pendingClaims = [], isLoading } = useQuery({
    queryKey: ["pending_claims", serverId],
    queryFn: () => getPendingClaims(serverId!),
    enabled: !!serverId && !!user && !isViewer,
    refetchInterval: 30_000,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Realtime subscription: detect new claims instantly
  useEffect(() => {
    if (!serverId || !isSupabaseConfigured()) return;
    const channel = supabase
      .channel("claim-changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "member_claim_requests", filter: `server_id=eq.${serverId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [serverId, queryClient]);

  // Refetch when opening dropdown
  const handleToggle = useCallback(() => {
    if (!open) {
      queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] });
      queryClient.refetchQueries({ queryKey: ["pending_claims", serverId] });
      setVisibleCount(PAGE_SIZE);
    }
    setOpen(!open);
  }, [open, serverId, queryClient]);

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

  const handleAccept = useCallback(async (requestId: string, requestedName: string, userEmail: string) => {
    setActing(requestId);
    try {
      await reviewClaimRequest(requestId, "accept");
      queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] });
      writeAuditEntry({
        action: AuditAction.MEMBER_CLAIM_ACCEPT,
        server_id: serverId!,
        target_type: "claim",
        target_id: requestId,
        details: {
          requested_name: requestedName,
          user_email: userEmail,
          server_name: currentServer?.name,
        },
      }).catch(() => {});
      toast("success", `"${requestedName}" claim accepted. They can now access the server.`);
    } catch (err: any) {
      toast("error", err?.message || "Failed to accept claim");
      console.error("Failed to accept claim:", err?.message || err);
    } finally {
      setActing(null);
    }
  }, [serverId, queryClient, toast, currentServer]);

  const handleDecline = useCallback(async (requestId: string, requestedName: string, userEmail: string) => {
    if (!declineReason.trim()) return;
    setActing(requestId);
    try {
      await reviewClaimRequest(requestId, "decline", declineReason.trim());
      setDeclineReason("");
      setDecliningId(null);
      queryClient.invalidateQueries({ queryKey: ["pending_claims", serverId] });
      writeAuditEntry({
        action: AuditAction.MEMBER_CLAIM_DECLINE,
        server_id: serverId!,
        target_type: "claim",
        target_id: requestId,
        details: {
          requested_name: requestedName,
          user_email: userEmail,
          server_name: currentServer?.name,
          reason: declineReason.trim(),
        },
      }).catch(() => {});
      toast("success", `"${requestedName}" claim declined.`);
    } catch (err: any) {
      toast("error", err?.message || "Failed to decline claim");
      console.error("Failed to decline claim:", err?.message || err);
    } finally {
      setActing(null);
    }
  }, [serverId, queryClient, declineReason, toast, currentServer]);

  // Also fetch the user's own claim notifications (for the green check indicator)
  const { data: myClaims = [] } = useQuery({
    queryKey: ["my_claims"],
    queryFn: getMyClaims,
    enabled: !!user && !isViewer,
    staleTime: 60_000,
  });

  const unreadResolved = myClaims.filter(c => (c.status === "accepted" || c.status === "declined") && !c.is_read);

  // Hide if no server, no user, viewer, or not owner/moderator
  const isStaff = currentServer?.role === "owner" || currentServer?.role === "moderator";
  if (!serverId || !user || isViewer || !isStaff) return null;

  const count = pendingClaims.length;
  const hasUnread = unreadResolved.length > 0;

  return (
    <div className="relative" data-claim-badge>
      <button
        onClick={handleToggle}
        className="relative flex items-center gap-1 px-2 py-1.5 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition"
        title="Member claims"
      >
        <UserCheck className="w-4 h-4" />
        <span className="text-[11px] font-medium hidden sm:inline">Claims</span>
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
        <div className="absolute right-0 sm:right-0 left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-[#0d0d11] border border-[#1e1e2a] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#fafafa]">Member Claims</span>
              <span className="text-[10px] text-[#52525b] ml-1.5">{count} pending</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3.5 h-3.5" /></button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 text-[#52525b] animate-spin" /></div>
          ) : count === 0 ? (
            <div className="px-4 py-8 text-center">
              <UserCheck className="w-6 h-6 text-[#3f3f46] mx-auto mb-2" />
              <p className="text-xs text-[#71717a]">No pending claims</p>
              {hasUnread && <p className="text-[10px] text-emerald-400 mt-1">You have resolved claims</p>}
            </div>
          ) : (
            <div className="overflow-y-auto divide-y divide-[#1e1e2a]/50">
              {pendingClaims.slice(0, visibleCount).map(claim => (
                <div key={claim.id} className="px-4 py-3 hover:bg-[#18181b]/50 transition">
                  {/* Name + email */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#fafafa] font-medium truncate">{claim.requested_name}</p>
                      <p className="text-[10px] text-[#52525b] truncate">{claim.user_email}</p>
                    </div>
                    <span className="text-[9px] text-[#52525b] shrink-0 mt-0.5">
                      {new Date(claim.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Actions */}
                  {decliningId === claim.id ? (
                    <div className="space-y-1.5">
                      <input type="text" placeholder="Reason for decline..." value={declineReason}
                        onChange={e => setDeclineReason(e.target.value)} onKeyDown={e => e.key === "Enter" && handleDecline(claim.id, claim.requested_name, claim.user_email)}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-[11px] text-[#fafafa] outline-none focus:border-red-500/50 placeholder:text-[#52525b]" autoFocus />
                      <div className="flex gap-1.5">
                        <button onClick={() => { setDecliningId(null); setDeclineReason(""); }}
                          className="flex-1 py-1.5 rounded-lg text-[10px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                        <button onClick={() => handleDecline(claim.id, claim.requested_name, claim.user_email)} disabled={!declineReason.trim() || acting === claim.id}
                          className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-30 transition">
                          {acting === claim.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Confirm Decline"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button onClick={() => handleAccept(claim.id, claim.requested_name, claim.user_email)} disabled={acting === claim.id}
                        className="flex-1 py-1.5 rounded-lg text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-40 flex items-center justify-center gap-1">
                        {acting === claim.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Accept
                      </button>
                      <button onClick={() => { setDecliningId(claim.id); setDeclineReason(""); }} disabled={acting === claim.id}
                        className="py-1.5 px-3 rounded-lg text-[10px] bg-[#27272a] text-[#a1a1aa] hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {visibleCount < pendingClaims.length && (
                <button
                  onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                  className="w-full px-4 py-2.5 text-[11px] text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]/50 transition font-medium"
                >
                  Load More ({pendingClaims.length - visibleCount} remaining)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
