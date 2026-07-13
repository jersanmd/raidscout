import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAttendanceForDeath,
  addAttendance,
  removeAttendance,
  copyAttendanceToDeath,
  fetchLeaderboard,
  fetchLeaderboardByPeriod,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
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
      memberName,
      bossName,
    }: {
      deathRecordId: string;
      memberId: string;
      memberName?: string;
      bossName?: string;
    }) => {
      if (!configured) throw new Error("Supabase not configured");
      return await addAttendance(deathRecordId, memberId, memberName, bossName);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.deathRecordId] });
      queryClient.invalidateQueries({ queryKey: ["attendance_counts"] });
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
      memberName,
      bossName,
    }: {
      attendanceId: string;
      deathRecordId: string;
      memberName?: string;
      bossName?: string;
    }) => {
      if (!configured) throw new Error("Supabase not configured");
      await removeAttendance(attendanceId, memberName, bossName);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.deathRecordId] });
      queryClient.invalidateQueries({ queryKey: ["attendance_counts"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error) => {
      console.error("Failed to remove attendance:", error);
    },
  });
}

export function useCopyAttendance() {
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  return useMutation({
    mutationFn: async ({
      sourceDeathRecordId,
      targetDeathRecordId,
    }: {
      sourceDeathRecordId: string;
      targetDeathRecordId: string;
    }) => {
      if (!configured) throw new Error("Supabase not configured");
      return await copyAttendanceToDeath(sourceDeathRecordId, targetDeathRecordId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", variables.targetDeathRecordId] });
      queryClient.invalidateQueries({ queryKey: ["attendance_counts"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (error) => {
      console.error("Failed to copy attendance:", error);
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

      if (period === "all") {
        return await fetchLeaderboard(serverId);
      }

      // "Since Reset": the RPC already applies per-guild reset dates
      // (leaderboard_reset_at:{guildName} in app_settings) when p_since is null.
      return await fetchLeaderboardByPeriod(null, serverId);
    },
    staleTime: 30_000,
    refetchOnMount: true,
    retry: 2,
    enabled: configured && !!serverId,
  });
}

// ── Leaderboard (period-based) ──

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
