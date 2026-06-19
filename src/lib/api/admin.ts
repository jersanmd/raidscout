import { supabase } from "./client";
import { fetchAuditLog as fetchAuditLogRpc, type AuditEntry } from "./audit";

// ── Admin Queries ──────────────────────────────────────────

export async function fetchAllServers(): Promise<any[]> {
  const { data, error } = await supabase
    .rpc("get_all_servers_with_counts");
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllUsers(): Promise<any[]> {
  const { data, error } = await supabase
    .rpc("get_all_users");
  if (error) {
    const { data: fallback, error: fbErr } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at");
    if (fbErr) throw fbErr;
    return fallback;
  }
  return data;
}

/** Fetch audit log with time-range support (backward compat). Delegates to the cursor-based RPC. */
export async function fetchAuditLog(
  limit = 200,
  serverId?: string | null,
  sinceOrCursor?: string | number | null,
  untilOrActionFilter?: string | null
): Promise<any[]> {
  // If 3rd param is a string that looks like a date, interpret as time-range query
  const isTimeRange = typeof sinceOrCursor === "string" && /^\d{4}-\d{2}-\d{2}/.test(sinceOrCursor);
  if (isTimeRange) {
    const data = await fetchAuditLogRpc(limit, serverId, null, null);
    const sinceMs = sinceOrCursor ? new Date(sinceOrCursor as string).getTime() : 0;
    const untilMs = untilOrActionFilter ? new Date(untilOrActionFilter).getTime() : Infinity;
    return data.filter((e) => {
      const ts = new Date(e.created_at).getTime();
      return ts >= sinceMs && ts <= untilMs;
    });
  }
  // Otherwise pass through to RPC-based pagination (cursor = id)
  const cursor = sinceOrCursor != null ? Number(sinceOrCursor) : null;
  const actionFilter = untilOrActionFilter || null;
  return fetchAuditLogRpc(limit, serverId, cursor || null, actionFilter);
}

export async function fetchServerStats(serverId: string): Promise<{
  member_count: number;
  boss_count: number;
  death_count: number;
  has_webhook: boolean;
  total_raid_members?: number;
  guild_members?: { guild: string; count: number }[];
}> {
  const { data, error } = await supabase
    .rpc("get_server_stats", { p_server_id: serverId });
  if (error) throw error;
  const stats = (data as any) ?? { member_count: 0, boss_count: 0, death_count: 0, has_webhook: false };

  if (!stats.has_webhook) {
    const { count } = await supabase
      .from("discord_configs")
      .select("*", { count: "exact", head: true })
      .eq("raidscout_server_id", serverId);
    stats.has_webhook = (count ?? 0) > 0;
  }

  return stats;
}

export async function fetchDatabaseStats(): Promise<any> {
  const { data, error } = await supabase
    .rpc("get_database_stats");
  if (error) throw error;
  return data ?? {};
}

export async function fetchPlanUsage(): Promise<any> {
  const { data, error } = await supabase
    .rpc("get_plan_usage");
  if (error) throw error;
  return data ?? {};
}

export async function fetchCronStatus(): Promise<{
  active: boolean;
  last_run: string | null;
  servers: { name: string; kills: number }[];
  total_kills: number;
}> {
  const { data, error } = await supabase
    .rpc("get_cron_test_status");
  if (error) throw error;
  return (data as any) ?? { active: false, last_run: null, servers: [], total_kills: 0 };
}
