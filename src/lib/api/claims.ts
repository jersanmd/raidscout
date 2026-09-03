import { supabase } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";

export interface ClaimRequest {
  id: string;
  server_id: string;
  server_name: string;
  requested_name: string;
  status: "pending" | "accepted" | "declined";
  decline_reason: string | null;
  is_read: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface PendingClaim {
  id: string;
  user_id: string;
  user_email: string;
  requested_name: string;
  status: string;
  created_at: string;
}

/** Submit a claim request to join a server */
export async function submitClaimRequest(serverId: string, requestedName: string): Promise<string> {
  const { data, error } = await supabase.rpc("submit_claim_request", {
    p_server_id: serverId,
    p_requested_name: requestedName,
  });
  if (error) throw error;
  return data as string;
}

/** Get pending claims for a server (owner/mod only) */
export async function getPendingClaims(serverId: string): Promise<PendingClaim[]> {
  const { data, error } = await supabase.rpc("get_pending_claims", {
    p_server_id: serverId,
  });
  if (error) throw error;
  return (data as PendingClaim[]) ?? [];
}

/** Get the current user's claims across all servers */
export async function getMyClaims(): Promise<ClaimRequest[]> {
  const { data, error } = await supabase.rpc("get_my_claims");
  if (error) throw error;
  return (data as ClaimRequest[]) ?? [];
}

/** Accept or decline a claim request (owner/mod only) */
export async function reviewClaimRequest(
  requestId: string,
  action: "accept" | "decline",
  reason?: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("review_claim_request", {
    p_request_id: requestId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string | null;
}

/** Unlink a claimed member — clears members.user_id (owner/mod only) */
export async function unlinkMember(memberId: string, serverId?: string): Promise<void> {
  // Read the name before the RPC — afterwards the binding is gone.
  let memberName: string | undefined;
  let sid = serverId;
  try {
    const { data } = await supabase.from("members").select("name, server_id").eq("id", memberId).single();
    memberName = (data as any)?.name;
    sid = sid ?? (data as any)?.server_id;
  } catch { /* non-critical */ }

  const { error } = await supabase.rpc("unlink_member", {
    p_member_id: memberId,
  });
  if (error) throw error;

  // Granting a claim is audited (MEMBER_CLAIM_ACCEPT); revoking it was not, so
  // the log showed claims accepted and never revoked.
  if (sid) {
    writeAuditEntry({
      action: AuditAction.MEMBER_UNLINK,
      server_id: sid,
      target_id: memberId,
      details: { member_name: memberName ?? memberId },
    });
  }
}

/** Mark a claim as read (player dismisses notification) */
export async function markClaimRead(claimId: string): Promise<void> {
  const { error } = await supabase
    .from("member_claim_requests")
    .update({ is_read: true })
    .eq("id", claimId);
  if (error) throw error;
}
