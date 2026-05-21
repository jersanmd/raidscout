import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  saveLeaderboardSnapshot as saveSnapshotSupabase,
  fetchLeaderboardSnapshots as fetchSnapshotsSupabase,
  fetchSnapshotById as fetchSnapshotByIdSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
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

/** Get the date after which attendance records count toward the current leaderboard */
export function getLeaderboardResetAt(serverId: string | null): string | null {
  if (!serverId) return null;
  return localStorage.getItem(`${LOCAL_RESET_AT_PREFIX}-${serverId}`);
}

/** Set the reset date — attendance after this date counts toward the new period */
export function setLeaderboardResetAt(serverId: string | null, date: string): void {
  if (!serverId) return;
  localStorage.setItem(`${LOCAL_RESET_AT_PREFIX}-${serverId}`, date);
}

// ── Hook ────────────────────────────────────────────────────

export function useLeaderboardSnapshots() {
  const { user } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  const [viewingSnapshot, setViewingSnapshot] = useState<LeaderboardSnapshot | null>(null);

  const snapshotsQuery = useQuery<{ id: string; finalized_at: string; period_start?: string; period: string; ranking_count: number; top_name?: string; top_points?: number }[]>({
    queryKey: ["leaderboard_snapshots", serverId],
    queryFn: async () => {
      if (!configured || !user) return [];
      return await fetchSnapshotsSupabase(serverId);
    },
    staleTime: 30_000,
    retry: 2,
    enabled: configured && !!user && !!serverId,
  });

  const finalizeResults = useCallback(
    async (
      period: "all_time" | "weekly" | "monthly",
      rankings: { rank: number; memberId: string; memberName: string; points: number }[],
      periodStart: string
    ) => {
      const now = new Date().toISOString();

      if (configured && user) {
        try {
          await saveSnapshotSupabase(period, rankings, periodStart);
        } catch (err) {
          console.error("Failed to save snapshot to Supabase:", err);
        }
      }

      // Reset leaderboard: only attendance after this date counts
      setLeaderboardResetAt(serverId, now);
      setLastFinalized(now, period);

      queryClient.invalidateQueries({ queryKey: ["leaderboard_snapshots", serverId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    [configured, user, queryClient, serverId]
  );

  const loadSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!configured || !user) return;
      const snap = await fetchSnapshotByIdSupabase(snapshotId);
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
    [configured, user]
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
