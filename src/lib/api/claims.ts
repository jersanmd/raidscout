import { supabase } from "./client";

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

/** Mark a claim as read (player dismisses notification) */
export async function markClaimRead(claimId: string): Promise<void> {
  const { error } = await supabase
    .from("member_claim_requests")
    .update({ is_read: true })
    .eq("id", claimId);
  if (error) throw error;
}
