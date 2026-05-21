import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAttendanceForDeath,
  addAttendance,
  removeAttendance,
  fetchLeaderboard,
  fetchLeaderboardByPeriod,
  fetchLeaderboardResetAt,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { getLeaderboardResetAt } from "@/hooks/useLeaderboardSnapshots";
import type { AttendanceRecord, LeaderboardEntry } from "@/types";

// ── Attendance Records ──────────────────────────────────────

export function useAttendance(deathRecordId: string | null) {
  const { user, isViewer } = useAuth();
  const configured = isSupabaseConfigured();

  return useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", deathRecordId],
    queryFn: async () => {
      if (!deathRecordId || !configured || (!user && !isViewer)) return [];
      return await fetchAttendanceForDeath(deathRecordId);
    },
    enabled: !!deathRecordId && configured && (!!user || isViewer),
    staleTime: 30_000,
  });
}

export function useAddAttendance() {
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  return useMutation({
    mutationFn: async ({
      deathRecordId,
      memberId,
    }: {
      deathRecordId: string;
      memberId: string;
    }) => {
      if (!configured) throw new Error("Supabase not configured");
      return await addAttendance(deathRecordId, memberId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.deathRecordId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useRemoveAttendance() {
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  return useMutation({
    mutationFn: async ({
      attendanceId,
      deathRecordId,
    }: {
      attendanceId: string;
      deathRecordId: string;
    }) => {
      if (!configured) throw new Error("Supabase not configured");
      await removeAttendance(attendanceId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.deathRecordId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

// ── Leaderboard ─────────────────────────────────────────────

export type LeaderboardPeriod = "all" | "weekly" | "monthly";

export function useLeaderboard(period: LeaderboardPeriod = "all") {
  const configured = isSupabaseConfigured();
  const serverId = useServerId();

  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", period, serverId],
    queryFn: async () => {
      if (!configured) return [];

      let resetAt: string | null = getLeaderboardResetAt(serverId);
      try {
        const dbReset = await fetchLeaderboardResetAt();
        if (dbReset) resetAt = dbReset;
      } catch { /* use localStorage reset */ }

      if (period === "all") {
        return await fetchLeaderboard(serverId);
      }
      const periodStart = getPeriodStart(period);
      // "This Month" always uses month start; "This Week" respects reset
      const since = period === "monthly" ? periodStart : (resetAt && resetAt > periodStart ? resetAt : periodStart);
      return await fetchLeaderboardByPeriod(since, serverId);
    },
    staleTime: 30_000,
    retry: 2,
    enabled: configured && !!serverId,
  });
}

function getPeriodStart(period: LeaderboardPeriod): string {
  const now = new Date();
  if (period === "weekly") {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
  }
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return firstOfMonth.toISOString();
}
