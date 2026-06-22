import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  saveLeaderboardSnapshot as saveSnapshotSupabase,
  fetchLeaderboardSnapshots as fetchSnapshotsSupabase,
  fetchSnapshotById as fetchSnapshotByIdSupabase,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import { useServerId } from "@/contexts/ServerContext";
import type { LeaderboardSnapshot, SnapshotRanking } from "@/types";

// ── Reset Tracking (localStorage for app state) ─────────────

const LOCAL_LAST_FINALIZED_KEY = "lordnine-last-finalized";
const LOCAL_RESET_AT_PREFIX = "lordnine-leaderboard-reset-at";

export function getLastFinalized(): { date: string; period: string } | null {
  try {
    const raw = localStorage.getItem(LOCAL_LAST_FINALIZED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLastFinalized(date: string, period: string): void {
  localStorage.setItem(LOCAL_LAST_FINALIZED_KEY, JSON.stringify({ date, period }));
}

/** Get the date after which attendance records count toward the current leaderboard.
 *  Falls back to server created_at (week 0) when no reset has been stored yet. */
export function getLeaderboardResetAt(serverId: string | null, fallbackCreatedAt?: string | null, key?: string): string | null {
  if (!serverId) return null;
  const stored = localStorage.getItem(`${LOCAL_RESET_AT_PREFIX}-${serverId}${key ? `:${key}` : ""}`);
  return stored ?? fallbackCreatedAt ?? null;
}

/** Set the reset date — attendance after this date counts toward the new period */
export function setLeaderboardResetAt(serverId: string | null, date: string, key?: string): void {
  if (!serverId) return;
  localStorage.setItem(`${LOCAL_RESET_AT_PREFIX}-${serverId}${key ? `:${key}` : ""}`, date);
}

// ── Hook ────────────────────────────────────────────────────

export function useLeaderboardSnapshots() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  const [viewingSnapshot, setViewingSnapshot] = useState<LeaderboardSnapshot | null>(null);

  const snapshotsQuery = useQuery<{ id: string; finalized_at: string; period_start?: string; period: string; ranking_count: number; top_name?: string; top_points?: number }[]>({
    queryKey: ["leaderboard_snapshots", serverId],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchSnapshotsSupabase(serverId);
    },
    staleTime: 30_000,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });

  const finalizeResults = useCallback(
    async (
      period: string,
      rankings: { rank: number; memberId: string; memberName: string; points: number }[],
      periodStart: string,
      finalizedAt?: string
    ) => {
      const now = finalizedAt || new Date().toISOString();
      // Use guild-specific reset key for per-guild finalization
      const resetKey = period.startsWith("weekly:") ? `leaderboard_reset_at:${period.replace("weekly:", "")}` : "leaderboard_reset_at";

      if (configured && user && serverId) {
        try {
          await saveSnapshotSupabase(period, rankings, periodStart, serverId, finalizedAt);
          await supabase.from("app_settings").upsert(
            { key: resetKey, value: now, server_id: serverId },
            { onConflict: "key, server_id" }
          );
          writeAuditEntry({ action: AuditAction.LEADERBOARD_RESET, server_id: serverId, details: { period, from: periodStart, to: now, guild: period.startsWith("weekly:") ? period.replace("weekly:", "") : null } });
        } catch (err) {
          console.error("Failed to save snapshot to Supabase:", err);
        }
      }

      setLeaderboardResetAt(serverId, now, resetKey);
      setLastFinalized(now, period);

      queryClient.invalidateQueries({ queryKey: ["leaderboard_snapshots", serverId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    [configured, user, queryClient, serverId]
  );

  const loadSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!configured || (!user && !isViewer) || !serverId) return;
      const snap = await fetchSnapshotByIdSupabase(snapshotId, serverId);
      // Normalize rankings: support both camelCase (frontend) and snake_case (backfill)
      const rankings = (snap.rankings as any[]).map((r: any) => ({
        rank: r.rank,
        memberId: r.memberId ?? r.member_id,
        memberName: r.memberName ?? r.member_name,
        points: r.points,
      }));
      setViewingSnapshot({
        id: snap.id,
        finalized_at: snap.finalized_at,
        period: snap.period as LeaderboardSnapshot["period"],
        rankings,
        created_at: snap.finalized_at,
      });
    },
    [configured, user, isViewer, serverId]
  );

  const clearViewing = useCallback(() => setViewingSnapshot(null), []);

  const snapshots = (snapshotsQuery.data ?? []) as {
    id: string; finalized_at: string; period_start?: string; period: string; ranking_count: number;
    top_name?: string; top_points?: number;
  }[];

  return {
    snapshots,
    isLoading: snapshotsQuery.isLoading,
    finalizeResults,
    viewingSnapshot,
    loadSnapshot,
    clearViewing,
  };
}
